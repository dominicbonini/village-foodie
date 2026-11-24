# vercel-cost-1: marketing country pages with no timer, built ahead for 8 countries instead of 217

23 November 2026. **Committed locally as `5df925d8`. Not pushed, not deployed.** docs/ is left uncommitted.

- **Nothing in live ordering changed.** A new check proves it: 59 ordering, checkout, payment, KDS, dashboard, Add order, heartbeat, auth, Manage, admin and app paths, plus the 11 shared readers, are byte-identical to `d309e4ef`.
- **No database writes.** All tests ran on the in-memory stand-in database, never the real one.
- No landing-page wording changed. No .env file was opened. Pizzeria Gusto and Le Roi du Churrasco were not touched.

## Summary

- **The timer is gone.** The landing, /features and /faq at every country address used to rebuild every 5 minutes whenever visited: 217 addresses × 3 pages, ~420 KB each. They now rebuild only when told to. Their shared data has no expiry either; before, its 300 seconds also forced the pages back onto a 5-minute timer.
- **Built ahead:** 8 countries (uk, us, ie, au, nz, ca, fr, de), so **24 pages instead of 651** at every deploy.
  - Every other country address renders on its first visit (tested: 200), then is kept the same way.
  - `dynamicParams` stays `true`, per the cwv-2 note, so nothing 404s.
- **Refreshed on demand** by the existing secure route `/api/revalidate`.
  - **The secret's env var is `REVALIDATE_SECRET`.**
  - 🔴 **It is set nowhere today.** The live route answers 503, and the translator logs "REVALIDATE_SECRET is not set".
  - So **before you deploy this**, add it to Vercel (Production) and to the GitHub repository secrets (§2).
- **Estimates:**
  - **ISR writes:** from ~100k a day to roughly **10–45k a day** (§6), depending mostly on how often you deploy.
  - **Build:** from ~5 min to **~3 min**. The 2.5-minute page-generation step drops to well under a minute.

## 0 · Prompt check

- **Garbled spans:** none.
- **Two versions of the brief:** a second, fuller version arrived while I was working (the red rule on live ordering, the ordering-files check, test data only). I followed the second; nothing in it contradicts the first.
- **Contradictions:** none.
- **Admin is on the do-not-change list, and Admin's writes must trigger the refresh.** Admin already triggers it (§2), so no admin file needed changing, and none did.
- **Competitor entries:** no cached page reads them (§2). The comparison pages are rendered per request, so a competitor edit already shows immediately.
- **Prices and plans:** no Admin screen writes `plan_prices`, `plans` or `plan_features` today. They change only by SQL migration.

## 1 · Every source of ISR and data-cache writes

The writes-per-day figures are *before* this change. A Vercel write is counted in 8 KB units; one country page is ~52 units:
- `uk.html` 165 KB;
- `uk.rsc` 80 KB;
- the `uk.segments/` prefetch files ~172 KB.

