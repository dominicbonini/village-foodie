# whatsapp-approved-only-1 — WhatsApp replies only mention approved events

17 November 2026. Not committed, pushed or deployed. No WhatsApp message sent. No `.env` file opened. Pizzeria Gusto's and Le Roi du Churrasco's settings and data were not touched (the one SQL read was a count across all trucks and returned counts only). No landing-page changes.

## Prompt check

- **Garbled spans:** none found.
- **Contradictions:** none that needed a stop. One point worth stating: "Remove the [UNCONFIRMED] handling" and "No wording changes" could pull against each other if removing the handling also meant removing the `[CONFIRMED]` tag from each prompt line. I removed only the `UNCONFIRMED` branch and kept the `[CONFIRMED]` tag, so every line the model sees reads exactly as before. The prompt header `Upcoming confirmed events:` and all customer-facing copy are unchanged.

## What changed

| File | Change |
|---|---|
| `lib/whatsapp/upcoming-events.ts` | `UPCOMING_EVENT_STATUSES` is now `['confirmed', 'open']` (it was `['confirmed', 'open', 'unconfirmed']`). This is the same rule as `/api/events` (`app/api/events/route.ts:95`). The comment saying unconfirmed rows were included on purpose is replaced by one recording the new rule and why. |
| `lib/whatsapp-classifier.ts` | `formatEventForPrompt`: the `confirmed ? 'CONFIRMED' : 'UNCONFIRMED'` ternary is replaced by the literal `[CONFIRMED]`. For a confirmed or open event the output is byte-for-byte the same. |
| `scripts/whatsapp-approved-only-1.cjs` | **New** in-memory test (see below). |

Because the filter is applied in the query, before the limit of 10, an unconfirmed row can no longer take a place in the window. Before this change, a truck with many scraped duplicates could have pushed its real events out of the prompt.

### Was anything else using the [UNCONFIRMED] handling?

No. `formatEventForPrompt` is only called from `generateWhatsAppReply`, and the `events` it receives in app code come only from `fetchUpcomingTruckEvents`. A grep for `UNCONFIRMED`, `UPCOMING_EVENT_STATUSES` and `fetchUpcomingTruckEvents` across `app/`, `lib/`, `components/` and `scripts/` found no other reader of the label or the status list. (The other `UNCONFIRMED` matches are unrelated comments: order page, dashboard action, BuzzerGrid, and test fixtures.) Some older test scripts (for example `scripts/language-phase-1a.cjs`) pass hand-built events straight to `generateWhatsAppReply`. None of them asserts on the `[UNCONFIRMED]` tag.

## Every caller of `fetchUpcomingTruckEvents`

| Caller | Call | Effect |
|---|---|---|
| `app/api/webhooks/meta/whatsapp/route.ts:763` (live Meta webhook) | `fetchUpcomingTruckEvents(supabase, truck.id, truckTime.timeZone)` | Replies now ground only on confirmed and open events. `events_found` drops by the number of unconfirmed rows that used to be counted. |
| `app/api/webhooks/whatsapp/route.ts:77` (dormant Twilio webhook) | same | Same as above. |
| `app/api/manage/whatsapp-preview/route.ts:163` (operator preview) | same | The preview still matches the live path, because both read the same function. |

None of the three holds its own `truck_events` query, and none reads `status` to make a decision. They pass the rows straight to `generateWhatsAppReply`, so nothing else changes for them. The test checks this for all three files.

## Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | exit 0, 0 errors |
| `node scripts/whatsapp-approved-only-1.cjs` (new, in-memory, `_fake-pg.cjs`) | **17 passed, 0 failed** |
| The same test against HEAD's two lib files (swapped in temporarily, then restored, diff confirmed) | **12 passed, 5 failed**, as expected: status list, duplicate left out, date order, limit, classifier branch |
| `node scripts/private-events.cjs` | all 204 passed |
| `node scripts/midnight-events.cjs --areas=public` (also calls `fetchUpcomingTruckEvents`) | 57 passed, 0 failed |

What the new test covers, all built from in-memory rows for fixture truck `test-truck` (Europe/London, clock pinned to 10 Nov 2026 12:00):

- **The 13 November case:** a confirmed event and an unconfirmed scraped duplicate on the same day. The duplicate is left out and the confirmed event appears.
- An **open** (live) event still appears. A cancelled event and another truck's event are still left out, and the date order is unchanged.
- **Limit:** 10 earlier unconfirmed rows plus 3 later confirmed rows returns exactly the 3 confirmed rows. 12 approved rows still returns 10.
- A **private** approved event is still redacted (venue replaced, no town or postcode), not dropped.
- **Prompt line:** confirmed and open produce identical lines ending `[CONFIRMED]`, for example `- Friday 13 November: Market Square, Springfield, CB1 1AA 17:00–21:00 [CONFIRMED]`, and the classifier no longer has an `'UNCONFIRMED'` literal.
- All three callers go through `fetchUpcomingTruckEvents` and have no inline query of their own.

## Read-only count (live database, 17 Nov 2026)

Run inside `begin read only; … commit;`. All trucks, counts only, using `event_date >= current_date`. That is the UTC date, a close stand-in for each truck's local "today".

| Measure | Count |
|---|---|
| Future unconfirmed events (all trucks) | **4** |
| Trucks that have them | **1** |
| Of those, inside that truck's 10-event WhatsApp window, so they would have been quoted | **4** |
| Approved events pushed out of a window (upper bound) | **0** |

The 13 November Pizzeria Gusto duplicate named in the brief is now in the past, so it is not in this count. I did not look up which truck the 4 rows belong to.

## Not done / notes

- `docs/events-create-1-report.md` still says WhatsApp quotes unconfirmed events. That is a past report and I left it as it was.
- Two older comments still describe the old behaviour. One is the 20261014 note in `upcoming-events.ts` saying "the status list and the limit are unchanged", which records what that change did. The other is in `docs/reference-manual.md`. I left both alone.
- An unconfirmed event that an operator later approves becomes quotable on the next inbound message. No caching is involved.

## Undo (only if Dominic asks)

Nothing here is a database change. To revert: `git checkout -- lib/whatsapp/upcoming-events.ts lib/whatsapp-classifier.ts` and delete `scripts/whatsapp-approved-only-1.cjs`.
