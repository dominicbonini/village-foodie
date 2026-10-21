# ireland-2 — getting Ireland ready to switch on

**Date:** 21 October 2026 · **Branch:** `main`, on top of `fcde8b09`, uncommitted · nothing pushed or deployed ·
**Ireland stays switched OFF** (read-only check, 21 Oct: `country_settings` IE `enabled = false`).

## Summary

1. **The /compare fee box now shows "c" for EUR.** GB still shows "p" and the US "¢". /uk/compare and /us/compare
   are proved byte-identical before and after. One product line changed, plus comments.
2. **The Irish terms section is drafted (§2), not applied.** `TERMS_VERSION` is unchanged and no legal file was
   touched. There are eight flags for a lawyer or accountant. The two biggest:
   - an EU representative under GDPR Article 27 is **probably required**;
   - EU VAT on our fees to small Irish trucks without a VAT number may be **due from the first euro**.
3. **The Irish test truck can't be created by signup or Admin while Ireland is off**: both refuse a switched-off
   country (by design). The safest route (§3):
   - a **fresh test sign-in account** signs up a GB truck;
   - one guarded NOT RUN SQL block turns it into a hidden Irish test truck.

   That keeps a Stripe **test** account away from your real operator row.
   - **Card orders in TEST mode work with no code change.** They need test keys and the Stripe CLI listener for the
     localhost session (§3.3).
   - **Apple Pay can't be tested on localhost.**
4. **I ran the non-payment path on an Irish fixture truck (§3.5).** The confirmation, ready and refund emails, the
   printed ticket and the allergen list all show €, 24-hour Dublin times, "Pay at the truck on collection", "EUR
   28.00" on the ticket, and uk14.
5. **The Stripe checklist is in §4 and the switch-on day is in §5.**
6. **Proof:**
   - tsc is clean;
   - the build passes;
   - lint shows no new errors in product files;
   - **full sweep: 150 of 150 pass**;
   - the new harness `ireland-2` (16 checks) is registered;
   - **no re-pin was needed** for the /compare unit, because nothing else pinned that span for EUR.
7. **Manual and standing rule:** the §76.1 testing-rule line now says Ireland column only (strike +
   `⛔ Corrected V16.3`). Two related V16.3 notes (§76.1, §27) are marked resolved. The rule is also saved to my
   memory.

**The prompt** arrived intact; nothing was garbled and nothing contradicted. One thing to know: the brief's example,
"admin creating a truck with country IE", is refused by the code while IE is off (`lib/provision-truck.ts:432`, used
by both `/api/setup` and `/api/admin/create-truck`). §3 works around it with SQL instead of changing the guard.

---

## 1 · The /compare fee box unit (item 1)

**The bug:**
- The "per order" box takes minor units, and showed `minorUnitSuffix(currency)`.
- That helper answers only for currencies whose **sentences** write small fees in the minor unit (GBP "20p", USD
  "30¢").
- EUR writes "€0.25" in sentences (decided in ireland-1), so it returned null, and the box had no unit.

**The fix** (`app/compare/CostComparison.tsx:38, 704-707`): the box reads the registry's `minorUnitSign(currency)`.
This is the same helper Admin › Countries uses beside its boxes. It gives "p" / "¢" / "c" and never affects a
sentence. `lib/money-format.ts` comments were updated to say who uses which helper.

| Page | Before | After |
|---|---|---|
| /uk/compare | p | p (**byte-identical page**) |
| /us/compare | ¢ | ¢ (**byte-identical page**) |
| /ie/compare (fixture, IE on) | *(empty)* | **c** — and the sentences still say "1.5% + €0.25" |

**Proof** (`scripts/ireland-2.cjs` §1–3, registered):
- **The comparison:** /uk, /us and /ie compare are rendered twice. Once with today's code, once with the box patched
  back to `minorUnitSuffix`.
- **GB and US are identical:**
  - /uk/compare: 22,535 characters, sha `02742f96767ec03c`, both ways;
  - /us/compare: 23,771 characters, sha `9fad2e462eb3e8ef`, both ways.
- **IE differs in that one span only.**
- **For every registry currency,** the sign equals the old suffix wherever the old suffix existed: GBP p, USD ¢, CAD ¢,
  AUD c, NZD c.
- **Where it changes:** only where the old suffix was null. That is EUR → c, plus CHF Rp, SEK öre, NOK/DKK øre,
  PLN gr, CZK h, HUF f and RON bani, which no live or planned row uses yet. Each is the unit of the cents the box
  holds.

## 2 · The Irish terms section — DRAFT FOR YOUR APPROVAL (item 2)

**Where it would go:** `content/legal/country-specific-terms.md`, after the United States section. It follows the
same shape: "For food truck operators", then "Privacy, for everyone in Ireland".

**When you apply it:** move `COUNTRY_TERMS_UPDATED` in `lib/legal.ts` and the page's "Last updated" together. Today
both are 19 October 2026.

**Not done here:** I didn't change `TERMS_VERSION` and didn't touch any legal file. Bracketed **[FLAG n]** markers
point to §2.2 and must be resolved before the text is published.

### 2.1 The draft

