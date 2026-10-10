# Country settings — a per-country phone check setting

**10 October 2026 · branch `main` (HEAD `f4bd277` + working tree) · not committed · not pushed · not deployed · no SQL run · no truck or `country_settings` value changed beyond the new column's default · Pizzeria Gusto untouched**

How strictly a country's phone numbers are checked is now a setting on the admin Countries page. Every row starts on **Standard** (`length`), which is exactly Phase 2C's rule, so nothing changes until someone picks something else. The three choices:

| Value | Countries page label | Check (lib/phone.ts `isPlausiblePhone`) |
|---|---|---|
| `length` | Standard — right length for the country | libphonenumber `isPossiblePhoneNumber` (unchanged) |
| `strict` | Strict — real numbers only | libphonenumber `isValidPhoneNumber` |
| `off` | Off — accept anything | any non-empty input |

A number starting with + (a visiting customer) is checked with the truck's choice, in the number's own country.

Links and display are unchanged. They still need a parseable number, so with Off an unparseable number simply gets no WhatsApp link.

Nothing in the brief arrived garbled, and no instruction contradicted another.

---

## 1. SQL — `supabase/migrations/20261010_12_country_settings_phone_check.sql`

The file is safe to run twice:
- `add column if not exists`;
- the CHECK is added only if `country_settings_phone_check_chk` is not already there.

Every existing row takes `'length'` from the default. **Run it after 20261010_11 and before this code is tested or deployed**, because the loader selects the column by name (42703 otherwise).

```sql
set lock_timeout = '3s';

begin;

alter table public.country_settings
  add column if not exists phone_check text not null default 'length';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.country_settings'::regclass
       and conname = 'country_settings_phone_check_chk'
  ) then
    alter table public.country_settings
      add constraint country_settings_phone_check_chk check (phone_check in ('length', 'strict', 'off'));
  end if;
end $$;

comment on column public.country_settings.phone_check is
  'How phone numbers are checked for this country: length (plausible length — libphonenumber "possible"), strict (real numbers only — libphonenumber "valid"), off (anything not empty). A + number is checked in its own country with the truck''s choice.';

commit;
```

To verify (read-only):
```sql
select country_code, phone_check from public.country_settings order by country_code;
-- expect 'length' on every row
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.country_settings'::regclass and conname = 'country_settings_phone_check_chk';
```

## 2. Loader, types and what reaches a browser

- **Types:** `lib/country-settings-types.ts` adds `PhoneCheck = 'length' | 'strict' | 'off'`, `PHONE_CHECKS`, and `CountrySettings.phoneCheck`.
- **Loader:** `lib/country-settings.ts` adds `phone_check` to the column list. The mapper reads it with `oneOf(...)`, so a value outside the three fails loudly, like every other enum column.
- **What browsers get:** the existing phone copy object only, now four values `{ phoneCountry, short_name, phone_example, phoneCheck }` (`lib/phone-copy.ts`). It reaches screens through `/api/menu`, `/api/dashboard` and `/api/setup?check=truck`; Manage builds it from the `countrySettings` it already receives. The settings row is never sent.

## 3. `lib/phone.ts` — `isPlausiblePhone(number, country, mode)`

`mode` is required, so the compiler named every caller. Each now passes the mode from settings:

| Caller | Mode from |
|---|---|
| Customer order page | `truck.phone.phoneCheck` (/api/menu) |
| Manage › Settings contact phone | `countrySettings.phoneCheck` |
| Setup page, DemoGetStarted | `phone.phoneCheck` (their payloads) |
| Setup API | `phoneCopyForCountry(SIGNUP_COUNTRY).phoneCheck` — the check and its message now come from one read |
| Countries page example rule | the mode chosen in the same form |

- **Admin outreach is unchanged.** Its paths (`whatsapp-hint`, `truck-details`) never called `isPlausiblePhone`. They use the link and national forms, which stay on the length rule, for the marketing country, as the brief asks.
- **`'off'` still refuses empty input.** Whether a box is optional is the caller's decision, as before (the order form's phone stays optional).

## 4. Countries page

The new row sits in the FORMATS group, **directly under "Example phone number"**:
- label **"Phone number check"**;
- a select with the three labels above, using the same `choice()` select and `msg()` error line as Times, Dates and Week starts.

