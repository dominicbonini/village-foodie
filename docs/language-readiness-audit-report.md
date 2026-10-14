# Language readiness audit: US English now, other languages later

**Date:** 13 October 2026
**Type:** read-only. The only file written is this report. No SQL was run and nothing was committed, pushed or deployed. No `.env*` file was opened.
**Sources:** `docs/us-readiness-sweep-report.md` (§2, §3) and `docs/phases-3-6-audit-report.md` (Part 6, Part 7).
**Working tree:** the US readiness sweep's changes are still uncommitted on top of `e54c7ea`. Line numbers below are for that tree.

**How this was done**
- **A counter built on the TypeScript compiler.** It read every `.ts`/`.tsx` file under `app/`, `components/`, `lib/` and `hooks/` and kept JSX text, user-facing props (placeholder, title, label, aria-label, alt…) and string literals that read as prose. It dropped comments, imports, class names, `console.*`, query arguments, comparison values and identifiers. Expect about ±15% error, mostly a few internal error strings counted as text. The counts in §2a come from this.
- **Six read-only research passes:** customer-facing, truck operations, the Manage page, Manage's components and copy modules, marketing, and language plumbing plus non-UI content. Each read its files with comments stripped and checked them by hand. The file:line lists in §2b–§2d come from these passes. The key ones were re-checked for this report.

---

## Summary

1. **There is no language layer today.**
   - `country_settings.locale` (en-GB / en-US) changes formatting only: money, numbers, and the weekday and month names that `Intl` produces.
   - Every word on every screen, email, ticket, poster, AI prompt and native string is literal UK English.
   - No i18n library is installed, and `<html lang="en">` is fixed.
   - A few modules choose words by **country data** rather than language: allergens by `allergen_set`, placeholders by `address_format`, phone copy by `short_name`/`phone_example`, SEO tags by name/locale, and poster dates by GB/US.
2. **Size of the extraction job:**
   - about **7,000 hard-coded user-facing strings** (about 5,000 unique, about 43,000 words) in **358 files**, excluding admin;
   - **2,765 of them are in Manage** (1,360 in `app/manage/[token]/page.tsx` alone).
3. **US English:** about **75 distinct words and phrases** differ (table in §4.4). The ones that matter are:
   - collection → pickup (about 95 places, including the printed ticket and customer emails);
   - basket → cart, hatch → window, van → truck, postcode → ZIP code;
   - cancelled → canceled and authorised → authorized (both in customer emails);
   - hand-built UK dates ("Saturday 14th June", "Sat 27 Jun", "1 October");
   - every demo being built as a GB truck.
4. **Other languages:** the code needs several changes so that adding a language later is just a new translation file:
   - about **230 sentences** are built by joining pieces;
   - about **80 plurals** are written by hand;
   - about **220 places** upper-case text in CSS or code;
   - several **English display strings are also used as keys**: plan-table row names, "Walk-up", "Private", allergen, dietary and cuisine labels, category names;
   - **servers send English sentences** (API errors, a payment-failure sentence carried in the URL, pre-order labels, emails);
   - **printing and posters cannot draw non-Latin scripts**.
5. **Recommendation:**
   - **next-intl in its "no URL routing" mode.** Messages are ICU JSON per language: `en-GB` is the full base, `en-US` is a small override file, and later languages are new files.
   - **Built in phases**, each proven byte-identical for UK by a parity harness. Customer-facing and kitchen surfaces go first.
   - **US English needs only phases 0, 1a, 1b and 2** before the first US truck. Everything else can follow.

---

## 1 · How language is handled today

### 1.1 What `locale` drives
- **The column.** `country_settings.locale` (`supabase/migrations/20261010_02_country_settings.sql:51`). The seeds are GB `en-GB` and US `en-US`.
  - The admin form calls it "Language style — how dates and numbers are written" (`components/admin/CountriesTab.tsx:396`).
  - **There is no language column** anywhere: not on countries, trucks, orders or customers.
- **Where it is read:**
  - `lib/country-settings.ts:103` → `CountrySettings.locale`;
  - `moneyFormatOf()` → `lib/money-format.ts` and `lib/money-server.ts` (all money);
  - `lib/truck-time.ts:31,47` → `lib/time-utils.ts` `formatYmd`/`formatInstant` (`:271,277`) for dates and times;
  - `lib/marketing-meta.ts:22` for `og:locale` and JSON-LD `inLanguage` (landing and features).
- **What it drives: formatting, plus one partial exception.**
  - `Intl` produces weekday and month **words** in that locale.
  - But the same strings also contain hand-built English that ignores it:
    - `ordinalDay` "9th" (`time-utils.ts:302-306`);
    - `formatShortOrdinalDate` with hard-coded `SHORT_DAYS`/`SHORT_MONTHS` (`:321-333`);
    - "am/pm" added by hand (`:80`).
  - Setting a French locale today would give "vendredi 9th Oct".
- **Fallbacks are UK:**
  - `LEGACY_UK_TIME_SETTINGS` and `DISCOVERY_TIME_SETTINGS` (`time-utils.ts:40-48`) are en-GB, 24h and London time.
  - The dashboard and KDS use them while the truck loads and for older offline snapshots (`app/dashboard/[token]/page.tsx:269`, `kds/page.tsx:136`).

### 1.2 The existing country-specific copy patterns

| Module | Chosen by | What varies |
|---|---|---|
| `lib/allergens.ts` | `allergen_set` (uk14/us9) | allergen list, generic families, AI prompt lines |
| `lib/copy/addressPlaceholders.ts` | `address_format` | three Schedule placeholders. The date part "Saturday 14th June" is still shared. |
| `lib/phone-copy.ts` + `lib/phone.ts:118-123` | `short_name`, `phone_example` (data) | the country name and example. The sentence "Please enter a valid {UK }mobile…" is still English. |
| `lib/marketing-meta.ts` | `name`, `short_name`, `locale` | landing and features titles, `og:locale`, JSON-LD |
| `lib/weekly-post/locale.ts` | country code GB / US (`LOCALES` `:66-90`) | poster and caption date styles. Uses its own English month and day arrays. Any other country falls back to GB. |
| `lib/plan-features.ts:168` | `card_fee_region_label` | "standard {UK cards}" |
| `tax_label` | data ('VAT' / 'Sales tax') | the tax line. Lower-cased into a sentence at the order page (`page.tsx:1663`). |

Plain UK constants, ready to move into a catalogue as they are:
- `lib/copy/{offlineProtection, scheduleVerify, serviceSettings, socialPosts, stock, weeklyPost}.ts`
- `lib/settings-copy.ts`
- `lib/custom-domain/copy.ts`
- `lib/private-events/copy.ts`
- `lib/whatsapp/copy.ts` and `alert-copy.ts`
- `lib/order-completion-label.ts`
- `lib/payments/sold-out-copy.ts`

How hard each is to fold in is in §4.1.

### 1.3 Libraries and the `<html>` tag
- `package.json` has **no** i18n library: no next-intl, i18next, react-intl, lingui or formatjs.
- `app/layout.tsx:146` is `<html lang="en">`, fixed. `app/layout.tsx:78` has `og:locale "en_GB"`, fixed (so do `app/venues/[slug]/page.tsx:103` and `app/trucks/[slug]/page.tsx:64`).

### 1.4 Formatting: where it is right and where it is hand-built
**Right:**
- Money goes through `lib/money-format.ts` with the country locale everywhere. A string-only scan found **no rendered "£"** outside admin, the screenshots and the ticket encoder's £ byte.
- Times on the order page, dashboard, ticket and emails go through `formatSlot`/`formatTime` with the truck's settings.
- All 24 `toLocale*String` calls pass a locale.

**Hand-built or fixed to UK:**
- **48 `'en-GB'` literals**, about 25 of them admin. Non-admin ones:
  - `lib/utils.ts:64-80` `formatFriendlyDate` → "Saturday 14th June", "Today - …" (Village Foodie discovery, venue pages);
  - `components/MapView.tsx:51`;
  - `components/EventListCard.tsx:166`;
  - `app/api/demo/save-email/route.ts:22` → "27 October 2026" in an email and on screen;
  - `components/manage/FontPicker.tsx:324,422`;
  - `lib/whatsapp/copy.ts:39`;
  - `localeCompare(…,'en-GB')` at `app/manage/[token]/page.tsx:8856`, `SchedulePlaces.tsx:286`, `lib/schedule-graphics/places.ts:399`;
  - `Accept-Language: en-GB` at `app/api/manage/verify-schedule-url/route.ts:121`.
