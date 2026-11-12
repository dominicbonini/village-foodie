# STYLE — Macedonian (mk-MK, North Macedonia) — CYRILLIC SCRIPT
- **Write in Macedonian Cyrillic only** (а б в г д ѓ е ж з ѕ и ј к л љ м н њ о п р с т ќ у ф х ц ч џ ш) — Wolt Macedonia, local restaurant software (B&G Soft/BarResto, Cube Systems) and Macedonian pages write Cyrillic. Never Serbian/Bulgarian letters or words: нарачка (not поруџбина/наруџбина/поръчка), мени, плаќање, подигнување, ќ/ѓ (not ћ/ђ), ј (not й). Latin only for brands (HatchGrab, WhatsApp), “KDS”, “QR”, “POS”.
- OPERATORS (B2B screens, e-mails): polite plural **вие/ваш**, lower-case on screens, with plural imperatives in sentences (“Прикачете го менито”, “Зачувајте ги промените”). Buttons/labels: short imperative as Wolt MK writes “Закажи нарачка”: “Зачувај”, “Додај”, “Нарачај”.
- CUSTOMERS (order page, status, customer e-mails, WhatsApp replies): also **вие** in sentences (“Нарачајте однапред и подигнете ја нарачката кај фуд тракот”), short imperative buttons; friendly and brief.
- Loanwords: food truck → **фуд трак** (pl. **фуд тракови**) in Cyrillic — recommendation, not yet confirmed in Macedonian use (see decisions); “online” → **онлајн**; “app” → **апликација**; “QR” → **QR код**; catering → **кетеринг**; takeaway → **за понесување** (B&G Soft “понесување”).
- **Articles and placeholders:** Macedonian adds the definite article as a suffix (-от, -та, -то, -те) — never on a placeholder (“{truck}-от” ✗). Use apposition or a colon: “фуд тракот {truck}”, “Отстрането: {name}”, “({country})”.
- Plural categories (CLDR mk): **one, other** — one = 1, 21, 31, 101 … (not 11): “1 нарачка”, “21 нарачка”, “2 нарачки”, “11 нарачки”, “5 нарачки”. Write both cases for every count plural.
- Numbers: 1.234,5 (dot thousands, comma decimal); percent “20%”; money “350 ден.” (MKD; the app’s Intl formatting renders it). Phone example: 070 123 456 (+389 70 123 456). Postcode 4 digits (1000 Скопје). Email/domain: vie@vasiotfudtrak.mk.
- Sample places: Скопје (Старата чаршија, Дебар Маало, Карпош, Аеродром), Битола (Широк Сокак), Охрид (кејот), Струмица, Тетово, Куманово; venues: “Градски парк”, “Зелен пазар”, “Бит пазар”, “Плоштад Македонија”, “фестивал на улична храна”.
- Order button: the Закон за заштита на потрошувачите follows Directive 2011/83/EU (button must state the payment obligation); exact statutory words not verified → **“Нарачај со обврска за плаќање”**; card button “Плати {amount}”.
- Pay at Hatch: feature **“Плаќање при подигнување”**, short label **“Плати при подигнување”**. NEVER “плаќање при испорака” / “наплата при достава” (cash on delivery). Pickup = **подигнување** (Wolt MK “Само подигнување”); испорака/достава = delivery, which HatchGrab does not do.
- “Not a POS”: **“не е каса”**. Plans: **Без месечна претплата** (Pay as you go), **Pro**, **Неограничено** (Unlimited), **Бесплатен пробен период** (Free trial).
- Quotation marks: „…“ (Macedonian style) — never a straight ' or " inside a string (ICU).

## From the country research (seo/mk-MK.json) — binding where it does not contradict the rules above

