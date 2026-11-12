# STYLE — Khmer (km-KH, Cambodia) — KHMER SCRIPT
- Address customers and screens with **អ្នក**, as foodpanda KH ("ការកុម្ម៉ង់របស់អ្នក") and GrabMerchant ("អាជីវកម្មរបស់អ្នក") write; use the more deferential **លោកអ្នក** in formal operator emails, as E-GetS Store and Kitchen24 write. Polite requests with **សូម** ("សូមជ្រើសរើសម៉ោង"); short buttons without pronoun ("រក្សាទុក", "ដាក់ការកុម្ម៉ង់").
- **Order word:** **កុម្ម៉ង់ / ការកុម្ម៉ង់** (foodpanda, Kitchen24 — spell it exactly so, not កម្ម៉ង់/កុម្មង់) in UI; formal **ការបញ្ជាទិញ** only in legal text. Pickup = **ទៅយកផ្ទាល់**, pickup time = **ម៉ោងទៅយក**, takeaway = **ខ្ចប់** (all foodpanda KH).
- **Spacing:** no spaces between words; a space between phrases/clauses and around Latin words ("ប្រើ HatchGrab ឥតគិតថ្លៃ"). Do not insert zero-width spaces by hand. Full stop **។** (U+17D4), colon **៖** (U+17D6), repetition ៗ ("ច្បាស់ៗ").
- **Loanwords:** keep **Food Truck, POS, KDS, QR, WhatsApp, HatchGrab** in Latin (Cambodians search in English; Phnom Penh trucks use English names). Real Khmer-script loans: **អនឡាញ** (online — Grab, E-GetS), **ម៉ឺនុយ** (menu), **កម្មវិធី** (app). TRAP: កម្មវិធី also means event/programme — use **ពិធី** for events.
- Plural categories (CLDR km): **other** only — Khmer does not inflect ("ការកុម្ម៉ង់ 3"); keep the English `one` key harmlessly identical.
- Numbers: ASCII digits (foodpanda writes "2", "%"); Intl km-KH renders 1,234,567.5, "20%", "12,500.00៛". Prices are often in USD ($4.50) as well as riel ៛. Phone: 012 345 678 (+855 12 345 678). Postcode 6 digits (120101); address = ផ្ទះលេខ, ផ្លូវ, សង្កាត់, ខណ្ឌ. Email/domain: you@yourfoodtruck.com.kh.
- Sample places: ភ្នំពេញ (បឹងកេងកង, ទួលទំពូង, ដូនពេញ), សៀមរាប (ផ្សារចាស់), បាត់ដំបង, កំពត, កែប, ក្រុងព្រះសីហនុ; venues: "ផ្សាររាត្រី", "សួនច្បារ", "មាត់ទន្លេ", "មហោស្រពម្ហូប".
- **Pay at Hatch:** feature **"បង់ប្រាក់ពេលទៅយក"**, short label **"បង់ពេលទៅយក"**. NEVER "បង់ប្រាក់ដោយសាច់ប្រាក់ពេលដឹកជញ្ជូន" or "COD" (Kitchen24 / WOWNOW cash-on-delivery) — there is no delivery.
- Order button: Cambodia’s Law on Electronic Commerce (2019) requires pre-purchase disclosure (seller, costs, payment/cancellation/refund terms) but no statutory button wording — market norm **"ដាក់ការកុម្ម៉ង់"**; card button "បង់ {amount}".

## From the country research (seo/km-KH.json) — binding where it does not contradict the rules above

