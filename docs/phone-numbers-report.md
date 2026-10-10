# Phase 2C — phone numbers follow the truck's country

**10 October 2026 · branch `main` (HEAD `f4bd277` + working tree) · not committed · not pushed · not deployed · no SQL run · no truck or `country_settings` row changed · no email or WhatsApp sent · Pizzeria Gusto untouched**

## Summary

Every phone check, normaliser and example now follows the truck's country, through one module (`lib/phone.ts`, built on libphonenumber-js 1.13.13 "min").

**The one rule (your decision, 10 October):** a number passes when it is a **plausible length** for its country. That is libphonenumber's "possible" check, read in the truck's country, or in the number's own country when it starts with `+` (a visiting customer). There is no full validity check, no number-type rules, no per-country special cases, no custom regexes and no range lists.

**For a UK truck:**
- Every number a person can actually have is still accepted, in every way it is written (0, +44, 44, 0044, +44 (0), spaces, dashes, brackets, dots).
- It is **stored exactly as typed**, as before.
- **UK examples and copy are byte-identical.**
- What moved is listed below by class. Every class is named in `scripts/phone-parity.cjs`, and a row that moves outside the named classes fails the run.

A US customer can now order. "(201) 555-0123", "201-555-0123", "+1 201 555 0123" and "2015550123" are all accepted on a US truck, and all give the link form `12015550123`.

**Before you deploy:** run `supabase/migrations/20261010_11_country_settings_phone_copy.sql` first. The settings loader selects the two new columns by name, so without the migration every settings read fails (42703).

### Things you should know before anything else

1. **Two classes moved that your decision did not name.** My option-2 summary missed them, and both are consequences of the single length rule, which allows no custom handling to keep them. Neither is a real number.
   - **R3:** a string starting `00` that is not a real international number (`00` is the international prefix). 70 corpus rows, e.g. `0012280908`.
   - **R4:** a 9-digit number in the Isle of Man / Jersey / Guernsey ranges. These share +44 but need 10 digits; seen in the exploratory sweep (e.g. `+44 1624 66000`), with 0 corpus rows.
2. **Newly accepted numbers include some that are not "genuinely valid UK numbers".** The brief allowed only genuinely valid ones; your decision ("any mobile or landline of a plausible length … passes") makes these plausible-length numbers pass:
   - **A3:** short national numbers of a length the UK plan allows (0 + 6–8 digits), 53 rows, e.g. `0580460`.
   - **A4:** a UK number written without its leading 0, e.g. `7700900123`.
3. **A few link forms changed, all for inputs whose old link could not open.** The brief asked for byte-identical links. Every real UK number in a normal format gives a byte-identical link. Three input shapes now give the real number instead of a broken link:
   - **L1:** "+44 (0)7380 736226" / "+44 07380 736226" used to give `wa.me/4407380736226`;
   - **L2:** "00…" strings used to be prefixed with 44;
   - **L3:** an extension used to be folded into the digits.

   Keeping the broken forms would need a custom rule, which your decision rules out.
4. **The wording template.** The brief says the order form's error "becomes 'Enter a valid {short_name} mobile (e.g. {phone_example})'" and "for GB that must read exactly as today's message". Today's message is **"Please enter a valid UK mobile (e.g. 07700 900123)"**, which begins "Please enter". Following the template literally would break the exact match, so I kept each surface's own wording and filled in `{short_name}` and `{phone_example}`. GB is proved identical on all three surfaces (§3).
5. **A new country starts with no short name and no example number**, like its six plan prices. Copying "UK" / "07700 900123" into, say, France would be wrong on day one, and the example must pass that country's own check (§1).

Nothing in either message arrived garbled. The one contradiction in the brief (strict validity vs. UK identical) was settled by your choice of option 2.

---

## 1. The two new country settings

**SQL:** `supabase/migrations/20261010_11_country_settings_phone_copy.sql`. It is safe to run twice: `add column if not exists`, and each seed fills a value only where it is still NULL, so it never overwrites an edit. **Run it before this code is tested or deployed.**

