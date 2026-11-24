# france-notes-1 — line notes stored outside the order lines, so retention never rewrites items or deals

*24 November 2026 · branch `france-vat-1` (this work started at `528debcb`) · not pushed, not deployed.*

## Summary

- **Where the notes now live:** a dish's note (`items[].specialInstructions`) and a deal's slot notes (`deals[].slotNotes`) live in a new column, `orders.line_notes` / `order_drafts.line_notes`, for every new order and draft.
- **Every path is covered:**
  - the customer submit;
  - the card draft and its promotion;
  - the walk-up and its offline replay;
  - the operator edit;
  - demo seeding.
- **Every reader merges the notes back** through one helper (`lib/line-notes.ts`). Everything people see is byte-identical to today:
  - the customer and truck emails;
  - the status page and its API, and the order page's confirmation, which reads that API;
  - the dashboard, the KDS and the edit screens;
  - tickets at 58 and 80 mm;
  - the Reports CSVs.
- **Proved for:** an old-style order (notes still in items, as every existing order and the deployed code have them) and a new-style one.
- **Retention:** for an order with `line_notes`, it blanks the notes there, plus the customer name, email, phone and order note as before. It never touches the order's items or deals. An order without `line_notes` is cleaned exactly as today, so the privacy promise holds for both. No legal text changed.
- **The database change is the two nullable columns, nothing else:**
  - no backfill, no existing row changed;
  - `place_order_atomic_v2` untouched (md5 unchanged);
  - pre-flighted in one rolled-back transaction before applying, then re-proved live after applying, rolled back, demo trucks only.
- **Proof:** `scripts/france-notes-1.cjs` **44 passed, 0 failed**. Sweep: §7.

## Things you should know first

1. **Why `place_order_atomic_v2` is unchanged** (the brief asked for a change only if strictly necessary; it isn't).
   - The function names its columns, so it can't write `line_notes`.
   - The customer path calls it exactly as before, with the notes still inside the lines. Then, inside the same request and the same event lock, one guarded update moves them: `update orders set items, deals, line_notes … where order_key = … and line_notes is null`.
   - This follows the pattern already there: the cooking-reservation write updates the new row the same way, and is audited for it.
   - If that update ever failed, the order would simply stay old-style, which every reader and retention handle. Nothing can be lost.
   - **Cost:** one extra write per customer order that has a note. It bumps `updated_at` milliseconds after the insert, and the dashboards get one more realtime event; both already refetch.
2. **jsonb doesn't keep key order.** The pre-flight showed this: Postgres hands every object back with its keys shortest first, then in byte order.
   - So today a line read from the database has `specialInstructions` at its jsonb place, not where the code wrote it.
   - The merge puts the field back where jsonb would have, for any line whose stored keys are in jsonb order (every line read from the live database). Otherwise it uses its recorded position.
   - **Live proof 3b** reads both rows back from the real database and runs them through `lib/line-notes.ts`: the new-style order's lines merged are byte-identical to the old-style order's as Postgres returns them.
3. **A gap in my france-receipts-1 work, found and fixed here.** The card draft read (`DRAFT_ROW_COLUMNS`) never selected `vat_regime`, so the promotion couldn't carry the draft's regime. It fell back to the trigger's rule (the truck's regime at promotion). The france-receipts-1 report said the draft's was carried; now it is. It's a one-word change.
4. **Account deletion is unchanged.** Today it doesn't scrub item notes, so a new-style order's `line_notes` isn't touched by it either: the same behaviour as before.
5. **Another session (compare-research-1) is working in this folder.** It has uncommitted changes to `data/compare-research-1/competitors.json`, `docs/compare-research-1/` and other files. I didn't touch or stage them. The other untracked reports aren't mine either.

---

## 1 · What changed, by area

**The helper** — `lib/line-notes.ts` (new; pure, client-safe):
- `splitLineNotes(items, deals)` is the write boundary: the lines without the two fields, plus `line_notes` (null when no line had either).
- `withSplitNotes(row)` does the same for an insert payload, naming `line_notes` only when needed, so a note-free order's insert is exactly what it was.
- `mergeLineNotes` / `withLineNotes(row)` is the read boundary: the lines exactly as before, with the `line_notes` key dropped so an API answer is unchanged.
- `blankLineNotes` is for retention.
- A field whose value is `undefined` counts as absent, because JSON drops it, so it never reached the column.

