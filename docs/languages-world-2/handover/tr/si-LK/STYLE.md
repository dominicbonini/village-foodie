# STYLE — Sinhala (si-LK, Sri Lanka) — SINHALA SCRIPT
- Address operators (B2B screens) and customers (order page, emails, WhatsApp replies) the same way: **ඔබ / ඔබේ** with the polite **-න්න** imperative ("මෙනුව උඩුගත කරන්න", "සුරකින්න", "ඇණවුම් කරන්න"), as ikman.lk/si ("ඔබේ දැන්විම පළ කරන්න", "සෙවුම සුරකින්න") and PickMe’s Sinhala listing ("ඔබේ පිකප් ස්ථානය ඇතුළු කරන්න") write. Never තෝ/උඹ/ඔයා; avoid stiff ඔබතුමා. Plain, friendly written Sinhala — not literary.
- **Register:** written business Sinhala uses **ඇණවුම / ඇණවුම් කරන්න** (PickMe, Wikipedia); the spoken loanword ඕඩර් (and ඔන්ලයින්) is what people type in searches — use ඇණවුම් in UI, headings and buttons; ඕඩර් only where the glossary allows. Use **ඔන්ලයින්**, not the bookish මාර්ගගත; **යෙදුම** or **ඇප් එක** for app (HelaPOS writes "ඇප් එක").
- **Loanwords in Latin:** keep **food truck, POS, KDS, QR, WhatsApp, HatchGrab** in Latin inside Sinhala sentences, as PickMe ("Ride-Hailing, Food Delivery") and HelaPOS ("POS (Point-of-Sales)") do — Sri Lankans search in English. Do not glue a suffix to a Latin word: write "food truck එක", "food truck සඳහා", "QR කේතය". No plural ending on food truck.
- **Script:** Sinhala Unicode only. Keep the ZERO WIDTH JOINER (U+200D) in rakaaransaya/yansaya (ශ්‍රී, ප්‍රශ්න, ව්‍යාපාර, යන්ත්‍රය) — never strip or normalise it away. ASCII digits (0–9) everywhere.
- **Placeholders:** never attach a case ending to {truck}/{country}/{name} — use a separate postposition or a dash: "{truck} වෙත", "{truck} — ඔන්ලයින් ඇණවුම", "({country})".
- Plural categories (CLDR si): **one, other** — "ඇණවුම් 1", "ඇණවුම් 5" (Sinhala puts the noun before the number in counts, as ikman "දැන්වීම් 1"); write both forms even when identical.
- Numbers: 1,234.50; percent "20%"; currency "රු. 1,500" (Intl si-LK renders "රු. 12,500.00"; ikman writes "රු 90,000"); time 18.30 as Intl renders. Phone: 077 123 4567 (+94 77 123 4567). Postcode 5 digits (කොළඹ 00700, මහනුවර 20000); address = number, road, town. Email/domain: you@yourfoodtruck.lk.
- Sample places: කොළඹ (කොළඹ 07, වැල්ලවත්ත, බත්තරමුල්ල), නුගේගොඩ, මහනුවර, ගාල්ල (ගාලු කොටුව), මීගමුව, කුරුණෑගල, අනුරාධපුරය; venues: "ගාලු මුවදොර පිටිය", "සතිපොළ", "ආහාර උළෙල", "නගර උද්‍යානය", "වෙරළ".
- Takeaway is **පාර්සල්** (Sri Lankan usage: "කෑම පාර්සල්", "බත් පාර්සල්"); kitchen ticket printing is known locally as **KOT**.
- **Pay at Hatch:** feature **"රැගෙන යන විට ගෙවීම"**, short label **"ස්ථානයේදී ගෙවන්න"**. NEVER "Cash on Delivery", "COD", "ලැබුණු පසු ගෙවීම" or ඩිලිවරි — PickMe’s delivery wording; HatchGrab has no delivery.
- Order button: no statutory button wording in Sri Lankan law (none found in the Consumer Affairs Authority Act No. 9 of 2003) — market norm **"ඇණවුම් කරන්න"**; card button "රු. {amount} ගෙවන්න".

## From the country research (seo/si-LK.json) — binding where it does not contradict the rules above

