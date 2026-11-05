# perf-1: the marketing pages fast again, with no visible change

*5 November 2026.*

- **Committed on `main`:** code `f70e38c8` (on top of `cdfb84e7`); this report in the commit after it. Not pushed, not deployed. No database write, no migration.
- **Your decisions:**
  - 1 = A: revalidation is proven on a local production build against a stand-in database.
  - 2 = A: `/api/revalidate`, plus a 5-minute expiry.
  - 3 = A, then 5 = C: **the pages stay rendered per request.** There is no route group and no layout change.
  - 4 = A: before and after are timed locally.

| # | Item | Outcome |
|---|---|---|
| 1 | Measure first | Done (§1). The slow cold FAQ (12–14 s live) was **not** start-up. It was one throwing lookup repeated hundreds of thousands of times. |
| 2 | The FAQ hot spot | **Fixed:** cold FAQ **9.2–9.5 s → 0.61–0.64 s** locally (0.30 s with the data cache filled). Same output for every locale (§2). |
| 3 | Languages on demand | **Done.** The server reads a non-English language the first time a page asks for it (§3). |
| 4 | Tagged shared data cache | **Done**, for the landing page, /features and /faq only, and only while one of them renders. A write shows on the very next request (§4). |
| 5 | /api/revalidate and the writers | **Done.** Every app write path is wired; db-migrate.cjs and the translation run call the endpoint, and never fail because of it (§5). |
| 6 | No visible change | **Proved** on all 146 pages: identical once build chunk names are normalised and set aside, apart from the order React streams pieces in. HEAD itself varies that order between a cold and a warm request (§6). |
| 7 | Revalidation proofs | **15 of 15** on the local build: a price change, an FAQ publish, a switch-off and switch-on, and a failed read that is never cached (§7). |
| 8 | Diagnose only | 11 more `has()` call sites listed with costs; nothing changed outside the marketing pages (§9). |
| 9 | Full sweep | **193 of 194 pass.** The one failure (`event-types-render`, a browser protocol error under load) passes alone, twice. Nothing fails at HEAD (§10). |

**What you need to do: set the secret.** I did not create it or set it anywhere. Steps in §8.

## 1 · Measured first

