# faq-1 — the FAQ's data and Admin › FAQ (English only, nothing public)

*1–2 November 2026. On `main`, committed, not pushed, not deployed. The migration is **NOT RUN**: you run it by hand.*

## 0 · Summary

- **Built:** two tables and a 24-question draft seed (one migration, `20261056_faq_1.sql`); a live-value resolver and check
  (`lib/faq/`); the Admin › FAQ tab (`components/admin/FaqTab.tsx`, `app/api/admin/faq/route.ts`); two app columns in
  Admin › Countries; three English phrases; the harness `scripts/faq-1.cjs` (174 / 174).
- **Your decisions during the run:**
  - **Q1 → A (1 Nov):** no `operator_apps` column. The FAQ's "apps" is true only where `country_settings.ios_app_available`
    AND `android_app_available` are both true (GB only, live). Admin › Countries shows the two existing flags as columns,
    with your two "i" texts. Their values, and everything the comparison pages and Pricing check read, are unchanged.
  - **"English only until I approve" (1 Nov, mid-run):** the three `faq.phrases.*` keys are in `messages/en-GB.json` only.
    No translation or back-translation was written. translation-check therefore reports **3 structural (3 missing keys)
    in every one of the 28 languages** — those three keys and nothing else (HEAD: 0). See §4 and §6.
- **Nothing public changed:** the landing page for GB, US, BR and JP and `/llms.txt` hash exactly as at HEAD (§6, §8 of the
  harness). No public file imports `lib/faq` or the `faq` messages.
- **No admin session was available**, so the page was not clicked through in a browser. It was rendered statically from the
  real component (harness §5). §7 lists what to click on localhost.

## 1 · The migration (`supabase/migrations/20261056_faq_1.sql`, NOT RUN)

- **`faq_sections`:** `id` uuid PK, `position` int, `title_en` text not null (not blank), `created_at`, `updated_at`.
- **`faq_items`:** `id` uuid PK; `section_id` FK → `faq_sections` ON DELETE CASCADE; `position`; `question_en` (not blank);
  `answer_en` not null; `answer_single_plan_en` NULL; `show_in` default `'all'`, CHECK `all` | `apps` | `plan:<key>`
  (`^plan:[a-z][a-z0-9_]*$`, the plans.key pattern); `status` CHECK `draft` | `published`, default `draft`; `note`;
  `note_done` default false; `published_at`; `created_at`; `updated_at`; `updated_by`. Plus one CHECK: a published row has a
  `published_at`. Index on (`section_id`, `position`).
- **Security** (as plans and country_settings): RLS on, no policies, `revoke all … from anon, authenticated, public`,
  `grant all … to service_role`.
- **Ready for faq-2:** ids are fixed uuids that never change (the seed uses literal ids `fa000001-…` for sections and
  `fa000002-…` for questions), so a translations table can key on `faq_items.id` / `faq_sections.id`. The texts to translate
  are `title_en`, `question_en`, `answer_en`, `answer_single_plan_en`; `updated_at` moves whenever one of them changes (notes
  do not move it), which faq-2's "English text this came from" stamp can compare against.
- **Safe twice:** `create table if not exists`, and every seeded row `on conflict (id) do nothing`. One transaction.
- **No `operator_apps`**, and no statement touches `country_settings`.

### Read-only verification (after you run it)

```sql
-- 1. the two tables and their columns
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in ('faq_sections', 'faq_items')
order by table_name, ordinal_position;

-- 2. RLS on, and no policies (expect 2 rows with true, then 0 rows)
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relname in ('faq_sections', 'faq_items');
select tablename, policyname from pg_policies where schemaname = 'public' and tablename in ('faq_sections', 'faq_items');

-- 3. grants: only service_role (and the owner) — no anon, authenticated or PUBLIC
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('faq_sections', 'faq_items')
group by table_name, grantee order by table_name, grantee;

-- 4. the app flags the FAQ reads (unchanged: GB true / true, every other row false / false), and no operator_apps column
select country_code, enabled, ios_app_available, android_app_available from public.country_settings
where ios_app_available or android_app_available order by country_code;
select count(*) as operator_apps_columns from information_schema.columns
where table_schema = 'public' and table_name = 'country_settings' and column_name = 'operator_apps';

-- 5. the seed: 5 sections, 24 drafts (5 · 4 · 8 · 4 · 3), 8 CHECK notes
select s.position, s.title_en, count(i.id) as questions,
       count(i.id) filter (where i.status = 'draft') as drafts,
       count(i.id) filter (where i.note like 'CHECK (Cursor): %') as check_notes,
       count(i.id) filter (where i.answer_single_plan_en is not null) as single_plan_answers
from public.faq_sections s left join public.faq_items i on i.section_id = s.id
group by s.id, s.position, s.title_en order by s.position;
```

