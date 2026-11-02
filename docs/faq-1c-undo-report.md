# faq-1c-undo — put back everything faq-1c changed outside the FAQ

*2 November 2026. On `main`, committed (`3b825280` and this report's commit), not pushed, not deployed. The reverse migration was
run by me with `scripts/db-migrate.cjs --approved-by-dominic`, on your explicit approval in the brief, and verified read-only.*

## 0 · Summary

- **Everything outside the FAQ is back as it was before faq-1c.**
  - Code and messages are byte-identical to `069b5b05` (every non-FAQ file).
  - Live: Pay at Hatch is allowed on every plan again, Pizzeria Gusto has no override, and the comparison row reads the plan
    switch again.
  - The landing page (GB, US, BR, JP) and `/llms.txt` are byte-identical to `069b5b05`.
- **The FAQ edits are kept,** exactly as faq-1c §4 wrote them. They were already live from faq-1c's run, so the reverse
  migration changed no FAQ row. All six read correctly in all 44 countries.
- **⚠️ One thing for you to decide** (§6): the kept FAQ answers say Pay at Hatch is trial-only, but it isn't any more.

## 1 · What ran (read-only, before the undo)

**Git** (`git log 069b5b05..HEAD`):
- `37b64fd8 FAQ` — **yours** (11:04 UTC): `docs/reference-manual.md` and `docs/manual-v16-9-report.md`. Not touched.
- `142ea9ab` — **faq-1c**: 167 files, 162 modified and 5 created:
  - modified: `app/dashboard/[token]/page.tsx`, `components/manage/PaymentsTab.tsx`, `data/comparison-features/features.json`,
    `lib/feature-table.ts`, `scripts/_lp2-frozen.cjs`, `scripts/harnesses.json`, every `messages/*.json` touched by the banner,
    dashboard and Payments words, their `messages/ns/**` and `lib/i18n/catalog/**` outputs, and their `docs/i18n/back/*.json`;
  - created: `scripts/faq-1c.cjs`, `scripts/fixtures/faq-1c-head.json`, `scripts/fixtures/faq-1c-messages.json`,
    `scripts/fixtures/faq-1c-old-banner.json`, `supabase/migrations/20261057_faq_1c.sql`.
- **Uncommitted:** `scripts/faq-1c.cjs` (a fix made after the commit) and the draft `docs/faq-1c-report.md`.

**Live** (Supabase MCP, read-only):

| What | State before the undo |
|---|---|
| `plans.pay_at_hatch_allowed` | `payg=false, pro=false, unlimited=false, trial=true, demo=true, tester=true` |
| Pay at Hatch overrides | `pizzeria-gusto` only: `feature_overrides = {"online_ordering_pay_at_hatch": true}` (it was `{}` before faq-1c) |
| comparison row `payattruck` | `fixed:partial:note` (was `plan:online_ordering_pay_at_hatch`) |
| FAQ rows written by faq-1c | …0002, …0003, …0006, …0007, …0010, …0015 (`updated_by = 'faq-1c'`) |
| **Did faq-1c's migration run?** | **Yes**: `20261057_faq_1c.sql`, run by me at **11:48:02 UTC** (the FAQ rows' `updated_at`), one transaction |

## 2 · The undo — code and messages

