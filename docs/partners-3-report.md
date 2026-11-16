# partners-3 — second lists, social / DM contacts, slow country research (and the partner offer change)

16 November 2026 · Not deployed · Nothing sent · Approval mode stays ON

## Summary

- **The offer change (your partners-2 follow-up, §0) is done:**
  - nothing is defaulted, and codes are created by hand in each partner's drawer;
  - three deal kinds;
  - decision 1 = A is built;
  - "Needs offer" blocks every send;
  - the templates are approved with your edits, translated into 6 languages and created (56 rows);
  - the 13 site addresses are now primary.
- **Channels (item 1):** each partner has a contact channel and social links, shown as a small icon or link in the Contact column. Anything without a verified email shows **"You send / DM"**.
- **Import (item 2):** 49 organisations from the two lists, plus the 5 software rows from Gemini's table, were checked on the web and imported: 20 with a ✓ verified email (14 of them active). The pre-2024 associations are not_now ("inactive").
- **Research (item 3):** one country per agent, imported through the same verification. After Mexico, CO / CL / PE ran together. The rest go one at a time on a smaller model, at most 5 a day, to save your weekly usage. See §3 for progress.
- **Nothing can send to anything imported here.**
  - None of these countries has an outreach rule, so all are manual_only.
  - No partner has a code yet, so all show "Needs offer".
  - Approval mode is on.

## 🔴 For you

1. **The offer.** Every partner shows **"Needs offer"** until you create its code (deal + commission) in its drawer. Nothing is queued or sent before that.
2. **Mexico (MX) is not switched on** (`country_settings.enabled = false`). Its 11 imported rows are now `not_now`, "country not live". **Research is on hold after MX, PE, CL, CO, AR** (§3).
3. **New countries have no outreach rule.** A country with no `outreach_country_rules` row is manual_only, so PT, DK, NO, PL, CZ, HU, SI, PE, CL, SA, FI and every researched country show "You send" (once they have an offer). Add an "allowed" rule for a country only if you want its ✓ partners sent to automatically.
4. **A native-speaker read** of the fr / nl / de / es / it / sv templates is still advisable before the first real send. The back-translations are in Appendix A.

## Choices I made, for you to check

- **"Never sent" without an offer covers new emails, not replies.**
  - Admin's compose refuses a *fresh* email to a partner with no offer.
  - A reply to the partner's own message, and a test send, still go, because answering someone who wrote isn't outreach. Say if you want replies blocked too.
- **Percent off / fixed price at the move onto a paid plan:**
  - It applies when the plan is written:
    - billing's `setTruckPlan`, which covers an upgrade, a downgrade and the trial ending into a chosen plan;
    - Admin's plan change.
  - It runs once per truck.
  - **It never overwrites a promotional price you set by hand.** The deal waits, and the redemption notes why.
  - A deal for Pro doesn't apply on Unlimited; it waits for a move onto Pro.
  - "Any paid plan" skips Pay as you go, which has no monthly price.
  - A fixed price applies only in the truck's own currency, and only if it is below the standard price.
- **Inside the iOS app, a fixed-price deal shows no amount:** "a special price on Pro for 6 months" (App Store 3.1.1 / 3.1.3). The web and Android show the amount.
- **"Inactive" means the newest dated evidence is before 1 January 2024.** No date found counts as unknown, not inactive.
  - A month or year is stored as its first day; the note says so.
- **Single businesses** (Turnup Food Truck SA, Jakarta Food Truck) and **Futraki / Iskra Events** (a catering firm, with no "Futraki" festival found) are imported as not_now, with the reason in the note.
- **The four fta.team city sites' listed addresses** (info@sdfta.org, info@lvfta.org, info@bosfta.org, info@phlfta.org) are on domains that don't exist or aren't theirs. They are kept as alternates as you asked. An alternate is never sent to: it only feeds the do-not-contact list.
- **The templates' commission sentence was restructured in all six translations:** "For each member who moves to a paid plan, {{org}} receives {{commission}}". "There's 20% of plan fees…" reads badly in every one of them.
  - Italian also adds the word "commissione".
  - fr / es / it / nl / sv put the plan word in front of the name ("la formule Pro", "el plan Pro"…).
  - The meaning is unchanged (Appendix A).

## 0. The partner offer change (your partners-2 follow-up)

### 0.1 Nothing about the offer is defaulted; codes are made by hand
- **No automatic codes:** none existed, and none was created.
- **No defaults in the database:** migration `20261108` drops the commission columns' defaults. Every code must state its deal and its year 1 / year 2 commission (0 is allowed, but it must be typed).
- **No defaults in the form:**
  - The old Codes form pre-filled "2 extra months" and "20% / 10%". It's gone. The Codes panel now only lists codes.
  - A code is created in the **partner's drawer** ("New code for …"), and every field starts empty.
- **Three deal kinds.** All of them are data, applied through the existing plan / trial mechanisms:

| Deal | Stored as | Applied |
|---|---|---|
| Extra trial months | `extra_trial_months`, N | at the truck's creation: the trial end moves N months (Admin's "Extend trial" rule) — unchanged |
| % off a chosen plan (Pro / Unlimited / any paid plan) for N months | `percent_off`, %, months, `deal_plan_key` (null = any) | when the truck moves onto that paid plan (0.2) |
| Fixed monthly price on a chosen plan for N months | `fixed_price`, price in minor units, `deal_currency`, months, plan | when the truck moves onto that plan (0.2) |

- **The plans offered in the form** are read from the plan table: the active, public, non-trial plans (Pay as you go, Pro, Unlimited). Nothing is hardcoded.
- **The signup page and the demo:** Apply shows the new deals in the visitor's language, "20% off Pro for 6 months" or "Pro at €19 a month for 6 months".
  - This needed three new words × two namespaces in en-GB and all 48 languages.
  - Back-translations are in `docs/i18n/back/<locale>.json`.
  - `translation-check` reports structural 0 in every language.

### 0.2 Decision 1 = A: a price deal starts when the truck moves onto a paid plan
- **At signup:** the deal is recorded and the truck is attributed, as before.
- **The hook:** `lib/partner-codes-server.ts applyPartnerPrice` runs after every plan write. That covers billing's `setTruckPlan` (upgrade, downgrade, a trial ending into its chosen plan) and Admin's plan change.
- **What it writes:** the **existing promotional price** (`trucks.plan_price_override_minor / _until / _note`), from the truck's local today for N months. It applies only while the truck stays on that plan (the existing rule).
  - Example: 20% off Pro (£29), moving onto Pro on 1 December → £23.20 a month until 31 May.
