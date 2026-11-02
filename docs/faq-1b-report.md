# faq-1b — the agreed FAQ question list (English only, admin only, nothing public)

*2 November 2026. On `main`, committed, not pushed, not deployed. **The migration is still NOT RUN.***

## 0 · Summary

- **Live check first (read-only Supabase):** `public.faq_items` and `public.faq_sections` do **not** exist live
  (`to_regclass` → NULL for both). So, as the brief says, **`20261056_faq_1.sql` was edited in place**. There is no second
  migration, and you run the one file.
- **The list:** 5 sections, **26 questions** (5 · 4 · 9 · 4 · 4), all drafts, positions renumbered.
  - Every kept question keeps its id.
  - `…0017` ("Do I need a card reader?") is deleted and folded into question 7.
  - New rows: `…0025` (menu and sold out), `…0026` (order ahead), `…0027` (help).
- **9 CHECK notes**, each starting "CHECK (Cursor): " (questions 1, 3, 6, 14, 15, 22, 23, 25, 26).
- **English only:** nothing translated, and no message key added or changed. translation-check still fails with exactly the
  three English-only `faq.phrases.*` keys in each of the 28 languages. That's **expected** until you approve the wording.
- **Nothing public changes:** the landing page for GB, US, BR and JP and `/llms.txt` hash exactly as at HEAD (harness §8).
- **Harness:** `scripts/faq-1.cjs` **182 / 182**.

## 1 · What changed from faq-1's seed, and why

| # | id | Change | Why / what was checked |
|---|---|---|---|
| 7 | …0007 | New question text; your answer, with "You don’t" typographic | It now covers the card reader. Your wording is true: Pay at Hatch needs no Stripe, and walk-ups use the truck's own machine |
| 9 | …0009 | New question text | Answer unchanged |
| 12 | …0012 | New question text. Answer reworded without jargon: "You tell HatchGrab how much you can cook at once and how long it takes … customers can’t choose it" | No "kitchen capacity". Still the truthful capacity wording (35.an-7; `landing.does.capacityBody`) |
| 13 | …0013 | New question text | Answer unchanged |
| 14 | …0014 | New question text ("…lose my internet connection?") | Answer and CHECK note kept as faq-1, as asked |
| 17 | …0025 | **New** | See below |
| 18 | …0026 | **New** | See below |
| — | …0017 | **Deleted** | Folded into question 7 |
| 19 | …0018 | New question text | Answer unchanged |
| 20 | …0019 | New question text | Answer unchanged ("Yes, on {plansWith.whatsapp_replies}. It auto-replies…") |
| 21 | …0020 | New question text. Answer rewritten | It says plainly: it fills your own design (week or single event), you download it, you post it yourself, nothing is posted automatically. The single-event posts are part of the same feature (`schedule_graphics`) |
| 22 | …0021 | New question text. Answer trimmed ("kitchen capacity" → "capacity"; "add vans to your truck") | CHECK note kept, with one line added: the answer covers vans under one truck; a second truck is a separate truck in HatchGrab, and I couldn't confirm an operator can add one themselves |
| 26 | …0027 | **New** | See below |

**The three new questions, as verified:**

- **17 · Can I change my menu or mark items as sold out?**
  - The menu is edited in Manage › Menu at any time (`app/api/manage/route.ts`: `upsert_item`, `toggle_item`).
  - During service the dashboard's stock list for the event has an Available switch, with grey meaning sold out (hidden from
    customers; `dashboard.stock.howAvailable`), and per-event limits. A category total and an item limit count down as orders
    come in, and the item sells out by itself (`dashboard.stock.how*`; `featuresPage.detail.stock_countdown`).
  - The sold-out switch and stock countdown are features no plan switches off.
  - In plain words: Manage › Menu for the menu, the dashboard's stock list for sold out and limits.
