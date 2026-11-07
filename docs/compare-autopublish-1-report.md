# compare-autopublish-1: stopped on three decisions; §1 done

*7 November 2026. Nothing is deployed, migrated or published.*

## Status

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