- Address form (research): Polite plural вие/ваш in body copy (Macedonian pages such as mk.airbnb.com write “Истражете ја уличната храна…”); buttons and short labels in the 2nd-person-singular imperative as Wolt Macedonia writes them (“Закажи нарачка”). Lower-case вие on screens.
- "Pay at Hatch": feature name **Плаќање при подигнување**, short label/button **Плати при подигнување**.
- Plan names (planNames.<key>.name; "Pro" keeps "Pro" and gets NO name key): payg **Без месечна претплата**, unlimited **Неограничено**, trial **Бесплатен пробен период** (capitalise as a name), demo and tester: translate "Demo" / "Tester".
- Core terms (use them; TERMS.md records the rest):
  - foodTruck: фуд трак
  - foodTruckPlural: фуд тракови
  - streetFood: улична храна
  - mobileCatering: мобилен кетеринг
  - preOrder: нарачка однапред
  - orderAhead: Нарачајте однапред
  - pickupCollect: подигнување
  - pickupTime: време за подигнување
  - takeaway: за понесување
  - timeSlot: термин
  - kitchenDisplay: кујнски екран (KDS)
  - pos: каса (касов систем)
  - cardReader: POS терминал за картички
  - menuListOfDishes: мени
  - combo: комбо мени
  - privateHire: фуд трак за настани
  - privateEvent: приватен настан
  - mobilePhone: мобилен телефон
  - commissionFree: без провизија
  - whatsappAutoReply: автоматски одговор на WhatsApp
  - walkUpOrder: нарачка на лице место
  - orderButton: Нарачај со обврска за плаќање
  - payAtHatchFeature: Плаќање при подигнување
  - payAtHatchShort: Плати при подигнување
  - payAsYouGo: Без месечна претплата
  - unlimited: Неограничено
  - freeTrial: Бесплатен пробен период
- Research decisions/notes (for context; do not stop on them):
  - Food-truck word: recommend Cyrillic “фуд трак” / plural “фуд тракови” (consistent Cyrillic UI; same approach as bg-BG’s “фуд тръкове”), with Latin “food truck” as a secondary keyword in storeKeywords. Low confidence — no Macedonian usage found for either; a native or Keyword Planner check before launch is needed.
  - Order button: North Macedonia’s Закон за заштита на потрошувачите follows Directive 2011/83/EU, which requires the button to say the order implies an obligation to pay. Recommend “Нарачај со обврска за плаќање”; the exact statutory words were not verified — confirm against the Службен весник text.
  - Pay at Hatch: recommend “Плаќање при подигнување” (feature) / “Плати при подигнување” (button), built on Wolt MK’s “подигнување”. TRAP: “плаќање при испорака” / “наплата при достава” is cash on delivery — never use it.
  - Do not borrow Bulgarian (поръчка, фуд трък) or Serbian (поруџбина, наруџбина) forms; Macedonian is нарачка, мени, плаќање with ќ ѓ ѕ ј љ њ џ.
  - Currency: denar (MKD, written “350 ден.”).
  - {country} = “Северна Македонија” (the constitutional short name since 2019); strings keep it in brackets.

## SEO strings (parts 08 and 09 ONLY): use these for these keys — they carry the researched search terms. Keep placeholders/tags exactly; you may polish wording but keep the primary keyword first in titles, titles ≤60 chars ({country} ≈ 10), descriptions 120–155.

Primary keyword per page: {"landing":"систем за нарачки за фуд тракови","features":"споредба на пакети и функции","faq":"често поставувани прашања систем за нарачки","comparison":"системи за нарачки за фуд тракови","compare":"калкулатор на трошоци за онлајн нарачки"}

