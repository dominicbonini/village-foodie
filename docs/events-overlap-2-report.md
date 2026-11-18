# events-overlap-2: the dashboard only uses approved events; one-time overlap and Start questions

**Status, 17 Nov 2026: built and checked offline; waiting on your decisions before the live checks.**
- Steps 1–6 are built, except one server change (`/api/orders/submit`). That one contradicts the "no customer endpoints" rule, so I stopped on it (Q3).
- Everything is checked against the real code with in-memory data:
  - 24 rule checks, 35 route checks and 7 offline-queue checks pass;
  - types are clean;
  - message checks pass in all 49 language files.
- **The live checks on the test truck (step 7) have not run.** They need three things only you can decide (Q1, Q2, Q4).
- **The new column's migration is written but not run**, because running it requires a commit (Q1).
- **Nothing is committed or deployed. No test data was created, so there is nothing to clean up yet.**

The questions are at the end.

---

## What changed, by step

### 1. The default event is approved-only
- **New [lib/event-default.ts](../lib/event-default.ts)**, pure, used by the client and the server. `pickDefaultEventByTime` is unchanged and still status-blind.
  - `pickDefaultApprovedEvent`: a **started** event (status `open`) that hasn't ended. Current by time wins; otherwise the earliest, so an event opened early still counts. If there is none, a **confirmed** event that is current or next by time. Otherwise nothing.
  - It never returns an unconfirmed, closed, cancelled or past event. A started event whose end has passed (a "stale live" one) is skipped.
  - `onlyUnapprovedToday` / `pickDashboardDefaultEvent`: if today's only events are unapproved, it returns **nothing**, even when tomorrow has a confirmed event (see "Decisions I made", 2).
- **Dashboard** ([app/(app)/dashboard/[token]/page.tsx](../app/(app)/dashboard/[token]/page.tsx)):
  - The fallback for `selectedOrDefaultEvent` (~1060) is the approved-only default.
  - A selection that names an unconfirmed event is ignored.
  - The auto-select chain (~1462–1510): priorities 1–3 (time-only `find`) are replaced by that one rule.
  - Priority 0, the `?event=` link, is followed only for an event that isn't unconfirmed.
  - A selection that is, or has since become, unconfirmed is dropped, so the default runs again.
- **Auto-open paths.** The dashboard's stale auto-open (~1392) and the KDS's already open `status==='confirmed'` events only. The server's `open` only changes confirmed or closed events (and now says so, step 6). **None can open an unconfirmed event.**
- **"Approve an event to take orders"** replaces "No event selected" in the event bar (amber) and in the Orders tab's no-event panel, when today's only events are unapproved.
- **The Add-order panel's cold-start default** ([AddOrderPanel.tsx ~1160](../components/dashboard/AddOrderPanel.tsx)) uses the same approved-only rule.

### 2. The event list
- **[components/shared/EventPickerPanel.tsx](../components/shared/EventPickerPanel.tsx)** has three optional props: `needsApproval`, `orderCount`, `tagFor`. The KDS passes none, so its picker is unchanged.
- **The Add-order picker** now lists the dashboard's polled list, ordered by `orderEventList`:
  - **started first**;
  - then **approved, by date and time** (finished events sit here too, with their "Finished" chip);
  - then a **"Needs approval"** heading with the unconfirmed events.
- **Every row shows its order count**, "6 orders" / "1 order" / "No orders". That is online plus walk-up, not cancelled.
  - The counts come from `GET /api/events/manage?counts=1` ([route](../app/api/events/manage/route.ts)), a new opt-in field `order_counts`.
  - It is read in pages of 1,000 so a busy event is never under-counted.
  - Manage's own read of that route is unchanged.
- **An unconfirmed event that overlaps an approved or started one** is tagged **"possible duplicate"**.
  - The rule is `approvedOverlaps` → `detectEventConflicts`. It keeps the `duplicate` and `overlap` kinds, and keeps `review` (same venue, different time) only when the times really overlap.
- Screenshot: `01-event-list-*`.

