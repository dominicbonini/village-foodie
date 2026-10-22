# canada-1: Canada, built switched off (Quebec excluded)

**Date:** 22 October 2026 · **Branch:** `main` (uncommitted, on top of `fadb352f`) · nothing pushed or deployed · no
database change run. The CA row, its prices and the allergen CHECK are **NOT RUN SQL** (§8). Read-only queries are in §9.

**The prompt** arrived intact: nothing was garbled. Two instructions conflicted, and you decided both (22 Oct):
1. **BC is GST 5% only.** BC exempts restaurant meals from PST. Saskatchewan is the two-part GST + PST example.
2. **The CA service fee is off.** The reason is Competition Act s. 74.01(1.1) on drip pricing, recorded in the CA
   row's SQL comment (§8). Tipping stays on, as in the US.

## ⚠️ First: seven things to know

1. **Nova Scotia's HST is 14%, not 15%,** since 1 April 2025 (CRA). The data uses 14%.
2. **BC PST on drinks started on 1 April 2021, not 2023.**
   - BC's current guide says "PST applies to all retail sales of soda beverages at a rate of 7%" and "You charge 10%
     PST on sales of liquor".
   - BC's archived tax updates date soda from "April 1, 2021". I read that archive through a summary; the current
     page gives no date. No 2023 change was found.
   - A BC truck selling soda or liquor sets its own rate.
3. **A two-part tax (GST + PST) is still one line, as the brief allowed** (§2.4).
   - **Saskatchewan and Manitoba** tax restaurant meals, so a truck there shows one "GST + PST 11%" (SK) or
     "GST + RST 12%" (MB) line.
   - Saskatchewan's own bulletin says PST "must be shown as a separate amount on the invoice". The combined line
     doesn't meet that.
   - The smallest proper fix is in §2.4: one new column, the engine and one line builder. It isn't small, so it isn't
     built.
4. **Time zones moved in 2026, and this machine's Node is behind.**
   - tzdb 2026e makes BC permanent UTC−7 (from 9 Mar 2026), Alberta UTC−6 (18 Jun), the NWT UTC−6 (21 Aug) and
     Manitoba UTC−5 (31 Oct).
   - Node here has **tzdata 2026a**: it still puts Vancouver on PST (UTC−8) in December. With older tzdata, BC times
     would be an hour off after 1 November.
   - **Launch item:** confirm the production runtime, and test devices, on tzdata 2026e or later.
5. **en-CA is written over en-US, not en-GB** (§4).
   - Canadian usage shares en-US's choices: truck, pickup, window, cart, TBD, -ize.
   - en-CA then undoes US spelling: colour, centre, cancelled, favourite, grey, licence, fulfil. It also uses
     "postal code", "card terminal" and "in Canada".
   - That's **87 keys**, against roughly 400 on an en-GB base.
   - It needed one small, data-driven change: a locale can have a parent (`LOCALE_PARENT`).
6. **The date order is `mdy`.** The database CHECK allows only `dmy` or `mdy`.
   - The Canada.ca Content Style Guide writes dates month-first ("July 31, 2016"), and all-numeric dates as yyyy-mm-dd.
   - `mdy` gives the written form. The all-numeric ymd form needs a CHECK and code change, which I didn't make.
7. **A real bug fixed on the way:** the order page lowercased the tax name for its notice. Canada's acronyms would
   have read "Menu prices don't include hst". Now all-capital words stay as written. The US still reads "sales tax"
   (proved).

## Summary

- **Country row** (NOT RUN, switched off):
  - CAD, en-CA, 12-hour, `mdy`, Sunday weeks, km, +1 with `416-555-0123`, address format `ca`;
  - prices exclude tax;
  - Stripe Canada's fees ("Canadian cards");
  - surcharges, service fee and platform fee off; tipping on (10 / 15 / 20%);
  - allergen set `ca`, and an allergen card on its own is allowed;
  - the current tzdb zones, Toronto first;
  - plan prices payg 0 / pro $39 incl. $5,500 / unlimited $99, with the extra van at the plan's price.
- **Tax by province is data on the address format** (`lib/address-formats.ts`):
  - each Canadian province has its tax name and default rate;
  - the truck's own rate still wins;
  - checkout, emails, ticket, order card (KDS) and Manage all show it;
  - US trucks are unchanged.
- **Quebec:** a town picked in Quebec is refused, at signup and in Where you trade: "Trucks based in Quebec can't sign
  up yet: HatchGrab isn't available in French yet. If your truck is based somewhere else, choose that town or city."
  The refusal is data on the region (`signupClosed`), not a code check.