```json
{
 "landing.meta.title": "Систем за нарачки за фуд тракови — HatchGrab {country}",
 "landing.meta.description": "Примајте нарачки и нарачки однапред без редици. Софтвер за нарачки и кујнски екран за фуд тракови и мобилен кетеринг ({country}) — не е каса.",
 "landing.jsonLd.subCategory": "Систем за нарачки за фуд тракови и мобилен кетеринг",
 "landing.jsonLd.description": "Нарачки, нарачки однапред и кујнски екран за фуд тракови и мобилен кетеринг ({country}).",
 "landing.jsonLd.audience": "Сопственици на фуд тракови и фирми за мобилен кетеринг",
 "landing.hero.title": "Системот за нарачки создаден за <lean>фуд тракови.</lean>",
 "landing.does.title": "Создаден за фуд тракови, не за ресторани.",
 "landing.faq.metaTitle": "Често поставувани прашања | HatchGrab",
 "landing.faq.metaDescription": "Јасни одговори за сопствениците на фуд тракови: цените на HatchGrab, поставувањето, примањето нарачки и плаќањето со картичка или при подигнување.",
 "featuresPage.metaTitle": "Споредба на пакети и функции — HatchGrab {country}",
 "compare.meta.title": "Калкулатор на трошоци — HatchGrab {country}",
 "compare.meta.description": "Споредете колку ве чинат онлајн нарачките сега со она што би го платиле за една година со HatchGrab — проценка за една минута.",
 "comparison.meta.title": "Системи за нарачки за фуд тракови 2026: функции и цени",
 "comparison.meta.description": "Споредба на системи за нарачки за фуд тракови: нарачки однапред со време за подигнување, капацитет на кујната, распоред, провизии, договор — проверено.",
 "comparison.meta.about": "Системи за онлајн нарачки за фуд тракови",
 "comparison.h1": "Споредба на системи за нарачки за фуд тракови 2026",
 "aboutPage.meta.description": "HatchGrab прави практичен софтвер за фуд тракови и кетеринг: онлајн нарачки, време за подигнување и помалку повторени прашања. Основач: Dominic Bonini.",
 "truckPage.meta.orderTitle": "{truck} — нарачајте онлајн",
 "truckPage.meta.orderDescription": "{truck}: нарачајте однапред и подигнете ја нарачката кај фуд тракот."
}
```

## Glossary (the locked Use terms — headings, buttons and feature names MUST use the bold Use term)

## MK — Macedonian (North Macedonia)

*languages-world-2, 11 November 2026. Cyrillic only. Polite plural вие/ваш in body copy (lower-case on screens); buttons in the short imperative as Wolt Macedonia writes them (“Закажи нарачка”). Wolt MK says “Само подигнување” for pickup and “Испорака” for delivery; Macedonian restaurant software (B&G Soft/BarResto, Cube Systems) says каса, понесување, нарачки. No Macedonian usage of the food-truck word was found in any spelling: “фуд трак” (pl. “фуд тракови”) is a recommendation that needs a native check. Traps: Bulgarian (поръчка, фуд трък) and Serbian (поруџбина) forms; “плаќање при испорака / достава” (cash on delivery). Prices in denars (ден.).*

| Concept | Use | Alternatives / Avoid | B2B/B2C | Conf. | Notes |
|---|---|---|---|---|---|
| Food truck | **фуд трак** | food truck (Latin); avoid Bulgarian “фуд трък” | Both | Low | pl. фуд тракови |
| Street food | **улична храна** |  | Both | Med | mk.airbnb.com |
| Pre-order | **нарачка однапред** | закажи нарачка (Wolt: schedule) | Both | Med |  |
| Click & collect | **подигнување** | Avoid “испорака”, “достава” (= delivery) | Both | High | Wolt MK “Само подигнување” |
| Pickup time | **време за подигнување** |  | B2C | Med |  |
| KDS | **кујнски екран (KDS)** |  | B2B | Med |  |
| POS / till | **каса** | касов систем; фискална каса | B2B | Med | B&G Soft |
| Card reader | **POS терминал за картички** | картичен терминал | B2B | Low |  |
| Menu (list of dishes) | **мени** |  | Both | High |  |
| Meal deal / combo | **комбо мени** |  | B2C | Low |  |
| Allergens | **алергени** |  | Both | Med |  |
| Private hire | **фуд трак за настани** |  | Both | Low |  |
| Private event | **приватен настан** |  | Both | Med |  |
| Commission-free | **без провизија** |  | B2B | Med |  |
| WhatsApp auto-reply | **автоматски одговор на WhatsApp** |  | B2B | Med |  |
| Walk-up order | **нарачка на лице место** |  | B2B | Low |  |

| **MK** | Плаќање при подигнување | Плати при подигнување | Без месечна претплата | Неограничено | Бесплатен пробен период |
