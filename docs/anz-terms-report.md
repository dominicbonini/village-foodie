# anz-terms: Australia and New Zealand sections of the Country-specific terms

**Date:** 22 October 2026 · **Branch:** `main` (uncommitted, on top of `7fcd4fc9`) · nothing pushed or deployed · no
database change; one read-only query (§7).

**The prompt** arrived intact: nothing was garbled and no two instructions contradicted each other.

**Where the official sources differ from the brief, the text follows the sources:**

1. **The Australian surcharge rule is not a statutory ban.**
   - From 1 October 2026 the **card networks' rules** (eftpos, Mastercard, Visa) don't allow surcharges, after the RBA
     removed its own prohibition on such rules. American Express, UnionPay and PayPal removed surcharging voluntarily.
   - The text says exactly that ("the card networks' rules no longer allow a surcharge…").
2. **Australian proof of transaction is required "over $75 (excluding GST)", or within 7 days of a request**
   (business.gov.au). It is not "$75 or more". The text uses the official wording.
3. **New Zealand has no surcharge ban in force.**
   - The Retail Payment System (Ban on Merchant Surcharges) Amendment Bill has stalled after its first reading. As
     proposed, it covers in-store payments only.
   - The NZ text says only that HatchGrab adds no surcharge.
4. **The Privacy Act 1988 small business exemption.**
   - HatchGrab is *likely* within it (§4, A4). The text **doesn't rely on it**: it commits to follow the Australian
     Privacy Principles and never mentions the exemption.
5. **New Zealand: contracting out of the Consumer Guarantees Act.** I included a short "Business use" clause, which
   the CGA allows between businesses in writing. I didn't contract out of the Fair Trading Act: the Commerce
   Commission says that is unlikely to be "fair and reasonable" in a standard-form contract. Both are open questions
   for a lawyer (§4, N1).
6. **Spelling:** UK spelling throughout. The US section's precedent is to use the country's own spelling, and
   Australian and New Zealand English spell these words the UK way ("organisation", "licence"), so the two rules
   agree.
7. **Dates:** the page's "Last updated", `COUNTRY_TERMS_UPDATED` and `TERMS_VERSION` all moved to **22 October 2026**,
   the build date, as ireland-3 moved them to its date.

## Summary

- **`content/legal/country-specific-terms.md`** now has United States, Ireland, **Australia**, **New Zealand**, in that
  order. Each new section has the same shape as the others: "For food truck operators", then "Privacy, for everyone
  in …", with a bold label opening each paragraph.
- **What they cover:**
  - **Australia:**
    - the truck as seller under the Australian Consumer Law (guarantees, single total price, proof of transaction
      with ABN/ACN);
    - the surcharge rule;
    - Stripe in AUD with the dual-network debit notice;
    - PEAL allergens, with card mode allowed;
    - GST, both theirs and ours;
    - the Privacy Act 1988 and APPs with the OAIC;
    - notices and governing law.
  - **New Zealand:**
    - the truck as seller "in trade" under the Fair Trading Act and Consumer Guarantees Act;
    - Stripe in NZD;
    - allergens under the same Code;
    - GST, theirs and ours (remote services);
    - a business-use CGA clause;
    - the Privacy Act 2020 for an overseas agency, with the Privacy Commissioner's complaint route and notifiable
      breaches;
    - notices and governing law.
- **No "[FLAG"** anywhere; every open question is in §4.
- **Byte-identical:** the Terms of Service, the Privacy Policy, the intro, and the US and Ireland sections.
- **What the text says the product does, it does:** AUD checkout notice, ANZ allergen names, card mode allowed in
  AU/NZ, no surcharge, tax-inclusive prices. Checked in code and on the live rows.
- **Proof:**
  - new harness `anz-terms` **31/31** (with negative controls);
  - legal harnesses pass;
  - screenshots in WebKit and Chromium;
  - tsc 0 errors, and the build passes;
  - lint unchanged at 2,445 / 378;
  - full sweep **158/158**.

## 1 · What each section says, and its source

