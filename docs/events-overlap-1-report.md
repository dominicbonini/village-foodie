# events-overlap-1: how a truck ends up with two overlapping events, and what staff see

**Review only, 17 Nov 2026.** No code was changed and nothing was written to the database. Every query was a read-only SELECT; they are all listed at the end. The screenshots use the test truck (Pizza Kitchen) with invented venues and in-memory events. They show the real components, bundled with esbuild in the allergen-screens-1 manner. Phone is 390 px and iPad is 820 px, each in en-GB and fr-FR. They are in [docs/events-overlap-1/](events-overlap-1/).

## Answer first

1. **The scraper did spot it, twice, but neither place stopped it.**
   - **The discovery gate** marked "MSC" as a duplicate of "Wickhambrook MSC" by the postcode rule. This was in `discovery_events`, at 21:15:56.359 on 9 Nov.
   - **Manage** showed an amber "⚠️ Possible conflict — review before approving" box on the card, of kind *overlap*. The event then sat in "Needs your approval" from 9 Nov to 13 Nov, neither approved nor rejected. The owner was in that list on 12 Nov at 06:16, approving a different scraped event (The Three Tuns, 14 Nov), and left 3dadcd9b alone.
   - **The step that actually creates the truck's event uses its own, weaker check.** That is the inbound-schedule "bridge". It looks only at the venue: the same `venue_id`, or a similar name. It never looks at times, postcode or van. The live event had no `venue_id`, and "msc" is too short for the name rule. So the bridge created 3dadcd9b.
2. **Staff screens treat an unconfirmed event like any other.**
   - The picker, the event bar and the Add-order panel all label it **"Not started"**, the same words as a confirmed event.
   - **Orders go through.** The dashboard's add-order action (and the offline queue that replays it) never reads the event's status.
   - The Start button is hidden for an unconfirmed event. Even if it were pressed, the server would answer "ok" without changing anything. It does not refuse.
3. **Customers never saw 3dadcd9b.** `/api/events` and `/api/menu` only use confirmed/open events. Customer submit refuses an unconfirmed event when the page sends its id. There are holes when no id is sent (§5).
4. **13 Nov from the data.**
   - Staff started taking orders on 3dadcd9b on **12 Nov at 16:51**: a pre-order for 19:15. They took 17 more on the morning and afternoon of 13 Nov, and 5 after 17:00.
   - Staff worked 3dadcd9b's order board from 16:58 to 18:00. They touched the live event's online orders only at 17:41–17:43.

---

## 1. Scraper / inbound: how 3dadcd9b was created

