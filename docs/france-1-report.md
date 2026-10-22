# france-1 — report

**Date:** 22 October 2026 · **Branch:** main (not committed, not pushed, not deployed) · **Database:** read-only SQL only (§12).
The France row is NOT RUN SQL, switched off (§9). **France is not visible to anyone** until you run the SQL and switch it on
in Admin › Countries.

## Summary

- **France is built, switched off**, by the recipe (`docs/i18n/add-a-country.md`): locale fr-FR, /fr, EUR at Ireland's
  prices, 24-hour, dmy, Monday weeks, +33, Europe/Paris, TVA included.
- **The language file:** `messages/fr-FR.json` has 5,056 strings in French.
  - Every key has a back-translation (`docs/i18n/back/fr-FR.json`).
  - translation-check finds **0 structural problems**. Its flags are explained in plain English in §3.
- **The brief's eight items are done:**
  1. **Address format `fr`:** street, 5-digit code postal before the town, no region.
  2. **TVA included:** a 10 % default held as data; the truck can set its own rate; receipts say « Dont TVA 10 % ».
  3. **Allergens:** the EU 14 shown in French; a French WhatsApp guard; the allergen card allowed on its own.
  4. **Decimal comma:** Manage's price boxes accept « 12,50 ».
  5. **Cards:** card-brand choice for Cartes Bancaires and holds are confirmed with Stripe's docs; « cartes de l'EEE » in French.
  6. **The country row and prices:** NOT RUN SQL, run order stated.
  7. **Terms:** a France section in the country terms.
  8. **Hero images:** three /fr images from a Lyon fixture truck.
- **Found and fixed on the way:**
  - "Today" / "Tomorrow" were hard-coded English.
  - The French order button needed the wording French law requires (L. 221-14).
  - "map" and "menu" both translated as « carte »; "map" is now « plan ».
  - The languages-1 end-to-end run never checked the order and status pages (§10).
- **Proof:**
  - `scripts/france-1.cjs` (new, in the sweep): **74/74**, and 75/75 with `--shots`. France is switched on in fixtures.
  - The French end-to-end run covers every captured surface: 3,548 French views.
    - **0 of 2,008 French screens overflow at 390px** because of the language.
    - English is left in 266 views, and every one is explained (§10).
  - **103 screenshots** in WebKit and Chromium, at 390 and 1280, are in `docs/france-1/`.
- **Every live country is byte-identical.** The one exception is the country-terms page, where the new France section is
  a pure insertion:
  - 8,890 / 8,890 captured views;
  - 2,850 / 2,850 date, time and money answers;
  - all marketing pages, PDFs, sitemaps and /llms.txt.
- **Checks:**
  - tsc is clean, and the build passes;
  - lint is identical to the baseline (2,445 / 378);
  - **the full sweep passes, 163/163** (re-pins named in §14);
  - translation-check, messages-split, messages-parity and glossary-build pass.
- **For you:** four legal and product questions (§13).

---

## 1 · What France is (the row, NOT RUN)

