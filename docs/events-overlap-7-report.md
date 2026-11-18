# events-overlap-7: test data deleted, work committed

**17 Nov 2026. Done.**
- **Test data:** the rescan found nothing new, and the approved delete removed exactly the 13 recorded orders and 10 recorded events from test-truck. The counts match.
- **Commit:** all events-overlap-2 to 6 work is in one local commit, **`3ecdbb35`** on `main`. **Nothing was pushed.** `docs/` is left uncommitted.

## 1. Rescan (read-only)
`npx -y -p pg@8.13.1 node scripts/dev/events-overlap-testdata-delete.cjs --yes-write-to-production --rescan`
- **"rescan: 0 order(s) added to the record."** The click-through placed no orders on the test events.
- The record stayed at **10 events, 13 orders**.
- The ownership check found no recorded row on any truck other than test-truck.

## 2. Delete (approved by you)
`npx -y -p pg@8.13.1 node scripts/dev/events-overlap-testdata-delete.cjs --yes-write-to-production --approved-by-dominic`

**Output:** `deleted on test-truck: 13 orders, 10 events. Record moved aside.`
- It ran as one transaction.
- The script checks the deleted counts against the record before committing.
- The record file was renamed to `scripts/dev/events-overlap-testdata.deleted-1794919438053.local.json`. It is git-ignored and not committed.

### The counts match (read-only, before and after)

| | Before | After | Change |
|---|---|---|---|
| test events (`notes = 'events-overlap-2 test data'`) | 10 | **0** | −10 |
| orders on those events | 13 | **0** | −13 |
| recorded event ids still present | 10 | **0** | −10 |
| all test-truck orders | 390 | **377** | **−13** (= the record) |
| all test-truck events | 79 | **69** | **−10** (= the record) |
| slot-usage rows on the test events | 4 | **0** | removed by `ON DELETE CASCADE` with the events |
| `action_audit_log` lines for the 13 deleted orders | — | **0** | nothing left behind |

Nothing outside the recorded rows changed: the truck-wide drops equal the record exactly.

## 3. The commit
**`3ecdbb35` "events-overlap-2 to 6: the dashboard only uses approved events; one-time approve, overlap and Start questions"**, local on `main`. Not pushed: `main` is 25 commits ahead of `origin/main`, counting the languages session's commits and the migration commit `cf8ff324` from events-overlap-3.

**314 files changed, 4,633 insertions, 761 deletions:**
- **App changes (15):**
  - `app/(app)/dashboard/[token]/page.tsx`, `app/(app)/dashboard/[token]/kds/page.tsx`;
  - `app/api/dashboard/action/route.ts`, `app/api/events/action/route.ts`, `app/api/events/manage/route.ts`, `app/api/orders/submit/route.ts`;
  - `components/dashboard/AddOrderPanel.tsx`, `components/dashboard/types.ts`, `components/native/OfflineBanner.tsx`;
  - `components/shared/EventPickerPanel.tsx`, `components/shared/EventGateDialogs.tsx` (new);
  - `lib/event-default.ts` (new), `lib/native/orderGate.ts`, `lib/native/outbox.ts`.
- **Messages (294):** the 49 `messages/*.json` files, plus the generated catalogue `messages/ns/<language>/{dashboard, errorsKitchen, errorsManage, kitchenModals, nativeShell}.json` (49 × 5 = 245). `lib/i18n/catalog/**` had no changes, because no namespace was added.
- **`.gitignore`:** the `scripts/dev/*.local.json` line.
- **`scripts/dev/` (4):** `_events-overlap-db.cjs`, `events-overlap-testdata.cjs`, `events-overlap-testdata-delete.cjs`, `events-overlap-livecheck.cjs`. The git-ignored record is not included.
- **One file you didn't list: `scripts/_messages-parity-1e.cjs`.** It registers the 26 new message keys as named new wordings. Without it the repo's `messages-parity` check fails at this commit, so I counted it as part of the events-overlap changes. Say if you'd rather it came out of the commit.

### Checked before committing
- **Only my keys in the message files.** Comparing each of the 49 files with HEAD, the only changed keys are the 26 events-overlap keys. None of the languages session's work is mixed in, and no untracked files sit under `messages/`.
- **Nothing extra.** Nothing outside this list was staged, nothing from `docs/` was staged, and after the commit the only uncommitted items are `docs/`.
- **Checks:** `split-messages --check` is in step and `tsc` reports 0 errors.

### Left uncommitted, as asked
`docs/events-overlap-1…7-report.md` and the screenshot folders `docs/events-overlap-1/ … -6/`.

## Prompt check
- **Nothing arrived garbled, and no instruction contradicted another.**
- **One judgement call:** including `scripts/_messages-parity-1e.cjs`, explained above.

## SQL (this round)

**Run by the delete script.** The rescan ran the two checks; the delete ran all four in one transaction.
```sql
select 'event' as kind, id::text as id, truck_id from truck_events where id = any($1::uuid[]) and truck_id <> $3
union all
select 'order', order_key::text, truck_id from orders where order_key = any($2::uuid[]) and truck_id <> $3;
select order_key::text, truck_id, event_id::text, id, customer_name, status, source, created_at
from orders where event_id = any($1::uuid[]) and not (order_key = any($2::uuid[])) order by created_at;
delete from orders where order_key = any($1::uuid[]) and truck_id = $2 returning order_key;
delete from truck_events where id = any($1::uuid[]) and truck_id = $2 returning id;
-- $1 = the 13 recorded order keys / the 10 recorded event ids; $2 / $3 = 'test-truck'
```

**Read-only checks (Supabase MCP):**
```sql
-- before
select (select count(*) from truck_events where truck_id='test-truck' and notes='events-overlap-2 test data') as test_events, (select count(*) from orders where event_id in (select id from truck_events where truck_id='test-truck' and notes='events-overlap-2 test data')) as orders_on_test_events, (select count(*) from orders where truck_id='test-truck') as all_test_truck_orders, (select count(*) from truck_events where truck_id='test-truck') as all_test_truck_events, (select count(*) from production_slot_usage where event_id in (select id from truck_events where truck_id='test-truck' and notes='events-overlap-2 test data')) as slot_usage_rows;
-- after (the 10 recorded event ids listed explicitly)
select (select count(*) from truck_events where truck_id='test-truck' and notes='events-overlap-2 test data') as test_events_left, (select count(*) from truck_events where id in (…10 recorded ids…)) as recorded_events_left, (select count(*) from orders where notes='events-overlap-2 test data' or customer_name like 'EO2 check%') as test_orders_left, (select count(*) from orders where truck_id='test-truck') as all_test_truck_orders, (select count(*) from truck_events where truck_id='test-truck') as all_test_truck_events, (select count(*) from production_slot_usage where event_id in (…the 4 recorded events that had slot rows…)) as slot_usage_left;
select count(*) as audit_rows_for_deleted_test_orders from action_audit_log where order_key::text in (…13 deleted order keys…);
```
