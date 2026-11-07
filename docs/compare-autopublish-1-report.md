# compare-autopublish-1: stopped again: the addendum did not arrive, and one scope question

*7 November 2026. Nothing is deployed, migrated or published. §1 is done (`6894cfb0`).*

## Status after your answers (Q1 = C, Q2 = A, Q3 = A, plus the semi-deep addition)

- **`gh` works now** (logged in as dominicbonini). Checker runs will use `gh workflow run competitor-check.yml` from now on.
- **⚠️ FLAG: the "ADDENDUM A–F" never reached me.**
  - The brief I received has no addendum, and no section lettered A–F. I have only the one-line labels in your last message:
    - auto-process findings;
    - the consistency rule;
    - pages complete = features + pricing;
    - android / ipad out of absence-means-no;
    - saving check_urls;
    - no-website competitors never shown;
    - the gastro25 / Grafterr reclassification.
  - **Three of those change data, and I can't act on a label:**
    - which findings are processed automatically, and how;
    - what "the consistency rule" says;
    - whether gastro25 and Grafterr become restaurant tools or stay food-truck tools.
  - Please paste the addendum.
- **⚠️ SCOPE: "every country except AE live" cannot happen as built.**
  - **A comparison page exists only for a country whose language is English or German** (`lib/comparison-server.ts` comparisonPath). The page's own copy — headings, table words, FAQ, methodology, its address — is translated into English and German only (the `comparison` namespace, scoped in `docs/i18n/scoped-namespaces.json`).
  - **The 13 English and German countries:** GB, US, IE, AU, CA, NZ, SG, GI, MT, DE, AT, CH, LI.
  - **The other 30 switched-on countries** (FR, ES, IT, NL, BE, PT, BR, MX, JP, HK, TH, MY, PL, CZ, SK, HU, RO, HR, SI, BG, GR, CY, DK, SE, NO, FI, EE, LV, LT, LU) have no comparison page. They would need the whole comparison page translated first: hundreds of keys in about 20 languages, which is a brief of its own.
  - **Two competitors are the minimum to go live,** and four of the 13 can never reach it with today's data:

| Country | Active competitors with a current plan | Can go live? |
|---|---|---|
| GB | 16 | yes |
| US | 22 | yes |
| DE | 9 | yes |
| AU | 7 | yes |
| IE | 4 | yes |
| CA | 4 | yes |
| NZ | 4 | yes |
| SG | 3 | yes |
| AT | 2 | yes |
| CH | 1 | no |
| LI | 1 | no |
| GI | 0 | no |
| MT | 0 | no |

- **Cost of the semi-deep run** (plan plus core features, for the shown four; the checker's own averages: routine $0.074, deep $0.13 per check):

| Scope | Checks | Likely | Worst case |
|---|---|---|---|
| The 9 English and German countries that can go live | ~33 | **≈ $2.50** (≈ $0.80 a night over 3 nights) | ≈ $8.60 |
| Every switched-on country except AE that has ≥ 2 competitors (if their pages are translated later) | ~90 | ≈ $6.70 | ≈ $23 |

  Both are under the $25 line.

### The question

```
compare-autopublish-1 — two things before I build §2–§5:

1  Please paste ADDENDUM A–F. It did not arrive with the brief; I only have its labels, and "auto-process findings",
   "the consistency rule" and "the gastro25/Grafterr reclassification" each change data in a way I can't guess.

2  Comparison pages exist only for English- and German-language countries. Pick one:
   A  Now: the 9 English/German countries that can reach 2 competitors (GB, US, IE, AU, CA, NZ, SG, DE, AT) get entries,
      the semi-deep check (~$2.50, ≤ $8.60) and auto-publish; CH, LI, GI, MT wait for competitors.   ← my recommendation
   B  As A, and a separate brief translates the comparison page into the other languages; their semi-deep checks wait for it.
   C  Run the semi-deep check for every switched-on country now (~$6.70, ≤ $23), so their data is ready when pages exist.
```

---

## Earlier status (first stop)

- **Pre-check passed.** compare-recheck-1 is committed (`b099fc00`). No restore was needed: every moved row was re-checked, and 0 rows are dated before September. The tree is clean.
  - cwv-2 (another session) is committed and pushed: the app routes now live in `app/(app)` and the public pages in `app/(public)`.
- **§1 Newer check wins: done** (`6894cfb0`).
  - `lib/comparison-features.ts` featureCheckOf now takes the newer of the country's own record and the every-country one, by date. A tie goes to the country's own.
  - Tests cover both directions, the tie, and a single record. `compare-suits-1` passes 72/72; the typecheck is clean.
  - This alone lets the 7 November routine checks count for Best Food Trucks, Goodfynd and Jamezz.
- **§2–§5: stopped.** Three points in the brief conflict with each other or with the house rules (below).
- **§6 live re-measure: not started.** Its five cold first-byte samples need 15 minutes between each (cwv-2's method), so I will run it alongside the build once you have answered. It is read-only and unaffected by the answers.

## The decisions

```
compare-autopublish-1 — three decisions before I build §2–§5.

Q1  "A country goes live (comparison status → live)": comparison_status is a column of country_settings, a protected table.
    A  The checker writes country_settings.comparison_status itself (only that column, only for auto-publish countries),
       and the one-off run's change goes through a migration with --approved-by-dominic (your yes here).
    B  Status stays manual: the automation publishes competitor data and marks the country "ready"; you switch it live in Admin › Countries.
    C  No protected write at all: "auto-live" is kept in the new per-country auto-publish table, and a country's page is live when
       country_settings says live OR (auto-publish on AND auto-live). Admin › Countries' status keeps working as today.   ← my recommendation

Q2  "A country set off always wins" vs "pages go live automatically": every country except DE is 'off' today, and nothing records
    whether you chose that or it is just the default.
    A  Today's 'off' is the default, not a choice: auto-publish may take those countries live. Your way to keep a country
       off is its auto-publish switch (and from now on, setting a country off in Admin is recorded and always wins).   ← my recommendation
    B  Today's 'off' counts as your choice: only DE (admin) can go live automatically until you switch others on yourself.

Q3  "Run the evaluation once now": the checker runs only on GitHub Actions (no gh CLI here, no deploy allowed, no local keys).
    A  I run the same evaluation code locally on a read-only export of the rows, and apply its result with one committed
       migration (auto-verification marks + auto-live in the new table — no protected table if Q1 = C).   ← my recommendation
    B  No one-off: it happens at the first nightly run after you next push.
```

## Notes that need no decision

- **"verified_by = 'auto'"** cannot be written: `verified_by` is a uuid column on plans, answers and entries. I would add an `auto_verified_at` timestamp on each instead. Admin then shows "auto-verified" separately from a manual verification, and a manual one always wins.
- **The UAE has no comparison page in any case.** Pages exist only for countries whose language is English or German. It would still get `auto_publish` off, fixed, as asked.
- **Deep checks completed:**
  - the deep-check queue began GB → DE → CZ and is now on CZ;
  - GB's and DE's deep checks are complete, which fits "DE should qualify";
  - no other comparison country has finished one;
  - US is last in the queue.