| Source | Interval | Est. writes/day before | Used by ordering? | Now |
|---|---|---|---|---|
| `app/(public)/[country]/page.tsx`, `features/page.tsx`, `faq/page.tsx`: 651 ISR pages (217 addresses × 3) | `revalidate = 300` + `generateStaticParams` for all 217 | **~100k units**: each visit more than 5 min after the last rebuilt the page (~1,900 rebuilds × 52 units, which fits ~3 crawler visits per page per day) | No | **No timer** (`revalidate = false`); built ahead for 8 countries only |
| The same 651 pages, **prerendered at every deploy** | per deploy (17 production deploys 13–22 Nov ≈ 1.5/day) | up to 651 × 52 ≈ **34k units per deploy** *if* Vercel counts build output as ISR writes (its usage page doesn't split this out) | No | 24 pages ≈ 1.25k units per deploy |
| `lib/marketing-cache.ts` `shared()`: Next data cache (`unstable_cache`). Five global entries (country list, plan catalogue, comparison switches, FAQ rows, FAQ countries) + one FAQ page per country/locale (~210) | `revalidate: 300` (`MARKETING_REVALIDATE_SECONDS`), tags marketing-countries / -plans / -faq | ≤ 215 entries × once per 5 min while pages rebuild: **a few thousand units** | **No**: read only while a marketing page renders (`isMarketingRender`) | **No expiry**; keys scoped to the deployment |
| `lib/faq/public-cache.ts` (FAQ entries through `shared()`) | as above | included above | No | as above |
| `app/(app)/trucks/[slug]/page.tsx`: the legacy Google Sheets CSV `fetch` | `next: { revalidate: 3600 }` | ≤ 24 small writes | **Yes** (the truck page) | **Unchanged** (red rule) |
| `revalidateTag(t, { expire: 0 })` in `revalidateMarketing()`: Admin › Countries, its comparison status, Admin › Billing payment model, Admin › FAQ, `/api/revalidate` | on each write | invalidations, not writes; the next visit rebuilds | No | unchanged |
| `revalidatePath` | none in the code | 0 | — | — |
| `app/api/discovery/events` | `revalidate = 300`, but it reads the request, so it is dynamic and never cached | 0 | discovery, not ordering | unchanged |
| `/api/events`, `/api/menu/[truckId]`, `/api/slots/[truckId]` | `revalidate = 0` (no cache) | 0 | **Yes** | unchanged |
| /compare, /privacy, /terms, /country-terms at a country address; the comparison pages; the unprefixed /landing, /features, /faq, /about; sitemap, robots, llms.txt | `force-dynamic`, or they read headers | 0 (CPU per request instead) | No | unchanged |
| **In-memory** 60-second caches: `lib/country-settings.ts`, `lib/plans-server.ts`, `lib/comparison-flags.ts`, `lib/faq/public.ts` | 60 s per server instance | 0 Vercel writes (process memory) | **Yes, shared with ordering** | **Unchanged** (red rule) |

## 2 · On-demand refresh

**The route:** `POST /api/revalidate`.
- Header `x-revalidate-secret: <REVALIDATE_SECRET>`, body `{"tags": [...]}`.
- Tags: `marketing-countries`, `marketing-plans`, `marketing-faq`. Every country page carries the countries tag, so expiring all three refreshes every marketing page.
- The route is perf-1's, byte-identical:
  - POST only;
  - the secret in a header, compared in constant time;
  - **503 when the variable isn't set**;
  - 401 for a wrong secret;
  - 400 for an unknown tag.

**What calls it, and when:**

| Change | How the pages are told | Works today? |
|---|---|---|
| Admin › Countries (country settings), its comparison status, Admin › Billing (payment model) | `revalidateMarketing([countries])` in-process | ✓ (no secret needed) |
| Admin › FAQ text | `revalidateMarketing([faq])` in-process | ✓ |
| FAQ translator, after a run that wrote | `scripts/faq-translate/main.ts` → POST /api/revalidate `marketing-faq` | ✗ until `REVALIDATE_SECRET` is a GitHub secret and set on Vercel |
| Competitor check, when a comparison verdict changes | `scripts/competitor-check/main.ts` → POST, `marketing-countries` | ✗ same |
| A migration through `scripts/db-migrate.cjs` | POSTs every tag after each migration | ✗ until the secret is in the shell that runs it |
| Prices or plans (SQL only) | db-migrate.cjs as above, or the command below | as above |
| Competitor entries | nothing needed: no cached page reads them; the landing reads only the comparison switches (countries tag); the comparison pages are per request | ✓ |

**🔴 What you need to do, before deploying this commit:**
1. Make a long random secret, for example with `openssl rand -hex 32`.
2. Vercel → Project → Settings → Environment Variables: `REVALIDATE_SECRET` = that value, **Production**.
3. GitHub → repository → Settings → Secrets and variables → Actions: `REVALIDATE_SECRET` = the same value. Both workflows already pass it.
4. Optional but recommended: `export REVALIDATE_SECRET='…'` in your `~/.zshrc`. Then every migration I run through `db-migrate.cjs` refreshes the pages by itself; my shell loads your profile.
5. Deploy. Then `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://www.hatchgrab.com/api/revalidate` should print **401**, not 503.

**The one-line command to refresh everything after a migration** (new: `scripts/revalidate-pages.cjs` now runs directly):

```
REVALIDATE_SECRET='<the secret>' node scripts/revalidate-pages.cjs
```

It refreshes all three tags and exits 0 on success; name tags after it to refresh only those. The same thing with curl:

```
curl -sS -X POST https://www.hatchgrab.com/api/revalidate -H "x-revalidate-secret: $REVALIDATE_SECRET" -H 'content-type: application/json' -d '{"tags":["marketing-countries","marketing-plans","marketing-faq"]}'
```

- **A Supabase dashboard edit** used to show within 5 minutes. It now needs that command.
- **The warnings changed.** The scripts' missing-secret warnings no longer promise "within 5 minutes"; they print the command.

## 3 · Built ahead: the proposed list

`lib/built-ahead-countries.ts`: **GB US IE AU NZ CA FR DE**, so /uk /us /ie /au /nz /ca /fr /de, each with /features and /faq. That's 24 pages.

- **The English-speaking six:** as you named them.
- **FR:** the only country besides GB and the US with trucks on file. A read-only count of trucks by country: GB 10 (1 customer), FR 4, US 1.
- **DE:** the largest European market, and the first comparison page.
- **No traffic data is in the repo or the database,** so nothing else qualified. **Changing the list is a one-line edit** in that file. The pages read nothing else from it.
- **Everything else** renders on its first visit and is then kept like a built-ahead page (§5 test 2).
- `dynamicParams = true` stays: the cwv-2 note holds. Under `false`, a page not built ahead would 404, and a built-ahead one 404s after a refresh.

## 4 · Data caches

- **Marketing-only** (`lib/marketing-cache.ts`, `lib/faq/public-cache.ts`): **no expiry** (`MARKETING_REVALIDATE = false`).
  - Refreshed by the same tags.
  - Each key now includes the deployment (`VERCEL_DEPLOYMENT_ID`, else the commit, else 'local'). Vercel's data cache outlives a deployment, and with no expiry an entry written by older code would otherwise be read by newer code indefinitely.
- **Shared with ordering:** the four in-memory 60-second readers listed in §1. **Left exactly as they were.** They're process memory, not Vercel writes.

## 5 · Checks

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| ESLint (changed files) | 0 errors; 1 warning, already on HEAD (an unused disable comment in revalidate-pages.cjs) |
| **New `scripts/vercel-cost-1.cjs`** (source + git only, in the sweep) | **30 passed, 0 failed**. Covers: no timer anywhere under app/(public); the data cache keyed and timer-free; the built-ahead list; the route unchanged; every writer calls it; compare and legal unchanged; **🔴 59 ordering/checkout/payment/KDS/dashboard/Add order/heartbeat/auth/Manage/admin/app paths + 11 shared readers byte-identical to `d309e4ef`, no new file there**; this work changed only its own files |
| **New `scripts/vercel-cost-1-local.cjs`** (production build on the in-memory stand-in) | **16 passed, 0 failed**, detailed below |
| cwv-2 | 43 passed, 1 failed. The same as HEAD: "20 ordering … paths unchanged since ceda135d" already fails there, from later work. The three page checks were re-pinned to the new rule |
| gsc-index-2 (on the stand-in build) | **896 passed, 0 failed** |
| pricing-copy-4 | **1157 passed, 0 failed** |
| perf-1 | 50 passed, 0 failed (the data-cache check re-pinned) |
| perf-1-local (its refresh proofs, on the stand-in build) | **15 passed, 0 failed** |
| **Sweep of 105 offline harnesses, HEAD vs this commit** | **no difference**. The three that differed in the parallel run are identical when run alone (language-phase-1b 3112/392 on both; event-types-render exits 1 on both; language-phase-1e-tidy 61/0 on both). The other failures are the same on HEAD |

**vercel-cost-1-local in detail:**
- The build prerenders exactly the 24 pages, each with `initialRevalidateSeconds: false`; the three routes still accept other countries.
- **/mt, which wasn't built ahead:**
  - first visit 200 (MISS), canonical /mt;
  - second visit HIT;
  - header `s-maxage=31536000`, so no timer;
  - /mt/features and /mt/faq are 200 too.
- **A Pro price change in the stand-in:** /uk still showed £29 and /mt €29 until `POST /api/revalidate {"tags":["marketing-plans"]}`. The **very next** request showed £33 / €33, was then kept (HIT), and went back the same way.
- **A FAQ that went empty:** the kept 404 came back as 200 on the very next request after `marketing-faq` was refreshed. A cached 404 is not stuck.
- **The route:** no secret or a wrong secret → 401; an unknown tag → 400.

## 6 · Estimates

**ISR writes per day:**
- **Before: ~100k units**, from the 5-minute rebuilds. Up to ~50k of the bill may also have come from the 651 build-time prerenders × 1.5 deploys a day, if Vercel counts those.
- **After:** each page that is visited is rebuilt **once per deployment and once per refresh**, never on a clock. Each rebuild is ~52 units, and there are ~620 visitable pages.
  - **Deploy daily**, with a refresh most days: ≤ ~1.3 × 620 × 52 ≈ **≤ 42k**, and less as crawlers skip pages.
  - **Deploy every 3 days** or so: ≈ **10–15k**.
  - Plus ~1.25k per deploy for the 24 built-ahead pages.
- **So: from ~100k to roughly 10–45k a day (55–90% fewer).** The biggest remaining lever is how often you deploy, because each deployment starts with an empty page cache.
- **Note:** once the translator runs again after 1 December, each hourly run that writes refreshes every marketing page (the FAQ tag is on all of them via the footer). That gives a short, temporary spike while it catches up (~33 jobs, 2–3 runs).

**Build time per deploy:**
- **Production today:** 5 min. The latest build: compile 36 s, TypeScript 71 s, **"Generating static pages (1631)" 2.5 min**, then finalize and deploy.
- **What the 1,631 are:** the 651 marketing pages; 868 compare/legal parameters, which are listed but rendered per request, so cheap; and the rest.
- **After:** 24 marketing pages, so that step should fall to well under a minute and the build to **~3 min**, with Build CPU roughly halved.
- **Locally:** the whole stand-in build took 98 s, generation 2.1 s. It isn't representative of Vercel's database round-trips.

## 7 · Server time: what runs most often (report only, nothing changed)

**Vercel crons** (vercel.json), about **1,160 invocations a day**:

| Cron | Schedule | Calls/day |
|---|---|---|
| auto-reject-offline-orders | */5 | 288 |
| partner-sends | */5 | 288 |
| cancel-stale-authorizations | */10 | 144 |
| outreach-replies | */10 | 144 |
| loyalty-stamps | */10 | 144 |
| capture-stranded-authorizations | */15 | 96 |
| demo-cleanup | hourly | 24 |
| billing | hourly at :05 | 24 |
| account-deletion-due, custom-domain-check, whatsapp-maintenance, order-retention | daily | 1 each |
| comparison-summary | weekly | — |

**GitHub Actions** (run on GitHub; they reach Vercel only through the site):
- faq-translate: hourly at :25 (24/day; it calls /api/revalidate only after a run that wrote);
- hatchgrab_scrape: hourly;
- competitor-check, daily_scrape, discovery_prune: daily.

**Per open screen** (each line is per device or tab while it is open):

| What | Where | Interval | Server calls per hour open |
|---|---|---|---|
| Reachability ping | `components/WebOfflineBanner.tsx` (dashboard, KDS) and `lib/native/reachability.ts` (apps), HEAD `/api/ping` | 10 s | **360** |
| Heartbeat | `lib/native/useHeartbeat.ts` (apps) and Manage (`app/(app)/manage/[token]/page.tsx`), POST `/api/heartbeat` | 15 s | **240** |
| Add order capacity snapshot | `components/dashboard/AddOrderPanel.tsx`: ticks every 1 s, but reads only when the snapshot is >10 s old (5 s throttle, hidden-tab and offline gates) | ≤ 10 s | ≤ 360 while the panel is open on a manual event |
| Customer order page menu poll | `app/(app)/trucks/[slug]/order/page.tsx`, `/api/menu/<slug>?event_id=…` (paused while paying or on the receipt) | 30 s | 120 per customer on the form |
| Dashboard fallback refresh | `app/(app)/dashboard/[token]/page.tsx` fetchAll (realtime is the main path) | 60 s | 60 |
| KDS fallback refresh | `app/(app)/dashboard/[token]/kds/page.tsx` | 60 s | 60 |
| Paperwork links | `components/manage/PaperworkTab.tsx` | 240 s | 15 |
| Local only, no server call | printer status (20 s), print watcher (20 s), the apps' outbox counters (5 s), order-card and clock ticks (15–30 s) | — | 0 |

- **An example:** one truck with the dashboard open 10 hours on an app device makes about 6,000 server calls a day: ping 3,600, heartbeat 2,400 and the 60-second refresh 600. That figure assumes the app's ping and heartbeat, with Add order idle.
- **Also:** the proxy (`proxy.ts`) runs on every request, marketing pages included.

## 8 · What changed (commit `5df925d8`)

| File | Change |
|---|---|
| `app/(public)/[country]/page.tsx`, `features/page.tsx`, `faq/page.tsx` | `revalidate = false`; `generateStaticParams` from the built-ahead list; `dynamicParams = true` kept. Comments only otherwise; no content |
| `lib/built-ahead-countries.ts` (new) | the 8 countries |
| `lib/marketing-tags.ts` | `MARKETING_REVALIDATE = false` (was `MARKETING_REVALIDATE_SECONDS = 300`) |
| `lib/marketing-cache.ts` | no expiry; `DEPLOYMENT_KEY` in every key |
| `scripts/revalidate-pages.cjs` | runs directly (every tag, or those named); new warning text |
| `scripts/competitor-check/main.ts`, `.github/workflows/faq-translate.yml` | the "within 5 minutes" warning and comments corrected (no behaviour change) |
| `scripts/vercel-cost-1.cjs`, `scripts/vercel-cost-1-local.cjs` (new) | the checks |
| `scripts/cwv-2.cjs`, `scripts/perf-1.cjs` | re-pinned to the new rule (four checks) |

**Not changed:**
- the route;
- Admin;
- ordering;
- the shared readers;
- the proxy;
- compare and the legal pages: still rendered per request, so no ISR entry and no timer. Making them cached would mean moving their host check out of the page, a rendering change; their cost is CPU per request, not ISR writes.

## 9 · Things to know

- **Order matters:** add `REVALIDATE_SECRET` to Vercel and GitHub **before** deploying this. Without it:
  - translator saves stay hidden until the next deploy;
  - competitor-check verdicts likewise;
  - migrations not refreshed by hand likewise.
  - Admin edits still work.
- **A first visit** to a country page that wasn't built ahead renders on demand, roughly a second slower, once per deployment.
- **If the database fails** during such a first render, that visitor gets an error, nothing is stored, and the next visit retries. A built-ahead page keeps its last good copy, as before.
- **Your local `.next`** now holds the stand-in build used for the tests. Run `next build` again before a local `next start` against the real data.
- **Outside calls, all read-only:**
  - one unauthenticated POST to the live `/api/revalidate` (answered 503, which is how I know the secret isn't set);
  - `gh` run logs;
  - `vercel ls` / `vercel inspect --logs` for build times.
- **One read-only database query:** truck counts by country (aggregate only). It is shown here:

  ```sql
  select country, count(*) filter (where is_customer) as customers, count(*) as all_trucks from trucks group by country order by customers desc, all_trucks desc limit 30;
  -- GB 1 / 10 · FR 0 / 4 · US 0 / 1
  ```

  Plus two column-name lookups on `information_schema`.
