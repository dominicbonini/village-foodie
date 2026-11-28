# compare-suits-fix-1: the "Which system suits whom?" guide (26 Nov 2026, read-only)

**Scope.** Nothing was written to any table, no code was changed, nothing was pushed or deployed, and no .env file was opened. I read code and message files, ran read-only SQL, and made one batch of own-site reads (§4.1).

## 1 · Summary

- **The guide is one fixed text per language, written for Germany.**
  - Only two small parts come from stored data: each shown competitor's "fits if…" line (`comparison_entries.choose_when`, set only on 3 German entries), and the till names in the tills card.
  - So **every one of the 96 live countries** shows Germany's TSE (or a local "certified till" version), Uber Eats' **German** rates, Wolt and Lieferando, plus a tills and card machines card.
  - In the **50 countries where trucks are billed at the truck**, it also implies HatchGrab takes online payments there. It doesn't.
- **No switch hides the guide alone.** The only no-deploy option is switching the whole comparison page off (Admin › Countries Off / `comparison_publish.admin_off`), which I didn't use.
- **Every fix needs the batch deploy.** The text lives in the message files, which ship with the code.
- **Drafts (§4):**
  - GB, US, IE and AU are written in full. GB's two "to check" lines are confirmed from HatchGrab's own data.
  - The other countries get one design: data per country, words per language, and a native-speaker check.

## 2 · Where each part of the guide comes from

The guide is built in `buildComparison`, lib/comparison.ts:398–413. It's rendered in app/(public)/[country]/[section]/[slug]/page.tsx:282–291, and also printed in the page's .md / .json versions (lib/comparison.ts:595–597).

| Part | Source | How the page chooses it |
|---|---|---|
| Title «Which system suits whom?» | message `comparison.fit.title` | the country's **locale** (`country_settings.locale`) |
| «HatchGrab suits you if …» + body | messages `fit.ours`, `fit.oursBody` | locale only, the same for every country sharing it |
| «HatchGrab doesn't suit you if …» + body | messages `fit.oursNot`, `fit.oursNotBody`; plus `fit.appClause` | locale. The app clause is added only when `country_settings.ios_app_available` or `android_app_available` is false, which is **never true today**: every live country has both. |
| «{name} fits if …» | **stored data**: each shown entry's `comparison_entries.choose_when` | per country and entry. Set only for DE: gastro25, GastroDok, FoxiFood, in German. |
| «Tills and card machines» card | messages `fit.tills`, `fit.tillsBody` / `fit.tillsBodyNamed` | locale. **The names come from data**: shown, verified competitors whose `focus` is 'pos'. Square in AU CA ES FR GB IE JP US, SumUp in LU LV. |
| «Delivery platforms» card | messages `fit.marketplaces`, `fit.marketplacesBody` | locale only. **No data at all**: the same sentence everywhere. |

**Why the UK page shows Germany's TSE, Uber Eats' German rates and Lieferando.**

- The guide was written for the German page (compare-de-1). Its delivery sentence quotes Uber Eats' German rates and names Wolt and Lieferando, and its "doesn't suit" and tills lines are about Germany's TSE till rule.
- compare-languages-1 then **translated the same strings into every language base**. en-GB's text is the German text in English.
- Nothing in the guide asks which country it's on, apart from the app clause and the two data parts.
- Live en-GB text: «your customers should pay with PayPal or Klarna, or you want a certified till with a TSE from one supplier.» · «Tills take payment at the truck and cover the TSE requirement.» · «Uber Eats states 14% for collection and 30% for delivery by Uber couriers in Germany. Wolt says on its own website that it charges commission but gives no rates. We could not check Lieferando's rates.»

## 3 · The sweep (all 96 live countries; 77 locales resolved through the real translator)

The fixed lines are the same in every country that shares a locale, so the table groups countries by what they show. Which locale each country uses:

| Locale | Countries |
|---|---|
| en-GB | GB GG IM IN JE MV |
| en-US | US GU VI |
| fr-FR | FR BL GF GP MF MQ PM RE YT |
| it-IT | IT SM VA |
| sv-SE | SE AX |
| ro-RO | RO MD |

