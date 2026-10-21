# anz-1 — Australia and New Zealand, built switched OFF

**Date:** 21 October 2026 · **Branch:** main (on top of `4633801c`; uncommitted; nothing pushed or deployed) · **Australia
and New Zealand stay switched OFF.** No database change was made: every change is below as NOT RUN SQL.

## ⚠️ First: four things to know

1. **The country rows can't be run "now". Only the CHECK change can.** The brief marks the AU/NZ rows "run now". But the
   live code (HEAD) refuses `allergen_set = 'anz'`: `lib/country-settings.ts` `mapCountryRow` allows only
   `uk14`/`us9`. The live country menu and sign-up list map **every** row, enabled or not, through that function. So an
   `anz` row inserted before this code is deployed would make those pages throw for everyone. I split the SQL in two:
   - **Block A, "run now":** widen the CHECK constraint. It is harmless, because no row holds `anz` yet.
   - **Block B, "run after deploy":** the AU/NZ rows and their six prices.

   If you'd rather run the rows now, say so. That would need a two-step version: insert them with `uk14`, then update
   them to `anz` after the deploy. I didn't choose that for you.
2. **The IE rows are now live, switched off.** ireland-1 found them missing. Today's read-only queries (§8) show
   `country_settings` IE (`enabled = false`, `updated_by = 'europe-readiness draft'`) and three IE `plan_prices` rows.
   /ie still 302s to /uk, so nothing visible changed.
3. **KDS and kitchen tickets show no allergens, for any country.**
   - This is a recorded decision, not a gap. `lib/printing/ticket.ts:30` says "ALLERGENS ARE NOT PRINTED, AND THAT IS A
     DECISION, NOT AN OMISSION". The KDS (`app/kds`) has no allergen field at all.
   - The brief asks for anz allergens "on the KDS and ticket". The proof therefore covers Manage, the order page and the
     prompts, and shows the KDS and ticket unchanged (§1.4).
   - Adding allergens there would reverse that decision for every country. I haven't done it.
