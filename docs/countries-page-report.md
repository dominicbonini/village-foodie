# Country settings — Part C: the admin Countries page, and the competitor prefill removed

**10 October 2026 · branch `main` (HEAD `f4bd277` + working tree) · not committed · not pushed · not deployed · no SQL run · no country row and no truck changed**

Admin now has a **Countries** tab, the last in the bar. It shows one grid: a Setting column, then a column per country (GB first, then by name), with each column's header pinned. Every row the brief lists is there, in its order, with no competitor row. The server re-checks every rule and answers in a plain sentence. Saves are one row at a time, stamped with who saved and when, refused if the row changed since the page loaded it, and followed by a loader-cache clear. `/compare` no longer prefills a competitor, and Payments says "Other cards may cost more."

Nothing in the brief arrived garbled, and no instruction contradicted another. **No STOP was needed.** The competitor columns were read only on `/compare`'s behalf: by `/compare` itself, and by the loader and type that existed to serve it (§4).

**Not done by me, because it needs an admin session against the live table:** a real save, a stale refusal, and an add/remove on the live database. The rules prohibit nothing here, but I have no admin login and did not look for one. Every one of these is proved against the real route code with an in-memory table (§5), and the by-hand steps for the live check are in §7. **I changed no `country_settings` value — GB, US or any other.**

---

## 1. The Countries tab

| Asked | Built |
|---|---|
| Last tab, existing AppHeader and tab bar | `ADMIN_TABS.countries` (🌍 Countries) after Templates. Mounted on first visit, then hidden rather than unmounted, so unsaved typing survives a look at another tab |
| One grid; Setting column + one per country, GB first then by name | `components/admin/CountriesTab.tsx`. The order comes from the server (`listCountries(store, MARKETING_COUNTRY)`) |
| Pinned headers: name + code, Switched on / Off pill, trucks, "last saved <date> by <who>", Save | ✅ All five. The header row is `sticky top-0` and the Setting column `sticky left-0`, inside a box that scrolls in both directions (a sticky element sticks to its scrolling ancestor, which is the box) |
| Narrow screens scroll the grid sideways inside its box; the page never does | ✅ The grid has a `min-width`; the box is `overflow-auto`. Measured: no sideways page scroll at either size |
| Same layout on a laptop and a large monitor, little empty space, everything visible | ✅ One layout at both sizes, inside the admin's standard content width like every other admin tab. Nothing is folded away; the box scrolls. ⚠️ At 1920 that width leaves margins either side (screenshot §6). Stretching two country columns across 1,900px would only widen empty space *inside* the cells. Say if you want it full-width like Outreach |
| Rows and groups, in order, plain labels | ✅ STATUS · HATCHGRAB PLAN PRICES (hint "What trucks pay us, in the country's currency") · STRIPE CARD FEES (hint "As we quote them on pricing pages and in Payments") · WHAT TRUCKS CAN OFFER CUSTOMERS · FORMATS · ALLERGENS AND SUPPORT. Every row the brief lists, in that order (the harness asserts the order). **No competitor row** |
| Extra van read-only | "Same as the plan's monthly price" |
| Card fee limits / not allowed in shown only when that toggle is on | ✅ else "—" |
| Times / Dates with an example | "24-hour (18:30)" / "12-hour (6:30 pm)" in the column's own language style; "Day first (31/12/2026)" / "Month first (12/31/2026)" |
| Time zones: chips + Add from `Intl.supportedValuesOf('timeZone')`; default only from those chosen | ✅ An Add box with the runtime's zone list as suggestions. The default is a select of the chosen zones only |
| Money typed in major units, stored in minor | "29.00", "1,500" → 2900, 150000, by **string arithmetic** ("19.99" is 1999, never `* 100`). The decimals come from the column's currency, so JPY stores what is typed |
| Fixed fees typed in minor units with the small unit shown | "20 p", "30 ¢". The suffix comes from `minorUnitSuffix(currency)` in `lib/money-format.ts`, and the money symbol from `currencySymbol()`, **for that column's currency** |
| Plain wording, no column names | Every label and message comes from `FIELD_LABELS` / plain sentences. The harness checks 60-odd messages and **none names a column** |

## 2. The rules (the page shows them; the server enforces them again)

All of them live in **`lib/admin/country-form.ts`** (`formToValues`, `checkNewCountry`). The page runs it live and the server runs it again on every save, so the two cannot disagree.

