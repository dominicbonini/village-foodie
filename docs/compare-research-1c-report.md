# compare-research-1c — Spevdo (Greece) prices now survive a rebuild

24 Nov 2026 · branch `france-vat-1` · commit **`c22a0ec7`** · follows `docs/compare-research-1b-report.md`

## 1 · Summary

- I applied option (a), which Dominic chose:
  - Spevdo's three plans went into `docs/compare-research-1/raw/GR.json`: Starter €60, Growth €120, Pro €230 a month, excl. VAT;
  - `data/compare-research-1/competitors.json` was rebuilt with `build.cjs` (a full build).
- **Both pass** the importer's own validation and the 100× guard, in the build and in `--check`. Exit code 0 both times.
- **The output is byte-identical to the preview** in the earlier stop report: only Spevdo's rows change.
- Growth and Pro are corrections (`correct: true`, new ids) that supersede the stored €119 / €229.
- **I committed the two files** on `france-vat-1` as `c22a0ec7`, and nothing else is in that commit.
- No push, no deploy, no import, no database writes, no `.env` file opened. No new request went to `api.spevdo.gr`; the figures
  are the ones read once in 1b.
- This report is written after the commit, so it is **not committed**.

## 2 · Steps and results

1. **Checked that nothing had moved since the preview.**
   - HEAD was still `ec16f022`.
   - The build's inputs were identical to the preview copies: `build.cjs`, `stored-ids.json`, `stored-plans.json`, every other
     `raw/*.json` and `features.json`.
2. **Edited `raw/GR.json`** with the same script I tested in the preview.
   - The result is byte-identical to the preview's edited file (`cmp`).
3. **Full rebuild**, `node docs/compare-research-1/build.cjs`:
   ```
   instructions: 18 not relevant, 5 back to active, 15 not sold in, 18 plans corrected
   competitors 161, plans 316 (278 priced), entries 173, not relevant 65, unreadable 38
   ✓ the importer's own validation (researchProblems) and the 100× guard pass — nothing written to any database
   ```
   - Exit code 0.
   - Before this change the same build gave 275 priced plans and 16 corrected.
4. **Output vs preview:** `cmp` found the new `competitors.json` **byte-identical** to the preview output.
   - That preview was diffed against the committed file. Only the Spevdo plans, the GR entry and Spevdo's evidence differ.
5. **`node docs/compare-research-1/build.cjs --check`:** the same counts, ✓, exit code 0.
6. **Commit `c22a0ec7`:**
   - `data/compare-research-1/competitors.json`: +24 / −19 lines;
   - `docs/compare-research-1/raw/GR.json`: +13 / −13 lines.
   - Files that were already dirty or untracked before this work were left alone. These are `docs/plans-everywhere-5-report.md`
     and the untracked reports, including 1b's and this one.

## 3 · Spevdo as committed

| plan | id | `monthly_minor` / `monthly_major` | status | `correct` | `source_url` |
|---|---|---|---|---|---|
| Starter | `7ab96f6d-30e7-55b0-9114-1966c664edef` (same id as before) | 6000 / 60 | counted | — (the stored plan is already 6000) | `https://api.spevdo.gr/api/v1/plans` |
| Growth | `f937b78b-c980-5863-8a04-bef40dd87117` (new) | 12000 / 120 | counted | true: supersedes the stored 11900 | `https://api.spevdo.gr/api/v1/plans` |
| Pro | `c0aa98d3-bb6e-53a0-9415-b0bd69209a4c` (new) | 23000 / 230 | counted | true: supersedes the stored 22900 | `https://api.spevdo.gr/api/v1/plans` |

- All three are EUR, `vat: excl`, setup 0 and per-order fee 0.
- **Notes**, in `build.cjs`'s template:
  - the verbatim API fragment, for example `"name":"Growth","priceMonthly":120,"priceAnnual":1200`;
  - the API URL and the one-GET permission;
  - that EUR and excl. VAT come from https://spevdo.gr/el/ («/μήνα +ΦΠΑ»; «Όλες οι τιμές είναι +ΦΠΑ.»);
  - the yearly price: 600 / 1200 / 2300, which is €50 / €100 / €191.67 a month;
  - the old stored value.
- **GR entry `79af8d8b…`:** `primary_plan_id` is now `7ab96f6d…` (Starter, the cheapest).
- **Spevdo's evidence reason** names the API read and the three prices.
- **The competitor row is unchanged.** `build.cjs` writes its notes from a fixed template, so 1b's extra sentence is gone, as
  the stop report expected.

**In `raw/GR.json`** (Spevdo's three plans):
- `price_major`: null → 60 / 120 / 230;
- `url`: `https://spevdo.gr/el/` → `https://api.spevdo.gr/api/v1/plans`;
- `quote`: the API fragment;
- `note`: rewritten;
- Spevdo's `reason`: updated.
- Every other field and vendor is unchanged.

## 4 · Still open

1. **The currency is inferred.** The API has no currency or VAT field, so EUR and excl. VAT rest on the page wording quoted
   above (1b flag 1).
2. **The import comes after a deploy.** The importer runs once per sha256 of the file, so this version is imported at the first
   nightly run after Dominic deploys. Nothing is pushed or deployed.
3. **`check_urls` still lists only the website.** The nightly checker sees only «Φόρτωση της τιμής» on the page and may report
   these prices as unconfirmed. Whether to add the API URL is still Dominic's call (1b flag 5).
4. **Two files are still stale:** `docs/compare-research-1/summary.md` and the GR row in `docs/compare-research-1-report.md`.
   Neither was in scope.
5. Nothing in the brief arrived garbled, and no two instructions contradicted each other.

## 5 · Undo (only if Dominic asks)

`git revert c22a0ec7` puts both files back as compare-fix-1 left them. There is no SQL, because nothing was written to any
database.
