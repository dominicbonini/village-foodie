# ireland-1 — the Ireland code changes (stage IE-1)

**Date:** 20 October 2026 · **Branch:** main (on top of `4633801c`; uncommitted; nothing pushed or deployed) · **Ireland stays switched OFF.**

## ⚠️ First: the IE rows are not in the database

- The brief says the IE `country_settings` and `plan_prices` rows "have now been run live, switched off". **Read-only
  checks show they are not there.** Queries 1–3 in §9 run against project `ffphgwonshgxamtvefcv`, the only project the
  tools reach:
  - `country_settings` has GB and US only;
  - `plan_prices` has no IE row.
- **I built and proved everything without them.** Every switched-on proof uses an IE fixture with the draft's values.
  The code also treats a **missing IE row exactly like a switched-off one**: /ie 302s to /uk, nothing lists Ireland,
  and nothing throws. That is proved by the harness and on a production build against the live database.
- **The NOT RUN SQL is repeated in §9.** Run it whenever you like: it changes nothing visible while `enabled = false`.

## Summary

- **The address:** `/ie`, `/ie/features` and `/ie/compare` exist.
  - **Off (the live state):** they 302 to the UK pages, and Ireland is in no router pick, hreflang set, sitemap or menu.
  - **On (fixture):** all three render in €, with:
    - hreflang en-IE, reciprocal with en-GB and en-US;
    - sitemap entries;
    - JSON-LD Offers in EUR;
    - the country-menu link;
    - Irish hero screenshots;
    - the footnote "1.5% + €0.25 in Ireland".
- **The wording:**
  - a sparse **en-IE** override of **four** sentences;
  - GB and US marketing text byte-identical;
  - two sign-up refusals made name-free, which also fixes "in United Kingdom" / "in United States".
- **Outreach:** a prospect's phone is read in its own country, and Irish mobiles count as mobiles. GB is unchanged
  (all 246 live prospects are GB).
- **AI prompts:** both are country-aware for Ireland, and both name their output language. GB and US differ only by
  that one block.
- **demoEventWindow** takes its date from `now`. Production callers are unchanged.
- **The IE plans PDF:** masked while off; €, A4 and the footnote once on.
- **Checks:** tsc clean, build passes, no new lint errors. **Full sweep: 146 of 146 pass**, including the new
  `ireland-1` harness (55 checks) and 9 re-pinned harnesses. `event-types-render` passed.

---

## 1 · The address (item 1)

**`lib/marketing-country.ts:29`** now reads `COUNTRY_PATH_SEGMENTS = { GB: 'uk', US: 'us', IE: 'ie' }`. Everything
else (the router, hreflang, sitemap, menu and the `[country]` routes) already reads the switched-on rows plus this
table, so no other routing code changed.

| | IE off, or **no row** (live) | IE on (fixture) |
|---|---|---|
| `/ie`, `/ie/features`, `/ie/compare?free=4` | **302** → `/uk`, `/uk/features`, `/uk/compare?free=4` (production build, live database, curl) | 200, in € |
| Root router, IP = IE | 302 → `/uk` (curl) | 302 → `/ie` |
| Sitemap | no `/ie` (curl: 0 matches) | `/ie` and `/ie/features`, with en-GB/en-US/en-IE/x-default alternates |
| hreflang on /uk, /us | en-GB, en-US, x-default (unchanged) | + `en-IE` → /ie; the same four on /uk, /us and /ie |
| Country menu | GB, US | + Ireland → `/ie` (flag from `country-flag-icons`) |
| The page itself, if reached past the proxy | redirects to /uk (`lib/visitor-country.ts` backstop); never throws, even with no row | renders |

## 2 · The wording (item 2): every changed sentence

**Why there is an override.** "In the {country}" and "{country} food trucks" can't be made neutral in en-GB without
changing the GB and US text, and the brief also requires /uk and /us to stay byte-identical. So en-GB keeps its frames
and **`messages/en-IE.json` overrides just the sentences that read wrongly for Ireland**.
- The locale engine gained a third locale:
  - `lib/i18n/locales.ts:14`, `lib/i18n/messages.ts:18`, `scripts/split-messages.cjs`.
  - The generator writes en-IE **sparsely**: only the 3 namespaces it touches get an en-IE file and import. The other
    104 catalog modules are byte-identical.

