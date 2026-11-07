# cwv-2: the public HatchGrab pages on their own root layout, built ahead and served from the CDN

*6–7 November 2026. Your answers to the stop report: Q1 = B, Q2 = A, Q3 = A.*

- **Committed on `main`, by explicit path:**
  - `98445b9b`: the move alone. Reviewable on its own; nothing a visitor sees changes.
  - `b4ff9145`: everything else.
  - This report is in the commit after them.
- **Not pushed and not deployed.** No database write, no migration, no `outreach_templates` row touched, no `.env*` file opened in any form. Every build ran in a worktree with no `.env` file, against the stand-in database (`scripts/_perf-1-standin.cjs`).

| # | Item | Outcome |
|---|---|---|
| 1 | Live "before" | §1. /uk lab LCP **5.45 s**; every page `x-vercel-cache: MISS`, `private, no-store`; cold first byte /uk 0.53–1.34 s |
| 2 | The move | §2. 85 files moved (78 byte-identical renames, 7 with one import line); two root layouts; 404s as today (`experimental.globalNotFound`) |
| 3 | The public layout | §3. Only what a public page needs; /uk CSS **107.5 → 29.4 KB gz**, initial JS **366 → 206 KB gz**; no Geist, Supabase, session banner or PostHog in the first load |
| 4 | Built ahead | §4. `/<country>`, `/<country>/features`, `/<country>/faq` ● in the build. Revalidation proofs **15/15**. /compare and the comparison pages stay per request (flag 3) |
| 5 | The remaining lab gap | §5. The demo pop-up's code is off the first screen. The hero pictures were already right (flag 2). 2 fonts preloaded instead of 3. Greek arrow done. `inlineCss` measured, left off |
| 6 | Checks and re-pins | §6. Sweep **196 of 200**; the 4 failures are not this work's (flag 10). Typecheck clean. 190 harness files re-pinned (list in §6) |
| 7 | Proof | §7. App routes: **76 of 76** responses identical to HEAD. Public pages: **307 of 310** screenshots pixel-identical; the 3 that differ are the Greek arrow (2) and a test leftover (1, re-shot identical). PostHog and the demo funnel proven |
| 8 | After figures | §8. Local lab LCP: /uk **5.19 → 3.61 s**, /uk/features 4.67 → 3.23 s, /uk/faq 4.66 → 3.46 s, /about 5.07 → 3.39 s. **Not yet 2.5 s**; what is left is in §8 |
| 9 | Manual | **V16.13**: invariants 35.ap-1 and 35.ap-2, a §48 subsection and a changelog line |

## Flags (read these first)

1. **The pre-check, as at the stop.** Live is `60db835b`. `main` was 5 commits ahead of it: compare-recheck-1's report and two migration files, no app file. I treated the live build as `main`'s HEAD for that reason.
2. **The /uk LCP picture is the dashboard shot, not the kitchen screen.**
   - Live Lighthouse names it: "Taking an order on HatchGrab: the menu on the left…" (`shot-dash`, `dashboard-v4.png`).
   - Your addendum's intent was: keep the LCP picture high-priority and the other two low. It already is: `priority` on the dashboard; the kitchen and phone shots `loading="eager" fetchPriority="low"` (seo-fixes S7).
   - **None of the three is below the first screen on a phone.** Their tops are at 367–588 px at 360, 390 and 430 px wide, in English, Japanese and Greek. So none can be lazy without delaying a visible picture.
   - **Formats:** next/image already serves WebP. AVIF would be a global switch that also re-encodes the app's images.
   - **Nothing changed here.**
3. **/compare and the comparison pages are NOT built ahead.** They are on the lean layout, rendered per request as today.
   - The comparison pages: an `admin`-status page is a 404 for everyone but an admin, an admin sees a banner, and `?view=public` switches views.
   - /compare reads `?free=` into the calculator's first paint.
   - Their competitor data is written by the nightly checker on GitHub, which tells no tag.
   - Building them ahead would change what an admin or a `?free=` link sees, or keep checker updates for up to 5 minutes. Say if you want that solved as follow-up work.
4. **A built-ahead page during a database outage** (the one behavioural difference in these pages):
   - **Today, per request:** a failed shared read degrades. For example, the FAQ answers 404 "no FAQ" while its translations can't be read.
   - **Built ahead, that degraded page would be stored for up to 5 minutes.** So on these three pages a failed read now throws instead (`isBuiltAheadRender`).
   - **Result:** during an outage the last good page keeps being served. If a revalidation lands mid-outage, that request fails (500) instead of showing the degraded 404. The moment the database answers, the next request is right.
   - perf-1-local §5 is re-pinned to prove exactly this (15/15).
5. **"Within 5 minutes" means what perf-1's data cache already meant.**
   - A change nobody announces (a dashboard edit) is served stale once after 5 minutes, then refreshed (stale-while-revalidate).
   - Every app write and migration revalidates its tag, so those show on the very next request. That is proven in §4.