- Address form (research): អ្នក in customer copy (foodpanda KH web and Play: “ការកុម្ម៉ង់របស់អ្នក”, “ទាញយកកម្មវិធី”; GrabMerchant: “ចុះឈ្មោះអាជីវកម្មរបស់អ្នក”); more deferential លោកអ្នក in merchant/marketing copy (E-GetS Store: “ជួយលោកអ្នកដោះស្រាយការកម្ម៉ង់”; Kitchen24: “នាំមកជូនលោកអ្នក”). Recommend អ្នក in UI, លោកអ្នក in operator emails; polite requests with សូម (foodpanda “សូមញ៉ាំដោយរីករាយ”).
- "Pay at Hatch": feature name **បង់ប្រាក់ពេលទៅយក**, short label/button **បង់ពេលទៅយក**.
- Plan names (planNames.<key>.name; "Pro" keeps "Pro" and gets NO name key): payg **គ្មានថ្លៃប្រចាំខែ**, unlimited **គ្មានដែនកំណត់**, trial **សាកល្បងឥតគិតថ្លៃ** (capitalise as a name), demo and tester: translate "Demo" / "Tester".
- Core terms (use them; TERMS.md records the rest):
  - foodTruck: Food Truck
  - foodTruckPlural: Food Truck
  - streetFood: ម្ហូបតាមផ្លូវ
  - mobileCatering: សេវាម្ហូបចល័ត
  - preOrder: ការកុម្ម៉ង់ទុកជាមុន
  - orderAhead: កុម្ម៉ង់ទុកជាមុន
  - pickupCollect: ទៅយកផ្ទាល់
  - pickupTime: ម៉ោងទៅយក
  - takeaway: ខ្ចប់
  - timeSlot: ចន្លោះម៉ោង
  - kitchenDisplay: អេក្រង់ផ្ទះបាយ (KDS)
  - pos: ប្រព័ន្ធ POS
  - cardReader: ម៉ាស៊ីនឆូតកាត
  - menuListOfDishes: ម៉ឺនុយ
  - combo: ឈុតម្ហូប (Combo)
  - privateHire: ជួល Food Truck សម្រាប់ពិធី
  - privateEvent: ពិធីឯកជន
  - mobilePhone: ទូរស័ព្ទដៃ
  - commissionFree: គ្មានកម្រៃជើងសារ
  - whatsappAutoReply: ការឆ្លើយតបស្វ័យប្រវត្តិតាម WhatsApp
  - walkUpOrder: ការកុម្ម៉ង់នៅនឹងកន្លែង
  - orderButton: ដាក់ការកុម្ម៉ង់
  - payAtHatchFeature: បង់ប្រាក់ពេលទៅយក
  - payAtHatchShort: បង់ពេលទៅយក
  - payAsYouGo: គ្មានថ្លៃប្រចាំខែ
  - unlimited: គ្មានដែនកំណត់
  - freeTrial: សាកល្បងឥតគិតថ្លៃ
- Research decisions/notes (for context; do not stop on them):
  - Order word: “កុម្ម៉ង់” (from French commande; foodpanda, Kitchen24, E-GetS spell it កុម្ម៉ង់ or កម្ម៉ង់) vs formal “បញ្ជាទិញ” (Grab, Kitchen24). Recommend កុម្ម៉ង់ (spelled exactly so) in UI and titles, បញ្ជាទិញ only in legal text and as a store keyword.
  - Food truck: written in Latin “Food Truck” (Phnom Penh trucks and press name them in English; no Khmer-script search use). Descriptive Khmer “ឡានលក់ម្ហូប” can appear once in body text. Native check needed.
  - Address: អ្នក in UI (foodpanda, Grab) vs លោកអ្នក (E-GetS, Kitchen24) — confirm អ្នក for screens, លោកអ្នក for formal operator emails.
  - Trap: “កម្មវិធី” means both app/software AND event/programme — use “ពិធី” for private events and “កម្មវិធី” only for the app.
  - Pay at Hatch: “បង់ប្រាក់ពេលទៅយក” (feature) / “បង់ពេលទៅយក” (button) = pay when you pick up. Avoid “បង់ប្រាក់ដោយសាច់ប្រាក់ពេលដឹកជញ្ជូន” and “COD” (Kitchen24/WOWNOW cash-on-delivery). Low confidence.
  - Messaging: Telegram (not WhatsApp) is widely used for business chat in Cambodia (general knowledge, not checked this session) — the WhatsApp auto-reply feature may matter less on KH pages.
  - Payments: ABA / KHQR (Bakong) and USD pricing are the norm (WOWNOW: “Online payment supports ABA, WING”); prices may show $ as well as ៛.
  - Order button: no statutory button wording (E-Commerce Law 2019 only requires disclosure); market norm “ដាក់ការកុម្ម៉ង់” (foodpanda) / “កុម្ម៉ង់ឥឡូវនេះ”.

## SEO strings (parts 08 and 09 ONLY): use these for these keys — they carry the researched search terms. Keep placeholders/tags exactly; you may polish wording but keep the primary keyword first in titles, titles ≤60 chars ({country} ≈ 10), descriptions 120–155.