- Address form (research): ඔබ / ඔබේ with polite -න්න imperatives: ikman.lk/si “ඔබේ දැන්විම පළ කරන්න”, “සෙවුම සුරකින්න”, “ඇතුළුවන්න”; PickMe (Play, si) “ඔබේ පිකප් ස්ථානය ඇතුළු කරන්න”, “දැන් වෙන්කරවා ගන්න”; HelaPOS “ඔබේ ව්‍යාපාරයට”. Same form for operators and customers. Never තෝ/උඹ; avoid stiff ඔබතුමා.
- "Pay at Hatch": feature name **රැගෙන යන විට ගෙවීම**, short label/button **ස්ථානයේදී ගෙවන්න**.
- Plan names (planNames.<key>.name; "Pro" keeps "Pro" and gets NO name key): payg **මාසික ගාස්තුවක් නැත**, unlimited **අසීමිත**, trial **නොමිලේ අත්හදා බැලීම** (capitalise as a name), demo and tester: translate "Demo" / "Tester".
- Core terms (use them; TERMS.md records the rest):
  - foodTruck: food truck
  - foodTruckPlural: food truck
  - streetFood: වීදි ආහාර
  - mobileCatering: ජංගම කේටරින්
  - preOrder: පූර්ව ඇණවුම
  - orderAhead: කලින්ම ඇණවුම් කරන්න
  - pickupCollect: ඇවිත් ලබා ගැනීම
  - pickupTime: ලබා ගන්නා වේලාව
  - takeaway: පාර්සල්
  - timeSlot: කාල පරාසය
  - kitchenDisplay: කුස්සියේ තිරය (KDS)
  - pos: POS පද්ධතිය
  - cardReader: කාඩ් යන්ත්‍රය
  - menuListOfDishes: මෙනුව
  - combo: සෙට් මෙනු
  - privateHire: පුද්ගලික උත්සව සඳහා food truck
  - privateEvent: පුද්ගලික උත්සවය
  - mobilePhone: ජංගම දුරකථනය
  - commissionFree: කොමිස් නැතිව
  - whatsappAutoReply: WhatsApp ස්වයංක්‍රීය පිළිතුරු
  - walkUpOrder: ස්ථානයේදී ඇණවුම
  - orderButton: ඇණවුම් කරන්න
  - payAtHatchFeature: රැගෙන යන විට ගෙවීම
  - payAtHatchShort: ස්ථානයේදී ගෙවන්න
  - payAsYouGo: මාසික ගාස්තුවක් නැත
  - unlimited: අසීමිත
  - freeTrial: නොමිලේ අත්හදා බැලීම
- Research decisions/notes (for context; do not stop on them):
  - Sri Lankans search in English (every Sinhala-script food-truck/POS query had zero autocomplete; English ones had ten). Recommend Sinhala pages that keep “food truck”, “POS”, “KDS”, “WhatsApp” in Latin inside Sinhala sentences (as PickMe and HelaPOS do) so titles also match English queries; consider making en-LK / English the default for LK and Sinhala the alternative.
  - Register: formal ඇණවුම / ඇණවුම් කරන්න in titles, headings and buttons (PickMe, Wikipedia); the colloquial loanword ඕඩර් (and ඔන්ලයින්) is what people type — used in secondaryTerms/storeKeywords. Decide whether body copy may use ඕඩර්. “ඔන්ලයින්” chosen over formal “මාර්ගගත” (rare in speech).
  - Pay at Hatch: “රැගෙන යන විට ගෙවීම” (feature, = pay when you take it away) / “ස්ථානයේදී ගෙවන්න” (button, = pay on the spot). Avoid “Cash on Delivery”, “ලැබුණු පසු ගෙවීම”, “ඩිලිවරි” — PickMe’s COD wording. Low confidence: native check needed.
  - Sinhala conjuncts need ZERO WIDTH JOINER (U+200D) in ්‍ර / ්‍ය (ශ්‍රී, ප්‍රශ්න, ව්‍යාපාර, යන්ත්‍රය) — translators and tooling must not strip it.
  - Messaging: WhatsApp is the dominant business chat in Sri Lanka (Deonde lists WhatsApp ordering); Viber is also used — WhatsApp auto-reply can be featured.
  - Payments: LankaQR is the local QR standard (HelaPOS, Deonde); pickup-at-truck card/QR wording could mention it.
  - Order button: no statutory button wording found for Sri Lanka (Consumer Affairs Authority Act No. 9 of 2003 has none known); market norm “ඇණවුම් කරන්න”.

