# STYLE — Swahili (sw-TZ, Tanzania)
- **Tanzanian Swahili, as Uber Eats Tanzania (sw) and CRDB Bank write** — clear everyday business Swahili, not Kenyan Swahili and not Sheng. Tanzanian forms: mgahawa/migahawa, simu ya mkononi, muda, oda, menyu, programu (app/software), mtandaoni (online), Lipa kwa simu. Kenyan forms to avoid: mkahawa, simu ya rununu, Lipa na M-Pesa, Till Number, Buy Goods.
- **Address: singular wewe** with singular imperatives and -ako for operators (B2B screens) AND customers (order page, e-mails): “Weka oda”, “Agiza mapema”, “Chagua muda wa kuchukua”, “Pakia menyu yako”, “Kuza biashara yako” (CRDB), “Jisajili bila malipo” (Uber TZ). Never plural -eni imperatives or ninyi/wenu. Buttons: bare imperative (“Hifadhi”, “Pakia”, “Ghairi”, “Endelea”).
- **Loanwords:** oda (an order; plural oda), menyu, POS, take away, QR as “msimbo wa QR”, app as “programu” (or “app” in casual customer copy), online as “mtandaoni”. “food truck” stays in Latin letters and takes class 9/10 agreement: food truck yako, food truck zako; first mention may add “(gari la chakula)”.
- **Terms (locked):** food truck, chakula cha mtaani, oda ya mapema, Agiza mapema, kuchukua oda, muda wa kuchukua oda, take away, nafasi ya muda, skrini ya jikoni (KDS), POS (“si POS”), mashine ya kadi, menyu, ofa ya mlo (combo), shughuli binafsi, kukodi food truck kwa shughuli, bila kamisheni, majibu ya kiotomatiki ya WhatsApp, oda ya papo hapo, vifurushi (plans).
- **Placeholders:** Swahili agreement prefixes attach to verbs, not names — keep placeholders free-standing: “kutoka {truck}”, “food truck: {truck}”, “nchini {country}”. Never build a prefix onto a placeholder.
- **Plural categories (CLDR sw): one, other** — “oda 1” / “oda 5” (class 9/10 loans do not change), “gari 1” / “magari 3”, “kifurushi 1” / “vifurushi 2”, “dakika 1” / “dakika 10”; the noun comes BEFORE the number (“oda #”, “dakika #”).
- **Numbers:** comma thousands and point decimal as Tanzania writes them (1,234.5); prices “TSh 15,000” (no decimals in practice); percent “20%”; times as the app formats them (24-hour). Phone: 0712 345 678 (+255 712 345 678). Addresses: Mtaa, Kata, Wilaya, Mkoa (postcodes exist but are rarely written; P.O. Box = “S.L.P. 1234”). Email/domain: wewe@foodtruckyako.co.tz.
- **Sample places:** Dar es Salaam (Kariakoo, Msasani, Mikocheni, Upanga, Mbezi Beach), Arusha, Mwanza, Dodoma, Zanzibar (Stone Town, Forodhani), Moshi; venues: “soko la usiku”, “bustani ya jiji”, “tamasha la chakula”, “uwanja wa mpira”, “ufukweni”.
- **Order button:** Tanzania has no statutory EU-style order-button wording known (Fair Competition Act 2003 / Electronic Transactions Act 2015 — not re-checked this session); market norm “Weka oda” (Uber TZ “kuweka oda”); card button “Lipa {amount}”.
- **Pay at Hatch:** feature name **“Lipa Unapochukua”**, short label **“Lipa ukichukua”**. Never “Lipa unapopokea” / “malipo wakati wa kupokea” (cash on delivery) and never “Lipa Namba” (a mobile-money till). “At the hatch” elsewhere = “kwenye food truck” / “dirishani”.
- **Plans:** Pro; “Lipa kadri unavyotumia” (Pay as you go — “bila ada ya kila mwezi”); “Bila kikomo” (Unlimited); “Jaribio bila malipo” (Free trial).

## From the country research (seo/sw-TZ.json) — binding where it does not contradict the rules above

- Address form (research): Singular wewe with singular imperatives and -ako possessives, for operators and customers alike: CRDB Bank (Swahili merchant page) “Kuza biashara yako”, “Tengeneza tu msimbo wa QR na uonyeshe kwa wateja”, “Unaweza kutembelea tawi … nawe”; Uber Eats TZ (sw) “Agiza mapema”, “chagua mgahawa”, “Jisajili bila malipo”, “Anza sasa”. No plural ninyi/-eni imperatives. Everyday Tanzanian business Swahili with the loanwords Tanzanians use (oda, menyu, POS, take away).
- "Pay at Hatch": feature name **Lipa Unapochukua**, short label/button **Lipa ukichukua**.
- Plan names (planNames.<key>.name; "Pro" keeps "Pro" and gets NO name key): payg **Lipa kadri unavyotumia**, unlimited **Bila kikomo**, trial **Jaribio bila malipo** (capitalise as a name), demo and tester: translate "Demo" / "Tester".
- Core terms (use them; TERMS.md records the rest):
  - foodTruck: food truck (gari la chakula)
  - foodTruckPlural: food truck (magari ya chakula)
  - streetFood: chakula cha mtaani
  - mobileCatering: huduma za upishi zinazotembea
  - preOrder: oda ya mapema
  - orderAhead: Agiza mapema
  - pickupCollect: kuchukua oda
  - pickupTime: muda wa kuchukua oda
  - takeaway: take away (chakula cha kubeba)
  - timeSlot: nafasi ya muda
  - kitchenDisplay: skrini ya jikoni (KDS)
  - pos: POS (mashine ya mauzo)
  - cardReader: mashine ya kadi (POS)
  - menuListOfDishes: menyu
  - combo: ofa ya mlo (combo)
  - privateHire: kukodi food truck kwa shughuli
  - privateEvent: shughuli binafsi
  - mobilePhone: simu ya mkononi
  - commissionFree: bila kamisheni
  - whatsappAutoReply: majibu ya kiotomatiki ya WhatsApp
  - walkUpOrder: oda ya papo hapo
  - orderButton: Weka oda
  - payAtHatchFeature: Lipa Unapochukua
  - payAtHatchShort: Lipa ukichukua
  - payAsYouGo: Lipa kadri unavyotumia
  - unlimited: Bila kikomo
  - freeTrial: Jaribio bila malipo
- Research decisions/notes (for context; do not stop on them):
  - Food-truck word: recommend the loanword “food truck” (class 9/10 agreement: food truck yako, food truck zako) with “gari la chakula / magari ya chakula” on first mention and as a secondary keyword. Avoid “lori la chakula” as the main word: Jiji uses “Malori ya Chakula” for vehicles for sale, and lori suggests a big lorry.
  - Pay at Hatch: recommend feature “Lipa Unapochukua” / short “Lipa ukichukua”. Avoid “Lipa unapopokea / malipo wakati wa kupokea” (cash on delivery) and do not reuse “Lipa Namba” (an M-Pesa / Lipa kwa Simu merchant till number, a different thing).
  - Payments: Tanzanian customers pay mostly with mobile money (M-Pesa, Mixx by Yas, Airtel Money via Lipa kwa Simu), cards less so — card-only online payment means Pay at the truck will be the main path in TZ.
  - Plans: “kifurushi / vifurushi” (the telecom word for a paid bundle) used for plan; “Pro” stays; “Lipa kadri unavyotumia” for Pay as you go — a native check is advised.
  - Kenyan readers understand this Tanzanian copy; do not mix Kenyan forms (rununu, Lipa na M-Pesa, Till Number, Sheng).

## SEO strings (parts 08 and 09 ONLY): use these for these keys — they carry the researched search terms. Keep placeholders/tags exactly; you may polish wording but keep the primary keyword first in titles, titles ≤60 chars ({country} ≈ 10), descriptions 120–155.

Primary keyword per page: {"landing":"mfumo wa oda mtandaoni kwa food truck","features":"linganisha vifurushi na huduma","faq":"maswali kuhusu mfumo wa oda kwa food truck","comparison":"ulinganisho wa mifumo ya oda kwa food truck","compare":"kikokotoo cha gharama za oda mtandaoni"}

```json
{
 "landing.meta.title": "Mfumo wa oda mtandaoni kwa food truck — HatchGrab {country}",
 "landing.meta.description": "Pokea oda na oda za mapema kwenye eneo lako bila foleni. Mfumo wa oda na skrini ya jikoni kwa food truck na catering nchini {country} — si POS.",
 "landing.jsonLd.subCategory": "Mfumo wa oda kwa food truck na huduma za upishi zinazotembea",
 "landing.jsonLd.description": "Oda, oda za mapema na skrini ya jikoni kwa food truck na huduma za upishi zinazotembea nchini {country}.",
 "landing.jsonLd.audience": "Wamiliki wa food truck na wafanyabiashara wa huduma za upishi zinazotembea",
 "landing.hero.title": "Mfumo wa oda uliotengenezwa kwa ajili ya <lean>food truck.</lean>",
 "landing.does.title": "Umetengenezwa kwa ajili ya food truck, si migahawa.",
 "landing.faq.metaTitle": "Maswali yanayoulizwa mara kwa mara | HatchGrab",
 "landing.faq.metaDescription": "Majibu ya moja kwa moja kwa wamiliki wa food truck kuhusu bei za HatchGrab, jinsi ya kuanza, kupokea oda na malipo — kabla hujajisajili.",
 "featuresPage.metaTitle": "Linganisha vifurushi na huduma — HatchGrab {country}",
 "compare.meta.title": "Kikokotoo cha gharama — HatchGrab {country}",
 "compare.meta.description": "Linganisha gharama zako za sasa za oda mtandaoni na mwaka mmoja ukitumia HatchGrab — pata makadirio ndani ya dakika moja tu.",
 "comparison.meta.title": "Ulinganisho wa mifumo ya oda kwa food truck 2026: bei",
 "comparison.meta.description": "Mifumo ya oda kwa food truck: oda za mapema na muda wa kuchukua, uwezo wa jikoni, ratiba ya wiki, ada na mkataba — tumehakiki tovuti ya kila mtoa huduma.",
 "comparison.meta.about": "Mifumo ya oda mtandaoni kwa food truck",
 "comparison.h1": "Ulinganisho wa mifumo ya oda kwa food truck 2026",
 "aboutPage.meta.description": "HatchGrab hutengeneza programu kwa food truck na catering: oda mtandaoni, muda wa kuchukua na maswali machache yanayojirudia. Mwanzilishi: Dominic Bonini.",
 "truckPage.meta.orderTitle": "Agiza kutoka {truck}",
 "truckPage.meta.orderDescription": "Agiza mapema kutoka {truck} kisha uchukue oda yako kwenye food truck."
}
```

## Glossary (the locked Use terms — headings, buttons and feature names MUST use the bold Use term)

## SW — Swahili (Tanzania)

*languages-world-2, 11 November 2026. Singular wewe with singular imperatives and -ako (Agiza mapema, Weka oda, Kuza biashara yako), for operators and customers, as Uber Eats TZ (sw) and CRDB Bank write. Tanzanian business Swahili uses the loanwords oda, menyu, POS and take away. Traps: Kenyan forms (simu ya rununu, mkahawa, Lipa na M-Pesa, Till Number, Sheng); “Lipa unapopokea / malipo wakati wa kupokea” (cash on delivery); “Lipa Namba” (a mobile-money till number, not pay-at-the-truck); “lori la chakula” as the main food-truck word.*

| Concept | Use | Alternatives / Avoid | B2B/B2C | Conf. | Notes |
|---|---|---|---|---|---|
| Food truck | **food truck** | gari la chakula (pl. magari ya chakula); avoid lori la chakula | Both | Low | Jiji TZ category “Malori ya Chakula” (vehicles for sale) |
| Street food | **chakula cha mtaani** | chakula cha barabarani | Both | Med | Airbnb sw TZ title |
| Pre-order | **oda ya mapema** | agizo la mapema (KE-leaning) | Both | Med | Uber TZ “Agiza mapema” |
| Click & collect | **kuchukua oda** | Chukua mwenyewe; avoid kusafirisha (delivery) | Both | Med | Uber TZ “kuchukua oda zao ana kwa ana” |
| Pickup time | **muda wa kuchukua oda** | saa ya kuchukua (clock time) | B2C | Med |  |
| KDS | **skrini ya jikoni (KDS)** |  | B2B | Low |  |
| POS / till | **POS (mashine ya mauzo)** | Terminal ya POS | B2B | Med | CRDB “Terminal ya POS” |
| Card reader | **mashine ya kadi (POS)** |  | B2B | Med |  |
| Menu (list of dishes) | **menyu** | orodha ya vyakula | Both | High | Uber TZ “kuvinjari menyu” |
| Meal deal / combo | **ofa ya mlo (combo)** | mlo kamili | B2C | Low |  |
| Allergens | **viambato vinavyosababisha mzio** | aleji (colloquial) | Both | Low |  |
| Private hire | **kukodi food truck kwa shughuli** |  | Both | Low |  |
| Private event | **shughuli binafsi** | sherehe binafsi | Both | Low |  |
| Commission-free | **bila kamisheni** | bila makato | B2B | Med | CRDB “makato”, Uber “ada” |
| WhatsApp auto-reply | **majibu ya kiotomatiki ya WhatsApp** |  | B2B | Med |  |
| Walk-up order | **oda ya papo hapo** | oda ya mteja aliyefika | B2B | Low |  |

| **SW** | Lipa Unapochukua | Lipa ukichukua | Lipa kadri unavyotumia | Bila kikomo | Jaribio bila malipo |