| Rule | Message |
|---|---|
| Switched on needs all six plan prices | "Can't switch on until the 6 plan prices are filled in". It shows in the column header and beside the toggle, which is disabled while any price is empty. Empty prices are amber |
| Currency locked while trucks use the country | Shown as a locked chip "🔒 N trucks use it". A save that changes it anyway: "The currency can't change while N trucks use this country." |
| The code never changes | It is not in the form. A request that sends one anyway: "The country code can't change after the country is created." |
| Add country | Two-letter code, name, copy-from. **Created OFF with all six plan prices EMPTY**, everything else copied (and the retired competitor columns left NULL) |
| Remove country | Only with zero trucks and switched off, behind an inline confirm. **Never the marketing country (GB)**. The foreign key from `trucks.country` refuses it too |
| Every database CHECK, validated first | The code; the currency (a real ISO code); the phone code (1–3 digits, no leading 0); the five choice lists; the default time zone being one of those offered; every percentage 0–100 with at most 2 decimals; every amount a whole, non-negative number of minor units; tip choices 0–100 with no repeats; and the enabled-needs-prices rule. Plus the page's own: a name, a tax name, which cards, a real language style, real time zones, region codes, and length limits |

## 3. Saving

| | |
|---|---|
| Routes | **`app/api/admin/countries/route.ts`**: `GET` list · `PUT` save one · `POST` add · `DELETE` remove. Each starts with `adminUser(req)` (new in `lib/auth/admin.ts`; `verifyAdmin` is now exactly `adminUser(...) !== null`, so its behaviour is unchanged) and answers a non-admin with 404 |
| Service role, server only | `lib/admin/country-store.ts` (`import 'server-only'`) reads with the **loader's own column list and row mapper**, so the page shows exactly what every price surface reads. The logic is `lib/admin/country-actions.ts`, behind a `CountryStore` interface |
| One row per save | `update(code, expectedUpdatedAt, columns)` writes only `WHERE country_code = code AND updated_at = expectedUpdatedAt` |
| `updated_at`, `updated_by` | Set on every write; `updated_by` is the admin's email |
| Stale save | Refused before the write if the stored `updated_at` differs from the loaded one, and refused by the WHERE clause if it changes in between: "This country was changed elsewhere. Reload to see the latest." **A failed save keeps what was typed**; only the message changes |
| Cache | `clearCountrySettingsCache()` after every successful write. This instance shows the change at once and every other within the loader's 60 seconds. The landing page, /features, /compare, Billing and Payments all read through that loader |
| Errors | A database error is logged and answered "That could not be saved just now. Nothing was changed — try again in a moment." It is never passed through |

## 4. The competitor prefill is removed

- **`/compare`**: both fee boxes start **empty**, with placeholders "Your rate" and "Your fee". The page names no competitor; the comments that did are reworded.
- **Every read removed:** `lib/country-settings.ts` no longer selects the three columns, `CountrySettings` no longer has them, and `CostComparison` no longer reads them. `grep` finds no reader anywhere in `app`, `lib`, `components`, `scripts` or `supabase/functions`.
- **Who read them before this part (checked first, as the STOP condition asks):** only `/compare`, plus the loader and type that carried them *for* `/compare`. Outreach code was not read or touched.
- **SQL** (`20261010_10_retire_competitor_columns.sql`, below): sets all three to NULL on every row and marks each column RETIRED and unread. **No column is dropped.**
- ⚠️ **A consequence to decide on.** On the "Yes, with another system" path, the result now compares against **£0 until the operator types a rate**, so it opens on a figure that reads as "HatchGrab costs more". The old prefill hid that. I did not add a "type your rate to see the comparison" gate, because it would be new wording on a public page the brief did not ask for. It is a one-condition change if you want it.

## 5. Payments wording

`components/manage/PaymentsTab.tsx`, both places: "Cards issued outside the UK and EEA cost more." → **"Other cards may cost more."** With Part B's "UK cards", these are the only visible wording changes for UK trucks.

---

## 6. Proof

### 6.1 Parity — `scripts/country-settings-parity.cjs`, updated
The only allowed differences are named in `TEXT_RULES` and must each be **present**, or the run fails:
1. Part B: " on UK and EEA cards" → " on UK cards".
2. Part C: "Cards issued outside the UK and EEA cost more." → "Other cards may cost more." (Payments, both places).
3. Part C: `/compare`'s two fee boxes are **empty** (values `4.5` and `20` → empty) with the two new placeholders. Its one text consequence is also allowed: the "Card processing … is inside that … Their own fee is 3.0%" explanation, which exists only while a typed rate exceeds card processing, is absent.

Plus one **structural** allowance, named separately because it is not a wording change: Admin's tab bar gains "🌍 Countries". The admin text is compared with exactly that label taken out, and is otherwise identical apart from rule 1.

