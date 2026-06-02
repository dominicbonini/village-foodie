alter table trucks
  add column if not exists lifetime_discount_pct integer default null,
  add column if not exists lifetime_discount_note text default null;

comment on column trucks.lifetime_discount_pct is 'Lifetime subscription discount percentage e.g. 50 = 50% off. Set for pre-launch testers.';
comment on column trucks.lifetime_discount_note is 'Human-readable note about the discount e.g. Pre-launch tester — locked at 50% for life';
