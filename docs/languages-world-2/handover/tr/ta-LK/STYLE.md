# STYLE — Tamil (ta-LK, Sri Lanka) — SRI LANKAN TAMIL
- Address operators and customers with **நீங்கள் / உங்கள்**: body copy uses the polite **-ங்கள்** imperative ("மெனுவைப் பதிவேற்றுங்கள்", "பெற்றுக்கொள்ளுங்கள்"); buttons use the short **-வும்** / **-க** form as ikman.lk/ta does ("சேமிக்கவும்", "உள்நுழைக", "விளம்பரத்தை வெளியிடுக"). Never நீ. Customer copy warm and short.
- **Sri Lankan Tamil, NOT Indian Tamil** (research): ஒன்லைன் (not ஆன்லைன்), உணவு விநியோகம் (PickMe, Hiru News; not டெலிவரி), ஊடாக (not மூலம்), கொடுப்பனவு for payment (PickMe "பணமில்லா கொடுப்பனவுகள்"), இணையத்தளம் (not இணையதளம்), வாராந்த (not வாராந்திர), முறைமை for system, கைத்தொலைபேசி (not செல்போன்/மொபைல்), லொறி, முச்சக்கர வண்டி, ரூபா / ரூ. Never ₹, ரூபாய் prices, UPI, GST, FSSAI, Swiggy or Zomato.
- **Loanwords:** keep **food truck, POS, KDS, QR, WhatsApp, HatchGrab** in Latin — Sri Lankans search "food truck colombo / jaffna / trincomalee" in English. Use the Tamil-script loans people really write: ஆர்டர் (PickMe), மெனு, பார்சல் (takeaway), கேட்டரிங். Never glue a case ending to a Latin word or a placeholder — add a Tamil noun: "food truck வணிகங்களுக்கு", "{truck} — ஒன்லைன் ஆர்டர்", "({country})".
- Script: Tamil Unicode; ASCII digits; no Grantha-heavy or archaic forms; use ஃ only where standard.
- Plural categories (CLDR ta): **one, other** — "1 ஆர்டர்", "5 ஆர்டர்கள்".
- Numbers: write 1,234.50 and "20%". NOTE: Intl ta-LK renders lakh grouping "12,34,567.5" and "Rs. 12,500.00" (checked) — prices are usually under a lakh; see the decision in the SEO file. Phone: 077 123 4567 (+94 77 123 4567). Postcode 5 digits (யாழ்ப்பாணம் 40000, கொழும்பு 00600). Email/domain: you@yourfoodtruck.lk.
- Sample places: கொழும்பு (வெள்ளவத்தை, புறக்கோட்டை), யாழ்ப்பாணம் (நல்லூர்), மட்டக்களப்பு, திருகோணமலை, கண்டி, வவுனியா, நுவரெலியா; venues: "சந்தை", "உணவுத் திருவிழா", "காலி முகத்திடல்", "கடற்கரை", "பூங்கா".
- **Pay at Hatch:** feature **"எடுக்க வரும்போது செலுத்துதல்"**, short label **"நேரில் செலுத்தவும்"**. NEVER "Cash on Delivery", "டெலிவரியின்போது பணம்" or "பெற்றதும் பணம்" — there is no delivery.
- Order button: no statutory button wording in Sri Lankan law — market norm **"ஆர்டர் செய்யவும்"**; card button "ரூ. {amount} செலுத்தவும்".

## From the country research (seo/ta-LK.json) — binding where it does not contradict the rules above

