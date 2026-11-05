# cwv-1: public pages lighter on a phone, real-visitor page speed in PostHog, Czech and Greek at 360px

*5 November 2026. Resumed from a closed session. Nothing is deployed and nothing is written to the database.*

## Status: done, committed on `main`

- **Committed on `main`:** code and screenshots in `987a3cb9`; this report in the commit after it. Not pushed, not deployed. No database write.
- **Your decisions:**
  - **1A, then B** (your answer after my question). The bands wrap; the Greek hero button may wrap to two lines at 400px and below, on /gr and /cy only; no heading rule; nothing else changes (§3).
  - **2A:** the Archivo italic preload is removed (§2), and PostHog web vitals are captured for public pages only (§4). PostHog and the Supabase client load exactly as today on every route.

| Item | Outcome |
|---|---|
| Live UK baseline | §1. LCP 3.1–4.9 s; CLS 0; TBT ≤ 20 ms; server response ~10 ms |
| Italic preload | 3 fonts preloaded instead of 4. Pages without italic text download 38.5 KB less. No visible change |
| 1A (B) | /cz, /gr and /cy fit the screen at 320, 360, 375 and 390px. Every other landing is pixel-identical at 360 and 1280 |
| Web vitals | LCP, INP and CLS on public pages only. Also fixed: a measurement taken on a non-public page, such as a dashboard address, can no longer travel inside a public page's event (§4) |
| Lab LCP | Barely moved by cwv-1. Why, and what cwv-2 would buy: §2, §6 |
| Checks | cwv-1 27/0 · typecheck clean · sweep 196/197, with the one flaky harness passing alone · harnesses that read landing.css re-run on the final CSS (§7) |

**Two things to know:**
- **Another session is working in this repo.** While I worked, partners-1:
  - wrote `supabase/migrations/20261074_partners_1.sql` and committed it on `main` as `b8475e5a`, so cwv-1 sits on top of it;
  - is still editing `lib/outreach-mail-poll-rules.ts` and `lib/partners.ts`.
  - I touched none of it, and my commits name only cwv-1's paths.
- **On /gr and /cy at about 390px, the button's arrow "→" now wraps onto a second line by itself** ([picture](cwv-1/widths/gr-hero-390-after.png)). Today, at that width, the button runs to 4px from the right edge. Keeping the arrow with the last word needs a non-breaking space in the Greek text, and that is outside "nothing else changes". Say if you want it.

## 1 · Live UK baseline (Lighthouse mobile, median of 3)

How it was measured:
- **Source:** https://www.hatchgrab.com, which runs `b5a43927`, the same as `main`. Measured 5 Nov in the evening, before this work's build.
- **Tool:** Lighthouse 12.8.2, default mobile settings: a Moto G Power, simulated slow 4G, CPU slowed 4×.
- **Runs:** each page loaded cold, three times. The runs were interleaved, so one slow minute does not land on one page.

| Page | LCP | CLS | TBT | TTFB (Lighthouse metric, simulated 4G) | Server response (observed) | Score | LCP element |
|---|---|---|---|---|---|---|---|
| /uk | **4.39 s** (4.39 / 4.90 / 4.37) | 0.000 | 7 ms | 617 ms | 10 ms | 84 | the kitchen-screen picture |
| /uk/features | **3.17 s** (3.02 / 3.17 / 4.90) | 0.000 | 4 ms | 618 ms | 10 ms | 93 | the intro paragraph |
| /uk/faq | **4.22 s** (4.22 / 4.22 / 2.87) | 0.000 | 18 ms | 618 ms | 10 ms | 85 | the first question |
| /uk/compare | **4.88 s** (4.88 / 4.90 / 4.22) | 0.000 | 20 ms | 618 ms | 8 ms | 82 | the intro paragraph |
| /about | **3.23 s** (2.79 / 3.23 / 3.32) | 0.000 | 8 ms | 616 ms | 9 ms | 92 | the first paragraph |
| /contact | **3.09 s** (3.10 / 2.94 / 3.39) | 0.000 | 3 ms | 615 ms | 8 ms | 93 | the intro paragraph |
| /privacy | **3.17 s** (3.17 / 3.17 / 3.17) | 0.000 | 1 ms | 618 ms | 10 ms | 93 | the first paragraph |
| /terms | **4.07 s** (4.22 / 3.32 / 4.07) | 0.000 | 11 ms | 616 ms | 11 ms | 86 | the first paragraph |