- **18 · Can customers order ahead for a later day or an event?**
  - Each stop has its own ordering link on the schedule page. A bare link goes to the earliest upcoming confirmed or open stop
    (`app/api/menu/[truckId]/route.ts`).
  - An **unconfirmed** stop takes no orders (`orderingAvailable = false`).
  - Customers pick a collection time: `trucks.time_selection_enabled` defaults to true (live column default).
  - For items the truck tags as pre-order items, "When pre-orders open" is a truck setting: as soon as the event is confirmed
    (the default, `preorder_open_rule = 'on_confirm'`), N days before, or on the day of the event. One order-by deadline
    rule applies (N hours before, or a daily cut-off) with what happens after it (sold out, or needs approval)
    (`manageSettings.preorders.*`; `lib/preorder.ts`; enforced at submit).
  - Pre-ordering is the `advance_preordering` feature, which no plan switches off.
  - The answer says exactly this, in plain words, with no figure.
- **26 · What help can I get if something goes wrong?**
  - The site offers two ways in: the support page (`/contact`), "Two ways to reach us — either way we will come back to you by
    email", with the address **hello@hatchgrab.com** (`app/contact/HatchGrabContact.tsx`) and a form.
  - The page's words are translated into every language, but the form (Tally) is English everywhere (manual §77.12).
  - No hours, response time or phone number is published. `country_settings.support_hours` exists, but no public page shows it.
  - The answer says only "Email us at hello@hatchgrab.com, or send us a message from our support page, and we’ll reply by
    email." The CHECK note asks you for the support details you want to promise.

**Length:** every answer is under 80 words (the longest is 57); the harness allows up to 85.

## 2 · The 26 questions — final wording (generated from the migration)

### Pricing

**1. How much does HatchGrab cost?**  `…0001`
- Answer (49 words): Each plan is per truck per month: {payg.name} {payg.price}, {pro.name} {pro.price} and {unlimited.name} {unlimited.price}. {payg.name} charges {payg.fee} on online card orders. {pro.name} includes your first {pro.included} of online orders each month, then charges {pro.fee}. {unlimited.name} has no HatchGrab fee on your orders. Walk-up orders never carry a HatchGrab fee.
- Single plan (23 words): There’s one plan: {unlimited.name}, {unlimited.price} per truck per month, with no HatchGrab fee on your orders. Walk-up orders never carry a HatchGrab fee.
- CHECK note: this matches the pricing section word for word in substance, but nothing is billed or charged yet: there is no subscription code, and platform_fee_enabled is false in every country (manual §81.3, §82.11). Confirm you are happy to state the fees before charging starts, as the pricing pages already do.

**2. Do you take a cut of every order?**  `…0002`
- Answer (48 words): Never on walk-up orders. On online card orders it depends on your plan: {payg.name} charges {payg.fee}, {pro.name} charges {pro.fee} once you pass {pro.included} in a month, and {unlimited.name} charges nothing. Online card payments also carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.
- Single plan (26 words): No. {unlimited.name} has no HatchGrab fee on any order. Online card payments carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.

**3. Is there a free trial, and what happens when it ends?**  `…0003`
- Answer (42 words): Yes. Your first {trial.months} months are free with every feature unlocked, and you don’t need a card to start. When the trial ends you move to {trialEnd.name} ({trialEnd.price} a month). If you’d like a different plan, email us and we’ll switch you.
- Single plan (38 words): Yes. Your first {trial.months} months are free with every feature unlocked, and you don’t need a card to start. When your trial ends, {trialEnd.name} is {trialEnd.price} a month. We’ll be in touch before then to set up payment.
- CHECK note: a truck cannot choose a plan itself today — Billing's Upgrade button only opens an email (manageBilling.upgradeModal.body: "drop us a message and we'll get you set up within 24 hours"), and only Admin writes trucks.plan. So "unless you choose another plan" became "If you'd like a different plan, email us and we'll switch you." Separately, some live sign-up text still says "free month … begins when you pick your first live event" (demoGetStarted.freeMonth, auth.signup.subtitle, demo.signupOffer.heading), but the trial is plans.trial_months and starts at signup (lib/provision-truck.ts).

**4. Is there a contract? Can I cancel anytime?**  `…0004`
- Answer (22 words): There’s no contract and no minimum term. You can close your account at any time from your settings, or by emailing us.

