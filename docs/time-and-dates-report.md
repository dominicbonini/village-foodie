# Phase 2B — time zones, dates and times come from the truck

**10 October 2026 · branch `main` (HEAD `f4bd277` + working tree) · not committed · not pushed · not deployed (Vercel or Edge Functions) · no SQL run · no truck, order or `country_settings` row changed · `trucks.timezone` not backfilled · no email sent**

Every "now", every "today" and every date or time a customer, operator, kitchen, printer or scheduler sees now comes from **the truck**. Its zone is `trucks.timezone`, or its country's `default_timezone` when that is empty. Its look comes from its country's `locale`, `time_format`, `date_order` and `week_start`. All of this is decided in one server helper, `lib/truck-time.ts`, and reaches browsers in payloads they already receive.

**For a UK truck nothing changes, except in the windows you allowed:**
- A–C date sites: 00:00–01:00 BST.
- The dashboard API's "now" (B1): all of BST.
- **The two §7 fixes you approved:**
  - the customer cancellation cutoff (CXL): all of BST;
  - Reports' WhatsApp-stats days (WAS): all of BST, plus a day's final second, which you chose to count.

The harness compares 1,095 snapshot leaves at four frozen instants. Every leaf that moved is named, sits inside its window, and holds the value it should. A US truck at 20:00 in New York or Los Angeles (already Saturday in UTC) makes exactly the decisions the GB truck makes at 20:00 London. It then shows them as "6:30pm", "10/09/2026" and "Fri, Oct 9", with Sunday-first weeks.

**Three things you need to know before anything else:**

1. **I understated B1 in the UTC-sites note, and corrected it here.** The dashboard API's UTC "now" does more than pick the earliest slot of an event with no start time; that path can never show anything. It also decides which of the dashboard's slots are marked **past** (`is_past`), and during BST that was an hour late. This is the same line you allowed for all of BST. The harness names it B1, allows it only in BST and only in `is_past`, and checks every slot against London's clock (§2).
2. **The two UTC sites found after your list are now fixed, as you approved (§7).**
   - The server's customer-cancellation cutoff: `app/api/orders/cancel`.
   - The WhatsApp-stats day boundaries in Reports.
   - Each is named in the harness as an allowed UK difference for BST, and each new value is checked:
     - the cutoff is exactly one hour earlier in BST, and the server refuses at the same minute the receipt page says the window has passed;
     - every reply is counted on its London day.
   - **One point needed your call:** a next-midnight bound also counts a reply logged in a day's final second (23:59:59.001–.999). The old bound left that on no day, and it also happens in GMT. You chose "Next midnight; allow it", so the harness names that one GMT case too.
3. **One harness artifact is named rather than hidden.** `calcReadyTime` only ever runs in a browser. The snapshot also ran it on a UTC host, where it used to read that host's clock. It now reads the truck's clock wherever it runs. The harness names this ENV and requires the UTC-host value to equal the UK device's, which is unchanged.

Nothing in either brief arrived garbled. The one contradiction in the original brief (fix every "now" vs. UK identical) was settled by your answers. The follow-up's one conflict ("BST only" vs. a next-midnight bound that also moves the final second in GMT) I asked about rather than choosing.

---

## 1. The proof