`/compare`'s **results** are compared like for like: the harness types the old 4.5% + 20p, since the page no longer puts them there. The empty default itself is proved by the live page capture and by `compare-no-system.cjs`.

| Section | Result |
|---|---|
| modules · pdf · billing · payments · admin · compare | ✓, every difference one of the named ones |
| **pages, live** (`/`, `/features`, `/compare` from the dev server through the real loader and the live GB row) | ✓, 3 allowed (the /features footnote, the /compare boxes and their sentence) |
| formatter | 17 labels identical in Node, Chromium and WebKit |
| allowed changes present | 1 ✓ · 2 ✓ · 3 ✓ |

(The leaf counts are lower than Part B's because each `attrs` list is now compared as one unit — needed for change 3, where the placeholders are inserted into it.)

### 6.2 API — `scripts/countries-api.cjs` (new, in the sweep): **63/63**
It runs the real `country-actions` and `country-form` against an in-memory table seeded from the GB and US seed migrations. **The table enforces every database CHECK, and the run fails if any CHECK fires**, so each refusal must come from the actions, in words, first.
- **List:** GB first, truck counts.
- **Round trip:** GB saved unchanged writes back **every value byte for byte**. US typed 19.99 · 1,234.56 · 1,500 · 2000.5 · 0.95 → **1999 · 123456 · 150000 · 200050 · 0.95**, read back as typed, and re-saving changes nothing. A JPY column stores 2900 for "2900" and refuses "29.5" in words.
- **31 rules**, each refused with its exact message, the row untouched, and no CHECK fired. Also: the code cannot change, and a malformed save is refused whole.
- **Stale:** a save from a page loaded before someone else's save → 409 with the message, the other save intact. **A save that loses the race between read and write is caught by the WHERE clause** and writes nothing.
- **Add/remove on throwaway code `ZZ`:** four bad adds refused in words; ZZ created OFF with six empty prices and the rest copied; remove refused while switched on, while trucks use it (CA with 2), and always for GB; then removed. **GB and US are left exactly as they started.**
- **Words and route:** no message names a column; the route 404s a non-admin first, clears the cache after each of its three writes, never passes a database error through, and uses the server-only store.
- **Control:** a variant with the switch-on rule deleted gets past the actions and is stopped only by the table's CHECK. So the section that asserts "no CHECK fired" can fail.

⚠️ **What it cannot prove:** that PostgREST's `.eq('updated_at', …)` matches the timestamp string the loader read back. That needs the live table (§7, step 3).

### 6.3 Screenshots — `scripts/countries-screenshots.cjs` (new; needs a build + Chromium): **26/26**
The real admin page, bundled for a browser, with every `/api/*` answered by fixtures parsed from the seed migrations (14 GB trucks, 0 US). It measured, at both sizes: no page errors; Countries is the last tab; **no sideways page scroll; nothing spills out of a grid cell; no Save button overlaps its country's name**; the header shows all five things; GB first; the US note; no competitor row; the rows in the approved order; **the headers stay pinned while the grid scrolls**; the US column's six empty prices are amber; the Add country form opens in view with nothing cut off.

**Fixed after looking at them:** the Add form's "Copy settings from" select rendered at 16px beside 14px boxes. From 640px up, `app/globals.css` makes a `<select>` inherit its parent's size, so the form row now carries `text-sm`. Support hours also stretched wider than every other box; it is now capped like the rest.

| File (`docs/screenshots/`) | What |
|---|---|
| `countries-1440-page.png`, `countries-1920-page.png` | The full page as first seen |
| `countries-1440-grid.png`, `countries-1920-grid.png` | Every row of the grid in one image (box cap lifted, page header unpinned for the photo) |
| `countries-1440-us-column.png`, `countries-1920-us-column.png` | The US header with "Can't switch on until the 6 plan prices are filled in" |
| `countries-1440-add-form.png`, `countries-1920-add-form.png` | The Add country form, open |

### 6.4 Client bundles
After `next build`, `.next/static` contains **none of**: `card_fee_online_pct`, `country_settings`, the loader's strings (`countrySettingsForTruck`, `clearCountrySettingsCache`, "refusing to fall back…"), the store (`serviceCountryStore`, `country-store`), the save code (`valuesToColumns`), the seed stamp, `£29`, `£49` or `competitorPct`. To keep it that way, the field→column mapping lives in the server-side `country-actions.ts`, and the page's form module carries no column name. The admin chunk holds the page's own code and labels, no data. (The three "Hatches Up" hits are the untouched outreach lead-type labels.)

### 6.5 tsc, lint, build, sweep
| | |
|---|---|
| `npx tsc --noEmit` | **clean** |
| eslint, the 12 Part C files against their end-of-Part-B state | **no rule count grew in any file**. One new `set-state-in-effect` in the first load was fixed, not waived |
| `npx next build` | **compiled successfully** |
| `node scripts/run-harnesses.cjs` | **100 of 100 passed** (the two new or updated price harnesses among them). `subtab-row.cjs` and `countries-screenshots.cjs` need a build and browsers, so they are outside the sweep and were run standalone: 90/90 and 26/26 |
| `compare-no-system.cjs` | **50/50**. Cases that relied on the old default now type 4.5 / 20; new checks that nothing reads a competitor column and both boxes start empty with the neutral placeholders |

---

## 7. By hand, on the live table — for you, with an admin session

1. Open `/admin?tab=countries`. GB and US columns; GB shows its truck count with the currency locked.
2. **US only:** type "9am–5pm ET" into Support hours, **Save**. It reads "Saved". Reload: it is still there, with "Last saved … by <your email>". Clear it, **Save** again, and confirm it is empty once more.
3. **Stale:** open the tab in two windows. Save a US Support hours change in window A. In window B (not reloaded) change anything on US and **Save**: "This country was changed elsewhere. Reload to see the latest.", with B's typing still on screen. Then undo A's change.
4. **Add/remove:** "+ Add country" → `ZZ`, "Test", copy from US → a ZZ column, Off, six amber prices. **Remove country** → confirm → gone. Run §8.2: no ZZ row.
5. **Never on GB:** do not save anything on the GB column.

## 8. SQL

### 8.1 `supabase/migrations/20261010_10_retire_competitor_columns.sql` — run after deploying this part (harmless before)

```sql
set lock_timeout = '3s';

begin;

update public.country_settings
   set competitor_name = null,
       competitor_pct = null,
       competitor_fixed_minor = null
 where competitor_name is not null
    or competitor_pct is not null
    or competitor_fixed_minor is not null;

comment on column public.country_settings.competitor_name is
  'RETIRED 10 October 2026 — unread by the app and kept NULL. /compare no longer prefills a competitor (20261010_10). Kept rather than dropped; do not read it.';
comment on column public.country_settings.competitor_pct is
  'RETIRED 10 October 2026 — unread by the app and kept NULL. See competitor_name.';
comment on column public.country_settings.competitor_fixed_minor is
  'RETIRED 10 October 2026 — unread by the app and kept NULL. See competitor_name.';

commit;
```

### 8.2 Read-only checks

```sql
-- READ ONLY. Every country, its save stamp, and whether the competitor columns are empty.
select country_code, name, enabled, currency, updated_at, updated_by,
       competitor_name, competitor_pct, competitor_fixed_minor
  from public.country_settings
 order by country_code;

-- READ ONLY. Trucks per country (what the page's headers show, and what locks a currency).
select country, count(*) as trucks from public.trucks group by country order by country;
```

---

## 9. Files

**New:** `components/admin/CountriesTab.tsx` · `lib/admin/country-form.ts` (client-safe: form ↔ values, every rule) · `lib/admin/country-actions.ts` (list / save / add / remove + the field→column map) · `lib/admin/country-store.ts` (service role, server-only) · `app/api/admin/countries/route.ts` · `supabase/migrations/20261010_10_retire_competitor_columns.sql` · `scripts/countries-api.cjs` · `scripts/countries-screenshots.cjs` · 8 PNGs in `docs/screenshots/`

**Changed:** `app/admin/page.tsx` (the tab) · `lib/auth/admin.ts` (`adminUser`; `verifyAdmin` unchanged in behaviour) · `lib/country-settings.ts` (exports the column list, the row mapper and an uncached list; competitor columns no longer read) · `lib/country-settings-types.ts` (competitor fields gone) · `lib/money-format.ts` (`minorUnitSuffix`) · `app/compare/CostComparison.tsx` (no prefill) · `components/manage/PaymentsTab.tsx` (the sentence) · `scripts/country-settings-parity.cjs` · `scripts/compare-no-system.cjs` · `scripts/_country-settings-gb.cjs` (reads US too) · `scripts/harnesses.json`

## 10. Rules

| Rule | |
|---|---|
| main as checked out; no push or deploy; no process killed | ✓ |
| No SQL run, no column dropped | ✓ The one SQL file empties three columns and comments them; it is not run |
| No `.env*` or secret | ✓ |
| No GB value changed; tests on US or a throwaway, put back | ✓ **No live row was edited at all.** The throwaway (ZZ) lived only in the harness's in-memory table, and the harness asserts it left nothing behind |
| No truck changed; not Gusto; no outreach_templates or outreach code; no email | ✓ |
