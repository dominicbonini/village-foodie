# STYLE — Bosnian (bs-BA, Bosnia and Herzegovina) — LATIN SCRIPT
- **Write Bosnian in Latin script** (č ć dž đ lj nj š ž) — BiH business, tourism (tourismbih.com) and delivery apps (Glovo bs/ba) write Latin. Never mix in Cyrillic.
- **Bosnian standard, ijekavian** — not Serbian, not Croatian: narudžba (not porudžbina), vrijeme / mjesec / uvijek (not vreme/mesec), sedmica (not tjedan/nedelja), hljeb (not hleb/kruh), historija, hiljada, tačka, uslovi, sedmični, mobitel, ekran (not zaslon), kasa (not blagajna), obaveza (not obveza), ponuđač, općina. Coffee: Bosnian standard “kahva” (menus also show “kafa”).
- OPERATORS (B2B screens, e-mails): polite plural **vi/vaš**, lower-case on screens, plural imperatives (“Učitajte meni”, “Sačuvajte promjene”), matching the regional hr-HR/sr-RS files. Short buttons may be the singular imperative (“Sačuvaj”, “Dodaj”, “Naruči”) as regional apps do — pick one per screen and keep it.
- CUSTOMERS (order page, status, e-mails, WhatsApp replies): **vi** with plural imperatives (“Naručite unaprijed i preuzmite narudžbu kod food trucka”); warm, short.
- Loanwords: **food truck** in Latin, inflected like a Bosnian noun (food trucka, food trucku, food truckovi); “online” stays “online”; “app” → **aplikacija**; “QR” → **QR kod**; catering → **ketering**; takeaway → **za ponijeti**.
- **Cases:** never put a case ending on a placeholder (“{truck}a” ✗) — apposition or colon: “food truck {truck}”, “Uklonjeno: {name}”, “({country})”. The brand may take an ending (HatchGraba) as in hr-HR.
- Plural categories (CLDR bs): **one, few, other** — “1 narudžba”, “2–4 narudžbe” (few), “5 narudžbi” (other); 21 → one, 22–24 → few, 11–14 → other. Every count plural needs all three.
- Numbers: 1.234,5; percent “20%”; money “12,50 KM” (BAM; the app’s Intl formatting renders it). Phone example: 061 123 456 (+387 61 123 456). Postcode 5 digits (71000 Sarajevo). Email/domain: vi@vasfoodtruck.ba.
- Sample places: Sarajevo (Baščaršija, Marijin Dvor, Grbavica, Ilidža), Mostar, Tuzla, Zenica, Banja Luka, Bihać; venues: “Veliki park”, “gradska pijaca”, “Vilsonovo šetalište”, “street food festival”, “sajam”.
- Order button: no single BiH phrase; RS law (Sl. glasnik RS 101/2025, čl. 55 st. 4) requires a clear notice of the payment obligation on the button; FBiH 2006 law, new law in procedure → **“Naruči uz obavezu plaćanja”**; card button “Plati {amount}”.
- Pay at Hatch: feature **“Plaćanje pri preuzimanju”**, short label **“Platite pri preuzimanju”**. NEVER “plaćanje pouzećem” / “plaćanje pri dostavi” (cash on delivery). Pickup = **preuzimanje**.
- “Not a POS”: **“nije kasa”**. Plans: **Bez mjesečne pretplate** (Pay as you go), **Pro**, **Neograničeno** (Unlimited), **Besplatni probni period** (Free trial).
- Quotation marks: „…“ — never a straight ' (ICU).

## From the country research (seo/bs-BA.json) — binding where it does not contradict the rules above

