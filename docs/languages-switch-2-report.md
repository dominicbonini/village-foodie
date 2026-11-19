# languages-switch-2 — own-language country names, and Sri Lanka + Tanzania switched on

**Date:** 19 November 2026 · **Asked by:** Dominic. He asked for the short_name change for Albania and North Macedonia, then "run the Sri Lanka and Tanzania language migration".
**Follows:** docs/languages-switch-1-report.md, which switched Albania, Andorra, Bosnia and North Macedonia to their own languages.
**Commits:** 03b97a17 (short_name migration), plus this report. Both are local only, not pushed. 20261120_languages_switch_2.sql had already been committed at 7a8a26e5.
**Database:** two migrations run, both through `scripts/db-migrate.cjs --approved-by-dominic`, each as one transaction with no error.
No `.env*` file was opened. Nothing was pushed or deployed. Pizzeria Gusto and Le Roi du Churrasco were not touched.

## Summary

- **Albania and North Macedonia** now show their own-language country names. The page titles read "… HatchGrab Shqipëri" and "… HatchGrab Северна Македонија".
- **Andorra and Bosnia** already showed their own names ("Andorra", "Bosna i Hercegovina"), so they were not changed.
- **Sri Lanka** is now on **si-LK** and **Tanzania** on **sw-TZ**. The migration ran only after the live site was confirmed to serve both locales.
- **One follow-up for you (§4):** Sri Lanka's `short_name` is still the English "Sri Lanka". Tanzania's name is the same in Swahili.

## 1 · Check first: Andorra and Bosnia

Fetched at about 10:35 GMT, before the change:

| Page | `<html lang>` | `<title>` | short_name in the database | Intl name in the language |
|---|---|---|---|---|
| /ad | ca-AD | Sistema de comandes per a food trucks — HatchGrab **Andorra** | Andorra | Andorra |
| /ba | bs-BA | Sistem za narudžbe za food truckove — HatchGrab **Bosna i Hercegovina** | Bosna i Hercegovina | Bosna i Hercegovina |

Both already match their own-language names, so neither was changed.

Where `short_name` is used: `lib/marketing-meta.ts:23` puts it in the page title and description. It also appears in the phone copy (`lib/phone-copy.ts`), the plans PDF footnote (`lib/plans-pdf.ts:249`) and the llms text (`lib/llms-text.ts:45`). All of these are in the country's own language. Armenia ("Հայաստան"), Georgia ("საქართველო") and Ukraine ("Україна") already store it that way.

## 2 · Migration A — short_name for Albania and North Macedonia (run)

`supabase/migrations/20261119_languages_switch_short_names.sql`, committed at 03b97a17. db-migrate reported sha256 05d706d3b9d74c48, "applied — one transaction, no error".

```sql
update public.country_settings set short_name = 'Shqipëri', updated_at = now(), updated_by = 'languages-switch-2 short_name'
 where country_code = 'AL' and short_name = 'Albania';
update public.country_settings set short_name = 'Северна Македонија', updated_at = now(), updated_by = 'languages-switch-2 short_name'
 where country_code = 'MK' and short_name = 'North Macedonia';
```

The names are the ones `Intl.DisplayNames` gives for sq-AL and mk-MK. Each UPDATE only fires while the row still has the English name, so a re-run changes nothing.

**Rows after:**

| country | locale | short_name | updated_by |
|---|---|---|---|
| AD | ca-AD | Andorra | languages-switch-1 (unchanged) |
| AL | sq-AL | Shqipëri | languages-switch-2 short_name |
| BA | bs-BA | Bosna i Hercegovina | languages-switch-1 (unchanged) |
| MK | mk-MK | Северна Македонија | languages-switch-2 short_name |

**Live after:** a background check polled every 20 seconds. Both titles changed by the 16th poll, about 5 minutes after the run:
- /al → "Sistem porosish për food truck — HatchGrab Shqipëri"
- /mk → "Систем за нарачки за фуд тракови — HatchGrab Северна Македонија"

## 3 · Migration B — Sri Lanka → si-LK, Tanzania → sw-TZ (run after the deploy)

`supabase/migrations/20261120_languages_switch_2.sql`, prepared in languages-switch-1 and committed at 7a8a26e5.

