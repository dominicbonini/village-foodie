# store-badges-1: app badges in every language, shown wherever each app is available

*2 November 2026. Status: **done**, committed on `main`, not pushed or deployed. No migration; no flag value changed.*

- The footer's store badges, and Manage › Settings' app-download card, now follow `country_settings.ios_app_available` / `android_app_available`.
- Each badge is the vendor's own artwork in the page's language: 28 Apple SVGs and 28 Google PNGs, downloaded unmodified, each with a recorded checksum.
- The Play link no longer pins English.
- Proof: `scripts/store-badges-1.cjs` 60/60. Full sweep in §6.

## Flagged before building

- **"/ar" read as the Arabic page `/ae`.** The brief lists `/de, /fr, /jp and /ar`. The site has no `/ar` page (it would be Argentina, which isn't a country here). The Arabic-language page is the United Arab Emirates' `/ae` (ar-AE), so the harness proves `/ae`. Say if you meant something else.
- **The Play URL is also in the JSON-LD.** `GOOGLE_PLAY_URL` is also the Organization's `sameAs` in every landing page's JSON-LD (`lib/structured-data.ts`), so removing `&hl=en` changes it there too: the same link, changed once. The /uk check in §5 therefore allows exactly that one URL change, in the footer href and in `sameAs`, and nothing else.

## 1 · Shown by flag

- **`components/StoreBadges.tsx`** takes `apps: { ios, android }`:
  - Apple's badge renders only where `ios`, Google's only where `android`, Apple always first, black.
  - **Neither → it returns nothing:** no wrapper, no `.foot-apps`, no gap.
- **The flags come from the cached reader the FAQ and the comparison pages use** (`lib/comparison-flags.ts`):
  - a new `appsOf(code)` → `{ ios, android }`;
  - unknown or unreadable → both false, so an app is never claimed where its flag is false (35.ak-7).
- **The footer:**
  - `LandingFooter` takes `apps` from each page that renders it: landing, `/features`, `/compare`, `/about` and the comparison pages. Absent means no badges.
  - It stays synchronous, so every renderer can still draw it. A first version read the flags inside the footer itself (async), and language-phase-0's synchronous render showed that couldn't work.
- **Manage › Settings:**
  - `GET /api/manage` answers `appsAvailable` (the truck's country's flags, same reader, never fatal).
  - The app-download card (title, body, badges) renders only when at least one app is available, each badge only where its own is.
  - Wording unchanged; still web-only (hidden inside the native shells).
- **Live today** (only the UK has both flags on):
  - **/uk keeps both badges.** Every other country's footer shows none.
  - The Settings card shows only for UK trucks.
  - As you tick each store in Admin › Countries, that country's pages show its badge within a minute (the 60-second cache).

## 2 · Badges in every language: official artwork only

**56 files**, under `public/badges/apple/<locale>.svg` and `public/badges/google/<locale>.png`.
- They're listed in `public/badges/README.md` (file, language, source URL, download date).
- Their checksums are in `scripts/fixtures/store-badges-1-manifest.json`.
- The existing English files and their names are untouched.

| Vendor | Source (vendor host) | Format | Notes |
|---|---|---|---|
| Apple | `toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/<code>`. This is Apple's marketing tools, an **apple.com** host. `tools.applemarketingtools.com` didn't resolve from here. | **SVG, black** | Norwegian is Apple's `no-no`; Arabic is `ar-ar` (`ar-ae` / `ar-sa` don't exist). Each file keeps its own size: most are 119.66 × 40; French 126.5, Hungarian 150.7, Croatian 130.14 × 41, Finnish 142.9, Estonian 142.2, Japanese and Chinese 108.9. |
| Google | `play.google.com/intl/en_us/badges/static/images/badges/<code>_badge_web_generic.png`, the per-language images Google's badge page serves on **google.com**. | **PNG, 646 × 250** | Google's badge page offers no SVG. 250 px is 6.25× our 40 px display height (at least 3× was asked). The image is full-bleed, so it sizes by height like the English one. Portuguese (Portugal) is Google's `pt`, Norwegian `no`. |

