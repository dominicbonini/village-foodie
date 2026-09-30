-- 20260930_outreach_events_updated_at.sql
-- One column, so an edited note can say that it was edited, and when.
--
-- ⏳ NOT YET APPLIED. It is in the report and in the chat reply for Dominic to run. Nothing in this
--    repository runs SQL.
--
-- ── 🔴 WHY THIS IS THE ONLY SQL THIS BUILD NEEDS ───────────────────────────────────────────────────
-- `outreach_events` already allows UPDATE and DELETE: its policy is `for all to service_role` with
-- `using (true) with check (true)`, and every writer is a server route holding the service-role key.
-- There is no trigger and no check constraint standing in the way — the table was checked before the
-- code was written. So editing and deleting a note needed no migration at all.
--
-- What did need one is the MARK. "Edited 30 Sep" is a fact about a row, and there was nowhere to put
-- it. The alternative — appending "(edited)" to the body — would put it in the words Dominic wrote,
-- where it would be edited again, translated, or sent somewhere by accident.
--
-- ⚠️ EVERY READER AND WRITER DEGRADES WITHOUT IT. `app/api/admin/outreach/timeline/route.ts` probes
-- for the column (`eventsHaveUpdatedAt`) and, while it is absent, selects the same columns it always
-- did and updates without stamping. An edit still lands; it simply carries no mark. That is why this
-- can be applied whenever, and why forgetting it breaks nothing.
begin;

alter table public.outreach_events
  add column if not exists updated_at timestamptz;

comment on column public.outreach_events.updated_at is
  'Set when a note is edited. Null on every row that has never been edited; never set on a stage_change.';

commit;

-- 🔴 PostgREST caches the schema. Until it reloads, selecting the new column returns PGRST204 —
--    which the probe reads as "not there" and degrades on, so the only symptom is a missing label.
notify pgrst, 'reload schema';

-- ── VERIFICATION ──────────────────────────────────────────────────────────────────────────────────
-- The column exists, and nothing has been edited yet (every row should report null).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'outreach_events' and column_name = 'updated_at';

select kind, count(*) as rows, count(updated_at) as edited
from public.outreach_events
group by kind
order by kind;
