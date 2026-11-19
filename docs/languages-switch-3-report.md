# languages-switch-3 — Sri Lanka's country name in Sinhala

**Date:** 19 November 2026 · **Asked by:** Dominic ("Sri Lanka short_name → "ශ්‍රී ලංකාව" … guarded on the current value as before")
**Follows:** docs/languages-switch-2-report.md, which switched Sri Lanka to si-LK (§3) and listed this name as the open decision (§4).
**Commits:**
- 9855e7a5 adds the migration.
- A second commit adds this report.
- Both are local only and not pushed.

**Database:** one migration was run through `scripts/db-migrate.cjs --approved-by-dominic`. It ran in one transaction with no error.
No `.env*` file was opened. Nothing was pushed or deployed. Pizzeria Gusto and Le Roi du Churrasco were not touched.

## Summary

- **The Sri Lanka row now has the Sinhala name.** `country_settings.short_name` for LK changed from "Sri Lanka" to **"ශ්‍රී ලංකාව"**.
- **The live page shows it.** The /lk title now reads **"Food truck ඇණවුම් පද්ධතිය — HatchGrab ශ්‍රී ලංකාව"**.
- **Nothing is open for this step.** Tanzania's name is "Tanzania" in Swahili too, so it needs no change.

## 1 · Checks before the run

- **The name is exact.** The text in your message, the migration file and `Intl.DisplayNames('si-LK').of('LK')` are byte-identical. All three have the same code points: ශ ් **U+200D (zero-width joiner)** ර ී, space, ල ං ක ා ව.
  - The joiner is what makes "ශ්‍රී" render as the conjunct.
  - Without it the word would look wrong.
  - Nothing in your message arrived garbled.
- **The row matched.** Before the run, LK was locale si-LK with short_name "Sri Lanka", so the guard held.

## 2 · Migration — run

`supabase/migrations/20261119_languages_switch_lk_short_name.sql` was committed at 9855e7a5 and run with `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261119_languages_switch_lk_short_name.sql --approved-by-dominic`.

db-migrate reported: sha256 dc7b38e305e1409e, "applied — one transaction, no error".

```sql
update public.country_settings set short_name = 'ශ්‍රී ලංකාව', updated_at = now(), updated_by = 'languages-switch-3 short_name'
 where country_code = 'LK' and short_name = 'Sri Lanka';
```

The update only fires while the row still holds "Sri Lanka", so running it again changes nothing.

**Row after** (read-only check):

| country | locale | short_name | UTF-8 hex | updated_by |
|---|---|---|---|---|
| LK | si-LK | ශ්‍රී ලංකාව | e0b781 e0b78a **e2808d** e0b6bb e0b793 20 e0b6bd e0b682 e0b69a e0b78f e0b780 | languages-switch-3 short_name |

`e2808d` is the zero-width joiner, stored correctly.

**Live after:**
- A background check polled /lk every 20 seconds.
- The new name appeared on the 17th poll, at 11:06.
- The title reads: `Food truck ඇණවුම් පද්ධතිය — HatchGrab ශ්‍රී ලංකාව`.

The `short_name` value also feeds the landing description, the phone hint, the plans PDF footnote and the llms text (lib/marketing-meta.ts:23, lib/phone-copy.ts, lib/plans-pdf.ts:249, lib/llms-text.ts:45). The new Sinhala name flows into all of them.

## 3 · Where country names stand

| country | locale | short_name |
|---|---|---|
| AL | sq-AL | Shqipëri (languages-switch-2) |
| AD | ca-AD | Andorra (same in Catalan) |
| BA | bs-BA | Bosna i Hercegovina |
| MK | mk-MK | Северна Македонија (languages-switch-2) |
| LK | si-LK | **ශ්‍රී ලංකාව (this run)** |
| TZ | sw-TZ | Tanzania (same in Swahili) |

The other countries on their own language already stored their names that way (e.g. AM "Հայաստան", GE "საქართველო", UA "Україна").

**db-migrate warning:** `REVALIDATE_SECRET` is not set, so the site's marketing caches were not told to refresh. They caught up on their own within 5 minutes.

## 4 · Note on the chat reply

As you asked, the SQL is shown inline in chat with the undo as a comment, then the two-line summary. The standing rule from 19 Oct 2026 ("no undo SQL in chat") stays as it is unless you say otherwise. That's why the undo in chat is an SQL comment marked ⛔ DO NOT RUN.

## Undo (only if Dominic asks)

⛔ DO NOT RUN — only if Dominic asks:

```sql
-- ⛔ DO NOT RUN unless Dominic asks
-- update public.country_settings set short_name = 'Sri Lanka', updated_at = now(), updated_by = 'languages-switch-3 undo' where country_code = 'LK' and short_name = 'ශ්‍රී ලංකාව';
```
