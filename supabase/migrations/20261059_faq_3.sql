-- 20261059_faq_3.sql — faq-3 (2 November 2026, docs/faq-3-report.md §2): THE FAQ'S WORDING BEFORE IT GOES PUBLIC. English only,
-- rows by id, public.faq_items only (no protected table, no truck).
--
-- RULE (Dominic): no FAQ answer mentions Pay at Hatch, paying at the truck or paying on collection. lib/faq/check.ts now refuses
-- to publish such an answer; this file brings the three rows that broke it, or led into it, into line.
--   …0010 "Can I take orders without online card payments?" — back to a draft (published_at cleared). Its text is NOT changed.
--   …0003 the free-trial answer — the sentence "Connect online card payments before your trial ends, because after it pre-orders
--         are paid online." comes out of both answers (faq-1c added it; 20261058 kept it).
--   …0007 the equipment answer — Dominic's new wording.
-- Run by Claude with scripts/db-migrate.cjs. Safe to run twice: each step changes only the text it expects, then asserts the end
-- state, and raises on anything it doesn't recognise.

begin;

do $$
declare n integer;
begin
  -- …0010 · a draft again, text untouched
  update public.faq_items set status = 'draft', published_at = null, updated_at = now(), updated_by = 'faq-3'
   where id = 'fa000002-0000-4000-8000-000000000010' and (status <> 'draft' or published_at is not null);
  if not exists (select 1 from public.faq_items where id = 'fa000002-0000-4000-8000-000000000010' and status = 'draft' and published_at is null) then
    raise exception 'faq-3: …0010 is missing or still published';
  end if;

  -- …0003 · the trial answers without the card-payments sentence
  update public.faq_items set
    answer_en = replace(answer_en, $x$ Connect online card payments before your trial ends, because after it pre-orders are paid online.$x$, ''),
    answer_single_plan_en = replace(answer_single_plan_en, $x$ Connect online card payments before your trial ends, because after it pre-orders are paid online.$x$, ''),
    updated_at = now(), updated_by = 'faq-3'
   where id = 'fa000002-0000-4000-8000-000000000003'
     and (answer_en like '%Connect online card payments before your trial ends%' or answer_single_plan_en like '%Connect online card payments before your trial ends%');
  if not exists (select 1 from public.faq_items where id = 'fa000002-0000-4000-8000-000000000003') then
    raise exception 'faq-3: …0003 is missing';
  end if;
  if exists (select 1 from public.faq_items where id = 'fa000002-0000-4000-8000-000000000003'
              and (answer_en like '%Connect online card payments%' or coalesce(answer_single_plan_en, '') like '%Connect online card payments%')) then
    raise exception 'faq-3: …0003 still holds the card-payments sentence (its text is not the one faq-1c wrote)';
  end if;

  -- …0007 · Dominic's wording, over faq-1c's
  if not exists (select 1 from public.faq_items where id = 'fa000002-0000-4000-8000-000000000007' and answer_en = $a$No. HatchGrab runs in the web browser on any phone, tablet or laptop. We recommend a tablet for the best experience, but it works on a phone too. You don’t need a card reader: customers can pay for pre-orders online by card, and for walk-up orders you keep using the card machine you already have. {apps.sentence}$a$) then
    update public.faq_items set
      answer_en = $a$No. HatchGrab runs in the web browser on any phone, tablet or laptop. We recommend a tablet for the best experience, but it works on a phone too. You don’t need a card reader: customers can pay for pre-orders online by card, and for walk-up orders you keep using the card machine you already have. {apps.sentence}$a$,
      updated_at = now(), updated_by = 'faq-3'
     where id = 'fa000002-0000-4000-8000-000000000007'
       and answer_en = $a$No. HatchGrab runs in the web browser on any phone, tablet or laptop. We recommend a tablet for the best experience, but it works on a phone too. You don’t need a card reader: pre-orders are paid online, and for walk-up orders you keep using the card machine you already have. {apps.sentence}$a$;
    get diagnostics n = row_count; if n <> 1 then raise exception 'faq-3: …0007 is neither faq-1c''s text nor the new one'; end if;
  end if;
end $$;

commit;