```sql
set lock_timeout = '3s';

begin;

alter table public.country_settings add column if not exists short_name    text;
alter table public.country_settings add column if not exists phone_example text;

update public.country_settings set short_name    = 'UK'             where country_code = 'GB' and short_name    is null;
update public.country_settings set phone_example = '07700 900123'   where country_code = 'GB' and phone_example is null;
update public.country_settings set short_name    = 'US'             where country_code = 'US' and short_name    is null;
update public.country_settings set phone_example = '(201) 555-0123' where country_code = 'US' and phone_example is null;

comment on column public.country_settings.short_name is
  'How the country is named inside a sentence ("a valid UK mobile"). Nullable: screens that need it say so loudly when it is missing. Phase 2C.';
comment on column public.country_settings.phone_example is
  'The example phone number shown in placeholders and phone error messages, in the country''s own written form. Nullable, as short_name. Phase 2C.';

commit;
```

To verify (read-only):
```sql
select country_code, short_name, phone_example from public.country_settings order by country_code;
-- expect GB | UK | 07700 900123  and  US | US | (201) 555-0123
```

**Both columns are nullable.** Where a screen needs a value and it is missing:
- `lib/phone-copy.ts` logs an error naming the country and the missing column.
- The screen drops that part of its wording ("Please enter a valid mobile") rather than borrowing another country's. Ordering is never blocked.

**Loader and types:**
- `COUNTRY_SETTINGS_COLUMNS` now includes `short_name` and `phone_example`.
- `mapCountryRow` maps them with `strOrNull`.
- `CountrySettings` has `shortName` and `phoneExample` (`string | null`).

**Countries page** (FORMATS group, directly under "Phone country code"):

| Row | Hint | Placeholder | Rule (`lib/admin/country-form.ts`, page and server alike) |
|---|---|---|---|
| Short name | As in "a valid UK mobile" | UK | optional; at most 20 characters |
| Example phone number | Shown in phone boxes and errors | 07700 900123 | optional; at most 30 characters; **must pass `isPlausiblePhone` for that country**, since it is printed as an example of a number the country accepts |

- The rows use the same `text()` box and `msg()` error line as Support hours.
- Both fields go through `rowToForm`, `formToValues`, `asCountryForm`, `valuesToColumns` and the dirty-field list.
- `formToValues` takes an optional `countryCode` in its context (both callers pass it).
- `newCountryValues` leaves both empty for a new country.

## 2. The phone module — `lib/phone.ts` (client-safe)

| Function | What it does |
|---|---|
| `isPlausiblePhone(number, country)` | `isPossiblePhoneNumber(text, country)`: national input read in `country`, `+` input in its own country. Empty → false |
| `phoneLinkDigits(number, country)` | The WhatsApp / wa.me form: country code + number as digits (`447380736226`, `12015550123`), or null when not plausible |
| `phoneDisplay(number, country)` | The national written form (`07380 736226`, `(201) 555-0123`) |
| `phoneNationalDigits(number, country)`, `nationalDigitsOfInternational(digits)` | The national form as digits, for matching numbers stored the national way |
| `phoneErrorMessage(kind, copy)`, `phonePlaceholder(copy, prefix)` | The copy, from `{ phoneCountry, short_name, phone_example }` |

`lib/phone-copy.ts` (server-only) builds `{ phoneCountry, short_name, phone_example }` from a truck's or a country's settings row, and nothing else of the row.