- **Today:** it matters only once you create a percent-off or fixed-price code. Billing is off.

### 0.3 "Needs offer"
- **Definition:** a partner with no *usable* code (active, in date, not used up) **needs an offer**. "Next send" shows **Needs offer** for automatic, "You send" and DM partners alike, and the drawer says so.
- **It is never sent:**
  - the queue never plans it;
  - the sender skips it;
  - Admin's compose refuses a fresh email to it.
- **Which code an email uses:** `{{code}}`, `{{deal}}` and `{{commission}}` come from the partner's **newest usable code**, written in the email's language.

### 0.4 The templates: approved with your three edits, translated, created
- **The three edits:**
  - `{{features_url}}` is the partner's own country page (`https://www.hatchgrab.com/fr/features`, `/us/features`, `/uk/features`…), or `/features` for a country with no page;
  - associations' first contact has "It's free for {{org}} to take part." after the code and commission sentence;
  - associations' final email has "Thanks for reading."
- **Otherwise unchanged:** every email ends with the signature and the opt-out line.
- **Rows:** 56, `partner-<assoc|dir>-<step>-<en|fr|nl|de|es|it|sv>`, from migration `20261110`. The generator `scripts/partners-offer-templates.cjs` refuses a translation whose merge fields, paragraphs or ending differ from English. The truck composer doesn't list them.
- **New languages:** partners-3's new countries (pt, da, nb, pl, cs, …) have no template. They are manual anyway; their templates can be added the same way when you want them.

**The English text as created** (associations, first contact):
> Hi {{contact_name|there}},
>
> I run HatchGrab, an app for food trucks and street food traders: customers pre-order and pick a collection time, and the kitchen gets orders it can actually make.
>
> I'd like to give {{org}}'s members a simple offer: with the code {{code}} they get {{deal}} when they sign up. For {{org}}, there's {{commission}} for each member who moves on to a paid plan. It's free for {{org}} to take part. There's nothing to run on your side beyond sharing the code.
>
> Everything it does is on one page: {{features_url}}
>
> Would that be useful for your members? A one-line reply is plenty.

The other seven English templates are the partners-2 §5 drafts as you approved them. The final one ends "Thanks for reading.", and the directory first contact uses `{{features_url}}`. Every template is in `docs/partners-3/templates/en.json`.

**Rendered example** (French, a fixed price): « …avec le code Y, ils obtiennent la formule Illimité à 19 € par mois pendant 1 mois à leur inscription. Pour chaque membre qui passe à une formule payante, NCASS perçoit 12,5 % des frais d'abonnement la première année et 5 % la deuxième année. La participation est gratuite pour NCASS. »

### 0.5 The 13 site-published addresses
Migration `20261109`:
- The site's address is now primary and the listed one is an alternate.
- Each row is ✓ verified: seen on their site in partners-2, MX checked today.
- Status and auto_send are unchanged.

| Organisation | Primary now | Alternate (listed) |
|---|---|---|
| Phoenix Food Truck Association | help@foodtrucksphoenix.com | info@foodtrucksphoenix.com |
| Street Vendor Project (NYC) | svp@urbanjustice.org | info@streetvendor.org |
| FTA network — San Diego | info@ftasd.org | info@sdfta.org ⚠️ not theirs |
| FTA network — Las Vegas | info@ftalv.org | info@lvfta.org ⚠️ no domain |
| FTA network — Boston | info@ftabos.org | info@bosfta.org ⚠️ no domain |
| FTA network — Philadelphia | info@phifta.org | info@phlfta.org ⚠️ no mail |
| Melbourne Food Truck Collective / Welcome to Thornbury | info@welcometothornbury.com | hello@welcometothornbury.com |
| Food Truck Carnivale (SA Network) | info@eventpeople.com.au | info@foodtruckcarnivale.com.au |
| Greater Vancouver Food Truck Festival Collective | hello@greatervanfoodtruckfest.com | info@greatervanfoodtruckfest.com |
| YYC Food Trucks | hello@calgaryfoodtrucks.com | info@yycfoodtrucks.com |
| Mobile Cuisine | us@mobile-cuisine.com | editor@mobile-cuisine.com |
| Food Truck Empire | support@foodtruckempire.com | brett@foodtruckempire.com |
| StreetFoodApp (software, not_now) | info@streetfoodapp.com | contact@streetfoodapp.com |

### 0.6 Unchanged, as agreed
- Only the fta.team hub is auto-sendable from the US metro network. The four city sites stay not_now with auto_send off.
- Approval mode is ON (`outreach_settings.send_schedule.approval_mode = true`).

## 1. Contact channels (item 1)

- **Migration `20261107`** adds these columns to `partner_orgs`:
  - `channel`: email | contact_form | facebook | instagram | whatsapp | linkedin. The default is email, so every partners-2 row is unchanged.
  - `facebook_url`, `instagram_url`, `contact_form_url`.
  - `last_seen_active`: the date of the newest evidence.
  - `members_estimate`.
- **The Contact column:** a non-email channel shows as a small badge before the address (f, ◎, 📝, 💬, in). It links to the page when there is one. Nothing else in the table's layout changed.
- **"You send / DM":** a partner without an email that is reached through its channel shows **"You send / DM"** in Next send, or **"Needs offer"** until it has a code.
- **Only a ✓ verified email is ever sent automatically**, as in partners-2.

## 2. The second lists, verified and imported (item 2)

- **Input:**
  - `docs/partners-2/gemini-partner-list-2.md`: 22 rows in its csv blocks, plus the 5 software companies in its table.
  - `docs/partners-2/claude-leads-2026-11-16.csv`: 23 rows.
  - All parsed into `docs/partners-3/input.json`: 50 rows. "Asociación Mexicana de Food Trucks" appears in both lists and was imported once, so 49 organisations.
