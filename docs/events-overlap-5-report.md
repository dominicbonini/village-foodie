# events-overlap-5: the Select event list grouped by date, duplicates under their approved event

**17 Nov 2026. Done.** This changes the dashboard's Select event list only. The approve, Start and Switch questions are unchanged, and nothing customer-facing changed.
- All checks pass.
- Screenshots are in [docs/events-overlap-5/](events-overlap-5/).
- No data was created, changed or deleted. One read-only query was run; it is listed at the end.
- Nothing was committed, pushed or deployed.

## What the list looks like now
Code: [components/shared/EventPickerPanel.tsx](../components/shared/EventPickerPanel.tsx) (the new `groupByDate` view) and [lib/event-default.ts](../lib/event-default.ts) (`buildEventListGroups`, pure).

**Removed:**
- the "APPROVED EVENTS" heading;
- the "⚠ Needs approval (n)" band;
- the "Possible duplicate of {other}, already approved" line;
- their keys, from all 49 language files (§5).

**1. Summary at the top**, only when something in the list is unconfirmed:
- one amber box, in the same style as before;
- **"⚠ {n} events need approval"** / **"Customers can't see them yet."**
- real plurals: "1 event needs approval" / "Customers can't see it yet." (French: "1 événement à approuver" / "…ne le voient pas…"; Polish few/many: "4 wydarzenia wymagają…", "5 wydarzeń wymaga…").

**2. Grouped by date.** Each date heading is in the section-label style:
- **"TODAY · TUE 17 NOV"**, **"TOMORROW · WED 18 NOV"**, then **"THU 19 NOV"**.
- It is localised (fr: "AUJOURD'HUI · MAR. 17 NOV.") and uses the truck's time zone.
- The relative word comes from the existing `eventDateLabel` and the date from `formatYmdShortMonth`, so no new keys were needed.
- Within a date, events are sorted by start time.
- Each card shows the **time range as the main line**, then the venue, then the order pill as before.

**3. Duplicates attached to their approved event:**
- **Anchors** are approved events: open, confirmed and closed.
- Each unconfirmed event that overlaps an anchor (the same `detectEventConflicts` test, through `approvedOverlaps`) is **not listed on its own**.
  - It is attached under the anchor it overlaps with the most orders (`overlapTarget`: most orders, then started, then earliest start).
  - The anchor card sits on top, then each duplicate as an indented sub-row: light amber background, dashed amber divider, 3 px amber line on the left.
  - Each sub-row has a small amber label, **"Possible duplicate · same time"** (same date, start and end) or **"Possible duplicate · overlaps"**.
  - Then the time range with a **solid amber "Needs approval" badge** in place of the status, then the venue.
  - An order pill appears only when the sub-row has 1 or more orders.
- **When the anchor is the selected event,** the whole joined block is outlined in orange and the anchor keeps "SELECTED".
- **Tapping a sub-row** calls the same select handler as before, which opens the same approve question.
- **An unconfirmed event that overlaps no anchor** is listed on its own in time order, with a 4 px amber left border, the "Needs approval" badge and the normal order pill. Two unapproved events that overlap only each other are both listed this way.
- **Approved events that overlap each other** sit side by side in time order, with no extra marking.

**The KDS picker** passes none of these props, so it is unchanged: a flat list with "date · time".

### One point to know: a duplicate under a finished event
The brief makes **closed** events anchors too, but `detectEventConflicts` compares only confirmed and open events. So the grouping runs that same test with a closed anchor presented as approved. A duplicate overlapping a finished event therefore sits under it, labelled as a possible duplicate.

The **approve question is unchanged**, as asked, and it still compares against confirmed and open events only. So tapping such a sub-row shows the plain "isn't approved yet" question, not the overlap one. None of the current test data hits this case. I didn't change the question because the brief keeps it as it is; say if you want it aligned.

## Code changes
- **`lib/event-default.ts`:**
  - `buildEventListGroups(events, counts)` returns `[{ date, items: [{ event, duplicates: [{ event, sameTime }] }] }]`.
  - The flat-list helpers `eventListGroup` and `orderEventList` were deleted; nothing uses them any more.
- **`EventPickerPanel.tsx`:**
  - The props `needsApproval` and `duplicateOf` are replaced by `groupByDate` (with `orderCount`).
  - The old flat row is kept for the KDS.
- **`AddOrderPanel.tsx`:** passes the dashboard's list unsorted with `groupByDate`; its duplicate-name map and the `asConflict` helper went.

## Languages (all 49 files, then split-messages)
Each file was re-read right before writing; only these keys were added, replaced or removed.

| Key | Change | en-GB |
|---|---|---|
| kitchenModals.picker.needsApproval | replaced | Needs approval (now the badge) |
| kitchenModals.picker.approvalSummary | new | {n, plural, one {{count} event needs approval} other {{count} events need approval}} |
| kitchenModals.picker.approvalSummaryNote | new | {n, plural, one {Customers can't see it yet.} other {Customers can't see them yet.}} |
| kitchenModals.picker.duplicateSameTime | new | Possible duplicate · same time |
| kitchenModals.picker.duplicateOverlaps | new | Possible duplicate · overlaps |
| kitchenModals.picker.approvedEvents | **removed** | — |
| kitchenModals.picker.needsApprovalNote | **removed** | — |
| kitchenModals.picker.possibleDuplicateOf | **removed** | — |

