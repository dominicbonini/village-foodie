# STYLE — Albanian (sq-AL, Albania)
- Standard Albanian (gjuha standarde, as written in Albania), Latin script with **ë** and **ç** always typed (never “e”/“c” as a shortcut). Not Kosovo-specific vocabulary or examples; prices in **lekë** (ALL), not euro.
- OPERATORS (B2B screens, operator e-mails): formal plural **ju/juaj** with plural imperatives in sentences (“Ngarkoni menunë”, “Ruani ndryshimet”), as Albanian POS vendor easybar.al writes (“Zgjeroni punën me modulet që ju duhen”, “Na kontaktoni”). Buttons and short labels: bare imperative, as Albanian UIs do (easybar “Hyr”, “Lexo më shumë”; Wolt AL “Porosit në linjë”): “Ruaj”, “Shto”, “Porosit”.
- CUSTOMERS (order page, status page, customer e-mails, WhatsApp replies): also polite **ju** in sentences (“Porositni paraprakisht dhe merreni te food truck-u”), short imperative buttons; warm and brief. Never ti-form sentences.
- Loanwords: **food truck** stays in Latin, inflected with a hyphen (food truck-u, food truck-et, food truck-eve) — prefer constructions that need no ending (“për food truck”, “food truck: {truck}”). “online” is common (Wolt also writes “në linjë”); “app” → **aplikacion**; “QR” → **kod QR**; “take away” as Albanian sites write it; “WhatsApp” unchanged.
- **Cases:** Albanian adds case endings and the definite article to the noun — never on a placeholder (“{truck}-i” ✗). Use apposition, a colon or brackets: “food truck-u {truck}”, “U hoq: {name}”, “({country})”.
- Plural categories (CLDR sq): **one, other** — “1 porosi”, “2 porosi” (porosi is invariable), “1 artikull”, “5 artikuj”; write both cases for every count plural.
- Numbers: 1 234,5 (space as thousands separator, comma decimal); percent “20%”; money “1 200 lekë” (the app’s Intl formatting renders ALL). Phone example: +355 69 123 4567 (mobile 06X). Postcode 4 digits (1001 Tiranë). Email/domain: ju@foodtruckuijuaj.al.
- Sample places: Tiranë (Blloku, Pazari i Ri, Parku i Liqenit), Durrës (Shëtitorja), Vlorë (Lungomare), Shkodër, Korçë, Sarandë; venues: “Sheshi Skënderbej”, “tregu i fermerëve”, “festival ushqimi rrugor”, “parku i qytetit”.
- Order button: **Ligji nr. 9902/2008 “Për mbrojtjen e konsumatorëve” (i ndryshuar), neni 37/2** requires the button to read “porosi me detyrim pagese” or an equally clear equivalent → final button **“Porosi me detyrim pagese”**; card button “Paguaj {amount}”.
- Pay at Hatch: feature **“Pagesë në marrje”**, short label **“Paguaj në marrje”**. NEVER “pagesë në dorëzim” / “paguaj në dorëzim” (= cash on delivery; there is no delivery). Pickup = **marrje** (Wolt AL “Vetëm marrje”), never “dorëzim”.
- “Not a POS”: write **“jo sistem arke”** — in Albania “POS” also means the card terminal. Plans: **Pa abonim mujor** (Pay as you go), **Pro**, **Pa limit** (Unlimited), **Provë falas** (Free trial).
- Apostrophes: Albanian rarely needs one; if a quote mark is needed use “…” — never a straight ' (ICU).

## From the country research (seo/sq-AL.json) — binding where it does not contradict the rules above