It saves and validates like the other rows (`lib/admin/country-form.ts`), on the page and again on the server:
- **The value:** it must be one of the three; otherwise "Choose how phone numbers are checked."
- **The example is judged by the mode being saved.** On `strict`, an example the strict check refuses blocks the save: **"The example number isn't accepted by the strict check — change the example first"**. This applies both when switching to Strict and when changing the example while on Strict.
  - On `length`, the existing rule stands ("“…” isn't a phone number this country would accept.").
  - On `off`, any example is accepted.
- **Saving:** `phone_check` goes through `rowToForm`, `formToValues`, `asCountryForm`, `valuesToColumns` and the dirty-field list. A new country copies its source country's check (its short name and example start empty, as in Phase 2C).

**What this means for GB today:** GB's example, 07700 900123, is an Ofcom drama number, so GB cannot be switched to Strict until its example is changed to a real number (e.g. 07380 736226). The harness proves both halves of that.

## 5. Proof

| Check | Result |
|---|---|
| `phone-parity` on `length` | ✅ **Unchanged, byte for byte**: the same 4,945 inputs, the same verdicts, and the same counts in every named class as Phase 2C (R1 1,410 · R3 70 · A1 35 · A3 53 · L1 235 …); the UK screens and emails are identical; the 12 US checks pass |
| `phone-parity` on `strict` and `off` (12 new checks) | ✅ The seeded default is `length`. Strict refuses 07700 900123 and accepts 07380 736226 for GB. Strict checks a + visitor in its own country (+1 201 555 0123 accepted, +1 201 555 01 refused). Off accepts "abc" and still refuses empty. Links are unchanged by the mode (`abc` has no link). All five callers pass the mode from settings |
| `countries-api` (9 new checks, 72 in all) | ✅ Every seeded row starts on `length`, and the form reads it back. The row is on the page directly under Example phone number, with the three labels. GB cannot go Strict with 07700 900123 (the exact message, and nothing is stored); with 07380 736226 it can. While Strict, the example cannot be changed back to 07700 900123. Off accepts any example. Back to Standard works. An unknown value is refused in words before the database CHECK (which the fake store now mirrors) |
| `money-sweep-parity`, `time-dates-parity` | ✅ 3,057 / 3,057 identical; GB identical outside its named windows |
| Client bundles after `next build` | ✅ None of `country_settings`, `phone_check`, `default_timezone`, `card_fee_online_pct`, `getCountrySettings`, `countrySettingsForTruck`, `phoneCopyForTruck` / `ForCountry`, `phone-copy`, `truckTimeSettings`. `phoneCheck` appears only as the payload field read by `isPlausiblePhone`. The library chunk is 122,270 bytes (29,671 gzipped): 1,437 bytes more (93 gzipped) for `isValidPhoneNumber` |
| `tsc --noEmit` | ✅ clean |
| eslint: 133 touched files against HEAD | ✅ No rule count grew; errors 634 → 630, warnings 183 → 181 (the same totals as Phase 2C); the new files are clean |
| `next build` | ✅ exit 0 |
| Harness sweep (`scripts/run-harnesses.cjs`, 103 files) | ✅ **103 / 103 passed.** The first run failed one (`schedule-graphics-places`, whose Phase 2C pin on Manage's contact-phone check lacked the new third argument); the pin was updated and the whole sweep re-run clean |

**Harness changes:**
- **`_country-settings-gb.cjs`:** seed rows carry `phoneCheck`, read from 20261010_12's column default (`phoneCheckDefault()`).
- **`phone-parity`:** the copies carry `phoneCheck`; its five `isPlausiblePhone` calls pass `'length'`; the strict/off checks are added; the setup-API pin is updated to the new two-line form.
- **`countries-api`:** the column map and the fake store's CHECK know `phone_check`; section 4b is added.
- **`money-sweep-parity`:** the order-page truck's `phone` carries `phoneCheck`.
- **`schedule-graphics-places`:** the Manage contact-phone pin takes the third argument.

## 6. Rules kept

| Rule | |
|---|---|
| main as checked out; never push or deploy; no process killed | ✓ |
| No SQL run; SQL only in this report and in chat; nothing dropped | ✓ one migration file, written, not run |
| No `.env*` opened | ✓ |
| Fixtures only; Pizzeria Gusto untouched; no truck data or `country_settings` value changed beyond the new column's default | ✓ |
