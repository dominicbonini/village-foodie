-- supabase/migrations/20261084_demo_claim_2.sql — demo-claim-2 (9 November 2026; docs/demo-claim-2-report.md).
-- The demo → real menu carry-over and its review, recorded on the demo session they belong to.
--
--   menu_carry_status       null (never tried) · 'started' (taken by one request) · 'done' · 'failed'
--   menu_carry_at           when the status last changed
--   menu_carry_truck_id     the REAL truck the menu was carried to (no foreign key on purpose: a truck deletion must not have
--                           to know about this table — lib/delete-truck.ts's ordered cascade stays exactly as it is)
--   menu_carry_note         one line: what was carried, or why it failed
--   menu_carry_fingerprint  the carried menu's fingerprint (lib/demo-menu-carry.ts menuFingerprint) — compared later to tell
--                           "untouched since carry-over" (review it, clear-first) from "edited by hand" (check it, keep the edits)
--   menu_review_status      null (no review owed) · 'pending' (carried, not yet reviewed) · 'reviewed' · 'dismissed'
--   menu_reviewed_at        when it was reviewed or dismissed
-- Additive only: seven nullable columns (null for every existing row), two checks and one partial index. No row is changed,
-- nothing is dropped.
begin;

alter table public.demo_sessions
  add column if not exists menu_carry_status text,
  add column if not exists menu_carry_at timestamptz,
  add column if not exists menu_carry_truck_id text,
  add column if not exists menu_carry_note text,
  add column if not exists menu_carry_fingerprint text,
  add column if not exists menu_review_status text,
  add column if not exists menu_reviewed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'demo_sessions_menu_carry_status_check') then
    alter table public.demo_sessions add constraint demo_sessions_menu_carry_status_check
      check (menu_carry_status is null or menu_carry_status in ('started', 'done', 'failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'demo_sessions_menu_review_status_check') then
    alter table public.demo_sessions add constraint demo_sessions_menu_review_status_check
      check (menu_review_status is null or menu_review_status in ('pending', 'reviewed', 'dismissed'));
  end if;
end $$;

-- The review is found by the REAL truck (Manage and the dashboard know the truck, not the claim).
create index if not exists demo_sessions_menu_carry_truck_idx
  on public.demo_sessions (menu_carry_truck_id) where menu_carry_truck_id is not null;

commit;
