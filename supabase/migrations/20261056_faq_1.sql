-- 20261056_faq_1.sql — faq-1 (1 November 2026, docs/faq-1-report.md): the FAQ's tables and its first 24 questions, as DRAFTS.
-- ⚠️ NOT RUN. Dominic runs it by hand. Safe to run twice: the tables are created only if missing, and every seeded row has a
-- fixed id with `on conflict (id) do nothing`.
--
-- WHAT IT IS: Admin › FAQ's data (components/admin/FaqTab.tsx, app/api/admin/faq). Nothing public reads these tables yet — no
-- page, sitemap, /llms.txt or JSON-LD (faq-1 is admin only).
--   • faq_sections — a section's English title and its place.
--   • faq_items    — a question and its English answer, written with live values ({pro.price} …, lib/faq/live-values.ts); the
--     answer used where a country offers only one plan; where it shows; Draft/Published; Dominic's private note.
-- READY FOR faq-2: the ids are uuids that never change, so faq-2's translations table can key on faq_items.id and
-- faq_sections.id, with a stamp of the English text each translation came from (question_en / answer_en /
-- answer_single_plan_en / title_en are the only texts to translate; updated_at moves when any of them changes).
--
-- ⛔ NO NEW APP COLUMN. The brief's country_settings.operator_apps was NOT added (Dominic, 1 November 2026, faq-1 Q1 → A): the
-- FAQ reads the existing country_settings.ios_app_available AND android_app_available (20261042), which the comparison pages
-- read. Their values are not changed here.
--
-- SECURITY — mirrors public.plans and public.country_settings: RLS on, NO policies, every grant revoked from anon,
-- authenticated and public; the service role only.

begin;