- **Three ordinal implementations:** `time-utils.ts:302`, `lib/weekly-post/format.ts:31-42`, `lib/utils.ts:68-71`.
- **Two hand-built am/pm:** `time-utils.ts:80`, `weekly-post/format.ts:97` ("5pm"). English am/pm is also assumed when parsing at `app/page.tsx:286`.
- **Ten month/day-name arrays** (non-admin):
  - `time-utils.ts:321-322`;
  - `lib/preorder.ts:118-119` → "Pre-order by 16:30, Sat 27 Jun", built on the server and always 24-hour (`app/api/menu/[truckId]/route.ts:549-552`);
  - `lib/weekly-post/week.ts:29`, `locale.ts:113-116`;
  - `lib/whatsapp/copy.ts:46`.
- **Fixed date strings:** `META_FREE_ALLOWANCE_FROM = '1 October 2026'`, `META_PRICING_CHECKED_ON = '16 September 2026'` (`lib/whatsapp/copy.ts`). These are rendered into the plans footnote on /features and in the PDF.
- **Raw ISO dates shown to people:**
  - `app/dashboard/[token]/page.tsx:5460` "Off since 2026-10-13";
  - the owner deletion email (`app/api/account/request-deletion/route.ts:229`);
  - plans PDF "Generated 2026-10-13".
- **Numbers built by hand:**
  - `toFixed` percentages and decimals: `CostComparison.tsx`, "{x} miles away" (`EventListCard.tsx:289`), "That image is 3.2MB" in six places;
  - currency symbol assumed in front: `lib/copy/serviceSettings.ts:234-255` "+ £", "Nearest £1";
  - coin suffix table `lib/charge-settings.ts:132` (p, ¢, c).
- **Pence:** the cost calculator prints `{CARD_PENCE}p` and "Pence per order" (`app/compare/CostComparison.tsx:694-695, 757, 764, 767, 963, 1385`). A US visitor would see "2.9% + 30p", even though `smallFeeLabel` in `lib/money-format.ts:75-87` already gives "30¢".
- **The demo is always a UK truck:** `lib/provision-demo.ts:147` `country: 'GB'`. A US prospect's demo shows £, 24-hour times, UK dates and a UK phone format on every screen, ticket and seeded order.

---

## 2 · Inventory of user-facing text

### 2a · Size of the extraction job

Counted mechanically (method above). Admin-only files are excluded (2,510 strings in 81 files).

| Area | Strings | Files | Largest files |
|---|---:|---:|---|
| Customer: order page, confirmation, status, discovery pages | 522 | 29 | `app/trucks/[slug]/order/page.tsx` 219 · `EventListCard.tsx` 46 · `TruckClient.tsx` 39 · `app/order/[id]/manage/page.tsx` 29 · `lib/preorder.ts` 29 · `app/page.tsx` 27 |
| Emails (customer and operator) | 111 | 3 | `lib/email.ts` 88 · `lib/email-signup.ts` 22 |
| Push, SMS, WhatsApp | 86 | 15 | `lib/whatsapp/alert-copy.ts` 25 · `lib/whatsapp-classifier.ts` 21 (+3 AI prompts) |
| Kitchen tickets and printing | 139 | 13 | `PrintingSettings.tsx` 70 · `lib/printing/ticket.ts` 10 (+about 12 all-caps headings the counter skips) |
| Dashboard | 931 | 31 | `app/dashboard/[token]/page.tsx` 428 · `AddOrderPanel.tsx` 111 · `CustomDomainSetup.tsx` 55 · `OrderCard.tsx` 54 · `PaymentActionsModal.tsx` 51 |
| KDS | 146 | 1 | `app/dashboard/[token]/kds/page.tsx` |
| Manage (every tab, copy modules, posters) | 2,765 | 57 | `app/manage/[token]/page.tsx` 1,360 · `lib/copy/socialPosts.ts` 299 · `DesignEditor.tsx` 101 · `EventTypes.tsx` 88 · `ExtrasEditor.tsx` 68 · `PaymentsTab.tsx` 63 |
| Setup wizard, signup, auth, demo | 407 | 25 | `DemoGetStarted.tsx` 106 · `lib/demo-templates.ts` 75 · `lib/provision-demo.ts` 27 · `app/setup/page.tsx` 24 · `app/signup/page.tsx` 23 |
| Marketing: landing, features, compare, plans PDF | 521 | 20 | `CostComparison.tsx` 143 · `app/landing/page.tsx` 136 · `lib/plan-features.ts` 97 · `DemoUpload.tsx` 48 |
| Native shells (web side) | 89 | 7 | `OperatorDeviceConfig.tsx` 48 · `OfflineBanner.tsx` 16 |
| Server responses shown to users (`app/api`, non-admin) | 676 | 62 | `api/manage/route.ts` 122 · `api/weekly-post/route.ts` 104 · `api/dashboard/action/route.ts` 92 · `api/orders/submit/route.ts` 34 |
| Shared lib (rules, AI prompts, domain and private-event copy, other) | 641 | 95 | `lib/custom-domain/dns.ts` 65 · `custom-domain/copy.ts` 57 · `private-events/copy.ts` 37 · `go-live-checks.ts` 34 |
| **Total** | **7,034** | **358** | about 4,975 unique · about 43,000 words |

**Native shells' own strings** sit outside the TypeScript count:
- **Android:** `strings.xml` has 2 strings, and there is only a `values/` folder.
- **iOS `Info.plist`:**
  - 4 permission sentences (local network, Bluetooth, camera, Face ID);
  - `CFBundleDevelopmentRegion = en` and no `CFBundleLocalizations`.
- **iOS `HGBridgeViewController.swift`:** 4 strings ("Can't reach HatchGrab", "Check your connection.", "Retry").
- **From the JS side:**
  - the Android notification channel "New orders" (`lib/native/push.ts:182-183`);
  - the biometric prompt (`lib/native/appLock.ts:75-83`);
  - push titles (`lib/apns.ts:171`, `lib/fcm.ts:138`).
- **The PWA:** `public/manifest.json` and `public/offline.html`.

The hand counts from the research passes agree within the stated error: about 700 strings for the customer scope, 2,050 for truck operations and onboarding, 1,160 for the Manage page, 2,020 for Manage's supporting files and 420 for marketing.

### 2b · US English differences

Each **distinct** word is listed once, with every place it appears. "Cust" is a customer, "Op" a truck operator, "Tkt" the printed ticket, "Pub." the public site. One row per word, for approval, is in §4.4.

#### Vocabulary

**collection / collect / collected → pickup / pick up / picked up.** About 95 places, the largest single item.
- **Customer screens**:
  - order page `app/trucks/[slug]/order/page.tsx`:
    - 3645 "Collection time" (shown upper-case)
    - 3787 "✓ Collection time: {slot}"
    - 3910, 3958, 4028 "Pay at the truck on collection · No card details needed"
    - 4349 "Collection time: {slot}"
    - 4358 "Preferred collection: {slot}"
    - 4362 "…will confirm your collection time…"
  - `app/api/orders/cancel/route.ts:93` "…within {n} minutes of collection".
- **Customer emails**, `lib/email.ts`:
  - 69, 72-73, 105, 108-109 "…due when you collect" / "still to pay when you collect"
  - 141, 143-144 "Pay at the truck on collection"
  - 350 "Your collection time has been updated"
  - 354-355
  - 429, 498 "ready for collection — come and collect"
  - 468 "is ready to collect"
  - 500, 504, 505
- **Printed ticket**, `lib/printing/ticket.ts`:
  - 262 "COLLECT ASAP" / "COLLECT {time}" → "PICKUP …"
  - 409 "DO NOT COLLECT" → "DO NOT CHARGE" ("collect" here means take the money)