- Address form (research): நீங்கள் / உங்கள் with polite -ங்கள் imperatives in body copy and -வும்/-க forms on buttons: ikman.lk/ta “உங்கள் தேடலைச் சேமிக்கவும்”, “உள்நுழைக”, “விளம்பரத்தை வெளியிடுக”; PickMe (Play, ta) “உங்கள் பிக்-அப் இடத்தை உள்ளிடவும்”, “இப்போது முன்பதிவு செய்”. Same form for operators and customers; never நீ.
- "Pay at Hatch": feature name **எடுக்க வரும்போது செலுத்துதல்**, short label/button **நேரில் செலுத்தவும்**.
- Plan names (planNames.<key>.name; "Pro" keeps "Pro" and gets NO name key): payg **மாதக் கட்டணம் இல்லை**, unlimited **வரம்பற்றது**, trial **இலவச சோதனைக் காலம்** (capitalise as a name), demo and tester: translate "Demo" / "Tester".
- Core terms (use them; TERMS.md records the rest):
  - foodTruck: food truck
  - foodTruckPlural: food truck
  - streetFood: தெரு உணவு
  - mobileCatering: நடமாடும் கேட்டரிங்
  - preOrder: முன்கூட்டிய ஆர்டர்
  - orderAhead: முன்கூட்டியே ஆர்டர் செய்யுங்கள்
  - pickupCollect: நேரில் வந்து பெற்றுக்கொள்ளல்
  - pickupTime: பெற்றுக்கொள்ளும் நேரம்
  - takeaway: பார்சல்
  - timeSlot: நேர ஒதுக்கீடு
  - kitchenDisplay: சமையலறைத் திரை (KDS)
  - pos: POS முறைமை
  - cardReader: அட்டை இயந்திரம் (card machine)
  - menuListOfDishes: மெனு
  - combo: செட் மெனு
  - privateHire: தனியார் நிகழ்வுகளுக்கு food truck
  - privateEvent: தனியார் நிகழ்வு
  - mobilePhone: கைத்தொலைபேசி
  - commissionFree: கமிஷன் இல்லாமல்
  - whatsappAutoReply: WhatsApp தானியங்கிப் பதில்
  - walkUpOrder: நேரடி ஆர்டர்
  - orderButton: ஆர்டர் செய்யவும்
  - payAtHatchFeature: எடுக்க வரும்போது செலுத்துதல்
  - payAtHatchShort: நேரில் செலுத்தவும்
  - payAsYouGo: மாதக் கட்டணம் இல்லை
  - unlimited: வரம்பற்றது
  - freeTrial: இலவச சோதனைக் காலம்
- Research decisions/notes (for context; do not stop on them):
  - Searchers type English (“food truck colombo/jaffna/trincomalee”); keep “food truck” in Latin inside Tamil text and never glue a Tamil case ending to it — put a Tamil noun after it (food truck வணிகங்களுக்கு, food truck அருகிலேயே).
  - Sri Lankan Tamil, not Indian: ஒன்லைன், விநியோகம், கொடுப்பனவு, இணையத்தளம், வாராந்த, கைத்தொலைபேசி, ரூபா; no ₹/UPI/GST/Swiggy. A Sri Lankan (Jaffna/Colombo) Tamil reviewer should check — the Tamil autocomplete pool is dominated by India.
  - “ஆர்டர்” (PickMe’s word) chosen over formal “கட்டளை”; the SL spoken form “ஓடர்” has no search use.
  - Pay at Hatch: “எடுக்க வரும்போது செலுத்துதல்” (feature, = pay when you come to collect) / “நேரில் செலுத்தவும்” (button, = pay in person). Avoid “டெலிவரியின்போது பணம்”, “Cash on Delivery”, “பெற்றதும் பணம்” (COD). Low confidence.
  - Number grouping: Intl ta-LK renders lakh grouping (12,34,567); Sri Lankan usage is 1,234,567. Decide whether to format ta-LK numbers with en-LK/si-LK grouping (prices are usually < 1 lakh, so impact is small).
  - Order button: no statutory button wording found for Sri Lanka; market norm “ஆர்டர் செய்யவும்”.

## SEO strings (parts 08 and 09 ONLY): use these for these keys — they carry the researched search terms. Keep placeholders/tags exactly; you may polish wording but keep the primary keyword first in titles, titles ≤60 chars ({country} ≈ 10), descriptions 120–155.

