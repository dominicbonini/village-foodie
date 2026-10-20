# seo-fixes — the invisible fixes from the SEO audit

**Date:** 20 October 2026 · **Branch:** main (uncommitted, on top of Stage B; nothing pushed or deployed)

**Summary.** All the requested audit fixes are in, and nothing a visitor sees changed (apart from three copy edits you asked for separately, listed in §2):

- M1, M4, M5;
- S1, S2, S3, S4, S5, S7, S9;
- N1, N6.

All 14 before/after screenshots are pixel-identical, as are the three open country menus. The full list of what changed is in the head diff in §3. No SQL and no database change. The only reads were read-only checks that the Stage B migration is live and that the plan tables carry `updated_at`.

---

## 1 · What was done

| ID | What changed | Files |
|---|---|---|
| **M1** | Each country option is now a real `<a href>` to that country's equivalent page. On `/uk/features` that is `/us/features`, via `switchCountryPath`; on a page with no country address it is the country's landing. The menu is **always in the server HTML**. While closed it carries `cc-menu-closed` (`display: none`: no box, not focusable, hidden from screen readers, exactly as when it was absent). The click is unchanged: it prevents the default navigation and runs the same cookie + `router.push`. A Ctrl- or Cmd-click opens the link in a new tab. The look is the same in header and footer: the open menus are pixel-identical with identical computed styles. **No footer link row.** Only switched-on countries are options, so a switched-off country is never linked. | `components/landing/CountryMenu.tsx`, `app/landing/landing.css` (2 rules) |
| **M4** | The matcher typo `_next_next/image` is now `_next/static\|_next/image`. Proof is in §5. | `proxy.ts` |
| **M5** | The SoftwareApplication `url` is the page's own address (`https://www.hatchgrab.com/uk`, `/us`), not the root. | `app/landing/page.tsx`, `lib/structured-data.ts` |
| **S1** | Canonical and og:url = `https://www.hatchgrab.com<path>` on `/privacy`, `/terms`, `/country-terms`, `/contact`, `/signup` and `/login`, **on both hosts**. Every other og field is the host's default, unchanged. The root layout's per-host defaults moved to `lib/site-metadata.ts`, so a page changes only `url`; Next replaces a parent's whole `openGraph` when a page sets one. | `lib/site-metadata.ts` (new), `app/layout.tsx`, the three legal pages, `app/contact/page.tsx`, `app/signup/layout.tsx` + `app/login/layout.tsx` (new) |
| **S2** | `/signup` and `/login`: `noindex, follow`. No title or description change (they keep the root's). | the two new layouts |
| **S3 + N3** | `app/robots.ts` replaces `public/robots.txt` (deleted). Every rule is kept except `Crawl-delay: 10`. Each host advertises its own sitemap. | `app/robots.ts` (new) |
| **S4** | `<html lang>`: **en-GB / en-US on the country pages** (from the country row's locale) and **en-GB on the three legal documents** (written in en-GB). Every other page keeps `"en"`. The root layout can't see the URL, so `proxy.ts` sets a request header that the layout reads. A client-sent copy is always deleted first. **No page became dynamic:** every route was already dynamic, because the root layout reads `headers()` (BEFORE build: 0 static routes). | `proxy.ts`, `lib/page-lang.ts` (new), `app/layout.tsx` |
| **S5** | Sitemap `lastmod` is a real content date (details below). Added `/privacy`, `/terms`, `/country-terms` and `/contact` (HatchGrab host only, since their canonical is HatchGrab on every host). The country pages carry `xhtml:link` alternates, the same set as their `<head>` hreflang. | `app/sitemap.ts`, `lib/plans-server.ts` (`planDataUpdatedAt`), `lib/marketing-meta.ts` (`MARKETING_COPY_UPDATED`), `lib/legal.ts` (`legalUpdatedDate`) |
| **S7** | One priority image; fewer font preloads; lighter legal pages; /features unchanged. Details and sizes in §4. | `app/landing/page.tsx`, `components/StoreBadges.tsx`, `app/layout.tsx`, 4 pages' `Courier_Prime`, `lib/static-markup.ts` (new), `lib/legal-markdown-html.ts` (new), `components/legal/LegalPage.tsx`, the 3 legal pages |
| **S9** | JSON-LD is one `@graph`, built from data with nothing typed: **Organization**, **WebSite** and the **SoftwareApplication**, which carries an **Offer per public plan** in the country's currency from `plan_prices`. Contents below. | `lib/structured-data.ts` (new), `app/landing/page.tsx` |
| **N1** | `/compare` has a title, description, og and twitter per country: "Cost calculator — HatchGrab UK" / "… US". It **stays noindex, nofollow**. | `app/compare/page.tsx`, messages `compare.meta` |
| **N6** | The Village Foodie base URL is its www host, the host its sitemap lists, so og:url and the sitemap agree. | `lib/site-metadata.ts` |

**S5 dates:**
- **Country pages:** the latest of three dates:
  - the copy date, `MARKETING_COPY_UPDATED` (20 October 2026, when Stage B rebuilt the copy);
  - the plan data, the newest `updated_at` of `plans`, that country's `plan_prices` and `plan_features`;
  - the country row's `updated_at`.
- **Legal pages:** their own "Last updated" date.
- **`/contact` and the VF root:** no lastmod, since they have no content date. Omitted rather than faked.

**S9 contents:**
- **Organization:** name, url, logo (`/logos/hatchgrab-logo.png`), and `sameAs` = the App Store and Google Play links the footer already uses. The App Store link is the country's storefront: the GB link on /uk, the any-storefront link on /us.
- **WebSite:** name and url.
- **SoftwareApplication:** its existing words, plus the Offers.

**Left alone, as asked:** N2 (/hire), N4 (Accept-Language), N5 (caching), M3 (switching the US on). The root's routing (query → cookie → IP → GB) is untouched. No switched-on country page redirects; `/us` still 302s while the US is off.

---

## 2 · No visible change — the screenshot proof

**How it was taken:**
- A production build (`next build` + `next start`, port 3100) of the tree **before any change** (Stage B as left), then of the final tree.
- Headless Chrome, full page, at 1440px and 375px.
- Each page was scrolled top to bottom (so every lazy image loads), fonts awaited, animations off.
- Pixel-compared with pngjs.

**Baseline noise:**
- Two BEFORE runs of identical code differ in one place: /uk at 375px, rows 16–54. That's the mobile header's "Upload menu" button. It appears once the hero's own button scrolls out of view, and the capture scrolls down and back, so whether it has hidden again when the shot fires depends on timing.
- AFTER matches BEFORE run 2 on **all 14** screenshots. Against BEFORE run 1, only that band differs (the same 4,461 pixels).

| Page | 1440px | 375px |
|---|---|---|
| /uk | pixel-identical | pixel-identical (vs run 2; the nav-button timing band vs run 1, explained above) |
| /uk/features | pixel-identical | pixel-identical |
| /privacy | pixel-identical | pixel-identical |
| /terms | pixel-identical | pixel-identical |
| /contact | pixel-identical | pixel-identical |
| /signup | pixel-identical | pixel-identical |
| /login | pixel-identical | pixel-identical |
| **Country menu open** (header 1440, footer 1440 and 375) | pixel-identical; computed font, weight, line-height, colour, height and decoration identical (`BUTTON` → `A`) | |

**Capture flake.** One intermediate AFTER capture showed /contact at 1440 without its footer painted. A recapture of the same build was pixel-identical. The body HTML differs only by Geist Mono's generated class hash, which changes with its preload setting.

---

### ⚠️ Separate, VISIBLE copy changes you asked for during this workstream (not part of the SEO fixes)

These were made **after** the screenshot proof above, on your request (20 October 2026). They are the only visible changes in the tree, and they're also recorded in docs/pricing-pages-report.md §9.

1. **Landing trust line** (hero and final call to action): "First month 100% free, everything unlocked" became **"First 3 months completely free, everything unlocked"**. The number is the trial plan's `trial_months`, and the line is omitted if no trial plan exists.
2. **Pricing cards' fee sentences:** "Pay at Hatch and walk-up orders are always free." (Pay as you go) and "Walk-up and Pay at Hatch always free." (Pro) both became **"Walk-up orders are always free."** The plans PDF repeats these.
3. **The Pro card's bullet** "Custom event types & pricing — festival menus and prices" became **"Custom event types & pricing"** (and in the PDF).

The harnesses that pin the landing text were re-pinned to these exact wordings: `scripts/_lp-seo-fixes.cjs` gained a `copy-trust-line` item, and `scripts/pricing-pages.cjs` and `marketing-country-parity.cjs` were updated.

---

## 3 · Head diff (curl, before → after; both hosts)

Fetched with `Host: hatchgrab.localhost:3100` (HatchGrab) and `Host: localhost:3100` (Village Foodie, which is what any non-"hatchgrab" host is). Fields: status, redirect, `<html lang>`, title, description, robots, canonical, hreflang, og:url, og:title, og:description, JSON-LD.

**No change at all:**
- `hg /` (302 → /uk);
- `hg /us` and `/us/features` (302 → the UK page, US off);
- hreflang and canonical on `/uk`, `/uk/features` and `/uk/compare`;
- every title, except `/uk/compare`.

**Changed:**

| Page (host) | Field | Before | After |
|---|---|---|---|
| hg /uk | html lang | en | **en-GB** |
| hg /uk | JSON-LD | SoftwareApplication (url `https://www.hatchgrab.com/`) | @graph: Organization, WebSite, SoftwareApplication (url **/uk**; 3 Offers in GBP: 0.00 / 29.00 / 69.00) |
| hg /uk/features | html lang | en | **en-GB** |
| hg /uk/compare | html lang | en | **en-GB** |
| hg /uk/compare | title | HatchGrab | **Cost calculator — HatchGrab UK** |
| hg /uk/compare | description | The food truck management platform | **Compare what your online orders cost you now with a year on HatchGrab — an estimate in a minute.** |
| hg /uk/compare | og:title / og:description | the site defaults | the same as the title / description |
| hg /privacy, /terms, /country-terms | html lang | en | **en-GB** |
| hg /privacy, /terms, /country-terms | canonical | — | **https://www.hatchgrab.com/privacy** (/terms, /country-terms) |
| hg /privacy, /terms, /country-terms | og:url | https://www.hatchgrab.com | **its own URL** |
| hg /contact | canonical | — | **https://www.hatchgrab.com/contact** |
| hg /contact | og:url | https://www.hatchgrab.com | **https://www.hatchgrab.com/contact** |
| hg /signup, /login | robots | — | **noindex, follow** |
| hg /signup, /login | canonical | — | **https://www.hatchgrab.com/signup** (/login) |
| hg /signup, /login | og:url | https://www.hatchgrab.com | **its own URL** |
| vf / | og:url | https://villagefoodie.co.uk | **https://www.villagefoodie.co.uk** (N6) |
| vf /privacy, /terms, /country-terms | html lang | en | **en-GB** |
| vf /privacy, /terms, /country-terms | canonical | — | **https://www.hatchgrab.com/…** |
| vf /privacy, /terms, /country-terms | og:url | https://villagefoodie.co.uk | **https://www.hatchgrab.com/…** |
| vf /contact | canonical / og:url | — / https://villagefoodie.co.uk | **https://www.hatchgrab.com/contact** |
| vf /signup, /login | robots | — | **noindex, follow** |
| vf /signup, /login | canonical / og:url | — / https://villagefoodie.co.uk | **https://www.hatchgrab.com/signup** (/login) |

**robots.txt, before (both hosts identical):**
- the eight AI-crawler blocks;
- `User-agent: *` with `Disallow: /api/`, `Disallow: /trucks/` and `Crawl-delay: 10`;
- `Sitemap: https://www.hatchgrab.com/sitemap.xml`.

**robots.txt, after:** the same eight blocks and the same two disallows, **no Crawl-delay**. The Sitemap line is `https://www.hatchgrab.com/sitemap.xml` on the HatchGrab host and **`https://www.villagefoodie.co.uk/sitemap.xml` on the VF host**.

**sitemap.xml (HatchGrab), before:** `/uk` and `/uk/features`, each with lastmod = **request time**.

**sitemap.xml (HatchGrab), after:**
- `/uk` and `/uk/features` with lastmod `2026-10-20T10:21:00Z`, the newest plan-data `updated_at` (live: Stage B's migration ran today). Each carries `xhtml:link` en-GB and x-default.
- `/privacy`, `/terms` and `/country-terms` with lastmod `2026-10-19`.
- `/contact`, with no lastmod.

**sitemap.xml (VF):** the root on www. Before it had lastmod = request time; after it has none.

### US-on / US-off proof (harness; the live US is off, so this uses the fixture rows)

`scripts/seo-fixes.cjs` renders the real page modules with the US switched on and off.

**US on:**
- `/uk` and `/us` are self-canonical and carry the **same** hreflang set: en-GB → /uk, en-US → /us, x-default → /. Likewise /uk/features and /us/features.
- The switcher anchors are in the server HTML: on `/uk`, `/uk` and `/us` (header + footer); on `/uk/features`, `/uk/features` and `/us/features`.
- Offers: **GBP on /uk**, **USD on /us**, each equal to that country's `plan_prices`.

**US off:**
- `/uk` has no US link and no en-US alternate.
- `/us` is not served: it redirects, the existing behaviour.
- No USD Offer exists anywhere.

---

## 4 · Page weight (S7)

Production build, local, the HatchGrab host:

| Page | HTML before | HTML after | RSC payload before → after | Preloads (images + fonts) before → after |
|---|---|---|---|---|
| /uk | 72,617 B | 76,246 B (+5.0%) | 41,437 → 42,196 | 7 + 7 → **3 + 4** |
| /uk/features | 89,558 B | 92,228 B (+3.0%) | 49,780 → 49,299 | 4 + 7 → 2 + 4 |
| /privacy | 65,824 B | **54,352 B (−17.4%)** | 43,346 → 32,101 | 1 + 2 → 1 + 1 |
| /terms | 82,298 B | **69,035 B (−16.1%)** | 52,373 → 39,513 | 1 + 2 → 1 + 1 |

(`/country-terms` 32,594 → 29,672 B. The audit's 466 KB and 320 KB were dev-mode numbers; these are production.)

**One priority image.**
- The dashboard screenshot, the LCP, is the only `priority` image.
- The kitchen and phone shots are `loading="eager" fetchPriority="low"`: they still load at once, but React no longer emits a preload for them, since it preloads every image that is neither lazy nor low priority.
- The store badges (footer, below the fold) are `loading="lazy"`.
- /uk's image preloads are now the hero and the 2 KB nav wordmark. React adds the wordmark itself; it is above the fold, so I left it.

**Fonts.**
- 7 font preloads became 4: Geist, Archivo (normal and italic, both used in the hero) and Public Sans.
- Geist Mono (used only in operator screens) and Courier Prime (no marketing element uses it today) are `preload: false`.
- Both stay declared, so they still load wherever they're used. Nothing visible depends on them above the fold; the screenshots confirm it.

**Legal markdown, server-only.**
- Next forbids `react-dom/server` in the app. So `lib/static-markup.ts` serializes the **same** React elements that `renderLegalMarkdown` produces into one HTML string, set as innerHTML of the **same** content div. The DOM is identical, and the payload carries a string instead of an element tree.
- `scripts/seo-fixes.cjs` proves the serializer **byte-identical to react-dom/server** for all three documents, and for the plan table as a wider fixture.

**/features.**
- I tried the same static-string trick for the plan table. The JSON-escaped string made the page **larger** (89.5 → 102 KB), because React's element tree de-duplicates the repeated cells. Measured, then reverted.
- /features' payload is already only what it renders. The oversized payload the audit found was the old comparison component, which Stage B deleted.

**Why /uk and /uk/features grew a little.** The country menus' options (header + footer) are now in the HTML (M1), and /uk carries the larger JSON-LD graph (S9).

**Recommendations (not done — bigger than easy wins):**
- The country flags travel twice as data URIs in the client payload (about 4 KB per page). Serving them as cached `/flags/*.svg` files would remove that.
- `public/screenshots/customer-order.png` is a 699 KB source. Next serves it resized, but a smaller source would cut optimiser time.
- Caching the country pages (N5) would remove the per-request render, which is the largest remaining TTFB cost.

---

## 5 · M4 — the proxy matcher

**The compiled matcher.** In `.next/server/functions-config-manifest.json` it is now `^…(?!_next\/static|_next\/image|favicon.ico|…).*…$`.
- `/_next/static/chunks/a.js`, `/_next/static/css/…`, `/_next/static/media/…` and `/_next/image` **do not match**, so they skip the proxy and its `supabase.auth.getUser()`.
- `/manage/…`, `/dashboard…`, `/login`, `/admin`, `/api/…`, `/uk`, `/`, `/robots.txt`, `/sitemap.xml` and `/privacy` **do match** (asserted by the harness).

**Auth still required** (curl against the AFTER production server):
- `/manage/test-abc123def456` → **307 /login?next=…**
- `/dashboard` → **307 /login?next=%2Fdashboard**
- These are the same guards. `/admin` answers 200 as before, because its gate is the admin API, not the proxy.

**Assets still served.** `/_next/image?url=/screenshots/kitchen.png` → 200 and a missing chunk → 404, now answered without the proxy.

---

## 6 · What was executed

- **Read-only SQL (Supabase MCP):**
  - the Stage B columns exist, `trial_months` = 3, and GB is on / US is off;
  - `updated_at` exists on `plans`, `plan_prices`, `plan_features` and `country_settings`.

  No writes.
- **Production builds:**
  - before (the Stage B tree);
  - after, rebuilt four times, the last on the final tree;
  - all pass.
- **Captures:** `next start` on :3100; curl heads on both hosts, before / before-again / after; headless-Chrome screenshots of 7 pages at 2 widths; open-menu shots on the old code (Dominic's dev server, before CountryMenu was edited) and on the final build.
- **`node scripts/seo-fixes.cjs`** (new, registered): **86 passed, 0 failed.**
  - **Switcher (M1):** real anchors in the server HTML; equivalent-page hrefs; closed menu hidden by CSS; no US link when the US is off; click behaviour unchanged.
  - **Proxy (M4):** the matcher regex.
  - **JSON-LD (M5 + S9):** every block parses; Organization, WebSite, url, Offers (GBP and USD from data); none for a switched-off country; nothing typed.
  - **hreflang:** reciprocal and self-canonical with the US on; no en-US alternate with it off.
  - **Canonicals (S1, S2, N6):** canonical and og:url on 6 pages × 2 hosts, the other og fields unchanged, noindex on /signup and /login, titles unchanged, VF og:url on www.
  - **Robots (S3 + N3):** the old rules minus Crawl-delay, per-host sitemap.
  - **Sitemap (S5):** URLs, lastmod rules, xhtml alternates, VF entry.
  - **Lang (S4):** the header, and that a forged one is dropped.
  - **Weight (S7):** serializer = react-dom/server byte for byte, one priority image, lazy badges, font preloads.
  - **/compare (N1):** title and description per country; still noindex.
- **tsc:** clean.
- **Lint:** no new errors against the Stage B baseline. The one error lint reports in a changed file (`app/contact/HatchGrabContact.tsx`, an `<a href="/login">`) is pre-existing and identical in HEAD.
- **Full sweep (`node scripts/run-harnesses.cjs`, on the final code, including the copy changes):**
  - **143 of 145 harnesses pass.**
  - `plans-data-model` failed only on the new trust line (outside the region it allowed to change). It was re-pinned to that exact line and passes 150/150 on re-run.
  - `demo-rebuild-replace` fails 1 check only because its fixture date is today. It passes 36/36 with the clock pinned to 2026-10-19, unchanged since Stage A2.
  - `seo-fixes` 86/86, `pricing-pages` 124/124.
- **Re-pins this workstream (marked `⚠️ RE-PINNED (seo-fixes, 20 October 2026)`):**
  - **Language-phase harnesses** (`language-phase-0`, `-1d`, `-1d2`, `-1e`, `-1e-tidy`):
    - A new shared module, `scripts/_lp-seo-fixes.cjs`, holds one exact transform per change: the country menu, lazy badges, JSON-LD graph, /compare metadata, canonicals, sitemap, and the copy trust line. Everything else stays byte-identical.
  - **Plans and pricing:** `plans-data-model` (a `seoFixes()` step in §8) and `pricing-pages` (§12 lists the landing JSON-LD and /compare metadata as named changes).
  - **Country and legal:** `marketing-country-parity` (lazy badges, the closed menu, the trust line), `us-readiness` (+ `_us-readiness-us.cjs`), `us-legal-draft` and `legal-follow-ups` (the legal pages' metadata is now `generateMetadata()`).
  - **No product bug was found** by any re-pin.
- **Final `next build` and tsc on the final tree:** pass.

---

## 7 · Decisions and flags (mine — tell me to change any)

1. **S9 Offers appear whenever the country landing renders.**
   - The brief's rule is "only when the page shows real prices". The landing's pricing cards never mask: Stage B kept marketing prices unmasked, and `NEXT_PUBLIC_PRICING_PUBLISHED` does not mask them. A switched-off country's address redirects instead of rendering.
   - So today the Offers exactly match what the page shows.
   - If you want Offers tied to the published-pricing flag too, it's a one-line change (`pricesShown`). Tell me.
2. **S1 on the VF host follows the brief literally.** `/contact` on villagefoodie.co.uk is a **different, VF-branded page** (a VF contact form), but its canonical now names the HatchGrab `/contact`. Search engines will treat the VF contact page as a duplicate and not index it. Say if you'd rather VF `/contact` had no canonical (or a VF one).
3. **og:url = the canonical, on both hosts.** The legal, contact, signup and login pages served on the VF host keep VF's og title and image (the host's defaults) with the HatchGrab og:url. "Its own URL" read as its canonical URL.
4. **M1 on pages with no country address** (/privacy, /terms, /contact…): each option links to that country's landing (`/uk`, `/us`). The click still keeps you on the page and re-renders it in the chosen country, as before.
5. **N1 wording.**
   - Title: "Cost calculator — HatchGrab {country}", one message with the country's short name as a parameter, so en-US needs no override text and still reads "… HatchGrab US".
   - Description: "Compare what your online orders cost you now with a year on HatchGrab — an estimate in a minute." Mine; reword freely.
6. **S2:** `noindex, follow`, so links from those pages are still followed.
7. **S4 scope:** country pages and the three legal documents. Contact and the operator pages keep `"en"`. The contact page can switch language by query, but the proxy doesn't resolve that; the operator pages localise client-side.
8. **N6 side effect:** the VF share image URL now resolves on www too (it was relative to the apex). The same file, served by the same deployment.
9. **Harness kit:** `scripts/_render-kit.cjs`'s `next/navigation` stub now lets a harness set the path (`globalThis.__kitPathname`, default `/` as before). Three screenshot harnesses already pass their own navigation stub, which the kit has always ignored. I did not change that precedence.
10. **`MARKETING_COPY_UPDATED`** in `lib/marketing-meta.ts` is a date to move when the landing or /features copy changes, the same discipline as the legal `*_UPDATED` dates.

---

## 8 · Files

**New:**
- `lib/structured-data.ts`
- `lib/site-metadata.ts`
- `lib/page-lang.ts`
- `lib/static-markup.ts`
- `lib/legal-markdown-html.ts`
- `app/robots.ts`
- `app/signup/layout.tsx`, `app/login/layout.tsx`
- `scripts/seo-fixes.cjs`

**Deleted:** `public/robots.txt`.

**Modified (product):**
- `proxy.ts`
- `app/layout.tsx`
- `app/landing/page.tsx`, `app/landing/landing.css`
- `app/sitemap.ts`
- `app/compare/page.tsx`
- `app/features/page.tsx` (Courier preload only)
- `app/contact/page.tsx`, `app/contact/HatchGrabContact.tsx`
- `app/(legal)/privacy|terms|country-terms/page.tsx`
- `components/landing/CountryMenu.tsx`
- `components/StoreBadges.tsx`
- `components/legal/LegalPage.tsx`
- `lib/plans-server.ts`, `lib/marketing-meta.ts`, `lib/legal.ts`
- `messages/en-GB.json` (`compare.meta`) + generated files

**Modified (harnesses):**
- `scripts/_render-kit.cjs`
- `scripts/harnesses.json` (`seo-fixes.cjs`, `_lp-seo-fixes.cjs` registered)
- `scripts/_lp-seo-fixes.cjs` (new)
- the re-pins listed in §6