- Address form (research): Formal plural ju in body copy (easybar.al, Albanian POS vendor: “Zgjeroni punën me modulet që ju duhen”, “Na kontaktoni”, “Na tregoni si punon bari… juaj”); buttons and short UI labels in the bare imperative as Albanian UIs write them (easybar “Hyr”, “Lexo më shumë”; Wolt AL page title “Porosit në linjë”). No ti-form sentences.
- "Pay at Hatch": feature name **Pagesë në marrje**, short label/button **Paguaj në marrje**.
- Plan names (planNames.<key>.name; "Pro" keeps "Pro" and gets NO name key): payg **Pa abonim mujor**, unlimited **Pa limit**, trial **Provë falas** (capitalise as a name), demo and tester: translate "Demo" / "Tester".
- Core terms (use them; TERMS.md records the rest):
  - foodTruck: food truck
  - foodTruckPlural: food truck-e (definite: food truck-et)
  - streetFood: ushqim rrugor
  - mobileCatering: katering i lëvizshëm
  - preOrder: porosi paraprake
  - orderAhead: Porositni paraprakisht
  - pickupCollect: marrje
  - pickupTime: ora e marrjes
  - takeaway: take away
  - timeSlot: interval kohor
  - kitchenDisplay: ekran kuzhine (KDS)
  - pos: sistem arke (POS)
  - cardReader: terminal pagese me kartë (POS)
  - menuListOfDishes: menu
  - combo: menu kombo
  - privateHire: food truck për evente
  - privateEvent: event privat
  - mobilePhone: celular
  - commissionFree: pa komision
  - whatsappAutoReply: përgjigje automatike në WhatsApp
  - walkUpOrder: porosi në vend
  - orderButton: Porosi me detyrim pagese
  - payAtHatchFeature: Pagesë në marrje
  - payAtHatchShort: Paguaj në marrje
  - payAsYouGo: Pa abonim mujor
  - unlimited: Pa limit
  - freeTrial: Provë falas
- Research decisions/notes (for context; do not stop on them):
  - Food-truck word: keep the English loan “food truck” (Albanian press and festival names write it in Latin); Albanian inflects loans with a hyphen (food truck-u, food truck-et, food truck-eve). Recommend: uninflected after “për” where it reads naturally (“për food truck”), hyphenated definite forms only where grammar needs them. Needs a native check.
  - Order button: Ligji 9902/2008 (i ndryshuar), neni 37/2 names the words “porosi me detyrim pagese” — use “Porosi me detyrim pagese” on the final order button (a card button “Paguaj {amount}” is acceptable only where it also makes the payment obligation clear).
  - Pay at Hatch: recommend “Pagesë në marrje” (feature) / “Paguaj në marrje” (button). TRAP: “pagesë në dorëzim” / “paguaj në dorëzim” is cash on delivery — never use it. Low confidence; native check.
  - “POS” in Albanian everyday use also means the card terminal (“paguaj me POS”), so “not a POS” is worded “jo sistem arke” (not a till system) rather than “jo POS”. Med confidence.
  - Currency: Albania prices in lekë (ALL, “500 lekë”), not euro — make sure examples do not show €.
  - {country} = “Shqipëri” (indefinite) is assumed; strings keep it in brackets or after an em dash so no case ending is needed.

## SEO strings (parts 08 and 09 ONLY): use these for these keys — they carry the researched search terms. Keep placeholders/tags exactly; you may polish wording but keep the primary keyword first in titles, titles ≤60 chars ({country} ≈ 10), descriptions 120–155.

Primary keyword per page: {"landing":"sistem porosish për food truck","features":"krahasimi i paketave dhe funksioneve","faq":"pyetje të shpeshta sistem porosish food truck","comparison":"sisteme porosish për food truck","compare":"kalkulator kostosh porosi online"}