| Key | GB (unchanged) | US (unchanged) | IE (en-IE override) |
|---|---|---|---|
| `pricing.footnote` (landing, /features, Billing, PDF) | "…(currently 1.5% + 20p **in the UK**)…" | "…(currently 2.9% + 30¢ **in the US**)…" | "…(currently 1.5% + €0.25 **in Ireland**)…" (was "in the Ireland") |
| `landing.meta.description` | "…software for **UK food trucks** and mobile catering — not a POS." | "…for **US food trucks**…" | "…software for **food trucks and mobile catering in Ireland** — not a POS." (was "Ireland food trucks") |
| `landing.jsonLd.description` | "…kitchen screen for **UK food trucks** and mobile catering." | "…for **US food trucks**…" | "…kitchen screen for **food trucks and mobile catering in Ireland**." |
| `compare.fee.fixedAria` | "Pence per order" | "Cents per order" (existing en-US) | "Cents per order" (was "Pence") |

**Changed for every country,** because the frame was already wrong for GB and US. These are sign-up and setup refusals,
not marketing pages, and en-US has no override for them:

| Key | Before (GB / US / IE) | After (all) |
|---|---|---|
| `tradeArea.country_off` | "Trucks can’t sign up in United Kingdom / United States / Ireland yet. Choose another country." | "Trucks in that country can’t sign up yet. Choose another country." |
| `tradeArea.zone_unknown` | "That time zone isn’t one we offer in United Kingdom / United States / Ireland. Choose one from the list." | "That time zone isn’t one we offer for that country. Choose one from the list." |

**Other frames checked and left alone,** because they already read correctly for all three:
- "HatchGrab {country}" titles: "HatchGrab UK", "HatchGrab US", "HatchGrab Ireland";
- "standard {region}": "standard EEA cards";
- "Cost calculator — HatchGrab {country}".

**Money fix found on the way.** `lib/money-format.ts` wrote a small euro fee as "25c" (`MINOR_SUFFIX` listed EUR),
which would have made the footnote "1.5% + 25c". EUR is taken out of that list, so small euro fees read "€0.25" as
asked. No live country used EUR.

## 3 · Outreach (item 3)

- **The fix:**
  - the outreach list route (`app/api/admin/outreach/route.ts`) now returns each prospect's `country`
    (`discovery_trucks.country`);
  - every phone read uses `prospectPhoneCountry(p)` from the new `lib/outreach-country.ts`, which is the prospect's
    country, or GB when it has none or a bad value. The sites:
    - `components/admin/ProspectWorkspace.tsx:321`
    - `components/admin/OutreachPanel.tsx:604,616`
    - `components/admin/TemplatesPanel.tsx:455,905`
    - the route's WhatsApp hint
  - `lib/whatsapp-hint.ts` counts an Irish mobile (+353 83–89) as a mobile as well as a UK 447 number.
- **Was there a bug? Yes.** Read as GB, "087 123 4567" became **+44 871 234 567**, a UK 0871 number: a wrong WhatsApp
  link, not an empty one.

| Number (prospect country) | Before (always read as GB) | After |
|---|---|---|
| "07700 900123" (GB) | 447700900123, mobile | **identical** (7 GB forms checked byte-for-byte, incl. "+44 (0)7…", "0044…", landline, empty) |
| "087 123 4567" (IE) | 44871234567 ✗ | **353871234567**, mobile; "advertises" when tagged WhatsApp |
| "+353 87 123 4567" (IE) | 353871234567, not a mobile | 353871234567, **mobile** |
| "01 234 5678" (IE landline) | (wrong GB number) | 35312345678, not a mobile |
| "(201) 555-0123" (US) | read as GB | **12015550123** (read in the US) |
| "+1 201 555 0123" (US) | 12015550123, hint none | the same |

**Live effect today: none.** All 246 prospects are GB (§9, query 4), and GB reads exactly as before.

## 4 · The AI prompts (item 4)

**`lib/schedule-extract.ts`** (the operator importer; the context now carries `countryCode`, set in
`lib/schedule-context.ts`):
- **Ireland**, a `postcode` country other than GB, gets:
  - "knowledge of venues and locations in Ireland";
  - **POSTAL CODE RULES** naming the country's own codes ("never a UK postcode");
  - enrichment from "the postal code for that venue in Ireland";
  - two country-neutral examples instead of the four Suffolk and Cambridgeshire ones.
- **GB (and a missing context)** keeps every UK line byte-for-byte. The US `zip_state` prompt is unchanged.

**`lib/admin/screenshot-events.ts`** (the admin screenshot tool):
- Ireland gets "a postal code of Ireland, copied exactly as shown — never a UK postcode", and an event shape without
  "CB25 0BA";
- GB and US are unchanged.