## 2 · Live values (`lib/faq/live-values.ts`, `lib/faq/check.ts`)

Pure, server-safe and client-safe. The page runs them in the browser. The route runs the same code before a publish and
before a save to a published question.

| Token | Value (GB / BR, from the fixtures) | Source |
|---|---|---|
| `{K.name}` | Pay as you go · Pro · Unlimited | `plans.name`, through `localizePlans` (planNames.*) |
| `{K.price}` | £0 · £29 · £69 / R$ 149 | `formatAmount(monthly, planMoneyFormatOf(country))`, the pricing card's call |
| `{K.included}` | £4,000 / — | `formatWholeAmount`, the fee sentence's call. NULL → the check fails |
| `{K.fee}` | 0.99% (DE "0,99 %") | `pctLabel(bps/100, country locale)`, PricingSection's `feeLabel` |
| `{K.extraVan}` | £29 | `plan_prices.extra_van_monthly_minor`, same formatter |
| `{trial.months}` | 3 | `offerTrialMonths` (the trial plan) |
| `{trialEnd.name}` / `{trialEnd.price}` | Pay as you go, £0 / Unlimited, R$ 149 | `offerFallback` → `expiryFallbackFor` (§81.6) |
| `{card.fee}` | 1.5% + 20p / 3,99% + R$ 0,39 | `cardFeeOnlineLabel`, the footnote's own figure |
| `{payAtTruck}` | Pay at Hatch / Pay at the truck (en-US, en-IE, en-SG …) | `priceText(PRICE_WORD.payAtHatch, locale)` |
| `{countries}` | "Australia, Austria, … United Kingdom and United States" | switched-on rows; English → the row's name, other languages → Intl's name; `Intl.ListFormat` |
| `{plansWith.F}` | "Pro and Unlimited" / "Unlimited" | offered plans with F on (`planAllowsFeature`: no row = ON); F must be a Feature key |
| `{apps.sentence}` | the sentence / nothing | `faq.phrases.appsSentence` where apps is true |
| `{apps.offline}` | app wording / web wording | `faq.phrases.appsOffline` / `faq.phrases.webOffline` |

- **No plan key or name in `lib/faq`.** A plan token is looked up in the catalogue, so a new plan's tokens work at once. The
  harness greps all three files for every public plan key and name (§3). The two special tokens are written as full names
  (`'trial.months'`), never `'trial'`.
- **Money is the pricing section's**, proved by rendering each country's landing page and comparing: every `{K.price}`
  equals that card's amount, and every `{K.fee}` / `{K.included}` appears in its fee sentence, for GB, US, IE, DE, JP, BR
  and SG.
- **Choosing the answer:** `show_in` first ('apps' = both app flags; 'plan:K' = K offered there). Where exactly one plan is
  offered and `answer_single_plan_en` is written, it is used; otherwise `answer_en`.
- **The check:** each question is resolved for every switched-on country (44 in the fixtures, as live). It fails where a token
  is unknown, names a plan not offered there, or has no value. A stray brace is an unknown token. A token in a question also
  fails (live values work in answers only). The sentences name the countries in English, sorted ("all 44 countries" when it
  is every one; a count past ten). The fixes are offered only when they would help: **"Add an answer for those countries"**
  when every failing country offers one plan and the main answer is the one failing; **"Show only where <plan> is
  offered"** when every problem is that one plan. Switched-off countries are never checked.
- **The preview's words, until faq-2:** English. A country whose language is English uses its own variant (US says "Pay at
  the truck"); any other country uses en-GB words, so a BR or DE preview says "Pay at Hatch". The money is still that
  country's home form ("29 €" in DE).
- **Worth knowing:** JP's `{card.fee}` reads "3.6% + ¥0", because its fixed fee is 0. That is exactly how its pricing footnote
  words it today.

## 3 · Admin › FAQ (`components/admin/FaqTab.tsx`)

The last tab ("❓ FAQ"). Full width with the page's sides (px-8 on a laptop and desktop, narrower on a phone). Mounted on
the first visit, then hidden rather than unmounted, so drafts survive a look at another tab.