- **First request (about 10:40):** the live site did not serve either locale. `/forgot-password?lang=sw-TZ` and `?lang=si-LK` both came back `<html lang="en">` with no translated strings. origin/main already had the commits by then, so the deploy hadn't gone live yet.
- **Not run then:** an unknown locale falls back to en-GB (`resolveLocale`, lib/i18n/locales.ts:73), so Tanzania would have dropped from en-KE to en-GB.
- **Waited for the deploy:** a background check polled the live site every 20 seconds.
- **Deploy live at 10:48:** both locales were served, with 7 translated strings on each page:
  - sw-TZ: "Umesahau nenosiri lako?", "Angalia barua pepe yako"
  - si-LK: "මුරපදය අමතකද?", "ඔබේ ඊමේල් පරීක්ෂා කරන්න"
- **Then run:** sha256 848540aaa69ba33b, "applied — one transaction, no error".

```sql
update public.country_settings set locale = 'si-LK', updated_at = now(), updated_by = 'languages-switch-2'
 where country_code = 'LK' and locale = 'en-GB';
update public.country_settings set locale = 'sw-TZ', updated_at = now(), updated_by = 'languages-switch-2'
 where country_code = 'TZ' and locale = 'en-KE';
```

**Rows after:**

| country | locale | short_name | enabled | updated_by |
|---|---|---|---|---|
| LK | si-LK | Sri Lanka | true | languages-switch-2 |
| TZ | sw-TZ | Tanzania | true | languages-switch-2 |

**Live after:** a background check polled every 20 seconds. Both pages had switched by the 17th poll, at 10:54:

| Page | `<html lang>` | `<title>` | /privacy heading |
|---|---|---|---|
| /lk | si-LK | Food truck ඇණවුම් පද්ධතිය — HatchGrab Sri Lanka | පෞද්ගලිකත්ව ප්‍රතිපත්තිය |
| /tz | sw-TZ | Mfumo wa oda mtandaoni kwa food truck — HatchGrab Tanzania | Sera ya Faragha |

ta-LK stays installed but no row points at it, as you chose Sinhala for Sri Lanka. India and Pakistan stay on en-GB.

## 4 · Needs your decision: Sri Lanka's name

| country | short_name now | Intl name in its language |
|---|---|---|
| LK | Sri Lanka | ශ්‍රී ලංකාව |
| TZ | Tanzania | Tanzania (the same, no change needed) |

Sri Lanka's title therefore reads "… HatchGrab Sri Lanka", with the name in Latin letters inside Sinhala text. This is the same situation Albania and North Macedonia were in. If you want it changed, I'll prepare a one-line migration of the same kind.

## 5 · Where the switch-on stands now

These countries are on their own language: UA, KZ, KG (ru-KZ), UZ, AZ, GE, AM, MN, BD, NP, plus **AL, AD, BA, MK** (languages-switch-1) and **LK, TZ** (today).

- **Not switched on:**
  - India and Pakistan stay on English (your decision);
  - Philippines has no country row;
  - km-KH, lo-LA and am-ET are not translated yet (languages-world-3 is paused).
- **Known limits, unchanged:**
  - Kitchen tickets print "?" for Cyrillic and Sinhala text, and accented Latin loses its accents (languages-world-2 report §4.5).
  - The store badges use the English fallback.
  - The legal pages still need a native/legal check.
- **db-migrate warning, all three runs:** `REVALIDATE_SECRET` is not set, so the site's marketing caches were not told to refresh. They catch up within 5 minutes on their own.

## 6 · Note on the chat reply

As you asked, the SQL goes inline in chat, with undo lines as comments, followed by the two-line summary. The standing rule from 19 Oct 2026 ("no undo SQL in chat") is unchanged unless you say otherwise. That's why the undo lines in chat are SQL comments marked ⛔ DO NOT RUN.

## Undo (only if Dominic asks)

⛔ DO NOT RUN — only if Dominic asks:

```sql
-- ⛔ DO NOT RUN unless Dominic asks
-- update public.country_settings set short_name = 'Albania', updated_at = now(), updated_by = 'languages-switch-2 undo' where country_code = 'AL' and short_name = 'Shqipëri';
-- update public.country_settings set short_name = 'North Macedonia', updated_at = now(), updated_by = 'languages-switch-2 undo' where country_code = 'MK' and short_name = 'Северна Македонија';
-- update public.country_settings set locale = 'en-GB', updated_at = now(), updated_by = 'languages-switch-2 undo' where country_code = 'LK' and locale = 'si-LK';
-- update public.country_settings set locale = 'en-KE', updated_at = now(), updated_by = 'languages-switch-2 undo' where country_code = 'TZ' and locale = 'sw-TZ';
```
