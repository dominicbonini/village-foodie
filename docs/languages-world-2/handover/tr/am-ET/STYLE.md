# STYLE — Amharic (am-ET, Ethiopia) — GE’EZ (FIDEL) SCRIPT
- **Standard written Amharic in Ge’ez (Fidel) script** — the formal register of Amharic Wikipedia and Ethiopian institutions, kept short and plain for an app. Ethiopian food apps (Deliver Addis, Esoora, Ethio Bites) publish in English, so there is no house style to copy: write what a careful Addis product team would ship, and flag doubtful terms.
- **Address: polite/plural second person** (እርስዎ, possessive -ዎ, imperatives ይዘዙ, ይምረጡ, ይክፈሉ, ያስገቡ, ይመዝገቡ) for operators (B2B screens) AND customers (order page, e-mails) — gender-neutral and polite. Never the masculine (እዘዝ, ምረጥ) or feminine (እዘዢ) singular, never slash forms. Buttons: polite imperative (“ያስቀምጡ”, “ይስቀሉ”) or a verbal noun (“ማስቀመጥ”).
- **Punctuation and orthography:** full stop ። (U+1362), comma ፣ (U+1363), semicolon ፤ (U+1364), colon/preface ፦ (U+1366); question mark “?”; ordinary spaces between words (never the old word separator ፡). For the homophone letters (ሀ/ሐ/ኀ, ሰ/ሠ, አ/ዐ, ጸ/ፀ) use ONE spelling per word everywhere: ስርዓት, ሰዓት, ነፃ, ትዕዛዝ, ዓመት, ጥያቄ; the root ሠ-ራ always with ሠ (ሥራ, የተሠራ, ይሠራል, መሥራች). Write digits in ASCII (never Ge’ez numerals ፩ ፪).
- **Loanwords:** common English loans in Fidel — ኦንላይን, ሜኑ, ሶፍትዌር, ሞባይል, ኮሚሽን, ፓኬጅ (plan), ኢሜይል; “app” = መተግበሪያ. Keep in Latin: HatchGrab, WhatsApp, Telegram, KDS, POS, QR (“QR ኮድ”), PDF, Wi-Fi. A prefix may sit on a Latin brand (የWhatsApp, በHatchGrab) but NEVER on a placeholder.
- **Terms (locked):** የምግብ መኪና (plural የምግብ መኪናዎች; “ፉድ ትራክ” only as an aside), የጎዳና ምግብ, ቅድመ-ትዕዛዝ, አስቀድመው ይዘዙ, መጥቶ መውሰድ, የመውሰጃ ሰዓት, ለመውሰድ (take away), የሰዓት ክፍለ ጊዜ, የኩሽና ማሳያ (KDS), POS (“POS አይደለም”), የካርድ ማሽን, ሜኑ, ጥምር ምግብ (ኮምቦ), የግል ዝግጅት, ያለ ኮሚሽን, የWhatsApp ራስ-ሰር ምላሽ, በቦታው የሚሰጥ ትዕዛዝ, ፓኬጅ (plan).
- **Placeholders:** never glue ለ/በ/ከ/የ/-ን/-ው to a placeholder (“ለ{truck}” ✗, “{truck}ን” ✗): use apposition, brackets or a dash — “{truck} — በኦንላይን ይዘዙ”, “የምግብ መኪና፦ {truck}”, “({country})”.
- **Plural categories (CLDR am): one, other** — “one” is 0 and 1: “# ትዕዛዝ” (one) / “# ትዕዛዞች” (other); “# ደቂቃ” reads fine in both (Amharic often keeps the singular after numbers).
- **Numbers and time:** 1,234.50; prices “250 ብር” (Addis Fortune writes “800 Br”); percent “20%”. Times in 24-hour international time only (13:30) — Ethiopian local time counts from 06:00, so never write “6 ሰዓት”-style local hours; dates as the app’s Intl am-ET formatting gives them (Gregorian; write “እ.ኤ.አ.” only in prose that needs it). Phone: 0911 234 567 (+251 911 234 567). No postcodes in addresses: sub-city, woreda, landmark (ቦሌ ክፍለ ከተማ፣ ወረዳ 3፣ ከ… አጠገብ); P.O. Box “ፖ.ሣ.ቁ. 1234”. Email/domain: you@yourfoodtruck.et.
- **Sample places:** አዲስ አበባ (ቦሌ, ፒያሳ, መገናኛ, ካዛንቺስ, ሳርቤት, ሲኤምሲ), አዳማ, ሀዋሳ, ባሕር ዳር, ድሬዳዋ, ጎንደር; venues: “የበዓል ባዛር”, “የቅዳሜ ገበያ”, “መናፈሻ”, “የምግብ ፌስቲቫል”, “የሩጫ ውድድር”.
- **Order button:** Ethiopia has no statutory EU-style order-button wording known (Trade Competition and Consumer Protection Proclamation No. 813/2013; Electronic Transactions Proclamation No. 1205/2020 — not re-checked this session); norm “ትዕዛዙን ያስገቡ” / CTA “ይዘዙ”; card button “{amount} ይክፈሉ”.
- **Pay at Hatch:** feature name **“ሲወስዱ ክፍያ”**, short label **“ሲወስዱ ይክፈሉ”**. Never “ሲደርስዎ ይክፈሉ”, “ዕቃው ሲደርስ ክፍያ” or “ካሽ ኦን ዴሊቨሪ” (cash on delivery). “At the hatch” elsewhere = “ከምግብ መኪናው” / “መኪናው ጋ”.
- **Plans:** Pro; “በአጠቃቀም ልክ ክፍያ” (Pay as you go — “ወርሃዊ ክፍያ የለም”); “ያልተገደበ” (Unlimited); “ነፃ ሙከራ” (Free trial).

