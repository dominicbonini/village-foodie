# badges-manual-1: Google Play badges the size of Apple's, and the reference manual at V16.14

*8 November 2026. Nothing is deployed. No database write, no migration.*

## Summary

- **(A) Fixed with the brief's first preference:**
  - **27 languages** now use **Google's own full-bleed localized SVG** from the Google Play Partner Marketing Hub, replacing the PNG. Each is byte-for-byte as downloaded.
  - **Hong Kong** keeps its PNG: Google publishes no Hong Kong SVG, and its Traditional Chinese "Taiwan" SVG has different words. The PNG's transparent margin is cancelled in layout (the brief's second preference).
  - **One rule**, in `components/StoreBadges.tsx` (the footer on desktop and phone, and Manage › Settings): the Google badge's **visible** height equals the App Store badge's height. Apple's badges are unchanged.
  - **Measured** in Chromium at 1280px and 390px for English and all 28 languages: **58 pairs, all equal within 1px**.
  - **Other pages:** every page's HTML is otherwise unchanged. 227 pages differ only by the Google badge, 52 are identical, and /contact differs only by its per-request form token.
- **(B) The reference manual is at V16.14** (`docs/reference-manual.md`):
  - the header and front matter;
  - a dated changelog entry;
  - **§87** (speed, Admin › Partners, comparison pages, badges, tooling, backlog);
  - invariants **35.aq-1 to 35.aq-12**.
- **Checks:**
  - `badges-manual-1` passes 11/11 (with `--shots`, 13/13 including the measurements);
  - `store-badges-1` 60/60 (re-pinned);
  - typecheck clean;
  - full sweep: 202 of 203 passed; the one failure is `event-types-render`, the dashboard dialog measurement that already failed before this brief (§C).

## 0 · Pre-check

- compare-languages-1 is committed on main (`cda78c12`), and the tree was clean.
- No other Claude session was running (`ListAgents`).
- No span of the brief arrived garbled, and no instructions contradicted each other.

## A · Google Play badge size

### A.1 Diagnosis: the visible box of each localized badge

Measured from each file's own pixels (alpha > 16), with the Apple and English files rendered at 10× by the same method:

| Badge | Image | Visible box | Visible ÷ image height | At 40px: visible height |
|---|---|---|---|---|
| App Store, every language (SVG) | 119.66 × 40 (most) | full-bleed | 1.000 | 40px |
| App Store Croatian (Apple's own file) | 130.14 × 41 | 40 of 41 units | 0.976 | 39px |
| Google Play English (SVG) | 238.96 × 70.87 | full-bleed | 1.000 | 40px |
| **Google Play, 27 localized PNGs** | 646 × 250 | 646 × 192 at y = 29: **29px transparent above and below** | **0.768** | **30.7px** |
| **Google Play Arabic PNG** | 646 × 250 | 564 × 168 at (41, 41): margins on all four sides | **0.672** | **26.9px** |

- The store-badges-1 note that these PNGs were "full-bleed (no built-in margin)" was wrong. It is corrected in `public/badges/README.md`.

**Does Google offer full-bleed localized SVGs?** Yes.
- Google's badge page (`play.google.com/intl/…/badges`) now redirects to the **Google Play Partner Marketing Hub**, "Lockups, icons & badges" → "Get it on Google Play Badges" → Digital → **svg**.
- It lists 55 localized SVGs named `GetItOnGooglePlay_Badge_Web_color_<Language>.svg`, the same family and the same 238.96 × 70.87 viewBox as our English file.
- Google's current English SVG there **renders pixel-identical** to ours (mean pixel difference 0.00).
- Google's rules on that page:
  - minimum clear space is "one-quarter of the height of the badge";
  - minimum height is 28px;
  - "make sure the Google Play badge is the same size or larger than the other badges".

### A.2 The files

- **Downloaded:** 8 November 2026, from the links on Google's own page. The page itself was fetched and its links read by a parser, not copied by hand.
- **Written:** byte-for-byte into `public/badges/google/<locale>.svg`; the 27 PNGs they replace were removed. Each file's original name, Google's storage object, its size and its sha256 are in `scripts/fixtures/store-badges-1-manifest.json`; `public/badges/README.md` has the table.
- **Safety:** none contains a script, `foreignObject` or external reference. They are served as `<img>` in any case.
- **Language checked twice:**
  - by a pixel cross-match against all 28 old PNGs;
  - by eye, on a contact sheet of every file.
- **Every one says the right language.** Two words changed, to Google's current wording:
  - **Spanish:** "DESCARGAR EN" (was "DISPONIBLE EN");
  - **Finnish:** "LATAA SE Google Play" (was "Google Playsta").
- **Google's names for ours:**
  - Norwegian "Norwegian", Malay "Malaysian", Arabic "Arabic-Saudi-Arabia";
  - Portuguese "-Portugal" and "-Brazil";
  - Spanish "Spanish" (Spain; "-LATAM" is separate);
  - Japanese: its one file, "Print_color_Japanese", the same full-bleed shape (viewBox 180 × 53.33).
- **Hong Kong:** it stays on the PNG from Google's badge page. The hub has Chinese-China (Simplified) and Chinese-Taiwan, whose wording differs ("立即下載" under the logo, against Hong Kong's "在此下載").
- **Size:** every SVG is about 4–15 KB against 17–18 KB for the PNG it replaces.

