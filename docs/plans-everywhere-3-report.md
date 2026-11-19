# plans-everywhere-3 — STOPPED before the FAQ migration: the deploy failed, so production doesn't have the FAQ code yet

19 November 2026, checked at 13:57 UTC. **Nothing was written to the database.**

- **Not run:**
  - `20261119_plans_everywhere_2_faq.sql`;
  - the translator;
  - `20261119_plans_everywhere_1.sql`, as you asked.
- **Untouched:** `content/legal` and the two named trucks.

## Summary

- **The deploy of `36d3b5b5` (with plans-everywhere-1 and -2) FAILED on Vercel at 13:56 UTC.** Production is still serving **`b07149ee`** (deployed successfully at 11:14 UTC). That build predates this work, so the live site doesn't know the new FAQ show-in values.
- **Why I stopped:** running the FAQ migration against that code would do exactly what we planned to avoid. The four card answers (…0002, …0006, …0007, …0011) would vanish from **every** live FAQ page, /uk included, and the four pay-at-the-truck answers would show nowhere, until a good deploy.
- **The cause looks transient:** static page generation timed out, not a code or type error (details below).
- **Next step:** a **Redeploy** of `36d3b5b5` in Vercel. Once it shows "Ready", tell me and I'll run the migration, the translator and the live checks exactly as briefed.

## 0 · Prompt check

- **Garbled spans:** none.
- **Contradictions:** none in the wording. But the brief rests on "Deployed", and the deploy failed. Running the migration anyway would break the live FAQ, so I'm reporting rather than choosing.

## 1 · What I checked

| Check | Result |
|---|---|
| `1ad9b83b` (plans-everywhere-2) on origin/main | ✅ yes. origin/main is `36d3b5b5` ("pro plan", docs only). The FAQ code and the migration on origin/main are identical to the commit. |
| GitHub deployment record for `36d3b5b5` | **failure**, 13:56:19 UTC. Vercel: "Deployment has failed — run `npx vercel inspect dpl_81z8U7Y1ojFv3RAEW2DsWULZeHoq --logs`". |
| The last successful production deployments | `b07149ee` (11:14 UTC) ✅ and `9855e7a5` ✅; both predate plans-everywhere-1 and -2 |
| Live www.hatchgrab.com/jm/features | still renders "Take payment on your phone" and "Online payments" (new code hides both in Jamaica), which confirms the old build is live |

**The build log** (read-only, `npx vercel inspect … --logs`, 1,280 lines):
- **What timed out:** static generation of the country landing pages. `/ki`, `/kg`, `/la`, `/mo`, `/mv`, `/fm` and `/mn` each "took more than 60 seconds".
- **How it failed:** each was retried twice; `/mn` failed after 3 attempts. "Export encountered an error on /(public)/[country]/page: /mn, exiting the build", then `npm run build` exited with 1.
- **Why it looks transient:**
  - All seven failed and retried at the same instants (13:54:05, 13:55:09), as if **one build worker was stuck**.
  - There is no compile or type error anywhere in the log; the build had already rendered 1,486 of 1,631 pages.
  - The same pages render in a second or two on a local server (/tz, /br, /uk, /jm were all rendered this week from these commits).
- **Not seen in the manual before.** If a redeploy fails the same way, it needs looking into; one possible fix is the pages' static-generation timeout, but I haven't changed anything.

The FAQ lines in the log ("…is hidden here by show_in 'plan:payg'", "no up-to-date es-PA translation") are the normal per-country notes, not errors.

## 2 · The live FAQ today (unchanged, baseline)

| Page | Status | Four card answers (English markers) | Four pay-at-truck answers |
|---|---|---|---|
| /uk/faq | 200 | 4/4 | 0/4 |
| /jm/faq | 200 | 3/4 (…0002 shows its single-plan wording here, which my marker doesn't match) | 0/4 |
| /br/faq | 200 | in Portuguese: English markers don't apply | 0/4 |
| /tz/faq | **404** (no Swahili FAQ translations yet) | — | — |

## 3 · What happens after a good deploy (unchanged plan)

1. Confirm it's live: /jm/features no longer shows "Take payment on your phone".
2. Run the FAQ migration:
   `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261119_plans_everywhere_2_faq.sql`
   - Its SQL is in `docs/plans-everywhere-2-report.md` §2; I'll show it inline in chat again when I run it.
   - It needs no approval flag: no protected table.
3. Live checks:
   - /uk/faq shows the four card answers;
   - /jm/faq shows the four pay-at-truck answers in English and none of the card ones;
   - /br/faq shows the card answers.
4. **The translator:**
   - `.github/workflows/faq-translate.yml` has a `workflow_dispatch` trigger. That is "the same way the hourly job runs it": same job, same login (Workload Identity Federation), same spend cap of $2 per run by default.
   - So it can be triggered once with `gh workflow run faq-translate.yml`, or I wait for its run at :25 past the hour.
5. Confirm /tz/faq loads in Swahili with the pay-at-truck answers, and spot-check the four new answers in fr-FR and es-MX against the English.

## 4 · Hard rules

- No database writes; no SQL was run this round.
- No deploy, redeploy or push.
- Pizzeria Gusto and Le Roi du Churrasco were not touched.
- `content/legal` is unchanged; the plans migration was not run; no .env file was opened.
- **Outside calls, all read-only:**
  - `git fetch`;
  - GitHub's deployment and status API through `gh`;
  - `npx vercel inspect --logs`;
  - plain GETs of public live pages.