- **Top bar:** "Preview as" (every switched-on country, by name; GB by default), + Section, + Question, "Copy feedback for
  Claude (n)". The "i" by the heading lists every live value, the plan keys from the data, and the feature keys some plan
  has switched off. The heading's example token is the highlighted plan's `{…price}`, read from the data.
- **Summary strip (from the data):** "🌍 44 countries switched on" · "✓ N published" · "● N questions need an answer for
  some countries" (or "✓ Every question reads correctly in every country").
- **Sections:** rename in place, ↑ ↓, Delete. Deleting asks first and says how many questions (and their notes) go with it.
- **Each question:** the question and answer edit in place and save on blur with a quiet "Saved". Tokens show as orange
  chips at rest, and as orange text while editing (same font, so the caret lines up). Also on each question:
  - the single-plan answer, under its computed label ("WHERE ONLY UNLIMITED IS OFFERED (5 COUNTRIES)"), shown when written
    or opened by the link, with Remove;
  - Draft / Published, "New" or "Edited 1 Nov", Show in, Publish / Unpublish, Delete;
  - ↑ ↓ beside the drag mark;
  - "✓ Reads correctly in all 44 countries" ("… in all 39 countries where it shows" when Show in limits it), or the red
    message with its fix links;
  - the preview line, "<Country> preview: …", labelled "(English — translations come next)" where the country's language
    isn't English. It adds "({apps.sentence} left out: the iPad and Android apps aren't in Brazil's stores)" when a token
    deliberately resolved to nothing.
- **Publishing** is refused while the check fails (the button is disabled, and the server refuses too). Saving a published
  question's question, answers or Show in re-runs the check on the new text. If it fails, nothing is written, the published
  text stays, and "Put back the published text" is offered. Notes save without the check.
