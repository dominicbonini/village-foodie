# Midnight follow-ups: finish time past midnight, truck-clock "today" in two public feeds, and overnight imports shown before approval

17 October 2026. Source: docs/midnight-and-format-fixes-report.md ("Decisions recorded" 1, 6, 7 and 9). This builds on that uncommitted work. Nothing is committed, pushed or deployed, and no stored data was changed.

## Summary

| Decision | Result |
|---|---|
| **1 · End = start** | Stays refused; no change. Recorded as decided. |
| **2 · Finish time past midnight** | The Change finish time modal (dashboard and KDS) offers the editor's end times on every event: every 15-minute time except the start. Times earlier than the start are the next day's and say so: "00:30 (next day)", US "12:30 AM (next day)". Choosing one turns the event into an overnight event: ordering, slots, capacity, Manage and the auto-close job all follow the existing rule. Option values stay "HH:MM", in the truck's format and zone. A same-day choice behaves exactly as before. |
| **3 · "Today" in two public feeds** | `/api/discovery/events` (operator leg) and `/api/embed/events` decide every event on its own truck's date and clock (was the UTC date). GB at 00:30 BST no longer lists yesterday's events, and the US keeps today's events after 20:00 EDT. Village Foodie's scraped leg **already** used Europe/London, since the midnight work. |
| **4 · Overnight imports, before approval** | "Ends the next day" now shows beside the times on the **Needs your approval** and **Needs confirmation** cards, as the card's own amber warning pill. The **Import review** shows it in that review's amber warning colour, under each overnight row's date and time. **No automatic path confirms or opens an imported event**, so no change was needed there. **0** pending events would show the hint today. |
| **Proof** | `scripts/midnight-events.cjs`: **372 checks over 1,363 views, 0 failed**. Full sweep **131 run · 131 passed · 0 failed**. `tsc` clean. `next build` compiled and generated every page. No eslint rule count grew in the 4 touched product files. |
| **Edge function** | `supabase/functions/auto-event-scheduler` did **not** change again. An event extended past midnight is an ordinary overnight event to it. The previous work's deploy note still applies. |

## Garbled spans and contradictions

- **No garbled spans, and no contradictions.**
- **One reading recorded.** "Offer the same end times the event editor offers (every time except the start)" is applied as the editor's *rule*, within the modal's own 15-minute steps and its existing "still ahead of now" filter. The modal never offered the editor's 5-minute steps; changing that would alter every same-day option, which the brief requires to stay byte-identical.

## Decision 2 · Finish time past midnight

**Code (`components/shared/EventFinishTimeModal.tsx`):**
- **`finishTimeOptions`:** for any event with a start, and with the truck's zone:
  - every 15-minute boundary **except the start**;
  - a boundary after the start is on the event's date — exactly the list a normal event always had;
  - a boundary **earlier** than the start is on the next day (`lib/event-window.ts`, with the proposed finish as the end);
  - each is kept while it is still ahead of now, and the list is sorted on the event timeline, so same-day times come first, then the next day's.

  An event with no start keeps the old list.
- **`isNextDayFinish(start, finish)`:** a new export, the rule's `crossesMidnight`.
- **Labels:** every time the modal writes that falls on the next day carries **"(next day)"**: the options, "currently set to finish at …", "This event will finish at … instead of …", the due-after line and "Keep …". The new message is `kitchenModals.finish.optionNextDay` = "{time} (next day)"; there is no US difference. The US example reads "12:30 AM (next day)".
- **"Earlier than the current finish" warning and "orders due after" count:** these use the event timeline only when the current or the chosen finish runs past midnight. A same-day choice on a normal event uses exactly the old string compare.
- **Write path:** unchanged. The dashboard writes directly and the KDS through its offline queue, both to `/api/events/action` `update`. That route already validates the pair: end earlier than start is allowed, end = start refused (`event_times_same`).

**What changes for a normal event:**
- **Before it starts:** the start itself is no longer offered (it would make end = start). A time earlier than the start is offered as the next day's rather than as a same-day time before the event.
- **During it:** the same-day list is unchanged, and the next day's times are appended. For an 18:00–23:30 event at 23:00 the list reads 23:15, 23:30, 23:45, then 00:00 (next day) … 17:45 (next day).
- **Overnight events:** they no longer offer their own start, and their next-day times are now labelled.