**The output language, in both prompts and every branch.** It comes from the truck's locale via the new
`lib/ai-language.ts`: en-* gives English, de-AT German, and so on.
- The importer:
  > "OUTPUT LANGUAGE: copy venue names, towns and addresses exactly as the source writes them — never translate them.
  > Write anything else in English."
- The screenshot tool:
  > "OUTPUT LANGUAGE: copy truck names, venue names and towns exactly as the screenshot writes them — never translate
  > them. Write anything else (e.g. "CountryReasons") in English."

**Diffed before → after** (captured at a fixed clock):
- the GB, US and no-context importer prompts and the GB, US and no-country screenshot prompts each differ by **exactly
  that one block** (2 lines);
- the IE importer differs in 41 lines and the IE screenshot prompt in 10, as described above.

## 5 · The hero screenshots in euros (item 5)

**The three images,** for your review in `docs/ireland-1/` (also at `public/screenshots/*-ie.png`). They are made by
the committed recipe's Irish twin (`scripts/screenshots/ie-screens.cjs`, `README-ie.md`). It renders the real order
page, dashboard and KDS for a fixture truck (never Pizzeria Gusto): €, en-IE, Europe/Dublin, 24-hour, day-month dates.

| Image | Size (= GB) | Shows |
|---|---|---|
| `customer-order-ie.png` | 1284×2778 | Pizza Kitchen: Margherita €12, Ham & Mushroom €14 ("A crowd favourite."), Supreme €16, Pepperoni €15; basket "1 ITEM €6.00" |
| `dashboard-v4-ie.png` | 800×551 | Add order: 21 pizzas in €, drinks €2.50, total €58.00, customer Róisín; "People's Park — Limerick · 09:00–17:00" |
| `kitchen-ie.png` | 640×480 | Orders #3–#22 for Aoife, Ciarán, Niamh, Seán, Róisín, Cian, Saoirse, Oisín, Caoimhe, Pádraig, … (fadas render) |

**How they were framed and checked:**
- The GB captures already show a 24-hour clock, so the status bars are the GB pixels **unchanged**, with no repaint.
- No $ or £ appears, times are 24-hour, and dates are day-month.

**Wiring:** `lib/landing-screens.ts` adds `IE: { …-ie.png }`. Only IE pages use them, which means invisible while
Ireland is off. The harness checks that /ie shows them and /uk doesn't.

**Noticed while rendering (not changed):**
- today's KDS layout puts the "Ready" pill above the price, unlike the committed GB and US images;
- "Hot Honey Pepperoni" wraps on one KDS card, as in the US image.

## 6 · The plans PDF (item 6)

Rendered by the real generator (`lib/plans-pdf.ts`) for IE, then printed to PDF in Chrome
(`docs/ireland-1/plans-pdf-ie-{off,on}.{pdf,png}`):

| | IE off | IE on (fixture) |
|---|---|---|
| Amounts | every amount "TBC" (19), no € and no £ | €0 / €29 / €69, "First €4,000 …", bands €2,900 / €8,000 |
| Footnote | "(currently TBC in Ireland)" | "(currently **1.5% + €0.25 in Ireland**)" |
| Paper | A4 | A4 |

- **€ renders** in the local print font.
- On Vercel the PDF uses the bundled Open Sans (`lib/plans-pdf.ts:114-123`). Open Sans includes €, but **that
  production render was not run here**.

## 7 · demoEventWindow takes its date from `now` (item 7)

**The change** (`lib/provision-demo-event.ts:90`): the date was `getLocalDateInTz(tz)` (the real clock) and is now
`localDateOfInstant(now, tz)`, so the date and times come from one instant.

**Production callers are unchanged.** None of them passes a `now`, so it is the current time:
- `app/api/demo/route.ts:128`
- `app/api/demo/return/route.ts:52`
- `app/api/admin/provision-demo/route.ts:118`
- `app/api/demo/restart/route.ts:113`
- `app/api/admin/demo-reset/route.ts:35`

**Proved** (`scripts/ireland-1.cjs` §7):
- At the current time, the new date equals the real-clock date across 6 instants × 4 zones: midnight, New Year, the BST
  start and a US late night. It is computed from one instant instead of two, so it can no longer split across midnight.
- A `now` on another day gives that day: 23:30Z on 14 Oct → 15 Oct in London.

**In harnesses only** (fixed `now`, different clock), the demo event's date moves to `now`'s date. language-phase-1c
and language-phase-2 re-pinned that; see §8.

## 8 · What was executed

