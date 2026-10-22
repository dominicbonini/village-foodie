# about-page — report

**Date:** 22 October 2026 · **Branch:** main (not committed, not pushed, not deployed) · **Database:** untouched (no SQL run, none needed)

## Summary

- A public **/about** page now exists on the HatchGrab host only, built to the approved brief ("about-mockup-2"):
  - one centred column in the landing's style;
  - the eyebrow, the h1, the four story paragraphs verbatim, and the signature;
  - a muted Companies House line above a thin rule, then **Contact us**.
- **The photo slot** uses `public/about/dominic.jpg` when the file exists. Until then nothing is rendered and the story takes the full column width. Dropping the file in and deploying is the whole step; no code change is needed.
- **The extras from the brief:**
  - an **About** link in the HatchGrab footers;
  - a sitemap entry with a real lastmod (22 October 2026);
  - a self-canonical address;
  - the title and a plain meta description;
  - the `/llms.txt` line and link;
  - JSON-LD: an AboutPage node, plus Organization.founder, with an image only when the photo exists.
- **Village Foodie is unchanged:** `/about` is still a 404 there, and its footers have no About link.
- **Your mid-task request:** the country picker is **no longer in the top nav**, on every HatchGrab marketing page. It is in the footer only. (See §2 for why it applies to every page and not only the landing.)
- **Checks:**
  - tsc: 0 errors;
  - `npm run build`: passes;
  - lint: 2,445 errors / 378 warnings, the same as the baseline (no new problems);
  - full sweep: **161/161 harnesses pass**, including the new `about-page.cjs` (58 checks);
  - the browser harness `signup-landing-screenshots.cjs` (not in the sweep): 64/64.

## 1 · URL and hreflang: one `/about`, self-canonical, no hreflang

**Recommendation, and what was built:** a single `/about` on the HatchGrab host, the same shape as `/contact`.

- The story is identical for every country. One page per country segment (`/uk/about`, `/us/about`, …) would publish five copies of one text, each needing a canonical or hreflang cluster to stop them competing. Hreflang only helps when the pages actually differ.
- Canonical and og:url are `https://www.hatchgrab.com/about`. There are no `alternates.languages`.
- **It still feels local.**
  - The nav, the footer and the country menu follow the visitor's country through `resolveVisitorCountry`: `?country`, then the `hg_country` cookie, then the request's country, else GB. This is exactly as on `/contact` and the bare `/features`.
  - The words follow that country's locale. No en-US or en-CA override is needed, because the story has no UK-only spellings. `messages/ns/en-US/aboutPage.json` is `{}`.
  - Proven by `about-page.cjs` §4: the footer menu shows United Kingdom for a GB visitor, United States for `?country=US`, and Ireland for the `hg_country=IE` cookie. The canonical is `/about` every time.
- **Village Foodie:** `notFound()`, the same gate as `/features`.
  - Before this work, `/about` on either host fell through to `app/[country]` (`dynamicParams = false`) and returned 404. It is still a 404 on Village Foodie: checked against `next start` with `Host: www.villagefoodie.co.uk`, which returned 404.

## 2 · The country picker: out of the nav, footer only (your request mid-task)

> "can you remove the country page picker from the top of the landing page. i only want it at the bottom"

- **Applied to every HatchGrab marketing page, not only the landing.** The nav is one component (`LandingNav`) shared by the landing, `/features`, `/compare` and `/about`. Removing it from the landing only would have left it at the top of the other three, and "I only want it at the bottom" reads as the rule for the picker.
  - If you meant the landing only, it is a one-prop change. Say so and I'll scope it back.
- **What changed:**
  - `LandingNav` no longer renders `CountryMenu` and no longer takes a `country` prop. The four pages stop passing it.
  - `CountryMenu` lost its `variant` ("header" | "footer"). It is the footer's, and shows the full country name.
  - The `.cc-head` CSS rules went with it (`app/landing/landing.css`).
  - `VisitorCountryOption.shortName` is still sent to the client. Nothing reads it now; it is left in place because removing it is unrelated churn.
- **What is unchanged:**
  - The footer menu, at every width, still writes the cookie and still has crawlable `<a href>` options. Measured in WebKit and Chromium: at least 44px tall, opens upward, stays inside the screen.
  - The header row at 1024 and 1440 is still one line with nothing overlapping. It now reads Features · Pricing · Log in · CTA. See `docs/screenshots/landing-country-1440-header.png`.

## 3 · What was built

### The page: `app/about/page.tsx`

- **Structure:**
  - HatchGrab only (`notFound()` otherwise) and `force-dynamic`.
  - The same chrome as `/features`: LandingNav, LandingFooter, PageLocale, DemoModalProvider and DemoModal.