**Proved:**
- **The modal:** on a normal 18:00–23:30 event at 23:00, GB and US, the real modal and the real update route show:
  - the options above;
  - "00:30 (next day)" in the picker, with same-day times unlabelled;
  - the confirm sentence "This event will finish at 00:30 (next day) instead of …";
  - a **same-day** choice (23:15) confirmed with no "next day" anywhere;
  - the update route returning 200 and saving `00:30`.
- **The resulting 18:00–00:30 event,** run through the real surfaces at 19:00, 23:50, 00:15, 00:31 and the next afternoon:
  - the order page stays **open at 23:50 and 00:15** and is **closed at 00:31**;
  - a 00:15 order reads **"in 25m"** at 23:50, not late;
  - Manage keeps it **under Upcoming until 00:30** the next day, then Past.
- **Normal-event views:**
  - the finish lists equal BEFORE plus exactly this named change, rebuilt in the harness from the rule and the fixtures' own clock, not from the product;
  - their "orders due after" counts are BEFORE's;
  - the GB picker's text equals BEFORE with only the option list rebuilt;
  - every other normal view is byte-identical.

## Decision 3 · "Today" on the truck's clock

**`/api/discovery/events`, operator leg:**
- Every row is kept by `isUpcomingOrRunning` on **its truck's** today and clock: dated on or after the truck's own date, or an overnight event from its yesterday still running.
- A truck whose zone can't be read keeps the UTC date it had.
- The read floor stays two days before the UTC date, which covers every zone's yesterday, and the 200 limit still comes after the filter.

**`/api/embed/events`:** the same rule on the truck's own settings, with the same UTC fallback.

**Village Foodie's scraped leg:** it already used Europe/London (`DISCOVERY_TIME_SETTINGS`, the GB country row), since the midnight work. Before that it was the UTC date.

**Named changes, proved:**

