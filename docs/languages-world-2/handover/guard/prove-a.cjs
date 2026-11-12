// Proves group a's 12 lists (languages-world-2) the way lib/allergen-guard.ts matches them: unicodeNorm (NFKD, marks stripped, lower case, non letter/number
// runs → one space, padded), stems = substring of the normalised message, tokens = whole normalised words. Copied from the code.
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
  uk: { safety: ['У мене алергія на арахіс', 'Ця піца без глютену?', 'Чи є щось без лактози?', 'Я маю непереносимість лактози', 'У доньки целіакія, що їй можна?',
      'Бургер не містить горіхів?', 'Чи може містити сліди кунжуту?', 'u mene alergiya na horikhy', 'Є щось gluten free?', 'Синові з алергією на яйця що порадите?',
      'Чи безпечно це для алергіків?', 'Чи є ризик перехресного забруднення?', 'У меня аллергия на орехи'],
    plain: ['О котрій ви відкриваєтесь?', 'Де ви сьогодні стоїте?', 'Скільки коштує бургер?', 'Можна оплатити карткою?', 'Які у вас є піци?', 'Чи можна без цибулі?',
      'Через наслідки дощу ви сьогодні працюєте?', 'Що містить комбо меню?'] },
  ru: { safety: ['У меня аллергия на орехи', 'Пицца без глютена?', 'Есть что-нибудь без лактозы?', 'У меня непереносимость лактозы', 'У ребёнка целиакия',
      'Бургер не содержит арахиса?', 'Может содержать следы кунжута?', 'u menya allergiya na orehi', 'Есть что-то gluten free?', 'Это безопасно для аллергиков?',
      'Есть риск перекрёстного загрязнения?', 'Мне нельзя молочное', 'Аллергиям бар, жаңғақ қоспаңызшы'],
    plain: ['Во сколько открываетесь?', 'Где вы сегодня стоите?', 'Сколько стоит бургер?', 'Можно оплатить картой?', 'Какие у вас есть пиццы?', 'Можно без лука?',
      'На следующей неделе вы будете тут?', 'Kaspi QR принимаете?', 'Что входит в состав комбо?'] },
  kk: { safety: ['Менде жержаңғаққа аллергия бар', 'Бұл пицца глютенсіз бе?', 'Сүтсіз тағам бар ма?', 'Лактозаны көтере алмаймын', 'Баламда целиакия бар, не жей алады?',
      'Жұмыртқасыз жасай аласыз ба?', 'Бұл балаға қауіпсіз бе?', 'allergiyam bar, zhangaqsyz burger bar ma', 'Жаңғақсыздары бар ма?', 'Есть без глютена?',
      'Маған сүт жеуге болмайды', 'Is it gluten free?'],
    plain: ['Сағат нешеде ашыласыздар?', 'Бүгін қай жердесіздер?', 'Бургер қанша тұрады?', 'Картамен төлеуге бола ма?', 'Қандай пиццаларыңыз бар?',
      'Сіздерде пиязсыз бургер бар ма?', 'Kaspi арқылы төлесем бола ма?', 'Сіз ертең жұмыс істейсіз бе?'] },
  uz: { safety: ["Menda yeryong'oqqa allergiya bor", 'Bu pitsa glyutensizmi?', 'Sutsiz taom bormi?', "Laktozani ko'tara olmayman", 'Qizimda tseliakiya bor',
      "Yong'oqsiz qilib bera olasizmi?", 'yongʻoqsiz burger bormi', 'Bu bola uchun xavfsizmi?', 'Пицца глютенсизми?', 'У меня аллергия на орехи', 'Tuxumsiz burger bormi?',
      'Bu burger gluten free mi?'],
    plain: ['Soat nechida ochilasiz?', 'Bugun qayerdasizlar?', 'Burger qancha turadi?', "Karta bilan to'lasa bo'ladimi?", 'Qanday pitsalaringiz bor?',
      'Piyozsiz lavash bormi?', "Payme orqali to'lash mumkin emasmi?", 'Sizlarda yetkazib berish bormi?'] },
  az: { safety: ['Fıstığa allergiyam var', 'Bu pizza qlütensizdir?', 'Südsüz yemək var?', 'Laktoza dözümsüzlüyüm var', 'Uşağımda çölyak xəstəliyi var',
      'Bu uşaq üçün təhlükəsizdir?', 'Yumurtasız hazırlaya bilərsiniz?', 'fistiq allergiyam var, findiqsiz burger var?', 'Bu yemək fındıq ehtiva etmir?',
      'Glütenə həssasam', 'Çarpaz çirklənmə riski var?', 'bu usaq ucun tehlukesizdir?', 'Is there anything gluten free?'],
    plain: ['Saat neçədə açılırsınız?', 'Bu gün haradasınız?', 'Burger neçəyədir?', 'Kartla ödəmək olar?', 'Hansı pizzalarınız var?', 'Ətsiz yemək var?',
      'Soğansız dönər olar?', 'Sizdə hansı souslar var?'] },
  ka: { safety: ['ალერგია მაქვს თხილზე', 'ეს პიცა უგლუტენოა?', 'გაქვთ რამე რძის გარეშე?', 'ლაქტოზის აუტანლობა მაქვს', 'შვილს ცელიაკია აქვს',
      'ბურგერი არ შეიცავს არაქისს?', 'შეიძლება შეიცავდეს სეზამის კვალს?', 'alergia maqvs tkhilze', 'gaqvt raime glutenis gareshe?', 'ალერგიული ვარ კვერცხზე',
      'ეს უსაფრთხოა ბავშვისთვის?', 'ar sheicavs araqiss?'],
    plain: ['რომელ საათზე იხსნებით?', 'დღეს სად ხართ?', 'რა ღირს ბურგერი?', 'ბარათით გადახდა შეიძლება?', 'რა პიცები გაქვთ?', 'ხახვის გარეშე შეიძლება?',
      'shaurma khakhvis gareshe sheidzleba?', 'რას შეიცავს ეს ბურგერი?'] },
  hy: { safety: ['Ալերգիա ունեմ գետնանուշի նկատմամբ', 'Պիցցան առանց գլյուտենի՞ է', 'Ունե՞ք ինչ-որ բան առանց կաթի', 'Լակտոզայի անհանդուրժողականություն ունեմ',
      'Երեխաս ցելիակիա ունի', 'Բուրգերը չի պարունակում ընկույզ?', 'Կարո՞ղ է պարունակել քունջութի հետքեր', 'Սա անվտա՞նգ է երեխայի համար',
      'alergia unem getnanushi nkatmamb', 'aranc glyuteni ka?', 'Ալերգիայով երեխայի համար ինչ կա', 'Is it gluten free?'],
    plain: ['Ժամը քանիսի՞ն եք բացվում', 'Այսօր որտե՞ղ եք', 'Ինչ արժե բուրգերը?', 'Քարտով կարելի՞ է վճարել', 'Ի՞նչ պիցցաներ ունեք', 'Առանց սոխի կարելի՞ է',
      'Ե՞րբ է հարմար գալ', 'aranc sokhi kareli e?'] },
  sq: { safety: ['Kam alergji nga kikirikët', 'A është pica pa gluten?', 'Keni diçka pa laktozë?', 'Kam intolerancë ndaj laktozës', 'Vajza ime ka celiaki',
      'Burgeri nuk përmban arra?', 'Mund të përmbajë gjurmë susami?', 'kam alergji, a keni gluten free', 'Jam alergjike ndaj vezëve',
      'A është e sigurt për fëmijët me intolerancë?', 'pa qumsht ju lutem'],
    plain: ['Në çfarë ore hapeni?', 'Ku jeni sot?', 'Sa kushton burgeri?', 'A pranoni kartë?', 'Çfarë picash keni?', 'A mund ta bëni pa qepë?',
      'A jeni të sigurt që jeni hapur sot?', 'Nuk mund te hapim porosine?'] },
  mk: { safety: ['Имам алергија на кикирики', 'Дали пицата е без глутен?', 'Имате ли нешто без лактоза?', 'Имам нетолеранција на лактоза', 'Ќерка ми има целијакија',
      'Бургерот не содржи ореви?', 'Може да содржи траги од сусам?', 'imam alergija na jajca', 'dali ima bez gluten pica', 'Алергичен сум на јајца',
      'Дали е безбедно за дете со алергија?', 'Is it gluten free?'],
    plain: ['Во колку часот отворате?', 'Каде сте денес?', 'Колку чини бургерот?', 'Може ли со картичка?', 'Какви пици имате?', 'Може ли без кромид?',
      'Дали содржи кечап бургерот?', 'Трагично доцнам, дали сте уште отворени?'] },
  bs: { safety: ['Je li pizza bez glutena?', 'Alergičan sam na kikiriki', 'alergicna sam na jaja', 'Imam celijakiju', 'Imate li nešto bez laktoze?',
      'Da li ovo ne sadrži orašaste plodove?', 'Može li bez mlijeka?', 'Postoji li rizik od unakrsne kontaminacije?', 'Imate li bezglutensku pizzu?',
      'Osjetljiva sam na gluten', 'Imate li nesto gluten free?'],
    plain: ['Kada radite?', 'Gdje ste danas?', 'Koliko košta porcija ćevapa?', 'Primate li kartice?', 'Koje pizze imate?', 'Može li bez luka?',
      'Jeste li sigurni da radite u nedjelju?', 'Da li je burger sa sirom?'] },
  ca: { safety: ['Tinc al·lèrgia als fruits secs', 'La pizza és sense gluten?', 'Teniu alguna cosa sense lactosa?', 'Soc intolerant a la lactosa', 'La meva filla és celíaca',
      "L'hamburguesa no conté cacauets?", 'Pot contenir traces de sèsam?', "tinc alergia a l'ou", 'És apte per a celíacs?', 'Hi ha risc de contaminació creuada?',
      'Sóc al·lèrgica als ous', 'tens algo gluten free?', 'Teniu pizza sin gluten?'],
    plain: ['A quina hora obriu?', 'On sou avui?', 'Quant costa una hamburguesa?', 'Puc pagar amb targeta?', 'Quines pizzes teniu?', 'Me la podeu fer sense ceba?',
      'Esteu segurs que obriu diumenge?', 'Hi ha alguna cosa per a nens?'] },
  mn: { safety: ['Би самарт харшилтай', 'Энэ пицца глютенгүй юу?', 'Сүүгүй хоол байна уу?', 'Надад лактоз үл тэвчих өвчин бий', 'Хүүхэд маань целиак өвчтэй',
      'Бургерт самар агуулаагүй юу?', 'Гүнжидийн ул мөр агуулж болзошгүй юу?', 'bi samart harshiltai', 'Хүүхдэд аюулгүй юу?', 'Харшлын эм авч явдаг',
      'Аллергитэй хүнд юу байна?', 'Өндөггүй хийж болох уу?', 'gluten free baigaa yu?'],
    plain: ['Хэдэн цагт нээх вэ?', 'Өнөөдөр хаана байрлаж байна?', 'Бургер хэд вэ?', 'Картаар төлж болох уу?', 'Ямар пицца байна?', 'Сонгиногүй хийж болох уу?',
      'Магадгүй маргааш ирнэ, нээлттэй юу?', 'Тохиромжтой цаг хэзээ вэ?'] },
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