6. **Unknown addresses now get their 404 from proxy.ts.** The look, the words and the status are as today.
   - `dynamicParams` is `true` on the three built-ahead routes. With `false`, Next 16.1.6 answers the first request after a tag revalidation with a 404 (`NoFallbackError`) under `next start`. (The branch is skipped in Vercel's minimal mode, but I could not prove that locally.)
   - So `proxy.ts` sends three kinds of address to the app's own 404 (`app/global-not-found.tsx`): any one-segment address with no route or file of its own (/wp-admin, /UK, /o), a two-letter address that is no country, and every country address off HatchGrab.
   - Those 404s now arrive **rendered by the server**, where today the server sends an empty shell and the browser draws the card. Pixels are identical on both hosts.
   - ⚠️ **A new one-segment route or a new file at the top of `public/` must be added to `lib/top-level-routes.ts`.** `scripts/cwv-2.cjs` fails until it is.
7. **The 404 for an address no route matches carries no font classes on `<body>`.** Today it carries Geist's and Geist Mono's.
   - Next attaches that file's fonts to every route's preload list. With Geist there, every public page preloaded Geist again.
   - Neither font draws a glyph on the card, and pixels are identical on both hosts.
8. **Two experimental Next switches are on:** `globalNotFound` (Q3) and `rootParams`. `rootParams` lets the country 404 read its address without reading the request.
9. **PostHog after idle (Q2 = A).** A visit that ends before PostHog has loaded sends nothing; today it sent its page view on unload.
   - On the lab's slow phone that window is the time to fetch about 65 KB after `load` plus idle; on a fast phone, a fraction of a second.
   - **The demo funnel is unaffected:** `public.demo_events` is written on the server by `/api/demo` (§7).
10. **Four harnesses fail in the final sweep (196/200), and none because of this work.**
    - `reviews-weather-1` fails identically at HEAD (a date-dependent check).
    - `add-order-refresh-inputs` fails at HEAD too, when run alone (one StrictMode measurement).
    - `event-types-render` fails under full-sweep load and passes alone, twice. Earlier reports record the same.
    - `partners-1` timed out in a browser render inside the sweep; it passes alone.
11. **The largest all-country item on a public page is the country picker's 44 inline flag SVGs** (§5.5): about 15 KB of /uk's 35.5 KB gzipped HTML. I left it as it is.

## 1 · Live "before" (www.hatchgrab.com, 6 November)

**Lighthouse 12.8.2, mobile defaults** (Moto G Power, simulated slow 4G, CPU ×4):
- Each page loaded cold three times, interleaved; the median is shown.
- PostHog's sends were blocked, as in cwv-1.

| Page | LCP s (3 runs) | FCP s | CLS | TBT ms | CSS KB | JS KB | Fonts KB (n) | Images KB | LCP element |
|---|---|---|---|---|---|---|---|---|---|
| /uk | **5.45** (5.45 / 5.47 / 4.45) | 1.90 | 0.000 | 25 | 108.7 | 340.8 | 127.9 (4) | 61.1 | the dashboard shot ("Taking an order on HatchGrab…") |
| /uk/features | **2.94** (2.78 / 2.94 / 3.10) | 1.89 | 0.000 | 10 | 109.7 | 334.3 | 89.4 (3) | 3.5 | the intro paragraph |
| /uk/faq | **2.85** (2.70 / 2.85 / 4.27) | 1.87 | 0.000 | 6 | 109.4 | 334.1 | 89.4 (3) | 3.4 | the first question |
| /about | **4.32** (4.34 / 4.32 / 4.29) | 1.92 | 0.000 | 20 | 108.7 | 334.1 | 89.4 (3) | 9.9 | the first paragraph |
| /contact | **4.46** (4.46 / 5.06 / 4.46) | 1.91 | 0.000 | 4 | 109.9 | 336.9 | 89.4 (3) | 9.9 | the intro paragraph |
| /privacy | **4.80** (4.96 / 4.33 / 4.80) | 1.93 | 0.000 | 14 | 108.8 | 335.9 | 89.4 (3) | 3.4 | the first paragraph |
| /terms | **4.25** (4.91 / 4.25 / 4.24) | 1.85 | 0.000 | 17 | 108.8 | 335.9 | 89.4 (3) | 3.4 | the first paragraph |

(Bytes are transfer sizes, compressed as served.)

**First byte, from here** (`curl`):
- **Cold:** each after at least 15 minutes with no request from this machine.
- **Warm:** 5 in a row, 2 s apart.

| | /uk (s) | /uk/faq (s) |
|---|---|---|
| Cold 1–5 | 1.03 · 1.25 · 1.34 · 0.78 · 0.53 | 0.66 · 0.49 · 0.54 · 0.30 · 0.22 |
| Warm 1–5 | 0.84 · 0.17 · 0.17 · 0.13 · 0.21 | 0.14 · 0.12 · 0.13 · 0.18 · 0.17 |

- Every response: `x-vercel-cache: MISS`, `cache-control: private, no-cache, no-store, max-age=0, must-revalidate`, `x-matched-path: /[country]` or `/[country]/faq`.
- The function region is lhr1. Samples 1–3 entered at iad1, so this machine's route went through the US then; samples 4–5 and the warm ones entered at lhr1.

## 2 · The move (`98445b9b`)

**Where everything went:**

| Where | What |
|---|---|
| `app/(app)/` | **Every app route**, under today's root layout. Moved byte-identical: `layout.tsx`, `providers.tsx`, `globals.css`, `page.tsx` (Village Foodie's home), `error.tsx`, `not-found.tsx`, admin, app, contact, `(legal)`, dashboard, dev, docs (with its two route handlers), domain, forgot-password, hire, kds, login, manage, o, order, p, reset-password, setup, signup, trucks, try, venues, verify-email, and `[country]/(legal)` (the /&lt;c&gt;/ legal pages, Q1 = B) |
| `app/(public)/[country]/` | the country landing, features, faq, compare, `[section]/[slug]` (comparison pages) |
| `app/(public)/(site)/` | landing (with landing.css and the plans-PDF route), the unlisted preview, features, faq, compare, about |
| stays at `app/` | `api/`, `auth/callback`, `demo/[ref]` (route handlers only), `embed/` (a component, no route), `robots.ts`, `sitemap.ts`, `llms.txt/`, `global-error.tsx`, and the new `global-not-found.tsx` |