| Check | Result |
|---|---|
| **GB against the BEFORE snapshot**: `node scripts/time-dates-parity.cjs` against `scripts/fixtures/time-dates-before.json` (captured on the unchanged code before the first edit) | ✅ **1,095 leaves × 4 instants.** The instants are Fri 9 Oct 15:20 BST, Fri 13 Nov 15:20 GMT, 23:30 BST and Sat 00:30 BST. **21 leaves moved, all at 00:30 BST except ENV, and every one is named:** A1 (2), A2 (1), A3 (1), A4 (1), C1 (10), C2 (3), ENV (3). **Nothing moved in GMT, at 15:20 BST or at 23:30 BST.** Each allowance also checks the new value: "Today · Saturday 10th October", "Today = 2026-10-10", a Reports range of 03→09 Oct, and so on. A move to the wrong value would fail |
| What the snapshot covers | A UK browser (`TZ=Europe/London`, en-GB) and a Vercel function (`TZ=UTC`) at the same instant: <br>• the real `GET /api/slots` (yesterday, today, tomorrow, no date, by id) and the slot engine; <br>• auto-accept with three pre-order deadlines; place-in-slot; <br>• **both Edge Functions**, run against fixture rows (their writes are their decisions); <br>• `GET /api/events`; the WhatsApp and schedule-import prompts; <br>• the cancellation, confirmation, adjusted, ready and new-order emails; <br>• order cards in both modes, the day-load strip, the KDS, three dashboard views and Add Order for today, tomorrow and yesterday; <br>• the order page for three days, its confirmation and the `?confirm=` screen; the receipt; <br>• Reports (both views) and both CSVs; Manage › Schedule; <br>• the ticket stamp, a ticket through the real mapper, and the test ticket; <br>• the weekly post's week and caption dates; the WhatsApp usage month; the demo window |
| **B1, the dashboard API's "now"** (§2) | ✅ The real `GET /api/dashboard` against the same route with the one old line restored (`new Date().getHours()…` on a UTC server): <br>• **GMT: identical.** <br>• **BST: only `is_past` moves** (plus `available`, which a past slot loses with it), and every slot is past exactly when it is before London's time. 12 slots at 15:20 and 23:30; 138 at 00:30, when the old line put Friday's 23:30 on Saturday's event. <br>• An event with no start time has no slots either way |
| **CXL, the cancellation cutoff** (§7) | ✅ The real `POST /api/orders/cancel`, stopped just after its cutoff decision, probed minute by minute ±5 h around the cutoff, against the same route with the old line restored (`` new Date(`${date}T${slot}`) `` on a UTC server): <br>• **GMT:** refused from 18:31Z, identical; <br>• **BST:** refused from 17:31Z (was 18:31Z), **exactly 60 minutes earlier, at the true London cutoff** (19:00 slot − 30 min). The same holds for an order with no slot, falling back to the event's end; <br>• **at every probed minute** the server refuses exactly when the receipt page says "The cancellation window has passed"; <br>• **New York:** refused from 22:31Z = 18:31 EDT, the truck's own cutoff. It was 18:31Z, four hours early |
| **WAS, Reports' WhatsApp stats** (§7) | ✅ The real `get_report` action, one reply at a time, against the same route with the old bounds restored: <br>• **every reply is counted on its London day**; <br>• **BST day:** the replies at 00:00–01:00 London on either side moved to the right day; <br>• **GMT day:** identical except the reply at 23:59:59.5, the final second, now counted as you chose; <br>• **New York:** days bounded at New York midnight (04:00Z) |
| **US**: New York and Los Angeles at 20:00 local (Saturday 00:00 / 03:00 UTC), and a US truck with **no** timezone | ✅ **Every decision equals the GB truck's at 20:00 London on the same date:** <br>• `/api/slots` for today, tomorrow and no date; <br>• the engine's seating and refusals; <br>• auto-accept (three deadlines × two days); place-in-slot (ASAP, 19:00, 21:30); <br>• the scheduler's opens and closes. <br>The scheduler opens 19:00 and 20:00 today, closes yesterday's and today's 19:30 end, and leaves 21:00, 22:00, the manual-close event and tomorrow's 00:15. <br>**The truck with no timezone resolves to `America/New_York`**, the US row's default. <br>**The display, in the US row's settings:** <br>• "6:30pm", "6pm", "5pm – 9:30pm" <br>• "10/09/2026", "Fri, Oct 9", "Today, October 9th", "Wednesday, October 14th" <br>• the clock "8pm"; week 4–10 Oct (Sunday-first) <br>• the order page "Today · Friday, October 9th" / "Tomorrow · Saturday, October 10th" <br>• the email "Collection time: 6:30pm"; the ticket "COLLECT 6:30pm", stamped "8pm"; the order card "6:30pm" |
| Existing slot, capacity and time harnesses and their goldens | ✅ All pass, and **no golden fixture was regenerated** (`batch-rolling-identity`, `batch-reservation-golden-on`, the slot-interval and stage harnesses). `batch-rolling-check` only gained the zone argument it now requires (§8) |
| **Grep: `Europe/London`** in `app/`, `components/`, `lib/` and `supabase/functions/` | ✅ No truck default anywhere. The literal appears only in: <br>• `LEGACY_UK_TIME_SETTINGS` (§3; it mirrors the GB row and is documented with your words); <br>• the admin outreach and admin screens (`lib/outreach-*`, `components/admin/*`, `lib/admin/screenshot-log.ts`), which are allowed to stay London (§6); <br>• comments. <br>The GB settings row itself is in the seed migration, and the harnesses use the literal as test data |
| Client bundles | ✅ After `next build`, the 128 files in `.next/static` hold none of these: <br>• `country_settings`, `default_timezone`, `card_fee_online_pct`, `starter_monthly_minor`; <br>• `getCountrySettings`, `countrySettingsForTruck`; <br>• `truckTimeSettings`, `truckTimeZone`, `countryTimeSettings`; <br>• `[truck-time]`, "is not a zone this runtime knows", "no settings row for". <br>What they do hold is the client-safe `lib/time-utils.ts`: `timeSettingsOr` and the GB mirror for old snapshots |
| `tsc --noEmit` | ✅ clean (product code and scripts) |
| eslint: every touched file against HEAD (121 files) | ✅ **No rule count grew in any file.** Errors 616 → 612, warnings 183 → 181. The 15 new files are clean. The first run caught three things, all fixed rather than waived: <br>• a truck-settings expression that made the React Compiler skip memos (now `useMemo`); <br>• two missing effect dependencies; <br>• two `Date.now()` calls in render. <br>Re-checked after the §7 fixes: on the two routes they touch, no rule grew (Manage's `no-explicit-any` is 21 → 20 against HEAD; cancel is unchanged). `tsc` is still clean |
| `next build` | ✅ exit 0 |
| Harness sweep (`scripts/run-harnesses.cjs`, 102 files, including the new `time-dates-parity.cjs`) | ✅ **102 / 102 passed, re-run after the two §7 fixes.** The first run failed 14 because of the new required arguments and guards pinned to changed files. Each was re-aimed (§8), not waived. The later runs are clean |

---

## 2. What changed for a UK truck, and when — the complete list

These are every UK difference the run allows. Anything else that moves fails it.

| Id | Site | Window | Before → after (UK) |
|---|---|---|---|
| A1 | `app/api/events/route.ts`: the order page's event labels | 00:00–01:00 BST | Saturday's event read **"Tomorrow · Saturday 10th October"** on Saturday → "Today · Saturday 10th October"; Sunday's gains "Tomorrow ·" |
| A2 | `lib/whatsapp-classifier.ts`: the reply's DATE REFERENCE for the AI | 00:00–01:00 BST | "Today = 2026-10-09" on Saturday → "Today = 2026-10-10" |
| A3 | `lib/schedule-extract.ts`: the import prompt's "Today is" and its 14-day table | 00:00–01:00 BST | "Friday, 9 October 2026" → "Saturday, 10 October 2026" |
| A4 | `app/api/slots/[truckId]`: the default date when a request names none | 00:00–01:00 BST | Yesterday's event's slots → today's. (The order page always sends a date) |
| A5–A16 | The other server "today"s: <br>• the menu's open event <br>• submit and promote-draft fallbacks <br>• the dashboard API's default date and three action fallbacks <br>• Manage's upcoming / WhatsApp-stats day / 30-day window <br>• the picker lists; the WhatsApp event lists <br>• inbound-schedule <br>• the deletion warning's upcoming-orders count | 00:00–01:00 BST | Yesterday → today. None of these feeds a snapshot leaf that moved: each is a query filter or a fallback that the fixtures never reach in that hour. They are fixed by the same rule and listed for completeness |
| **B1** | `app/api/dashboard/route.ts` `nowMins` | **all of BST** | The dashboard's slot list marked slots past by UTC's clock, an hour late. Now it uses London's clock. At 00:30 the old line marked Saturday's slots past up to 23:30 |
| **CXL** | `app/api/orders/cancel/route.ts`: the server's customer-cancellation cutoff | **all of BST** | Read the slot as UTC, so the cutoff fell an hour **late**. Now it is the truck's wall clock: in BST, refusals start an hour earlier, at the cutoff the receipt page already showed |
| **WAS** | `app/api/manage/route.ts` `get_report`: Reports' WhatsApp stats days | **all of BST**, and a day's final second | Counted UTC days (an hour off in BST) and lost replies logged at 23:59:59.x. Now each day runs from its London midnight to the next |
| C1 | Manage › Reports' default range and its CSV names | 00:00–01:00 BST | 02–08 Oct → 03–09 Oct |
| C2 | Add Order's Today / Tomorrow labels and its "future event" / "not open yet" banners (also inside the dashboard) | 00:00–01:00 BST | Saturday's event counted as the future; Sunday's read "Sun 11 Oct" → "Tomorrow"; Friday's read "Today" with a "not yet open" banner → "Fri 9 Oct" |
| C3–C5 | The order page's no-`date_iso` fallback; the schedule importer's "today" (three places); the dashboard's cache eviction | 00:00–01:00 BST | Yesterday → today. Not reached by a fixture in that hour |

**Device-clock sites change nothing for a UK device.** These are `getHours()`, `new Date(y, m, d)` and `` new Date(`${date}T${time}`) `` in the browser. They now use the truck's clock, which for a UK device in a UK truck is the same clock, so the snapshot does not move. They matter for a device in another zone, or a US truck. They are:
- the order page: "event ended", the 14-day list, deal hours, `isEventClosed`;
- the receipt's cancellation window;
- the dashboard and KDS: auto-select, "finished", "Updated 15:20";
- Add Order: `isEventEnded`, `readyMinsFromNow`, the ASAP base, `calcReadyTime`;
- Manage: past events, the approvals badge, Reports' placed-at dates and times, the trial dates;
- the printer: the printed-at stamp and the lead-time "now".

---

## 3. The one rule, and how screens get it

```
truck time zone = trucks.timezone (when it is a zone the runtime knows), else country_settings.default_timezone
```

- **`lib/truck-time.ts`** (server-only, loader-backed) provides `truckTimeSettings(truck)` → `{ timeZone, locale, timeFormat, dateOrder, weekStart }`, plus `truckTimeZone(truck)` and `countryTimeSettings(code)`.
  - **It is loud, like the loader.** A truck object without `country` throws, never guesses.
  - An unknown `trucks.timezone` is logged and the country's default is used.
- **The "now" and "today" helpers in `lib/time-utils.ts` take the zone explicitly.** `getNowMinsInTz`, `getLocalDateInTz`, `pickDefaultEventByTime`, `isSlotPast`, `getAsapSlot`, `calcReadyTime`, `buildSlotAvailability`, `placeOrderInSlotLocked` and `decideAutoAccept` all **require** it. There is no default zone left, so the compiler named every caller. `localTodayIso()` (London whatever the truck) and `WEEK_TZ` are gone.
- **Browsers get `TimeSettings` in payloads they already fetch.** No browser reads `country_settings`, and no settings row is ever sent.

| Payload | Field | Read by |
|---|---|---|
| `/api/dashboard` | `truck.time` | dashboard, KDS, Add Order, order cards, day-load strip, event pickers / modals, printing, degraded banner. **Kept in the native offline snapshot with the rest of the truck object** |
| `/api/menu/[truckId]` | `truck.time` | the order page |
| `/api/events` | `time` | the order page's event list and cards |
| `/api/slots/[truckId]` | `tz` (already there; now the truck's) | the order page's ASAP / past |
| `/api/orders/[id]` | `time` (+ `timezone, country` in the select) | the receipt page and the `?confirm=` screen |
| `/api/manage` | `truck.time` | Manage, through `components/TruckTimeContext.tsx` (Reports, Schedule, Places, Social posts, Delete account, Custom domain, Billing dates) |

**A payload with no `time`** can only be a native offline snapshot saved before this build. You said: *"existing trucks are UK. when a truck is created a country will be set. that will define what settings apply in the dashboard/KDS"*. So that one case uses `LEGACY_UK_TIME_SETTINGS`, a frozen mirror of the GB row, through `timeSettingsOr()`, which logs a warning the first time each screen falls back. The kitchen never breaks.

The dashboard, the KDS and the order page also use the same constant, **silently**, for the moment before the truck has loaded. That covers hooks that run before the first response, while nothing time-dependent is on screen. Once the truck is loaded, a missing `time` goes through `timeSettingsOr` and warns. **These are the only places a zone is named without a truck, and they are deliberate.**

`DISCOVERY_TIME_SETTINGS` is the same constant under a second name, for the pages on the staying list (§6), so they are UK by name and not by accident.

---

## 4. Edge Functions, crons and how to deploy

### `auto-event-scheduler`: every truck on its own clock

- It reads `confirmed` / `auto_open` events dated anywhere from UTC yesterday to UTC tomorrow. Then **for each event, in its truck's zone**, it opens the event when `event_date` is the truck's today and `start_time ≤` the truck's now.
- It closes every open event dated **before** the truck's today, and today's `auto_close` events whose `end_time` has passed.
- The zone comes from the same rule, inlined because Deno cannot import `lib/`:
  - `trucks.timezone` if valid, else `country_settings.default_timezone`, read with the service role it already uses.
  - **A truck whose zone cannot be resolved is logged and skipped**, never opened or closed on a guessed clock. The Start / Close buttons still work.
- **GB decisions are identical.** The function used to compute one London "now" for everyone, and the harness runs both versions' decisions at all four instants with no difference.

### `heartbeat-monitor`: no decision used a clock

The live gate is `status = 'open'`, and the pause expiry is an instant (now + 2 h). The London wall clock it computed only fed one log line, and that is gone. Its two type-chain expressions are unchanged, so `event-types.cjs` still matches them.

### Deploy: yours to run

Order: **(1) Vercel first, (2) then the two functions.** Nothing new is needed in the database: Part A's 01–08 are applied, so `trucks.country`, `trucks.timezone` and `country_settings` already exist. During the gap between the two deploys, both versions decide the same thing for every GB truck.

```bash
npx supabase functions deploy auto-event-scheduler --project-ref ffphgwonshgxamtvefcv
npx supabase functions deploy heartbeat-monitor   --project-ref ffphgwonshgxamtvefcv
npx supabase functions list --project-ref ffphgwonshgxamtvefcv   # updated_at must be after the deploy
```

- ⚠️ The CLI reads `.env.local` before anything else. If the multi-line credential quoting issue from the heartbeat deploy report is back, the deploy fails with "failed to parse environment file". The fix is the quoting, as before.
- **Proof the new scheduler is live:** its response is unchanged (`{opened, closed, checkedAt}`), so use `functions list`'s `updated_at`. The function logs also show the new `🔴 No time zone for truck …` line if a truck ever lacks a zone; none should today.

### Crons (E-03)

| Cron (UTC) | What it decides | Phase 2B |
|---|---|---|
| `whatsapp-maintenance` 03:00 | the token-expiry alert's once-a-day key | **Per truck, the truck's day.** At 03:00 UTC London's date is UTC's date in both GMT and BST, so GB keys are unchanged. Falls back to the UTC day if a truck's settings cannot be read |
| `account-deletion-due` 09:00 | deletes accounts whose `deletion_due_at` **instant** has passed | **Stays.** It compares instants, not a truck's day. (The deletion request's "upcoming orders" warning is now per-truck today, A16) |
| `custom-domain-check` 07:00 | instants (setup started, last OK) | stays |
| `demo-cleanup` hourly | `expires_at` instant | stays |
| `cancel-stale-authorizations` /10 min, `capture-stranded-authorizations` /15 min, `auto-reject-offline-orders` /5 min | ages of instants | stay: interval crons |
| `outreach-replies` /10 min | admin outreach | stays (§6) |

---

## 5. How times and dates look: one module

`lib/time-utils.ts` is the one module. It grew out of what was there and what `lib/weekly-post/locale.ts` already did, keyed by `locale`, `time_format`, `date_order` and `week_start`.

| Function | GB (unchanged) | US |
|---|---|---|
| `formatTime`, `formatSlot`, `formatTimeRange` | "18:30", "17:00 – 21:30" | "6:30pm", "5pm – 9:30pm" |
| `formatInstantClock` | "15:20" | "3:20pm" |
| `formatYmd(ymd, ts, opts)` (calendar date, pinned to UTC) | "Fri 9 Oct" | "Fri, Oct 9" |
| `formatInstant` (an instant's date in the truck's zone) | "9 October 2026" | "October 9, 2026" |
| `formatNumericDate`, `formatNumericDayMonth` | "09/10/2026", "09/10/26", "09/10" | "10/09/2026", "10/09/26", "10/09" |
| `formatOrdinalDate`, `eventDateLabel` | "Friday 9th October", "Today 9th October" | "Friday, October 9th", "Today, October 9th" |
| `formatShortOrdinalDate` (Manage schedule cards) | "Fri 9th Oct" | "Fri, Oct 9th" |
| weeks (`lib/weekly-post/week.ts`, `WeekConfig {timeZone, weekStart}`) | Monday–Sunday in London | Sunday–Saturday in the truck's zone |

- **One 12-hour style:** `clockOf()`, moved here from the weekly post, gives "6pm" and "6:30pm" — minutes only when not :00, and no space. Your brief's example "6:30 pm" differs from the weekly post's own style only by that space. Since the brief said to match the weekly post, the post's style wins, and the app and the poster now cannot word a time two ways.
- **`formatShortOrdinalDate` keeps the product's own English abbreviations.** en-GB's Intl writes "Sept", and these cards always wrote "Sep", so a byte-identical GB card cannot come from Intl here.
- The places line `timeRangeLabel` keeps its no-space dash ("17:00–20:00").

**Converted surfaces**, every `'en-GB'` literal and hand-built dd/mm on a truck or customer surface:
- **The order page and its slot picker:** options, "Around …", the chosen time, "ended at …", deal hours, both confirmations, the event cards.
- **The receipt:** pickup time, cancellation window.
- **Every email that prints a time or date:** confirmation, adjusted, ready, new-order, event cancellation.
- **Tickets:** COLLECT time, printed-at stamp, test ticket.
- **KDS, the dashboard, Add Order and order cards:** times, labels, "Updated …", the prep list, the degraded banner.
- **Manage › Schedule:** event cards, import review, conflicts, the date in the edit form, Places' Last/Next line, the cancel modal, the preview card.
- **Reports and both CSVs:** placed date and time, collection time, event dates, default range.
- **Social posts:** the event caption's "tonight / tomorrow" on the truck's clock; the week and event-list dates.
- **Billing / trial dates, Delete account dates, Custom domain banner and problem email.**
- **The weekly and single-event posts:** week, captions; `countryForTruck()` reads `trucks.country`.
- **WhatsApp replies** and **the AI prompts that state dates:** WhatsApp and schedule import, both from the truck's today in its words. The import's DD/MM/YYYY output contract to the model is unchanged.
- **The dashboard's locale-less `toLocaleTimeString`** now uses the truck's settings.

---

## 6. Staying as they are (your list, unchanged)

- **Discovery and multi-truck pages**, which are in the marketing country, GB: `app/api/discovery/events`, `app/api/embed/events`, `app/api/admin/discovery-events`, `app/page.tsx`, `EventListCard`, `MapView`, `lib/utils.ts` `formatFriendlyDate`, the venue pages, and the public truck profile and embed cards (`TruckListCard` with no `time`). All of these use `DISCOVERY_TIME_SETTINGS` or keep their own en-GB.
- **Admin and outreach:**
  - `OUTREACH_TZ`, `OUTREACH_TIMEZONE`;
  - every `lib/outreach-*` date and send window;
  - `components/admin/*`, `app/admin/*`, `lib/admin/screenshot-log.ts`, `lib/admin/screenshot-events.ts`;
  - the admin Pizza-demo readout (`DISCOVERY_TIME_SETTINGS`);
  - `app/api/demo/save-email` (the prospect's demo-expiry date).
- **Technical stamps and keys:**
  - the `plans-pdf` "Generated" date and its file names;
  - `lib/whatsapp/maintenance.ts` `utcDayKey` (the fallback key);
  - `lib/schedule-graphics/places.ts` date-only arithmetic (UTC on purpose);
  - the KDS slot sort's fixed `1970-01-01T` prefix (ordering only);
  - Manage's once-a-day trial-nag key (`toDateString`);
  - `app/dev/ticket-preview` (dev only);
  - the dashboard's offline cache eviction (now the truck's day — C5).
- **Number formatting, not dates:** `FontPicker` and `lib/whatsapp/copy.ts` `formatLimit` (`toLocaleString('en-GB')` on a count). "1,234" is the same in en-US.

---

## 7. Found after your list — both fixed (you said yes to both)

1. **`app/api/orders/cancel/route.ts`, the server's cancellation cutoff.**
   - **Was:** `` new Date(`${order.event_date}T${effectiveSlot}`) `` on a UTC server, so a 19:00 slot read as 19:00 UTC. For a UK truck the cutoff was an hour late all through BST; for a New York truck it was four hours early.
   - **Now:** `instantOfLocal(order.event_date, effectiveSlot, await truckTimeZone(truck))`, with `timezone, country` added to the order's `trucks!truck_id` select. This is the instant the receipt page already computes for its Cancel button, so the two cannot disagree. A truck whose settings cannot be read throws into the route's existing error path rather than guessing a zone.
   - **Proof (CXL, §1):** GMT identical; BST exactly 60 minutes earlier, at the true cutoff; server and receipt agree at every minute; New York at its own 18:30.
2. **`app/api/manage/route.ts` `get_report`, Reports' WhatsApp stats.**
   - **Was:** `created_at` between `${day}T00:00:00` and `${day}T23:59:59` with no zone (UTC days, an hour off in BST). It also lost a reply logged in a day's final second.
   - **Now:** `.gte('created_at', instantOfLocal(waFrom, '00:00', tz))` and `.lt('created_at', instantOfLocal(waTo + 1 day, '00:00', tz))`, in the truck's zone.
   - **The final second:** you chose to count it on its day ("Next midnight; allow it"). It is the one UK change outside BST, and the harness names it.
   - **Proof (WAS, §1).**

Both checks fail if either fix is reverted, because each requires the correct cutoff or the correct day, not just "different".

---

## 8. Harness and script changes

- **New:**
  - `scripts/time-dates-parity.cjs`, registered in `harnesses.json`. It holds:
    - the snapshot, and the compare with named allowances;
    - B1, CXL and WAS;
    - the US checks.

    For CXL and WAS, two harness-only patches are applied to the bundled routes (the shipped routes are unchanged):
    - the cancel route returns just after its cutoff decision, so nothing is cancelled, emailed or released;
    - Manage's session check is bypassed, as no session exists in a harness.
  - `scripts/_render-kit.cjs`: a shared module, registered under `shared_modules`.
  - `scripts/fixtures/time-dates-before.json`.
- **Re-aimed, not waived.** 14 harnesses failed the first sweep because a zone or time settings is now required, or because a guard pins files this phase changed. Each was fixed by passing the GB row's values or by naming the edit, with a check that its replacement is present:

| Harness | What changed in it |
|---|---|
| `weekly-post`, `design-editor`, `design-fonts`, `place-pictures` | The week and caption functions now get the GB week (`Europe/London`, Monday). That is 38 call sites, plus the zone and country on the caption inputs. V3's mutation is re-anchored to the new threshold line (`intoWeek >= 4`) |
| `batch-rolling-check` | `placeOrderInSlotLocked` gets the GB zone, and its own default `false` before it |
| `whatsapp-settings-row-harness` | "a null timezone falls back to Europe/London" now asserts that fallback is **gone** — the brief's rule |
| `batch-reservation-switch` | `/api/slots`' named select also holds `timezone, country`, which already exist live, so its 42703 argument still holds |
| `event-types` | Compiles `lib/time-utils.ts` (places.ts imports it). The dashboard's "every line that left" guard names Phase 2B's 37 edits, **and** a new check requires every truck-clock replacement to be present and none of the old forms (`localTodayIso`, `getHours()`, `toTimeString()`, `toLocaleTimeString(`) to remain |
| `schedule-graphics-places` | `time-utils` is copied into its variant tree; W5e is re-anchored; the Places line check reads `placeSubLine(p, ts)`. Manage's "no line was lost" guard names Phase 2B's lines, with the same companion: no en-GB / device-clock / UTC-today form left in the page, and every new form present |
| `event-pricing` | Four non-price lines left the menu API: its "today", the pre-order zone (`|| 'Europe/London'`) and two comments. They are named, and a check requires both replacements |
| `places-posts-gating` | The preview card's times are read through `timeRangeLabel(…, ts)` |
| `screenshot-truck-details` | `/api/inbound-schedule`'s tolerated list gains Phase 2B's lines (its "today" and its date and time words). `lib/schedule-extract.ts` is narrowed from byte-identity to "only these named lines", with the same expiry rules. Bare-punctuation lines (a `}`) are no longer counted |
| `demo-seed-parameters`, `seed-demo-grid` | **No harness change.** The product code now imports `lib/truck-time.ts` at call time inside `demoTruckZone`, using the loader's own pattern, so these modules load outside Next again |

- The four `scripts/verify-*.ts` files (not in the sweep) now pass `tz` / `time` so `tsc` is clean.

## 9. SQL

None. This phase changes code only. It reads `trucks.timezone`, `trucks.country` and `country_settings`, which already exist, and writes no row.

## 10. Rules kept

| Rule | |
|---|---|
| main as checked out; never push or deploy (Vercel or Edge); no process killed | ✓ The Edge deploy is written out in §4 for you |
| No SQL run; no `.env*` opened or printed | ✓ The project ref in §4 is from `supabase/config.toml` |
| Tested on Pizza Kitchen only, through fixtures (`test-truck` / `test-kitchen`); Pizzeria Gusto never touched | ✓ No database reached: every route and function ran against in-memory tables |
| No truck's data, no `country_settings` row, no `trucks.timezone` backfill | ✓ |
| No `outreach_templates`, no email sent | ✓ The emails were rendered with a capturing stub |
| Slot and capacity engine results unchanged for UK trucks | ✓ Same slots, seating and refusals at all four instants (§1). The only movements are the ones you allowed: A4 (which day a no-date request means, 00:00–01:00 BST), B1 (the dashboard API's `is_past`, BST) and CXL (the cancellation cutoff, BST). |