- **FCP is 1.67 s on every page.**
- **The two TTFB columns:**
  - *TTFB* is Lighthouse's own metric. It includes the simulated 4G connection set-up (DNS, TCP and TLS at 150 ms round trips), so it is about 0.6 s whatever the server does.
  - *Server response* is what the server actually took: about 10 ms.
  - So the server is not the problem.
- **CLS is zero everywhere** (one run of /uk/faq: 0.001). **TBT is negligible everywhere.**
- **The only metric that misses is LCP.** Google's "good" line is 2.5 s, and the pages read 3.1 to 4.9 s.
- An earlier run, at 18:33 the same day, gave the same picture (for example /uk 4.29 s, /uk/faq 3.17 s).

## 2 · What changed, and why lab LCP still misses

### 2.1 Archivo's italic is no longer preloaded (shipped as approved, 2A)

**The change** (`components/landing/MarketingFrame.tsx`):
- Archivo is now two `next/font` instances.
- **The upright instance** is unchanged: preloaded, carrying `--font-archivo`.
- **The italic instance** is declared with `preload: false`, and with no variable and no fallback face of its own.
- Both declare the family `Archivo`, so italic text still draws Archivo Italic. The built CSS shows `@font-face{font-family:Archivo;font-style:italic;…}`.

**The effect:**
- The page header now preloads **3 fonts instead of 4**. Live sends 4; this build sends 3, and the one dropped is the 38.5 KB italic.
- **Pages with no italic text no longer download it at all.** In the lab, /uk/faq and /contact fetch 3 fonts, 89.6 KB, where before they fetched 4, 128.1 KB.
- **/uk still downloads the italic,** because its testimonial uses it. It now arrives later, at normal priority.

**Visible change: none.**
- All 44 landings at 1280 are pixel-identical, and so are 41 of the 44 at 360. The other 3 are 1A (§3).
- /uk, /uk/faq and /contact at 390 and 1280 are pixel-identical. /uk's testimonial is italic, so this proves the italic still draws the same.

### 2.2 Lab LCP, before and after, on this machine

Same Lighthouse settings, run against a local production build:

| Page | HEAD (local, 18:58) | This work (local) | Without the script-font CSS | Also without PostHog and Supabase at load (cwv-2) |
|---|---|---|---|---|
| /uk | 5.06 s (FCP 1.80) | 4.99 s (FCP 1.96) | 4.61 s (FCP 1.66) | **3.54 s** (FCP 1.66) |
| /uk/faq | 4.21 s (FCP 1.81) | 4.74 s (FCP 1.80) | 4.21 s (FCP 1.50) | **3.75 s** (FCP 1.50) |
| /contact | 4.97 s (FCP 1.80) | 4.73 s (FCP 1.81) | 4.21 s (FCP 1.51) | **3.32 s** (FCP 1.51) |
| Bytes (/uk/faq) | JS 377 KB, CSS 112 KB, 4 fonts 128 KB | JS 333 KB, CSS 112 KB, **3 fonts 90 KB** | CSS **34 KB** | JS **207 KB** |

How these were measured:
- Each cell is the median of 3 cold runs. The runs:
  - this work: /uk 4.99 / 5.19 / 4.74 s; /uk/faq 4.74 / 4.74 / 4.74 s; /contact 3.91 / 4.74 / 4.74 s;
  - last column: /uk 3.79 / 3.54 / 3.54 s; /uk/faq 3.75 / 3.17 / 3.75 s; /contact 3.31 / 3.32 / 3.90 s.
- The local numbers run higher than live: live sits behind Vercel's CDN with brotli, and local is `next start`.
- **The HEAD column** is the investigation session's run of the same build settings at HEAD. Its JS is higher only because PostHog's remote scripts were not blocked then.
- **In all of my runs, every PostHog send was blocked,** so nothing reached PostHog.
- **The last two columns are what-ifs,** made by having Lighthouse block files:
  - first, the three script-font CSS files;
  - then also the PostHog chunk and the Supabase chunk.
  - The LCP element was the same in every run of every column, so blocking did not change what was painted.
