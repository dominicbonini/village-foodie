// Writes the 7 allergen-guard lists (tr, ko, id, vi, he, is, sr) next to this script, in the shape of lib/allergen-guard/*.json.
const fs = require('fs'), path = require('path')
const tail = 'OPTION B, as every other language: absence / safety words only, NOT the bare allergen names (a presence question may reach the AI, which answers only from the tags and gets the caveat). Matched with the Unicode normaliser. caveatWords: a tagged label of the codex allergen set (stored in English, lower case) → the words a reply may use for it (matched on the raw lower-cased reply, so written as the AI writes them).'
const L = {}
L.tr = {
  what: 'TURKISH (tr-TR): alerji / alerjen, intolerans, hassasiyet, çölyak, the -siz/-sız/-suz/-süz free-from forms (glutensiz, laktozsuz, sütsüz…), içermez / içermeyen / içerebilir, güvenli, için uygun, eser miktar, çapraz bulaşma — stems survive the suffixes (alerjim, glutensizdir). Dotless ı is kept by the normaliser, so words with it are listed in both spellings people type (fıstıksız / fistiksiz)',
  stems: ['alerj', 'allerj', 'intolerans', 'tahammülsüz', 'hassas', 'çölyak', 'anafilak', 'epipen', 'epi pen', 'adrenalin', 'gluten free',
    'glutensiz', 'gluten yok', 'laktozsuz', 'sütsüz', 'süt olmadan', 'yumurtasız', 'yumurtasiz', 'yumurta olmadan', 'fıstıksız', 'fistiksiz', 'fıstık olmadan', 'fistik olmadan',
    'fındıksız', 'findiksiz', 'cevizsiz', 'bademsiz', 'kuruyemişsiz', 'susamsız', 'susamsiz', 'sojasız', 'sojasiz', 'balıksız', 'baliksiz', 'karidessiz',
    'içermez', 'içermiyor', 'içermeyen', 'içermediğ', 'içerebilir', 'güvenli', 'için uygun', 'eser miktar', 'çapraz bulaş', 'çapraz kontaminasyon', 'bulaşma', 'bulaşabilir', 'kontaminasyon'],
  cav: { gluten: ['gluten', 'buğday', 'arpa', 'çavdar', 'yulaf'], crustaceans: ['kabuklu', 'karides', 'yengeç', 'ıstakoz', 'deniz ürün'], eggs: ['yumurta', 'mayonez'],
    fish: ['balık'], peanuts: ['yer fıstığı', 'fıstık'], soy: ['soya', 'tofu'], milk: ['süt', 'laktoz', 'peynir', 'tereyağ', 'krema', 'yoğurt'],
    'tree nuts': ['kuruyemiş', 'fındık', 'ceviz', 'badem', 'kaju', 'antep fıstığı'], sulphites: ['sülfit', 'kükürt dioksit'] },
}
L.ko = {
  what: 'KOREAN (ko-KR): 알레르기 / 알러지, 불내증, 과민, 셀리악, 아나필락시스, 글루텐프리 / 무글루텐 / 락토프리, 없는 (\"X 없는 메뉴\"), 안 들어간 / 들어있지 않 / 포함되지 않 / 미함유, 빼 주세요, 못 먹, 안전, 교차오염, 미량 — stems only, written with and without the space. Bare 빼고 and 제외 are NOT stems (\"월요일 빼고\" = except Monday); 빼주 / 빼고 주 / 빼고 만들 are. The Unicode normaliser decomposes Hangul into jamo on both sides, so a stem still matches its own syllables',
  stems: ['알레르기', '알러지', '알레르겐', '알러젠', '불내', '과민', '민감', '셀리악', '아나필락시스', '에피펜', 'epipen',
    '글루텐프리', '글루텐 프리', '무글루텐', '락토프리', '락토스프리', '넛프리', '넛 프리', '무유당', '없는',
    '들어있지', '들어 있지', '들어가지 않', '들어가 있지', '안 들어', '안들어', '포함되지 않', '포함 안', '함유하지 않', '함유되지 않', '미함유',
    '빼 주', '빼주', '빼고 주', '빼고 만들', '빼고 해', '빼도 되', '뺄 수', '못 먹', '못먹', '안전', '교차 오염', '교차오염', '미량', '함유될 수', '들어갔을 수'],
  cav: { gluten: ['글루텐', '밀가루', '밀', '보리', '호밀', '귀리'], crustaceans: ['갑각류', '새우', '꽃게', '대게', '게살', '크랩', '가재', '랍스터', '해산물'],
    eggs: ['계란', '달걀', '난류', '마요네즈'], fish: ['생선', '어류', '물고기'], peanuts: ['땅콩'], soy: ['대두', '콩', '두부', '간장', '된장'],
    milk: ['우유', '유제품', '유당', '치즈', '버터', '크림'], 'tree nuts': ['견과', '호두', '아몬드', '캐슈', '잣', '피스타치오', '헤이즐넛', '마카다미아'], sulphites: ['아황산', '이산화황'] },
}
L.id = {
  what: 'INDONESIAN (id-ID): alergi / alergen, intoleran, tidak tahan laktosa, seliak, anafilaksis, bebas / tanpa <allergen>, nggak / gak / tidak pakai (pake), tidak mengandung, aman untuk / bagi / buat, cocok untuk, mungkin / bisa / dapat mengandung, kontaminasi silang, jejak, sensitif. \"ga pakai\" is NOT a stem (it is inside \"harga pakai\")',
  stems: ['alergi', 'alergen', 'alergik', 'intoleran', 'tidak tahan laktosa', 'seliak', 'celiac', 'anafilak', 'epipen', 'epi pen', 'adrenalin', 'sensitif',
    'gluten free', 'bebas gluten', 'tanpa gluten', 'bebas laktosa', 'tanpa laktosa', 'bebas susu', 'tanpa susu', 'tanpa keju', 'tanpa telur', 'bebas kacang', 'tanpa kacang',
    'tanpa seafood', 'tanpa makanan laut', 'tanpa udang', 'tanpa kepiting', 'tanpa kedelai', 'tanpa ikan', 'tanpa wijen',
    'tidak pakai', 'nggak pakai', 'ngga pakai', 'gak pakai', 'enggak pakai', 'tidak pake', 'nggak pake', 'gak pake',
    'tidak mengandung', 'tidak ada kandungan', 'aman untuk', 'aman bagi', 'aman buat', 'aman dikonsumsi', 'cocok untuk', 'cocok bagi',
    'mungkin mengandung', 'bisa mengandung', 'dapat mengandung', 'kontaminasi', 'jejak'],
  cav: { gluten: ['gluten', 'gandum', 'terigu'], crustaceans: ['krustasea', 'udang', 'kepiting', 'rajungan', 'lobster', 'seafood', 'makanan laut'],
    eggs: ['telur', 'mayones'], fish: ['ikan'], peanuts: ['kacang tanah', 'kacang'], soy: ['kedelai', 'tahu', 'tempe', 'kecap'],
    milk: ['susu', 'laktosa', 'keju', 'mentega', 'krim'], 'tree nuts': ['kacang', 'almond', 'mete', 'kenari', 'hazelnut', 'pistachio', 'makadamia'], sulphites: ['sulfit'] },
}
L.vi = {
  what: 'VIETNAMESE (vi-VN): dị ứng, (không / bất) dung nạp, nhạy cảm, celiac, (sốc) phản vệ, không / không có / không cho / không chứa <allergen>, không ăn được, an toàn cho / với, phù hợp cho / với, có thể chứa, dấu vết, nhiễm chéo. Tone marks and diacritics fold away on both sides (\"di ung\" = \"dị ứng\"); đ is kept by the normaliser, so words with it are listed with d too (đậu phộng / dau phong). \"không cá\" is NOT a stem (it is inside \"không cay\"), nor bare \"không có\", nor bare \"an toàn\" (inside \"hoàn toàn\") or \"phản vệ\" (\"phần về\" folds to it)',
  stems: ['dị ứng', 'dung nạp', 'nhạy cảm', 'celiac', 'sốc phản vệ', 'soc phan ve', 'epipen', 'adrenalin', 'gluten free',
    'không gluten', 'không có gluten', 'không chứa', 'không sữa', 'không có sữa', 'không lactose', 'không trứng', 'không có trứng',
    'không đậu phộng', 'khong dau phong', 'không có đậu phộng', 'khong co dau phong', 'không lạc', 'không có lạc',
    'không hải sản', 'không có hải sản', 'không tôm', 'không có tôm', 'không cua', 'không đậu nành', 'khong dau nanh', 'không có đậu nành', 'khong co dau nanh',
    'không hạt', 'không có hạt', 'không cho đậu', 'khong cho dau', 'không cho sữa', 'không cho trứng', 'không cho tôm', 'đừng cho',
    'không ăn được', 'khong an duoc', 'an toàn cho', 'an toàn với', 'có an toàn', 'phù hợp cho', 'phù hợp với', 'có thể chứa', 'dấu vết', 'nhiễm chéo'],
  cav: { gluten: ['gluten', 'lúa mì', 'bột mì', 'lúa mạch'], crustaceans: ['giáp xác', 'tôm', 'cua', 'ghẹ', 'hải sản'], eggs: ['trứng'],
    fish: ['cá ', 'cá,', 'cá.', 'cá hồi', 'cá ngừ', 'nước mắm'], peanuts: ['đậu phộng', 'lạc'], soy: ['đậu nành', 'đậu hũ', 'đậu phụ', 'tàu hũ', 'nước tương', 'xì dầu'],
    milk: ['sữa', 'lactose', 'phô mai', 'bơ', 'kem'], 'tree nuts': ['hạt điều', 'hạnh nhân', 'óc chó', 'hạt dẻ', 'mắc ca', 'hồ đào', 'các loại hạt'], sulphites: ['sulfit', 'sunfit'] },
}
L.he = {
  what: 'HEBREW (he-IL): אלרג (אלרגיה, אלרגי, לאלרגנים), רגישות / רגיש ל, אי סבילות, צליאק, אנפילקסיס, ללא, נטול / נטולת / נטולי, לא מכיל, אין בו / בה, בלי <allergen>, בטוח ל, עלול להכיל, עקבות של / עקבות <allergen>, מגע / זיהום צולב — stems without prefix letters (ה ו ב ל ש מ ride along). Bare בלי is NOT a stem (it is inside בלילה and תבלינים), nor bare רגיש (inside מרגיש), bare עקבות (inside בעקבות) or מתאים ל (\"מתאים לבוא\"); niqqud folds away',
  stems: ['אלרג', 'רגישות', 'רגיש ל', 'רגישה ל', 'רגישים ל', 'סבילות', 'צליאק', 'אנפילקס', 'אפיפן', 'אפי פן', 'epipen', 'אדרנלין', 'gluten free',
    'ללא', 'נטול', 'לא מכיל', 'אין בו', 'אין בה', 'בלי גלוטן', 'בלי חלב', 'בלי מוצרי חלב', 'בלי לקטוז', 'בלי ביצ', 'בלי בוטנ', 'בלי אגוז', 'בלי שומשום', 'בלי סויה', 'בלי דג', 'בלי פירות ים', 'בלי שרימפס',
    'בטוח ל', 'בטוחה ל', 'בטוחים ל', 'בטוח עבור', 'עלול להכיל', 'עלולה להכיל', 'עלולים להכיל', 'עשוי להכיל', 'עקבות של', 'עקבות גלוטן', 'עקבות בוטנ', 'עקבות אגוז', 'עקבות חלב', 'עקבות שומשום', 'צולב'],
  cav: { gluten: ['גלוטן', 'חיטה', 'קמח', 'שעורה', 'שיפון', 'שיבולת שועל'], crustaceans: ['סרטנ', 'שרימפס', 'חסילון', 'לובסטר', 'פירות ים'], eggs: ['ביצה', 'ביצים', 'מיונז'],
    fish: ['דג ', 'דגים', 'דגי', 'סלמון', 'טונה'], peanuts: ['בוטנים', 'בוטן'], soy: ['סויה', 'טופו'], milk: ['חלב', 'לקטוז', 'גבינ', 'חמאה', 'שמנת'],
    'tree nuts': ['אגוז', 'שקד', 'קשיו', 'פיסטוק', 'פקאן', 'לוז'], sulphites: ['סולפיט', 'גופרית'] },
}
L.is = {
  what: 'ICELANDIC (is-IS): ofnæm (ofnæmi, hnetuofnæmi, bráðaofnæmi), óþol (mjólkuróþol, glútenóþol), viðkvæm, selíak, the -laus and -frí free-from forms (glútenlaus/-t/-a, mjólkurlaus, laktósafrí…), án <allergen>, inniheldur ekki / engar, gæti / getur innihaldið, öruggt / örugg fyrir, hentar fyrir, snefil, krossmengun — inflected stems. Accents fold away; þ, ð and æ are kept by the normaliser, so the main words are listed in the spellings typed without them too (ofnaem, othol, innihaldid). Bare án and frí are NOT tokens (\"an\" in English, frí = day off), nor bare örugg (inside örugglega)',
  stems: ['ofnæm', 'ofnaem', 'óþol', 'othol', 'viðkvæm', 'vidkvaem', 'selíak', 'anafyla', 'epipen', 'epi pen', 'adrenalín', 'gluten free',
    'glútenlaus', 'glútenfrí', 'mjólkurlaus', 'mjólkurfrí', 'laktósalaus', 'laktósafrí', 'eggjalaus', 'hnetulaus', 'hnetufrí', 'sojalaus', 'fisklaus', 'sesamlaus',
    'án glútens', 'án glúten', 'án mjólkur', 'án mjólkurvara', 'án laktósa', 'án eggja', 'án hneta', 'án hnetna', 'án jarðhneta', 'án jardhneta', 'án soja', 'án fisks', 'án skelfisks', 'án sesam',
    'inniheldur ekki', 'inniheldur engar', 'inniheldur engin', 'inniheldur ekkert', 'gæti innihaldið', 'gaeti innihaldid', 'getur innihaldið', 'getur innihaldid',
    'öruggt fyrir', 'örugg fyrir', 'öruggur fyrir', 'öruggt handa', 'hentar fyrir', 'hentugt fyrir', 'hentar þeim sem', 'snefil', 'krossmeng'],
  cav: { gluten: ['glúten', 'hveiti', 'bygg', 'rúg', 'hafra'], crustaceans: ['krabbadýr', 'rækj', 'humar', 'krabb', 'skelfisk'], eggs: ['egg', 'majónes'],
    fish: ['fisk'], peanuts: ['jarðhnet'], soy: ['soja', 'soya', 'tófú'], milk: ['mjólk', 'laktós', 'ostur', 'osti', 'osta', 'smjör', 'rjóm'],
    'tree nuts': ['hnet', 'möndl', 'kasjú', 'pistasí'], sulphites: ['súlfít', 'brennisteinsdíoxíð'] },
}
L.sr = {
  what: 'SERBIAN, Latin script (sr-RS): alerg (alergija, alergičan), (ne)tolerancija, osetljiv, celijakija, anafilaksa, bez <allergen> (bez glutena, bez laktoze, bez mleka…), bezglutensk / bezlaktozn, ne sadrži / nema glutena, bezbedno / sigurno / pogodno za, može da sadrži, tragovi, (unakrsna) kontaminacija. š č ć ž fold away on both sides (\"bez glutena\" = \"bez glutena\", \"alergican\" = \"alergičan\"); a small Cyrillic set is added for customers who type in Cyrillic. Bare bez is NOT a stem; posno (Orthodox fasting food) is a dietary choice, not a free-from safety word, and is left out',
  stems: ['alerg', 'intoleran', 'netoleran', 'osetljiv', 'osjetljiv', 'celijak', 'anafilak', 'epipen', 'epi pen', 'adrenalin', 'gluten free',
    'bez glutena', 'bezglutensk', 'bez laktoze', 'bezlaktozn', 'bez mleka', 'bez mlijeka', 'bez mlečn', 'bez jaja', 'bez kikiriki', 'bez orašast', 'bez oraha', 'bez lešnik', 'bez badema',
    'bez soje', 'bez susama', 'bez ribe', 'bez rakova', 'bez škampa', 'bez morskih plodova', 'bez plodova mora', 'bez školjki', 'bez sulfita',
    'ne sadrži', 'nema glutena', 'nema laktoze', 'bezbedn', 'bezbjedn', 'siguran za', 'sigurna za', 'sigurno za', 'sigurni za', 'pogodan za', 'pogodna za', 'pogodno za', 'pogodni za', 'prikladn',
    'može da sadrži', 'može sadržati', 'mogu sadržati', 'može sadržavati', 'tragov', 'kontaminacij', 'unakrsn',
    'алерг', 'интолеран', 'нетолеран', 'осетљив', 'целијак', 'анафилак', 'без глутена', 'безглутенск', 'без лактозе', 'без млека', 'без јаја', 'без кикирики', 'без орашаст',
    'без соје', 'без рибе', 'без морских плодова', 'не садржи', 'безбедн', 'може да садржи', 'трагов', 'контаминациј'],
  cav: { gluten: ['gluten', 'pšenic', 'brašn', 'ječm', 'ječam', 'raž', 'ovas'], crustaceans: ['rakov', 'škamp', 'kozic', 'jastog', 'plodovi mora', 'morski plodovi'],
    eggs: ['jaj', 'majonez'], fish: ['riba', 'ribe', 'ribu', 'ribom'], peanuts: ['kikiriki'], soy: ['soja', 'soje', 'soju', 'tofu'],
    milk: ['mlek', 'mleč', 'laktoz', 'sir ', 'sira', 'sirom', 'maslac', 'pavlak', 'kajmak'], 'tree nuts': ['orašast', 'orah', 'orasi', 'lešnik', 'badem', 'indijsk', 'pistać'],
    sulphites: ['sulfit', 'sumpor-dioksid', 'sumpor dioksid'] },
}
const order = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'tree nuts', 'sulphites']
for (const [lang, d] of Object.entries(L)) {
  const keys = Object.keys(d.cav)
  if (keys.join() !== order.join()) throw new Error(lang + ' caveat keys ' + keys)
  const dup = d.stems.filter((s, i) => d.stems.indexOf(s) !== i); if (dup.length) throw new Error(lang + ' dup ' + dup)
  const out = { $comment: `languages-world-1 (10 November 2026): the WhatsApp allergen guard’s trigger words for ${d.what}. ${tail} The country has no allergen set of its own yet, so caveatWords are for 'codex' (as MX, SG, HK, MY, TH and AE).`,
    language: lang, normalise: 'unicode', stems: d.stems, tokens: [], caveatWords: { codex: d.cav } }
  fs.writeFileSync(path.join(__dirname, lang + '.json'), JSON.stringify(out, null, 2) + '\n')
}
console.log('wrote', Object.keys(L).join(' '))
