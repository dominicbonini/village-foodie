// Writes the 12 allergen-guard lists of group a (uk ru kk uz az ka hy sq mk bs ca mn) next to this script, in the shape of
// lib/allergen-guard/*.json (languages-world-1's build.cjs method, languages-world-2, 11 November 2026).
const fs = require('fs'), path = require('path')
const tail = 'OPTION B, as every other language: absence / safety words only, NOT the bare allergen names (a presence question may reach the AI, which answers only from the tags and gets the caveat). Matched with the Unicode normaliser. caveatWords: a tagged label of the codex allergen set (stored in English, lower case) → the words a reply may use for it (matched on the raw lower-cased reply, so written as the AI writes them).'
// The English safety words customers mix into any chat (English is matched only via these lists).
const EN = ['allerg', 'alerg', 'gluten free', 'glutenfree', 'lactose', 'intoleran', 'celiac', 'coeliac', 'nut free', 'epipen', 'epi pen']
// Russian safety words typed inside Kazakh / Uzbek chats.
const RU_CORE = ['аллерг', 'алерг', 'непереносим', 'целиак', 'без глют', 'безглютен', 'без лактоз', 'безлактоз', 'без молок', 'без молоч',
  'без яиц', 'без орех', 'без арахис', 'не содерж', 'может содерж', 'безопасн', 'мне нельзя']