**Counts:**
- **85 files moved:** 78 byte-identical renames, and 7 with one import line changed because the module they import moved too.
  - The 4 country re-exports (`'../landing/page'` → `'../(site)/landing/page'` …) and the comparison page's landing.css import.
  - Two app files, named in `scripts/_moved-paths.cjs` `MOVE_EDITS`: the KDS page (`@/app/dashboard/…` → `@/app/(app)/dashboard/…`) and HatchGrabContact (landing.css's path).
  - MarketingFrame's landing.css import also follows the file.

**Next 16's rules, as applied:**
- **Two root layouts, so links between them are full page loads** (the stop report). With Q1 = B, the links still affected are the logos → home from login, signup, setup, the demo walkthrough, Manage's header and ordering pages on a HatchGrab host. You accepted those.
- **A root layout is the top of a group,** so the country pages' root layout sits at `[country]`: its `<html lang>` needs the address. The pages without a country use `(site)/layout.tsx`.
- **`[country]` exists in both groups:** `(public)/[country]/…` and `(app)/[country]/(legal)/…`. Next accepts it (different leaf paths); tested in a throwaway app first.
- **No `app/layout.tsx`:**
  - An address no route matches renders `app/global-not-found.tsx` (`experimental.globalNotFound`).
  - Each group has its own `not-found.tsx` and `error.tsx`. The app's are moved unchanged; the public ones show the same card (§4).
  - `notFound()` from a page sends an empty shell that the browser fills, today and after (live /zz shows it).
- **In the move commit the public root layouts re-export today's,** so that commit alone changes nothing a visitor sees: 185 of 188 responses identical to HEAD.

## 3 · The public layout (`components/public/PublicDocument.tsx`)

**What it carries:**
- **The same `<html lang dir data-brand>` as today.**
  - On a country page, `lang` is the country's locale from the tagged cache: the value `proxy.ts` puts in `x-hg-page-lang`.
  - On /about and the router addresses it is read from the request, as today.
- **`<body class="antialiased">`** plus `hg-script-<key>` for that page's script.
- **`app/(public)/public.css`:** `globals.css` with exactly one line taken out, leaflet's map CSS.
- **That one language's script font**, through `next/dynamic`.
- **PostHog, after load + idle.**
- **The shared header and footer:** `components/landing/MarketingFrame.tsx`, unchanged apart from landing.css's new path.

**What it leaves out:**
- **Geist:** no public page draws a glyph in it (checked on live before starting).
- **The session banner and the Supabase browser client.**
- **leaflet's CSS.**
- **Every other language's font rules.**

**About the script-font class:**
- Each script's font is declared in its own module (`components/public/script-fonts/<key>.tsx`), with lib/script-fonts.ts's font call unchanged.
- Next generates the class name from the module that declares the font, so a split can't keep today's name. Nor can the server learn the new name without bundling every language's rules again.
- So `<body>` carries `hg-script-<key>`, set to the same variable from next/font's own family string. The faces are unhashed under Turbopack ("Noto Sans JP", "Noto Sans JP Fallback"), so the stacks resolve identically. Pixel-proven, including /jp, /gr and /ae.

**The bytes** (each file once, raw / gzipped; the local builds):

| Page | Before (HEAD) | After |
|---|---|---|
| /uk, /about | 5 files, 390 KB / **107.5 KB**: Geist + every script font + leaflet + Tailwind + landing | 2 files, 160 KB / **29.4 KB**: public.css + landing; **no `@font-face` in public.css** |
| /jp | (the same 5) | + Noto Sans JP only (92.5 KB / 31.5 KB) |
| /gr, /cy | (the same 5) | + Noto Sans (Greek and Cyrillic) only (2.5 KB / 0.8 KB) |
| /ae | (the same 5) | + Noto Sans Arabic only (4.2 KB / 1.6 KB) |

- The app's own base stylesheet (`fedf6f40….css`) has the same content hash in both builds: the app's CSS is unchanged.

**PostHog** (`components/public/PublicAnalytics.tsx`):
- After `load` and idle (`requestIdleCallback`, 3 s timeout; 200 ms on Safari), it `import()`s **today's** `app/(app)/providers.tsx`. That file is unchanged and initialises PostHog at module scope with every setting it has: cookieless memory persistence, no recording, both guards, web vitals for a public entry.
- Nothing on a public page captures to PostHog itself, so there is nothing to queue (cwv-2.cjs §4).
- **posthog-js is not in /uk's initial JavaScript:**
  - 14 initial scripts, 206 KB gzipped, against 18 scripts and 366 KB at HEAD.
  - None of them contains PostHog, the Supabase client or the demo pop-up's code; at HEAD, PostHog and Supabase sat in two of them and the pop-up in two more.
  - Its four chunks load after `load` (236 ms vs 180 ms in the browser proof, §7).

## 4 · Built ahead and served from the CDN

**The build output** (`next build`, lean):

```
├ ● /[country]                                                5m      1y
├ ● /[country]/faq                                            5m      1y
├ ● /[country]/features                                       5m      1y
├ ƒ /[country]/[section]/[slug]
├ ƒ /[country]/compare
```

**The three routes:**
- `revalidate = 300`, `dynamicParams = true` (flag 6), and every listed country in `generateStaticParams`.
- **The pages read nothing from the request at a country address** (`resolveBuiltAheadCountry`):
  - no `?country`;
  - no host: the host gate is `proxy.ts`'s (flag 6);
  - the root layout reads no headers;
  - the country 404 reads `next/root-params`.
- **The un-prefixed addresses render per request, exactly as before.**

**Data:** every read is perf-1's tagged shared cache.
- The tags are `marketing-countries`, `marketing-plans` and `marketing-faq`.
- Their writers already revalidate: Admin › Countries, Admin › FAQ, the FAQ translation run and every migration (perf-1 §5).
- Words in the message files change only with a deploy.
- **A failed read throws on these pages** (flag 4).

**Revalidation proofs, re-run on this build** (`scripts/perf-1-local.cjs`, the stand-in; **15 of 15**):
- **A price change:** /uk shows the cached £29. After `marketing-plans` is revalidated, the very next /uk shows £33, and back.
- **An FAQ publish:** the very next /uk/faq shows the new question.
- **Malta switched off without a revalidate:** /mt redirects within the proxy's 60 s. The /uk menu still offers Malta until `marketing-countries` is revalidated; then the very next /uk drops it.
- **Malta switched on again:** offered on the next /uk; /mt answers 200 within 60 s.
- **A failed read:** /de/faq keeps its last good page (200) until a revalidation, then fails (500) rather than storing "no FAQ". The very next request after the table recovers shows the German FAQ.

**What `proxy.ts` costs per request now** (unchanged, plus the new rule):
- **For /uk:**
  - the new address check (string tests only);
  - Supabase's `auth.getUser()` (a network call only when a session cookie is present);
  - the page-language lookup: `country_settings` through its 60-second in-memory copy, so one database round trip a minute per proxy instance (0.36 ms in the database, perf-1).
- **A non-GB country page also reads** the switched-on list (the same 60-second copy), for the switched-off redirect.
- /uk is outside the rate limiter's scope.
- **Could the `country_settings` read be skipped for built-ahead pages?** Here is what each half would mean (nothing changed):
  - *The language lookup:* the built-ahead pages no longer read `x-hg-page-lang`. Skipping it for `/<c>`, `/<c>/features` and `/<c>/faq` is safe, because nothing on those pages reads the header. It saves at most one lookup a minute per instance; legal, compare and comparison pages still need it.
  - *The switched-off redirect:* a switch-off in Admin revalidates `marketing-countries`, so the stored page becomes the page's own redirect on the next request. **The risk:** a switch-off made without a revalidation (a dashboard edit, or a migration run without the secret) would keep serving the country page for up to 5 minutes, plus one stale request, instead of the proxy's 60 seconds. I would keep the redirect.

**Expected live first-byte behaviour after deploy:**
- **The three built-ahead pages are served from Vercel's CDN.** The response is `cache-control: s-maxage=300, stale-while-revalidate=…` (seen on the local build), so expect `x-vercel-cache: HIT` (or `STALE` once after 5 minutes). The first byte is the edge's, typically tens of milliseconds, not a function's 0.5–1.3 s cold start.
- **The proxy still runs first** (Vercel Middleware), so its cost above remains.
- **Every other page is a function call, as today.**

## 5 · Closing the lab gap, invisibly

1. **The demo pop-up's code**:
   - It moved, byte for byte, into `components/landing/DemoModalBody.tsx`, loaded with `next/dynamic` (`ssr: false`).
   - **When it loads:** when the page has gone idle, or the moment a demo button is pointed at, focused or touched.
   - It renders nothing until first opened (as before: the pop-up drew nothing until a click), then stays mounted.
   - The words stay registered where they were.
   - **Proven:** byte-identical code (cwv-2.cjs §4); the browser proof in §7.
2. **The /uk LCP picture:** flag 2. No change was needed or possible without a visible delay.
3. **Fonts preloaded on /uk:** 2 (Archivo, Public Sans), where today it is 3 (+ Geist). The first screen uses exactly those two; Archivo's italic stays unpreloaded (cwv-1).
4. **Greek:**
   - **The change:** `landing.hero.cta` in `messages/el-GR.json` is "Ανέβασμα του καταλόγου μου →". el-CY inherits it, and the split file is regenerated.
   - **The only pixel difference anywhere:**
     - /gr and /cy at 390, 3,399 pixels: "μου →" now wraps together.
     - At 1280 both are identical.
5. **Each page sends only its own country's data and language.**
   - **Checked in /uk's HTML and page data:** GBP prices only (no EUR, USD, JPY, AUD or CHF anywhere), no plan rows of another country, English words only (no other language's landing words).
   - **What is all-country:**