> ## Ireland
>
> ### For food truck operators
>
> **You are the seller.** You sell your food, and you are the merchant of record for your card payments, as section 5
> of the Terms of Service says. Your customers' order is with you, not with us. Irish consumer law, including the
> Consumer Rights Act 2022, applies to your sales to your customers, and you are responsible for meeting it. That
> includes giving your customers your business name and contact details, showing prices that include VAT, and dealing
> with complaints, cancellations and refunds. HatchGrab is the software you sell through. **[FLAG 5]**
>
> **Card payments.** Card payments from your customers go into your own Stripe account, which is set up for Ireland
> during onboarding, in your own name, under your own agreement with Stripe. The money settles there, in euro, and is
> paid out to your bank account by Stripe. We never hold it. Stripe's processing fees for Irish accounts are set by
> Stripe and shown in HatchGrab and during onboarding.
>
> **Allergens.** You must give allergen information for every dish as Irish and EU law requires: the 14 allergens
> listed in Regulation (EU) No 1169/2011, under the Irish rules the Food Safety Authority of Ireland enforces (S.I. No.
> 489 of 2014, as amended). For orders placed online, that information has to be available in writing before your
> customer orders. HatchGrab shows exactly what you enter, as section 3 of the Terms of Service says. We do not check
> it. **[FLAG 6]**
>
> **Your prices and VAT.** Your menu prices are shown to customers including VAT. You are responsible for registering
> for, charging and paying VAT correctly. If you set a VAT rate in HatchGrab, we show it at the rate you set. We do not
> check it.
>
> **Our prices.** Accounts in Ireland are billed in euro. HatchGrab Ltd is a UK company and is not registered for VAT.
> **[FLAG 2]** If you are registered for VAT in Ireland, give us your VAT number. You then account for any VAT on our
> fees yourself, under the reverse charge.
>
> **Your rights under local law.** Nothing in the Terms of Service takes away a right that Irish law says cannot be
> limited or waived.
>
> **Your customers' data.** Under the EU General Data Protection Regulation (GDPR), section 10 of the Terms of Service
> is our data processing agreement with you: you are the controller and we are the processor, in the same sense as
> Article 28 of the GDPR. **[FLAG 1]**
>
> **Notices and governing law.** Notices work as section 12 of the Terms of Service says: we contact you at the email
> address on your account, and you can reach us at the address below. These terms are governed by the law of England
> and Wales, and the courts of England and Wales have jurisdiction. This does not take away any protection that Irish
> law gives you and that cannot be excluded by agreement. **[FLAG 3]**
>
> ### Privacy, for everyone in Ireland
>
> **The law that applies.** When we handle personal data of people in Ireland, the EU General Data Protection
> Regulation (GDPR) applies, as well as the UK law named in our Privacy Policy. The rights listed in section 8 of the
> Privacy Policy are your rights under the GDPR too.
>
> **Our representative in the EU.** **[FLAG 1: if a representative is appointed, its name and contact details go
> here.]**
>
> **Where your data is kept.** Your data is stored and processed in the United Kingdom. The European Commission has
> decided that the UK protects personal data to the same standard as the EU, so no extra safeguard is needed for that.
> Where a service provider handles data in the United States (section 6 of the Privacy Policy), the transfer is covered
> by a safeguard the GDPR recognises. **[FLAG 1]**
>
> **Allergy and dietary notes.** If you add allergy or dietary notes to an order, we pass them to the truck with your
> order. We remove them, with your name and contact details, 12 months after the order, as section 7 of the Privacy
> Policy says. We do not use them for anything else.
>
> **Your requests.** You can ask us what personal data we hold about you, and ask us to correct it, delete it or stop
> using it. Email privacy@hatchgrab.com. We will reply within one month. If you ordered from a truck, we may pass your
> request to that truck, because it decides how your order details are used.
>
> **Complaints.** You can complain to the Data Protection Commission, Ireland's data protection regulator, at
> www.dataprotection.ie, or by post to 6 Pembroke Row, Dublin 2, D02 X963. We would appreciate the chance to put
> things right first.
>
> **Marketing emails.** We send marketing emails only where the law allows it. Every one tells you how to stop
> receiving them, and if you ask us to stop, we will. Emails about an order or your account are not marketing.
> **[FLAG 7]**
>
> **Contact.** privacy@hatchgrab.com, or by post to HatchGrab Ltd, Rosedale, Bury Road, Wickham Street, CB8 8PD,
> United Kingdom.

### 2.2 Flags — for a lawyer or accountant, not decided here

1. **GDPR Article 27 — an EU representative. Probably required; a lawyer to confirm.**
   - **Why it applies:**
     - HatchGrab Ltd is outside the EU (UK).
     - Once it serves Irish trucks and their customers, it offers services to people in the EU (Art 3(2)(a)).
     - Pricing in euro and /ie pages are among EDPB's signs of targeting.
   - **Why the exemption probably fails:** Art 27(2)(a) needs processing that is **all** of these: occasional, not
     large-scale special-category data, and unlikely to cause risk. EDPB reads "occasional" as "not carried out
     regularly". Orders every trading day are regular.
   - **The representative:** appointed in writing, in Ireland (where the data subjects are). Commercial
     EU-representative services exist. The DPC doesn't require it to be registered.
   - **What the privacy policy must then say:** Art 13(1)(a) requires "the identity and contact details of the
     controller and, where applicable, of the controller's representative".
   - **Also for the lawyer:**
     - Terms §10 calls itself a DPA under the **UK** GDPR. Should it also name the EU GDPR for Irish trucks?
     - Privacy §6 relies on the **UK** IDTA/Addendum for US providers. For EU-origin data, the EU mechanism (the EU–US
       Data Privacy Framework or the EU SCCs) is the one that counts.
   - **The good news:** EU→UK needs nothing extra. The Commission renewed the UK adequacy decisions on 19 December
     2025, to December 2031.
   - **Unconfirmed:** the EDPB 3/2018 wording on "occasional" was seen only in summaries, because the PDF was
     unreadable.
2. **EU VAT on our fees to Irish trucks. An accountant to decide before any Irish truck is billed.**
   - **VAT-registered trucks (B2B):** place of supply is Ireland. We charge no VAT, and the truck self-accounts under
     the reverse charge. We'd need to collect and validate its VAT number (VIES). Collecting tax numbers at signup is
     already in the backlog (§27).
   - **Small trucks without a VAT number:** under Implementing Regulation 282/2011 Art 18, a supplier of electronic
     services may treat a customer with no VAT number as a consumer.
     - HatchGrab is not established in the EU, so the €10,000 EU threshold doesn't apply. Revenue says "regardless of
       the level of their turnover".
     - So Irish VAT (23% standard) **may be due on our fees from the first euro**, accounted for through the
       **non-Union OSS** or an Irish VAT registration.
     - Revenue also says "there is no registration threshold for received services", so the truck may be the one
       required to self-account. Which of the two applies is the accountant's call.
   - **Decide with it:** whether €0 / €29 / €69 are prices before or including any such VAT. 35.ak-6 means the site
     must not claim "incl. VAT" while we're not registered.
   - **Irish thresholds** (€42,500 services, €85,000 goods, from 1 Jan 2025) don't help a non-established supplier.
     Revenue doesn't name SaaS, but its definition of electronically supplied services fits it.
   - **Unconfirmed:** the Art 44 / Art 18 texts were seen in EUR-Lex summaries only, because the page loaded empty.