## From the country research (seo/am-ET.json) — binding where it does not contradict the rules above

- Address form (research): Polite/plural second person (እርስዎ, possessive -ዎ, imperatives ይዘዙ, ይምረጡ, ይክፈሉ, ይመዝገቡ) for operators and customers — gender-neutral, and the register Ethiopian institutions write in; never the masculine/feminine singular (እዘዝ / እዘዢ). Evidence is thin: the Ethiopian food apps seen (Deliver Addis, Esoora, Ethio Bites) publish their store copy in English only; Amharic Wikipedia (ቴሌብር) writes the formal register with ። and ፣ (“…ክፍያ መፈጸም ፣ ገንዘብ ማስተላለፍ … ይችላሉ።”). A native check is needed.
- "Pay at Hatch": feature name **ሲወስዱ ክፍያ**, short label/button **ሲወስዱ ይክፈሉ**.
- Plan names (planNames.<key>.name; "Pro" keeps "Pro" and gets NO name key): payg **በአጠቃቀም ልክ ክፍያ**, unlimited **ያልተገደበ**, trial **ነፃ ሙከራ** (capitalise as a name), demo and tester: translate "Demo" / "Tester".
- Core terms (use them; TERMS.md records the rest):
  - foodTruck: የምግብ መኪና (ፉድ ትራክ)
  - foodTruckPlural: የምግብ መኪናዎች
  - streetFood: የጎዳና ምግብ
  - mobileCatering: ተንቀሳቃሽ የምግብ አገልግሎት (ኬተሪንግ)
  - preOrder: ቅድመ-ትዕዛዝ
  - orderAhead: አስቀድመው ይዘዙ
  - pickupCollect: መጥቶ መውሰድ
  - pickupTime: የመውሰጃ ሰዓት
  - takeaway: ለመውሰድ (take away)
  - timeSlot: የሰዓት ክፍለ ጊዜ
  - kitchenDisplay: የኩሽና ማሳያ (KDS)
  - pos: POS (የሽያጭ ማሽን)
  - cardReader: የካርድ ማሽን (POS)
  - menuListOfDishes: ሜኑ (የምግብ ዝርዝር)
  - combo: ጥምር ምግብ (ኮምቦ)
  - privateHire: የምግብ መኪና ለዝግጅት መከራየት
  - privateEvent: የግል ዝግጅት
  - mobilePhone: ሞባይል ስልክ
  - commissionFree: ያለ ኮሚሽን
  - whatsappAutoReply: የWhatsApp ራስ-ሰር ምላሽ
  - walkUpOrder: በቦታው የሚሰጥ ትዕዛዝ
  - orderButton: ትዕዛዙን ያስገቡ
  - payAtHatchFeature: ሲወስዱ ክፍያ
  - payAtHatchShort: ሲወስዱ ይክፈሉ
  - payAsYouGo: በአጠቃቀም ልክ ክፍያ
  - unlimited: ያልተገደበ
  - freeTrial: ነፃ ሙከራ
