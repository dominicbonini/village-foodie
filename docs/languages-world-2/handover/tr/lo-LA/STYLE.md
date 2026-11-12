# STYLE — Lao (lo-LA, Laos) — LAO SCRIPT
- Address operators and customers with **ທ່ານ / ຂອງທ່ານ** and polite **ກະລຸນາ** for requests, as foodpanda LA ("ການສັ່ງຊື້ຂອງທ່ານ", "ກະລຸນາເລືອກເວລາອື່ນ"), E-GetS Store, Q POS and BCEL OnePay Shop write. Not the casual ເຈົ້າ (Chompa, LOCA EV). Short buttons without pronoun ("ບັນທຶກ", "ສັ່ງເລີຍ").
- **Lao, not Thai:** Lao spellings and words only; modern **ຫຼ / ໜ / ໝ** (not ຫລ / ຫນ / ຫມ — foodpanda mixes them); keep **ຣ** in loanwords as businesses write them (ໂປຣ, ແບຣນ, ຟຣີ). Never paste Thai script.
- **Spacing:** no spaces between words; a space between phrases and around **ແລະ** / **ຫຼື** ("ສົ່ງໄວ ແລະ ສົ່ງງ່າຍ") and around Latin words. Lao uses "." "!" "?" and ໆ for repetition ("ແຊບໆ").
- **Order words:** **ອໍເດີ້** (loan, foodpanda LA) in short UI, **ລາຍການສັ່ງຊື້** in formal text, verb **ສັ່ງ**; pickup **ໄປຮັບເອງ**, pickup time **ເວລາໄປຮັບ**, takeaway **ສັ່ງກັບບ້ານ** (all foodpanda LA). Keep **Food Truck, POS, KDS, QR, WhatsApp, HatchGrab** in Latin; Lao-script loans in real use: **ແອັບ**, **ອອນລາຍ**, **ເມນູ**, **ໄຣເດີ້**.
- Plural categories (CLDR lo): **other** only ("3 ອໍເດີ້"); keep the English `one` key harmlessly identical.
- Numbers: ASCII digits. Intl lo-LA renders 1.234.567,5 and "₭12.500", but Lao businesses write "10,000ກີບ" (LOCA) — see the decision in the SEO file; percent "20%". Phone: 020 5512 3456 (+856 20 5512 3456). Postcode 5 digits (01000); address = ບ້ານ, ເມືອງ, ແຂວງ / ນະຄອນຫຼວງວຽງຈັນ. Email/domain: you@yourfoodtruck.la.
- Sample places: ນະຄອນຫຼວງວຽງຈັນ (ຈັນທະບູລີ, ສີສັດຕະນາກ, ບ້ານອານຸ), ຫຼວງພະບາງ, ວັງວຽງ, ປາກເຊ, ສະຫວັນນະເຂດ, ທ່າແຂກ; venues: "ຕະຫຼາດກາງຄືນ", "ຮິມຂອງ", "ສວນສາທາລະນະ", "ງານບຸນ".
- **Pay at Hatch:** feature **"ຈ່າຍເງິນຕອນໄປຮັບ"**, short label **"ຈ່າຍທີ່ລົດ"**. NEVER "ເກັບເງິນປາຍທາງ" (cash on delivery) or delivery wording — there is no delivery.
- Order button: no statutory order-button wording known in Lao law — market norm **"ສັ່ງເລີຍ"** (foodpanda "ລອງສັ່ງເລີຍ!"); card button "ຈ່າຍ {amount}".

## From the country research (seo/lo-LA.json) — binding where it does not contradict the rules above