**5. What if I only trade part of the year?**  `…0005` — Show in: `plan:payg`
- Answer (27 words): {payg.name} is {payg.price} a month, so in the months you’re not trading you pay nothing. You only pay {payg.fee} on online card orders when you take them.


### Getting started

**6. How long does it take to set up?**  `…0006`
- Answer (50 words): Upload a photo of your menu and see it working in under 60 seconds. When you’re ready, sign up to start your {trial.months}-month free trial, check your menu, add where and when you’re trading, and connect Stripe if you want online card payments. We then switch your ordering page on.
- CHECK note: a self-serve truck is created hidden and its orders are refused until Admin makes it public (app/api/setup/route.ts visibility 'hidden'; app/api/orders/submit/route.ts refuses while excluded), so I added "We then switch your ordering page on." Confirm that is how you want to describe it. Public signup is also behind the SIGNUP_PUBLIC setting, which I did not read. The sign-up wizard itself is Where you're based › Your truck › Your menu; the schedule is added in Manage › Schedule and Stripe in Manage › Payments.

**7. Do I need an iPad, card reader or special equipment?**  `…0007`
- Answer (53 words): No. HatchGrab runs in the web browser on any phone, tablet or laptop, so you can use the devices you already have. You don’t need a card reader either: customers can pay at the truck or by card online, and for walk-up orders you keep using the card machine you already have. {apps.sentence}

**8. Do my customers need to download an app?**  `…0008`
- Answer (32 words): No. Customers order from a web page on their phone, from your link or QR code. There’s nothing to download and no account to create: they just give their name and email.

**9. Can I try HatchGrab before signing up?**  `…0009`
- Answer (39 words): Yes. Upload a photo of your menu and HatchGrab builds a working demo from it: you place an order as a customer and watch it arrive on the kitchen screen. You only need an email address, and no card.


### Orders and payments

**10. Can customers pay at the truck instead of online?**  `…0010`
- Answer (32 words): Yes. With {payAtTruck}, customers order ahead and pay when they collect, so you can take orders without connecting a card processor. You can add online card payments at any time, on {plansWith.online_payments}.

**11. How do I get paid for online orders?**  `…0011`
- Answer (29 words): Card payments go straight into your own Stripe account, and Stripe pays them out to your bank on its usual schedule for your country. HatchGrab never holds your money.

**12. Can I control how many orders I receive at once?**  `…0012`
- Answer (39 words): Yes. You tell HatchGrab how much you can cook at once and how long it takes, and once a collection time is full, customers can’t choose it. You can also pause online orders for an event at any time.

**13. Do online and walk-up orders appear on the same screen?**  `…0013`
- Answer (18 words): Yes. Pre-orders, online orders and the orders you take at the window all show on one kitchen screen.

**14. What happens if I lose my internet connection?**  `…0014`
- Answer (22 words): Switch on offline protection and online ordering pauses automatically when you lose signal, so customers can’t place orders you won’t see. {apps.offline}
- CHECK note: offline protection is OFF until a truck switches it on (truck_vans.auto_pause_on_offline defaults to false; the monitor applies event › event type › van › off), so "Online ordering pauses automatically" became "Switch on offline protection and online ordering pauses automatically". The public landing line (landing.does.offlineBody) and /features say it pauses automatically with no condition — they may want the same change. The iPad and Android app queues walk-up orders offline in the code (lib/native/orderGate.ts, on any native platform), but the manual records it has never been tested on Android.

**15. How do customers know their order is ready?**  `…0015`
- Answer (45 words): Customers get an email confirming their order. If you switch on the order-ready step, they’re emailed again when you mark the order ready. You can also use your own buzzers, and HatchGrab records each order’s buzzer number, or call out the name on the ticket.
- CHECK note: what the code does — a confirmation email on every order (customers must give an email); a "ready" email only when the van's order-ready step is on (order_ready_enabled, off by default), sent a few seconds after Mark ready with an undo; buzzers are the truck's own pagers, set per van, with the number recorded on the order; the customer's name is on the ticket. Not built: no WhatsApp, SMS or push message to customers (SMS order alerts are "coming soon"), and the order status page does not update live.