- **Plurals:** each language uses its own plural categories (Intl). The badge reuses each language's existing "Needs approval" words from events-overlap-2.
- **Register:** `scripts/_messages-parity-1e.cjs` lists the new keys and no longer lists the removed ones.
- **Memory:** updated with the 25 keys the incoming languages need, and the four removed ones they must not add.

## Checks (all pass)

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| Rule checks | **27/27** (3 new for the grouping) |
| Route checks | 46/46 |
| Offline queue | 7/7 |
| `split-messages --check` | in step (121 namespaces) |
| `messages-parity` | 1,230,455 passed, 0 failed |
| `translation-check`, 48 languages | Structural 0 in every one |

**The new grouping checks:**
- dates in order and each date by start time;
- the same-time and overlapping duplicates sit under their anchor, including under a finished one;
- two unapproved events that overlap only each other are both listed on their own;
- with two overlapping anchors, the duplicate goes under the one with more orders;
- overlapping approved events sit side by side.

**ESLint on changed lines:** only the existing `set-state-in-effect` finding at AddOrderPanel ~1151 (the same one as before; that line only moved).

## Screenshots: [docs/events-overlap-5/](events-overlap-5/), 20 files

Each name exists at `phone390` and `laptop1280`, in en-GB and fr-FR.

**Data:** test-truck's existing test data, **read, not changed**, at about 12:40 London.
- Harnessville Sports Club is **started** with 3 orders.
- **HSC was dismissed at 11:48.**
- **Harnessville SC is still unapproved, but "Keep" was chosen for it at 12:07.** It sits under Harnessville Sports Club, and tapping it now shows the after-Keep question.

The screens are the real components, rendered as in the last round, because the dashboard needs a sign-in I don't have.

| File stem | Shows |
|---|---|
| `01-event-list-top` | Summary "⚠ 4 events need approval / Customers can't see them yet." · **TODAY · TUE 17 NOV**: the block outlined in orange: Harnessville Sports Club 12:00–23:00, Live, **3 orders**, SELECTED, with two sub-rows "POSSIBLE DUPLICATE · SAME TIME", Harnessville SC and HSC, each with "Needs approval" · **TOMORROW · WED 18 NOV**: Market Square, No orders |
| `02-event-list-bottom` | **THU 19 NOV**: EO2 check Live (5 orders) with the sub-row EO2 check Dup (same time) · EO2 check Other (Finished, 3 orders) · EO2 check Start (Finished, 1 order) · **FRI 20 NOV**: EO2 check Lone on its own, amber edge, "Needs approval", No orders |
| `00-event-list-full-height` | The whole list in one image, for reference |
| `03-tap-HSC-sub-row` | "Approve HSC?" / "HSC is a possible duplicate of Harnessville Sports Club, which is already approved. Approve it to take orders? Customers will see it too." · Approve / Cancel |
| `04-tap-Harnessville-SC-sub-row` | **Not approved.** Dismissed at 12:07, so the same after-Keep question: "Approve Harnessville SC? Harnessville SC is a possible duplicate of Harnessville Sports Club, which is already approved. …" · Approve / Cancel |

**Not in the current data:** the "Possible duplicate · overlaps" label. Every duplicate in the test data has exactly the same times. The label is covered by the rule checks.

## Test data
**Unchanged by this round:** 10 events and 13 orders on test-truck. The delete command and the `--rescan` step in docs/events-overlap-3-report.md §2 still apply. Your click-through added no orders (the counts are as before).

## Prompt check
- **Nothing arrived garbled, and no instruction contradicted another.**
- **The closed-anchor point above** is a consequence of "closed events are anchors" plus "the approve question is unchanged". Both are honoured; the effect is noted rather than resolved by choosing.

## SQL (this round, all read-only, via the Supabase MCP)
```sql
select e.id, e.venue_name, e.town, e.postcode, e.event_date, e.start_time, e.end_time, e.status, e.van_id, e.opened_at, e.overlap_dismissed_at, (select count(*) from orders o where o.event_id=e.id and o.status<>'cancelled') as orders from truck_events e where e.truck_id='test-truck' and e.status<>'cancelled' and e.event_date >= (now() at time zone 'Europe/London')::date - 1 order by e.event_date, e.start_time, e.venue_name;
```
(Run once, before the screenshots. The 12:07 dismissal of Harnessville SC came from your click-through, not from me.)

## Files changed this round (all uncommitted)
- `lib/event-default.ts`, `components/shared/EventPickerPanel.tsx`, `components/dashboard/AddOrderPanel.tsx`.
- 49 `messages/*.json` files plus the generated `messages/ns/**` and `lib/i18n/catalog/**`.
- `scripts/_messages-parity-1e.cjs`.
- This report and the screenshots.