- Address form (research): ທ່ານ / ຂອງທ່ານ with ກະລຸນາ for requests: foodpanda LA “ການສັ່ງຊື້ຂອງທ່ານ”, “ກະລຸນາກວດເບິ່ງອໍເດີ້ຂອງທ່ານ”; E-GetS Store (merchant) “ທຸລະກິດຂອງທ່ານ”; Q POS and BCEL OnePay Shop “ຮ້ານຂອງທ່ານ”. Casual ເຈົ້າ appears in Chompa Delivery and LOCA EV — avoid. Same ທ່ານ for operators and customers.
- "Pay at Hatch": feature name **ຈ່າຍເງິນຕອນໄປຮັບ**, short label/button **ຈ່າຍທີ່ລົດ**.
- Plan names (planNames.<key>.name; "Pro" keeps "Pro" and gets NO name key): payg **ບໍ່ມີຄ່າລາຍເດືອນ**, unlimited **ບໍ່ຈຳກັດ**, trial **ທົດລອງໃຊ້ຟຣີ** (capitalise as a name), demo and tester: translate "Demo" / "Tester".
- Core terms (use them; TERMS.md records the rest):
  - foodTruck: Food Truck
  - foodTruckPlural: Food Truck
  - streetFood: ອາຫານຂ້າງທາງ
  - mobileCatering: ບໍລິການອາຫານເຄື່ອນທີ່
  - preOrder: ການສັ່ງລ່ວງໜ້າ
  - orderAhead: ສັ່ງລ່ວງໜ້າ
  - pickupCollect: ໄປຮັບເອງ
  - pickupTime: ເວລາໄປຮັບ
  - takeaway: ສັ່ງກັບບ້ານ
  - timeSlot: ຊ່ວງເວລາ
  - kitchenDisplay: ໜ້າຈໍຄົວ (KDS)
  - pos: ລະບົບ POS
  - cardReader: ເຄື່ອງຮູດບັດ
  - menuListOfDishes: ເມນູ
  - combo: ຊຸດອາຫານ
  - privateHire: ຈ້າງ Food Truck ໄປງານ
  - privateEvent: ງານສ່ວນຕົວ
  - mobilePhone: ໂທລະສັບມືຖື
  - commissionFree: ບໍ່ມີຄ່າຄອມມິດຊັນ
  - whatsappAutoReply: ຕອບກັບອັດຕະໂນມັດທາງ WhatsApp
  - walkUpOrder: ອໍເດີ້ໜ້າຮ້ານ
  - orderButton: ສັ່ງເລີຍ
  - payAtHatchFeature: ຈ່າຍເງິນຕອນໄປຮັບ
  - payAtHatchShort: ຈ່າຍທີ່ລົດ
  - payAsYouGo: ບໍ່ມີຄ່າລາຍເດືອນ
  - unlimited: ບໍ່ຈຳກັດ
  - freeTrial: ທົດລອງໃຊ້ຟຣີ
- Research decisions/notes (for context; do not stop on them):
  - Food truck: written in Latin “Food Truck” — no Lao-script form has search use; the Thai-style loan “ຟູດທຣັກ” is possible but unattested here. Descriptive “ລົດຂາຍອາຫານ” may appear once in body copy. Native check needed.
  - Order word: “ອໍເດີ້” (loan, foodpanda LA uses it in most status texts) for short UI; “ລາຍການສັ່ງຊື້ / ຄຳສັ່ງຊື້” in formal or legal text; verb “ສັ່ງ”.
  - Write Lao, not Thai: Lao spellings and words only (ຮ້ານ, ເມນູ, ໂທລະສັບ); modern ຫຼ (not ຫລ) — foodpanda mixes both; loanwords keep ຣ as businesses write them (ໂປຣ, ແບຣນ, ຟຣີ).
  - Pay at Hatch: “ຈ່າຍເງິນຕອນໄປຮັບ” (feature, = pay when you go to collect) / “ຈ່າຍທີ່ລົດ” (button, = pay at the truck). Avoid “ເກັບເງິນປາຍທາງ” (cash on delivery) and “ຈ່າຍຕອນຮັບເຄື່ອງ”. Low confidence.
  - Number style: Intl lo-LA renders 1.234.567,5 and ₭12.500, but Lao businesses write 10,000ກີບ (LOCA). Decide whether to keep Intl output or override grouping for LAK.
  - Payments: BCEL OnePay QR is the dominant payment (OnePay Shop); card readers are uncommon at stalls.
  - Order button: no statutory order-button wording known for Laos (not checked against the Law on Consumer Protection text); market norm “ສັ່ງເລີຍ” (foodpanda “ລອງສັ່ງເລີຍ!”).

## SEO strings (parts 08 and 09 ONLY): use these for these keys — they carry the researched search terms. Keep placeholders/tags exactly; you may polish wording but keep the primary keyword first in titles, titles ≤60 chars ({country} ≈ 10), descriptions 120–155.

