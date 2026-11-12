# STYLE — Catalan (ca-AD, Andorra)
- Standard (central) Catalan, Andorra’s official language — not Valencian or Balearic forms, and no Spanish words (comanda, not “pedido”; recollida, not “recogida”). Andorra is not Spain and not in the EU: no IVA (Andorra has **IGI**), no NIF/DNI (Andorra uses NRT), no “Espanya” references; currency is the euro.
- Address operators AND customers with **tu** and tu-imperatives (“Puja la carta”, “Desa”, “Fes la comanda”), as Square writes its Catalan restaurant pages (“Descobreix”, “Comença la prova gratuïta de 30 dies”, “Oblida’t”); never vostè. Buttons: short imperatives (“Desa”, “Afegeix”, “Paga {amount}”). Customer copy warm, short.
- **Orthography:** the apostrophe in l’ d’ s’ n’ m’ t’ and in “Oblida’t” is always **’ (U+2019)** — never a straight ' (ICU swallows it). Elide before vowels and silent h (l’hora, d’entrega, l’any), not before consonants (la comanda). Geminate **l·l** with the middle dot **U+00B7** (Il·limitat, al·lèrgens, cancel·la) — never “l.l” or “l•l”.
- Loanwords: **food truck** (el food truck, els food trucks — as Andorran event pages write “food trucks”); “online” → **en línia** (“comandes en línia”, Square ca); “app” → **aplicació**; “QR” → **codi QR**; KDS → **pantalla de cuina (KDS)**; POS → **TPV**; card reader → **datàfon**.
- **Placeholders:** do not let an article or preposition merge with a placeholder (“d’{truck}”, “al {truck}” where the article would depend on the name ✗) — write “a {truck}”, “food truck: {truck}”, “({country})”.
- “menú” = set meal / meal deal; the list of dishes is **carta**. Takeaway = **per emportar**; pickup = **recollida** (“per recollir”).
- Plural categories (CLDR ca): **one, other** (+ many only for millions; not needed) — “1 comanda”, “2 comandes”, “1 plat”, “5 plats”.
- Numbers: 1.234,5; percent “20 %” (space before %); money “12,50 €”. Phone example: +376 612 345 (6 digits, no area code; mobiles start 3/6). Postcode AD + 3 digits (AD500 Andorra la Vella, AD700 Escaldes-Engordany). Email/domain: tu@elteufoodtruck.ad.
- Sample places: Andorra la Vella (Plaça del Poble, Parc Central), Escaldes-Engordany, Encamp, La Massana, Ordino, Sant Julià de Lòria, Canillo, Pas de la Casa; venues: “la festa major”, “el mercat setmanal”, “una fira gastronòmica”, “el parc”.
- Order button: no statutory wording in Andorra (Llei 13/2013 de competència efectiva i protecció del consumidor and Llei 20/2014 de contractació electrònica contain none) → market norm **“Fes la comanda”**; card button “Paga {amount}”. (EU-style option if Dominic wants it: “Comanda amb obligació de pagament”.)
- Pay at Hatch: feature **“Pagament en recollir”**, short label **“Paga en recollir”**. NEVER “contra reemborsament” or “pagament en el lliurament” (cash on delivery).
- “Not a POS”: **“No és un TPV.”** Plans: **Sense quota mensual** (Pay as you go), **Pro**, **Il·limitat** (Unlimited), **Prova gratuïta** (Free trial).

## From the country research (seo/ca-AD.json) — binding where it does not contradict the rules above