| | BEFORE (UTC date) | Now (the truck's date) |
|---|---|---|
| GB, 00:30 BST the next day (feed and embed) | listed yesterday's normal event (UTC was still 30 September) | **not listed** |
| US, 21:00 EDT (feed and embed) | dropped today's normal event (UTC was already 1 October) | **listed** |
| US, 22:40 and 22:50 EDT (existing normal views) | empty | today's event, which equals the midday list (named transform) |
| Every daytime view, GB and US | — | **byte-identical** |

## Decision 4 · Overnight imports shown before approval

**Cards** (`app/manage/[token]/page.tsx`, the shared Schedule card):
- While an event waits for a person (status `unconfirmed`: **Needs your approval** for scraped and emailed events, **Needs confirmation** for operator-added ones) and its end is earlier than its start, an amber **"Ends the next day"** pill sits beside its times.
- The pill is the card's own warning style, the one its "Time needed" pill uses.
- The message reused is `manageScheduleEvent.endsNextDay`.
- A confirmed event, or a normal waiting one, shows nothing new.

**Import review:**
- An overnight row's "Ends the next day" now sits **under its date-and-time summary** in the review's amber warning colour (`text-amber-600`), so it's visible without opening the card.
- The hints the midnight work added (under the End time, cards and table) moved from grey helper text to that same warning colour. They only ever show on overnight rows.

**No automatic path confirms or opens an imported event.** Checked in code:
- `/api/inbound-schedule` (the email and scraper bridge) writes every event as `unconfirmed`.
- Manage › Import saves through `upsert_event` only when a person presses save in the review.
- `/api/events/action` `confirm` and the dashboard's manual event are a person's action.
- The `auto-event-scheduler` edge function opens only events already `confirmed`.

**Proved** (GB and US):
- **Normal times:** the Schedule tab with normal "Needs your approval" and "Needs confirmation" cards is byte-identical to BEFORE, the whole tab's markup.
- **Overnight times:** the same two cards each show the hint, and a confirmed overnight card doesn't.
- **WebKit, compiled CSS:** at **390, 800 and 1280** both hints are visible and inside the page, with no sideways scroll.
- **Import review:** the existing measurements still pass. Every value is visible, there is no sideways scroll at 390–1280, and the overnight row shows the hint.

**Read-only:**
```sql
select e.truck_id, count(*) as pending_overnight
from public.truck_events e
where e.status = 'unconfirmed'
  and e.start_time is not null and e.end_time is not null and e.end_time < e.start_time
  and e.event_date >= current_date - 1
group by 1 order by 1;
-- → 0 rows: no pending event on any truck (Pizzeria Gusto included) would show the hint today
```

## Proof

### `scripts/midnight-events.cjs`: 372 passed, 0 failed (1,363 views)

**The runner gained `named(id, before, B)`.**
- A normal view must equal BEFORE with exactly an area's named transform applied, computed from the rule. A normal view with no named change must be BEFORE itself.
- BEFORE is still commit `692adb4`, recaptured for the four changed areas twice and byte-identical.

**New in each area:**
- **dashboard:**
  - the modal on a normal 18:00–23:30 event (options, picker, confirm 00:30, confirm same-day);
  - the update route saving 00:30;
  - an **extended** scenario (the 18:00–00:30 event that produces) at the five moments;
  - the named finish-option transform;
  - the overnight checks re-pinned for "the start is no longer offered" and "(next day)" labels.
- **customer:** the extended scenario; the order page open to 00:30 and closed at 00:31.
- **manage:** the extended scenario (Upcoming until 00:30); the waiting cards' hints (static and WebKit at 390 / 800 / 1280); the normal waiting cards byte-identical.
- **public:** GB at 00:30 BST and US at 21:00 EDT on the feed and embed; the named transform for the US 22:40 and 22:50 views.

### The rest

| Check | Result |
|---|---|
| Full sweep `node scripts/run-harnesses.cjs` | **131 run · 131 passed · 0 failed** |
| `npx tsc --noEmit -p .` | clean |
| `next build` | compiled successfully, 105/105 pages generated |
| eslint on the 4 touched product files vs HEAD | no rule count grew |

**No other harness needed re-pinning in this round.** The Phase 1b/2 KDS finish-time fixture doesn't exercise the new option rule; the rule is proved directly above.

## Decisions recorded

1. **End = start stays refused** (Dominic's decision).
2. **The modal keeps its 15-minute steps and "ahead of now" filter;** only the editor's rule (every time except the start, earlier is the next day) was adopted.
3. **"(next day)" goes on every time the modal writes on the next day,** not only the options, so the confirm step can't be misread.
4. **The feeds' UTC fallback is kept** for a truck whose zone can't be read. Every other row follows its truck's clock.
5. **Import review hints use the review's own warning colour** (`text-amber-600`), and the Schedule cards use their own amber pill. Each card's existing warning style, as asked.

## Edge function

`supabase/functions/auto-event-scheduler/index.ts` **did not change in this round**; it was last changed on 16 October by the midnight work. An event extended to 00:30 in the modal is an ordinary overnight event to it: it isn't closed on its own date, and it is closed at 00:30 the next day when auto-close is on. **The deploy note from the midnight work still applies:** `supabase functions deploy auto-event-scheduler`.

## Localhost check

`docs/midnight-and-format-fixes-report.md` "Localhost check" now has two more rows. In short, on `http://hatchgrab.localhost:3000` with Pizza Kitchen:

| Where | What to check |
|---|---|
| **Dashboard or KDS › Change finish time,** on a normal event (e.g. 18:00–23:30) | After the same-day times the list continues **00:00 (next day)** … up to the time before the start, and the start isn't offered. Choose **00:30 (next day)**: the confirm reads "This event will finish at 00:30 (next day) instead of 23:30". Afterwards the order page stays open until 00:30, a 00:15 order reads "in 25m" at 23:50, and Manage keeps the event under Upcoming. A same-day choice reads exactly as before. |
| **Manage › Schedule, waiting cards** | An **unconfirmed** event whose end is earlier than its start shows an amber **Ends the next day** pill beside its times, under **Needs your approval** or **Needs confirmation**. A normal waiting card looks exactly as before. |
| **Manage › Schedule › Import review** | An overnight row shows **Ends the next day** in amber under its date and time. |

## Files

- **Product:**
  - `components/shared/EventFinishTimeModal.tsx`;
  - `app/api/discovery/events/route.ts`, `app/api/embed/events/route.ts`;
  - `app/manage/[token]/page.tsx`;
  - `messages/en-GB.json` (`kitchenModals.finish.optionNextDay`) and the regenerated catalogue.
- **Proof:** `scripts/midnight-events.cjs` (the `named` hook), `scripts/_midnight-{fixtures,customer,dashboard,manage,public}.cjs`, `scripts/fixtures/midnight-events-before/` (customer, dashboard, manage and public recaptured).
- **Report:** `docs/midnight-and-format-fixes-report.md` ("Localhost check" rows added).