- **Metadata:**
  - title `{ absolute: "About — HatchGrab" }`;
  - description: "HatchGrab was started by Dominic Bonini, who built Village Foodie to find out which food trucks were coming to his village. It's a small company, and he runs it himself." (plain, not a sales line);
  - robots index/follow;
  - canonical and og:url from `ownUrlMetadata('/about')`.
- **Body:**
  - eyebrow "About" (shown as ABOUT by `.eyebrow`'s `text-transform: uppercase`, like every landing eyebrow);
  - h1 "Hi, I'm Dominic." (curly apostrophe, house style);
  - the four paragraphs verbatim. Paragraph 2 names Village Foodie in plain text, with no link;
  - "**Dominic Bonini** · Founder";
  - a thin rule, then the company line: "HatchGrab Ltd · registered in England and Wales · company number 17381557 · registered office: Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom · Contact us".
  - The company values come from `lib/company.ts`. The link goes to `/contact?topic=General%20Enquiry`, the same target as the footer's Contact link.
- **Photo:**
  - `lib/about-server.ts aboutPhotoExists()` checks `public/about/dominic.jpg` at request time.
  - Without the file there is no `<img>`, no box and no alt text.
  - With it: `<img class="about-photo" src="/about/dominic.jpg" alt="Dominic Bonini, founder of HatchGrab">`. It sits beside the story from 760px (200×200, 14px radius) and above it, centred, on phones (176×176, round).
- **CSS:** `.about-*` rules at the end of `app/landing/landing.css`.
  - The column is 40rem (about 72ch). Without the photo the story fills it.
  - The company line uses `--hero-grey` (#3E5472, 7.73:1 on white), so the small text passes AA, as the currency line does.

### Data, words and SEO

- **`lib/about.ts`** (pure): `ABOUT_PATH`, `ABOUT_PHOTO_PATH`, and `ABOUT_UPDATED = '22 October 2026'`, which is the sitemap lastmod.
  - ⚠️ Move `ABOUT_UPDATED` when the story changes. Adding the photo counts.
- **`lib/company.ts`:** `founder: { name: 'Dominic Bonini' }`. A fact, used by the page, llms.txt and the JSON-LD.
- **Messages:**
  - a new `aboutPage` namespace in `messages/en-GB.json`;
  - `landingFooter.about` and `contactPage.about` ("About");
  - `split-messages` was re-run;
  - the nine new phrases are named in `NEW_WORDING` (`scripts/_messages-parity-1e.cjs`).
- **Footer link "About":**
  - in `LandingFooter` (landing, /features, /compare, /about), between Terms and Contact;
  - in the HatchGrab `/contact` footer, after Terms.
  - ⛔ **Not in `LegalChrome`.** The legal pages' chrome is shared by both hosts, so an About link there would send Village Foodie visitors to a 404. `components/Footer.tsx` (Village Foodie) is untouched.
- **Sitemap** (HatchGrab host only), as the last entry: `/about`, lastmod `2026-10-22T00:00:00.000Z`, yearly, 0.3. Checked in the served `/sitemap.xml`. The Village Foodie sitemap is unchanged.
- **`/llms.txt`:**
  - a new section before "## Links": `## About` / "HatchGrab is run by its founder, Dominic Bonini, from the UK.";
  - `- About: https://www.hatchgrab.com/about` as the last link.
- **JSON-LD** (`lib/structured-data.ts`):
  - `organizationLd(countryCode, founderImage)` adds `founder: { "@type": "Person", "name": "Dominic Bonini" }`, plus `image` only when the photo exists. The landing passes `aboutPhotoUrl()`.
  - The About page has its own graph: the Organization (with founder) and an **AboutPage** node: `@id …/about#page`, url, name, description, inLanguage, and `about` pointing to the Organization.
  - ⛔ No dates, roles or jobTitle were invented.

## 4 · Proof

### Screenshots: `docs/about-page/`

Both engines, at 390 and 1280, from a production build (`npm run build`, then `next start` on :3123 at `hatchgrab.localhost`):

| | no photo | with a test photo |
|---|---|---|
| WebKit 390 | `about-webkit-390-nophoto.png` | `about-webkit-390-photo.png` |
| WebKit 1280 | `about-webkit-1280-nophoto.png` | `about-webkit-1280-photo.png` |
| Chromium 390 | `about-chromium-390-nophoto.png` | `about-chromium-390-photo.png` |
| Chromium 1280 | `about-chromium-1280-nophoto.png` | `about-chromium-1280-photo.png` |

- **Measured, identical in both engines:**
  - no sideways scroll at either width;
  - no country menu in the nav, and one in the footer;
  - the company line's colour is rgb(62, 84, 114).
- **No photo:** the story fills the column (1280: 640px at x=320; 390: 350px).
- **With the photo:**
  - 1280: photo 200×200 at x=320, story 402px beside it at x=558;
  - 390: photo 176×176 centred above the story;
  - the image loaded (naturalWidth > 0), and both the About page's and the landing's Organization.founder carried `"image": "https://www.hatchgrab.com/about/dominic.jpg"`.
- **The test photo:**
  - a generated 600×600 "TEST PHOTO" gradient JPEG;
  - the server was restarted with it in place, then stopped, and the file was **deleted**;
  - `public/about/` no longer exists (checked with `ls`, which reported "No such file or directory").
- **Layout change after the first screenshots:** in the first no-photo run the story stopped at 62ch inside a 46rem column, so it sat off-centre under the centred heading. The column is now 40rem and the story fills it, which is what "let the story take the full width" asks. All eight screenshots are from after this change.

### The words are in the server HTML, with no JS

`curl` of `/about` from `next start`, with every `<script>` stripped, still contains:

- the h1;
- all four paragraphs;
- the signature;
- the company line;
- "Contact us".

`about-page.cjs` §1 proves the same on the prerendered HTML.

### Every other page is byte-identical apart from the named changes

Method:

- A snapshot was taken **before any about-page code changed**. It covered:
  - 15 pages and their metadata: landing, /features and /compare × GB, US, IE, AU and NZ;
  - five plans PDFs;
  - /llms.txt;
  - both hosts' sitemaps;
  - /contact on both hosts;
  - /privacy, /terms and /country-terms.
- The same snapshot was retaken afterwards.
- Each change was removed by an exact normaliser, then the two snapshots were compared.

Results:

- all 15 page metadata, the five PDFs, Village Foodie /contact, the three legal pages and the Village Foodie sitemap: **identical**;
- all 15 page HTMLs: identical after removing only (a) the nav's country menu, (b) the footer About link and (c) on the landings, the Organization's founder;
- HatchGrab /contact: identical after removing only the About link;
- /llms.txt: the only difference is the "## About" section and the About link;
- the HatchGrab sitemap: the only difference is the `/about` entry.

### Checks

| check | result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | passes; `/about` is listed as ƒ (dynamic) |
| `npx eslint .` | 2,445 errors / 378 warnings, the same as the baseline (the four plain `require` lines added to old harnesses carry the repo's usual disable comment) |
| `node scripts/run-harnesses.cjs` | **161 run · 161 passed · 0 failed** (15 min) |
| `scripts/about-page.cjs` (new, registered) | 58/58 |
| `scripts/signup-landing-screenshots.cjs` (browser, by hand after the build) | 64/64 |
| messages-split / messages-parity | 165/165 · 45,993/45,993 |

`about-page.cjs` covers:

- §1 the words in order, in the HTML;
- §2 no prices, no country list and no Village Foodie link;
- §3 metadata: canonical, no hreflang, title and description;
- §4 the visitor's country in the chrome, and no nav menu;
- §5 the photo: absent with no placeholder, present beside or above the story, and the real `lib/about-server.ts` check against a temporary directory;
- §6 the JSON-LD;
- §7 a 404 on Village Foodie, and no About link in the VF footer or in LegalChrome;
- §8 the footer link and nav on landing, /features and /compare (GB and US), /contact on both hosts, the sitemap on both hosts, and llms.txt;
- §9 negative controls: a planted price, country list, Village Foodie link and photo are each caught; the old header menu is detected; a reworded paragraph fails.

## 5 · Re-pins: which harnesses, and why

Every re-pin is a **named change, verified before it is mapped back**. A view that does not carry exactly the change is compared as it is, and fails. Every other byte is still compared.

The named changes live once, in **`scripts/_lp-about-page.cjs`** (registered as a shared module):

| name | covers |
|---|---|
| ABOUT-link | the footer link |
| ABOUT-founder | the JSON-LD founder |
| ABOUT-sitemap | the sitemap entry |
| ABOUT-llms | the llms.txt additions |
| NAV-menu | the country menu leaving the nav |

Each name has a forward form (`ITEMS`, for the harnesses that apply named items to BEFORE) and a backward form (`viewBack` / `applyViews`).

| harness | why it broke | re-pin |
|---|---|---|
| `seo-fixes.cjs` | **sitemap**; **nav menu** (expected the menu list in header *and* footer) | the sitemap list gains `/about`; one menu list (the footer's) and the nav has none |
| `plans-data-model.cjs` | **footer link**, **JSON-LD**, **sitemap**, **nav menu** | `applyViews` maps all four back on every captured view before its checks (2 sitemap views, 7 founder views, 14 link views, 12 nav views); `seoMenus` expects one list |
| `marketing-country-parity.cjs` | **footer link** (text and attributes); **nav menu** (it is Phase 2D-1's harness and asserted "one header and one footer button") | the About link is named on AFTER's text and attributes; it asserts one footer button and no nav button; the button checks read the footer's; "the header button says US" becomes "the footer button says United States" |
| `language-phase-0.cjs` | **footer link**; **JSON-LD**; **nav menu** | `viewBack` on the landing footer and both landing views |
| `language-phase-1e.cjs` | **footer link**, **JSON-LD**, **sitemap**, **nav menu** | the four `ITEMS` added to `scripts/_lp1e-named.cjs`. Its listing `scripts/fixtures/language-phase-1e-us-changed.txt` was regenerated by the harness: the only diff is the new item names on six US views |
| `language-phase-1e-tidy.cjs` | the same four, plus its sitemap URL lists | the same `ITEMS`; the sitemap lists gain `/about`; the `-usOff` landing view (a redirect, no HTML) is excluded from the page items |
| `signup-landing-screenshots.cjs` (browser, not swept) | **nav menu** (it measured and photographed the header menu) | it now asserts no country button in the header at every width and still measures the footer menu |

- `docs/screenshots/landing-country-1440-header-menu.png` was **deleted**: the header menu it showed no longer exists.
- The landing header and footer PNGs in `docs/screenshots/` were regenerated.
- The six `signup-country-*` PNGs that run rewrote were restored to their committed versions; this work does not touch those screens.

## 6 · Notes and loose ends

- **Phone footer wrap:** with six links, at 390px the footer's link row wraps as five then one, leaving Contact alone on the second line. It was built as a wrapping row ("a fifth item costs nothing"), so I left it.
  - If you'd prefer an even 4 + 2 or 3 + 3, it is one CSS line on `.foot-links` below 720px. See `about-webkit-390-nophoto.png`.
- **When the real photo arrives:**
  1. Add `public/about/dominic.jpg`. A square crop works best, since it is shown in a square / circle at 176–200px; 600px or more is fine.
  2. Move `ABOUT_UPDATED` in `lib/about.ts` so the sitemap lastmod moves with it.
  3. Deploy. The page and the JSON-LD pick it up with no other change.
- **The `check-tzdata` warning** printed by the build (Node 22.22.3, tz data 2026a) is the known local-runtime note from canada-2, not part of this work.
- **The mockup file "about-mockup-2"** is not in the repo, so the page was built from the brief's description of it.
- **Not done, as instructed:** no commit, push or deploy; no database or `outreach_templates` changes; no live truck touched; no `.env*` file opened.

## Files

- **New:**
  - `app/about/page.tsx`
  - `lib/about.ts`
  - `lib/about-server.ts`
  - `lib/i18n/catalog/aboutPage.ts` and `messages/ns/en-GB/aboutPage.json`, `messages/ns/en-US/aboutPage.json` (generated)
  - `scripts/about-page.cjs`
  - `scripts/_lp-about-page.cjs`
  - `docs/about-page/*.png` (8)
  - this report
- **Changed (app):**
  - `app/compare/page.tsx`, `app/features/page.tsx`, `app/landing/page.tsx` (nav prop; the landing also passes the founder image)
  - `app/contact/HatchGrabContact.tsx`
  - `app/landing/landing.css`
  - `app/sitemap.ts`
  - `components/landing/CountryMenu.tsx`, `components/landing/LandingFooter.tsx`, `components/landing/LandingNav.tsx`
  - `lib/company.ts`, `lib/llms-text.ts`, `lib/structured-data.ts`
  - `messages/en-GB.json`, `messages/ns/en-GB/contactPage.json`, `messages/ns/en-GB/landingFooter.json`
- **Changed (harnesses and fixtures):**
  - `scripts/harnesses.json`
  - `scripts/_messages-parity-1e.cjs`, `scripts/_lp1e-named.cjs`
  - `scripts/seo-fixes.cjs`, `scripts/plans-data-model.cjs`, `scripts/marketing-country-parity.cjs`
  - `scripts/language-phase-0.cjs`, `scripts/language-phase-1e-tidy.cjs`
  - `scripts/signup-landing-screenshots.cjs`
  - `scripts/fixtures/language-phase-1e-us-changed.txt`
  - `docs/screenshots/landing-country-*.png` (4 regenerated, 1 deleted)