3. **Governing law and courts (England and Wales) for an Irish business customer.** A lawyer to confirm this is
   enforceable as drafted. Also check whether an Irish sole trader could be treated as a consumer despite "business use
   only" (Terms §1).
4. **The EU Platform-to-Business Regulation (EU) 2019/1150.** It may apply if HatchGrab or Village Foodie counts as an
   "online intermediation service" for trucks. If so, it brings its own terms requirements. **Unconfirmed;** the CCPC
   links to it.
5. **Consumer Rights Act 2022: what the truck must show.** Before a distance contract, the trader must give its name,
   geographic address, phone and email, and the total price including VAT.
   - **Not checked here:** whether the order page shows the truck's address and contact details before ordering.
     Today it shows the truck's name and the venue. Check it in the test pass (§3.4, step 7).
   - **Already safe:** the 14-day cancellation right doesn't apply to catering for a specific date (CCPC), so
     pre-orders are fine.
   - **Unconfirmed:** a CCPC note says the Act's information requirements are being updated from 27 September 2026
     (seen in a search snippet only).
6. **Allergens.**
   - **The rule:** FSAI says allergen information must be in writing, **tied to each dish**, available without asking,
     and, for online orders, in writing before ordering. "Our food contains…" is not acceptable, and a QR code alone is
     not enough.
   - **The risk:** HatchGrab's **card** display mode (`allergen_display_mode = 'card'`) shows one free-text "Allergen
     info" card instead of per-dish allergens. That may not meet the Irish rule.
   - **A product decision:** require per-dish (or "both") for IE trucks, or warn them at setup. Not changed here.
   - S.I. 489/2014 is still in force, amended by S.I. 656/2024. What that S.I. changed is unconfirmed: the Statute Book
     returned 403.
7. **Marketing emails and cookies** under the Irish ePrivacy rules (S.I. 336/2011). I didn't research these. A lawyer
   should confirm the consent wording and the analytics cookies (PostHog) for Irish visitors.
8. **Tax wording for trucks.** Restaurant and catering services move to Ireland's second reduced rate from 1 July
   2026 (Revenue). The 9% figure and whether hot takeaway is included are unconfirmed. This affects the rate a truck
   types, not our text.

### 2.3 Official sources (opened by the research pass on 21 Oct 2026)

- **Consumer law (CCPC):**
  - https://www.ccpc.ie/information-for-businesses/selling-goods-and-services/selling-services
  - https://www.ccpc.ie/information-for-businesses/selling-goods-and-services/selling-digital-content-or-services
  - https://www.ccpc.ie/business/help-for-business/guidelines-for-business/unfair-terms-contracts/
  - https://www.ccpc.ie/business/help-for-business/consumer-protection-law-how-does-it-apply-to-my-business/
  - https://www.ccpc.ie/information-for-businesses/guidance-for-businesses/consumer-protection-guidance/your-business-obligations-under-irish-consumer-protection-law
- **Allergens (FSAI, Commission):**
  - https://www.fsai.ie/business-advice/running-a-food-business/allergens/allergen-information-for-non-prepacked-food
  - https://www.fsai.ie/business-advice/labelling/labelling-allergens
  - https://www.fsai.ie/business-advice/labelling/labelling-distance-selling
  - https://www.fsai.ie/enforcement-and-legislation/legislation/food-legislation/food-information-fic-(labelling)/food-hypersensitivity-food-allergy-and-intolerance
  - https://food.ec.europa.eu/food-safety/labelling-and-nutrition/food-information-consumers-legislation_en
- **Data protection (DPC, EDPB, Commission):**
  - https://www.dataprotection.ie/en/who-we-are
  - https://www.dataprotection.ie/en/individuals/exercising-your-rights/raising-concern-commission
  - https://www.dataprotection.ie/en/individuals/know-your-rights/right-be-informed-transparency-article-13-14-gdpr
  - https://www.dataprotection.ie/en/organisations/international-transfers/transfers-personal-data-third-countries-or-international-organisations
  - https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-32018-territorial-scope-gdpr-article-3-version_en
  - https://www.edpb.europa.eu/news/draft-uk-adequacy-decisions-edpb-adopts-opinions_en
  - https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en
- **VAT (Revenue):**
  - https://www.revenue.ie/en/vat/vat-on-services/when-is-vat-charged-on-services/general-place-of-supply-rules-for-services.aspx
  - https://www.revenue.ie/en/vat/vat-on-services/when-is-vat-charged-on-services/exceptions-general-place-supply-rules.aspx
  - https://www.revenue.ie/en/vat/vat-on-services/electronic-services/vat-and-electronically-supplied-services/index.aspx
  - https://www.revenue.ie/en/vat/vat-on-services/exceptions-general-place-supply-rules-services/received-services/index.aspx
  - https://www.revenue.ie/en/vat/vat-registration/who-should-register-for-vat/vat-thresholds.aspx
  - https://www.revenue.ie/en/vat/vat-registration/who-should-register-for-vat/index.aspx
  - https://www.revenue.ie/en/vat/vat-ecommerce/non-union-scheme/index.aspx
  - https://www.revenue.ie/en/vat/vat-on-services/restaurant-catering-and-canteen-services/index.aspx
- **Couldn't be read** (blocked or empty), so each claim that rests on them is marked unconfirmed above:
  - irishstatutebook.ie (the Consumer Rights Act 2022 text, S.I. 656/2024): 403;
  - gov.ie: 403;
  - EUR-Lex (Regulation 1169/2011, the GDPR, Regulation 282/2011): empty;
  - the EDPB 3/2018 PDF.

  The primary texts still need opening by the lawyer:
  - Consumer Rights Act 2022 (No. 37 of 2022);
  - S.I. No. 489 of 2014 and S.I. No. 656 of 2024;
  - Regulation (EU) No 1169/2011 Annex II;
  - GDPR Articles 3, 13 and 27;
  - Council Directive 2006/112/EC Art 44;
  - Implementing Regulation (EU) No 282/2011 Art 18.

## 3 · The Irish test truck (item 3)

### 3.1 How the US test truck was done, and why Ireland needs a different route