| Item | On /uk | Gzipped |
|---|---|---|
| The country picker: 44 countries, each with its name in its own language and an inline SVG flag, in the HTML and again in the page data | 42.7 KB of markup; the flags 67 KB raw over both copies | about 15 KB of the page's 35.5 KB (the picker list alone 8.2 KB) |
| hreflang links: 45 `<link rel="alternate">` | 3.4 KB | 0.4 KB |

6. **`experimental.inlineCss`** (measured on a separate build of this code, never committed): measured on a separate build of this code, never committed. Interleaved with this work, median of 3:

| Page | This work: LCP / FCP | + inlineCss: LCP / FCP |
|---|---|---|
| /uk | 3.61 / 1.36 | 3.68 / 1.36 |
| /uk/faq | 3.46 / 1.21 | 3.61 / 1.09 |
| /about | 3.39 / 1.05 | 3.30 / 1.09 |

   - **Within noise:** no LCP gain, and FCP moves by at most ±0.12 s. Every page then carries its ~160 KB of CSS in the HTML, uncached.
   - It is one switch for the whole app (`base-server.js` reads `nextConfig.experimental.inlineCss` for every route; /login gained an inline `<style>` in the measurement build). **Left off.**

## 6 · Checks and re-pins

**The rule:**
- A harness that reads the working tree names the new path.
- A harness that reads an old commit names the path the file had in that commit.