**Size added to the order page:** one shared client chunk holds the library and its "min" metadata, **120,833 bytes minified, 29,578 bytes gzipped** (measured in `.next/static` after `next build`; an esbuild bundle of exactly the order page's imports agrees: 120.4 KB / 29.2 KB). Almost all of it is the per-country metadata.

## 3. The copy, from settings

| Surface | Today (quoted) | Now | GB proof |
|---|---|---|---|
| Customer order form error | "Please enter a valid UK mobile (e.g. 07700 900123)" | `phoneErrorMessage('mobile', copy)` → "Please enter a valid {short_name} mobile (e.g. {phone_example})" | identical string (harness), and the rendered order form is identical |
| Order form placeholder | "e.g. 07700 900123" | `phonePlaceholder(copy, 'e.g. ')` | rendered attribute identical |
| Manage › Settings contact phone | "Please enter a valid UK phone (e.g. 07700 900123)", placeholder "07700 900123" | `phoneErrorMessage('phone', copy)`, `phonePlaceholder(copy)` | identical string; the call is pinned in two guards |
| Setup wizard, demo signup (DemoGetStarted) and the setup API | "Enter a valid UK phone number (e.g. 07700 900123).", placeholder "07700 900123" | `phoneErrorMessage('phone_number', copy)`, `phonePlaceholder(copy)` | identical string; the setup page's rendered placeholder is identical |

US: "Please enter a valid US mobile (e.g. (201) 555-0123)", with the placeholder "e.g. (201) 555-0123".

**How screens get the copy.** No browser reads `country_settings`, and the customer page never sees the settings row.

| Screen | Payload | Field |
|---|---|---|
| Customer order page | `/api/menu` (already received) | `truck.phone = { phoneCountry, short_name, phone_example }` |
| Dashboard, KDS (and the demo signup box on them) | `/api/dashboard` | `truck.phone`. Like `time`, it never fails the kitchen: on error it is null and logged |
| Order page's demo banner | `/api/menu` | `truck.phone` → `DemoGetStarted phone=` |
| Setup page | `/api/setup?check=truck` (already fetched before the form shows) | `phone`, for the signup country |
| Setup API | server | `isPlausiblePhone(…, SIGNUP_COUNTRY)`; message from `phoneCopyForCountry(SIGNUP_COUNTRY)` |
| Manage | `/api/manage` `countrySettings` (Part B, already sent to the operator's own Manage page) | built in place from `countryCode`, `shortName` and `phoneExample` |

- **`SIGNUP_COUNTRY = 'GB'`** is now named once in `app/api/setup/route.ts`. New trucks are provisioned in it, their phone is checked in it, and the setup page is worded from it.
- Demo trucks are GB (`lib/provision-demo.ts`), so the demo signup box shows the same country /api/setup checks in.
- **Without the copy** (a response from before this build), the order box is not policed (the phone is optional there), and the setup and demo boxes let `/api/setup` check the number.

## 4. What moved for a UK number — the complete list

The corpus is `scripts/fixtures/phone-before.json`, captured on the unchanged code before any edit. It has **4,945 inputs**:
- 17 real UK number types × 14 written forms;
- 27 edge shapes;
- 4,500 seeded strings from the old rule's whole language (0 / 44 / +44, followed by 9–11 digits);
- 180 near-misses of other lengths.

It also holds 15 rendered screens and emails.

**Stored form:** every surface stores the raw input exactly as typed, as before. No call site uses the module's output as the stored value.

**Accepted then, refused now** (allowed differences):

| Id | Class | Rows | Examples |
|---|---|---|---|
| R1 | a national number with 11 digits after the 0 (or after +44 / 44), one more than any UK number has | 1,410 | `07700 9001234`, `077009001234`, `012345678901` |
| R2 | words or other characters around the number | 2 | `+44 7700 900123 (mob)`, `tel: 07380 736226` |
| R3 | ⚠️ not named in your decision: a `00…` string that is not a real international number | 70 | `0012280908` |
| R4 | ⚠️ not named in your decision: a 9-digit number in the Isle of Man / Jersey / Guernsey ranges | 0 in the corpus | `+44 1624 66000` (exploratory sweep) |

**Refused then, accepted now:**

| Id | Class | Rows | Examples |
|---|---|---|---|
| A1 | a real number written with 0044 (today's length rule refused it) | 35 | `0044 7380 736226` |
| A2 | a number from another country written with + or 00 (a visiting customer) | 3 (+1 in the screens) | `+1 201 555 0123`, `0064464060288` |
| A3 | ⚠️ a short number of a length the UK plan allows (0 + 6–8 digits) | 53 | `0580460`, `0742800` |
| A4 | ⚠️ a UK number written without its leading 0 | 1 | `7700900123` |

**Links and admin display** (byte-identical for every real UK number in a normal format):

| Id | Class | Where | Rows |
|---|---|---|---|
| L1 | a stray 0 after +44 / 44: the old link kept it (`wa.me/4407…`, which cannot open); now the real number | email link, wa.me hint, webhook variants, admin display | 235 (+335 webhook, 72 display) |
| L2 | a `00…` string: the old link prefixed 44; now read as international, or no link | email link | 38 |
| L3 | an extension folded into the link | email link | 1 |
| N1 | a number in no allocated UK range (no format exists for it, e.g. 010…): its national form has no leading 0 | webhook third variant, admin display | 1,026 webhook / 232 display |
| D1 | admin display only: "44" + a 9-digit national number with no + (e.g. 44 1697 72345). The old display needed 12 digits before reading 44 as the country (the old validator already accepted it); now written like +44 1697 72345 | admin truck-detail display | 39 |
| M1 | admin matcher only (`phoneDigits`, never shown or stored): a number with no leading 0 was compared as typed; now every number is compared in its national form | prospect matching | 42 |

**Rendered:**
- The UK order form (7 phone values), the setup wizard and 7 confirmation emails with a WhatsApp contact are **byte-identical**.
- Three cells move, each in a named class:
  - the email for "+44 (0)7380 736226" (L1);
  - the email for "0044 7380 736226" (L2);
  - the order form for "07700 9001234" (R1, now refused) and "+1 201 555 0123" (A2, now accepted).

## 5. The 12 phone files (audit appendix 7.6)

| File | Status |
|---|---|
| `lib/contact-validation.ts` | **Converted.** `isValidUKPhone` is removed; a comment points to `lib/phone.ts` |
| `app/trucks/[slug]/order/page.tsx` | **Converted.** Check, error and placeholder from `truck.phone`; the demo banner gets `phone` |
| `app/setup/page.tsx` | **Converted.** Copy from `/api/setup?check=truck` |
| `app/api/setup/route.ts` | **Converted.** `SIGNUP_COUNTRY`, `isPlausiblePhone`, message from settings, `phone` on the check response |
| `components/DemoGetStarted.tsx` | **Converted.** A `phone` prop from the host's truck payload (dashboard, KDS, order page, DemoLoopComplete) |
| `app/manage/[token]/page.tsx` | **Converted:** contact phone check, error and placeholder. **Left:** the operator's own-profile phone placeholder "+44 7700 900000". It is the operator's personal number, unchecked, shown in international form; deriving it from `phone_example` would change UK copy |
| `lib/email.ts` | **Converted.** The wa.me link via `phoneLinkDigits(raw, phoneCountry)`; `formatConfirmationEmail` now requires `phoneCountry` (7 call sites pass `truck.country`). The text email's "Message us on WhatsApp: {digits}" line has no country logic and is unchanged |
| `lib/whatsapp-hint.ts` | **Converted:** `waPhone` via the module; `phoneWhatsApp` now requires a country. **Left:** the 447-mobile test (which numbers get a Message button). Its only callers are the discovery site and admin outreach, both the marketing country's (GB); 7 call sites pass `MARKETING_COUNTRY` |
| `lib/admin/truck-details.ts` | **Converted:** the +44 / 0044 / 44 → 0 step is the module's national form, for both `normaliseUkPhone` and `phoneDigits`. **Left (admin outreach):** the UK grouping, the mobile / landline split, and the AI prompt line "(keep +44, spaces, 0s)". The admin screenshot flow reads numbers as the marketing country until it has the country picker from the schedule-country audit |
| `app/api/webhooks/meta/whatsapp/route.ts` | **Converted.** The `44…→0…` variant is `nationalDigitsOfInternational(digits)`. Meta's number is international, so its own country gives the national form; the truck is not known yet at that point. UK variants are byte-identical; a US number gains its national variant |
| `app/api/webhooks/whatsapp/route.ts` (Twilio) | **Left:** it matches `whatsapp_sender` against the E.164 number exactly; there is no UK logic (only a comment example) |
| `lib/whatsapp/connection-view.ts` | **Left:** it shows Meta's number verbatim; there is no UK logic (only a comment) |

**Other phone handling left as it is:**
- **Admin outreach** (allowed by the brief):
  - the wa.me dialler in `ProspectWorkspace`;
  - outreach channel choice, through `phoneWhatsApp(…, MARKETING_COUNTRY)`;
  - outreach send rules.
- `app/dev/ticket-preview` (a sample customer phone in a dev page).
- `lib/printing/ticket.ts` (a comment).

## 6. Proof

| Check | Result |
|---|---|
| **UK corpus**: `node scripts/phone-parity.cjs` against the BEFORE snapshot | ✅ All 4,945 inputs: accepted, stored and linked exactly as before, except the named classes in §4 (every moved row must match one, or the run fails) |
| The three GB messages | ✅ Identical to today's strings, and each surface's call is pinned |
| Rendered UK order form, setup wizard and confirmation emails | ✅ Identical, apart from the three named cells (§4) |
| **US truck** (12 checks) | ✅ The four forms of (201) 555-0123 are accepted and give `12015550123`. +44 7380 736226 is accepted on a US truck (a visitor). `555-0123`, `12345`, `201 555 01234 5` and `07700 900123` are refused. The order form refuses `555-0123` with "Please enter a valid US mobile (e.g. (201) 555-0123)". The US placeholder appears on the order and setup pages. A US truck's WhatsApp email link is `wa.me/12015550123`. The webhook's national variant of `12015550123` is `2015550123`. The US example passes its own check |
| The seeds | ✅ The harness reads GB UK / 07700 900123 and US US / (201) 555-0123 from the migration file, never from typed values |
| **Client bundles** after `next build` | ✅ None of: `country_settings`, `default_timezone`, `card_fee_online_pct`, `getCountrySettings`, `countrySettingsForTruck`, `phoneCopyForTruck` / `ForCountry`, `phone-copy`, `truckTimeSettings`, the "has no short_name" log. The words `short_name` / `phone_example` appear only as the payload's two field names in the client copy functions (and as `truck_places.short_name`, an unrelated places column) |
| `tsc --noEmit` | ✅ clean |
| eslint: 133 touched files against HEAD | ✅ No rule count grew; errors 634 → 630, warnings 183 → 181; the new files are clean |
| `next build` | ✅ exit 0 |
| Harness sweep (`scripts/run-harnesses.cjs`, 103 files, including the new `phone-parity.cjs`) | ✅ **103 / 103 passed.** The first run failed 9; each was re-aimed (below), not waived |

**Harness changes:**
- **New:**
  - `scripts/phone-parity.cjs`: corpus, screens, US checks and the named classes; registered in `harnesses.json`.
  - `scripts/fixtures/phone-before.json`.
- **`_country-settings-gb.cjs`:** seed rows now carry `shortName` / `phoneExample` from the 20261010_11 migration. This fixes `time-dates-parity`, `countries-api` and `money-sweep-parity`.
- **`countries-api`:** its column map knows the two columns.
- **`money-sweep-parity`:** the order-page truck fixture carries `phone`, as `/api/menu` now sends it. 3,057 / 3,057 identical.
- **`_slot-interval-compile.cjs` and `whatsapp-background-jobs-harness`:** a package import from the compiled temp tree now resolves from the repo's `node_modules` (libphonenumber-js).
- **`screenshot-truck-details`:** `normaliseUkPhone(x, 'GB')`.
- **`outreach-templates-layout`:** V19 and its check re-anchored to the call that now passes `MARKETING_COUNTRY`.
- **`event-types` and `schedule-graphics-places`:** the line-loss guards name Phase 2C's lines (the dashboard's DemoGetStarted mount; Manage's three contact-phone lines), with companion checks that the replacements are present.
- **`scripts/verify-email-lines.ts`** passes `phoneCountry`.

**Dependency:** `libphonenumber-js` **1.13.13**, pinned exactly in `package.json` (+ lockfile; 8 lines). Released 10 September 2026; the newest release, 1.13.15, is two days old.

## 7. Rules kept

| Rule | |
|---|---|
| main as checked out; never push or deploy; no process killed | ✓ |
| No SQL run; SQL only in this report and in chat | ✓ one migration file, written, not run |
| No `.env*` opened | ✓ |
| Pizza Kitchen through fixtures only; Pizzeria Gusto untouched; no truck data changed | ✓ no database reached |
| No email or WhatsApp sent | ✓ emails rendered in memory; webhooks not called |
| `outreach_templates` untouched; admin outreach phone handling left (listed) | ✓ |
