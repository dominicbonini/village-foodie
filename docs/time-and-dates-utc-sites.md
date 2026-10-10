# Phase 2B — the UTC "today / now" sites that would change UK output

**10 October 2026 · stop point you asked for: BEFORE snapshot taken, no product code written.**

## Where things stand

- **BEFORE snapshot taken** on the unchanged code: `scripts/fixtures/time-dates-before.json`, written by the new `scripts/time-dates-parity.cjs`.
  - Four frozen instants:
    - Fri 9 Oct 15:20 BST
    - Fri 13 Nov 15:20 GMT
    - Fri 9 Oct 23:30 BST
    - Sat 10 Oct 00:30 BST
  - Each surface is rendered where it really runs: a UK browser (`TZ=Europe/London`, en-GB) or a Vercel function (`TZ=UTC`).
  - What it holds:
    - the real `/api/slots` and `/api/events` routes;
    - the slot engine; auto-accept with pre-order deadlines; place-in-slot;
    - both Edge Functions, run against fixture rows (their writes are their decisions);
    - the WhatsApp and schedule-import prompts; the emails;
    - the screens: order cards, KDS, dashboard, Add Order, the order page with its slot picker and confirmations, the receipt, Reports and both CSVs, Manage › Schedule;
    - tickets; the weekly post's week and caption dates.
  - It runs twice to identical bytes.
- **No product code has been changed.** The only new or changed files are `scripts/_render-kit.cjs`, `scripts/time-dates-parity.cjs`, the fixture and this note.

## The finding, in one paragraph

Every UK decision and string is identical in GMT. In BST it is identical at all hours except **00:00–01:00**, when the UTC date is still yesterday. The exception is one server "now" (§B), which is an hour behind London **all through BST**. Every site below is wrong today in those windows. Item 2 fixes them, which changes what a UK user sees in exactly those windows.

The device-local clock sites (`getHours()`, `setHours`, `new Date(y, m, d)` in the browser) do **not** change for a UK device. Neither do the server sites that already hard-code Europe/London: they move to the truck's zone, which for every GB truck is Europe/London.

---

## A · Server, "today" from the UTC date — changes UK output 00:00–01:00 BST only

