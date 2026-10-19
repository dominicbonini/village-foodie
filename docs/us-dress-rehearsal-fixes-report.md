# US dress rehearsal fixes — report

19 October 2026. Brief: "US DRESS REHEARSAL FIXES — public truck page for signed-up and non-GB trucks, KDS "Today"
banner, charge summary naming, cancel-page refund line, US address line with state". Source:
`docs/us-dress-rehearsal-stage2-report.md`, Findings 1–6.

Nothing was committed, pushed or deployed. No `.env*` file was opened or read, and no environment value was printed.
No data was changed, and no email or Stripe call left this machine. Pizzeria Gusto was neither touched nor tested
against. The twin stays hidden: the un-hide SQL was not run.

**Result.** All five items are built and proved on fixtures. The KDS banner and the future-start confirmation are also
proved on the hidden twin, and the hidden twin's public page still reads "Truck not found".
- `tsc` is clean.
- ESLint: 620 → 620 on the touched files.
- `next build`: exit 0.
- **Full sweep: 133 / 133 passed**, including the new `us-rehearsal-fixes.cjs` (62 checks), with only the named
  re-pins listed below.
- **One migration, NOT RUN, "run after deploy":** `truck_events.region`. The code works without it.

## Summary

| # | Finding | Fix | GB |
|---|---|---|---|
| 1, 2 | `/trucks/[slug]`: a public truck with no discovery row read "Truck not found" (every country); the discovery trucks list was pinned to GB on both hosts | On the **HatchGrab host only**, a truck that is public there (`active`, not `excluded`, `show_on_hg`) and has no discovery row is drawn from its own operator row. That covers name, cuisine, logo, phone, website, Instagram/Facebook, and its events by slug. The trucks list's GB pin now applies on the Village Foodie host only | **Named:** such a GB truck now renders on HatchGrab. None exists today (query 2) |
| 3 | KDS start banner said "Today · …" for any date | "Today · {range}" only when the event is on the truck's today. Otherwise "{date} · {range}" in the truck's short date ("Sun 25 Oct" / "Sun, Oct 25"). "Start event" on a future-dated event asks "This event is on {date}. Start it now?" (KDS and dashboard) | **Named:** future-dated banner wording and the confirm |
| 4 | Dashboard card summary read "Tax & fees ▾" for tax alone | One charge line beyond the food is drawn plainly ("Sales tax 6.625% $1.56"). Two or more fold, named by one ICU select over the parts present: "Tax & fees", "Tax, fees & tip", "Tax & tip", "Fees & tip", "Fees". Same rule on the basket | Nothing new (a GB order has no charge lines) |
| 5 | Cancel page told a pay-at-truck customer about card refunds | The sentence shows only when a card paid or is held (`/api/orders/cancel` now returns `paymentState`) | **Named:** pay-at-truck orders lose the sentence |
| 6 | US address line had no state | New nullable `truck_events.region` (migration NOT RUN, "run after deploy"), saved by the US Add/Edit form and the importer. Every address line reads "Pier A Park, Hoboken, NJ 07030" when a state is known, and exactly as before when not | Byte-identical (no GB event can carry a state) |

## 1 · Public truck page (Findings 1 and 2, every country)

**Diagnosis.** `/trucks/[slug]` took its whole header from the discovery feed's `trucks` list
(`allTrucks.find(t => t.cleanKey === slug)`). It took its events by `createSlug(event.truckName) === slug`. `page.tsx`
read the `trucks` row only for country, time zone and locale. Signup creates no `discovery_trucks` row, so a public
self-serve truck read "Truck not found". The feed's trucks list also carried `.eq('country', 'GB')` on both hosts, so a
non-GB truck could never list. The twin's name does not slug to its URL (`pizza-kitchen-us` ≠ `test-kitchen-us`), so
its events would not have matched either.

**Fix.**
- `lib/truck-header.ts` (new):
  - `headerFromDiscoveryListRow` is the old inline projection, moved unchanged.
  - `headerFromOperatorRow` builds the header from the operator row: name, cuisine, logo from `truck-media`, phone,
    website, and Instagram/Facebook when set.
  - `isPublicOnHatchGrab` is the feed's own three tests: `active`, not `excluded`, `show_on_hg`.