4. **The WhatsApp guard follows the classifier's documented "Option B".** Option B redirects absence and safety
   questions ("gluten free?", "I'm allergic…") to the allergen reply. Presence questions ("does the satay have
   peanuts?") still reach the AI, which answers from the tags. The AU/NZ additions are safety phrasing only: EpiPen,
   epi-pen, anaphylaxis, anaphylactic, and the NF/LF menu marks. An earlier draft also caught bare allergen names
   ("peanut", "nut", "sesame"); I removed that because it broke Option B (§6).

Nothing in the brief arrived garbled. No instruction contradicted another, apart from the timing in point 1, which is a
fact about the live code rather than two instructions clashing.

## Summary

- **Allergens:** a new set, `anz`, holds the Food Standards Code list as **23 flat entries**: wheat, barley, rye, oats,
  milk, egg, fish, crustacean, mollusc, sesame, lupin, soy, peanut, added sulphites, and the nine tree nuts named one
  by one. No celery or mustard.
  - The existing flex-wrap layouts take it as it is, so no mockup was needed.
  - **uk14 and us9 are byte-identical to HEAD on every surface**, proved against HEAD and pinned in the harness.
- **Addresses:** `/au` and `/nz` exist. While a country is off or has no row, its pages 302 to /uk and it gets no
  hreflang, sitemap entry or menu link.
- **On (fixtures):**
  - prices: A$39/A$99 and NZ$49/NZ$119;
  - "per truck / month incl. GST";
  - cheapest bands solved from the data: AU 3,900/11,600, NZ 4,900/14,100;
  - footnotes: "1.65% + 30c in Australia" and "2.65% + 30c in New Zealand";
  - hreflang en-AU/en-NZ, reciprocal; sitemap entries; JSON-LD in AUD/NZD; AU/NZ hero screenshots.
- **Words:**
  - **en-NZ** overrides 25 keys: EFTPOS, "site" not "pitch", GST, cents, "Pay at the truck". NZ keeps "collect".
  - **en-AU** overrides those same 25 plus 85 "pick up" keys (110 in all).
  - **"Pay at the truck"** is now in en-US, en-IE, en-AU and en-NZ. en-GB keeps "Pay at Hatch".
  - The live US change is exactly the diff in §4.3.
- **eftpos:** online holds need no server change, because Stripe always sends a held payment over Visa or Mastercard.
  Stripe's required dual-network notice now shows on **Australian (AUD) checkouts only**. One thing must be tested
  before AU launch: Apple Pay with eftpos (§5).
- **Stripe Connect:** onboarding already passes the truck's own country. I made no code change. You have a checklist
  of what to confirm in test mode and in the Dashboard (§7).
- **Checks:** tsc clean; `next build` passes; no new lint errors; `scripts/anz-1.cjs` **76/76**; full sweep **146 of 147 passed**, and the one failure (`add-order-refresh-inputs`, a timing harness that took 2,128 s instead of ~215 s that run) **passed in the first sweep and again alone** (§Proof). The production build matches the live site for /uk and /us except the one approved US sentence.

---

## 1 · Allergens (item 1)

### 1.1 The list

`lib/allergens.ts`:

```ts
export type AllergenSet = 'uk14' | 'us9' | 'anz'
export const ANZ = ['Wheat', 'Barley', 'Rye', 'Oats', 'Milk', 'Egg', 'Fish', 'Crustacean', 'Mollusc', 'Sesame', 'Lupin', 'Soy', 'Peanut',
  'Added sulphites', ...ANZ_TREE_NUTS]   // Almond, Brazil nut, Cashew, Hazelnut, Macadamia, Pecan, Pine nut, Pistachio, Walnut
```

- **"Added sulphites"** is the label, because the Code requires declaration only at ≥ 10 mg/kg. The import prompt
  tells the AI to tag it only when sulphites are *added* or stated.
- **Cereals** are named one by one (wheat, barley, rye, oats). That is the Code's form, rather than "Gluten".
- **A flat list fits.** Every surface already lays allergens out as a flex-wrap row of pills:
  - Manage → item → allergens;
  - Manage → extras → option;
  - the allergen wizard and import steps;
  - the order page's per-dish chips.

  The wizard's table sizes itself from the list's length. 23 entries wrap to 3–4 rows on a phone, as uk14's 14 wrap
  to 2–3. **No layout change and no mockup.**

### 1.2 Where it is added

| Place | Change |
|---|---|
| Constraint `country_settings_allergen_set_chk` | NOT RUN SQL, block A (§8) |
| `lib/country-settings.ts`, `lib/country-settings-types.ts`, `lib/admin/country-form.ts` | `'anz'` accepted. Countries tab choice "ANZ 23" (`components/admin/CountriesTab.tsx`) |
| Lists: `allergenVocab`, `ALLERGEN_SETS` | `anz` → `ANZ` |
| Wizard, menu editing, extras (`components/manage/primitives.tsx` `useAllergenVocab`, `app/manage/[token]/page.tsx`) | Unchanged code. They already read the truck's set, so an AU/NZ truck gets the 23 |
| "Generic → specific" refinement (`genericReplacements('anz')`) | Nuts → 9 tree nuts + Peanut; Tree nuts → the 9; Gluten → Wheat/Barley/Rye/Oats; Shellfish → Crustacean/Mollusc; Crustaceans → Crustacean; Molluscs → Mollusc; Dairy → Milk; Eggs → Egg; Peanuts → Peanut; Soybeans → Soy; Sulphites → Added sulphites |
| Menu-import prompt (`lib/menu-extract.ts`) | `menuExtractAllergenLines/Example('anz')`. The prompt's worked examples are relabelled for anz by `localiseExampleAllergens`: Crustaceans → Crustacean, Dairy → Milk, etc. |
| Allergen-card prompt (`app/api/manage/process-allergens/route.ts`) | anz list lines, closing rule, example. The `free_from`/`blanket` examples now come from the set; uk14/us9 keep their own literals |
| Order page | Unchanged. Chips print the stored label (`components/MenuAllergenChips.tsx`) |
| WhatsApp guard and caveat | §6 |
| **KDS and tickets** | **No allergens are shown there for any set**, before or after (§1.4) |

### 1.3 uk14 / us9 byte-identity: proof

A one-off script compiled HEAD's `lib/allergens.ts`, the HEAD card-prompt template and HEAD's WhatsApp guard, plus the
working tree's versions. It compared every output for `uk14`, `us9`, `null` and `undefined`:

```
✓ uk14|us9|null|undefined: allergenVocab, genericReplacements, menuExtractAllergenLines, menuExtractAllergenExample,
  allergenCardListLines, allergenCardClosingRule, allergenCardExample (HEAD fields)          — 28 identical
✓ uk14: process-allergens card prompt (whole text, 2857 chars)   ✓ us9: (2861 chars)   ✓ null / undefined: (2857)
✓ uk14|us9|null|undefined: localiseExampleAllergens is a no-op (the whole menu-extract source as input)
✓ uk14|us9|null|undefined: WhatsApp guard on 20 messages
✅ all identical
```

- The seven helper outputs are **pinned as hashes** in `scripts/anz-1.cjs` §5, so a later change to uk14/us9 output
  fails the sweep.
- The harness also renders Manage's allergen toggles for a GB and a US truck. They are exactly `UK_14` and `US_9`, in
  order.

### 1.4 What each AU/NZ surface shows

| Surface | AU / NZ fixture truck | Proof |
|---|---|---|
| Manage → item → allergens (toggles) | the 23, in Code order, flat; selected ones amber | harness §5: real `AllergenToggles` in `CountrySettingsProvider` |
| Order page, per-dish chips | e.g. "Peanut · Macadamia · Wheat · Soy · Added sulphites" | harness §5: real order page, state-patched |
| Menu-import and allergen-card prompts | anz names only | harness §5 |
| KDS (`app/kds`), dashboard card | no allergen field (no `allergen` anywhere in `app/kds`) | unchanged, same as GB/US |
| Kitchen ticket (`lib/printing/ticket.ts`) | no allergens, by recorded decision ("Do not add allergens here"); the customer's typed note prints in full | unchanged, same as GB/US |

## 2 · Country rows (item 2)

The exact SQL is in §8 (NOT RUN). Values:

| | AU | NZ |
|---|---|---|
| currency · locale | AUD · en-AU | NZD · en-NZ |
| tax | prices include tax, label **GST** | same |
| date · time · week · distance | dmy · 12h · Monday · km | same |
| allergen_set · short_name | anz · Australia | anz · New Zealand |
| phone | +61, example `0412 345 678`, check `length` | +64, example `021 123 4567`, check `length` |
| timezones (default first) | **Australia/Sydney**, Melbourne, Brisbane, Adelaide, Darwin, Perth, Hobart | **Pacific/Auckland**, Pacific/Chatham |
| card fees online · in person · Tap to Pay | 1.65% + 30c · 1.65% + 10c · +15c | 2.65% + 30c · 2.6% + 5c · +15c |
| card_fee_region_label | "Australian cards" | "New Zealand cards" |
| surcharges · service fee · tipping | off · not allowed · off | same |
| address_format | `postcode` (below) | `postcode` |
| plan_prices payg / pro / unlimited | A$0 (0.99%) / A$39 incl. A$5,500, 0.99% / A$99, no fee; extra van = the plan's price | NZ$0 / NZ$49 incl. NZ$7,000, 0.99% / NZ$119, no fee |

- **The retired plan columns** (starter/pro/max monthly and allowance, platform_fee_pct) are NULL, like the IE row. The
  competitor and support-hours columns are NULL too.
- `service_fee_recipient` is 'truck' and `platform_fee_enabled`/`fees_taxed` are false, all the defaults.
- **The insert was checked against the live schema** (read-only queries 1–2): 50 columns, 50 values per row, and every
  CHECK satisfied.
- **Both example numbers pass the app's phone check** (`isPlausiblePhone(…, 'length')`; harness §8).

**Address format: `postcode` is the best existing value. Here is a proposal for later.**
- The only values are `postcode` (GB shape: a free street line plus a postcode) and `zip_state` (US: city, state, ZIP).
  NZ addresses have no state, so `postcode` is right for NZ.
- Australian addresses are written "Parramatta NSW 2150", with a state. With `postcode`, Schedule's address fields
  ask for the postcode but have no state field. The venue line and the map pin still work, because the AI import and
  the geocoder read the whole address text.
- **Proposed new value: `postcode_state`.** It would be suburb, a state picked from a list (NSW, VIC, QLD, SA, WA, TAS,
  NT, ACT), and a 4-digit postcode. It needs:
  - a CHECK change;
  - the placeholder words (`lib/copy/addressPlaceholders`);
  - `lib/event-address.ts` normalisation.

  That is a small, separate stage, worth doing before AU is switched on. I didn't build it, because the brief said "or
  propose".

**The "incl. GST" nuance.** The pages now say "incl. GST" because `prices_include_tax = true` and the label is GST.
- **HatchGrab is a UK company and isn't registered for Australian or New Zealand GST.** Sales to GST-registered
  businesses are generally outside the non-resident GST rules. Only sales to unregistered customers count towards the
  A$75,000 / NZ$60,000 thresholds.
- So "incl. GST" may be a claim we can't back with a tax invoice. Please check with your accountant before AU/NZ go on.
- The words live only in en-AU/en-NZ: `pricing.card.perTruckMonth`, `pricing.footnote`, `compare.plan.summary` and
  `compare.plan.summaryNoFee`. Removing "incl. GST" is a four-string change, with no code.

## 3 · Addresses (item 3)

`lib/marketing-country.ts:30`: `COUNTRY_PATH_SEGMENTS = { GB: 'uk', US: 'us', IE: 'ie', AU: 'au', NZ: 'nz' }`. The router,
hreflang, sitemap, menu and `[country]` routes already read the switched-on rows plus this table.

| | Off, or no row (live) | On (fixture) |
|---|---|---|
| `/au`, `/nz/features?free=2` | **302** → `/uk`, `/uk/features?free=2` | 200 |
| Router with an AU / NZ IP | 302 → `/uk` | 302 → `/au` / `/nz/compare` |
| Sitemap | no /au, /nz | /au, /au/features, /nz, /nz/features, each with five alternates |
| hreflang on /uk, /us | en-GB, en-US, x-default (unchanged) | + en-AU → /au, en-NZ → /nz, reciprocal on all four |
| Country menu | unchanged | + Australia → /au, New Zealand → /nz |
| The page itself, if reached past the proxy | redirects to /uk; never throws with no row | renders |

## 4 · Wording (item 4)

### 4.1 Locales

- `lib/i18n/locales.ts` now has `LOCALES = ['en-GB', 'en-US', 'en-IE', 'en-AU', 'en-NZ']`.
- `lib/i18n/messages.ts` adds both overrides.
- `scripts/split-messages.cjs` makes them sparse, like en-IE: a namespace file only where something is overridden.
  - en-AU has 33 namespace files and en-NZ has 10.
  - `split-messages --check` is clean.

### 4.2 Every override

- **en-NZ** (25 keys) is minimal:
  - EFTPOS for the card machine;
  - "site" for "pitch";
  - "Cents per order";
  - the "in {country}" frames, as en-IE has;
  - GST on the price lines;
  - "Pay at the truck".
- **en-AU** has the same 25, plus "pick up" for the customer-collection sense of "collect". It does not change the
  money sense of "collect":
  - `dashboard.edit.extraToCollect`, `ticket.doNotCollect`;
  - `orderCard.refundedTitle`, `orderCard.partRefundedTitle`, `orderCard.cardHeldTitle`;
  - `nativeShell.gate.paymentNotRecorded`, `legalChrome.meta.privacyDescription`;
  - `featuresPage.detail.loyalty_stamp_cards` ("stamps collected") keeps en-GB.


#### en-NZ — 25 keys

| Key | en-GB | en-NZ |
|---|---|---|
| `addOrder.confirmedToast` | Order #{id} confirmed{paid, select, cash { — paid in cash} card { — paid on your card machine} other {}} | Order #{id} confirmed{paid, select, cash { — paid in cash} card { — paid on your EFTPOS machine} other {}} |
| `addOrder.savedToast` | Order {id} saved{paid, select, cash { — paid in cash} card { — paid on your card machine} other {}} | Order {id} saved{paid, select, cash { — paid in cash} card { — paid on your EFTPOS machine} other {}} |
| `compare.anchor.festivalPitches` | That’s a couple of festival pitches. | That’s a couple of festival sites. |
| `compare.anchor.weekendPitch` | That’s a weekend pitch at a food festival. | That’s a weekend site at a food festival. |
| `compare.breakdown.card` | Card processing — Stripe’s {fee} per order, paid to Stripe. You’d pay much the same on a card machine at the window. | Card processing — Stripe’s {fee} per order, paid to Stripe. You’d pay much the same on an EFTPOS machine at the window. |
| `compare.days.help` | Events, markets, pitches — any day the van’s out. | Events, markets, sites — any day the van’s out. |
| `compare.fee.fixedAria` | Pence per order | Cents per order |
| `compare.plan.summary` | {price} per truck per month, with {allowance} of online orders included{fleet, plural, one {} other { on each}}. | {price} per truck per month incl. GST, with {allowance} of online orders included{fleet, plural, one {} other { on each}}. |
| `compare.plan.summaryNoFee` | {price} per truck per month, with unlimited online orders and no HatchGrab fee. | {price} per truck per month incl. GST, with unlimited online orders and no HatchGrab fee. |
| `featuresPage.detail.tap_to_pay` | Take card payments on a supported phone, so you don’t need a separate card machine. | Take card payments on a supported phone, so you don’t need a separate EFTPOS machine. |
| `featuresPage.detail.walkup_orders` | Take and manage orders at the hatch, paid on your own card terminal. | Take and manage orders at the hatch, paid on your own EFTPOS terminal. |
| `landing.does.devicesBody` | Runs on the phone in your apron, the tablet on the counter, the laptop in the van — and the card machine you already take payment on. | Runs on the phone in your apron, the tablet on the counter, the laptop in the van — and the EFTPOS machine you already take payment on. |
| `landing.does.whatsappBody` | “Where are you tonight?” “What desserts do you have?” Your WhatsApp gets answered while you’re driving to the pitch or at the grill, using your own menu and schedule. Messenger and Instagram coming soon. | “Where are you tonight?” “What desserts do you have?” Your WhatsApp gets answered while you’re driving to the site or at the grill, using your own menu and schedule. Messenger and Instagram coming soon. |
| `landing.does.whatsappSoonBody` | “Where are you tonight?” “What desserts do you have?” Soon your WhatsApp will get answered while you’re driving to the pitch or at the grill. Messenger and Instagram to follow. | “Where are you tonight?” “What desserts do you have?” Soon your WhatsApp will get answered while you’re driving to the site or at the grill. Messenger and Instagram to follow. |
| `landing.jsonLd.description` | Ordering, pre-orders and a kitchen screen for {country} food trucks and mobile catering. | Ordering, pre-orders and a kitchen screen for food trucks and mobile catering in {country}. |
| `landing.meta.description` | Take orders and pre-orders from your pitch without the queue. Ordering and kitchen-screen software for {country} food trucks and mobile catering — not a POS. | Take orders and pre-orders from your site without the queue. Ordering and kitchen-screen software for food trucks and mobile catering in {country} — not a POS. |
| `managePayments.walkUp.hatchgrabHelp` | Uses the same Stripe connection as your online payments — a card reader, or contactless straight from your phone or tablet. | Uses the same Stripe connection as your online payments — an EFTPOS reader, or contactless straight from your phone or tablet. |
| `managePayments.walkUp.ownTerminal` | Your own card terminal | Your own EFTPOS terminal |
| `paymentActions.inPersonHint` | Cash or your card machine — not recorded | Cash or your EFTPOS machine — not recorded |
| `paymentActions.paidCardMachine` | Paid on your card machine{mixed, select, yes { — {amount}} other {}} | Paid on your EFTPOS machine{mixed, select, yes { — {amount}} other {}} |
| `planFeatures.priceWord.payAtHatch` | Pay at Hatch | Pay at the truck |
| `planPrompt.features.online_ordering_pay_at_hatch.name` | Pay at Hatch ordering | Pay-at-the-truck ordering |
| `pricing.card.perTruckMonth` | per truck / month | per truck / month incl. GST |
| `pricing.footnote` | * Plus Stripe’s card processing on online card orders (currently {cardFee} in the {country}), paid to Stripe, not HatchGrab. Walk-up orders use your own card reader — HatchGrab charges 0%. | All prices include GST. * Plus Stripe’s card processing on online card orders (currently {cardFee} in {country}), paid to Stripe, not HatchGrab. Walk-up orders use your own EFTPOS machine — HatchGrab charges 0%. |
| `truckPage.shareText` | Check out where {truck} is pitching up next! 🚚 | Check out where {truck} is setting up next! 🚚 |

#### en-AU — 110 keys

| Key | en-GB | en-AU |
|---|---|---|
| `addOrder.confirmedToast` | Order #{id} confirmed{paid, select, cash { — paid in cash} card { — paid on your card machine} other {}} | Order #{id} confirmed{paid, select, cash { — paid in cash} card { — paid on your EFTPOS machine} other {}} |
| `addOrder.savedToast` | Order {id} saved{paid, select, cash { — paid in cash} card { — paid on your card machine} other {}} | Order {id} saved{paid, select, cash { — paid in cash} card { — paid on your EFTPOS machine} other {}} |
| `compare.anchor.festivalPitches` | That’s a couple of festival pitches. | That’s a couple of festival sites. |
| `compare.anchor.weekendPitch` | That’s a weekend pitch at a food festival. | That’s a weekend site at a food festival. |
| `compare.breakdown.card` | Card processing — Stripe’s {fee} per order, paid to Stripe. You’d pay much the same on a card machine at the window. | Card processing — Stripe’s {fee} per order, paid to Stripe. You’d pay much the same on an EFTPOS machine at the window. |
| `compare.days.help` | Events, markets, pitches — any day the van’s out. | Events, markets, sites — any day the van’s out. |
| `compare.fee.fixedAria` | Pence per order | Cents per order |
| `compare.plan.summary` | {price} per truck per month, with {allowance} of online orders included{fleet, plural, one {} other { on each}}. | {price} per truck per month incl. GST, with {allowance} of online orders included{fleet, plural, one {} other { on each}}. |
| `compare.plan.summaryNoFee` | {price} per truck per month, with unlimited online orders and no HatchGrab fee. | {price} per truck per month incl. GST, with unlimited online orders and no HatchGrab fee. |
| `completionSettings.pressesOne` | One press (“Mark paid & collected”) | One press (“Mark paid & picked up”) |
| `completionSettings.pressesOneHelp` | Best when you take the money as you hand the food over. You get a single button, “Mark paid & collected”, which records the payment and clears the order together. | Best when you take the money as you hand the food over. You get a single button, “Mark paid & picked up”, which records the payment and clears the order together. |
| `completionSettings.pressesTwo` | Two presses (“Mark paid” & “Collected”) | Two presses (“Mark paid” & “Picked up”) |
| `completionSettings.pressesTwoHelp` | Best when payment and handover happen at different moments — someone pays at the hatch, then collects when it’s ready. You get two buttons: “Mark paid” first, then “Collected” when they take the food. | Best when payment and handover happen at different moments — someone pays at the hatch, then picks up when it’s ready. You get two buttons: “Mark paid” first, then “Picked up” when they take the food. |
| `dashboard.cancelReasons.not_collected` | Order not collected | Order not picked up |
| `dashboard.edit.collectionTime` | Collection time | Pickup time |
| `dashboard.orders.status` | {status, select, pending {New} confirmed {Confirmed} rejected {Rejected} modified {Modified} cancelled {Cancelled} cooking {Cooking} ready {Ready} collected {Collected} other {{status}}} | {status, select, pending {New} confirmed {Confirmed} rejected {Rejected} modified {Modified} cancelled {Cancelled} cooking {Cooking} ready {Ready} collected {Picked up} other {{status}}} |
| `dashboard.settings.customerTimes` | Customer Collection Times | Customer Pickup Times |
| `dashboard.settings.intervalsHelp` | How far apart collection times are. This doesn’t change kitchen capacity or prep times. | How far apart pickup times are. This doesn’t change kitchen capacity or prep times. |
| `dashboard.settings.intervalsTitle` | Collection times | Pickup times |
| `dashboard.settings.intervalsUnavailable` | Collection times are unavailable right now. | Pickup times are unavailable right now. |
| `dashboard.settings.yourTimes` | Your Collection Times | Your Pickup Times |
| `dashboard.toast.intervalsFailed` | Collection times could not be saved right now. | Pickup times could not be saved right now. |
| `dashboard.toast.intervalsSaved` | Collection times saved for this event | Pickup times saved for this event |
| `dashboard.toast.printMode` | {mode, select, onConfirmed {Tickets will print when you accept an order} other {Tickets will print shortly before collection}} | {mode, select, onConfirmed {Tickets will print when you accept an order} other {Tickets will print shortly before pickup}} |
| `demo.cashAndCollected` | Cash & collected | Cash & picked up |
| `emailCustomer.confirmation.collectionTime` | Collection time: {time} | Pickup time: {time} |
| `emailCustomer.confirmation.leadReady` | Your order is ready for collection — come and collect from {truck}. | Your order is ready for pickup — come and pick it up from {truck}. |
| `emailCustomer.confirmation.preferredTime` | Preferred collection time: {time} | Preferred pickup time: {time} |
| `emailCustomer.confirmation.slotUpdated` | Your collection time has been updated | Your pickup time has been updated |
| `emailCustomer.confirmation.textCollection` | Collection time: {time}. See you at the hatch! | Pickup time: {time}. See you at the hatch! |
| `emailCustomer.confirmation.textPreferred` | Preferred collection: {time} — we’ll confirm when we accept your order. | Preferred pickup: {time} — we’ll confirm when we accept your order. |
| `emailCustomer.confirmation.textReady` | Your order is ready for collection — come and collect. | Your order is ready for pickup — come and pick it up. |
| `emailCustomer.confirmation.textSlotUpdated` | Collection time updated to {time} (was {previous}). | Pickup time updated to {time} (was {previous}). |
| `emailCustomer.confirmation.textTitleReady` | Order #{id} is ready to collect — {truck} | Order #{id} is ready to pick up — {truck} |
| `emailCustomer.confirmation.weWillConfirm` | We’ll confirm your collection time when we accept your order. | We’ll confirm your pickup time when we accept your order. |
| `emailCustomer.payNote.hatchText` | Pay at the truck on collection. | Pay at the truck at pickup. |
| `emailCustomer.payNote.hatchTitle` | Pay at the truck on collection | Pay at the truck at pickup |
| `emailCustomer.payNote.heldShortBody` | {truck} takes the amount held when they confirm your order. The rest is due when you collect. | {truck} takes the amount held when they confirm your order. The rest is due when you pick up. |
| `emailCustomer.payNote.heldShortBodyFigures` | {truck} takes the {held} held when they confirm your order. The remaining {owing} is due when you collect. | {truck} takes the {held} held when they confirm your order. The remaining {owing} is due when you pick up. |
| `emailCustomer.payNote.heldShortText` | Your card is held for part of this order. {truck} takes the amount held when they confirm your order, and the rest is due when you collect. | Your card is held for part of this order. {truck} takes the amount held when they confirm your order, and the rest is due when you pick up. |
| `emailCustomer.payNote.heldShortTextFigures` | Your card is held for {held}, which {truck} takes when they confirm your order. {owing} of this order is still to pay when you collect. | Your card is held for {held}, which {truck} takes when they confirm your order. {owing} of this order is still to pay when you pick up. |
| `emailCustomer.payNote.partPaidBody` | The rest is due when you collect. | The rest is due when you pick up. |
| `emailCustomer.payNote.partPaidBodyFigures` | {paid} of this order is paid. The remaining {balance} is due when you collect. | {paid} of this order is paid. The remaining {balance} is due when you pick up. |
| `emailCustomer.payNote.partPaidText` | Part paid. Some of this order is still to pay when you collect. | Part paid. Some of this order is still to pay when you pick up. |
| `emailCustomer.payNote.partPaidTextFigures` | Part paid: {paid} received, {balance} still to pay when you collect. | Part paid: {paid} received, {balance} still to pay when you pick up. |
| `emailOperator.newOrder.collection` | Collection: {time} | Pickup: {time} |
| `errorsCustomer.cancel_window_passed` | {n, plural, one {Orders can no longer be cancelled within {count} minute of collection} other {Orders can no longer be cancelled within {count} minutes of collection}} | {n, plural, one {Orders can no longer be cancelled within {count} minute of pickup} other {Orders can no longer be cancelled within {count} minutes of pickup}} |
| `errorsKitchen.intervals_choices` | Collection times must be every {choices} minutes. | Pickup times must be every {choices} minutes. |
| `errorsKitchen.intervals_customer_first` | Set the customer collection times before setting your own. | Set the customer pickup times before setting your own. |
| `errorsKitchen.intervals_save_failed` | Collection times could not be saved right now. | Pickup times could not be saved right now. |
| `errorsManage.collection_interval_choices` | Collection times must be every {choices} minutes. | Pickup times must be every {choices} minutes. |
| `errorsManage.collection_intervals_save_failed` | Collection times could not be saved right now. | Pickup times could not be saved right now. |
| `eventTypes.summary.collectionEvery` | collection every {mins} min | pickup every {mins} min |
| `featuresPage.detail.tap_to_pay` | Take card payments on a supported phone, so you don’t need a separate card machine. | Take card payments on a supported phone, so you don’t need a separate EFTPOS machine. |
| `featuresPage.detail.time_slot_selection` | Customers pick a collection time slot, spreading demand across your service. | Customers choose a pickup time slot, spreading demand across your service. |
| `featuresPage.detail.walkup_orders` | Take and manage orders at the hatch, paid on your own card terminal. | Take and manage orders at the hatch, paid on your own EFTPOS terminal. |
| `goLive.kitchenCapacityUnset.detail` | No capacity is set for {vans}. Without it we will keep promising customers collection times your kitchen has no way to hit. | No capacity is set for {vans}. Without it we will keep promising customers pickup times your kitchen has no way to hit. |
| `goLive.noPrepBearingCategory.detail` | {categories, select, none {You have no menu categories yet, so we have no way to work out how long an order takes.} other {None of your categories has a cooking time set, so every order looks instant to us. We would keep giving customers collection times your kitchen has no chance of hitting, and the busier you get the further out they would be.}} | {categories, select, none {You have no menu categories yet, so we have no way to work out how long an order takes.} other {None of your categories has a cooking time set, so every order looks instant to us. We would keep giving customers pickup times your kitchen has no chance of hitting, and the busier you get the further out they would be.}} |
| `kitchenCapacity.lead` | How many items your kitchen can make, so customers can only pick collection times you can meet. | How many items your kitchen can make, so customers can only choose pickup times you can meet. |
| `kitchenModals.extraWait.hint` | Adds to the collection time quoted on new orders. It does not change the event finish time. | Adds to the pickup time quoted on new orders. It does not change the event finish time. |
| `landing.does.capacityBody` | Set how much you can cook at once, and how long it takes. Once a collection time is full, customers can’t pick it. | Set how much you can cook at once, and how long it takes. Once a pickup time is full, customers can’t pick it. |
| `landing.does.devicesBody` | Runs on the phone in your apron, the tablet on the counter, the laptop in the van — and the card machine you already take payment on. | Runs on the phone in your apron, the tablet on the counter, the laptop in the van — and the EFTPOS machine you already take payment on. |
| `landing.does.slotsBody` | Customers order ahead and pick a collection time. Fewer queues, and food ready when they arrive. | Customers order ahead and choose a pickup time. Fewer queues, and food ready when they arrive. |
| `landing.does.slotsTitle` | Customers choose collection times | Customers choose pickup times |
| `landing.does.whatsappBody` | “Where are you tonight?” “What desserts do you have?” Your WhatsApp gets answered while you’re driving to the pitch or at the grill, using your own menu and schedule. Messenger and Instagram coming soon. | “Where are you tonight?” “What desserts do you have?” Your WhatsApp gets answered while you’re driving to the site or at the grill, using your own menu and schedule. Messenger and Instagram coming soon. |
| `landing.does.whatsappSoonBody` | “Where are you tonight?” “What desserts do you have?” Soon your WhatsApp will get answered while you’re driving to the pitch or at the grill. Messenger and Instagram to follow. | “Where are you tonight?” “What desserts do you have?” Soon your WhatsApp will get answered while you’re driving to the site or at the grill. Messenger and Instagram to follow. |
| `landing.jsonLd.description` | Ordering, pre-orders and a kitchen screen for {country} food trucks and mobile catering. | Ordering, pre-orders and a kitchen screen for food trucks and mobile catering in {country}. |
| `landing.meta.description` | Take orders and pre-orders from your pitch without the queue. Ordering and kitchen-screen software for {country} food trucks and mobile catering — not a POS. | Take orders and pre-orders from your site without the queue. Ordering and kitchen-screen software for food trucks and mobile catering in {country} — not a POS. |
| `managePayments.walkUp.hatchgrabHelp` | Uses the same Stripe connection as your online payments — a card reader, or contactless straight from your phone or tablet. | Uses the same Stripe connection as your online payments — an EFTPOS reader, or contactless straight from your phone or tablet. |
| `managePayments.walkUp.ownTerminal` | Your own card terminal | Your own EFTPOS terminal |
| `manageReports.csv.collectionTime` | Collection time | Pickup time |
| `manageSettings.collection.customerTimes` | Customer collection times | Customer pickup times |
| `manageSettings.collection.help` | How far apart collection times are. This doesn’t change kitchen capacity or prep times. | How far apart pickup times are. This doesn’t change kitchen capacity or prep times. |
| `manageSettings.collection.unavailable` | Collection times are unavailable right now. | Pickup times are unavailable right now. |
| `manageSettings.collection.yourTimes` | Your collection times | Your pickup times |
| `nativeShell.gate.collected` | Order #{id} {paidToo, select, yes {paid and collected} other {collected}} | Order #{id} {paidToo, select, yes {paid and picked up} other {picked up}} |
| `nativeShell.gate.status` | Order #{id} {action, select, confirm {confirmed} reject {rejected} ready {ready} collected {collected} undo_collected {restored} cancel {cancelled} other {updated}} | Order #{id} {action, select, confirm {confirmed} reject {rejected} ready {ready} collected {picked up} undo_collected {restored} cancel {cancelled} other {updated}} |
| `nativeShell.gate.undoneCollected` | Undone — order not collected | Undone — order not picked up |
| `order.collectionTime` | Collection time: {time} | Pickup time: {time} |
| `order.collectionTimeChosen` | ✓ Collection time: {time} | ✓ Pickup time: {time} |
| `order.collectionTimeTitle` | Collection time | Pickup time |
| `order.payAtTruckLine` | Pay at the truck on collection · No card details needed | Pay at the truck at pickup · No card details needed |
| `order.preferredCollection` | Preferred collection: {time} | Preferred pickup: {time} |
| `order.willConfirmTime` | {truck} will confirm your collection time when they accept your order. | {truck} will confirm your pickup time when they accept your order. |
| `orderCard.cardAndCollected` | Card & collected | Card & picked up |
| `orderCard.cashAndCollected` | Cash & collected | Cash & picked up |
| `orderCard.collected` | Collected | Picked up |
| `orderCard.markPaidAndCollected` | Mark paid & collected | Mark paid & picked up |
| `orderCard.status` | {status, select, pending {New} confirmed {Confirmed} rejected {Rejected} modified {Modified} cancelled {Cancelled} cooking {Cooking} ready {Ready} collected {Collected} other {New}} | {status, select, pending {New} confirmed {Confirmed} rejected {Rejected} modified {Modified} cancelled {Cancelled} cooking {Cooking} ready {Ready} collected {Picked up} other {New}} |
| `orderStatus.statusName.collected` | collected | picked up |
| `paymentActions.inPersonHint` | Cash or your card machine — not recorded | Cash or your EFTPOS machine — not recorded |
| `paymentActions.paidCardMachine` | Paid on your card machine{mixed, select, yes { — {amount}} other {}} | Paid on your EFTPOS machine{mixed, select, yes { — {amount}} other {}} |
| `paymentActions.reason` | {reason, select, item_unavailable {Item unavailable} not_collected {Order not collected} wrong_or_missing_item {Wrong or missing item} quality_issue {Quality issue} duplicate_payment {Duplicate payment} customer_cancelled {Customer cancelled} other {Other}} | {reason, select, item_unavailable {Item unavailable} not_collected {Order not picked up} wrong_or_missing_item {Wrong or missing item} quality_issue {Quality issue} duplicate_payment {Duplicate payment} customer_cancelled {Customer cancelled} other {Other}} |
| `planFeatures.priceWord.payAtHatch` | Pay at Hatch | Pay at the truck |
| `planPrompt.features.online_ordering_pay_at_hatch.name` | Pay at Hatch ordering | Pay-at-the-truck ordering |
| `pricing.banner.body` | With {brand}, customers order ahead and pay when they collect, so you can take online orders without connecting a card processor at all. Prefer to take payment up front? Add online card payments any time. When your trial ends you move to <plan>{fallback}</plan>{fallbackFree, select, yes { — no monthly fee —} other {}} unless you choose a plan. No card to start, no contract, cancel anytime. | With {brand}, customers order ahead and pay when they pick up, so you can take online orders without connecting a card processor at all. Prefer to take payment up front? Add online card payments any time. When your trial ends you move to <plan>{fallback}</plan>{fallbackFree, select, yes { — no monthly fee —} other {}} unless you choose a plan. No card to start, no contract, cancel anytime. |
| `pricing.base.preorders` | Pre-orders & collection times | Pre-orders & pickup times |
| `pricing.card.perTruckMonth` | per truck / month | per truck / month incl. GST |
| `pricing.footnote` | * Plus Stripe’s card processing on online card orders (currently {cardFee} in the {country}), paid to Stripe, not HatchGrab. Walk-up orders use your own card reader — HatchGrab charges 0%. | All prices include GST. * Plus Stripe’s card processing on online card orders (currently {cardFee} in {country}), paid to Stripe, not HatchGrab. Walk-up orders use your own EFTPOS machine — HatchGrab charges 0%. |
| `printing.card.leadLabel` | Minutes before the collection time | Minutes before the pickup time |
| `printing.card.modeLead` | A set time before collection | A set time before pickup |
| `printing.card.modeOnConfirmedHint` | An advance pre-order prints when you accept it, which may be hours before the collection time. Orders you have not accepted yet never print. | An advance pre-order prints when you accept it, which may be hours before the pickup time. Orders you have not accepted yet never print. |
| `printing.card.summaryLead` | Print <b>{lead} min</b> before collection · {paper}mm paper | Print <b>{lead} min</b> before pickup · {paper}mm paper |
| `serviceSettings.labels.collection_interval_mins` | Collection times | Pickup times |
| `settingsCopy.buzzers.label` | Do you hand out buzzers for collection? | Do you hand out buzzers for pickup? |
| `ticket.collect` | COLLECT {time} | PICK UP {time} |
| `ticket.collectAsap` | COLLECT ASAP | PICK UP ASAP |
| `truckPage.meta.orderDescription` | Order ahead from {truck} and collect it at the truck. | Order ahead from {truck} and pick it up at the truck. |
| `truckPage.shareText` | Check out where {truck} is pitching up next! 🚚 | Check out where {truck} is setting up next! 🚚 |
| `weeklyPost.post.notePlaceholder` | e.g. Pre-order for collection | e.g. Pre-order for pickup |


### 4.3 "Pay at the truck": every live US sentence that changes

- `planFeatures.priceWord.payAtHatch` "Pay at the truck" and `planPrompt.features.online_ordering_pay_at_hatch.name`
  "Pay-at-the-truck ordering" are added to en-US, en-IE, en-AU and en-NZ.
- **en-GB is untouched** ("Pay at Hatch" / "Pay at Hatch ordering"), and so is every message that writes "Pay at Hatch"
  inside a sentence. Only these two words differ.

**Public pages (production build vs the live site, every visible line compared):** exactly one sentence, on /us
(the "Start free" banner), and the same sentence in the US plans PDF banner (`pricing.banner.body`, `lib/plans-pdf.ts:174`):

| | Before (live) | After |
|---|---|---|
| /us pricing banner, US plans PDF | With **Pay at Hatch**, customers order ahead and pay when they pick up, so you can take online orders without connecting a card processor at all. … | With **Pay at the truck**, customers order ahead and pay when they pick up, so you can take online orders without connecting a card processor at all. … |

**Manage (US trucks only; shown only when Pay at Hatch is off for the truck), Payments tab and the server's plan refusal
(`components/PlanPrompt.tsx`, `components/manage/PaymentsTab.tsx:421–425`, `lib/plan-refusal.ts`):**

| | Before | After |
|---|---|---|
| plan prompt | Pay at Hatch ordering is included on {plan}. / … is not on your plan. | Pay-at-the-truck ordering is included on {plan}. / … is not on your plan. |
| switched off by an override | Pay at Hatch ordering is switched off for your truck. | Pay-at-the-truck ordering is switched off for your truck. |
| refusal `feature_not_on_plan` | Pay at Hatch ordering is included on {plan}. | Pay-at-the-truck ordering is included on {plan}. |

/us/features and /us/compare: no "Pay at …" word at all (counted on the build), so no change from anz-1. (The /features
lines that differ from live are features-page-restore's restored descriptions — uncommitted from that workstream, not anz-1.)

`lib/price-words.ts` records the 13 October note that "Pay at Hatch" is a brand name; a line now says its display word is
"Pay at the truck" outside en-GB by this brief's approval. The id and the mask list are unchanged (the word is only ever
shown inside a banner sentence).

- **Ireland** gets the same two words, but /ie is switched off, so nothing live changes there.
- **en-GB adds one message:** `order.dualNetworkNotice` (§5). It is shown only on AUD checkouts.
- No en-GB sentence changes.

## 5 · eftpos and manual capture (item 5)

**What Stripe documents** (https://docs.stripe.com/payments/eftpos-australia):
- eftpos itself does **not** support manual capture ("Manual capture support: No").
- **But:** "If a payment requires placing a hold on the card (in other words, if there's a delay between authorization
  and capture), Stripe always routes to the international scheme." Every HatchGrab card order is a hold:
  `lib/payments/authorize.ts:124`, `capture_method: 'manual'`, a direct charge on the truck's account. So an Australian
  dual-network debit card is authorised over Visa or Mastercard. **No order fails or is routed wrongly. No server change
  is made.**
- "Eftpos-only cards … only support in-person payments and can't be used for online transactions." Those cards were
  never usable online, anywhere.
- **The notice is required:** "Eftpos is the default network for payment. Unless you change the default network, you
  must inform your customers that whenever they use a dual-network debit card, their payments might be processed through
  the debit network, regardless of the logo…" It must be displayed "before the completion of the checkout process". The
  alternative is to ask Stripe support to make eftpos never the default network, and then the notice could go.

**What I changed:** one paragraph under the card step's "held, not charged" line, for **AUD only**
(`app/trucks/[slug]/order/page.tsx:3699–3710`, `data-network-notice`). The text is Stripe's suggested wording, minus its
clause about recurring payments, which we don't take:

> Notwithstanding the payment brand logo displayed when you enter your payment information, whenever you use a
> dual-network debit card displaying eftpos and another payment brand, your payment might be processed through either
> network.

- It is a new en-GB message, `order.dualNetworkNotice`, inherited by every English locale.
- **GB, US, NZ and IE checkouts render nothing new.** The harness renders the real card step for AU, NZ, GB and US
  (`scripts/anz-1.cjs` §7).

**⚠️ One thing to test before Australia goes on: Apple Pay with eftpos.**
- Stripe: "Eftpos Apple Pay payments with manual capture always fail."
- The Payment Element hides eftpos Apple Pay when it knows the payment is manual capture. Ours is created from the
  intent's client secret, and the intent carries `capture_method: 'manual'`, so it should know. But Stripe only
  documents the hiding for the deferred-intent setup.
- **Test:** an AU test-mode account, Safari with an eftpos-capable Apple Pay test card. Check that eftpos isn't offered,
  or that the payment goes through on the international network.
- If it fails, the minimal fix is `wallets: { applePay: 'never' }` for AUD only, at `page.tsx:2056`. Australian
  customers would then pay by card form or Google Pay. Not done now, because it needs the test first.

**New Zealand:** "Stripe doesn't process over the domestic New Zealand eftpos rails, so eftpos-only cards aren't
supported" (https://docs.stripe.com/terminal/payments/regional?integration-country=NZ). Online, NZ cards are
Visa/Mastercard, so there's no notice, no routing question and no change.

**Later, in person (Terminal / Tap to Pay; none in the repo today):**
- with `capture_method: 'manual'`, "eftpos card payments will always decline";
- `manual_preferred` captures eftpos at once, which breaks the hold;
- when walk-up card payments are built for AU, they need either `card_present.routing.requested_priority:
  'international'` or immediate capture. Tap to Pay on iPhone needs Terminal iOS SDK ≥ 4.6.0 for routing
  (https://docs.stripe.com/terminal/payments/regional?integration-country=AU).

Other sources:
- https://support.stripe.com/questions/supporting-dual-network-debit-cards-in-australia (least-cost routing; opting
  out is through support);
- https://docs.stripe.com/payments/place-a-hold-on-a-payment-method (7-day online hold, Visa/Mastercard).

## 6 · WhatsApp guard and caveat (in item 1)

- `lib/whatsapp-classifier.ts` takes the truck's set: `ClassifierParams.allergenSet`.
- All three callers pass `allergenSet: await allergenSetForTruck(truck)`:
  - the preview;
  - the Twilio webhook;
  - the Meta webhook.

  `allergenSetForTruck` never throws. A failed read gives `null`, which is the base guard.
- **The guard, for `anz` only,** also catches these safety words (substrings): `anaphyla`, `epipen`, `epi pen`
  ("epi-pen" normalises to it). It also catches the whole tokens `nf` and `lf` (nut free / lactose free menu marks).
  - "gluten free", "GF", "coeliac", "dairy-free", "allergic", "free from" and "suitable for" were already caught for
    everyone.
- **Option B is kept:** "does the satay have peanuts?" and "any sesame on the bun?" are not caught for any set. They
  reach the AI, which answers from the tags.
- **Caveat (anz only):** a reply naming a tagged ANZ allergen still carries the caveat when it uses the everyday word.
  For example "dairy" for Milk, "nuts" for Macadamia, "gluten" for Wheat, "prawn"/"shellfish" for Crustacean.

| Message | uk14 / us9 | anz |
|---|---|---|
| my son has an EpiPen / she carries an epi-pen | – | **redirect** |
| anaphylaxis to peanuts — is the satay safe? / I am anaphylactic to sesame | – | **redirect** |
| is the burger NF? / LF options? | – | **redirect** |
| is it gluten free? / GF? / coeliac friendly? / dairy-free please / I am allergic to milk | redirect | redirect |
| does the satay have peanuts? / any sesame on the bun? / Are you open today | – | – |

uk14/us9/none behave exactly as at HEAD (§1.3).

## 7 · Stripe Connect (item 7)

**Onboarding passes the truck's own country.**
- `app/api/stripe/connect/route.ts:251` calls `createConnectedAccount({ …, country: ctx.country })`.
- `ctx.country` is the truck's `country` (AU / NZ).
- `lib/stripe/connect.ts:216–242` creates the account with `identity: { country: 'au' | 'nz' }` and requests
  `card_payments`.
- **No code change is needed.**

**Payouts in AUD / NZD.**
- Direct charges settle on the truck's own account: "Funds always settle in the country of the connected account"
  (https://docs.stripe.com/connect/charges).
- The order's currency is the truck's (AUD/NZD), and the payout goes to the truck's own AU/NZ bank account
  (https://docs.stripe.com/payouts).
- **One thing to confirm in test mode:** we don't send `defaults.currency`. Stripe's account API says it "Cannot change
  `defaults.currency` post account activation" (https://docs.stripe.com/api/v2/core/accounts/create).
- That an AU account defaults to AUD and an NZ account to NZD is the normal Stripe behaviour, but the docs page I could
  read doesn't state it outright. So check the test account's `defaults.currency` before the first real truck. If it
  isn't aud/nzd, a one-line change would pass it for AUD/NZD only, leaving GB/US requests byte-identical. I didn't make
  that change without the evidence.
- **Cross-border payouts** (https://docs.stripe.com/connect/cross-border-payouts) don't apply. We send no transfers and
  no platform fee.

**Checklist: Stripe Dashboard and test mode, before switching AU/NZ on**

1. **Create one AU and one NZ connected account in test mode** from a fixture truck. Never Gusto.
   - Watch for `cross_border_connected_account_creation_not_allowed`. Stripe lists it as possible "for this
     platform/account country combination".
   - A UK platform is documented as able to create accounts "for any country Stripe supports"
     (https://docs.stripe.com/connect/custom-accounts, a legacy page), but the newer account API has no published
     pair list.
2. On each test account, check:
   - `defaults.currency` = `aud` / `nzd`;
   - `card_payments` becomes **active**;
   - the payout schedule and an AU/NZ test bank account.
3. **Connect → Settings → Onboarding / platform profile:** make sure Australia and New Zealand are allowed countries
   for onboarding, and that the platform questionnaire and loss-liability acknowledgement cover them.
4. **Payments → Payment methods (for connected accounts):** cards on for AU/NZ. Apple Pay and Google Pay too, with
   **the Apple Pay domain registered** on each connected account, as for GB/US today.
5. **The eftpos notice:** keep it (it is built), or ask Stripe support to make eftpos never the default network for
   the platform's AU accounts. Then the notice could be removed.
6. **The Apple Pay eftpos test** (§5).
7. **Pricing:** Stripe's AU/NZ standard rates match the figures you gave:
   - AU: 1.65% + A$0.30 online, 1.65% + A$0.10 in person, +A$0.15 Tap to Pay;
   - NZ: 2.65% + NZ$0.30, 2.6% + NZ$0.05, +NZ$0.15.

   These are what the rows quote. Confirm them on https://stripe.com/au/pricing and https://stripe.com/nz/pricing on the
   day you switch on.
8. **Tap to Pay later:** iPhone supports AU and NZ, and eftpos in AU
   (https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=ios). It needs the routing in §5.
9. **Later, if a platform fee is turned on:** whether an application fee can flow from an AU/NZ account to a UK
   platform is not documented. Ask Stripe before enabling it. Today `platform_fee_enabled = false`.

## 7b · Hero screenshots (item 6)

- **Six new files.** Each one's master is in `docs/anz-1/` and a copy is in `public/screenshots/`:
  - `customer-order-au.png`, `customer-order-nz.png` (1284×2778);
  - `dashboard-v4-au.png`, `dashboard-v4-nz.png` (800×551);
  - `kitchen-au.png`, `kitchen-nz.png` (640×480).

  Each is the same pixel size as its GB file.
- **The recipe:** `scripts/screenshots/anz-screens.cjs <au|nz> <outDir>` (README-anz.md).
  - It renders the real order page, Add-order tab and kitchen screen for fixture trucks: "Pizza Kitchen" with AU or NZ
    settings. **Never Gusto.**
  - The trucks trade at Riverside Park, Parramatta and Frank Kitts Park, Wellington.
- **What they show:**
  - menu prices in "$", the truck's own everyday symbol;
  - 12-hour times ("9:25am") and day-month dates;
  - Australian names; Māori and Pākehā names for NZ, with the macrons drawn correctly;
  - AU wording "Pay at the truck at pickup" / "Mark paid & picked up"; NZ "Pay at the truck on collection" / "Mark paid
    & collected".
- `lib/landing-screens.ts` maps AU and NZ to them. They are used only on /au and /nz (harness §2).

**Which dollar.** `lib/country-settings-types.ts` `planMoneyFormatOf`:
- HatchGrab's own plan prices name their dollar (A$39, NZ$49) wherever we quote them:
  - the pricing section, /features, /compare;
  - the plans PDF;
  - Billing (`cardMoney`, the extra-van label);
  - `usePlanPriceLabel`.
- The rule is generic: if a country's own symbol is a bare "$" and the currency isn't USD, the plan prices are written
  in international English.
- **GB, US and IE get exactly `moneyFormatOf`, so their pages are byte-identical.** A truck's menu, orders and receipts
  keep "$".

---

## Proof

**What was executed** (all on this machine; nothing against Gusto; no .env file opened; no database write; no push or deploy):

- **`node scripts/anz-1.cjs` — 76 passed, 0 failed.** All of it runs on localhost, on fixtures. It covers:
  - §1 **Addresses.** Off, and with no row: /au and /nz/compare redirect to the UK pages. On: the router sends AU/NZ
    IPs to /au and /nz.
  - §2 **The pages, on.**
    - Six pages render with A$/NZ$ and no £, €, or "$" without its country letters.
    - "per truck / month incl. GST" appears on the cards.
    - The footnotes read "All prices include GST." and "(currently 1.65% + 30c in Australia)" / "(currently 2.65% +
      30c in New Zealand)".
    - The cheapest bands come out of `cheapestBands` (AU 3,900 / 11,600; NZ 4,900 / 14,100). The landing page shows
      "Under A$3,900 … A$3,900 – A$11,600 → Pro · Over A$11,600 → Unlimited".
    - /compare's own calculator suggests "A$39 per truck per month incl. GST" at A$8,000 and "A$99 …" at A$20,000;
      NZ$49 at NZ$10,000 and NZ$119 at NZ$25,000.
    - Times are 12-hour. JSON-LD Offers are AUD 0/39/99 and NZD 0/49/119.
    - hreflang is reciprocal across en-GB, en-US, en-AU, en-NZ and x-default; og:locale is en_AU/en_NZ.
    - The menu links appear, and the hero screenshots are the right size.
    - The sitemap has /au, /au/features, /nz and /nz/features with all five alternates.
  - §3 **Off.** With the rows off, and with no rows, /uk and /us show no trace of AU or NZ.
  - §4 **Words.** "Pay at the truck" appears in en-US/en-IE/en-AU/en-NZ, and en-GB says "Pay at Hatch". EFTPOS, "site"
    and "pick up" are in en-AU, and en-NZ keeps "collect".
  - §5 **Allergens.**
    - The anz list is right, and the uk14/us9 hashes match their pins.
    - The prompts are localised for anz and unchanged for every other set. The loader accepts 'anz' and refuses an
      unknown set.
    - Manage's toggles render the 23 for an AU and an NZ truck, and exactly UK_14 and US_9 for GB and US.
    - The order page shows the anz allergens for AU and NZ fixture trucks.
  - §6 **WhatsApp guard.** It catches the AU/NZ phrasing for anz only, keeps Option B, and all three callers pass the
    set.
  - §7 **eftpos notice.** It appears on the AU card step only (NZ, GB and US render nothing new). `authorize.ts` is
    unchanged.
  - §8 **Money and phones.** `planMoneyFormatOf` is identical to before for GB/US/IE, and gives A$/NZ$ for AU/NZ. The
    example phone numbers are plausible.
- **HEAD vs working byte-identity proof** (one-off, §1.3): every uk14/us9/no-set surface is identical.
- **`next build`** passes. **`next start -p 3100`** ran against the live database, which has no AU/NZ rows and IE off:
  - `/au`, `/nz` → 302 `/uk`; `/au/features` → 302 `/uk/features`; `/nz/compare` → 302 `/uk/compare`; `/ie` → 302
    `/uk`;
  - the root router with `x-vercel-ip-country: AU` or `NZ` → 302 `/uk`;
  - the sitemap has 0 /au, /nz or /ie URLs and 0 en-AU/en-NZ.
  - **Local build vs the live site:**

    | Page | Head tags | Pricing section | Every visible line |
    |---|---|---|---|
    | /uk | identical (23) | identical (3,352 chars) | identical (130 lines) |
    | /us | identical (23) | **one line**: "With Pay at Hatch," → "With Pay at the truck," (3,366 → 3,370 chars) | **one line**, the same |
    | /uk/compare, /us/compare | identical except og:image/twitter:image **host** (local server writes its own host, as in ireland-1) | — | identical (61 lines) |
    | /uk/features, /us/features | identical (23) | — | differ only by features-page-restore's restored descriptions (uncommitted, earlier workstream); no "Pay at …" word on either |

    The first live fetch of /uk came back empty (one tag). A re-fetch gave a 200 and the identical result above.
  - A comment-only edit to `lib/price-words.ts` came after the build. tsc was re-run after it.
- **tsc** is clean.
- **Lint:** I compared each changed source file's error count with HEAD's version (70 files). There are no new errors,
  and the new files have 0. The 2 errors in `lib/whatsapp-classifier.ts` are HEAD's own (the same 2 `any`s).
- **`split-messages --check`:** clean, 107 namespaces.
- **Full sweep (`node scripts/run-harnesses.cjs`, 147 harnesses with the new `anz-1`):**
  - **Sweep 1:** 142 passed, 5 failed. All five were re-pins, listed below.
  - **Sweep 2, after the re-pins: 146 passed, 1 failed.** The failure was `add-order-refresh-inputs` (2 checks;
    the runner printed no names).
    - That run took **2,128 s** against its usual ~215 s. It is a mounted-page timer harness, and the machine was
      heavily loaded.
    - It **passed in sweep 1 (214.7 s) and passed again alone (3 min 35 s, every check including all six broken
      variants)**.
    - Nothing in anz-1 touches Add Order or its capacity inputs. I'm reporting it as a load flake, not a pass.
  - `event-types-render` passed.
- **Re-pins.** Each is marked `⚠️ RE-PINNED (anz-1, 21 October 2026)`. They are harness files only, and none found a
  product bug:
  - **`ireland-1`**: en-IE now holds six keys, its four plus the two approved "Pay at the truck" words.
  - **`event-types`** (broken-variant tree) and **`weekly-post`** (variant tree): they copied only the en-GB and en-US
    namespace JSON. They now copy every locale's file that exists, because en-AU overrides `serviceSettings`,
    `settingsCopy` and others, and a sparse catalog imports only the files it has.
  - **`_phase3-screens-us`** (phase3-screens): the extra-van label line now uses `planMoneyFormatOf`. It sat between two
    already-excused Stage A hunks, so the diff merged them into one 3-line hunk. That hunk is excused whole only when it
    contains both Stage A's replacement and the `planMoneyFormatOf` line.
  - **`_messages-parity-1e`** (messages-parity): `order.dualNetworkNotice` is a named new wording. Its exact text is held
    by `anz-1` §7.
- **Screenshots:** made by a sub-agent from my brief, with fixtures only. I viewed the AU order page, the AU dashboard
  and the NZ kitchen screen myself: "$" menu prices, 12-hour times, macrons drawn correctly, AU "Pay at the truck at
  pickup".


## 8 · SQL

### Read-only queries run (Supabase MCP, `execute_sql`)

1. The country rows as they are (all columns):
```sql
select row_to_json(c) as row from country_settings c order by country_code
```
2. The plan prices:
```sql
select plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor from plan_prices order by country_code, plan_key
```
3. The three CHECKs the AU/NZ values meet:
```sql
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.country_settings'::regclass and conname in ('country_settings_allergen_set_chk', 'country_settings_address_format_chk', 'country_settings_time_format_chk')
```
4. The columns the inserts name:
```sql
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in ('country_settings', 'plan_prices')
order by table_name, ordinal_position;
```
5. Every constraint on both tables:
```sql
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid in ('public.country_settings'::regclass, 'public.plan_prices'::regclass)
order by 1, 2;
```
6. The plan prices again (GB, IE, US: 9 rows; no AU/NZ):
```sql
select plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor
from public.plan_prices order by country_code, plan_key;
```
7. The country rows' key columns (GB on, US on, IE off; no AU/NZ):
```sql
select country_code, enabled, currency, locale, allergen_set, address_format, distance_unit, phone_check, card_fee_region_label, updated_by
from public.country_settings order by country_code;
```


### NOT RUN — block A, "run now"

```sql
-- NOT RUN — anz-1 block A, "RUN NOW". Widens the allergen CHECK only; no row holds 'anz' yet, so nothing changes for anyone.
begin;
alter table public.country_settings drop constraint country_settings_allergen_set_chk;
alter table public.country_settings add constraint country_settings_allergen_set_chk
  check (allergen_set in ('uk14', 'us9', 'anz'));
commit;
```

### NOT RUN — block B, "run after deploy"

```sql
-- NOT RUN — anz-1 block B, "RUN AFTER DEPLOY" (not "run now": the live loader, lib/country-settings.ts mapCountryRow at HEAD,
-- accepts only 'uk14'/'us9' and maps EVERY row for the country menu and signup list, so an 'anz' row before the deploy would
-- make those pages throw). Australia and New Zealand stay switched OFF (enabled = false). Rows before prices (plan_prices FK).
begin;

insert into public.country_settings (
  country_code, name, enabled, currency, locale, time_format, date_order, week_start,
  phone_country_code, address_format, timezones, default_timezone,
  prices_include_tax, tax_label,
  card_surcharge_allowed, card_surcharge_cap_pct, card_surcharge_credit_only, card_surcharge_excluded_regions,
  service_fee_allowed, tipping_enabled_default, tip_presets_pct, allergen_set,
  starter_monthly_minor, pro_monthly_minor, max_monthly_minor, pro_allowance_minor, max_allowance_minor, platform_fee_pct,
  card_fee_online_pct, card_fee_online_fixed_minor, card_fee_in_person_pct, card_fee_in_person_fixed_minor,
  tap_to_pay_fixed_minor, card_fee_region_label,
  competitor_name, competitor_pct, competitor_fixed_minor, support_hours, updated_by,
  short_name, phone_example, phone_check, distance_unit,
  service_fee_recipient, service_fee_hatchgrab_bps, service_fee_hatchgrab_fixed_minor,
  service_fee_truck_max_bps, service_fee_truck_max_fixed_minor,
  platform_fee_enabled, fees_taxed
) values
(
  'AU', 'Australia', false, 'AUD', 'en-AU', '12h', 'dmy', 'monday',
  '61', 'postcode',
  array['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Perth', 'Australia/Hobart'],
  'Australia/Sydney',
  true, 'GST',
  false, null, false, '{}'::text[],
  false, false, '{}'::numeric[], 'anz',
  null, null, null, null, null, null,
  1.65, 30, 1.65, 10,
  15, 'Australian cards',
  null, null, null, null, 'anz-1 draft',
  'Australia', '0412 345 678', 'length', 'km',
  'truck', null, null,
  null, null,
  false, false
),
(
  'NZ', 'New Zealand', false, 'NZD', 'en-NZ', '12h', 'dmy', 'monday',
  '64', 'postcode',
  array['Pacific/Auckland', 'Pacific/Chatham'],
  'Pacific/Auckland',
  true, 'GST',
  false, null, false, '{}'::text[],
  false, false, '{}'::numeric[], 'anz',
  null, null, null, null, null, null,
  2.65, 30, 2.6, 5,
  15, 'New Zealand cards',
  null, null, null, null, 'anz-1 draft',
  'New Zealand', '021 123 4567', 'length', 'km',
  'truck', null, null,
  null, null,
  false, false
);

insert into public.plan_prices (plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor) values
  ('payg',      'AU',     0,      0, 99,     0),
  ('pro',       'AU',  3900, 550000, 99,  3900),
  ('unlimited', 'AU',  9900,   null,  0,  9900),
  ('payg',      'NZ',     0,      0, 99,     0),
  ('pro',       'NZ',  4900, 700000, 99,  4900),
  ('unlimited', 'NZ', 11900,   null,  0, 11900);

commit;
```

### Undo (only if Dominic asks)

```sql
begin;
delete from public.plan_prices where country_code in ('AU', 'NZ');
delete from public.country_settings where country_code in ('AU', 'NZ');
alter table public.country_settings drop constraint country_settings_allergen_set_chk;
alter table public.country_settings add constraint country_settings_allergen_set_chk check (allergen_set in ('uk14', 'us9'));
commit;
```

## 9 · Files

anz-1 only (the working tree also holds the earlier, uncommitted workstreams' changes):

- **Product code:**
  - `lib/allergens.ts`;
  - `lib/country-settings.ts`, `lib/country-settings-types.ts`, `lib/admin/country-form.ts`,
    `components/admin/CountriesTab.tsx`;
  - `lib/marketing-country.ts`, `lib/landing-screens.ts`, `lib/price-words.ts` (a comment);
  - `lib/i18n/locales.ts`, `lib/i18n/messages.ts`;
  - `lib/whatsapp-classifier.ts`, `app/api/manage/whatsapp-preview/route.ts`, `app/api/webhooks/whatsapp/route.ts`,
    `app/api/webhooks/meta/whatsapp/route.ts`;
  - `lib/menu-extract.ts`, `app/api/manage/process-allergens/route.ts`;
  - `app/trucks/[slug]/order/page.tsx` (the AUD notice);
  - `planMoneyFormatOf` callers: `components/pricing/PricingSection.tsx`, `components/pricing/PlanTable.tsx`,
    `lib/plans-pdf.ts`, `app/compare/CostComparison.tsx`, `app/manage/[token]/page.tsx`,
    `components/usePlanPriceLabel.ts`.
- **Words:**
  - new: `messages/en-AU.json` (110 keys), `messages/en-NZ.json` (25 keys);
  - `messages/en-US.json` and `messages/en-IE.json` (+2 each);
  - `messages/en-GB.json` (+`order.dualNetworkNotice`);
  - generated: `messages/ns/en-AU/*` (33), `messages/ns/en-NZ/*` (10), `lib/i18n/catalog/*`;
  - `scripts/split-messages.cjs`.
- **Images:**
  - `public/screenshots/{customer-order,dashboard-v4,kitchen}-{au,nz}.png`, with masters in `docs/anz-1/`;
  - the recipe: `scripts/screenshots/{anz-fixtures,anz-screens,order-anz,dash-anz,kds-anz,frame-order-anz,frame-dash-anz,frame-kds-anz}.cjs`
    and `README-anz.md`.
- **Harnesses:**
  - new: `scripts/anz-1.cjs`, registered in `scripts/harnesses.json`;
  - re-pinned: `scripts/ireland-1.cjs`, `scripts/event-types.cjs`, `scripts/weekly-post.cjs`,
    `scripts/_phase3-screens-us.cjs`, `scripts/_messages-parity-1e.cjs`.