| # | Site | What it decides or shows | At 00:30 BST today (from the snapshot where captured) | After the fix |
|---|---|---|---|---|
| A1 | `app/api/events/route.ts:42` (filter) and `formatFriendly` (server clock = UTC) | The order page's event list and its **"Today · …" / "Tomorrow · …"** labels | **Today's event (Sat 10 Oct) reads "Tomorrow · Saturday 10th October"**; tomorrow's (Sun 11) has no "Tomorrow" | "Today · Saturday 10th October", "Tomorrow · Sunday 11th October" |
| A2 | `lib/whatsapp-classifier.ts:380–389` | The WhatsApp reply's **DATE REFERENCE** for the AI ("Today = …", "Tomorrow = …"), plus `formatEventForPrompt`'s (TODAY)/(TOMORROW) tags | **"Today = 2026-10-09 (9 October)"** on Saturday the 10th, so the AI can tell a customer that today's event is tomorrow | "Today = 2026-10-10 (10 October)" |
| A3 | `lib/schedule-extract.ts:26–35` (server clock, no `timeZone`) | The schedule-import prompt: "Today is …" and its 14-day table | **"Today is Friday, 9 October 2026"**, with the table starting Friday | "Today is Saturday, 10 October 2026", table starting Saturday |
| A4 | `app/api/slots/[truckId]/route.ts:78` and `normalizeEventDate` `:31` | The **default date** of a slots request that names none | Returns **yesterday's** event's slots (the snapshot's `noDate`: 17:00…21:30 from Friday) | Today's event. ⚠️ The order page always sends a date (C3), so this affects only callers that send none |
| A5 | `app/api/menu/[truckId]/route.ts:181` | Which **open event** the customer menu uses when no event is named | Looks for an open event dated **yesterday** | Today |
| A6 | `app/api/orders/submit/route.ts:333, 515, 686` | Fallback event date (no event on the order) for the pause check, event pricing and the order's own date | **Yesterday** | Today |
| A7 | `lib/payments/promote-draft.ts:160` | The same fallback when a card order is promoted | Yesterday | Today |
| A8 | `app/api/dashboard/route.ts:86` | The dashboard API's default `date` when the client sends none | Yesterday | Today |
| A9 | `app/api/dashboard/action/route.ts:1232` (update_event), `:1378` (walk-up order), `:2834` (get_events) | Fallback dates for those three actions | Yesterday | Today |
| A10 | `app/api/manage/route.ts:324` | Manage's upcoming-events read (`event_date >= today`) | **Includes yesterday's events** | From today |
| A11 | `app/api/manage/route.ts:2993` | The WhatsApp stats default day in Reports | Yesterday | Today |
| A12 | `app/api/manage/route.ts:3118` | "Recent events" = the last 30 days | Window starts a day early | Truck's 30 days |
| A13 | `app/api/events/manage/route.ts:34` | `?upcoming=true` event lists (dashboard and KDS pickers) | Includes yesterday's events | From today |
| A14 | `app/api/webhooks/whatsapp/route.ts:66`, `app/api/webhooks/meta/whatsapp/route.ts:743`, `lib/whatsapp/upcoming-events.ts:74` | Which events a WhatsApp reply may mention | Includes **yesterday's** events | From today |
| A15 | `app/api/inbound-schedule/route.ts:266` | Scraped events awaiting confirmation (`>= today`) | Includes yesterday's | From today |
| A16 | `app/api/account/request-deletion/route.ts:99` | "Upcoming orders" counted before an account is deleted | Counts yesterday's event's orders as upcoming | Truck's today. (`:227` `dueLabel` is the due date written into an admin email; it stays UTC — see the cron item) |

## B · Server, "now" from the UTC clock — changes UK output during ALL of BST

| # | Site | What it decides | Today in BST | After the fix |
|---|---|---|---|---|
| B1 | `app/api/dashboard/route.ts:698` `new Date().getHours()` | The dashboard's earliest slot for an event **with no start time** (with a start time, the start wins and this is unused) | An hour **behind** London (15:20 BST is read as 14:20) | London's 15:20 |

> ⚠️ **Corrected afterwards** (docs/time-and-dates-report.md §2): this line also decides which of the dashboard's slots are marked **past** (`is_past`), during all of BST. The "no start time" path can never show anything, because slots exist only when the event has both times. The site and its window (all of BST) are the same; only my description of what it feeds was short.

## C · Browser, "today" from the UTC date — on a UK device, changes 00:00–01:00 BST only

| # | Site | What it does | At 00:30 BST today | After |
|---|---|---|---|---|
| C1 | `app/manage/[token]/page.tsx:15024` `isoDate()` | **Reports' default range** (last 7 days to yesterday) | From **2026-10-02** to **2026-10-08**, both a day early (snapshot) | 2026-10-03 → 2026-10-09 |
| C2 | `components/dashboard/AddOrderPanel.tsx:2520–2521, 2562, 2570` | Add Order's Today/Tomorrow labels and its "future event" / "not open yet" banners | Compared with Friday, so **today's event counts as a future event** | Truck's today |
| C3 | `app/trucks/[slug]/order/page.tsx:808` | The order page's event date when the event has no `date_iso` | Yesterday | Truck's today |
| C4 | `app/manage/[token]/page.tsx:7737, 8212, 8927` | The schedule importer's "today", which places dates without a year and flags past ones | Yesterday | Truck's today |
| C5 | `app/dashboard/[token]/page.tsx:203` | Which cached day's data the dashboard evicts | Keeps yesterday's cache an hour longer | Truck's today. (Technical; listed for completeness) |

## D · Not truck dates — staying as they are (they will be listed in the final report)

- **Discovery and admin**, which are multi-truck and the marketing country: `app/api/discovery/events:73`, `app/api/embed/events:77`, `app/api/admin/discovery-events:72, 218`, `app/api/admin/outreach:67`, `app/page.tsx`, and the admin screens.
- **Technical stamps:**
  - `plans-pdf` "Generated" date and the PDF file names;
  - `lib/whatsapp/maintenance.ts` `utcDayKey` (a once-a-day job key);
  - `schedule-graphics/places.ts` date-only arithmetic, which is pure UTC on purpose;
  - `outreach*`.

## What I need from you

For each group, either **fix** it (UK output changes in that window, enumerated and proved) or **keep** it (UK identical; a US truck keeps the wrong "today" there). My recommendation:
- **Fix A, B and C.** Each is wrong for UK users today in its window. A1 and A2 put a wrong "today" in front of customers, and C1 starts Reports' default range a day early.
- **Leave D** as listed.

**If you say fix,** the harness compares GB byte for byte at all four instants. Each change above becomes a named, proved difference that appears only at 00:30 BST (plus B1, whose snapshot fixture sets a start time, so its BST-hours difference needs one extra no-start-time fixture). Anything else that moves fails the run.
