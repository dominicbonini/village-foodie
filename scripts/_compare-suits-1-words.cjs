// scripts/_compare-suits-1-words.cjs — compare-suits-1 (6 November 2026): each language's words for what the "Which suits your food
// truck?" section must never name — card readers, card machines, tills / cash registers, payment terminals, point of sale. A MODULE
// (scripts/compare-suits-1.cjs reads it); the translators of the section supplied their language's words. A word is matched at the
// START of a word (so a listed stem catches its inflections); a word of five letters or fewer only as a WHOLE word ("pos" must not
// match "Posten" or "risposte"). Japanese, Chinese and Thai write no spaces between words, so a word in their own script is matched
// anywhere (NO_SPACES below).
'use strict'
/** Scripts without spaces between words: a word in them is matched anywhere. */
const NO_SPACES = /[\u3040-\u30ff\u3400-\u9fff\u0e00-\u0e7f]/
module.exports = {
  'en-GB': ['card reader', 'card machine', 'till', 'cash register', 'payment terminal', 'card terminal', 'point of sale', 'pos', 'offline card'],
  'de-DE': ['kartenlesegerät', 'kartenleser', 'kartengerät', 'ec-gerät', 'kasse', 'registrierkasse', 'kassensystem', 'kartenterminal', 'zahlungsterminal', 'bezahlterminal', 'pos', 'point of sale'],
  'fr-FR': ['lecteur de carte', 'tpe', 'caisse', 'caisse enregistreuse', 'logiciel de caisse', 'terminal de paiement', 'point de vente', 'terminal de point de vente'],
  'es-ES': ['lector de tarjetas', 'datáfono', 'caja registradora', 'tpv', 'terminal de pago', 'punto de venta'],
  'it-IT': ['lettore di carte', 'pos', 'cassa', 'registratore di cassa', 'terminale di pagamento', 'punto vendita', 'punto di vendita'],
  'pt-PT': ['leitor de cartões', 'tpa', 'multibanco', 'caixa', 'caixa registadora', 'terminal de pagamento', 'pos', 'ponto de venda'],
  'pt-BR': ['maquininha', 'leitor de cartão', 'caixa', 'caixa registradora', 'terminal de pagamento', 'pdv', 'pos', 'ponto de venda'],
  'nl-NL': ['kaartlezer', 'pinapparaat', 'pinautomaat', 'kassa', 'kassasysteem', 'betaalterminal', 'pos', 'point of sale'],
  'sv-SE': ['kortläsare', 'kortterminal', 'kortautomat', 'kassaapparat', 'kassa', 'betalterminal', 'betalningsterminal', 'kassasystem', 'försäljningsställe'],
  'da-DK': ['kortlæser', 'kortterminal', 'kortautomat', 'kasseapparat', 'betalingsterminal', 'kassesystem', 'salgssted'],
  'nb-NO': ['kortleser', 'kortterminal', 'kortautomat', 'kasseapparat', 'betalingsterminal', 'kassesystem', 'salgssted'],
  'fi-FI': ['kortinlukija', 'korttipääte', 'korttimaksupääte', 'kassakone', 'kassa', 'maksupääte', 'kassajärjestelmä', 'myyntipiste'],
  'et-EE': ['kaardilugeja', 'kaarditerminal', 'kaardimakseterminal', 'kassaaparaat', 'kassa', 'makseterminal', 'kassasüsteem', 'müügikoht'],
  'lv-LV': ['karšu lasītāj', 'karšu termināl', 'kases aparāt', 'maksājumu termināl', 'kases sistēm', 'tirdzniecības punkt'],
  'lt-LT': ['kortelių skaitytuv', 'kortelių terminal', 'kasos aparat', 'mokėjimo terminal', 'kasos sistem', 'pardavimo viet'],
  'pl-PL': ['czytnik kart', 'terminal kartowy', 'kasa fiskalna', 'kasa rejestrująca', 'terminal płatniczy', 'system pos', 'punkt sprzedaży'],
  'cs-CZ': ['čtečka karet', 'karetní terminál', 'pokladna', 'registrační pokladna', 'platební terminál', 'pokladní systém', 'prodejní místo'],
  'sk-SK': ['čítačka kariet', 'kartový terminál', 'pokladnica', 'registračná pokladnica', 'platobný terminál', 'pokladničný systém', 'predajné miesto'],
  'hu-HU': ['kártyaolvasó', 'kártyaterminál', 'bankkártya-terminál', 'pénztárgép', 'fizetési terminál', 'pos rendszer', 'értékesítési pont'],
  'ro-RO': ['cititor de carduri', 'aparat de card', 'casă de marcat', 'terminal de plată', 'sistem pos', 'punct de vânzare'],
  'hr-HR': ['čitač kartica', 'kartični terminal', 'blagajna', 'registarska blagajna', 'terminal za plaćanje', 'pos uređaj', 'pos sustav', 'prodajno mjesto'],
  'sl-SI': ['čitalnik kartic', 'kartični terminal', 'blagajna', 'registrska blagajna', 'plačilni terminal', 'pos sistem', 'prodajno mesto'],
  'el-GR': ['τερματικό πληρωμών', 'συσκευή ανάγνωσης καρτών', 'μηχάνημα καρτών', 'pos', 'ταμειακή μηχανή', 'ταμείο', 'σημείο πώλησης'],
  'bg-BG': ['пос терминал', 'четец на карти', 'картов терминал', 'машина за карти', 'касов апарат', 'каса', 'платежен терминал', 'пос система', 'точка на продажба'],
  'ms-MY': ['terminal kad', 'pembaca kad', 'mesin kad', 'mesin daftar tunai', 'mesin juruwang', 'kaunter juruwang', 'terminal pembayaran', 'titik jualan', 'pos'],
  'ja-JP': ['カード決済端末', 'カードリーダー', 'カード端末', '決済端末', 'レジ', 'キャッシュレジスター', '端末', 'posレジ', 'pos', '販売時点'],
  'zh-HK': ['信用卡機', '讀卡器', '刷卡機', '收銀機', '收銀台', '付款終端', '支付終端', '終端機', 'pos', '銷售點'],
  'th-TH': ['เครื่องรูดบัตร', 'เครื่องอ่านบัตร', 'เครื่องรับบัตร', 'เครื่อง edc', 'เครื่องคิดเงิน', 'แคชเชียร์', 'ลิ้นชักเก็บเงิน', 'เครื่องรับชำระเงิน', 'เทอร์มินัลชำระเงิน', 'ระบบ pos', 'pos', 'จุดขายหน้าร้าน'],
  'ar-AE': ['جهاز الدفع', 'قارئ البطاقات', 'جهاز البطاقات', 'ماكينة البطاقات', 'آلة تسجيل النقد', 'ماكينة الكاشير', 'الكاشير', 'صندوق النقد', 'محطة الدفع', 'نقاط البيع', 'نقطة البيع', 'pos'],
}
module.exports.NO_SPACES = NO_SPACES
