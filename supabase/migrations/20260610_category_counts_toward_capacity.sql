-- Per-category "counts toward kitchen capacity" flag.
-- For NO-PREP categories (prep_secs = 0, e.g. Sides/Dips) the operator can tick this so their
-- items count toward the shared kitchen_capacity ceiling (ceiling-only — no backward cooking
-- windows, no per-category batch tone). Prep-bearing categories (prep_secs > 0) ignore it and
-- always count (their prep/batch IS the capacity rule), enforced in the engine.
-- Default false preserves today's behaviour (0-prep categories count nothing). No backfill.

alter table menu_categories
  add column if not exists counts_toward_capacity boolean not null default false;

comment on column menu_categories.counts_toward_capacity is
  'No-prep (prep_secs=0) categories ticked to count toward the shared kitchen_capacity ceiling. Ignored when prep_secs>0 (prep-bearing categories always count). Default false = legacy behaviour.';