### A.3 The one rule (`lib/store-badge-files.ts`, `components/StoreBadges.tsx`)

- **`BadgeFile` gains an optional `inset: { top, bottom }`:** a transparent margin built into a file, in its own units. Only zh-HK has one (29 / 29 of 250).
- **StoreBadges sizes Google's badge so its visible height is `height`** (40px everywhere: the footer at every width and Manage › Settings):
  - **A full-bleed file** (every SVG) is drawn at `height`, which is exactly the markup it had.
  - **A file with an inset** is drawn at `height ÷ visible share` (zh-HK: 52.08px). Negative top and bottom margins (−6.04px) take the transparent rows out of the layout, so the pair lines up and the 1.25rem gap between them (the clear space) is measured from the visible badges.
- **The artwork is never cropped, scaled off-ratio or altered.**
- **Apple's markup is unchanged** in every language. The harness checks src, width, height and style.

### A.4 Proof

**Screenshots:**
- 58 pictures: English and all 28 languages × 1280px and 390px.
- Each is the real `StoreBadges` markup with the real footer stylesheet (`landing.css`) on the footer's background, in Chromium at 2× (`node scripts/badges-manual-1.cjs --shots`).
- Saved as `docs/badges-manual-1/<locale>-<width>.png`, for example `sv-SE-1280.png`, `zh-HK-390.png`, `ja-JP-390.png`.

**Visible heights,** measured from each screenshot's own pixels: every row that isn't the footer background, within each badge's column. CSS px; also in `docs/badges-manual-1/visible-heights.json`.

| Language | 1280 App Store | 1280 Google Play | 390 App Store | 390 Google Play |
|---|---|---|---|---|
| en-GB | 40 | 40 | 40 | 40 |
| fr-FR | 40 | 40 | 40 | 40 |
| de-DE | 40 | 40 | 40 | 40 |
| es-ES | 40 | 40 | 40 | 40 |
| it-IT | 40 | 40 | 40 | 40 |
| pt-PT | 40 | 40 | 40 | 40 |
| nl-NL | 40 | 40 | 40 | 40 |
| sv-SE | 40 | 40 | 40 | 40 |
| da-DK | 40 | 40 | 40 | 40 |
| nb-NO | 40 | 40 | 40 | 40 |
| pl-PL | 40 | 40 | 40 | 40 |
| cs-CZ | 40 | 40 | 40 | 40 |
| hu-HU | 40 | 40 | 40 | 40 |
| sk-SK | 40 | 40 | 40 | 40 |
| ro-RO | 40 | 40 | 40 | 40 |
| hr-HR | 39 | 40 | 39 | 40 |
| sl-SI | 40 | 40 | 40 | 40 |
| fi-FI | 40 | 40 | 40 | 40 |
| et-EE | 40 | 40 | 40 | 40 |
| lv-LV | 40 | 40 | 40 | 40 |
| lt-LT | 40 | 40 | 40 | 40 |
| el-GR | 40 | 40 | 40 | 40 |
| bg-BG | 40 | 40 | 40 | 40 |
| pt-BR | 40 | 40 | 40 | 40 |
| ms-MY | 40 | 40 | 40 | 40 |
| ja-JP | 40 | 40 | 40 | 40 |
| zh-HK | 40 | 40.5 | 40 | 40.5 |
| th-TH | 40 | 40 | 40 | 40 |
| ar-AE | 40 | 40 | 40 | 40 |

- **All within 1px.**
- **Croatian:** Apple's own file is 41 units tall with 40 visible, so it shows 39px at our 40px. Apple's badges stay untouched, as briefed.
- **zh-HK:** 40.5 is the PNG's anti-aliased edge.
- **Google's own rule holds everywhere:** the Play badge is the same size or larger.

**Every other page's HTML, unchanged:**
- **Method:** production builds of HEAD (before) and of this work (after), 280 pages saved from each against the same database.
- **Results:**

| Result | Pages |
|---|---|
| Byte-identical (build names aside) | 52 |
| Identical apart from the Google badge's `<img>` and its props in the streamed page data | 157 |
| The same, apart from the order Next streams its page data | 70 |
| /contact: only its per-request anti-bot form token | 1 |

- **What changes on a non-English page:** the Google badge's `src` (`.png` → `.svg`) and its reserved width (103 → 135). On zh-HK pages, also its height and margin.
- **Unchanged:** stylesheets, statuses and redirects.

## B · Reference manual → V16.14

All in `docs/reference-manual.md`:

