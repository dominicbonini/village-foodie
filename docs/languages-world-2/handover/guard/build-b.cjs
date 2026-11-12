// Writes the 11 allergen-guard lists of languages-world-2 group b (hi, bn, ur, ne, si, ta, km, lo, fil, sw, am) next to this
// script, in the shape of lib/allergen-guard/*.json. Method copied from languages-world-1's build.cjs.
const fs = require('fs'), path = require('path')
const tail = 'OPTION B, as every other language: absence / safety words only, NOT the bare allergen names (a presence question may reach the AI, which answers only from the tags and gets the caveat). Matched with the Unicode normaliser. caveatWords: a tagged label of the codex allergen set (stored in English, lower case) → the words a reply may use for it (matched on the raw lower-cased reply, so written as the AI writes them).'
// The English safety words customers mix into every one of these languages (English is matched only through these lists).
const EN = ['allerg', 'alerg', 'alerj', 'allerj', 'elerg', 'intoleran', 'celiac', 'coeliac', 'gluten free', 'glutenfree', 'dairy free', 'nut free', 'egg free',
  'eggless', 'lactose', 'epipen', 'epi pen', 'anaphyla', 'cross contamina', 'may contain', 'traces of', 'free from', 'safe for', 'sensitive to']
// "<prefix> <noun>" and "<noun> <suffix>" combinations: a bare "without" / "no" is never a stem, only bound to an allergen.
const pre = (ps, ns, js = [' ']) => ps.flatMap(p => ns.flatMap(n => js.map(j => p + j + n)))
const post = (ns, ps, js = [' ']) => ns.flatMap(n => ps.flatMap(p => js.map(j => n + j + p)))
const L = {}
L.hi = {
  what: 'HINDI (hi-IN): एलर्जी / एलर्जिक (and ऐलर्जी, अलर्जी), असहिष्णुता / इनटॉलरेंस, सीलिएक, ग्लूटेन फ्री / मुक्त, बिना <allergen> / <allergen> के बिना / <allergen> नहीं, नहीं खा सकता/सकती, पचता नहीं / हजम नहीं, परहेज, सुरक्षित, उपयुक्त, कंटैमिनेशन / संदूषण, अंश हो सकते — plus romanised Hindi (allergy hai, bina doodh, nahi kha sakta). Vowel signs, virama, anusvara and nukta are stripped on both sides, so every stem is checked by its consonant skeleton: bare बिना (→ बन, inside बना / बने / बन) and bare मुक्त are NOT stems, and एलर्ज is not matched by लार्ज (large); बिना तिल is left out (→ the skeleton of बना तला, made fried)',
  stems: [...EN, 'एलर्ज', 'ऐलर्ज', 'अलर्ज', 'असहिष्णु', 'इनटॉलर', 'इंटॉलर', 'सीलिएक', 'सीलियक', 'एनाफिल', 'एपिपेन',
    'ग्लूटेन फ्री', 'ग्लूटेन मुक्त', 'डेयरी फ्री', 'डेयरी मुक्त', 'लैक्टोज', 'नट फ्री', 'एगलेस',
    ...pre(['बिना'], ['ग्लूटेन', 'दूध', 'डेयरी', 'अंडे', 'अण्डे', 'मूंगफली', 'नट्स', 'मेवे', 'काजू', 'बादाम', 'झींगा', 'सीफूड', 'मछली', 'सोया']),
    ...post(['ग्लूटेन', 'दूध', 'अंडे', 'मूंगफली', 'नट्स', 'मेवे', 'काजू', 'झींगा', 'सीफूड'], ['के बिना']),
    'दूध नहीं', 'अंडे नहीं', 'मूंगफली नहीं', 'नहीं खा सकत', 'नहीं खा पात', 'पचता नहीं', 'हजम नहीं', 'परहेज', 'सुरक्षित', 'उपयुक्त', 'संवेदनशील',
    'कंटैमिन', 'संदूषण', 'दूषित', 'अंश हो सकत', 'मौजूद हो सकत',
    'bina gluten', 'gluten ke bina', 'bina doodh', 'bina dudh', 'doodh ke bina', 'dudh ke bina', 'bina ande', 'bina anda', 'ande ke bina', 'anda nahi', 'ande nahi',
    'bina moongfali', 'bina mungfali', 'moongfali nahi', 'bina nuts', 'bina kaju', 'bina badam', 'bina mewa', 'bina meva',
    'nahi kha sakt', 'nahin kha sakt', 'nhi kha sakt', 'nahi kha pat', 'hazam nahi', 'pachta nahi', 'parhez', 'parhej', 'surakshit'],
  cav: { gluten: ['ग्लूटेन', 'ग्लुटेन', 'गेहूं', 'गेहूँ', 'आटा', 'मैदा', 'जौ', 'जई'], crustaceans: ['झींगा', 'झींगे', 'केकड़ा', 'केकड़े', 'लॉबस्टर', 'प्रॉन', 'सीफूड', 'समुद्री भोजन'],
    eggs: ['अंडा', 'अंडे', 'अण्डा', 'अण्डे', 'मेयोनेज', 'मेयोनीज'], fish: ['मछली', 'मछलि', 'फिश'], peanuts: ['मूंगफली', 'मूँगफली'], soy: ['सोया', 'सोयाबीन', 'टोफू'],
    milk: ['दूध', 'डेयरी', 'लैक्टोज', 'पनीर', 'चीज', 'मक्खन', 'घी', 'क्रीम', 'दही', 'मलाई', 'खोया'], 'tree nuts': ['मेवा', 'मेवे', 'काजू', 'बादाम', 'अखरोट', 'पिस्ता', 'नट्स'],
    sulphites: ['सल्फाइट', 'सल्फर डाइऑक्साइड'] },
}
L.bn = {
  what: 'BENGALI as in Bangladesh (bn-BD): এলার্জি / অ্যালার্জি, অসহিষ্ণুতা / ইনটলারেন্স, সহ্য হয় না, হজম হয় না, খেলে সমস্যা, খেতে পারি না, সিলিয়াক, গ্লুটেন ফ্রি / মুক্ত, <allergen> ছাড়া / <allergen> নেই, নিরাপদ, জন্য উপযুক্ত, কন্টামিনেশন / দূষণ — plus romanised Bangla (allergy ache, dudh chara). Vowel signs, hasanta, chandrabindu and the nukta of য় / ড় are stripped on both sides: bare ছাড়া (→ ছড, inside ছেড়ে) and bare মুক্ত (inside মুক্তি) are NOT stems, bare উপযুক্ত is not (উপযুক্ত দাম = fair price), and এলার্জ is not matched by লার্জ (large)',
  stems: [...EN, 'অ্যালার্জ', 'এলার্জ', 'এ্যালার্জ', 'অসহিষ্ণু', 'ইনটলার', 'সহ্য হয়', 'হজম হয় না', 'হজম হয়না', 'খেলে সমস্যা', 'খেতে পারি না', 'খেতে পারিনা',
    'সিলিয়াক', 'অ্যানাফাইল', 'এপিপেন', 'গ্লুটেন ফ্রি', 'গ্লুটেন মুক্ত', 'গ্লুটেনমুক্ত', 'ল্যাকটোজ', 'ডেইরি ফ্রি', 'বাদাম মুক্ত', 'বাদামমুক্ত',
    ...post(['গ্লুটেন', 'দুধ', 'ডিম', 'বাদাম', 'চিংড়ি', 'মাছ', 'ডেইরি'], ['ছাড়া']), ...post(['গ্লুটেন', 'দুধ', 'ডিম', 'বাদাম', 'চিংড়ি'], ['নেই']),
    'নিরাপদ', 'জন্য উপযুক্ত', 'সংবেদনশীল', 'কন্টামিন', 'দূষণ',
    'gluten chara', 'gluten chhara', 'dudh chara', 'dudh chhara', 'dim chara', 'dim chhara', 'badam chara', 'badam chhara', 'chingri chara',
    'khele somos', 'khele shomos', 'khete pari na', 'khete parina', 'hojom hoy na', 'hojom hoyna', 'nirapod'],
  cav: { gluten: ['গ্লুটেন', 'গম', 'আটা', 'ময়দা', 'বার্লি'], crustaceans: ['চিংড়ি', 'কাঁকড়া', 'লবস্টার', 'সামুদ্রিক খাবার', 'সিফুড'], eggs: ['ডিম', 'মেয়োনিজ'],
    fish: ['মাছ', 'ফিশ'], peanuts: ['চিনাবাদাম', 'বাদাম'], soy: ['সয়া', 'সয়াবিন', 'টোফু'], milk: ['দুধ', 'ল্যাকটোজ', 'পনির', 'চিজ', 'মাখন', 'ঘি', 'ক্রিম', 'দই', 'ডেইরি'],
    'tree nuts': ['কাজু', 'কাঠবাদাম', 'আখরোট', 'পেস্তা', 'বাদাম'], sulphites: ['সালফাইট'] },
}
L.ur = {
  what: 'URDU (ur-PK): الرجی / الرجک (and ایلرجی), عدم برداشت / برداشت نہیں, ہضم نہیں, حساسیت, سیلیک, گلوٹین فری / سے پاک, <allergen> کے بغیر / بغیر <allergen>, نہ ڈالیں / مت ڈالیں, نہیں کھا سکتا/سکتی, کے لیے محفوظ / موزوں, محفوظ ہے, شامل / موجود ہو سکتا, آلودگی, پرہیز — plus Roman Urdu (allergy hai, doodh ke baghair, nahi kha sakta). Written with the Urdu letters (ی ک ہ); zer/zabar/pesh and hamza fold away on both sides. Bare بغیر and bare سے پاک (inside سے پاکستان) are NOT stems, nor bare شامل نہیں (ڈلیوری شامل نہیں = delivery not included), nor bare مناسب (مناسب قیمت = fair price)',
  stems: [...EN, 'الرج', 'ایلرج', 'عدم برداشت', 'برداشت نہیں', 'ہضم نہیں', 'حساسیت', 'سیلیک', 'سیلیاک', 'اینافیل', 'ایپی پین', 'ایپی پن',
    ...post(['گلوٹین', 'گلوٹن', 'ڈیری', 'لیکٹوز', 'نٹ'], ['فری']), ...post(['گلوٹین', 'گلوٹن', 'دودھ', 'لیکٹوز', 'میوے'], ['سے پاک']),
    ...post(['گلوٹین', 'گلوٹن', 'دودھ', 'ڈیری', 'انڈے', 'انڈا', 'انڈوں', 'مونگ پھلی', 'میوے', 'میوہ', 'نٹس', 'بادام', 'کاجو', 'جھینگے', 'مچھلی', 'سویا', 'تل'], ['کے بغیر']),
    ...pre(['بغیر'], ['گلوٹین', 'گلوٹن', 'دودھ', 'انڈے', 'انڈا', 'مونگ پھلی', 'میوے', 'نٹس', 'بادام', 'جھینگے']),
    'لیکٹوز', 'نہ ڈال', 'مت ڈال', 'نہیں کھا سک', 'نہیں کھا پات', 'کے لیے محفوظ', 'کے لئے محفوظ', 'کیلئے محفوظ', 'کیلیے محفوظ', 'محفوظ ہے',
    'کے لیے موزوں', 'کے لئے موزوں', 'کیلئے موزوں', 'شامل ہو سکت', 'موجود ہو سکت', 'آمیزش', 'ذرات', 'آلودگ', 'کنٹیمی', 'پرہیز',
    'gluten ke baghair', 'gluten k baghair', 'baghair gluten', 'doodh ke baghair', 'dudh ke baghair', 'doodh k baghair', 'anday ke baghair', 'ande ke baghair',
    'nahi kha sakt', 'nahin kha sakt', 'nai kha sakt', 'hazam nahi', 'hazam nai', 'parhez', 'mehfooz'],
  cav: { gluten: ['گلوٹین', 'گلوٹن', 'گندم', 'آٹا', 'میدہ'], crustaceans: ['جھینگا', 'جھینگے', 'کیکڑا', 'کیکڑے', 'لابسٹر', 'سی فوڈ', 'سمندری غذا'],
    eggs: ['انڈا', 'انڈے', 'انڈوں', 'میونیز', 'مایونیز'], fish: ['مچھلی', 'مچھلیاں', 'فش'], peanuts: ['مونگ پھلی'], soy: ['سویا', 'ٹوفو'],
    milk: ['دودھ', 'ڈیری', 'لیکٹوز', 'پنیر', 'مکھن', 'گھی', 'کریم', 'دہی', 'بالائی'], 'tree nuts': ['میوے', 'میوہ', 'بادام', 'کاجو', 'اخروٹ', 'پستہ', 'نٹس'],
    sulphites: ['سلفائٹ'] },
}
L.ne = {
  what: 'NEPALI (ne-NP): एलर्जी, असहिष्णु, सेलियाक, ग्लुटेन फ्री / मुक्त, <allergen> नभएको/नभएका, बिना <allergen> / <allergen> बिनाको, नहाल्नुहोस् / नराख्नुहोस्, खान मिल्दैन / हुँदैन / सक्दिन, पच्दैन, सहँदैन, सुरक्षित, लागि उपयुक्त, मिसिएको / अंश हुन सक्छ — plus romanised Nepali (allergy cha, khana mildaina, dudh nabhayeko). Vowel signs, virama and chandrabindu are stripped on both sides, so every stem is checked by its skeleton: bare नभएको (आज खुला नभएको?) and bare बिना are NOT stems',
  stems: [...EN, 'एलर्ज', 'ऐलर्ज', 'अलर्ज', 'असहिष्णु', 'सेलियाक', 'सेलिएक', 'एपिपेन', 'ग्लुटेन फ्री', 'ग्लुटेन मुक्त', 'ग्लुटेनमुक्त', 'डेरी फ्री', 'ल्याक्टोज',
    ...post(['ग्लुटेन', 'दूध', 'डेरी', 'अण्डा', 'अन्डा', 'अंडा', 'बदाम', 'नट', 'काजू', 'माछा', 'झिंगा', 'भटमास'], ['नभएको']),
    ...pre(['बिना'], ['ग्लुटेन', 'दूध', 'अण्डा', 'बदाम', 'काजू']), ...post(['ग्लुटेन', 'दूध', 'अण्डा', 'बदाम'], ['बिनाको']),
    'नहाल', 'नराख', 'खान मिल्दैन', 'खान हुँदैन', 'खान सक्दिन', 'पच्दैन', 'पचाउन सक्दिन', 'सहँदैन', 'सुरक्षित', 'लागि उपयुक्त', 'मिसिएको हुन सक', 'अंश हुन सक', 'संवेदनशील',
    'khana mildaina', 'khana mil daina', 'khana sakdina', 'khana hudaina', 'khana hunna', 'gluten nabhayeko', 'dudh nabhayeko', 'anda nabhayeko', 'badam nabhayeko',
    'pachdaina', 'nahalnu', 'nahalera', 'surakshit'],
  cav: { gluten: ['ग्लुटेन', 'ग्लूटेन', 'गहुँ', 'मैदा', 'आटा', 'जौ'], crustaceans: ['झिंगा', 'झिँगा', 'गंगटा', 'केकडा', 'सीफुड', 'समुद्री खाना'],
    eggs: ['अण्डा', 'अन्डा', 'अंडा', 'मेयोनिज'], fish: ['माछा'], peanuts: ['बदाम', 'मूंगफली'], soy: ['भटमास', 'सोया', 'टोफु'],
    milk: ['दूध', 'दुध', 'डेरी', 'पनिर', 'चिज', 'मक्खन', 'घ्यू', 'क्रिम', 'दही', 'ल्याक्टोज'], 'tree nuts': ['काजु', 'काजू', 'ओखर', 'पिस्ता', 'आल्मन्ड', 'हाडे बदाम', 'नट्स'],
    sulphites: ['सल्फाइट'] },
}
L.si = {
  what: 'SINHALA (si-LK): ඇලර්ජි, අසාත්මිකතාව / ආසාත්මික, නොඉවසීම, දිරවන්නේ නැහැ, සීලියැක්, ග්ලූටන් රහිත / ෆ්‍රී, <allergen> නැති / නැද්ද / නැහැ, අඩංගු නැති / නැද්ද, අඩංගු විය හැකි, දාන්න එපා, කන්න බැහැ / බැරි, ආරක්ෂිත, සඳහා සුදුසු, (හරස්) දූෂණය, ලැක්ටෝස් — plus Singlish (gluten nathi). Vowel signs, al-lakuna and anusvara are stripped on both sides, and the ZWJ of rakaransaya/yansaya becomes a space, so ෆ්‍රී is listed with and without it. Every stem is checked by its skeleton: bare දිරව (→ the skeleton of දරුවා, child) is NOT a stem, nor කිරි නැති / නැතුව (→ the skeleton of කර නැතුව, without doing), nor bare අඩංගු (what does it contain = a presence question)',
  stems: [...EN, 'ඇලර්ජ', 'සාත්මික', 'නොඉවසීම', 'දිරවන්න', 'සීලියැක්', 'ලැක්ටෝස්',
    'ග්ලූටන් රහිත', 'ග්ලූටන් ෆ්‍රී', 'ග්ලූටන් ෆ්රී', 'කිරි රහිත', 'කිරි නිෂ්පාදන නැති', 'ලැක්ටෝස් රහිත',
    ...post(['ග්ලූටන්', 'බිත්තර', 'කජු', 'ඉස්සෝ', 'මාළු', 'ඇට වර්ග'], ['නැති', 'නැද්ද', 'නැහැ']),
    'අඩංගු නැ', 'අඩංගු විය හැක', 'අඩංගු වෙන්න පුළුවන්', 'දාන්න එපා', 'දාන්නෙපා', 'කන්න බැහැ', 'කන්න බැරි', 'ආරක්ෂිත', 'සුරක්ෂිත', 'සඳහා සුදුසු', 'දූෂණ',
    'gluten nathi', 'kiri nathi', 'biththara nathi', 'bittara nathi', 'kaju nathi', 'kanna baha', 'kanna bari', 'danna epa'],
  cav: { gluten: ['ග්ලූටන්', 'තිරිඟු', 'පාන් පිටි', 'බාර්ලි'], crustaceans: ['ඉස්සෝ', 'ඉස්සන්', 'කකුළු', 'පොකිරිස්සෝ', 'මුහුදු ආහාර'], eggs: ['බිත්තර', 'මයොනීස්'],
    fish: ['මාළු', 'කරවල', 'ටූනා'], peanuts: ['රටකජු'], soy: ['සෝයා', 'ටෝෆු'], milk: ['කිරි', 'ලැක්ටෝස්', 'චීස්', 'බටර්', 'ගිතෙල්', 'ක්‍රීම්', 'යෝගට්', 'මුදවාපු'],
    'tree nuts': ['කජු', 'ආමන්ඩ්', 'වෝල්නට්', 'ඇට වර්ග', 'පිස්තා'], sulphites: ['සල්ෆයිට්'] },
}
L.ta = {
  what: 'TAMIL as in Sri Lanka (ta-LK): ஒவ்வாமை / ஒவ்வாது, அலர்ஜி, சகிப்புத்தன்மை, செரிக்காது / ஜீரணிக்க, ஒத்துக்கொள்ளாது / ஒத்துவராது, சீலியாக், <allergen> இல்லாத / இல்லாமல் / இல்லையா (பசையம், குளுட்டன், பால், முட்டை, கடலை, கச்சான்…), சேர்க்காமல் / போடாமல், சாப்பிட முடியாது, பாதுகாப்பான, க்கு ஏற்றது / க்கு உகந்த, கலந்திருக்கலாம், தடயங்கள், குறுக்கு மாசு — plus Tanglish (allergy irukku, paal illama). Vowel signs and pulli are stripped on both sides, so every stem is checked by its skeleton: bare ஒவ்வா (→ the skeleton of ஒவ்வொரு, every) is NOT a stem, nor bare செரிக்கா (சரக்கு), தடய (தடையில்லை) or போடா (படம், photo), nor bare இல்லாத, nor bare ஏற்றது (விலை ஏற்றதா = has the price gone up)',
  stems: [...EN, 'ஒவ்வாமை', 'ஒவ்வாது', 'அலர்ஜ', 'சகிப்புத்தன்மை', 'செரிக்காது', 'ஜீரணிக்க', 'ஜீரணமாகா', 'ஒத்துக்கொள்ளாத', 'ஒத்துவராது', 'ஒத்து வராது',
    'சீலியாக்', 'எபிபென்', 'லாக்டோஸ்',
    ...post(['குளுட்டன்', 'பசையம்', 'பால்', 'முட்டை', 'கடலை', 'கச்சான்', 'கொட்டை', 'முந்திரி', 'இறால்', 'நண்டு', 'மீன்', 'சோயா', 'எள்'], ['இல்ல']),
    'சேர்க்காமல்', 'போடாமல்', 'சாப்பிட முடியாது', 'சாப்பிடக்கூடாது', 'பாதுகாப்பா', 'க்கு ஏற்ற', 'க்கு உகந்த', 'கலந்திருக்க', 'தடயங்க', 'தடயம்', 'குறுக்கு மாசு', 'மாசுபட',
    'gluten illa', 'paal illa', 'muttai illa', 'kadalai illa', 'kachan illa', 'meen illa', 'iraal illa',
    'saapida mudiyath', 'sapida mudiyath', 'saapida mudiyadh', 'sapida mudiyadh', 'othukkollathu', 'othukollathu'],
  cav: { gluten: ['குளுட்டன்', 'க்ளூட்டன்', 'பசையம்', 'கோதுமை', 'மைதா', 'பார்லி'], crustaceans: ['இறால்', 'இறா', 'நண்டு', 'கடலுணவு', 'கடல் உணவு', 'லாப்ஸ்டர்'],
    eggs: ['முட்டை', 'மயோனைஸ்'], fish: ['மீன்'], peanuts: ['வேர்க்கடலை', 'நிலக்கடலை', 'கச்சான்', 'கடலை'], soy: ['சோயா', 'டோஃபு', 'டோபு'],
    milk: ['பால்', 'தயிர்', 'நெய்', 'வெண்ணெய்', 'பன்னீர்', 'சீஸ்', 'லாக்டோஸ்', 'கிரீம்'], 'tree nuts': ['முந்திரி', 'பாதாம்', 'வால்நட்', 'பிஸ்தா', 'கொட்டை'],
    sulphites: ['சல்பைட்'] },
}
const kmN = ['គ្លុយតែន', 'ទឹកដោះគោ', 'ស៊ុត', 'ពងមាន់', 'សណ្ដែក', 'សណ្តែក', 'គ្រាប់', 'បង្គា', 'ក្ដាម', 'ក្តាម', 'គ្រឿងសមុទ្រ', 'ត្រី', 'ឡាក់តូស']
L.km = {
  what: 'KHMER (km-KH): អាឡែកហ្ស៊ី / អាលែហ្ស៊ី (each spelling), ប្រតិកម្ម, មិនត្រូវធាតុ, មិនអាចរំលាយ, មិនអាចញ៉ាំ / ញ៉ាំមិនបាន / ញ៉ាំអត់បាន / <allergen> មិនបាន (ញ៉ាំទឹកដោះគោមិនបាន), សេលីអាក, គ្មាន / មិនមាន / អត់មាន / កុំដាក់ / អត់ដាក់ <allergen>, សុវត្ថិភាព, សមស្រប, អាចមានជាតិ / លាយ, ប្រឡាក់, ឡាក់តូស. Khmer runs words together, so vowel signs, coeng, the register shifters and nikahit are stripped and every stem is checked by its run-on skeleton; words bound to an allergen are listed joined and spaced (keyboards insert a zero-width space, which the normaliser turns into a space), with ្ដ and ្ត both. Bare គ្មាន (គ្មានបញ្ហា = no problem), ឥត (ឥតគិតថ្លៃ = free of charge) and the short ហ្ស៊ី (→ the skeleton of ពេលហួស) are NOT stems',
  stems: [...EN, 'អាឡែកហ្ស៊ី', 'អាឡែហ្ស៊ី', 'អាលែកហ្ស៊ី', 'អាលែហ្ស៊ី', 'អាលែកស៊ី', 'អាល្លែកហ្ស៊ី', 'ប្រតិកម្ម', 'មិនត្រូវធាតុ', 'មិនអាចរំលាយ', 'រំលាយមិនបាន',
    'មិនអាចញ៉ាំ', 'ញ៉ាំមិនបាន', 'ញ៉ាំអត់បាន', 'មិនអាចទទួលទាន', 'ហូបមិនបាន', 'សេលីអាក', 'សេលីយ៉ាក', 'ឡាក់តូស',
    ...pre(['គ្មាន', 'មិនមាន', 'អត់មាន', 'កុំដាក់'], kmN.filter(n => n !== 'ឡាក់តូស'), ['', ' ']), 'អត់ដាក់',
    ...post(['គ្លុយតែន', 'ទឹកដោះគោ', 'ស៊ុត', 'សណ្ដែក', 'សណ្តែក', 'បង្គា', 'គ្រឿងសមុទ្រ', 'ត្រី'], ['មិនបាន', 'អត់បាន'], ['', ' ']),
    'សុវត្ថិភាព', 'សុវត្តិភាព', 'សមស្រប', 'អាចមានជាតិ', 'អាចមានលាយ', 'ប្រឡាក់'],
  cav: { gluten: ['គ្លុយតែន', 'ស្រូវសាលី', 'ម្សៅស្រូវសាលី'], crustaceans: ['បង្គា', 'ក្ដាម', 'ក្តាម', 'បង្កង', 'គ្រឿងសមុទ្រ'], eggs: ['ស៊ុត', 'ពងមាន់', 'ពងទា', 'ម៉ាយ៉ូណេស'],
    fish: ['ត្រី'], peanuts: ['សណ្ដែកដី', 'សណ្តែកដី'], soy: ['សណ្ដែកសៀង', 'សណ្តែកសៀង', 'តៅហ៊ូ', 'ទឹកស៊ីអ៊ីវ'], milk: ['ទឹកដោះគោ', 'ឈីស', 'ប៊ឺ', 'ក្រែម', 'ឡាក់តូស', 'យ៉ាអួ'],
    'tree nuts': ['គ្រាប់ស្វាយចន្ទី', 'អាល់ម៉ុន', 'គ្រាប់ឈើ', 'វ៉ាល់ណាត់'], sulphites: ['ស៊ុលហ្វីត'] },
}
const loN = ['ອາຫານ', 'ຖົ່ວ', 'ນົມ', 'ໄຂ່', 'ກຸ້ງ', 'ປາ', 'ປູ', 'ແປ້ງ', 'ກລູເຕັນ', 'ກູເຕັນ', 'ແລັກໂຕສ']
L.lo = {
  what: 'LAO (lo-LA): ພູມແພ້, ແພ້ bound to what it is (ແພ້ຖົ່ວ, ແພ້ນົມ… / ຂ້ອຍແພ້ / ອາການແພ້), ບໍ່ມີ / ບໍ່ໃສ່ <allergen>, <allergen> ບໍ່ໄດ້ / ກິນບໍ່ໄດ້, ຍ່ອຍບໍ່ໄດ້, ບໍ່ທົນຕໍ່, ກລູເຕັນຟຣີ, ປອດໄພ, ເໝາະສຳລັບ, ປົນເປື້ອນ, ອາດມີສ່ວນປະສົມ, ເຊລີແອັກ, ແລັກໂຕສ. Lao runs words together; vowel signs above/below and tone marks are stripped on both sides (the leading vowels ເ ແ ໂ ໃ ໄ stay), so every stem is checked by its run-on skeleton, and words bound to an allergen are listed joined and spaced. Bare ແພ້ is NOT a stem (→ the skeleton of ແພງ, expensive, and ແພດ, doctor), nor bare ບໍ່ໃສ່ (→ inside ກັບໃສ່) or bare ບໍ່ມີ, and ປູ (crab) is bound only to ແພ້ (ບໍ່ມີປູ → the skeleton of ບໍ່ມີປັນຫາ, no problem; ປູບໍ່ໄດ້ → inside ໄປບໍ່ໄດ້, cannot go)',
  stems: [...EN, 'ພູມແພ້', ...pre(['ແພ້'], loN, ['', ' ']), 'ຂ້ອຍແພ້', 'ຂ້ອຍ ແພ້', 'ອາການແພ້', 'ລູກແພ້',
    ...pre(['ບໍ່ມີ', 'ບໍ່ໃສ່'], loN.filter(n => !['ອາຫານ', 'ແລັກໂຕສ', 'ປູ'].includes(n)), ['', ' ']), ...post(['ຖົ່ວ', 'ນົມ', 'ໄຂ່', 'ກຸ້ງ', 'ປາ', 'ແປ້ງ'], ['ບໍ່ໄດ້'], ['', ' ']),
    'ກິນບໍ່ໄດ້', 'ຍ່ອຍບໍ່ໄດ້', 'ຍ່ອຍນົມ', 'ບໍ່ທົນຕໍ່', 'ກລູເຕັນຟຣີ', 'ກູເຕັນຟຣີ', 'ປອດກລູເຕັນ', 'ປອດໄພ', 'ເໝາະສຳລັບ', 'ປົນເປື້ອນ', 'ອາດມີສ່ວນປະສົມ', 'ເຊລີແອັກ', 'ແລັກໂຕສ'],
  cav: { gluten: ['ກລູເຕັນ', 'ກູເຕັນ', 'ແປ້ງສາລີ', 'ເຂົ້າສາລີ'], crustaceans: ['ກຸ້ງ', 'ປູ', 'ອາຫານທະເລ', 'ກຸ້ງມັງກອນ'], eggs: ['ໄຂ່', 'ມາຍອງເນດ'], fish: ['ປາ'],
    peanuts: ['ຖົ່ວດິນ'], soy: ['ຖົ່ວເຫຼືອງ', 'ເຕົ້າຮູ້'], milk: ['ນົມ', 'ເນີຍ', 'ຊີສ', 'ຄຣີມ', 'ແລັກໂຕສ'], 'tree nuts': ['ໝາກມ່ວງຫິມະພານ', 'ອາມອນ', 'ອັນມອນ', 'ວໍນັດ', 'ຖົ່ວ'],
    sulphites: ['ຊັນໄຟ', 'sulfite', 'sulphite'] },
}
L.fil = {
  what: 'FILIPINO (fil-PH): allergy / allergic / alerdyi / alerhiya (matched inside the infixed and reduplicated forms nagkaka-allergy, naaallergic), intolerant, celiac, sensitibo, gluten free, walang <allergen> (walang gatas, walang mani…), huwag/wag lagyan, (paki)tanggal / alisin, bawal sa akin / bawal ako, hindi ako pwede sa, hindi ako makakain, ligtas ba / ligtas para, safe ba / para, angkop para, may halong, naglalaman, kontaminasyon, bakas ng, nagkakapantal / namamantal. English safety words are matched too. Bare walang is NOT a stem (walang problema, walang pila), nor tanggap (tumatanggap = do you accept [card]), nor pantal (inside pantalon)',
  stems: [...EN, 'alerdyi', 'alerhi', 'sensitibo', 'sensitive',
    ...pre(['walang'], ['gluten', 'gatas', 'dairy', 'lactose', 'itlog', 'mani', 'nuts', 'peanut', 'hipon', 'alimango', 'seafood', 'isda', 'soy', 'linga', 'sesame', 'kasoy', 'halong']),
    'huwag lagyan', 'wag lagyan', 'wag nyo lagyan', 'wag niyo lagyan', 'huwag ilagay', 'wag ilagay', 'pakitanggal', 'tanggalin', 'pakialis', 'alisin',
    'bawal sa akin', 'bawal sakin', 'bawal ako', 'bawal po ako', 'bawal sa anak', 'hindi ako pwede sa', 'di ako pwede sa', 'hindi ako puwede sa', 'hindi pwede sa akin',
    'hindi ako makakain', 'di ako makakain', 'hindi pwedeng kainin', 'ligtas ba', 'ligtas para', 'ligtas sa', 'safe ba', 'safe para', 'angkop para', 'may halong', 'naglalaman', 'nilalaman',
    'kontaminasyon', 'contamina', 'bakas ng', 'nagkakapantal', 'namamantal', 'mamantal'],
  cav: { gluten: ['gluten', 'trigo', 'harina', 'wheat'], crustaceans: ['hipon', 'alimango', 'alimasag', 'sugpo', 'ulang', 'lobster', 'seafood', 'crab', 'shrimp'],
    eggs: ['itlog', 'mayonnaise', 'mayo'], fish: ['isda', 'tuna', 'bangus', 'tilapia', 'patis', 'fish'], peanuts: ['mani', 'peanut'], soy: ['toyo', 'soya', 'soy', 'tokwa', 'tofu', 'taho'],
    milk: ['gatas', 'keso', 'mantikilya', 'butter', 'cream', 'cheese', 'milk', 'lactose', 'dairy'], 'tree nuts': ['kasoy', 'almond', 'pili nut', 'walnut', 'pistachio', 'nuts'],
    sulphites: ['sulfite', 'sulphite'] },
}
L.sw = {
  what: 'SWAHILI as in Tanzania (sw-TZ): mzio / mizio, aleji / alerji, (ku)tovumilia / sivumilii / havumilii, celiac / seliaki, bila / haina / hakina / hazina / hayana <allergen>, the noun-class "which has no" forms (isiyo na, kisicho na, visivyo na, zisizo na, yasiyo na, usio na, lisilo na), usiweke / msiweke / usitie, ondoa, siwezi / hawezi kula, salama kwa, inafaa kwa, huenda ikawa na, chembechembe, uchafuzi. English safety words are matched too. Bare bila is NOT a stem (bila shaka = of course), nor bare haina (haina shida), nor bare salama (a greeting), nor vumili (nivumilie = bear with me)',
  stems: [...EN, 'mzio', 'mizio', 'aleji', 'kutovumilia', 'vumilii', 'seliaki', 'siliaki', 'laktosi',
    ...pre(['bila', 'haina', 'hakina', 'hazina', 'hayana'], ['gluten', 'maziwa', 'mayai', 'yai', 'karanga', 'njugu', 'samaki', 'kamba', 'dagaa', 'soya', 'ufuta', 'korosho', 'ngano', 'nuts']),
    'isiyo na', 'kisicho na', 'visivyo na', 'zisizo na', 'yasiyo na', 'usio na', 'lisilo na', 'isiyokuwa na',
    'usiweke', 'msiweke', 'usitie', 'msitie', 'bila kuweka', 'bila kutia', 'ondoa', 'ondolea', 'wezi kula',
    'salama kwa', 'salama kwangu', 'faa kwa', 'huenda ikawa na', 'huenda ina', 'chembechembe', 'chembe za', 'uchafuzi', 'kuchafuliwa'],
  cav: { gluten: ['gluten', 'ngano', 'shayiri'], crustaceans: ['kamba', 'kaa ', 'kaa,', 'kaa.', 'vyakula vya bahari', 'kambakoche'], eggs: ['mayai', 'yai'],
    fish: ['samaki', 'dagaa', 'sato'], peanuts: ['karanga', 'njugu'], soy: ['soya', 'tofu'], milk: ['maziwa', 'jibini', 'siagi', 'samli', 'krimu', 'mtindi', 'lactose', 'laktosi'],
    'tree nuts': ['korosho', 'lozi', 'nati', 'almond', 'walnut', 'pistachio'], sulphites: ['salfaiti', 'salfiti', 'sulfite'] },
}
const amN = ['ግሉተን', 'ግሉቴን', 'ወተት', 'ላክቶስ', 'እንቁላል', 'ኦቾሎኒ', 'ለውዝ', 'ዓሳ', 'አሳ', 'ሽሪምፕ', 'ሰሊጥ', 'አኩሪ አተር', 'ስንዴ']
L.am = {
  what: 'AMHARIC (am-ET): አለርጂ / አለርጅ (inside ለአለርጂ, አለርጂክ), አይስማማኝም / የማይስማማ, ሴሊያክ, ያለ <allergen> (spaced and joined: ያለ ወተት / ያለወተት), ከ<allergen> ነጻ / ነፃ, <allergen> የሌለው / የለውም / አልያዘም, አትጨምሩ / ሳትጨምሩ, መብላት አልችልም, ደህንነቱ, ሊይዝ ይችላል, ቅሪት, ብክለት / የተበከለ, ላክቶስ — prefixes (ለ ከ የ በ) ride along. Ethiopic syllables carry no combining marks, so spellings are listed per variant letter (ነጻ / ነፃ, ዓሳ / አሳ, ደህንነቱ / ደኅንነቱ). Bare ያለ (ያለበት = where), bare ነፃ (free of charge), bare ደህና (a greeting) and bare ተስማሚ (ተስማሚ ዋጋ = fair price) are NOT stems, and ጾም (fasting food) is a religious choice, not a free-from safety word, and is left out',
  stems: [...EN, 'አለርጂ', 'አለርጅ', 'አሌርጂ', 'አይስማማኝ', 'አይስማማውም', 'አይስማማትም', 'አይስማሙኝ', 'የማይስማማ', 'ሴሊያክ', 'ሲሊያክ', 'ሴልያክ', 'ኢፒፔን', 'ላክቶስ',
    'ግሉተን ፍሪ', ...pre(['ያለ'], amN, [' ', '']), ...post(amN, ['ነጻ', 'ነፃ', 'የሌለ', 'የለውም', 'አልያዘ']),
    'አትጨምሩ', 'አትጨምሪ', 'አትጨምር', 'ሳትጨምሩ', 'ሳይጨመር', 'መብላት አልች', 'መብላት አይች', 'መመገብ አልች', 'ደህንነቱ', 'ደኅንነቱ',
    'ሊይዝ ይች', 'ቅሪት', 'ብክለት', 'መበከል', 'የተበከለ', 'ተበክሏል'],
  cav: { gluten: ['ግሉተን', 'ግሉቴን', 'ስንዴ', 'ገብስ', 'አጃ'], crustaceans: ['ሽሪምፕ', 'ሸርጣን', 'ሎብስተር', 'የባሕር ምግብ', 'የባህር ምግብ'], eggs: ['እንቁላል', 'ማዮኔዝ'],
    fish: ['ዓሣ', 'ዓሳ', 'አሳ'], peanuts: ['ኦቾሎኒ'], soy: ['አኩሪ አተር', 'ሶያ', 'ቶፉ'], milk: ['ወተት', 'ቅቤ', 'አይብ', 'እርጎ', 'ክሬም', 'ላክቶስ'],
    'tree nuts': ['ለውዝ', 'አልሞንድ', 'ካሽው', 'ዋልነት', 'ፒስታቺዮ'], sulphites: ['ሰልፋይት'] },
}
// The matcher's normaliser (lib/allergen-guard.ts), to refuse a stem whose skeleton is a duplicate of another's.
const unicodeNorm = (s) => ` ${s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()} `
const order = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'tree nuts', 'sulphites']
for (const [lang, d] of Object.entries(L)) {
  const keys = Object.keys(d.cav)
  if (keys.join() !== order.join()) throw new Error(lang + ' caveat keys ' + keys)
  const dup = d.stems.filter((s, i) => d.stems.indexOf(s) !== i); if (dup.length) throw new Error(lang + ' dup ' + dup)
  const sk = d.stems.map(s => unicodeNorm(s).trim()), skDup = d.stems.filter((s, i) => sk.indexOf(sk[i]) !== i)
  if (skDup.length) throw new Error(lang + ' duplicate skeleton ' + skDup.map(s => `${s} (${unicodeNorm(s).trim()})`))
  const cav = Object.fromEntries(Object.entries(d.cav).map(([k, v]) => [k, v.map(x => x.normalize('NFC').toLowerCase())]))
  const out = { $comment: `languages-world-2 (11 November 2026): the WhatsApp allergen guard’s trigger words for ${d.what}. ${tail} The country has no allergen set of its own yet, so caveatWords are for 'codex' (as MX, SG, HK, MY, TH and AE).`,
    language: lang, normalise: 'unicode', stems: d.stems, tokens: [], caveatWords: { codex: cav } }
  fs.writeFileSync(path.join(__dirname, lang + '.json'), JSON.stringify(out, null, 2) + '\n')
}
console.log('wrote', Object.keys(L).join(' '))
