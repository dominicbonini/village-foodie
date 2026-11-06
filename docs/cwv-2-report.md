# cwv-2: public pages on their own root layout — STOPPED at the move plan (decisions needed)

*6 November 2026. Nothing in the app is changed. No build of the repo, no deploy, no database read or write, no `.env*` file touched. This report is the only file committed.*

## Status

- **Stopped at step 2 (plan the move), as the brief says:** Next 16's own rule for two root layouts forces a behavioural change that the brief does not cover (§2). There are two more points that need your decision: PostHog's deferred start (§3) and 404 pages (§4).
- **Not done yet:** step 1, the live "before" measurement. It takes about 40 minutes (Lighthouse 7 pages × 3, plus a 15-minute idle for the cold first-byte timings) and should be taken just before the move. I will take it first once you answer.
- **The questions are in §7.**

## 1 · Pre-check

| Check | Result |
|---|---|
| compare-suits-1, partners-1, cwv-1 on `main` | ✓ (`9f3a7096`/`dccd5b8e`, `9ae595c3`/`b70f9465`, `987a3cb9`/`948f28e0`) |
| Deployed | ✓ Production is `60db835b` (GitHub deployment status **success**, 11:39 UTC today), which contains all three |
| Live build = `main`'s HEAD | ⚠️ **Not to the letter.** `main` (`98c10863`) is **5 commits ahead** of the live build: compare-recheck-1's report and two migration files (`docs/compare-recheck-1-report.md`, `supabase/migrations/20261076_…`, `20261077_…`). No app file differs, so a build of HEAD is the same app as live. I treated the pre-check as passed for that reason. Say if you want those pushed first. |
| No other session editing | ✓ The working tree is clean. One other Claude session (`village-foodie-04`, started 14 h ago) is open but **idle**. |
| Geist on public pages (the brief's STOP test) | ✓ **Not used.** On live /privacy, /fr/privacy, /jp/privacy, /uk/compare, /contact, /about, /uk and /gr, the browser's own font report (CDP `getPlatformFontsForNode`, every text node) shows Public Sans, Archivo, the system UI font (legal prose and the calculator: the stack starts `ui-sans-serif`), Noto Sans / Noto Sans JP and Hiragino, and no Geist glyph on any of them. Geist is only *preloaded* there (one of the 3 font files every public page downloads). |

## 2 · 🔴 The finding that stops the move: crossing root layouts is always a full page load

- **The rule:** in Next, a navigation between two root layouts is never client-side. Checked in the installed 16.1.6: `ppr-navigations.js` calls `isNavigatingToNewRootLayout(...)` and returns null, and `navigate-reducer.js` then takes `NavigationResultTag.MPA` → `handleExternalUrl`, a full document load. (A navigation to `global-not-found` is also always a full load.)
- **What the brief assumed:** landing → login, signup and the demo are already full loads. ✓ **True:** LandingNav's Log in is a plain `<a href="/login">`, and the demo modal uses `window.location.assign`.
- **What it did not cover: the other direction.** These are client-side navigations today (`next/link` `<Link>`, or the logo `BrandHomeLink`, which wraps `<Link>`). Once the pages sit under two layouts, they become full page loads:

| # | Where (app side) | Link | Goes to (public side) |
|---|---|---|---|
| 1 | Account menu: dashboard, Manage, KDS, Admin, the native van chooser and device settings (`components/dashboard/UserMenu.tsx:273`, `:280`) | Privacy, Terms | /privacy, /terms, or /&lt;c&gt;/privacy, /&lt;c&gt;/terms. **This is how the native app opens its legal view.** |
| 2 | Operator header logo (`components/shared/AppHeader.tsx:89`, web only; inert in the app) | `/` | on HatchGrab, a 302 to the country landing |
| 3 | Focused-flow logos (`components/shared/FlowLogo.tsx:19`, `:25`; `app/signup/page.tsx:87`): login, signup, forgot / reset password, verify email, setup, the demo walkthrough /try | `/` | the country landing |
| 4 | The app's error and 404 pages, "Home" button (`app/error.tsx:26`, `app/not-found.tsx:27`) | `/` | the country landing (on HatchGrab) |
| 5 | Customer and Village Foodie page logos (`app/trucks/[slug]/order/page.tsx:4736`, `app/trucks/[slug]/TruckClient.tsx:167`, `app/trucks/page.tsx:35`, `:145`, `app/hire/page.tsx:16`, `:19`, `app/venues/[slug]/VenueClient.tsx:109`, `:132`) | `/` | **only on a HatchGrab host** (where `/` is the country landing). On Village Foodie, `/` is the discovery map, which stays in the app layout, so nothing changes there. |
| 6 | Village Foodie footer (`components/Footer.tsx:57`, `:63`, `:69`) | Contact (3 topics) | /contact |
| 7 | Village Foodie's /contact header (`app/contact/page.tsx:123`, `:126`), the other way round | `/` | the Village Foodie map (app layout) |
| 8 | Admin-only "pricing check" on a comparison page (`app/[country]/[section]/[slug]/page.tsx:110`) | /admin | app layout (admins only) |

Links that stay client-side: public ↔ public (the country menu's `router.push`, LegalPage's Contact link, LegalChrome's three links) and app ↔ app.

**What a full load changes, concretely:**
- **Visitor counting does change, so I cannot confirm what the brief asks me to confirm.** PostHog is cookieless (`persistence: 'memory'`), so every full page load is a new anonymous visitor. Today, someone on /signup who taps the logo, or an operator who opens Privacy from the account menu, stays one visitor (and one session). After the move, each of rows 1–7 starts a new one, so visitor and session counts read a little higher. This needs no new id, cookie or storage. Adding one is the only thing that would avoid it, and the brief rules that out. A PostHog query to size it is in §6.
- **The native app (row 1):** Account menu → Privacy reloads the whole web view instead of swapping the page. Going back reloads the dashboard, Manage or KDS from scratch (its JavaScript, sign-in check and data) rather than through the router. The look is the same; it costs a second or two and a blank frame.
- **Village Foodie (rows 6–7):** Footer → Contact, and Contact → home, become full loads, and PostHog counts a new visitor on each.
- **Everything else in rows 2–5:** the same page arrives by a full load (a blank frame, about the same speed). Nothing a visitor reads changes.

**Ways round it** (the question is in §7, Q1):
- **A.** Accept it as listed. The four host- and app-aware pages get the lean layout, as briefed. ← my recommendation: the cost is a reload on rare navigations, and /contact, /privacy and /terms are 3 of the 7 pages being sped up.
- **B.** Keep /contact, /privacy, /terms, /country-terms and the /&lt;c&gt;/ legal pages under today's layout, so rows 1, 6 and 7 stay client-side and the native legal view is untouched. Only the landings, /features, /faq, /compare, the comparison pages and /about move. Rows 2–5 (the logos → home) still become full loads, and those legal pages don't get faster.
- **C.** Stop cwv-2 here.

## 3 · PostHog started after idle: a visitor who leaves very quickly is no longer counted

- **Today:** posthog-js is in the first JavaScript and `init` runs as soon as it executes. A visit closed a moment after the page appears still sends its `$pageview`: posthog-js flushes its queue with `sendBeacon` when the page unloads.
- **As briefed:** PostHog's code is fetched only after `load` plus idle, then initialised, and a queue replays the first page view and web vitals exactly as today. But a visitor who closes the tab **before** that point has nothing loaded to send with. On a fast phone the window is a fraction of a second; on Lighthouse's slow phone it is about 0.5–1 s (fetching ~65 KB on slow 4G).
- **The only way to keep those bounces** would be my own beacon to PostHog, a hand-built request with settings unlike today's. I won't do that unasked.
- **Options (Q2):**
  - **A.** Defer as briefed and accept that bounces inside that window go uncounted. ← recommended; it is the JavaScript half of the expected gain (cwv-1 §2.2: 0.5–0.9 s of lab LCP).
  - **B.** Keep PostHog loading on public pages exactly as today. Counting is identical, and that gain is given up.
- **Either way:** web vitals are unaffected. The web-vitals library reads the browser's buffered LCP and CLS entries when it starts, and INP waits for an interaction.

## 4 · 404 pages need Next's `experimental.globalNotFound`

Tested in a throwaway Next 16.1.6 app (in the scratchpad, outside the repo) with two root layouts and no `app/layout.tsx`, and against the live site:

| Case | Live today | Two root layouts, no global-not-found | With `experimental.globalNotFound` + `app/global-not-found.tsx` |
|---|---|---|---|
| Address that matches no route (live `/a/b`) | 404, today's "Page not found" card, rendered on the server inside the root layout (`lang`, `data-brand`, Geist classes) | **404, Next's bare default page** ("404 \| This page could not be found", black on white): a visible change | 404, whatever `global-not-found.tsx` renders. It can render the moved root layout around the moved not-found page, so the output is unchanged |
| `notFound()` from a page (live `/zz`, `/o/<unknown>`) | the server sends an empty `<html id="__next_error__">` shell; the card is drawn in the browser from the page data | the same shell; the group's own `not-found.tsx` is drawn in the browser inside that group's layout | the same |

- **So the plan needs one experimental switch:** `experimental: { globalNotFound: true }`, plus an `app/global-not-found.tsx` that renders today's root layout and today's not-found unchanged.
- Each group then gets its own `not-found.tsx` and `error.tsx`. The app's are moved byte-identical; the public group's look the same but import nothing app-only.
- **Q3:** enable it (recommended), or accept Next's bare 404 for addresses that match no route.

## 5 · Already settled, no decision needed

- **`experimental.inlineCss` can't be limited to public pages.** In 16.1.6 it is one server-wide setting (`base-server.js:390` reads `nextConfig.experimental.inlineCss` for every route). Per your addendum, I will measure its effect on a separate build and leave it **off**.
- **Only one language's script-font rules:** a static import puts every script's `@font-face` rules on every page under that layout. My plan is one module per script, loaded with `next/dynamic` only for that language. When it renders, Next 16 emits that module's own stylesheet (`lazy-dynamic/preload-chunks.js` renders `<link rel="stylesheet" precedence="dynamic">`). Turbopack's family names are not hashed (`"Noto Sans JP"`, `"Noto Sans JP Fallback"`), so the faces draw identically. Keeping the exact `<body>` class still needs proving; if it can't be done without a visible change, I'll stop and show you.
- **The /[country] pages on a Village Foodie host already 404** (perf-1 §6), so building them statically for the HatchGrab host alone is safe. The details are for after Q1.

## 6 · Sizing rows 1–7 in PostHog (read-only, optional)

Sessions in the last 30 days that saw an app page and then a public page in the same session (today one visitor; after the move, two):

```sql
-- read-only
SELECT count() AS sessions_app_then_public
FROM (
  SELECT properties.$session_id AS s,
         countIf(NOT match(properties.$pathname, '^/(about|contact|privacy|terms|country-terms|landing)$|^/[a-z]{2}(/(features|compare|faq|privacy|terms|country-terms))?$|^/[a-z]{2}/[a-z0-9-]+/[a-z0-9-]+$')) AS app_views,
         countIf(match(properties.$pathname, '^/(about|contact|privacy|terms|country-terms|landing)$|^/[a-z]{2}(/(features|compare|faq|privacy|terms|country-terms))?$|^/[a-z]{2}/[a-z0-9-]+/[a-z0-9-]+$')) AS public_views,
         minIf(timestamp, NOT match(properties.$pathname, '^/(about|contact|privacy|terms|country-terms|landing)$|^/[a-z]{2}(/(features|compare|faq|privacy|terms|country-terms))?$|^/[a-z]{2}/[a-z0-9-]+/[a-z0-9-]+$')) AS first_app,
         maxIf(timestamp, match(properties.$pathname, '^/(about|contact|privacy|terms|country-terms|landing)$|^/[a-z]{2}(/(features|compare|faq|privacy|terms|country-terms))?$|^/[a-z]{2}/[a-z0-9-]+/[a-z0-9-]+$')) AS last_public
  FROM events
  WHERE event = '$pageview' AND timestamp > now() - INTERVAL 30 DAY
  GROUP BY s
)
WHERE app_views > 0 AND public_views > 0 AND last_public > first_app
```

Credential routes (`/dashboard`, `/manage`, `/kds`) send no page views, so an operator's account-menu → Privacy trip isn't counted by this query. It undercounts row 1.

## 7 · Questions

1. **Q1, cross-layout links (§2).** Two root layouts make every link between them a full page load. That covers the account menu's Privacy/Terms (including the native app's legal view), the logos from login/signup/setup/demo/Manage/ordering pages to the HatchGrab landing, and Village Foodie's footer → Contact. Each starts a new cookieless PostHog visitor, so visitor counts read slightly higher. **A** accept (recommended) · **B** keep /contact and the legal pages on today's layout (no change for the native app or Village Foodie; logos still reload; those pages not sped up) · **C** stop cwv-2.
2. **Q2, PostHog after idle (§3).** A visitor who leaves before PostHog has loaded (a fraction of a second on a fast phone, ~0.5–1 s on a slow one) sends no page view, where today they do. **A** defer anyway (recommended; it is about half the expected gain) · **B** keep PostHog loading as today on public pages.
3. **Q3, 404s (§4).** Without a top-level layout, an address that matches no route gets Next's bare default 404, unless `experimental.globalNotFound` is switched on with a global-not-found page that renders today's. **A** switch it on (recommended) · **B** accept the bare 404.

## Files

- `docs/cwv-2-report.md`: this report (the only file committed).
- The throwaway test app is in the session scratchpad, not the repo.
