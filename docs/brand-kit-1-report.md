# brand-kit-1: a brand kit for the landing-page designer, and competitor prices every 90 days

*3 November 2026. One migration (20261065), committed first, run with `scripts/db-migrate.cjs` and verified read-only. **No change to the website or to any code.** The brand kit is built only from files already in the repo, and lives outside it, in `~/Downloads/hatchgrab-brand-kit/` and `~/Downloads/hatchgrab-brand-kit.zip`. It was opened in Finder.*

| Part | Outcome |
|---|---|
| 1 · Prices every 90 days | **Done.** `tier_intervals` is now commercial **90**, core 90, secondary 180. Estimated checker cost: **≈ $3.44 a month** (it was ≈ $7.92 at 30 days on the same measurements). |
| 2 · Brand kit | **Done.** 19 files: the wordmark (two variants, SVG plus 3 PNG widths each), the icon (SVG, 3 PNGs, the app icon at 1024 as PNG and SVG), colours (md, png, json), fonts (md), README. Also zipped (414 KB). |

## Flagged

- **The wordmark already exists as outlined artwork**, so the brief's "if it exists only as styled text" case doesn't apply.
  - `public/logos/hatchgrab-wordmark.svg` (navy "HATCH") and `-white.svg` (white "HATCH") are pure `<path>`s: no `<text>`, no font.
  - The site's header renders the white one (`components/brand/HatchGrabWordmark.tsx`; it was live text until V9.7).
  - The kit delivers those files **byte for byte** (sha256 checked), not a redrawing.
  - The light-background navy is the artwork's own `#16314F`.
- **The icon has no dark/light variants, and doesn't need them.** The light/dark split the brief describes (white or navy "HATCH", orange "Grab") is the wordmark's. The icon is a single orange bolt, so one transparent file serves both backgrounds; I didn't recolour it.
- **The shipped app icon is the orange bolt on WHITE** (iOS, Android and web all agree). `public/icons/hatchgrab-icon.svg` is the same bolt on navy `#0F172A`, but **nothing references it** (not the manifest, `app/layout.tsx`, or the native projects).
  - It looks like an earlier draft, so I left it out of the kit to avoid giving the designer two icons.
  - Say if you want it included.
- **Fonts:** no font file for the site's typefaces is in the repo. Next.js downloads them from Google Fonts at build time. So `fonts.md` gives the download links (all SIL OFL 1.1, which allows sharing).
  - The only TTFs in the repo (`assets/fonts/weekly-post/`) belong to the social-post designer, not the marketing site.

## Part 1 · Prices checked every 90 days

**Migration `20261065_brand_kit_1_commercial_90.sql`, guarded:**
- It writes only the `commercial` key (`jsonb_set`), and only while the row reads exactly `{"commercial": 30, "core": 90, "secondary": 180}`.
- Afterwards it must read 90/90/180; anything else raises.
- Run twice, it changes nothing.

```
npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261065_brand_kit_1_commercial_90.sql
db-migrate: supabase/migrations/20261065_brand_kit_1_commercial_90.sql · sha256 525962d8137e5a1f · committed at 9ee6c0a8
db-migrate: supabase/migrations/20261065_brand_kit_1_commercial_90.sql applied — one transaction, no error
```

**Before (read-only):** `{"core": 90, "secondary": 180, "commercial": 30}`, `check_interval_days` 90.

**Verify (read-only MCP):**

```sql
select tier_intervals::text as tier_intervals, (tier_intervals->>'commercial')::int as commercial, (tier_intervals->>'core')::int as core,
  (tier_intervals->>'secondary')::int as secondary, check_interval_days, (select count(*) from competitor_check_settings) as settings_rows,
  (select count(*) from competitors where lifecycle = 'active') as active_competitors
from competitor_check_settings where id;
```

| tier_intervals | commercial | core | secondary | check_interval_days | settings_rows | active_competitors |
|---|---|---|---|---|---|---|
| {"core": 90, "secondary": 180, "commercial": 90} | **90** | 90 | 180 | 90 | 1 | 132 |

### The monthly cost: the method of docs/competitor-features-2-report.md §5, on today's measurements

**Measured** (`competitor_check_runs`, read-only): routine checks now cost **$0.0830 each** (22 checks, $1.83). Quick pass $0.0056 and deep $0.1267 are Admin-started, so they're not part of the running cost.

