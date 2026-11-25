# compare-research-1b — Spevdo (Greece) prices from its own API

24 Nov 2026 · branch `france-vat-1` · follows `docs/compare-research-1-report.md` §6 item 5

## 1 · Summary

- I read Spevdo's plans from its own API with **one read-only GET**, as Dominic allowed on 24 Nov. It answered `200`.
- Prices are **Starter €60, Growth €120, Pro €230 a month, excl. VAT**.
- They are now in `data/compare-research-1/competitors.json` as priced (`counted`) plans, and Starter is the GR entry's primary plan.
- `node docs/compare-research-1/build.cjs --check` passes: 221 priced plans, up from 218.
- Greece now has **3 tools with an EUR price** that count: Spevdo, Worldline and SumUp. SumUp is still the weak fit from §6 item 4.
- No database writes, no import, no commit, no push, and no `.env` file opened.

## 2 · The request

| | |
|---|---|
| URL | `https://api.spevdo.gr/api/v1/plans` (the endpoint `raw/GR.json` had recorded) |
| Method | `GET`, header `Accept: application/json`, generic User-Agent, no cookies, no credentials |
| When | 2026-11-24 16:41:47 UTC |
| Answer | `HTTP/2 200`, `application/json`, 1,364 bytes, ETag `W/"554-Ibmli9ngl22c5pPD0vDWn/dMsks"`, `x-request-id 377335de-51d8-4477-816b-193ae936a4ee` |
| Count | **1 request.** No retries, and nothing else was sent to `api.spevdo.gr`. |

The response is saved, unchanged, outside the repo at
`/private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/4a35a566-6e02-4845-8930-d5ae55dc35a8/scratchpad/spevdo-api/plans.json`.
The headers are saved next to it in `headers.txt`. The scratchpad can be cleared, so the exact figures are also copied below.

## 3 · Exact figures (verbatim from the response)

| code | name | `priceMonthly` | `priceAnnual` | `ordersPerMonth` | recorded? |
|---|---|---|---|---|---|
| `menu` | Menu | 20 | 200 | 0 | **No.** It is a QR menu without ordering (`ordersPerMonth: 0`), the same call compare-research-1 made |
| `starter` | Starter | 60 | 600 | null | yes → `monthly_minor` 6000 |
| `growth` | Growth | 120 | 1200 | null | yes → `monthly_minor` 12000 |
| `pro` | Pro | 230 | 2300 | null | yes → `monthly_minor` 23000 |

The add-on, verbatim: `"code":"mobile_app","name":"Εφαρμογή για κινητά","nameEn":"Mobile app","priceMonthly":40,"priceAnnual":400`.
It is not recorded, because it is an option and not a plan.

Other fields, kept out of the data file: delivery zones 3/7/15; staff 3/10/999; table booking on Growth (150 a month) and Pro;
the "powered by" badge is hidden only on Pro.

**How I read the figures:**
- **Units are whole euros, not cents.** `priceAnnual` is exactly 10 × `priceMonthly` for every plan, which matches the page's
  «Η ετήσια χρέωση εξοικονομεί 2 μήνες (17%)». In cents the plans would cost €0.60 to €2.30, which is not plausible.
- **Billed yearly:** 600 / 1200 / 2300, which is €50 / €100 / about €191.67 a month. The monthly prices are the ones recorded
  (`yearly_only: false`). The yearly figures are in each plan's notes.
- `ordersPerMonth: null` on the paid plans fits the page's «Μία επιταγή τον μήνα, ανεξάρτητα πόσες παραγγελίες κάνεις», so
  `order_cap` stays null.

## 4 · What changed in `data/compare-research-1/competitors.json`

That file is the only repo file changed apart from this report. The diff is 18 lines.

- **Plans Starter / Growth / Pro (GR, competitor `54b82bfa…`):**
  - `price_hidden` true → false;
  - `monthly_minor` null → 6000 / 12000 / 23000;
  - `status` hidden → counted;
  - `source_url` → `https://api.spevdo.gr/api/v1/plans`;
  - `notes` rewritten with the verbatim API figures, the page's VAT wording, the yearly price and the old stored value.
  - Plan ids, currency `EUR`, `vat: excl`, setup 0 and fees 0 are unchanged.
- **GR entry `79af8d8b…`:** `primary_plan_id` null → `7ab96f6d…` (Starter). This is the cheapest priced plan, the same rule
  `build.cjs` uses.
- **Competitor notes:** one sentence added saying the plan prices came from the API.
- **`evidence` (reviewer-only; the import does not read it):** the Spevdo GR reason now names the API and the three prices, in
  place of "could not be read as page text".
- I edited the file with a small node script that writes `JSON.stringify(_, null, 1)`, the way `build.cjs` does. It first
  checked that the file was already in that form, so only the lines above changed. I checked the 100× guard by hand
  (minor ÷ 100 = the API figure).

**Check:**
```
node docs/compare-research-1/build.cjs --check
competitors 114, plans 254 (221 priced), entries 143, not relevant 63, unreadable 38
✓ the importer's own validation (researchProblems) and the 100× guard pass — nothing written to any database
```
Exit code 0.

## 5 · Flags

1. **The currency and VAT come from the page, not the API.** The API has no currency or VAT field. EUR and excl. VAT come from
   spevdo.gr/el/, read in compare-research-1: «/μήνα +ΦΠΑ», «Όλες οι τιμές είναι +ΦΠΑ.», a Greek site, the stored EUR rows.
   I think it is safe, but it is inferred.
2. **The stored figures were €1 off on two plans.** The database has 60 / 119 / 229, and the API says 60 / **120** / **230**.
   When this file is imported, Growth and Pro go up by €1.
3. **Running `build.cjs` without `--check` would undo this.** The brief allowed only the data file, so I didn't touch
   `docs/compare-research-1/raw/GR.json`. A full build regenerates `competitors.json` from `raw/`, which would put the three
   plans back to hidden. If anyone rebuilds, `raw/GR.json`'s Spevdo plans need `price_major` 60 / 120 / 230 first.
   `docs/compare-research-1/summary.md` and the GR row in `compare-research-1-report.md` §3 are stale for the same reason.
4. **The import will pick this up.** The importer imports a file once per sha256, so the changed file will be imported at the
   first nightly run after Dominic deploys it. Nothing is committed or deployed.
5. **The nightly checker will not call the API.** I left `api.spevdo.gr` out of the competitor's `check_urls`. Adding it would
   make the checker call the API every night, and that is more than the one request allowed here. It does mean the checker
   still sees only "Φόρτωση της τιμής" on the page. It may report these prices as hidden or unconfirmed, so a human may need to
   verify them. **Decision for Dominic:** should `check_urls` include the API?
6. Nothing in the brief arrived garbled, and no two instructions contradicted each other.

## 6 · Undo (only if Dominic asks)

`git checkout -- data/compare-research-1/competitors.json` puts the file back to commit `2f0e763a`. There is no SQL, because
nothing was written to any database.