- **What cwv-1 itself moves:** within run-to-run noise on lab LCP. That was expected: one 38.5 KB font was a small share of the ~650 KB a page loads. Its real gain is the 38.5 KB that pages without italic text no longer download at all.

**Why it still misses:**
1. **Every page carries every language's fonts in its CSS.**
   - About **76 KB of the ~110 KB** of CSS in every page's head is `@font-face` rules for Japanese, Hong Kong Chinese, Thai and Arabic. They come from `lib/script-fonts.ts`, through the root layout.
   - That is ~114 faces for Noto Sans HK and ~130 for Noto Sans JP, on an English page that uses none of them.
   - The files themselves are never fetched on a Latin page. The rules are, and CSS must arrive before anything paints. This is why FCP is 1.67 s everywhere.
2. **About a third of the JavaScript is not for the page.**
   - Every page loads about 375 KB of JavaScript (gzipped).
   - PostHog is about 65 KB of that. The Supabase sign-in client (`SessionAlertBanner`, in the root layout) is about 58 KB, plus an 18 KB chunk the two share.
   - On simulated slow 4G (~1.6 Mbit/s), every byte requested before the largest paint delays it, and the JavaScript is requested first.
3. **Fonts.** Three preloaded fonts (~90 KB) still compete for the same connection.
4. **Real visitors are almost certainly faster than the lab.** Observed without throttling, /uk's LCP breaks down as follows: first byte 9 ms, image request 100 ms after that, image download 136 ms. The 4.4 s is Lighthouse's estimate of a slow phone on slow 4G.
   - The PostHog web-vitals capture (§4) and the field-data query (§5) are how to find out what real visitors get.

None of the three is removable without changing what the root layout gives every route, and 2A rules that out for cwv-1. That is cwv-2 (§6).

## 3 · 1A, as B: Czech, Greek and Cypriot on small phones

### What shipped

`app/landing/landing.css` gets one block, appended. Everything before it is byte-identical:

```css
@media (max-width: 400px) {
  :root:lang(el) .hg-landing .hero-cta-row .btn-lg { white-space: normal; }
  :root:is(:lang(cs), :lang(el)) .hg-landing .cheap-band { white-space: normal; }
}
```

- **`:lang(el)`** matches only /gr (`el-GR`) and /cy (`el-CY`). **`:lang(cs)`** matches only /cz.
- **The first rule** relaxes, for Greek only, the one-line rule on the hero button: `.hero-cta-row .btn-lg { … white-space: nowrap; }`. The page's other big button is outside `.hero-cta-row`, so it is untouched.
- **The heading rule I first built** (hyphenation) is gone. The heading never needed it. The hero was held 386px wide by the button.

### Why B, not 1A as first approved

- The investigation's preview of 1A was a screenshot of the heading element itself. That captures the heading's full 366px box, so the heading looked whole.
- On a 360px screen, that rule clipped the heading's last ~11px: "παραγγε-" lost its hyphen, "φτιάχτηκε" its last letter. It is kept as the [picture of what 1A would have done](cwv-1/gr-hero-360-1A-as-decided.png).
- The cause was the button, which never wraps. I asked; you chose B.

### Baseline and the 44 × 2 comparison

- **The baseline is `main`'s HEAD (`b5a43927`),** taken by the previous session.
  - its working-tree backup is byte-identical to the tree I resumed;
  - its build log is HEAD's;
  - its shots show HEAD's sideways scroll (/cz 369px, /gr and /cy 372px).
- **I took every "after" shot on a fresh build of the final CSS,** with the same tool: Chromium, real fonts, motion off, full page.
- I stopped a leftover server the previous session had left on port 3100.
- **There are 44 country landings, not 45.** `COUNTRY_PATH_SEGMENTS` has 44 entries. The 45 came from a comment the previous session wrote, which I corrected. All 44 were compared.

**Result: 85 of 88 are pixel-identical.** The 3 that differ are /cz, /gr and /cy at 360, and only there. At 1280 all three are identical.