Primary keyword per page: {"landing":"ລະບົບສັ່ງອາຫານສຳລັບ Food Truck","features":"ປຽບທຽບແພັກເກັດ ແລະ ຄຸນສົມບັດ","faq":"ຄຳຖາມທີ່ພົບເລື້ອຍ ລະບົບສັ່ງອາຫານ Food Truck","comparison":"ປຽບທຽບລະບົບສັ່ງອາຫານ Food Truck","compare":"ຄິດໄລ່ຄ່າໃຊ້ຈ່າຍອໍເດີ້ອອນລາຍ"}

```json
{
 "landing.meta.title": "ລະບົບສັ່ງອາຫານສຳລັບ Food Truck — HatchGrab {country}",
 "landing.meta.description": "ຮັບອໍເດີ້ ແລະ ການສັ່ງລ່ວງໜ້າຢູ່ຈຸດຂາຍ ໂດຍລູກຄ້າບໍ່ຕ້ອງຕໍ່ຄິວ. ລະບົບສັ່ງອາຫານ ແລະ ໜ້າຈໍຄົວສຳລັບ Food Truck ແລະ ອາຫານເຄື່ອນທີ່ ({country}) — ບໍ່ແມ່ນລະບົບ POS.",
 "landing.jsonLd.subCategory": "ລະບົບສັ່ງອາຫານສຳລັບ Food Truck ແລະ ບໍລິການອາຫານເຄື່ອນທີ່",
 "landing.jsonLd.description": "ຮັບອໍເດີ້, ການສັ່ງລ່ວງໜ້າ ແລະ ໜ້າຈໍຄົວ ສຳລັບ Food Truck ແລະ ບໍລິການອາຫານເຄື່ອນທີ່ ({country}).",
 "landing.jsonLd.audience": "ເຈົ້າຂອງ Food Truck ແລະ ທຸລະກິດອາຫານເຄື່ອນທີ່",
 "landing.hero.title": "ລະບົບສັ່ງອາຫານທີ່ສ້າງມາເພື່ອ <lean>Food Truck</lean>",
 "landing.does.title": "ສ້າງມາເພື່ອ Food Truck, ບໍ່ແມ່ນຮ້ານອາຫານ.",
 "landing.faq.metaTitle": "ຄຳຖາມທີ່ພົບເລື້ອຍ | HatchGrab",
 "landing.faq.metaDescription": "ຄຳຕອບທີ່ຊັດເຈນສຳລັບເຈົ້າຂອງ Food Truck ກ່ຽວກັບລາຄາຂອງ HatchGrab, ການຕັ້ງຄ່າ, ການຮັບອໍເດີ້ ແລະ ການຈ່າຍເງິນ — ສິ່ງທີ່ຄວນຮູ້ກ່ອນເລີ່ມໃຊ້ງານ.",
 "featuresPage.metaTitle": "ປຽບທຽບແພັກເກັດ ແລະ ຄຸນສົມບັດ — HatchGrab {country}",
 "compare.meta.title": "ຄິດໄລ່ຄ່າໃຊ້ຈ່າຍ — HatchGrab {country}",
 "compare.meta.description": "ປຽບທຽບຄ່າໃຊ້ຈ່າຍຂອງອໍເດີ້ອອນລາຍທີ່ທ່ານຈ່າຍຢູ່ຕອນນີ້ ກັບການໃຊ້ HatchGrab ເປັນເວລາໜຶ່ງປີ — ໄດ້ຕົວເລກປະມານການພາຍໃນ 1 ນາທີເທົ່ານັ້ນ.",
 "comparison.meta.title": "ປຽບທຽບລະບົບສັ່ງອາຫານ Food Truck 2026: ຄຸນສົມບັດ ແລະ ລາຄາ",
 "comparison.meta.description": "ປຽບທຽບລະບົບສັ່ງອາຫານ Food Truck: ການສັ່ງລ່ວງໜ້າພ້ອມເວລາໄປຮັບ, ກຳລັງຜະລິດຂອງຄົວ, ຕາຕະລາງປະຈຳອາທິດ, ຄ່າທຳນຽມ ແລະ ໄລຍະສັນຍາ — ກວດຈາກເວັບໄຊຂອງແຕ່ລະລາຍ.",
 "comparison.meta.about": "ລະບົບສັ່ງອາຫານອອນລາຍສຳລັບ Food Truck",
 "comparison.h1": "ປຽບທຽບລະບົບສັ່ງອາຫານ Food Truck 2026",
 "aboutPage.meta.description": "HatchGrab ສ້າງຊອບແວທີ່ໃຊ້ໄດ້ຈິງສຳລັບ Food Truck ແລະ ທຸລະກິດອາຫານເຄື່ອນທີ່: ອໍເດີ້ອອນລາຍ, ເວລາໄປຮັບ ແລະ ຄຳຖາມຊ້ຳໆໜ້ອຍລົງ. ກໍ່ຕັ້ງໂດຍ Dominic Bonini.",
 "truckPage.meta.orderTitle": "ສັ່ງອາຫານຈາກ {truck}",
 "truckPage.meta.orderDescription": "ສັ່ງລ່ວງໜ້າຈາກ {truck} ແລ້ວໄປຮັບເອງທີ່ລົດ."
}
```