- **Allergens:** a `ca` set of Health Canada's priority allergens, following the anz pattern (list, loader, CHECK,
  prompts, WhatsApp guard and caveat). uk14, us9, anz and no set are **byte-identical** (hash pins taken before the
  change).
- **Address, route and locale:**
  - `/ca` exists, and redirects to `/uk` while Canada is off;
  - en-CA (87 keys over en-US);
  - hreflang en-CA when on;
  - three hero screenshots from a Toronto fixture truck.
- **Payments:**
  - Connect onboarding is already generic (`identity.country`);
  - funds settle in the connected account's country (CAD);
  - Interac is in-person only, so it doesn't affect online orders;
  - manual-capture holds work as elsewhere (7 days online);
  - no Canada-specific checkout notice.
- **Legal:** a draft Canada section, not applied (§6), with its open questions.
- **Proof:**
  - `canada-1` **85/85**, with negative controls;
  - the 5 live countries are byte-identical: 15 pages, 5 PDFs, /llms.txt and the money helpers;
  - 38 screenshots in WebKit and Chromium, plus 3 hero images;
  - tsc 0 errors and the build passes;
  - lint unchanged at 2,445 / 378;
  - full sweep **159/159**.

## 1 · The country row

| Field | Value | Why / source |
|---|---|---|
| currency · locale | CAD · en-CA | registry · §4 |
| time · date · week | 12h · `mdy` · Sunday | Canada.ca Content Style Guide §4.7: "July 31, 2016"; "Write yyyy-mm-dd" for numeric dates (<https://design.canada.ca/style-guide/>); GC data standard "(Calendar) year-month-day". `ymd` isn't a value the CHECK allows (First-6) |
| phone | +1, `416-555-0123`, check `length` | NANPA: "555-0100 through 555-0199, will remain reserved for entertainment/advertising" (<https://nanpa.com/numbering/555-line-numbers>). Passes `isPlausiblePhone` (harness §8) |
| time zones | Toronto, Vancouver, Edmonton, Winnipeg, Regina, Halifax, St_Johns, Moncton, Whitehorse, Iqaluit | tzdb 2026e `zone1970.tab`. Yellowknife is now an alias of Edmonton. See First-4 |
| tax | prices **exclude** tax; country label "Sales tax" (used only when the province is unknown) | as the US; the province decides the real label (§2) |
| card fees | online 2.9% + 30¢ · in person 2.7% + 5¢ · Tap to Pay +15¢ · "Canadian cards" | <https://stripe.com/en-ca/pricing>: "2.9% + CA$0.30", "2.7% + CA$0.05", "+ CA$0.15 per authorisation". International cards +0.8%, conversion +2% (not modelled; same as other countries) |
| surcharges | off | for later: Visa allows **credit only**, capped at "the lesser of … 2.4% … or … the average merchant discount rate", never debit or prepaid (Visa Canada FAQ); Quebec: "A merchant cannot charge fees when you use a debit or credit card" (OPC Québec) |
| service fee | **off** | Competition Act s. 74.01(1.1): "a price that is not attainable due to fixed obligatory charges or fees constitutes a false or misleading representation, unless … imposed … by or under an Act" (<https://laws-lois.justice.gc.ca/eng/acts/C-34/section-74.01.html>). Your decision; recorded in the SQL |
| tipping | on, 10 / 15 / 20% | as the US. An optional tip isn't an obligatory fee. No official source on customs: guides say counter tipping is optional |
| allergens | `ca`, card on its own allowed | §3. Canada's allergen labelling is for **prepackaged** food (FDR B.01.010.1(2)) |
| fees_taxed · platform fee | false · false | moot while the service fee and surcharge are off |
| plan_prices | payg 0 / 0 / 99 / 0 · pro 3900 / 550000 / 99 / 3900 · unlimited 9900 / null / 0 / 9900 | the brief |

## 2 · Tax by province

### 2.1 How it works (data, not code)
- **The data:** each region in the `ca` address format carries `salesTax: { label, milli }`, its prepared-food rate.
  Quebec instead carries `signupClosed`.
- **`resolveChargeRules`:**
  - **The rate:** the truck's own rate, otherwise its base region's rate, otherwise none.
  - **The label:** the region's label, otherwise the country's.
  - A region without data (every US state) changes nothing.
- **Where it's read from:**
  - The truck's region is `trucks.base_region_code`, picked at signup or in Where you trade, from Places.
  - Every caller already reads the whole truck row.
- **The surfaces:** every one draws its tax line from the order's snapshot (`chargeLinesFor`), so checkout, both
  emails, the 58/80 mm ticket and the order card (dashboard and KDS) show the province's line with no change of
  their own.
- **Manage › Payments › Tax:**
  - the rate box's placeholder is the province's rate;
  - one line under it says "Leave it empty to charge HST at 13%, the rate on prepared food in Ontario.";
  - the truck can still type its own rate.

### 2.2 The data, verified

| Province or territory | Label | Rate | Source |
|---|---|---|---|
| AB, NT, NU, YT | GST | 5% | CRA rates (<https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html>) |
| ON | HST | 13% | CRA |
| NS | HST | **14%** | CRA: "As of April 1, 2025, the HST rate has decreased to 14% in Nova Scotia." |
| NB, NL, PE | HST | 15% | CRA |
| BC | GST | 5% | BC: "Sales of food for human consumption are exempt from PST, including: … Meals" (<https://www2.gov.bc.ca/gov/content/taxes/sales-taxes/pst/publications/food-beverage-service-providers-retail-liquor-sellers>, 22 Apr 2026) |
| SK | GST + PST | 11% (one line) | PST-33: "Effective April 1, 2017, meals and other prepared food … are subject to PST. The PST must be shown as a separate amount on the invoice" |
| MB | GST + RST | 12% (one line) | RST 7% (gov.mb.ca). Its 1 July 2026 grocery exemption excludes restaurants, including "concession stands, food carts and food trucks" (RST 26-01; that wording is from a search excerpt, because the PDF is encrypted) |
| QC | — (closed) | — | excluded: GST 5% + QST 9.975% when it opens |

- **GST/HST is charged on prepared food:** CRA Memorandum 4.3: "Food or beverages heated for consumption are excluded
  from zero-rating".
- **BC drinks:**
  - **Soda beverages** carry PST at 7%. BC's current guide says "PST applies to all retail sales of soda beverages at a
    rate of 7%" and gives no date. BC's archived tax updates say "Effective April 1, 2021" (read via a summary of the
    archive). Your note said April 2023; I found no 2023 change.
  - **Liquor** carries 10% ("You charge 10% PST on sales of liquor").
  - A BC truck selling either sets its own rate, which the box allows.
- **Not modelled: Ontario's point-of-sale rebate.** The 8% provincial part is rebated on prepared food and drinks
  "sold for a total price … of not more than $4" (ontario.ca). An order of $4 or less in Ontario is taxed 13% here,
  where 5% is due. Say if you want it modelled.

### 2.3 Shown (fixture truck, $24.00 of food)

| | Checkout (pay at the truck) | Confirmation email | Ticket | Order card |
|---|---|---|---|---|
| ON | Subtotal $24.00 · **HST 13% $3.12** · Total $27.12 | "HST 13%: $3.12" | `HST 13%      $3.12` | HST 13% $3.12 |
| BC | Subtotal $24.00 · **GST 5% $1.20** · Total $25.20 | "GST 5%: $1.20" | ✓ | |
| AB | Subtotal $24.00 · **GST 5% $1.20** · Total $25.20 | "GST 5%: $1.20" | ✓ | |
| SK | Subtotal $24.00 · **GST + PST 11% $2.64** · Total $26.64 | "GST + PST 11%: $2.64" | | |

- **By card with a 15% tip:** ON reads "Subtotal $24.00 · HST 13% $3.12 · Tip 15% $3.60 · Total $30.72". There's no
  service fee line.
- **Screenshots:** `docs/canada-1/<engine>-ca-checkout-<on|bc|ab|sk>-<390|1440>.png`,
  `<engine>-ca-order-card-on-*.png` and `<engine>-ca-manage-tax-on-*.png`.

### 2.4 Two-part tax: the proposal (not built)
1. **Database:** a new `tax_parts jsonb` on `orders` and `order_drafts` (NOT RUN SQL), e.g.
   `[{"label":"GST","milli":5000,"minor":120},{"label":"PST","milli":6000,"minor":144}]`.
2. **Data:** `salesTax.parts` on the region.
3. **Engine** (`lib/order-charges.ts`): compute each part, each rounded once (D3 becomes one rounding *per part*), sum
   them into `tax_minor`, and add the column to `ORDER_CHARGE_COLUMNS`.
4. **Lines:** `chargeLinesFor` emits one line per part. Every surface already draws from it.

- **Cost:** a migration on the two money tables, an engine rule change, promotion carrying the new column, and every
  snapshot pin in the order and language harnesses.
- **Why it isn't built:** that is not small, so per the brief it stops at labels.
- **It matters for:** SK, where the rule is explicit, and MB.

## 3 · Allergens: the `ca` set

**The list (13, flat):** Peanuts, Tree nuts, Sesame, Milk, Eggs, Fish, Crustaceans, Molluscs, Soy, Wheat and
triticale, Mustard, Added sulphites, Gluten (barley, oats, rye).

**Sources:**
- Health Canada's priority allergens (<https://www.canada.ca/en/health-canada/services/food-allergies-intolerances/avoiding-allergens-food/allergen-labelling.html>):
  "Eggs", "Milk", "Mustard", "Peanuts", "Crustaceans and molluscs", "Fish", "Sesame seeds", "Soy", "Sulphites",
  "Tree Nuts", "Wheat and triticale".
- CFIA (<https://inspection.canada.ca/en/food-labels/labelling/industry/list-ingredients-and-allergens>): the nine
  tree nuts; "Added sulphites at levels of 10 ppm or more"; and the gluten sources barley, oats, rye, triticale and
  wheat.

**Two choices, both from the brief's wording:**
- Crustaceans and molluscs are two entries, as in the UK list, so a menu can say which.
- Barley, oats and rye are one gluten entry.

**What follows the anz pattern:**
- the CHECK (NOT RUN, block A);
- `ALLERGEN_SETS`, the loader, the types and the admin form ("Canada 13");
- `genericReplacements` ("Gluten" → Wheat and triticale / Gluten (barley, oats, rye); Dairy → Milk; …);
- both AI prompts (importer lines and example, card list, closing rule and examples);
- the importer's worked examples localised (Dairy → Milk, Gluten → Wheat and triticale).

**The WhatsApp guard (`ca` only):** it adds EpiPen, epi pen, anaphyla* and peanut-free / nut-free. Option B holds: a
presence question ("any mustard in the sauce?") still reaches the AI. The caveat maps everyday words to the labels
("dairy" → Milk, "shrimp" → Crustaceans, "gluten" → both cereal entries).

**Every other set is byte-identical:** hashes were taken at `fadb352f` for all eight helpers (uk14, us9, anz, no set)
and for the guard's answers on a 22-message corpus. They're pinned in `canada-1.cjs`.

**An allergen card on its own is allowed:**
- Canada's declaration rules are for prepackaged products (FDR B.01.010.1(2): "If a food allergen or gluten is
  present in a prepackaged product…").
- No sentence explicitly exempting restaurants or food trucks was found. The conclusion rests on the rules applying
  only to prepackaged food.
- CFIA's 2022 e-commerce proposal (voluntary, archived) would cover restaurant take-out sold online "before the
  purchase is concluded".
- Ontario's food premises regulation (O. Reg. 493/17) has no allergen rule.

## 4 · Address, route, locale, screenshots

- **`/ca`:** added to `COUNTRY_PATH_SEGMENTS`. With no row (live) or switched off, `/ca` → `/uk` and
  `/ca/compare` → `/uk/compare`, and Canada is in no hreflang set, sitemap, menu or /llms.txt (harness §2).
- **en-CA, over en-US.** I counted both bases:
  - en-US's 474 keys are mostly North American usage Canada shares: truck 52, pickup 67+, window 10, cart 7, TBD,
    combos, -ize.
  - So on an en-GB base, en-CA would repeat most of en-US's keys (roughly 400). On an en-US base it needs **87 keys
    in 30 namespaces**:
    - Canadian spelling (cancelled 49, colour 15, centre 7, favourite 5, grey, organized, licence, fulfil);
    - "postal code" for ZIP;
    - "card terminal" for "card reader";
    - "in Canada" in the footnote and the two landing descriptions ("for food trucks and catering in {country}",
      where en-US's "for {country} food trucks" would read "Canada food trucks").
  - **Never respelled:** the testimonial (a customer's own words) and two real US venue names in poster examples.
  - Every ICU skeleton is checked unchanged against en-US with the real ICU parser.
- **How it loads:** `LOCALE_PARENT = { 'en-CA': 'en-US' }` (`lib/i18n/locales.ts`).
  - `messagesFor` and the client registry merge the chain en-GB → en-US → en-CA.
  - Every other locale's chain is itself alone, so their output is unchanged (harness §3 recomputes each from the
    JSON files).
  - en-CA's per-namespace files are sparse: 30 files. A namespace en-CA doesn't touch imports no en-CA file.
- **hreflang:** en-CA → `/ca` when Canada is on, reciprocal across all six; og:locale `en_CA`; canonical `/ca`
  (harness §1).
- **Hero screenshots:** `public/screenshots/{customer-order,dashboard-v4,kitchen}-ca.png`, mapped in
  `lib/landing-screens.ts` (shown only on /ca), at the GB images' pixel sizes.
  - Made by `scripts/screenshots/anz-screens.cjs ca`, which now has a `ca` entry: Trinity Bellwoods Park, Toronto,
    C$18–22, Canada Dry, 355 mL, Toronto names.
  - The `ca` entry has its own `dateOrder` / `weekStart` / `eventDate`; AU and NZ keep theirs.
  - The clocks read "10:21 p.m.  Tue Sep 1", the event "Tomorrow, September 2nd".

## 5 · Payments

- **Connect:** `lib/stripe/connect.ts` creates the account with `identity.country` = the truck's country (`ca`), so
  there's no list to extend.
  - Platforms in "the United Kingdom… can create Express accounts for most countries Stripe supports"
    (<https://docs.stripe.com/connect/express-accounts>).
  - Direct charges: "Funds always settle in the country of the connected account" (<https://docs.stripe.com/connect/charges>).
- **Interac:** "Interac (In-person only)" (<https://docs.stripe.com/payments/payment-methods/overview>), and "Interac
  doesn't support placing a 'hold'". Online orders use cards, so there's no change.
  - Stripe's regulatory disclosure page lists an Interac card-not-present rate, which contradicts its docs. Treat
    Interac as in-person only.
- **Holds:** "Usually, an authorization for an online card payment is valid for 7 days"
  (<https://docs.stripe.com/payments/place-a-hold-on-a-payment-method>). There's no Canada restriction.
- **No Canada-specific checkout notice** was found (unlike Australia's eftpos notice).
- **Dashboard checks before switching on:**
  - enable Canada in Connect onboarding (Accounts v2: identity country CA);
  - a CA test account's default currency is `cad`, and payouts go to a Canadian bank;
  - the application fee on a CA direct charge, and its conversion to the GBP platform balance (the settlement-currency
    table didn't render in the research: **unverified**);
  - Apple Pay and Google Pay on the CA account;
  - the statement descriptor;
  - card-present Interac later, for walk-up payments: "In-person refunds are mandatory for Interac transactions".

## 6 · Legal: a Canada section, DRAFT ONLY (not applied)

It's the same shape as Australia and New Zealand. For `content/legal/country-specific-terms.md`, once a lawyer has
looked at §7:

> ## Canada
>
> ### For food truck operators
>
> **You are the seller.** You sell your food, and you are the merchant of record for your card payments, as section 5
> of the Terms of Service says. Your customers' order is with you, not with us. The consumer protection law of the
> province or territory where you sell applies to your sales, and you are responsible for meeting it. HatchGrab is the
> software you sell through.
>
> **Prices.** Your menu prices are shown before tax, and tax is added at checkout as its own line. Any fixed charge a
> customer must pay, other than tax, has to be in the price they see first. That is why HatchGrab does not offer an
> online service fee in Canada. Tips are optional and are yours.
>
> **Sales tax.** HatchGrab fills in the sales tax of the province or territory you are based in (GST, HST, or GST and
> PST) and names it on the bill. You can set your own rate instead. You are responsible for registering for, charging
> and paying GST/HST and any provincial sales tax correctly. If you sell items taxed at another rate, such as soft
> drinks or alcohol in British Columbia, set your rate to match.
>
> **Card payments.** Card payments from your customers go into your own Stripe account, which is set up for Canada
> during onboarding, in your own name, under your own agreement with Stripe. The money settles there, in Canadian
> dollars, and is paid out to your bank account by Stripe. We never hold it. HatchGrab does not add a card surcharge to
> your orders.
>
> **Allergens.** Canada's allergen labelling rules are for prepackaged food. HatchGrab lets you show Health Canada's
> priority allergens against each dish, show your allergen card, or both. HatchGrab shows exactly what you enter, as
> section 3 of the Terms of Service says. We do not check it.
>
> **Quebec.** HatchGrab is not available yet to trucks based in Quebec, because it is not yet available in French.
>
> **Our prices.** Accounts in Canada are billed in Canadian dollars. HatchGrab Ltd is a UK company. If you are
> registered for GST/HST, give us your registration number.
>
> **Your rights under local law.** Nothing in the Terms of Service takes away a right that the law where you are based
> says cannot be limited or waived.
>
> **Notices and governing law.** As the Australian section.
>
> ### Privacy, for everyone in Canada
>
> **The law that applies.** When we handle personal information of people in Canada, the Personal Information
> Protection and Electronic Documents Act (PIPEDA) applies, and in British Columbia and Alberta their own private-sector
> privacy laws, as well as the UK law named in our Privacy Policy.
>
> **Where your information is kept.** Your information is stored and processed in the United Kingdom, and some is
> handled by service providers in the European Union and the United States (section 6 of the Privacy Policy), where it
> may be accessed under those countries' laws.
>
> **Your requests.** You can ask for the personal information we hold about you and ask us to correct it. Email
> privacy@hatchgrab.com. We will reply within 30 days.
>
> **Complaints.** Tell us first at privacy@hatchgrab.com. If you are not satisfied, you can complain to the Office of
> the Privacy Commissioner of Canada at www.priv.gc.ca or on 1-800-282-1376.
>
> **Breaches.** If a breach of security safeguards involving your information creates a real risk of significant harm,
> we will report it to the Privacy Commissioner and tell you as soon as feasible.
>
> **Marketing emails.** We send marketing emails only with your consent, as Canada's anti-spam law requires. Every one
> says who it is from and how to unsubscribe, and we act on an unsubscribe within 10 business days.
>
> **Contact.** As the Australian section.

## 7 · Open questions: for a lawyer (L) or accountant (Acc)

- **C1 (Acc) GST/HST on our fees.**
  - The simplified regime registers a non-resident once supplies to "specified Canadian recipients" exceed **CAD
    30,000** in 12 months. That includes "a Canadian entity who is not registered under the normal GST/HST regime".
  - **So unregistered small-supplier trucks count, as consumers do**
    (<https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/digital-economy-gsthst/find-out-need-register/cross-border-threshold-amounts.html>;
    the definition is from a search excerpt).
  - With a registered truck's GST/HST number, no tax is charged. **HatchGrab collects no tax number today.**
- **C2 (L) Drip pricing.**
  - s. 74.01(1.1) is from the statute; the Competition Bureau site was down (503).
  - Is a plan's 0.99% fee on online orders (the truck's cost, not the customer's) outside it? It should be, since it
    isn't a customer price.
  - Who is liable as the publisher of a truck's price: the truck, or HatchGrab?
- **C3 (L) Provincial consumer law on online orders.** Ontario's internet-agreement rules apply above **$50** (O. Reg.
  17/05 s. 31). Before the contract: the supplier's name, address and phone, an itemized price including taxes, the
  total, cancellation and refunds (s. 32), and a chance to accept or decline (CPA s. 38(2)). A copy follows within
  15 days (O. Reg. 17/05 **s. 33**).
  - The order page shows no supplier address or phone (diagnosis §4.3).
  - BC (BPCPA ss. 47–48, amended 2025: s. 46 repealed) and Alberta (Internet Sales Contract Regulation ss. 4–5) are
    similar.
  - Most food orders are under $50, but the threshold is the total payment obligation.
- **C4 (L) PIPEDA reach and roles.** It applies to foreign organizations with a "real and substantial connection"
  (OPC, Globe24h).
  - Is HatchGrab a service provider (processor) for trucks' customer data, or an organization in its own right?
  - Who reports a breach?
  - BC and Alberta PIPA for intra-provincial data.
  - Bill C-36 (tabled 15 June 2026) would raise penalties to $10M / 3%; check its status.
- **C5 (L) Quebec.** Bill 96 makes contracts of adhesion "d'abord" in French from 1 June 2023, with commercial
  publications and websites in French (OQLF).
  - Does s. 55 also bind HatchGrab's B2B terms with Quebec trucks?
  - Quebec's card-fee ban (OPC Québec) and Law 25 come with it when Quebec opens.
- **C6 (L) Allergens online.** CFIA's 2022 voluntary e-commerce proposal would ask for allergen information "before
  the purchase is concluded". Is a truck's take-away container "prepackaged"?
- **C7 (L) CASL.** Are order confirmations exempt as transactional (s. 6(6))? Who is the "sender" when HatchGrab
  emails on a truck's behalf?
- **C8 (Acc) Ontario's $4 point-of-sale rebate** (§2.2) and **the SK/MB two-part line** (§2.4).

## 8 · NOT RUN SQL

**Order:**
1. **Block A, "run now":** before or after the deploy; widens the CHECK only.
2. **The deploy.**
3. **Block B, "run after deploy":** the CA row and prices, switched off.

Canada is switched on later in Admin › Countries, after its launch list:
- the Stripe Connect checks (§5);
- tzdata 2026e confirmed (First-4);
- the Canada terms section (§6–7);
- a hidden test truck run end to end.

**Block A** (`supabase/migrations/20261031_canada_allergen_set.sql`):

```sql
-- NOT RUN — canada-1 block A, "RUN NOW". No row holds 'ca' yet, so nothing changes for anyone. Before block B.
begin;
alter table public.country_settings drop constraint country_settings_allergen_set_chk;
alter table public.country_settings add constraint country_settings_allergen_set_chk
  check (allergen_set in ('uk14', 'us9', 'anz', 'ca'));
commit;
```

**Block B** (`supabase/migrations/20261032_canada_row.sql`): 51 columns and 51 values, checked against every live
CHECK (`allergen_set` passes once block A has run). The file carries a comment on every choice. The essentials:

```sql
-- NOT RUN — canada-1 block B, "RUN AFTER DEPLOY", after block A. Canada SWITCHED OFF.
begin;
insert into public.country_settings (country_code, name, enabled, currency, locale, time_format, date_order, week_start, phone_country_code,
  address_format, timezones, default_timezone, prices_include_tax, tax_label, card_surcharge_allowed, card_surcharge_cap_pct, card_surcharge_credit_only,
  card_surcharge_excluded_regions, service_fee_allowed, tipping_enabled_default, tip_presets_pct, allergen_set, starter_monthly_minor, pro_monthly_minor,
  max_monthly_minor, pro_allowance_minor, max_allowance_minor, platform_fee_pct, card_fee_online_pct, card_fee_online_fixed_minor, card_fee_in_person_pct,
  card_fee_in_person_fixed_minor, tap_to_pay_fixed_minor, card_fee_region_label, competitor_name, competitor_pct, competitor_fixed_minor, support_hours,
  updated_by, short_name, phone_example, phone_check, distance_unit, service_fee_recipient, service_fee_hatchgrab_bps, service_fee_hatchgrab_fixed_minor,
  service_fee_truck_max_bps, service_fee_truck_max_fixed_minor, platform_fee_enabled, fees_taxed, allergen_card_only_allowed)
values ('CA', 'Canada', false, 'CAD', 'en-CA', '12h', 'mdy', 'sunday', '1', 'ca',
  array['America/Toronto','America/Vancouver','America/Edmonton','America/Winnipeg','America/Regina','America/Halifax','America/St_Johns','America/Moncton','America/Whitehorse','America/Iqaluit'],
  'America/Toronto', false, 'Sales tax', false, null, false, '{}'::text[],
  false,   -- ⛔ SERVICE FEE OFF — DO NOT SWITCH ON WITHOUT LEGAL ADVICE: Competition Act s. 74.01(1.1), drip pricing
  true, array[10, 15, 20]::numeric[], 'ca', null, null, null, null, null, null, 2.90, 30, 2.70, 5, 15, 'Canadian cards',
  null, null, null, null, 'canada-1 draft', 'Canada', '416-555-0123', 'length', 'km', 'truck', null, null, null, null, false, false, true);
insert into public.plan_prices (plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor) values
  ('payg', 'CA', 0, 0, 99, 0), ('pro', 'CA', 3900, 550000, 99, 3900), ('unlimited', 'CA', 9900, null, 0, 9900);
commit;
```

## 9 · Read-only SQL run

```sql
select * from public.country_settings where country_code in ('US','AU','NZ') order by country_code;
```
This was the shape to mirror. AU/NZ are `prices_include_tax` true, GST, surcharge/service fee/tipping off. US is
`prices_include_tax` false, "Sales tax", surcharge allowed (cap 3%, credit only, CT/MA/PR excluded), service fee
allowed (truck max 400 bps / 50¢), tipping on (10/15/20), `fees_taxed` false, `date_order` mdy, Sunday weeks.

```sql
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.country_settings'::regclass and contype = 'c' order by conname;
```
The relevant CHECKs:
- `allergen_set` ∈ (uk14, us9, anz);
- `address_format` ∈ (gb, us, ie, au, nz, ca);
- `date_order` ∈ (dmy, mdy);
- the currency list includes CAD;
- `default_timezone = ANY (timezones)`;
- `phone_country_code ~ '^[1-9][0-9]{0,2}$'`;
- `tip_presets_pct` within 0–100.

```sql
select (select count(*) from public.country_settings where country_code = 'CA') as ca_rows, (select count(*) from public.plan_prices where country_code = 'CA') as ca_prices, (select json_agg(json_build_object('plan', plan_key, 'monthly', monthly_minor, 'included', included_online_minor, 'fee_bps', fee_bps, 'van', extra_van_monthly_minor) order by plan_key) from public.plan_prices where country_code = 'AU') as au_prices, (select string_agg(tgname, ', ' order by tgname) from pg_trigger where tgrelid in ('public.country_settings'::regclass, 'public.plan_prices'::regclass) and not tgisinternal) as triggers;
```
The result:
- CA rows 0 and CA prices 0;
- AU prices payg 0/0/99/0, pro 3900/550000/99/3900, unlimited 9900/null/0/9900;
- triggers `country_settings_require_plan_prices` and `plan_prices_keep_enabled_countries_priced`.

## 10 · Proof

| Check | Result |
|---|---|
| `scripts/canada-1.cjs` (new, swept) | **85/85**, covering §1–9 of its header: CA on (pages, PDF, hero images, hreflang, sitemap, /llms.txt); CA off and no row; en-CA; tax by province on every surface; allergens with pins; Quebec; Manage tax; the data rule; the SQL (parsed: the fixture row IS the SQL's) |
| Negative controls (restored after each) | Quebec's `signupClosed` removed: **3 failures**. Ontario at 13.5%: **9 failures** |
| Live countries byte-identical | the snapshot from before any edit, re-run after: **GB, US, IE, AU, NZ: 15 pages + metadata, 5 PDFs, /llms.txt and all 27 money-helper rows identical**. Only native-prices' illustrative CA fixture changed (en-CA wording; its prices unchanged) |
| Other allergen sets | uk14 / us9 / anz / no set: all eight helpers and the guard corpus identical (hash pins) |
| Screenshots (`docs/canada-1/`) | WebKit 2359 and Chromium 1243, 390 and 1440, the build's CSS: `/ca` landing, /features, /compare, PDF (+ `plans-ca.pdf`), the ON/BC/AB/SK checkouts, the order card, Manage tax. Plus the three hero images. `measurements.json`: no horizontal scroll; the totals ($30.72 ON, $28.80 BC and AB, $30.24 SK, with a 15% tip) |
| tsc | 0 errors |
| build | passes (run twice; the second after the last app change); `/[country]` serves `/ca` |
| lint | **2,445 errors / 378 warnings before and after**. No file has more than before; the new scripts carry the usual reasoned `no-require-imports` disable |
| full sweep | **159 run · 159 passed · 0 failed**. The first run failed only `messages-parity`, on the new Quebec sentence; it is named below and the re-run passed |

**Re-pinned for this approved change:**
- `scripts/anz-1.cjs`: the set list is now uk14, us9, anz, ca.
- `scripts/_native-prices-fixtures.cjs`: CA has its real `/ca` address now, so only the SE fixture's segment is
  patched in.
- `scripts/_messages-parity-1e.cjs`: `tradeArea.region_closed` is named as a NEW wording (canada-1). Its words weren't
  in `eb7ed44`'s source, because it is a new sentence.

**Fixed, not re-pinned:** the order page's tax notice keeps acronyms as written (First-7).

## 11 · Files

- **Data and config:**
  - `lib/address-formats.ts`: `Region.signupClosed`, `Region.salesTax`, the CA provinces' data, `regionSalesTax`,
    validator checks;
  - `lib/allergens.ts` (`ca`);
  - `lib/marketing-country.ts` (`/ca`);
  - `lib/landing-screens.ts` (CA images);
  - `lib/i18n/locales.ts` (`en-CA`, `LOCALE_PARENT`, `overrideChain`).
- **Code:**
  - `lib/order-charge-rules.ts` (the region's tax);
  - `lib/trade-area.ts` (`region_closed`);
  - `components/setup/WhereBasedStep.tsx` (passes the format);
  - `components/manage/ChargesCard.tsx` (the default line);
  - `app/trucks/[slug]/order/page.tsx` (acronyms in the notice);
  - `lib/i18n/messages.ts`, `lib/i18n/registry.ts` (the chain);
  - `lib/whatsapp-classifier.ts` (`ca` guard and caveat);
  - `lib/country-settings.ts`, `lib/country-settings-types.ts`, `lib/admin/country-form.ts`,
    `components/admin/CountriesTab.tsx` (`ca`).
- **Messages:**
  - `messages/en-CA.json` (new, 87 keys);
  - `messages/en-GB.json`: `tradeArea.region_closed`, `manageCharges.rate.regionDefault`;
  - the generated `messages/ns/**` and `lib/i18n/catalog/**`.
- **SQL (NOT RUN):** `supabase/migrations/20261031_canada_allergen_set.sql`, `20261032_canada_row.sql`.
- **Harnesses and recipes:**
  - `scripts/canada-1.cjs`, `scripts/_canada-1-fixtures.cjs`, `scripts/canada-1-screens.cjs` (new, registered);
  - `scripts/screenshots/anz-fixtures.cjs`, `order-anz.cjs`, `anz-screens.cjs`, `README-anz.md` (the `ca` entry);
  - `scripts/split-messages.cjs`;
  - the re-pins above.
- **Images:** `public/screenshots/*-ca.png` (3) and `docs/canada-1/` (38 shots, 3 hero copies, `plans-ca.pdf`,
  `measurements.json`).

## Undo (only if Dominic asks)

Nothing has run in the database. If block A has run and must be reversed, and no row holds `ca`:

```sql
begin;
alter table public.country_settings drop constraint country_settings_allergen_set_chk;
alter table public.country_settings add constraint country_settings_allergen_set_chk check (allergen_set in ('uk14', 'us9', 'anz'));
commit;
```

If block B has run: `delete from public.plan_prices where country_code = 'CA'; delete from public.country_settings where country_code = 'CA';`.
That works only while Canada is switched off and has no trucks.