**Access to sources:**
- accc.gov.au and ato.gov.au refused automated fetches (HTTP 403). Those pages were read as Wayback Machine snapshots
  of the exact official URLs; the snapshot dates are below.
- legislation.gov.au loads the Competition and Consumer Act text dynamically, so ACL ss 48, 64 and 100 weren't read.
- legislation.govt.nz, mbie.govt.nz and mpi.govt.nz blocked every automated request, so **no NZ statute text was
  opened**. NZ points rest on official guidance pages (consumerprotection.govt.nz, comcom.govt.nz, ird.govt.nz,
  privacy.org.nz, foodstandards.gov.au).

### Australia

| Text says | Official source | Status |
|---|---|---|
| ACL applies; consumer guarantees can't be taken away | ACCC, [consumer rights and guarantees](https://www.accc.gov.au/consumers/buying-products-and-services/consumer-rights-and-guarantees) (snapshot 20 Oct 2026): "can't be taken away by anything a business says or does"; [business.gov.au ACL](https://business.gov.au/legal/fair-trading/australian-consumer-law-and-your-business) | Supported |
| Each price as a single total figure | ACCC, [price displays](https://www.accc.gov.au/business/pricing/price-displays) (snapshot 18 Nov 2025): "display the total price … as a single figure"; [business.gov.au](https://business.gov.au/legal/fair-trading/display-prices) | Supported |
| Proof of the sale with business name and ABN or ACN, over $75 (ex GST) or within 7 days on request | [business.gov.au receipts](https://business.gov.au/finance/payments-and-invoicing/receipts-and-proof-of-purchase): "over $75 (excluding GST)" / "within 7 days" / "your business name your Australian Business Number (ABN) or Australian Company Number (ACN)" | Supported (s 100 text not read) |
| From 1 Oct 2026 network rules don't allow surcharges on eftpos, Mastercard, Visa; Amex removed surcharging; don't rename it | RBA [non-technical summary](https://www.rba.gov.au/payments-and-infrastructure/review-of-retail-payments-regulation/2026-03/non-tech-summary.html): "should end on 1 October 2026 … eftpos, Mastercard and Visa"; RBA [FAQs](https://www.rba.gov.au/payments-and-infrastructure/review-of-retail-payments-regulation/2026-03/conclusions-paper/faqs/): "American Express, UnionPay and PayPal have also decided to remove surcharging"; ACCC [card surcharges](https://www.accc.gov.au/consumers/pricing/card-surcharges) (snapshot 12 Oct 2026) warns against relabelling; [business.gov.au news](https://business.gov.au/news/card-payment-surcharge-changes) (1 Oct 2026) | Supported, as network rules |
| Stripe account in AUD; dual-network debit cards may be processed through either network; checkout says so | RBA [least-cost routing](https://www.rba.gov.au/payments-and-infrastructure/debit-cards/least-cost-routing/); Stripe [eftpos Australia](https://docs.stripe.com/payments/eftpos-australia): "you must inform your customers …"; product: `order.dualNetworkNotice` on AUD checkouts (anz-1 §5) | Supported |
| Allergens under the Code, Standard 1.2.3 names; unlabelled food: displayed with the food or on request | FSANZ [allergen labelling](https://www.foodstandards.gov.au/business/labelling/allergen-labelling) (updated 30 Sep 2025): "displayed in connection with the food or provided to the purchaser upon request using the required names"; names milk, egg, peanut, wheat, crustacean… | Supported ("food truck" mapped to FSANZ's "café or takeaway") |
| Tax invoice with ABN when the law requires one | [business.gov.au invoicing](https://business.gov.au/finance/payments-and-invoicing/how-to-invoice): "more than $82.50 (including GST)", on request within 28 days, ABN required | Supported (written generally) |
| HatchGrab not GST-registered; a registered truck gives its ABN and says it's registered, then reverse-charges where it applies | ATO [cross-border B2B](https://www.ato.gov.au/businesses-and-organisations/international-tax-for-business/gst-for-non-resident-businesses/gst-cross-border-transactions-between-businesses) (snapshot, updated 11 Sep 2025): not connected with Australia if sold to a GST-registered business; reverse charge "acquires it not wholly for a creditable purpose"; ATO [importing services](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/rules-for-specific-transactions/international-transactions/australian-business-importing-goods-and-services): "give them your … ABN" and "state that you are registered for GST" | Supported; open A3 |
| Rights that can't be "excluded, restricted or modified" | ACL s 64 wording (not opened; see A6) | Wording from the statute's known form; for a lawyer |
| We follow the APPs (Privacy Act 1988) | Privacy Act compilation No. 104 (4 Jun 2026), [s 6D, s 5B](https://www.legislation.gov.au/C2004A03712/2026-06-04/2026-06-04/text/original/epub/OEBPS/document_1/document_1.html) | Commitment; see A4 |
| Data in the UK; providers in the EU and US (Privacy Policy §6) | our Privacy Policy §6 | Matches the policy |
| Complain to us first, then in writing to the OAIC (after 30 days) | OAIC [lodge a complaint](https://www.oaic.gov.au/privacy/privacy-complaints/lodge-a-privacy-complaint-with-us): complain to the organisation first and allow 30 days; complaints "must be made in writing" | Supported |

### New Zealand

| Text says | Official source | Status |
|---|---|---|
| Selling "in trade"; FTA and CGA apply; consumer guarantees can't be contracted out of with consumers | [consumerprotection.govt.nz FTA](https://www.consumerprotection.govt.nz/guidance-for-businesses/complying-with-consumer-laws/obligations-under-the-fair-trading-act): "regularly selling products or services"; [CGA](https://www.consumerprotection.govt.nz/general-help/consumer-laws/consumer-guarantees-act): "A business cannot contract out of the CGA when selling to consumers" | Supported |
| Stripe in NZD; HatchGrab adds no surcharge | product (`lib/order-charge-rules.ts` `surcharge: null`); no NZ ban in force (N3) | Fact about the product |
| Allergens: displayed with the food, e.g. on the menu, or on request | FSANZ (as above); MPI wording "must be displayed with the food such as listed on the menu, or provided to the customer on request" from a search snippet only (MPI blocked) | Supported via FSANZ |
| HatchGrab not GST-registered in NZ; a registered truck gives its GST number or NZBN; reverse charge where it applies | IRD [remote services](https://www.ird.govt.nz/gst/gst-for-overseas-businesses/supplying-remote-services-into-new-zealand) (updated 12 Sep 2026): "You do not need to register … if you only provide remote services to New Zealand businesses that are already GST registered"; customers treated as unregistered unless they "provide their GST registration number or a New Zealand business number"; IRD [special supplies](https://www.ird.govt.nz/gst/charging-gst/special-supplies): reverse charge if taxable use "less than 95%" | Supported; open N4 |
| Business use: the CGA doesn't apply to HatchGrab's service, agreed in writing as fair and reasonable | [consumerprotection.govt.nz CGA for businesses](https://www.consumerprotection.govt.nz/guidance-for-businesses/complying-with-consumer-laws/obligations-under-the-consumer-guarantees-act): in writing, fair and reasonable, both in trade | Allowed in principle; open N1 |
| Privacy Act 2020 applies to us as an overseas agency carrying on business in NZ | [privacy.org.nz knowledge base 154](https://www.privacy.org.nz/resources-and-learning/knowledge-base/view/154/): "even if an organisation is based overseas" | Supported (s 4 text not opened) |
| Access and correction; reply within 20 working days | [IPP 6](https://www.privacy.org.nz/privacy-principles/6/), [IPP 7](https://www.privacy.org.nz/privacy-principles/7/); [responding to requests](https://www.privacy.org.nz/responsibilities/poupou-matatapu-doing-privacy-well/responding-to-requests-and-complaints-well/): "Generally, this must be done within 20 working days" | Supported |
| Complain to us first, then OPC: www.privacy.org.nz, 0800 803 909, PO Box 10 094, Wellington 6140 | [making a complaint](https://www.privacy.org.nz/your-rights/making-a-complaint/): "We won't accept a complaint … if you haven't done step one"; [contact](https://www.privacy.org.nz/tuhono-connect/contact-us/) | Supported |
| Serious-harm breaches notified to the Commissioner and you as soon as practicable | [privacy breaches](https://www.privacy.org.nz/responsibilities/privacy-breaches/): "must notify the Privacy Commissioner and any affected people as soon as you are practically able" | Supported |

## 2 · What the sections say the product does: checked

| Claim | Where it's true |
|---|---|
| AUD checkout tells customers about dual-network debit | `app/trucks/[slug]/order/page.tsx:3709` (`currencyInfo(…)?.eftposNotice`, AUD only); message `order.dualNetworkNotice` |
| HatchGrab adds no card surcharge | `lib/order-charge-rules.ts` `surcharge: null` for every country; live AU/NZ `card_surcharge_allowed = false` |
| Prices include any GST; no tax added on top | live AU/NZ `prices_include_tax = true`, `tax_label = 'GST'`; no rate box (`charges_rate_not_here`) and no tax line (`taxRateMilli` null) |
| Allergens per dish, card, or both, with the Code's names | live AU/NZ `allergen_set = 'anz'`, `allergen_card_only_allowed = true`; `lib/allergens.ts` ANZ list (Milk, Egg, Peanut, Wheat, Crustacean…) |
| HatchGrab's order emails show no ABN | no ABN/tax-number field exists (address-formats-diagnosis §4.2) |
| Billed in AUD / NZD | plan prices in AUD/NZD (anz-1 §2) |

`anz-terms.cjs` §5 pins the code facts; §7 has the live query.

## 3 · Dates and `TERMS_VERSION`

| | Before | After |
|---|---|---|
| Page "Last updated" | 21 October 2026 | **22 October 2026** |
| `COUNTRY_TERMS_UPDATED` | '21 October 2026' | **'22 October 2026'** |
| `TERMS_VERSION` | '2026-10-21' | **'2026-10-22'** |
| `PRIVACY_UPDATED`, `TERMS_UPDATED` | 19 / 20 October 2026 | unchanged |

- `TERMS_VERSION` is write-only (signup records it), as before. The ireland-3 code check still holds.
- The sitemap's `/country-terms` lastmod follows to 2026-10-22.

## 4 · Open questions: for a lawyer (L) or accountant (Acc)

### Australia
- **A1 (L) The surcharge rule's legal form.**
  - It's network rules, not a statute, so enforcement is by the card networks (RBA FAQs: "The card networks are
    ultimately responsible for ensuring compliance").
  - Unverified: BNPL treatment, and whether RBA Standards 1–3 were registered on 14 April 2026 (search summary only).
  - Confirm the wording "card networks' rules no longer allow".
- **A2 (L, product) Proof of transaction and ABN.**
  - ACL s 100 requires the supplier's ABN or ACN on proof of transaction over $75 (excluding GST).
  - HatchGrab's confirmation emails carry no ABN; the text puts the duty on the truck.
  - Should HatchGrab collect the ABN and print it? (Backlog §27; diagnosis §4.4.)
  - I couldn't read the s 100 text.
- **A3 (Acc) GST on our fees.**
  - A truck not registered for GST counts as a **consumer** for the offshore-supplier rules ([ATO importing
    services](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/rules-for-specific-transactions/international-transactions/australian-business-importing-goods-and-services)).
    HatchGrab's fees to unregistered trucks count towards the **A$75,000** registration threshold ([how Australian GST
    works](https://www.ato.gov.au/businesses-and-organisations/international-tax-for-business/gst-for-non-resident-businesses/how-australian-gst-works)).
    Above it, HatchGrab must register (simplified registration exists) and charge 10% to those trucks.
  - Collect the ABN and a statement of registration from registered trucks. HatchGrab doesn't collect either today.
  - Unverified: draft ruling GSTR 2026/D1 on whether a representation of registration is enough.
  - Unverified: whether HatchGrab "carries on an enterprise in Australia".
- **A4 (L) Privacy Act 1988 coverage.**
  - **Probably exempt.** A business with annual turnover of A$3 million or less is a small business operator (s 6D(1))
    and outside the Act. None of the s 6D(4) exceptions obviously applies:
    - no health service;
    - no selling of personal information for a benefit;
    - no Commonwealth contract.
  - **Reached anyway.** The Act would reach HatchGrab because it "carries on business in Australia" (s 5B(3)); the
    collect-or-hold-in-Australia limb was repealed on 13 Dec 2022 (OAIC APP Guidelines [Chapter
    B](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-b-key-concepts)).
  - **The text doesn't rely on the exemption:** it commits to the APPs. Confirm the commitment.
  - Confirm the APP 8 cross-border position (US providers).
  - I left out a Notifiable Data Breaches promise for Australia: if exempt, the scheme doesn't apply. Say if you want
    it promised anyway (the NZ section has one, because the NZ Act clearly applies).
- **A5 (L) Allergens online.** FSANZ's on-request route is written for cafés and takeaways. Whether an online pre-order
  needs the information in writing before purchase is **unconfirmed**. The Code text wasn't opened.
- **A6 (L) Our own terms against the ACL, the most important point for a lawyer.**
  - Under the ACL a business buying **services costing under A$100,000** is a "consumer" ([business.gov.au](https://business.gov.au/legal/fair-trading/australian-consumer-law-and-your-business):
    guarantees cover goods and services that "cost less than $100,000"). So the consumer guarantees likely apply to
    **HatchGrab's own service to the truck** and can't be excluded (s 64), only limited for non-household services
    (s 64A).
  - Terms §6 (availability) and §7 (liability) need a lawyer's check against ss 64/64A. "Your rights under local law"
    preserves them meanwhile.
  - **Also unverified:** the unfair contract terms regime for standard-form small business contracts (penalties since
    9 Nov 2023), which covers our click-through terms.
- **A7 (L) Governing law** of England and Wales for Australian business customers, against ACL protections that
  can't be excluded by agreement. The text preserves them.
- **A8 (L) Marketing emails:** the Spam Act 2003 wording (consent, sender identification, functional unsubscribe)
  wasn't researched. The text is the Irish section's general wording.

### New Zealand
- **N1 (L) Contracting out.**
  - The "Business use" clause relies on CGA business-to-business contracting out: in writing, both in trade, fair and
    reasonable ([consumerprotection.govt.nz](https://www.consumerprotection.govt.nz/guidance-for-businesses/complying-with-consumer-laws/obligations-under-the-consumer-guarantees-act)).
  - Two things to confirm:
    - whether a click-through clause satisfies "fair and reasonable";
    - whether the CGA applies at all to ordering software, which is probably not "ordinarily acquired for personal,
      domestic or household use" ([faulty goods bought by
      businesses](https://www.consumerprotection.govt.nz/guidance-for-businesses/solving-problems-with-suppliers/faulty-goods-and-services-bought-by-businesses)).
  - I didn't contract out of the FTA (ComCom [contracting
    out](https://www.comcom.govt.nz/business/your-obligations-as-a-business/contracting-out-of-the-fair-trading-act/);
    its 2025 advice says contracting out in a non-negotiable standard form is unlikely to be fair and reasonable).
- **N2 (L) Unfair contract terms.** Since **16 August 2022** the FTA protects businesses in standard-form small trade
  contracts (annual value under NZ$250,000) ([ComCom
  2022](https://www.comcom.govt.nz/news-and-media/news-and-events/2022/new-provisions-come-into-force-tackling-unfair-business-practices/)).
  Our terms with a truck are one, so Terms §6–7 need checking. Only the Commission can act.
- **N3 (L) Surcharges.**
  - The ban bill has stalled: the bill page and MBIE/Beehive pages didn't load. Its status comes from non-official
    sources (RNZ, eftpos.co.nz, b2bnews, Mar–Oct 2026).
  - As proposed it is in-store only. The text makes no claim either way.
  - Unverified: the Commerce Commission's interchange caps.
- **N4 (Acc) GST on our fees.**
  - Software is a "remote service". Supplying only GST-registered NZ businesses for business use needs no
    registration.
  - Unregistered trucks are treated as consumers unless they give a GST number or NZBN. Over NZ$60,000 in 12 months of
    such supplies, HatchGrab must register ([IRD](https://www.ird.govt.nz/gst/gst-for-overseas-businesses/supplying-remote-services-into-new-zealand)).
  - Section references: B2B exclusion s 8(4D), zero-rating option s 11A(1)(x), customer presumption s 8B(5), reverse
    charge s 8(4B) (95% taxable-use test).
  - To confirm:
    - that only unregistered customers count towards the NZ$60,000 (IRD's page reads "total supplies … to New Zealand
      customers");
    - whether to opt into zero-rating;
    - the current statute text.
  - HatchGrab doesn't collect a GST number or NZBN today (backlog §27).
- **N5 (L) Privacy Act 2020 detail.**
  - The s 4 text wasn't opened.
  - IPP 12 cross-border disclosure to US providers needs comparable safeguards, authorisation, or the provider
    carrying on business in NZ ([IPP 12](https://www.privacy.org.nz/privacy-principles/12/)).
  - The breach split between HatchGrab and the truck relies on HatchGrab holding customers' data as the truck's agent
    (the Act's agency rule, not opened). Confirm the "or help the truck" wording.
  - **IPP 3A** (notifying people when information is collected indirectly) has been in force since 1 May 2026
    ([OPC](https://www.privacy.org.nz/resources-and-learning/a-z-topics/ipp3a/)). Check whether any indirect
    collection (e.g. menu or schedule imports naming people) needs a notice.
- **N6 (L, product) "In trade" at the point of sale.** ComCom expects in-trade status to be clear where the customer
  buys (diagnosis §4.1). The order page shows the truck's name but no "sold by … a business" line. Product decision.
- **N7 (L) Allergens and food registration.** The MPI pages were blocked, so the MPI wording is from a search snippet.
  Food Act 2014 registration (usually with the council) isn't mentioned in the text.

### Both
- **B1 (L)** Governing law of England and Wales, and whether "notices … at the email address on your account" works for
  AU/NZ.
- **B2 (product)** Both sections ask registered trucks to "give us" an ABN or GST number/NZBN; there is no field for it
  yet.

## 5 · Proof

| Check | Result |
|---|---|
| `scripts/anz-terms.cjs` (new, registered) | **31/31**. It checks: everything before `## Australia` = the pre-change page (`scripts/fixtures/country-terms-before-anz.md`) with only the date moved; US (4,766 bytes) and Ireland (4,804 bytes) sections byte-identical; Terms and Privacy byte-identical to `7fcd4fc9`; headings in order; the US/Ireland shape and bold labels; UK spelling; every brief point present (26 AU, 26 NZ); no NZ surcharge-ban claim; no reliance on the small business exemption; no "[FLAG"; the dates; the five product facts; and the real renderer (= before + AU + NZ, headings in order) |
| Negative controls (file restored after each) | one character in the Ireland section: **3 failures**; a "[FLAG 1]" in Australia: **1 failure** |
| SHA-256 | Terms `52fc845a…4b0a1a`, Privacy `400c0045…a0e7` (unchanged since `7fcd4fc9`); US section `34edb14d054515a7`, Ireland `adeb0c321dea8782` (= before) |
| Legal harnesses | `us-legal-draft` 36/36, `legal-follow-ups` 34/34, `ireland-3` 23/23, `outreach-legal-footer` ✅ |
| Date chain | language-phase-1c 4498/4498, -2 1818/1818, -1e 1024/1024, -1e-tidy 61/61, plans-data-model 150/150, seo-fixes 86/86 |
| tsc | 0 errors |
| Build | passes; `/country-terms` in the route list |
| Lint | 2,445 errors / 378 warnings before and after; no file has more errors |
| Full sweep | **158 run · 158 passed · 0 failed** |

**Screenshots (`docs/anz-terms/`).**
- **How:** a production build served on :3123 (`next start`, stopped afterwards), opened at
  `http://hatchgrab.localhost:3123/country-terms` in WebKit (Playwright 2359) and Chromium (1243).
- **Files:**
  - `<engine>-country-terms-full-1280.png`: the whole page;
  - `<engine>-australia-<1280|390>.png` and `<engine>-new-zealand-<1280|390>.png`: each new section.
- **`measurements.json`:** in both engines and at both widths:
  - status 200;
  - headings `["United States","Ireland","Australia","New Zealand"]`;
  - "Last updated" 22 October 2026;
  - no "[FLAG";
  - `scrollWidth` equal to the viewport (no horizontal scroll at 390);
  - title "Country-specific terms — HatchGrab".

## 6 · Re-pins

**For these dates (22 October 2026 / '2026-10-22'):**
- `scripts/us-legal-draft.cjs`: `COUNTRY_TERMS_DATE`.
- `scripts/legal-follow-ups.cjs`: `TERMS_VERSION`.
- `scripts/ireland-3.cjs`: its date, constant and version pins.
- `scripts/_lp-anz-terms.cjs` (new module) and its hooks, each after ireland-3's step:
  - signup `terms_version` 2026-10-21 → 2026-10-22, in `_lp2-named.cjs` (language-phase-1c and -2);
  - sitemap `/country-terms` lastmod 2026-10-21 → 2026-10-22, in `_lp1e-named.cjs`, `language-phase-1e-tidy.cjs` and
    `plans-data-model.cjs`.

**Forced by adding the sections (not dates; named so nothing hides):**
- `us-legal-draft.cjs`: the list of country headings is now `["United States","Ireland","Australia","New Zealand"]`.
- `ireland-3.cjs`: it read "the Ireland section" to the end of the file, so it now reads up to `## Australia`, and its
  render check is "before + Ireland, then any later country".
- Neither loosens what those harnesses prove about the US and Ireland text; `anz-terms.cjs` re-proves both byte for
  byte.

## 7 · Read-only SQL run

```sql
select country_code, enabled, currency, locale, prices_include_tax, tax_label, allergen_set, allergen_card_only_allowed, card_surcharge_allowed, service_fee_allowed, tipping_enabled_default, platform_fee_enabled from public.country_settings where country_code in ('AU','NZ') order by country_code;
```

| country | enabled | currency | locale | prices_include_tax | tax_label | allergen_set | card_only_allowed | surcharge | service_fee | tipping_default | platform_fee |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AU | true | AUD | en-AU | true | GST | anz | true | false | false | false | false |
| NZ | true | NZD | en-NZ | true | GST | anz | true | false | false | false | false |

## 8 · Files

- `content/legal/country-specific-terms.md`: the date line, and the Australia and New Zealand sections.
- `lib/legal.ts`: `COUNTRY_TERMS_UPDATED`, `TERMS_VERSION`, and its comment.
- `scripts/anz-terms.cjs`, `scripts/_lp-anz-terms.cjs`, `scripts/fixtures/country-terms-before-anz.md` (new).
- `scripts/us-legal-draft.cjs`, `scripts/legal-follow-ups.cjs`, `scripts/ireland-3.cjs`, `scripts/_lp2-named.cjs`,
  `scripts/_lp1e-named.cjs`, `scripts/language-phase-1e-tidy.cjs`, `scripts/plans-data-model.cjs`,
  `scripts/harnesses.json`: re-pins and registration.
- `docs/anz-terms/`: 10 screenshots and `measurements.json`.

## Undo (only if Dominic asks)

There's no database change. Remove the two sections, put the date back to 21 October 2026 (in the file and in
`COUNTRY_TERMS_UPDATED`) and `TERMS_VERSION` back to '2026-10-21', and revert the §6 re-pins.
