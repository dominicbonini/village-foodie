# world-countries-2 — report

*1 November 2026. Branch: `main` (working tree; nothing committed, pushed or deployed). Follows docs/world-countries-1-report.md.*

## Summary

Dominic's decisions on the world-countries-1 flags are done:
- **F2:** Terms §4 is true in every country, still naming no plan or price. The Country-specific terms have sections for BR, MX, JP, SG, HK, MY, TH and AE, and both documents are re-dated 1 November 2026.
- **F1:** banner, trial popup and Billing agree in the Unlimited-only countries, in every language.
- **F5:** "RM29" and "¥".
- **F8:** en-SG says "truck"; ja-JP translates "Powered by".
- **F10:** Greek and Bulgarian load Noto on client-switched truck pages.
- **F11:** recorded in the backlog, with nothing changed.
- **F3, F4, F6, F7, F9:** accepted as built and still listed.

**No database change: no NOT RUN SQL in this workstream.**

| Proof | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `npm run build` | ✓ |
| `scripts/world-countries-2.cjs` (new) | **47 / 47** |
| `scripts/world-countries-1.cjs` | **178 / 178** |
| `scripts/world-countries-1-identity.cjs` (37 live countries vs the HEAD capture) | **440 / 440** — byte-identical apart from the tagline and the two legal lastmods |
| `scripts/world-countries-1-screens.cjs` (WebKit, real fonts) | **43 / 43** |
| `scripts/europe-languages-2-fonts.cjs` (Greek / Cyrillic, WebKit) | **16 / 16** |
| Legal harnesses: legal-follow-ups 34/34, anz-terms 31/31, canada-2 33/33, europe-settings 67/67, ireland-3 23/23, us-legal-draft 36/36, france-1 74/74, seo-fixes 86/86 | all pass |
| messages-parity | 545,520 / 0 failed |
| translation-check, the 30 touched locales | **0 structural** in every one |
| ESLint | no changed file worse than HEAD |
| Full sweep (`scripts/run-harnesses.cjs`, 173 harnesses) | **170 / 173**. The 3 failures fail on the same check at HEAD: schedule-graphics-places ("the Feature gates the tab…"), canada-1 ("postal code (not ZIP)…"), europe-languages-1 ("de-CH: no ß" in the comparison namespace). None is touched here. |

---

## §1 · F2: the Terms

### 1.1 Terms of Service §4 (`content/legal/terms-and-conditions.md`)

Every sentence that promised "our plan with no monthly fee" now says the account moves to **the plan shown for its country on our pricing page, which in most countries has no monthly fee**. No plan or price is named (the V16.2 rule). The brief named three places; there was a fourth, the **Cancellation** bullet ("then move to our plan with no monthly fee"), and it is changed the same way. The 7-day sentence now says "that plan", and its fee clause reads "if it has one", because the trial-end plan may charge no fee on orders.

**Date line**

- Before: **Last updated:** 20 October 2026
- After: **Last updated:** 1 November 2026

**§4 Plans**

- Before: are shown on our website and in the app. One plan has no monthly fee. Prices are in your local currency.
- After: are shown on our website and in the app. Which plans we offer depends on your country, and in most countries one of them has no monthly fee. Prices are in your local currency.

**§4 Free trial**

- Before: At the end of the trial your account moves to our plan with no monthly fee unless you have chosen another plan.
- After: At the end of the trial your account moves to the plan shown for your country on our pricing page, unless you have chosen another plan. In most countries that plan has no monthly fee.

**§4 Cancellation**

- Before: You keep full access until the end of the period you have paid for, then move to our plan with no monthly fee.
- After: You keep full access until the end of the period you have paid for, then move to the plan shown for your country on our pricing page, which in most countries has no monthly fee.

**§4 If payment is not made (heading sentence)**

- Before: **If a payment fails or is not made, your account moves to our plan with no monthly fee.** We do not lock you out.
- After: **If a payment fails or is not made, your account moves to the plan shown for your country on our pricing page, which in most countries has no monthly fee.** We do not lock you out.

**§4 If payment is not made (7 days)**

- Before: If a payment is not made within **7 days** of its due date, your account moves to the plan with no monthly fee. You keep your account, your menu, your orders and your data, and you can carry on taking orders and using the kitchen screen and dashboard. You lose the features that plan does not include, and that plan's fee on online card orders applies.
- After: If a payment is not made within **7 days** of its due date, your account moves to that plan. You keep your account, your menu, your orders and your data, and you can carry on taking orders and using the kitchen screen and dashboard. You lose any features that plan does not include, and that plan's fee on online card orders applies, if it has one.

### 1.2 Country-specific terms (`content/legal/country-specific-terms.md`)

Eight sections are appended after Gibraltar, in the brief's order: Brazil, Mexico, Japan, Singapore, Hong Kong, Malaysia, Thailand, United Arab Emirates. Each is in the existing sections' style and depth (best effort, no lawyer).