**Mechanically:**
- **A codemod over every string and template token in `scripts/**/*.{cjs,mjs,js}` and `scripts/fixtures/*.json`** (comments untouched; `<rev>:app/…` specs untouched) rewrote **933 working-tree references in 179 harness files.** (A 180th, the helper's own table, was rewritten by mistake and restored.) Two passes: paths with extensions, then extensionless import specifiers. The second pass double-rewrote 2 references to `app/(app)/app/page.tsx`, corrected by hand.
- **`scripts/_moved-paths.cjs`** (new, registered as a shared module) gives:
  - `pathAt(rev, path)`: the name a file had at that commit;
  - `changedSince(rev, paths, { cwv2 })`: "unchanged since", blind to the move and nothing else (MOVE_EDITS; and with `cwv2: true`, cwv-2's one named proxy.ts block).
- **19 generic `git show ${REV}:${f}` helpers** now go through `pathAt`:
  - `_lp-perf-1`, `anz-terms`, `canada-2`, `costs-accounts-1`, `contact-1`, `event-pricing`, `event-types`, `legal-languages-1`, `ireland-3`, `perf-1`, `_messages-parity-2`, `private-events`, `site-chrome-1`, `tidy-1`, `tidy-2`, `us-polish-batch`, `us-rehearsal-fixes`, `us-legal-draft`, `schedule-graphics-places`;
  - plus the six `_messages-parity-1*` modules.

**By hand, each marked `⚠️ RE-PINNED (cwv-2…)`:**
- **perf-1, costs-accounts-1, loyalty-1:** "unchanged since" uses `changedSince`. perf-1's "no route group" check is judged against perf-1's own commit `5622370d`.
- **cwv-1:** its own-commit diffs name the files as they were.
- **ui-literals:** Admin and dev moved inside its scope regex.
- **printing-gating:** `path.join(REPO, 'app', '(app)', 'kds')`.
- **event-types:** its HEAD checkout reads the old name.
- **schedule-graphics-places:** two diffs from old commits, rename-aware.
- **site-chrome-1:** the re-export regex allows `(site)/`.
- **The demo pop-up's code moved** (`_lp1c-demo`, `demo-2`, `legal-languages-1`, `us-polish-batch`, `_lp1e-checks`): they read or patch `DemoModalBody.tsx`.
- **marketing-country-parity:** /features' host gate at a country address is proxy.ts's.
- **language-phase-1e and its tidy:** country-shaped and one-segment addresses that are no country, or off HatchGrab, are the app's 404 from proxy.ts (named).
- **event-types-render:** leaves out the public base stylesheet, which no app screen loads.
- **perf-1-local:** the outage step (flag 4).
- **Two screen tools** (allergen-card-country-screens, costs-accounts-1-screens): their esbuild filters.

**The count:**
- **Harness files re-pinned: 190 distinct** (188 in the move commit, 12 in the second, 10 in both). Not counted: the registry, the new helper and fixture, and cwv-2's own files.
  - The second commit's 12: `_lp1c-demo`, `_lp1e-checks`, `costs-accounts-1`, `demo-2`, `event-types-render`, `language-phase-1e-tidy`, `legal-languages-1`, `loyalty-1`, `marketing-country-parity`, `perf-1-local`, `perf-1`, `us-polish-batch`.
- **Every file under scripts/ the move commit touched (191, including `harnesses.json`, `_moved-paths.cjs` and `fixtures/ui-literals-baseline.json`):** _address-formats-1-after.cjs, _address-formats-2-after.cjs, _canada-1-fixtures.cjs, _compare-de-1-fixtures.cjs, _europe-settings-fixtures.cjs, _france-1-fixtures.cjs, _language-phase-0-after.cjs, _language-phase-1a-after.cjs, _lp-about-page.cjs, _lp-compare-tidy.cjs, _lp-costs-accounts-1.cjs, _lp-features-restore.cjs, _lp-paperwork-1.cjs, _lp-perf-1.cjs, _lp-tidy-1.cjs, _lp1b-dashboard.cjs, _lp1b-kds.cjs, _lp1c-auth.cjs, _lp1c-goLive.cjs, _lp1c-setup.cjs, _lp1d-fixtures.cjs, _lp1d-menu.cjs, _lp1d-named.cjs, _lp1d-schedule.cjs, _lp1d-settings.cjs, _lp1d-smoke.cjs, _lp1d2-checks.cjs, _lp1d2-named.cjs, _lp1d2-reports.cjs, _lp1d2-shell.cjs, _lp1d2-wada.cjs, _lp1e-checks.cjs, _lp1e-pages.cjs, _lp1e-parts.cjs, _lp2-extra.cjs, _lp2-named-usl.cjs, _lp2-named.cjs, _messages-parity-1a.cjs, _messages-parity-1b.cjs, _messages-parity-1c.cjs, _messages-parity-1d.cjs, _messages-parity-1d2.cjs, _messages-parity-1e.cjs, _messages-parity-2.cjs, _midnight-customer.cjs, _midnight-dashboard.cjs, _midnight-manage.cjs, _midnight-public.cjs, _moved-paths.cjs, _native-prices-fixtures.cjs, _order-charges-us.cjs, _phase3-screens-us.cjs, _site-chrome-1-render.cjs, _us-readiness-us.cjs, _world-countries-1-fixtures.cjs, about-page.cjs, add-order-render.cjs, admin-countries-1-screens.cjs, ai-search-1.cjs, allergen-card-country-screens.cjs, allergen-card-country.cjs, anz-1.cjs, anz-terms.cjs, audit-fixes.cjs, batch-reservation-edit-lock.cjs, canada-1-screens.cjs, canada-1.cjs, canada-2.cjs, capacity-move-identity.cjs, collection-times-hint.cjs, compare-de-1-screens.cjs, compare-no-system.cjs, compare-suits-1-render.cjs, comparison-features-1-screens.cjs, competitor-check-1-screens.cjs, competitor-features-2.cjs, contact-1-screens.cjs, contact-1.cjs, copy-truth-1.cjs, costs-accounts-1-screens.cjs, costs-accounts-1.cjs, countries-screenshots.cjs, country-picker-1.cjs, country-settings-parity.cjs, currency-registry.cjs, customer-path-identity.cjs, cwv-1.cjs, demo-2-screens.cjs, demo-2.cjs, demo-reset-for-sending.cjs, dot-overlap-labels.cjs, europe-languages-2-fonts.cjs, europe-settings.cjs, event-pricing.cjs, event-types-render.cjs, event-types.cjs, faq-1.cjs, faq-2.cjs, faq-3-screens.cjs, faq-3.cjs, faq-4-screens.cjs, faq-4.cjs, features-list-1.cjs, fixtures/ui-literals-baseline.json, france-1.cjs, harnesses.json, ireland-1.cjs, ireland-2.cjs, ireland-3.cjs, language-phase-0.cjs, language-phase-1a.cjs, language-phase-1e-tidy.cjs, languages-1.cjs, legal-follow-ups.cjs, legal-languages-1-audit.cjs, legal-languages-1-payments.cjs, legal-languages-1-screens.cjs, legal-languages-1.cjs, loyalty-1.cjs, marketing-country-parity.cjs, messages-split.cjs, money-sweep-parity.cjs, native-prices.cjs, outreach-reply-attach.cjs, outreach-workspace-render.cjs, outreach-workspace.cjs, paperwork-1-screens.cjs, paperwork-1.cjs, partners-1-screens.cjs, pending-card-buttons.cjs, pending-card-render.cjs, perf-1.cjs, phase3-screens-shots.cjs, phone-parity.cjs, place-pictures.cjs, places-posts-gating.cjs, places-tab.cjs, plan-feature-order.cjs, plan-features-config.cjs, plans-data-model.cjs, pricing-check-screenshots.cjs, pricing-pages.cjs, printing-copy.cjs, printing-gating.cjs, printing-network-guard.cjs, private-discovery-rows.cjs, private-events.cjs, schedule-graphics-places.cjs, schedules-country-parity.cjs, screenshots/dash-anz.cjs, screenshots/dash-ie.cjs, screenshots/dash-us.cjs, screenshots/kds-anz.cjs, screenshots/kds-ie.cjs, screenshots/kds-us.cjs, screenshots/order-anz.cjs, screenshots/order-ie.cjs, screenshots/order-us.cjs, seo-fixes.cjs, seo-geo-2.cjs, signup-country.cjs, signup-landing-screenshots.cjs, site-chrome-1-screens.cjs, site-chrome-1.cjs, slot-interval-event-override.cjs, slot-interval-grid-routing.cjs, slot-interval-settings.cjs, slot-interval-van-list-tolerance.cjs, social-posts.cjs, store-badges-1.cjs, subtab-row.cjs, tidy-1.cjs, tidy-2.cjs, time-dates-parity.cjs, ui-literals.cjs, us-layout-audit/A-customer/render.cjs, us-layout-audit/B-ops/render.cjs, us-layout-audit/C-manage/render.cjs, us-layout-proposal/A/render.cjs, us-layout-proposal/B/render.cjs, us-layout-proposal/C/render.cjs, us-legal-draft.cjs, us-polish-batch.cjs, us-readiness.cjs, us-rehearsal-fixes.cjs, us-unpriced-country.cjs, van-category-settings.cjs, weekly-post.cjs, world-countries-1.cjs, world-countries-2.cjs, world-countries-3.cjs.
- **New:** `scripts/cwv-2.cjs` (registered, 43 checks, swept), `scripts/_moved-paths.cjs`, `scripts/cwv-2-proof/` (by hand).

**The sweep:** `node scripts/run-harnesses.cjs`, 200 listed, run on a clean checkout of `b4ff9145` with its production build. **196 passed, 4 failed:**
- **`reviews-weather-1`:** its "switched ON with no key" check fails identically at HEAD (`ceda135d`), where it is date-dependent.
- **`add-order-refresh-inputs`:** 1 StrictMode measurement. It fails at HEAD too, run alone (a different measurement there: it is flaky).
- **`event-types-render`:** fails under sweep load; passes alone twice on this code. perf-1 and cwv-1 recorded the same.
- **`partners-1`:** a browser render timed out inside the sweep (1,009 s); run alone on this code, it passes.

**Before that,** a full sweep of the move commit (188 re-pinned harnesses) and of the second commit's code. Every failure there was re-pinned as listed above and re-run alone until it passed, or shown to fail at HEAD.

This last sweep ran under heavy load from the machine's antivirus: some harnesses took 15–30 minutes instead of seconds.

Registry: all 200 listed files pass the runner's safety screen. The 14 files in `scripts/` that are in neither list are the same at HEAD.

**Typecheck:** clean. `next build` type-checks the whole project, and passed on every build; `npx tsc --noEmit` on the committed tree also exits 0.

## 7 · Proofs

**App routes unchanged** (HTML):
- **How:** HEAD and this work, each built and served locally against the stand-in, with fixtures (the fixture truck `cwv2-fixture-truck`, `is_test`). Never a live truck.
- **Compared:** build chunk names, the build id and next/font class hashes normalised; React's generated ids renamed in order of first appearance.
- **Result: 76 of 76 identical** (8 byte for byte):
  - Manage (+ a token), the dashboard, the demo dashboard and its KDS, the kitchen screen /kds/&lt;token&gt;, Admin, setup, signup, login, forgot/reset password, verify email, the demo walkthrough /try;
  - **the customer ordering page** /trucks/&lt;slug&gt;/order, /o, /order/&lt;slug&gt;, **the order status page** /order/&lt;id&gt;/manage, /p, /app, /domain;
  - HatchGrab's /privacy, /terms, /country-terms, /contact, /fr/privacy, /de/terms, /jp/country-terms;
  - the same four legal pages in the native app's user agent;
  - Village Foodie's /, /trucks, /hire, /contact, /privacy, /terms, /country-terms, a truck and a venue page;
  - robots.txt, sitemap.xml, llms.txt, the router redirects, and the 27 empty-FAQ 404s.
- **Ordering and payment code:** byte-identical since `ceda135d` — 20 paths: the order, payment, webhook, menu, KDS, dashboard and Manage routes and pages, and lib/payments, lib/orders, lib/printing (cwv-2.cjs §5, `changedSince`).
- **Pizzeria Gusto:** no truck, order or payment code changed, and nothing new reads or writes one.

**Public pages pixel-identical** (Chromium, motion off, fonts loaded, full page, 390 and 1280; HEAD against this work):
- **Covered:** all 44 landings, /features and /faq for all 44 countries, /about, /uk/compare, a comparison page, /contact, /privacy, /terms, /country-terms, /fr/privacy, the 404s (/a/b, /zz, /zz/faq, /de/foo/bar), Village Foodie's /contact, /privacy, /terms, /country-terms, /uk, /uk/faq, /a/b, and the in-app legal pages.
- **307 of 310 screenshots identical.** The 3 that differ:
  - /gr and /cy at 390: the Greek arrow (§5.4).
  - /uk/faq at 390: perf-1-local's test question, served once from the stored copy after the proof (flag 5). Re-shot: identical at both widths.
- **After the last two fixes** (the global 404's fonts; the one-segment rule), the 42 screenshots they could affect were re-shot: identical. Those are the 404s on both hosts, Village Foodie, the in-app view, the legal pages and /uk.
- **Village Foodie's /contact is flaky to photograph:** HEAD against itself differs on 1 run in 3, in the same 101,040 pixels. Its full run was identical.
- **Off-host and unknown addresses:** status 404 and the same card on both hosts, e.g. www.villagefoodie.co.uk/uk, /zz, /wp-admin, /demo.

**PostHog, stubbed** (a local stand-in answered every request; nothing was sent):
- **The visit:** an Android Chrome browser at `hatchgrab.localhost` (a public entry).
- **HEAD:** `$pageview /uk` sent.
- **This work:**
  - PostHog's code loaded after `load` (load at 180 ms, PostHog's chunks at 236 ms; under sweep load, at 3.1 s);
  - `web-vitals.js` fetched (web vitals on, as for a public entry);
  - `$pageview /uk` sent.
- - **Both builds then sent `$web_vitals` for /uk carrying LCP** (`$web_vitals_LCP_event`, `$web_vitals_LCP_value`), after a tap and the 5-second buffer.
- **The timing:**
  - At HEAD, PostHog's first request came before `load` (150 ms vs 220 ms).
  - In this work it came after `load` (180 ms vs 115 ms), from chunks fetched after it.
- **The public-page guard is the same code** (providers.tsx unchanged).

**The demo funnel:**
- **Unchanged:** the demo's routes (`/api/demo`, the build request, the walkthrough, signup), /try, /demo/&lt;ref&gt; and `lib/demo-events.ts`, which writes `public.demo_events` on the server (cwv-2.cjs §4, `changedSince`).
- **In the browser:** Headless Chromium at 390, an intercepted `/api/demo`, so nothing was sent or written. Hero button → the pop-up → a test email → "See sample menu":
   - **Both builds sent `POST /api/demo` with the fields `email`, `marketing`, `template`.**
   - In this work, the click came 36 ms after the page settled, before the idle preload. So the pop-up's chunk was fetched on the click: the first opening took about 0.3 s longer (opened at 1,110 ms vs 857 ms).
   - Any later click, or any click after the page has been idle a moment, opens at once.

## 8 · After figures

**Lighthouse, same settings:**
- Local production builds, interleaved, median of 3, PostHog sends blocked.
- The live "before" is §1. Local runs read higher than live (`next start` with no CDN or brotli), so compare local with local.

| Page | Live before: LCP / FCP | Local before: LCP / FCP | **Local after: LCP / FCP** | CLS after | TBT after (ms) | CSS KB before → after | JS KB before → after | Fonts KB (n) before → after |
|---|---|---|---|---|---|---|---|---|
| /uk | 5.45 / 1.90 | 5.19 / 1.96 | **3.61** / 1.36 | 0.000 | 15 | 111.7 → 30.5 | 335.2 → 272.3 | 128.1 (4) → 99.2 (3) |
| /uk/features | 2.94 / 1.89 | 4.67 / 1.81 | **3.23** / 1.20 | 0.000 | 14 | 112.8 → 31.6 | 329.1 → 266.1 | 89.6 (3) → 60.7 (2) |
| /uk/faq | 2.85 / 1.87 | 4.66 / 1.80 | **3.46** / 1.20 | 0.000 | 12 | 112.5 → 31.3 | 328.9 → 266.0 | 89.6 (3) → 60.7 (2) |
| /about | 4.32 / 1.92 | 5.07 / 1.80 | **3.39** / 1.05 | 0.000 | 14 | 111.7 → 30.5 | 328.9 → 266.0 | 89.6 (3) → 60.7 (2) |
| /contact | 4.46 / 1.91 | 4.74 / 1.81 | **4.44** / 1.81 | 0.000 | 16 | 113.0 → 113.0 | 331.4 → 333.7 | 89.6 (3) → 89.6 (3) |
| /privacy | 4.80 / 1.93 | 4.99 / 1.80 | **4.44** / 1.80 | 0.000 | 15 | 111.7 → 111.7 | 330.5 → 332.9 | 89.6 (3) → 89.6 (3) |
| /terms | 4.25 / 1.85 | 4.82 / 1.96 | **4.59** / 1.95 | 0.000 | 14 | 111.7 → 111.7 | 330.5 → 332.9 | 89.6 (3) → 89.6 (3) |

- **The runs, after:** /uk 3.61 / 3.60 / 3.62; /uk/features 3.15 / 3.23 / 3.46; /uk/faq 3.17 / 3.46 / 3.46; /about 3.39 / 4.04 / 3.38.
- **The LCP element locally** is /uk's heading in both builds. Live it is the dashboard shot: a local image arrives at once.
- **Bytes** are transfer sizes; local is gzip, live is brotli.
- **/contact, /privacy and /terms are unchanged, as expected:** they stay on the app's layout (Q1 = B). Their JS is +2.3 KB: the pop-up's small loader. Its body now loads after idle there too, so they move within run-to-run noise.
- **TBT stays 12–16 ms, and CLS stays 0.**

**Does lab LCP reach 2.5 s? No — not locally.**
- The four rebuilt pages land at **3.2–3.6 s**, from 4.7–5.2 s on the same machine: **1.4–1.7 s faster**. FCP is 0.5–0.75 s faster everywhere.
- **What the live number will be is known only after a deploy.** Live and local disagree in both directions: live /uk/features and /uk/faq read 2.9 s against local 4.7 s, while /uk reads 5.45 s against 5.19 s.
- My expectation, not a measurement: /uk/features and /uk/faq likely go under 2.5 s live; /uk, whose live LCP is the 62 KB dashboard picture, likely does not.
- **What is left:**
  1. **JavaScript, 266–272 KB:** React and Next's runtime, the page's language words, and the client parts on the first screen (the country picker, the pricing toggle, the header-CTA watcher). The next step would be fewer client components above the fold.
  2. **The country picker's 44 inline flag SVGs:** about 15 KB of /uk's 35.5 KB gzipped HTML (§5.5). They could move to files; that is a markup change, so not done here.
  3. **public.css:** Tailwind is generated from the whole project, so public pages carry the app's utilities (about 22 KB gzipped). Limiting its sources to the public files would cut that, at the risk of a missing class; it needs its own pixel proof.
  4. **On /uk, the dashboard picture (62 KB) and the first-screen fonts (61 KB),** on Lighthouse's simulated slow 4G. Real visitors are likely already faster (cwv-1 §2.2, point 4); the PostHog web vitals will say.

## 9 · Visitor counting and tracking (confirmed)

- **Landing → login, signup and the demo were already full page loads:** Log in is a plain `<a href="/login">`, and the demo uses `window.location.assign`. They still are.
- **No cross-page id, cookie or storage was added.** PostHog stays cookieless (`persistence: 'memory'`), from the unchanged providers.tsx.
- **With Q1 = B, the full loads this adds are the logos → home** from the focused flows, Manage's header and ordering pages on a HatchGrab host. Each starts a new anonymous visitor, as the stop report said.
- **Visits ending before PostHog has loaded are not counted** (Q2 = A).
- **`demo_events` is recorded exactly as before.**

## 10 · The reference manual (V16.13)

- **35.ap-1:**
  - the two root layouts and what each carries;
  - public pages never import app-only code (the Supabase browser client, the session banner, Geist, all-language font CSS, posthog-js, the app's layout, provider or stylesheet);
  - links between the layouts are full page loads.
- **35.ap-2:** a built-ahead public page reads nothing from the request and only tagged data; writes must revalidate their tag; a failed read throws.
- **§48:** the subsection "The public pages on their own root layout".
- **The changelog's V16.13 line,** with the version updated in the header and the front matter.

## 11 · Files

**`98445b9b` (the move):**
- **Moved:** 85 files.
- **New:**
  - `app/(public)/{(site),[country]}/{layout,not-found,error}.tsx` (re-exports, for the move);
  - `app/global-not-found.tsx`;
  - `scripts/_moved-paths.cjs`.
- **Changed:**
  - `next.config.ts` (globalNotFound);
  - `components/landing/MarketingFrame.tsx` (landing.css's path);
  - `scripts/harnesses.json`;
  - 188 harness files and one fixture (`ui-literals-baseline.json`, keyed by working-tree path).

**`b4ff9145`:**
- **New:**
  - `components/public/{PublicDocument,PublicAnalytics,ScriptFont}.tsx` and `script-fonts/{greek-cyrillic,ja,zh-hk,th,ar}.tsx`;
  - `app/(public)/public.css`;
  - `lib/{public-script,root-metadata,top-level-routes}.ts`;
  - `components/landing/DemoModalBody.tsx`;
  - `scripts/cwv-2.cjs`, `scripts/cwv-2-proof/*`.
- **Changed:**
  - the two public root layouts, the country not-found, the three country routes, landing/features/faq;
  - `lib/visitor-country.ts`, `lib/marketing-render.ts`, `lib/comparison-flags.ts`, `lib/faq/public.ts`;
  - `proxy.ts`, `next.config.ts` (rootParams), `app/global-not-found.tsx`;
  - `components/landing/DemoUpload.tsx`;
  - `messages/el-GR.json` (+ its split file);
  - `docs/reference-manual.md`;
  - the re-pinned harnesses (§6).

## 12 · Undo (only if Dominic asks)

- **The whole of cwv-2:** revert `b4ff9145`, then `98445b9b`, in that order.
- **Keep the move but drop the lean layout:** revert `b4ff9145` alone.
- **Nothing to undo in the database.**
