alter table operators
  add column if not exists is_admin boolean not null default false;

comment on column operators.is_admin is 'Platform-level admin access. Grants access to /admin without ADMIN_SECRET.';