- **Read-only SQL:** §9.
- **`scripts/ireland-1.cjs`** (new, registered): **55/55**.
  - §1 the address and redirects, with an IE row off **and with no IE row**;
  - §2 the three /ie pages in € with IE on, JSON-LD in EUR, hreflang reciprocity, canonical/og:locale, sitemap, menu
    link, screenshots;
  - §3 no trace of Ireland on /uk or /us while off;
  - §4 the words;
  - §5 outreach parsing for GB, US and IE;
  - §6 the prompts;
  - §7 the demo date;
  - §8 the IE PDF.
- **Production build** (`next build` + `next start` :3100, live database, IE absent):
  - /ie, /ie/features and /ie/compare 302 to the UK pages; the router sends an IE IP to /uk; the sitemap has no /ie.
  - **/uk and /us, local build vs the live site** (`4633801c`, before any of today's changes):
    - head tags (title, meta, canonical, hreflang, JSON-LD, `<html lang>`) **identical** for /uk, /us, /uk/features
      and /us/features;
    - **the pricing sections of /uk and /us byte-identical** (3,352 and 3,366 characters);
    - /uk/compare and /us/compare differ only in og:image and twitter:image's **host**. The local server writes its
      own host, `hatchgrab.localhost:3100`, where live writes `www.hatchgrab.com`; that is the environment, not code.
- **The IE pages switched on, painted** with the build's CSS (`docs/ireland-1/ie-on-{landing,features,compare}-{1440,375}.png`,
  harness renders): € throughout, the footnote "1.5% + €0.25 in Ireland", the Irish flag in the menu, no horizontal
  scroll at 375. The nav appears mid-page because a full-page capture paints the sticky nav where it was.
- **tsc:** clean.
- **Build:** passes.
- **Lint:** the 17 changed source files show **no new errors**. The files with existing findings have exactly HEAD's
  counts (route 9, OutreachPanel 6, TemplatesPanel 3, outreach-shared 2, screenshot-events 2, schedule-extract 3+1).
- **Full sweep (`node scripts/run-harnesses.cjs`): 146 run, 146 passed, 0 failed.** `event-types-render` passed (rc=0),
  with no flake.
- **Re-pins** (each marked `⚠️ RE-PINNED (ireland-1, 20 October 2026)`; done by a sub-agent from my brief; harness
  files only; no product bug found):
  - **`outreach-templates-layout`:** the V19 mutation anchor moved to the `prospectPhoneCountry(p)` line, and still
    proves the same thing.
  - **`screenshot-truck-details`:** ireland-1's exact added and removed prompt lines are a named list, in
    `scripts/fixtures/screenshot-truck-details-ie1-lines.json`. Any other difference still fails.
  - **`signup-country`:** the two new refusal sentences; codes and params still checked.
  - **`time-dates-parity`, `schedules-country-parity`:** the OUTPUT LANGUAGE block is a named difference, allowed once
    at its exact place; everything else is byte-identical.
  - **`messages-parity`, `language-phase-1e`** (via `_lp1e-words.cjs`, `_lp1e-checks.cjs`, `_messages-parity-1e.cjs`):
    the two tradeArea keys are recorded before → after and exempted only on an exact match.
  - **`language-phase-1c`, `language-phase-2`** (via `_lp2-named.cjs`): two named transforms for the demo date. The
    restart views' date becomes `now`'s date.
    - In the return-visit views, a visit on `now`'s day no longer clears the build's earlier-day event. That is what a
      real next-day visit has always done; in production the visit's date is today.
    - `scripts/fixtures/language-phase-2-us-changed.txt` was regenerated by the harness.
  - **`_lp2-frozen.cjs`:** en-IE imports now go through the frozen-words switch.
  - **`scripts/_render-kit.cjs`:** its `redirect` stub now carries the target (`e.redirectTo`); the message is unchanged.
- **Worth knowing:** `schedules-country-parity` has long contained the name "Pizzeria Gusto" as offline prompt text. It
  involves no live truck and no database.

## 9 · SQL

**Read-only queries run** (also in the chat reply):

1. Is there an IE country row?
```sql
select row_to_json(c) as row from country_settings c where country_code = 'IE'
```
2. Are there IE plan prices?
```sql
select plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor from plan_prices where country_code = 'IE' order by plan_key
```
3. Which countries exist?
```sql
select country_code, name, enabled, currency, locale, updated_at, updated_by from country_settings order by country_code
```
4. Outreach prospects by country:
```sql
select coalesce(d.country, '(null)') as country, count(*) as prospects, count(d.phone) as with_phone from outreach_prospects p left join discovery_trucks d on d.id = p.discovery_truck_id group by 1 order by 1
```