## SEO strings (parts 08 and 09 ONLY): use these for these keys — they carry the researched search terms. Keep placeholders/tags exactly; you may polish wording but keep the primary keyword first in titles, titles ≤60 chars ({country} ≈ 10), descriptions 120–155.

Primary keyword per page: {"landing":"food truck ඇණවුම් පද්ධතිය","features":"පැකේජ සහ විශේෂාංග සංසන්දනය","faq":"food truck ඇණවුම් පද්ධතිය නිතර අසන ප්‍රශ්න","comparison":"food truck ඇණවුම් පද්ධති සංසන්දනය","compare":"ඔන්ලයින් ඇණවුම් වියදම් ගණකය"}

```json
{
 "landing.meta.title": "Food truck ඇණවුම් පද්ධතිය — HatchGrab {country}",
 "landing.meta.description": "පෝලිම් නැතිව, ඔබේ තැනදීම ඇණවුම් සහ පූර්ව ඇණවුම් ලබා ගන්න. food truck සහ ජංගම කේටරින් සඳහා ඇණවුම් සහ කුස්සියේ තිර මෘදුකාංගය ({country}) — POS එකක් නොවේ.",
 "landing.jsonLd.subCategory": "Food truck සහ ජංගම කේටරින් සඳහා ඇණවුම් පද්ධතිය",
 "landing.jsonLd.description": "food truck සහ ජංගම කේටරින් සඳහා ඇණවුම්, පූර්ව ඇණවුම් සහ කුස්සියේ තිරය ({country}).",
 "landing.jsonLd.audience": "Food truck සහ ජංගම කේටරින් ව්‍යාපාර හිමියන්",
 "landing.hero.title": "<lean>food truck</lean> සඳහාම හැදූ ඇණවුම් පද්ධතිය.",
 "landing.does.title": "හැදුවේ food truck සඳහා — අවන්හල් සඳහා නොවේ.",
 "landing.faq.metaTitle": "නිතර අසන ප්‍රශ්න | HatchGrab",
 "landing.faq.metaDescription": "HatchGrab හි මිල ගණන්, පිහිටුවීම, ඇණවුම් ලබා ගැනීම සහ ගෙවීම් ගැන food truck හිමියන්ට කෙටි, පැහැදිලි පිළිතුරු — ආරම්භ කිරීමට පෙර දැනගත යුතු සියල්ල.",
 "featuresPage.metaTitle": "පැකේජ සහ විශේෂාංග සංසන්දනය — HatchGrab {country}",
 "compare.meta.title": "වියදම් ගණකය — HatchGrab {country}",
 "compare.meta.description": "ඔබ දැන් ඔන්ලයින් ඇණවුම් සඳහා වියදම් කරන මුදල, HatchGrab සමඟ වසරක වියදමට සසඳා බලන්න — විනාඩියකින් ඇස්තමේන්තුවක් ලබා ගන්න.",
 "comparison.meta.title": "Food truck ඇණවුම් පද්ධති සංසන්දනය 2026: විශේෂාංග, මිල",
 "comparison.meta.description": "food truck ඇණවුම් පද්ධති සංසන්දනය: ලබා ගන්නා වේලාව සහිත පූර්ව ඇණවුම්, කුස්සියේ ධාරිතාව, සතිපතා කාලසටහන, ගාස්තු, ගිවිසුම් කාලය — එක් එක් වෙබ් අඩවියෙන් පරීක්ෂා කළා.",
 "comparison.meta.about": "food truck සඳහා ඔන්ලයින් ඇණවුම් පද්ධති",
 "comparison.h1": "Food truck ඇණවුම් පද්ධති සංසන්දනය 2026",
 "aboutPage.meta.description": "HatchGrab, food truck සහ ජංගම කේටරින් සඳහා ප්‍රායෝගික මෘදුකාංග හදයි: ඔන්ලයින් ඇණවුම්, ලබා ගන්නා වේලාවන්, නැවත නැවත එන ප්‍රශ්න අඩුවෙන්. ආරම්භ කළේ Dominic Bonini.",
 "truckPage.meta.orderTitle": "{truck} — ඔන්ලයින් ඇණවුම",
 "truckPage.meta.orderDescription": "{truck} — කලින්ම ඇණවුම් කර, food truck එක ළඟින්ම ලබා ගන්න."
}
```

