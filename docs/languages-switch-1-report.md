# languages-switch-1 — four countries switched to their own language

**Date:** 19 November 2026 · **Asked by:** Dominic ("turn on any languages that are complete before you pause", then answers 1–3 and "A")
**Commits (local only, not pushed):** 7a8a26e5 (both migration files) · this report
**Database:** one migration run (`20261119_languages_switch_1.sql`); one prepared and **not run** (`20261120_languages_switch_2.sql`).
No `.env*` file was opened. Nothing was pushed or deployed. Pizzeria Gusto and Le Roi du Churrasco were not touched.

## Summary

- **Switched on now:** Albania → **sq-AL**, Andorra → **ca-AD**, Bosnia & Herzegovina → **bs-BA**, North Macedonia → **mk-MK**.
  - Each locale was confirmed live on www.hatchgrab.com **before** the switch.
  - All four country pages served their new language within about 2 minutes of the run.
- **Prepared, not run:** Sri Lanka → **si-LK** and Tanzania → **sw-TZ** (`20261120_languages_switch_2.sql`). Run it only after your next deploy (§4).
- **Left as they are (your decision):** India and Pakistan stay on en-GB. hi-IN and ur-PK stay installed, but no row points at them.
- **Not possible:**
  - Philippines (fil-PH) has no `country_settings` row, so there is nothing to switch.
  - ta-LK stays installed but on no row, because you chose si-LK for Sri Lanka.
- **One follow-up for you (§5):** the page title still shows "Albania" and "North Macedonia" in English. This is because `country_settings.short_name` holds the English name for those two.

## 1 · Which languages were "complete"

"Complete" means the UI is installed (9 parts, consistency pass, 0 structural problems) and the three legal pages are done.

| Country | Row before | Language ready | Live on www before? | Outcome |
|---|---|---|---|---|
| AL Albania | en-GB | sq-AL | yes | **switched → sq-AL** |
| AD Andorra | es-ES | ca-AD | yes | **switched → ca-AD** |
| BA Bosnia & Herzegovina | hr-HR | bs-BA | yes | **switched → bs-BA** |
| MK North Macedonia | en-GB | mk-MK | yes | **switched → mk-MK** |
| IN India | en-GB | hi-IN | yes | unchanged (Dominic: stays English) |
| PK Pakistan | en-GB | ur-PK | yes | unchanged (Dominic: stays English) |
| LK Sri Lanka | en-GB | si-LK (and ta-LK) | **no** (local commits only) | migration 2, after the deploy |
| TZ Tanzania | en-KE | sw-TZ | **no** (local commits only) | migration 2, after the deploy |
| PH Philippines | no row | fil-PH | yes | nothing to switch |

**Already on their own language before today** (unchanged): UA uk-UA, KZ kk-KZ, KG ru-KZ, UZ uz-UZ, AZ az-AZ, GE ka-GE, AM hy-AM,
MN mn-MN, BD bn-BD, NP ne-NP.

## 2 · Live check before the switch

The site's `/forgot-password?lang=<locale>` page renders in any locale the deployed build knows. If the build doesn't know a locale, it falls back to English. Fetched 19 Nov 2026, about 10:15 GMT:

| Locale | `<html lang>` served | Translated strings found on the page |
|---|---|---|
| sq-AL | `sq-AL` | 8 (e.g. "Keni harruar fjalëkalimin?") |
| ca-AD | `ca-AD` | 8 (e.g. "Has oblidat la contrasenya?") |
| bs-BA | `bs-BA` | 7 (e.g. "Zaboravili ste lozinku?") |
| mk-MK | `mk-MK` | 8 (e.g. "Ја заборавивте лозинката?") |
| sw-TZ (control) | `en` | 0 — **not live**, as expected |

`git cat-file` agrees: messages and legal pages for fil-PH, sq-AL, bs-BA, mk-MK, ca-AD, hi-IN and ur-PK are on origin/main. sw-TZ, si-LK and ta-LK are only in the 40+ unpushed local commits.

Why a locale must be live first: `resolveLocale()` (lib/i18n/locales.ts:73) turns an unknown locale into en-GB. A row pointing at a locale the live build doesn't have would show British English. For Tanzania, which is on en-KE today, that would be a step backwards.

## 3 · Migration 1 — run

`supabase/migrations/20261119_languages_switch_1.sql`, committed at 7a8a26e5 and run with
`npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261119_languages_switch_1.sql --approved-by-dominic`.

```sql
update public.country_settings set locale = 'sq-AL', updated_at = now(), updated_by = 'languages-switch-1'
 where country_code = 'AL' and locale = 'en-GB';
update public.country_settings set locale = 'ca-AD', updated_at = now(), updated_by = 'languages-switch-1'
 where country_code = 'AD' and locale = 'es-ES';
update public.country_settings set locale = 'bs-BA', updated_at = now(), updated_by = 'languages-switch-1'
 where country_code = 'BA' and locale = 'hr-HR';
update public.country_settings set locale = 'mk-MK', updated_at = now(), updated_by = 'languages-switch-1'
 where country_code = 'MK' and locale = 'en-GB';
```

- **Result:**
  - "applied — one transaction, no error" (sha256 6693465cca406f01).
  - Each UPDATE fires only while the row still has its old locale, so a re-run changes nothing.
- **Warning from db-migrate:** `REVALIDATE_SECRET` is not set, so it could not ask the site to refresh its marketing caches. The pages caught up on their own; their cache lasts 5 minutes.
- **Rows after** (read-only check):