**How a routine check's cost splits:**
- 260 findings and 210 verifications in 22 checks → 9.55 verifications a check, of which 163 / 210 = 77.6 % are feature ones.
- A verification reads one page (≈ 14k input tokens), so verifications are ≈ 133.6k of a check's 250.8k input tokens (53.3 %). The feature ones are 0.533 × 0.776 = 41.4 % of the check, plus ≈ 4 % for the feature list and findings in the extractor → **feature part ≈ 45 %**.
- Feature part = 0.454 × $0.0830 = **$0.0377**; base (pages and prices) = **$0.0453**.

**Now (commercial 90):**
- Every tier that applies is at least 90 days apart, so each active competitor is checked every 90 days: 132 × 30 / 90 = **44 checks a month**.
- Each check asks commercial (6) and core (25) every time, and secondary (11) every other time: 6 + 25 + 11/2 = **36.5 features of 42** (87 %).
- Cost per check = $0.0453 + 0.87 × $0.0377 = **$0.0781**.
- 44 × $0.0781 = **≈ $3.44 a month**.

**For comparison:**
- **At 30 days** (competitor-features-2's steady state, on today's measurements): 132 checks × ($0.0453 + 0.39 × $0.0377 = $0.0600) = **$7.92 a month**. That report gave $8.70 on the earlier $0.0921 measurement.
- **Before competitor-features-2** (one 90-day interval, every feature): 44 × $0.0830 = **$3.65 a month**.
- **The first cycle:** almost every feature is due at once (only 219 answers carry a check date), so for the first 90 days each check asks all 42: 44 × $0.0830 = **≈ $3.65 a month**. After that, ≈ $3.44.

**Note:** the deployed checker is still the pre-competitor-features-2 code (nothing pushed). It uses `check_interval_days` (90), so it already checks at this rate. The tiers take effect when that code is deployed.

## Part 2 · The brand kit

`~/Downloads/hatchgrab-brand-kit/`, also as `~/Downloads/hatchgrab-brand-kit.zip`:

```
README.md
logos/wordmark/
  hatchgrab-wordmark-light-bg.svg              navy #16314F "HATCH", orange #EF8B2C bolt, "Grab" and arrow (= public/logos/hatchgrab-wordmark.svg)
  hatchgrab-wordmark-dark-bg.svg               white "HATCH", orange "Grab" (= public/logos/hatchgrab-wordmark-white.svg)
  hatchgrab-wordmark-{light,dark}-bg-512.png   512 × 113, transparent
  hatchgrab-wordmark-{light,dark}-bg-1024.png  1024 × 225, transparent
  hatchgrab-wordmark-{light,dark}-bg-2048.png  2048 × 450, transparent
logos/icon/
  hatchgrab-icon.svg                           the orange bolt on a transparent 1024 square, placed as in the app icon
  hatchgrab-icon-{512,1024,2048}.png           transparent squares
  hatchgrab-app-icon-1024.png                  the iOS app's own 1024 × 1024 icon (= ios/…/AppIcon-512@2x.png)
  hatchgrab-app-icon.svg                       the app icon as a vector (white tile + bolt)
colours/
  colours.md, colours.png, colours.json
fonts/
  fonts.md
```

### 1 · Logos

**Every HatchGrab logo asset found in the repo:**

| Asset | What it is | In the kit |
|---|---|---|
| `public/logos/hatchgrab-wordmark.svg` / `-white.svg` | The wordmark, outlined, light and dark (`lib/brand.ts` `HATCHGRAB_WORDMARK_SVG` / `_WHITE_SVG`; the nav uses the white one) | Copied byte for byte; rendered to PNG |
| `public/logos/hatchgrab-logo.png`, `-white.png`, `@1x` | 640 × 141 / 320 × 70 PNGs of the same wordmark, for email | Superseded by the 512–2048 renders from the SVG |
| `public/logos/hatchgrab-share-card.png` | The social share card (wordmark on a card) | Not a logo; not included |
| `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` | The iOS app icon, 1024 × 1024, orange bolt on white | Copied byte for byte |
| `android/app/src/main/res/mipmap-*/ic_launcher*.png` | The Android launcher icons (same design, background `#FFFFFF`) | Represented by the app icon |
| `public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `public/apple-touch-icon.png`, `public/favicon.ico` | The web and PWA icons (same design) | Represented by the app icon |
| `public/icons/hatchgrab-icon.svg` | The bolt on navy, **referenced nowhere** | Not included (see Flagged); its bolt path is the kit's vector |

**Checks:**
- **Each PNG is a Chromium render of the SVG at the exact width.** Every corner pixel is transparent (alpha 0), and the solid pixels are exactly `#EF8B2C` with `#16314F` (light) or `#FFFFFF` (dark).
- **The icon's bolt is the path from `hatchgrab-icon.svg`**, fitted to the shipped app icon by searching position and scale for the least pixel error: `translate(353, 96.5) scale(831)`.
  - Against the shipped PNG, only 1 pixel in 1,048,576 differs by more than 64 levels; the rest of the 2,593 differences are anti-aliasing.
  - The shipped icon's orange is exactly `#EF8B2C` (239, 139, 44).
