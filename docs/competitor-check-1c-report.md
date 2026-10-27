# competitor-check-1c — report

**27 October 2026.** Written for Dominic.
- **Nothing was run:** no tests, harness, sweep or tsc, as asked.
- **Nothing was fetched, committed, pushed or deployed.**
- **No secret, `.env*` file or database row was read.**
- **Nothing in the brief arrived garbled, and no instruction contradicted another.** "Remove every ANTHROPIC_API_KEY
  reference" applies to the workflow; the checker's start-up check still names it, because it must refuse it.

## 1 · What competitor-check-1 still has to do or check

`git status` is clean: everything is in commit `a8883fe6 compare ongoing`. Fourteen items:

1. **Run the SQL.** `supabase/migrations/20261043_competitor_check_1.sql` (the tables and columns) is NOT RUN. Then run
   `20261044_competitor_check_candidates.sql` (70 candidates), which needs 20261043 first.
2. **Set up the login** (changed by this workstream, §2):
   - create the federation rule and service account on the Anthropic side;
   - add the four repository **variables**;
   - optional: add `BREVO_API_KEY` and `EMAIL_FROM_ADDRESS` as secrets for the summary email.
3. **Merge to the default branch.** The schedule runs only from there; I can't push, and whether `a8883fe6` is pushed
   isn't known here.
4. **First real dry run** (Actions › Competitor check: mode `single`, competitor `gastro25`, dry_run `true`). Things only
   a live run can confirm:
   - The test fixtures were **hand-built**, not recorded. Check the live response matches: `web_fetch_tool_result` text
     at `content.content.source.data`.
   - The strict `record_findings` schema (written with `anyOf` nullables) is accepted.
   - SDK 1.3.0 passes `fallbacks: "default"` through.
5. **`scripts/competitor-check/main.ts` has never run anywhere.** The first workflow run is its first execution.
6. **Measure the real cost.** The estimates (deep ≈ $0.72 a competitor, about $142 for the first full deep check; about
   $7 a normal month) come from guessed token counts. Then decide: second-check model on `claude-haiku-5-5` (≈ $48), or
   raise the monthly cap for the first month.
7. **Then press "Start full deep check"** in Admin › Pricing check › Automatic checks, after a `deep` run with `limit 3`.
8. **The old harness's workflow check will now fail.** `scripts/competitor-check-1.cjs` still expects
   `secrets.ANTHROPIC_API_KEY` in the workflow (line ~289). It needs a re-pin to the federation variables (not done:
   "no tests").
9. **`docs/competitor-check-1-report.md` is out of date on the login.** Its §1, §3 and §10 still say to add
   `ANTHROPIC_API_KEY`; this report replaces those steps.
10. **The sweep isn't cleanly green.** `add-order-refresh-inputs.cjs` failed different timing checks on each of three runs
    under load (code this work doesn't touch). Confirm it on a quiet machine.
11. **`scripts/pricing-check-1.cjs` is still not registered** in `scripts/harnesses.json` (it passes 55/55 when run by
    hand).
12. **No "approved mockup" was found** in the repo. The Automatic checks tab was built from the brief's words; compare it
    with the mockup if there is one.
13. **Four competitors have no website** (EasyEats, Eventifood, Hatches Up, RapidOrderz), so the checker skips them until
    a URL is added.
14. **The German comparison research is not imported** (only 7 DE plans are live). Import it before the candidate SQL if
    you want it; the candidate SQL skips existing names and domains either way.

(The end of competitor-check-1's chat reply — the read-only queries and the NOT RUN SQL blocks — was cut off. Both SQL
files and the report hold the full text.)

## 2 · Workload Identity Federation — what changed

**`.github/workflows/competitor-check.yml`**
- **The job** now has `permissions: id-token: write` and `contents: read`. Its `env` is read from repository
  **variables**:
  - `ANTHROPIC_FEDERATION_RULE_ID` = `${{ vars.ANTHROPIC_FEDERATION_RULE_ID }}`
  - `ANTHROPIC_ORGANIZATION_ID`
  - `ANTHROPIC_SERVICE_ACCOUNT_ID`
  - `ANTHROPIC_WORKSPACE_ID`
  - and `ANTHROPIC_IDENTITY_TOKEN_FILE: /tmp/gha-jwt`.
- **A new step, "Get the GitHub OIDC token",** runs before the checker. It fetches the token with the `curl … | jq -r
  .value` you gave, for audience `https://api.anthropic.com`, into `/tmp/gha-jwt`, and stops the job if that fails. It
  then starts a background loop (`nohup … &`) that re-fetches the token every 60 seconds.
  - Each fetch writes a temporary file and renames it over the old one, so the SDK never reads half a token.
  - A failed re-fetch keeps the last good token and logs to `/tmp/gha-jwt-refresh.log`.
- **Every `ANTHROPIC_API_KEY` reference is removed:** the step's `env` and the header comment, which now explains the
  federation login and the four variables.

**`scripts/competitor-check/main.ts`**
- **Before any API call** (and before the client is built), it stops with a plain message if:
  - any of the four variables is missing, naming it ("… is not set (a repository variable, for the Claude API's Workload
    Identity Federation login)"), or
  - `ANTHROPIC_API_KEY` is set ("Remove it: this checker logs in with Workload Identity Federation, and an API key would
    be used instead").
- **The client is built with no credential argument**, so the SDK finds the federation variables and the token file
  itself. I kept the two non-credential options, `maxRetries: 5` and `timeout`, which the brief for competitor-check-1
  asked for (retries on rate-limit / overloaded errors).
- The header comment is updated.

**The SDK: no upgrade needed.** The installed `@anthropic-ai/sdk` **1.3.0** has the credentials module
(`lib/credentials/`, `core/credentials.js`). It reads `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`,
`ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_WORKSPACE_ID` and `ANTHROPIC_IDENTITY_TOKEN_FILE` (checked by name in the
installed files).

**To check on the first run:**
- The token loop is started in its own step and is relied on to keep running into the checker step. GitHub-hosted runners
  normally keep a step's background processes alive until the job ends. If the refresh log stays empty, or the login
  fails after about 5 minutes, move the loop into the checker step.
- `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_PROFILE` would also outrank federation in the SDK. Neither is set in this
  workflow, and the start-up check doesn't test them.

## 3 · What you set up

1. **In the Claude Console** (your organization): create a service account and a federation rule that trusts GitHub
   Actions OIDC tokens:
   - issuer `https://token.actions.githubusercontent.com`;
   - audience `https://api.anthropic.com`;
   - restricted to this repository (and branch).

   Note its rule id, the service account id, the organization id and the workspace id.
2. **In GitHub › the repository › Settings › Secrets and variables › Actions › Variables**, add `ANTHROPIC_FEDERATION_RULE_ID`,
   `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID` and `ANTHROPIC_WORKSPACE_ID`. Do **not** add an
   `ANTHROPIC_API_KEY` secret; if one exists, delete it.
3. **Then follow §1:** items 1, 3, 4, 6 and 7, in that order.

## 4 · Files changed

- `.github/workflows/competitor-check.yml`
- `scripts/competitor-check/main.ts`
- `docs/competitor-check-1c-report.md` (this file)

This report is docs/competitor-check-1c-report.md.