### 3. Tapping an unapproved event (asked once per event)
- **In the picker, an unconfirmed row is never selected.** The panel asks the dashboard (`onRequestApprove`), which opens **one** of two questions ([components/shared/EventGateDialogs.tsx](../components/shared/EventGateDialogs.tsx)):
  - **It overlaps an approved or started event, and "Keep" was never chosen for it:**
    - "Approve {event}?" / "It's at the same time as {other} ({start}–{end}), which is already approved and has {n} orders. It's probably a duplicate."
    - With 0 orders the "and has {n} orders" part is left out.
    - If it overlaps several, it names the one with the **most orders**; on a tie, the started one, then the earliest.
    - Main button **"Keep {other}"**: calls the new `dismiss_overlap` action ([app/api/events/action/route.ts](../app/api/events/action/route.ts)). That sets **`truck_events.overlap_dismissed_at`** once; a second call keeps the first time. The event stays unconfirmed and unselected.
    - Secondary button **"Approve {event} anyway"**: the existing `confirm` action, which now takes `truck_defaults: true` so Approve uses the truck's Settings auto-open/close defaults (the dashboard doesn't hold them). It then selects the event.
  - **Otherwise:** "Approve {event}?" / "{event} isn't approved yet. Approve it to take orders? Customers will see it too." with **Approve** / **Cancel**.
- **Once per event, on any device:** the stored column decides. After "Keep", tapping the event again shows only the plain question.
- Screenshots: `02-*`, `02b-*` (no orders), `03-*`.

### 4. Start (asked once per event)
- **Dashboard `openEvent`** (the event menu's Start, and the Add-order card's Start): if the event's **`opened_at` is null** (never started), it shows **"Start this event?" / {event} / "{day} · {start}–{end} · {n} orders so far"** with **Start event** / **Cancel**.
  - Once `opened_at` is set (the server stamps it on every start), Start never asks again. Restart is unchanged.
  - For a first start this question replaces the old future-date `confirm()`, since it already names the day.
- **KDS:** the same dialog in its `openEvent`. The KDS uses the shared `EventActionsModal` and has its own Start banner, so "everywhere Start exists" includes it.
- `EventActionsModal`'s `canStart` is unchanged: no Start on an unconfirmed event, as before.
- Screenshot: `04-*`.

### 5. Switching event
- **Add-order picker:** choosing another event while the selected one is **started** asks **"Switch to {event}?"** with **Switch** / **Cancel**. With nothing started, there is no question.
- **Phones:** the event card is still `hidden sm:block`. A **one-line `sm:hidden` "📍 {venue} · {start}–{end}"** now sits at the top of both phone layouts, and tapping it opens the picker.
- Screenshots: `05-*`, `06-*` (the phone shows the line; the laptop is unchanged).

### 6. Server

**Walk-up `manual`** ([app/api/dashboard/action/route.ts ~1335](../app/api/dashboard/action/route.ts)) reads the event before anything else:
- **Live request:**
  - **unconfirmed** → 409 `event_not_approved` "This event isn't approved". The panel keeps the basket, shows the message, and opens the approve dialog for that event.
  - **closed / cancelled** → 409 `event_not_open` ("This event has finished. Restart it to take orders." / "This event was cancelled."). See Q5.
- **Offline replay** (the outbox stamps `placed_offline: true` on every queued body):
  - **unconfirmed + overlaps an approved/started event** → the order is **moved onto that event**, the one with the most orders, before its number is taken. It is numbered from that event's counter, with that event's date.
  - **unconfirmed, nothing overlaps** → 409 `event_not_approved` with **`keep_queued: true`**.
    - [lib/native/orderGate.ts](../lib/native/orderGate.ts) keeps that op **pending**: marked `blocked`, no attempt burned, not a conflict.
    - The drain **continues** with the ops behind it.
    - [components/native/OfflineBanner.tsx](../components/native/OfflineBanner.tsx) says "1 order is waiting: this event isn't approved. Approve it to send."
    - The next drain after approval sends it. The 12-hour age limit still ends in the red conflict banner; nothing is ever deleted.
  - **closed** (it was open when queued) → accepted on it, as before.
