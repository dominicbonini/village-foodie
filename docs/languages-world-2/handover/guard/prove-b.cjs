// Proves the 11 group-b lists of languages-world-2 (hi bn ur ne si ta km lo fil sw am) the way lib/allergen-guard.ts matches them:
// unicodeNorm (NFKD, marks stripped, lower case, non letter/number runs → one space, padded), stems = substring of the normalised
// message, tokens = whole normalised words. Copied from the code (and from languages-world-1's prove.cjs).
const fs = require('fs'), path = require('path')
const unicodeNorm = (s) => ` ${s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()} `
function matches(w, message, set) {
  const normalise = unicodeNorm, normalised = normalise(message), word = (x) => normalise(x).trim(), tokens = normalised.trim().split(' ')
  const extra = set ? w.bySet?.[set] : undefined
  return w.stems.some(stem => normalised.includes(word(stem))) || w.tokens.some(tok => tokens.includes(word(tok)))
    || (extra?.stems ?? []).some(stem => normalised.includes(word(stem))) || (extra?.tokens ?? []).some(tok => tokens.includes(word(tok)))
}
const hit = (w, m) => w.stems.filter(s => unicodeNorm(m).includes(unicodeNorm(s).trim()))
const T = {
  hi: { safety: ['मुझे मूंगफली से एलर्जी है', 'क्या यह पिज़्ज़ा ग्लूटेन फ्री है?', 'क्या आपके पास बिना अंडे का केक है?', 'मुझे लैक्टोज इनटॉलरेंस है',
      'मेरे बेटे को सीलिएक है, क्या वह कुछ खा सकता है?', 'क्या आप बिना दूध के चाय बना सकते हैं?', 'मैं काजू नहीं खा सकती', 'mujhe peanuts se allergy hai', 'kya ye gluten free hai?',
      'मेरी बेटी को एलर्जिक रिएक्शन होता है', 'क्या इसमें क्रॉस कंटैमिनेशन का खतरा है?', 'ये डिश मूंगफली एलर्जी वालों के लिए सुरक्षित है?', 'dudh ke bina coffee milegi?'],
    plain: ['आप कितने बजे खुलते हैं?', 'आज आप कहाँ हैं?', 'बर्गर कितने का है?', 'क्या आप कार्ड से पेमेंट लेते हैं?', 'आपके पास कौन से पिज़्ज़ा हैं?',
      'एक लार्ज पिज़्ज़ा कितने का है?', 'क्या बिना बुकिंग के आ सकते हैं?', 'आलू के बने समोसे हैं क्या?', 'aap kitne baje khulte ho?', 'bina booking aa sakte hain kya?', 'क्या आप यूपीआई लेते हैं?', 'ये बना हुआ तला खाना ताज़ा है?'] },
  bn: { safety: ['আমার চিনাবাদামে এলার্জি আছে', 'এই পিজ্জা কি গ্লুটেন ফ্রি?', 'ডিম ছাড়া কেক আছে?', 'আমার দুধ খেলে সমস্যা হয়', 'আমার ল্যাকটোজ ইনটলারেন্স আছে',
      'আমার ছেলের সিলিয়াক রোগ আছে', 'এটাতে বাদাম নেই তো?', 'amar badam e allergy ache', 'আমার অ্যালার্জির সমস্যা আছে', 'দুধ আমার হজম হয় না',
      'এটা কি বাদাম অ্যালার্জি থাকলে নিরাপদ?', 'dudh chara cha deya jabe?'],
    plain: ['আপনারা কখন খোলেন?', 'আজ আপনারা কোথায় আছেন?', 'বার্গারের দাম কত?', 'কার্ডে পেমেন্ট নেন?', 'বিকাশে পেমেন্ট করা যাবে?', 'কী কী পিজ্জা আছে?',
      'একটা লার্জ পিজ্জা কত টাকা?', 'চিকেন ছাড়া আর কী আছে?', 'উপযুক্ত দামে ভালো খাবার পাবো?', 'apnara kokhon khulen?', 'এখানে বসে খেতে পারি?'] },
  ur: { safety: ['مجھے مونگ پھلی سے الرجی ہے', 'کیا یہ پیزا گلوٹین فری ہے؟', 'کیا انڈے کے بغیر کیک مل سکتا ہے؟', 'مجھے دودھ ہضم نہیں ہوتا', 'میرے بیٹے کو سیلیک کی بیماری ہے',
      'میں بادام نہیں کھا سکتی', 'mujhe nuts se allergy hai', 'کیا یہ میوے کی الرجی والوں کے لیے محفوظ ہے؟', 'دودھ کے بغیر چائے بنا دیں', 'مجھے لیکٹوز برداشت نہیں ہوتا',
      'مجھے الرجک ری ایکشن ہوتا ہے', 'doodh ke baghair chai milegi?'],
    plain: ['آپ کب کھلتے ہیں؟', 'آج آپ کہاں ہیں؟', 'برگر کتنے کا ہے؟', 'کیا آپ کارڈ سے ادائیگی لیتے ہیں؟', 'آپ کے پاس کون سے پیزا ہیں؟', 'ایک لارج پیزا کتنے کا ہے؟',
      'کیا ڈیلیوری چارجز شامل نہیں ہیں؟', 'کیا بغیر بکنگ کے آ سکتے ہیں؟', 'کیا آپ لاہور سے پاکستانی کھانے لاتے ہیں؟', 'مناسب قیمت میں کیا ملے گا؟', 'aap kab khultay hain?'] },
  ne: { safety: ['मलाई बदामबाट एलर्जी छ', 'के यो पिज्जा ग्लुटेन फ्री हो?', 'अण्डा नभएको केक छ?', 'मलाई दूध पच्दैन', 'मेरो छोरालाई सेलियाक रोग छ', 'कृपया काजू नहाल्नुहोस्',
      'मलाई माछा खान मिल्दैन', 'malai peanut allergy cha', 'यो बदाम एलर्जी भएकाहरूको लागि सुरक्षित छ?', 'दूध नभएका परिकार के के छन्?', 'malai dudh khana mildaina'],
    plain: ['तपाईंहरू कति बजे खोल्नुहुन्छ?', 'आज कहाँ हुनुहुन्छ?', 'बर्गरको मूल्य कति हो?', 'कार्डबाट भुक्तानी गर्न मिल्छ?', 'कस्ता पिज्जा छन्?', 'आज पसल खुला नभएको हो?',
      'एउटा लार्ज पिज्जा कति हो?', 'eSewa बाट तिर्न मिल्छ?', 'aaja kaha hunuhuncha?', 'पहिले फोन गर्नुपर्छ?'] },
  si: { safety: ['මට රටකජු වලට ඇලර්ජි තියෙනවා', 'මේ පීසා එකේ ග්ලූටන් නැද්ද?', 'මට කිරි දිරවන්නේ නැහැ', 'මගේ දරුවාට සීලියැක් රෝගය තියෙනවා', 'බිත්තර නැති කේක් තියෙනවද?',
      'කරුණාකර කජු දාන්න එපා', 'mata allergy thiyenawa', 'රටකජු ඇලර්ජි තියෙන අයට මේක ආරක්ෂිතද?', 'මට ලැක්ටෝස් ඉවසන්න බැහැ', 'මේකේ රටකජු අඩංගු නැද්ද?',
      'මට අසාත්මිකතාවක් තියෙනවා', 'මට ඉස්සෝ කන්න බැහැ', 'ග්ලූටන් ෆ්‍රී කෑම තියෙනවද?'],
    plain: ['ඔබ කීයට විවෘත කරනවද?', 'අද ඔයාලා කොහෙද ඉන්නේ?', 'බර්ගර් එකක් කීයද?', 'කාඩ් එකෙන් ගෙවන්න පුළුවන්ද?', 'මොන පීසා ද තියෙන්නේ?',
      'බුක් කර නැතුව එන්න පුළුවන්ද?', 'මගේ දරුවන්ට කෑම තියෙනවද?', 'ලාජ් පීසා එකක් කීයද?', 'මෙනු එකේ මොනවද අඩංගු?', 'බිත්තර නූඩ්ල්ස් තියෙනවද?', 'ada kohed inne?'] },
  ta: { safety: ['எனக்கு வேர்க்கடலை ஒவ்வாமை உள்ளது', 'இந்த பீட்சா குளுட்டன் இல்லாததா?', 'முட்டை இல்லாமல் கேக் செய்ய முடியுமா?', 'எனக்கு பால் ஒத்துக்கொள்ளாது',
      'என் மகனுக்கு சீலியாக் நோய் இருக்கிறது', 'எனக்கு அலர்ஜி இருக்கு', 'enakku kachan allergy irukku', 'இறால் சேர்க்காமல் தர முடியுமா?',
      'கடலை ஒவ்வாமை உள்ளவர்களுக்கு இது பாதுகாப்பானதா?', 'நான் மீன் சாப்பிட முடியாது', 'ஒவ்வாமையால் அவதிப்படுகிறேன்', 'paal illama tea kidaikkuma?'],
    plain: ['எத்தனை மணிக்கு திறப்பீர்கள்?', 'இன்று நீங்கள் எங்கே இருக்கிறீர்கள்?', 'பர்கர் விலை என்ன?', 'கார்டு ஏற்றுக்கொள்வீர்களா?', 'என்ன பீட்சா இருக்கிறது?',
      'ஒவ்வொரு நாளும் திறந்திருப்பீர்களா?', 'மெனுவின் படம் அனுப்புங்கள்', 'தடையில்லை, நாளை வருகிறேன்', 'இன்று சரக்கு வந்ததா?', 'kadai eppo thirakkum?', 'பால் டீ இருக்கா?', 'பர்கர் விலை ஏற்றதா இந்த வாரம்?'] },
  km: { safety: ['ខ្ញុំមានអាឡែកហ្ស៊ីសណ្ដែកដី', 'ខ្ញុំ​អាឡែហ្ស៊ី​នឹង​បង្គា', 'តើមានភីហ្សាគ្មានគ្លុយតែនទេ?', 'សូមកុំដាក់សណ្ដែកដី', 'ខ្ញុំញ៉ាំទឹកដោះគោមិនបាន',
      'កូនខ្ញុំមិនត្រូវធាតុជាមួយស៊ុត', 'វាមានសុវត្ថិភាពសម្រាប់អ្នកមានប្រតិកម្មនឹងគ្រាប់ទេ?', 'មាន gluten free ទេ?', 'អត់ដាក់ស៊ុតបានទេ?', 'ខ្ញុំមិនអាចរំលាយឡាក់តូសបានទេ',
      'មិនមាន​ទឹកដោះគោ​មែនទេ?', 'I have a peanut allergy'],
    plain: ['តើបើកម៉ោងប៉ុន្មាន?', 'ថ្ងៃនេះនៅឯណា?', 'ប៊ឺហ្គឺរថ្លៃប៉ុន្មាន?', 'អាចបង់តាមកាតបានទេ?', 'មានភីហ្សាអ្វីខ្លះ?', 'ពេលហួសម៉ោងនៅបើកទេ?',
      'គ្មានបញ្ហាទេ ខ្ញុំនឹងមកវិញ', 'ឥតគិតថ្លៃដឹកជញ្ជូនទេ?', 'មានសណ្ដែកដីទេ?', 'មិនត្រូវការកាបូបទេ', 'គ្មានតុទំនេរទេ?', 'អាចបង់​តាម​ABA​បានទេ?'] },
  lo: { safety: ['ຂ້ອຍແພ້ຖົ່ວດິນ', 'ລູກຂ້ອຍແພ້ນົມ', 'ມີພິຊຊ່າທີ່ບໍ່ມີກລູເຕັນບໍ່?', 'ກະລຸນາບໍ່ໃສ່ກຸ້ງ', 'ຂ້ອຍກິນໄຂ່ບໍ່ໄດ້', 'ອັນນີ້ປອດໄພສຳລັບຄົນແພ້ອາຫານທະເລບໍ່?',
      'ຂ້ອຍມີພູມແພ້', 'ມີ gluten free ບໍ່?', 'ມີຄວາມສ່ຽງປົນເປື້ອນບໍ່?', 'ຂ້ອຍຍ່ອຍນົມບໍ່ໄດ້', 'ຂ້ອຍ ແພ້ ກຸ້ງ', 'I am allergic to shrimp'],
    plain: ['ເປີດຈັກໂມງ?', 'ມື້ນີ້ຢູ່ໃສ?', 'ເບີເກີລາຄາເທົ່າໃດ?', 'ຈ່າຍບັດໄດ້ບໍ່?', 'ມີພິຊຊ່າຫຍັງແດ່?', 'ລາຄາແພງບໍ່?', 'ເອົາກັບໃສ່ກ່ອງໄດ້ບໍ່?', 'ມີຖົ່ວບໍ່?',
      'ມີແພດຢູ່ໃກ້ບໍ່?', 'ບໍ່ມີປັນຫາ, ແລ້ວພົບກັນ', 'ຂໍໂທດ ມື້ນີ້ໄປບໍ່ໄດ້', 'ໂອນເງິນຜ່ານ BCEL One ໄດ້ບໍ່?'] },
  fil: { safety: ['May allergy ako sa mani', 'Allergic po ang anak ko sa hipon', 'Gluten free po ba ito?', 'Meron ba kayong walang gatas?', 'Lactose intolerant ako, ano pwede?',
      'Pwede pong huwag lagyan ng itlog?', 'Bawal sa akin ang seafood', 'Nagkakaallergy ako sa shrimp', 'May celiac disease ako', 'Ligtas ba ito sa may allergy sa mani?',
      'Pakitanggal po yung mani', 'Naglalaman ba ito ng gatas?', 'Nagkaka-alerdyi ako sa itlog'],
    plain: ['Anong oras kayo bukas?', 'Saan kayo ngayon?', 'Magkano ang burger?', 'Tumatanggap ba kayo ng GCash o card?', 'Anong mga pizza ang meron kayo?',
      'Walang problema, pupunta kami mamaya', 'May mani ba ang kare-kare?', 'Bukas ba kayo bukas ng gabi?', 'Pwede bang naka-pantalon lang?'] },
  sw: { safety: ['Nina mzio wa karanga', 'Mtoto wangu ana mizio ya maziwa', 'Je, pizza hii haina gluten?', 'Mna chakula kisicho na mayai?', 'Siwezi kula samaki',
      'Sivumilii lactose', 'Ninasumbuliwa na kutovumilia laktosi', 'I have a nut allergy, is it safe?', 'Ni salama kwa mtu mwenye mzio wa kamba?', 'Tafadhali usiweke karanga',
      'Naomba burger bila maziwa', 'Nina ugonjwa wa celiac', 'Mna kitu gluten free?'],
    plain: ['Mnafungua saa ngapi?', 'Leo mko wapi?', 'Burger ni bei gani?', 'Mnapokea M-Pesa au kadi?', 'Mna pizza za aina gani?', 'Salama, mko wazi leo?',
      'Bila shaka nitakuja kesho', 'Chai yenu ina maziwa?', 'Mnaondoka saa ngapi jioni?', 'Tafadhali nivumilie, nitachelewa kidogo', 'Haina shida, asante'] },
  am: { safety: ['የኦቾሎኒ አለርጂ አለብኝ', 'ይህ ፒዛ ከግሉተን ነፃ ነው?', 'ያለ እንቁላል ኬክ አላችሁ?', 'ወተት አይስማማኝም', 'ልጄ ሴሊያክ በሽታ አለበት', 'ዓሳ መብላት አልችልም',
      'I have a peanut allergy', 'ለአለርጂክ ሰው ደህንነቱ የተጠበቀ ነው?', 'እባክዎ ኦቾሎኒ አትጨምሩ', 'ይህ ምግብ ለውዝ የሌለው ነው?', 'ያለወተት ቡና ይቻላል?', 'ለውዝ ሊይዝ ይችላል?'],
    plain: ['ስንት ሰዓት ትከፍታላችሁ?', 'ዛሬ የት ናችሁ?', 'በርገር ስንት ነው?', 'በካርድ መክፈል ይቻላል?', 'ምን አይነት ፒዛ አላችሁ?', 'ዴሊቨሪ ነፃ ነው?',
      'ደህና ናችሁ? ዛሬ ክፍት ናችሁ?', 'ፒዛው ወተት አለው?', 'ያለ ቀጠሮ መምጣት ይቻላል?', 'የጾም ምግብ አላችሁ?', 'ያላችሁበት ቦታ የት ነው?'] },
}
const CODEX = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'tree nuts', 'sulphites']
let fail = 0
for (const [lang, t] of Object.entries(T)) {
  const w = JSON.parse(fs.readFileSync(path.join(__dirname, lang + '.json'), 'utf8'))
  const shape = w.language === lang && w.normalise === 'unicode' && Array.isArray(w.stems) && Array.isArray(w.tokens) && /languages-world-2 \(11 November 2026\)/.test(w.$comment)
    && JSON.stringify(Object.keys(w.caveatWords.codex)) === JSON.stringify(CODEX)
    && Object.values(w.caveatWords.codex).flat().every(x => x === x.toLowerCase() && x === x.normalize('NFC'))
    && w.stems.every(s => unicodeNorm(s).trim().length >= 2)
  const missed = t.safety.filter(m => !matches(w, m, 'codex')), caught = t.plain.filter(m => matches(w, m, 'codex'))
  const ok = shape && missed.length === 0 && caught.length === 0 && t.safety.length >= 9 && t.plain.length >= 6
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${lang}: ${t.safety.length - missed.length}/${t.safety.length} safety caught, ${t.plain.length - caught.length}/${t.plain.length} plain not caught, shape ${shape ? 'ok' : 'BAD'} (${w.stems.length} stems)`)
  for (const m of missed) console.log('   missed:', m)
  for (const m of caught) console.log('   caught:', m, '←', hit(w, m).join(' | '))
}
process.exit(fail ? 1 : 0)