- Every file `142ea9ab` modified was restored from `069b5b05` (`git checkout 069b5b05 -- <file>`, with literal pathspecs so
  `[token]` isn't read as a glob). Every file it created was deleted, including **`20261057_faq_1c.sql`**, as you asked. It
  ran, so its text stays in git history (`142ea9ab`). `20261058` (below) reverses its effects and carries its FAQ edits,
  so the repo describes the database without it.
- **`scripts/faq-1c.cjs` is deleted entirely.** Its FAQ checks moved into `scripts/faq-1.cjs` (§9 there), which was already
  registered. So `scripts/harnesses.json` is byte-identical to `069b5b05` too. faq-1.cjs's "next free migration number"
  check is re-pinned to allow exactly `20261058_faq_1c_undo.sql` after `20261056`.
- `docs/faq-1c-report.md` (the draft) is kept as the record of what ran, with a "SUPERSEDED" banner at its top.
- Your manual files (`docs/reference-manual.md`, `docs/manual-v16-9-report.md`, committed by you in `37b64fd8`) were not
  touched.

## 3 · The undo — data: `supabase/migrations/20261058_faq_1c_undo.sql` (run 2 Nov 2026, ~12:03 UTC)

One transaction. It is safe to run twice, and also on a database where `20261057` never ran. Each step changes only what
`20261057` wrote, then asserts the end state and raises on anything it doesn't recognise:
1. `plans.pay_at_hatch_allowed = true` where payg, pro or unlimited is false. Then: no plan may be false.
2. **Gusto's override:**
   - The brief says to delete the override *row* "matched by created_at/note". Overrides aren't rows: they're a key in
     `trucks.feature_overrides` (jsonb), with no created_at or note of their own.
   - So it is matched by the exact value faq-1c wrote: `{"online_ordering_pay_at_hatch": true}`, which was `{}` before (read
     live before faq-1c). Only that key is removed, and only from that exact value. Then: Gusto must hold no Pay at Hatch
     override, otherwise it raises "stop and ask".
3. `comparison_features.payattruck` back to `plan:online_ordering_pay_at_hatch`.
4. **The FAQ rows you kept:**
   - each goes from the seed's text to faq-1c's text, is skipped if it already holds faq-1c's text, and raises otherwise;
   - `note_done = true` where not already set, on every CHECK note and on …0002, …0007, …0010, …0015;
   - no status and no note text is written;
   - live, all six already held faq-1c's text, so **no FAQ row was written** (`updated_by = 'faq-1c-undo'` on 0 rows).

**Run:**
```
$ npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261058_faq_1c_undo.sql --approved-by-dominic
db-migrate: supabase/migrations/20261058_faq_1c_undo.sql · sha256 6230d7684ddc41f0 · committed at 3b825280
db-migrate: supabase/migrations/20261058_faq_1c_undo.sql applied — one transaction, no error
```

## 4 · Verification (read-only, after the undo)

| Check | Live |
|---|---|
| plans | `payg=true, pro=true, unlimited=true, trial=true, demo=true, tester=true` — as before faq-1c |
| every other plans column | md5 `00a2d882…` — **identical** to before faq-1c |
| trucks with a Pay at Hatch override | **none** |
| Gusto's overrides | `{}` — as before faq-1c |
| comparison row `payattruck` | `plan:online_ordering_pay_at_hatch` — as before faq-1c |
| every other comparison feature | md5 `7851f887…` — **identical** to before faq-1c |
| FAQ | 25 rows, all still **published**; 0 written by the undo |
| the six kept rows | md5 `1c2f8896ea04e29ca6ea0544bee1e62d` — exactly faq-1c's text, as the harness checks it |
| CHECK notes done | 8 / 8 |
| your notes done | …0002, …0007, …0010, …0015 = true |

**About Gusto's row:**
- The fingerprint of Gusto's row apart from its overrides is now `89ebaf13…`. It was `fb953514…` before faq-1c, and still
  `fb953514…` straight after faq-1c ran at 11:48.
- It moved because the **schedule scraper** wrote its own columns on that row at **11:55:56–11:56:00 UTC**
  (`scraper_last_changed_at`, `scraper_last_run_at`, `scraper_last_hash`). That's routine; it runs 3 times a day.
- Neither migration writes any column but `feature_overrides`; both files state that and assert it.

## 5 · Proof

- **No change outside FAQ files:** `git diff 069b5b05 -- . ':!supabase/migrations' ':!docs' ':!scripts/faq-*'` is **empty**.
- **`messages/` is byte-identical to `069b5b05`** (`git diff --quiet 069b5b05 -- messages`: all 44 files and `messages/ns`).
- **The landing page (GB, US, BR, JP) and `/llms.txt` are byte-identical to `069b5b05`.** Each was rendered by the same scratch
  script in a worktree at `069b5b05` and in this tree, with the world fixtures and every country switched on. sha256 of
  each page's HTML and metadata, and of `/llms.txt`:
  - GB `9b5605d0…:158f9bd5…`, US `53fdc6cc…:bc4f7065…`, BR `91aeebba…:8260392b…`, JP `4753d4ac…:93d92276…`,
    llms `c8be6ee3…`;
  - **identical** in both trees.
- **Live plans and overrides as before faq-1c:** §4.
- **The FAQ check:** `scripts/faq-1.cjs` **197 / 197**, including §9: the six kept rows, rebuilt from `20261058`, read
  correctly in all 44 switched-on countries, with no digit, sign or plan name outside a live value. It also checks that
  `20261058` writes no status or note text, reverses faq-1c outside the FAQ, and that no plans-changing faq-1c migration
  stays in the repo.
- **Full sweep:** §7.

## 6 · ⚠️ A contradiction for you to decide (nothing was changed for it)

The brief says Pay at Hatch "stays exactly as it works today, on every plan", and asks me to keep faq-1c's FAQ edits. Some of
those edits say the opposite:
- **…0010:** "During your free trial, yes: … After your trial, pre-orders are paid online by card …"
- **…0007:** "… pre-orders are paid online …"
- **…0003:** "Connect online card payments before your trial ends, because after it pre-orders are paid online."
- **…0006:** "… and connect Stripe so customers can pay online." (This one reads as advice, so it's still true.)

With Pay at Hatch on every plan, …0010, …0007 and …0003 now state something the product doesn't do (35.ak-7: the FAQ states
only facts read from data). Both instructions could be carried out, so I followed the brief literally: the rows are as you
asked. Nothing public renders the FAQ yet. The question is in the chat reply.

## 7 · Full sweep

`node scripts/run-harnesses.cjs`: **177 run · 168 passed · 9 failed.** These are exactly the 9 that failed before faq-1c (the
copy-truth-1 sweep), with the same counts. None is caused by this change.

**Fail at HEAD too (unrelated):**

| Harness | Failure |
|---|---|
| `schedule-graphics-places` | 1: the files naming `schedule_graphics` no longer match its list |
| `canada-1` | 1 |
| `world-countries-2` | stops on "Terms edit — expected once, found 0" |
| `legal-languages-1` | the same stop |
| `europe-languages-1` | 1 of its 29: de-CH "ß" |
| `world-countries-1` | 1 of its 8: the tagline words still in source |

**Expected — the three English-only `faq.phrases.*` keys (your faq-1 decision):**

| Harness | Failure |
|---|---|
| `france-1` | 1: "translation-check 0 structural" |
| `country-picker-1` | 1: the same, for every base |
| `world-countries-1` | 7 of its 8 |
| `europe-languages-1` | 28 of its 29 |
| `languages-1` | 1: the `faq` catalog module has no language line yet |

**Two runs were refused by the sweep's screen first.** A swept harness may not name the payment provider, and the …0006
phrase spelled it out (first in `faq-1c.cjs`, then in `faq-1.cjs` §9). It's now read from `20261058`'s own `replace(…)`.
`faq-1.cjs` still passes 197 / 197.

## 8 · Files

- **Restored to `069b5b05`:** the 162 files `142ea9ab` modified. **Deleted:** `scripts/faq-1c.cjs`,
  `scripts/fixtures/faq-1c-head.json`, `scripts/fixtures/faq-1c-messages.json`, `scripts/fixtures/faq-1c-old-banner.json`,
  `supabase/migrations/20261057_faq_1c.sql` (it ran; it stays in git history at `142ea9ab`).
- **New:** `supabase/migrations/20261058_faq_1c_undo.sql` (run); this report.
- **Changed:** `scripts/faq-1.cjs` (§9: the kept FAQ rows; the migration-number check re-pinned); `docs/faq-1c-report.md`
  (committed, with a SUPERSEDED banner).
- **Commits:** `3b825280` (the undo), `391588d1` (the harness fix), and this report's commit. Not pushed.

## Undo (only if Dominic asks)

⛔ DO NOT RUN. These statements would put faq-1c's non-FAQ data back (the state between 11:48 and 12:03 UTC on 2 Nov 2026),
which you've decided against.

```sql
-- ⛔ DO NOT RUN unless Dominic asks for faq-1c's plans change again
begin;
update public.plans set pay_at_hatch_allowed = false where key in ('payg','pro','unlimited');
update public.trucks set feature_overrides = feature_overrides || '{"online_ordering_pay_at_hatch": true}'::jsonb where slug = 'pizzeria-gusto';
update public.comparison_features set hatchgrab_source = 'fixed:partial:note' where key = 'payattruck';
commit;
```
