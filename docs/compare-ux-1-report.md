# compare-ux-1: the comparison pages, easy to read on any device

*8–9 November 2026. Nothing is deployed. No database write, no migration. No .env file was opened, read, listed, parsed or tested.*

## Summary

- **The table reads at a glance.**
  - Each cell is one short verdict from one word set: **✓ Yes · ◐ Partly · ✗ No · Not listed · — · Doesn't apply** ("—" is spoken as "Doesn't say"; "Doesn't apply" was added on 9 November, §13).
  - Prices and fees show their amount, or **✓ None** when there is none.
  - The detail (the note, the quote, the source link and the checked date) opens from a small **ⓘ**, a native `<details>`. Its text is in the HTML and is never visually hidden.
  - A one-line legend follows the table, in all 29 languages, explaining all six values and the ⓘ.
  - The public no longer sees the admin badges or the category line.
- **Phones (390px):**
  - the table scrolls sideways inside its own box;
  - the feature column stays on the left;
  - the header row stays under the site's nav while you scroll the page;
  - "Swipe sideways to see every product →" shows only while the table is wider than the screen.
- **Desktop (1280px):** the four competitors fit without sideways scrolling, and the header row sticks under the nav.
- **The rest of the page:**
  - "In short" is gone from the page, the Markdown and the word list, and its keys are deleted in every language;
  - "Which suits your food truck?" now sits directly under the title and the checked-date line;
  - the breadcrumb no longer sticks over the header;
  - the admin banner is one line, with the rest behind "Details".
- **Follow-ups you approved (9 November):**
  - **The Japanese nav button (§12)** now wraps onto two lines ("メニューを / アップロード") below 640px. No JP page scrolls sideways at 320, 360, 375 or 390px; before, 12 of the 16 JP views did. Every other country's screens are pixel-identical and every other page's HTML is unchanged.
  - **"Doesn't apply" is the sixth value (§13)**, translated in all 29 languages and explained in the legend.
- **Footer:** the "Compare / Ordering system comparison" column is now a single **Compare** link in the main row, after FAQ. It shows only where the comparison is live; admins see it as before.
- **Badge check (§7):** all 27 localized Google Play SVGs are **byte-identical** to Google's official files on the Partner Marketing Hub, downloaded again today. The zh-HK PNG is byte-identical to Google's badge page. Nothing was changed.
- **Other pages:** a full before/after snapshot of 280 pages shows that only the footer changed, and only on the 15 pages whose country has a live comparison (UK and DE, plus the English site pages that carry the UK footer). Every other page's visible HTML is identical.
- **Checks:**
  - new harness `compare-ux-1` passes 37/37;
  - by hand: `compare-ux-1-footer-shots` 21/21, and `compare-ux-1-shots` with every measure as expected;
  - typecheck and lint clean;
  - full sweep: see §9.

## 0 · Pre-check, and what I flag

- badges-manual-1 was committed on main (`c892cb3d`). No other Claude session was running (`ListAgents`, checked at the start and again before the sweep).
- **No span of the brief arrived garbled.**
- **No instructions contradicted each other**, so I did not stop. Two points needed a reading, and I note them here:
  - **§3 against §8.** §3 replaces "Not stated" / "Not mentioned on their website" in all languages; §8 keeps the twins unchanged apart from the tldr. Both hold: the **page** shows the new short verdicts, while the Markdown and JSON twins keep every cell's full words and detail exactly as before (§5).
  - **§4 "same behaviour as /features".** /features has a sticky header, but it has **no** sideways scroll, no sticky feature column and no swipe hint. The part it does have, the measured sticky header, is now one shared piece, `components/StickyTableHead.tsx`, which both pages use. The sideways scroll, the sticky column and the hint are new, on the comparison page only.
- **Premise corrections:**
  - **§7 says the localized Google Play SVGs "came from third-party packages". They did not.** badges-manual-1 downloaded them from Google's own Partner Marketing Hub, and today's re-download confirms they are Google's files byte for byte (§7).
  - **§4 "only the feature column renders on phones": I could not reproduce it.**
    - At HEAD, before this work, every product column rendered with text on screen at 390px, in Chromium and in WebKit, for GB, DE and JP. The before shots record it.
    - The likely causes on a real phone are addressed: the old feature column was wide, the long words made the cells tall, and nothing told you the table scrolls. The feature column is now 7.75rem, the verdicts are short, and the hint shows while the table overflows.