- `app/trucks/[slug]/page.tsx`:
  - the one `trucks` read by slug now also selects those columns;
  - on the HatchGrab host (`isHatchGrabHost`) it builds the operator header for a HatchGrab-public truck only;
  - Village Foodie never builds it;
  - a render with no request (build or tests) reads as "not HatchGrab".
- `TruckClient.tsx`:
  - **one source, never a mix.** The discovery row wins whenever there is one, byte-identical to before;
  - otherwise it uses the operator header, and its events are the feed's operator events with `truckSlug === slug`;
  - an operator-built page shows none of Village Foodie's discovery prompts (own-this-truck, missing-event,
    weekly-schedule, footer links).
- `app/api/discovery/events/route.ts`:
  - the trucks list's GB pin now applies on the Village Foodie host only;
  - operator events carry `truckSlug`, on HatchGrab only, so the Village Foodie feed gains no key.
- Unchanged:
  - link-preview metadata still comes from the Google Sheets CSV, so an operator-built page gets the fallback title;
  - `og:siteName` is still "Village Foodie".
  - Both were already true for every truck missing from the sheet. Listed under "Not done".

**Proof** (`scripts/us-rehearsal-fixes.cjs` §1, fixtures; BEFORE = the pre-fix source of `page.tsx`,
`TruckClient.tsx`, the feed route and `TruckListCard`, bundled side by side):
- **Feeds:**
  - the Village Foodie feed JSON is byte-identical;
  - the HatchGrab feed is BEFORE plus `truckSlug` on operator events, plus `region` on the one US event that has a
    state.
- **Village Foodie host: byte-identical to BEFORE for all six fixtures:**
  - Gusto-shaped (operator truck + linked discovery row);
  - Pizza Kitchen-shaped, by discovery name and by hidden operator slug;
  - GB public with no discovery row;
  - GB hidden;
  - US public.
- **HatchGrab host: byte-identical for Gusto-shaped, both Pizza Kitchen shapes, and the hidden GB truck.** The hidden
  one reads "Truck not found".
- **GB public truck with no discovery row:**
  - BEFORE: "Truck not found";
  - AFTER: name, cuisine, its event "The Green · Wickhambrook · CB8 8XX", Sun 25 Oct 11:30, call/message, website,
    Instagram;
  - no Village Foodie prompt.
- **US public truck with no discovery row:**
  - renders "Sun, Oct 25", "11:30 AM", "Pier A Park", "Hoboken, NJ 07030", tel link, with no Village Foodie prompt;
  - without the migration (no region) it renders "Hoboken · 07030";
  - on the Village Foodie host it reads "Truck not found".
- **Live, read-only:** the hidden twin's `/trucks/test-kitchen-us` reads "Truck not found"
  (`docs/us-dress-rehearsal/fixes-truck-page-hidden-twin-390.png`).
- Fixture renders: `docs/us-dress-rehearsal/fixture-truck-page-us.html`, `…-gb-new.html`.

## 2 · KDS start banner and future starts (Finding 3, GB and US)

- **Where "Today" was said.** Only the KDS banner hard-coded it: `kds.banner.today` at
  `app/dashboard/[token]/kds/page.tsx:2728`. The other places are already right:
  - every other date label goes through `eventDateLabel` (truck's clock);
  - AddOrderPanel's "Today"/"Tomorrow" and its `todayNotOpen` notice are gated on the truck's today.
- **Banner** (`kds/page.tsx:2732`):
  - `banner.today` when `event_date === getLocalDateInTz(kdsTz)`;
  - otherwise the new `kds.banner.onDate` "{date} · {range}", date by `formatShortDate`: GB "Sun 25 Oct · 11:30 –
    20:00", US "Sun, Oct 25 · 11:30 AM – 8:00 PM";
  - same wording in both, so no en-US override.
- **Confirmation:**
  - **KDS** (`kds/page.tsx:1576`) and **dashboard** (`app/dashboard/[token]/page.tsx:2871`) `openEvent`: a date after
    the truck's today asks `window.confirm("This event is on {date}. Start it now?")` (`kds.event.startFutureConfirm`,
    `dashboard.startFutureConfirm`) before any request;
  - every operator "Start" goes through these two: the KDS banner and menu, the dashboard menu, and AddOrderPanel;
  - same-day starts are unchanged, and the automatic opens are untouched.
