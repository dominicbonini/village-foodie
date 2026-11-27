# compare-cache-1: comparison pages cached 30 days, refreshed per country on demand (27 Nov 2026)

## 1 · Summary

- **The comparison pages and their .md / .json twins are now cached for 30 days** (`revalidate = 2592000`).
  - Each one renders on its first visit and is then kept.
  - It's refreshed straight away, **for that country only** (tag `comparison-<CC>`), when the publish step finds its page changed, or when an Admin › Countries save touches that country.
  - Committed on france-vat-1 (`30ec10c5`, `5dcf78ce`). It goes out with your next deploy; nothing was pushed or deployed.
- **The build marks** (`npm run build`):

  | Route | Mark |
  |---|---|
  | `/[country]/[section]/[slug]` (the page) | **● ISR, Revalidate 30d, Expire 1y** |
  | `/api/compare/[country]/[section]/[slug]/[format]` (the twins) | **● ISR** |
  | `/api/compare/preview` | ƒ dynamic, as it must be |
  | `/api/revalidate` | ƒ dynamic, unchanged |

- **Proved on a local production server** (`next start`, reading live data read-only):
  - page and twins answer MISS, then HIT (`s-maxage=2592000`);
  - posting `comparison-IE` re-rendered IE only, while AU stayed HIT;
  - a not-live page is a 404 every time (`private, no-store`, `noindex`);
  - villagefoodie.co.uk gets 404 for the page, its twins and `/api/compare/*`;
  - the preview switch is a 404 without an admin.
- **The rolled-back publish dry run** would refresh **no page** ("pages to refresh — none").
- **The saving:** a visit went from a ~1.8-second render with ~20 database requests (~11–12 k rows) to a **7–10 ms cached answer with no database read** (§6).
- **Checks:**
  - new harness **compare-cache-1 41 / 0**;
  - every comparison harness passes, except compare-de-1-screens' 2 and vercel-cost-1's 3, all pre-existing or environmental (§4);
  - `tsc` 0 errors.

## 2 · Diagnosis: what made the page dynamic, and what each would break if cached

