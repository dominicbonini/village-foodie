# reviews-weather-1: Google review requests and weather per stop (backend only, switched off)

*5 November 2026.*

- **Committed on `main`:** migration `bd17d482` and its fix `81f2ebba`; the build in `c711b67a` (this report in the commit after it). Not pushed, not deployed.
- **Migration 20261072** was run with `scripts/db-migrate.cjs` and verified read-only (§2). Its first run failed and rolled back: `orders` is keyed by `order_key`, not `id`. The fix was committed and the second run applied cleanly.
- **Everything is switched OFF:**
  - two global switches in data (`platform_switches`), both `false`;
  - every per-truck setting `false` (no rows yet);
  - neither job registered as a cron;
  - every route answers 404 or `{ enabled: false }`.
- **No screen, email, page or landing change.** No live file is touched (§7, harness §13).
- **Test data only:** the harness runs on fixtures; nothing was written to a real truck.

| # | Item | Outcome |
|---|---|---|
| 0 | Diagnosis | Done (§1). |
| 1 | Google review requests | **Built, inactive.** Per-truck settings, a global switch, scheduling after completion, once per customer per truck per 60 days, never for cancelled or refunded orders, unsubscribe honoured, in the order's language, 12 strings in en-GB and all 28 bases (§3). |
| 2 | Weather per stop | **Built, inactive.** A provider interface with one implementation, **OpenWeather** (Apple WeatherKit's licence does not fit this design; §4), a cache per location and hour, refreshed daily and every 3 hours on the day, stored per stop, and a route for a future screen. |
| 3 | Proof | `scripts/reviews-weather-1.cjs` (registered): **79 passed, 0 failed**. translation-check: **structural 0 in all 28**. `tsc` and `eslint` clean. Full sweep in §6. |

## Flags (read these first)

1. 🔴 **Weather: I did not use Apple WeatherKit.** Its licence (Apple Developer Program License Agreement, Attachment 8, read verbatim) has two clauses that conflict with this design:
   - **§1.6:** "Apple Weather Data may not be cached, pre-fetched, or stored by You, Your Application, or Your Corresponding Product other than on a temporary and limited basis solely to improve the performance of the WeatherKit APIs". The brief asks for a cache per location and hour, refreshed daily, and the forecast stored on each stop.
   - **§1.2:** "You may not charge any fees to end users for access to or use of the Apple Weather Data presented in its original form". HatchGrab is a paid product.
   - So I built **OpenWeather One Call API 3.0**:
     - its price page says "Commercial use is allowed" on all self-service plans (ODbL);
     - the first 1,000 calls a day are free, then 0.0012 GBP a call;
     - it requires visible attribution, "Weather data © OpenWeather".
   - The provider is behind an interface (`WeatherProvider`), so swapping is one file. Details and costs in §4.
2. **The "complete" signal is two signals**, because most trucks never press "collected" (diagnosis, §1):
   - **(a)** `status = 'collected'`, at `collected_at`;
   - **(b)** `status` `confirmed` or `ready` on an event that has **closed**, at the event's `closed_at`.
   - Live: 315 collected orders had an email, against 1,481 confirmed or ready on closed events. Using (a) alone would miss about 80%.
   - ⚠️ **The known cost of (b):** a no-show left `confirmed` on a closed event would get a request. A no-show that the truck cancels gets none.
3. **The customer's address is never stored by this feature.**
   - Requests and opt-outs keep `sha256(truck id + email)`, which is enough for the 60-day rule and the unsubscribe.
   - The address is read from the order at send time, so an order already anonymised by the retention job (`customer_email` null) is skipped.
4. **The unsubscribe link works whether or not the switches are on.** An emailed link must keep working.
   - `/api/reviews/unsubscribe?t=<token>` (GET, and one-click POST from the `List-Unsubscribe-Post` header).
   - No request exists today, so every token is unknown and every call answers **404**: no customer-facing change.
   - It records an opt-out **per truck**, because the email is the truck's. Say if you would rather it cover every HatchGrab truck.
   - Its confirmation is a plain text page in the customer's language. The look is yours to agree later.
5. **Neither job is a cron yet.** `/api/cron/review-requests` and `/api/cron/weather` exist and refuse without `CRON_SECRET`. They are deliberately **not** in `vercel.json`. When you switch on, add:
   ```json
   { "path": "/api/cron/review-requests", "schedule": "*/15 * * * *" },
   { "path": "/api/cron/weather", "schedule": "0 * * * *" }
   ```
   With the 15-minute schedule, a delay of N minutes means N to N+15 in practice.
6. **Settings live in their own table (`truck_review_settings`), not as columns on `trucks`.** Many routes `select('*')` a truck, so new columns there would ride along in existing responses.
7. **Is this email marketing?** I haven't decided it; §5 sets out the UK and EU position.
   - In short: a request to post a public review is likely to be treated as **direct marketing** under PECR (UK) and the ePrivacy rules (EU).
   - **Germany:** the Federal Court has held a satisfaction-survey email to be advertising (BGH VI ZR 225/17, 10 July 2018).
   - **Before switching on:** either consent, or the "soft opt-in", which needs an opt-out offered **when the email is collected** (on the order page). That is a customer-facing change for later.
8. **The prompt's two chat instructions differ:** "every migration … in fenced blocks" against "only a two-line summary". I followed the precedent from competitor-wtt-1: two lines of prose, plus the fenced blocks and the key.
9. **Translation choices worth a look** (from the two translation agents; all 28 checked):
   - **Register:** each base uses the form of address of its existing customer emails (for example de *Sie*, fr *vous*, es *tú*).
   - **Case languages:** they put `{truck}` as the subject, or use their existing "food truck {truck}" pattern, so any name works (pl, cs, sk, sl, el).
   - **"na Google"** is kept uninflected in cs, sk and sl, so "Google" stays intact.
   - **"Subscription cancelled"-style titles** (it, pt, cs, sk, fr, lv, lt, pt-BR) avoid gendered "you're unsubscribed".
   - **fi "Peru viestit" and et "Loobu kirjadest":** the usual footer words also mean "cancel order".
   - **nl uses "review"**, a normal Dutch loanword; the checker flags it as English.

## 1 · Diagnosis (read-only)

**Order states** (`orders.status`, live):

| status | orders |
|---|---|
| confirmed | 1,762 |
| collected | 945 |
| ready | 234 |
| pending | 126 |
| cancelled | 38 |
| rejected | 5 |
| modified | 3 |

- **Timestamps:** `collected_at` is set on 838 collected orders and missing on 107 (older ones).
- **No "completed" order state exists.**
- **What "event completed" could mean:**
  - `truck_events.closed_at` / `status = 'closed'` (133 events) — this is the one used;
  - or the stop's `end_time` passing, which nothing records.
- **Refunds:**
  - `orders.payment_status` (`refunded` 1, `refund_due` 3);
  - `order_payments` rows with `kind = 'refund'` and `state = 'succeeded'` (1).
  - Both are honoured.
- **2,000 past orders sit at `confirmed` or `ready`.**
  - 1,481 of them are on closed events and have an email; 315 collected orders have one.
  - This is why "event closed" is the second signal.

**Customer emails today:**
- **Where:** `lib/email.ts`, which covers confirmation, ready, cancellation, event cancellation and refund, plus `lib/orders/reject-order.ts`.
- **How:** sent by Brevo, From the truck's name, in the order's language (`moneyFormatForOrder(order).locale`, from its country), with a privacy link in the footer (`lib/email-privacy.ts`).
- **They are all transactional:**
  - **no unsubscribe link anywhere** in customer email;
  - **no marketing consent collected on the order page**;
  - the only consent stored is the operator's at signup (migration 20260723).
- **The only unsubscribe state that exists** is Village Foodie's newsletter (`subscribers.unsubscribed_at`). Outreach mail deliberately sends no `List-Unsubscribe`.
- **Retention:** `lib/order-retention.ts` nulls `customer_email` after the retention period.

**Events' location and time** (`truck_events`):
- **Location:** `latitude` / `longitude` on the stop; otherwise its venue's (`venue_id` → `venues.latitude` / `longitude`).
- **Time:** `event_date` (date) and `start_time` / `end_time` (time, no zone), the truck's wall clock.
- **Zone:** `trucks.timezone`, else the country's (`lib/truck-time.ts`).
- **Live:** 6 upcoming stops, 2 of them with coordinates.

## 2 · The data (migration 20261072, run)

`supabase/migrations/20261072_reviews_weather_1.sql`. **The first run** (`bd17d482`) **failed and rolled back**:

```
npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261072_reviews_weather_1.sql
db-migrate: supabase/migrations/20261072_reviews_weather_1.sql · sha256 3fc5bba893d6e348 · committed at bd17d482
db-migrate: FAILED — nothing after the error ran, and the transaction was rolled back: there is no unique constraint matching given keys for referenced table "orders"
```

**The second run** (`81f2ebba`, `order_key uuid references orders(order_key)`):

```
npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261072_reviews_weather_1.sql
db-migrate: supabase/migrations/20261072_reviews_weather_1.sql · sha256 cbfb2502f31b57c5 · committed at 81f2ebba
db-migrate: supabase/migrations/20261072_reviews_weather_1.sql applied — one transaction, no error
```

**The six tables:**

| Table | What it holds |
|---|---|
| `platform_switches` | one row; `review_requests_enabled`, `weather_enabled`, both **false** |
| `truck_review_settings` | per truck: `review_requests_enabled` (false), `google_review_url` (https, ≤ 500, checked again in code), `review_request_delay_minutes` (60; 0 … 10080) |
| `review_requests` | one per order (`unique (order_key)`); `email_hash` (64 hex); `locale`; `completed_at` and `completion_signal`; `due_at`; `status` scheduled / sent / skipped / failed; `skip_reason`; `attempts`; `sent_at`; `unsubscribe_token` (32 base64url, unique) |
| `review_request_optouts` | (truck, email hash), with a source |
| `weather_hourly` | the cache: provider, lat / lng (0.01°), kind (hour / day), time; temperature, min / max, chance of rain, wind, code; `fetched_at` |
| `event_weather` | per stop: status ok / stale / unavailable / no_location / too_far; resolution; window; min / max temperature; highest chance of rain; strongest wind; code; the hours; `fetched_at` |

- **Every table:** RLS on, no policy, nothing granted to anon or authenticated.
- No row of an existing table is written; only the switches row is inserted.

**Verify (read-only):**

```sql
select
 (select row_to_json(p) from (select id, review_requests_enabled, weather_enabled from platform_switches) p) as switches,
 (select count(*) from platform_switches) as switch_rows,
 (select string_agg(relname||'='||relrowsecurity, ', ' order by relname) from pg_class where relname in ('platform_switches','truck_review_settings','review_requests','review_request_optouts','weather_hourly','event_weather') and relkind='r') as rls,
 (select count(*) from pg_policies where tablename in ('platform_switches','truck_review_settings','review_requests','review_request_optouts','weather_hourly','event_weather')) as policies,
 (select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in ('platform_switches','truck_review_settings','review_requests','review_request_optouts','weather_hourly','event_weather') and grantee in ('anon','authenticated')) as anon_auth_grants,
 (select string_agg(conname, ', ' order by conname) from pg_constraint where conrelid='public.review_requests'::regclass) as review_requests_constraints,
 (select (select count(*) from truck_review_settings) + (select count(*) from review_requests) + (select count(*) from review_request_optouts) + (select count(*) from weather_hourly) + (select count(*) from event_weather)) as rows_in_new_tables;
```

| Check | Result |
|---|---|
| switches | `{"id":true,"review_requests_enabled":false,"weather_enabled":false}` |
| switch_rows | 1 |
| rls | event_weather, platform_switches, review_request_optouts, review_requests, truck_review_settings, weather_hourly: all true |
| policies | 0 |
| anon_auth_grants | 0 |
| review_requests_constraints | completion_signal_check, email_hash_check, one_per_order_uq, order_key_fkey, pkey, status_check, token_uq, truck_id_fkey, unsubscribe_token_check |
| rows_in_new_tables | 0 |

## 3 · Google review requests (`lib/reviews/`)

**The rules** (`model.ts`, pure):
- **The link** (`checkGoogleReviewUrl`): https only, and exactly one of two shapes.
  - **Accepted:**
    - `search.google.com/local/writereview?placeid=<id>`, normalised (other parameters dropped);
    - `g.page/r/<code>`, optionally with `/review`.
  - **Refused:** http, look-alike hosts, other paths, a missing place id, credentials, a port, a query on g.page, `javascript:`, junk and over 500 characters.
- **The delay:** a whole number of minutes, 0 to 7 days; anything else is 60.
- **Complete:** see flag 2. Pending, modified, cancelled, rejected and refunded orders never count.
- **The 60 days:** a scheduled or sent request for the same truck and email hash within 60 days of the new one's due time blocks it.
  - The email is lower-cased and trimmed first, so "Repeat@" and "repeat@" are one customer.
  - The rule is per truck, so another truck can still ask.
- **The look-back:** orders completed more than 48 hours ago are never picked up, so switching on does not mail last month's customers.

**One run** (`run.ts`, `/api/cron/review-requests`):
1. **The global switch is read first.** When it is off, nothing else is read.
2. **Schedule:**
   - for each truck with its switch on, a valid link, active and not a demo: its orders completed in the last 48 hours that have no request;
   - skip those with no email, those that unsubscribed, and those asked within 60 days;
   - store a request due at completion plus the delay, in the order's language, with a fresh token.
3. **Send what is due, checking everything again first:**
   - the switches, the truck, the link;
   - the order still complete, not cancelled or refunded since, with an email (not anonymised) that still matches;
   - not unsubscribed since.
   - A failed send is retried; after three it is `failed`, with the reason.
4. **Prune:** requests older than 120 days are deleted.

**The email** (`email.ts`, words `emailReview`):
- **From and Reply-To:** From "<Truck> via HatchGrab" at the HatchGrab sender, Reply-To the truck's contact email.
- **Unsubscribe headers:** `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- **Format:** HTML and plain text, the truck's name escaped, and the privacy link as in every customer email.
- **The words (en-GB):**
  - **Subject:** "How was your order from {truck}?"
  - **Heading:** "Thanks for ordering from {truck}"
  - **Body:** "{truck} would be grateful for an honest review on Google. It only takes a minute, and it helps other people find them."
  - **Button:** "Leave a review on Google"
  - **Who it's from:** "This email is from {truck}, sent through HatchGrab because you ordered from them."
  - **Unsubscribe:** "Don’t want review requests from {truck}? Unsubscribe"
  - **The confirmation page:** "You’re unsubscribed" / "{truck} won’t send you review requests any more." / "This unsubscribe link isn’t valid."
  - **en-US** differs only in "anymore".
- 🔴 **Google's rule** ("Don't discourage or prohibit negative reviews or selectively solicit positive reviews from customers"):
  - every customer gets the same words and one link;
  - there is no rating step, no "if you enjoyed it" and no second path;
  - the harness checks the words for "enjoy", "happy", "rate", "stars", "feedback" and "how did we do".

## 4 · Weather per stop (`lib/weather/`)

**The provider decision:**

| Option | Commercial use | Cost | Fits this design? |
|---|---|---|---|
| Apple WeatherKit (REST, JWT) | allowed on the web | 500,000 calls a month with membership; then from US$49.99 a month for 1 M | **No**: §1.6 bars storing the data beyond temporary performance caching; §1.2 bars charging users for it in its original form |
| **OpenWeather One Call 3.0** (built) | "Commercial use is allowed" (ODbL) | first **1,000 calls a day free**, then **0.0012 GBP a call** (ex VAT) | **Yes**; needs "Weather data © OpenWeather" shown visibly beside the data |
| Open-Meteo | free tier non-commercial only | Standard plan, 1 M calls a month (US$29 a month in June 2023; current price not shown) | yes, but costs from the first call; CC BY 4.0 attribution |
| Met Office DataHub (site-specific) | not stated for the free plan (360 calls a day) | from £9 a month (900 calls a day) | unclear terms |

**OpenWeather cost at HatchGrab's volume (an estimate):**
- **The basis:** one call covers a location for 48 hourly and 8 daily points. Each location is fetched once a day, and about every 3 hours while it has a stop that day.
- **Today:** 6 upcoming stops, so well under 1,000 calls a day: **£0**.
- **At about 1,000 trucks:** roughly 1,500 calls a day, about 500 of them paid, so **about £0.60 a day (£18 a month)**.
- **A cap:** set a daily call limit in OpenWeather's dashboard (for example 1,000) to keep it free.

**The rules** (`model.ts`, pure):
- **The window:** the stop's start and end times in the truck's zone; an end at or before the start runs past midnight; no times means 10:00–16:00 local.
- **The location:** rounded to 0.01° (about 1 km), so stops at the same place share one cache entry and one call.
- **Refresh:** when a location's cache is over 24 hours old, or over 3 hours when one of its stops is today in its own zone.
- **The summary for a window:**
  - **hourly**, when every hour of the window is cached: min / max temperature, the highest chance of rain, the strongest wind, the commonest condition (a tie shows the worse) and the hours themselves;
  - **otherwise** that local day's forecast;
  - **otherwise** unavailable.
- **Stops:**
  - more than 7 days ahead: `too_far`, not fetched;
  - no coordinates on the stop or its venue: `no_location`;
  - cancelled, ended and demo stops: left out.
- **Fallback:** a failed fetch keeps the old cache, and the stop reads `stale` with the old forecast, never dropped. With no cache, the stop reads `unavailable`.
- **Codes:** clear, partly_cloudy, cloudy, fog, drizzle, rain, heavy_rain, sleet, snow, thunderstorm, wind, unknown (from OpenWeather's condition ids).
- **Units:** temperature in °C, chance of rain in %, wind in km/h.

**For a future screen:** `POST /api/manage/weather { token }`.
- Anyone with access to the truck, staff included.
- It refreshes that truck's stops within the cache rules and returns `{ attribution, events: [...] }`.
- **While `weather_enabled` is false it answers 404 and fetches nothing.**

**The job:** `/api/cron/weather` does the same for every upcoming stop (flag 5).

### 🔑 The key to create and the Vercel variable to add (only when you switch weather on)

1. At **openweathermap.org**, create an account, then subscribe to **"One Call API 3.0"**. It is pay-per-call and needs a card; the first 1,000 calls a day are free.
2. In the dashboard, under **Billing plans › One Call API 3.0**, set a **daily call limit** (for example 1,000, to stay free).
3. Copy the API key from **API keys**.
4. In Vercel › Settings › Environment Variables › Production, add **`OPENWEATHER_API_KEY`**. Mark it **Sensitive**: it is a server secret with no `NEXT_PUBLIC_` prefix. Redeploy.
5. Never paste the key in chat.

**Then:**
- set `platform_switches.weather_enabled = true` (a migration);
- add the cron (flag 5);
- show "Weather data © OpenWeather" wherever a screen shows the forecast.

**No key or variable is needed for review requests:** they use the existing `BREVO_API_KEY` and `CRON_SECRET`.

*If you would rather use WeatherKit despite §1.6 (for example with live fetches only and no stored forecast), it would need `WEATHERKIT_TEAM_ID`, `WEATHERKIT_SERVICE_ID`, `WEATHERKIT_KEY_ID` and the `.p8` key as one line, `WEATHERKIT_PRIVATE_KEY_BASE64`. It isn't built.*

## 5 · Is a review request marketing? (for your decision; not decided)

**UK (PECR regulation 22):**
- **The rule:** unsolicited direct marketing by email to individuals needs consent, or the "soft opt-in".
- **The soft opt-in needs all of these:**
  - the sender got the address in the course of a sale;
  - the email is about its own similar products or services;
  - the person was given a simple way to refuse **when the address was collected**, and in every message.
- **Service messages and genuine market research** are not direct marketing. A message that promotes the business is.
- **The cautious reading:** a request to post a public Google review promotes the truck, so treat it as marketing.

**EU (the ePrivacy Directive, Article 13):**
- **The rule:** the same structure (consent, or the soft opt-in for a business's own customers, with an opt-out at collection and in every message).
- **Germany:** the BGH held that a customer-satisfaction survey sent by email after a purchase is advertising (VI ZR 225/17, 10 July 2018), so it needs consent or the § 7(3) UWG conditions. Commentators also link this to the GDPR legal basis.

**What that means here:**
- **Whose consent:** the email is the **truck's** marketing to its own customers, so the truck needs the consent or the soft opt-in (HatchGrab sends on its behalf).
- **What is already in place:** every email says who it is from and has a working unsubscribe link and one-click header.
- **What is missing for the soft opt-in:**
  - **the opt-out at the point of collection:** a line or checkbox where the customer gives their email on the order page;
  - **a record of it on the order.**
- **The alternative:** an explicit consent tick (opt-in), recorded on the order. Germany may well need this.
- **Both are customer-facing changes,** so they are left for when you agree the flow. **Nothing should send until then.**

Sources: ICO direct-marketing guidance summaries ([Burges Salmon](https://burges-salmon.com/news-and-insight/legal-updates/ico-issues-updated-guidance-on-direct-email-marketing), [Geldards](https://geldards.com/?p=21581)); BGH VI ZR 225/17 ([LTO](https://www.lto.de/recht/nachrichten/n/bgh-vizr225-17-online-shop-rechnung-email-kundenzufriedenheitsumfrage-verbotene-werbung/print.html), [IT-Recht Kanzlei](https://www.it-recht-kanzlei.de/kundenzufriedenheitsanfrage-rechnung-bgh.html)). This is a reading of published summaries, not legal advice.

## 6 · Proof

**`scripts/reviews-weather-1.cjs`** (registered): **79 passed, 0 failed.**
- **How it runs:** the real libraries, both Supabase stores and the four routes, over an in-memory database; Brevo and the weather provider answer from fixtures.
1. **The migration:** six tables, RLS and revoke; both switches off; the per-truck defaults; one request per order; hash and token checks; no write to an existing table.
2. **The link and the delay:** 4 accepted shapes (normalised); 12 kinds refused; the delay rules.
3. **Complete:**
   - collected, and confirmed or ready on a closed event, count;
   - pending, modified, open-event, cancelled, rejected and refunded orders (status and ledger) don't;
   - the hash and the tokens (1,000 unique).
4. **Scheduling (the real store):**
   - **global switch off:** only the switch row is read, and nothing is scheduled or sent; a missing row reads as off;
   - a truck switched off, or with a non-Google link, schedules nothing;
   - **what is scheduled:** the right 7 orders;
   - **what is not:** an open event, pending, cancelled, refunded ×2, no email, over 48 hours, a demo truck, an inactive truck;
   - **60 days:** one of the same customer's two orders; 59 days ago blocks, 61 doesn't; per truck;
   - an unsubscribed customer is not scheduled;
   - the due time is the completion plus the truck's own delay; the language is the order's country's; the address is never stored.
5. **Sending:**
   - everything due is sent with the address read at send time;
   - the request older than 120 days is pruned;
   - a second run does nothing;
   - **checked again at send time:** cancelled, refunded or unsubscribed since → skipped;
   - a failed send is retried, then marked failed after three;
   - 🔴 a request scheduled while on is **not** sent once the global switch is off, nor once the truck's switch is off.
6. **The email:**
   - the words, the escaped name, the unsubscribe and privacy links (HTML and text);
   - one Google link and no satisfaction wording;
   - German for a German order;
   - Brevo's From, Reply-To and both unsubscribe headers;
   - no key → no send.
7. **Unsubscribe:**
   - an unknown or malformed token → 404, and nothing written;
   - a real token → an opt-out, confirmed in German, noindex and no-store;
   - one-click POST → 200 with no duplicate;
   - that customer is never scheduled again.
8. **The weather rules:** rounding; the window in GMT, BST, past midnight and the default; the refresh thresholds; the hourly and daily summaries and unavailable; the tie rule.
9. **OpenWeather:**
   - the parsing (units, percent cap, m/s → km/h, malformed points dropped) and every condition group;
   - one request with the right parameters;
   - no key → `no_key` with no call; an HTTP error or an empty answer throws;
   - the attribution.
10. **Caching (the real store):**
    - **switch off:** only the switch is read, and the provider is never called;
    - two stops at the same place share one fetch; the venue's coordinates are used as the fallback;
    - one cache row per hour or day;
    - hourly for today, daily in 3 days; `no_location`, `too_far`; cancelled, ended and demo stops left out;
    - no refetch at 2 hours; a refetch at 4 hours only for today's location;
    - a failed fetch keeps the old forecast as `stale`; no cache reads `unavailable`.
11. **The routes:**
    - weather: 404 while off; 401 without a token or with an unknown token; refused without access; 200 when on, with no key, showing `unavailable` plus the attribution;
    - both jobs: 401 without the cron secret, and `{ enabled: false }` with the live switches;
    - neither is in `vercel.json`.
12. **The words:** en-GB and all 28 bases have the 12 strings with the same tokens; back-translations for each; en-US only "anymore".
13. **Nothing live touched:**
    - every changed file is this work's;
    - in messages, only the new namespace was added;
    - only the new routes import the new libraries;
    - `lib/email.ts`, the order and Manage routes, `vercel.json` and `proxy.ts` are unchanged.

**translation-check, all 28 bases:** **structural 0 in every one.** The flags on the new keys are:
- back-translation drift ("{truck} thanks you for your order" for "Thanks for ordering from {truck}"; "Subscription cancelled");
- nl "review", an English word.

**Other checks:**
- `npx tsc --noEmit -p .` clean.
- `eslint` on every new file: clean.
- messages-parity: 574,196 passed, 0 failed (the new namespace is registered in `_messages-parity-1e.cjs`).

**Full sweep** (`node scripts/run-harnesses.cjs`, 193 harnesses including the new one): **193 run, 193 passed, 0 failed.**
- **Nothing fails at HEAD,** so there are no HEAD failures to list separately.
- **The first attempt was refused before running anything.** The sweep's screen (which refuses any harness with a non-literal `fetch(` call) matched the words "no fetch (on the day…" in one of my test labels. I reworded the label, and the second attempt ran in full.
- **The sweep's own notice** lists 14 files in `scripts/` that are neither registered nor excluded (`_address-formats-1-after.cjs`, `_lp-allergen-card-country.cjs`, …). None is this work's, and they are not failures.

## 7 · Files

**New:**
- `supabase/migrations/20261072_reviews_weather_1.sql`;
- `lib/reviews/model.ts`, `run.ts`, `store.ts`, `email.ts`;
- `lib/weather/model.ts`, `openweather.ts`, `run.ts`, `store.ts`;
- `app/api/cron/review-requests/route.ts`, `app/api/cron/weather/route.ts`, `app/api/manage/weather/route.ts`, `app/api/reviews/unsubscribe/route.ts`;
- `scripts/reviews-weather-1.cjs`;
- the `emailReview` messages (en-GB, en-US and the 28 bases) and their generated `messages/ns/*/emailReview.json` and `lib/i18n/catalog/emailReview.ts`.

**Changed:**
- `messages/*.json` (the new namespace only);
- `docs/i18n/back/*.json` (the 28 bases);
- `scripts/harnesses.json`, `scripts/_messages-parity-1e.cjs`.

**Not changed:**
- `lib/email.ts` and every live customer email;
- the order, dashboard and Manage routes;
- every page and the landing pages;
- `vercel.json`, `proxy.ts`, `trucks` and `orders`.

## 8 · Undo (only if Dominic asks)

⛔ DO NOT RUN — for a migration file, only if Dominic asks, and only after the code is reverted:

```sql
begin;
drop table if exists public.event_weather;
drop table if exists public.weather_hourly;
drop table if exists public.review_request_optouts;
drop table if exists public.review_requests;
drop table if exists public.truck_review_settings;
drop table if exists public.platform_switches;
commit;
```

**In code:** revert the build commit. Nothing outside the new files depends on them.