Every other country has its own locale.

| Countries | Line | Problem |
|---|---|---|
| **All 96** | «Delivery platforms»: «Uber Eats states 14% for collection and 30% for delivery by Uber couriers **in Germany**. **Wolt** … **We could not check Lieferando's rates.**» (in every language) | **(a)** Germany's rates in every country; Lieferando trades only in Germany and Austria; Wolt is named where it may not trade (not checked). Only DE (and AT for Lieferando) is about its own market. |
| **All 96** | «Tills and card machines» / en-US «POS systems and card readers»: «Tills take payment at the truck and **cover the TSE requirement**. An ordering system works alongside a till…» | **(b)** tills and card machines, against your rule; **(a)** TSE is Germany's till law; **(c)** "TSE" (41 locales keep it literally) or "certified till" (fiscal-law wording in the other 36). |
| AU CA ES FR GB IE JP US (Square), LU LV (SumUp) | the same card's named form: «… cover the TSE requirement. **Square is also in the table above.**» | **(b)** names a till tool; **(a)** says it covers Germany's TSE rule. Square is currently hidden by the 1,000-row cap (compare-calc-fix-1), so this shows once that's fixed. |
| **All 96** | «HatchGrab doesn't suit you if … you want a **certified till with a TSE** from one supplier» (translated as a local "fiscal / certified till" in 36 locales) | **(a)**, **(b)**, **(c)**. |
| **All 96** | «… your customers should pay with **PayPal or Klarna**» | True of HatchGrab everywhere (PayPal / Klarna is `fixed:no`). But Klarna isn't a common method in many of these countries **(a)**, and in the 50 below the line is wrong **(d)**. |
| **50 billed-at-truck countries:** AD AL AR AX BA BD BH BL BO CL CO DO EC EG GG GU ID IM IN IS JE JM JO KW KZ LK MA MD MK MV NG OM PA PM QA RS SA SM SV TR TW UA UY UZ VA VI ZA | the same PayPal / Klarna line | **(d)** It implies customers can pay online with other methods. There (`country_billing.payment_model` = billed_at_truck) HatchGrab takes **no online payments**: customers pay at the truck. |
| PL NL BE SE DK NO CH | the same PayPal / Klarna line | **(a)** The table itself says HatchGrab takes "cards only" there, not BLIK / iDEAL / Swish / MobilePay / TWINT. The local methods a truck owner would ask about aren't named. |
| US GU VI (en-US) | «POS systems and card readers», «a certified POS with a TSE from one vendor» | **(b)**, **(c)** "POS" jargon. |
| DE | gastro25 / GastroDok / FoxiFood «fits if …» (choose_when) | Fine as written. They're German facts on the German page, with no till or card-machine wording. GastroDok's «weiter selbst vor Ort kassieren» means taking the money yourself on site, not a till. |

**HatchGrab's own claims in «suits you if», checked against its data:**

- changing locations: `schedule` is built in, true everywhere ✓;
- pre-orders with a collection time: `plan_features` has **no rows switching off** advance_preordering, time_slot_selection or smart_batch_pacing for any plan (no row means on), so true everywhere ✓;
- kitchen not overloaded: ✓, the same;
- no contract: `term` is "No" ✓.

**No per-country falsehood in that line.**

## 4 · A per-country switch (question 3)

**None exists for the guide alone.** The fit section is rendered unconditionally (page.tsx:282).

The only no-deploy switches turn off the **whole comparison page**:

- Admin › Countries Off (`comparison_status`);
- `comparison_publish.admin_off`;
- unticking auto-publish.

`comparison_features.show_scope` controls table rows only. Not used.

## 5 · Drafts

**The rules:**

- no tills or card machines;
- no jargon;
- each country's own facts;
- a delivery app's commission only with its own quote and URL for that country, otherwise "they take a cut of every order";
- "may not suit you" only for what HatchGrab genuinely doesn't do there.

### 5.1 Delivery apps named only where their own site confirms them

**Read once each, one request at a time.** One slip: the reading agent sent the first two (Just Eat UK, Uber Eats UK) in parallel.