- Research decisions/notes (for context; do not stop on them):
  - Script and register: Ge’ez (Fidel) script, polite/plural address (ይዘዙ, ይክፈሉ, -ዎ), ASCII digits, ። ፣ ፤ ፦ punctuation. Loanwords: ኦንላይን, ሜኑ, ሶፍትዌር, ሞባይል in Fidel; brands, KDS, POS and QR in Latin.
  - Food-truck word: recommend “የምግብ መኪና” (plural የምግብ መኪናዎች) with “ፉድ ትራክ” as a secondary keyword — neither form was found in real Ethiopian copy; native check needed. Food trucks are rare in Ethiopia, so expect very low search volume in any form.
  - Pay at Hatch: recommend feature “ሲወስዱ ክፍያ” / short “ሲወስዱ ይክፈሉ” (pay when you collect). Avoid “ሲደርስዎ ይክፈሉ”, “ዕቃው ሲደርስ ክፍያ” and “ካሽ ኦን ዴሊቨሪ” (cash on delivery — beU offers it, so customers know the phrase).
  - Spelling of homophone letters (ሀ/ሐ/ኀ, ሰ/ሠ, አ/ዐ, ጸ/ፀ): use one spelling per word throughout — ስርዓት, ሰዓት, ነፃ, ትዕዛዝ, ዓመት, ጥያቄ, and ሠ in the root ሠ-ራ (ሥራ, የተሠራ, መሥራች).
  - Time and calendar: Ethiopians use the Ethiopian calendar and local time (day starts at 06:00, so “6 ሰዓት” can mean noon). Show all times in 24-hour international time (e.g. 13:30) and Gregorian dates as Intl am-ET formats them; do not add Ethiopian-time conversions.
  - Messaging and payments: Telegram is the dominant messenger in Ethiopia (Chapa’s Telegram payments) and telebirr / CBE Birr dominate payments; card-only online payment and WhatsApp auto-replies will fit poorly — Pay at the truck will be the main path.
  - The Ethiopian market may not be worth Amharic SEO investment until there is a customer; the copy is provisional.

## SEO strings (parts 08 and 09 ONLY): use these for these keys — they carry the researched search terms. Keep placeholders/tags exactly; you may polish wording but keep the primary keyword first in titles, titles ≤60 chars ({country} ≈ 10), descriptions 120–155.

Primary keyword per page: {"landing":"የምግብ መኪና የኦንላይን ትዕዛዝ ስርዓት","features":"የፓኬጆችና የአገልግሎቶች ንጽጽር","faq":"ተደጋግመው የሚጠየቁ ጥያቄዎች","comparison":"የምግብ መኪና የትዕዛዝ ስርዓቶች ንጽጽር","compare":"የኦንላይን ትዕዛዝ ወጪ ማስሊያ"}

```json
{
 "landing.meta.title": "የምግብ መኪና የኦንላይን ትዕዛዝ ስርዓት — HatchGrab {country}",
 "landing.meta.description": "ትዕዛዝና ቅድመ-ትዕዛዝ ከሚሠሩበት ቦታ ያለ ሰልፍ ይቀበሉ። ለምግብ መኪናዎችና ለተንቀሳቃሽ የምግብ አገልግሎቶች ({country}) የተሠራ የኦንላይን ትዕዛዝና የኩሽና ማሳያ ሶፍትዌር ነው — የPOS ማሽን አይደለም።",
 "landing.jsonLd.subCategory": "ለምግብ መኪናዎችና ለተንቀሳቃሽ የምግብ አገልግሎቶች የትዕዛዝ ስርዓት",
 "landing.jsonLd.description": "ትዕዛዝ፣ ቅድመ-ትዕዛዝ እና የኩሽና ማሳያ ለምግብ መኪናዎችና ለተንቀሳቃሽ የምግብ አገልግሎቶች ({country})።",
 "landing.jsonLd.audience": "የምግብ መኪና ባለቤቶችና ተንቀሳቃሽ የምግብ አገልግሎት ሰጪዎች",
 "landing.hero.title": "ለምግብ መኪናዎች ተብሎ የተሠራ <lean>የትዕዛዝ ስርዓት።</lean>",
 "landing.does.title": "የተሠራው ለምግብ መኪናዎች ነው እንጂ ለምግብ ቤቶች አይደለም።",
 "landing.faq.metaTitle": "ተደጋግመው የሚጠየቁ ጥያቄዎች | HatchGrab",
 "landing.faq.metaDescription": "ለምግብ መኪና ባለቤቶች ግልጽ መልሶች፦ የHatchGrab ዋጋ፣ እንዴት እንደሚጀምሩ፣ ትዕዛዝ እንዴት እንደሚቀበሉ፣ የኩሽና ማሳያው እና ክፍያዎች እንዴት እንደሚሠሩ — ከመመዝገብዎ በፊት ያንብቡ።",
 "featuresPage.metaTitle": "የፓኬጆችና የአገልግሎቶች ንጽጽር — HatchGrab {country}",
 "compare.meta.title": "የወጪ ማስሊያ — HatchGrab {country}",
 "compare.meta.description": "ዛሬ ለኦንላይን ትዕዛዞች የሚያወጡትን ወጪ (ኮሚሽንና ወርሃዊ ክፍያዎች) በHatchGrab ለአንድ ዓመት ከሚያወጡት ወጪ ጋር ያወዳድሩ — ልዩነቱን በአንድ ደቂቃ ውስጥ ይመልከቱ፤ ግምታዊ ስሌት ነው።",
 "comparison.meta.title": "የምግብ መኪና የትዕዛዝ ስርዓቶች ንጽጽር 2026፦ ባህሪያትና ዋጋ",
 "comparison.meta.description": "የምግብ መኪና የትዕዛዝ ስርዓቶች ንጽጽር፦ ቅድመ-ትዕዛዝ ከመውሰጃ ሰዓት ጋር፣ የኩሽና አቅም፣ ሳምንታዊ የሥራ ፕሮግራም፣ ክፍያዎችና የውል ጊዜ — በእያንዳንዱ አቅራቢ ድረ-ገጽ ላይ የተረጋገጠ።",
 "comparison.meta.about": "ለምግብ መኪናዎች የኦንላይን ትዕዛዝ ስርዓቶች",
 "comparison.h1": "የምግብ መኪና የትዕዛዝ ስርዓቶች ንጽጽር 2026",
 "aboutPage.meta.description": "HatchGrab ለምግብ መኪናዎችና ለተንቀሳቃሽ የምግብ አገልግሎቶች ተግባራዊ ሶፍትዌር ይሠራል፦ የኦንላይን ትዕዛዝ፣ የመውሰጃ ሰዓት እና ጥቂት ተደጋጋሚ ጥያቄዎች። መሥራች፦ Dominic Bonini።",
 "truckPage.meta.orderTitle": "{truck} — በኦንላይን ይዘዙ",
 "truckPage.meta.orderDescription": "አስቀድመው ይዘዙ፤ ትዕዛዝዎን ከምግብ መኪናው ይውሰዱ — {truck}።"
}
```

