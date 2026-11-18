# events-overlap-4: event picker wording and emphasis

**17 Nov 2026. Done. Dashboard only: the Select event list and the approve question.** All checks pass. Screenshots are in [docs/events-overlap-4/](events-overlap-4/). No data was created, changed or deleted; three read-only queries are listed at the end. Nothing was committed, pushed or deployed.

## 1. Sections

[components/shared/EventPickerPanel.tsx](../components/shared/EventPickerPanel.tsx):
- **"APPROVED EVENTS"** heading above the first section (started, approved and finished events). It uses the same style as the old section label: small, bold, slate, uppercase, wide tracking.
- **"⚠ Needs approval (n)"** is an amber band: light amber background (`bg-amber-50`), amber border (`border-amber-300`), dark amber text (`text-amber-900`). The second line underneath reads **"Customers can't see these yet."**
- **Unapproved cards** have a **4px amber left border** (`border-l-4 border-l-amber-400`).
- The headings appear only where the list is split, which is the dashboard's Add order picker. The KDS passes none of these props, so its picker is unchanged.

## 2. Order counts
- **1 or more orders:** a solid orange pill (`bg-orange-600`, the brand orange of the Start and Keep buttons) with white bold text, "3 orders" / "1 order".
- **No orders:** a light grey pill (`bg-slate-100`) with grey text.
- The list shows the count in only one place per row, and every row follows this rule.

## 3. Duplicate wording
- **In the list:** the "possible duplicate" tag is gone. Under the pill there is a line: **"Possible duplicate of {other}, already approved"**.
  - {other} is the approved or started event it overlaps with the most orders: `overlapTarget(approvedOverlaps(…), counts)`, the same choice the approve question makes.
  - Built in [AddOrderPanel.tsx](../components/dashboard/AddOrderPanel.tsx); the picker gets `duplicateOf`.
- **The first tap on an undismissed duplicate** ([components/shared/EventGateDialogs.tsx](../components/shared/EventGateDialogs.tsx)):
  - "Approve {event}?" / **"{event} is a possible duplicate of {other} ({start}–{end}), which is already approved and has {n} orders."**
  - With 0 orders it ends at "which is already approved." With 1 order it says "has 1 order".
  - The buttons are unchanged: **Keep {other}** (main) / **Approve {event} anyway**.
- **After "Keep"** (`overlap_dismissed_at` set): "Approve {event}?" / **"{event} is a possible duplicate of {other}, which is already approved. Approve it to take orders? Customers will see it too."** with **Approve** / **Cancel**.
  - The dashboard page now works out {other} whether or not the event was dismissed, and passes `dismissed`.
  - [app/(app)/dashboard/[token]/page.tsx](../app/(app)/dashboard/[token]/page.tsx), `approveOverlap` / `dismissed=`.
- **No overlap:** the question is unchanged.

## 4. Languages: all 49 files, then split-messages
Each file was re-read right before writing. Only these keys were added, replaced or removed. The other session's three fil-PH commits since `cf8ff324` touched none of these files.

| Key | Change | en-GB |
|---|---|---|
| kitchenModals.eventGate.overlapText | replaced | {event} is a possible duplicate of {other} ({start}–{end}), which is already approved[ and has {n} orders]. |
| kitchenModals.eventGate.dismissedText | new | {event} is a possible duplicate of {other}, which is already approved. Approve it to take orders? Customers will see it too. |
| kitchenModals.picker.needsApproval | replaced | Needs approval ({count}) (the ⚠ is in the markup, hidden from screen readers) |
| kitchenModals.picker.approvedEvents | new | Approved events |
| kitchenModals.picker.needsApprovalNote | new | Customers can't see these yet. |
| kitchenModals.picker.possibleDuplicateOf | new | Possible duplicate of {other}, already approved |
| addOrder.possibleDuplicate | **removed** from all 49 | (was "possible duplicate") |

- **Unchanged:** `picker.orders` ("No orders" / "1 order" / "{n} orders") and `eventGate.plainText`, which is still used when nothing overlaps.
- **Plurals and checks:** the "and has {n} orders" part keeps each language's own plural forms from events-overlap-2. The new keys are registered in `scripts/_messages-parity-1e.cjs`; the removed one is unregistered.
- **Kept as is:** `errorsKitchen.event_not_open` still has its "finished" branch, which Q5 left unused. I didn't remove it, because the key itself is still in use (for cancelled events).
- **Memory updated:** the 11 incoming languages from the languages job need the revised list (24 keys, `addOrder.possibleDuplicate` not among them).