| Setting | Value | Source / reason |
|---|---|---|
| Locale, URL | fr-FR, `/fr` | the brief |
| Currency, prices | EUR · Sans abonnement 0 € + 0,99 % · Pro 29 € incl. 4 000 € of online orders, then 0,99 % · Illimité 69 €, no fee · extra van = the plan's price | the brief (Ireland's euro prices, read from the live `plan_prices`, §12) |
| Clock, dates, week | 24-hour, day-month-year, Monday | the brief |
| Phone | +33, example « 06 12 34 56 78 » (passes the app's phone check) | the brief |
| Time zone | Europe/Paris | |
| Tax | prices include tax, label « TVA », default 10 % (§5) | CGI art. 279 m/n; service-public F22399 |
| Allergens | `uk14` (the EU 14), shown in French; card on its own **allowed** (§6) | R. 412-12 to R. 412-16; DGCCRF |
| Address format | `fr` (§4) | |
| Surcharge / service fee / tips | off / off / off by default, no presets | CMF L. 112-12; Code conso L. 112-1 (§8) |
| Card fees | online 1,5 % + 0,25 €, in person 1,4 % + 0,10 €, Tap to Pay + 0,10 €, label "EEA cards" | stripe.com/fr/pricing |
| Short name | « France » | |

## 2 · The language

- **The locale:** one line in `lib/i18n/locales.ts` (`LOCALES` and `LANGUAGE_BASES`). `scripts/split-messages.cjs`
  generated the rest: 111 namespace files, and the lazy browser loaders.
- **How it was translated:** split into ten parts, each translated against one brief (`STYLE.md`, kept with the scratch
  files). The brief sets out:
  - the glossary's FR « Use » terms, plus a term base for everything else;
  - « vous »;
  - the typographic apostrophe ’ (a straight ' breaks ICU);
  - no-break spaces before « : ; ! ? »;
  - brand names kept;
  - placeholders never inflected.

  Each part was checked on its own, then the whole file.
- **A consistency pass followed.** Every fix is a rule, kept in a fix layer:
  - "van" → « camion » everywhere (three parts had chosen different words);
  - "map" → « plan », because « carte » is the menu, and a bank card;
  - 💷 → 💶;
  - the UK sample places on posters → French places (Lyon, Villeurbanne…);
  - quoted button names match the buttons;
  - decimal examples written « 3,5 », « 0,50 ».
- **Words the brief fixed:**
  - Pay at Hatch → « Paiement sur place » (feature) and « Payer au retrait » (button);
  - Pay as you go → « Sans abonnement »; Unlimited → « Illimité »; Pro unchanged;
  - « essai gratuit »;
  - the list of dishes → « la carte »; a set meal → « formule ».
- **Plan names** are in the language file (`planNames.*`), as languages-1 designed. Pro keeps its name.
- **The order button (French law, found on the way):** Code de la consommation L. 221-14 requires the button that places
  an order to say clearly that the order means paying ("commande avec obligation de paiement" or an unambiguous
  equivalent).
  - The pay-at-the-truck button is « Commander et payer au retrait ».
  - The card button already says « Payer {amount} ».
- **"Today" / "Tomorrow" (found by the hero-image run):** `lib/event-display.ts` wrote them in English for every truck.
  - A non-English locale now takes Intl's own words (« Aujourd'hui », « Demain »).
  - English is unchanged, and nothing is looked up for it.

## 3 · The automatic checks, in plain English

`node scripts/translation-check.cjs --locale fr-FR` finds **0 structural problems**: every key is present, and every
placeholder, plural and tag is identical to en-GB. The flags are not errors. The full table is
`docs/france-1-translation-flags.md`.

| Flag | Count | What it is | Verdict |
|---|---|---|---|
| English left | 75 | Words spelled the same in both languages (Halal, Lactose, Lupin, Kebab, Tacos, Wraps), "WhatsApp Manager", registrar screens' own labels ("Add record", "Save"), example names (Sarah, Dominic) | Correct as they are. 171 reviewed French words that look English (« page », « planning », « options ») are listed in `docs/i18n/same-words/fr.json` so they are not flagged |
| Glossary | 69 | 23 use the setting's name « capacité de la cuisine » where the glossary wants the feature phrase « limiter le nombre de commandes par créneau ». 19 use the noun « précommande ». 19 say « événement privé » where the glossary says « privatisation ». 7 are Messenger/Instagram replies (the glossary term names WhatsApp) | The first two are right for labels. The third needs your call (§13): **« privatisation » means hiring the truck privately, which is not the app's private event** |
| Length | 219 | French is longer: « Enregistrer », « Commander et payer au retrait », « Confidentialité » | Measured, not guessed: **0 of 1,770 French screens overflow at 390px** (§10) |
| Drift | 234 | The back-translation uses different words for the same meaning: "Something went wrong" → « Une erreur s'est produite », ASAP → « Au plus tôt », "hatch" → « comptoir » | Read in full; none changes the meaning. The deliberate ones are below |

**Drift that is on purpose:**

| Key | English | French says | Why |
|---|---|---|---|
| `order.placeOrder` | Place order | Order and pay on collection | L. 221-14 (§2) |
| `compare.fee.fixedAria` | Pence per order | Cents per order | euros |
| `posterWords.*`, `designEditor.sample.*` | The Kings Arms, Lavenham… | Le Café de la Place, Lyon… | French sample places |
| `customDomain.card.exampleDomain` | yourtruck.com | votrefoodtruck.fr | a French example |
| `menuBadges.allergen.Dairy` | Dairy | Milk (« Lait ») | the EU name |
| `eventCard.live` | Live | Ongoing (« En cours ») | the natural French word |

## 4 · The address format `fr`

- **Shape:** street (optional), ville (required), code postal (optional), and **no region**.
- **The code postal:**
  - 5 digits, written before the town (« 69002 Lyon »);
  - « 75 011 » is tidied to « 75011 »;
  - it covers a commune or arrondissement, never one premises.
- **Lines:**
  - « Place Bellecour, 69002 Lyon » in emails, invites and the "Customers see" line;
  - « 69002 Lyon » under a venue;
  - the geocoder adds « France ».
- **Places:** a town is a `locality`; no region is read or kept.
- **AI rules** (importer, screenshot reader, scraper):
  - French dates and times: « samedi 14 juin », « 18h30 » → 18:30, « de 18h à 22h »;
  - a 5-digit number next to a town is the code postal;
  - Paris, Lyon and Marseille keep the town name whatever the arrondissement code;
  - no "state".
- **Form behaviour:** like Ireland's — the "Customers see" line, a live postal check (a warning only), asterisks, and the
  region and suburb columns hidden.
- **Database:** the CHECK gains `'fr'` (block A, §9).

## 5 · TVA

**The rates** (CGI art. 279 m and n, art. 278-0 bis; entreprendre.service-public.gouv.fr F22399, which lists « Food-truck,
camion-pizza »):

| What is sold | Rate |
|---|---|
| Hot food and drinks to take away, for immediate consumption | **10 %** |
| Food sold in a sealed container that can be kept (eaten later) | 5,5 % |
| Alcohol | 20 % |

- **The source's own words:** « Les sandwichs, quiches, pizzas, crêpes, frites, kébabs, hamburgers … vendus pour une
  restauration à emporter sont facturés au taux de 10 % ».
- **No rate change for 2026:** the Senate amendments that would have moved takeaway food to 20 % were not adopted.
- **Mixed orders:** without a per-item split, a mixed order takes the highest rate.

**How it is built** (data, as Canada's provinces):

1. **The default is data.** The `fr` address format carries `includedTax: { label: 'TVA', milli: 10000 }`.
2. **The resolver** gives a French truck's prices an *included* rate: the truck's own `tax_rate_milli`, otherwise 10 %.
   - GB and IE, whose formats carry none, are exactly as before: no rate, even if a truck holds a stale one.
3. **Nothing is ever added to a French price.**
   - The order's snapshot keeps the rate with zero added tax, so 24,00 € of food is a 24,00 € total.
   - `includedTaxLine()` words it after the total: « Dont TVA 10 % : 2,18 € » (24 × 10 / 110, rounded once). It appears on
     the customer confirmation email (HTML and text) and on the 58 and 80 mm tickets.
   - It is **never one of the added lines**, so no fold or total can include it.
4. **Manage › Payments** shows France one row:
   - « TVA incluse dans vos prix », with a placeholder of 10;
   - under the box: « Laissez vide pour appliquer 10 %… Les produits emballés … 5,5 % et l'alcool 20 % »;
   - GB and IE still show no charges card.
   - The route accepts a French rate. It still refuses one for GB.

**Not built: a TVA rate per item.** A truck selling alcohol or sealed food sets one rate for everything (§13 Q3).

## 6 · Allergens

**The rule** (Code de la consommation R. 412-12 to R. 412-16):

- It comes from **Art. 1** of Décret 2015-447, codified there. The brief's "Art. 4" only sets the start date (1 July 2015).
- **R. 412-14:** the information must be « sous forme écrite, de façon lisible et visible ». It may also be a written,
  visible notice saying where it is, which the customer can consult « directement et librement ».
- **Oral information alone is not enough:** « doit se faire par écrit » (ministerial answer, JO 18 Oct 2016).
- **One document for the whole menu is accepted.** The DGCCRF accepted « un tableau à double entrée » covering every
  product (same answer). Service-public F32192 lists « un cahier répertoriant les allergènes présents dans les plats
  servis ».

**So `allergen_card_only_allowed = true`**, on these conditions:

- the card names every dish and its allergens, in words, not codes;
- it is available before ordering.

Careful: service-public F32192 also says the rule « ne s'applique pas à la restauration à emporter ». That contradicts
INCO art. 44 and R. 412-13, so it is **not** relied on.

**What a French truck sees:**

- The EU 14 are the `uk14` set; the **stored** labels stay English, as the rest of the system reads them.
- `lib/allergen-label.ts` shows them in French on the order page, the menu list, the toggles, the allergen wizard and
  the card text: Gluten, Crustacés, Œufs, Poissons, Arachides, Soja, Lait, Fruits à coque, Céleri, Moutarde, Sésame,
  Sulfites, Lupin, Mollusques.
- Every English locale shows the stored label exactly; nothing is looked up.

**The WhatsApp guard** (`lib/allergen-guard/fr.json`, Option B: absence and safety words only):

- **The words:** « allerg- », « intoléran- », « cœliaque / coeliaque », « anaphyla- », « EpiPen », « sans gluten / lactose /
  lait / œuf / arachide / noix / fruits à coque / … », « convient aux », « adapté aux », « traces de », « contamination
  croisée ».
- **No bare allergen names.** « Il y a du fromage dans la Reine ? » reaches the AI, which answers from the tags and adds
  the French caveat.
- **The caveat's words for each tag:** Dairy → « lait, fromage, crème, beurre… », Eggs → « œuf, oeuf ».
- **Proved in `france-1.cjs` §6:**
  - 11 French safety questions are caught, and 5 plain ones are not;
  - a real French allergen question gets the fixed allergen reply (« … informations sur les allergènes … »);
  - a plain French menu question is answered (« Nous proposons Pizzas à partir de 12,00 € … »), with no fail-safe;
  - English answers are unchanged.

## 7 · Decimal comma

- **`lib/decimal-input.ts`** reads the separator from Intl, never from a country code.
  - In a decimal-comma locale: « 12,50 » → "12.50", and « 1 234,50 » → "1234.50"; "12.50" still works.
  - In a decimal-point locale (every English one), the typed text is passed on **exactly as typed**.
- **The number boxes** (item price, import review, deal price and original price) go through `useDecimalBox`.
  - English gets exactly `{ type: 'number', value, onChange }` as before.
  - French gets a text box with `inputMode="decimal"` that keeps « 12, » while you type.
- **The text boxes** (extras, event pricing, tax / fee / service fee) normalise before they parse or save, and show stored
  values with a comma.
- **French hints** say « 3,5 » and « 0,50 ».

## 8 · Cards in France

- **Card-brand choice:** the Payment Element shows it **by default** ("The Payment Element supports customer card brand
  choice, by default"), as Regulation (EU) 2015/751 art. 8 requires for co-badged Cartes Bancaires cards.
  - The rule applies by **merchant of record**. HatchGrab's charges are direct, on the truck's own full-dashboard French
    account, so the selector shows.
  - Nothing to change: `on_behalf_of` is not used (no `onBehalfOf` needed), and the `cartes_bancaires_payments`
    capability is only needed for Express/Custom accounts.
- **Holds:** manual capture works with CB ("Manual capture support: Yes").
  - Stripe publishes no CB-specific hold window. HatchGrab assumes no fixed window: it captures at completion, and the
    stranded-authorisation sweep catches the rest.
  - **Tap to Pay on iPhone:** Stripe says the brand choice must be built by the app ("requested_priority"); WisePad 3 and
    the S700 show it themselves (§13 Q4).
- **Fees** (stripe.com/fr/pricing):
  - online 1,5 % + 0,25 € ("cartes standard de l'Espace économique européen");
  - premium EEA cards 2,8 % + 0,25 €;
  - Terminal 1,4 % + 0,10 € ("cartes de l'EEE"), plus 0,10 € per Tap to Pay authorisation.
- **The region label** stays "EEA cards" in the row, the English convention of every row.
  - It is **shown by id in French** (`planFeatures.cardRegion.EEAcards` → « cartes de l'EEE »), so French sentences read
    « … sur les cartes de l'EEE standard » and not « sur les EEA cards ».
  - English rows show their stored label exactly.
- **No surcharge:** CMF L. 112-12, « Le bénéficiaire ne peut appliquer de frais pour l'utilisation d'un instrument de
  paiement donné ».
- **No service fee:** Code de la consommation L. 112-1 and the arrêté of 3 December 1987 require the price shown to be
  « la somme totale toutes taxes comprises … qu'ils devront effectivement payer ».
- **Tipping:** off by default, with no presets.

## 9 · NOT RUN SQL — run order

**Block A, "RUN NOW"** (before or after the deploy; either is safe). This is `supabase/migrations/20261033_france_address_format.sql`:

```sql
begin;
alter table public.country_settings drop constraint country_settings_address_format_chk;
alter table public.country_settings add constraint country_settings_address_format_chk
  check (address_format in ('gb', 'us', 'ie', 'au', 'nz', 'ca', 'fr'));
commit;
```

**Block B, "RUN AFTER DEPLOY", after block A.** It inserts the row switched off, then its prices. This is
`supabase/migrations/20261034_france_row.sql`, where every value carries its source in a comment. `scripts/france-1.cjs`
parses this file, so the proof is the SQL you will run:

```sql
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
  platform_fee_enabled, fees_taxed, allergen_card_only_allowed
) values (
  'FR', 'France', false, 'EUR', 'fr-FR', '24h', 'dmy', 'monday',
  '33', 'fr', array['Europe/Paris'], 'Europe/Paris',
  true, 'TVA',
  false, null, false, '{}'::text[],
  false, false, '{}'::numeric[], 'uk14',
  null, null, null, null, null, null,
  1.50, 25, 1.40, 10,
  10, 'EEA cards',
  null, null, null, null, 'france-1 draft',
  'France', '06 12 34 56 78', 'length', 'km',
  'truck', null, null,
  null, null,
  false, false, true
);
insert into public.plan_prices (plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor) values
  ('payg',      'FR',    0,      0, 99,    0),
  ('pro',       'FR', 2900, 400000, 99, 2900),
  ('unlimited', 'FR', 6900,   null,  0, 6900);
commit;
```

- **Why after the deploy:** the deployed code is what reads fr-FR, the `fr` format and its included TVA, and the French
  guard words.
- **Rows before prices:** `plan_prices` references `country_settings`. Its trigger only demands prices once a country is
  enabled.
- **Switching France on later** is Admin › Countries, after §13 is settled.

## 10 · Proof

**`scripts/france-1.cjs` (new, in the sweep): 74/74, and 75/75 with `--shots`.** It uses France switched on in fixtures,
with the row parsed from the SQL above.

1. **/fr, /features and /compare:**
   - in French, in euros (« 29 € », « 69 € »), with « Sans abonnement / Pro / Illimité »;
   - og:locale fr_FR, canonical /fr;
   - JSON-LD in EUR with inLanguage fr-FR;
   - **hreflang reciprocal**: /uk and /fr both list en-GB, en-US, en-IE, en-AU, en-NZ, en-CA, fr-FR and x-default;
   - the country menu links /fr;
   - the sitemap lists /fr with fr-FR;
   - /llms.txt has a France (EUR) section;
   - the plans PDF is `lang="fr-FR"`;
   - the hero images.
2. **France switched off, or no row (today):** /fr 302s to /uk, and France is in no hreflang set, sitemap, menu or /llms.txt.
3. The language and law checks (§2–3).
4. The address format (§4).
5. TVA (§5).
6. Allergens and WhatsApp (§6).
7. Decimal comma (§7).
8. Cards (§8).
9. The SQL (§9).
10. The terms (§11).

**The French end-to-end run:**

```
node scripts/languages-1-e2e.cjs --locale fr-FR --currency EUR --time 24h,dmy,monday --out docs/france-1 --shots --dump
```

- **What it does:** a throwaway copy of the tree turns the language phases' fixture truck French, in euros, 24-hour,
  day-month and Monday-first. It then renders every surface those phases capture:
  - the order page, status page, customer emails and WhatsApp;
  - dashboard, KDS, tickets and operator emails;
  - setup and demo signup;
  - every Manage tab;
  - landing, /features, /compare and Billing.
- **The fixture's charge rules stay US-shaped** (tax added on top). France's own rules are proved in `france-1.cjs` §5.
- **Captured:** 7,368 views, 3,548 of them in French.
- **Overflow at 390px:** **0 of 2,008** French HTML views overflow because of the language. 65 scroll sideways in English
  too; these are capture artefacts (a fragment without its parent's padding, the fixed-width ticket). Times read
  « 17:00–21:00 ».
- **English left: 266 of 3,548 views, every one explained:**

| Views | What | Why it is not a product string that escaped |
|---|---|---|
| 125 | Words spelled the same in French or quoted from another product's screen: « Hot-dogs », « Kebab », « Tacos », « maximum », « pop-up », Halal, Lactose, « Portrait », registrar labels ("Records", "Target") | French, or not ours |
| 42 | API bodies: the English `error` beside a `code` | The screen words the code in French |
| 38 | `1d/copy` captures (en-GB constant exports) | Kept for older pins; the screens read messages |
| 24 | Fixture data: typed notes and dish names ("Sorry about this", "Crispy", "Dip"), the demo menu rows, the order page's injected English notices and payment-failed text, and the stub AI reply | The fixture's own text; the real page words each from its code |
| 6 | Setup data views | A refusal object worded by code; provisioning warnings for staff |
| 5 | Account emails | en-GB by design (an account is not tied to one country) |
| 5 | QR and poster engine defaults | The capture omits the words; Manage and the renderer pass `posterWords.poweredBy` |
| 4 | Reject-email sentence | The capture calls it without a locale; `lib/orders/reject-order.ts` passes the order's |
| 4 | Staff emails; a DNS label | To admin@ / quoted from the registrar |
| 4 | Billing's check and Cloudflare labels | The shown text (`worded`) is French |
| 3 | Legal pages' meta; JSON-LD names | Legal pages are en-GB; names |
| 2 | Auth pages | en-GB by design |
| 1 | `weekCaption` | unused |

**Screenshots** (`docs/france-1/`):

- 80 from the end-to-end run (20 surfaces × 2 engines × 2 widths);
- 20 of the real /fr pages, PDF and email (`france-1.cjs --shots`; none scrolls sideways);
- the three hero images.

**A gap in the languages-1 end-to-end run, fixed here.**

- Its view flattener never went into the order page and status page sections, which hold strings, not objects. So neither
  the English-left nor the overflow check saw those two pages, in languages-1 or in this run's first pass. Its "order-page"
  screenshot was a WhatsApp reply.
- The flattener and the screenshot selectors are fixed, and the run above includes both pages.
- languages-1's pseudo-language numbers should be read as covering everything except those two pages. The French run now
  covers them.

**Byte-identity, every live country (GB, US, IE, AU, NZ, CA).** Every capture was taken before france-1 started and again at
the end.

| What | Result |
|---|---|
| Captured views (every language phase, GB and US) | **8,890 / 8,890 identical** |
| Date, time and money answers (475 × 6 countries) | **2,850 / 2,850 identical** |
| Messages, each English locale | 4,993 keys: 0 changed, 0 removed, **49 added** (39 allergen names, 6 card-region names, the included-TVA line, the Manage TVA row) |
| Marketing: 18 country pages (GB, US, IE, AU, NZ, CA × 3), 6 plans PDFs, 2 sitemaps, /llms.txt, contact, privacy, terms | **identical** |
| Country-specific terms page | changed only by the France section, a pure insertion (prefix and suffix identical) |

## 11 · The terms

- `content/legal/country-specific-terms.md` gains a **France** section in the same shape and English as the others.
- **For food truck operators:**
  - you are the seller under the Code de la consommation;
  - pre-contract information, prices TTC in euros, no right of withdrawal for perishable food and dated catering
    (L. 221-28 4° and 12°), and access to a consumer mediator (L. 612-1);
  - the order button;
  - Stripe in euros, with the Cartes Bancaires brand choice and no surcharge;
  - allergens (R. 412-12 to R. 412-16; the card allowed on its own);
  - TVA, with the 10 % default shown on receipts, and no service fee;
  - French for consumer information (loi Toubon);
  - our prices in euros with reverse-charge VAT;
  - GDPR controller and processor;
  - notices and governing law (England and Wales, without removing French protections).
- **Privacy:** the GDPR and the loi Informatique et Libertés; data in the UK (adequacy); allergy notes; requests; complaints
  to the **CNIL** (www.cnil.fr; Service des plaintes, 3 Place de Fontenoy, 75007 Paris); marketing emails.
- **Dates:** the page's date and `TERMS_VERSION` were already 22 October 2026 / `2026-10-22` from this morning, and today is
  the same day, so both stay. No French signup can have accepted the earlier text, because France is switched off.

## 12 · Read-only SQL run

```sql
select * from country_settings where country_code in ('IE','CA') order by country_code;
```
```sql
select pp.* from plan_prices pp where pp.country_code = 'IE' order by pp.plan_key;
```
```sql
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint where contype = 'c' and conrelid in ('country_settings'::regclass, 'plan_prices'::regclass, 'trucks'::regclass) order by 1, 2;
```
```sql
select key, name, subtitle, description, is_public, active from plans order by sort_order nulls last, key;
```
```sql
select country_code, card_fee_region_label from country_settings order by country_code;
```
```sql
select (select count(*) from public.country_settings where country_code = 'FR') as fr_rows, (select count(*) from public.plan_prices where country_code = 'FR') as fr_prices, (select count(*) from public.trucks where country = 'FR') as fr_trucks, (select string_agg(tgname, ', ' order by tgname) from pg_trigger where tgrelid in ('public.country_settings'::regclass, 'public.plan_prices'::regclass) and not tgisinternal) as triggers;
```

- **Ireland's euro prices** match the brief: payg 0 / 0 / 99 / 0; pro 2900 / 400000 / 99 / 2900; unlimited 6900 / null / 0 /
  6900.
- **Canada is switched on** (enabled, 22 Oct), so it is treated as live.
- **The address-format CHECK** lacked `'fr'` (block A).
- **No FR row, prices or trucks yet.** The triggers are `country_settings_require_plan_prices` and
  `plan_prices_keep_enabled_countries_priced`.

## 13 · For you to decide (legal and product)

*Answered by Dominic on 22 October 2026: see §16.*

1. **No right of withdrawal, said on the checkout (L. 221-5 10°).**
   - A French online order must tell the customer, before ordering, that the 14-day withdrawal right does not apply
     (perishable food, catering on a set date: L. 221-28 4° and 12°).
   - The terms tell the truck. The **checkout does not say it yet**, because adding visible words there is your call.
   - Suggested line under the order button: « Commande de plats préparés pour une date donnée : pas de droit de
     rétractation (art. L. 221-28 du Code de la consommation). »
2. **The consumer mediator (L. 612-1).**
   - Every French seller must offer a free consumer mediator and show its details. That is the truck's obligation, and
     the terms say so.
   - Do you want a field in Manage for the truck's mediator, shown on the order page and in emails? Not built.
3. **TVA per item.**
   - One rate per truck is built: default 10 %, the truck can override.
   - A truck selling alcohol (20 %) or sealed food (5,5 %) alongside hot food needs per-item rates to split its TVA, as
     service-public's food-truck example describes. Without them the whole order takes one rate.
   - Build per-item rates before switching on?
4. **Tap to Pay on iPhone and Cartes Bancaires.**
   - For co-badged cards on Tap to Pay on iPhone, Stripe says the app must offer the brand choice itself
     (`requested_priority`).
   - The online Payment Element and the WisePad 3 / S700 readers do it automatically.
   - Needed before French trucks take Tap to Pay on iPhone. Not built.
5. **The glossary's "Private event" row.**
   - It says « privatisation », but the app's private event (a date hidden from the map) is « événement privé »;
     « privatisation » means hiring a truck.
   - Shall I split the glossary row into "private hire" (« privatisation ») and "private event" (« événement privé »)?
     That clears 19 flags.

Also worth knowing:

- The automatic translation is the review, as decided. 234 drift flags were read, and none changes the meaning.
- The legal-text quotes for the Code de la consommation came from an open-data mirror of Légifrance (Légifrance blocked
  automated reads). Re-check the exact article wording on Légifrance before relying on it.

## 14 · Re-pins (only for this approved change)

| Harness | What moved |
|---|---|
| `languages-1.cjs` | fr-FR has a guard word list now, so the "no list → fail safe" proof uses Italian (it-IT). The pseudo-language is spliced in after fr-FR. Its catalog check strips only eo-XA's lines |
| `languages-1-e2e.cjs` | the locale lists matched by shape; `--currency`, `--time` and `--out` added; the same-words list for a real language; the flattener and selectors fixed (§10) |
| `_native-prices-fixtures.cjs` | the Sweden patch's anchor names `FR: 'fr'`; a FR fixture row (not in the live lists) |
| `_messages-parity-1e.cjs` | the 8 newer allergen labels and 3 card-region labels named as deliberately new words |
| `translation-check.cjs` | glossary terms match ' or ’; numbers compared in the locale's decimal form; plan keys for any active plan; same-words lists |

## 15 · Files

**New:**
- `messages/fr-FR.json`
- `docs/i18n/back/fr-FR.json`
- `docs/i18n/same-words/fr.json`
- `lib/allergen-guard/fr.json`, `lib/allergen-label.ts`
- `lib/decimal-input.ts`, `components/shared/useDecimalBox.ts`
- `supabase/migrations/20261033_france_address_format.sql`, `supabase/migrations/20261034_france_row.sql` (NOT RUN)
- `scripts/france-1.cjs`, `scripts/_france-1-fixtures.cjs`
- `public/screenshots/{customer-order,dashboard-v4,kitchen}-fr.png`
- `docs/france-1/` (screenshots, findings)
- `docs/france-1-translation-flags.md`

**Changed:**
- `lib/i18n/locales.ts` (one line), `lib/marketing-country.ts` (/fr), `lib/address-formats.ts` (`fr`, `includedTax`)
- `lib/order-charge-rules.ts`, `lib/order-charges.ts`, `lib/order-charge-lines.ts`, `lib/email.ts`, `lib/printing/ticket.ts`,
  `lib/printing/mapOrderToTicket.ts`, `lib/charge-settings.ts`, `components/manage/ChargesCard.tsx` (included TVA)
- `lib/card-fees.ts`, `components/manage/PaymentsTab.tsx` (card region)
- `lib/allergen-guard.ts`
- `lib/event-display.ts` (Today / Tomorrow)
- the allergen display sites: `app/manage/[token]/page.tsx`, `app/trucks/[slug]/order/page.tsx`,
  `components/manage/primitives.tsx`
- the price boxes: `components/manage/ExtrasEditor.tsx`, `components/shared/PriceControls.tsx`
- `lib/landing-screens.ts` and `scripts/screenshots/*` (the FR entry)
- `content/legal/country-specific-terms.md`
- `messages/en-GB.json` (49 keys added, none changed) and the generated catalogue
- `scripts/harnesses.json`

## 16 · Follow-up (Dominic's answers, 22 October 2026)

1. **Right of withdrawal: no checkout line.** Telling the customer is the truck's duty as seller, and the France terms cover
   it. The order page stays as it is.
2. **Consumer mediator: no field.** Offering one is the truck's duty, and the France terms cover it.
3. **TVA per item: not now.** Added to the backlog below.
4. **Tap to Pay on iPhone and Cartes Bancaires:** added to the backlog below, for when Tap to Pay on iPhone is built.
5. **The glossary row is split. Done:**
   - **`docs/i18n/seo-glossary-eu.md`:** the FR table now has two rows:
     - "Private hire" → « privatisation » / privatiser un food truck (hiring a truck);
     - "Private event" → « événement privé » (the app's date hidden from the map, with its own ordering link).
   - **`scripts/glossary-build.cjs`:** "Private hire" gets its en-GB pattern (`private hire`).
   - **`lib/i18n/glossary/fr.json`** is rebuilt. It is the only file that changed; `glossary-build --check` passes for all
     5 languages.
   - **translation-check fr-FR:**
     - **Structural 0** (exit 0);
     - glossary flags **69 → 50**: the 19 « événement privé » flags are cleared;
     - the one en-GB "Private hire" message (`eventTypes.newType.chips.privateHire`) already says « Privatisation »;
     - every other count is unchanged (english 75 · length 219 · drift 234 · banned, invariants, numbers, plans 0).
   - **`docs/france-1-translation-flags.md`** is refreshed. Only its counts changed.
   - **The sweep:** `node scripts/run-harnesses.cjs` ran 164: 164 passed, 0 failed. No re-pins were needed.
   - **Note:** the DE, NL, ES and IT "Private event" rows also name hiring a truck (« mieten », « huren », « alquiler »,
     « noleggio »). Each language's own prompt should split its row the same way. They are not changed here.

No SQL was run for this follow-up, and nothing in the database changed.

### Backlog

- **TVA per item.** Per-item rates (20 % alcohol, 5,5 % sealed food, 10 % hot food) are needed so a mixed order splits its
  TVA, as service-public's food-truck example does. Until then the whole order takes the truck's one rate (default 10 %,
  overridable).
- **Cartes Bancaires brand choice on Tap to Pay on iPhone** (`requested_priority`). Build it with Tap to Pay on iPhone,
  before French trucks use it. The online Payment Element and the WisePad 3 / S700 readers already offer the choice.

## Undo (only if Dominic asks)

Nothing has been run against the database. If blocks A and B are later run and need undoing, run in this order:

```sql
begin;
delete from public.plan_prices where country_code = 'FR';
delete from public.country_settings where country_code = 'FR';
alter table public.country_settings drop constraint country_settings_address_format_chk;
alter table public.country_settings add constraint country_settings_address_format_chk
  check (address_format in ('gb', 'us', 'ie', 'au', 'nz', 'ca'));
commit;
```