- **Live on the twin (read-only):**
  - banner "Sun, Oct 25 · 11:30 AM – 8:00 PM", no "Today ·";
  - pressing Start showed "This event is on Sun, Oct 25. Start it now?";
  - it was **dismissed**, and no event-action request was sent (one was also blocked as a backstop);
  - the KDS sent only its normal heartbeat/ping;
  - screenshots: `fixes-kds-banner-810.png`, `fixes-kds-after-dismiss-810.png`.

## 3 · Charge summary naming (Finding 4)

- `lib/order-charge-lines.ts` `chargeParts(lines)` → `tax` / `fees` (service or card fee) / `tip`, joined.
- One ICU select each for `charges.foldedCharges` (basket) and `orderCard.chargesSummary` (dashboard card):
  `{parts, select, tax_fees_tip {Tax, fees & tip} tax_tip {Tax & tip} fees_tip {Fees & tip} fees {Fees} other {Tax & fees}}`.
  No hand-built strings, and no en-US override (same words).
- **One line plainly:**
  - **basket** (`FoldedChargeRows`): already folded only with two or more lines;
  - **dashboard card** (`OrderCard`, solo): two lines (subtotal + one) now draws that line plainly — label, rate,
    amount, no button.
- The KDS still draws no money lines.
- **Proof** (§3), basket and card for each combination:
  - tax only → "Sales tax 6.625% $1.59", plain;
  - tax+tip → "Tax & tip";
  - fee+tip → "Fees & tip";
  - tax+fee → "Tax & fees";
  - tax+fee+tip → "Tax, fees & tip";
  - two fees → "Fees";
  - a GB order draws no charge line.
- Earlier pins hold: "Tax, fees & tip ▾ $6.60", "Tax & fees ▾ $3.00".
- The dashboard needs sign-in, so its live look is in Dominic's localhost check.

## 4 · Cancel page (Finding 5)

- `/api/orders/cancel` already resolved `paymentState` before releasing a hold. It now returns it as an added last
  field: `{ ok: true, paymentState }`.
- `app/order/[id]/manage/page.tsx` passes `card: 'no'` only for `'hatch'` (pay at the truck / no live
  authorisation). `orderStatus.cancelledBody` (GB and its en-US "canceled" override) is now
  `Your order has been cancelled.{card, select, no {} other { If you paid by card, …}}`, every word as it was.
- `captured`, `part_paid`, `held`, `held_short`, `unknown` and no answer keep the sentence. The sentence is
  conditional ("If you paid by card…"), so showing it when the state can't be read is never wrong.
- **Proof** (§4): `hatch` → "Your order has been cancelled." alone (US "canceled."); every other state → the sentence
  word for word.

## 5 · US address line with state (Finding 6)

**Diagnosis:**
- Nothing stores an event's state:
  - `truck_events` has `address`, `venue_address`, `postcode`, `town`;
  - `truck_places` has `address`, `postcode`, `area`;
  - `venues.region` exists but is null on all 881 venues (all GB) and no event reads it.
- `trucks.base_region(_code)` is the truck's base town. Per the brief it is **not** used.
- The importer already extracts `state` (`lib/schedule-extract.ts`, zip_state prompt) and then drops it.
- No shared address formatter existed: about 20 places joined venue/town/postcode by hand.

**Migration** `supabase/migrations/20261019_truck_events_region.sql`:
- NOT RUN, "run after deploy";
- adds `region text`, nullable, no default, no backfill; idempotent;
- its SQL is given in chat.
- **Dry run:** `EXPLAIN` cannot take DDL (42601). A read-only check shows the column does not exist yet. `EXPLAIN
  select id, region …` fails 42703, which is exactly the error the code treats as "no states".