- Address form (research): Informal tu with tu-imperatives (Rep, Compara, Fes la comanda), as Square writes its Catalan restaurant pages (“Descobreix”, “Comença la prova gratuïta”, “Oblida’t”); not vostè.
- "Pay at Hatch": feature name **Pagament en recollir**, short label/button **Paga en recollir**.
- Plan names (planNames.<key>.name; "Pro" keeps "Pro" and gets NO name key): payg **Sense quota mensual**, unlimited **Il·limitat**, trial **Prova gratuïta** (capitalise as a name), demo and tester: translate "Demo" / "Tester".
- Core terms (use them; TERMS.md records the rest):
  - foodTruck: food truck
  - foodTruckPlural: food trucks
  - streetFood: menjar de carrer
  - mobileCatering: càtering mòbil
  - preOrder: comanda anticipada
  - orderAhead: Fes la comanda per endavant
  - pickupCollect: recollida
  - pickupTime: hora de recollida
  - takeaway: per emportar
  - timeSlot: franja horària
  - kitchenDisplay: pantalla de cuina (KDS)
  - pos: TPV
  - cardReader: datàfon
  - menuListOfDishes: carta
  - combo: menú
  - privateHire: food truck per a esdeveniments
  - privateEvent: esdeveniment privat
  - mobilePhone: mòbil
  - commissionFree: sense comissions
  - whatsappAutoReply: resposta automàtica de WhatsApp
  - walkUpOrder: comanda presencial
  - orderButton: Fes la comanda
  - payAtHatchFeature: Pagament en recollir
  - payAtHatchShort: Paga en recollir
  - payAsYouGo: Sense quota mensual
  - unlimited: Il·limitat
  - freeTrial: Prova gratuïta
- Research decisions/notes (for context; do not stop on them):
  - Order button: Andorra is not in the EU and neither Llei 13/2013 (consumer protection) nor Llei 20/2014 (electronic contracting) prescribes button wording, so the market norm “Fes la comanda” is fine. If Dominic wants one EU-style wording everywhere, the Catalan used under Spain’s consumer law is “Comanda amb obligació de pagament” — optional for AD.
  - Pay at Hatch: “Pagament en recollir” (feature) / “Paga en recollir” (button). TRAP: “contra reemborsament” and “pagament en el lliurament” mean cash on delivery — never use.
  - Tax wording: Andorra charges IGI (impost general indirecte), not IVA — never write “IVA” or Spanish tax/ID terms (NIF/DNI; Andorra uses NRT) in AD copy.
  - “menú” in Catalan means a set meal (menú del dia); the list of dishes is “carta”. Use carta for the menu screen, menú only for combos/meal deals.
  - Register: tu, as Catalan commerce writes online; Andorran public bodies often write in a more formal register — confirm if Dominic prefers vostè for operator e-mails.

## SEO strings (parts 08 and 09 ONLY): use these for these keys — they carry the researched search terms. Keep placeholders/tags exactly; you may polish wording but keep the primary keyword first in titles, titles ≤60 chars ({country} ≈ 10), descriptions 120–155.

Primary keyword per page: {"landing":"sistema de comandes per a food trucks","features":"plans i funcions comparats","faq":"preguntes freqüents sistema de comandes food truck","comparison":"sistemes de comandes per a food trucks","compare":"calculadora de costos comandes en línia"}