## Glossary (the locked Use terms — headings, buttons and feature names MUST use the bold Use term)

## SI — Sinhala (Sri Lanka)

*languages-world-2, 11 November 2026. ඔබ / ඔබේ with polite -න්න imperatives for operators and customers alike, as ikman.lk/si (ඔබේ දැන්විම පළ කරන්න, සෙවුම සුරකින්න) and PickMe’s Sinhala listing (ඔබේ පිකප් ස්ථානය ඇතුළු කරන්න) write. Sri Lankans search in English (“food truck colombo”, “restaurant pos system sri lanka”); Sinhala-script queries use colloquial loanwords (කෑම ඕඩර්, ඔන්ලයින් ඕඩර්, කෑම පාර්සල්), while written business Sinhala uses ඇණවුම්. Keep food truck, POS, KDS, WhatsApp in Latin inside Sinhala, as PickMe and HelaPOS do. Keep the ZWJ (U+200D) in ්‍ර / ්‍ය. Trap: PickMe’s “Cash on Delivery (COD)” — there is no delivery.*

| Concept | Use | Alternatives / Avoid | B2B/B2C | Conf. | Notes |
|---|---|---|---|---|---|
| Food truck | **food truck** | ජංගම ආහාර රථය (descriptive); avoid ෆුඩ් ට්‍රක් (no search use) | Both | Med | Latin, as ikman ads and LK press; no plural ending |
| Street food | **වීදි ආහාර** | street food (what people search) | Both | Med | si.wikipedia |
| Pre-order | **පූර්ව ඇණවුම** | කලින් ඕඩර් කිරීම (spoken); avoid ප්‍රී ඕඩර් | Both | Low |  |
| Click & collect | **ඇවිත් ලබා ගැනීම** | Self Pickup (PickMe, English UI); avoid ඩිලිවරි | Both | Low |  |
| Pickup time | **ලබා ගන්නා වේලාව** |  | B2C | Low |  |
| KDS | **කුස්සියේ තිරය (KDS)** | KOT (LK word for the printed kitchen ticket, POS Masters) | B2B | Low |  |
| POS / till | **POS පද්ධතිය** | POS යන්ත්‍රය; බිල් මැෂින් (spoken) | B2B | Med | HelaPOS “POS (Point-of-Sales)” |
| Card reader | **කාඩ් යන්ත්‍රය** | card machine (searched in English) | B2B | Low | LankaQR is the local QR |
| Menu (list of dishes) | **මෙනුව** | කෑම මෙනු | Both | High | autocomplete |
| Meal deal / combo | **සෙට් මෙනු** | කොම්බෝ | B2C | Low | “සෙට් මෙනු” in autocomplete |
| Allergens | **ඇලර්ජි කාරක** | ආසාත්මිකතා කාරක (formal) | Both | Low |  |
| Private hire | **පුද්ගලික උත්සව සඳහා food truck** | food truck කුලියට (rent) | Both | Low | “food truck rent sri lanka” searched |
| Private event | **පුද්ගලික උත්සවය** |  | Both | Med |  |
| Commission-free | **කොමිස් නැතිව** | කොමිස් රහිත | B2B | Med | කොමිස් common in autocomplete |
| WhatsApp auto-reply | **WhatsApp ස්වයංක්‍රීය පිළිතුරු** |  | B2B | Med | WhatsApp dominant in LK |
| Walk-up order | **ස්ථානයේදී ඇණවුම** |  | B2B | Low |  |

| **SI** | රැගෙන යන විට ගෙවීම | ස්ථානයේදී ගෙවන්න | මාසික ගාස්තුවක් නැත | අසීමිත | නොමිලේ අත්හදා බැලීම |