**16. Can I show allergen information?**  `…0016`
- Answer (39 words): Yes. A setup guide walks you through the allergens in each dish, using your country’s allergen list, and customers see them when they order. Where the law allows, you can show one allergen card for the whole menu instead.

**17. Can I change my menu or mark items as sold out?**  `…0025`
- Answer (54 words): Yes. You can change your menu at any time in Manage › Menu. During service, mark an item sold out in one tap from your dashboard’s stock list, and customers can’t order it. You can also set a stock limit for an event, and the item sells out by itself when it runs out.

**18. Can customers order ahead for a later day or an event?**  `…0026`
- Answer (57 words): Yes. Each of your upcoming stops has its own ordering link on your schedule page, and customers can order once you’ve confirmed the stop, picking a collection time. For items that need notice, you choose when pre-orders open (when the stop is confirmed, a set number of days before, or on the day) and an order-by deadline.


### Reaching customers

**19. How do customers find out where I’m trading?**  `…0018`
- Answer (28 words): Your schedule page shows where and when you’re trading, with ordering for each stop. You can share its link, or put it on a web address you own.

**20. Can HatchGrab automatically reply to customers’ WhatsApp messages?**  `…0019`
- Answer (35 words): Yes, on {plansWith.whatsapp_replies}. It auto-replies to questions like “Where are you tonight?” using your own menu and schedule. You connect your own WhatsApp Business number in your settings, and Meta may charge for some messages.

**21. Can HatchGrab help me create social media posts?**  `…0020`
- Answer (31 words): Yes, on {plansWith.schedule_graphics}. It fills your own design with your stops, for the week or a single event, ready for you to download. You post it yourself: nothing is posted automatically.

**22. Can I run more than one food truck or van?**  `…0021`
- Answer (49 words): Yes. You can add vans to your truck yourself in your settings. Each van beyond those your plan includes is {payg.extraVan} a month on {payg.name}, {pro.extraVan} on {pro.name} and {unlimited.extraVan} on {unlimited.name}. Each van has its own capacity, collection times and offline settings; your menu and payments are shared.
- Single plan (40 words): Yes. You can add vans to your truck yourself in your settings. Each van beyond those your plan includes is {unlimited.extraVan} a month. Each van has its own capacity, collection times and offline settings; your menu and payments are shared.
- CHECK note: per-van settings are not fully independent — the menu, the plan, the Stripe account and the ordering link are shared across vans; capacity, collection intervals, offline protection, buzzers, the order-ready step and the printer are per van (lib/van-category-settings.ts). No extra van is charged yet ("TODO: Wire to Stripe billing"; manageSettings.vanBilling.note says it is processed manually), and manageSettings.vans.addConfirm tells every operator the van "will be charged … next billing cycle", even where the price is zero. faq-1b: the answer covers vans under one truck. A second truck with its own menu is a separate truck in HatchGrab, and I couldn’t confirm an operator can add one themselves (trucks are created at signup or by Admin), so the answer doesn’t promise it.


### About HatchGrab

**23. Which countries is HatchGrab available in?**  `…0022`
- Answer (5 words): HatchGrab is available in {countries}.
- CHECK note: the list is every switched-on country, so it includes the United Arab Emirates, which is switched on (OBSERVED 1 November 2026) although you said it should stay off until you understand its laws better (manual §82.11).

**24. How is HatchGrab different from a till like Square?**  `…0023`
- Answer (34 words): HatchGrab is ordering and kitchen-screen software, not a till. It takes pre-orders, online orders and walk-up orders and shows them on your kitchen screen, and it works alongside the card machine you already use.

**25. Do I own my customers’ data?**  `…0024`
- Answer (52 words): You control it. For your customers’ details, you’re the controller and HatchGrab is the processor: we use them only to run your ordering, never for our own marketing, and we don’t sell them or share them with other trucks. You can export your orders, with customers’ names, as a spreadsheet from Reports.
- CHECK note: please confirm. Sources — Terms §10.1: "you are the controller and we are the processor"; Privacy §2: "the truck is the controller of your order data … We process that data on their behalf, under their instructions"; Privacy §4: "We do not sell this data, use it for our own marketing, or share it with other trucks." The Reports CSV has names, items and totals but not emails or phone numbers, and order details are anonymised after 12 months.

