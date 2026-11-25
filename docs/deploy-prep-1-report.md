# deploy-prep-1: a deploy branch with only vercel-cost-1 and what came before it

**24 November 2026 · nothing pushed, nothing deployed, no `vercel` command run · no .env file opened · the only database access was one
read-only SELECT**

## 0 · Result

- ✅ **The local branch `deploy-vercel-cost-1` is at `5df925d8`** (vercel-cost-1). It was made with `git branch` only, so `main`,
  `france-vat-1` and the checked-out files didn't move.
- ✅ **It contains 8 commits beyond `origin/main` (`f2e2b4ab`) and 140 changed files.** None is a france-vat-1, enquiries, inbox or
  france-records / receipts commit or file.
- ✅ **The ordering, checkout, payments, KDS, dashboard, Add order, heartbeat, offline / outbox, auth, Manage and app paths are
  byte-identical to `origin/main`.** That covers 61 paths and 545 files. A wider set (all of `app/(app)`, `app/api`, `components`, the
  shared readers, `public`, `supabase/functions` and the package files) is identical too: 887 files.
- ✅ **The one migration in the range (`20261122_languages_switch_4.sql`) is already applied** to the live database.
- ✅ **The checks pass on the branch** (in a worktree, guarded, since removed):
  - `scripts/vercel-cost-1.cjs`: **30 / 30**;
  - `scripts/vercel-cost-1-local.cjs`: **16 / 16** (on a stand-in production build);
  - `tsc`: **0 errors**;
  - the production build: **passed**.
- 🔴 **Before you deploy, set `REVALIDATE_SECRET`.** Add it in Vercel (Production) and as a GitHub secret (vercel-cost-1 report §2).
  Without it, the live `/api/revalidate` keeps answering **503**: the route code is unchanged, so the 401 check in §5 depends on that
  setting, not on this deploy. Also confirm the commit of the current production deployment (§6).

## 1 · The branch

```
git branch deploy-vercel-cost-1 5df925d8      # no checkout; HEAD stays france-vat-1
```

- **origin/main:** `f2e2b4ab` ("languages"), fetched first. It is an ancestor of `5df925d8`.
- **Unmoved:**
  - `main` is still `59ae6161`;
  - `france-vat-1` is still `ff4b3f90`;
  - the checked-out branch is still `france-vat-1`.

## 2 · What's in the range (`origin/main..deploy-vercel-cost-1`)

**8 commits:**

| Commit | Date | What |
|---|---|---|
| 2117bbb0 | 22 Nov 21:57 | languages-switch-4: Cambodia km-KH, Laos lo-LA, Ethiopia am-ET (migration; guarded) |
| 48fc9490 | 22 Nov 21:59 | event-types.cjs: a comment reworded and one literal split (harness screen) |
| fc44e0b3 | 22 Nov 22:00 | languages-switch-4: report |
| 389e2979 | 23 Nov 10:05 | languages-switch-5: store listings say "50+ languages"; Catalan live; Play-only listings folder |
| 981b888e | 23 Nov 10:07 | languages-switch-5: report |
| add6a761 | 23 Nov 10:17 | reference manual V16.34 |
| d309e4ef | 23 Nov 10:18 | manual-v16-34: report |
| 5df925d8 | 23 Nov 11:21 | **vercel-cost-1**: marketing country pages with no timer, built ahead only for the busiest countries |

**140 changed files, by area:**

| Area | Files | What |
|---|---|---|
| **Site code** | **6** | `app/(public)/[country]/page.tsx`, `features/page.tsx` and `faq/page.tsx` (no timer; dynamicParams true); `lib/built-ahead-countries.ts` (new), `lib/marketing-cache.ts`, `lib/marketing-tags.ts` |
| Workflow | 1 | `.github/workflows/faq-translate.yml` (passes `REVALIDATE_SECRET`) |
| Database | 1 | `supabase/migrations/20261122_languages_switch_4.sql` (already applied, §3) |
| Scripts (not deployed) | 9 | `scripts/vercel-cost-1.cjs` and `vercel-cost-1-local.cjs` (new), `revalidate-pages.cjs`, `competitor-check/main.ts` (one line), `cwv-2.cjs`, `perf-1.cjs`, `event-types.cjs`, `ios-intl-1.cjs`, `ios/listing-rules.cjs` |
| Store listings (not deployed) | 60 | `data/store-listing/*.json`, `next/`, `play/` |
| Docs (not deployed) | 63 | `docs/i18n/` (54), `docs/languages-world-2/` (4), 5 reports and the manual |