Primary keyword per page: {"landing":"ប្រព័ន្ធកុម្ម៉ង់សម្រាប់ Food Truck","features":"ប្រៀបធៀបកញ្ចប់ និងមុខងារ","faq":"សំណួរញឹកញាប់ ប្រព័ន្ធកុម្ម៉ង់ Food Truck","comparison":"ប្រៀបធៀបប្រព័ន្ធកុម្ម៉ង់ Food Truck","compare":"គណនាចំណាយការកុម្ម៉ង់អនឡាញ"}

```json
{
 "landing.meta.title": "ប្រព័ន្ធកុម្ម៉ង់សម្រាប់ Food Truck — HatchGrab {country}",
 "landing.meta.description": "ទទួលការកុម្ម៉ង់ និងកុម្ម៉ង់ទុកជាមុន ដោយភ្ញៀវមិនបាច់តម្រង់ជួរ។ កម្មវិធីកុម្ម៉ង់ និងអេក្រង់ផ្ទះបាយសម្រាប់ Food Truck និងម្ហូបចល័ត ({country}) — មិនមែនប្រព័ន្ធ POS ទេ។",
 "landing.jsonLd.subCategory": "ប្រព័ន្ធកុម្ម៉ង់សម្រាប់ Food Truck និងសេវាម្ហូបចល័ត",
 "landing.jsonLd.description": "ការកុម្ម៉ង់ ការកុម្ម៉ង់ទុកជាមុន និងអេក្រង់ផ្ទះបាយ សម្រាប់ Food Truck និងសេវាម្ហូបចល័ត ({country})។",
 "landing.jsonLd.audience": "ម្ចាស់ Food Truck និងអាជីវកម្មម្ហូបចល័ត",
 "landing.hero.title": "ប្រព័ន្ធកុម្ម៉ង់ដែលបង្កើតឡើងសម្រាប់ <lean>Food Truck</lean>",
 "landing.does.title": "បង្កើតឡើងសម្រាប់ Food Truck មិនមែនសម្រាប់ភោជនីយដ្ឋានទេ។",
 "landing.faq.metaTitle": "សំណួរដែលសួរញឹកញាប់ | HatchGrab",
 "landing.faq.metaDescription": "ចម្លើយច្បាស់ៗសម្រាប់ម្ចាស់ Food Truck អំពីតម្លៃរបស់ HatchGrab ការរៀបចំដំបូង ការទទួលការកុម្ម៉ង់ និងការទូទាត់ប្រាក់ — អ្វីដែលគួរដឹងមុនចាប់ផ្តើម។",
 "featuresPage.metaTitle": "ប្រៀបធៀបកញ្ចប់ និងមុខងារ — HatchGrab {country}",
 "compare.meta.title": "គណនាចំណាយ — HatchGrab {country}",
 "compare.meta.description": "ប្រៀបធៀបថ្លៃការកុម្ម៉ង់អនឡាញដែលអ្នកកំពុងចំណាយឥឡូវនេះ ជាមួយការប្រើ HatchGrab រយៈពេលមួយឆ្នាំ — ទទួលបានតួលេខប៉ាន់ស្មានក្នុងរយៈពេលមួយនាទី។",
 "comparison.meta.title": "ប្រៀបធៀបប្រព័ន្ធកុម្ម៉ង់ Food Truck 2026៖ មុខងារ និងតម្លៃ",
 "comparison.meta.description": "ប្រៀបធៀបប្រព័ន្ធកុម្ម៉ង់ Food Truck៖ កុម្ម៉ង់ទុកជាមុនជាមួយម៉ោងទៅយក សមត្ថភាពផ្ទះបាយ កាលវិភាគប្រចាំសប្តាហ៍ ថ្លៃសេវា និងរយៈកិច្ចសន្យា — ពិនិត្យលើគេហទំព័រអ្នកផ្តល់សេវានីមួយៗ។",
 "comparison.meta.about": "ប្រព័ន្ធកុម្ម៉ង់អនឡាញសម្រាប់ Food Truck",
 "comparison.h1": "ប្រៀបធៀបប្រព័ន្ធកុម្ម៉ង់ Food Truck 2026",
 "aboutPage.meta.description": "HatchGrab បង្កើតកម្មវិធីងាយប្រើសម្រាប់ Food Truck និងអាជីវកម្មម្ហូបចល័ត៖ ការកុម្ម៉ង់អនឡាញ ម៉ោងទៅយក និងសំណួរដដែលៗតិចជាងមុន។ បង្កើតឡើងដោយ Dominic Bonini។",
 "truckPage.meta.orderTitle": "{truck} — កុម្ម៉ង់អនឡាញ",
 "truckPage.meta.orderDescription": "កុម្ម៉ង់ទុកជាមុនពី {truck} ហើយទៅយកផ្ទាល់នៅឡាន។"
}
```