| country | locale | enabled | updated_by |
|---|---|---|---|
| AD | ca-AD | true | languages-switch-1 |
| AL | sq-AL | true | languages-switch-1 |
| BA | bs-BA | true | languages-switch-1 |
| MK | mk-MK | true | languages-switch-1 |
| IN, PK, LK | en-GB | true | world-countries-5 switch-on (unchanged) |
| TZ | en-KE | true | world-countries-5 switch-on (unchanged) |

- **Live after:** a background check polled the four pages every 20 seconds. All four served the new `<html lang>` by the 6th poll, about 2 minutes after the run:

| Page | `<html lang>` | `<title>` |
|---|---|---|
| /al | sq-AL | Sistem porosish për food truck — HatchGrab **Albania** |
| /ad | ca-AD | Sistema de comandes per a food trucks — HatchGrab Andorra |
| /ba | bs-BA | Sistem za narudžbe za food truckove — HatchGrab Bosna i Hercegovina |
| /mk | mk-MK | Систем за нарачки за фуд тракови — HatchGrab **North Macedonia** |

  /al/privacy shows the Albanian legal page ("Politika e privatësisë").

## 4 · Migration 2 — prepared, NOT run

`supabase/migrations/20261120_languages_switch_2.sql`, committed at 7a8a26e5. **Run it after your next deploy:**

1. **Push and deploy.** The deploy has to include the sw-TZ, si-LK and ta-LK commits, from 8fede02f onwards.
2. **Check both locales are live:**
   - `https://www.hatchgrab.com/forgot-password?lang=sw-TZ` must serve `<html lang="sw-TZ">` with Swahili text.
   - `?lang=si-LK` must serve `<html lang="si-LK">` with Sinhala text.
   - Ask me and I'll do both checks, as in §2.
3. **Run it:** `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261120_languages_switch_2.sql --approved-by-dominic`

```sql
update public.country_settings set locale = 'si-LK', updated_at = now(), updated_by = 'languages-switch-2'
 where country_code = 'LK' and locale = 'en-GB';
update public.country_settings set locale = 'sw-TZ', updated_at = now(), updated_by = 'languages-switch-2'
 where country_code = 'TZ' and locale = 'en-KE';
```

## 5 · Needs your decision: country names in titles

`marketingCountry()` (lib/marketing-meta.ts:23) puts `country_settings.short_name` into `landing.meta.title`. For countries already on their own language, that name is stored in the language: AM "Հայաստան", GE "საქართველო", UA "Україна", BA "Bosna i Hercegovina". For the two switched from English it is still English:

| country | short_name now | Intl name in its new language |
|---|---|---|
| AL | Albania | Shqipëri |
| MK | North Macedonia | Северна Македонија |
| AD | Andorra | Andorra (same) |
| BA | Bosna i Hercegovina | Bosna i Hercegovina (same) |
| LK (after migration 2) | Sri Lanka | ශ්‍රී ලංකාව |
| TZ (after migration 2) | Tanzania | Tanzania (same) |

Changing `short_name` is a core-table row change, so it hasn't been made. If you want it, I'll add a small committed migration for AL and MK now, and for LK after migration 2.

## 6 · Known limits (unchanged by this work)

- **Kitchen tickets:** `lib/printing/ticket.ts` sends only ASCII and "£" to the printer. The effects are those in languages-world-2 report §4.5:
  - Macedonian (Cyrillic) item names print as "?";
  - Albanian, Bosnian and Catalan lose their accents (ë, č, à…).
  - Sinhala, after migration 2, would print as "?".
  - This already affects Armenia, Georgia, Ukraine and the other non-Latin countries.
- **Store badges:** these four languages use the badge fallback in lib/store-badge-files.ts. No new badge artwork was added.
- **Legal pages** are machine translations marked "needs native/legal check".
- Country-specific terms have no section for these countries.

## 7 · The languages job (languages-world-3)

- **Sinhala (si-LK):** UI installed d87b958b, legal 74be3dcd.
- **Tamil (ta-LK):** UI installed 1984c3e1, legal 6ca2aa29 (+ c8be4fb0 for the hash). The legal checker passes 3/3, and `legal-languages-1` gives 390 passed, 0 failed.
- **Then paused** as you asked. Khmer, Lao and Amharic remain, each about 11 agent runs. Store listings, the full sweep, the final report and the reference-manual update follow after them.
- **Progress:** docs/languages-world-3-report.md.

## 8 · Note on the chat reply

You chose "A": the SQL inline in chat, with undo statements as comments. That differs from the standing rule recorded on 19 Oct 2026, "no undo SQL in chat — only in the report". That rule came in after a runnable rollback line next to a "run now" block got run by hand and silently undid the 12 Oct revokes.

This reply follows your "A". The undo lines are SQL comments marked ⛔ DO NOT RUN. The standing rule is unchanged unless you say otherwise.

## Undo (only if Dominic asks)

⛔ DO NOT RUN — only if Dominic asks to put the four countries back:

```sql
-- ⛔ DO NOT RUN unless Dominic asks
-- update public.country_settings set locale = 'en-GB', updated_at = now(), updated_by = 'languages-switch-1 undo' where country_code = 'AL' and locale = 'sq-AL';
-- update public.country_settings set locale = 'es-ES', updated_at = now(), updated_by = 'languages-switch-1 undo' where country_code = 'AD' and locale = 'ca-AD';
-- update public.country_settings set locale = 'hr-HR', updated_at = now(), updated_by = 'languages-switch-1 undo' where country_code = 'BA' and locale = 'bs-BA';
-- update public.country_settings set locale = 'en-GB', updated_at = now(), updated_by = 'languages-switch-1 undo' where country_code = 'MK' and locale = 'mk-MK';
```