- **Deliveroo UK** (deliveroo.co.uk: «Enter a postcode to see what we deliver:») ✓
- **Deliveroo Ireland** (deliveroo.ie: «Enter your address to find local restaurants») ✓
- **Not confirmed:**
  - Just Eat UK / IE, Uber Eats UK / IE / US / AU, DoorDash US / AU and Menulog AU refused automated reads (HTTP 403);
  - Grubhub returned an empty page.

  These are named below only as "once confirmed". No commission rate is stated anywhere, so no number is used.

### 5.2 GB (en-GB): your draft, with the two "to check" lines confirmed

> **HatchGrab suits you if …**
> - you trade in different places during the week
> - you want customers to order ahead and choose a collection time
> - you want to limit how many orders come in at once, so your kitchen keeps up
> - you don't want to sign a contract.
>
> **HatchGrab may not suit you if …**
> - you want to deliver to customers' homes: HatchGrab is for collection only.
> - you want customers to pay with PayPal or Klarna: HatchGrab takes card, Apple Pay and Google Pay online, or customers pay when they collect.
>
> **Delivery apps:** Apps like Deliveroo can bring you new customers, but they take a cut of every order, including from regulars who could simply order ahead with you.

**The two "to check" lines, confirmed from HatchGrab's own data:**

- **Delivery:** confirmed. HatchGrab's delivery answer is `fixed:no`, «collection only».
- **Payment:** confirmed. GB is `fee_from_payment`, so online card payments are on, and HatchGrab's payment methods are «card, Apple Pay, Google Pay; pay at the truck». PayPal / Klarna is `fixed:no`.

Add **Uber Eats** and **Just Eat** to the delivery line once you've confirmed them, since their sites refused the read.

### 5.3 US (en-US)

> **HatchGrab suits you if …**
> - you operate in different places during the week
> - you want customers to order ahead and choose a pickup time
> - you want to limit how many orders come in at once, so your kitchen keeps up
> - you don't want to sign a contract.
>
> **HatchGrab may not suit you if …**
> - you want to deliver to customers' homes: HatchGrab is for pickup only.
> - you want customers to pay with PayPal or Venmo: HatchGrab takes card, Apple Pay and Google Pay online, or customers pay when they pick up.
>
> **Delivery apps:** Delivery apps can bring you new customers, but they take a cut of every order, including from regulars who could simply order ahead with you.

- US is `fee_from_payment`. "Venmo" is your call: HatchGrab doesn't take it, but it's a US-specific name.
- No app is named until DoorDash / Uber Eats / Grubhub are confirmed.
- **GU and VI share en-US but are billed at the truck.** Their payment line must be the at-truck variant (§5.6).

### 5.4 IE (en-IE)

> **HatchGrab suits you if …**
> - you trade in different places during the week
> - you want customers to order ahead and choose a collection time
> - you want to limit how many orders come in at once, so your kitchen keeps up
> - you don't want to sign a contract.
>
> **HatchGrab may not suit you if …**
> - you want to deliver to customers' homes: HatchGrab is for collection only.
> - you want customers to pay with PayPal or Klarna: HatchGrab takes card, Apple Pay and Google Pay online, or customers pay when they collect.
>
> **Delivery apps:** Apps like Deliveroo can bring you new customers, but they take a cut of every order, including from regulars who could simply order ahead with you.

IE is `fee_from_payment`, and Deliveroo is confirmed there. Add Just Eat once confirmed.

### 5.5 AU (en-AU)

> **HatchGrab suits you if …**
> - you trade in different places during the week
> - you want customers to order ahead and choose a pickup time
> - you want to limit how many orders come in at once, so your kitchen keeps up
> - you don't want to sign a contract.
>
> **HatchGrab may not suit you if …**
> - you want to deliver to customers' homes: HatchGrab is for pickup only.
> - you want customers to pay with PayPal or Afterpay: HatchGrab takes card, Apple Pay and Google Pay online, or customers pay when they pick up.
>
> **Delivery apps:** Delivery apps can bring you new customers, but they take a cut of every order, including from regulars who could simply order ahead with you.