## 5. Checks (all pass)

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| Rule checks | 24/24 |
| Route checks (incl. the Q3 submit cases) | 46/46 |
| Offline queue | 7/7 |
| `split-messages --check` | in step (121 namespaces) |
| `messages-parity` | 1,230,253 passed, 0 failed |
| `translation-check`, 48 languages | Structural 0 in every one |
| Wording, rendered with next-intl | n = 0 → "…which is already approved." · n = 1 → "…and has 1 order." · "Needs approval (4)" · "No orders" |

- **ESLint on changed lines:** only the existing `set-state-in-effect` finding at AddOrderPanel ~1158 (not new; see events-overlap-2).
- **The live-data checks did not need re-running:** this round changed no server code.

## Screenshots: [docs/events-overlap-4/](events-overlap-4/), 12 files

Each name exists at `phone390` and `laptop1280`, in en-GB and fr-FR.

**Data:** test-truck's existing test data, **read (not changed)** at about 12:15 London.
- Harnessville Sports Club is now **started** (you started it at 11:49) with 3 orders not cancelled.
- **HSC was dismissed at 11:48 ("Keep")**.
- **Harnessville SC (D) is still undismissed and unapproved.**
- I didn't approve or dismiss anything.

**How they were made.** These are the real components rendered with that data, not a signed-in browser (I have no session for Pizza Kitchen):
- **The list:** the real Add-order panel with its picker open, so the duplicate names come from the panel's own code.
- **The questions:** the real `ApproveEventDialog`, fed the same `overlapTarget(approvedOverlaps(…))` the dashboard page computes.

| File stem | Shows |
|---|---|
| `01-event-list` | **APPROVED EVENTS**: Harnessville Sports Club (Live, **3 orders** orange, selected) · Market Square (**No orders** grey) · EO2 check Live (**5 orders**) · EO2 check Other (Finished, **3 orders**) · EO2 check Start (Finished, **1 order**). Then the amber band **⚠ Needs approval (4)** / "Customers can't see these yet." Then amber-edged cards: Harnessville SC and HSC ("Possible duplicate of Harnessville Sports Club, already approved"), EO2 check Dup ("…of EO2 check Live…"), EO2 check Lone (no line) |
| `02-first-overlap-question-D` | "Approve Harnessville SC?" / "Harnessville SC is a possible duplicate of Harnessville Sports Club (12:00–23:00), which is already approved and has 3 orders." · **Keep Harnessville Sports Club** / Approve Harnessville SC anyway |
| `03-question-after-keep-HSC` | "Approve HSC?" / "HSC is a possible duplicate of Harnessville Sports Club, which is already approved. Approve it to take orders? Customers will see it too." · **Approve** / Cancel |

The full list is captured on both widths. The phone picker scrolls as before; the image is made tall enough to show every row.

## Test data
**Unchanged by this round** (checked read-only afterwards): 10 events and 13 orders, all on test-truck, as listed in docs/events-overlap-3-report.md §2. The delete command and the `--rescan` step there still apply.

## Prompt check
- **Nothing arrived garbled, and no instruction contradicted another.**
- **"Screenshots on test-truck … using the existing test data":** taken as described above. The data is read live, and the screens are the real components. This is because the dashboard needs a sign-in I don't have, and this round said not to create or change data.

## SQL (this round, all read-only, via the Supabase MCP)
```sql
select e.id, e.venue_name, e.town, e.postcode, e.event_date, e.start_time, e.end_time, e.status, e.van_id, e.opened_at, e.overlap_dismissed_at, (select count(*) from orders o where o.event_id=e.id and o.status<>'cancelled') as orders from truck_events e where e.truck_id='test-truck' and e.status<>'cancelled' and e.event_date >= (now() at time zone 'Europe/London')::date - 1 order by e.event_date, e.start_time, e.venue_name;
select venue_name, status, overlap_dismissed_at, opened_at, (select count(*) from orders o where o.event_id=e.id) as orders_all from truck_events e where truck_id='test-truck' and notes='events-overlap-2 test data' order by event_date, venue_name;
```
(The first was run twice: once before building, once to feed the screenshots.)

## Files changed this round (all uncommitted)
- `components/shared/EventPickerPanel.tsx`, `components/shared/EventGateDialogs.tsx`, `components/dashboard/AddOrderPanel.tsx`, `app/(app)/dashboard/[token]/page.tsx`.
- 49 `messages/*.json` files plus the generated `messages/ns/**` and `lib/i18n/catalog/**`.
- `scripts/_messages-parity-1e.cjs`.
- This report and the screenshots.