**Nothing excluded is in it.** `git log origin/main..deploy-vercel-cost-1 | grep -iE "france|vat|enquir|inbox|receipt|records"` finds
nothing, and the same search over the changed files' names finds nothing.
- france-vat-1 is built on top of these 8 commits: it has 45 commits beyond origin/main, and only these 8 are in the deploy branch.
- Local `main` (10 ahead of origin/main, enquiries-backend-1 included) isn't in it either.

## 3 · Proofs against origin/main

**Byte-identical paths** (bash, `git diff --name-only origin/main deploy-vercel-cost-1 -- <paths>`):

| Set | Paths / files | Changed |
|---|---|---|
| vercel-cost-1's own ordering list (same filter, existing paths): `app/(app)` trucks, order, o, p, dashboard (KDS and Add order inside it), kds, manage, admin, login, signup, setup, password and verify pages, app, layout and providers; `app/api` orders, menu, events, slots, dashboard, heartbeat, stripe, webhooks, payments, auth, manage, admin, native, printing, account, cron, ping, signup, setup; `components` dashboard, manage, admin, native, WebOfflineBanner; `lib` orders, payments, auth, **native (outbox, heartbeat, offline overlays)**, printing, admin, billing, slots, menu-loader, order calculations and charges, preorder; `proxy.ts`, `vercel.json`, `next.config.ts`, `android`, `ios`, `capacitor.config.ts` | 61 paths, 545 files | **0** |
| the 11 shared readers (country settings, plans, comparison switches, FAQ, Supabase client, marketing render, visitor country, marketing country…) | 11 files | **0** |
| wider: all of `app/(app)`, `app/api`, `components`, `lib/copy`, `lib/i18n`, `lib/native/outbox.ts`, `lib/native/useHeartbeat.ts`, `public` (offline.html), `supabase/functions` (heartbeat monitor), `package.json`, `package-lock.json`, `middleware.ts` | 887 files | **0** |

- **The one absent path:** `lib/stripe.ts` is in the list but exists in neither tree, so it's skipped by the same filter
  vercel-cost-1.cjs uses.
- **The diff can see a change:** the same command over `app/(public)` and `lib/marketing-cache.ts` finds the 4 known changes.
- **Tree hashes are equal on both sides** for `app/(app)` 802c0ca3, `app/api` 1ebb76e7, `components` 6ebbfd2e, `lib/native` 63f33ee8,
  `lib/orders` 5a3f5ba1, `lib/payments` 39f4d4ef, `lib/auth` f853fdf6, `android` ab417391 and `ios` cc6f529c.
- **A correction on my own first attempt:** I ran the path loop in zsh first. zsh doesn't split variables, so that loop's "0" counts
  proved nothing. I discarded them and re-ran everything above in bash; the tree hashes were valid either way.

**The migration in the range is applied** (read-only, MCP):

```sql
select country_code, locale, short_name, updated_by, updated_at from public.country_settings where country_code in ('KH','LA','ET') order by country_code;
```

| country | locale | short_name | updated_by | updated_at |
|---|---|---|---|---|
| ET | am-ET | ኢትዮጵያ | languages-switch-4 | 2026-11-22 21:57:43 UTC |
| KH | km-KH | កម្ពុជា | languages-switch-4 | 2026-11-22 21:57:43 UTC |
| LA | lo-LA | ລາວ | languages-switch-4 | 2026-11-22 21:57:43 UTC |

These are exactly the values the migration sets, so it has run. It's guarded on the old values, so a re-run would change nothing. No
other file under `supabase/` is in the range.

## 4 · The checks on the branch (in a worktree)

- **The worktree:** `<scratchpad>/wt-deploy` on `deploy-vercel-cost-1`, with no .env file in it.
- **node_modules:** first a symlink. Turbopack refused it ("Symlink node_modules is invalid, it points out of the filesystem root"), so
  I replaced it with an APFS clone (`cp -cR`, copy-on-write).
