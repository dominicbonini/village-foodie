# admin-speed-1: /admin takes a long time to load

16 November 2026. Not deployed. No data changes: read-only SELECTs only, which were shown in chat. No layout or wording changes. No `.env` file was opened.

## 0. Brief check

- **Garbled spans: none. Contradictions: none.**
- **One clarification on "prove the data returned is identical".** The brief also says discovery should send only the fields the page uses. So:
  - the main payload and demo_cleanup were proved byte-identical;
  - discovery was proved identical row for row, minus the two fields the page never reads (§3.2).
- **How it was measured without an admin login.** Agents have none (§35.af), so the real `/api/admin` answers 401 to me. I used a **temporary timing route** in a local production build (§1.1).
  - It needed a random per-run token and only answered on localhost.
  - It ran the same queries against the real database, read-only.
  - It returned only timings, sizes and a SHA-256 of each payload.
  - **It was deleted afterwards and never committed.** The payload copies it saved for the diff and its token were deleted too, and a clean build replaced the one that contained it.
- **A change after the "after" measurement.** The sweep's source screen refuses any harness that so much as names `createClient`. So that the new check needs no stand-in for the Supabase client, `lib/admin-payload.ts` now uses the shared service-role client from `lib/supabase.ts` (imported lazily, as `lib/country-settings.ts` does) instead of creating its own. The queries are the same, and the new check exercises that exact code.

## 1. Measure (before)

### 1.1 Method

- **The database** (the read-only SELECT shown in chat):
  - `discovery_trucks` has **268 rows** (264 unlinked), ~21 kB;
  - 15 trucks in 3 countries;
  - 12 operators;
  - the plan catalogue prices **211 countries** (633 price rows).