- **Found while doing this brief: the JP pages scrolled sideways at phone widths.** The site nav's orange button, "メニューをアップロード", couldn't wrap, so it ran past the screen. You approved a fix, and it is done in §12.
- **One addition to the word set:** a cell where the feature **does not apply** to that kind of service (a market's WhatsApp) would otherwise have shown "—", and the legend defines "—" as "their website doesn't say", which would be untrue. You approved it as the sixth value, "Doesn't apply" (§13). None of today's GB, DE or JP cells is such a cell; competitor-features-2 and compare-ux-1 pin it on fixtures.

## 1 · Admin banner

- **One line:**
  - the status: "Live via auto-publish", "Live · public and indexable", or "Admins only — {why}", where why is "{n} of {total} competitors pass the checks" or "auto-publish is off";
  - "{n} shown";
  - "What the public sees";
  - "Open the Pricing check".
- **Behind "Details"** (a native `<details>`): the checklist (apps, placeholders, VAT), the "not on the page" list, the draft notice and the go-live note.
- **Removed:** the manual items "≥ 2 verified vendors" and "Impressum decision recorded", with their message keys in every language and their code in `lib/comparison.ts`.
- **The public never sees any of it.** The banner is rendered only for a verified admin; the harness checks a public response has no `cmp-admin`.

## 2 · "In short" removed; "Which suits" moved up

- **Removed from:** the page, the Markdown twin (`## In short`), and the page's word list in `lib/comparison.ts` (the texts checked for placeholders).
  - The JSON twin never had it.
  - The page's `<meta>` tags never carried it: the GB, DE and JP metadata are identical before and after.
- **Keys deleted** (`comparison.tldr.*`):
  - from all 32 messages files (the 28 bases, en-GB and the variants) and the generated `messages/ns/*/comparison.json`;
  - from every back-translation in `docs/i18n/back/`.
- **"Which suits your food truck?"** now comes directly after the title and the "Last checked … · Made by HatchGrab" line, before the table.

## 3 · The table

- **Verdicts:**
  - ✓ Yes (green), ◐ Partly (amber), ✗ No (red), Not listed (grey), — (light grey), Doesn't apply (grey, §13);
  - the icons are `aria-hidden` and the word is read; "—" has `role="img"` with the label "Doesn't say" in the page's language.
- **Prices and fees:**
  - the monthly price, per-order fee, card fee and set-up fee show the amount when it is short (≤ 40 characters), e.g. "£19/month" or "1.5% + 20p per card payment";
  - "✓ None" when there is none;
  - a longer note goes behind the ⓘ.
- **ⓘ** is a native `<details>`/`<summary>` with a spoken "Details" label. It holds the note, the quote, and the source link (the host name, or "Source" for HatchGrab's own pages) with the checked date.
  - HatchGrab's cells show an ⓘ only when there is a note.
  - Every cell's text is in the server HTML (§8.3).
- **Public view:** no "unverified" or "auto-verified" badges and no category line under the product names. Admins still see both in the admin view.
- **Kept:** the caption, `<th scope="col">` and `scope="row"`, `<th scope="rowgroup">` group rows, and the twins' links.
- **Legend** under the table: "✓ Yes · ◐ Partly · ✗ No · Not listed: not on their features or pricing pages · —: their website doesn't say · Doesn't apply: that kind of service doesn't have the feature · ⓘ: the note, quote and source" (the "Doesn't apply" part added on 9 November, §13).
- **Translations:**
  - The 11 new keys were written into all 28 bases, with back-translations in `docs/i18n/back/`.
  - The variants inherit them. A structural check found 0 problems.
  - Worth a native check:
    - **"Doesn't say" in 24 languages is the same word the page used for "Not stated"** (e.g. de "Nicht angegeben", fr "Non précisé", ja "明記なし"). It is a natural rendering, but it means the spoken label of "—" is unchanged in those languages. hu, ro, hr, sl and bg have new wording ("Nem derül ki", "Nu precizează", "Nema podatka", "Ni podatka", "Не уточнява").
    - **ja and th: "None" (no fee) and "No" are the same word** (なし / ไม่มี). The icon tells them apart: "✓ なし" for no fee, "✗ なし" for a missing feature.
    - **ar:** the swipe hint's arrow points left (←), the reading direction.

## 4 · Phones and desktop

- **One shared sticky piece: `components/StickyTableHead.tsx`.**
  - It always publishes the header's measured height as a CSS variable. That is what /features' `PlanTableHeadHeight` did; it now renders this component with the same markup, a hidden `<span>`.
  - With `pin` (the comparison page), it keeps the one real `<thead>` under the site's nav while the page scrolls, even though the box scrolls sideways. A box with `overflow-x: auto` captures CSS `position: sticky`, which is why the old header never stuck. The header is moved down with a transform, by exactly the distance scrolled past the table's top, clamped to the table.
  - Where the box does not scroll sideways (from 900px), it does nothing, and CSS sticky does the job.
  - It marks the box `data-overflows` while the table is wider than its box; the swipe hint keys off that.
- **Below 900px:**
  - the box scrolls sideways;
  - the feature column is `position: sticky; left: 0` at 7.75rem;
  - group-row labels stay in view;
  - the table's minimum width is the feature column plus 5.9rem per product;
  - borders are `separate`, so a sticky cell keeps its border.
- **From 900px:** the box is `overflow: visible`, the header cells are CSS-sticky at `top: var(--nav-h)`, the feature column is 13rem, and four competitors fit.
- **Breadcrumb (§5):** landing.css makes every `<nav>` under `.hg-landing` sticky, 72px tall and bordered. That is the site nav's rule, and it also caught the breadcrumb, which is a `<nav>` for its landmark. The breadcrumb now scrolls with the page. Its markup and the `BreadcrumbList` structured data are unchanged.

## 5 · The twins

- **Markdown:** the only change is the removed "In short" section, in GB, DE and JP (diffed against HEAD on the same data).
- **JSON:** byte-identical to HEAD for GB, DE and JP.
- Both keep every cell's full words ("Not stated", "Not mentioned on their website", "Yes, from Pro"…), its note, its source and its date.

## 6 · Footer

- `components/landing/LandingFooter.tsx`:
  - The column is gone.
  - "Compare" (the language's `comparison.footer.heading`) is an `<a class="foot-compare">` in `.foot-links`, after FAQ, or after Pricing where a country has no FAQ.
    - **'live'** puts it in the server HTML.
    - **'admin'** shows it only in an admin's browser (`AdminOnly`, as before).
    - **'off'** shows nothing.
  - **React's generated ids are unchanged on every page.** The old column's slot is kept as `{null}`, and with no live comparison each branch renders exactly the elements it did before.
    - The first build changed the country menu's ids on all 280 pages, because the slot had been removed. The snapshot comparison found it, and this keeps them unchanged.
  - `comparison.footer.link` ("Ordering system comparison") is no longer shown. It is still returned by `comparisonFooter`.
- `landing.css`:
  - The `.foot-col` rules are removed.
  - On phones (≤720px), nine items (FAQ and Compare) put the country menu on a third row of its own, spanning it and centred: `.foot-links > .cc:nth-child(9)`.
  - Eight items stay four and four. The order rule (the last five counted from the end) is unchanged.
- **Measured** (`compare-ux-1-footer-shots`, real built CSS and fonts, Chromium):
  - en-GB, fr-FR, de-DE and ja-JP at 360, 430 and 1280 show Compare in the row, with nothing overflowing.
  - English at 360 reads "Features · Pricing · FAQ · Compare / About · Privacy · Terms · Contact / GB".
  - All 29 languages at 360 and 430:
    - Compare is present wherever the country has a comparison address (all but AE);
    - no footer is wider than the phone;
    - no label overflows its column;
    - every item is at least 44px tall;
    - nine items read 4 / 4 / 1 with the country menu centred (AE reads 4 / 4).
  - A country with its comparison off (GB, FR), or 'admin' (DE), has no Compare link in the public HTML, and its seven links are as before.

## 7 · Badge source check (no change made)

- **Source:** Google's Partner Marketing Hub folder page (`partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/?folder=86718`), fetched today; it lists 85 storage links.
- **Compared:** each of our 27 localized SVGs, downloaded again from the link with the same storage object recorded in `scripts/fixtures/store-badges-1-manifest.json`, by sha256.

| Result | Languages |
|---|---|
| **Byte-identical to Google's file (27)** | fr-FR, de-DE, es-ES, it-IT, pt-PT, nl-NL, sv-SE, da-DK, nb-NO, pl-PL, cs-CZ, hu-HU, sk-SK, ro-RO, hr-HR, sl-SI, fi-FI, et-EE, lv-LV, lt-LT, el-GR, bg-BG, pt-BR, ms-MY, ja-JP (Google's "Print_color_Japanese", its only Japanese file), th-TH, ar-AE ("Arabic-Saudi-Arabia") |
| **zh-HK (PNG)** | byte-identical to `play.google.com/intl/en_us/badges/static/images/badges/zh-hk_badge_web_generic.png`; Google publishes no Hong Kong SVG |
| **English SVG** (`public/badges/GetItOnGooglePlay_Badge_Web_color_English.svg`) | identical to Google's English SVG except one trailing newline at the end of our file (5,079 bytes against 5,078); the drawing is the same |
| **Could not confirm** | none |

- Every manifest sha256 still matches the file on disk.

## 8 · Proof

### 8.1 Screenshots (`docs/compare-ux-1/`)

- **How they were made:**
  - from a read-only export of the real rows, by the real page route on the render kit's stand-in, with the real built stylesheets and fonts, in Chromium;
  - GB, DE and JP were set live in the stand-in only;
  - the after page runs the real `StickyTableHead`, bundled from the source and hydrated into the server HTML.
  - The HatchGrab logo shows as a broken image because the stand-in serves no `/public` files. That is the tool's limit, not the page's.
- **Files:**
  - `before-*` / `after-*`: `gb-public-390`, `gb-public-1280`, `de-public-390`, `jp-public-390`, `jp-admin-390` (full page);
  - `*-table.png`: the page scrolled into the table, header under the nav;
  - `*-table-scrolled.png`: 390px, table scrolled sideways;
  - `after-*-detail.png`: a rival cell's ⓘ open.
- **Measured** (`before-measures.json`, `after-measures.json`):

| | before (HEAD) | after |
|---|---|---|
| product columns rendered, each with text on screen (phones: after scrolling to it) | all, every view | all, every view |
| header row while the page scrolls past the table | scrolls away (GB 390: top at −11px) | **under the nav** (top 72px = nav bottom) in every view, 390 and 1280 |
| feature column while the table scrolls sideways (390) | stays | stays |
| "Swipe sideways" hint | none | shown at 390 while the table overflows; hidden at 1280 |
| breadcrumb while scrolling | **sticky, over the header** | scrolls with the page |
| ⓘ opens its detail | (no ⓘ) | yes, every view |
| legend · "In short" · "Which suits" before the table | no · yes · no | **yes · no · yes** |
| page scrolls sideways | GB, DE no; JP yes (the nav button) | GB, DE no; JP yes (unchanged, §0) |
| 1280: table fits without sideways scroll | yes | yes |

### 8.2 Footer screenshots

- `docs/compare-ux-1/footer-<en-GB|fr-FR|de-DE|ja-JP>-<360|430|1280>.png`: the full viewport width, so clipping would show. Measures are in `footer-measures.json` (§6).
- FR's comparison is not live today; it was set live in the stand-in only, to show the link.

### 8.3 The HTML keeps every detail

On the real data, each cell's note and source link was checked against the JSON twin, cell for cell:

| | cells | notes in the HTML | source links in the HTML | visually hidden |
|---|---|---|---|---|
| GB | 140 | 52 / 52 | 140 / 140 | none |
| DE | 87 | 32 / 32 | 87 / 87 | none |
| JP | 81 | 20 / 20 | 81 / 81 | none |

- The only table texts at HEAD that no longer appear verbatim are:
  - the old cell words ("Not stated", "Not mentioned on their website");
  - the combined "word, note" forms (e.g. "Yes, from Pro"), whose notes are now in the ⓘ;
  - the public category line.

### 8.4 No other page changed

- **Method:** both trees were built (`next build`) and served (`next start`), and the same 280 pages (every public page of every country, plus /about, /contact, the legal pages, /llms.txt, the sitemap, robots and Village Foodie's pages) were snapshotted. The comparison ignored asset hashes and the build id.
- **Status and redirects:** identical.
- **Visible HTML:** identical on 265 pages. It differs on 15, only in the footer (column → link):
  - `/uk`, `/uk/features`, `/uk/faq`, `/uk/compare`;
  - `/de`, `/de/features`, `/de/faq`, `/de/compare`, `/de/privacy`, `/de/terms`;
  - `/about`, `/contact`, `/privacy`, `/terms`, `/country-terms` (the English pages carry the UK footer).
- **Streamed page data:** the same 15 pages, the same change. /contact also differs by its per-request form token, as on every run.
- **Stylesheets:** only landing.css's chunk changed: the four `.foot-col` rules removed and the phone `.cc` row rule added. comparison.css changed too, but only comparison pages load it.

## 9 · Checks

- **New:** `scripts/compare-ux-1.cjs`, 37/37, registered in `scripts/harnesses.json`. It covers the words in every language, the public page, the admin banner, the twins, the footer and the shared sticky piece, on the committed fixtures.
- **By hand** (listed in harnesses.json's excluded group; they need an export and a build): `scripts/compare-ux-1-shots.cjs` and `scripts/compare-ux-1-footer-shots.cjs` (21/21).
- **Re-pinned for the intended changes**, each marked 🔁 with the reason:
  - `compare-de-1`: banner, short verdicts, footer link, checklist, admin-only group line; 93/93;
  - `competitor-features-2`: "—" and "does not apply"; 79/79;
  - `compare-suits-1`: "Which suits" above the table; 72/72;
  - `site-chrome-1`: compare-ux-1's footer change set aside exactly; 33/33;
  - `faq-3`: the ⓘ and "Details" `<details>`; 167/167;
  - `faq-4`: the footer slot; 80/80;
  - `cwv-1`: compare-ux-1's two landing.css footer changes set aside exactly, every other byte still checked; 27/27;
  - `compare-de-1-screens` (by hand): no `.foot-col` needed. Not run, because it rewrites the committed docs/compare-de-1 screenshots.
- **Typecheck:** clean. **Lint:** clean on every changed file.
- **Full sweep** (`node scripts/run-harnesses.cjs`, on the final tree): 204 harnesses, 201 passed, 3 failed:
  - **`event-types-render`:** the dashboard's Event types dialog measurement. **It was failing before this brief** (reported in badges-manual-1 §C), and nothing here touches it.
  - **`pricing-pages`:** one check, "headless Chrome available for the 375px check", timed out launching Chrome while the sweep was loading the machine. **Run alone it passes 145/145.**
  - **`cwv-1`:** its pin "every byte of landing.css before its block is as it was" caught compare-ux-1's footer change. I re-pinned it (above), and it now passes 27/27.
  - **After the 9 November follow-ups (§12, §13), on the final tree: 205 harnesses, 204 passed, 1 failed, `event-types-render`, the same failure from before this brief.** Typecheck clean; lint adds no warning (each re-pinned harness has the same count of unused-directive warnings as at HEAD).
  - The sweep also still reports three tracked files that aren't registered (`_midnight-manage.cjs`, `_midnight-public.cjs`, `allergen-card-country-screens.cjs`, from 6 November). They are not this brief's.

## 10 · Files

- **Page:**
  - `app/(public)/[country]/[section]/[slug]/page.tsx`
  - `app/(public)/[country]/[section]/[slug]/comparison.css`
  - `lib/comparison.ts`
- **Shared sticky piece:**
  - `components/StickyTableHead.tsx` (new)
  - `components/pricing/PlanTableHeadHeight.tsx`
- **Footer:**
  - `components/landing/LandingFooter.tsx`
  - `app/(public)/(site)/landing/landing.css`
- **Words:**
  - `messages/*.json`
  - `messages/ns/*/comparison.json` and the catalog (generated by `scripts/split-messages.cjs`)
  - `docs/i18n/back/*.json`
- **Checks:**
  - `scripts/compare-ux-1.cjs`, `scripts/compare-ux-1-shots.cjs`, `scripts/compare-ux-1-footer-shots.cjs` (new)
  - `scripts/harnesses.json`
  - the re-pinned harnesses above
- **Proof:** `docs/compare-ux-1/` (screenshots and measures), and this report.
- **9 November follow-ups:**
  - `messages/ja-JP.json` (`landingNav.ctaShort`; `comparison.cell.doesntApply` and the legend) and `messages/ns/ja-JP/landingNav.json`;
  - every base's `comparison.cell.doesntApply` and legend, with `messages/ns/*/comparison.json` and `docs/i18n/back/*.json`;
  - the page (the "Doesn't apply" verdict) and `lib/comparison.ts` (comment);
  - `scripts/jp-nav-1.cjs`, `scripts/jp-nav-1-shots.cjs` and `scripts/_lp-jp-nav-1.cjs` (new);
  - `scripts/harnesses.json`; the re-pinned `compare-ux-1`, `competitor-features-2`, `faq-1`, `faq-2`, `faq-3`, `faq-4`, `seo-geo-2`, `copy-truth-1`, `contact-1` and `cwv-2`;
  - `docs/jp-nav-1/` (before/after screenshots and measures).

## 11 · Commits

- `488073ee` compare-ux-1: the comparison pages easy to read on any device (the code, the words in every language, the harnesses, docs/compare-ux-1/)
- `ab7cb920` compare-ux-1: report
- `4ab4d956` jp-nav-1: the Japanese nav button and "Doesn't apply" (9 November), with this report's §12 and §13

All are on main, committed by explicit paths. Nothing is pushed or deployed.

## 12 · Follow-up: the Japanese nav button (jp-nav-1, 9 November 2026)

- **The cause.**
  - Below 640px, a non-English page lets the nav's two buttons wrap their labels.
  - Japanese and Chinese keep words whole there (`word-break: keep-all`, from world-countries-1), so "ログイン" never splits as "ログイ / ン". They break only where a label has a break opportunity.
  - "メニューをアップロード" had none, so the button couldn't wrap, and its label ran past the button and past the screen.
- **The fix: one invisible break opportunity in the Japanese label.**
  - `messages/ja-JP.json` `landingNav.ctaShort` is now "メニューを" + U+200B (a zero-width space) + "アップロード". The generated `messages/ns/ja-JP/landingNav.json` matches.
  - Below 640px the button reads "メニューを / アップロード" on two lines; from 640px the full label, "メニューをアップロード →", is unchanged.
  - **No CSS changed and no other language's words changed.** This works in Chromium and in WebKit (Safari's engine). CSS `word-break: auto-phrase` would have done it in Chromium only, and most Japanese phones are iPhones.
- **Before and after, measured** (`scripts/jp-nav-1-shots.cjs`; screenshots in `docs/jp-nav-1/`, measures in `before-measures.json` / `after-measures.json`):
  - `/jp`, `/jp/features` and `/jp/faq` as served by `next start` on the real build;
  - the JP comparison page, which isn't live, from the stand-in with the same built CSS and the real logo inlined;
  - Chromium, at 320, 360, 375 and 390px.

| | 320 | 360 | 375 | 390 |
|---|---|---|---|---|
| `/jp` (the hero shrinks the nav button) | fits → fits | fits → fits | fits → fits | fits → fits |
| `/jp/features` | **359px wide → 320** | **380 → 360** | **387 → 375** | **395 → 390** |
| `/jp/faq` | **359 → 320** | **380 → 360** | **387 → 375** | **395 → 390** |
| JP comparison page | **359 → 320** | **380 → 360** | **387 → 375** | **395 → 390** |

  - After, the button is 2 lines and 59px tall inside the 72px nav (49px on `/jp`), and its label stays inside it.
  - **WebKit:** `/jp`, `/jp/features` and `/jp/faq` at all four widths: no sideways scroll, label on 2 lines.
  - **Screenshots:** `docs/jp-nav-1/<before|after>-<jp|jp-features|jp-faq|jp-comparison>-<320|360|375|390>.png` (the first screen, nav included).
- **Every other language is unchanged:**
  - **Pixels:** the first screen of every other country's `/xx`, `/xx/features` and `/xx/faq` at 320, 360, 375 and 390 (43 countries, 516 screens, 43 locales including en-GB, zh-HK and ar-AE) is **pixel-identical** before and after.
  - **HTML:** the 280-page snapshot shows identical stylesheets and identical status codes. The visible HTML differs only on the 6 JP pages (`/jp`, `/jp/features`, `/jp/faq`, `/jp/compare`, `/jp/privacy`, `/jp/terms`), and on each the only difference is the one added U+200B. /contact differs only by its per-request form token, as always.
- **Found, not fixed: on JP phones "ログイン" (Log in) runs under the button by a few pixels.**
  - On `/jp/features`, `/jp/faq` and the comparison page: 10px at 320, 4px at 360, 1px at 375, 0 at 390.
  - It was the same before this fix: the Log in link's box didn't change, and the button's box was already 119px wide. You'll see it in the 320 screenshots ("ログイ…").
  - You said nothing else should change, so I left it. **Decision for you:** let the Japanese Log in link keep its full width (`flex-shrink: 0` on ja pages below 640px)? The button would lose about 10px at 320 and still fit its two lines.
  - ✅ **Fixed 9 Nov (jp-nav-2, you approved):** on ja pages "ログイン" no longer shrinks below its text, and below 360px the Japanese nav's gap and side padding tighten (never its text size). All 16 JP views now show it whole at 320, 360, 375 and 390px, the button still two lines with its label inside, nothing scrolling sideways in Chromium or WebKit; the CSS change is exactly 4 `:root:lang(ja)` rules, every other country's 516 first screens are pixel-identical, and every page's HTML is unchanged. Screenshots in `docs/jp-nav-2/`; guarded by `scripts/jp-nav-1.cjs` (12/12); `site-chrome-1` and `cwv-1` re-pinned through `_lp-jp-nav-1.cjs` `cssAsBefore`.
- **Checks:**
  - new harness `scripts/jp-nav-1.cjs`, 9/9, registered: the label and its namespace file, no other zero-width space anywhere, the keep-all rule that makes it the only break, and the rendered nav;
  - `scripts/jp-nav-1-shots.cjs` is by hand (it needs the server and an export).
  - **Re-pinned** (8 harnesses that pin the `/jp` landing or its source files byte for byte against older commits): `faq-1`, `faq-2`, `faq-3`, `faq-4`, `seo-geo-2`, `copy-truth-1`, `contact-1` and `cwv-2`.
    - Each now takes out exactly the one break before comparing, through the new `scripts/_lp-jp-nav-1.cjs` `noBreak`, the same mechanism as the earlier named changes' `_lp-*` modules. `cwv-2` instead accepts that one key only when its value is the old one plus the break.
    - Every other byte is still compared, and all 8 pass.

## 13 · Follow-up: "Doesn't apply", the sixth value (9 November 2026)

- **On the page:**
  - a feature that doesn't exist for a tool's kind of service (a market's WhatsApp, say) shows **"Doesn't apply"** in grey;
  - which kind ("does not apply to a market", or "…to delivery platforms" where the country's comparison has those) is the cell's note, behind its ⓘ;
  - before 9 November it showed the long phrase itself, and before compare-ux-1 the same phrase as the cell's text.
- **New key** `comparison.cell.doesntApply`, in en-GB and all 28 bases (the variants inherit it):
  - fr "Ne s’applique pas", de "Gilt nicht", es "No aplica", it "Non applicabile", pt-PT/pt-BR "Não se aplica", nl "Niet van toepassing";
  - sv "Gäller inte", da "Gælder ikke", nb "Gjelder ikke", pl "Nie dotyczy", cs "Netýká se", hu "Nem vonatkozik rá", sk "Netýka sa";
  - ro "Nu se aplică", hr "Ne odnosi se", sl "Ne velja", fi "Ei koske", et "Ei kehti", lv "Neattiecas", lt "Netaikoma";
  - el "Δεν ισχύει", bg "Не се отнася", ms "Tidak terpakai", ja "該当なし", zh-HK "不適用", th "ไม่เกี่ยวข้อง", ar "لا ينطبق".
- **Legend:** every language gains one segment before the ⓘ, saying in its own words "Doesn't apply: that kind of service doesn't have the feature".
  - It is deliberately general, because the kind differs by country: markets in Europe, delivery platforms in Malaysia, Hong Kong, Thailand and the UAE.
  - Back-translations are in `docs/i18n/back/`.
  - The translation check gives Structural 0 for ja-JP, fr-FR, de-DE and ar-AE. en-GB's 3 ICU flags were already there at HEAD.
- **Twins unchanged:** the Markdown and JSON keep such a cell as before (value `unknown`, the "does not apply to a market" phrase as its text), like every other cell's full words.
- **Checks:**
  - `compare-ux-1` is now 39/39: the new key in every language, the legend explaining it in every language, and a market's cell rendering "Gilt nicht" with the phrase behind its ⓘ;
  - `competitor-features-2` was re-pinned (79/79).