- **Disk:** `_disk-guard.cjs check` passed before each step (218 GB free). The build ran under `scripts/guarded.sh`.
- **Temp files:** the harness ran with `--require ./scripts/_harness-tmp.cjs`.

| Check | Result |
|---|---|
| `node scripts/vercel-cost-1.cjs` | ✅ **30 passed, 0 failed**: no timer; built-ahead list; route unchanged; compare and legal per request; 61 ordering paths and 11 shared readers byte-identical to d309e4ef; only its own files changed |
| `npx tsc --noEmit -p .` | ✅ **0 errors** |
| `scripts/guarded.sh npx next build` (on the stand-in: `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` = `http://127.0.0.1:54399`, dummy keys, process environment only) | ✅ compiled in 25 s; 1,004 static pages; `/[country]`, `/features`, `/faq` ● (built ahead); compare and legal ƒ |
| `node scripts/vercel-cost-1-local.cjs` | ✅ **16 passed, 0 failed** (below) |

**vercel-cost-1-local, check by check:**
- **The build:** exactly 24 country pages are prerendered (8 countries × landing, features and FAQ), none with a timer, and the routes
  stay open to other countries.
- **A first visit:** `/mt` answers 200 when rendered now (MISS), then comes from the cache (HIT, `s-maxage=31536000`, no timer).
  `/mt/features` and `/mt/faq` answer 200. `/uk` answers 200 from the build (HIT).
- **A price change:** before a refresh, /uk shows £29 and /mt €29. After `POST /api/revalidate {"tags":["marketing-plans"]}`, the very
  next request shows £33 / €33, which is then kept; it goes back the same way.
- **An empty FAQ:** a cached 404 is replaced on the very next request after its tag is refreshed.
- **The route stays closed:** no secret → **401**, a wrong secret → 401, a tag not on the list → 400.

**Afterwards:**
- the stand-in (port 54399) is stopped; nothing is listening on 54399 or 3502;
- `git worktree remove --force` deleted the worktree, its `.next` and the cloned node_modules;
- only another session's two worktrees remain, untouched.

## 5 · What to check right after the deploy

**Before:** `REVALIDATE_SECRET` set in Vercel → Project → Settings → Environment Variables (**Production**), and the same value as a
GitHub repository secret. Without it the first check answers 503.

1. **The route is closed but configured:**
   ```
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://www.hatchgrab.com/api/revalidate
   ```
   → **401**. **503** means `REVALIDATE_SECRET` isn't set on that deployment: add it and redeploy.
2. **The country pages:**
   ```
   for p in uk mt fr; do printf '%s ' /$p; curl -s -o /dev/null -w '%{http_code}\n' https://www.hatchgrab.com/$p; done
   ```
   → **200** for each. `/uk` and `/fr` are built ahead. `/mt` is rendered on its first visit; the first request may take a moment, then
   it's cached.
3. **One test-truck order page** (any test truck's public order link) loads, shows its menu and lets you reach the basket. The
   ordering code is byte-identical to what is live now (§3).
4. **Optionally, refresh the marketing pages once:**
   `REVALIDATE_SECRET='…' node scripts/revalidate-pages.cjs` → it should report the tags refreshed.

## 6 · Flags

- 🔴 **Confirm the current production deployment's commit before deploying.** I can't see Vercel (no `vercel` command, by rule).
  - If production runs `origin/main` `f2e2b4ab`, or anything already in this branch, this deploy adds only the 8 commits above.
  - If it was deployed by hand from a newer local commit (for example from local `main`, 10 ahead with enquiries-backend-1), this deploy
    would roll that back.
- **languages-switch-5's "two push blockers" are not deploy blockers.** They are about pushing the App Store listings: `/ad/faq` answers
  404, and `/mx` redirects because Mexico is off. They don't affect this web deploy.
- **The report isn't committed.** This file is in the working folder of `france-vat-1`. I didn't commit it, because the brief said not
  to change the checked-out branch's files. Commit it, or move it, as you prefer.
- **Garbled or contradictory instructions:** nothing in the prompt arrived garbled, and nothing contradicts. The only near-conflict was
  "don't change the checked-out branch's files" against "write the report to docs/"; I read the report as explicitly asked for, and
  left it uncommitted.
- **What wasn't done:** no push, no deploy, no `vercel`, no .env file opened, and no write to any database (one read-only SELECT).