- **Left out:** Village Foodie assets, and Apple's and Google's store badges (`public/badges/`).

### 2 · Colours

There are 16, each with hex, token and use, in `colours.md` and on one swatch sheet, `colours.png`. Sources: `app/landing/landing.css` (the `.hg-landing` tokens and literals) and `lib/brand.ts` (`HATCHGRAB_ORANGE_HEX`, `HATCHGRAB_NAVY_HEX`, `HEADER_BG`).

| Name | Hex | Where |
|---|---|---|
| Brand orange | `#EF8B2C` | the wordmark's "Grab", bolt and arrow; the app icon; primary buttons; focus rings; ticks, eyebrows, prices |
| Orange, deep | `#D9741A` | primary button hover; small ticks |
| Orange wash / line | `#FEF1E7` / `#F6D2B4` | the trial banner's background / border |
| Navy (headings) | `#16314F` | "HATCH" on light backgrounds; headings; the navy button; plan tags |
| Navy, deep | `#0F2238` | navy button hover |
| Header navy | `#0F172A` | the nav bar and footer (Tailwind `slate-900`, `HEADER_BG`) |
| Body text | `#2C4766` | body copy |
| Secondary text (dark slate) | `#3E5472` | small secondary lines (hero note, currency line, About) |
| Soft / faint text | `#5F7A99` / `#9AAFC4` | ledes, quiet buttons / small labels |
| Nav and footer links | `#C3CAD8` | links on the header navy |
| Footer small print | `#7C8698` | the copyright row |
| White / Wash / Line | `#FFFFFF` / `#F5F8FB` / `#DDE5EE` | page and cards / band backgrounds / borders |

The comparison table's status colours (green `#15803D`, red `#B91C1C`, amber `#B45309`) are noted as functional, not brand.

### 3 · Fonts

All are from Google Fonts via `next/font/google`, self-hosted at build, under **SIL Open Font License 1.1**. There are no local files to include, so `fonts.md` gives download links.

| Family | Use | Weights / styles used | Link |
|---|---|---|---|
| Archivo | headings (800), eyebrows (700), plan names and tags, table prices, testimonial names, step numbers | 400, 700, 800; italic (quote marks, step numbers); loaded variable, upright and italic | fonts.google.com/specimen/Archivo |
| Public Sans | body text and the buttons (600) | 400, 500, 600, 700; loaded variable | fonts.google.com/specimen/Public+Sans |
| Courier Prime | the printed-ticket illustration | 400, 700 | fonts.google.com/specimen/Courier+Prime |
| Noto Sans (Greek/Cyrillic), Noto Sans JP, HK, Thai, Arabic | fallbacks for those scripts (`lib/script-fonts.ts`) | default | fonts.google.com/noto |

### 4 · README

The README explains what each file is, plus one line of usage:
- minimum 120 px wide for the wordmark (30 mm in print), 24 px for the icon;
- clear space of at least the height of the "H" on every side;
- never recolour the orange, and never stretch, outline or retype the logo.

### 5 · Opened

`open ~/Downloads/hatchgrab-brand-kit` was run.

## What changed in the repo

- `supabase/migrations/20261065_brand_kit_1_commercial_90.sql` (committed at `9ee6c0a8`, run) and this report.
- **Nothing else:** no website file, code file or asset. The kit was built by a throwaway script in the session scratchpad, which reads the repo's files and writes only into `~/Downloads/`.

## Undo (only if Dominic asks)

```sql
update public.competitor_check_settings set tier_intervals = jsonb_set(tier_intervals, '{commercial}', '30'::jsonb)
 where id and tier_intervals = '{"commercial": 90, "core": 90, "secondary": 180}'::jsonb;
```
