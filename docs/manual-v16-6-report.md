# manual-v16-6: the reference manual updated with the pricing work

**Date:** 23 October 2026 · `docs/reference-manual.md` only, now **V16.6** (header and front matter) · uncommitted ·
read-only SQL only (below) · nothing pushed or deployed.

## What changed in the manual

- **Changelog:** a new **V16.6** block above V16.5, with its "What / Where" table and a SWEEP STATUS line (5 stale
  references found, 5 corrected in place, 1 left as history, 0 outstanding).
- **New §85 "Pricing research and Admin › Pricing check"**, after §84:
  - the rules (nothing decided, no in-place price edits, nothing shown to customers, no plan in code);
  - **§85.1** live state;
  - **§85.2** the research: scope, method, findings, proposals with their status, known slips in that report;
  - **§85.3** the three tables;
  - **§85.4** the rules in code;
  - **§85.5** the tab;
  - **§85.6** open items.
- **Corrected in place, marked ⛔ Corrected V16.6:**
  - **§12:** nine admin tabs, not two; the tab bar is now `max-w-6xl`.
  - **§21:** "Sources: none in `docs/`" struck; the two research files and the `manual`-sourced rows named.
  - **§27:** the `schedule-graphics-places` guard item is done (re-pinned, uncommitted). The per-country pricing item now
    notes that the research's §10.1 SQL changes nothing as written, because every row is switched on. A new item: register
    `pricing-check-1.cjs`.
  - **§79:** the V16.5 line naming that harness as failing; a new Pricing check block (harness, screenshot script,
    re-pins, the 166 · 165 · 1 sweep).
- **Pointers added:**
  - **§76.1:** the retired competitor columns point to the new tables.
  - **§81.1:** price positioning points to §85, with GB's result.
  - **§84.10:** points to §85.

## Things to know

- **Someone else is applying V16.5 in this manual.** The file already had uncommitted V16.5 changes, last written at
  18:12. My edits were applied in one anchored pass that would have refused if the file had changed since it was read.
  If another session is still writing V16.5, its next save could overwrite V16.6. Check before committing.
- **The research and the tab, as the manual now records them (OBSERVED 18:25):**
  - the import has run: 128 competitors, 242 plans, 46 benchmarks;
  - **nothing is verified**;
  - all three tables have RLS on, no policies, and no access for anon or authenticated;
  - the code is committed in `f17f6540`;
  - the `schedule-graphics-places` re-pin and the report's sweep figures are still uncommitted.
- **`pricing-check-1.cjs` is still not registered** in `scripts/harnesses.json`. The conflict that held it back is gone:
  the other session's edits there are now committed. It's still your call, so the manual records it as open.

## Read-only SQL run

```sql
select (select count(*) from public.competitors) as competitors,
  (select count(*) from public.competitor_plans) as plans,
  (select count(*) from public.competitor_plans where source='research') as research_plans,
  (select count(*) from public.competitor_plans where verified_at is not null) as verified,
  (select count(*) from public.competitor_plans where superseded_at is not null) as superseded,
  (select count(*) from public.country_benchmarks) as benchmarks,
  (select count(*) from public.country_benchmarks where superseded_at is null) as current_benchmarks,
  (select relrowsecurity from pg_class where oid='public.competitors'::regclass) as rls,
  (select count(*) from information_schema.columns where table_schema='public' and table_name='country_benchmarks' and column_name='notes') as notes_col;
```

Result: 128 · 242 · 232 · 0 · 0 · 46 · 46 · true · 1.

```sql
select t, has_table_privilege('anon', 'public.'||t, 'select') as anon_select, has_table_privilege('authenticated', 'public.'||t, 'select') as auth_select,
  (select count(*) from pg_policies where schemaname='public' and tablename=t) as policies
from unnest(array['competitors','competitor_plans','country_benchmarks']) as t;
```

Result: false / false / 0 policies for all three tables.