- **Operator screens**:
  - dashboard `app/dashboard/[token]/page.tsx`:
    - 808 "Order not collected"
    - 2027
    - 2127
    - 2135
    - 5295-5296 "Mark paid & collected" / "Collected"
    - 5535-5587 "Customer Collection Times", "Your Collection Times"
    - 6552 "Extra to collect" → "Extra to charge"
    - 6570
  - `OrderCard.tsx`:
    - 474
    - 495, 497 "Cash & collected" / "Card & collected"
    - 623, 631 "Nothing to collect" → "Nothing to charge"
    - 633 "Card authorised — do not collect"
  - `PaymentActionsModal.tsx:31`
  - `lib/order-completion-label.ts:31-32`
  - `components/dashboard/types.ts:347`
  - `DemoWelcome.tsx:81`
  - `ExtraWaitModal.tsx:33`
  - `PrintingSettings.tsx:471, 503, 528, 539`
  - `lib/copy/serviceSettings.ts:32`
  - `lib/settings-copy.ts:136`
  - `KitchenCapacitySection.tsx:230`
  - `TakingPaymentPanel.tsx:126-129`
  - `lib/event-types/resolve.ts:370`
  - `WeeklyPost.tsx:713` placeholder "Pre-order for collection", which ends up in customer captions
  - Manage `page.tsx`: 12888-12928, plus the Reports CSV headers 15065, 15099
- **Onboarding and server errors**:
  - `lib/go-live-checks.ts:155, 188`
  - `lib/demo-kitchen.ts:38`
  - `lib/provision-demo.ts:370`
  - `app/api/dashboard/action/route.ts:2785-2807`
  - `app/api/manage/route.ts:2339, 2345, 2378`
- **Operator new-order messages**: email `lib/email.ts:573` "⏰ Collection:" and WhatsApp `app/api/orders/submit/route.ts:140`.
- The product already mixes the two words. These already say pickup: `app/order/[id]/manage/page.tsx:185, 266`, `lib/email.ts:413`, `lib/settings-copy.ts:115`.

**basket → cart** (Cust)
- `order/page.tsx:4133` "Add to basket"
- `order/page.tsx:1981` "Your basket is saved…"
- `api/orders/submit/route.ts:84-85` (shown word for word at order page 2307)
- `DealsModal.tsx:357` "In your basket", `:373` "(in basket)"
- landing (Pub.) twice

**hatch → window**
- Customer: `order/page.tsx:2478, 4350` "See you at the hatch!"; `lib/email.ts:128, 130, 354, 504`; `lib/private-events/copy.ts:132` "Please order at the hatch."
- Operator: dashboard 2092, 4308, 5296, 5453; KDS 2087; `AddOrderPanel.tsx:307, 1614, 2288`; `PaymentsTab.tsx:696`; `TakingPaymentPanel.tsx:129`; Manage 13230.
- **"Pay at Hatch"** is a plan-row name and a lookup key: `lib/plan-features.ts:125, 186, 217, 219, 726`; `lib/landing-table.ts:47`; `lib/pricing.ts:15`; Manage 1571, 14444. Marked **Dominic decides** in §4.4, because it is on-brand ("HatchGrab").

**van / vans → truck / trucks** (Op; a US operator reads "van" as a different vehicle)
- Manage `page.tsx`: 9191-10054 "Select a van", 12616-12625, 13001 "e.g. Van 2, Festival Van", 14037-14114 "Keep van" / "Remove van", 15859 "Owner · All vans". The same file already says "Your trucks" (12562) and "All trucks" (16017).
- Dashboard 6290; `OperatorDeviceConfig.tsx:144-282`; `VanMenuChooser.tsx:47, 73`.
- `lib/copy/serviceSettings.ts:82, 115-131, 269`; `VanFilter.tsx:56-121`; `KitchenCapacitySection.tsx:216-278`; `EventTypes.tsx:895, 1761, 2113`.
- `lib/go-live-checks.ts:141-150`; `lib/printing/networkGuard.ts:79`.
- API errors: `app/api/manage/route.ts:2530-2839`; `app/api/printing/route.ts:88`; `app/api/native/*`.
- Demo menus "Pizza van" / "Burger van" / "Curry van" (`lib/demo-templates.ts:34, 52, 70`); default name "Van 1" (`provision-demo.ts:151`, `provision-truck.ts:589`).
- Marketing: `landing/page.tsx:370, 484`; `CostComparison.tsx` 11 places.

**postcode → ZIP code**
- Manage: labels 9221, 9294, 9999; placeholders 9222, 9335, 9421 "CB22 5EJ" and 9999 "e.g. CB8 8PD"; text 8720, 8732.
- `SchedulePlaces.tsx:341, 486`; `lib/private-events/copy.ts:201`.
- Village Foodie home `app/page.tsx:157, 218, 260`. That site is UK only.
- These places also **force postcodes to upper case**: Manage 9222, 9335, 9421; `app/page.tsx:148, 162, 258`.

**"Area (village, town or city)" / village → "City or town"**
- Manage 9997, 9217, 9293.
- Village Foodie's "villages near you" (`app/page.tsx:253`, `Footer.tsx:12`) is UK only, so it is out of US scope.

**mobile (number) → phone / cell phone**
- `lib/phone.ts:121` "Please enter a valid UK mobile…", which the order page shows at 3810 and others.
- Landing (Pub.) 11 places, e.g. "patchy or no mobile coverage" → "spotty cell service" (361).

**Other vocabulary** (Pub. = marketing only)