- A failed read → 503 retryable, so a queued order waits rather than being judged on no data.
- With no event id, the date fallback resolves at most one event, and that event is checked by the same rule.

**`/api/events/action` `open` / `close`** ([route](../app/api/events/action/route.ts)) now use `.select('id')`. When no row changed, they return **409** with the event's current status, in words:
- `event_cannot_start`: "Can't start this event (not approved / already started / cancelled)."
- `event_cannot_finish`: "Can't finish this event (not approved / not started / already finished / cancelled)."
- The dashboard and KDS already show this text as a toast.
- The automatic open loops ignore the answer, as before.

**Customer submit (`/api/orders/submit`): NOT CHANGED.** See Q3.

---

## New wording (en-GB), added to all 49 language files

Added to en-GB plus the 48 full language files; regional variants inherit. Each file was re-read right before writing, and keys were only added, never reordered. split-messages was run.

| Key | en-GB |
|---|---|
| kitchenModals.eventGate.approveTitle | Approve {event}? |
| kitchenModals.eventGate.overlapText | It's at the same time as {other} ({start}–{end}), which is already approved[ and has {n} orders]. It's probably a duplicate. |
| kitchenModals.eventGate.keep / approveAnyway | Keep {other} / Approve {event} anyway |
| kitchenModals.eventGate.plainText / approve | {event} isn't approved yet. Approve it to take orders? Customers will see it too. / Approve |
| kitchenModals.eventGate.startTitle / startDetails | Start this event? / {day} · {start}–{end} · {n} orders so far |
| kitchenModals.eventGate.switchTitle / switch | Switch to {event}? / Switch |
| kitchenModals.picker.orders / needsApproval | No orders · 1 order · 6 orders / Needs approval |
| addOrder.possibleDuplicate | possible duplicate |
| dashboard.eventBar.approveToTakeOrders | Approve an event to take orders |
| dashboard.toast.eventApproved | Event approved |
| nativeShell.banner.notApproved | 1 order is waiting: this event isn't approved. Approve it to send. |
| errorsKitchen.event_not_approved | This event isn't approved |
| errorsKitchen.event_not_open | This event has finished. Restart it to take orders. / This event was cancelled. / This event isn't open. |
| errorsManage.event_cannot_start / _finish / _dismiss | Can't start this event (…). / Can't finish this event (…). / This event no longer needs approval (…). |

- **Plurals:** built from each language's own plural categories (Intl), e.g. Polish one/few/many and Slovenian two. The repo's translation check reports **0 structural problems in all 48 languages**.
- **One escaped character preserved:** ja-JP's existing `​` is kept escaped.
- **Registry entry:** the new keys are registered in `scripts/_messages-parity-1e.cjs`, the repo's register of named new wordings.
- ⚠️ **A machine translation of short UI text, not a native review.** The words follow each language's existing word for "event": fr événement, de Event, ja 出店, ko 영업 일정, and so on.

---

## Checks run (all pass)

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| Rules (`lib/event-default.ts`, clock frozen) | **24/24** |
| Routes on an in-memory Postgres stand-in (`scripts/_fake-pg.cjs`, real route code, email/push/payments stubbed) | **35/35** |
| Offline drain (real `orderGate`/`outbox`, in-memory Preferences) | **7/7** |
| `scripts/messages-parity.cjs` | 1,229,647 passed, 0 failed |
| `scripts/split-messages.cjs --check` | in step |
| `scripts/translation-check.cjs`, 48 languages | Structural 0 in every one |
| ESLint, changed lines only | 1 left (see below) |