- Address form (research): Polite plural vi/vaš with plural imperatives (Naručite, Sačuvajte), as BiH business sites and the regional hr-HR/sr-RS HatchGrab files write; lower-case vi on screens. Short buttons may use the 2nd-person-singular imperative (Naruči) as regional apps do. No ti-form sentences.
- "Pay at Hatch": feature name **Plaćanje pri preuzimanju**, short label/button **Platite pri preuzimanju**.
- Plan names (planNames.<key>.name; "Pro" keeps "Pro" and gets NO name key): payg **Bez mjesečne pretplate**, unlimited **Neograničeno**, trial **Besplatni probni period** (capitalise as a name), demo and tester: translate "Demo" / "Tester".
- Core terms (use them; TERMS.md records the rest):
  - foodTruck: food truck
  - foodTruckPlural: food truckovi
  - streetFood: ulična hrana
  - mobileCatering: mobilni ketering
  - preOrder: narudžba unaprijed
  - orderAhead: Naručite unaprijed
  - pickupCollect: preuzimanje
  - pickupTime: vrijeme preuzimanja
  - takeaway: za ponijeti
  - timeSlot: termin
  - kitchenDisplay: kuhinjski ekran (KDS)
  - pos: kasa (POS sistem)
  - cardReader: POS terminal
  - menuListOfDishes: meni
  - combo: meni (kombo)
  - privateHire: food truck za događaje
  - privateEvent: privatni događaj
  - mobilePhone: mobitel
  - commissionFree: bez provizije
  - whatsappAutoReply: automatski odgovor na WhatsAppu
  - walkUpOrder: narudžba na licu mjesta
  - orderButton: Naruči uz obavezu plaćanja
  - payAtHatchFeature: Plaćanje pri preuzimanju
  - payAtHatchShort: Platite pri preuzimanju
  - payAsYouGo: Bez mjesečne pretplate
  - unlimited: Neograničeno
  - freeTrial: Besplatni probni period
- Research decisions/notes (for context; do not stop on them):
  - Order button: BiH has no single statutory phrase. Republika Srpska’s 2025 law (čl. 55 st. 4) requires a clear notice of the payment obligation on the button itself; FBiH’s new law is in procedure. Recommend “Naruči uz obavezu plaćanja” (Bosnian obaveza, not Croatian obveza) on the final button everywhere in BiH.
  - Pay at Hatch: “Plaćanje pri preuzimanju” (feature) / “Platite pri preuzimanju” (button), matching hr-HR/sr-RS. TRAP: “plaćanje pouzećem” / “plaćanje pri dostavi” = cash on delivery — never use.
  - Variety: Bosnian standard, ijekavian, Latin — narudžba (not Serbian porudžbina), sedmica (not tjedan/nedelja), hljeb (not hleb/kruh), historija, hiljada, mobitel, tačka, uslovi, ekran (not Croatian zaslon). Coffee: the Bosnian standard spells “kahva”; Sarajevo menus also print “kafa” — recommend “kahva” only if a sample menu needs it (not verified on BiH sites in this pass).
  - “ketering” vs “catering”: Bosnian spelling adapts it as “ketering”; BiH businesses also keep “catering” in names. Recommend “ketering” in copy, Low confidence.
  - {country} is presumably “Bosna i Hercegovina” (19 characters, longer than the ~10 assumed): titles fit ≤ 60 at ~10 but reach ~67 with the full name — consider “BiH” as the short country name if the title budget matters.

## SEO strings (parts 08 and 09 ONLY): use these for these keys — they carry the researched search terms. Keep placeholders/tags exactly; you may polish wording but keep the primary keyword first in titles, titles ≤60 chars ({country} ≈ 10), descriptions 120–155.

Primary keyword per page: {"landing":"sistem za narudžbe za food truckove","features":"poređenje paketa i funkcija","faq":"često postavljana pitanja sistem za narudžbe","comparison":"sistemi za narudžbe za food truckove","compare":"kalkulator troškova online narudžbi"}