```json
{
 "landing.meta.title": "Sistema de comandes per a food trucks — HatchGrab {country}",
 "landing.meta.description": "Rep comandes i comandes anticipades sense cues. Programari de comandes i pantalla de cuina per a food trucks i càtering mòbil ({country}). No és un TPV.",
 "landing.jsonLd.subCategory": "Sistema de comandes per a food trucks i càtering mòbil",
 "landing.jsonLd.description": "Comandes, comandes anticipades i pantalla de cuina per a food trucks i càtering mòbil ({country}).",
 "landing.jsonLd.audience": "Professionals dels food trucks i del càtering mòbil",
 "landing.hero.title": "El sistema de comandes pensat per als <lean>food trucks.</lean>",
 "landing.does.title": "Pensat per als food trucks, no per als restaurants.",
 "landing.faq.metaTitle": "Preguntes freqüents | HatchGrab",
 "landing.faq.metaDescription": "Respostes clares per als food trucks sobre els preus de HatchGrab, la posada en marxa, com rebre comandes i els pagaments.",
 "featuresPage.metaTitle": "Plans i funcions comparats — HatchGrab {country}",
 "compare.meta.title": "Calculadora de costos — HatchGrab {country}",
 "compare.meta.description": "Compara el que et costen ara les comandes en línia amb el que pagaries durant un any a HatchGrab: una estimació en un minut.",
 "comparison.meta.title": "Sistemes de comandes per a food trucks: comparativa 2026",
 "comparison.meta.description": "Sistemes de comandes per a food trucks: hora de recollida, capacitat de cuina, calendari setmanal, comissions i permanència, comprovats a cada proveïdor.",
 "comparison.meta.about": "Sistemes de comandes en línia per a food trucks",
 "comparison.h1": "Comparativa de sistemes de comandes per a food trucks 2026",
 "aboutPage.meta.description": "HatchGrab crea programari per a food trucks i càtering mòbil: comandes en línia, hora de recollida i menys preguntes repetides. Fundat per Dominic Bonini.",
 "truckPage.meta.orderTitle": "Fes la comanda a {truck}",
 "truckPage.meta.orderDescription": "Fes la comanda per endavant a {truck} i recull-la al food truck."
}
```

## Glossary (the locked Use terms — headings, buttons and feature names MUST use the bold Use term)

## CA — Catalan (Andorra)

*languages-world-2, 11 November 2026. Informal tu with tu-imperatives, as Square writes its Catalan restaurant pages (“Descobreix”, “Comença la prova gratuïta de 30 dies”); not vostè. Catalan restaurant vocabulary confirmed there: TPV, datàfon, comandes en línia, menjar per emportar, per recollir a l’establiment, carta, comissions. food truck stays as the loan (pl. food trucks; Andorran event pages write “food trucks”). Write l’ d’ with ’ (U+2019) and l·l with the middle dot (Il·limitat). Traps: “contra reemborsament” (cash on delivery); “menú” means a set meal, the list of dishes is “carta”; Andorra has IGI, not IVA, and is not in the EU (no statutory button wording found).*

| Concept | Use | Alternatives / Avoid | B2B/B2C | Conf. | Notes |
|---|---|---|---|---|---|
| Food truck | **food truck** | pl. food trucks; camió de menjar (descriptive) | Both | Med | visitandorra.com |
| Street food | **menjar de carrer** | street food | Both | Med |  |
| Pre-order | **comanda anticipada** | fes la comanda per endavant; avoid Spanish “pedido” | Both | Med |  |
| Click & collect | **recollida** | per recollir a l’establiment | Both | High | Square ca |
| Pickup time | **hora de recollida** |  | B2C | Med |  |
| KDS | **pantalla de cuina (KDS)** | sistema de comandes per a la cuina | B2B | Med | Square ca |
| POS / till | **TPV** | programari de TPV | B2B | High | Square ca |
| Card reader | **datàfon** | TPV (also used for card terminals) | B2B | High | Square ca “datàfon portàtil” |
| Menu (list of dishes) | **carta** | Avoid “menú” (= set meal) | Both | High | Square ca “les cartes” |
| Meal deal / combo | **menú** | combo | B2C | Med |  |
| Allergens | **al·lèrgens** |  | Both | High | l·l with U+00B7 |
| Private hire | **food truck per a esdeveniments** | lloguer de food truck | Both | Low |  |
| Private event | **esdeveniment privat** |  | Both | Med |  |
| Commission-free | **sense comissions** |  | B2B | Med |  |
| WhatsApp auto-reply | **resposta automàtica de WhatsApp** |  | B2B | Med |  |
| Walk-up order | **comanda presencial** |  | B2B | Low |  |

| **CA** | Pagament en recollir | Paga en recollir | Sense quota mensual | Il·limitat | Prova gratuïta |