- **Avoided:** Google's newer partner page links its downloads on `storage.googleapis.com`, which isn't one of your allowed hosts, so nothing was taken from there.
- **No English fallback was needed:** both vendors had a badge for all 28 language bases. Each download was compared byte-for-byte with that vendor's English one, so a silent English fallback would have shown up.
- **Never edited, recoloured, cropped, re-lettered or redrawn.**
  - Checked by eye (Quick Look): German, Japanese and Arabic keep "App Store" in English.
  - **Apple's Croatian badge declines it the Croatian way, "Preuzmi u App Store*u*".** That is Apple's own artwork, unmodified, and it's noted in the README.
- **Picking the badge:** `lib/store-badge-files.ts` `badgeFor(vendor, locale)` uses:
  1. the page language's file;
  2. else its base's (de-AT / de-CH / de-LI → de-DE, es-MX → es-ES, fr-LU → fr-FR, nl-BE → nl-NL, el-CY → el-GR);
  3. else English.
  - Every English locale reads the English files.
- **Text and sizing:**
  - The alt and aria words are still `landingFooter.badges`, in the page's language.
  - Sizing is still height-driven, with `width: auto`.
  - The reserved `width × height` comes from **each file's own** dimensions. The English pair is unchanged at 120 × 40 and 135 × 40.
- **What you'll notice visually:**
  - The localized Google PNGs are Google's current badge design (2.58 : 1).
  - The English file kept on /uk is the older, wider one (3.37 : 1).
  - That's expected: you asked for the English files to stay exactly as they are.

## 3 · Links

- **`GOOGLE_PLAY_URL`** is now `https://play.google.com/store/apps/details?id=com.hatchgrab.app`: `&hl=en` removed on your go-ahead, with the comment updated. Play now opens in the visitor's language.
- **`appStoreUrlFor`** is unchanged: the UK listing for GB, the locale-free one elsewhere.

## 4 · Proof: `scripts/store-badges-1.cjs` (in `harnesses.json`), 60/60

1. **Both flags on:** `/de`, `/fr`, `/jp` and `/ae` each render:
   - that language's Apple badge, then its Google badge, Apple first;
   - each file's own width × height reserved at 40 px;
   - alt and aria words in the page's language;
   - the locale-free App Store link and the Play link without `hl`;
   - height-driven sizing.
2. **By flag:**
   - iOS only → Apple alone; Android only → Google alone;
   - neither → no badge, no `.foot-apps`, no store link (`/de`, `/uk`, `/us`, `/jp`);
   - as live, `/uk` shows both English badges and `/us` none.
3. **The lookup:**
   - all 28 bases have their own files;
   - 7 regional variants read their base;
   - every English locale reads the English files;
   - no language falls back to English, but an unknown one would;
   - the English files are byte-identical to HEAD (git);
   - `GOOGLE_PLAY_URL` and `appStoreUrlFor` are as specified.
4. **/uk vs HEAD (6d00f678):**
   - the footer is identical apart from the Play href (`&hl=en` removed);
   - the whole page is identical apart from that one URL, in the footer and the JSON-LD `sameAs`.
5. **Manage › Settings** (the real `SettingsTab`, a **test truck** `test-truck` only):
   - both apps → the card with both badges, Apple first;
   - iOS only → Apple's badge alone;
   - neither → no title, no body, no badge;
   - the wording keys are unchanged;
   - the flags come from `/api/manage` via the same cached reader.
6. **Every file as downloaded:**
   - 56 files; sha256 and byte size on disk match the manifest;
   - every source is apple.com or google.com;
   - Apple's are black SVGs whose recorded dimensions are their own viewBox;
   - Google's are PNGs at least 3× the display height;
   - `lib/store-badge-files.ts` carries the manifest's dimensions;
   - the README lists every file.

## 5 · Re-pins (each by name; the shared transforms are in `scripts/_lp-store-badges-1.cjs`, registered with the shared modules)