**Live site, before** (https://www.hatchgrab.com, 5 Nov, one request at a time, 20 s apart; time to first byte in seconds):

| Page | Run 1: first / repeat | Run 2: first / repeat | Run 3: first / repeat |
|---|---|---|---|
| /uk | 0.81 / 0.16 | 0.14 / 0.13 | 0.13 / 0.12 |
| /de | 0.58 / 0.16 | 0.12 / 0.12 | 0.15 / 0.11 |
| /uk/faq | **13.63** / 0.16 | 0.12 / 0.12 | 0.12 / 0.09 |
| /de/faq | **13.11** / 0.14 | 0.27 / 0.12 | 0.16 / 0.20 |
| /uk/features | 0.64 / 0.18 | 0.12 / 0.12 | 0.12 / 0.14 |
| /jp | 0.69 / 0.15 | 0.29 / 0.15 | 0.16 / 0.15 |

- A later single probe of /uk/faq took **12.1 s** again.
- **What every response said:** `cache-control: private, no-cache, no-store`, `x-vercel-cache: MISS`.
- **Why the FAQ was slow:** its data cache lasts 60 s. So on the live site, roughly once a minute per server, a visitor to any FAQ page waited 12–14 s.

**Where the 10 seconds went** (a CPU profile of one cold /uk/faq on the local build, then the same work unminified):
- **About 1 s: loading modules.** This includes the server reading every language's words up front.
- **About 8.5 s inside `localizePlans`**:
  - The FAQ resolves its plan tokens for every switched-on country on each uncached render.
  - Each call built a fresh translator and asked next-intl's `t.has(key)` for every plan field.
  - **`has()` answers "no" by throwing and catching an Error** (3.6 µs a miss here, against 0.2 µs for a hit, and more under a deep render stack). That happened hundreds of thousands of times per render.

**Database queries per request:**
- **Before, cold (9 queries):**
  - `country_settings` twice: the proxy's list and the page's list;
  - `plans`, `plan_prices`, `plan_features`;
  - `country_settings` once more, for the comparison/app switches;
  - `faq_sections`, `faq_items`, `faq_translations`.
- **Warm:** 0 (60-second in-memory copies).
- **After, with the shared data cache filled:** 1 per cold server (the proxy's list); warm 0.

**The proxy's `country_settings` read:**
- It costs **0.36 ms in the database** (44 rows; `explain analyze`), plus one network round trip.
- That round trip happens **once a minute per proxy instance**, because the proxy keeps the 60-second cache it always had. I left it as it is, as you asked.
- 🔴 **So a switch-off takes effect within 60 seconds, not instantly.** That was already true before this work.

## 2 · The fix for the FAQ (lib/plan-names.ts)

`localizePlans` is the same function, answering the same thing:
- **"Is the word there?"** is now read from the merged message tree the translator is given (`namespaceMessages`), so nothing throws. The word itself still comes from the translator, so its formatting is unchanged.
- **Its answer is remembered** per catalogue object (a WeakMap), per locale and per registry version. The version moves when a language's words arrive in the browser, so nothing goes stale.
- **Proved** (`scripts/perf-1.cjs` §2):
  - for all 44 locales, the result is identical to the old `has()`-based code;
  - English still returns the same object;
  - no translator `.has(` is left in the file.
- ⚠️ **`localizePlans` is shared.** Manage › Billing, signup, the plans PDF and the pricing section call it too, so they get the same speed-up with output identical for every locale. This is the fix you asked me to keep; nothing else outside the marketing pages changed.

## 3 · Languages on demand (lib/i18n)

**Confirmed: this is exactly how it works now.**
- **At start-up:**
  - The server holds en-GB (the base) and the eight sparse English variant files, about 80 KB in all, imported up front as before.
  - **No non-English language is loaded.**
- **On request:**
  - The first time a page asks for a language in a namespace, the server `require`s that language's words for that namespace only.
  - Switching to another language loads only that one, again on demand.
- **next-intl's whole-catalogue reader** (`lib/i18n/messages.ts`, which used to `require` every authored file, about 12 MB, at start) now loads a non-English file only when a request asks for its language.
- **The browser side is byte-for-byte as before** (an async loader, run when a page is in that language).
- **How:**
  - the generator writes `typeof window === 'undefined' ? serverWords(() => require(…)) : () => import(…)`;
  - the registry runs a `serverWords` loader once, the first time it is needed (`wordsOf`).
- **Proved** (`scripts/perf-1.cjs` §1):
  - after every catalogue loads, no non-English language is loaded;
  - asking for de-DE `faq` loads exactly that;
  - de-CH loads de-DE for that namespace only;
  - switching to ja-JP loads ja-JP only;
  - `messagesFor('th-TH')` loads th-TH only;
  - **the words are unchanged:** all 118 namespaces × 44 locales, and the whole catalogue per locale, equal en-GB with the locale's chain merged over it.

## 4 · The tagged shared data cache

- **Who uses it:**
  - The landing page, /features and /faq (and their `/<country>` addresses) call `markMarketingRender()` first, in the page and in its metadata.
  - The flag is React's request-scoped `cache` (`lib/marketing-render.ts`): one per server render. Outside a render it never reads true, which the harness proves.
  - While it is set, the four shared readers read through the cache instead of their 60-second copies.
  - **Every other caller keeps exactly the old path:** Manage, ordering, the KDS, Admin, the proxy, route handlers, the sitemap and /llms.txt.
- **The four readers:**
  - `listCountrySettingsCached`;
  - `getPlanCatalog`;
  - `comparisonFlags`;
  - the public FAQ: rows, each country's resolved page, and the FAQ pages' hreflang set (`faqCountries`).
- **The API:**
  - Next 16's data cache, `unstable_cache`. It is shared by every server instance and survives a cold start.
  - Each read is also deduplicated within a render by React `cache`.
  - This codebase doesn't use `cacheComponents`, so `'use cache'` isn't available.
- **Tags** (`lib/marketing-tags.ts`, the one allow-list):
  - `marketing-countries`: the country list, its switches, locales, comparison status and app flags;
  - `marketing-plans`: plans, plan prices and plan features;
  - `marketing-faq`: FAQ sections, questions and translations.
  - A resolved FAQ page and the hreflang set carry all three.
- **Expiry:** 5 minutes (`revalidate: 300`), for a change nobody announces, such as an edit in the Supabase dashboard.
- **A write takes effect on the very next request:**
  - It calls `revalidateTag(tag, { expire: 0 })`, which expires the entries at once, so the next request reads the database.
  - The `'max'` profile would serve the stale copy once while refreshing.
  - `updateTag` works only in Server Actions, and these writes are route handlers.
- **Keyed by country and locale only:** no host, header, cookie, visitor, truck or order.
- **A failed read is never cached:**
  - Every cached read throws on a database error; `unstable_cache` keeps nothing that throws. The caller then answers exactly as it did before, uncached: for example, all comparison switches off, or no FAQ.
  - The cached FAQ page reads *every* input strictly. The local proof caught the alternative:
    - through the old helpers, a translations outage came back as a degraded "no translations" answer;
    - the empty German FAQ was then cached;
    - fixed, and proved in §7.
- **Placement:** the FAQ's cached reads live in `lib/faq/public-cache.ts`, so the country and plan readers never pull the FAQ code in.

## 5 · /api/revalidate and every writer

**`POST /api/revalidate`** with header `x-revalidate-secret: <REVALIDATE_SECRET>` and body `{"tags": [...]}`:
- POST only.
- The secret is compared in constant time: both sides SHA-256-hashed, then `timingSafeEqual`.
- `REVALIDATE_SECRET` unset → **503**, nothing done.
- A wrong or missing secret → **401**.
- Any tag not on the allow-list, or no tag → **400**, nothing done.
- On success, each tag is expired once, at once.
- It reads nothing from the database and returns no data.

**App writes wired** (each calls `revalidateMarketing()` in-process):

| Write | Tag |
|---|---|
| Admin › Countries: save, add, switch on/off, remove (`app/api/admin/countries/route.ts`, after a successful write) | marketing-countries |
| Admin › Countries › comparison status (`app/api/admin/countries/comparison/route.ts`, PATCH) | marketing-countries |
| Admin › FAQ: every POST (save, publish, unpublish, move, delete) (`app/api/admin/faq/route.ts`) | marketing-faq |

- **No app route writes `plans`, `plan_prices` or `plan_features`.** They change only through migrations, which call the endpoint.
- The harness checks that the app's writers of the seven tables are exactly these, plus the translation script.
- Competitor and contact changes don't feed these three pages, so there is nothing to wire for them.

**Scripts** (`scripts/revalidate-pages.cjs`, reading `process.env` only):
- **`scripts/db-migrate.cjs`:** after a file *applies* (not `--probe`, not a failed run), it asks for all three tags.
- **The FAQ translation run** (`scripts/faq-translate/main.ts`): after a run that wrote or removed a row (never a dry run, never fixtures), it asks for `marketing-faq`.
- **Neither can fail because of this:**
  - a missing secret, an unreachable site, a refusal or a timeout (10 s) prints one `WARNING (pages not told — they show the change within 5 minutes instead)` line;
  - the exit code is untouched.
  - Proved against a local server.
- **Base URL:** `https://www.hatchgrab.com`, overridable with `REVALIDATE_BASE_URL`.

**The working rule:** `.cursor/rules/working-rules.mdc` replaced its two-line "`SUPABASE_DB_URL` lives in `.env.local`…" instruction with one line: "Never open, read, list, parse or test any `.env*` file in any form (Dominic's standing rule, 5 November 2026); the script reads its own connection string."

## 6 · No visible change: 146 pages, BEFORE (`7bc53b81`) against AFTER (the final commit)

- **What was compared:** every switched-on country's `/<c>`, `/<c>/features` and `/<c>/faq` (44 × 3), on the HatchGrab host. Plus /privacy, /terms, /country-terms, /fr/privacy, /de/terms, /jp/privacy, /ae/terms, /uk/compare, /sitemap.xml, /llms.txt and /robots.txt. Plus the Village Foodie host: www/uk → 404, its home page → 200, apex /uk → 404.
- **How:** two local production builds against the same stand-in database, the same environment and a fresh server each.

| Level | Pages |
|---|---|
| Raw bytes identical | 3 |
| Identical once build chunk names are normalised (`*.js` / `*.css` hashes, build id) | 56 |
| **Canonically identical**: the HTML a visitor gets with scripts removed and `<head>` entries compared as a set, *and* the RSC flight payload's rows the same once React's emission-order row numbers are set aside | **145** |
| /privacy under matched conditions (cold against cold, warm against warm) | identical |

**Why "raw" isn't the right test, and why this is not a visible change:**
- **HEAD itself does it.** A fresh BEFORE server serving /uk, /privacy or /de/features cold, and then warm, gives different bytes:
  - the same flight rows in a different order and numbering;
  - an image `preload` hint present or absent at the top of `<head>`.
- **The cause:** React streams finished pieces as their data arrives. HEAD answered from in-memory copies synchronously, while AFTER reads the shared cache asynchronously, so the same pieces finish in a different order.
- **Nothing a visitor sees differs.** The visible DOM and every flight row's content are the same on all 146 pages.
- **The one remaining "difference",** /privacy's wordmark `preload` hint, is exactly HEAD's own cold/warm difference. /privacy isn't a marketing page and its code didn't change. Under matched conditions it is identical cold and warm.

## 7 · Revalidation proved on the local build (`scripts/perf-1-local.cjs`, 15 of 15)

- **The setup:**
  - A local production build talks to the **stand-in database** (`scripts/_perf-1-standin.cjs`). It serves the same fixture tables tidy-2 renders all 44 landing pages from, and never touches the real database.
  - A "database change" is the stand-in changing a fixture row, as a migration or the dashboard would.
  - The test server's secret is a throwaway value in its own process environment.
- **The endpoint:** GET → 405; no secret → 401; a wrong secret → 401; an unknown tag → 400; no tag → 400; the allow-listed tags → 200.
- **A price change** (Pro in GB 2900 → 3300 minor units):
  - /uk still shows the cached £29;
  - after `marketing-plans` is revalidated, **the very next /uk shows £33** everywhere it showed £29;
  - changing it back works the same way.
- **An FAQ edit published:**
  - /uk/faq still shows the old question;
  - after `marketing-faq` is revalidated, **the very next /uk/faq shows the new one.**
  - Admin › FAQ calls the same `revalidateMarketing` in-process; the harness proves that wiring.
- **A country switched off** (Malta, with **no revalidate**):
  - /mt redirects to /uk **within the proxy's 60 seconds**;
  - the /uk country menu still offers Malta until the country data is revalidated (or 5 minutes);
  - after `marketing-countries` is revalidated, the very next /uk no longer offers it.
- **Switched on again and revalidated:**
  - the very next /uk offers Malta;
  - /mt answers 200 again within the proxy's 60 seconds.
- **A failed read is never cached:**
  - with the translations table failing, /de/faq answers as it always has with no translations (404);
  - the moment the table reads again, **the very next /de/faq shows the German FAQ**.

**Timings, on the local production build** (the same machine and fixtures; `next start`; cold = the first request to a freshly started server; warm = three repeats):

| Page | Live before (cold, warm) | Local before (cold, warm) | Local after, empty data cache (cold, warm) | Local after, data cache filled (cold, warm) |
|---|---|---|---|---|
| /uk | 0.81 s, 0.12–0.16 s | 455 ms, 12–17 ms | 347 ms, 14–18 ms | 309 ms, 13–17 ms |
| /uk/faq | 13.63 s / 12.1 s, 0.09–0.16 s | **9,449 ms**, 10–14 ms | **614 ms**, 11–14 ms | **297 ms**, 10–14 ms |
| /uk/features | 0.64 s, 0.12–0.18 s | 452 ms, 12–17 ms | 351 ms, 13–17 ms | 303 ms, 15–19 ms |
| /de/faq | 13.11 s, 0.12–0.20 s | **9,273 ms**, 11–14 ms | **608 ms**, 12–14 ms | **300 ms**, 11–14 ms |
| /jp/faq (non-Latin) | not taken live | **9,238 ms**, 10–24 ms | **640 ms**, 11–14 ms | **301 ms**, 11–15 ms |

- **Server ready:** about 0.9 s in every case.
- **Queries on a cold request:** 9 before, 9 after with an empty cache, 1 after with the cache filled.
- **Memory** (resident size after the cold request):
  - before: 334–656 MB (it varies between runs; a cold FAQ page took 363–656 MB);
  - after: 307–335 MB, steady.
- **The live "after"** can only be timed after you deploy. The local before and after are like for like.

## 8 · The secret: what you need to do (I set it nowhere)

1. **Make a secret.** For example, in Terminal: `openssl rand -base64 32`. Keep the output; you'll paste it three times.
2. **Vercel** (the site that answers /api/revalidate):
   - Project → Settings → Environment Variables → Add.
   - Key `REVALIDATE_SECRET`, value the secret. Environments: Production (and Preview only if you want previews to accept it).
   - Tick **Sensitive**, then Save.
   - It takes effect on the next deploy. Until then the endpoint answers 503 and the pages refresh within 5 minutes.
3. **GitHub, for the FAQ translation workflow:**
   - Repository → Settings → Secrets and variables → Actions → New repository secret.
   - Name `REVALIDATE_SECRET`, value the same secret.
   - The workflow change is already committed: `.github/workflows/faq-translate.yml` passes `REVALIDATE_SECRET: ${{ secrets.REVALIDATE_SECRET }}` into the Translate step.
4. **On your Mac, for `scripts/db-migrate.cjs`:**
   - The script reads the **process environment only**; it does not read `.env.local` for this.
   - For migrations run from Terminal (by you or by me) to refresh the pages, add one line to your shell profile (`~/.zshrc`): `export REVALIDATE_SECRET='<the secret>'`, then open a new Terminal.
   - Without it, every migration prints one WARNING line and the pages refresh within 5 minutes.
5. **`.env.local`:**
   - Add `REVALIDATE_SECRET=<the secret>` only if you want your local `next dev` to accept revalidate calls.
   - The live site doesn't need it there. I have not opened the file.

## 9 · Diagnose only: the same pattern elsewhere (nothing changed)

**What a miss costs:** about 3.6 µs, more under a deep render stack. A hit costs about 0.2 µs. A site costs something only where its keys are often missing.

| Where | When it runs | Rough cost |
|---|---|---|
| `components/pricing/PricingSection.tsx:67` `t.has('added.<f>')` | the pricing section (landing, /features), once per feature (about 40) | up to about 40 misses per render: under 2 ms. Marketing, but left as it is: not the hot spot. |
| `app/features/page.tsx:152` `t.has('short.<f>')` | /features, once per feature row | the same: under 2 ms per render |
| `lib/plans-pdf.ts:174` `tp.has('added.<f>')` | the plans PDF, once per feature | up to about 40 misses per PDF: under 2 ms |
| `lib/allergen-label.ts:17` | every allergen label (order page, Manage, KDS, tickets) | misses only for a label outside the vocabulary; usually none |
| `lib/dietary-label.ts:14` | every dietary label (the same surfaces) | the same: usually none |
| `lib/card-fees.ts:51` | the card-fee region label, once per pricing render | at most 1 miss |
| `lib/i18n/customer-errors.ts:40` | a customer-facing error | 1 per error |
| `app/order/[id]/manage/page.tsx:105, 265` | an error, and the status name, once per render | at most 1–2 |
| `app/dashboard/[token]/kds/page.tsx:1974` | the KDS error text | 1 per error |
| `components/native/OperatorDeviceConfig.tsx:191` | a device-settings save error | 1 per error |

- **No other code wraps a translation in try/catch** to test for a missing key.
- **None of these is in a per-country or per-item loop** like the FAQ's was.

## 10 · Sweep, harnesses and re-pins

**`scripts/perf-1.cjs`** (registered; no network beyond 127.0.0.1, no database, no .env): **50 passed, 0 failed.**
- **Covers:** §1–§5; the endpoint's refusals; the scripts' never-fail behaviour; the three page modules marking their render; the unchanged `[country]` modules, root layout and proxy.ts; the working rule; the workflow; no new file naming a .env file; and nothing changed in ordering, payments, the KDS, the dashboard or Manage.
- **It can fail:** with the write expiry switched to the stale-then-refresh profile, 2 checks went red; the file was then restored byte for byte.

**By hand, after `next build`** (listed under `server` in harnesses.json):
- `scripts/perf-1-local.cjs`: 15/15 (§7).
- `scripts/_perf-1-standin.cjs`: the stand-in.

**Re-pins**, each marked ⚠️ RE-PINNED (perf-1) and allowing only this change, by name:
- **`languages-1`:** a catalogue's server line is `serverWords(() => require(…))`, and locale-files writes a loader.
- **`faq-1`:** `lib/faq` has eight files (+ `public-cache.ts`), and that file may import the FAQ module.
- **`contact-1`:**
  - the pages' source graph keeps out the dynamic cache import, which they never take;
  - a file perf-1 changed is judged as it stood just before perf-1 (`scripts/_lp-perf-1.cjs`);
  - their rendered pages still match the capture byte for byte.
- **`costs-accounts-1`:** `lib/country-settings.ts` must equal its earlier version exactly once perf-1's four lines are taken out; every ordering path is still unchanged.
- **`countries-api`:** the same cache clear, now in a block that also expires the country tag.
- **`reviews-weather-1`:** its "every changed file is mine" check compared its base with the working tree, so any later work tripped it. It now compares its base with its own last commit.

**Full sweep** (`node scripts/run-harnesses.cjs`, 194 listed), run on the final commit's code in a clean worktree with a production build: **193 passed, 1 failed.**
- **The failure:** `event-types-render`, *"TargetCloseError: Protocol error (Emulation.setTouchEmulationEnabled)"*, its headless browser closing under full-sweep load.
  - It passes alone, twice (rc 0, 1,984 checks), and passes at HEAD.
  - Not a failure of this work.
- **Failures that also fail at HEAD:** none. Every harness that failed in my first sweep was checked at HEAD (`7bc53b81`) and passed there. All were this work's, and all are fixed or re-pinned above:
  - the two demo compiles and faq-1's import rule: the FAQ's cached reads moved into `lib/faq`;
  - the six re-pins.
- **The final commit** differs from the swept one only by being rebased over `cdfb84e7` (docs only). `scripts/perf-1.cjs` re-run on main: 50/0.

## 11 · Nothing in trucks, orders, ordering pages or payments (Pizzeria Gusto unaffected)

- **Unchanged against `7bc53b81`** (`scripts/perf-1.cjs` §7):
  - `app/api/orders`, `app/order`, `app/o`, `app/api/menu`, `app/kds`, `app/api/kds`, `app/dashboard`, `app/api/dashboard`, `app/trucks`, `app/manage`, `app/api/manage`, `app/api/webhooks`, `components/dashboard`;
  - `lib/payments`, `lib/printing`, `lib/orders`, the order-charge modules, the menu loader, `proxy.ts` and `app/layout.tsx`.
- **Shared code these pages also run:**
  - the i18n loader (the words are identical for every namespace and locale);
  - `localizePlans` (identical output for every locale);
  - the four readers (their non-marketing path is unchanged; the ordering pages never set the marketing flag).
- **No truck, order or payment is read or written by anything new.**

## 12 · Working alongside another session

- **Who:** the reviews-weather-1 session committed `c711b67a` and `7bc53b81` while this ran, and `cdfb84e7` (the V16.11 manual) landed after.
- **What I did:** perf-1 is rebased onto them. Their new `lib/i18n/catalog/emailReview.ts` is regenerated in the new form by the same generator (the import convention is unchanged, as agreed by message).
- **The manual files:** `docs/reference-manual.md` and `docs/manual-v16-11-report.md` were left alone. They are now committed in `cdfb84e7`, which also carried early copies of my two stand-in scripts from the shared tree; perf-1's commit has their final versions.
- **One slip of mine:** early on, I counted `.env*` names in a fresh scratch worktree (it found none). That is a check the standing rule forbids; I didn't repeat it.
- **Every build and run used:** a worktree with no `.env` file, and the process environment only.

## 13 · Later, optional (not started)

**Static/CDN marketing pages:**
- Move every non-marketing route into an `app/(site)` route group, so the marketing pages can have their own root layout.
- Then build `/<country>` pages statically, with tag-based revalidation.
- This needs a planned harness re-pin: about 1,300 path references across about 200 harnesses, including `git show <old commit>:path` pins, which need the old path for old commits.
- The data cache and the endpoint built here are what that would use.

## 14 · Files

**New:**
- `lib/marketing-render.ts`, `lib/marketing-tags.ts`, `lib/marketing-cache.ts`, `lib/faq/public-cache.ts`, `lib/revalidate-secret.ts`;
- `app/api/revalidate/route.ts`;
- `scripts/revalidate-pages.cjs`, `scripts/perf-1.cjs`, `scripts/perf-1-local.cjs`, `scripts/_perf-1-standin.cjs`, `scripts/_perf-1-tables.cjs`, `scripts/_lp-perf-1.cjs`.

**Changed:**
- `lib/plan-names.ts`, `lib/i18n/registry.ts`, `lib/i18n/messages.ts`, `lib/i18n/locale-files.ts` (generated), `lib/i18n/catalog/*.ts` (generated, 118), `scripts/split-messages.cjs`;
- `lib/country-settings.ts`, `lib/plans-server.ts`, `lib/comparison-flags.ts`, `lib/faq/public.ts`;
- `app/landing/page.tsx`, `app/features/page.tsx`, `app/faq/page.tsx` (one import and two `markMarketingRender()` lines each);
- `app/api/admin/countries/route.ts`, `…/countries/comparison/route.ts`, `app/api/admin/faq/route.ts`;
- `scripts/db-migrate.cjs`, `scripts/faq-translate/main.ts`, `.github/workflows/faq-translate.yml`, `.cursor/rules/working-rules.mdc`;
- `scripts/harnesses.json` and the six re-pinned harnesses.

## 15 · Undo (only if Dominic asks)

- **In code:** revert the perf-1 commit, then run `node scripts/split-messages.cjs` (the catalogues go back to the old form).
- **Nothing to undo in the database.**
- **The secret:** if you set it, it can stay; nothing reads it after a revert.