**The US twin** (`docs/us-dress-rehearsal-stage1-report.md` §3):
- one guarded SQL block copied Pizza Kitchen (`test-truck`) to `test-truck-us`;
- it set the US fields and hid it (`show_on_vf` / `show_on_hg` false, **`excluded` false**, `order_link_hg` true,
  `is_customer` false, no discovery row);
- it's owned by **your own operator account**.

**Why not the same for Ireland:**
- **Stripe is per operator, not per truck.** Connect writes `operators.stripe_account_id` (`app/api/stripe/connect/
  route.ts:15`), with the country of the truck you press Connect from (`lib/stripe/connect.ts:236`). Pressing Connect
  on an IE twin under your account would attach that Stripe account to **your operator row**, and so to Pizza Kitchen
  and the US twin as well. Read-only, 21 Oct: your operator owns `test-truck` and `test-truck-us`, is an admin, and has
  no Stripe account.
- **Signup and Admin › create-truck refuse a switched-off country.** `provisionTruck` throws `country_off`, so a
  truck can't be created "in IE" by the app while Ireland is off.

**The safest way:**
1. **A fresh test sign-in account** (for example a plus-address of your own email) signs up normally as a **GB**
   truck. GB is on, so signup works.
2. **SQL 3b** (one guarded `DO` block) turns that one truck into a hidden Irish test truck:
   - IE, EUR, Europe/Dublin, Limerick;
   - no phone;
   - hidden like the US twin, not excluded, so it can take orders by its link;
   - not a customer.
3. **Run it straight after the signup's truck exists.** Setup can carry on, and the menu upload then happens as an
   Irish truck.
4. **Any Stripe test account** lands on the test operator only. Clean-up deletes the truck, the account and its Stripe
   link together.

**What stays untouched:** the IE `country_settings` row, Pizza Kitchen, the US twin, Pizzeria Gusto and every live
truck.

**Checked read-only:**
- the preview query parses and returns nothing for an unknown email;
- every column the blocks write exists (`trucks`, `operators`, the eight non-cascading child tables);
- `operators.auth_user_id` → `auth.users` is `ON DELETE CASCADE`, so the clean-up's last line removes the
  `operators` row.

### 3.2 The SQL (all NOT RUN)

Put the test account's email on each ▶ line. Every block refuses and changes nothing if anything is unexpected:
- an admin account;
- an account older than 7 days;
- more than one truck;
- not GB;
- a customer;
- orders already placed;
- a discovery row;
- IE switched on.

**3a — Preview, READ-ONLY.** Run first, after signing up the test account:

```sql
-- PREVIEW — READ-ONLY. Put the test account's email on the first line. Expect: one operator, one truck, GB, hidden,
-- no orders; the IE row switched off.
with p as (select lower('PUT-THE-TEST-EMAIL-HERE') as email)
select o.email, o.is_admin, o.created_at as signed_up, o.stripe_account_id is not null as has_stripe,
       t.id as truck_id, t.slug, t.name, t.country, t.currency, t.timezone, t.excluded, t.show_on_hg, t.is_customer, t.plan,
       (select count(*) from public.trucks t2 where t2.operator_id = o.id) as trucks_on_account,
       (select count(*) from public.orders x where x.truck_id = t.id) as orders,
       (select enabled from public.country_settings where country_code = 'IE') as ie_switched_on
from p join public.operators o on lower(o.email) = p.email
left join public.trucks t on t.operator_id = o.id;
```

**3b — Make the test truck Irish. NOT RUN, "run now"** (after the preview looks right):

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- IRELAND TEST TRUCK — turn the test account's new GB truck into a hidden Irish test truck. NOT RUN — "run now".
-- docs/ireland-2-report.md §3. Touches ONE trucks row: the only truck of the account whose email is below.
-- Put the test account's email on the line marked ▶. Every guard raises and changes nothing if the world is not as
-- expected. Ireland stays switched OFF: this does not touch country_settings.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_email text := lower('PUT-THE-TEST-EMAIL-HERE');   -- ▶ the email you signed the test account up with
  v_op    public.operators%rowtype;
  v_truck text;
  n       int;
begin
  if v_email like 'put-the-test-email%' then raise exception 'put the test account''s email on the ▶ line first — nothing done'; end if;
  select count(*) into n from public.operators where lower(email) = v_email;
  if n <> 1 then raise exception 'expected exactly one account with that email, found % — nothing done', n; end if;
  select * into v_op from public.operators where lower(email) = v_email;
  if v_op.is_admin then raise exception 'that account is an admin — use a fresh test account — nothing done'; end if;
  if v_op.created_at < now() - interval '7 days' then raise exception 'that account is more than 7 days old — use a fresh test account — nothing done'; end if;
  select count(*) into n from public.trucks where operator_id = v_op.id;
  if n <> 1 then raise exception 'expected the account to own exactly one truck, found % — nothing done', n; end if;
  select id into v_truck from public.trucks where operator_id = v_op.id;
  if exists (select 1 from public.trucks where id = v_truck and (country <> 'GB' or is_customer)) then
    raise exception 'the truck is not a fresh GB non-customer truck — nothing done'; end if;
  if exists (select 1 from public.orders where truck_id = v_truck) then raise exception 'the truck already has orders — nothing done'; end if;
  if exists (select 1 from public.discovery_trucks where hatchgrab_truck_id = v_truck) then raise exception 'the truck has a discovery row — nothing done'; end if;
  if not exists (select 1 from public.country_settings where country_code = 'IE' and enabled = false and currency = 'EUR') then
    raise exception 'the IE row is missing or switched on — nothing done'; end if;

  update public.trucks set
    -- Ireland: euro, Dublin time (24-hour, day-month, Monday weeks and en-IE come from the IE row)
    country = 'IE', currency = 'EUR', timezone = 'Europe/Dublin',
    -- tax: menu prices include tax in Ireland (the IE row); no rate set, so no VAT line — set one in Manage if wanted
    tax_rate_milli = null, tipping_enabled = null, service_fee_enabled = false, service_fee_bps = null, service_fee_fixed_minor = null,
    -- where it trades: Limerick, typed (no Google place id)
    base_place_id = null, base_place_name = 'Limerick', base_region = null, base_region_code = null, base_lat = 52.663800, base_lng = -8.626700,
    -- no phone or WhatsApp copied from the GB signup (an Irish number is never needed for the test)
    contact_phone = null, phone_is_whatsapp = false, whatsapp = null,
    -- hidden exactly as the US test truck is: off both listings, NOT excluded (excluded refuses every order), its own
    -- order link on, never a customer
    show_on_vf = false, show_on_hg = false, order_link_vf = false, order_link_hg = true, excluded = false, is_customer = false
  where id = v_truck;
  raise notice 'done: % is now a hidden Irish test truck', v_truck;