| Page at 360 | Before (HEAD) | After |
|---|---|---|
| /cz | 369px wide (scrolls sideways), 6,938px tall | 360px, 6,961px tall (the first band takes two lines) |
| /gr | 372px wide (scrolls sideways), 7,600px tall | 360px, 7,653px tall (the band and the hero button take two lines) |
| /cy | 372px wide (scrolls sideways), 7,600px tall | 360px, 7,653px tall (the same) |

### 320, 360, 375 and 390px

- **"Before"** is the built page with HEAD's two `nowrap` rules put back in the browser. Those are the only properties the block changes on these pages. It reproduces HEAD's measured 369px and 372px at 360.
- **Each picture is clipped to the screen,** not the element, so anything cut off shows as cut off.

| Page | Width | Before: page width, and what ran past the screen edge | After |
|---|---|---|---|
| /cz | 320 | 369px; the bands | fits |
| /cz | 360 | 369px; the first band | fits |
| /cz | 375 · 390 | fits on screen, but the first band runs into the card's right border at 390 | fits; the band wraps inside the card |
| /gr, /cy | 320 | 371px; heading, button, note and bands | fits, centred |
| /gr, /cy | 360 | 372px; heading, button, note and the band | fits, centred |
| /gr, /cy | 375 | 375px, but the hero ran to 386px (cut off) | fits, centred |
| /gr, /cy | 390 | fits, but the button ran to 4px from the right edge (off-centre) | centred; the arrow wraps onto its own line (Status) |

- **The /cz hero is pixel-identical** at all four widths.
- **The pictures** are in `docs/cwv-1/widths/`, named `<page>-hero-<width>-<before|after>.png` and `<page>-bands-<width>-<before|after>.png`. For example:
  - [/gr hero at 360, before](cwv-1/widths/gr-hero-360-before.png) / [after](cwv-1/widths/gr-hero-360-after.png)
  - [/gr hero at 320, after](cwv-1/widths/gr-hero-320-after.png)
  - [/cz bands at 390, before](cwv-1/widths/cz-bands-390-before.png) / [after](cwv-1/widths/cz-bands-390-after.png)

## 4 · PostHog web vitals (shipped as approved, 2A)

### What it does

- **Which visits:** only a visit that **starts** on a public HatchGrab page. That is a country landing, /features, /faq, /compare, a comparison page, a legal document, /about or /contact (`lib/public-page.ts`).
- **What it turns on:** `capture_performance: { web_vitals: true, web_vitals_allowed_metrics: ['LCP','INP','CLS'] }`.
- **What each event carries:** the page path (`$pathname`, `$current_url`), like every PostHog event.
- **Every other entry:** this adds nothing. `posthog.init` gets exactly the options it gets today.
  - `scripts/cwv-1.cjs` checks this by stripping cwv-1's lines out of `providers.tsx` and comparing the rest, byte for byte, with HEAD's.
- **No deferral:** PostHog and the Supabase client load exactly as today on every route.
- **Cost on the page:** posthog-js fetches a 4 KB `web-vitals.js` from `eu-assets.i.posthog.com` after it starts, on public entries only.

### Other paths' `$web_vitals` dropped before sending

- Any `$web_vitals` event whose path is not a public page is dropped in `before_send`, so it is never queued or sent.
- **A fix I added on resuming.** The inherited filter checked only the event's own path. That is where the visitor is **when posthog-js sends** the buffer: 5 s after the first measurement, or when a measurement from another address arrives.
  - Each measurement inside the event carries the address it was **measured** on.
  - So a visitor could enter on /uk, sign in, reach /dashboard/<token> in the same tab, and come back within 5 s.
  - The dashboard's measurement, with a credential in its address, would then have been sent under /uk.
- **Now every address in the event must be a public page,** or the whole event is dropped (`isPublicWebVitals` in `lib/public-page.ts`, 8 cases in `scripts/cwv-1.cjs`).
  - The credential-path guard runs first, exactly as before.

### Verified in a browser on the local build

- Every PostHog request was answered on the machine, so nothing reached PostHog.
- posthog-js does not send from headless Chrome (it treats it as a bot), so the test browser used an ordinary Android Chrome user agent.

