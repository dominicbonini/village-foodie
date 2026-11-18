# events-create-1: creating an event from the dashboard

**Review only, 17 Nov 2026.** No code was changed, nothing was written to the database, and nothing was committed. Read-only SQL is listed at the end.

Two read-only code sweeps fed into this: every place that creates events, and every place that reads them. I re-checked their key claims myself before relying on them.

## Answer first
**Build "Create event now". Don't allow walk-ups with no event.**
- **What staff enter:** the smallest flow is three things: where (pick from the truck's places, or type a name), the times (prefilled, usually left alone), and the van (asked only on multi-van trucks).
- **What it creates:** an event that is **approved, started and selected** in one tap, marked `source = 'dashboard'`.
- **Two things must be designed in, not left to defaults:**
  1. **Only signed-in team members may create.** Today the dashboard's write routes accept the link alone.
  2. **It is public by default.** It appears on the website, in WhatsApp replies and in online ordering at once. There is no per-event "walk-up only" switch today.

---

## 1. How events are created today

### Every path that inserts into `truck_events`

| # | Path | Who can call it | Status / source | Required | Defaults |
|---|---|---|---|---|---|
| 1 | **Manage › Schedule** `upsert_event` create, [app/api/manage/route.ts:1278](../app/api/manage/route.ts#L1278). Manual add, Duplicate, both schedule importers and the setup wizard all go through it | A signed-in **owner, manager or admin** (`resolveTruckAccess`, deny by default). **Staff are refused**: `upsert_event` is in `staffBlockedActions` (:608) | `confirmed` (hard-coded), `source 'manual'`, `confirmed_at` now | Server: **only valid start and end times** (`event_needs_times`). The client form also needs date, venue (unless private) and a van when the truck has more than one | `auto_open`/`auto_close` = truck setting `?? true`; van = the only active van, else null; order-ready seeded from the van; event type = the one requested if it is the truck's, else Standard |
| 2 | **Scraper / screenshot bridge**, [app/api/inbound-schedule/route.ts:241](../app/api/inbound-schedule/route.ts#L241) | A shared secret (the scraper, the admin screenshot import, Apps Script) | `unconfirmed`, `source 'scraper'` | A date and a truck name. Skipped when the truck prefers manual, when the event was rejected before, or when a same-day duplicate exists by `venue_id` or name | No van, `auto_open` from the column default (false), venue/coords/postcode from the venue matcher, `scraped_signature`, privacy from the word "private" |
| 3 | **Demo event**, [lib/provision-demo-event.ts:150](../lib/provision-demo-event.ts#L150) | Demo routes (demo token, rate-limited) and admin | `open`, `source 'manual'`, `confirmed_at` and `opened_at` now | — | A 4-hour window from now (start floored to the half hour), the only van (required), `auto_open`/`auto_close` false |
| 4 | **Dashboard `update_event` with no `event_id`**, [app/api/dashboard/action/route.ts:1302](../app/api/dashboard/action/route.ts#L1302) | Dashboard token (+PIN) | Column defaults (`unconfirmed`, `manual`) | Nothing | **No caller anywhere in the repo, and it would fail if called.** It sets no `venue_name`, which is `NOT NULL` with no default. A dead, broken path; replace or remove it when building. |

Also: a one-off migration for the App Review demo truck (`20261083_ios_intl_1_demo_events.sql`), the events-overlap dev scripts, and a diagnostic script. None of them is live.

**Fields Manage sets on create:**
- `truck_id`;
- `venue_name`, `address`, `town`, `postcode`, and `latitude`/`longitude` (geocoded on the client);
- `event_date`, `start_time`, `end_time`, `notes`;
- `van_id` (sent, or the only van); `order_ready_override`/`source`; `event_type_id`; `source`, `status`, `confirmed_at`, `auto_open`, `auto_close`;
- **`truck_place_id`**, from the place picked, else matched by name, else **a new Places row is created** for a new typed name;
- `region`/`suburb` in a separate update; privacy through `applyPrivacy` when asked (plan-gated).

**Not set by any create path:**
- `venue_id` (except by the scraper);
- the slot interval override (`collection_interval_mins_override`), so the van's or truck's interval applies;
- capacity fields (capacity comes from the van at read time);
- prices, `customer_note`, `order_counter` (default 0).

**Side effects of a Manage create:**
- seeds `event_deals` (each bundle's "apply to new events");
- upserts `slot_capacity` (keyed by date; the code says it is no longer consulted);
- rebuilds `production_slot_usage` for the whole date from its orders;
- may create a `truck_places` row.

It sends no email, triggers no page refresh, fetches no weather and syncs nothing to the map.

**Database defaults** (read-only check): `status` 'unconfirmed', `auto_open` false, `auto_close` true, `source` 'manual', `is_private` false, `order_counter` 0. `venue_name` and `event_date` are NOT NULL. **`source` has no check constraint**, so `'dashboard'` is accepted.

### What a "created now" event would cause, everywhere events are read
Assume a confirmed or open event, today, starting around now, with a name, possibly no postcode or coordinates, and the van set.

| Where | Appears? | Problem? |
|---|---|---|
| **Customer order page / schedule** (`/api/events`: confirmed and open) | **Yes, at once** | None, except one: a truck with **one** event today auto-selects it on a bare link or hatch QR, and with **two** it shows a chooser. Same as adding any event. |
| **/api/menu** (no `event_id`: earliest confirmed/open by *date only*) | Can become the menu's event | With two events on one date, which one a no-id visitor gets is unspecified (an existing issue). Deals: the create must seed `event_deals` as Manage does, or only "apply to new events" bundles show. |
| **/api/slots** | Yes | Slots start at now plus prep, so mid-day is fine. **No van = unlimited kitchen capacity.** |
| **Customer submit** | Yes | Fine. Since events-overlap-2 it uses the ordered event if confirmed/open, else the open one. |
| **Website embed and custom domain** (`/api/embed/events`) | Yes, within about 1–6 minutes (cache) | None. Coordinates aren't used. |
| **Village Foodie / HatchGrab map and lists** (`/api/discovery/events`, for trucks with the site flag on) | Yes | **Without coordinates: listed, but no map pin, and hidden under a distance filter.** No `venue_id` = no venue page link. Cosmetic. |
| **WhatsApp auto-replies** (`lib/whatsapp/upcoming-events.ts`: confirmed, open **and unconfirmed**, live) | **Yes, quoted at once** | Only a problem if you wanted it walk-up only. Private events are redacted to "Private event". |
| Instagram / Messenger | No (they only acknowledge) | — |
| **Emails** (order confirmation, new-order) | The venue line | Null-safe; a missing town or postcode just shortens it. |
| **Push notifications** | Routed by `van_id` | **No van = no push.** |
| **Schedule graphics / weekly post** | Only when the owner regenerates | Matched by place, then venue, then name. Manage would create a Places row for a new name. Fine. |
| **Auto open/close scheduler** | Opens confirmed events with `auto_open` and start ≤ now | If we create it already open, nothing to do; auto-close at the end works. |
| **Heartbeat / offline protection** | By van, on `open` events | **No van = never offline-paused.** |
| **Weather, review requests** | Read events, but **both are switched off** | No coordinates → `no_location`. Moot today. |
| **Slot usage / capacity** | The create should rebuild the date (Manage does) | The rebuild deletes and recomputes the whole date from orders. That is correct, but it briefly empties the cache while another event is live (an existing drift note). |
| **Dashboard** | Yes; we select it | — |
| **Kitchen screen (KDS)** | Listed | **The KDS chooses its event once and never re-chooses.** A KDS already open on another event won't follow; staff must switch it. Worth a line in the flow. |
| **Reports / paperwork** | Yes (confirmed/open/closed dated ≤ today) | Labelled by venue and town; fine. |
| **Scraper, later** | Compares same-day events by `venue_id` or by name | A later scrape of the same stop under a different name creates an **unconfirmed duplicate**, which the events-overlap list already attaches under it as a possible duplicate. |

## 2. Permissions

**Who can reach the dashboard today:**
- **The web page** `/dashboard/<token>` needs **a signed-in account** (proxy.ts). A demo dashboard needs none. The page then calls the APIs with the token.
- **`GET /api/dashboard`:** token, plus **PIN if the truck set one**.
  - A signed-in operator of a *different* truck gets 403.
  - A signed-in user with no link to the truck, or **no session at all** (a direct API call), gets **token-only access**.
- **Write routes** (`/api/dashboard/action`: walk-ups, statuses, settings; `/api/events/action`: confirm, open, close, cancel, dismiss): **token (+PIN on dashboard/action; `/api/events/action` checks the token only).**
  - The signed-in identity is resolved for the audit log only, never to authorise.
- **Native iPad app:** session as a Bearer; the same APIs.
- **KDS:** its own `kds_token`.

**Who can create events today:**
- **Owner, manager, admin:** yes, in Manage.
- **Staff:** **no**. Staff are blocked from `upsert_event` and redirected away from Manage.
- **Anyone with only the dashboard link:** no create route exists. But they can already confirm or cancel events and take walk-ups through the token-only routes. That is an existing exposure, outside this review's scope; noted.

**What a dashboard create should check:**
- token (+PIN if set), **and** a signed-in caller who is the truck's owner, an admin, or a `truck_users` member (staff, manager or owner);
- `resolveActor` / `lib/truck-access.ts` already returns exactly this;
- **refuse token-only callers.** That stops a stranger with a leaked link from publishing events.
- Whether **staff** may create is your decision (D1): it is new power for staff.

## 3. The smallest good flow

### Fields
1. **Where:**
   - the truck's **places** (`truck_places`): favourites first, then most recently used, about six. Each comes with its usual times, address/postcode and usual event type.
   - **"Somewhere else"** opens one text field for a name. Town and postcode are optional and hidden behind "Add town or postcode".
   - Today only Manage reads places (`sg_places`, a staff-blocked write). The dashboard needs a small **read-only** list of places.
2. **Date:** **today**, in the truck's time zone. Shown, not editable.
3. **Start:** **now, rounded down to the quarter hour** (17:07 → 17:00). That is a past start, which is fine: slots begin at now plus prep.
4. **End:** the place's **last end time** if it is later than the start, else **start + 3 h**. Both times can be changed by tapping them.
5. **Van:** only when the truck has **more than one active van**, and then **required**. Without a van there is no capacity limit, no offline protection and no push; the confirm route already refuses van-less events on multi-van trucks.

Everything else comes from the place or the defaults: town, postcode, address, the place link, the usual event type, order-ready, deals.

### Answers
- **Approved, selected and started straight away? Yes, all three (recommended).**
  - Staff use this because they are trading *now*. Creating it is the deliberate act, so the separate "Start this event?" question would be a second tap for the same decision.
  - Store `status 'open'`, `confirmed_at` and `opened_at` now, `auto_open` false (it is already open), `auto_close` true (or the truck's setting).
  - Selecting it means the next walk-up lands on it.
- **Customers see it? Recommend: yes, a normal public event with online ordering.**
  - The truck really is trading there, and hiding it needs work in about six customer surfaces.
  - **Ways to hide one today:**
    - **`is_private`** (plan-gated): customers see "Private event" with no venue, ordering only by private link, dropped from the map, redacted in WhatsApp.
    - **A long manual pause** (`paused_until`): the event stays listed everywhere with "Ordering paused", and WhatsApp still quotes it.
    - Neither is a clean "walk-up only".
  - **The smallest real "walk-up only"** is a new nullable column, e.g. `truck_events.walk_up_only`. It would need filtering in `/api/events`, `/api/menu` auto-detect, the embed, the discovery feed and WhatsApp's upcoming list, plus a refusal in customer submit. That is roughly 6 server reads and touches customer endpoints. A later option if you want it (D3).
- **Overlap with an existing event: warn, never block, never move orders silently.**
  - **It overlaps an approved or started event** (same `detectEventConflicts` rule): ask "Already trading at {other}?" with **Use {other}** (main: selects the existing event, creates nothing) and **Create anyway**.
  - **It overlaps an unapproved event** (usually the scraper already has this stop): offer **Approve {event}** (the existing approve path) or **Create new event**. This turns the common case into one tap and avoids a duplicate.
- **Offline: online only in version 1.**
  - Offline, the button is shown but disabled, with the line "Connect to the internet to create an event."
  - Walk-ups **cannot** be queued against a not-yet-created event: the server refuses unapproved or unknown events on replay unless an approved event overlaps.
  - Queueing the create itself (a client-made id, created first in the queue, then the orders) is possible later. It adds a new kind of queued operation and its own failure cases, so not for version 1 (D5).
- **Where the button goes:**
  - **The Change event list:** at the **top** when nothing approved is running or upcoming today (that is when it's needed); otherwise at the **bottom**, under the last day.
  - **The amber "No event selected" box** in Add order (AddOrderPanel ~2666) and the **Orders tab** box (dashboard ~4486), as a second button "Create event now" beside "Select event". The "Approve an event to take orders" state shows the same button.
  - **Phone:** the same three places. The list and boxes are already phone layouts; the create form is a bottom sheet like the other questions.
- **Marked as dashboard-created? Recommend `source = 'dashboard'`.** No constraint blocks it; Manage and the scraper write 'manual' / 'scraper'.
  - Manage doesn't show `source` today. A small "Added from the dashboard" line in Manage › Schedule is optional (D9).
  - The scraper later: if its name matches by fuzzy name, or by the venue linked to the place, it skips. Otherwise it adds an unconfirmed duplicate, which the list attaches under this event as a possible duplicate and the overlap question handles.

## 4. Alternative: walk-ups with no event at all
**What would break if walk-ups were allowed with no event (`event_id` null):**
- **Dashboard and KDS:** order lists are **strictly per event** ("with no selected event there is nothing to show"), so these orders would **not appear on any board**. Showing them needs a new "no event" board scope in `/api/dashboard`, the KDS and realtime.
- **Order numbers:** they fall back to the truck-wide counter (`increment_order_counter`), a separate sequence from the per-event numbers. Numbers would jump and could repeat between an event and the no-event stream on the same day.
- **Slots and capacity:** usage is computed per event. No event means no slot grid, no kitchen-capacity check and no day-load dots.
- **Reports and paperwork:** grouped by event; a no-event order has no venue or session.
- **Offline protection, push, van settings:** keyed by the event's van.
- **The events-overlap-2 gates** assume an event.

**Recommend: create an event.** The no-event path needs changes on every operational surface; a created event reuses all of them unchanged.

## 5. Output

### Recommended flow, step by step, with wording (en-GB)
1. **Entry points:**
   - **"+ Create event now"** in the Change event list (top when nothing approved is running or upcoming today, else bottom);
   - **"Create event now"** next to "Select event" in the amber boxes ("No event selected" / "Approve an event to take orders") on Add order and Orders.
2. **Offline:** the buttons are disabled, with "Connect to the internet to create an event."
3. **Sheet "Create event now"**:
   - **"Where are you trading?"**: up to six places as tappable rows (name, area), then **"Somewhere else"**.
   - "Somewhere else" shows a field labelled **"Venue name"** and a link **"Add town or postcode"**.
4. **Times line:** **"Today · {start}–{end}"** with **"Change times"**, which opens two time pickers labelled **"Starts"** and **"Ends"**.
5. **Van (multi-van trucks only):** **"Which van?"**, the van names, required.
6. **Note under the form:** **"Customers will see this event and can order online."**
7. **Buttons:** **"Create and start"** (main) / **"Cancel"**.
8. **Overlap checks on tap:**
   - Approved/started overlap: **"Already trading at {other}?"** / **"{other} is on today, {start}–{end}."** · **"Use {other}"** / **"Create anyway"**.
   - Unapproved overlap: **"Approve {event} instead?"** / **"{event} is waiting for approval, {start}–{end}."** · **"Approve {event}"** / **"Create new event"**.
9. **Success:** toast **"Event created and started"**. The event is selected; the KDS line in the toast or the sheet says **"Switch the kitchen screen to this event too."** (because the KDS won't follow by itself).
10. **Errors:**
    - **"Add where you're trading"** (no place or name);
    - **"Choose a van"**;
    - **"The end time must be after the start"**;
    - otherwise the server's message.

### Decisions for you
| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Who may create from the dashboard | (a) any signed-in team member, **staff included**; (b) owner and manager only; (c) anyone with the link (+PIN) | **(a)**: the point is "no Manage during service". Refuse token-only callers either way. |
| D2 | State when created | (a) approved + started + selected; (b) approved, not started (then the one-time Start question); (c) left unapproved | **(a)** |
| D3 | Customers | (a) public with online ordering; (b) walk-up only: new column plus ~6 customer reads changed; (c) private event (plan-gated, "Private event", link ordering) | **(a)** now; (b) later if needed |
| D4 | Overlap | (a) warn and offer the existing event or approving the unapproved one; (b) block; (c) attach silently | **(a)** |
| D5 | Offline | (a) online only; (b) queue the create and its orders | **(a)** for version 1 |
| D6 | Button position in the list | (a) top when nothing approved today, else bottom; (b) always top; (c) always bottom | **(a)** |
| D7 | Default start | (a) now rounded down to the quarter hour; (b) exactly now; (c) rounded to 5 min | **(a)** |
| D8 | Default end | (a) the place's last end if later, else start + 3 h; (b) always start + 3 h | **(a)** |
| D9 | New typed venue | (a) also create a Places row, as Manage does; (b) don't | **(a)**, so it's in the list next time |
| D10 | Marking | (a) `source 'dashboard'`; (b) also show "Added from the dashboard" in Manage › Schedule | **(a)** now; (b) optional |
| D11 | The broken dashboard `update_event` insert | (a) replace it with the new action; (b) leave it | **(a)** |

### Estimated files to change
- **Server (3–4):**
  - `app/api/dashboard/action/route.ts`: a new `create_event_now` action, member-only, replacing the dead insert branch;
  - a shared create helper extracted from Manage's `upsert_event`, e.g. `lib/events/create-event.ts` (place resolution, deal seeding, order-ready seeding, slot rebuild) — Manage then calls it too;
  - a small read-only places list for the dashboard (same route or `/api/events/manage`).
- **Client (4–5):**
  - a new `components/shared/CreateEventSheet.tsx`;
  - `EventPickerPanel.tsx` (the button);
  - `AddOrderPanel.tsx` (the amber box);
  - `app/(app)/dashboard/[token]/page.tsx` (the Orders box, wiring, select after create, the overlap questions);
  - possibly `EventGateDialogs.tsx` (the two overlap wordings).
- **Words:** about 15 keys × 49 files, plus split-messages output and the parity register.
- **Checks:** route checks (member-only, refusals, overlap, fields set), rule checks, screenshots.
- **In all:** about 8–10 code files plus the message files. **No database migration**, unless you choose D3(b).

## Prompt check
- **Nothing arrived garbled, and no instruction contradicted another.**
- "Exact short wording for every screen" alongside "don't produce UI": I gave the wording and positions only, with no mock-ups.

## Notes outside the brief
- **WhatsApp auto-replies quote unconfirmed events** too, marked [UNCONFIRMED]. So a scraped duplicate like 13 November's is advertised by WhatsApp even before approval.
- **The token-only write routes:** anyone holding a dashboard link can confirm, cancel or open events and take walk-ups without signing in. This predates this work.

Both are worth a separate look.

## SQL (all read-only, via the Supabase MCP)
```sql
select coalesce(source,'(null)') as source, status, count(*) as events, count(distinct truck_id) as trucks, count(*) filter (where truck_place_id is not null) as with_place, count(*) filter (where venue_id is not null) as with_venue, count(*) filter (where latitude is null) as no_coords from truck_events where truck_id not in ('pizzeria-gusto') and truck_id not ilike '%churrasco%' and truck_id not like 'demo-%' and created_at > now() - interval '90 days' group by 1,2 order by 1,2;
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid='public.truck_events'::regclass and contype in ('c','u') order by conname;
select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='truck_places' order by ordinal_position;
select column_name, column_default, is_nullable from information_schema.columns where table_schema='public' and table_name='truck_events' and column_name in ('status','auto_open','auto_close','source','venue_name','event_date','start_time','end_time','van_id','order_counter','is_private') order by column_name;
```

**What the first query showed** (last 90 days, excluding Pizzeria Gusto, Le Roi du Churrasco and demo trucks):
- events are mostly `manual` (65, across 3 trucks), plus 22 `scraper` events, all unconfirmed;
- **40 of 54 closed manual events have no coordinates**, and few use a place (12 of 54).

So events without coordinates are already normal.