- AU is `fee_from_payment`. "pickup" or "collection" is your choice for Australian English.
- Menulog's status couldn't be read, so no app is named.

### 5.6 The design for every other country

| Piece | From | Per |
|---|---|---|
| The four «suits you if» lines | message file | language: the same four facts everywhere, true in every live country (§3) |
| «delivery: collection only» | message file | language |
| **The payment line** | message file, **chosen by data**: `offersOnlineCardPayments(settings)` (country_billing.payment_model) | country. **Online countries:** «you want customers to pay with {methods}: HatchGrab takes card, Apple Pay and Google Pay online, or customers pay when they collect.» **Billed-at-truck countries:** «you want customers to pay online when they order: in {country} they pay when they collect.» |
| `{methods}` (the popular ways HatchGrab doesn't take) | **data**, a short per-country list. PL BLIK · NL iDEAL · BE Bancontact · SE Swish · DK MobilePay · NO Vipps · CH TWINT · DE/AT PayPal or Klarna; elsewhere «PayPal» alone | country |
| The delivery card | message file with an optional `{apps}` from **data** | country: the app names confirmed on their own sites, and optionally one rate with its quote and URL. Without names: the name-free sentence. |
| «{name} fits if …» | data (`choose_when`), as today | country / entry |
| ~~Tills and card machines card~~ | **removed** (code) | |

**Every non-English country needs a native-speaker check before it goes live.** The 77 current translations all carry the German facts, so none of the existing text can be reused as it is.

## 6 · What it takes to build (nothing changed)

**Live with no deploy:**

- **Nothing in the guide.** Every word is in the message files (bundled at build), and the parts that come from data (`choose_when`, the till names) don't touch the German facts.
- The only no-deploy action is switching a whole page off (§4).
- **Data can be prepared now** with a migration, inert until the code reads it: a small per-country table, e.g. `comparison_country_copy`, holding:
  - `fit_off` (the switch you asked about);
  - `delivery_apps` text[];
  - optional `delivery_rate_quote` / `delivery_rate_url`;
  - `pay_methods_missing` text.

  Rows filled only from own sites (delivery apps) and your choices (payment names).

**Needs the batch deploy:**

1. **lib/comparison.ts `fit`:**
   - drop the tills card;
   - choose the payment line by `offersOnlineCardPayments(settings)`;
   - fill `{methods}` and `{apps}` from the new data;
   - honour `fit_off`;
   - keep `choose_when`.

   The .md / .json twins use the same strings, so they follow.
2. **page.tsx:** render the lines as short lists (today they're single paragraphs). This is the only visible layout change.
3. **Message files:**
   - new keys `fit.suits.1–4`, `fit.notDelivery`, `fit.notPayOnline` / `fit.notPayAtTruck`, `fit.deliveryApps` / `fit.deliveryAppsNamed`;
   - English for en-GB / en-US / en-IE / en-AU (and the other English bases: CA NZ SG ZA NG JM GI MT, worded like GB);
   - 77 locales translated, each with a native-speaker check;
   - **remove** `fit.tills*` and the old `fit.oursNotBody` / `fit.marketplacesBody`.
4. **A harness** that fails if any locale's guide text contains TSE, Lieferando, Wolt, "Germany" or its translations, a till / card-machine word, or a percentage without a stored quote. It should also check the payment line follows `offersOnlineCardPayments` for every live country.
5. **The data migration** above. It can go in before the deploy.

## Flags

- Nothing in the prompt arrived garbled, and no instruction contradicted another.
- **The one-request rule was broken once.** The reading agent sent the first two requests (Just Eat UK, Uber Eats UK) in parallel, and both came back 403.
- **Not swept:** the separate "Which suits your food truck?" answers (compare-suits-1) at the top of the page. They're built from the table's cells and already exclude till strengths (`never_competitor_strength`).
- **SQL, all read-only:**
  - live countries' locale, payment model and app flags;
  - country_settings columns;
  - plan_features for the six order features;
  - shown entries' `choose_when`, till-type and marketplace tools.