create table if not exists public.faq_sections (
  id          uuid primary key default gen_random_uuid(),
  position    integer not null,
  title_en    text not null check (length(btrim(title_en)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.faq_items (
  id                     uuid primary key default gen_random_uuid(),
  section_id             uuid not null references public.faq_sections(id) on delete cascade,
  position               integer not null,
  question_en            text not null check (length(btrim(question_en)) > 0),
  answer_en              text not null,
  answer_single_plan_en  text null,
  show_in                text not null default 'all'
                           constraint faq_items_show_in_chk check (show_in = 'all' or show_in = 'apps' or show_in ~ '^plan:[a-z][a-z0-9_]*$'),
  status                 text not null default 'draft' constraint faq_items_status_chk check (status in ('draft', 'published')),
  note                   text null,
  note_done              boolean not null default false,
  published_at           timestamptz null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  updated_by             text null,
  constraint faq_items_published_at_chk check (status <> 'published' or published_at is not null)
);

create index if not exists faq_items_section_position_idx on public.faq_items (section_id, position);

alter table public.faq_sections enable row level security;
alter table public.faq_items enable row level security;
revoke all on public.faq_sections from anon, authenticated, public;
revoke all on public.faq_items from anon, authenticated, public;
grant all on public.faq_sections to service_role;
grant all on public.faq_items to service_role;

comment on table public.faq_sections is
  'faq-1: the FAQ''s sections, English title and order. Edited in Admin › FAQ only. Ids never change (faq-2 keys translations on them). SERVICE ROLE ONLY: RLS on, no policies, no grants to anon/authenticated.';
comment on table public.faq_items is
  'faq-1: the FAQ''s questions. answer_en uses live values ({K.price}, {countries} …, lib/faq/live-values.ts); answer_single_plan_en is used where a country offers exactly one plan; show_in = all | apps (iPad and Android app both in the stores) | plan:<key> (that plan offered). Publishing is refused unless the answer reads correctly in every switched-on country (lib/faq/check.ts). note / note_done are Dominic''s private notes. Nothing public reads this table yet. SERVICE ROLE ONLY.';
comment on column public.faq_items.answer_single_plan_en is 'faq-1: the answer used where the country offers only one plan; NULL = use answer_en everywhere.';
comment on column public.faq_items.show_in is 'faq-1: where the question appears — all; apps (country_settings.ios_app_available AND android_app_available); plan:<plans.key> (that plan offered there).';

-- ══ THE SEED — 5 sections, 24 questions, ALL DRAFTS, in the brief's order. Every claim checked against the code and data
--    (docs/faq-1-report.md §5); a claim that could not be confirmed carries a note starting "CHECK (Cursor): ". No price,
--    percentage, plan name, plan count, trial length or country is typed — live values only (35.ak-7). ══

insert into public.faq_sections (id, position, title_en) values
  ('fa000001-0000-4000-8000-000000000001', 1, 'Pricing'),
  ('fa000001-0000-4000-8000-000000000002', 2, 'Getting started'),
  ('fa000001-0000-4000-8000-000000000003', 3, 'Orders and payments'),
  ('fa000001-0000-4000-8000-000000000004', 4, 'Reaching customers'),
  ('fa000001-0000-4000-8000-000000000005', 5, 'About HatchGrab')
on conflict (id) do nothing;

insert into public.faq_items (id, section_id, position, question_en, answer_en, answer_single_plan_en, show_in, note, updated_by) values
-- ── Pricing ──
  ('fa000002-0000-4000-8000-000000000001', 'fa000001-0000-4000-8000-000000000001', 1,
   'How much does HatchGrab cost?',
   'Each plan is per truck per month: {payg.name} {payg.price}, {pro.name} {pro.price} and {unlimited.name} {unlimited.price}. {payg.name} charges {payg.fee} on online card orders. {pro.name} includes your first {pro.included} of online orders each month, then charges {pro.fee}. {unlimited.name} has no HatchGrab fee on your orders. Walk-up orders never carry a HatchGrab fee.',
   'There’s one plan: {unlimited.name}, {unlimited.price} per truck per month, with no HatchGrab fee on your orders. Walk-up orders never carry a HatchGrab fee.',
   'all',
   'CHECK (Cursor): this matches the pricing section word for word in substance, but nothing is billed or charged yet: there is no subscription code, and platform_fee_enabled is false in every country (manual §81.3, §82.11). Confirm you are happy to state the fees before charging starts, as the pricing pages already do.',
   'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000002', 'fa000001-0000-4000-8000-000000000001', 2,
   'Do you take a cut of every order?',
   'Never on walk-up orders. On online card orders it depends on your plan: {payg.name} charges {payg.fee}, {pro.name} charges {pro.fee} once you pass {pro.included} in a month, and {unlimited.name} charges nothing. Online card payments also carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.',
   'No. {unlimited.name} has no HatchGrab fee on any order. Online card payments carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.',
   'all', null, 'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000003', 'fa000001-0000-4000-8000-000000000001', 3,
   'Is there a free trial, and what happens when it ends?',
   'Yes. Your first {trial.months} months are free with every feature unlocked, and you don’t need a card to start. When the trial ends you move to {trialEnd.name} ({trialEnd.price} a month). If you’d like a different plan, email us and we’ll switch you.',
   'Yes. Your first {trial.months} months are free with every feature unlocked, and you don’t need a card to start. When your trial ends, {trialEnd.name} is {trialEnd.price} a month. We’ll be in touch before then to set up payment.',
   'all',
   'CHECK (Cursor): a truck cannot choose a plan itself today — Billing''s Upgrade button only opens an email (manageBilling.upgradeModal.body: "drop us a message and we''ll get you set up within 24 hours"), and only Admin writes trucks.plan. So "unless you choose another plan" became "If you''d like a different plan, email us and we''ll switch you." Separately, some live sign-up text still says "free month … begins when you pick your first live event" (demoGetStarted.freeMonth, auth.signup.subtitle, demo.signupOffer.heading), but the trial is plans.trial_months and starts at signup (lib/provision-truck.ts).',
   'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000004', 'fa000001-0000-4000-8000-000000000001', 4,
   'Is there a contract? Can I cancel anytime?',
   'There’s no contract and no minimum term. You can close your account at any time from your settings, or by emailing us.',
   null, 'all', null, 'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000005', 'fa000001-0000-4000-8000-000000000001', 5,
   'What if I only trade part of the year?',
   '{payg.name} is {payg.price} a month, so in the months you’re not trading you pay nothing. You only pay {payg.fee} on online card orders when you take them.',
   null, 'plan:payg', null, 'faq-1 seed'),
-- ── Getting started ──
  ('fa000002-0000-4000-8000-000000000006', 'fa000001-0000-4000-8000-000000000002', 1,
   'How long does it take to set up?',
   'Upload a photo of your menu and see it working in under 60 seconds. When you’re ready, sign up to start your {trial.months}-month free trial, check your menu, add where and when you’re trading, and connect Stripe if you want online card payments. We then switch your ordering page on.',
   null, 'all',
   'CHECK (Cursor): a self-serve truck is created hidden and its orders are refused until Admin makes it public (app/api/setup/route.ts visibility ''hidden''; app/api/orders/submit/route.ts refuses while excluded), so I added "We then switch your ordering page on." Confirm that is how you want to describe it. Public signup is also behind the SIGNUP_PUBLIC setting, which I did not read. The sign-up wizard itself is Where you''re based › Your truck › Your menu; the schedule is added in Manage › Schedule and Stripe in Manage › Payments.',
   'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000007', 'fa000001-0000-4000-8000-000000000002', 2,
   'Do I need an iPad or special equipment?',
   'No. HatchGrab runs in the web browser on any phone, tablet or laptop, so you can use the devices you already have. {apps.sentence}',
   null, 'all', null, 'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000008', 'fa000001-0000-4000-8000-000000000002', 3,
   'Do my customers need to download an app?',
   'No. Customers order from a web page on their phone, from your link or QR code. There’s nothing to download and no account to create: they just give their name and email.',
   null, 'all', null, 'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000009', 'fa000001-0000-4000-8000-000000000002', 4,
   'Can I try it before I sign up?',
   'Yes. Upload a photo of your menu and HatchGrab builds a working demo from it: you place an order as a customer and watch it arrive on the kitchen screen. You only need an email address, and no card.',
   null, 'all', null, 'faq-1 seed'),
-- ── Orders and payments ──
  ('fa000002-0000-4000-8000-000000000010', 'fa000001-0000-4000-8000-000000000003', 1,
   'Can customers pay at the truck instead of online?',
   'Yes. With {payAtTruck}, customers order ahead and pay when they collect, so you can take orders without connecting a card processor. You can add online card payments at any time, on {plansWith.online_payments}.',
   null, 'all', null, 'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000011', 'fa000001-0000-4000-8000-000000000003', 2,
   'How do I get paid for online orders?',
   'Card payments go straight into your own Stripe account, and Stripe pays them out to your bank on its usual schedule for your country. HatchGrab never holds your money.',
   null, 'all', null, 'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000012', 'fa000001-0000-4000-8000-000000000003', 3,
   'Can I stop too many orders arriving at once?',
   'Yes. You set how much your kitchen can cook at once and how long it takes, and once a collection time is full, customers can’t pick it. You can also pause online orders for an event at any time.',
   null, 'all', null, 'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000013', 'fa000001-0000-4000-8000-000000000003', 4,
   'Do online and walk-up orders show on the same screen?',
   'Yes. Pre-orders, online orders and the orders you take at the window all show on one kitchen screen.',
   null, 'all', null, 'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000014', 'fa000001-0000-4000-8000-000000000003', 5,
   'What happens if I lose signal?',
   'Switch on offline protection and online ordering pauses automatically when you lose signal, so customers can’t place orders you won’t see. {apps.offline}',
   null, 'all',
   'CHECK (Cursor): offline protection is OFF until a truck switches it on (truck_vans.auto_pause_on_offline defaults to false; the monitor applies event › event type › van › off), so "Online ordering pauses automatically" became "Switch on offline protection and online ordering pauses automatically". The public landing line (landing.does.offlineBody) and /features say it pauses automatically with no condition — they may want the same change. The iPad and Android app queues walk-up orders offline in the code (lib/native/orderGate.ts, on any native platform), but the manual records it has never been tested on Android.',
   'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000015', 'fa000001-0000-4000-8000-000000000003', 6,
   'How do customers know their order is ready?',
   'Customers get an email confirming their order. If you switch on the order-ready step, they’re emailed again when you mark the order ready. You can also use your own buzzers, and HatchGrab records each order’s buzzer number, or call out the name on the ticket.',
   null, 'all',
   'CHECK (Cursor): what the code does — a confirmation email on every order (customers must give an email); a "ready" email only when the van''s order-ready step is on (order_ready_enabled, off by default), sent a few seconds after Mark ready with an undo; buzzers are the truck''s own pagers, set per van, with the number recorded on the order; the customer''s name is on the ticket. Not built: no WhatsApp, SMS or push message to customers (SMS order alerts are "coming soon"), and the order status page does not update live.',
   'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000016', 'fa000001-0000-4000-8000-000000000003', 7,
   'Can I show allergen information?',
   'Yes. A setup guide walks you through the allergens in each dish, using your country’s allergen list, and customers see them when they order. Where the law allows, you can show one allergen card for the whole menu instead.',
   null, 'all', null, 'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000017', 'fa000001-0000-4000-8000-000000000003', 8,
   'Do I need a card reader?',
   'No. You can take orders with no card hardware: customers pay at the truck or by card online. For walk-up orders you keep using the card machine you already have.',
   null, 'all', null, 'faq-1 seed'),
-- ── Reaching customers ──
  ('fa000002-0000-4000-8000-000000000018', 'fa000001-0000-4000-8000-000000000004', 1,
   'How do customers find where I’m trading?',
   'Your schedule page shows where and when you’re trading, with ordering for each stop. You can share its link, or put it on a web address you own.',
   null, 'all', null, 'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000019', 'fa000001-0000-4000-8000-000000000004', 2,
   'Does HatchGrab answer WhatsApp messages?',
   'Yes, on {plansWith.whatsapp_replies}. It auto-replies to questions like “Where are you tonight?” using your own menu and schedule. You connect your own WhatsApp Business number in your settings, and Meta may charge for some messages.',
   null, 'all', null, 'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000020', 'fa000001-0000-4000-8000-000000000004', 3,
   'Can HatchGrab make my weekly schedule posts?',
   'Yes, on {plansWith.schedule_graphics}. It fills your own design with the week’s stops, ready for you to download and post.',
   null, 'all', null, 'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000021', 'fa000001-0000-4000-8000-000000000004', 4,
   'Can I run more than one van?',
   'Yes. You can add vans yourself in your settings. Each van beyond those your plan includes is {payg.extraVan} a month on {payg.name}, {pro.extraVan} on {pro.name} and {unlimited.extraVan} on {unlimited.name}. Each van has its own kitchen capacity, collection times and offline settings; your menu and payments are shared.',
   'Yes. You can add vans yourself in your settings. Each van beyond those your plan includes is {unlimited.extraVan} a month. Each van has its own kitchen capacity, collection times and offline settings; your menu and payments are shared.',
   'all',
   'CHECK (Cursor): per-van settings are not fully independent — the menu, the plan, the Stripe account and the ordering link are shared across vans; capacity, collection intervals, offline protection, buzzers, the order-ready step and the printer are per van (lib/van-category-settings.ts). No extra van is charged yet ("TODO: Wire to Stripe billing"; manageSettings.vanBilling.note says it is processed manually), and manageSettings.vans.addConfirm tells every operator the van "will be charged … next billing cycle", even where the price is zero.',
   'faq-1 seed'),
-- ── About HatchGrab ──
  ('fa000002-0000-4000-8000-000000000022', 'fa000001-0000-4000-8000-000000000005', 1,
   'Which countries is HatchGrab available in?',
   'HatchGrab is available in {countries}.',
   null, 'all',
   'CHECK (Cursor): the list is every switched-on country, so it includes the United Arab Emirates, which is switched on (OBSERVED 1 November 2026) although you said it should stay off until you understand its laws better (manual §82.11).',
   'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000023', 'fa000001-0000-4000-8000-000000000005', 2,
   'How is HatchGrab different from a till like Square?',
   'HatchGrab is ordering and kitchen-screen software, not a till. It takes pre-orders, online orders and walk-up orders and shows them on your kitchen screen, and it works alongside the card machine you already use.',
   null, 'all', null, 'faq-1 seed'),
  ('fa000002-0000-4000-8000-000000000024', 'fa000001-0000-4000-8000-000000000005', 3,
   'Do I own my customers’ data?',
   'You control it. For your customers’ details, you’re the controller and HatchGrab is the processor: we use them only to run your ordering, never for our own marketing, and we don’t sell them or share them with other trucks. You can export your orders, with customers’ names, as a spreadsheet from Reports.',
   null, 'all',
   'CHECK (Cursor): please confirm. Sources — Terms §10.1: "you are the controller and we are the processor"; Privacy §2: "the truck is the controller of your order data … We process that data on their behalf, under their instructions"; Privacy §4: "We do not sell this data, use it for our own marketing, or share it with other trucks." The Reports CSV has names, items and totals but not emails or phone numbers, and order details are anonymised after 12 months.',
   'faq-1 seed')
on conflict (id) do nothing;

commit;

-- Verify (read-only) after running: see docs/faq-1-report.md §1.