end $$;

-- VERIFY — after the block, so the SQL editor shows it
select t.id, t.slug, t.name, t.country, t.currency, t.timezone, t.base_place_name, t.show_on_vf, t.show_on_hg, t.order_link_hg, t.excluded,
       t.is_customer, t.plan, t.trial_expires_at,
       'http://hatchgrab.localhost:3000/manage/' || t.dashboard_token as manage,
       'http://hatchgrab.localhost:3000/dashboard/' || t.dashboard_token as dashboard,
       'http://hatchgrab.localhost:3000/trucks/' || t.slug || '/order' as order_page
from public.trucks t join public.operators o on o.id = t.operator_id
where lower(o.email) = lower('PUT-THE-TEST-EMAIL-HERE');
```

**3c — Afterwards, option 1: hide it and keep it for later checks. NOT RUN:**

```sql
-- NOT RUN. Keeps the Irish test truck for future checks but makes it refuse every order (excluded = master hide).
update public.trucks t set excluded = true, order_link_hg = false
from public.operators o
where o.id = t.operator_id and lower(o.email) = lower('PUT-THE-TEST-EMAIL-HERE') and t.country = 'IE' and not t.is_customer;
select t.id, t.excluded, t.order_link_hg from public.trucks t join public.operators o on o.id = t.operator_id where lower(o.email) = lower('PUT-THE-TEST-EMAIL-HERE');
```

**3d — Afterwards, option 2: delete the test truck and the test account. NOT RUN:**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- NOT RUN. Deletes the Irish test truck, everything under it, and the test sign-in account. Scoped by the email on the
-- ▶ line; touches nothing else. Rows only: no storage object is deleted (Manage › Menu photos, if any, stay in storage).
-- The Stripe TEST connected account is not touched here: delete it in the Stripe Dashboard in test mode (§4).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare
  v_email text := lower('PUT-THE-TEST-EMAIL-HERE');   -- ▶ the test account's email
  v_op public.operators%rowtype;
  v_truck text;
begin
  if v_email like 'put-the-test-email%' then raise exception 'put the test account''s email on the ▶ line first — nothing done'; end if;
  select * into v_op from public.operators where lower(email) = v_email;
  if v_op.id is null then raise exception 'no account with that email — nothing done'; end if;
  if v_op.is_admin then raise exception 'that account is an admin — nothing done'; end if;
  if (select count(*) from public.trucks where operator_id = v_op.id) <> 1 then raise exception 'expected exactly one truck — nothing done'; end if;
  select id into v_truck from public.trucks where operator_id = v_op.id;
  if exists (select 1 from public.trucks where id = v_truck and (country <> 'IE' or is_customer)) then
    raise exception 'that truck is not the Irish test truck — nothing done'; end if;
  -- the tables whose truck foreign key does NOT cascade
  delete from public.order_payments   where truck_id = v_truck;
  delete from public.orders           where truck_id = v_truck;
  delete from public.slot_capacity    where truck_id = v_truck;
  delete from public.collection_times where truck_id = v_truck;
  delete from public.order_counters   where truck_id = v_truck;
  delete from public.item_overrides   where truck_id = v_truck;
  delete from public.category_stock   where truck_id = v_truck;
  delete from public.referrals        where referring_truck = v_truck or referred_truck = v_truck;
  -- the truck: vans, menu, events, devices, drafts and the rest cascade from it
  delete from public.trucks where id = v_truck;
  -- the account: pending email changes do not cascade; the sign-in user cascades to the operators row
  delete from public.operator_email_changes where operator_id = v_op.id;
  delete from auth.users where id = v_op.auth_user_id;
end $$;
commit;

-- verify — every count 0
select (select count(*) from public.operators where lower(email) = lower('PUT-THE-TEST-EMAIL-HERE')) as accounts_left,
       (select count(*) from public.trucks where country = 'IE') as ie_trucks_left,
       (select count(*) from public.orders where currency = 'EUR') as eur_orders_left;
```

### 3.3 Card orders in Stripe TEST mode: what the code supports, and what you do

**What the code supports:**
- **There is no separate test switch in the code.** The mode follows the keys: `STRIPE_SECRET_KEY`,
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET` (`lib/stripe/client.ts`, `lib/stripe/connect.ts`).
- **`livemode` is recorded from Stripe's own objects** on every draft, payment and webhook row
  (`lib/payments/authorize.ts:183`). So test rows are marked as test even though localhost writes to the live
  database.

So the code **does** support a test-mode card order on a connected account. It needs, for **one localhost session
only**:
1. **Test keys.** You switch them in `.env.local` yourself: `sk_test_…` and `pk_test_…` from the Dashboard in test
   mode (Developers → API keys). I never open that file. Restart `next dev` afterwards: the publishable key is read at
   build time.
2. **The Stripe CLI listener.** Run `stripe listen --forward-to http://hatchgrab.localhost:3000/api/webhooks/stripe
   --forward-connect-to http://hatchgrab.localhost:3000/api/webhooks/stripe`.
   - Put the `whsec_…` it prints in `STRIPE_WEBHOOK_SECRET` for the session.
   - **Why it matters:** the order is promoted on the redirect back even without it. But the **payment ledger row**
     (`payment_intent.succeeded`, after capture) and the account-ready refresh (`account.updated`) arrive only by
     webhook (`app/api/webhooks/stripe/route.ts:289-460`).
3. **Connect on the test truck** (Manage › Payments). It creates a **test** IE connected account on the test
   operator. Onboard it with Stripe's test data (https://docs.stripe.com/connect/testing):
   - date of birth 1901-01-01;
   - address line `address_full_match`;
   - ID 000000000;
   - phone 0000000000;
   - SMS code 000-000;
   - IBAN `IE29AIBK93115212345678`.