// Uzbek o‘ / g‘: the apostrophe is typed as ' ‘ ’ ` (→ a space after normalising), ʻ or ʼ (letters, kept) or left out.
const apos = (s) => s.includes("'") ? ["'", 'ʻ', 'ʼ', ''].map(a => s.split("'").join(a)) : [s]
// Azerbaijani: ı and ə are kept by the normaliser; customers without the keyboard type i and e.
const azv = (s) => [s, s.replace(/ı/g, 'i'), s.replace(/ə/g, 'e'), s.replace(/ı/g, 'i').replace(/ə/g, 'e')]
const L = {}
L.uk = {
  what: 'UKRAINIAN (uk-UA): алерг (алергія, алергічний), непереносимість, чутливість, целіакія, анафілаксія, без <allergen> as stems that survive the cases (без глютену / глютена, без лактози, без молока / молочного, без яєць, без горіхів…), безглютенов / безлактозн, не містить, може містити, сліди, перехресне забруднення / контамінація, безпечно, підходить для, мені не можна — plus the Russian forms (аллергия, непереносимость) and the Latin / English words customers mix in. ї and й fold to і and и on both sides. Bare без is NOT a stem (без цибулі is a preference), nor bare слід (inside наслідки) or містить (a presence question)',
  stems: ['алерг', 'аллерг', 'непереносим', 'нетолерант', 'інтолеран', 'чутлив', 'целіак', 'целиак', 'анафіла', 'анафила', 'епіпен', 'адреналін',
    'без глют', 'безглютен', 'без лактоз', 'безлактоз', 'без молок', 'без молоч', 'без яєць', 'без яйц', 'без горіх', 'без арахіс', 'без сої', 'без кунжут',
    'без риб', 'без морепрод', 'без кревет', 'без ракоподібн', 'без сульфіт', 'не містить', 'не містять', 'може містити', 'можуть містити', 'сліди', 'слідів',
    'перехресн', 'контамінац', 'безпечн', 'підходить для', 'підходять для', 'підійде для', 'мені не можна', 'не можна їсти',
    ...EN],
  cav: { gluten: ['глютен', 'пшениц', 'борошн', 'ячмін', 'жито'], crustaceans: ['ракоподібн', 'креветк', 'краб', 'омар', 'морепродукт'],
    eggs: ['яйц', 'яєць', 'яйце', 'майонез'], fish: ['риба', 'риби', 'рибу', 'рибн'], peanuts: ['арахіс'], soy: ['соя', 'сої', 'сою', 'тофу'],
    milk: ['молок', 'молоч', 'лактоз', 'сир', 'вершк', 'вершков'], 'tree nuts': ['горіх', 'мигдал', 'фундук', 'кешью', 'фісташк'],
    sulphites: ['сульфіт', 'діоксид сірки'] },
}
L.ru = {
  what: 'RUSSIAN as used in Kazakhstan (ru-KZ): аллерг / алерг (аллергия, аллергик), непереносимость, чувствительность, целиакия, анафилаксия, без <allergen> as stems that survive the cases (без глютена, без лактозы, без молока / молочного, без яиц, без орехов…), безглютеновый / безлактозный, не содержит, может содержать, следы, перекрёстное загрязнение / контаминация, безопасно, подходит для, мне нельзя — plus Latin translit (allergiya, bez glyutena) and English words. ё and й fold to е and и on both sides. Bare без is NOT a stem (без лука is a preference), nor bare след (inside следующий) or содержит ли (a presence question)',
  stems: ['аллерг', 'алерг', 'непереносим', 'чувствительн', 'целиак', 'анафила', 'эпипен', 'адреналин',
    'без глют', 'безглютен', 'без лактоз', 'безлактоз', 'без молок', 'без молоч', 'без яиц', 'без яйц', 'без орех', 'без арахис', 'без сои', 'без кунжут',
    'без рыб', 'без морепрод', 'без кревет', 'без ракообразн', 'без сульфит', 'не содерж', 'может содерж', 'могут содерж', 'следы', 'следов',
    'перекрестн', 'контаминац', 'безопасн', 'подходит для', 'подходят для', 'подойдет для', 'мне нельзя', 'нельзя есть', 'не могу есть',
    'bez glut', 'bez glyut', 'bez laktoz', 'bez moloka', 'ne soderzh',
    ...EN],
  cav: { gluten: ['глютен', 'пшениц', 'мука', 'муки', 'ячмен', 'рожь'], crustaceans: ['ракообразн', 'кревет', 'краб', 'омар', 'морепродукт'],
    eggs: ['яйц', 'яиц', 'яйко', 'майонез'], fish: ['рыб'], peanuts: ['арахис'], soy: ['соя', 'сои', 'сою', 'тофу'],
    milk: ['молок', 'молоч', 'лактоз', 'сыр', 'сливк', 'сливоч'], 'tree nuts': ['орех', 'миндал', 'фундук', 'кешью', 'фисташк'],
    sulphites: ['сульфит', 'диоксид серы'] },
}
L.kk = {
  what: 'KAZAKH, Cyrillic as Kazakh users type it (kk-KZ): аллергия (аллергиям бар), көтере алмаймын, сезімтал, целиакия, анафилаксия, the -сыз/-сіз free-from forms (глютенсіз, сүтсіз, жұмыртқасыз, жаңғақсыз, лактозасыз…), глютен / сүт / жаңғақ жоқ, қоспаңыз, қауіпсіз, жеуге болмайды / жей алмаймын, іздері, ластану — stems survive the suffixes (жаңғақсыздары). Common Latin-keyboard spellings (allergiya, glutensiz, sutsiz, zhangaqsyz, qauipsiz) and the Russian words customers mix in are added. Kazakh letters ә ғ қ ң ө ұ ү і are kept by the normaliser. Bare сыз / сіз is NOT a stem (сіз = you; пиязсыз is a preference)',
  stems: ['аллерг', 'алерг', 'көтере алма', 'көтермей', 'сезімтал', 'целиак', 'анафила', 'эпипен', 'адреналин',
    'глютенсіз', 'глютенсыз', 'лактозасыз', 'сүтсіз', 'сутсиз', 'жұмыртқасыз', 'жаңғақсыз', 'жержаңғақсыз', 'балықсыз', 'соясыз', 'күнжітсіз', 'асшаянсыз',
    'глютен жоқ', 'сүт жоқ', 'жаңғақ жоқ', 'жұмыртқа жоқ', 'қоспаңыз', 'қоспай', 'қауіпсіз', 'жеуге болмайды', 'жей алма', 'іздері', 'ластан', 'контаминац',
    'allergiya', 'allergiyam', 'glutensiz', 'sutsiz', 'laktozasyz', 'zhumyrtqasyz', 'zhumyrtkasyz', 'jumyrtqasyz', 'jumyrtkasyz',
    'zhangaqsyz', 'zhangaksyz', 'jangaqsyz', 'jangaksyz', 'qauipsiz', 'kauipsiz', 'zhei alma', 'jei alma', 'tseliak',
    ...RU_CORE.filter(x => x !== 'аллерг' && x !== 'алерг' && x !== 'целиак'), ...EN],
  cav: { gluten: ['глютен', 'бидай', 'арпа', 'қара бидай'], crustaceans: ['шаян', 'асшаян', 'теңіз өнім'], eggs: ['жұмыртқа', 'майонез'],
    fish: ['балық'], peanuts: ['жержаңғақ', 'жер жаңғағы'], soy: ['соя', 'тофу'], milk: ['сүт', 'лактоза', 'ірімшік', 'сары май', 'қаймақ', 'кілегей'],
    'tree nuts': ['жаңғақ', 'бадам', 'фундук', 'кешью', 'пісте'], sulphites: ['сульфит', 'күкірт диоксиді'] },
}
L.uz = {
  what: 'UZBEK, Latin (uz-UZ): allergiya (allergiyam bor), ko‘tara olmayman, intolerans, sezgir, seliakiya / tseliakiya, the -siz free-from forms (glyutensiz, sutsiz, tuxumsiz, yong‘oqsiz, laktozasiz, baliqsiz…), glyuten / sut / yong‘oq yo‘q, xavfsiz, uchun mos, yeya olmayman, menga mumkin emas, kontaminatsiya — stems survive the suffixes (yong‘oqsizmi). o‘ / g‘ are listed with every apostrophe customers type (\' ‘ ʻ ʼ or none). Cyrillic Uzbek (глютенсиз, сутсиз, ёнғоқсиз, хавфсиз) and the Russian words customers mix in are added. Bare siz is NOT a stem (siz = you; piyozsiz is a preference), nor bare izlar (inside sizlar) or mumkin emas',
  stems: [...['allerg', 'alerg', "ko'tara olma", "ko'tarolma", 'intoleran', 'sezgir', 'seliak', 'tseliak', 'anafilak', 'adrenalin',
    'glyutensiz', 'glutensiz', 'laktozasiz', 'laktozsiz', 'sutsiz', 'tuxumsiz', 'tuhumsiz', "yong'oqsiz", "yeryong'oqsiz", 'baliqsiz', 'soyasiz', 'kunjutsiz', 'krevetkasiz',
    "glyuten yo'q", "gluten yo'q", "sut yo'q", "yong'oq yo'q", "tuxum yo'q", 'xavfsiz', 'havfsiz', 'uchun mos', 'yeya olma', 'menga mumkin emas', 'kontaminats', 'kontaminac'].flatMap(apos).filter((x, i, a) => a.indexOf(x) === i),
    'глютенсиз', 'лактозасиз', 'сутсиз', 'тухумсиз', 'ёнғоқсиз', 'балиқсиз', 'хавфсиз', 'кўтара олма', 'ея олма', 'сезгир',
    ...RU_CORE, ...EN.filter(x => x !== 'allerg' && x !== 'alerg' && x !== 'intoleran')],
  cav: { gluten: ['glyuten', 'gluten', "bug'doy", 'bugʻdoy', 'arpa', 'javdar'], crustaceans: ['qisqichbaqa', 'krevetka', 'dengiz mahsulot'],
    eggs: ['tuxum', 'mayonez'], fish: ['baliq'], peanuts: ["yeryong'oq", 'yeryongʻoq', 'araxis'], soy: ['soya', 'tofu'],
    milk: ['sut', 'laktoza', 'pishloq', "sariyog'", 'sariyogʻ', 'qaymoq', 'qatiq'], 'tree nuts': ["yong'oq", 'yongʻoq', 'bodom', 'findiq', 'pista', 'keshyu'],
    sulphites: ['sulfit', 'oltingugurt dioksid'] },
}
L.az = {
  what: 'AZERBAIJANI (az-AZ): allergiya / alerji, dözümsüzlük, həssas, çölyak / seliakiya, anafilaksiya, the -siz/-sız/-suz/-süz free-from forms (qlütensiz, südsüz, yumurtasız, fındıqsız, qozsuz, laktozasız…), … olmadan, ehtiva etmir / ehtiva edə bilər, təhlükəsiz, üçün uyğun, yeyə bilmirəm, çarpaz çirklənmə — stems survive the suffixes (südsüzdür). ı and ə are kept by the normaliser, so each such word is also listed with i / e (as customers without the keyboard type it). Bare siz is NOT a stem (siz = you; ətsiz / soğansız are preferences), nor bare izləri (inside sizləri)',
  stems: [...['allerg', 'alerg', 'dözümsüz', 'həssas', 'çölyak', 'seliak', 'anafilak', 'adrenalin',
    'qlütensiz', 'glütensiz', 'glutensiz', 'laktozasız', 'laktozsuz', 'südsüz', 'süd olmadan', 'yumurtasız', 'fındıqsız', 'qozsuz', 'araxissiz', 'balıqsız', 'soyasız', 'küncütsüz', 'krevetsiz',
    'qlüten olmadan', 'glüten olmadan', 'yumurta olmadan', 'ehtiva etmir', 'ehtiva etməyən', 'ehtiva edə bilər', 'tərkibində yoxdur', 'təhlükəsiz', 'üçün uyğun',
    'yeyə bilmir', 'çarpaz', 'çirklənmə', 'kontaminas'].flatMap(azv).filter((x, i, a) => a.indexOf(x) === i), ...EN.filter(x => x !== 'allerg' && x !== 'alerg')],
  cav: { gluten: ['qlüten', 'glüten', 'buğda', 'arpa', 'çovdar', 'yulaf'], crustaceans: ['xərçəngkimi', 'krevet', 'xərçəng', 'dəniz məhsul'],
    eggs: ['yumurta', 'mayonez'], fish: ['balıq'], peanuts: ['yerfındığı', 'yer fındığı', 'araxis'], soy: ['soya', 'tofu'],
    milk: ['süd', 'laktoza', 'pendir', 'kərə yağ', 'qaymaq', 'qatıq', 'xama'], 'tree nuts': ['qoz', 'fındıq', 'badam', 'keşyu', 'püstə'],
    sulphites: ['sulfit', 'kükürd dioksid'] },
}
L.ka = {
  what: 'GEORGIAN (ka-GE): ალერგ (ალერგია, ალერგიული), აუტანლობა, მგრძნობიარე, ცელიაკია, ანაფილაქსია, the უ-…-ო free-from forms (უგლუტენო, ულაქტოზო), <allergen>-ის გარეშე (გლუტენის / რძის / კვერცხის / თხილის / არაქისის გარეშე…), არ შეიცავს, შეიძლება შეიცავდეს, უსაფრთხო, შესაფერისი, ვერ ვჭამ, ჯვარედინი დაბინძურება — plus the Latin-keyboard Georgian customers type (alergia, ugluteno, glutenis gareshe, ar sheicavs, usafrtxo). Bare გარეშე / gareshe is NOT a stem (ხახვის გარეშე is a preference), nor bare შეიცავს (a presence question)',
  stems: ['ალერგ', 'აუტანლობ', 'მგრძნობიარ', 'ცელიაკ', 'ანაფილაქს', 'ეპიპენ', 'ადრენალინ',
    'უგლუტენ', 'ულაქტოზ', 'გლუტენის გარეშე', 'ლაქტოზის გარეშე', 'რძის გარეშე', 'რძის პროდუქტების გარეშე', 'კვერცხის გარეშე', 'თხილის გარეშე', 'კაკლის გარეშე',
    'არაქისის გარეშე', 'თხილეულის გარეშე', 'სოიოს გარეშე', 'თევზის გარეშე', 'ზღვის პროდუქტების გარეშე', 'კრევეტების გარეშე', 'სეზამის გარეშე', 'ქუნჯუთის გარეშე', 'სულფიტების გარეშე',
    'არ შეიცავ', 'შეიცავდეს', 'უსაფრთხო', 'შესაფერის', 'ვერ ვჭამ', 'ჯვარედინ', 'დაბინძურ',
    'ugluten', 'glutenis gareshe', 'laqtozis gareshe', 'laktozis gareshe', 'rdzis gareshe', 'kvertskhis gareshe', 'kvercxis gareshe', 'kvertxis gareshe',
    'tkhilis gareshe', 'txilis gareshe', 'araqisis gareshe', 'arakisis gareshe', 'tevzis gareshe', 'ar sheicav', 'ar sheitsav', 'usafrtx', 'usaprtx', 'usafrtkh',
    'tseliak', 'autanlob', 'ver vcham', ...EN],
  cav: { gluten: ['გლუტენ', 'ხორბალ', 'ფქვილ'], crustaceans: ['კიბოსნაირ', 'კრევეტ', 'კიბო', 'ზღვის პროდუქტ'], eggs: ['კვერცხ', 'მაიონეზ'],
    fish: ['თევზ'], peanuts: ['არაქის'], soy: ['სოიო', 'ტოფუ'], milk: ['რძე', 'რძის', 'ლაქტოზ', 'ყველ', 'კარაქ', 'ნაღებ', 'მაწონ'],
    'tree nuts': ['თხილ', 'კაკალ', 'კაკლ', 'ნუშ', 'ფისტ', 'კეშიუ'], sulphites: ['სულფიტ', 'გოგირდის დიოქსიდ'] },
}
L.hy = {
  what: 'ARMENIAN (hy-AM): ալերգ (ալերգիա, ալերգիկ), անհանդուրժողականություն, զգայուն, ցելիակիա, անաֆիլաքսիա, առանց <allergen> (առանց գլյուտենի, առանց կաթի, առանց ձվի, առանց ընկույզի…), անգլյուտեն, չի պարունակում, կարող է պարունակել, հետքեր, անվտանգ, համար հարմար, չեմ կարող ուտել, խաչաձև աղտոտում — plus the Latin translit customers type (alergia, aranc glyuteni, chi parunakum, anvtang). The question mark ՞ is written inside the word and splits it on normalising, so stems end before the stressed vowel where it lands (անվտա for անվտա՞նգ). Bare առանց / aranc is NOT a stem (առանց սոխի is a preference), nor bare հարմար (= convenient)',
  stems: ['ալերգ', 'անհանդուրժող', 'զգայուն', 'ցելիակ', 'անաֆիլաքս', 'էպիպեն', 'ադրենալին',
    'առանց գլյուտեն', 'առանց գլուտեն', 'անգլյուտեն', 'առանց լակտոզ', 'առանց կաթ', 'առանց կաթնամթերք', 'առանց ձվ', 'առանց ձու', 'առանց ընկույզ', 'առանց գետնանուշ',
    'առանց սոյա', 'առանց ձկ', 'առանց ձուկ', 'առանց ծովամթերք', 'առանց ծովախեցգետն', 'առանց կրևետ', 'առանց քունջութ', 'առանց սուլֆիտ',
    'չի պարունակ', 'չեն պարունակ', 'կարող է պարունակ', 'հետքեր', 'անվտա', 'համար հարմար', 'չեմ կարող ուտել', 'չեմ ուտում', 'խաչաձև', 'աղտոտ',
    'aranc glut', 'arants glut', 'aranc glyut', 'arants glyut', 'aranc kat', 'arants kat', 'aranc dzv', 'arants dzv', 'aranc enkuyz', 'arants enkuyz', 'aranc ynkuyz',
    'aranc getnanush', 'arants getnanush', 'chi parunak', 'chen parunak', 'anvtang', 'anhandur', 'tseliak', ...EN],
  cav: { gluten: ['գլյուտեն', 'գլուտեն', 'ցորեն', 'ալյուր', 'գարի'], crustaceans: ['խեցգետն', 'ծովախեցգետ', 'կրևետ', 'կրեւետ', 'ծովամթերք', 'օմար'],
    eggs: ['ձու', 'ձվ', 'մայոնեզ'], fish: ['ձուկ', 'ձկ'], peanuts: ['գետնանուշ', 'արախիս'], soy: ['սոյա', 'տոֆու'],
    milk: ['կաթ', 'լակտոզ', 'պանիր', 'կարագ', 'սերուցք', 'մածուն'], 'tree nuts': ['ընկույզ', 'նուշ', 'պնդուկ', 'կեշյու', 'պիստակ'],
    sulphites: ['սուլֆիտ', 'ծծմբի երկօքսիդ'] },
}
L.sq = {
  what: 'ALBANIAN (sq-AL): alerg (alergji, alergjik), intolerancë, i ndjeshëm, celiaki, anafilaksi, pa <allergen> (pa gluten, pa laktozë, pa qumësht / qumsht, pa vezë, pa arra, pa kikirikë…), nuk përmban, mund të përmbajë, gjurmë, i / e sigurt për, i përshtatshëm, kontaminim i kryqëzuar. ë and ç fold to e and c on both sides (\"qumesht\" = \"qumësht\"). Bare pa is NOT a stem (pa qepë is a preference), nor bare sigurt (a jeni të sigurt = are you sure)',
  stems: ['alerg', 'intoleranc', 'intolerant', 'ndjeshem', 'ndjeshme', 'celiak', 'anafilak', 'adrenalin',
    'pa gluten', 'pa laktoz', 'pa qumesht', 'pa qumsht', 'pa bulmet', 'pa vez', 'pa arra', 'pa fruta arr', 'pa fruta me levozhg', 'pa kikirik', 'pa lajthi', 'pa bajame',
    'pa soj', 'pa susam', 'pa peshk', 'pa karkalec', 'pa fruta deti', 'pa sulfit',
    'nuk permban', 'nuk e permban', 'mund te permbaj', 'gjurm', 'sigurt per', 'sigurte per', 'pershtatsh', 'kontamin', 'kryqezuar',
    ...EN.filter(x => x !== 'alerg' && x !== 'intoleran')],
  cav: { gluten: ['gluten', 'grur', 'miell', 'elb', 'thekër'], crustaceans: ['krustace', 'karkalec', 'gaforre', 'fruta deti', 'omar'],
    eggs: ['vez', 'majonez'], fish: ['peshk'], peanuts: ['kikirik'], soy: ['soj', 'tofu'], milk: ['qumësht', 'laktoz', 'djath', 'gjalp', 'krem', 'kos'],
    'tree nuts': ['arra', 'lajthi', 'bajame', 'fëstëk', 'shqeme', 'fruta me lëvozhgë'], sulphites: ['sulfit', 'dioksid squfuri'] },
}
L.mk = {
  what: 'MACEDONIAN (mk-MK): алерг (алергија, алергичен), нетолеранција / интолеранција, чувствителен, целијакија, анафилакса, без <allergen> (без глутен, без лактоза, без млеко / млечни, без јајца, без ореви, без кикирики…), безглутенск, не содржи, може да содржи, траги од, вкрстена контаминација, безбедно, погоден / соодветен за, не смеам / не можам да јадам — plus the Latin-typed Macedonian customers use (alergija, bez gluten, ne sodrzi). ѓ and ќ fold to г and к on both sides. Bare без / bez is NOT a stem (без кромид is a preference), nor bare содржи (a presence question)',
  stems: ['алерг', 'нетолеранц', 'интолеранц', 'нетолерант', 'чувствител', 'целијак', 'анафилак', 'епипен', 'адреналин',
    'без глутен', 'безглутен', 'без лактоз', 'безлактоз', 'без млеко', 'без млечн', 'без јајц', 'без јаја', 'без кикирики', 'без ореви', 'без јаткаст', 'без лешни', 'без бадем',
    'без соја', 'без сусам', 'без риба', 'без морска храна', 'без морски плодови', 'без ракчиња', 'без шкампи', 'без сулфит',
    'не содрж', 'може да содрж', 'траги од', 'вкрстен', 'контаминац', 'безбедн', 'погоден за', 'погодна за', 'погодно за', 'погодни за', 'соодветн', 'не смеам', 'не можам да јад',
    'bez gluten', 'bezgluten', 'bez laktoz', 'bez mleko', 'bez mlecn', 'bez jajc', 'bez jaja', 'bez kikiriki', 'bez orevi', 'bez soja', 'bez susam', 'bez riba',
    'ne sodrzi', 'moze da sodrzi', 'bezbedn', 'celijak', 'netoleranc', 'intoleranc', 'chuvstvitel', 'cuvstvitel', ...EN],
  cav: { gluten: ['глутен', 'пченица', 'брашно', 'јачмен'], crustaceans: ['ракови', 'ракчиња', 'шкампи', 'јастог', 'морска храна', 'морски плодови'],
    eggs: ['јајца', 'јајце', 'мајонез'], fish: ['риба', 'риби'], peanuts: ['кикирики'], soy: ['соја', 'тофу'],
    milk: ['млеко', 'млечн', 'лактоза', 'сирење', 'кашкавал', 'путер', 'павлака', 'кајмак'], 'tree nuts': ['ореви', 'оревче', 'јаткаст', 'лешници', 'бадеми', 'индиски ореви', 'фстаци'],
    sulphites: ['сулфит', 'сулфур диоксид'] },
}
L.bs = {
  what: 'BOSNIAN, Latin script (bs-BA): alerg (alergija, alergičan), (ne)tolerancija, osjetljiv, celijakija, anafilaksa, bez <allergen> (bez glutena, bez laktoze, bez mlijeka, bez jaja, bez kikirikija, bez orašastih plodova, bez lješnjaka…), bezglutensk / bezlaktozn, ne sadrži / nema glutena, sigurno / pogodno / prikladno za, može sadržati, tragovi, (unakrsna) kontaminacija, ne smijem / ne mogu jesti. š č ć ž fold away on both sides; đ is kept, so it is not used in a stem. Bare bez is NOT a stem (bez luka is a preference), nor bare siguran (jeste li sigurni = are you sure)',
  stems: ['alerg', 'intoleran', 'netoleran', 'osjetljiv', 'osetljiv', 'celijak', 'anafilak', 'adrenalin',
    'bez glutena', 'bezglutensk', 'bez laktoze', 'bezlaktozn', 'bez mlijeka', 'bez mleka', 'bez mliječn', 'bez mlečn', 'bez jaja', 'bez kikiriki', 'bez orašast', 'bez oraha',
    'bez lješnjak', 'bez lješnik', 'bez badema', 'bez soje', 'bez susama', 'bez sezama', 'bez ribe', 'bez rakova', 'bez škampa', 'bez morskih plodova', 'bez plodova mora', 'bez školjki', 'bez sulfita',
    'ne sadrži', 'nema glutena', 'nema laktoze', 'bezbjedn', 'bezbedn', 'siguran za', 'sigurna za', 'sigurno za', 'sigurni za', 'pogodan za', 'pogodna za', 'pogodno za', 'pogodni za', 'prikladn',
    'može sadržati', 'mogu sadržati', 'može sadržavati', 'može da sadrži', 'tragov', 'kontaminacij', 'unakrsn', 'ne smijem jesti', 'ne smijem jest', 'ne mogu jesti',
    ...EN.filter(x => x !== 'alerg' && x !== 'intoleran')],
  cav: { gluten: ['gluten', 'pšenic', 'brašn', 'ječm', 'ječam', 'raž', 'zob'], crustaceans: ['rakov', 'škamp', 'kozic', 'jastog', 'plodovi mora', 'morski plodovi'],
    eggs: ['jaj', 'majonez'], fish: ['riba', 'ribe', 'ribu', 'ribom'], peanuts: ['kikiriki'], soy: ['soja', 'soje', 'soju', 'tofu'],
    milk: ['mlijek', 'mliječ', 'laktoz', 'sir ', 'sira', 'sirom', 'maslac', 'pavlak', 'kajmak'], 'tree nuts': ['orašast', 'orah', 'orasi', 'lješnjak', 'badem', 'indijsk', 'pistać'],
    sulphites: ['sulfit', 'sumpor-dioksid', 'sumpor dioksid'] },
}
L.ca = {
  what: 'CATALAN (ca-ES): al·lèrgia / al·lèrgic (the middle dot becomes a space on normalising, so \"al lerg\" covers al·lèrgia, al.lèrgia and aŀlèrgia; alergia / allergia as typed are added), intolerància / intolerant, sensible a, celíac / celiaquia, anafilaxi, sense <allergen> (sense gluten, sense lactosa, sense llet, sense ous, sense fruits secs, sense cacauets…), no conté / no contenen, pot contenir, traces, contaminació creuada, apte / adequat / segur per a, no puc menjar — plus the Spanish forms bilingual customers type (sin gluten, sin lactosa). Bare sense is NOT a stem (sense ceba is a preference), nor bare segurs (esteu segurs = are you sure)',
  stems: ['al lerg', 'alerg', 'intoleran', 'sensible a', 'sensibles a', 'celiac', 'celiaqu', 'anafil', 'adrenalin',
    'sense gluten', 'sense lactosa', 'sense llet', 'sense lacti', 'sense ou', 'sense fruits secs', 'sense fruita seca', 'sense nous', 'sense cacauet', 'sense avellan', 'sense ametll',
    'sense soja', 'sense sesam', 'sense peix', 'sense marisc', 'sense crustaci', 'sense gamb', 'sense sulfit',
    'sin gluten', 'sin lactosa', 'sin leche', 'sin huevo', 'sin frutos secos', 'sin cacahuet',
    'no conte', 'pot contenir', 'poden contenir', 'puede contener', 'traces', 'traça', 'contaminacio', 'creuad', 'apte per', 'apta per', 'aptes per', 'apto para',
    'adequat per', 'adequada per', 'segur per', 'segura per', 'segurs per', 'segures per', 'no puc menjar', 'no puc prendre',
    ...EN.filter(x => x !== 'alerg' && x !== 'intoleran' && x !== 'celiac')],
  cav: { gluten: ['gluten', 'blat', 'farina', 'ordi', 'sègol', 'civada'], crustaceans: ['crustaci', 'gamba', 'gambes', 'llagost', 'marisc', 'cranc'],
    eggs: ['ous', 'ou ', 'maionesa'], fish: ['peix'], peanuts: ['cacauet'], soy: ['soja', 'tofu'],
    milk: ['llet', 'làctic', 'lactosa', 'formatge', 'mantega', 'nata', 'iogurt'], 'tree nuts': ['fruits secs', 'fruita seca', 'nous', 'avellan', 'ametll', 'anacard', 'pistatx'],
    sulphites: ['sulfit', 'diòxid de sofre'] },
}
L.mn = {
  what: 'MONGOLIAN, Cyrillic (mn-MN): харшил / харшл (харшилтай, харшлын), аллерги, үл тэвчих, мэдрэг, целиак, анафилакси, the -гүй free-from forms (глютенгүй, сүүгүй, өндөггүй, самаргүй, загасгүй, лактозгүй…), агуулаагүй / агуулахгүй, агуулж болзошгүй, ул мөр, аюулгүй, идэж болохгүй / чадахгүй, бохирдол — stems survive the suffixes (самаргүй юу). Common Latin-keyboard spellings (harshil, glutengui, suugui, samargui, ayulgui) are added. ө and ү are kept by the normaliser. Bare гүй is NOT a stem (inside магадгүй; сонгиногүй is a preference), nor тохиромжтой (= convenient)',
  stems: ['харшил', 'харшл', 'аллерг', 'үл тэвч', 'тэсвэрлэхгүй', 'мэдрэг', 'целиак', 'анафилакс', 'эпипен', 'адреналин',
    'глютенгүй', 'лактозгүй', 'сүүгүй', 'сүүн бүтээгдэхүүнгүй', 'өндөггүй', 'самаргүй', 'загасгүй', 'буурцаггүй', 'гүнжидгүй', 'кунжутгүй', 'хорхойгүй',
    'агуулаагүй', 'агуулахгүй', 'агуулдаггүй', 'агуулж болзошгүй', 'агуулсан байж маг', 'ул мөр', 'аюулгүй', 'идэж болохгүй', 'идэж чадахгүй', 'бохирд',
    'harshil', 'harshl', 'glutengui', 'gluten gui', 'laktozgui', 'suugui', 'ondoggui', 'undeggui', 'undgui', 'samargui', 'zagasgui', 'ayulgui', 'aguulaagui', 'aguulahgui',
    'idej bolohgui', 'idej chadahgui', ...EN],
  cav: { gluten: ['глютен', 'улаан буудай', 'гурил', 'арвай'], crustaceans: ['хавч', 'сам хорхой', 'далайн хоол', 'далайн гаралтай'], eggs: ['өндөг', 'майонез'],
    fish: ['загас'], peanuts: ['газрын самар'], soy: ['шар буурцаг', 'соя', 'тофу'], milk: ['сүү', 'лактоз', 'бяслаг', 'цөцгий', 'шар тос', 'тараг'],
    'tree nuts': ['самар', 'хушга', 'бүйлс', 'кешью', 'фисташ'], sulphites: ['сульфит', 'хүхрийн давхар исэл'] },
}
const order = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'tree nuts', 'sulphites']
for (const [lang, d] of Object.entries(L)) {
  const keys = Object.keys(d.cav)
  if (keys.join() !== order.join()) throw new Error(lang + ' caveat keys ' + keys)
  const dup = d.stems.filter((s, i) => d.stems.indexOf(s) !== i); if (dup.length) throw new Error(lang + ' dup ' + dup)
  const out = { $comment: `languages-world-2 (11 November 2026): the WhatsApp allergen guard’s trigger words for ${d.what}. ${tail} The country has no allergen set of its own yet, so caveatWords are for 'codex' (as MX, SG, HK, MY, TH and AE).`,
    language: lang, normalise: 'unicode', stems: d.stems, tokens: [], caveatWords: { codex: d.cav } }
  fs.writeFileSync(path.join(__dirname, lang + '.json'), JSON.stringify(out, null, 2) + '\n')
}
console.log('wrote', Object.keys(L).join(' '))