- **Version:** `V16.14` in the header and `**Version 16.14**` in the front matter. The two agree (the standing rule's grep).
- **Changelog:** "V16.14 — 8 November 2026", five bullets.
- **§87. Speed, Admin › Partners, comparison pages that publish themselves in every language, and store badges (V16.14):**
  - **87.1 Speed:**
    - PostHog web vitals on public pages, and no Vercel Speed Insights;
    - the Czech and Greek narrow-phone rules;
    - the italic preload;
    - the live before/after table (LCP, FCP, first byte);
    - the performance budget;
    - `lib/top-level-routes.ts`.
  - **87.2 Admin › Partners:**
    - what it is and its tables;
    - free-form emails on the shared mail machinery;
    - no opt-out line required, no templates or sequences;
    - the reply-matching rule ("both" → neither).
  - **87.3 Comparison pages:**
    - at most four, the selection order, categories, no website never shown;
    - "Which suits" (situations, wording rules, never card readers, tills or card payments, the only "best");
    - absence-means-no without android and ipad, and "pages complete" = features + pricing;
    - the consistency rule; newer check wins;
    - auto-publish (evidence, ≥ 2, take-downs, Admin wins, explicit Off recorded, AE never). **Germany live by default once deployed, with the note that Dominic may switch it off**;
    - Report an error; the Monday summary;
    - semi-deep checks, then the normal tiers; the display rule; every language base; the one-off results.
  - **87.4 Store badges** (part A).
  - **87.5 Tooling:** `gh` installed and authenticated; `gh workflow run competitor-check.yml -f mode=…`; Actions runs GitHub's main.
  - **87.6 Backlog:**
    - comparison pages built ahead (checker-triggered revalidation);
    - help-centre reads ($6 a month);
    - marketplaces not relevant, so no commission answer;
    - further speed work after real-visitor data and the designer's hero;
    - first-touch attribution with the growth dashboard;
    - the Pizzeria Gusto case study (Nadia's and Bogdan's permission);
    - the loyalty 12-month launch decision;
    - the offline wording gap;
    - the comparison briefs' own flags.
- **§35.aq** (next free group after 35.ap):

| Invariant | Rule |
|---|---|
| 35.aq-1 | the performance budget and `lib/top-level-routes.ts` |
| 35.aq-2 | web vitals on public pages only, no Speed Insights |
| 35.aq-3 | at most four, one selection rule |
| 35.aq-4 | "Which suits" never a card or till strength; the only "best" |
| 35.aq-5 | "Not listed" only on complete evidence; the consistency rule |
| 35.aq-6 | newer check wins |
| 35.aq-7 | automatic publishing; Admin always wins; AE never |
| 35.aq-8 | the display rule |
| 35.aq-9 | the Monday summary is an internal email, never an outreach template |
| 35.aq-10 | every language base; addresses; hreflang |
| 35.aq-11 | store badges: vendor artwork, equal visible height, one rule |
| 35.aq-12 | partner email; "both" → neither |

- **The harnesses that read the manual pass:** compare-no-system, migration-function-grants, loyalty-1, reviews-weather-1.

## C · Checks

- **`scripts/badges-manual-1.cjs`:** 11/11, in the sweep. `--shots` (by hand, needs Chromium) adds the measured equality: 13/13. It covers:
  - the files (27 SVG + the zh-HK PNG, byte-for-byte; Hub source; no script; no old PNG left);
  - the table with its inset;
  - the one rule in StoreBadges, used by the footer and Manage › Settings;
  - English markup exactly as before; Apple unchanged in every language;
  - the full-bleed and inset markup; Apple first.
- **`scripts/store-badges-1.cjs`:** 60/60. Re-pinned:
  - the manifest's Google files (27 SVG + 1 PNG);
  - Google's Partner Marketing Hub host (withgoogle.com) as a vendor source;
  - dimensions from the SVG viewBox;
  - the README dated 2026-11-08.
- **Also run:** site-chrome-1 33/33, canada-1 85/85. Typecheck clean.
- **Full sweep** (`node scripts/run-harnesses.cjs`, 203 listed): **202 passed, 1 failed.**
  - The failure is `event-types-render`: two measurements of the dashboard's event-types dialog at 820px. It already failed in compare-languages-1's sweep, before this brief.
  - This brief changes no dashboard file or style. The badge component it touches renders only in the public footer and Manage › Settings' "Get the app" card.
  - Flagged, not re-pinned.

## D · Files

- **Badge files:**
  - `public/badges/google/*.svg` (27 new);
  - `public/badges/google/*.png` (27 removed; zh-HK.png kept);
  - `public/badges/README.md`;
  - `scripts/fixtures/store-badges-1-manifest.json`.
- **Code:** `lib/store-badge-files.ts`, `components/StoreBadges.tsx`.
- **Proofs:** `scripts/badges-manual-1.cjs`, `scripts/store-badges-1.cjs` (re-pinned), `scripts/harnesses.json`, `docs/badges-manual-1/` (58 screenshots and the heights).
- **Manual:** `docs/reference-manual.md`.

No deploy, no database write, no migration. No `.env*` file was opened.