| What | Why it was there | If cached as it was | Now |
|---|---|---|---|
| `export const dynamic = 'force-dynamic'` (page and twin route) | every request rendered | (nothing cached) | removed; `revalidate = 2592000`, `dynamicParams = true`, `generateStaticParams → []` (page and twins) |
| `headers()` host check (`isHatchGrabHost`): page and twins | a 404 on villagefoodie.co.uk | a cached page can't see the host; it would answer on every host | **proxy.ts** answers 404 for a comparison address, its twins and `/api/compare/*` on any non-HatchGrab host (decision 3) |
| `adminUser()` (cookies): page and twins | a country at status 'admin' is visible only to an admin | one cached version for everyone: a draft could be cached publicly, or the admin locked out | read **only in Next's draft mode**; the public render reads no cookie |
| `searchParams` (`?view=public`; twins `?view=admin`) | the admin's "what the public sees" | reading them makes the page dynamic | read only when admin is true, which needs draft mode |
| **`resolveVisitorCountry` → `resolveCountryPage` → `headers()`** (the header and footer's country) | its own host check | **found only by the production build:** every on-demand render failed with `DYNAMIC_SERVER_USAGE` (500) | `resolveCountryAddress`: the address's country, no request read, as the built-ahead landing pages do |
| The 1,000-row reads | (not a dynamic cause) | slow, and wrong until the paging fix (`e9626ca8`) ships | unchanged; cached now, so read once per refresh |

**How each concern is handled:**

- **A page that isn't live is never served publicly from the cache.** Its public render is a 404, and the 404 is what the cache keeps, under the country's tag. The proxy also adds `private, no-store` and `noindex` to non-live addresses, as before.
- **Draft-mode requests bypass the cache** in both directions.
- **The country's switches are read through a data cache tagged only `comparison-<CC>`.** That has two effects:
  - every cached answer, the 404 included, carries the tag that refreshes it;
  - the first render after a refresh reads the database, never a warm server's 60-second copy. Otherwise a page taken down could be re-cached as live for 30 days.
- **No comparison route uses a `marketing-*` tag** (decision 4). The page never switches on the marketing render, whose shared reads carry those tags. So migrations refresh no comparison page.

## 3 · The change

**Code:**

| File | What changed |
|---|---|
| `lib/marketing-tags.ts` | `comparisonTag()`, `isComparisonTag()` (`comparison-[A-Z]{2}`), `isRefreshTag`, `MAX_REFRESH_TAGS` (300), `COMPARISON_REVALIDATE_SECONDS` |
| `app/api/revalidate/route.ts` | also accepts `comparison-<CC>` (same secret, POST only, constant-time, 400 for anything else); comparison tags are expired at once |
| `lib/comparison-server.ts` | the country's switches through `unstable_cache` tagged `comparison-<CC>` (an uncached fallback only outside Next); `revalidateComparison(codes)`; `resolveComparison` reads the tagged switches |
| `lib/comparison-flags.ts` | `comparisonBlockedOnHost(host, path)`: pure, the same host test as `isHatchGrabHost` |
| `proxy.ts` | one rule: a bare 404 for that, before the Village Foodie redirects |
| page `app/(public)/[country]/[section]/[slug]/page.tsx` | cache exports; draft-mode-only admin and query; `resolveCountryAddress` |
| twins `app/api/compare/[country]/[section]/[slug]/[format]/route.ts` | cache exports (`generateStaticParams → []` is what makes Next 16 cache a GET handler); no host read; draft-mode-only admin and `?view=admin` |
| **new** `app/api/compare/preview/route.ts` | admin only (else 404, no cookie); `?to=` must be a comparison address (else 400, so no open redirect); turns draft mode on (`&off=1` turns it off); then a 307 to that page |
| `lib/comparison-publish-run.ts` | each shown item in `comparison_publish.shown` gains a fingerprint `fp` (`shownFingerprint`); `changedCountries()` (pure); the refresh receives exactly the changed countries that have a page, plus whether any live status changed |
| `scripts/comparison-publish/main.ts`, `scripts/competitor-check/main.ts` | post `comparison-<CC>` for those countries, and `marketing-countries` **only when a live status changed** (the landing footers' comparison link and the hreflang read it); the dry run prints "pages that would be refreshed" |
| `app/api/admin/countries/route.ts`, `…/countries/comparison/route.ts` | a save, add or removal, and the comparison status / Admin's off / auto-publish, refresh **that country's** page (the body's `code`) |

**What the fingerprint covers:** the competitor's name, website, focus and category; its entry's `choose_when` and group; its plan's price fields, card rate, VAT, unclear flag, source and checked date; and its current answers for that country, with whether each may show.

**When a country counts as changed:** its live status, its line-up (who is shown, in what order, on which plan), or a fingerprint. A fingerprint missing on the old row (rows written before this change) isn't a change by itself, since the deploy starts every page afresh. A country not live before and after counts as nothing, because it's a 404 either way.

**Why the preview uses draft mode (decision 2):** the admin opens the same URLs, banner and "what the public sees" included. Next renders those requests live and never caches them, and no second copy of the route is needed. The footer link is unchanged, so until an admin has opened `/api/compare/preview?to=<page>`, a not-live page's footer link shows them the public 404.

## 4 · Harnesses, tsc, build

**New `scripts/compare-cache-1.cjs` (registered): 41 passed, 0 failed.** It checks:

1. no force-dynamic; 30 days; no page built ahead; no request read in the public render; admin and query only in draft mode; the switches tagged only `comparison-<CC>`; no marketing tag; resolveCountryAddress;
2. a not-live page is a 404 for the public and the page for an admin in draft mode; its .md twin likewise;
3. the preview switch: non-admin 404 and no cookie; a comparison address (and its .md) turns draft mode on and redirects (307, private); another site, `//host`, another path or none gives 400; `off=1` turns it off;
4. the host rule: 14 host × path cases, plus proxy.ts's bare 404 placed before the Village Foodie redirects;
5. /api/revalidate:
   - `comparison-GB` accepted and expired alone;
   - mixed with a marketing tag, each expired once;
   - refused: lower case, three letters, empty, a digit, no dash, unknown, none, more than 300;
   - a wrong or missing secret gives 401; unset gives 503;
6. the publish diff:
   - no change → none;
   - price/answer, plan, line-up or order → that country;
   - a take-down or a country going live → that country, plus `liveChanged`;
   - an old row without a fingerprint → no change;
   - not live both times → none;
   - the fingerprint changes with price, card rate, checked date, answer or shown flag, but not with the plan's internal note;
   - runPublish refreshes only changed countries that have a page, and doesn't call at all when there are none;
7. the Admin saves refresh that country (three country actions, two switch branches); `revalidateComparison` dedupes, upper-cases and drops bad codes; both callers post the right tags; db-migrate and revalidate-pages name no comparison tag.

**Every comparison harness:**

| Harness | Pass / fail |
|---|---|
| compare-cache-1 | **41 / 0** |
| compare-suits-fix-2 | 23 / 0 (re-pinned) |
| compare-calc-fix-1 | 20 / 0 |
| compare-no-system | 54 / 0 |
| compare-de-1 | 91 / 0 |
| competitor-check-1 | 227 / 0 |
| competitor-check-8 | 51 / 0 |
| competitor-features-2 | 79 / 0 |
| competitor-wtt-1 | 42 / 0 |
| compare-suits-1 | 72 / 0 |
| compare-autopublish-1 | 75 / 0 (re-pinned) |
| compare-languages-1 | 24 / 0 |
| compare-ux-1 | 39 / 0 |
| compare-fix-1 | 65 / 0 |
| compare-fix-2 | 79 / 0 (re-pinned) |
| checker-prep-1 | 18 / 0 |
| compare-square-1 | 27 / 0 |
| perf-1 | 50 / 0 |
| privacy-processors-1 | 9 / 0 |
| **compare-de-1-screens** | **15 / 2** (the table's sideways scroll at 390 px: the same 2 fail before this work; its screenshots restored) |
| **vercel-cost-1** | **27 / 3**, none from this work (below) |

vercel-cost-1's three:

- section 5's two byte-identity checks against `d309e4ef` already fail at HEAD before this work, from later commits;
- "this work changed only its own files" names only another session's 4 uncommitted `scripts/fixtures/language-phase-*` files. It passes in a clean tree.

**Re-pins** (each with a dated ⚠️ note):

- **`scripts/_lp1e-fixtures.cjs`:** the `draftMode()` stub is on for an admin fixture (`__cmpAdmin`), as a real admin is after the preview switch.
- **compare-autopublish-1:** "the same state again" now passes the first run's answers too. The first run had accepted one, so leaving it out was a real content change, and the fingerprint correctly caught it.
- **vercel-cost-1:**
  - the comparison page is the one deliberate ISR exception;
  - the endpoint's security is checked as rules (secret module byte-identical);
  - the Competitor check's new call;
  - comparison pages cached under their own tag.
- **compare-fix-2:** "refresh only after a committed real run" now reads `if (!dryRun && refresh.length)`.
- **compare-suits-fix-2:** its scope check is up to its own commit. It already failed at HEAD after privacy-processors-1 changed lib/legal.ts, my miss, now fixed.

**`tsc --noEmit`: 0 errors.**

**`npm run build`: exit 0**, with the route marks in §1. A strict check build (`dynamic = 'error'` with two pages built ahead, temporarily, then reverted) also passed. That proves the render reads nothing from the request.

## 5 · The rolled-back publish dry run

```
publish: pages to refresh — none
inside the transaction (before its ROLLBACK): no change
publish (would be): 96 live — GB (Ordea, What The Truck, Hatches Up, Square); … 
pages that would be refreshed: none
```

A run with no changes refreshes **no page**, as expected. Today's rows carry no fingerprint yet, which counts as no change. The first real run after the deploy writes them, and runs after that compare them.

## 6 · What this saves

**Per visit:**

| | Before (force-dynamic) | After (cached) |
|---|---|---|
| Work per visit | a full server render: **~1.7–1.9 s** of function time (9.7 s on a cold start), measured locally on the production build | **7–10 ms**, the cached HTML from the ISR / CDN cache |
| Database | ~20 Supabase requests (~11–12 k rows: competitors, plans in 2 pages, entries, every current answer in ~10 pages of 1,000, feature checks, findings, features, settings) | none |
| Page size | ~0.6–0.8 MB of HTML | the same bytes, from the cache |

**Renders a month after the change** (per page, plus its .md and .json twins, each only when someone asks for it):

| Source | Renders |
|---|---|
| The 30-day expiry | ≤ 96 pages × 3 = **~290 a month** at most (only the addresses visited) |
| Publish refreshes | only countries whose page changed. With the Competitor check at ~5 competitors a day, expect a handful of countries a day: **~5–15 a day, ~150–450 a month** (× 3 for the twins, if visited). Today's run would refresh 0. |
| Each deploy | starts afresh: up to 96 × 3 first renders, spread over first visits |
| Admin › Countries saves | one country each |
| Admin previews | dynamic, never cached; a few, only while you look |

So the cost no longer grows with visits. It's bounded by roughly **300–1,000 renders a month** in total, against one render (and ~20 database requests) per visit today. Every crawler and AI-assistant visit to the 96 pages and their twins now costs nothing past the first.

## 7 · What needs you

1. **Admin › Pricing check edits don't refresh a page.** Hiding, pinning or verifying an entry, plan or answer (lib/admin/pricing-check-actions.ts) was outside the allowed files. Such an edit now shows at the next publish run that sees it, or at the 30-day expiry. Say if those saves should refresh the country too; it's a one-line `revalidateComparison` per action, like the Countries saves.
2. **Admin › Billing's payment-model save** (app/api/admin/billing/route.ts) changes the guide's payment line, but doesn't refresh comparison pages (not in the allowed files). The same one-line change would cover it.
3. **HatchGrab's own prices on the comparison pages** (plan_prices, country settings such as the card fee), when changed by a migration, now show within 30 days or at that country's next refresh. That's decision 4 as written: migrations refresh no comparison page.
4. **The preview needs one click per admin browser:** `/api/compare/preview?to=<page address>` (and `&off=1` to leave). The footer link is unchanged, as decided.
5. **The deploy order:** this goes with the batch deploy. Like the paging fix `e9626ca8`, it needs no data change, and the first publish run after the deploy writes the fingerprints.

## Flags

- Nothing arrived garbled. The scope questions were asked and answered (your decisions 1–4).
- **Found and fixed during the work:** the production build's `DYNAMIC_SERVER_USAGE` (§2), caught only by running the built site.
- **Local servers:** the production server ran on port 3107 against the live database (read-only). One run had a throwaway `REVALIDATE_SECRET` in its own environment; no .env file was opened.
- No database writes (the dry run was rolled back), no push, no deploy, no workflow change.
- **Commits** (france-vat-1, not pushed):
  - `30ec10c5`: the change, harness, re-pins;
  - `5dcf78ce`: the runtime fix found by the build;
  - this report.

## Undo (only if Dominic asks)

`git revert 5dcf78ce 30ec10c5`. That puts back force-dynamic, the old host checks and the `marketing-countries` refresh.