| Visit | web-vitals.js loaded | What PostHog would receive |
|---|---|---|
| Starts on /uk, one tap, tab hidden | yes | `$pageview` /uk, `$web_vitals` /uk (LCP), `$pageleave`, `$web_vitals` /uk (INP + CLS) |
| Starts on /signup | **no** | `$pageview` /signup, `$pageleave`: as today, no `$web_vitals` |
| Starts on /uk, moves client-side to /signup, taps, tab hidden | yes | `$pageview` /uk, `$pageleave`. The /signup measurements are **dropped** |

### Volume against PostHog's free tier

- **Per page load: 0 to 2 `$web_vitals` events.**
  - One carries LCP, sent 5 s after the first tap or scroll.
  - One carries INP and CLS, sent when the tab is hidden.
  - posthog-js has no unload flush for these. A visitor who closes the tab within 5 s of the last measurement sends nothing, so quick bounces are under-counted (the sample leans towards visitors who stayed).
  - Moving between public pages client-side adds none. Web vitals are measured once per document.
- **The free tier** is **1,000,000 analytics events a month** ([PostHog pricing](https://posthog.com/pricing)). Beyond that it is $0.00005 an event on pay-as-you-go. On the free plan, events over the limit are dropped, including the ones you use.
- **Upper bound:** $web_vitals ≤ 2 × public page loads.
  - 10,000 public page loads a month add at most 20,000 events (2% of the free tier).
  - 100,000 add at most 200,000 (20%).
  - It takes 500,000 public page loads a month for web vitals alone to fill the tier.
- I cannot read the project's numbers; the key is not mine to open. To see where you stand, run this in PostHog's SQL editor:

```sql
-- public page loads, and all events, in the last 30 days
SELECT
  countIf(event = '$pageview'
    AND properties.$host LIKE '%hatchgrab%'
    AND match(properties.$pathname, '^/(about|contact|privacy|terms|country-terms)$|^/[a-z]{2}(/(features|compare|faq|privacy|terms|country-terms))?$|^/[a-z]{2}/[a-z0-9-]+/[a-z0-9-]+$')) AS public_pageviews,
  count() AS all_events
FROM events
WHERE timestamp > now() - INTERVAL 30 DAY
```

- **Expected added volume** is at most 2 × `public_pageviews`. Compare `all_events` plus that figure with 1,000,000.
- Once it is live, the real count is:

```sql
SELECT count() FROM events WHERE event = '$web_vitals' AND timestamp > now() - INTERVAL 30 DAY
```

### Privacy

- Nothing new is stored in the browser; PostHog stays cookieless.
- No new identifier is sent. The measurements are timings and the page address, and $pageview already sends the address.
- The policy describes PostHog as "pages viewed and clicks, with basic browser and device data". I read page-speed timings as inside that. If you want them named, it is a one-line policy edit in 22 languages; I did not touch the legal text.

## 5 · Field data from PageSpeed Insights (free API key)

The earlier keyless call was refused (`429`, a shared quota of 0). To get a key:
1. In https://console.cloud.google.com, create or pick a project.
2. Enable the "PageSpeed Insights API".
3. Under Credentials, create an API key.

Then run:

```bash
KEY=your_key_here
for P in uk uk/faq uk/features contact; do
  echo "== /$P"
  curl -s "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Fwww.hatchgrab.com%2F$P&strategy=mobile&category=performance&key=$KEY" \
  | jq -r '.loadingExperience as $p | .originLoadingExperience as $o
      | "page data: \(if ($p.metrics // null) == null or ($p.origin_fallback // false) then "none (too few Chrome visitors)" else "yes" end)",
        (["LARGEST_CONTENTFUL_PAINT_MS","INTERACTION_TO_NEXT_PAINT","CUMULATIVE_LAYOUT_SHIFT_SCORE","EXPERIMENTAL_TIME_TO_FIRST_BYTE"][]
         | . as $m | "  \($m): page p75 \($p.metrics[$m].percentile // "-") \($p.metrics[$m].category // "")  ·  whole site p75 \($o.metrics[$m].percentile // "-") \($o.metrics[$m].category // "")")'
done
```

- The figures are the 75th percentile over the last 28 days of real Chrome visitors.
- LCP and TTFB are in ms. **CLS is ×100**, so 5 means 0.05.
- A low-traffic site usually has **no page-level data**, and often no site-level data either. That is the gap the PostHog capture (§4) fills.

## 6 · cwv-2 (scoping only): public pages under their own root layout

**The idea:**
- Give the public pages a root layout of their own, through a route group such as `app/(public)/layout.tsx`, with its own `<html>` and `<body>`.
- The app's root layout (`app/layout.tsx`) stays exactly as it is for every other route.
- The public layout would leave out three things, each loaded today on every page:
  1. **PostHog at load.** Start it after the page is idle or on the first interaction. Web vitals still work: the web-vitals library reads the browser's buffered LCP and CLS entries.
  2. **The Supabase sign-in client** (`SessionAlertBanner`). It shows session alerts to a signed-in operator, and no public page uses Supabase (checked: none of their files import it).
  3. **The script-font CSS.** Load only the one script a page's language needs: Greek and Bulgarian get Noto Sans, Japanese gets Noto Sans JP, and so on. Latin pages get none.

**Expected lab LCP:**
- Lab LCP would sit around **3.3–3.8 s** on this machine, against **4.7–5.0 s** today. That is roughly 1.2 s better: about 0.4–0.5 s from the CSS and 0.5–0.9 s from the JavaScript. That comes from §2.2's last column, measured by blocking those three in Lighthouse on the local build: an estimate, not the finished thing.
- FCP improves by about 0.3 s (1.8 → 1.5 s), all of it from the CSS. Live runs about 0.5 s faster than local, so the live lab LCP would land around **2.9–3.4 s.**
- The rest of the gap to 2.5 s is React and Next themselves, plus the fonts. Reaching "good" in the lab would also need the hero picture and fonts trimmed. Real visitors are likely already near or under 2.5 s (§2.2 point 4).

**What it touches:**
- **The public routes move into the group.** They are:
  - `app/[country]/…`: the landing, features, faq, compare, the comparison page, and the country legal documents;
  - `app/about` and `app/contact`;
  - `app/(legal)`;
  - and their `not-found` handling.
  - URLs do not change.
- **`proxy.ts`** keeps setting the page-language header. The new layout must read it as the root one does: `lang`, `dir`, `data-brand`, and the script-font class.
- **`app/providers.tsx`** splits in two: today's provider, unchanged, for the app; and a lazy one for the public layout. The credential and embed guards stay in both.
- **Metadata** (`generateMetadata`, `siteMetaFor`) is shared, unchanged.
- **Harnesses that pin file paths under `app/[country]`, `app/about`, `app/contact` or `app/(legal)`** need re-pinning. Expect a long list: seo, faq, contact, site-chrome, perf-1, the legal ones.

**Risk to other routes:**
- **Low for the routes themselves.** The root layout and its provider stay byte-identical for them, and that can be pinned the way `scripts/cwv-1.cjs` pins `providers.tsx` today.
- **The real risk is the journey between the two layouts.**
  - In Next, moving between two different root layouts is a **full page load**, not a client-side navigation.
  - So /uk → /signup, /uk → /login, and the demo's move from /uk into /try become hard reloads: a little slower, and the app's JavaScript loads at that point.
  - PostHog is cookieless (`persistence: 'memory'`), so a full load starts a **new anonymous visitor**. The landing → signup funnel would then show as two visitors, unless the funnel is tracked by something that survives a page load (a `?ref=` on the signup link, or an event on the landing with its own id).
  - **This is the decision cwv-2 needs from you.**
- **Medium for the public pages.**
  - Header and footer behaviour must be re-proven in all 44 countries. site-chrome-1's shared chrome comes over unchanged, but its layout parent changes.
  - The not-found pages for country addresses must be re-proven too.
  - Done with the same 44 × 2 screenshot comparison used here.

## 7 · Checks run

| Check | Result |
|---|---|
| Production build (`npm run build`, this work's tree) | passed, 414 pages. Two edits came after it, both comment-only: the providers.tsx comment and the landing.css count. Neither changes built output |
| `npx tsc --noEmit` | passed |
| ESLint on the changed files | new files clean; `scripts/seo-fixes.cjs` keeps its 7 `require()` errors, the same as at HEAD |
| `node scripts/cwv-1.cjs` | **27 passed, 0 failed** on the final commit |
| 1A comparison on the final CSS, 44 landings × 360 / 1280 | 85 identical; /cz, /gr and /cy at 360 differ as described (§3) |
| /cz, /gr, /cy at 320 / 360 / 375 / 390 | everything fits on screen after; before, 8 of the 12 page/width pairs scrolled sideways or were cut off, and the other 4 had a band or button crowding an edge (§3) |
| Harnesses that read landing.css, re-run on the final CSS | about-page, compare-de-1-screens, country-picker-1, europe-languages-2-fonts, native-prices, pricing-pages, seo-fixes, site-chrome-1 and world-countries-1 all pass. The screen harnesses rewrite their own committed screenshots in `docs/compare-de-1/` and `docs/europe-languages-2/`; I restored those, and they are not part of this work |
| /uk, /uk/faq, /contact at 390 / 1280 | 6 of 6 pixel-identical, on both builds |
| PostHog web vitals in a browser | passed on both builds (§4) |
| Full harness sweep (`node scripts/run-harnesses.cjs`, 197 listed; run on the first build, which differs from the final one only in the 1A block) | **196 passed, 1 failed.** The failure is `event-types-render`. It stopped partway with nothing printed, while I was running other harnesses alongside. Run alone, it passes (rc 0, 1,984 checks). perf-1 recorded the same harness flaking under load. The sweep's `europe-languages-2-fonts` also rewrote three of its own committed screenshots in `docs/europe-languages-2/`. Those were last committed on 1 November, so the diff includes later work. I restored them to the committed versions; they are not part of this work |

## 8 · `scripts/cwv-1.cjs`

Registered in `scripts/harnesses.json`. It needs no network and no database. It checks:
1. **Fonts:** the upright Archivo exactly as before; the italic declared with `preload: false`; no other Archivo anywhere; Public Sans, Courier Prime and the chrome class unchanged; the italic still used in `landing.css`.
2. **Public pages:** the address shape matches all 401 public addresses (44 countries × 7 pages, × 2 comparison pages, + 5 English pages) and none of 35 app routes. Each segment is a real country, and no app top-level route is two letters.
3. **PostHog:**
   - web vitals only for a public HatchGrab entry, and exactly LCP, INP and CLS;
   - the credential guard first;
   - `isPublicWebVitals` with 8 cases, including the dashboard-token case;
   - **the rest of `providers.tsx` byte-identical to HEAD;**
   - the root layout and `proxy.ts` untouched.
4. **The Czech and Greek CSS block (B):** appended, ≤400px, language-scoped; the bands and the Greek hero button may wrap; no heading rule; the one-line button rule it relaxes still in place; everything before it byte-identical.
5. **Scope:** the app files changed are exactly `landing.css`, `providers.tsx`, `MarketingFrame.tsx` and `lib/public-page.ts`.

## 9 · Files (committed in `987a3cb9`)

- `app/landing/landing.css`: the 1A block, as B.
- `app/providers.tsx`: web vitals for public entries; `$web_vitals` dropped unless every address in it is public.
- `components/landing/MarketingFrame.tsx`: the Archivo italic not preloaded.
- `lib/public-page.ts` (new): `isPublicPagePath` and `isPublicWebVitals`.
- Not in cwv-1's commits: partners-1's files (Status).
- `scripts/cwv-1.cjs` (new) and `scripts/harnesses.json` (registered).
- `scripts/seo-fixes.cjs`: re-pinned for the two Archivo instances.
- `scripts/site-chrome-1.cjs`: re-pinned. Its "desktop unchanged" check compares all of landing.css with its own starting point. It now sets aside cwv-1's appended block, and only that block. Before: 32/1. After: 33/0.
- `docs/cwv-1/`: the screenshots. /uk, /uk/faq and /contact before and after at 390 and 1280; `widths/`, with /cz, /gr and /cy at 320, 360, 375 and 390; and the picture of what 1A would have done.
- `docs/cwv-1-report.md`: this report (the commit after).