**What they returned:**
- **1 and 2:** no rows.
- **3:** GB (enabled, GBP, en-GB) and US (enabled, USD, en-US; updated 20 Oct 16:28 by dominic@hatchgrab.com).
- **4:** GB 246 prospects, 73 with a phone.
- (The project URL was also checked with the Supabase tool: `ffphgwonshgxamtvefcv`.)

**NOT RUN** — the IE rows, switched off. This is unchanged from `docs/europe-readiness-report.md` §A.13, and nothing
becomes visible while `enabled = false`:

```sql
-- NOT RUN — Ireland, switched OFF (enabled = false). Order matters: plan_prices.country_code is a FK to country_settings.
begin;

insert into public.country_settings (
  country_code, name, enabled, currency, locale, time_format, date_order, week_start,
  phone_country_code, address_format, timezones, default_timezone,
  prices_include_tax, tax_label,
  card_surcharge_allowed, card_surcharge_cap_pct, card_surcharge_credit_only, card_surcharge_excluded_regions,
  service_fee_allowed, tipping_enabled_default, tip_presets_pct, allergen_set,
  starter_monthly_minor, pro_monthly_minor, max_monthly_minor, pro_allowance_minor, max_allowance_minor, platform_fee_pct,
  card_fee_online_pct, card_fee_online_fixed_minor, card_fee_in_person_pct, card_fee_in_person_fixed_minor,
  tap_to_pay_fixed_minor, card_fee_region_label,
  competitor_name, competitor_pct, competitor_fixed_minor, support_hours, updated_by,
  short_name, phone_example, phone_check, distance_unit,
  service_fee_recipient, service_fee_hatchgrab_bps, service_fee_hatchgrab_fixed_minor,
  service_fee_truck_max_bps, service_fee_truck_max_fixed_minor,
  platform_fee_enabled, fees_taxed
) values (
  'IE', 'Ireland', false, 'EUR', 'en-IE', '24h', 'dmy', 'monday',
  '353', 'postcode', array['Europe/Dublin'], 'Europe/Dublin',
  true, 'VAT',
  false, null, false, '{}'::text[],
  false, false, '{}'::numeric[], 'uk14',
  null, null, null, null, null, null,
  1.5, 25, 1.4, 10,
  10, 'EEA cards',
  null, null, null, null, 'europe-readiness draft',
  'Ireland', '085 123 4567', 'length', 'km',
  'truck', null, null,
  null, null,
  false, false
);

insert into public.plan_prices (plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor) values
  ('payg',      'IE',    0,      0, 99,    0),
  ('pro',       'IE', 2900, 400000, 99, 2900),
  ('unlimited', 'IE', 6900,   null,  0, 6900);

commit;
```

## 10 · Files

**Product:**
- `lib/marketing-country.ts`
- `lib/i18n/locales.ts`, `lib/i18n/messages.ts`
- `messages/en-IE.json` (new), plus generated `messages/ns/en-IE/{landing,pricing,compare}.json` and
  `lib/i18n/catalog/{landing,pricing,compare}.ts`
- `messages/en-GB.json` (tradeArea)
- `lib/money-format.ts`
- `lib/whatsapp-hint.ts`, `lib/outreach-country.ts` (new)
- `components/admin/{outreach-shared,ProspectWorkspace,OutreachPanel,TemplatesPanel}.tsx`
- `app/api/admin/outreach/route.ts`
- `lib/schedule-extract.ts`, `lib/schedule-context.ts`, `lib/admin/screenshot-events.ts`, `lib/ai-language.ts` (new)
- `lib/provision-demo-event.ts`
- `lib/landing-screens.ts`
- `public/screenshots/{customer-order,dashboard-v4,kitchen}-ie.png` (new)

**Scripts:**
- `scripts/split-messages.cjs`
- `scripts/ireland-1.cjs` (new) and `scripts/harnesses.json`
- `scripts/_render-kit.cjs`
- the re-pinned harnesses in §8
- `scripts/screenshots/*-ie.cjs` and `README-ie.md` (new)

**Docs:** `docs/ireland-1/` (the screenshots, the IE-on page renders, the plans PDFs).

**For you:**
- run the IE SQL when you're ready;
- confirm "EEA cards", and service fee and tips off for Ireland;
- review the three screenshots and the IE PDF;
- before switching Ireland on, the remaining IE-2 items: Stripe allowing IE accounts, and an Irish legal section.