### The path
- **Discovery write.** [app/api/inbound-schedule/route.ts:103-107](../app/api/inbound-schedule/route.ts#L103-L107) calls `admitDiscoveryEvents` ([lib/discovery-gate.ts](../lib/discovery-gate.ts)).
  - It writes `discovery_events`, the public map, and runs the gate's duplicate rule ([lib/discovery-gate.ts:27-32](../lib/discovery-gate.ts#L27-L32), `duplicateVerdict` at [:182-205](../lib/discovery-gate.ts#L182-L205)). The rule fires on the same full postcode, venues within 500 m, identical coordinates, or name containment at the same start time.
  - 🔴 **This is a separate table. Its verdict never reaches the bridge.** The route says so on purpose: *"a row the gate marks as a duplicate is STILL offered to the operator for approval"* ([route.ts:98-100](../app/api/inbound-schedule/route.ts#L98-L100)).
- **Bridge into truck_events**, for each row, at [route.ts:149-297](../app/api/inbound-schedule/route.ts#L149-L297):
  1. Find the linked HatchGrab truck by name, or by `hatchgrab_truck_id` ([:152-165](../app/api/inbound-schedule/route.ts#L152-L165)).
  2. Skip it if the truck's `scraper_preference` is `manual` ([:170-175](../app/api/inbound-schedule/route.ts#L170-L175)).
  3. **Reject memory**: skip it if `rejected_event_signatures` has the same date and a Levenshtein-1 match on the venue name ([:186-194](../app/api/inbound-schedule/route.ts#L186-L194)).
  4. **Dedupe** ([:209-218](../app/api/inbound-schedule/route.ts#L209-L218)) against **all** of this truck's `truck_events` on the same date, whatever their status:
     - **Primary:** both rows have a `venue_id` and the ids are equal.
     - **Fallback:** `venueNameDedupMatch(normalizeVenue(existing.scraped_signature || existing.venue_name), normalizeVenue(incoming))`. That is, Levenshtein ≤ 1 ([lib/venue-signature.ts:20-46](../lib/venue-signature.ts#L20-L46)), or containment when both names are at least 5 characters ([route.ts:34-38](../app/api/inbound-schedule/route.ts#L34-L38)).
     - **Not compared at all:** start/end time, postcode, van, status.
  5. **Insert** ([:241-282](../app/api/inbound-schedule/route.ts#L241-L282)): `status: 'unconfirmed'`, `source: 'scraper'`, `scraped_signature` = the venue as scraped, `venue_id` from the venue matcher, and **no van**. `auto_open` is left at the column default, `false` ([supabase/migrations/20260522_event_system.sql:21](../supabase/migrations/20260522_event_system.sql)).
  6. A best-effort email to the truck lists its unconfirmed scraped events, with a link to Manage › Schedule ([:303-400](../app/api/inbound-schedule/route.ts#L303-L400)).

### The two rows, field by field

| Field | b2a73e87 (live) | 3dadcd9b (scraped) | Used by the bridge dedupe? |
|---|---|---|---|
| source | `manual`: added in Manage 9 Nov 08:58:40 | `scraper`: 9 Nov 21:15:56 | no |
| status (on 13 Nov) | confirmed → **open** 17:00:00 → closed 20:00:00 | **unconfirmed** (still) | no |
| venue_name | **Wickhambrook MSC** | **MSC** | yes, via the fallback |
| scraped_signature | null, so the fallback uses venue_name | "MSC" | yes |
| normalised name | `wickhambrookmsc` | `msc` | Lev distance 12; "msc" is 3 characters, under the 5-character containment floor → **no match** |
| venue_id | **null** (the operator picked a truck place: `truck_place_id` d6a01f36) | 2cf14ec5 ("Wickhambrook MSC" in `venues`, matcher confidence high) | primary rule needs **both**, so **skipped** |
| postcode | **CB8 8QU** (typed by the operator) | **CB8 8YN** (the venue's) | no |
| town | Wickhambrook | Wickhambrook | no |
| lat/lng | 52.170000, 0.569000 | 52.168750, 0.550240 (about 1.3 km apart) | no |
| event_date | 2026-11-13 | 2026-11-13 | yes: only same-date rows are compared |
| start/end | 17:00–20:00 | 17:00–20:00 | **no** |
| van_id | ff1d59b8 | **null** | no |
| auto_open | true | false | no |
| order_counter now | 30 | 23 (its orders were moved by gusto-move-1) | — |

**What differed, in short:** a different venue-name form, one side with no `venue_id`, and a different postcode. The bridge's two rules both failed. The time match, the only thing that made this obvious, is not part of the bridge's rule.

Checked by running the repo's own functions on these values (esbuild, scratchpad):
```
norm "wickhambrookmsc" "msc"  fuzzy false  containmentGate(min5) false
conflicts for 3dadcd9b (b2a73e87 confirmed): [{"kind":"overlap","against":"b2a73e87"}]
```

### Why the earlier scrape did *not* make a duplicate
At 10:44 on 9 Nov the same source posted "Wickhambrook MSC". The bridge's name fallback matched it to b2a73e87, so nothing was inserted then. At 21:15 the source posted the shorter "MSC", and that one got through. The gate's own comment already names this exact gap: *"⚠️ It costs "MSC" (3 chars), a genuine duplicate — which the postcode rule catches"* ([lib/discovery-gate.ts:54-59](../lib/discovery-gate.ts#L54-L59)). The postcode rule caught it in `discovery_events`. The bridge has no postcode rule.

### Your note: "the scraper had already detected it as a possible duplicate"
Confirmed, in two places:
- **`discovery_events`.** Row 5a213dfe ("Wickhambrook MSC", 10:44) was marked `superseded_by` 035d22df ("MSC") at 21:15:56.359, `superseded_reason = postcode`, meta `{"postcode":"CB88YN","metres":0,"time_gap_min":0}`. That is 0.5 s before the bridge inserted 3dadcd9b at 21:15:56.863.
  - ⚠️ This verdict compares two *scraped* rows with each other. It does not compare the scrape with b2a73e87, which never went through discovery.
- **Manage.** The approval card showed the conflict box (§2). It was neither approved nor rejected. `rejected_event_signatures` has nothing for it, and `updated_at` is unchanged since creation.

---

## 2. Manage: what the owner saw for 3dadcd9b

**Where it showed.** In Manage › Schedule › Events, under **"Needs your approval"**, with an amber left border. That list is `scraperUnconfirmed`, meaning status `unconfirmed` and source `scraper` ([app/(app)/manage/[token]/page.tsx:9330-9331](../app/(app)/manage/[token]/page.tsx#L9330-L9331)); it renders at [:10032-10045](../app/(app)/manage/[token]/page.tsx#L10032-L10045). The Schedule tab badge counts it.

**The conflict box** ([page.tsx:9089-9125](../app/(app)/manage/[token]/page.tsx#L9089-L9125)):
- **How it's computed.** `detectEventConflicts(event, events, addressFormat)` runs for every unconfirmed card ([:8812](../app/(app)/manage/[token]/page.tsx#L8812); [lib/event-conflicts.ts:89-139](../lib/event-conflicts.ts#L89-L139)).
  - It compares against **confirmed/open** events only, on the same date ([:111](../lib/event-conflicts.ts#L111)).
  - Postcodes CB8 8YN and CB8 8QU differ, so it is not `duplicate` or `review`. The times overlap, so it is **`overlap`**.
  - It flags every overlap whatever the van, on a one-van assumption ([:112-115](../lib/event-conflicts.ts#L112-L115)).
- **Was it shown for 3dadcd9b?** Yes. b2a73e87 was confirmed from 9 Nov 08:58, and Manage loads all events unfiltered by van (`/api/events/manage`, [page.tsx:935](../app/(app)/manage/[token]/page.tsx#L935); the van filter does not apply to the conflict check, [:9310-9311](../app/(app)/manage/[token]/page.tsx#L9310-L9311)). Running the real function on the two rows returns `overlap`.
- **The words:**
  - en-GB: *"⚠️ Possible conflict — review before approving / This event's time overlaps another event on the same day — a single van can't be in two places at once. Check before approving. / Already on your schedule: **Wickhambrook MSC** · 13 Nov · 17:00–20:00 · CB8 8QU (confirmed)"*
  - fr-FR: *"⚠️ Conflit possible — à vérifier avant d'approuver / L'horaire de cet événement chevauche celui d'un autre événement le même jour…"*
  - It does **not** say "duplicate". The word "duplicate" is kept for a same-postcode, same-time match.
- **Screenshots:** `01-manage-schedule-conflict-{en-GB,fr-FR}-{phone390,ipad820}.png`.

**Approve** ([page.tsx:8842-8848](../app/(app)/manage/[token]/page.tsx#L8842-L8848)):
- With a conflict, the first tap only reveals **"Yes, these are different events — approve anyway"** and Cancel inside the amber box ([:9119-9124](../app/(app)/manage/[token]/page.tsx#L9119-L9124); screenshot `01-…-after-first-approve-tap-…`). The second tap confirms. This warns but never blocks.
- Approve is disabled until the event has both times.
- **Confirm** runs `POST /api/events/action {action:'confirm'}` ([app/api/events/action/route.ts:53-170](../app/api/events/action/route.ts#L53-L170)). It needs times, and it assigns the truck's van if the truck has exactly one active van.

**Edit** opens the event editor, with confirm-on-save.

**Reject** ([page.tsx:8717-8733](../app/(app)/manage/[token]/page.tsx#L8717-L8733)) is one tap: `cancel` with `suppress: true`, so the signature is stored and the event will not come back. A 5-second Undo toast follows (`restore_rejected`).

**Who can do it:**
- The Manage page and `/api/manage` need a signed-in session. `resolveTruckAccessWith` ([lib/truck-access.ts:57-91](../lib/truck-access.ts#L57-L91)) gives owner (or platform admin), or the role in `truck_users` (owner / manager / staff).
- The Schedule tab is **owner + manager** only ([page.tsx:1259](../app/(app)/manage/[token]/page.tsx#L1259)).
- **Staff are redirected to the dashboard** ([page.tsx:1154-1157](../app/(app)/manage/[token]/page.tsx#L1154-L1157)).
- ⚠️ **But `/api/events/action` (confirm, open, close, cancel, reject, restore) checks only the dashboard token.** `getTruck(token)` matches `trucks.dashboard_token` ([route.ts:27-34](../app/api/events/action/route.ts#L27-L34)), with no session and no role. Anyone with the dashboard link can call it, even though no staff screen shows Approve today.

---

## 3. Dashboard (staff view)

### 3a. Which events the picker shows
- **The source.** The dashboard, KDS and Add-order panel all read `GET /api/events/manage?token=…&upcoming=true`. That returns every status except `cancelled`, from today on ([app/api/events/manage/route.ts:31-37](../app/api/events/manage/route.ts#L31-L37)).
  - Dashboard: [page.tsx:1360-1375](../app/(app)/dashboard/[token]/page.tsx#L1360-L1375). KDS: [kds/page.tsx:782-793](../app/(app)/dashboard/[token]/kds/page.tsx#L782-L793). AddOrderPanel: [components/dashboard/AddOrderPanel.tsx:846-866](../components/dashboard/AddOrderPanel.tsx#L846-L866).
  - The panel's own comment records that its status filter was removed on purpose on 1 Sep 2026 ([:854-857](../components/dashboard/AddOrderPanel.tsx#L854-L857)).
  - So **unconfirmed and closed events are ordinary rows.**
- **Status labels** ([lib/event-display.ts:113-120](../lib/event-display.ts#L113-L120)):

| Status | en-GB | fr-FR (picker / event bar) |
|---|---|---|
| open | ● Live | ● En cours / ● En cours |
| closed | ● Finished | ● Terminé |
| cancelled | Cancelled | Annulé |
| confirmed | **Not started** | **Pas commencé / Non démarré** |
| unconfirmed | **Not started** | **Pas commencé / Non démarré** |

  - 🔴 **Unconfirmed and confirmed read the same everywhere staff look.** There is no "needs approval" word, no badge and no van.
  - The fr-FR words also differ between the picker ("Pas commencé") and the event bar ("Non démarré").
- **Picker rows** ([components/shared/EventPickerPanel.tsx:121-147](../components/shared/EventPickerPanel.tsx#L121-L147)) show `Today · 17:00–20:00` in bold, the status chip, then the venue line. On 13 Nov the two rows differed only by venue: "Wickhambrook MSC" against "MSC — Wickhambrook".
- **Screenshots:** `02-event-picker-16h00-both-not-started-*` (both rows "Not started") and `02-event-picker-17h30-live-open-dup-selected-*` (Live against Not started, with the duplicate selected).

### 3b. Which event is picked when none is selected
- **The dashboard's auto-select effect decides** ([page.tsx:1445-1492](../app/(app)/dashboard/[token]/page.tsx#L1445-L1492)). It runs only when nothing is selected, in this order:
  - **0:** the `?event=` URL parameter, if that event is in the list.
  - **1:** the first event in the list whose time window contains now. Its comment says "open event", but it **ignores status**.
  - **2:** the first event today that hasn't started.
  - **3:** the next upcoming event.
  - Each uses `Array.find` or a sort over `upcomingEvents`, so **with identical times the first row in the list wins.**
- **`pickDefaultEventByTime`** ([lib/time-utils.ts:267-285](../lib/time-utils.ts#L267-L285)) is the fallback for `selectedOrDefaultEvent` ([page.tsx:1045-1050](../app/(app)/dashboard/[token]/page.tsx#L1045-L1050)). The KDS seed ([kds/page.tsx:1099-1106](../app/(app)/dashboard/[token]/kds/page.tsx#L1099-L1106)) and the Add-order panel's cold start ([AddOrderPanel.tsx:1121-1128](../components/dashboard/AddOrderPanel.tsx#L1121-L1128)) also use it.
  - It is status-independent by design (its comment explains the stale-live risk).
  - "Current" is `find()`, so the first in the list wins. "Upcoming" is a stable sort, so the first in the list wins on a tie.
  - Checked: with list order [live, dup] it returns live; with [dup, live] it returns dup.
- **What fixes the list order:** `/api/events/manage` orders by `event_date, start_time` **with no tiebreaker**. Two rows at 17:00:00 on one date come back in whatever order Postgres happens to produce. That is not guaranteed and can change after a row update.
  - Today the same query returns b2a73e87 first.
  - It is not possible to tell from the data which order the devices got on 12–13 Nov. Nor is it possible to tell whether staff picked 3dadcd9b by hand or got it by default.
- **The selection then sticks.** It is kept in state and in the `?event=` URL parameter ([:1497-1512](../app/(app)/dashboard/[token]/page.tsx#L1497-L1512)). The KDS seeds once and then holds.
- **The server's own fallback.** `/api/dashboard` without an `event_id` uses `todayEvents[0]`, ordered by `start_time` only ([app/api/dashboard/route.ts:222-236](../app/api/dashboard/route.ts#L222-L236), [:270-279](../app/api/dashboard/route.ts#L270-L279)). Same tie problem, and it logs a warning.

### 3c. What staff see on an unconfirmed event
- **Event bar:** 📍 venue · times, with **"Not started"** in grey ([page.tsx:4269-4271](../app/(app)/dashboard/[token]/page.tsx#L4269-L4271)).
- **"Manage event ▾" menu** ([components/shared/EventActionsModal.tsx:103](../components/shared/EventActionsModal.tsx#L103), [:136-141](../components/shared/EventActionsModal.tsx#L136-L141)):
  - **No Start button.** `canStart` is confirmed or closed only.
  - It still offers Change event, Note for customers, Change finish time, **Finish event** and **Cancel event** (screenshot `03-manage-event-menu-unconfirmed-dup-*`; compare `…-confirmed-live-*`, which has Start).
- **What the server does with Start or Finish on an unconfirmed event.** `open` updates with `.in('status',['confirmed','closed'])` ([app/api/events/action/route.ts:172-193](../app/api/events/action/route.ts#L172-L193)). `close` updates with `.eq('status','open')` ([:195-206](../app/api/events/action/route.ts#L195-L206)).
  - On an unconfirmed row each **matches 0 rows, returns `{ok:true}`, and does not refuse.**
  - The dashboard would show "Event started" or "Event finished" and set the status on screen. The next refetch would put it back to "Not started".
  - ⚠️ The brief said the API refuses `open` from unconfirmed. It doesn't: it no-ops silently. Today no screen sends `open` for an unconfirmed event, because all three Start buttons hide it.
- **Add order** ([AddOrderPanel.tsx:2576-2650](../components/dashboard/AddOrderPanel.tsx#L2576-L2650)):
  - **iPad and wider:** an orange card with venue · "Today · 17:00–20:00" · **Change**. There is no status, no Start (that needs confirmed or closed, [:2601](../components/dashboard/AddOrderPanel.tsx#L2601)), and no info note. The "Today's event — not yet open for orders…" note shows only for `confirmed` ([:2638](../components/dashboard/AddOrderPanel.tsx#L2638)). The menu, slot list and **Place order / Cash / Card** all work.
  - **Phone:** the event card is `hidden sm:block` ([:2577](../components/dashboard/AddOrderPanel.tsx#L2577)), so **a phone shows no event at all** on the Add tab.
  - **Screenshots:** `04-add-order-unconfirmed-dup-*` against `04-add-order-confirmed-live-*` (the confirmed one has Start event and the blue note).
- **Are orders accepted?** **Yes.** See §5, A1: the server never reads the event's status. They land `confirmed` at once.

### 3d. The switch-event confirm
- **Dashboard:** `switchEvent` with *"You're currently serving at {current}. Switch to {next}?"* exists ([page.tsx:3081-3088](../app/(app)/dashboard/[token]/page.tsx#L3081-L3088)), but **nothing calls it.**
  - The dashboard's only picker is the Add-order panel's. Its `onSelect` resets the basket and calls `onEventChange`, which runs `setSelectedEventId(id)` with **no confirm** ([page.tsx:5015-5020](../app/(app)/dashboard/[token]/page.tsx#L5015-L5020); [AddOrderPanel.tsx:3020-3031](../components/dashboard/AddOrderPanel.tsx#L3020-L3031)). The only block is "Reconnect to load" for an unloaded event while offline.
  - So the "only when leaving an open event" confirm in the brief **does not run on the dashboard today.**
- **KDS:** `switchEvent` ([kds/page.tsx:1729-1736](../app/(app)/dashboard/[token]/kds/page.tsx#L1729-L1736)) asks on **any** switch away from the held event, whatever its status. It names both venues and the count of active orders that will leave the screen: *"Switch from {from} to {to}? N orders on this screen will be replaced."*

### 3e. KDS and the Add-order picker
- **The same picker component** ([EventPickerPanel](../components/shared/EventPickerPanel.tsx)), the same list, the same labels.
- **KDS Start banner:** only `confirmed && !auto_open` ([kds/page.tsx:2747-2758](../app/(app)/dashboard/[token]/kds/page.tsx#L2747-L2758)). Its menu is the same `EventActionsModal`, so there is no Start on unconfirmed.
- **The KDS takes no orders**, but it shows and progresses the orders of whichever event it holds.

### 3f. Van handling
- **The event list is never filtered by van** on the dashboard, KDS or picker.
- **Orders:** with a `van_id` in the URL, the board shows orders where `van_id = X` **or `van_id` is null** ([app/api/dashboard/route.ts:364-368](../app/api/dashboard/route.ts#L364-L368)).
  - Walk-up orders never carry a van (§5, A1). So every staff order on either event shows on every van's board, provided that event is selected.
- **An event with no van (3dadcd9b).** The van-level settings read from `selectedEvent.van_id` are skipped ([route.ts:690-745](../app/api/dashboard/route.ts#L690-L745)):
  - kitchen capacity is **null (no limit)**;
  - the capacity window defaults to 5;
  - no buzzers;
  - cooking step and order-ready fall back to defaults;
  - cash uses the truck default.
  - Slot intervals and categories also resolve with a null van ([:495](../app/api/dashboard/route.ts#L495), [:558](../app/api/dashboard/route.ts#L558)).
  - So 3dadcd9b took orders **without the van's kitchen-capacity limit**, and its slot load was counted separately from the live event's.

---

## 4. Customers
- **`/api/events`:** `.in('status',['confirmed','open'])` ([app/api/events/route.ts:95](../app/api/events/route.ts#L95)). 3dadcd9b was never listed.
- **`/api/menu/[truckId]` with `?event_id=`:**
  - It returns 404 `event_not_confirmed` with `ordering_available:false` for any status other than confirmed or open ([route.ts:197-214](../app/api/menu/[truckId]/route.ts)).
  - Bypass: `?dashboard=1` (line 63) is not authenticated.
- **`/api/menu/[truckId]` without an event id:**
  - It picks the first upcoming open/confirmed event, ordered by `event_date` only with no `start_time` order (:225-233). A private pick is dropped (:250-254).
  - **Only if nothing was picked** does it look for an unconfirmed upcoming event and set `orderingAvailable = false` (:257-266).
  - On 13 Nov the open/confirmed b2a73e87 was picked and **3dadcd9b was ignored. Ordering stayed available.**
  - If the open event had been private, nothing would be picked, and the unconfirmed one would switch ordering **off**.
- **Customer submit:** see §5, A3.

---

## 5. Server: every path that creates an order

Found by a sub-agent sweep; I re-read the key lines.

| # | Path | Reads the event status? | Unconfirmed | Closed | Cancelled | Truck check | Van |
|---|---|---|---|---|---|---|---|
| A1 | **Dashboard walk-up**: `/api/dashboard/action` `action:'manual'` ([route.ts:1317](../app/api/dashboard/action/route.ts#L1317); event id at [:1450](../app/api/dashboard/action/route.ts#L1450); `status:'confirmed'` at [:1773](../app/api/dashboard/action/route.ts#L1773); insert ~1806/1814) | **No.** It uses the panel's `event_id` as sent ([AddOrderPanel.tsx:1542-1543](../components/dashboard/AddOrderPanel.tsx#L1542-L1543)) | **allowed** | **allowed** | **allowed** if the id is sent | not checked against the event | **never writes `van_id`** |
| A2 | **Offline queue replay**: [lib/native/orderGate.ts:376-404](../lib/native/orderGate.ts#L376-L404) reposts the same body to A1 | same as A1 | allowed | allowed | allowed | — | — |
| A3 | **Customer submit**: [app/api/orders/submit/route.ts:379-405](../app/api/orders/submit/route.ts#L379-L405), then `place_order_atomic_v2` (the SQL has no status check) | **Yes, when an `eventId` is sent:** only confirmed/open | refused | refused | refused | yes | from the event |
| A3 hole | **No `eventId`, two events that date**: the date lookup ends in `.maybeSingle()` ([:389-395](../app/api/orders/submit/route.ts#L389-L395)), which returns null for 2 rows, **so the status guard is skipped**. The event is then the earliest `start_time` among non-cancelled ([:798-808](../app/api/orders/submit/route.ts#L798-L808)); with identical times it is arbitrary | — | **possible** | possible | refused | — | — |
| A3 hole | **An `eventId` not found for the truck**: the guard is skipped and it falls back as above | — | possible | possible | refused | — | — |
| A4 | **Card orders after payment**: [lib/payments/promote-draft.ts:211-223](../lib/payments/promote-draft.ts#L211-L223) (from `/api/payments/return` and the Stripe webhook). The draft went through A3 first | only `neq cancelled` | allowed at promotion | allowed | event cancelled after the draft → **order inserted with `event_id` null** | yes | from the draft |
| — | WhatsApp | does not create orders (no `orders` writes in `app/api/webhooks/whatsapp`, `lib/whatsapp`) | | | | | |
| — | Private events | go through A3 | | | | | |

The customer order page sends `eventId: event?.id` ([app/(app)/trucks/[slug]/order/page.tsx:2257](../app/(app)/trucks/[slug]/order/page.tsx)), so the A3 holes need a bare or odd request.

---

## 6. 13 November, from the data (all times UTC = UK time in November)

| When | What | Evidence |
|---|---|---|
| 9 Nov 08:58:40 | **b2a73e87 created in Manage**: "Wickhambrook MSC", CB8 8QU, van ff1d59b8, confirmed in the same instant, auto_open on | `source manual`, `created_at`, `confirmed_at` |
| 9 Nov 10:44:48 | Scrape: discovery row "Wickhambrook MSC" 17–20. The bridge skipped it (name matched b2a73e87). The same scrape created a "Private Hire" event (4fc76223) | `discovery_events` 5a213dfe; no truck_event then |
| 9 Nov 20:34:34 | The owner **rejected** "Private Hire" in Manage › Needs your approval | 4fc76223 cancelled; `rejected_event_signatures` row |
| 9 Nov 21:15:56.349 | Scrape: discovery row "**MSC**" 17–20 written | 035d22df |
| 9 Nov 21:15:56.359 | **The gate marks the older "Wickhambrook MSC" discovery row as a duplicate** of "MSC" (postcode rule) | `superseded_*` on 5a213dfe |
| 9 Nov 21:15:56.863 | **The bridge inserts 3dadcd9b**, unconfirmed, no van. From now it is in "Needs your approval" with the overlap box. A new-events email goes to the truck (best effort; the send is not logged in the database) | `truck_events` |
| 11 Nov 21:56 | First online order on b2a73e87 (#1) | orders |
| 12 Nov 06:16:39 | The owner **approves "The Three Tuns" (14 Nov)** in Needs your approval. 3dadcd9b is in the same list, dated earlier, and is left untouched | cccc9c0b `confirmed_at` (`confirm` is only sent from Manage, [page.tsx:8693](../app/(app)/manage/[token]/page.tsx#L8693)) |
| **12 Nov 16:51:05** | **First staff order on 3dadcd9b**: #1 Darren, slot 19:15 | backup.json |
| 13 Nov 06:47 → 16:57 | Online orders #2–#6 on b2a73e87 | backup.json (`web`, van ff1d59b8) |
| 13 Nov 08:18 → 16:21 | Staff orders #2–#18 on 3dadcd9b (pre-orders through the day) | backup.json (`manual`, van null) |
| 13 Nov 16:58:32 | Staff mark #10 paid and collected **on 3dadcd9b's board** | `action_audit_log` |
| **13 Nov 17:00:00.218** | **b2a73e87 auto-opens**. 3dadcd9b stays unconfirmed (auto_open off, and it cannot be opened) | `opened_at` |
| 13 Nov 17:05 → 17:37 | Staff orders #19–#23 on 3dadcd9b, two paid at the counter | backup.json, audit |
| 13 Nov 17:06 → 17:39 | Staff collect 3dadcd9b orders #7, #20, #17, #14, #2 | audit |
| 13 Nov 17:41:45 → 17:43:44 | Staff mark paid and collected **live-event** online orders #6 and #1 | audit (one device switching, or a second device; there is no device id to tell) |
| 13 Nov 17:48 → 17:59 | Back on 3dadcd9b: #23, #12, #4 collected | audit |
| 13 Nov 18:00:31 / 18:02:48 | Backup, then gusto-move-1 moves all 23 to b2a73e87 | docs/gusto-move-1-report.md |
| 13 Nov 18:32 | Online order #30 on b2a73e87 | orders |
| 13 Nov 19:59:32 / 20:00:00 | Offline pause stamp; b2a73e87 auto-closes | `last_offline_pause_at`, `closed_at` |
| now | 3dadcd9b is still `unconfirmed`, with 0 orders and `updated_at` = its creation time | truck_events |

**Device and source, and what can't be known.**
- `orders` has no device column.
- `action_audit_log` labels every action `actor_kind owner / "Pizzeria Gusto" / source web` and stores no event or device.
- `van_devices` has one iOS device for this van, last seen 16 Jul.
- So "manual" means the dashboard's Add-order panel, or its offline replay. That is all the data shows.
- ⚠️ The brief calls them "23 walk-up orders". 18 of them were placed **before** 17:00, from 12 Nov onwards, so they were mostly pre-orders taken on the staff device.

**Has this happened before?** Today no unconfirmed event holds orders, because 3dadcd9b's were moved. Before the move it was the only one. Two cancelled events hold orders: Gusto 3 Oct (3 web orders) and test-truck 14 Oct.

---

## 7. Where each fix could go, with its risks (facts only)

### (a) The scraper marks an overlapping event as a "possible duplicate"
**Places:**
- The bridge dedupe, [app/api/inbound-schedule/route.ts:209-218](../app/api/inbound-schedule/route.ts#L209-L218). Today it is venue-only, and its select has no times, postcode or van.
- The gate's verdict is already computed per row (`gate.outcomes[].duplicate`, [route.ts:103-108](../app/api/inbound-schedule/route.ts#L103-L108)), but it judges discovery rows against discovery rows, not against `truck_events`.
- `detectEventConflicts` ([lib/event-conflicts.ts](../lib/event-conflicts.ts)) is pure and already "reusable on client and server".
- A stored flag would need a new `truck_events` column, and so a migration.

**Risks:**
- Marking without skipping changes nothing for staff unless (b), (d) or (e) also read the mark. On 13 Nov the Manage box already said "Possible conflict" and the event sat for 4 days.
- Skipping the insert on a time overlap loses real second events: a two-van truck, or two pitches. The conflict helper keeps its one-van assumption deliberately ([:112-115](../lib/event-conflicts.ts#L112-L115)).
- Matching by postcode or `venue_id` would not have matched here: b2a73e87 had no `venue_id`, and its typed postcode differs from the venue's.
- Gusto's scraped "Private Hire" rows have no times or venue, so a time rule never sees them.
- Reject memory stays strict on purpose (Lev 1), so a looser rule must not reuse it.

### (b) The dashboard default prefers open > confirmed > unconfirmed among current events
**Places:**
- The auto-select chain, [page.tsx:1445-1492](../app/(app)/dashboard/[token]/page.tsx#L1445-L1492). This is what actually sets `selectedEventId`.
- `pickDefaultEventByTime` ([lib/time-utils.ts:267](../lib/time-utils.ts#L267)), shared by the dashboard, KDS (×3) and the Add-order panel.
- A tiebreaker in `/api/events/manage` ([route.ts:36-37](../app/api/events/manage/route.ts#L36-L37)) or in `/api/dashboard` ([:236](../app/api/dashboard/route.ts#L236), [:270-279](../app/api/dashboard/route.ts#L270-L279)).

**Risks:**
- The helper is status-independent on purpose, so that a stale "open" event (one that failed to auto-close) can't hijack the board. Ranking open first brings that back unless it is limited to events current by time.
- It only affects the default. A device that already holds 3dadcd9b (state, `?event=` link, or the KDS seed-and-hold) keeps it. A tap in the picker still selects it.
- Before 17:00 on 13 Nov neither event was open. Only a confirmed-over-unconfirmed rank would have mattered, and pre-orders started on 12 Nov, when "current by time" did not apply at all.
- The same helper drives the KDS. A change there moves which event a kitchen screen seeds to.

### (c) "Approve & start" from the dashboard, with a choice about the overlap
**Places:**
- The Start gates: [EventActionsModal.tsx:103](../components/shared/EventActionsModal.tsx#L103), [AddOrderPanel.tsx:2601](../components/dashboard/AddOrderPanel.tsx#L2601), [kds/page.tsx:2747](../app/(app)/dashboard/[token]/kds/page.tsx#L2747).
- Server `confirm` ([events/action/route.ts:53](../app/api/events/action/route.ts#L53)) and `open` ([:172](../app/api/events/action/route.ts#L172)). `open` silently no-ops on an unconfirmed event today.
- `detectEventConflicts` for the overlap check.

**Risks:**
- **Roles.** Approving is owner/manager-only in Manage, and staff are redirected away. Putting it on the dashboard gives it to whoever holds the dashboard link. The server **already** accepts `confirm` and `cancel` from any token holder.
- Approving the duplicate makes **two** confirmed/open events at the same time. Customers would then see both (`/api/events`), and `/api/menu`'s auto-pick orders by date only.
- `confirm` gives the truck's only van to the duplicate too.
- "Choose which one" implies moving orders between events. gusto-move-1 shows what that takes: renumbering clashes, capacity rows, and devices showing an emptied event.

### (d) The server refuses orders on an unconfirmed event when an overlapping confirmed/open event exists
**Places:**
- The A1 walk-up insert ([dashboard/action/route.ts:1317](../app/api/dashboard/action/route.ts#L1317) to 1814), which today reads no status. The same rule would then apply to A2 replays.
- The A3 holes ([submit/route.ts:389-395](../app/api/orders/submit/route.ts#L389-L395), [:798-808](../app/api/orders/submit/route.ts#L798-L808)).
- A4 promotion (no re-check).
- The SQL function `place_order_atomic_v2`, if it is to hold everywhere.

**Risks:**
- **The offline queue.** A walk-up placed offline, with food handed over and cash taken, would be refused at replay. It becomes an outbox conflict, not a lost order, only if that path handles a refusal of this kind.
- **Pre-orders.** 18 of the 23 were taken before the event, some on the day before. A refusal at order time stops staff mid-conversation with a customer. The message has to say which event to use.
- A truck that really has two vans at overlapping times would be blocked if "overlapping" ignores vans. Both 13 Nov rows had different van states (one with, one without).
- A refusal with no switch path leaves staff stuck: the dashboard picker has no confirm and no hint today (§3d).

### (e) The dashboard hides unconfirmed events entirely
**Places:**
- The client filters at [page.tsx:1373-1375](../app/(app)/dashboard/[token]/page.tsx#L1373-L1375), [kds/page.tsx:793](../app/(app)/dashboard/[token]/kds/page.tsx#L793) and [AddOrderPanel.tsx:858](../components/dashboard/AddOrderPanel.tsx#L858).
- ⚠️ **Not** in `/api/events/manage`. Manage itself loads its schedule, including "Needs your approval", from that route ([manage page.tsx:935](../app/(app)/manage/[token]/page.tsx#L935)).

**Risks:**
- It reverses the 1 Sep 2026 decision to make every picker show the same list ([AddOrderPanel.tsx:854-857](../components/dashboard/AddOrderPanel.tsx#L854-L857)).
- **Orders already on a hidden event vanish from every board**, because the board is event-scoped.
- It also hides operator-added "needs confirmation" events (source `manual`, unconfirmed), not just scraped ones.
- A saved `?event=` link to an unconfirmed event falls through to the default.
- The server still accepts orders on it (A1), so it only hides the choice.
- Staff could no longer take pre-orders for an event the owner simply hasn't approved yet. Whether that is wanted is a product decision.

---

## Screenshots (docs/events-overlap-1/, 36 files)

Every name exists in en-GB and fr-FR, at `phone390` and `ipad820`.

| File stem | What it shows |
|---|---|
| `01-manage-schedule-conflict` | Manage › Schedule at 09:00: the scraped "HSC" card under Needs your approval, with the amber **Possible conflict / overlap** box naming the confirmed "Harnessville Sports Club" event |
| `01-manage-schedule-conflict-after-first-approve-tap` | The same after one tap on Approve: "Yes, these are different events — approve anyway" and Cancel |
| `02-event-picker-16h00-both-not-started-list-order-live-first` | Picker at 16:00: both rows "Today · 17:00–20:00 · Not started"; the default (first) is the live one |
| `02-event-picker-16h00-both-not-started-list-order-dup-first` | The same list in the other order: the duplicate is first and is the default |
| `02-event-picker-17h30-live-open-dup-selected` | 17:30: live event "● Live", duplicate "Not started" and **selected** |
| `03-manage-event-menu-unconfirmed-dup` | Manage event ▾ on the unconfirmed duplicate: **no Start**, but Finish and Cancel |
| `03-manage-event-menu-confirmed-live` | The same menu on the confirmed event: **Start event** at the top |
| `04-add-order-unconfirmed-dup` | Add order on the duplicate: iPad card has venue, time and Change only; Place order / Cash / Card available. Phone: no event card at all |
| `04-add-order-confirmed-live` | Add order on the confirmed event: Start event plus "Today's event — not yet open for orders…" (iPad) |

**How they were made.** `scripts/_render-kit.cjs` and `scripts/_lp1d-fixtures.cjs` bundle the real `ScheduleTab`, `EventPickerPanel`, `EventActionsModal` and `AddOrderPanel`. They render statically: hooks are seeded and effects don't run. The page's compiled CSS from `.next/static` is applied, and Playwright Chromium takes the screenshot clipped to the viewport (the Manage page at full height). The test truck "Pizza Kitchen" is used, with venues "Harnessville Sports Club" / "HSC". The clock is frozen at 13 Nov 2026. The capture scripts are in the session scratchpad, not the repo, as with allergen-screens-1. Nothing was sent to a database or the network.

**Not captured as images:**
- The dashboard's dark event bar. It is page-level; its words, "Not started", are the same as the picker chip.
- The KDS Start banner. It only shows for confirmed && !auto_open, so it never shows for unconfirmed.

---

## Prompt check
- **Nothing arrived garbled.**
- **Corrections to the brief's premises (facts, not conflicting instructions):**
  - "The API refuses 'open' from unconfirmed": it returns ok and changes nothing (§3c).
  - "The switch-event confirm (only when leaving an open event)": on the dashboard it is never called; the KDS asks on every switch (§3d).
  - "23 walk-up orders": 18 were pre-orders, from 12 Nov.
  - Your follow-up note ("the scraper had already detected it as a possible duplicate") is confirmed in §1 and §2. It also means fix option (a) partly exists already, in two places that don't feed the bridge or the staff screens.
- **One apparent tension, resolved by your standing rule rather than by choosing.** "Show SQL inline in chat" against "in chat, give me only a two-line summary". Your report convention is chat = two-line summary plus SQL as fenced blocks. All SQL here is read-only and has already run, so the chat repeats it in one fenced block, marked as such, and lists it here too.
- Gusto and Le Roi du Churrasco were used only in read-only SELECTs. No Gusto data appears in a screenshot.

## SQL (every statement this session, all read-only, all already run)
```sql
select * from truck_events where id in ('3dadcd9b-1f36-48e7-9672-12d2f2bfc4f6','b2a73e87-3bf5-42fe-a75b-633107dc374d');
select column_name from information_schema.columns where table_name='discovery_events' order by ordinal_position;
select d.id, d.event_date, d.start_time, d.end_time, d.truck_name, d.discovery_truck_id, d.venue_name, d.venue_id, v.name vname, v.postcode vpc, v.latitude, v.longitude, d.village, d.source, d.created_at, d.updated_at, d.superseded_by, d.superseded_reason, d.superseded_meta, d.superseded_at, d.visibility from discovery_events d left join venues v on v.id=d.venue_id where d.event_date='2026-11-13' and (d.truck_name ilike '%gusto%' or d.venue_name ilike '%msc%' or d.village ilike '%wickham%') order by d.created_at;
select id, event_date, start_time, status, source, van_id from truck_events where truck_id='pizzeria-gusto' and status <> 'cancelled' and event_date >= '2026-11-12' order by event_date asc, start_time asc limit 8;
select column_name from information_schema.columns where table_name='orders' and table_schema='public' and (column_name ilike '%device%' or column_name ilike '%source%' or column_name ilike '%channel%' or column_name ilike '%client%' or column_name ilike '%by%' or column_name ilike '%offline%' or column_name ilike '%van%' or column_name ilike '%queued%') order by 1;
select id, venue_name, status, source, created_at, updated_at, confirmed_at, opened_at, closed_at, van_id, cancellation_note from truck_events where truck_id='pizzeria-gusto' and event_date between '2026-11-12' and '2026-11-14' order by event_date, created_at;
select id, customer_name, source, van_id, status, created_at, updated_at from orders where event_id='b2a73e87-3bf5-42fe-a75b-633107dc374d' and (created_at > '2026-11-13 18:00:31+00' or id::int >= 30) order by created_at;
select id, event_date, start_time, end_time, venue_name, postcode, status, source, created_at, confirmed_at, updated_at from truck_events where truck_id='pizzeria-gusto' and ((confirmed_at between '2026-11-09 21:15:56+00' and '2026-11-13 20:00+00') or (updated_at between '2026-11-09 21:15:56+00' and '2026-11-13 20:00+00') or id='cccc9c0b-351a-4762-a5b9-e2d59cf7e0de') order by coalesce(confirmed_at, updated_at);
select truck_id, event_date, scraped_signature, created_at from rejected_event_signatures where truck_id='pizzeria-gusto' and event_date between '2026-11-09' and '2026-11-20' order by created_at;
select table_name, string_agg(column_name, ',' order by ordinal_position) cols from information_schema.columns where table_schema='public' and (table_name ilike '%heartbeat%' or table_name ilike '%device%' or table_name ilike '%order_event%' or table_name ilike '%audit%' or table_name ilike '%order_log%') group by 1;
select a.action, a.source, a.actor_kind, a.actor_label, count(*) n, min(a.created_at) first_at, max(a.created_at) last_at from action_audit_log a where a.truck_id='pizzeria-gusto' and a.created_at between '2026-11-12 00:00+00' and '2026-11-13 21:00+00' group by 1,2,3,4 order by first_at;
select van_id, platform, default_screen, last_seen, created_at from van_devices where truck_id='pizzeria-gusto' order by created_at;
-- audit actions per event before the move: the 29 (order_key, event, number) pairs come from docs/gusto-move-1/backup.json
with m(order_key, ev, no) as (values /* 29 rows from backup.json */ ('…','3dadcd9b','1') /* … */)
select to_char(a.created_at at time zone 'UTC','HH24:MI:SS') t, a.action, m.ev, '#'||m.no no, a.source from action_audit_log a join m on m.order_key=a.order_key::text where a.truck_id='pizzeria-gusto' and a.created_at < '2026-11-13 18:02:48+00' order by a.created_at;
select e.truck_id, e.status, e.source, count(distinct e.id) events, count(o.*) orders, string_agg(distinct o.source, ',') order_sources, min(e.event_date) first_date, max(e.event_date) last_date from truck_events e join orders o on o.event_id=e.id where e.status in ('unconfirmed','cancelled') group by 1,2,3 order by 1,2;
```
(Two statements failed on a column name, `discovery_events.truck_id` and `orders.created_by_device`, and were rerun as above.)
