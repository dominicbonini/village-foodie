-- Add allergen information columns to trucks table
alter table trucks
  add column if not exists allergen_info_url  text,
  add column if not exists allergen_info_text text;

comment on column trucks.allergen_info_url  is 'URL to uploaded allergen PDF or image. Displayed as a link on the customer order page.';
comment on column trucks.allergen_info_text is 'Optional text allergen information. Used if no file is uploaded.';