```json
{
 "landing.meta.title": "Sistem za narudžbe za food truckove — HatchGrab {country}",
 "landing.meta.description": "Primajte narudžbe i narudžbe unaprijed bez reda. Softver za narudžbe i kuhinjski ekran za food truckove i mobilni ketering ({country}) — nije kasa.",
 "landing.jsonLd.subCategory": "Sistem za narudžbe za food truckove i mobilni ketering",
 "landing.jsonLd.description": "Narudžbe, narudžbe unaprijed i kuhinjski ekran za food truckove i mobilni ketering ({country}).",
 "landing.jsonLd.audience": "Vlasnici food truckova i firmi za mobilni ketering",
 "landing.hero.title": "Sistem za narudžbe napravljen za <lean>food truckove.</lean>",
 "landing.does.title": "Napravljen za food truckove, ne za restorane.",
 "landing.faq.metaTitle": "Često postavljana pitanja | HatchGrab",
 "landing.faq.metaDescription": "Jasni odgovori za vlasnike food truckova o cijenama HatchGraba, postavljanju, primanju narudžbi i plaćanju karticom ili pri preuzimanju.",
 "featuresPage.metaTitle": "Poređenje paketa i funkcija — HatchGrab {country}",
 "compare.meta.title": "Kalkulator troškova — HatchGrab {country}",
 "compare.meta.description": "Uporedite koliko vas online narudžbe sada koštaju s onim što biste platili za godinu uz HatchGrab — procjena za samo jednu minutu.",
 "comparison.meta.title": "Sistemi za narudžbe za food truckove 2026: funkcije, cijene",
 "comparison.meta.description": "Poređenje sistema za narudžbe za food truckove: narudžbe unaprijed s vremenom preuzimanja, kapacitet kuhinje, raspored, naknade, ugovor — provjereno.",
 "comparison.meta.about": "Sistemi za online narudžbe za food truckove",
 "comparison.h1": "Poređenje sistema za narudžbe za food truckove 2026",
 "aboutPage.meta.description": "HatchGrab pravi praktičan softver za food truckove i mobilni ketering: online narudžbe, vrijeme preuzimanja i manje istih pitanja. Osnivač: Dominic Bonini.",
 "truckPage.meta.orderTitle": "{truck} — naručite online",
 "truckPage.meta.orderDescription": "{truck}: naručite unaprijed i preuzmite narudžbu kod food trucka."
}
```

## Glossary (the locked Use terms — headings, buttons and feature names MUST use the bold Use term)

## BS — Bosnian (Latin, Bosnia and Herzegovina)

*languages-world-2, 11 November 2026. Bosnian standard, ijekavian, Latin script. Polite plural vi/vaš with plural imperatives (Naručite, Sačuvajte), as the regional hr-HR/sr-RS files write; lower-case vi on screens. BiH writes the loan food truck (tourismbih.com “Chiko food truck”, “Biona & Beyond - Food Truck”), inflected food trucka / food truckovi. Bosnian, not Serbian or Croatian: narudžba (not porudžbina), sedmica (not tjedan/nedelja), hljeb, historija, hiljada, mobitel, ekran (not zaslon), obaveza (not obveza). Trap: “plaćanje pouzećem” / “plaćanje pri dostavi” is cash on delivery. Prices in KM.*

| Concept | Use | Alternatives / Avoid | B2B/B2C | Conf. | Notes |
|---|---|---|---|---|---|
| Food truck | **food truck** | pl. food truckovi | Both | Med | tourismbih.com |
| Street food | **ulična hrana** | street food | Both | Med |  |
| Pre-order | **narudžba unaprijed** | Avoid Serbian “porudžbina”, ekavian “unapred” | Both | Med |  |
| Click & collect | **preuzimanje** | lično preuzimanje; avoid “dostava” (= delivery) | Both | Med | OLX BiH shops |
| Pickup time | **vrijeme preuzimanja** | Avoid ekavian “vreme” | B2C | Med |  |
| KDS | **kuhinjski ekran (KDS)** | Avoid Croatian “zaslon” | B2B | Med |  |
| POS / till | **kasa** | fiskalna kasa; POS sistem; avoid Croatian “blagajna” | B2B | Med |  |
| Card reader | **POS terminal** | POS aparat | B2B | Med |  |
| Menu (list of dishes) | **meni** | jelovnik | Both | Med |  |
| Meal deal / combo | **meni (kombo)** |  | B2C | Low |  |
| Allergens | **alergeni** |  | Both | Med |  |
| Private hire | **food truck za događaje** | food truck za proslave | Both | Low |  |
| Private event | **privatni događaj** | privatna proslava | Both | Low |  |
| Commission-free | **bez provizije** |  | B2B | Med |  |
| WhatsApp auto-reply | **automatski odgovor na WhatsAppu** |  | B2B | Med |  |
| Walk-up order | **narudžba na licu mjesta** |  | B2B | Low |  |

| **BS** | Plaćanje pri preuzimanju | Platite pri preuzimanju | Bez mjesečne pretplate | Neograničeno | Besplatni probni period |