The older harnesses' fixture rows set **no** app flag, so on this tree their footers show no badges and Settings shows no app card. Each was re-pinned by name, and each BEFORE transform is precise (it throws if the old markup isn't there):

- **language-phase-1e, -1e-tidy** (named-change registries): BEFORE's `.foot-apps` block removed and the Play URL's `&hl=en` dropped.
  - 1e's "app store" checks for /features and /compare now expect no store link, because these fixtures set no flag. The landing page keeps the App Store URL in its JSON-LD.
- **language-phase-0:** the same transform on the footer and landing views, after the seo-fixes step.
- **plans-data-model:** the seo-fixes badge step takes a footer with no badges (AFTER carries none; BEFORE's two badges, their two preload hints and the old Play URL go).
- **marketing-country-parity:** the stored pages' badge attributes (hrefs, alt and aria words, badge files) removed from BEFORE, in both loops.
- **language-phase-1d, -1d2:**
  - `GET /api/manage` gains `appsAvailable` after `countrySettings` (`{ ios: false, android: false }` in the fixtures);
  - the shell's `SettingsTab` stub gains that prop;
  - Settings' app card is gone from the Settings and smoke views. GB is precise; the US Settings views are LISTED, as that registry does for US.
- **phase3-screens, schedule-graphics-places, us-unpriced-country** (source or Manage pins):
  - the `SettingsTab` signature and its StoreBadges line are named;
  - `{!isNativeApp() && (` is allowlisted;
  - `appsAvailable` is optional (absent → no card), so harnesses that render the tab without it still work;
  - my code comments avoid the literal "Get the app", which a jump-bar check reads.
- **The hash-only harnesses** (faq-1, faq-2, faq-3, seo-geo-2, copy-truth-1):
  - each now hashes the page with the footer badges and the Play `hl` stripped (`strip`, both sides);
  - their HEAD hashes were **recaptured at their own original commits**: 82c5adee, 7e1effa7, a92f983a, 78e16437, dad7911a;
  - every other byte is still compared, and store-badges-1.cjs proves the badges themselves.
- **design-fonts:** one of my comments contained `/*` (a glob path), which that check forbids. Reworded.

## 6 · The full sweep

`node scripts/run-harnesses.cjs`: **181 run, 175 passed, 6 failed. All 6 fail at HEAD too, the same set as the last three workstreams. This work adds no failure:**

| Harness | Fails | Why |
|---|---|---|
| schedule-graphics-places | 1 | "…and the Feature gates the tab, the pane, the shortcut and both routes" (fails at HEAD) |
| canada-1 | 1 | the "postal code / card terminal" frame check |
| europe-languages-1 | 1 | de-CH ß |
| world-countries-1 | 1 | "no source file … still carries the words" (the tagline) |
| world-countries-2 | stops | "Terms edit — expected once, found 0: Last updated: 20 October 2026" |
| legal-languages-1 | stops | the same error |

**The first sweep:** before the re-pins it had 15 more failing, each a named consequence now re-pinned as in §5. schedule-graphics-places was at 3 then and is back to its HEAD 1.

## Files

- **New:**
  - `public/badges/apple/*.svg` (28), `public/badges/google/*.png` (28)
  - `lib/store-badge-files.ts`
  - `scripts/store-badges-1.cjs`, `scripts/_lp-store-badges-1.cjs`
  - `scripts/fixtures/store-badges-1-manifest.json`, `scripts/fixtures/store-badges-1-identity.json` (+ `.uk.html`)
  - this report
- **Changed:**
  - `components/StoreBadges.tsx`, `components/landing/LandingFooter.tsx`
  - `lib/app-badges.ts` (the Play URL), `lib/comparison-flags.ts` (`appsOf`)
  - the five footer pages: `app/landing/page.tsx`, `app/features/page.tsx`, `app/compare/page.tsx`, `app/about/page.tsx`, `app/[country]/[section]/[slug]/page.tsx`
  - `app/api/manage/route.ts`, `app/manage/[token]/page.tsx`
  - `public/badges/README.md` (extended; the existing text untouched)
  - `scripts/harnesses.json`
  - the re-pins in §6