**Rules (24):**
- The approved event is the default whichever order the list comes in. The pure helper still picks the duplicate when it is first.
- A started event beats a confirmed one.
- Opened early still counts as the default.
- A stale started event is skipped.
- Only unapproved today → nothing, even with a confirmed event tomorrow.
- The overlap rules, including overnight overlaps and touching windows (which don't count).
- The target is the one with the most orders, then the started one.
- The list order.

**Routes (35):**
- `open`/`close` on unconfirmed, open, confirmed and closed events: a 409 with the right words, and **the row is unchanged**.
- Restart of a closed event still works.
- `dismiss_overlap` stores once and keeps the first time; it refuses an approved event.
- `confirm` with truck defaults uses auto-open off/on from Settings and assigns the sole van.
- `counts=1`: 3 for the live event, 1 cancelled excluded; absent without the parameter.
- Live walk-up on the duplicate → 409 and nothing inserted; on a closed event → 409; on the approved event → 200 and inserted.
- **Offline replay for the duplicate → inserted on the approved event.**
- With two overlapping events → the one with 5 orders over the one with 1.
- No overlap → 409 `keep_queued`, nothing inserted.
- A replay for a closed event → accepted.

**Offline drain (7):**
- The blocked order stays pending, unburned and not a conflict.
- The order queued behind it still syncs.
- Seven more drains: still pending.
- After approval, the next drain sends it.

**The one ESLint finding left** is `react-hooks/set-state-in-effect` at AddOrderPanel ~1158. That is the panel's existing cold-start `setManualEvent` effect: I changed only which picker it calls, and the pattern was already there. I fixed the others it raised on my lines (`any`, a new effect, a render-time closure).

**The test files** are in the session scratchpad, not the repo: `eo2-unit.ts`, `eo2-routes.cjs`, `eo2-drain.ts`, `eo2-shots.cjs`. Say if you want them added under `scripts/`.

## Screenshots: [docs/events-overlap-2/](events-overlap-2/), 32 files

These are the real components, rendered with the repo's render kit using fixture events on the test truck, in en-GB and fr-FR, at `phone390` and `laptop1280`.

| File stem | Shows |
|---|---|
| `01-event-list` | Started "Harnessville Sports Club · Live · 6 orders" (selected), then "Market Square · 1 order", then **NEEDS APPROVAL**: "HSC · No orders · possible duplicate" and "Village Hall · No orders" |
| `02-approve-overlap-dialog` | "Approve HSC?" … "which is already approved and has 6 orders" · **Keep Harnessville Sports Club** / Approve HSC anyway |
| `02b-approve-overlap-dialog-no-orders` | The same with 0 orders: the order clause is gone |
| `03-approve-plain-dialog` | "Village Hall isn't approved yet…" · Approve / Cancel |
| `04-start-dialog` | "Start this event?" · Harnessville Sports Club · "Today · 17:00–20:00 · 6 orders so far" |
| `05-switch-dialog` | "Switch to Market Square?" · Switch / Cancel |
| `06-add-order-event-line` | Phone: "📍 Harnessville Sports Club · 17:00–20:00" at the top. Laptop: the card as before |
| `07-offline-banner-waiting-for-approval` | The native banner for an order waiting on approval |

**Not captured:** the dashboard's dark event bar with "Approve an event to take orders". It is part of the whole dashboard page, which needs a signed-in session or the live data (Q4).

---

## Not done yet, and why
1. **Running the migration** [supabase/migrations/20261117_truck_events_overlap_dismissed.sql](../supabase/migrations/20261117_truck_events_overlap_dismissed.sql), one nullable column:
   ```sql
   alter table public.truck_events add column if not exists overlap_dismissed_at timestamptz;
   comment on column public.truck_events.overlap_dismissed_at is 'events-overlap-2: when staff chose to keep the overlapping approved event instead of approving this one. Null = never asked or never dismissed.';
   ```
   - `scripts/db-migrate.cjs` runs only a file that is **committed and identical to HEAD**, and you said not to commit (Q1).
   - ⚠️ **Until it runs, "Keep" fails** with a column error toast, and the overlap question keeps coming back. Everything else works without it.
2. **Step 7's live checks on the test truck** (Q2, Q4).
3. **The customer submit gaps** (Q3).

## Decisions I made (say if you want any changed)
1. **KDS default selection is unchanged.** Step 1 names the dashboard page. The KDS takes no orders, but its picker still lists unconfirmed events, unmarked.
2. **"Next by time" can be tomorrow, except** when today's only events are unapproved. Then nothing is selected, as step 1's last bullet says. I read that bullet as overriding "next" for that case.
3. **The order count leaves out `cancelled` only, as asked.** `rejected` orders still count.
4. **Approve from the dashboard uses the truck's Settings auto-open/close defaults**, the same as Manage's add-event.
5. **Who can approve:** anyone with the dashboard, staff included. Manage's Schedule tab is owner/manager only, but `/api/events/action` has always accepted the dashboard token alone.

## Risks
- **"Approve anyway" makes two approved events at the same time**, and customers then see both (`/api/events`). The overlap question says it's probably a duplicate, but doesn't repeat "customers will see it".
- **A walk-up on a finished event is now refused** until Restart (Q5).
- **Order counts** add one paged read of `orders` to each event-list poll: the dashboard about every 60 s, the KDS likewise.

## Prompt check
- **Nothing arrived garbled.**
- **Contradictions (stopped, questions below):**
  1. "Don't commit" against your standing migration rule (`db-migrate.cjs` refuses an uncommitted file).
  2. "Delete all test events and orders" against your rule to ask before deleting rows in `orders` (it needs `--approved-by-dominic`, also on a committed file).
  3. Step 6's `/api/orders/submit` change against "no changes to … customer endpoints".
- **Not a contradiction, but it blocks step 7:** the dashboard page needs a signed-in session for any non-demo truck, and I have none for Pizza Kitchen. Demo trucks lock Start and approval, so they can't stand in.
- **"next-intl":** the repo authors words in `messages/*.json` (rendered with next-intl's ICU) and generates per-namespace files with split-messages. That is what I did.

## SQL (this workstream, all read-only, already run)
```sql
select id, name, operator_id is not null has_operator, plan, country, (dashboard_pin is not null) has_pin, created_at from trucks where id ilike '%test%' or id ilike 'demo-%' order by created_at desc limit 15;
```

## Questions
```
events-overlap-2 — decisions needed (the code is built and checked offline; nothing committed, deployed or written to the database)

Q1. The new column (truck_events.overlap_dismissed_at, nullable). scripts/db-migrate.cjs only runs a migration file that is committed. You said "don't commit".
  A) Commit ONLY supabase/migrations/20261117_truck_events_overlap_dismissed.sql (one commit, nothing else), then run it — recommended
  B) Don't run it yet; you run it when you commit everything
  (Until it runs, "Keep {other}" errors and the overlap question keeps coming back.)

Q2. Test data for step 7 on Pizza Kitchen (test-truck). I can't create events without Manage (sign-in), and deleting orders afterwards needs your approval flag.
  A) Two committed migration files: one INSERTs the test events/orders on test-truck only, one DELETEs exactly those ids afterwards, run with --approved-by-dominic — recommended
  B) Cleanup by the app's own soft delete only (events cancelled, orders cancelled — rows stay)
  C) Skip live data; keep the in-memory checks already done

Q3. Step 6 asks to change /api/orders/submit (a customer endpoint); the hard rules say no customer-endpoint changes.
  A) Change it: refuse when two events match by date (no silent pick), and attach only to a confirmed/open event — no screen or wording change — recommended
  B) Leave submit alone this round

Q4. The live dashboard click-through (default, list, dialogs once, second browser) needs a signed-in session for Pizza Kitchen, which I don't have.
  A) You run the click-through on localhost yourself after Q1/Q2; I run the API-level live checks (open/close errors, walk-up refusal, offline replay) — recommended
  B) Give me a way to sign in as a test-truck team member

Q5. Walk-ups on a FINISHED (closed) event: step 6 says refuse anything not confirmed/open, so a late customer after auto-close is now refused until Restart ("This event has finished. Restart it to take orders.").
  A) Keep it refused, as built
  B) Allow walk-ups on a closed event as before; refuse only unconfirmed/cancelled — recommended (offline replays are already allowed on closed)
```