**For food truck operators:**
- You are the seller, under the local consumer law.
- Card payments, settling in the local currency; no surcharge or service fee.
- Allergens: the set HatchGrab uses there, and that the law is written for packaged food.
- Prices and tax, as built (Japan 8% included, Mexico IVA 16% included, Malaysia's SST added on top, Hong Kong no tax, a registered truck sets its own rate in BR, SG, TH and AE).
- The language of the customer pages.
- **Our prices**: billed in the local currency, and how tax on our fees works.
- Local rights; the customer-data processing terms under the local law; notices and governing law.

**Privacy, for everyone in …:**
- The local law: LGPD; Mexico's 2025 federal law; APPI; Singapore's PDPA; Hong Kong's PDPO; Malaysia's PDPA; Thailand's PDPA; UAE Decree-Law 45/2021.
- Where data is kept; allergy notes.
- Requests, with the local reply time: 15 days, 20 business days, without delay, 30 days, 40 days, 21 days, 30 days, 30 days.
- Complaints to the regulator; marketing; contact.

**The Unlimited-only note** is in Brazil, Mexico, Singapore, Malaysia and Thailand only. It reads, for example: *"Our plan in Brazil. In Brazil we offer one plan. It has a monthly price and no HatchGrab fee on online orders, and it is the plan shown for Brazil on our pricing page. There is no plan without a monthly fee in Brazil. When your free trial ends, your account moves to that plan, and we will contact you before your trial ends to set up payment."*

The brief asked for the note and also for §4 not to name a plan or price, so the note describes the plan without naming "Unlimited" or a price. The new harness checks that no section names a plan or a price. The full added text is in the Appendix.

### 1.3 The dates (the manual's legal-date rule, §43)

Each document's own "Last updated" line and its `lib/legal.ts` constant move together:
- `TERMS_UPDATED` goes from '20 October 2026' to '1 November 2026'.
- `COUNTRY_TERMS_UPDATED` goes from '22 October 2026' to '1 November 2026'.
- `TERMS_VERSION` goes from '2026-10-31' to '2026-11-01', the latest of the three documents' dates. It is still write-only, so no truck is asked to re-accept anything.
- `PRIVACY_UPDATED` is unchanged: the Privacy Policy did not change.
- The sitemap's /terms and /country-terms lastmod follow, to 2026-11-01.

### 1.4 Re-pinned, only what the dates and documents broke

All of these carry `⚠️ RE-PINNED (world-countries-2)` notes.

- **`scripts/_lp-world-countries-2.cjs` (new module):** the six Terms edits written out, the eight countries, the version and lastmod transforms, and `asBefore(file, text)`. That function takes today's Terms, Country-specific terms and `lib/legal.ts` back to their bytes before this change and throws unless the named change is exactly there. All three map back to HEAD byte for byte.
- **legal-follow-ups, anz-terms, canada-2, europe-settings, france-1, ireland-3, us-legal-draft:** each reads the three files through `asBefore`, so every other byte is still pinned. us-legal-draft's rendered-page check reads today's document and date.
- **`_lp2-named` (language-phase-1c / 2):** signup's `terms_version` is 2026-11-01.
- **`_lp1e-named`, language-phase-1e-tidy:** the sitemap item.
- **plans-data-model:** its legal lastmods.
- **world-countries-1-identity:** the sitemap's two lastmods, precise.

---

## §2 · F1: the trial-end wording

**Where it applies:** one data condition, *the country's trial-end plan has a monthly price* (`planPriceFor(expiryFallbackFor(catalog, country)).monthlyMinor > 0`). It holds in BR, MX, MY, SG and TH, where the trial ends on Unlimited. The harness proves it is false in GB, US, IE, AU, NZ, CA, FR, DE, JP, HK and AE.

| Surface | Where the trial-end plan has a price (en-GB) | Everywhere else |
|---|---|---|
| Landing pricing banner (`pricing.banner.bodyOnly`) | "…When your trial ends, **<plan>** is **{price}** a month. We’ll be in touch before then to set up payment. No card to start, no contract, cancel anytime." (was "When your trial ends you move to <plan> at {price} a month.") | `pricing.banner.body`, unchanged |
| Manage trial popup | `trialPopup.bodyPaidEnd` (world-countries-1's `bodyKeeps`, renamed): "You won’t be charged anything during your trial, which runs until **{date}**. When your trial ends, {plan} is {price} a month. We’ll be in touch before then to set up payment." The price goes through Billing's own mask, so it shows "TBC" wherever Billing's does. | `trialPopup.body`, unchanged |
| Manage › Billing, the trial line | `onTrialPaidEnd`: "You have every feature. When your trial ends, {plan} is {price} a month. We’ll be in touch before then to set up payment." | `onTrial`: "You have every feature. Choose a plan before your trial ends." |
| Manage › Billing, the reassurance line | `noChargePaidEnd`: "🔒 You won’t be charged anything during your trial, which runs until {date}." | `noCharge`, with "Billing only ever starts when you choose a plan and enter your payment details…" |
| Manage › Billing, "⏱ Choose a plan before your trial ends" | hidden | shown, unchanged |

**Removed in those countries only:** the sentence "Billing only ever starts when you choose a plan and enter your payment details. Until then there’s nothing to cancel and nothing to pay." The iOS gates are unchanged (`onTrialNoCta`, `purchaseCtaAllowed`).

**Every language** carries the meaning: the 28 full bases and es-MX, with back-translations. translation-check reports 0 structural problems in all of them. es-MX keeps only its Mexican `bodyOnly`; its `bodyPaidEnd` came out identical to es-ES, so it was dropped as an override.

Points a native reader could check (none blocking):
- **de-DE:** puts the price at the end ("kostet der Tarif {fallback} im Monat {price}").
- **sv, da, nb, cs, sk, et:** the plan name sits next to the price.
- **hu, fi:** word around case endings ("ez a csomag lesz érvényes: {fallback}, havi {price} áron"; "paketin {fallback} hinta on {price}").
- **pl:** capitalises "Tobą".
- **ar:** "يصبح سعر باقة {fallback} هو {price} شهريًا".
- **ms:** adds "pelan".
- **th:** says "before the trial ends".

**Other countries unchanged:**
- The identity harness: 440/440, all 37 live countries' landing, /features, /compare, PDF, sitemap and `/llms.txt`.
- world-countries-2 §2: the five "everywhere else" keys are HEAD's, and /uk's banner is `pricing.banner.body`.
- The language-phase Billing captures (1d2) in the sweep.

---

## §3 · F5: "RM29" and "¥"

The registry gains two printing fields (`lib/currencies.ts`):
- `printedSymbol` — JPY prints "¥" (U+00A5) where ja-JP's Intl gives the full-width "￥";
- `symbolTight` — MYR prints "RM29" where ms-MY's Intl gives "RM 29".

They are applied once, in `lib/money-format.ts`, inside the cached formatter every amount goes through: `format` and `formatToParts`, which cover plan prices, menus, orders, tickets, emails and the symbol beside a price box. The space goes only beside the registry's own "RM", so an English page's "MYR 29" keeps its space. Every other currency is still exactly Intl's, which currency-registry and world-countries-2 §3 prove.

Rendered: /my prints "RM69", /jp prints "¥1,980". Re-pinned: currency-registry (the HOME and INTERNATIONAL tables, and the "Intl does the work" rule now allows the two printing overrides) and world-countries-1 §1.

## §4 · F8

- **en-SG:** the 17 en-GB "hatch" sentences now have Singapore overrides (`messages/en-SG.json`, 5 → 22 keys). "At the hatch" becomes "at the truck" ("See you at the truck!", "customers pay at the truck"). Where that reads badly:
  - "This truck takes walk-up orders, in person."
  - "{truck} will confirm when you collect."
  - "as the counter sees them"
  - "Place it at your counter, on your truck"
  - "Add anyway (as a walk-up order)?"
- **ja-JP:** "Powered by" becomes the Japanese credit form **提供：HatchGrab** in all nine places (QR poster, emails, embed, settings, poster words, poster blurbs), with back-translations. It matches zh-HK's 由 HatchGrab 提供.

## §5 · F10: Greek and Bulgarian fonts on client-switched pages

europe-languages-2's Noto Sans (Greek + Cyrillic) moved from `app/layout.tsx` to `lib/script-fonts.ts`. It is the same call: `preload: false`, range-scoped. `scriptFontClassOf` gives el and bg its class, and the root layout asks only that function. The language provider (`lib/i18n/client.tsx`) applies it to el and bg as it does to ja, zh, th and ar, so the order page, dashboard and KDS of a Greek or Bulgarian truck now load it.

Proved by europe-languages-2-fonts in WebKit (16/16; re-pinned: the definition's new home) and world-countries-2 §5. Latin pages still request no Noto file (world-countries-1-screens 43/43; re-pinned: five definitions, not four).

## §6 · F11 and the accepted flags

- **F11 (RTL logical properties):** decided to wait until the UAE is switched on. Recorded in docs/world-countries-1-report.md §7 (backlog) and §8. Nothing changed.
- **F3, F4, F6, F7, F9:** accepted as built and marked so in world-countries-1-report §8. F6 stays in the §7 backlog, where it was.
- world-countries-1-report §8 marks F1, F2, F5, F8 and F10 as resolved here.

## §7 · Flags (new)

| # | What |
|---|---|
| G1 | **Failed payment in the five Unlimited-only countries.** §4 says the account moves to "the plan shown for your country", which there is the plan the truck is already on. So a missed payment has no consequence in the product (none is automated anywhere today). If you want a different rule there (e.g. restrict online orders), it needs wording and code. |
| G2 | **Mexico's regulator.** Mexico replaced INAI in 2025. The section says "the Mexican authority responsible for personal data protection" without naming it, because its current name could not be confirmed from here. The UAE section names "the UAE Data Office" with no web address, for the same reason. |
| G3 | **Points to confirm with someone local:** Brazil's 7-day withdrawal right for online food orders (left to the truck); Japan's 10% rate for eat-in; the "may account for tax on our fees under the reverse charge" lines (JP, SG, MY, TH; definite only for the UAE); Brazil's taxes on payments abroad. All best effort. |
| G4 | **Japan's order screen.** The section says HatchGrab shows what is ordered, the price, how to pay and when to collect on one screen before the order is placed (the 2022 final-confirmation-screen rule). That is what the basket sheet shows today; if that sheet changes, this sentence must stay true. |

## §8 · Files changed

**Legal:**
- `content/legal/terms-and-conditions.md`
- `content/legal/country-specific-terms.md`
- `lib/legal.ts`

**Product:**
- `app/manage/[token]/page.tsx` (popup + Billing; `TrialEndPrice`)
- `lib/currencies.ts`, `lib/money-format.ts` (F5)
- `lib/script-fonts.ts`, `app/layout.tsx`, `lib/i18n/client.tsx` (F10)

**Messages:**
- `messages/en-GB.json`, `en-US.json`, `en-AU.json` (bodyOnly; bodyPaidEnd; two Billing keys)
- the 28 full bases and `es-MX.json` (F1)
- `en-SG.json` (F8), `ja-JP.json` (F8)
- `docs/i18n/back/*` for the same locales
- the generated `messages/ns/*` and `lib/i18n/catalog/*` (split-messages)

**Harnesses:**
- New: `scripts/world-countries-2.cjs`, `scripts/_lp-world-countries-2.cjs`.
- Re-pinned: legal-follow-ups, anz-terms, canada-2, europe-settings, france-1, ireland-3, us-legal-draft, `_lp2-named`, `_lp1e-named`, language-phase-1e-tidy, plans-data-model, world-countries-1-identity, world-countries-1, world-countries-1-screens, currency-registry, europe-languages-2-fonts, `_messages-parity-1e`.
- `scripts/harnesses.json`: lists world-countries-2.cjs and its module.

**Docs:**
- `docs/world-countries-1-report.md` (§7 backlog, §8 decisions)
- this report
- re-taken shots in `docs/world-countries-1/` (pricing and landing, now with "RM" and "¥")

## NOT RUN SQL

None. This workstream changes no database row or schema.

---

## Appendix · the eight country sections as added

> ## Brazil
>
> ### For food truck operators
>
> **You are the seller.** You sell your food, and you are the merchant of record for your card payments, as section 5 of the Terms of Service says. Your customers' order is with you, not with us. Brazilian consumer law, including the Consumer Defence Code (Código de Defesa do Consumidor, Law No. 8,078 of 1990) and the rules for online sales in Decree No. 7,962 of 2013, applies to your sales to your customers, and you are responsible for meeting it. That includes giving your customers your business name, your CNPJ or CPF and your address before they order, showing prices in reais, and dealing with complaints, cancellations and refunds. Whether the right to withdraw from a purchase made away from your premises (article 49 of the Code) applies to food you have prepared is for you to check. HatchGrab is the software you sell through.
>
> **Card payments.** Card payments from your customers go into your own Stripe account, which is set up for Brazil during onboarding, in your own name, under your own agreement with Stripe. The money settles there, in Brazilian reais, and is paid out to your bank account by Stripe. We never hold it. HatchGrab adds no card surcharge and no service fee in Brazil. Stripe's processing fees for Brazilian accounts are set by Stripe and shown in HatchGrab and during onboarding.
>
> **Allergens.** Brazil's allergen labelling rules (ANVISA Resolution RDC No. 26 of 2015, and the lactose rules in RDC No. 136 of 2017) are written for packaged food. In Brazil, HatchGrab lets you show the allergens those rules list against each dish, show your allergen card, or both. HatchGrab shows exactly what you enter, as section 3 of the Terms of Service says. We do not check it.
>
> **Your prices and tax.** Your menu prices are shown to customers as the full price they pay, including taxes. HatchGrab sets no tax rate for you. You are responsible for registering for, charging and paying your taxes correctly, for any tax information the law requires on your receipts, and for issuing a tax invoice (nota fiscal) when the law requires one.
>
> **Language.** In Brazil, HatchGrab's pages for your customers are in Brazilian Portuguese. You are responsible for the words you write yourself, such as your menu and your notes.
>
> **Our plan in Brazil.** In Brazil we offer one plan. It has a monthly price and no HatchGrab fee on online orders, and it is the plan shown for Brazil on our pricing page. There is no plan without a monthly fee in Brazil. When your free trial ends, your account moves to that plan, and we will contact you before your trial ends to set up payment.
>
> **Our prices.** Accounts in Brazil are billed in Brazilian reais. HatchGrab Ltd is a UK company. Payments for services from abroad can carry Brazilian taxes that the payer is responsible for. Where a tax applies to our fees, we will tell you before it is added, as section 4 of the Terms of Service says.
>
> **Your rights under local law.** Nothing in the Terms of Service takes away a right that Brazilian law says cannot be limited or waived.
>
> **Your customers' data.** Under Brazil's General Data Protection Law (Lei Geral de Proteção de Dados, LGPD, Law No. 13,709 of 2018), section 10 of the Terms of Service means the same thing in its terms: you are the controller and we are the operator, and we handle your customers' personal data only to run HatchGrab for you and on your instructions.
>
> **Notices and governing law.** Notices work as section 12 of the Terms of Service says: we contact you at the email address on your account, and you can reach us at the address below. These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction. This does not take away any protection that Brazilian law gives you and that cannot be excluded by agreement.
>
> ### Privacy, for everyone in Brazil
>
> **The law that applies.** When we handle personal data of people in Brazil, the General Data Protection Law (LGPD) applies, as well as the UK law named in our Privacy Policy. The rights listed in section 8 of the Privacy Policy are your rights under the LGPD too.
>
> **Where your data is kept.** Your data is stored and processed in the United Kingdom, and some of it is handled by service providers in the European Union and the United States, as section 6 of the Privacy Policy says. We transfer it only on a basis the LGPD allows.
>
> **Allergy and dietary notes.** If you add allergy or dietary notes to an order, we pass them to the truck with your order. We remove them, with your name and contact details, 12 months after the order, as section 7 of the Privacy Policy says. We do not use them for anything else.
>
> **Your requests.** You can ask us to confirm whether we hold personal data about you, and ask for a copy of it, or ask us to correct it, delete it or stop using it. Email privacy@hatchgrab.com. We will reply within 15 days. If you ordered from a truck, we may pass your request to that truck, because it decides how your order details are used.
>
> **Complaints.** Tell us first at privacy@hatchgrab.com. You can also complain to the National Data Protection Authority (Autoridade Nacional de Proteção de Dados, ANPD) at www.gov.br/anpd.
>
> **Marketing emails.** We send marketing emails only where Brazilian law allows it. Every one tells you how to stop receiving them, and if you ask us to stop, we will. Emails about an order or your account are not marketing.
>
> **Contact.** privacy@hatchgrab.com, or by post to HatchGrab Ltd, Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom.
>
> ## Mexico
>
> ### For food truck operators
>
> **You are the seller.** You sell your food, and you are the merchant of record for your card payments, as section 5 of the Terms of Service says. Your customers' order is with you, not with us. Mexican consumer law, including the Federal Consumer Protection Law (Ley Federal de Protección al Consumidor), applies to your sales to your customers, and you are responsible for meeting it. That includes giving your customers your business name and contact details, showing the total price they pay, including taxes, before they order, and dealing with complaints, cancellations and refunds. HatchGrab is the software you sell through.
>
> **Card payments.** Card payments from your customers go into your own Stripe account, which is set up for Mexico during onboarding, in your own name, under your own agreement with Stripe. The money settles there, in Mexican pesos, and is paid out to your bank account by Stripe. We never hold it. HatchGrab adds no card surcharge and no service fee in Mexico. Stripe's processing fees for Mexican accounts are set by Stripe and shown in HatchGrab and during onboarding.
>
> **Allergens.** Mexico's allergen labelling rules (NOM-051-SCFI/SSA1-2010) are written for packaged food and follow the international Codex list. In Mexico, HatchGrab lets you show the Codex allergens against each dish, show your allergen card, or both. HatchGrab shows exactly what you enter, as section 3 of the Terms of Service says. We do not check it.
>
> **Your prices and IVA.** Your menu prices are shown to customers including IVA. HatchGrab shows the IVA included in each order on receipts and tickets, at 16% unless you set your own rate. You are responsible for registering for, charging and paying IVA correctly, and for issuing a tax invoice (CFDI) when a customer asks for one. We do not check the rate.
>
> **Language.** In Mexico, HatchGrab's pages for your customers are in Spanish. You are responsible for the words you write yourself, such as your menu and your notes.
>
> **Our plan in Mexico.** In Mexico we offer one plan. It has a monthly price and no HatchGrab fee on online orders, and it is the plan shown for Mexico on our pricing page. There is no plan without a monthly fee in Mexico. When your free trial ends, your account moves to that plan, and we will contact you before your trial ends to set up payment.
>
> **Our prices.** Accounts in Mexico are billed in Mexican pesos. HatchGrab Ltd is a UK company. Where a tax applies to our fees, we will tell you before it is added, as section 4 of the Terms of Service says.
>
> **Your rights under local law.** Nothing in the Terms of Service takes away a right that Mexican law says cannot be limited or waived.
>
> **Your customers' data.** Under Mexico's Federal Law on the Protection of Personal Data Held by Private Parties, section 10 of the Terms of Service means the same thing in its terms: you are the controller and we are your processor (encargado), and we handle your customers' personal data only to run HatchGrab for you and on your instructions. You are responsible for your own privacy notice (aviso de privacidad) to your customers.
>
> **Notices and governing law.** Notices work as section 12 of the Terms of Service says: we contact you at the email address on your account, and you can reach us at the address below. These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction. This does not take away any protection that Mexican law gives you and that cannot be excluded by agreement.
>
> ### Privacy, for everyone in Mexico
>
> **The law that applies.** When we handle personal data of people in Mexico, the Federal Law on the Protection of Personal Data Held by Private Parties applies, as well as the UK law named in our Privacy Policy. This page and the Privacy Policy together are our privacy notice for people in Mexico.
>
> **Where your data is kept.** Your data is stored and processed in the United Kingdom, and some of it is handled by service providers in the European Union and the United States, as section 6 of the Privacy Policy says, only to run the service.
>
> **Allergy and dietary notes.** If you add allergy or dietary notes to an order, we pass them to the truck with your order. We remove them, with your name and contact details, 12 months after the order, as section 7 of the Privacy Policy says. We do not use them for anything else.
>
> **Your requests.** You can ask us for access to the personal data we hold about you, and ask us to correct it, delete it or stop using it (your ARCO rights). Email privacy@hatchgrab.com. We will reply within 20 business days. If you ordered from a truck, we may pass your request to that truck, because it decides how your order details are used.
>
> **Complaints.** Tell us first at privacy@hatchgrab.com. If you are not satisfied, you can complain to the Mexican authority responsible for personal data protection.
>
> **Marketing emails.** We send marketing emails only where Mexican law allows it. Every one tells you how to stop receiving them, and if you ask us to stop, we will. Emails about an order or your account are not marketing.
>
> **Contact.** privacy@hatchgrab.com, or by post to HatchGrab Ltd, Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom.
>
> ## Japan
>
> ### For food truck operators
>
> **You are the seller.** You sell your food, and you are the merchant of record for your card payments, as section 5 of the Terms of Service says. Your customers' order is with you, not with us. Japanese consumer law applies to your sales to your customers, and you are responsible for meeting it. That includes the seller information the Act on Specified Commercial Transactions (特定商取引法) requires for online sales, such as your name, address and telephone number; showing prices that include consumption tax; and dealing with complaints, cancellations and refunds. HatchGrab is the software you sell through.
>
> **The order screen.** Before your customer places an order, HatchGrab shows them what they are ordering, the price, how they pay and when to collect, on one screen.
>
> **Card payments.** Card payments from your customers go into your own Stripe account, which is set up for Japan during onboarding, in your own name, under your own agreement with Stripe. The money settles there, in Japanese yen, and is paid out to your bank account by Stripe. We never hold it. HatchGrab adds no card surcharge and no service fee in Japan. Stripe's processing fees for Japanese accounts are set by Stripe and shown in HatchGrab and during onboarding.
>
> **Allergens.** Japan's allergen labelling rules (the Food Labeling Standards of the Consumer Affairs Agency) are written for packaged food, and food service is not required to follow them. In Japan, HatchGrab lets you show the allergens those rules list, the eight that must be labelled and the twenty that are recommended, against each dish, show your allergen card, or both. HatchGrab shows exactly what you enter, as section 3 of the Terms of Service says. We do not check it.
>
> **Your prices and consumption tax.** Your menu prices are shown to customers including consumption tax. HatchGrab shows the consumption tax included in each order on receipts and tickets, at 8% (the reduced rate for food to take away) unless you set your own rate. Food eaten on the spot at seating you provide may be taxed at 10%. You are responsible for registering for, charging and paying consumption tax correctly, and for issuing a qualified invoice when the law requires one. We do not check the rate.
>
> **Language.** In Japan, HatchGrab's pages for your customers are in Japanese. You are responsible for the words you write yourself, such as your menu and your notes.
>
> **Our prices.** Accounts in Japan are billed in Japanese yen. HatchGrab Ltd is a UK company. If you are a business, you may have to account for consumption tax on our fees yourself, under the reverse charge. Where a tax applies to our fees, we will tell you before it is added, as section 4 of the Terms of Service says.
>
> **Your rights under local law.** Nothing in the Terms of Service takes away a right that Japanese law says cannot be limited or waived.
>
> **Your customers' data.** Under Japan's Act on the Protection of Personal Information (個人情報保護法), section 10 of the Terms of Service means the same thing in its terms: you entrust us with your customers' personal information, and we handle it only to run HatchGrab for you and on your instructions.
>
> **Notices and governing law.** Notices work as section 12 of the Terms of Service says: we contact you at the email address on your account, and you can reach us at the address below. These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction. This does not take away any protection that Japanese law gives you and that cannot be excluded by agreement.
>
> ### Privacy, for everyone in Japan
>
> **The law that applies.** When we handle personal information of people in Japan, the Act on the Protection of Personal Information applies, as well as the UK law named in our Privacy Policy.
>
> **Where your information is kept.** Your information is stored and processed in the United Kingdom, and some of it is handled by service providers in the European Union and the United States, as section 6 of the Privacy Policy says. The United Kingdom and the European Union are recognised by Japan as having personal information protection to Japan's standard. Information handled in the United States is protected by our agreements with those providers.
>
> **Allergy and dietary notes.** If you add allergy or dietary notes to an order, we pass them to the truck with your order. We remove them, with your name and contact details, 12 months after the order, as section 7 of the Privacy Policy says. We do not use them for anything else.
>
> **Your requests.** You can ask us to disclose the personal information we hold about you, and ask us to correct it, delete it or stop using it. Email privacy@hatchgrab.com. We will reply without delay. If you ordered from a truck, we may pass your request to that truck, because it decides how your order details are used.
>
> **Complaints.** Tell us first at privacy@hatchgrab.com. You can also contact the Personal Information Protection Commission at www.ppc.go.jp.
>
> **Marketing emails.** We send marketing emails only to people who have agreed to receive them. Every one says who it is from and how to stop receiving them, and if you ask us to stop, we will. Emails about an order or your account are not marketing.
>
> **Contact.** privacy@hatchgrab.com, or by post to HatchGrab Ltd, Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom.
>
> ## Singapore
>
> ### For food truck operators
>
> **You are the seller.** You sell your food, and you are the merchant of record for your card payments, as section 5 of the Terms of Service says. Your customers' order is with you, not with us. Singapore's consumer law, including the Consumer Protection (Fair Trading) Act, applies to your sales to your customers, and you are responsible for meeting it. That includes showing the full price your customers pay and dealing with complaints, cancellations and refunds. HatchGrab is the software you sell through.
>
> **Card payments.** Card payments from your customers go into your own Stripe account, which is set up for Singapore during onboarding, in your own name, under your own agreement with Stripe. The money settles there, in Singapore dollars, and is paid out to your bank account by Stripe. We never hold it. HatchGrab adds no card surcharge and no service fee in Singapore. Stripe's processing fees for Singapore accounts are set by Stripe and shown in HatchGrab and during onboarding.
>
> **Allergens.** Singapore's allergen labelling rules in the Food Regulations are written for packaged food and follow the international Codex list. In Singapore, HatchGrab lets you show the Codex allergens against each dish, show your allergen card, or both. HatchGrab shows exactly what you enter, as section 3 of the Terms of Service says. We do not check it.
>
> **Your prices and GST.** Your menu prices are shown to customers as the full price they pay. If you are registered for GST, your prices must include it: set your GST rate in HatchGrab and we show the GST included in each order on receipts and tickets. You are responsible for registering for, charging and paying GST correctly. We do not check the rate.
>
> **Language.** In Singapore, HatchGrab's pages for your customers are in English. You are responsible for the words you write yourself, such as your menu and your notes.
>
> **Our plan in Singapore.** In Singapore we offer one plan. It has a monthly price and no HatchGrab fee on online orders, and it is the plan shown for Singapore on our pricing page. There is no plan without a monthly fee in Singapore. When your free trial ends, your account moves to that plan, and we will contact you before your trial ends to set up payment.
>
> **Our prices.** Accounts in Singapore are billed in Singapore dollars. HatchGrab Ltd is a UK company. If you are registered for GST, you may have to account for GST on our fees yourself, under the reverse charge. Where a tax applies to our fees, we will tell you before it is added, as section 4 of the Terms of Service says.
>
> **Your rights under local law.** Nothing in the Terms of Service takes away a right that Singapore law says cannot be limited or waived.
>
> **Your customers' data.** Under Singapore's Personal Data Protection Act 2012 (PDPA), section 10 of the Terms of Service means the same thing in its terms: we are your data intermediary, and we handle your customers' personal data only to run HatchGrab for you and on your instructions.
>
> **Notices and governing law.** Notices work as section 12 of the Terms of Service says: we contact you at the email address on your account, and you can reach us at the address below. These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction. This does not take away any protection that Singapore law gives you and that cannot be excluded by agreement.
>
> ### Privacy, for everyone in Singapore
>
> **The law that applies.** When we handle personal data of people in Singapore, the Personal Data Protection Act 2012 (PDPA) applies, as well as the UK law named in our Privacy Policy.
>
> **Where your data is kept.** Your data is stored and processed in the United Kingdom, and some of it is handled by service providers in the European Union and the United States, as section 6 of the Privacy Policy says. We make sure it is protected to a standard comparable to the PDPA's wherever it is.
>
> **Allergy and dietary notes.** If you add allergy or dietary notes to an order, we pass them to the truck with your order. We remove them, with your name and contact details, 12 months after the order, as section 7 of the Privacy Policy says. We do not use them for anything else.
>
> **Your requests.** You can ask for the personal data we hold about you and how it has been used, and ask us to correct it. You can also withdraw your consent to our using it. Email privacy@hatchgrab.com. We will reply within 30 days. If you ordered from a truck, we may pass your request to that truck, because it decides how your order details are used.
>
> **Complaints.** Tell us first at privacy@hatchgrab.com. If you are not satisfied, you can complain to the Personal Data Protection Commission at www.pdpc.gov.sg.
>
> **Marketing messages.** We send marketing emails only where Singapore law allows it. Every one tells you how to stop receiving them, and if you ask us to stop, we will. We do not send marketing calls or text messages to numbers on Singapore's Do Not Call Registry. Emails about an order or your account are not marketing.
>
> **Contact.** privacy@hatchgrab.com, or by post to HatchGrab Ltd, Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom.
>
> ## Hong Kong
>
> ### For food truck operators
>
> **You are the seller.** You sell your food, and you are the merchant of record for your card payments, as section 5 of the Terms of Service says. Your customers' order is with you, not with us. Hong Kong's consumer law, including the Trade Descriptions Ordinance, applies to your sales to your customers, and you are responsible for meeting it. That includes describing your food and its price accurately and dealing with complaints, cancellations and refunds. Your licence from the Food and Environmental Hygiene Department, and its conditions, are yours to keep to. HatchGrab is the software you sell through.
>
> **Card payments.** Card payments from your customers go into your own Stripe account, which is set up for Hong Kong during onboarding, in your own name, under your own agreement with Stripe. The money settles there, in Hong Kong dollars, and is paid out to your bank account by Stripe. We never hold it. HatchGrab adds no card surcharge and no service fee in Hong Kong. Stripe's processing fees for Hong Kong accounts are set by Stripe and shown in HatchGrab and during onboarding.
>
> **Allergens.** Hong Kong's allergen labelling rules are written for packaged food and follow the international Codex list. In Hong Kong, HatchGrab lets you show the Codex allergens against each dish, show your allergen card, or both. HatchGrab shows exactly what you enter, as section 3 of the Terms of Service says. We do not check it.
>
> **Your prices and tax.** Hong Kong has no sales tax or VAT, so HatchGrab shows no tax line on receipts and tickets unless you set a rate yourself. You are responsible for any tax that applies to your business.
>
> **Language.** In Hong Kong, HatchGrab's pages for your customers are in Traditional Chinese. You are responsible for the words you write yourself, such as your menu and your notes.
>
> **Our prices.** Accounts in Hong Kong are billed in Hong Kong dollars.
>
> **Your rights under local law.** Nothing in the Terms of Service takes away a right that Hong Kong law says cannot be limited or waived.
>
> **Your customers' data.** Under Hong Kong's Personal Data (Privacy) Ordinance (Cap. 486), section 10 of the Terms of Service means the same thing in its terms: you are the data user and we are your data processor, and we handle your customers' personal data only to run HatchGrab for you and on your instructions, and keep it no longer than that needs.
>
> **Notices and governing law.** Notices work as section 12 of the Terms of Service says: we contact you at the email address on your account, and you can reach us at the address below. These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction. This does not take away any protection that Hong Kong law gives you and that cannot be excluded by agreement.
>
> ### Privacy, for everyone in Hong Kong
>
> **The law that applies.** When we handle personal data of people in Hong Kong, the Personal Data (Privacy) Ordinance applies, as well as the UK law named in our Privacy Policy.
>
> **Where your data is kept.** Your data is stored and processed in the United Kingdom, and some of it is handled by service providers in the European Union and the United States, as section 6 of the Privacy Policy says.
>
> **Allergy and dietary notes.** If you add allergy or dietary notes to an order, we pass them to the truck with your order. We remove them, with your name and contact details, 12 months after the order, as section 7 of the Privacy Policy says. We do not use them for anything else.
>
> **Your requests.** You can ask for a copy of the personal data we hold about you, and ask us to correct it. Email privacy@hatchgrab.com. We will reply within 40 days. If you ordered from a truck, we may pass your request to that truck, because it decides how your order details are used.
>
> **Complaints.** Tell us first at privacy@hatchgrab.com. If you are not satisfied, you can complain to the Office of the Privacy Commissioner for Personal Data at www.pcpd.org.hk.
>
> **Marketing messages.** We use your personal data for direct marketing only with your consent, and every marketing message tells you how to stop receiving them. If you ask us to stop, we will, free of charge. Emails about an order or your account are not marketing.
>
> **Contact.** privacy@hatchgrab.com, or by post to HatchGrab Ltd, Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom.
>
> ## Malaysia
>
> ### For food truck operators
>
> **You are the seller.** You sell your food, and you are the merchant of record for your card payments, as section 5 of the Terms of Service says. Your customers' order is with you, not with us. Malaysian consumer law, including the Consumer Protection Act 1999 and its regulations for electronic trade, applies to your sales to your customers, and you are responsible for meeting it. That includes giving your customers your business name, registration number and contact details, showing your prices clearly, and dealing with complaints, cancellations and refunds. HatchGrab is the software you sell through.
>
> **Card payments.** Card payments from your customers go into your own Stripe account, which is set up for Malaysia during onboarding, in your own name, under your own agreement with Stripe. The money settles there, in ringgit, and is paid out to your bank account by Stripe. We never hold it. HatchGrab adds no card surcharge and no service fee in Malaysia. Stripe's processing fees for Malaysian accounts are set by Stripe and shown in HatchGrab and during onboarding.
>
> **Allergens.** Malaysia's allergen labelling rules in the Food Regulations 1985 are written for packaged food and follow the international Codex list. In Malaysia, HatchGrab lets you show the Codex allergens against each dish, show your allergen card, or both. HatchGrab shows exactly what you enter, as section 3 of the Terms of Service says. We do not check it.
>
> **Your prices and SST.** Your menu prices are shown before tax. If you are registered for service tax, set your rate in HatchGrab and we add it to each order as its own line before your customer pays. You are responsible for registering for, charging and paying sales and service tax (SST) correctly. We do not check the rate.
>
> **Language.** In Malaysia, HatchGrab's pages for your customers are in Malay. You are responsible for the words you write yourself, such as your menu and your notes.
>
> **Our plan in Malaysia.** In Malaysia we offer one plan. It has a monthly price and no HatchGrab fee on online orders, and it is the plan shown for Malaysia on our pricing page. There is no plan without a monthly fee in Malaysia. When your free trial ends, your account moves to that plan, and we will contact you before your trial ends to set up payment.
>
> **Our prices.** Accounts in Malaysia are billed in ringgit. HatchGrab Ltd is a UK company. If you are a business, you may have to account for service tax on our fees yourself, as service tax on imported services. Where a tax applies to our fees, we will tell you before it is added, as section 4 of the Terms of Service says.
>
> **Your rights under local law.** Nothing in the Terms of Service takes away a right that Malaysian law says cannot be limited or waived.
>
> **Your customers' data.** Under Malaysia's Personal Data Protection Act 2010 (PDPA), section 10 of the Terms of Service means the same thing in its terms: you are the data controller and we are your data processor, and we handle your customers' personal data only to run HatchGrab for you and on your instructions.
>
> **Notices and governing law.** Notices work as section 12 of the Terms of Service says: we contact you at the email address on your account, and you can reach us at the address below. These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction. This does not take away any protection that Malaysian law gives you and that cannot be excluded by agreement.
>
> ### Privacy, for everyone in Malaysia
>
> **The law that applies.** When we handle personal data of people in Malaysia, the Personal Data Protection Act 2010 (PDPA) applies, as well as the UK law named in our Privacy Policy.
>
> **Where your data is kept.** Your data is stored and processed in the United Kingdom, and some of it is handled by service providers in the European Union and the United States, as section 6 of the Privacy Policy says. We transfer it only where the PDPA allows.
>
> **Allergy and dietary notes.** If you add allergy or dietary notes to an order, we pass them to the truck with your order. We remove them, with your name and contact details, 12 months after the order, as section 7 of the Privacy Policy says. We do not use them for anything else.
>
> **Your requests.** You can ask for the personal data we hold about you, and ask us to correct it or stop using it. Email privacy@hatchgrab.com. We will reply within 21 days. If you ordered from a truck, we may pass your request to that truck, because it decides how your order details are used.
>
> **Complaints.** Tell us first at privacy@hatchgrab.com. If you are not satisfied, you can complain to the Personal Data Protection Commissioner at www.pdp.gov.my.
>
> **Marketing emails.** We send marketing emails only where Malaysian law allows it. Every one tells you how to stop receiving them, and if you ask us to stop, we will. Emails about an order or your account are not marketing.
>
> **Contact.** privacy@hatchgrab.com, or by post to HatchGrab Ltd, Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom.
>
> ## Thailand
>
> ### For food truck operators
>
> **You are the seller.** You sell your food, and you are the merchant of record for your card payments, as section 5 of the Terms of Service says. Your customers' order is with you, not with us. Thai consumer law, including the Consumer Protection Act B.E. 2522, applies to your sales to your customers, and you are responsible for meeting it. That includes showing your prices clearly and dealing with complaints, cancellations and refunds. HatchGrab is the software you sell through.
>
> **Card payments.** Card payments from your customers go into your own Stripe account, which is set up for Thailand during onboarding, in your own name, under your own agreement with Stripe. The money settles there, in Thai baht, and is paid out to your bank account by Stripe. We never hold it. HatchGrab adds no card surcharge and no service fee in Thailand. Stripe's processing fees for Thai accounts are set by Stripe and shown in HatchGrab and during onboarding.
>
> **Allergens.** Thailand's allergen labelling rules are written for packaged food and follow the international Codex list. In Thailand, HatchGrab lets you show the Codex allergens against each dish, show your allergen card, or both. HatchGrab shows exactly what you enter, as section 3 of the Terms of Service says. We do not check it.
>
> **Your prices and VAT.** Your menu prices are shown to customers as the full price they pay. If you are registered for VAT, your prices include it: set your VAT rate in HatchGrab and we show the VAT included in each order on receipts and tickets. You are responsible for registering for, charging and paying VAT correctly, and for issuing a tax invoice when the law requires one. We do not check the rate.
>
> **Language.** In Thailand, HatchGrab's pages for your customers are in Thai. You are responsible for the words you write yourself, such as your menu and your notes.
>
> **Our plan in Thailand.** In Thailand we offer one plan. It has a monthly price and no HatchGrab fee on online orders, and it is the plan shown for Thailand on our pricing page. There is no plan without a monthly fee in Thailand. When your free trial ends, your account moves to that plan, and we will contact you before your trial ends to set up payment.
>
> **Our prices.** Accounts in Thailand are billed in Thai baht. HatchGrab Ltd is a UK company. If you are registered for VAT, you may have to account for VAT on our fees yourself, under the reverse charge. Where a tax applies to our fees, we will tell you before it is added, as section 4 of the Terms of Service says.
>
> **Your rights under local law.** Nothing in the Terms of Service takes away a right that Thai law says cannot be limited or waived.
>
> **Your customers' data.** Under Thailand's Personal Data Protection Act B.E. 2562 (PDPA), section 10 of the Terms of Service is our data processing agreement with you: you are the data controller and we are your data processor, and we handle your customers' personal data only to run HatchGrab for you and on your instructions.
>
> **Notices and governing law.** Notices work as section 12 of the Terms of Service says: we contact you at the email address on your account, and you can reach us at the address below. These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction. This does not take away any protection that Thai law gives you and that cannot be excluded by agreement.
>
> ### Privacy, for everyone in Thailand
>
> **The law that applies.** When we handle personal data of people in Thailand, the Personal Data Protection Act B.E. 2562 (PDPA) applies, as well as the UK law named in our Privacy Policy. The rights listed in section 8 of the Privacy Policy are your rights under the PDPA too.
>
> **Where your data is kept.** Your data is stored and processed in the United Kingdom, and some of it is handled by service providers in the European Union and the United States, as section 6 of the Privacy Policy says. We transfer it only on a basis the PDPA allows.
>
> **Allergy and dietary notes.** If you add allergy or dietary notes to an order, we pass them to the truck with your order. We remove them, with your name and contact details, 12 months after the order, as section 7 of the Privacy Policy says. We do not use them for anything else.
>
> **Your requests.** You can ask for a copy of the personal data we hold about you, and ask us to correct it, delete it or stop using it. Email privacy@hatchgrab.com. We will reply within 30 days. If you ordered from a truck, we may pass your request to that truck, because it decides how your order details are used.
>
> **Complaints.** Tell us first at privacy@hatchgrab.com. You can also complain to the Personal Data Protection Committee at www.pdpc.or.th.
>
> **Marketing emails.** We send marketing emails only where Thai law allows it. Every one tells you how to stop receiving them, and if you ask us to stop, we will. Emails about an order or your account are not marketing.
>
> **Contact.** privacy@hatchgrab.com, or by post to HatchGrab Ltd, Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom.
>
> ## United Arab Emirates
>
> ### For food truck operators
>
> **You are the seller.** You sell your food, and you are the merchant of record for your card payments, as section 5 of the Terms of Service says. Your customers' order is with you, not with us. The UAE's consumer law, including Federal Law No. 15 of 2020 on Consumer Protection, applies to your sales to your customers, and you are responsible for meeting it. That includes giving your customers your business name and contact details, showing prices in dirhams that include VAT, giving information in Arabic, and dealing with complaints, cancellations and refunds. HatchGrab is the software you sell through.
>
> **Card payments.** Card payments from your customers go into your own Stripe account, which is set up for the United Arab Emirates during onboarding, in your own name, under your own agreement with Stripe. The money settles there, in UAE dirhams, and is paid out to your bank account by Stripe. We never hold it. HatchGrab adds no card surcharge and no service fee in the United Arab Emirates. Stripe's processing fees for UAE accounts are set by Stripe and shown in HatchGrab and during onboarding.
>
> **Allergens.** The UAE's allergen labelling rules are written for packaged food and follow the international Codex list. In the United Arab Emirates, HatchGrab lets you show the Codex allergens against each dish, show your allergen card, or both. HatchGrab shows exactly what you enter, as section 3 of the Terms of Service says. We do not check it.
>
> **Your prices and VAT.** Your menu prices are shown to customers as the full price they pay. If you are registered for VAT, your prices include it: set your VAT rate in HatchGrab and we show the VAT included in each order on receipts and tickets. You are responsible for registering for, charging and paying VAT correctly, and for issuing a tax invoice when the law requires one. We do not check the rate.
>
> **Language.** In the United Arab Emirates, HatchGrab's pages for your customers are in Arabic. You are responsible for the words you write yourself, such as your menu and your notes.
>
> **Our prices.** Accounts in the United Arab Emirates are billed in UAE dirhams. HatchGrab Ltd is a UK company. If you are registered for VAT, you account for VAT on our fees yourself, under the reverse charge. Where another tax applies to our fees, we will tell you before it is added, as section 4 of the Terms of Service says.
>
> **Your rights under local law.** Nothing in the Terms of Service takes away a right that UAE law says cannot be limited or waived.
>
> **Your customers' data.** Under the UAE's Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data, section 10 of the Terms of Service means the same thing in its terms: you are the controller and we are your processor, and we handle your customers' personal data only to run HatchGrab for you and on your instructions.
>
> **Notices and governing law.** Notices work as section 12 of the Terms of Service says: we contact you at the email address on your account, and you can reach us at the address below. These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction. This does not take away any protection that UAE law gives you and that cannot be excluded by agreement.
>
> ### Privacy, for everyone in the United Arab Emirates
>
> **The law that applies.** When we handle personal data of people in the United Arab Emirates, Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data applies, as well as the UK law named in our Privacy Policy. If you are in a free zone with its own data protection law, such as the DIFC or ADGM, that law applies instead.
>
> **Where your data is kept.** Your data is stored and processed in the United Kingdom, and some of it is handled by service providers in the European Union and the United States, as section 6 of the Privacy Policy says. We transfer it only on a basis the law allows.
>
> **Allergy and dietary notes.** If you add allergy or dietary notes to an order, we pass them to the truck with your order. We remove them, with your name and contact details, 12 months after the order, as section 7 of the Privacy Policy says. We do not use them for anything else.
>
> **Your requests.** You can ask for the personal data we hold about you, and ask us to correct it, delete it or stop using it. Email privacy@hatchgrab.com. We will reply within 30 days. If you ordered from a truck, we may pass your request to that truck, because it decides how your order details are used.
>
> **Complaints.** Tell us first at privacy@hatchgrab.com. If you are not satisfied, you can complain to the UAE Data Office.
>
> **Marketing messages.** We send marketing messages only where UAE law allows it. Every one tells you how to stop receiving them, and if you ask us to stop, we will. Emails about an order or your account are not marketing.
>
> **Contact.** privacy@hatchgrab.com, or by post to HatchGrab Ltd, Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom.
