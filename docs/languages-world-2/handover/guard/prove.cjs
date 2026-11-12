// Proves the 7 lists the way lib/allergen-guard.ts matches them: unicodeNorm (NFKD, marks stripped, lower case, non letter/number
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
  tr: { safety: ['Bu pizza glutensiz mi?', 'Fıstık alerjim var', 'FISTIK ALERJİM VAR', 'Çölyak hastasıyım, yiyebileceğim bir şey var mı?', 'Laktoz intoleransım var',
      'Sütsüz bir seçenek var mı?', 'Bu tatlı fındık içermiyor değil mi?', 'Yumurtasız yapabilir misiniz?', 'fistiksiz burger var mi', 'Çapraz bulaşma riski var mı?', 'Glutene hassasiyetim var'],
    plain: ['Hangi pizzalarınız var?', 'Saat kaçta açıksınız?', 'Bugün neredesiniz?', 'Menüde tatlı var mı?', 'Kredi kartı kabul ediyor musunuz?', 'Lahmacun ne kadar?', 'Paket servis yapıyor musunuz?', 'Peynirli pide var mı?'] },
  ko: { safety: ['이 피자 글루텐프리인가요?', '땅콩 알레르기가 있어요', '저 견과류 알러지 있는데 괜찮을까요?', '유당불내증이 있어요', '우유 안 들어간 메뉴 있나요?', '계란 없는 메뉴 있어요?',
      '새우 빼주실 수 있나요?', '셀리악병이 있는데 먹을 수 있는 거 있어요?', '교차오염 가능성 있나요?', '이거 땅콩 들어있지 않죠?', '저는 갑각류를 못 먹어요'],
    plain: ['몇 시에 문 열어요?', '오늘 어디서 영업하세요?', '메뉴 뭐 있어요?', '가장 인기 있는 메뉴가 뭐예요?', '카드 결제 되나요?', '월요일 빼고 매일 여나요?', '주말 제외하고 영업하시나요?', '치즈버거 얼마예요?'] },
  id: { safety: ['Apakah pizza ini bebas gluten?', 'Saya alergi kacang', 'Ada menu tanpa susu?', 'Anak saya intoleran laktosa', 'Saya punya penyakit celiac',
      'Bisa nggak pakai udang?', 'Ada risiko kontaminasi silang?', 'Apakah ini tidak mengandung telur?', 'Aman untuk penderita seliak?', 'Ada yang gluten free?'],
    plain: ['Jam berapa buka?', 'Hari ini jualan di mana?', 'Ada menu apa saja?', 'Harga burger berapa?', 'Bisa bayar pakai QRIS?', 'Harga pakai keju berapa?', 'Pizza apa yang paling laris?'] },
  vi: { safety: ['Tôi bị dị ứng đậu phộng', 'toi bi di ung dau phong', 'Có món nào không chứa sữa không?', 'Con tôi không dung nạp lactose', 'Tôi bị bệnh celiac',
      'Món này có an toàn cho người dị ứng hải sản không?', 'Làm giúp tôi bánh mì không đậu phộng được không?', 'Có nguy cơ nhiễm chéo không?', 'Có món không gluten không?', 'Pizza nay khong co dau phong phai khong?', 'Tôi không ăn được tôm'],
    plain: ['Mấy giờ quán mở cửa?', 'Hôm nay xe đỗ ở đâu?', 'Có món chay không?', 'Bánh mì giá bao nhiêu?', 'Có nhận thanh toán bằng thẻ không?', 'Món nào không cay?', 'Món này hoàn toàn chay phải không?', 'Có giao hàng không?'] },
  he: { safety: ['יש לי אלרגיה לבוטנים', 'הפיצה ללא גלוטן?', 'יש משהו בלי חלב?', 'אני צליאקית, מה אני יכולה לאכול?', 'יש לי אי סבילות ללקטוז', 'האם המנה לא מכילה אגוזים?',
      'יש מוצרים נטולי גלוטן?', 'יש חשש למגע צולב?', 'הבן שלי רגיש לביצים', 'זה בטוח לילד עם רגישות לשומשום?'],
    plain: ['מתי אתם פתוחים?', 'אתם פתוחים בלילה?', 'איפה אתם היום?', 'מה יש בתפריט?', 'כמה עולה המבורגר?', 'אפשר לשלם באשראי?', 'אילו תבלינים אתם שמים?', 'בעקבות הגשם אתם סגורים היום?', 'מתי מתאים לבוא?'] },
  is: { safety: ['Er pizzan glútenlaus?', 'Ég er með hnetuofnæmi', 'Ég er með mjólkuróþol', 'Eruð þið með eitthvað án glútens?', 'Barnið mitt er með bráðaofnæmi fyrir eggjum',
      'Er eitthvað sem inniheldur ekki mjólk?', 'Ég er með selíak', 'Er hætta á krossmengun?', 'Getið þið gert hana mjólkurlausa?', 'eg er med ofnaemi fyrir hnetum'],
    plain: ['Hvenær opnið þið?', 'Hvar eruð þið í dag?', 'Hvað er á matseðlinum?', 'Hvað kostar hamborgari?', 'Takið þið kort?', 'Eruð þið örugglega opin á sunnudag?', 'Er pizzan með osti?'] },
  sr: { safety: ['Da li je pica bez glutena?', 'Alergičan sam na kikiriki', 'alergican sam na orasaste plodove', 'Imam celijakiju', 'Imate li nešto bez laktoze?',
      'Da li ovo ne sadrži jaja?', 'Može li bez mleka?', 'Postoji li rizik od unakrsne kontaminacije?', 'Imate li bezglutensku pizzu?', 'Да ли имате нешто без глутена?', 'Osetljiva sam na gluten'],
    plain: ['Kada radite?', 'Gde ste danas?', 'Šta imate na meniju?', 'Koliko košta pljeskavica?', 'Da li primate kartice?', 'Da li je hrana posna?', 'Da li je burger sa sirom?', 'Koje pice imate bez rezervacije?'] },
}
const CODEX = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'tree nuts', 'sulphites']
let fail = 0
for (const [lang, t] of Object.entries(T)) {
  const w = JSON.parse(fs.readFileSync(path.join(__dirname, lang + '.json'), 'utf8'))
  const shape = w.language === lang && w.normalise === 'unicode' && Array.isArray(w.stems) && Array.isArray(w.tokens) && /languages-world-1 \(10 November 2026\)/.test(w.$comment)
    && JSON.stringify(Object.keys(w.caveatWords.codex)) === JSON.stringify(CODEX)
    && Object.values(w.caveatWords.codex).flat().every(x => x === x.toLowerCase() && x === x.normalize('NFC'))
    && w.stems.every(s => unicodeNorm(s).trim().length >= 2)
  const missed = t.safety.filter(m => !matches(w, m, 'codex')), caught = t.plain.filter(m => matches(w, m, 'codex'))
  const ok = shape && missed.length === 0 && caught.length === 0 && t.safety.length >= 8 && t.plain.length >= 5
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${lang}: ${t.safety.length - missed.length}/${t.safety.length} safety caught, ${t.plain.length - caught.length}/${t.plain.length} plain not caught, shape ${shape ? 'ok' : 'BAD'} (${w.stems.length} stems)`)
  for (const m of missed) console.log('   missed:', m)
  for (const m of caught) console.log('   caught:', m, '←', hit(w, m).join(' | '))
}
process.exit(fail ? 1 : 0)