4. **Test cards:**
   - `4242 4242 4242 4242`;
   - Stripe's Ireland test card `4000 0037 2000 0005` (from Stripe's per-country test-card list; worth confirming
     on that docs page);
   - any future expiry date and any CVC.
5. **Afterwards:**
   - put the live keys back and restart;
   - stop the listener;
   - delete the test connected account in the Dashboard (test mode → Connect → Accounts).

**What's missing or can't be tested on localhost:**
- **Apple Pay / Google Pay.** Wallets need HTTPS and a domain registered on the **connected account**. The app
  registers `www.hatchgrab.com` on each account at onboarding (`registerPaymentMethodDomains`,
  `lib/stripe/connect.ts:463-530`), never localhost. So the wallet check waits for the first live Irish account on
  production (§5).
- **Mode mismatch.** If the live key is ever used with that test account, the app logs a mode mismatch
  (`describeAccountModeMismatch`) but doesn't refuse. That's another reason the test account belongs to a throwaway
  operator.

### 3.4 The checklist — localhost (`http://hatchgrab.localhost:3000`, Safari) and your phone

**Before you start:**
- Port 3000 only; you start `next dev` yourself.
- Never use Pizza Kitchen, Pizzeria Gusto or any live truck.
- Customer emails go to an address you own.
- In Admin › Countries, touch the **Ireland column only**, and don't switch it on.