```json
{
 "landing.meta.title": "Sistem porosish për food truck — HatchGrab {country}",
 "landing.meta.description": "Merrni porosi dhe porosi paraprake pa radhë. Program porosish dhe ekran kuzhine për food truck dhe katering të lëvizshëm ({country}) — jo sistem arke.",
 "landing.jsonLd.subCategory": "Sistem porosish për food truck dhe katering të lëvizshëm",
 "landing.jsonLd.description": "Porosi, porosi paraprake dhe ekran kuzhine për food truck dhe katering të lëvizshëm ({country}).",
 "landing.jsonLd.audience": "Biznese food truck dhe kateringu të lëvizshëm",
 "landing.hero.title": "Sistemi i porosive, i ndërtuar për <lean>food truck-et.</lean>",
 "landing.does.title": "Ndërtuar për food truck-et, jo për restorantet.",
 "landing.faq.metaTitle": "Pyetje të shpeshta | HatchGrab",
 "landing.faq.metaDescription": "Përgjigje të qarta për pronarët e food truck-eve: çmimet e HatchGrab, konfigurimi, marrja e porosive dhe pagesat me kartë ose në marrje.",
 "featuresPage.metaTitle": "Krahasimi i paketave dhe funksioneve — HatchGrab {country}",
 "compare.meta.title": "Kalkulator kostosh — HatchGrab {country}",
 "compare.meta.description": "Krahasoni sa ju kushtojnë sot porositë online me atë që do të paguanit për një vit me HatchGrab — një vlerësim brenda një minute.",
 "comparison.meta.title": "Sisteme porosish për food truck 2026: funksione dhe çmime",
 "comparison.meta.description": "Krahasim i sistemeve të porosive për food truck: porosi paraprake me orë marrjeje, kapacitet kuzhine, orar javor, tarifa dhe kontrata — verifikuar.",
 "comparison.meta.about": "Sisteme porosish online për food truck",
 "comparison.h1": "Krahasimi i sistemeve të porosive për food truck 2026",
 "aboutPage.meta.description": "HatchGrab krijon program praktik për food truck dhe katering: porosi online, orë marrjeje dhe më pak pyetje të përsëritura. Themeluar nga Dominic Bonini.",
 "truckPage.meta.orderTitle": "{truck} — porosit online",
 "truckPage.meta.orderDescription": "{truck}: porositni paraprakisht dhe merreni porosinë te food truck-u."
}
```

## Glossary (the locked Use terms — headings, buttons and feature names MUST use the bold Use term)

## SQ — Albanian (Albania)

*languages-world-2, 11 November 2026. Formal plural ju in body copy, as the Albanian POS vendor easybar.al writes (“Zgjeroni punën me modulet që ju duhen”, “Na kontaktoni”); buttons in the bare imperative as Albanian UIs do (“Hyr”, Wolt AL “Porosit në linjë”). The English loan food truck is used in Albania (Latin script; inflected with a hyphen: food truck-u, food truck-et). Wolt AL labels pickup “Vetëm marrje” and delivery “Dorëzim”. Traps: “pagesë në dorëzim” is cash on delivery; in everyday Albanian “POS” also means the card terminal, so “not a POS” is “jo sistem arke”. Prices are in lekë, not euro. Ligji 9902/2008 neni 37/2 fixes the order-button words “porosi me detyrim pagese”.*

| Concept | Use | Alternatives / Avoid | B2B/B2C | Conf. | Notes |
|---|---|---|---|---|---|
| Food truck | **food truck** | food truck-et (definite pl.); avoid “kamion ushqimi” | Both | Med | English loan; hyphen before Albanian endings |
| Street food | **ushqim rrugor** | street food (festival names) | Both | Med | “Tirana Street Food Festival” |
| Pre-order | **porosi paraprake** | porositni paraprakisht (verb) | Both | Med |  |
| Click & collect | **marrje** | Avoid “dorëzim” (= delivery) | Both | Med | Wolt AL “Vetëm marrje” |
| Pickup time | **ora e marrjes** | orari i marrjes | B2C | Low |  |
| KDS | **ekran kuzhine (KDS)** | Kitchen Display System | B2B | Med | easybar.al |
| POS / till | **sistem arke (POS)** | arkë; avoid bare “POS” (= card terminal to many) | B2B | Med | easybar “Program POS”, “arkë” |
| Card reader | **terminal pagese me kartë (POS)** | POS | B2B | Med |  |
| Menu (list of dishes) | **menu** | menuja (definite) | Both | High | easybar “Menu digjitale” |
| Meal deal / combo | **menu kombo** | ofertë | B2C | Low |  |
| Allergens | **alergjenë** |  | Both | Med |  |
| Private hire | **food truck për evente** |  | Both | Low |  |
| Private event | **event privat** | eveniment privat | Both | Low |  |
| Commission-free | **pa komision** | Avoid “pa tarifë dërgese” (= no delivery fee) | B2B | Med |  |
| WhatsApp auto-reply | **përgjigje automatike në WhatsApp** |  | B2B | Med |  |
| Walk-up order | **porosi në vend** |  | B2B | Low |  |

| **SQ** | Pagesë në marrje | Paguaj në marrje | Pa abonim mujor | Pa limit | Provë falas |