**Writes**
- `app/api/orders/submit/route.ts`: the guarded follow-up update (point 1), after the reservation write, inside the lock.
- `lib/payments/order-drafts.ts`:
  - the draft insert splits;
  - every draft read (`getOrderDraft`, by payment intent, the create's return) merges;
  - `DRAFT_ROW_COLUMNS` gains `line_notes` and `vat_regime` (point 3).
- `lib/payments/promote-draft.ts`: the order insert splits. The draft comes merged, so the auto-accept rule ("a noted order waits for a human") and the emails read the notes as before.
- `app/api/dashboard/action/route.ts`:
  - the walk-up insert **and** its offline-replay upsert split;
  - the edit's update splits, and always writes `line_notes` on an order that had it (null once no note is left), so a removed note can't linger.
- `lib/seed-demo-orders.ts`: the same rule. Its lines carry no notes, so this changes nothing.

**Reads**
- `app/api/dashboard/route.ts`: the orders, merged (the dashboard, the KDS, tickets, edit screens).
- `app/api/orders/[id]/route.ts`: merged (the status page and the order page's confirmation).
- `app/api/manage/route.ts` `get_report`: merged (Reports and its CSVs).
- `app/api/dashboard/action/route.ts`:
  - all five `select('*')` order reads (the confirm, ready, edit and cancel paths and their emails);
  - both reads in the slot change.
- Realtime needed no change: the dashboard and the KDS refetch through `/api/dashboard` on every event.

**Retention** — `lib/order-retention.ts`:
- `COLS` gains `line_notes`.
- `retentionPatch`: a row **with** `line_notes` gets it blanked (each note `''`, each slot-notes `{}`, as inside items before), and items and deals are never in the patch. A row **without** gets exactly today's patch.
- **The audit snapshot** (`lib/audit/order-audit.ts`) is a whitelist, so `line_notes` can never get in; unchanged.

**Database and proof**
- `supabase/migrations/20261127_france_notes_1.sql`.
- `scripts/db-rollback-proofs.cjs`: `--preflight-notes`, `--notes-check`.
- `docs/france-notes-1/*.log`.
- `scripts/france-notes-1.cjs` (new, registered).

## 2 · The key that ties a note to its line

`line_notes` (v1):
```json
{ "v": 1,
  "items": { "#0": { "at": 4, "note": "No basil — nut allergy" }, "#1": { "at": 3, "note": "" } },
  "deals": { "#0": { "at": 4, "slotNotes": { "Pizza": "BIEN CUIT, no peanuts" } } } }
```
- **The key:** the line's `cartKey` when it carries one (`"k:<cartKey>"`); a cartKey seen twice falls back to the position for the second. Otherwise its **position** (`"#0"`, `"#1"` …). Stored lines carry no cartKey today, so in practice it's the position.
- **Only lines that had the field get an entry.** An absent field stays absent; an empty note comes back empty.
- **`at`** is the field's place among the line's stored keys. It's used when the stored keys aren't already in jsonb order (point 2).
- **Edits rewrite the whole map** from the edited lines, so positions always match the lines stored with them.

## 3 · The migration and every SQL statement

**Read-only, before (Supabase MCP):**
```sql
select c.relname as tbl, t.tgname, pg_get_triggerdef(t.oid) as def from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('orders','order_drafts') and not t.tgisinternal order by 1,2;
```
→ on UPDATE of orders only `orders_set_updated_at` (and `orders_receipt_no_keep`, on receipt_no only).
```sql
select table_name, column_name from information_schema.columns where table_schema='public' and table_name in ('orders','order_drafts') and column_name = 'line_notes';
```
→ none yet.

**The migration**, `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261127_france_notes_1.sql` → sha256 `cdeda22e79ebd79b`, committed `ae3fc8f1`, applied, one transaction, no error:
```sql
set lock_timeout = '3s';
begin;
alter table public.orders       add column if not exists line_notes jsonb;
alter table public.order_drafts add column if not exists line_notes jsonb;
comment on column public.orders.line_notes is
  'france-notes-1: the order''s line notes (items[].specialInstructions, deals[].slotNotes), kept out of items/deals so retention never rewrites them. {v:1, items:{key:{at,note}}, deals:{key:{at,slotNotes}}}; key = the line''s cartKey, else "#position". NULL = notes (if any) still inside items/deals. lib/line-notes.ts.';
comment on column public.order_drafts.line_notes is
  'france-notes-1: the card draft''s line notes, same shape as orders.line_notes; copied to the order at promotion.';
notify pgrst, 'reload schema';
commit;
```

**Read-only, after:**
```sql
select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
  where table_schema = 'public' and column_name = 'line_notes' and table_name in ('orders', 'order_drafts') order by 1;
```
→ both jsonb, nullable, no default.
```sql
select md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)) as v2_md5,
  (select count(*) from public.orders where line_notes is not null) as orders_with_line_notes,
  (select count(*) from public.order_drafts where line_notes is not null) as drafts_with_line_notes,
  (select count(*) from public.orders where created_at > now() - interval '3 hours') as orders_last_3h;
```
→ `e4b273abcf8e7609c6ca54033ed59332` (unchanged), 0, 0, 0.

**The live proofs**, `scripts/db-rollback-proofs.cjs --preflight-notes` (before applying) and `--notes-check` (after).
- **Safeguards:** demo trucks only (`demo-mk65q66spjck0g9mxt50btfxtr`, `test-truck-2`); every transaction ROLLED BACK; the script refuses to send a COMMIT; statement_timeout 5 s, lock_timeout 3 s.
- **Counts:** identical before and after.
- **Full output:** with parameters, in `docs/france-notes-1/preflight-20261127.log` and `notes-check.log`.

The distinct statements:
```sql
set statement_timeout = '5s'
set lock_timeout = '3s'
begin
set transaction read only
select (select count(*) from public.orders where truck_id = any($1))::int as orders, (select count(*) from public.order_payments where truck_id = any($1))::int as order_payments, (select count(*) from public.action_audit_log where truck_id = any($1))::int as action_audit_log, (select count(*) from public.production_slot_usage where truck_id = any($1))::int as production_slot_usage, (select coalesce(sum(order_counter), 0) from public.trucks where id = any($1))::int as trucks_order_counter, (select coalesce(sum(e.order_counter), 0) from public.truck_events e where e.truck_id = any($1))::int as events_order_counter, to_regclass('public.receipt_counters') is not null as has_counters, (select count(*) from public.order_drafts where truck_id = any($1))::int as order_drafts, (select string_agg(id || '=' || coalesce(vat_regime, '-'), ',' order by id) from public.trucks where id = any($1)) as truck_vat_regimes
select (select count(*) from public.receipt_counters where truck_id = any($1))::int as counter_rows, (select coalesce(sum(last_no), 0) from public.receipt_counters where truck_id = any($1))::int as counter_sum, (select count(*) from public.receipt_no_failures)::int as failures
select id, plan, is_customer from public.trucks where id = any($1) order by id
-- (pre-flight only) the migration's body, as above, its set lock_timeout / begin / commit / notify taken out
select public.place_order_atomic_v2($1::jsonb, null, 'confirmed', null, $2, current_date, null) as r
select items = $2::jsonb as i, deals = $3::jsonb as d, (line_notes is not distinct from $4::jsonb) as n from public.orders where order_key = $1
select items, deals, line_notes, receipt_no, customer_name from public.orders where order_key = $1
update public.orders set items = $2::jsonb, deals = $3::jsonb, line_notes = $4::jsonb where order_key = $1 and line_notes is null returning order_key
insert into public.orders (id, truck_id, customer_name, customer_phone, customer_email, slot, order_type, event_date, event_id, items, deals, discount_code, subtotal, discount_amt, total, total_minor, food_minor, tax_minor, tax_inclusive, tax_label, card_fee_payer, status, payment_status, source, line_notes) values ($1, $2, 'rollback proof', null, null, null, 'collection', current_date, null, '[]'::jsonb, null, null, 0, 0, 0, 0, 0, 0, true, 'TVA', 'truck', 'confirmed', 'unpaid', 'manual', $3::jsonb) returning order_key, receipt_no
select line_notes = $2::jsonb as n from public.orders where order_key = $1
insert into public.order_drafts (order_key, truck_id, subtotal, total, total_minor, items, line_notes) values (gen_random_uuid(), $1, 1, 1, 100, $2::jsonb, $3::jsonb) returning line_notes = $3::jsonb as n, items = $2::jsonb as i
update public.orders set customer_name = '', line_notes = $2::jsonb where order_key = $1
select items = $2::jsonb as items_same, deals = $3::jsonb as deals_same, line_notes = $4::jsonb as notes_blank, customer_name from public.orders where order_key = $1
rollback
```

| # | Proof (pre-flight and after applying: 8/8 each) |
|---|---|
| 1 | The **deployed** `place_order_atomic_v2` call: the notes stay inside items / deals, `line_notes` NULL. |
| 2 | The customer path's follow-up update: items / deals without notes, the notes in `line_notes`, the receipt number unchanged. |
| 3 | It never runs twice: a second one (with `line_notes` already set) changes nothing. |
| 3b | **Read back:** the new-style order's lines, merged by `lib/line-notes.ts`, are byte-identical to the old-style order's as the database returns them. |
| 4 | A direct insert (walk-up, promotion) naming `line_notes` stores it. |
| 5 | A card draft stores it too. |
| 6 | Retention on a new-style order: the notes and the name blanked, items and deals byte-identical (`jsonb =`). |
| — | The demo trucks' counts are identical before and after. |

The first pre-flight attempt "failed" 6 proofs, all rolled back, counts identical. That's how the jsonb key-order fact (point 2) surfaced: the proofs compared JSON text. They now compare with `jsonb =` in SQL, and proof 3b was added.

## 4 · Proof — `scripts/france-notes-1.cjs`: 44 passed, 0 failed

**A · The helper:**
- split and merge round trips: a note, an empty note, no field at all, a cartKey, a cartKey seen twice, deal slot notes, no deals, an `undefined` field;
- jsonb order and insertion order;
- `withLineNotes` drops the key; `withSplitNotes` adds it only when needed;
- retention's blanking is idempotent.

**B · Every write path** (this tree's real routes, on an in-memory database):
- the customer submit (the guarded follow-up update);
- the card draft (stored split, read back merged) and its promotion;
- the walk-up, and its offline replay (still one row, unchanged, the same answer);
- the edit of a new-style **and** an old-style order: a note changed and a note added on a new line, all in `line_notes`;
- demo seeding.

**C · Nothing anyone sees changes**, against `528debcb` extracted from git:
- **The fixture:** the row START's customer submit stores (old-style, as the deployed code stores it) and the row this tree's submit stores for the same request (new-style). It has two dish notes (one empty), a deal slot note and an order note.
- **Byte-identical to START for both rows:**
  - the confirmation email (HTML and text) the operator's confirm sends from the stored row;
  - the status API and page;
  - the dashboard API's orders and keys (the dashboard, the KDS, the edit screens);
  - the ticket bytes at 58 and 80 mm;
  - Reports (`get_report`).
- **The comparison carries the notes:** they are in START's email, API, dashboard rows, tickets and Reports.
- **The customer email and the truck's new-order email** from the submit and from the walk-up: byte-identical to START.
- **The order page's in-page confirmation** reads the status API.
- **No screen, email, ticket or CSV code changed since START:** components/, every page, the email and ticket builders.

**D · Retention:**
- an old-style order gets exactly START's patch;
- a new-style order: the customer fields, the order note and `line_notes` blanked, with items and deals never in the patch and byte-identical after;
- read back, it shows no note;
- idempotent;
- the privacy text is untouched.

**E · The audit:** no note (dish, slot, order) and no `line_notes` in a snapshot, or in the `order_placed` rows the submit and the walk-up wrote.

**F · Structure:**
- every reader merges and every writer splits;
- the migration is two columns only;
- both live logs: 8 proofs each, counts identical.

## 5 · Re-pins

Each is marked ⚠️ RE-PINNED (france-notes-1).

| Harness | What moved, and why |
|---|---|
| `batch-reservation-writers.cjs` | Its source check allows 9,000 characters from the edit's event lock to its re-admission. That gap was 8,885 at this work's start, and the edit's two line-notes lines take it to 9,220. The window is widened to 9,600; the lock, admission, P2 writer and release must still all be there, in order. |
| `france-records-1.cjs` §E | "Retention is byte-identical to the start" proves **france-records-1** left retention alone, so it now compares START with france-records-1's last commit, `68742078`. This work changes retention on purpose (§D above). The old-style patch is still asserted on this tree. |

**Fixed in my code rather than re-pinned:**
- the customer path's move sits after the reservation write, so batch-reservation-writers' submit pattern still holds;
- the promotion and draft inserts keep `.from(…)` directly before `.insert(`, which france-records-1's insert-path check reads;
- a field set to `undefined` doesn't count as a note, which kept order-charges' note-free submit byte-identical.

## 6 · Left undone

- **No backfill:** existing orders keep their notes inside items, as the brief says. Retention keeps cleaning them there.
- **Account deletion** still doesn't scrub line notes (point 4), the same as today.
- **The order page's cart**, which lives in the customer's browser, is unchanged; notes only move at the server.

## 7 · The sweep (against `528debcb`)

**Result: no failure from this work is left.**

- **The baseline,** at `528debcb` in a throwaway worktree, this time with this folder's `.next` linked in, so the pending-card harnesses run there too: 232 harnesses, 19 failing.
- **The branch,** after the build commit `395c75fe`: 233 harnesses (`france-notes-1` is new), every listed file passing the screen, 19 failing.
- **Every failure that is in both sweeps matches exactly,** pass and fail counts alike:
  - billing-1, contact-1, costs-accounts-1, country-settings-parity, cwv-2, faq-1, france-1;
  - language-phase-1b, 1c, 1d, 1d2, 1e and 2;
  - legal-languages-1, loyalty-1, screenshot-truck-details, site-chrome-1, tidy-1.

| Harness | At start | Branch | Cause | Now |
|---|---|---|---|---|
| `competitor-features-2` | pass | 78 / 1 | **This work.** Its source check allows 1,400 / 500 characters from `action === 'ready'` / `'send_ready_email'` to `deliverReadyEmail(order, truck)`. My comment line on each merged order read pushed that past the window. | **Fixed in code:** the five repeated comment lines are gone (the import line says the rule once). 79 / 0. |
| `event-types-render` | fail | pass | **Flaky, not code.** It renders in a headless browser, and the same tree failed once and passed once in a row ("a dropdown's text is the same size as a row label (16px vs 14px)"). It has been in every earlier baseline's failing list. Neither it nor `components/manage/EventTypes.tsx` changed since the start. | — |

**Found and fixed before the sweep, by running the 27 harnesses that read notes, drafts or retention early:**
- **batch-reservation-writers:** its edit window, re-pinned (§5), plus the submit move placed after the reservation write.
- **order-charges:** an `undefined` slotNotes field had counted as a note; fixed in the helper.
- **france-records-1:** the insert-path check (the comment moved above `.from`) and the retention check (re-pinned, §5).

All 27 then matched the start (loyalty-1 80/1 and contact-1 252/1 are the start's own).

**The runner itself, over the 24 harnesses that read the dashboard action route,** after the comment-line fix (`--list`, all 24 pass the screen):
- 23 pass, among them competitor-features-2 79/0, batch-reservation-writers, order-charges 288/0, france-notes-1 44/0, france-records-1 60/0 and france-receipts-1 53/0;
- 1 fails exactly as at the start: billing-1 130/1.

**Also checked:**
- **Type-check:** clean.
- **eslint:** every file this work changed has the same counts as at `528debcb`.
- **Restored after the runs:** the `us-changed.txt` fixtures and inbox-1's screenshots the runs rewrite, with `git checkout`.
- **Untouched:** another session's uncommitted compare-research-1 files.

## 8 · What to click through on localhost

Use a test or demo truck only.

1. **On the order page, place an order** with a note on a dish ("No basil — nut allergy"), a deal with a slot note, and an order note.
   - The in-page confirmation, the customer email and the truck's new-order email show the notes exactly as before.
2. **On the dashboard and the KDS:** the notes are on the card, as before. Print the ticket (58 and 80 mm): the notes are in place. Reports' Orders and Items CSVs carry them as before.
3. **Edit the order:** change the dish note, add a dish with a note, save. The card, the "updated" email and the ticket show the new notes.
4. **Take a walk-up with a note** (also once offline, then reconnect): it shows as before, and the replay doesn't duplicate it.
5. **In the database:**
   `select order_key, items, deals, line_notes from public.orders where truck_id = '<demo truck>' order by created_at desc limit 3;`
   `items` and `deals` hold no `specialInstructions` or `slotNotes`; `line_notes` holds them, keyed `#0`, `#1` ….