## Glossary (the locked Use terms — headings, buttons and feature names MUST use the bold Use term)

## KM — Khmer (Cambodia)

*languages-world-2, 11 November 2026. អ្នក in screens and customer copy, as foodpanda KH (ការកុម្ម៉ង់របស់អ្នក) and GrabMerchant (អាជីវកម្មរបស់អ្នក) write; the more deferential លោកអ្នក (E-GetS Store, Kitchen24) suits formal operator emails; requests with សូម. The order word is កុម្ម៉ង់ (foodpanda, Kitchen24; E-GetS spells កម្ម៉ង់), with formal បញ្ជាទិញ (Grab). Khmer-script queries have no autocomplete — Cambodians search in English (“food truck phnom penh”, “pos system cambodia”), so Food Truck, POS, KDS stay Latin with spaces around them. No spaces between words, spaces between phrases, ។ and ៖ punctuation. Traps: Kitchen24’s cash-on-delivery “បង់ប្រាក់ដោយសាច់ប្រាក់ពេលដឹកជញ្ជូន”; កម្មវិធី means both app and event.*

| Concept | Use | Alternatives / Avoid | B2B/B2C | Conf. | Notes |
|---|---|---|---|---|---|
| Food truck | **Food Truck** | ឡានលក់ម្ហូប (descriptive); avoid ហ្វូដត្រាក់ (no use found) | Both | Low | Phnom Penh trucks use English names |
| Street food | **ម្ហូបតាមផ្លូវ** | អាហារតាមដងផ្លូវ | Both | Low |  |
| Pre-order | **ការកុម្ម៉ង់ទុកជាមុន** | កក់ទុកមុន (= reserve) | Both | Low |  |
| Click & collect | **ទៅយកផ្ទាល់** | កុម្ម៉ង់ទៅយកផ្ទាល់; avoid ដឹកជញ្ជូន (delivery) | Both | High | foodpanda KH tab |
| Pickup time | **ម៉ោងទៅយក** | ម៉ោងទៅយកការកុម្ម៉ង់ | B2C | High | foodpanda KH |
| KDS | **អេក្រង់ផ្ទះបាយ (KDS)** |  | B2B | Low |  |
| POS / till | **ប្រព័ន្ធ POS** | ម៉ាស៊ីនគិតលុយ (cash register) | B2B | Med | “pos system cambodia” searched |
| Card reader | **ម៉ាស៊ីនឆូតកាត** |  | B2B | Low | ABA / KHQR dominate |
| Menu (list of dishes) | **ម៉ឺនុយ** | មុខម្ហូប (dishes) | Both | Med | Kitchen24 |
| Meal deal / combo | **ឈុតម្ហូប (Combo)** |  | B2C | Low |  |
| Allergens | **សារធាតុអាឡែកហ្ស៊ី** |  | Both | Low |  |
| Private hire | **ជួល Food Truck សម្រាប់ពិធី** | avoid កម្មវិធី (= app) for event | Both | Low |  |
| Private event | **ពិធីឯកជន** |  | Both | Low |  |
| Commission-free | **គ្មានកម្រៃជើងសារ** |  | B2B | Low |  |
| WhatsApp auto-reply | **ការឆ្លើយតបស្វ័យប្រវត្តិតាម WhatsApp** | Telegram is the common business chat in KH | B2B | Low |  |
| Walk-up order | **ការកុម្ម៉ង់នៅនឹងកន្លែង** |  | B2B | Low |  |

| **KM** | បង់ប្រាក់ពេលទៅយក | បង់ពេលទៅយក | គ្មានថ្លៃប្រចាំខែ | គ្មានដែនកំណត់ | សាកល្បងឥតគិតថ្លៃ |