**Tolerating the missing column:**
- **Reads:** `lib/event-region-read.ts` `readEventRegions` is a separate best-effort `select id, region`. Any error →
  no states → every line as before. No named select gains a column, so no money path can fail on 42703 (submit,
  promote-draft, dashboard action).
- **Writes:** `upsert_event` writes `region` in its own best-effort update after the save, and only when the client sent
  the key. A failure is logged and the event stands.

**Formatter** `lib/event-address.ts`:
- `eventAddressLine` → "Pier A Park, Hoboken, NJ 07030" with a state. Without one it is exactly the old
  `[venue, town, postcode].join(', ')`.
- `eventAreaLineWithRegion` → "Hoboken, NJ 07030" for the card's second line. Without a state it returns null and the
  card keeps "Hoboken · 07030".

**Where it prints:**

| Surface | Before | Now (with a state) |
|---|---|---|
| Customer confirmation email (and its "ready" variant) — HTML and text | "📍 Pier A Park, Hoboken, 07030" | "📍 Pier A Park, Hoboken, NJ 07030" |
| Operator new-order email (HTML / text) | "…, Hoboken, 07030" / "Pier A Park, Hoboken" | "…, Hoboken, NJ 07030" / "Pier A Park, Hoboken, NJ" |
| Event-cancellation email | "Pier A Park, Hoboken" | "Pier A Park, Hoboken, NJ" |
| Public truck page, embed / custom-domain schedule, order page event cards (`TruckListCard`) | "Hoboken · 07030" | "Hoboken, NJ 07030" |
| Confirmation page (`OrderConfirmation`) | prints no location | unchanged |
| Status / manage-my-order page | venue name only | unchanged |
| KDS / dashboard event bar | "Pier A Park — Hoboken" (no postcode) | unchanged (not an address line) |

- Email callers that pass the state:
  - submit ×2, promote-draft ×2;
  - dashboard action: ready, confirm, manual order ×2, time change;
  - events action (event cancel).
- Feeds: the discovery operator leg, `/api/embed/events` and `/api/events` add `region` only when known and only for a
  non-private event.

**Who saves it:**
- **Manage Add/Edit event:** yes, US (zip_state) style only. A State box sits beside the ZIP, and the form sends
  `region` only in that style, so a GB save never carries the key.
- **Importer:** yes, in both paths (setup wizard and the Import modal), when the model returned a two-letter state.
- **Inbound email schedules** (`/api/inbound-schedule`): no, unchanged; they write `truck_events` without it.
- The Add/Edit form's preview card does not show the state yet.
- Until the migration runs, saves succeed and the state is dropped with a server warning.