| # | Do | Expect |
|---|---|---|
| 1 | Sign up the test account (signup offers GB only; IE is off). Stop at the menu step | A GB truck. Signup **can't** be tested in IE until Ireland is on (§5, step 9) |
| 2 | Run SQL 3a, then 3b, then reload Manage | Manage › Settings › Where you trade: Ireland, Limerick, Europe/Dublin |
| 3 | Manage › Menu: upload a menu photo (AI import) | Prices in **€**. The allergen picker offers **the UK 14** (uk14). Every dish needs its allergens confirmed. Use **per dish** or **both** display mode (§2.2, flag 6) |
| 4 | Manage › Schedule: add a day event and an evening event in Limerick | **24-hour** times ("11:30–20:00"), dates day-month ("Sat 24 Oct"), weeks start Monday. The postcode box says "Postcode": Irish users say **Eircode** (7 en-GB keys; an optional en-IE override, not done) |
| 5 | Manage › Billing | € plan prices are **masked** while Ireland is off (the van-modal rule). Plan word "**Pay at the truck**" (en-IE) |
| 6 | Manage › Payments (before Connect) | "Stripe charges 1.5% + €0.25 per payment on standard EEA cards…" |
| 7 | Phone: open the order link (from 3b's verify) | € prices, 24-hour pickup times, "Collection", "**Pay at the truck** on collection · No card details needed". Check whether the page shows the truck's **address and contact details** before ordering (§2.2, flag 5) |
| 8 | Place a **pay-at-the-truck** order (your email) | The confirmation page and email: "Order #1 confirmed", € lines, "Collection time: 13:30. See you at the hatch!", "Pay at the truck on collection." |
| 9 | Dashboard (`/dashboard/<token>`) | The order card in €, 24-hour times. Accept, then Ready: the "ready" email arrives ("Order #1 is ready — …") |
| 10 | KDS (`/kds/<van token>`) | 24-hour times and day-month dates; **no money lines and no allergens** on KDS tickets (a recorded decision, §82.5) |
| 11 | Printed ticket (Manage › Settings › Printing preview, or a printer) | "**EUR 28.00**" (thermal printers can't print €), "#1 COLLECT 13:30", ASCII only |
| 12 | Customer self-cancel, then a dashboard reject on another order | "Order cancelled" (UK spelling, en-IE = en-GB); no refund line on a pay-at-the-truck order |
| 13 | **Test mode only (§3.3):** Connect, onboard with test data, then a **card order** with 4242… on your phone | Payment Element in €, no eftpos notice (AUD only), a hold. Accept on the dashboard → captured. The receipt / status page shows it paid |
| 14 | Test mode: refund that card order (full, then a partial on another) | Refund email "A refund for your order #… — €16.00 refunded… The rest of the order, €12.00, is unchanged"; the ledger row has `livemode = false` |
| 15 | Afterwards | SQL 3c (keep, hidden) or 3d (delete); put the live keys back; delete the test connected account in Stripe test mode |

### 3.5 What I ran myself, on fixtures (no database, no network, no dev server)

These are `scripts/ireland-2.cjs` §4, on an Irish fixture truck: EUR, en-IE, Europe/Dublin, 24-hour. Brevo was
replaced by a recorder in the process, so nothing was sent.

- **Confirmation email:**
  ```
  Order #3 confirmed — Pizza Kitchen IE
  1x Margherita — €12.00
  1x Supreme — €16.00
  Total: €28.00
  Collection time: 13:30. See you at the hatch!
  Pay at the truck on collection.
  📍 People's Park, Limerick
  ```
- **Ready email:** "Order #3 is ready to collect — Pizza Kitchen IE … Your order is ready for collection — come and
  collect. Pay at the truck."
- **Refund email (partial):** "A refund for your order #3 — Pizza Kitchen IE. … has refunded €16.00 of your order to
  the card you paid with. The rest of the order, €12.00, is unchanged. Refunds usually take 5 to 10 business days…"
- **Printed ticket, 58 mm:** "#3 COLLECT 13:30 / Aoife / 1x Margherita EUR 12.00 / 1x Supreme EUR 16.00 / TOTAL EUR
  28.00 / printed 13:01". Every byte is ASCII.
- **Allergens:** the IE row's set is uk14, the 14: Gluten, Crustaceans, Eggs, Fish, Peanuts, Soy, Dairy, Tree nuts,
  Celery, Mustard, Sesame, Sulphites, Lupin, Molluscs.
- **Already proved in ireland-1** (`docs/ireland-1/`): the order page, dashboard and KDS rendered for an IE fixture
  truck in €, 24-hour, day-month.

**Not run by me:**
- anything needing a real truck row, a sign-in or Stripe;
- the order page and Manage live on the dev server: no IE truck exists yet, and making one is your SQL.

**Wording to know (not changed):**
- en-IE customers see the en-GB "See you at the **hatch**!", "Collection" and "Postcode".
- The plan word and the payment line already say "Pay at the truck".

## 4 · Stripe Dashboard: check before switching Ireland on (item 4)

**How payments are set up** (from the code): Connect **Accounts v2**, `dashboard: 'full'`, **direct charges** on the
truck's account, and the truck pays Stripe's fees (`fees_collector: 'stripe'`). `card_payments` is requested at
creation, with the country taken from the truck. No application fee is sent today.

1. **Connect countries:** Settings → Connect → Onboarding options → **Countries**
   (https://dashboard.stripe.com/settings/connect/onboarding-options/countries). Ireland must be allowed.
   - Stripe says UK platforms can create accounts in any country it supports, and IE is one of them.
   - With direct charges, funds settle in the connected account's country (EUR, Ireland).
2. **Card payments for an IE account:** on the **test-mode** account from §3.3, open Connect → Accounts → (the
   account) → **Capabilities**. "Card payments" must be **Active**, and the app's Payments tab must show it as ready
   (`charges_enabled`).
   - Stripe notes that the "recipient" service agreement can't have card payments. The app creates "full"/merchant
     accounts, so that's right.
3. **Apple Pay domain:**
   - **Platform:** Settings → **Payment method domains** (https://dashboard.stripe.com/settings/payment_method_domains)
     should list `www.hatchgrab.com` with Apple Pay active.
   - **Connected accounts:** with direct charges Stripe says to manage domains **by API**, not the Dashboard. The app
     does it at onboarding (`registerPaymentMethodDomains`).
   - **Check on the first live Irish account:** Connect → Accounts → (account) → its payment method domains should
     include `www.hatchgrab.com`. On the phone, Apple Pay must appear on its order page.
   - A domain registered in live mode also covers test; a test-mode registration doesn't cover live. Ireland is in
     Apple Pay's country list.
4. **EEA card pricing:** compare https://stripe.com/ie/pricing (opened 21 Oct) with the IE row.

   | Card type | Stripe Ireland price | The IE row |
   |---|---|---|
   | Standard EEA cards | 1.5% + €0.25 | ✅ online 1.5% + €0.25, "EEA cards" |
   | Premium EEA cards | 2.8% + €0.25 | — |
   | UK cards | 2.5% + €0.25 | — |
   | International cards | 3.15% + €0.25 | — |
   | Currency conversion | +2% | — |
   | Terminal, EEA cards | 1.4% + €0.10 | ✅ in-person 1.4% + €0.10 |
   | Terminal, non-EEA cards | 2.9% + €0.10 | — |
   | Tap to Pay | +€0.10 | ✅ Tap to Pay +€0.10 |

   - The Payments text already says "Other cards may cost more".
   - Connect with Stripe handling pricing has no extra charge. Check Settings → Connect → **Pricing** and confirm no
     platform pricing scheme is set. With `fees_collector: 'stripe'`, the truck pays these to Stripe.
5. **Webhooks:** Developers → **Webhooks / Event destinations**. The live endpoint `…/api/webhooks/stripe` must
   receive **connected-account** events (`events_from: @accounts`):
   - `payment_intent.amount_capturable_updated`;
   - `payment_intent.succeeded`;
   - `account.updated`;
   - the refund events it already handles.

   Nothing in these is country-specific, but confirm the subscription isn't limited to existing accounts.
6. **Application fees (for later, not today):** the platform fee is off. When the fee engine lands, confirm with
   Stripe that a UK platform may take application fees on IE direct charges. This is **unconfirmed** in Stripe's
   docs, though nothing forbids it.
7. **Test-mode Connect** (for §3.3): in test mode, Connect → Settings shows Connect is enabled. Delete the test account
   afterwards.

## 5 · Switch-on day (item 5)

1. **Deploy what's waiting:** currency-registry, ai-search-1 and this workstream (§49 deploy order).
2. **SQL:** none is needed for Ireland. Its `country_settings` and `plan_prices` rows are already live, switched off
   (verified 21 Oct). Optional: the IE row's `updated_by` still reads "europe-readiness draft".
3. **Legal:**
   - resolve the §2.2 flags (at least 1 and 2, with a lawyer and an accountant);
   - apply the Irish section to `content/legal/country-specific-terms.md`;
   - move `COUNTRY_TERMS_UPDATED` and the page's "Last updated" together;
   - update the privacy policy if an EU representative is appointed.
4. **Stripe:** the §4 checks.
5. **The test-truck pass:** §3.4 rows 1–14, then SQL 3c or 3d.
6. **Switch on:** Admin › Countries → **Ireland column** → enabled → Save. The trigger refuses unless all three plans
   have IE prices, and they do.
7. **Straight after, on the live site:**
   - `https://www.hatchgrab.com/ie` returns **200** (not a 302), in € with the Irish hero images, and the footnote
     says "1.5% + €0.25 in Ireland";
   - `/ie/features` and `/ie/compare`: 200, and the /compare fee box shows **c**;
   - **hreflang:** /uk, /us and /ie each list en-GB, en-US, en-IE and x-default (view source);
   - **sitemap:** `https://www.hatchgrab.com/sitemap.xml` lists `/ie` and `/ie/features` with alternates;
   - **country menu:** Ireland appears with its flag;
   - **router:** `https://www.hatchgrab.com/?country=IE` lands on /ie;
   - **/llms.txt** (once ai-search-1 is deployed) lists Ireland with €0 / €29 / €69;
   - **JSON-LD:** `countriesSupported` includes "IE" (ai-search-1), and the /ie Offers are in EUR;
   - **Village Foodie:** unchanged (UK only).
8. **Signup:** sign up a second throwaway account **in Ireland**. That is the IE signup check that couldn't run
   before. Then hide or delete it with 3c / 3d.
9. **First real Irish truck:** check that Apple Pay shows on its order page (§4, step 3), and that its Payments tab
   reads ready.
10. **Search:** submit the sitemap again in Google Search Console and Bing Webmaster Tools.

## 6 · Proof

- **tsc:** `npx tsc --noEmit` exit 0.
- **Lint:** `app/compare/CostComparison.tsx` and `lib/money-format.ts` have **0** findings.
  `scripts/ireland-2.cjs` has 6, all `no-require-imports`, the CommonJS rule every harness trips (`anz-1.cjs` has 7).
- **The new harness** `scripts/ireland-2.cjs` passes **16 / 16** and is registered in `scripts/harnesses.json`
  (150 entries).
- **Full sweep:** `node scripts/run-harnesses.cjs` → **150 run · 150 passed · 0 failed**, including `ireland-2`. The flaky `add-order-refresh-inputs` passed too.
- **Build:** `next build` exit 0, no errors in its output.
- **Re-pins:** none. The approved /compare unit change touched no pinned output: GB/US are byte-identical and no
  existing harness rendered /ie/compare's box.

## 7 · Read-only SQL run for this workstream

```sql
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.country_settings'::regclass and conname in ('country_settings_allergen_set_chk', 'country_settings_currency_chk') order by conname;
```
```sql
select country_code, enabled, platform_fee_enabled, currency, allergen_set, card_surcharge_allowed, service_fee_allowed, tipping_enabled_default, updated_by, updated_at from public.country_settings order by country_code;
```
```sql
select country, currency, count(*) as trucks from public.trucks group by 1, 2 order by 1, 2;
```
```sql
select currency, count(*) as orders from public.orders group by 1 order by 1;
```
```sql
select id, plan, is_customer, trial_expires_at, country, currency from public.trucks where id = 'real-thai-food';
```
```sql
select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'trucks' and column_name in ('id','slug','name','operator_id','country','currency','timezone','tax_rate_milli','tipping_enabled','service_fee_enabled','service_fee_bps','service_fee_fixed_minor','show_on_vf','show_on_hg','order_link_vf','order_link_hg','excluded','is_customer','active','contact_phone','phone_is_whatsapp','whatsapp','base_place_id','base_place_name','base_region','base_region_code','base_lat','base_lng','plan','trial_expires_at','created_at','contact_email','truck_order_email_enabled','allergen_display_mode','deletion_requested_at') order by column_name;
```
```sql
select c.conrelid::regclass as tbl, c.conname, c.confdeltype from pg_constraint c where c.contype = 'f' and c.confrelid = 'public.operators'::regclass order by 1, 2;
```
```sql
select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'operators' order by ordinal_position;
```
```sql
select t.id, t.country, t.is_customer, t.show_on_hg, t.excluded, (select count(*) from public.trucks t2 where t2.operator_id = t.operator_id) as trucks_on_operator, o.is_admin, o.stripe_account_id is not null as has_stripe from public.trucks t join public.operators o on o.id = t.operator_id where t.id in ('test-truck', 'test-truck-us');
```
```sql
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.operators'::regclass and contype = 'f';
```
```sql
select c.conrelid::regclass as tbl, c.confdeltype, count(*) as fks from pg_constraint c where c.contype = 'f' and c.confrelid = 'public.trucks'::regclass group by 1, 2 having c.confdeltype <> 'c' order by 1;
```
```sql
select table_name, column_name from information_schema.columns where table_schema = 'public' and ((table_name = 'order_payments' and column_name = 'truck_id') or (table_name = 'referrals' and column_name in ('referring_truck','referred_truck')) or (table_name = 'discovery_trucks' and column_name = 'hatchgrab_truck_id') or (table_name = 'operator_email_changes' and column_name = 'operator_id') or (table_name in ('slot_capacity','collection_times','order_counters','item_overrides','category_stock') and column_name = 'truck_id') or (table_name = 'trucks' and column_name = 'dashboard_token')) order by 1, 2;
```
```sql
with p as (select lower('nobody-ireland-2-check@example.invalid') as email)
select o.email, o.is_admin, o.created_at as signed_up, o.stripe_account_id is not null as has_stripe,
       t.id as truck_id, t.slug, t.name, t.country, t.currency, t.timezone, t.excluded, t.show_on_hg, t.is_customer, t.plan,
       (select count(*) from public.trucks t2 where t2.operator_id = o.id) as trucks_on_account,
       (select count(*) from public.orders x where x.truck_id = t.id) as orders,
       (select enabled from public.country_settings where country_code = 'IE') as ie_switched_on
from p join public.operators o on lower(o.email) = p.email
left join public.trucks t on t.operator_id = o.id;
```

**What they returned:**
- **IE row:** `enabled = false`, EUR, uk14, `platform_fee_enabled` false.
- **Constraints:** the allergen CHECK still allows only uk14 / us9 (anz-1 block A not run). The currency CHECK lists
  the 14 registry codes.
- **Trucks:** GB/GBP 11, US/USD 1. **Orders:** GBP 2,931, USD 5.
- **real-thai-food:** still `trial` / `is_customer` true / ends 2026-09-30.
- **Your operator:** owns `test-truck` and `test-truck-us`, is an admin, has no Stripe account.
- **Foreign keys:**
  - `operators.auth_user_id` → `auth.users` ON DELETE CASCADE;
  - `operator_email_changes` → operators is NO ACTION;
  - the eight non-cascading truck foreign keys are as in the US clean-up.
- **The 3a preview with a dummy email:** no rows (it parses).

## 8 · Files

- **Product:** `app/compare/CostComparison.tsx` (the unit; one import); `lib/money-format.ts` (comments only).
- **Harness:** `scripts/ireland-2.cjs` (new); `scripts/harnesses.json` (+1).
- **Manual:** `docs/reference-manual.md`:
  - §76.1, the testing rule: struck, then "⛔ Corrected V16.3 — … IRELAND column only …";
  - the same-day V16.3 ⚠️ note under it is marked resolved;
  - the matching §27 line is marked resolved.
- **Report:** `docs/ireland-2-report.md`.

## Undo (only if Dominic asks)

- `app/compare/CostComparison.tsx`: `git checkout -- app/compare/CostComparison.tsx` (it had no other uncommitted
  change).
- **By hand, not by checkout** (each file also carries other uncommitted workstreams):
  - `lib/money-format.ts`: only this workstream's two comment edits (currency-registry's work is in the same file);
  - `docs/reference-manual.md`: only the §76.1 and §27 lines (manual-v16-3's edits are in the same file);
  - `scripts/harnesses.json`: the `"ireland-2.cjs"` line (currency-registry and ai-search-1 also added lines).
- Delete `scripts/ireland-2.cjs`.
- No database change was made.