**26. What help can I get if something goes wrong?**  `…0027`
- Answer (18 words): Email us at hello@hatchgrab.com, or send us a message from our support page, and we’ll reply by email.
- CHECK note: this says only what the site offers today — the support page (/contact) says "Two ways to reach us — either way we will come back to you by email": the address hello@hatchgrab.com, and a form. The page’s words are in every language, but the form inside it (Tally) is in English everywhere (manual §77.12, known gap). The site publishes no hours, response time or phone number (country_settings.support_hours exists but no public page shows it). Tell me the support details you want to promise.


## 3 · Harness

`scripts/faq-1.cjs` — **182 / 182**. faq-1's checks, updated for 26 questions and 9 CHECK notes, plus faq-1b's own:
- the 26 ids in the agreed order; `…0017` gone and folded into question 7;
- every answer under about 80 words;
- question 12 without "capacity";
- question 21 says "your own design" and "nothing is posted automatically";
- question 26 has no digits, hours, "within" or phone number, and carries its CHECK note;
- still: every question reads correctly in every switched-on country (44); no digit, currency sign, plan name or country name
  outside a live value ("60 seconds" in question 6 the only exception); landing GB, US, BR, JP and `/llms.txt`
  byte-identical to HEAD.

**translation-check (expected failure):** 3 structural in each of the 28 languages (and their regional variants) — the three
English-only `faq.phrases.*` keys, unchanged since faq-1. They, and the harnesses that assert "0 structural" (france-1,
country-picker-1, 7 of world-countries-1's checks, 28 of europe-languages-1's, languages-1's catalog check), clear when you
approve the English and it is translated. faq-1b changed only the migration and this harness, so the rest of faq-1's sweep
picture (docs/faq-1-report.md §6) stands.

## 4 · After running the migration (localhost)

1. Run the read-only check (below). Expect 5 · 4 · 9 · 4 · 4, the 26 questions in the order above, and 9 CHECK notes.
2. Admin › FAQ: the summary shows "✓ Every question reads correctly in every country" and "Copy feedback for Claude (9)".
3. Copy feedback: 9 blocks, including question 26's request for your support details.
4. Preview as Brazil: question 22 shows its single-plan answer ("… {unlimited.extraVan} a month" → "R$ 149 a month").

```sql
-- per-section counts (expect 5 · 4 · 9 · 4 · 4) and CHECK notes per section
select s.position, s.title_en, count(i.id) as questions,
       count(i.id) filter (where i.status = 'draft') as drafts,
       count(i.id) filter (where i.note like 'CHECK (Cursor): %') as check_notes
from public.faq_sections s left join public.faq_items i on i.section_id = s.id
group by s.id, s.position, s.title_en order by s.position;

-- the 26 questions in order
select row_number() over (order by s.position, i.position) as n, s.title_en as section, i.position,
       right(i.id::text, 4) as id_end, i.question_en, i.status, i.show_in,
       (i.answer_single_plan_en is not null) as has_single_plan_answer
from public.faq_items i join public.faq_sections s on s.id = i.section_id
order by s.position, i.position;

-- CHECK-note count (expect 9) and total (expect 26); …0017 must be absent (expect 0)
select count(*) filter (where note like 'CHECK (Cursor): %') as check_notes, count(*) as questions,
       count(*) filter (where id = 'fa000002-0000-4000-8000-000000000017') as card_reader_row
from public.faq_items;
```

## 5 · Files

- `supabase/migrations/20261056_faq_1.sql` — the seed rewritten to the agreed list (schema unchanged). Still NOT RUN.
- `scripts/faq-1.cjs` — the new counts and faq-1b's checks.
- `docs/faq-1b-report.md` — this report.

## Undo (only if Dominic asks)

⛔ DO NOT RUN unless you have decided to remove the FAQ tables. It deletes every section, question and note.

```sql
begin;
drop table if exists public.faq_items;
drop table if exists public.faq_sections;
commit;
```
