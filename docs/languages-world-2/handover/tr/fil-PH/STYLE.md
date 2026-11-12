# STYLE — Filipino (fil-PH, Philippines) — TAGLISH REGISTER
- **Register: natural Taglish, as Filipinos really use food apps** — Filipino grammar and short function words (ang, ng, sa, mo, na, para sa) with the ENGLISH nouns PH apps use: order, pre-order, pick-up, menu, food truck, POS, schedule, settings, account, password. Research: GrabFood PH, Grab merchant guides, Klikit and StoreHub PH write their whole UI in English, and Filipinos search these topics in English, so never force deep Tagalog (paghahatid, talaan ng pagkain, kontrasenyas, koleksyon). An en-PH locale exists for full English; fil-PH must read like a PH product team’s Taglish, not a dictionary translation.
- **Address: friendly singular ka/mo/iyong** for operators (B2B screens) and customers (order page, e-mails): “I-upload mo ang menu mo”, “Mag-order ka na”, “Pumili ng oras ng pick-up”. Short buttons are bare verbs: “I-save”, “I-upload”, “Mag-order”, “Kanselahin”. No “po/opo” in UI labels, no plural kayo/ninyo; “po” only if Dominic approves it for support e-mails.
- **Loanwords and spelling:** English words keep English spelling in Latin script (online, app, QR code, pre-order, food truck, Wi-Fi). Verb affixes take a hyphen before the English root: mag-order, mag-pre-order, i-pick up, i-scan, i-print, na-save, nag-order. “take-out” (never takeaway), “walk-in” (never walk-up), “cellphone / mobile number”, ₱ prices.
- **Terms (locked):** food truck (mga food truck), street food, pre-order, pick-up, oras ng pick-up, take-out, time slot, kitchen display (KDS), POS (“hindi POS”), card reader, menu, combo meal, private event, food truck para sa events, walang commission, WhatsApp auto-reply, walk-in order.
- **Placeholders:** never glue an affix to a placeholder (“i-{truck}” ✗); use “sa {truck}”, “ang {truck}” as separate words or a colon (“Truck: {truck}”). Keep “{country}” stand-alone or in brackets.
- **Plural categories (CLDR fil): one, other** — but CLDR “one” covers 1, 2, 3, 5, 7, 8, 10, 11… and “other” covers 4, 6, 9, 14… so BOTH branches must read correctly for any number: Filipino does not inflect the noun after a numeral — write the same text in both (“# order”, “# minuto”); never “mga” right after a number and never a singular-only word like “isang” in the one branch.
- **Numbers:** 1,234.56 (comma thousands, point decimal); prices “₱1,250.00” or “₱1,250”; percent “20%”; time “5:30 PM” in prose is natural, the app formats times itself. Phone: 0917 123 4567 (+63 917 123 4567). ZIP code 4 digits (1634). Address: Unit/Blk, Street, Barangay, City, Province, ZIP. Email/domain: you@yourfoodtruck.ph.
- **Sample places:** BGC (Taguig), Poblacion (Makati), Maginhawa Street (Quezon City), Kapitolyo (Pasig), Cebu City, Davao City, Session Road (Baguio), Iloilo City; venues: “weekend market”, “night market”, “food park”, “tiangge”, “barangay fiesta”, “plaza”, “park”.
- **Order button:** the Philippines has no statutory EU-style button wording (Consumer Act RA 7394 and the Internet Transactions Act of 2023, RA 11967, require clear terms but no set button text — not re-checked this session); market norm: “I-place ang order” / CTA “Mag-order na”; card button “Magbayad ng {amount}”.
- **Pay at Hatch:** feature name **“Bayad sa Pick-up”**, short label **“Magbayad sa truck”**; never “COD” / “Cash on Delivery” and never “COP” (cash on pick-up implies cash only). “At the hatch” elsewhere = “sa truck”.
- **Plans:** Pro, “Pay as you go” (explain as “walang monthly fee”), “Unlimited”, “Free trial” — kept in English as PH telco and app plans are; “Unli” only if Dominic chooses it.

## From the country research (seo/fil-PH.json) — binding where it does not contradict the rules above

- Address form (research): Friendly singular ka/mo/iyong with Taglish verbs (Mag-order ka na, I-upload mo ang menu); no po/opo in UI labels (keep po for support e-mails only if Dominic wants). Evidence: the Filipino food-app vocabulary page (ling-app.com/fil) uses only ka (“Mag-order ka na ng pizza”); PH food-ordering businesses themselves (GrabFood PH, Grab merchant guides, Klikit, StoreHub PH) write their UI and marketing in ENGLISH, so the Taglish register is English nouns (order, pre-order, pick-up, menu, food truck) inside Filipino grammar. Avoid textbook deep Tagalog (paghahatid, talaan ng pagkain) and plural kayo/ninyo.
- "Pay at Hatch": feature name **Bayad sa Pick-up**, short label/button **Magbayad sa truck**.
- Plan names (planNames.<key>.name; "Pro" keeps "Pro" and gets NO name key): payg **Pay as you go**, unlimited **Unlimited**, trial **Free trial** (capitalise as a name), demo and tester: translate "Demo" / "Tester".
- Core terms (use them; TERMS.md records the rest):
  - foodTruck: food truck
  - foodTruckPlural: mga food truck
  - streetFood: street food
  - mobileCatering: mobile catering
  - preOrder: pre-order
  - orderAhead: Mag-pre-order
  - pickupCollect: pick-up
  - pickupTime: oras ng pick-up
  - takeaway: take-out
  - timeSlot: time slot
  - kitchenDisplay: kitchen display (KDS)
  - pos: POS
  - cardReader: card reader
  - menuListOfDishes: menu
  - combo: combo meal
  - privateHire: food truck para sa events
  - privateEvent: private event
  - mobilePhone: cellphone (mobile number)
  - commissionFree: walang commission
  - whatsappAutoReply: WhatsApp auto-reply
  - walkUpOrder: walk-in order
  - orderButton: I-place ang order
  - payAtHatchFeature: Bayad sa Pick-up
  - payAtHatchShort: Magbayad sa truck
  - payAsYouGo: Pay as you go
  - unlimited: Unlimited
  - freeTrial: Free trial
- Research decisions/notes (for context; do not stop on them):
  - en-PH vs fil-PH: PH food-ordering apps and B2B vendors write in English, and Filipinos search in English. Consider making en-PH the default for PH and fil-PH an opt-in Taglish locale; the fil-PH SEO titles therefore keep the English keyword (“Food truck ordering system”) first and Filipino around it.
  - Address: friendly singular ka/mo, no po in UI (po reads as call-centre). Option: allow po in customer-support e-mails only.
  - Pay at Hatch: recommend feature “Bayad sa Pick-up” / short “Magbayad sa truck”. Avoid “COD” / “Cash on Delivery” (delivery). The PH online-seller term “COP” (cash on pick-up) is real but means cash only — HatchGrab’s pay-in-person may be card, so not used.
  - Messaging: in the Philippines Facebook Messenger and Viber are far more used than WhatsApp (general knowledge, not measured this session) — the WhatsApp auto-reply feature may need lower prominence on PH pages.
  - Plan names: keep English “Pay as you go”, “Unlimited”, “Free trial” (PH telco plans are English). Colloquial “Unli” (Globe/Smart “Unli” promos) is a possible friendlier label for Unlimited — Dominic’s call; default “Unlimited”.
  - Payments: GCash and Maya dominate PH online payments; card-only online payment will push many customers to Pay at the truck.

## SEO strings (parts 08 and 09 ONLY): use these for these keys — they carry the researched search terms. Keep placeholders/tags exactly; you may polish wording but keep the primary keyword first in titles, titles ≤60 chars ({country} ≈ 10), descriptions 120–155.

Primary keyword per page: {"landing":"food truck ordering system","features":"plans at features ng HatchGrab","faq":"FAQ food truck ordering system","comparison":"food truck ordering system comparison","compare":"cost calculator online order"}

```json
{
 "landing.meta.title": "Food truck ordering system — HatchGrab {country}",
 "landing.meta.description": "Tanggapin ang order at pre-order sa pwesto mo, walang pila. Ordering at kitchen screen para sa food truck at mobile catering ({country}) — hindi POS.",
 "landing.jsonLd.subCategory": "Ordering system para sa food truck at mobile catering",
 "landing.jsonLd.description": "Online ordering, pre-order at kitchen screen para sa mga food truck at mobile catering ({country}).",
 "landing.jsonLd.audience": "Mga may-ari ng food truck at mobile catering",
 "landing.hero.title": "Ang ordering system na ginawa para sa <lean>mga food truck.</lean>",
 "landing.does.title": "Ginawa para sa food truck, hindi para sa restaurant.",
 "landing.faq.metaTitle": "FAQ: mga madalas itanong | HatchGrab",
 "landing.faq.metaDescription": "Diretsong sagot para sa mga food truck tungkol sa presyo ng HatchGrab, pag-set up, pagtanggap ng order at pagbabayad — basahin bago ka mag-sign up.",
 "featuresPage.metaTitle": "Plans at features, magkatabi — HatchGrab {country}",
 "compare.meta.title": "Cost calculator — HatchGrab {country}",
 "compare.meta.description": "Ikumpara ang ginagastos mo ngayon sa online orders sa isang taon gamit ang HatchGrab — makakakuha ka ng estimate sa loob ng isang minuto.",
 "comparison.meta.title": "Food truck ordering system comparison 2026 at mga presyo",
 "comparison.meta.description": "Paghahambing ng food truck ordering system: pre-order na may oras ng pick-up, kapasidad ng kusina, schedule, fees at kontrata — sinuri sa site ng vendor.",
 "comparison.meta.about": "Mga online ordering system para sa food truck",
 "comparison.h1": "Food truck ordering system comparison 2026",
 "aboutPage.meta.description": "Software ng HatchGrab para sa food truck at mobile catering: online order, oras ng pick-up, mas kaunting paulit-ulit na tanong. Itinatag ni Dominic Bonini.",
 "truckPage.meta.orderTitle": "Mag-order sa {truck}",
 "truckPage.meta.orderDescription": "Mag-pre-order sa {truck} at i-pick up ang order mo sa mismong truck."
}
```

## Glossary (the locked Use terms — headings, buttons and feature names MUST use the bold Use term)

## FIL — Filipino (Philippines)

*languages-world-2, 11 November 2026. Friendly singular ka/mo (Mag-order ka na, I-upload mo), no po in UI; Taglish as PH apps really work — English nouns (order, pre-order, pick-up, menu, food truck, POS) inside Filipino grammar (Mag-pre-order, I-pick up, Pumili ng oras ng pick-up). Every PH food-ordering business seen (GrabFood PH, Grab merchant guides, Klikit, StoreHub PH) writes in English and Filipinos search in English, so English keywords lead the SEO titles. Traps: “takeaway” (PH says take-out), “walk-up” (PH says walk-in), deep-Tagalog textbook words (paghahatid, talaan), and COD / cash on delivery for paying at the truck. Messenger and Viber are bigger than WhatsApp in the Philippines.*

| Concept | Use | Alternatives / Avoid | B2B/B2C | Conf. | Notes |
|---|---|---|---|---|---|
| Food truck | **food truck** | plural mga food truck; avoid trak ng pagkain | Both | High | Klikit, Grab PH write “food truck”; food parks are common |
| Street food | **street food** | pagkaing kalye (rare) | Both | High |  |
| Pre-order | **pre-order** | verb Mag-pre-order; avoid paunang order | Both | High | everyday PH online-seller word |
| Click & collect | **pick-up** | self pick-up (Grab “Self Pick-Up”); avoid koleksyon | Both | High | verb i-pick up |
| Pickup time | **oras ng pick-up** | pick-up time | B2C | Med | Grab merchant: “collection time” |
| KDS | **kitchen display (KDS)** | kitchen screen | B2B | Med | Klikit nav “Kitchen Display” |
| POS / till | **POS** | POS system; avoid kaha / till | B2B | High | HatchGrab is “hindi POS” |
| Card reader | **card reader** | card terminal | B2B | Med |  |
| Menu (list of dishes) | **menu** | avoid talaan ng pagkain | Both | High |  |
| Meal deal / combo | **combo meal** | value meal, bundle | B2C | Med |  |
| Allergens | **allergens** | sangkap na may allergen | Both | Low |  |
| Private hire | **food truck para sa events** | food truck for hire, food truck catering | Both | Med |  |
| Private event | **private event** |  | Both | Med |  |
| Commission-free | **walang commission** | commission-free; walang bawas | B2B | Med | Deonde/ordering.co “commission-free” |
| WhatsApp auto-reply | **WhatsApp auto-reply** | — | B2B | Med | WhatsApp is not PH’s main messenger |
| Walk-up order | **walk-in order** | avoid walk-up | B2B | Med | PH “walk-in” |

| **FIL** | Bayad sa Pick-up | Magbayad sa truck | Pay as you go | Unlimited | Free trial |