## Glossary (the locked Use terms — headings, buttons and feature names MUST use the bold Use term)

## AM — Amharic (Ethiopia)

*languages-world-2, 11 November 2026. Polite/plural second person (እርስዎ, -ዎ, ይዘዙ, ይምረጡ, ይክፈሉ) for operators and customers — gender-neutral and the formal written register (Amharic Wikipedia); never masculine/feminine singular imperatives. Ge’ez script, ASCII digits, ። ፣ ፤ ፦. Ethiopian food apps (Deliver Addis, Esoora, Ethio Bites) publish in English, so most rows are standard-Amharic choices that need a native check. Traps: cash-on-delivery phrases (ሲደርስዎ ይክፈሉ, ካሽ ኦን ዴሊቨሪ — beU offers COD), gendered singular forms, and Ethiopian local time (6 ሰዓት = noon).*

| Concept | Use | Alternatives / Avoid | B2B/B2C | Conf. | Notes |
|---|---|---|---|---|---|
| Food truck | **የምግብ መኪና** | ፉድ ትራክ (secondary keyword) | Both | Low | plural የምግብ መኪናዎች |
| Street food | **የጎዳና ምግብ** | የመንገድ ዳር ምግብ | Both | Low |  |
| Pre-order | **ቅድመ-ትዕዛዝ** | አስቀድመው ይዘዙ (verb) | Both | Low |  |
| Click & collect | **መጥቶ መውሰድ** | avoid ማድረስ / ዴሊቨሪ (delivery) | Both | Low |  |
| Pickup time | **የመውሰጃ ሰዓት** |  | B2C | Low | 24-hour international time only |
| KDS | **የኩሽና ማሳያ (KDS)** | የወጥ ቤት ማሳያ | B2B | Low | Ethio Bites “Kitchen Display System (KDS)” |
| POS / till | **POS (የሽያጭ ማሽን)** | ካሽ ሬጂስተር | B2B | Low |  |
| Card reader | **የካርድ ማሽን (POS)** |  | B2B | Low |  |
| Menu (list of dishes) | **ሜኑ** | የምግብ ዝርዝር | Both | Med |  |
| Meal deal / combo | **ጥምር ምግብ (ኮምቦ)** |  | B2C | Low |  |
| Allergens | **አለርጂ የሚያስከትሉ ንጥረ ነገሮች** |  | Both | Low |  |
| Private hire | **የምግብ መኪና ለዝግጅት መከራየት** |  | Both | Low |  |
| Private event | **የግል ዝግጅት** |  | Both | Med |  |
| Commission-free | **ያለ ኮሚሽን** |  | B2B | Med |  |
| WhatsApp auto-reply | **የWhatsApp ራስ-ሰር ምላሽ** |  | B2B | Low | Telegram dominates in Ethiopia |
| Walk-up order | **በቦታው የሚሰጥ ትዕዛዝ** |  | B2B | Low |  |

| **AM** | ሲወስዱ ክፍያ | ሲወስዱ ይክፈሉ | በአጠቃቀም ልክ ክፍያ | ያልተገደበ | ነፃ ሙከራ |