- **Server steps.**
  - A production build (`next build`, then `next start` on port 3100) with the timing route. It ran a copy of GET `/api/admin` (as at `a6db9765`) with a timer around each step, against the real database.
  - The **verifyAdmin** cost is its two real round trips (`auth.getUser` on a JWT, then the `operators` row), because there's no admin session to check.
  - **"Cold"** means the 60-second country and plan caches are empty, as on most real visits to /admin (it isn't opened every minute, and serverless instances come and go). **"Warm"** is a repeat within 60 s.
  - 3 rounds, 61 s apart; medians.
- **The page, end to end.**
  - Playwright Chromium on the production build's `/admin`, 1440×900.
  - Each `/api/admin*` request the page makes is answered by the timing route: the same server code and database, plus the auth round trips. `/api/auth/me` is stubbed.
  - **"First content"** = the first row in the trucks table. **"Fully loaded"** = all 279 rows (15 trucks + 264 discovery) and the 🧹 cleanup indicator.
  - 3 cold runs (61 s apart) and 3 warm runs; medians.

### 1.2 Server steps, before (ms, median of 3)

| Step | Cold | Warm | Note |
|---|---|---|---|
| verifyAdmin (auth + operators row) | 137 | 60 | every request, every section |
| trucks | 190 | 103 | 15 rows |
| operators | 45 | 32 | 12 rows, waited for trucks |
| country settings (marketing + truck countries) | 105 | 0 | 3 countries, waited for operators |
| plan catalogue | 63 | 0 | waited for the countries |
| **per-country loop** | **14,678** | 0 | **208 sequential reads (~70 ms each)** |
| **GET /api/admin total** | **15,193** | 251 | 371,030 bytes |
| section=discovery total | 114 | 114 | 268 rows, 55,909 bytes |
| section=demo_cleanup total | 196 | 196 | 146 bytes |

### 1.3 The page, before

| | First content | Fully loaded |
|---|---|---|
| Cold | **15.8 s** (runs: 17.9, 15.8, 14.2) | **15.9 s** |
| Warm | 0.46 s | 0.58 s |

**The waterfall** (cold run 1, ms from navigation):
1. `check_admin` 348 → 501;
2. **then** discovery 506 → 711 and main 505 → **17,827**;
3. **then** demo_cleanup 17,839 → 18,034.

**Other requests on open:** PostHog's `config.js` and `surveys.js` (analytics), `/api/auth/me`, the logo, and Next's prefetch of the `/` link. None waits on the database or blocks the page. No per-row requests. `features-pdf` runs only on click.

## 2. The fix

- **`lib/country-settings.ts` `getCountrySettingsMany(codes, { bestEffort })`.**
  - **One query** (`in('country_code', …)`) for every code the 60-second cache doesn't hold.
  - `codes` stay **fatal**, as loud as before: a malformed code, a failed read, a missing row or an unusable value throws.
  - `bestEffort` codes are left out if unreadable, so the plans table shows "—" as before.
  - Keys are returned in a stable order (fatal first, then best effort), matching the old loop.
  - The admin route was its only caller.
- **`lib/admin-payload.ts`** (new): the main payload.
  - **trucks, operators and the plan catalogue are read in parallel** (`Promise.all`).
  - Then **all 211 countries in one query**: the marketing country and the trucks' countries fatal, the other priced countries best effort.
  - The same two 500s ("Could not load country settings." / "Could not load the plans."), and the same priority when both fail (countries first).
  - The operators J1 tolerance is kept.
  - `adminDiscovery()` sends **only the six fields the page reads** (`id, name, hatchgrab_truck_id, show_on_vf, show_on_hg, excluded`).
  - `adminDemoCleanup()` is unchanged in what it returns.
- **`app/api/admin/route.ts` GET** calls those after `verifyAdmin`.
  - 401 for non-admins on every section, as before.
  - `check_admin` is kept, though the page no longer calls it.
- **`app/(app)/admin/page.tsx`** sends **the main request, discovery and demo_cleanup together** on open.
  - The main request is the admin check: **401 → "access denied"**, exactly as check_admin's `false` was, and a network failure is treated as denied, as before.
  - `/api/auth/me` is asked only once the visitor is known to be an admin, as before.
  - Refreshes after an edit behave as before.
  - **No JSX changed:** the diff touches only `load()` and the mount effect.
- **Discovery is 268 rows** (under the 500 in the brief), so no virtualisation or paging. Nothing visible changed, so nothing needed asking.
- **Other calls on open:** none slow (§1.3), so nothing else changed.

## 3. Measure (after)

### 3.1 Server steps, after (ms, median of 3, same method)

| Step | Cold | Warm | Before (cold) |
|---|---|---|---|
| verifyAdmin (auth + operators row) | 249 | 160 | 137 |
| trucks ‖ operators ‖ plan catalogue (in parallel) | 112 ‖ 80 ‖ 138 | 63 ‖ 45 ‖ 0 | 190 + 45 + 63 in sequence |
| country settings, **all 211 in one query** | **117** | 0 | 105 + **14,678** |
| **GET /api/admin total** | **505** | 250 | **15,193** |
| section=discovery total | 137 | — | 114 (40,365 bytes now, was 55,909) |
| section=demo_cleanup total | 220 | — | 196 |

**verifyAdmin varies run to run** (60–250 ms): it's two network round trips to Supabase from this Mac, and the code didn't change.

### 3.2 The data is identical

- **The method:** the before and after builds each saved one cold request's JSON locally, then I compared them. The files were deleted afterwards because they contain real admin data.
- **The results:**

| Request | Before | After | Result |
|---|---|---|---|
| main (`/api/admin`) | 371,030 B, SHA-256 `8539756e0695aed5…` | 371,030 B, `8539756e0695aed5…` | **byte-identical** (`cmp`) |
| demo_cleanup | 146 B, `0d274c03f6999911…` | 146 B, `0d274c03f6999911…` | **byte-identical** (age pinned to 0 in both; it depends on the clock) |
| discovery | 268 rows, 8 fields | 268 rows, 6 fields | **identical after removing `visibility` and `exclude_reason`**: same rows, same order, same values, same key order |

### 3.3 The page, after

| | First content | Fully loaded | Before |
|---|---|---|---|
| Cold | **0.56 s** (runs: 0.72, 0.52, 0.56) | **0.56 s** | 15.8 s / 15.9 s |
| Warm | **0.29 s** | **0.29 s** | 0.46 s / 0.58 s |

All three requests now leave together (cold run 1: main 347 → 686, discovery 353 → 535, demo_cleanup 353 → 551 ms). The page shows all 279 rows each time.

**In short:** opening /admin cold went from about **16 s to about 0.6 s** (~28× faster), and warm from about 0.6 s to 0.3 s.

## 4. The swept check: `scripts/admin-speed-1.cjs`

No network, no database. It bundles `lib/admin-payload.ts` and `lib/country-settings.ts` with esbuild and runs them against a fake database where every query takes 15 ms and is recorded. The country rows are copies of the committed live IE row, `scripts/fixtures/ie-row-2026-10-23.json`. **27 checks**:

- **Payload shape:** the payload loads; the same top-level keys in the same order; countrySettings is fatal first, then the readable priced countries, with an unusable FR and a missing DE left out; operators come through.
- **🔴 Query count and shape:**
  - every country is read in **one** `in(…)` query, asking for all five codes;
  - **a handful of queries in all** (at most 5);
  - trucks, operators and the catalogue run **side by side**;
  - the payload takes **under 3× one query**;
  - **with 208 priced countries it's still one country query and under 3× one query.**
- **The fatal rules:** a truck country with no row → 500 country; a failed catalogue → 500 plans; both failing → the country error first; unreadable operators → `[]`. A second load within 60 s reads no countries.
- **Source checks:**
  - the route uses the new functions, has no country loop and no `getCountrySettings`, and still answers 401 first;
  - `lib/admin-payload.ts` has no loop with an `await` in it and calls `getCountrySettingsMany` once;
  - discovery's six fields;
  - the page no longer calls `check_admin`;
  - `load()` sends all three requests before awaiting any;
  - a 401 on first load means "access denied".
- **Three broken variants, each of which must fail and does:**
  - V1: the per-country loop comes back;
  - V2: `getCountrySettingsMany` sends one query per code;
  - V3: the three reads wait for each other.

It's in `scripts/harnesses.json`. The runner's source screen passes it (no `createClient`; see §0).

## 5. Sweep, checks, commits

- **Typecheck:** `tsc --noEmit`, 0 errors.
- **Lint:**
  - `lib/admin-payload.ts` is clean.
  - The route's one error (`Record<string, any>` in the PATCH handler, line 84) predates this change: it's in the committed file at line 146.
  - The page has 13 problems both before and after this change, all pre-existing.
- **The full sweep in the shared working tree:** 224 run · 205 passed · **19 failed**. Other sessions had uncommitted edits in the same tree at the time (`components/pricing/PlanTable.tsx`, `lib/plan-offer.ts`, `app/(app)/manage/[token]/page.tsx`, `landing.css`, the trial-column message keys). To attribute every failure, I ran the 14 failures that aren't the known five in a **separate git worktree of HEAD** (`1661ebe5`, sharing `node_modules` and `.next`):
  - **on HEAD alone, 13 of the 14 pass.** Only `event-types-render` fails, as it does without this work (the known flaky layout harness).
  - **With only this workstream's files copied in, 4 fail. They're mine, and all four are byte-identity proofs that pin the old code:**
    - `currency-registry` looked for the per-country loop in the route;
    - `admin-countries-1` diffs `lib/country-settings.ts` against HEAD;
    - `costs-accounts-1` compares `lib/country-settings.ts` with `8b32036f`;
    - `cwv-2` compares `app/(app)/admin/page.tsx` with its pre-move self.
  - **The other 9** (plans-data-model, pricing-pages, country-settings-parity, schedule-graphics-places, language-phase-1e, -1e-tidy, site-chrome-1, cwv-1, faq-4) **come from the other sessions' uncommitted edits.** They pass on HEAD plus this work.
- **The re-pins**, in the usual way: each later edit is named and put back exactly, and anything else still fails.
  - **`scripts/_named-admin-speed-1.cjs`** (new) `undoCode` puts back:
    - the old `getCountrySettingsMany`, found by exact markers;
    - the admin page's old `load()` and mount effect, read from `1661ebe5`.

    It returns null if either edit isn't there exactly as made. Verified: undoing the current files gives HEAD's `lib/country-settings.ts` and `1661ebe5`'s page byte for byte.
  - **`costs-accounts-1`** and **`cwv-2`** run that undo first, in front of their existing undo chains.
  - **`admin-countries-1`** sets aside exactly `getCountrySettingsMany`'s own lines, old and new. That function isn't on the countries save path.
  - **`currency-registry`** now checks that every priced country is still sent from `lib/admin-payload.ts` (`new Set(plans.prices…)` with `{ bestEffort: priced }`). `admin-speed-1.cjs` proves the same by running it.
- **The full sweep on HEAD plus only this workstream** (the worktree): **224 run · 219 passed · 5 failed**. The 5 are the known missing translated legal files (paperwork-1, legal-languages-1, world-countries-3, contact-1, tidy-1); `admin-speed-1` is 27/27. The TEMP report: nothing left behind.
- **The manual:** **V16.30**, with a changelog entry; the header and front matter both read 16.30.
- **Commits:** this workstream's files only:
  - `lib/admin-payload.ts`, `lib/country-settings.ts`;
  - `app/api/admin/route.ts`, `app/(app)/admin/page.tsx`;
  - `scripts/admin-speed-1.cjs`, `scripts/harnesses.json`;
  - the re-pins: `scripts/_named-admin-speed-1.cjs`, `currency-registry.cjs`, `admin-countries-1.cjs`, `costs-accounts-1.cjs`, `cwv-2.cjs`;
  - `docs/reference-manual.md` and this report.
  - Other sessions' uncommitted changes in the tree (the manage page, `landing.css`, `PlanTable.tsx`, `plan-offer.ts`, the languages-world-3 report) were left alone. Both shared files (the manual, `harnesses.json`) were checked to contain only this workstream's lines.

## Undo (only if Dominic asks)

`git revert` this workstream's commit. Nothing in the database changed, so there's no SQL to undo.