## Glossary (the locked Use terms — headings, buttons and feature names MUST use the bold Use term)

## LO — Lao (Laos)

*languages-world-2, 11 November 2026. ທ່ານ / ຂອງທ່ານ with ກະລຸນາ for requests, for operators and customers, as foodpanda LA (ການສັ່ງຊື້ຂອງທ່ານ, ກະລຸນາກວດເບິ່ງອໍເດີ້ຂອງທ່ານ), E-GetS Store, Q POS and BCEL OnePay Shop write; casual ເຈົ້າ (Chompa, LOCA EV) is avoided. Orders are ອໍເດີ້ in short UI and ລາຍການສັ່ງຊື້ / ຄຳສັ່ງຊື້ in formal text; the one Lao-script query with suggestions is ສັ່ງອາຫານ. Food Truck, POS, KDS stay Latin. Lao, not Thai: Lao spellings, modern ຫຼ, loanwords with ຣ as businesses write them (ໂປຣ, ຟຣີ); spaces around ແລະ / ຫຼື, no spaces between words. Trap: ເກັບເງິນປາຍທາງ (cash on delivery) — there is no delivery.*

| Concept | Use | Alternatives / Avoid | B2B/B2C | Conf. | Notes |
|---|---|---|---|---|---|
| Food truck | **Food Truck** | ລົດຂາຍອາຫານ (descriptive); ຟູດທຣັກ unattested; avoid Thai ฟู้ดทรัค | Both | Low |  |
| Street food | **ອາຫານຂ້າງທາງ** |  | Both | Low |  |
| Pre-order | **ການສັ່ງລ່ວງໜ້າ** |  | Both | Med |  |
| Click & collect | **ໄປຮັບເອງ** | ໄປຮັບເອົາເອງທີ່ຮ້ານ (foodpanda tab); Pick Up (Latin, foodpanda Play) | Both | High |  |
| Pickup time | **ເວລາໄປຮັບ** | ເວລາໄປຮັບເອງທີ່ຮ້ານ | B2C | High | foodpanda LA |
| KDS | **ໜ້າຈໍຄົວ (KDS)** | ລະບົບສະແດງຜົນໃນເຮືອນຄົວ (Q POS) | B2B | Med |  |
| POS / till | **ລະບົບ POS** | ຈຸດຂາຍ (POS) (OnePay, Q POS) | B2B | High |  |
| Card reader | **ເຄື່ອງຮູດບັດ** |  | B2B | Low | BCEL OnePay QR dominates |
| Menu (list of dishes) | **ເມນູ** |  | Both | High | E-GetS, Q POS |
| Meal deal / combo | **ຊຸດອາຫານ** | ເຊັດ | B2C | Low |  |
| Allergens | **ສານກໍ່ພູມແພ້** |  | Both | Low |  |
| Private hire | **ຈ້າງ Food Truck ໄປງານ** |  | Both | Low |  |
| Private event | **ງານສ່ວນຕົວ** |  | Both | Med |  |
| Commission-free | **ບໍ່ມີຄ່າຄອມມິດຊັນ** | ບໍ່ມີຄ່າທຳນຽມ (= no fee — different promise) | B2B | Low |  |
| WhatsApp auto-reply | **ຕອບກັບອັດຕະໂນມັດທາງ WhatsApp** |  | B2B | Med |  |
| Walk-up order | **ອໍເດີ້ໜ້າຮ້ານ** |  | B2B | Low |  |

| **LO** | ຈ່າຍເງິນຕອນໄປຮັບ | ຈ່າຍທີ່ລົດ | ບໍ່ມີຄ່າລາຍເດືອນ | ບໍ່ຈຳກັດ | ທົດລອງໃຊ້ຟຣີ |