Primary keyword per page: {"landing":"food truck ஆர்டர் முறைமை","features":"திட்டங்கள், அம்சங்கள் ஒப்பீடு","faq":"food truck ஆர்டர் முறைமை – அடிக்கடி கேட்கப்படும் கேள்விகள்","comparison":"food truck ஆர்டர் முறைமைகள் ஒப்பீடு","compare":"ஒன்லைன் ஆர்டர் செலவுக் கணிப்பான்"}

```json
{
 "landing.meta.title": "Food truck ஆர்டர் முறைமை — HatchGrab {country}",
 "landing.meta.description": "வரிசை இன்றி ஆர்டர்களும் முன்கூட்டிய ஆர்டர்களும் பெறுங்கள். food truck, நடமாடும் கேட்டரிங் சேவைகளுக்கான ஆர்டர், சமையலறைத் திரை மென்பொருள் ({country}) — POS அல்ல.",
 "landing.jsonLd.subCategory": "Food truck, நடமாடும் கேட்டரிங் சேவைகளுக்கான ஆர்டர் முறைமை",
 "landing.jsonLd.description": "food truck, நடமாடும் கேட்டரிங் சேவைகளுக்கான ஆர்டர்கள், முன்கூட்டிய ஆர்டர்கள், சமையலறைத் திரை ({country}).",
 "landing.jsonLd.audience": "Food truck, நடமாடும் கேட்டரிங் உரிமையாளர்கள்",
 "landing.hero.title": "<lean>food truck</lean> வணிகங்களுக்காகவே உருவான ஆர்டர் முறைமை.",
 "landing.does.title": "உணவகங்களுக்காக அல்ல, food truck வணிகங்களுக்காகவே உருவானது.",
 "landing.faq.metaTitle": "அடிக்கடி கேட்கப்படும் கேள்விகள் | HatchGrab",
 "landing.faq.metaDescription": "HatchGrab விலைகள், அமைத்தல், ஆர்டர்களைப் பெறுதல், கொடுப்பனவுகள் பற்றி food truck உரிமையாளர்களுக்கான தெளிவான பதில்கள் — தொடங்கும் முன் அறிய வேண்டியவை.",
 "featuresPage.metaTitle": "திட்டங்கள், அம்சங்கள் ஒப்பீடு — HatchGrab {country}",
 "compare.meta.title": "செலவுக் கணிப்பான் — HatchGrab {country}",
 "compare.meta.description": "ஒன்லைன் ஆர்டர்களுக்கு இப்போது நீங்கள் செலவிடும் தொகையை HatchGrab உடனான ஒரு வருடச் செலவுடன் ஒப்பிடுங்கள் — ஒரு நிமிடத்தில் மதிப்பீடு.",
 "comparison.meta.title": "Food truck ஆர்டர் முறைமைகள் ஒப்பீடு 2026: அம்சங்கள், விலை",
 "comparison.meta.description": "food truck ஆர்டர் முறைமைகள் ஒப்பீடு: பெற்றுக்கொள்ளும் நேரத்துடன் முன்கூட்டிய ஆர்டர், சமையலறைக் கொள்ளளவு, வாராந்த அட்டவணை, கட்டணங்கள், ஒப்பந்தக் காலம் — தளங்களில் சரிபார்த்தது.",
 "comparison.meta.about": "food truck வணிகங்களுக்கான ஒன்லைன் ஆர்டர் முறைமைகள்",
 "comparison.h1": "Food truck ஆர்டர் முறைமைகள் ஒப்பீடு 2026",
 "aboutPage.meta.description": "HatchGrab, food truck, நடமாடும் கேட்டரிங் வணிகங்களுக்கு நடைமுறை மென்பொருள் உருவாக்குகிறது: ஒன்லைன் ஆர்டர்கள், பெற்றுக்கொள்ளும் நேரங்கள், குறைவான கேள்விகள். நிறுவியவர் Dominic Bonini.",
 "truckPage.meta.orderTitle": "{truck} — ஒன்லைன் ஆர்டர்",
 "truckPage.meta.orderDescription": "{truck} — முன்கூட்டியே ஆர்டர் செய்து, food truck அருகிலேயே பெற்றுக்கொள்ளுங்கள்."
}
```