| Word | Where | US |
|---|---|---|
| mobile catering | landing title, description, OG, Twitter, JSON-LD (89-144, 259-264) | catering |
| pitch / pitching up | landing 102, 134, 143, 433, 451; `lib/features.ts:282`; `CostComparison.tsx:223-224, 808`; truck page share and meta "Check out where {truck} is pitching up next!" (`TruckClient.tsx:86`; `app/trucks/[slug]/page.tsx:57, 60, 70`) | spot / popping up next |
| queue (a line of customers) | landing 102, 368 "Less queues", 134, 143; `CostComparison.tsx:641`; dashboard 6723 | line ("Shorter lines"). "queued" for orders is fine. |
| till, takings | Manage 12805-12806 and `TakingPaymentPanel.tsx:220` "so your takings reconcile against the till"; `api/dashboard/action/route.ts:604, 1982, 2552` "takings figure" | sales / cash register |
| card machine | `AddOrderPanel.tsx:1326`; `PaymentActionsModal.tsx:125-126`; landing 370; `plan-features.ts:430`; `CostComparison.tsx:964` | card reader |
| contactless | `PaymentsTab.tsx:753-768` | tap to pay |
| trading / trade (meaning "operating") | `lib/weekly-post/layout.ts:585` "No trading today" (**drawn on customer posters**); `event-preview.ts:17` and Manage 9724 "Where are you trading?"; `settings-copy.ts:149` "Where you trade"; `lib/walkthrough.ts:89`; `email-signup.ts:211, 221`; demo email "a fresh day's trading"; `custom-domain/copy.ts:147, 163`; `CostComparison.tsx:795, 903, 905` | "Closed today", "Where are you serving?", "up and running", "operate" |
| Week commencing | `lib/weekly-post/format.ts:138` default poster heading (**Cust**); `DesignEditor.tsx:360` | Week of {start} |
| car park | Manage 10063; `EventActionsModal.tsx:173` | parking lot |
| pub, "The Crown", "Kings Arms", Lavenham | event-type chip "Pub" (`lib/event-types/types.ts:204`, saved as the type name); Manage 9889; `DesignEditor.tsx:383, 2783`; `weekly-post/locale.ts:300-302`; `week-data.ts:304-309`; `socialPosts.ts:216` | bar / brewery; US sample places, chosen by country |
| Private hire, School fete | `types.ts:204`; `EventTypes.tsx:2446` | Catering; School fair |
| starters / mains, tickbox | dashboard 6174; `lib/kitchen-capacity.ts:8-16`; demo category "Mains" (`demo-templates.ts:72-78`, `demo-assumptions.ts:23`) | appetizers / entrées, checkbox |
| tick / untick / ticked | Manage 5488, 6339, 6360, 12197, 12493; dashboard 5641, 5667; `app/setup/page.tsx:316`; `KitchenCapacitySection.tsx:329, 351`; `private-events/copy.ts:138`; `api/weekly-post/route.ts:2540` | check / uncheck / checked |
| meal deals | order page 2806 (Cust); landing 611; `plan-features.ts:216` (also a key) | combos |
| TBC | `MapView.tsx:35`; `whatsapp-classifier.ts:77` (goes into AI replies); Manage 6541, 14473; `lib/pricing.ts:22, 40`; `plans-pdf.ts:36, 155` | TBD |
| enquiry | `Footer.tsx:35-36` "General Enquiry" (also a URL topic key) | inquiry |
| organiser | `lib/private-events/copy.ts:123, 129`; `orders/submit/route.ts:594` (Cust) | organizer |
| Part paid / still to pay | `lib/email.ts:68-115` (Cust) | Partially paid / still due |
| no money has been taken | order page 2028, 2077, 2098; `api/payments/return/route.ts:114-120`; `lib/payments/promote-draft.ts:82, 161, 241`; `email.ts:726`; `sold-out-copy.ts:50` | you have not been charged |
| Worked out (calculated) | order page 1709 tip line | Calculated |
| Set-up pending | order page 2834, 3322, 3346, 3901, 3917, 4014 | Setup pending |
| fancy (some…) | `EventListCard.tsx:77` share text | Craving… |
| Hire a food truck | `Footer.tsx:32`; `app/page.tsx:207`; `app/hire/page.tsx` (UK-only Village Foodie) | Book a food truck |
| have a play (around), have a look, look round, to hand, haven't got | KDS 3154; `walkthrough.ts:116`; dashboard 6726; landing 902; `DemoUpload.tsx:342, 386, 439-440`; `custom-domain/copy.ts:216-334`; `CustomDomainSetup.tsx:482` | try it out, take a look, look around, handy, don't have |
| straight away / straight over / straight back | dashboard 6396; `walkthrough.ts:83`; `private-events/copy.ts:100`; `alert-copy.ts:79, 88`; `PrivateLinkPanel.tsx:233`; `DemoGetStarted.tsx:100, 112, 808`; Manage 13939 | right away / right over / right back |
| sort (it), carry on, tidy up, getting going, drop us a message, fill in the form, come back to you, the lot | `setup/page.tsx:226, 234`; Manage 972-973, 1279, 3583, 5870, 9686, 9756, 14752; `PaymentsTab.tsx:131`; `email-signup.ts:144, 156`; `SchedulePlaces.tsx:573`; `socialPosts.ts:613`; landing 478, 480; `HatchGrabContact.tsx:61, 118`; `contact/page.tsx:57`; `TruckClient.tsx:313-317`; `FeatureComparison.tsx:69` | fix (it), continue, clean up, getting started, send us a message, fill out the form, get back to you, everything |
| "do you do pepperoni?", "Working out the reply" | Manage 10393, 10493, 10542 | "do you have…?", "Writing the reply…" |
| needs X-ing, move it across | `custom-domain/copy.ts:141, 156` (an email to the customer's web person); `whatsapp-signup/route.ts:370, 410`; `api/manage/route.ts:1819` | needs X added, move it over |
| food words | demo menu "Rocket & Parmesan", "Garden Veg", "Pilau Rice" (`demo-templates.ts:42-79`); "Fruit & veg" emoji group (Manage 529); cuisines "Jacket Potatoes", "Pie & Mash", "Fish & Chips" (`lib/cuisines.ts:22-69`, stored and used as a discovery filter); "fish & chips" placeholder (Manage 1783) | Arugula, Garden Veggie, Pulao Rice; Fruits & veggies; Baked Potatoes; hide UK-only cuisines for US |
| public liability cover | `CostComparison.tsx:222` | general liability insurance |
| .co.uk addresses | placeholders `signup/page.tsx:80`, `DemoGetStarted.tsx:1032, 1163`, `DemoUpload.tsx:411` "you@yourtruck.co.uk"; Manage 6469, 13107 and `lib/copy/scheduleVerify.ts:20` "yourtruck.co.uk/events"; fallback senders `hello@villagefoodie.co.uk` / `donotreply@villagefoodie.co.uk` (`email.ts:618, 676`; `auth/change-email:77`; `resend-verification:65`; Manage 14254) | .com |
| 💷 (pound-note emoji) | Manage 1167, 1277; `AddOrderPanel.tsx:2028, 2064`; `OrderCard.tsx:495, 535`; `DemoWelcome.tsx:81` | 💵 |
| UK phone placeholder | Manage 15937 "+44 7700 900000" | `phonePlaceholder(phoneCopy)`, as Settings already does at 12158 |
| UK law, A4 paper | `DeleteAccountSection.tsx:283-284` "as UK law requires" (legal); `PrivateLinkPanel.tsx:62, 67` table cards and `plans-pdf.ts:160, 295` A4 | legal wording, Dominic decides; US Letter |

#### Spelling

| UK | Where it is seen | US |
|---|---|---|
| cancelled, cancelling, CANCELLED | Customer: order page 950; `order/[id]/manage/page.tsx:96, 110, 149, 159, 164, 262`; `orders/cancel/route.ts:75, 93`; `email.ts:876, 886` (**subject**), 888, 920, 922, 930 (**subject**), 932; `api/dashboard/action/route.ts:453-464` (customer email); `lib/event-display.ts:95`; `Footer.tsx:55`; poster "CANCELLED" (`weekly-post/lines.ts:100`); captions "— CANCELLED, sorry" (`caption.ts:158`, `caption-template.ts:325`). Operator: about 20 more (dashboard, KDS, Manage 7289, 8479-8480, 15707, 15900, 15972; `EventCancelModal.tsx`; `DesignEditor.tsx`; `WeeklyPost.tsx`). Stored: `cancellation_reason` "Customer cancelled", "Event cancelled: …". | canceled, canceling, CANCELED. "cancellation" stays. |
| authorise(d), authorising, authorisation | Customer: order page 2028, 3563, 3597; `email.ts:128, 130`. Operator: `OrderCard.tsx:633`; `action/route.ts:2533`. Public: `plan-features.ts:618`. | authorize(d), authorizing, authorization |
| Unauthorised, Unrecognised | about 30 API responses (dashboard, auth, printing, native, manage, events, inbound-schedule) | Unauthorized, Unrecognized |
| colour(s), coloured | `DesignEditor.tsx` 7; `DesignEditorBits.tsx:154`; `lib/copy/socialPosts.ts` 8 | color(s), colored |
| centre | `socialPosts.ts:648, 654, 834, 863`; `DesignEditor.tsx:3801`; `plan-features.ts:697` "help centre" | center |
| favourite(s) | `SchedulePlaces.tsx:223, 305, 359` | favorite(s) |
| organise(d), organiser | landing 502 (inside the Gusto quote, which can't be edited); `private-events/copy.ts` | organize, organizer |
| analysing, categorising, uncategorised, customisable, customisation(s), recognised, licence (noun), digitisation, grey / greys out | Manage 1854, 5819-5820, 10299, 2298, 6108, 15391; `ExtrasEditor.tsx:62`; `walkthrough.ts:116`; `PrintingSettings.tsx:327`; `font-refs.ts:120`; `weekly-post/route.ts:2540`; `menu-extract.ts` prompt; dashboard 6177; `plan-features.ts:218` | analyzing, categorizing, uncategorized, customizable, customization(s), recognized, license, digitization, gray / grays out |
| Sulphites, Molluscs | UK allergen list (shown to UK trucks only) | Not in the US list. Nothing to change: US trucks get the US 9. |

#### Dates and times written as words or built by hand

| What | Where | Seen by | US |
|---|---|---|---|
| "Saturday 14th June", "Today - …", "Tomorrow - …" | `lib/utils.ts:64-80` (Village Foodie, venue pages, share text); `MapView.tsx:51-54` "SATURDAY 14 JUNE" | Cust (UK site) | "Saturday, June 14" |
| "Pre-order by 16:30, Sat 27 Jun" / "Pre-orders open Sat 27 Jun" | `lib/preorder.ts:118-187`, built on the server | Cust | "Pre-order by 4:30 PM, Sat, Jun 27" |
| "Saturday 14th June …5pm-9pm" in the paste example | `lib/copy/addressPlaceholders.ts:29` (both styles) | Op | "Saturday, June 14 … 5–9 PM" |
| "Wednesday 14th October" font sample | `FontPicker.tsx:180`; `api/weekly-post/route.ts:2657` (drawn into a PNG) | Op | `dateTextFor(…, country)` |
| Poster dates, ordinals, "5pm", English month and day arrays | `lib/weekly-post/format.ts:31-42, 97-117`, `locale.ts:113-191`, `caption.ts:39-80` | Cust | The US style already exists ("Wednesday, October 14th"). It is English-only. |
| "1 October" / "1 October 2026" / "16 September 2026" | `lib/whatsapp/copy.ts:36-46` → `alert-copy.ts:48-79` and the /features footnote | Op, Pub. | "October 1, 2026" |
| "27 October 2026" (demo kept until) | `api/demo/save-email/route.ts:22` → email and `DemoGetStarted.tsx:677, 812` | prospect | "October 27, 2026" |
| Raw ISO dates | dashboard 5460; deletion email (`request-deletion/route.ts:229`); plans PDF | Op | locale date |
| "Tomorrow 2nd September", "Tue 1 Sep", 24-hour times | the three landing screenshots | Pub. | new US screenshots |
| 24-hour hour picker `HOUR_OPTIONS` 00–23 | Manage 7344-7454 (Schedule, Add event) | Op | 12-hour picker when `time_format = 12h` |
| Raw `event_date` / `start_time` shown as stored (dd/mm/yyyy, HH:MM) | Manage 6541, 7160, 9475 | Op | format through time-utils |
| dd/mm assumed when reading AI and sheet dates | Manage 4075, 7773, 8258-8285, 8972, 9052; `schedule-extract.ts:61-62` (output is always DD/MM); `EventListCard.tsx:158`; `app/page.tsx:277`; `TruckListCard.tsx:98` | Op | Fine while the extractor's output stays DD/MM; keep it internal |
| "Monday to Sunday" | `DesignEditor.tsx:368, 400, 2724` | Op | Follow `week_start` |
| Discovery pages always UK time settings | `TruckListCard.tsx:154-159`, `EventListCard.tsx:77, 283` "17:00 – 21:00" | Cust | Truck settings, if Village Foodie ever goes to the US |

#### Money words
- **No rendered "£", "VAT" or "incl."** outside data and the screenshots. The tax name comes from `tax_label`.
- **Pence:** cost calculator "p" and "Pence per order" (above). The UK uses "20p" through the coin table in `charge-settings.ts:132`, which already gives "¢" for USD.
- **The "+ £" / "Nearest £1" pattern** puts the symbol first by assumption. Fine for $, wrong for euro locales that put it after.

#### Anything else
- **The UK testimonial and award** (Pizzeria Gusto, "busy villages", "Mobile Pizzeria of the Year", landing 502-547): show it for GB only, or add a US one.
- **App Store link** points at the GB storefront (`lib/app-badges.ts`); the US needs a locale-free link.
- **Root `og:locale` "en_GB"** on /compare, /privacy, /terms, truck and venue pages.
- **"Village Foodie" brand mentions** on HatchGrab pages: the footer credit, the login fallback, the dashboard fallback at 3726.

### 2c · Things that break or need care for other languages

| Hazard | Count (approx.) | Examples |
|---|---:|---|
| **Sentences built from pieces** (values dropped into English word order, JSX split around values, bold words split out) | about 230 | Order page: `Only ${n}${noun} left!` with a lower-cased category as the noun (3141-3144); `Sorry — {notice} now. We've updated your order` built in two places (2285, 3834); `${'Save' \| 'Add to basket'} · ${amount}`. `lib/payments/sold-out-copy.ts:21-51` (English "and" list, it/them pronoun, the verb "paying" slotted in). Emails `${truck}'s event${at}${on} has been cancelled`. `socialPosts.ts` bold-split blurbs; `settings-copy.ts:114` prefix + select + suffix. Landing pricing paragraph with 7 values. Manage about 95 (e.g. 1288-1300 "Missing: " + lower-case pieces joined with ", "). |
| **Plurals written by hand** (`n === 1 ?`, `'s'` added, `(s)`, or no singular at all) | about 80 | Order page 3626, 3989 `item${n!==1?'s':''}`; `submit/route.ts:891`; "{n} minutes" always plural (`email.ts:413`, cancel route 93); `lib/slot-display.ts:40-63` adds "s" to category names ("8 Pizzas"); `inbound-schedule/route.ts:353, 364` "1 new event … that need" (wrong even in English); Manage about 33; `CostComparison.tsx` 7. |
| **Upper-casing** (CSS `uppercase`, `toUpperCase`, `cap()`, `toLowerCase` inside sentences) | about 220 | 69 in Manage, 81 in truck operations, about 42 in Manage components, landing and PDF headings. `cap()` on category names (order page 2948-3034, dashboard 5863, 6469; `AddOrderPanel.tsx:298+`) breaks German nouns and Turkish i. The tax label is lower-cased into a sentence (order page 1663). Poster `caps()` uses `toUpperCase()` with no locale (`weekly-post/locale.ts:122`). The ticket prints the raw payment-status enum upper-cased (`ticket.ts:412`). |
| **English text used as a key or a comparison** | about 20 | Plan rows are looked up by English name (`ROW_FEATURE_MAP`, `trialFeatureValue`, `NON_SECRET_PRICE` 'Free' / 'Pay at Hatch' / 'Unlimited'). 'Coming soon' is compared as text (`FeatureComparison.tsx:52`, `plans-pdf.ts:111`). `customer_name === 'Walk-up'` (Manage 14832, 15074, 15458; ticket 298). `PRIVATE_TYPE_NAME = 'Private'` is matched with `ilike` and a unique index. The 'Other' revenue bucket. `VARIANT_AXIS_TOKENS` (beef, small…) drives menu regrouping. `demo-assumptions.ts:23-27` picks prep time by English category name. Default category key 'mains'. `PlanPrice` splits on `'/mo'`. The cost calculator compares formatted strings (`CostComparison.tsx:184`). Contact topics like `General%20Enquiry`. |
| **English stored in the database and shown to people later** | 12 kinds | Allergen and dietary labels; cuisine list; category names from the English `STANDARD_CATEGORIES`; demo menus; 'Van 1'; 'Walk-up'; `cancellation_reason`; refund, reject and cancel reason labels (emailed); poster layout heading and days-off text; saved caption templates; `event_types.name` from chips; `place_pictures.label 'Event poster'`; `orders` tax-label snapshot. |
| **Sentences built on the server** (the client cannot translate them) | every API error (about 680); every email (about 110); push titles; WhatsApp replies; pre-order labels | `app/api/payments/return/route.ts:88` puts a whole English sentence in the `?payment_failed=` URL. `lib/payments/promote-draft.ts` refusals. `app/api/menu/[truckId]/route.ts:549` `preorderLabel`. |
| **Fixed widths, nowrap and truncation that would clip ~30% longer text** | about 120 risky | Allergen table 56px columns and a 118px status column sized to "Confirmed ✓" (Manage 2422-2427). Billing plan columns `w-14` at 10px upper-case (14333-14447). Dashboard stock headers already overflowed in English and were shortened (5832-5843). `TruckListCard.tsx:151` 112px date column (even US "5:00 PM – 9:00 PM ● Live" is at risk). `TruckClient.tsx:246` `min-w-[80px] whitespace-nowrap overflow-hidden` buttons. Landing hero h1 has 2.6px spare at 360px; nav and hero CTAs are `nowrap`; comparison table header height is a fixed 63/83px that drives sticky offsets. `EventTypes.tsx:313` "212px measured floor". 39 `truncate` in operations and 39 in Manage components. |
| **Text in images** | 4 files and every poster | `public/screenshots/*.png` (3, £ and UK dates); `public/logos/hatchgrab-share-card.png` (slogan "Less time booking. More time cooking."); posters (heading, day and month names, "CANCELLED", "No trading today", "Private event", "Powered by HatchGrab"); QR poster (`lib/generateQRCode.ts:113-250` "Your logo here", "Powered by HatchGrab" right-aligned on the same baseline as the truck name). App Store and Google Play badges are the English variants (both stores publish localised ones). |
| **Confirm dialogs naming the OS buttons** | about 9 | `AddOrderPanel.tsx:1614-1659` "OK = … · Cancel = …". The buttons are localised by the OS, so the text stops matching. |
| **Possessives, `${first} ${last}`, curly quotes** | about 15 | `${place}'s poster`, `{name}'s service settings`; owner full name built and saved (Manage 15633); hard-coded “ ” (German uses „ “, French « »). |
| **No right-to-left support** | n/a | No `dir`; physical left/right CSS throughout. Arabic and Hebrew are out of reach without a layout pass. |

### 2d · Content in other places

**AI prompts** (all Gemini 2.5 Flash, all written in English, **none says which language to answer in**)
- **Menu import** (`lib/menu-extract.ts`):
  - It receives money and allergen set. It does not receive a language.
  - `STANDARD_CATEGORIES` ('Starters', 'Mains', … `:20-24`) pushes a French menu's "Entrées" into English category names. That is the one place where **the product changes a truck's own menu text**.
  - Its examples still use UK allergen labels even in the US prompt (`:185-186, :200, :215` "Dairy", "Crustaceans"). For a US truck these would come back as non-US labels, and the review screen would flag them.
- **Allergen card** (`process-allergens`): set-aware since the sweep. Transcribe mode keeps the card's own words.
- **Schedule import** (`lib/schedule-extract.ts`):
  - The GB prompt is strongly UK: "UK venues", "pub", UK postcode format, "Sat 14th June The Crown…".
  - The ZIP/state prompt is US.
  - Output is always DD/MM and 24-hour (internal; fine).
- **Geocode** (`app/api/manage/geocode/route.ts:10-21`) defaults to 'UK' when no country is passed. The caller passes the truck's country.
- **WhatsApp:**
  - The classifier, menu answerer and schedule reply prompts (`lib/whatsapp-classifier.ts:165-183, 297-319, 394-416`) use UK examples ("are you trading today", "Wickhambrook on Friday").
  - Every fixed reply is English, and lists are joined with English "and".
- **No captions use AI.** Weekly-post captions are English templates.

**WhatsApp safety floor.** `mentionsAllergen` (`whatsapp-classifier.ts:131-145`) lower-cases the message and then deletes every non a–z character.
- **US English:** fine ("celiac", "gluten free").
- **Other languages:**
  - Greek, Cyrillic and CJK questions become empty strings.
  - "intolérance" becomes "intol rance" and misses the stem.
  - Spanish "alergia" misses `allerg`.
  - "sin gluten", "sans gluten", "glutenfrei" and "senza glutine" are not matched.
  - The allergen caveat is added only when the reply contains English allergen words (`:342-348`).
- **Before any non-English truck goes live,** the floor needs Unicode-aware matching and stems per language. This is a safety item, not a wording one.

**The printed ticket** (`lib/printing/ticket.ts`)
- **Option 1 of Phase 3–6 audit Part 7 is in place.**
  - Text is folded (NFC, then ß→ss, æ→ae, ø→o, œ→oe, smart quotes and dashes, € → "EUR", then NFD with accents stripped) before layout (`:446-469`).
  - Anything else outside ASCII except £ prints "?". `ESC t 16` (Windows Latin-1) is still sent (`:522`).
  - Paper widths are 58 and 80mm, with 32 and 48 columns (16 and 24 at double width).
- **Coverage:**
  - Western European languages print readably without accents ("Jalapenos", "Creme brulee").
  - **Greek, Cyrillic, Arabic, Hebrew, Thai, CJK and emoji print as "????".**
  - Ticket headings are hard-coded English capitals: COLLECT, BUZZER, TOTAL, PAID, CARD HELD, DO NOT COLLECT, TO PAY, NOTE, REPRINT, MAY BE A DUPLICATE.
  - A longer translated "COLLECT" makes the header stack at 58mm routinely.

**Printing options:**

| Option | Covers | Cost |
|---|---|---|
| A. As today (fold to ASCII) | English, Western European without accents | none |
| B. Real Latin-1 accents (the `ESC t 16` already sent) | Western European with accents | a byte table plus a hardware test; a mismatched clone prints the wrong accent |
| C. Switch code page per script (CP1253 Greek, CP1251/866 Cyrillic) | one extra script per ticket | depends on the printer model; one script at a time |
| D. Printer double-byte modes (GB18030, Shift-JIS) | CJK, on printers that support them | depends on the printer model |
| E. **Print the ticket as an image** (draw it, send `GS v 0` raster) | **any script, any font** | new encoder; about 50–80 KB per ticket, which takes seconds over Bluetooth; no raster code exists today |

Recommendation: keep A for English and Western Europe, and add B when a Western European truck asks. **Plan E only if a non-Latin market is chosen.** It is the only option that works everywhere.

**PDFs** (`lib/plans-pdf.ts`)
- HTML rendered by headless Chromium. The font stack is `-apple-system, "Helvetica Neue", Arial`.
- On Vercel only the bundled Open Sans exists. It covers Latin, Greek and Cyrillic; CJK, Arabic, Hebrew, Thai and Devanagari would render as boxes.
- The page has **no `lang`** attribute and is A4. Its headings, small print and "TBC" note are English.
- The private-event table cards (`PrivateLinkPanel.tsx`) are A4 too.

**Posters** (satori, `lib/weekly-post/render.ts`)
- 21 bundled fonts plus Google Fonts and uploads. There is **no fallback font**, so missing characters become blanks.
- **Coverage, read from each font's character table:**
  - all 21 cover Western European accents and €;
  - Lato and Permanent Marker lack Central European letters;
  - only 10 have Cyrillic;
  - the **default, Oswald, has no Greek**;
  - none has Arabic, Hebrew, Thai, CJK or Hangul.
- Text wraps on spaces only (no CJK breaking) and is measured without shaping, which is wrong for Arabic and Indic scripts.
- The editor uses browser fonts and can show characters the server image cannot draw.

**Web fonts**
- Archivo, Public Sans and Courier Prime (landing, features, compare) and Geist (app) load `subsets: ['latin']` only. Polish, Czech, Turkish, Romanian and Vietnamese letters fall back to system fonts.
- Adding `'latin-ext'` is a one-word change per font. It is not needed for US English.

**SEO**
- `<html lang="en">` everywhere.
- **No hreflang** or `alternates.languages`.
- One canonical per page. Landing and features change content by IP, cookie or `?country`, but all canonicalise to the bare URL. Googlebot crawls mostly from US IPs, so once the US is switched on Google would index the **US** version for UK searchers.
- `metadataBase` and the root `og:url` use the apex domain while canonicals use www.
- The sitemap lists one URL per page.
- `og:locale` is per country only on landing and features.
- `/compare` has no metadata of its own.
- **Before the US is switched on for marketing:** either per-country URLs (`/us/…`) with hreflang en-GB, en-US and x-default, or keep the US marketing pages `noindex`. Recommendation: per-country path prefixes for the marketing pages only.

**Menu content is never translated by us: confirmed, with four exceptions to fix**
- The order page, dashboard, KDS, tickets and emails show the truck's own dish, category, modifier and deal text as stored.
- Four places assume English anyway:
  1. **The AI importer normalises to English category names** (`STANDARD_CATEGORIES`) and English protein and size tokens. Recommendation: tell it to keep the menu's language and use the standard names only when the menu is in English.
  2. **`cap()` and `toLowerCase()` change the case of the truck's category names** (order page 2948-3141, dashboard 5863, 6469). That changes the truck's text, and it is wrong for German and Turkish.
  3. **`lib/slot-display.ts:40-63` adds an English "s"** to category names ("8 Pizzas").
  4. **Demo menus, the demo prep-time guesses and the menu regroup tokens** are English. That is fine for demos, but they should not run on a non-English truck's real menu.

---

## 3 · Who sees which language (design)

| Question | Options | Recommendation |
|---|---|---|
| **Truck's language** | (a) the country's language (a new `country_settings.default_language`, e.g. en-GB, en-US); (b) a truck setting; (c) both: a truck setting that defaults to the country's | **(c), built in two steps.** For US English **no new column is needed**: use the country's `locale` (en-GB / en-US) to pick the file. Add `trucks.language` (nullable, overriding the country's) only when the first country with two languages arrives, such as Canada, Belgium or Switzerland. |
| **Customer's language** (order page and confirmation) | (a) always the truck's; (b) the browser's `Accept-Language`; (c) a choice on the page | **(a) now.** The menu is in the truck's language, so a page in the same language reads as one piece. Later, (b) limited to languages HatchGrab ships, plus (c) as a small picker. Keep the fixed text short so a mixed page still reads well. |
| **Customer emails, WhatsApp replies, SMS** | truck's language, or the customer's | **The language the order was placed in.** Store `orders.language` when the order is submitted, from the day customer choice exists; until then it equals the truck's. Emails are rendered on the server, so they need the language passed in, never read from a browser. |
| **Kitchen: tickets, KDS, dashboard, push to staff, Manage** | truck's, or per device or user | **The truck's language.** A per-device or per-user override is a later nicety; a team member's language is the only real case. |
| **Marketing pages** | visitor country, or URL | **URL first** (`/` UK, `/us/` US), with the visitor's country choosing the redirect. That gives search engines one language per URL. |
| **Menu content** | n/a | **Never translated by us.** Fix the four assumptions listed at the end of §2d. |
| **Stored labels** (allergens, dietary, cuisines) | migrate to codes, or treat the English label as the key | **Treat the stored English label as the key**, translated for display through the catalogue (`allergen.Dairy` → "Lait"). No data change, and US labels ("Milk") are already their own keys. Do the same for 'Walk-up' and the reason labels: keep them as keys and translate at display. |

---

## 4 · Recommendation

### 4.1 The approach: next-intl or a home-grown catalogue

| | **next-intl** (no-URL-routing mode) | **Home-grown catalogue** (typed TS objects + `t()`) |
|---|---|---|
| Server components | `getTranslations()`; messages stay on the server | easy; plain import |
| Client components | `useTranslations()` under `NextIntlClientProvider`, sending only the namespaces a page needs | easy, but needs a context to pick the language (the existing `CountrySettingsProvider` would do) |
| Emails, PDFs, API errors, tickets, crons (no request or React) | `createTranslator({ locale, messages })`, a plain function usable anywhere | easy |
| Plurals, select, rich text (bold, links inside a sentence) | **ICU MessageFormat built in**: `{n, plural, one {# item} other {# items}}`, `<b>…</b>` tags in messages. Solves about 230 joined sentences and about 80 hand plurals properly. | Would have to be written: `Intl.PluralRules` is easy, rich text and select are more work, and translators would get a home-made syntax |
| Dates and numbers | its own formatters, but **we would keep `lib/time-utils` and `lib/money-format`** (already right) and pass pre-formatted strings into messages | the same |
| Bundle size | small runtime (about 15–20 KB gzipped with the ICU parser), plus only the namespaces sent to each page. Messages can be precompiled. | close to zero |
| Translator workflow | JSON ICU, which Crowdin, Lokalise and Phrase read directly | custom export needed |
| Type safety | typed keys via module augmentation (missing key = compile error) | typed keys natively |
| UK byte-identical | yes, if apostrophes are handled: in ICU a `'` next to `{` or `}` is an escape character, so the parity harness must render every message | yes |
| Fit with the existing country copy modules | `addressPlaceholders`, `allergens` and the prompt lines become message keys selected by `address_format` / `allergen_set` inside the en-GB / en-US files; the data-driven ones (phone example, tax label, short name) stay data passed as parameters | the same |
| URL routing for marketing hreflang | available when wanted (`/us/…`) | build it |

**Recommendation: next-intl.** Reasons:
1. The two hard problems in this codebase are sentences built from pieces and hand-written plurals. ICU solves both, and a home-grown catalogue would end up re-implementing ICU.
2. It works the same way in server components, client components and plain server code (emails, PDF, API, tickets). This product renders a lot of text in places with no React context.
3. Translators and their tools read its files directly.
4. It needs no URL changes for the app. The truck's language comes from data, as today's country settings do.

**How the files layer:**
- `messages/en-GB.json` is the full base.
- `messages/en-US.json` holds **only the keys that differ** (about 200 entries) and is deep-merged over en-GB when loaded. A missing US key therefore shows the UK text, never a raw key.
- Later languages are full files, checked for completeness in CI.

### 4.2 Phased plan (each phase proves UK output byte-identical)

The proof method is the one this codebase already uses. Before each area moves:
- capture every rendered string of it (pages rendered from fixtures, emails, tickets as bytes, server responses, PDF HTML);
- afterwards compare byte for byte, as `money-sweep-parity` and `marketing-country-parity` do.

| Phase | What | Files touched (approx.) | Strings |
|---|---|---:|---:|
| **0 · Foundations** (no visible change) | Install next-intl; language resolver (truck → country locale → en-GB); provider in the order, dashboard, KDS and Manage layouts; `createTranslator` helper for server code; parity harness skeleton; lint rule. **Separate keys from labels:** plan-row ids, 'Coming soon' / 'Free' / 'Pay at Hatch' price words, 'Walk-up', `PRIVATE_TYPE_NAME`, the 'Other' bucket, `/mo` parsing, contact topics. Move `lib/weekly-post/locale.ts` onto `Intl.formatToParts` (byte-identical for GB and US). Merge the three ordinal implementations and remove the 10 month/day arrays. | about 25 | — |
| **1a · Customer-facing** | Order page, confirmation, order status/manage, private-link page, `ChargeRows` / `order-charge-lines`, sold-out and refusal copy, pre-order labels, `phone.ts` sentences; **customer emails and subjects**; WhatsApp customer replies; customer-facing server errors (`orders/*`, `payments/*`, `menu`, `slots`) | about 45 | about 900 |
| **1b · Kitchen** | Dashboard, KDS, `components/dashboard/*`, shared modals, **printed ticket headings** (ticket bytes byte-identical), printing settings, native components, push titles, operator emails and alerts, `api/dashboard/*`, `api/printing`, `api/native` | about 65 | about 1,500 |
| **1c · Onboarding** | Setup wizard, signup, login, password and verify pages, demo (`DemoGetStarted`, demo templates as keyed data), go-live checks, walkthrough, auth and demo APIs, signup emails | about 35 | about 550 |
| **1d · Manage** | `app/manage/[token]/page.tsx` (by tab), `components/manage/*`, every `lib/copy/*` module, settings-copy, custom-domain and private-events copy, weekly-post captions and poster words, manage, weekly-post, event-types and events APIs | about 95 | about 3,400 |
| **1e · Marketing** | Landing, features, compare, plans PDF, footer and nav, legal page chrome | about 20 | about 520 |
| **2 · en-US** | `messages/en-US.json` (about 200 overrides, from the §4.4 table). Plus the behaviour fixes no message file can do: 12-hour hour picker, ZIP labels and placeholders, the per-country date part of the paste example, demo provisioned in the visitor's country, demo save date, raw ISO dates, the "Monday to Sunday" week start, the UK-only time fallback, cost calculator `smallFeeLabel`, A4 → Letter for US PDFs and table cards, a US App Store link, US screenshots and testimonial. | about 30 code + 1 messages file | about 200 keys |
| **3 · Each later language** | Translation file (about 5,000 unique strings, about 43,000 words). Once only: `<html lang>` per page; hreflang and per-country marketing URLs; `latin-ext` font subsets; AI prompts told which language to answer in and to keep the menu's own language; **WhatsApp allergen floor made Unicode-aware with stems per language (safety)**; ticket accents (option B), or raster printing for non-Latin scripts; poster fallback fonts; native `Info.plist` / `strings.xml` localisations; localised store badges; width review of the tight layouts in §2c. Right-to-left languages are a separate project. | about 15 once, then 1 file per language | 5,000 |

### 4.3 What US English needs before the first US truck

**Before the first US truck** (phases 0, 1a and 1b, plus phase 2 for those areas, plus the onboarding items below):
- **Checkout and order pages:** cart, pickup, window, "Setup pending", authorized, canceled, "you have not been charged", "Partially paid / still due", the phone error ("Please enter a valid phone number (e.g. (201) 555-0123)"), pre-order labels in 12-hour US date order.
- **Customer emails, including subjects:** pickup, window, canceled, authorized, partially paid.
- **Printed ticket:** "PICKUP …", "DO NOT CHARGE".
- **Dashboard and KDS:** "Mark paid & picked up", "Picked up", "Pickup times", card reader, takings → sales, van → truck, 💵.
- **Setup wizard and onboarding:** ZIP code labels and placeholders, "City or town", the 12-hour hour picker, .com placeholders, demo created in the visitor's country, demo save date, "Getting started".
- **Server errors a US truck will hit:** "Unauthorized", the pickup-time errors.

**Can wait:**
- spellings in Manage's design editor (color, center, favorite);
- Manage wording that is clear even if British (tick, tidy up, carry on);
- poster heading "Week commencing" and "No trading today" (operators can edit both today; change the defaults with phase 2);
- marketing idioms, until US marketing is switched on (and the SEO URL work with it);
- Village Foodie discovery pages (UK-only product);
- every other-language hazard in §2c.

### 4.4 Plain-words table for approval: UK → US (one row per distinct word or phrase)

| # | Current UK | Proposed US | Seen by |
|---:|---|---|---|
| 1 | basket | cart | customer |
| 2 | collection time | pickup time | customer, operator, ticket |
| 3 | collect / collected (the customer picks up) | pick up / picked up | customer, operator |
| 4 | "Pay at the truck on collection" | "Pay at the truck at pickup" | customer |
| 5 | "ready for collection — come and collect" | "ready for pickup — come pick it up" | customer email |
| 6 | "Mark paid & collected" / "Cash & collected" | "Mark paid & picked up" / "Cash & picked up" | operator |
| 7 | collect (take money): "Nothing to collect", "Extra to collect", "DO NOT COLLECT" | charge: "Nothing to charge", "Extra to charge", "DO NOT CHARGE" | operator, ticket |
| 8 | COLLECT {time} / COLLECT ASAP | PICKUP {time} / PICKUP ASAP | ticket |
| 9 | at the hatch / "See you at the hatch!" | at the window / "See you at the window!" | customer, operator |
| 10 | "Pay at Hatch" (plan feature name) | **Dominic decides:** keep as a brand term, or "Pay at the Window" | public, operator |
| 11 | van / vans / "Van 1" | truck / trucks / "Truck 1" | operator |
| 12 | postcode | ZIP code | operator |
| 13 | "Area (village, town or city)" | "City or town" | operator |
| 14 | mobile (phone number) | phone (cell phone where needed) | customer, operator |
| 15 | mobile coverage | cell service | public |
| 16 | mobile catering | catering | public |
| 17 | pitch / pitching up | spot / popping up | public, customer share text |
| 18 | queue (of people) | line | public, operator |
| 19 | till | cash register | operator |
| 20 | takings | sales | operator |
| 21 | card machine | card reader | operator, public |
| 22 | contactless | tap to pay | operator |
| 23 | trading / trade (operating) | serving / operating | operator, public |
| 24 | "No trading today" | "Closed today" | customer (poster) |
| 25 | "Week commencing {start} to {end}" | "Week of {start}" | customer (poster) |
| 26 | car park | parking lot | operator |
| 27 | pub (event type, examples) | bar / brewery | operator |
| 28 | Private hire | Catering | operator |
| 29 | school fete | school fair | operator |
| 30 | starters / mains | appetizers / entrées | operator, demo |
| 31 | tick / untick / tickbox | check / uncheck / checkbox | operator |
| 32 | meal deals | combos | customer, public |
| 33 | TBC | TBD | customer, operator, public |
| 34 | enquiry | inquiry | public |
| 35 | organiser | organizer | customer |
| 36 | Part paid | Partially paid | customer email |
| 37 | still to pay | still due | customer email |
| 38 | no money has been taken | you have not been charged | customer |
| 39 | Worked out (on the food) | Calculated (on the food subtotal) | customer |
| 40 | Set-up pending | Setup pending | customer |
| 41 | Fancy some {food}? | Craving some {food}? | customer share text |
| 42 | Hire a food truck | Book a food truck | public |
| 43 | have a play (around) | try it out | operator, prospect |
| 44 | have a look / look round | take a look / look around | operator, prospect |
| 45 | to hand / haven't got | handy / don't have | prospect |
| 46 | straight away / straight back | right away / right back | operator |
| 47 | we'll sort it | we'll fix it | operator |
| 48 | carry on | continue / keep going | operator |
| 49 | tidy up | clean up | operator |
| 50 | Getting going | Getting started | public |
| 51 | drop us a message | send us a message | operator |
| 52 | fill in the form | fill out the form | public |
| 53 | come back to you | get back to you | public |
| 54 | the lot | everything | public |
| 55 | "Do you do {x}?" | "Do you have {x}?" | operator (preview) |
| 56 | needs {x} adding | needs {x} added | operator email |
| 57 | public liability cover | general liability insurance | public |
| 58 | Rocket / Garden Veg / Pilau Rice / Fruit & veg / Jacket Potatoes | Arugula / Garden Veggie / Pulao Rice / Fruits & veggies / Baked Potatoes | demo, operator |
| 59 | yourtruck.co.uk | yourtruck.com | operator, prospect |
| 60 | 💷 | 💵 | operator |
| 61 | cancelled / cancelling / CANCELLED | canceled / canceling / CANCELED ("cancellation" unchanged) | customer, operator |
| 62 | authorised / authorising / authorisation | authorized / authorizing / authorization | customer, operator |
| 63 | Unauthorised / Unrecognised | Unauthorized / Unrecognized | operator |
| 64 | colour / coloured | color / colored | operator |
| 65 | centre | center | operator, public |
| 66 | favourite | favorite | operator |
| 67 | organise(d) | organize(d) | public |
| 68 | analyse, categorise, customise, recognise, digitise (all forms) | analyze, categorize, customize, recognize, digitize | operator |
| 69 | licence (noun) | license | operator |
| 70 | grey / greys out | gray / grays out | operator, public |
| 71 | "Saturday 14th June" | "Saturday, June 14" | operator, customer |
| 72 | "Sat 27 Jun" / "Tue 1 Sep" | "Sat, Jun 27" / "Tue, Sep 1" | customer, operator |
| 73 | "1 October 2026" | "October 1, 2026" | operator, public |
| 74 | "5pm-9pm" / 17:00–21:00 | "5–9 PM" / 5:00 PM – 9:00 PM | operator, customer |
| 75 | "Monday to Sunday" | "Sunday to Saturday" (follow the week start) | operator |
| 76 | 30p / "Pence per order" | 30¢ / "Cents per order" | public |
| 77 | A4 | Letter | prospect PDF, printed table cards |

Not on the table because they need no change: walk-up, buzzer, street food, pop-up, "order ahead", miles, "Hi there", "5 to 10 business days", "Uncategorized" (already US), and every money amount, tax name and time already formatted from the country's settings.

Not wording, so Dominic decides separately: "as UK law requires" (legal), the Pizzeria Gusto testimonial for US visitors, and the "Village Foodie" credit on HatchGrab pages.

### 4.5 Rules for new code from today, so the job doesn't grow

1. **No new user-facing text written inline.**
   - Until the framework lands, new copy goes in a `lib/copy/*` module as a whole sentence.
   - After it lands, it goes only in `messages/en-GB.json`, enforced by a lint rule (e.g. `react/jsx-no-literals` set to fail on new files and changed lines).
2. **Whole sentences only.** Never build a sentence from pieces (`'Only ' + n + ' left'`, prefix and suffix around a control, bold words split out). Use one message with placeholders (and rich-text tags once ICU is in).
3. **No hand-written plurals.** No `n === 1 ? … : …` and no added `'s'`. Use `Intl.PluralRules` now, and ICU `plural` later.
4. **No case changes on text.** No `toUpperCase` / `toLowerCase` / `cap()` on translatable or user text. CSS `uppercase` only on short labels, and never on the truck's own data (category names, plan ids).
5. **Dates, times, numbers and money only through** `lib/time-utils.ts` and `lib/money-format.ts` with the truck's settings. No `'en-GB'` literal, no month or day arrays, no ordinals by hand, no `toFixed` for display, no currency symbol joined by hand.
6. **Display text is never a key.** Compare ids, codes or enum values, never words ('Walk-up', 'Coming soon', row names).
7. **Servers send codes and values; screens supply the words.** New API errors return `{ code, params }` with an English fallback. Never put a sentence in a URL.
8. **Store codes, not sentences.** No new English sentence in a database row that a customer later sees.
9. **Leave room for longer text.** No new fixed pixel widths, `nowrap` or `truncate` on button labels or headings without checking the text at 130% length.
10. **AI prompts state the output language** and keep the menu's own language. New prompts take the truck's language as a parameter.
11. **Words that work in both countries are preferred in new copy** where they read naturally ("truck" not "van"; "pickup" where the UK text would otherwise be new). UK text that already exists stays byte-identical until its phase.

---

## Appendix · Facts worth keeping

- **No language column exists.** US English needs none: the country's `locale` already says en-GB or en-US.
- **No SQL is proposed by this audit.** A `trucks.language` column (nullable) and an `orders.language` column would come with phase 3 or the customer-choice step. They would be written then, marked "run after deploy".
- **Admin-only screens, legal Markdown and `outreach_templates` rows are excluded.** Legal Markdown is listed in the Phase 3–6 audit, Part 6.
- **Files that reference `outreach_templates`:**
  - `app/api/admin/outreach-templates/route.ts`
  - `app/api/admin/outreach-snippets/route.ts`
  - `components/admin/TemplatesPanel.tsx`
  - `lib/outreach-snippets.ts`
  - `lib/outreach-template-render.ts`

  Meta WhatsApp templates default to `language 'en_GB'` (`app/admin/whatsapp-templates/page.tsx:54`, `lib/meta-whatsapp.ts`). A US WhatsApp sender would need `en_US` templates approved by Meta.
- **The US cannot be switched on for marketing yet.** The US plan prices in the live database are null (recorded in the sweep report).