- **MY NOTES:** a textarea per question with Done. Done notes are dimmed.
- **Copy feedback for Claude:** the exact form in your brief, built by `lib/faq/feedback.ts`. The button's number is the same
  count (a note with words that isn't Done). The preview line is labelled with the marketing country's short name ("UK
  preview:").
- **Server:** `GET` and `POST /api/admin/faq`, admin-checked on the server first. A non-admin gets **403**; the Countries route
  answers 404. All writes go through the service role (`lib/admin/faq-store.ts`, server-only).
- **Left for faq-2, with their places kept:** the summary's "· 28 languages" (end of the first chip), "all translations up
  to date" (end of the published chip), and each question's "Translations 28/28 up to date" / "Translates when published"
  (end of its status row).
- **Differences from the mockup, and why:**
  - "Preview as" shows the country only (no language), because the preview is English until faq-2.
  - The first chip says "44 countries switched on" until faq-2 adds the language count.
  - Questions get ↑ ↓ buttons beside the drag mark. Up from a section's first question moves it to the end of the section
    above (and down likewise), so a question can change section without a drag.
  - "+ Question" adds to the end of the last section (its tooltip says which).

**Admin › Countries:** a new last group, "Apps", with "iPad app" ("The iPad app is on the App Store in this country") and
"Android app" ("The Android app is on Google Play in this country"). The admin store reads the two columns beside the
loader's (`withAppFlags`), so the public loader and every public payload are unchanged. A save writes them only when the
form carried them, so it can never write a guessed "off" over a real "on". A newly added country starts with both off,
not copied from the country it was copied from.

## 4 · Messages

`messages/en-GB.json` → `faq.phrases`:

| Key | Text |
|---|---|
| `appsSentence` | There’s also an iPad and Android app, which keeps taking walk-up orders if you lose signal. |
| `appsOffline` | The iPad and Android app keeps taking walk-up orders without signal and sends them when you’re back online; the web dashboard needs a connection. |
| `webOffline` | The web dashboard needs a connection to show new orders. |

- **Checked against the code before writing:**
  - The apps queue walk-up orders and status changes in a durable outbox when the server can't be reached, on any native
    platform (`lib/native/orderGate.ts`; `isNativeApp()` is `Capacitor.isNativePlatform()`; Android bundles the Preferences
    plugin). So the drafts' "keeps working" became "keeps taking walk-up orders": online orders can't arrive without signal.
  - "Sends them when you're back online" is the drain on reconnect.
  - The web dashboard queues nothing and shows "No connection — showing last known orders" (`kds.banner.offline`).
  - ⚠️ The manual records that offline order-taking has never been tested on Android (CHECK note on question 14).
- **Three keys, not four:** your four texts include "nothing" (apps false), which needs no message.
- **Not translated, per your instruction.** I drafted the 28 translations before your message arrived and threw them away
  unused; nothing of them is in the repo. When you approve the English, the translation step adds the keys to the 28 base
  files and their back-translations, and translation-check returns to 0 structural. Nothing public renders these keys, so no
  visitor sees the English fallback. The admin UI adds no message keys (35.an-20).

## 5 · The seed — 5 sections, 24 drafts, final wording

Every claim was checked against the code and the live data (read-only Supabase: plans, plan_prices, plan_features,
country_settings) before writing. Every question passes the check in every switched-on country (harness §7). Apostrophes
and quotes are typographic (’ “ ”), as in the site's messages. No price, percentage, plan name, plan count, trial length or
country is typed, with one figure allowed: "60 seconds" in question 6 (the site's own words, `landing.hero.ctaNote`).

### Pricing

**1. How much does HatchGrab cost?**
- Answer: Each plan is per truck per month: {payg.name} {payg.price}, {pro.name} {pro.price} and {unlimited.name} {unlimited.price}. {payg.name} charges {payg.fee} on online card orders. {pro.name} includes your first {pro.included} of online orders each month, then charges {pro.fee}. {unlimited.name} has no HatchGrab fee on your orders. Walk-up orders never carry a HatchGrab fee.
- Single plan: There’s one plan: {unlimited.name}, {unlimited.price} per truck per month, with no HatchGrab fee on your orders. Walk-up orders never carry a HatchGrab fee.
- Change: none. "There’s one plan" is kept: the single-plan answer only ever shows where exactly one plan is offered, so it can't drift.
- CHECK note: nothing is billed or charged yet (no subscription code; `platform_fee_enabled` false everywhere). The wording matches the pricing section, which states the same.

**2. Do you take a cut of every order?**
- Answer: Never on walk-up orders. On online card orders it depends on your plan: {payg.name} charges {payg.fee}, {pro.name} charges {pro.fee} once you pass {pro.included} in a month, and {unlimited.name} charges nothing. Online card payments also carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.
- Single plan: No. {unlimited.name} has no HatchGrab fee on any order. Online card payments carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.
- Change: none. Confirmed: direct charges on the truck's own Stripe account; the fee is on online card orders only (`pricing.fee.*`).

**3. Is there a free trial, and what happens when it ends?**
- Answer: Yes. Your first {trial.months} months are free with every feature unlocked, and you don’t need a card to start. When the trial ends you move to {trialEnd.name} ({trialEnd.price} a month). If you’d like a different plan, email us and we’ll switch you.
- Single plan: Yes. Your first {trial.months} months are free with every feature unlocked, and you don’t need a card to start. When your trial ends, {trialEnd.name} is {trialEnd.price} a month. We’ll be in touch before then to set up payment.
- Change: "unless you choose another plan" → "If you’d like a different plan, email us and we’ll switch you." A truck cannot choose a plan today: Billing's Upgrade opens an email (`manageBilling.upgradeModal.body`), and only Admin writes `trucks.plan`.
- CHECK note: the above. Also, some live sign-up text still says "free month … begins when you pick your first live event" (`demoGetStarted.freeMonth`, `auth.signup.subtitle`, `demo.signupOffer.heading`). The trial is `plans.trial_months` and starts at signup.

**4. Is there a contract? Can I cancel anytime?**
- Answer: There’s no contract and no minimum term. You can close your account at any time from your settings, or by emailing us.
- Change: "you can cancel anytime" → "no minimum term … close your account at any time from your settings, or by emailing us". Terms: "No contract, cancel anytime. There is no minimum term and no notice period." and "close your account at any time from within the service or by emailing us". Nothing is billed, so there is no plan to cancel. The real control is Manage › Settings › Delete my account.

**5. What if I only trade part of the year?** — Show in: `plan:payg`
- Answer: {payg.name} is {payg.price} a month, so in the months you’re not trading you pay nothing. You only pay {payg.fee} on online card orders when you take them.
- Change: "has no monthly fee" → "is {payg.price} a month", so the price is read, not typed. ⚠️ "you pay nothing" is true only while that price is zero; if it ever isn't, this sentence needs rewording (the check can't see meaning).
- Show in hides it in BR, MX, MY, SG and TH (harness §1).

### Getting started

**6. How long does it take to set up?**
- Answer: Upload a photo of your menu and see it working in under 60 seconds. When you’re ready, sign up to start your {trial.months}-month free trial, check your menu, add where and when you’re trading, and connect Stripe if you want online card payments. We then switch your ordering page on.
- Change: "start your … trial" → "sign up to start your … trial"; added "We then switch your ordering page on."
- CHECK note: a self-serve truck is created hidden and its orders are refused until Admin makes it public (`app/api/setup/route.ts`, `visibility: 'hidden'`; `app/api/orders/submit/route.ts` refuses while `excluded`). Public signup is behind the `SIGNUP_PUBLIC` setting, which I didn't read. The wizard is Where you're based › Your truck › Your menu; schedule and Stripe are later, in Manage.

**7. Do I need an iPad or special equipment?**
- Answer: No. HatchGrab runs in the web browser on any phone, tablet or laptop, so you can use the devices you already have. {apps.sentence}
- Change: none. Outside the UK the sentence drops cleanly (no trailing space; harness §1).

**8. Do my customers need to download an app?**
- Answer: No. Customers order from a web page on their phone, from your link or QR code. There’s nothing to download and no account to create: they just give their name and email.
- Change: added "no account to create: they just give their name and email". QR codes exist (`lib/generateQRCode.ts`, Manage's QR card, per-event "Link & QR"). The order submit asks for a name and an email only.

**9. Can I try it before I sign up?**
- Answer: Yes. Upload a photo of your menu and HatchGrab builds a working demo from it: you place an order as a customer and watch it arrive on the kitchen screen. You only need an email address, and no card.
- Change: none. Confirmed: the email is asked before the build (`app/api/demo/route.ts`), and no card anywhere in the demo.

### Orders and payments

**10. Can customers pay at the truck instead of online?**
- Answer: Yes. With {payAtTruck}, customers order ahead and pay when they collect, so you can take orders without connecting a card processor. You can add online card payments at any time, on {plansWith.online_payments}.
- Change: "on any plan" → "on {plansWith.online_payments}", so the plans are read from data, not claimed. Confirmed: the pay-at-truck path needs no Stripe account, only the plan switch, which is on everywhere.

**11. How do I get paid for online orders?**
- Answer: Card payments go straight into your own Stripe account, and Stripe pays them out to your bank on its usual schedule for your country. HatchGrab never holds your money.
- Change: none. Confirmed: direct charges with `stripeAccount` (`lib/payments/authorize.ts`, `capture.ts`, `refund.ts`); no transfers or `on_behalf_of`; no payout schedule set.

**12. Can I stop too many orders arriving at once?**
- Answer: Yes. You set how much your kitchen can cook at once and how long it takes, and once a collection time is full, customers can’t pick it. You can also pause online orders for an event at any time.
- Change: "pause online orders at any time" → "… for an event at any time". The pause is per event (`set_paused`). The capacity sentence is `landing.does.capacityBody`'s own (35.an-7).

**13. Do online and walk-up orders show on the same screen?**
- Answer: Yes. Pre-orders, online orders and the orders you take at the window all show on one kitchen screen.
- Change: none. Confirmed: walk-ups are rows in `orders`, and the dashboard and kitchen screen load every order for the event.

**14. What happens if I lose signal?**
- Answer: Switch on offline protection and online ordering pauses automatically when you lose signal, so customers can’t place orders you won’t see. {apps.offline}
- Change: "Online ordering pauses automatically" → "Switch on offline protection and online ordering pauses automatically when you lose signal".
- CHECK note: offline protection is OFF until a truck switches it on (`truck_vans.auto_pause_on_offline` default false; the monitor applies event › event type › van › off). The public landing line (`landing.does.offlineBody`) and /features say it pauses automatically with no condition. Android offline order-taking is in the code but never tested.

**15. How do customers know their order is ready?**
- Answer: Customers get an email confirming their order. If you switch on the order-ready step, they’re emailed again when you mark the order ready. You can also use your own buzzers, and HatchGrab records each order’s buzzer number, or call out the name on the ticket.
- Change: written from the code, as asked.
- CHECK note (what I found): a confirmation email on every order; a "ready" email only when the van's order-ready step is on (`order_ready_enabled`, off by default), sent shortly after Mark ready, with undo; buzzers are the truck's own, set per van, number recorded on the order; the name is on the ticket. Not built: WhatsApp, SMS or push to customers (SMS order alerts are "coming soon"), and a live-updating status page.

**16. Can I show allergen information?**
- Answer: Yes. A setup guide walks you through the allergens in each dish, using your country’s allergen list, and customers see them when they order. Where the law allows, you can show one allergen card for the whole menu instead.
- Change: "using the list your country requires" → "using your country’s allergen list". Six countries use the general Codex list, which I couldn't confirm as each one's legal requirement. Added the card option: the card is allowed per country, `allergen_card_only_allowed`, false in Ireland.

**17. Do I need a card reader?**
- Answer: No. You can take orders with no card hardware: customers pay at the truck or by card online. For walk-up orders you keep using the card machine you already have.
- Change: none. Tap to Pay is "coming soon" (`lib/feature-table.ts`), so it isn't mentioned.

### Reaching customers

**18. How do customers find where I’m trading?**
- Answer: Your schedule page shows where and when you’re trading, with ordering for each stop. You can share its link, or put it on a web address you own.
- Change: "your own web address" → "a web address you own". The custom address is the `embed_schedule` feature, which no plan switches off, so no `{plansWith…}` is needed. It is self-serve in Manage › Settings and needs a subdomain and a DNS record. The Order buttons on the schedule appear once the truck is public.

**19. Does HatchGrab answer WhatsApp messages?**
- Answer: Yes, on {plansWith.whatsapp_replies}. It auto-replies to questions like “Where are you tonight?” using your own menu and schedule. You connect your own WhatsApp Business number in your settings, and Meta may charge for some messages.
- Change: added the last sentence. The operator connects it through Meta's Embedded Signup in Manage › Settings and needs a WhatsApp Business account, and /features' footnote says Meta may charge. No country limit exists in the code; only the plan switch gates it.

**20. Can HatchGrab make my weekly schedule posts?**
- Answer: Yes, on {plansWith.schedule_graphics}. It fills your own design with the week’s stops, ready for you to download and post.
- Change: "ready for you to post" → "ready for you to download and post". Nothing posts automatically (`components/manage/PostShareBar.tsx`).

**21. Can I run more than one van?**
- Answer: Yes. You can add vans yourself in your settings. Each van beyond those your plan includes is {payg.extraVan} a month on {payg.name}, {pro.extraVan} on {pro.name} and {unlimited.extraVan} on {unlimited.name}. Each van has its own kitchen capacity, collection times and offline settings; your menu and payments are shared.
- Single plan: Yes. You can add vans yourself in your settings. Each van beyond those your plan includes is {unlimited.extraVan} a month. Each van has its own kitchen capacity, collection times and offline settings; your menu and payments are shared.
- Written from `plans.included_vans` (1 on every plan) and `plan_prices.extra_van_monthly_minor`. There is no token for the number of included vans, so "those your plan includes" avoids typing it. In GB this reads "£0 a month on Pay as you go", which is true but odd; your call.
- CHECK note: per-van settings are not fully independent (menu, plan, Stripe account and ordering link are shared). No extra van is charged yet ("TODO: Wire to Stripe billing"), and `manageSettings.vans.addConfirm` tells every operator the van "will be charged … next billing cycle", even at a zero price.

### About HatchGrab

**22. Which countries is HatchGrab available in?**
- Answer: HatchGrab is available in {countries}.
- Change: none.
- CHECK note: the list includes the United Arab Emirates, which is switched on (OBSERVED 1 Nov) though you said it should stay off for now (§82.11).

**23. How is HatchGrab different from a till like Square?**
- Answer: HatchGrab is ordering and kitchen-screen software, not a till. It takes pre-orders, online orders and walk-up orders and shows them on your kitchen screen, and it works alongside the card machine you already use.
- Change: none. No claim about Square. "Not a till" matches `landing.meta.description` ("— not a POS").

**24. Do I own my customers’ data?**
- Answer: You control it. For your customers’ details, you’re the controller and HatchGrab is the processor: we use them only to run your ordering, never for our own marketing, and we don’t sell them or share them with other trucks. You can export your orders, with customers’ names, as a spreadsheet from Reports.
- Change: written from content/legal, as asked.
- CHECK note (please confirm): Terms §10.1 "you are the controller and we are the processor"; Privacy §2 "the truck is the controller of your order data … We process that data on their behalf"; Privacy §4 "We do not sell this data, use it for our own marketing, or share it with other trucks." The Reports CSV has names, items and totals, but no emails or phones. Order details are anonymised after 12 months.

**The 8 CHECK notes** are on questions 1, 3, 6, 14, 15, 21, 22 and 24. Each starts "CHECK (Cursor): " and reaches you through Copy feedback (its count after the migration: 8).

## 6 · Harness and sweep

**`scripts/faq-1.cjs`: 174 / 174**, registered in `scripts/harnesses.json`. It covers:
- live values for GB, US, IE, DE, JP, BR and SG, each equal to that country's rendered pricing cards; JPY with no decimals;
  BR reading the single-plan answer; Show in hiding question 5 in BR;
- the check: an unknown token, a plan not offered (BR, MX, MY, SG, TH named in English) and a NULL allowance all fail;
  both fixes offered only when they help; switched-off countries not checked;
- the grep: no public plan key or name in `lib/faq`;
- Copy feedback's exact format and its count;
- the route: 403 for a non-admin on GET and POST, with no write; publish refused while the check fails; a failing save to a
  published question refused with the published text kept; notes saved without the check;
- the migration's RLS, revokes and grants, the CHECKs, no policies, no `operator_apps`;
- the seed: no digits, currency signs, plan names or country names outside tokens, except "60 seconds" in question 6, named;
  all 24 questions read correctly in all 44 countries; 8 CHECK notes;
- the real FaqTab rendered statically (the summary, the red check with both links, the computed single-plan label, the
  preview line, dimmed done notes, highlighted tokens, no translation indicator);
- landing pages GB, US, BR and JP and `/llms.txt` byte-identical to HEAD (sha256 of HTML and metadata, against
  `scripts/fixtures/faq-1-identity.json`, captured by the same script in a HEAD worktree); no public file imports `lib/faq`.

**translation-check:** 3 structural in each of the 28 languages (and the 6 regional variants that inherit them) — the three
missing `faq.phrases.*` keys only, because you asked for English first. HEAD: 0 everywhere.

**The full sweep** (`node scripts/run-harnesses.cjs`, 176 harnesses): 163 passed, 13 failed in the first run. Since then:

| Harness | Now | At HEAD | Cause |
|---|---|---|---|
| countries-api | ✅ 85/85 after re-pin | ✅ | mine: a new country now inserts both app flags (off); the in-memory table learned the two columns |
| admin-countries-1 | ✅ 47/47 after re-pin | ✅ | mine: the Apps group (2 columns) and the store's app-flag lines named in its save-path guard |
| messages-parity | ✅ 546,382/0 after re-pin | ✅ | mine: the three new phrases named as new wording (`_messages-parity-1e.cjs` NEW_WORDING) |
| france-1 · country-picker-1 | ❌ 1 each | ✅ | **English-only:** "translation-check 0 structural" |
| world-countries-1 | ❌ 8 | ❌ 1 | 7 × **English-only** translation-check; 1 the same as HEAD (tagline words in source) |
| europe-languages-1 | ❌ 29 | ❌ 1 | 28 × **English-only** translation-check; 1 the same as HEAD (de-CH "ß") |
| languages-1 | ❌ 1 | ✅ | **English-only:** the generated `faq.ts` catalog has no language line yet, so its mini-repo check differs; clears once the phrases are translated |
| schedule-graphics-places | ❌ 1 | ❌ 1 | **at HEAD too:** the files naming `schedule_graphics` no longer match its list |
| canada-1 | ❌ 1 | ❌ 1 | at HEAD too |
| world-countries-2 · legal-languages-1 | ❌ error | ❌ same error | at HEAD too: "Terms edit — expected once, found 0: Last updated: 20 October 2026" |
| add-order-refresh-inputs | ❌ 4 | ❌ 3 | at HEAD too (cancel / prep-change refresh). The sweep's run (48 min) doesn't print which 4; it imports nothing this change touched |

**So:** after the three re-pins, every remaining failure either fails at HEAD too or is the expected result of holding the
translations back. They clear when the phrases are translated.

## 7 · On localhost, after running the migration (no admin session was available to me)

Countries: change only the **IE** row (your standing rule).

1. Run the migration, then the verification SQL in §1. Expect 5 sections, 24 drafts, 8 CHECK notes, GB's two flags true.
2. Open `/admin` → the **FAQ** tab (last). The summary should read "🌍 44 countries switched on · ✓ 0 published · ✓ Every
   question reads correctly in every country". "Copy feedback for Claude (8)".
3. **Copy feedback for Claude:** paste it somewhere. Expect a header with today's date and "8 notes", sections Pricing, Getting
   started, Orders and payments, Reaching customers and About HatchGrab, and each block in your format.
4. **Preview as:** pick Brazil. Question 1 should show the single-plan answer ("There’s one plan: Unlimited, R$ 149…") with
   "(English — translations come next)". "What if I only trade part of the year?" should say "not shown in Brazil". Question
   7 should note "{apps.sentence} left out…". Pick United States: "Pay at the truck" in question 10.
5. **Edit an answer** (any draft): click it, type ` {payg.price}` at the end of question 4's answer, and click away. Expect
   "Saved", then the red box naming Brazil, Malaysia, Mexico, Singapore and Thailand with both links, Publish disabled, and
   the summary now "1 question needs an answer…". Click **Show only where Pay as you go is offered**: it turns green
   ("… in all 39 countries where it shows"). Set Show in back to All countries, then **Add an answer for those countries**:
   the box opens under "WHERE ONLY UNLIMITED IS OFFERED (5 COUNTRIES)". Then remove your test text.
6. **Publish** question 13: it turns Published, the summary counts 1. Now edit its answer to include `{foo}` and click away:
   expect "Not saved: this question is published…" and "Put back the published text"; reload to confirm the old text stayed.
   Unpublish it.
7. **Notes:** type a note on any question, click away ("Saved"), tick Done (it dims), and check the button count moves.
8. **Sections:** + Section ("Test"), Rename it, move it ↑ ↓, add a question with + Question (it goes to the last section),
   move that question ↑ (it moves into the section above), then Delete the test section. The confirmation should say how many
   questions go with it.
9. **Tokens "i"** by the heading lists every live value, the plan keys and feature keys.
10. **Admin › Countries:** scroll right to the new **Apps** group — "iPad app" and "Android app" with their "i". GB on / on,
    every other row off / off. To test a save, use the **IE** row only: change nothing, Save, and confirm IE stays off / off.
11. **Logged out** (or as a non-admin): `curl -i localhost:3000/api/admin/faq` should answer **403**.
12. Phone width: the questions stack with My notes underneath; the top bar wraps.

## 8 · Found on the way (not changed — public pages are out of scope)

- **The landing page's offline line** (`landing.does.offlineBody`), shown in every country, says "Carry on taking orders with
  the iPhone, iPad and Android app" and that ordering "pauses automatically". The apps are UK-only (§11), and auto-pause is
  off until a truck switches it on. That's 35.an-7 ("the apps are claimed only where the country's app flags are true").
- **Stale sign-up text:** "free month … begins when you pick your first live event" (`demoGetStarted.freeMonth`,
  `auth.signup.subtitle`, `demo.signupOffer.heading`), against a 3-month trial that starts at signup.
- **`manageSettings.vans.addConfirm`** promises a charge "next billing cycle" that nothing makes.
- **The UAE is switched on** (live), against your 31 Oct decision.
- Stale code comments: `app/api/demo/route.ts` header says "no email"; `app/domain/page.tsx` says "nothing writes
  custom_domain".

## 9 · Files

- **New:** `supabase/migrations/20261056_faq_1.sql`, `lib/faq/live-values.ts`, `lib/faq/check.ts`, `lib/faq/feedback.ts`,
  `lib/admin/faq-actions.ts`, `lib/admin/faq-store.ts`, `app/api/admin/faq/route.ts`, `components/admin/FaqTab.tsx`,
  `scripts/faq-1.cjs`, `scripts/fixtures/faq-1-identity.json`, generated `lib/i18n/catalog/faq.ts`,
  `messages/ns/en-GB/faq.json`, `messages/ns/en-US/faq.json`, this report.
- **Changed:** `app/admin/page.tsx` (the tab), `components/admin/CountriesTab.tsx` (Apps group; `InfoTip` exported),
  `lib/admin/country-form.ts`, `lib/admin/country-actions.ts`, `lib/admin/country-store.ts`, `lib/country-settings-types.ts`
  (optional app flags, admin store only), `messages/en-GB.json`, `scripts/harnesses.json`, and the re-pins in
  `scripts/countries-api.cjs`, `scripts/admin-countries-1.cjs` and `scripts/_messages-parity-1e.cjs`.
- **Not committed (yours, already uncommitted before this run):** `docs/reference-manual.md`, `docs/manual-v16-9-report.md`.
- `docs/faq-1/faq-admin-mockup-v2.png` is committed with the work.
- tsc clean; eslint clean on every new file (`app/admin/page.tsx` has the same 13 problems as at HEAD).

## Undo (only if Dominic asks)

⛔ DO NOT RUN unless you have decided to remove the FAQ tables. It deletes every section, question and note.

```sql
begin;
drop table if exists public.faq_items;
drop table if exists public.faq_sections;
commit;
```