- **Method (partners-2's):**
  - Does the site load, and is it this organisation?
  - Does the exact address appear on the site or contact page?
  - `dig +short MX`.
- **Rows without an email:** we found the current Facebook / Instagram page or contact form, and the date of the newest post, news item or event (`last_seen_active`).
- **Evidence and import:**
  - Evidence: `docs/partners-3/verification-{a,b,c}.json`.
  - Generator: `scripts/partners-3-import.cjs lists`.
  - Migration: `20261112_partners_3_lists.sql`. Inserts only, and only where the same name + country or the same email isn't already there.
- **Status rules:**
  - Nothing since 2024 → not_now ("Inactive: …" in the note).
  - Software platforms → not_now.
- **Corrections from verification:**
  - Foodtruck.pt's info@ address has a typo on its own site, so press@ is used.
  - Foodtruck.pt and Foodtruck.dk are one operator (Venture 83).
  - "GoOut / NFCtron" and "FoodNotify / Orderman" are each two companies.
  - Food Truck Center Chile is a commercial consultancy.
  - The list's "14-10-2026 Perfil" date for the Asociación Argentina de Food Trucks is really 19 October 2014.
  - tlunch.com is a parked domain; TLUNCH is now Mellow's SHOP STOP.

| Organisation | Country | Type | Email | Channel | Address | Last seen | Status |
|---|---|---|---|---|---|---|---|
| Food Trucks Portugal | PT | directory | ✓ | email | geral@food-trucks.pt | 2026-09-04 | to_contact |
| Foodtruck.pt (Venture 83) | PT | directory | ✓ | email | press@foodtruck.pt | 2026-01-01 | to_contact |
| Street Food Market Austria Süd | AT | collective | ? | facebook | stefan@streetfoodmarket.at | 2026-10-18 | to_contact |
| Reffen (Copenhagen Street Food) | DK | collective | ✓ | email | info@reffen.dk | 2026-01-01 | to_contact |
| Aarhus Street Food | DK | collective | ✓ | email | kontakt@aarhusstreetfood.com | 2026-11-01 | to_contact |
| Foodtruck.dk | DK | directory | ✓ | email | info@foodtruck.dk | 2026-01-01 | to_contact |
| Vippa Oslo | NO | collective | ✓ | email | drift@vippa.no | 2026-11-01 | to_contact |
| Street Food Polska | PL | media | ✓ | email | kontakt@streetfoodpolska.pl | 2024-08-10 | to_contact |
| Futraki / Iskra Events | PL | collective | ✓ | email | ola@iskra-events.pl | 2025-05-04 | not_now |
| Manifesto Market Prague | CZ | collective | ✓ | email | info@manifesto.city | 2026-11-06 | to_contact |
| Street Food Park Bratislava | SK | collective | ? | facebook | — | 2026-10-01 | to_contact |
| Food Truck Show Hungary | HU | collective | ✓ | email | info@foodtruckshow.hu | 2026-05-10 | to_contact |
| Street Food Festival Romania | RO | collective | ? | contact_form | — | 2026-08-16 | to_contact |
| Athens Street Food Festival | GR | collective | ? | contact_form | — | 2026-03-13 | to_contact |
| Thessaloniki Street Food Festival | GR | collective | ? | instagram | soulfoodthessaloniki@gmail.com | 2026-05-24 | to_contact |
| Odprta kuhna (Open Kitchen Slovenia) | SI | collective | ✓ | email | info@odprtakuhna.si | 2026-10-01 | to_contact |
| APEFOODT (Asociación Peruana de Food Truck) | PE | association | ✓ | email | presidente@apefoodt.com | 2025-12-01 | to_contact |
| Asociación Mexicana de Food Trucks | MX | association | ? | email | — | 2016-08-10 | not_now |
| Food Truck Center Chile | CL | other | ✓ | email | contacto@foodtruckcenter.cl | 2026-11-01 | to_contact |
| Hida Food Truck Association (飛騨フードトラック協会) | JP | association | ? | contact_form | — | 2026-10-20 | to_contact |
| Truckat (تركّات) | SA | directory | ✓ | email | Yahala@truckatsa.com | 2025-12-20 | to_contact |
| Turnup Food Truck SA | ZA | directory | ✓ | email | info@turnupfoodtrucksa.co.za | 2025-02-01 | not_now |
| Asociación Argentina de Gastronomía Móvil (AsArGaM) | AR | association | ? | email | — | 2016-12-07 | not_now |
| Asociación Argentina de Food Trucks | AR | association | ? | email | — | 2015-10-01 | not_now |
| Asociación Food Truck de la República Argentina (AFTRA) | AR | association | ? | email | — | 2020-01-30 | not_now |
| Associação Brasiliense de Food Trucks | BR | association | ? | email | — | 2023-01-01 | not_now |
| Associação Paranaense de Food Trucks (APFT) | BR | association | ? | email | — | 2016-02-11 | not_now |
| Associação de Food Trucks e Comida de Rua da Bahia | BR | association | ? | email | — | 2015-12-09 | not_now |
| Aso Food Trucks Bogotá | CO | association | ? | email | — | 2015-07-25 | not_now |
| Asofoodtruck (Cali) | CO | association | ? | email | — | 2017-01-13 | not_now |
| Asociación Ecuatoriana de Food Trucks (AEF) | EC | association | ? | facebook | — | 2017-01-01 | not_now |
| Food Trucks DF | MX | association | ? | email | — | 2019-10-23 | not_now |
| Asociación Internacional de Foodtrucks y Franquicias Móviles | MX | association | ? | email | — | 2016-06-28 | not_now |
| Malaysian Food Truck Association (MAFTA) | MY | association | ? | email | — | 2022-07-09 | not_now |
| Kuala Lumpur Food Truck Entrepreneur Association (KLFTEA) | MY | association | ? | email | — | 2024-07-03 | to_contact |
| SME Mobile Truck Association (SMEMTA) | MY | association | ? | email | — | 2020-01-21 | not_now |
| Sarawak Bumiputera FoodTruck Association (SBFA) | MY | association | ? | email | — | 2019-04-03 | not_now |
| The Food Truck Association (India) | IN | association | ? | email | — | 2016-08-01 | not_now |
| Indonesian Food Truck Association / Jakarta Food Truck | ID | collective | ? | email | — | 2016-12-01 | not_now |
| Food Truck Association of the Philippines | PH | association | ? | email | — | 2013-12-08 | not_now |
| Truckers DXB | AE | collective | ? | instagram | — | 2019-10-14 | not_now |
| TLUNCH (mellow) | JP | software_platform | ? | contact_form | — | 2026-11-09 | not_now |
| Ruokarekkaralli | FI | collective | ✓ | email | matti@spiraaliperuna.fi | 2026-09-13 | to_contact |
| Street Food Carnival Helsinki | FI | collective | ? | facebook | — | 2016-01-31 | not_now |
| kanpla | DK | software_platform | ✓ | email | kanpla@kanpla.io | 2026-01-01 | not_now |
| Storyous | CZ | software_platform | ? | contact_form | — | 2026-01-01 | not_now |
| Dotykačka | CZ | software_platform | ✓ | email | info@dotykacka.cz | 2026-01-01 | not_now |
| GoOut / NFCtron | CZ | software_platform | ✓ | email | info@nfctron.com | 2026-11-01 | not_now |
| FoodNotify / Orderman | AT | software_platform | ✓ | email | office@orderman.com | 2024-01-01 | not_now |

## 3. The slow research (item 3)

> ⏸ **ON HOLD (Dominic, 16 November 2026): research is paused after MX, PE, CL, CO, AR.** The scheduled batches are cancelled: nothing resumes at 09:00 and no wait loop is running. **Any future research must skip countries that aren't live:** `country_settings.enabled = false`, or a country that can't sell or is held. The 11 Mexican rows already imported (MX isn't live) are now `not_now` with the note "country not live" (migration `20261117_partners_3_mx_hold.sql`).

- **The method:**
  - One country per batch, by a background agent, which writes `docs/partners-3/research/<cc>.json`.
  - Then the same import and verification: `node scripts/partners-3-import.cjs research <CC>` → a committed migration `<n>_partners_3_research_<cc>.sql` → `db-migrate`.
  - No wait between batches and no daily cap. You said the 60-minute pacing in the brief was meant for languages-world-3, not this. After Mexico, CO / CL / PE ran three at a time. Then, to save your usage, it went to one country at a time on a smaller model (Sonnet), about 20 searches each, and at most 5 countries a day.
- **What each batch looks for:**
  - national and regional associations;
  - street food collectives and markets that manage traders;
  - directories;
  - active Facebook groups of food truck owners (name, URL, member count).
- **Rule:** only emails actually published, each with its source URL, are recorded.
- **Order:** MX, CO, CL, PE, AR, UY, CR, EC, BR, PT, PL, CZ, RO, GR, TR, IL, AE, SA, ZA, MY, SG, PH, ID, TH, JP, KR, IN, then the other live countries.

| # | Country | Batch | Finished | Found | email ✓ | social-only | no route | inactive | dropped | Migration |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | MX ⚠️ not live | 1 | 16 Nov 17:10 | 8 | 0 | 1 | 4 | 3 | 0 | `20261111_partners_3_research_mx.sql` |
| 2 | CO | 2 | 16 Nov 17:50 | 5 | 0 | 1 | 0 | 3 | 0 | `20261115_partners_3_research_co.sql` |
| 3 | CL | 2 | 16 Nov 17:47 | 12 | 1 | 5 | 2 | 4 | 0 | `20261114_partners_3_research_cl.sql` |
| 4 | PE | 2 | 16 Nov 17:45 | 7 | 1 | 1 | 3 | 2 | 0 | `20261113_partners_3_research_pe.sql` |
| 5 | AR | 3 | 16 Nov 18:00 (Sonnet, light) | 4 | 0 | 0 | 3 | 1 | 0 | `20261116_partners_3_research_ar.sql` |
| 6 | UY | — | queued | | | | | | | |
| 7 | CR | — | queued | | | | | | | |
| 8 | EC | — | queued | | | | | | | |
| 9 | BR | — | queued | | | | | | | |
| 10 | PT | — | queued | | | | | | | |
| 11 | PL | — | queued | | | | | | | |
| 12 | CZ | — | queued | | | | | | | |
| 13 | RO | — | queued | | | | | | | |
| 14 | GR | — | queued | | | | | | | |
| 15 | TR | — | queued | | | | | | | |
| 16 | IL | — | queued | | | | | | | |
| 17 | AE | — | queued | | | | | | | |
| 18 | SA | — | queued | | | | | | | |
| 19 | ZA | — | queued | | | | | | | |
| 20 | MY | — | queued | | | | | | | |
| 21 | SG | — | queued | | | | | | | |
| 22 | PH | — | queued | | | | | | | |
| 23 | ID | — | queued | | | | | | | |
| 24 | TH | — | queued | | | | | | | |
| 25 | JP | — | queued | | | | | | | |
| 26 | KR | — | queued | | | | | | | |
| 27 | IN | — | queued | | | | | | | |

Day 1 (16 Nov): MX, PE, CL, CO, AR. ⏸ **Paused there.** The "queued" rows above are not scheduled. If research resumes, drop any country that isn't live first.

## 4. Counts per country (everything imported in partners-3)

Columns:
- **email ✓:** an address seen on their site, and its domain takes mail.
- **social-only:** reached through Facebook, Instagram or a contact form.
- **no route:** the organisation exists, but no contact was found.
- **inactive:** nothing since 2024.
- **dropped:** not found.
- **other not_now:** software platforms and single businesses.

| Country | email ✓ | social-only | ? email only | no route | inactive | dropped | other not_now |
|---|---|---|---|---|---|---|---|
| AE | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| AR | 0 | 0 | 0 | 3 | 4 | 0 | 0 |
| AT | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| BR | 0 | 0 | 0 | 0 | 3 | 0 | 0 |
| CL | 2 | 5 | 0 | 2 | 4 | 0 | 0 |
| CO | 0 | 1 | 0 | 0 | 5 | 0 | 1 |
| CZ | 1 | 0 | 0 | 0 | 0 | 0 | 3 |
| DK | 3 | 0 | 0 | 0 | 0 | 0 | 1 |
| EC | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| FI | 1 | 0 | 0 | 0 | 1 | 0 | 0 |
| GR | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| HU | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| ID | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| IN | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| JP | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| MX | 0 | 1 | 0 | 4 | 6 | 0 | 0 |
| MY | 0 | 0 | 0 | 1 | 3 | 0 | 0 |
| NO | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| PE | 2 | 1 | 0 | 3 | 2 | 0 | 0 |
| PH | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| PL | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| PT | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| RO | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| SA | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| SI | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| SK | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| ZA | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| **Total** | **16** | **14** | **0** | **13** | **33** | **0** | **9** |

## 5. Proof

- **`scripts/partners-2.cjs`: 78 checks, all pass.** Section 9 covers the offer:
  - no defaults;
  - the empty drawer form;
  - the three deals in words;
  - decision A on a sandboxed TEST truck, through the existing promotional price: applied once, never over a hand-set price, never on a trial;
  - the hooks;
  - the offer = the newest usable code;
  - "Needs offer" for automatic, "You send" and DM partners;
  - compose refusing;
  - translated offer values and the country features page;
  - the 56 templates and your three edits;
  - no partner template in the truck composer;
  - the 13 addresses;
  - the client-safety guard.
- **A bug caught before it shipped.** The admin table runs `lib/partner-programme.ts` in the browser, and the offer lookup first lived in a module that pulls in the server-only plan catalogue, so `/admin` failed to compile in `next dev`.
  - It moved to `lib/partner-offers.ts`.
  - A check now keeps it client-safe.
  - The typecheck could not see this; the screenshots did.
- **Screenshots** (`docs/partners-3/`, taken with `scripts/partners-3-screens.cjs` on `next dev`; the real imported rows; no codes except one labelled SAMPLE):
  - `partners-table-needs-offer.png`;
  - `partner-drawer-new-code.png` (the empty form);
  - `code-form-fixed-price.png`;
  - `code-card-percent-plan.png`;
  - `signup-percent-plan-390-en-GB.png`, `signup-fixed-price-390-en-GB.png`, `signup-fixed-price-390-fr-FR.png`.
- **Re-pin:**
  - The signup page's two new locale lines are named in `_named-partners-2.cjs`'s exact undo, so cwv-2 is 44/44.
  - loyalty-1, language-phase-1c/1e/2, messages-split, messages-parity and partners-1 rerun green.
- **Translation check:** structural 0 in all 48 languages after the new signup words.
- **The full sweep:** **226 run · 220 passed · 6 failed.** Five are the known missing translated legal files (paperwork-1, legal-languages-1, world-countries-3, contact-1, tidy-1), unchanged. The sixth, event-types-render, is a browser layout harness that touches no partner file. It passes when run alone (exit 0) and passed in the previous sweep, so it is flaky under sweep load. The earlier sweep on the offer commit failed cwv-2 on the signup page's two new lines; that is re-pinned and 44/44. Temp: nothing left behind.

## 6. Commits (this workstream's files only)

- `3b384980` partners-3 research: AR — 4 organisations (light batch on Sonnet: no contact links found); migration 20261116_partners_3_research_ar.sql
- `7545fafc` partners-3 research: CO — 5 organisations (IPES, a public agency, not_now); a non-email channel counts only with its link; migration 20261115_partners_3_research_co.sql
- `41cdad46` partners-3 research: CL — 12 organisations; migration 20261114_partners_3_research_cl.sql
- `f7b9f93b` partners-3 research: PE — 7 organisations (1 verified email, 1 contact form / social, 2 inactive); migration 20261113_partners_3_research_pe.sql
- `782a10a2` partners offer: the offer lookup moves to lib/partner-offers.ts (no server-only imports) — the admin table runs partner-programme's rules in the browser, and importing partner-codes-server there broke /admin…
- `9f17e9ab` partners offer: re-pin — the signup page's two locale lines named in _named-partners-2.cjs's exact undo (cwv-2 44/44); partners-3-screens.cjs; manual V16.32 (the partner programme section: codes by hand, thr…
- `4cd244ec` partners-3: the second lists (gemini-partner-list-2.md + claude-leads-2026-11-16.csv + the 5 software rows), verified on the web — 49 organisations (one listed twice): 16 verified email, social / contact for…
- `9b1a77e4` partners-3 research batch 1 (MX — not switched on): 8 organisations, 0 verified email, 1 social-only, 4 with no contact route, 3 inactive; import generator scripts/partners-3-import.cjs (partners-2 rules + c…
- `63668979` partners offer: partners-offer-templates.cjs listed with the one-off tools
- `659ece57` partners offer: no default deal or commission; codes created by hand in the partner's drawer (extra trial months / % off a chosen plan or any for N months / fixed monthly price on a plan for N months); decis…
- `9811cab5` partners offer: signup words for the new deal kinds — auth.signup.dealPercentOffPlan ("{pct}% off {plan} for N months"), dealFixedPrice ("{plan} at {price} a month for N months"), dealPlanOffer (the iOS app'…
- `30072bc7` partners offer: migrations 20261108 (deal types extra_trial_months | percent_off | fixed_price, deal plan / currency, no commission defaults, redemption price columns) and 20261109 (13 site-published address…
- `f56758c2` partners-3: migration 20261107 — partner_orgs.channel (email | contact_form | facebook | instagram | whatsapp | linkedin), facebook_url, instagram_url, contact_form_url, last_seen_active, members_estimate

## Undo (only if Dominic asks)

Each is a reversible migration you would run only on request. Nothing here has been run.

```sql
-- the imported rows (lists + research):
delete from public.partner_orgs where source like 'partners-3-%' and sequence_step is null
  and not exists (select 1 from public.outreach_messages m where m.partner_id = partner_orgs.id);
-- the templates:
delete from public.outreach_templates where slug like 'partner-%';
-- the 13 addresses back to the listed ones (one statement per row, e.g.):
update public.partner_orgs set email = 'info@foodtrucksphoenix.com', alternate_emails = '{}', verify_status = 'unverified'
 where name = 'Phoenix Food Truck Association' and email = 'help@foodtrucksphoenix.com';
-- the offer schema (only while no fixed_price code exists):
alter table public.partner_codes drop constraint partner_codes_deal_shape, drop constraint partner_codes_deal_type_check;
alter table public.partner_codes add constraint partner_codes_deal_type_check check (deal_type in ('extra_trial_months','percent_off'));
alter table public.partner_codes alter column pct_year1 set default 0, alter column pct_year2 set default 0;
```

## Appendix A. The partner templates: back-translations

These are literal English back-translations of the six translations, for checking meaning; the English originals are in §0.4. The translations themselves are in `docs/partners-3/templates/<lang>.json` and in the database rows `partner-<assoc|dir>-<step>-<lang>`. Each email ends with `{{signature}}` and `{{opt_out}}`, which are left out below.

### A.1 French (fr)

**Offer words:** extra months: "{n} additional months offered free" · % off: "{pct}% reduction for {months} months" · % off a plan: "{pct}% reduction on the {plan} plan for {months} months" · fixed price: "the {plan} plan at {price} per month for {months} months" · commission: "{y1}% of the subscription fees the first year and {y2}% the second year" / "{y1}% of the subscription fees during the first year" · greeting fallback: "to the whole team".

**Associations and collectives, First contact.** Subject: *A HatchGrab offer for the members of {{org}}*
> Hello {{contact_name|to the whole team}},
>
> I run HatchGrab, an application for food trucks and street food traders: customers order in advance and choose a pick-up time, and the kitchen receives orders that it can really prepare.
>
> I would like to propose a simple offer to the members of {{org}}: with the code {{code}}, they get {{deal}} when they sign up. For each member who moves to a paid plan, {{org}} receives {{commission}}. Participation is free for {{org}}. You have nothing to manage on your side, apart from sharing the code.
>
> Everything the application does fits on one page: {{features_url}}
>
> Could this be useful to your members? A one-line reply is more than enough.

**Associations and collectives, Chase 1 (+3 days).** Subject: *Re: A HatchGrab offer for the members of {{org}}*
> Hello {{contact_name|to the whole team}}, I simply wanted to check that this message reached the right person. The offer still stands: the code {{code}} allows the members of {{org}} to get {{deal}}, and {{org}} receives {{commission}}. I can gladly send you a short paragraph to slip into a newsletter.

**Associations and collectives, Chase 2 (+7 days).** Subject: *Re: A HatchGrab offer for the members of {{org}}*
> Hello {{contact_name|to the whole team}}, one last reminder and then I will not insist any more. If a members-only page or a newsletter suits you better than an email, I can write the text with the code {{code}}, which you will be able to use as it is.

**Associations and collectives, Final (+14 days).** Subject: *Re: A HatchGrab offer for the members of {{org}}*
> Hello {{contact_name|to the whole team}}, I will not chase you again. If it can be useful to you one day, the code {{code}} ({{deal}}) remains valid for the members of {{org}}. You only need to reply and I will take care of setting it up. Thank you for reading me.

**Directories and media, First contact.** Subject: *An offer for the readers of {{org}}*
> Hello {{contact_name|to the whole team}},
>
> I run HatchGrab: pre-ordering and pick-up times for food trucks. If you list tools for traders, or if you talk about them in your articles, I would like to offer a code to your readers: {{code}} entitles them to {{deal}}, and {{org}} receives {{commission}} for each reader who moves to a paid plan.
>
> A one-page summary: {{features_url}}
>
> Would you agree to include it? I gladly answer your questions and I can send you screenshots.

**Directories and media, Chase 1 (+3 days).** Subject: *Re: An offer for the readers of {{org}}*
> Hello {{contact_name|to the whole team}}, I simply wanted to check that my message reached you. The code {{code}} ({{deal}} for your readers, {{commission}} for {{org}}) is ready whenever it suits you.

**Directories and media, Chase 2 (+7 days).** Subject: *Re: An offer for the readers of {{org}}*
> Hello {{contact_name|to the whole team}}, if a short presentation text or a few screenshots can make the task of talking about it easier for you, I can send them to you. No obligation, either way.

**Directories and media, Final (+14 days).** Subject: *Re: An offer for the readers of {{org}}*
> Hello {{contact_name|to the whole team}}, this is my last message. The code {{code}} remains valid if you want it one day. Thank you for reading me.

### A.2 Dutch (nl)

**Offer words:** extra months: "{n} extra months free" · % off: "{pct}% discount for {months} months" · % off a plan: "{pct}% discount on the {plan} subscription for {months} months" · fixed price: "the {plan} subscription for {price} per month for {months} months" · commission: "{y1}% of the subscription fees in the first year and {y2}% in the second year" / "{y1}% of the subscription fees in the first year" · greeting fallback: "all".

**Associations and collectives, First contact.** Subject: *A member offer from HatchGrab for {{org}}*
> Dear {{contact_name|all}},
>
> I run HatchGrab, an app for food trucks and street food entrepreneurs: customers order in advance and choose a pick-up time, and the kitchen gets orders that it can really make.
>
> I would like to make the members of {{org}} a simple offer: with the code {{code}} they get {{deal}} when they sign up. For each member who switches to a paid subscription, {{org}} receives {{commission}}. Participation is free for {{org}}. You do not need to arrange anything else, except sharing the code.
>
> Everything the app does is on one page: {{features_url}}
>
> Would this be useful for your members? A reply of one line is more than enough.

**Associations and collectives, Chase 1 (+3 days).** Subject: *Re: A member offer from HatchGrab for {{org}}*
> Dear {{contact_name|all}}, I just want to check whether this message ended up with the right person. The offer still stands: with the code {{code}} members of {{org}} get {{deal}}, and {{org}} receives {{commission}}. I will gladly send you a short paragraph that you can include in a newsletter.

**Associations and collectives, Chase 2 (+7 days).** Subject: *Re: A member offer from HatchGrab for {{org}}*
> Dear {{contact_name|all}}, one more reminder and then I will let it rest. If a members' page or newsletter suits you better than an email, I can write the text with the code {{code}} for you, so that you can use it unchanged.

**Associations and collectives, Final (+14 days).** Subject: *Re: A member offer from HatchGrab for {{org}}*
> Dear {{contact_name|all}}, I will not send any more reminders. Should it ever come in handy: the code {{code}} ({{deal}}) stays valid for members of {{org}}. Just send a reply, then I will set it up. Thanks for reading.

**Directories and media, First contact.** Subject: *An offer for readers of {{org}}*
> Dear {{contact_name|all}},
>
> I run HatchGrab: ordering in advance and pick-up times for food trucks. If you list tools for vendors or write about them, I would like to offer your readers a code: with {{code}} they get {{deal}}, and {{org}} earns {{commission}} for each reader who switches to a paid subscription.
>
> A summary on one page: {{features_url}}
>
> Are you open to including it? I gladly answer questions or send screenshots.

**Directories and media, Chase 1 (+3 days).** Subject: *Re: An offer for readers of {{org}}*
> Dear {{contact_name|all}}, I just want to check whether this message has arrived. The code {{code}} ({{deal}} for your readers, {{commission}} for {{org}}) is ready whenever it suits you.

**Directories and media, Chase 2 (+7 days).** Subject: *Re: An offer for readers of {{org}}*
> Dear {{contact_name|all}}, if a short description or a few screenshots make it easier to write about it, I will gladly send them over. Entirely without obligation.

**Directories and media, Final (+14 days).** Subject: *Re: An offer for readers of {{org}}*
> Dear {{contact_name|all}}, this is my last message. The code {{code}} stays valid if you ever want to use it. Thanks for reading.

### A.3 German (de)

**Offer words:** extra months: "{n} free months extra" · % off: "{pct}% discount for {months} months" · % off a plan: "{pct}% discount on the {plan} plan for {months} months" · fixed price: "for {months} months {plan} for {price} per month" · commission: "{y1}% of the plan fees in the first year and {y2}% in the second year" / "{y1}% of the plan fees in the first year" · greeting fallback: "everyone".

**Associations and collectives, First contact.** Subject: *A member offer from HatchGrab for {{org}}*
> Hello {{contact_name|everyone}},
>
> I run HatchGrab, an app for food trucks and street food traders: customers order ahead and choose a collection time, and the kitchen gets orders that it can also really manage.
>
> I would like to make the members of {{org}} a simple offer: with the code {{code}} they receive {{deal}} when they sign up. For each member who switches to a paid plan, {{org}} gets {{commission}}. Taking part is free of charge for {{org}}. On your side there is nothing to do, except passing on the code.
>
> Everything the app can do is on one page: {{features_url}}
>
> Would that be useful for your members? An answer in one line is completely enough.

**Associations and collectives, Chase 1 (+3 days).** Subject: *Re: A member offer from HatchGrab for {{org}}*
> Hello {{contact_name|everyone}}, I just wanted to quickly ask whether this message reached the right person. The offer stands: with the code {{code}} the members of {{org}} receive {{deal}}, and {{org}} gets {{commission}}. I will gladly send you a short paragraph that you can put into a newsletter.

**Associations and collectives, Chase 2 (+7 days).** Subject: *Re: A member offer from HatchGrab for {{org}}*
> Hello {{contact_name|everyone}}, one last short reminder, then I will leave it be. If a members' page or a newsletter suits you better than an email, I will write you the text with the code {{code}}, and you can take it over as it is.

**Associations and collectives, Final (+14 days).** Subject: *Re: A member offer from HatchGrab for {{org}}*
> Hello {{contact_name|everyone}}, I will not get in touch again. If it is ever useful: the code {{code}} ({{deal}}) stays valid for members of {{org}}. Just reply, then I will set everything up. Many thanks for reading.

**Directories and media, First contact.** Subject: *An offer for readers of {{org}}*
> Hello {{contact_name|everyone}},
>
> I run HatchGrab: pre-orders and collection times for food trucks. If you list tools for traders or write about them, I would like to offer your readers a code: with {{code}} they receive {{deal}}, and {{org}} earns {{commission}} for each reader who switches to a paid plan.
>
> A summary on one page: {{features_url}}
>
> Would you be open to including that? I gladly answer questions or send screenshots.

**Directories and media, Chase 1 (+3 days).** Subject: *Re: An offer for readers of {{org}}*
> Hello {{contact_name|everyone}}, I just wanted to quickly ask whether my message arrived. The code {{code}} ({{deal}} for your readers, {{commission}} for {{org}}) is ready whenever it suits you.

**Directories and media, Chase 2 (+7 days).** Subject: *Re: An offer for readers of {{org}}*
> Hello {{contact_name|everyone}}, if a short text or a few screenshots make it easier to report on it, I will gladly send them to you. Entirely without pressure, either way.

**Directories and media, Final (+14 days).** Subject: *Re: An offer for readers of {{org}}*
> Hello {{contact_name|everyone}}, this is my last message. The code {{code}} stays valid, in case you would like to use it at some point. Many thanks for reading.

### A.4 Spanish (es)

**Offer words:** extra months: "{n} extra months free" · % off: "{pct}% discount for {months} months" · % off a plan: "{pct}% discount on the {plan} plan for {months} months" · fixed price: "the {plan} plan at {price} a month for {months} months" · commission: "{y1}% of the subscription fees the first year and {y2}% the second year" / "{y1}% of the subscription fees during the first year" · greeting fallback: "team".

**Associations and collectives, First contact.** Subject: *An offer from HatchGrab for the members of {{org}}*
> Hello, {{contact_name|team}}:
>
> I run HatchGrab, an application for food trucks and street food vendors: customers place their order in advance and choose a pick-up time, and the kitchen receives orders that it can really prepare.
>
> I would like to propose a simple offer to the members of {{org}}: with the code {{code}} they get {{deal}} when they sign up. For each member who moves to a paid plan, {{org}} receives {{commission}}. Taking part is free for {{org}}. On your side, there is nothing to manage apart from sharing the code.
>
> Everything the application does is on a single page: {{features_url}}
>
> Do you think it could be useful for your members? A one-line reply is enough.

**Associations and collectives, Chase 1 (+3 days).** Subject: *Re: An offer from HatchGrab for the members of {{org}}*
> Hello, {{contact_name|team}}. I just wanted to check that this message has reached the right person. The offer still stands: with the code {{code}}, the members of {{org}} get {{deal}}, and {{org}} receives {{commission}}. I will gladly send you a short paragraph that you could include in a newsletter.

**Associations and collectives, Chase 2 (+7 days).** Subject: *Re: An offer from HatchGrab for the members of {{org}}*
> Hello, {{contact_name|team}}. One last reminder and I will not insist any more. If a members' page or a newsletter suits you better than an email, I can write the text with the code {{code}} so that you can use it as it is.

**Associations and collectives, Final (+14 days).** Subject: *Re: An offer from HatchGrab for the members of {{org}}*
> Hello, {{contact_name|team}}. I will not insist again. If it is ever useful to you, the code {{code}} ({{deal}}) remains available for the members of {{org}}. You only have to reply and I will set it up. Thank you for reading me.

**Directories and media, First contact.** Subject: *An offer for the readers of {{org}}*
> Hello, {{contact_name|team}}:
>
> I run HatchGrab: orders in advance and pick-up times for food trucks. If you include tools for vendors in your listings or write about them, I would like to offer a code to your readers: {{code}} gives them {{deal}}, and {{org}} earns {{commission}} for each reader who moves to a paid plan.
>
> A summary on one page: {{features_url}}
>
> Would you be interested in including it? I will gladly answer your questions or send you screenshots.

**Directories and media, Chase 1 (+3 days).** Subject: *Re: An offer for the readers of {{org}}*
> Hello, {{contact_name|team}}. I just wanted to check that this message has reached you. The code {{code}} ({{deal}} for your readers, {{commission}} for {{org}}) is ready whenever it suits you.

**Directories and media, Chase 2 (+7 days).** Subject: *Re: An offer for the readers of {{org}}*
> Hello, {{contact_name|team}}. If a short text or some screenshots make it easier for you to talk about it, I will send them to you. With no commitment at all, whatever you decide.

**Directories and media, Final (+14 days).** Subject: *Re: An offer for the readers of {{org}}*
> Hello, {{contact_name|team}}. This is my last message. The code {{code}} remains available if you ever want it. Thank you for reading me.

### A.5 Italian (it)

**Offer words:** extra months: "{n} more months free" · % off: "{pct}% discount for {months} months" · % off a plan: "{pct}% discount on the {plan} plan for {months} months" · fixed price: "the {plan} plan at {price} a month for {months} months" · commission: "{y1}% of the subscription fees in the first year and {y2}% in the second year" / "{y1}% of the subscription fees in the first year" · greeting fallback: "to everyone".

**Associations and collectives, First contact.** Subject: *An offer from HatchGrab for the members of {{org}}*
> Good morning {{contact_name|to everyone}},
>
> I run HatchGrab, an app for food trucks and street food operators: customers order in advance and choose a pick-up time, and the kitchen receives orders that it really manages to prepare.
>
> I would like to propose a simple offer to the members of {{org}}: with the code {{code}} they get {{deal}} at the moment of signing up. For each member who moves to a paid plan, {{org}} receives a commission: {{commission}}. For {{org}} taking part is free. On your side there is nothing to manage, beyond sharing the code.
>
> Everything the app does is on a single page: {{features_url}}
>
> Could it be useful for your members? A one-line reply is enough.

**Associations and collectives, Chase 1 (+3 days).** Subject: *Re: An offer from HatchGrab for the members of {{org}}*
> Good morning {{contact_name|to everyone}}, I just wanted to check that this message reached the right person. The offer is still valid: with the code {{code}} the members of {{org}} get {{deal}}, and {{org}} receives a commission ({{commission}}). I will gladly send you a short paragraph to put in a newsletter.

**Associations and collectives, Chase 2 (+7 days).** Subject: *Re: An offer from HatchGrab for the members of {{org}}*
> Good morning {{contact_name|to everyone}}, one last reminder and then I will not insist any more. If a members' page or a newsletter is more convenient for you than an email, I can write the text myself with the code {{code}}, to use as it is.

**Associations and collectives, Final (+14 days).** Subject: *Re: An offer from HatchGrab for the members of {{org}}*
> Good morning {{contact_name|to everyone}}, I will not chase you any more. If one day it were useful to you, the code {{code}} ({{deal}}) remains valid for the members of {{org}}. Just reply and I will set everything up myself. Thank you for your attention.

**Directories and media, First contact.** Subject: *An offer for the readers of {{org}}*
> Good morning {{contact_name|to everyone}},
>
> I run HatchGrab: pre-orders and pick-up times for food trucks. If you list tools for operators or write about them, I would like to offer a code to your readers: with {{code}} they get {{deal}}, and {{org}} earns a commission ({{commission}}) for each reader who moves to a paid plan.
>
> A summary in one page: {{features_url}}
>
> Would you be interested in including it? I gladly answer any question and I can send you some screenshots.

**Directories and media, Chase 1 (+3 days).** Subject: *Re: An offer for the readers of {{org}}*
> Good morning {{contact_name|to everyone}}, I just wanted to check that the message had arrived. The code {{code}} ({{deal}} for your readers, {{commission}} for {{org}}) is ready whenever you prefer.

**Directories and media, Chase 2 (+7 days).** Subject: *Re: An offer for the readers of {{org}}*
> Good morning {{contact_name|to everyone}}, if a short text or a few screenshots made it easier for you to talk about it, I can send them to you. No commitment, in any case.

**Directories and media, Final (+14 days).** Subject: *Re: An offer for the readers of {{org}}*
> Good morning {{contact_name|to everyone}}, this is my last message. The code {{code}} remains valid, if one day you needed it. Thank you for your attention.

### A.6 Swedish (sv)

**Offer words:** extra months: "{n} extra free months" · % off: "{pct}% discount for {months} months" · % off a plan: "{pct}% discount on the {plan} subscription for {months} months" · fixed price: "the {plan} subscription for {price} per month for {months} months" · commission: "{y1}% of the subscription fees the first year and {y2}% the second year" / "{y1}% of the subscription fees during the first year" · greeting fallback: "to you all".

**Associations and collectives, First contact.** Subject: *A member offer from HatchGrab to {{org}}*
> Hi {{contact_name|to you all}},
>
> I run HatchGrab, an app for food trucks and street food sellers: the customers pre-order and choose a collection time, and the kitchen gets orders that it actually has time to cook.
>
> I would like to give the members of {{org}} a simple offer: with the code {{code}} they get {{deal}} when they register. For each member who moves over to a paid subscription, {{org}} gets {{commission}}. It is free for {{org}} to take part. There is nothing to run on your side beyond sharing the code.
>
> Everything the app does is on one page: {{features_url}}
>
> Would it be useful for your members? A reply of one line is plenty.

**Associations and collectives, Chase 1 (+3 days).** Subject: *Re: A member offer from HatchGrab to {{org}}*
> Hi {{contact_name|to you all}}, I just wanted to check that this reached the right person. The offer still applies: with the code {{code}} the members of {{org}} get {{deal}}, and {{org}} gets {{commission}}. I will gladly send a short paragraph that you can put into a newsletter.

**Associations and collectives, Chase 2 (+7 days).** Subject: *Re: A member offer from HatchGrab to {{org}}*
> Hi {{contact_name|to you all}}, one last reminder, then I will leave it. If a members' page or a newsletter suits you better than an email, I can write the text with the code {{code}} for you, so that you can use it as it is.

**Associations and collectives, Final (+14 days).** Subject: *Re: A member offer from HatchGrab to {{org}}*
> Hi {{contact_name|to you all}}, I will not get in touch again. If it ever becomes relevant, the code {{code}} ({{deal}}) still applies for members of {{org}}. Just reply, and I will arrange it. Thanks for reading.

**Directories and media, First contact.** Subject: *An offer for readers of {{org}}*
> Hi {{contact_name|to you all}},
>
> I run HatchGrab: pre-orders and collection times for food trucks. If you list or write about tools for sellers, I would like to offer your readers a code: {{code}} gives them {{deal}}, and {{org}} earns {{commission}} on each reader who moves over to a paid subscription.
>
> A summary on one page: {{features_url}}
>
> Would you be open to including it? I gladly answer questions or send screenshots.

**Directories and media, Chase 1 (+3 days).** Subject: *Re: An offer for readers of {{org}}*
> Hi {{contact_name|to you all}}, I just wanted to check that this arrived. The code {{code}} ({{deal}} for your readers, {{commission}} for {{org}}) is ready when it suits you.

**Directories and media, Chase 2 (+7 days).** Subject: *Re: An offer for readers of {{org}}*
> Hi {{contact_name|to you all}}, if a short text or a few screenshots would make it easier to write about it, I can send them over. No pressure in either direction.

**Directories and media, Final (+14 days).** Subject: *Re: An offer for readers of {{org}}*
> Hi {{contact_name|to you all}}, this is my last message. The code {{code}} still applies if you ever want to use it. Thanks for reading.