## Glossary (the locked Use terms — headings, buttons and feature names MUST use the bold Use term)

## TA — Tamil (Sri Lanka)

*languages-world-2, 11 November 2026. நீங்கள் / உங்கள் with polite -ங்கள் imperatives in body copy and -வும்/-க forms on buttons, as ikman.lk/ta (உங்கள் தேடலைச் சேமிக்கவும், உள்நுழைக) and PickMe’s Tamil listing write. Sri Lankan Tamil, not Indian: ஒன்லைன் (not ஆன்லைன்), விநியோகம் (PickMe, Hiru News), ஊடாக, கொடுப்பனவு, இணையத்தளம், வாராந்த, கைத்தொலைபேசி, ரூபா; no ₹, UPI, GST, Swiggy or Zomato. Searchers type English (“food truck jaffna/trincomalee/colombo”), so food truck stays in Latin and never takes a glued case ending. Trap: “Cash on Delivery” / டெலிவரியின்போது பணம் — there is no delivery.*

| Concept | Use | Alternatives / Avoid | B2B/B2C | Conf. | Notes |
|---|---|---|---|---|---|
| Food truck | **food truck** | நடமாடும் உணவு வாகனம் (descriptive); avoid ஃபுட் டிரக், உணவு லொறி (no search use) | Both | Med | Latin, as ikman ads |
| Street food | **தெரு உணவு** | சாலையோர உணவு (ta.wikipedia title) | Both | Med | autocomplete |
| Pre-order | **முன்கூட்டிய ஆர்டர்** | முன்பதிவு (= booking/reservation) | Both | Low |  |
| Click & collect | **நேரில் வந்து பெற்றுக்கொள்ளல்** | Self Pickup (PickMe, English); avoid டெலிவரி | Both | Low | பெற்றுக்கொள்ளுங்கள் is Sri Lankan usage |
| Pickup time | **பெற்றுக்கொள்ளும் நேரம்** |  | B2C | Low |  |
| KDS | **சமையலறைத் திரை (KDS)** | KOT for the printed kitchen ticket | B2B | Low |  |
| POS / till | **POS முறைமை** | விற்பனை முனை (wiki); avoid Indian “பில்லிங் சிஸ்டம்” | B2B | Low |  |
| Card reader | **அட்டை இயந்திரம் (card machine)** | கார்ட் மெஷின் | B2B | Low |  |
| Menu (list of dishes) | **மெனு** | உணவுப் பட்டியல் (formal) | Both | Med | “கேட்டரிங் மெனு” in autocomplete |
| Meal deal / combo | **செட் மெனு** | கொம்போ | B2C | Low |  |
| Allergens | **ஒவ்வாமைப் பொருட்கள்** |  | Both | Low |  |
| Private hire | **தனியார் நிகழ்வுகளுக்கு food truck** | food truck வாடகைக்கு | Both | Low |  |
| Private event | **தனியார் நிகழ்வு** |  | Both | Med |  |
| Commission-free | **கமிஷன் இல்லாமல்** | தரகுக் கட்டணம் இல்லை | B2B | Low |  |
| WhatsApp auto-reply | **WhatsApp தானியங்கிப் பதில்** |  | B2B | Med |  |
| Walk-up order | **நேரடி ஆர்டர்** |  | B2B | Low |  |

| **TA** | எடுக்க வரும்போது செலுத்துதல் | நேரில் செலுத்தவும் | மாதக் கட்டணம் இல்லை | வரம்பற்றது | இலவச சோதனைக் காலம் |