**Proof** (§5):
- formatter cases;
- GB customer confirmation, operator new-order and event-cancellation emails **byte-identical to BEFORE** (`lib/email.ts`
  at HEAD bundled beside today's);
- the US emails with a state show "NJ 07030", and without one the old line;
- source checks that every caller uses the separate read, that Manage writes only when sent, and that the migration is
  additive.

## GB: every changed behaviour, named

1. **Truck page:** on HatchGrab, a GB truck that is public there with no discovery row now renders from its operator
   row instead of "Truck not found". No such truck exists today (query 2), and the Village Foodie host is unchanged.
2. **HatchGrab feed:**
   - operator events gain `truckSlug`;
   - the discovery trucks list is no longer GB-pinned on HatchGrab. Every discovery row is GB today (query 1), so
     nothing new lists.
3. **KDS banner:** a confirmed event not on the truck's today reads "{date} · {range}" (e.g. "Sun 25 Oct · 11:30 –
   20:00") instead of "Today · …".
4. **Start event** on a future-dated event (KDS and dashboard) asks "This event is on {date}. Start it now?".
5. **Cancel page:** a pay-at-the-truck order reads "Your order has been cancelled." without the card-refund sentence.
   The API response gains `paymentState`.

Everything else in GB is byte-identical. Charges, emails, cards, feeds and Manage are proved by the sweep's
byte-identity harnesses and by `us-rehearsal-fixes.cjs`.

## Checks

- `tsc --noEmit`: clean.
- **ESLint** on the 26 touched files: 620 → 620, with no rule and no file growing. BEFORE is each file at HEAD, linted
  from stdin. Two `any`s added on the way were removed.
- `next build`: exit 0. `/trucks/[slug]` was already dynamic (the root layout reads `headers()`).
- **New harness `scripts/us-rehearsal-fixes.cjs`:** 62 checks, all pass; listed in `harnesses.json`.
- **Full sweep** (`node scripts/run-harnesses.cjs`, after every change): **133 run · 133 passed · 0 failed**.

**Named re-pins** (each marked "⚠️ RE-PINNED … 19 October 2026" in place):
- `scripts/_lp2-named-usl.cjs`:
  - the fold transforms read the new `{parts, select…}` (`wordsFor`), and are named by kind;
  - the dashboard card's one-line case is drawn plainly (us-rehearsal-fix-charge-parts).
- `scripts/_lp2-named.cjs`: `us-rehearsal-fix-cancel-payment-state`. `1a/api/(GB|US)|cancel|ok` gains
  `"paymentState":"hatch"`. PRECISE (language-phase-1a, language-phase-2).
- `scripts/_lp1d2-named.cjs`: `us-rehearsal-fix-event-state`. The US Add/Edit form gains the State box beside the ZIP.
  PRECISE (language-phase-1d2; no GB view claimed).
- `scripts/schedule-graphics-places.cjs`: the `EditingEvent` line claim is re-pointed to the type with `region`
  (USRF_NOW).
- **Messages** (messages-parity, language-phase-1e):
  - `orderStatus.cancelledBody` is recorded as a GB change in `language-phase-1e-gb-moved.json` and
    `-gb-named.json`, with its new `{card}` argument named in `FIX_ARGS`;
  - `manageScheduleEvent.statePlaceholder` "e.g. NJ" is named in `NEW_WORDING`.

## Localhost check (Dominic, signed in, Safari, `http://hatchgrab.localhost:3000`)

⛔ Don't press Connect or any Stripe button, take no card payments, and don't touch Pizzeria Gusto or Pizza Kitchen.

1. **Twin KDS:**
   - the banner reads "Sun, Oct 25 · 11:30 AM – 8:00 PM";
   - press **Start event** → "This event is on Sun, Oct 25. Start it now?" → press **Cancel**. Nothing starts.
2. **Twin dashboard, Oct 25 event:**
   - orders #1/#3/#4/#5 show **"Sales tax 6.625% $…"** plainly, with no "▾";
   - the event menu's **Start** asks the same question → Cancel.
3. **Any GB truck's KDS on a same-day event:** still "Today · …", and Start starts with no question (only on a test
   truck).
4. **After the migration has run:**
   - Manage › Schedule › Edit the Pier A Park event: a **State** box beside the ZIP; type **NJ**, save;
   - place a pay-at-truck test order (dominicbonini@hotmail.com): the confirmation email reads
     "📍 Pier A Park, Hoboken, NJ 07030";
   - the order page's event card reads "Hoboken, NJ 07030".
5. **Cancel that test order** from its manage link: the page reads "Your order has been canceled." with no card
   sentence.
6. A GB truck's Add event still shows only Postcode (no State box).

## Not done / notes

- **Link previews:** an operator-built truck page's link preview still uses the Google Sheets CSV and Village Foodie
  branding (`generateMetadata`). The page itself is right; the preview is a separate fix.
- **Not given a state:**
  - inbound email schedules (`/api/inbound-schedule`);
  - the Manage preview card;
  - WhatsApp's AI prompt line;
  - calendar links (discovery cards, GB data only);
  - social captions.
- **`add-order-refresh-inputs.cjs`** failed once in the first (mid-work) sweep, at 1530 s under parallel load (it uses
  real 5-second throttle windows). It passed alone, and in the final sweep (214 s). It is untouched by this work.
- **Twin cleanup:** the twin and its five orders are as stage 2 left them.

## Read-only queries (Supabase MCP)

**1 · Discovery rows by country and visibility.** All rows are GB.
```sql
select country, show_on_hg, show_on_vf, excluded, count(*) from discovery_trucks group by 1,2,3,4 order by 1,2,3,4;
```
| country | show_on_hg | show_on_vf | excluded | count |
|---|---|---|---|---|
| GB | false | false | false | 15 |
| GB | false | false | true | 114 |
| GB | true | false | false | 1 |
| GB | true | false | true | 1 |
| GB | true | true | false | 122 |
| GB | true | true | true | 14 |

**2 · Operator trucks: public flags and discovery rows.** Every public truck (`active`, not `excluded`, `show_on_hg`)
already has a linked discovery row, so no live page changes.
```sql
select t.slug, t.country, t.active, t.excluded, t.show_on_hg, t.show_on_vf,
       (select count(*) from discovery_trucks d where d.hatchgrab_truck_id = t.id) as linked_disc,
       exists(select 1 from discovery_trucks d where lower(regexp_replace(d.name,'[^a-zA-Z0-9]+','-','g')) = t.slug) as name_match
  from trucks t order by t.slug;
```
- Public on HatchGrab:
  - pizzeria-gusto (linked 1);
  - real-thai-food (linked 1).
- Hidden on HatchGrab:
  - test-kitchen (linked 1);
  - test-kitchen-us (US, linked 0);
  - tikka-tonic (VF only, linked 1).
- Excluded:
  - app-tester, demo-…, test-truck-2, test-truck-3, tt3, village-spice.

**3 · `trucks` columns the header reads.** All exist: name, slug, logo_storage_path, cuisine_type, contact_phone,
website, social_instagram, social_facebook, phone_is_whatsapp, active, excluded, show_on_hg, order_link_hg.
```sql
select column_name, data_type from information_schema.columns where table_schema='public' and table_name='trucks'
   and column_name in ('name','slug','logo_storage_path','cuisine_type','contact_phone','website','social_instagram','social_facebook','social_tiktok','phone_is_whatsapp','active','excluded','show_on_hg','menu_url','order_link_hg') order by 1;
```

**4 · The twin's header fields.** Pizza Kitchen US · test-kitchen-us · Thai · no logo · has phone · website "" ·
no socials · not WhatsApp.
```sql
select name, slug, cuisine_type, logo_storage_path is not null as has_logo, contact_phone is not null as has_phone,
       website, social_instagram, social_facebook, phone_is_whatsapp from trucks where id='test-truck-us';
```

**5 · Twin dashboard token**, to open the twin's pages read-only. The column list showed `dashboard_token` and
`messenger_page_token`; the value is left out of this report.
```sql
select dashboard_token from trucks where id='test-truck-us';
```

**6 · Does `truck_events.region` exist?** No (empty result).
```sql
select column_name from information_schema.columns where table_schema='public' and table_name='truck_events' and column_name='region';
```

**7 · EXPLAIN dry run of the migration's DDL.** Not possible: `ERROR 42601: syntax error at or near "alter"`
(EXPLAIN takes no DDL).
```sql
explain alter table public.truck_events add column if not exists region text;
```

**8 · EXPLAIN of the code's region read.** `ERROR 42703: column "region" does not exist`. This is the error
`readEventRegions` treats as "no states".
```sql
explain select id, region from public.truck_events where id = '7021f4a3-75d7-4e98-8c88-e138b09a0838';
```

**Earlier in this brief** (schema reads during diagnosis):
- `venues` has `village, postcode, country, region`;
- `truck_places` has `address, postcode`;
- `truck_events` has `address, venue_address, postcode, town` and no state;
- `venues.region` is null on all 881 venues, all GB.

## SQL for Dominic

**`supabase/migrations/20261019_truck_events_region.sql`: NOT RUN, "run after deploy".** It is additive: a nullable
column with no default, nothing backfilled, and idempotent. The code tolerates it missing, so it can also run before
deploy.

```sql
set lock_timeout = '3s';

begin;

alter table public.truck_events add column if not exists region text;
comment on column public.truck_events.region is
  'The event''s two-letter state (US) when the operator or the importer gave one; NULL otherwise. Never inferred. 20261019.';

commit;

notify pgrst, 'reload schema';

-- verify (read-only): expect one row — text, is_nullable YES, column_default NULL
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'truck_events' and column_name = 'region';
```
