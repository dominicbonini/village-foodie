// scripts/europe-languages-1.cjs — THE EUROPEAN LANGUAGES, LEAN CHECKS (europe-languages-1, 22 October 2026,
// docs/europe-languages-1-report.md; the standard per-language checks of docs/i18n/add-a-country.md).
//
// LOCALHOST ONLY: the country rows are PARSED FROM the europe-settings SQL (20261036, already in the live table, switched off)
// with this run's NOT RUN short names (20261037) applied, and switched ON here only. No database, no network. For every
// language registered in lib/i18n/locales.ts (a language not yet built is listed and skipped):
//   1  THE LANGUAGE — a full base (regional variants sparse, over it); translation-check: 0 structural for each locale; the
//      plan names; the order button's statutory wording; the EU 14 allergen labels in the language;
//   2  ITS COUNTRIES SWITCHED ON — /<cc> renders in the language (no en-GB sentence of the page left), og:locale, native prices
//      from the rows' plan_prices, JSON-LD in the currency; hreflang reciprocal across every live and new locale; sitemap;
//   3  THE WHATSAPP GUARD — its safety questions go to the allergen reply, its plain questions do not (Option B);
//   4  NUMBERS — the decimal separator from Intl (de-CH writes a POINT: "27.50", "CHF 27"); typed input follows it;
//   5  THE SQL — the short names are each language's own; switched off, every /<cc> still 302s to /uk.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'europe-languages-1' })
const { REPO } = kit
const EF = require('./_europe-settings-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const text = s => String(s ?? '').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim()
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o ?? {})) { const kk = p ? `${p}.${k}` : k; if (typeof v === 'string') out[kk] = v; else flat(v, kk, out) } return out }
const deep = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b ?? {})) o[k] = v && typeof v === 'object' && o[k] && typeof o[k] === 'object' ? deep(o[k], v) : v; return o }

// ── the languages this run builds ────────────────────────────────────────────────────────────────────────────────
// Each: its locales (base first), the countries it completes as their PRIMARY language, the order button (the statute's words,
// docs/europe-languages-1-report.md §3), plan names, and WhatsApp questions a customer would write.
const LANGS = [
  // admin-countries-1 (23 October 2026): French for LUXEMBOURG — fr-LU, a sparse override of fr-FR. France itself is proved
  // by scripts/france-1.cjs (its row is 20261040, not in europe-settings' SQL); ⚠️ RE-PINNED the same day: Romania's button
  // is now „Comandă ce implică o obligație de plată” (Dominic's wording).
  { lang: 'fr', base: 'fr-FR', countries: { LU: 'fr-LU' }, button: ['Commander avec obligation de paiement', 'Payer {amount}'], plans: { payg: 'Sans abonnement', unlimited: 'Illimité' },
    safety: ['Est-ce sans gluten ?', 'Avez-vous des options sans lactose ?', 'Mon fils est allergique aux noix', 'Je suis allergique aux arachides', 'J’ai une intolérance au lactose', 'Je suis cœliaque', 'Ma fille a un EpiPen', 'Peut-il contenir des traces de sésame ?', 'Est-ce adapté aux personnes allergiques ?', 'Y a-t-il un risque de contamination croisée ?'],
    plain: ['Où êtes-vous aujourd’hui ?', 'Quelles pizzas avez-vous ?', 'À quelle heure fermez-vous ?', 'La Margherita a-t-elle du fromage ?', 'Combien coûte la Margherita ?'] },
  { lang: 'de', base: 'de-DE', countries: { DE: 'de-DE', AT: 'de-AT', CH: 'de-CH', LI: 'de-LI' },
    // europe-languages-2 Stage 0: Germany and Austria — the statute's words and nothing else, so no amount on the card button;
    // Switzerland has no button rule and Liechtenstein writes as Switzerland does, so they keep it.
    button: ['Zahlungspflichtig bestellen', 'Zahlungspflichtig bestellen'], plans: { payg: 'Pay-as-you-go', unlimited: 'Unlimited' },
    buttonBy: { 'de-CH': ['Zahlungspflichtig bestellen', 'Zahlungspflichtig bestellen · {amount}'], 'de-LI': ['Zahlungspflichtig bestellen', 'Zahlungspflichtig bestellen · {amount}'] },
    safety: ['Ist das glutenfrei?', 'Haben Sie laktosefreie Optionen?', 'Mein Sohn hat eine Nussallergie', 'Ich bin allergisch gegen Erdnüsse', 'Ich habe eine Laktoseintoleranz', 'Ich habe Zöliakie', 'Meine Tochter hat einen EpiPen', 'Gibt es Spuren von Sesam?', 'Ist die Pizza ohne Nüsse?', 'Ist das für Allergiker geeignet?', 'Gibt es Kreuzkontamination?', 'Ist das nussfrei? (CH: Nuss)', 'ohne Nuß bitte', 'Ist es sicher für Allergiker?'],
    plain: ['Wo stehen Sie heute?', 'Welche Pizzen haben Sie?', 'Wann schließen Sie?', 'Ist Käse auf der Margherita?', 'Was kostet die Margherita?', 'Sind Sie am Freitag da?'] },
  { lang: 'es', base: 'es-ES', countries: { ES: 'es-ES' }, button: ['Pedido con obligación de pago', 'Pagar {amount}'], plans: { payg: 'Pago por uso', unlimited: 'Ilimitado' },
    safety: ['¿Es sin gluten?', '¿Tenéis opciones sin lactosa?', 'Mi hijo tiene alergia a los frutos secos', 'Soy alérgica al cacahuete', 'Tengo intolerancia a la lactosa', 'Soy celíaco', 'Mi hija lleva un EpiPen', '¿Puede contener trazas de sésamo?', '¿Es apto para celíacos?', '¿Hay contaminación cruzada?'],
    plain: ['¿Dónde estáis hoy?', '¿Qué pizzas tenéis?', '¿A qué hora cerráis?', '¿La Margarita lleva queso?', '¿Cuánto cuesta la Margarita?'] },
  { lang: 'it', base: 'it-IT', countries: { IT: 'it-IT' }, button: ['Ordina con obbligo di pagamento', 'Paga {amount}'], plans: { payg: 'A consumo', unlimited: 'Illimitato' },
    safety: ['È senza glutine?', 'Avete opzioni senza lattosio?', 'Mio figlio ha un’allergia alla frutta a guscio', 'Sono allergica alle arachidi', 'Ho un’intolleranza al lattosio', 'Sono celiaco', 'Mia figlia ha un EpiPen', 'Può contenere tracce di sesamo?', 'È adatto ai celiaci?', 'C’è rischio di contaminazione?'],
    plain: ['Dove siete oggi?', 'Che pizze avete?', 'A che ora chiudete?', 'C’è formaggio sulla Margherita?', 'Quanto costa la Margherita?'] },
  { lang: 'pt', base: 'pt-PT', countries: { PT: 'pt-PT' }, button: ['Encomendar com obrigação de pagar', 'Pagar {amount}'], plans: { payg: 'Sem mensalidade', unlimited: 'Ilimitado' },
    safety: ['É sem glúten?', 'Têm opções sem lactose?', 'O meu filho tem alergia a frutos de casca rija', 'Sou alérgica a amendoim', 'Tenho intolerância à lactose', 'Sou celíaco', 'A minha filha tem uma EpiPen', 'Pode conter vestígios de sésamo?', 'É adequado para celíacos?', 'Há contaminação cruzada?'],
    plain: ['Onde estão hoje?', 'Que pizzas têm?', 'A que horas fecham?', 'A Margherita tem queijo?', 'Quanto custa a Margherita?'] },
  { lang: 'nl', base: 'nl-NL', countries: { NL: 'nl-NL', BE: 'nl-BE' }, button: ['Bestelling met betalingsverplichting', 'Betaal {amount}'], plans: { payg: 'Pay as you go', unlimited: 'Onbeperkt' },
    safety: ['Is dit glutenvrij?', 'Hebben jullie lactosevrije opties?', 'Mijn zoon heeft een notenallergie', 'Ik ben allergisch voor pinda’s', 'Ik heb een lactose-intolerantie', 'Ik heb coeliakie', 'Mijn dochter heeft een EpiPen', 'Kan het sporen van sesam bevatten?', 'Is het geschikt voor coeliakie?', 'Is er kans op kruisbesmetting?'],
    plain: ['Waar staan jullie vandaag?', 'Welke pizza’s hebben jullie?', 'Hoe laat sluiten jullie?', 'Zit er kaas op de Margherita?', 'Wat kost de Margherita?'] },
  { lang: 'sv', base: 'sv-SE', countries: { SE: 'sv-SE' }, button: ['Beställ med betalningsskyldighet', 'Betala {amount}'], plans: { payg: 'Utan månadsavgift', unlimited: 'Obegränsad' },
    safety: ['Är den glutenfri?', 'Har ni laktosfria alternativ?', 'Min son har nötallergi', 'Jag är allergisk mot jordnötter', 'Jag har laktosintolerans', 'Jag har celiaki', 'Min dotter har en EpiPen', 'Kan den innehålla spår av sesam?', 'Passar den för allergiker?', 'Finns det risk för korskontaminering?'],
    plain: ['Var står ni idag?', 'Vilka pizzor har ni?', 'När stänger ni?', 'Är det ost på Margheritan?', 'Vad kostar Margheritan?'] },
  { lang: 'da', base: 'da-DK', countries: { DK: 'da-DK' }, button: ['Bestil med betalingsforpligtelse', 'Betal {amount}'], plans: { payg: 'Uden månedsgebyr', unlimited: 'Ubegrænset' },
    safety: ['Er den glutenfri?', 'Har I laktosefri muligheder?', 'Min søn har nøddeallergi', 'Jeg er allergisk over for jordnødder', 'Jeg har laktoseintolerance', 'Jeg har cøliaki', 'Min datter har en EpiPen', 'Kan den indeholde spor af sesam?', 'Er den egnet til allergikere?', 'Er der risiko for krydskontaminering?'],
    plain: ['Hvor holder I i dag?', 'Hvilke pizzaer har I?', 'Hvornår lukker I?', 'Er der ost på Margheritaen?', 'Hvad koster Margheritaen?'] },
  { lang: 'nb', base: 'nb-NO', countries: { NO: 'nb-NO' }, button: ['Bestill med plikt til å betale', 'Betal {amount}'], plans: { payg: 'Uten månedsavgift', unlimited: 'Ubegrenset' },
    safety: ['Er den glutenfri?', 'Har dere laktosefrie alternativer?', 'Sønnen min har nøtteallergi', 'Jeg er allergisk mot peanøtter', 'Jeg har laktoseintoleranse', 'Jeg har cøliaki', 'Datteren min har en EpiPen', 'Kan den inneholde spor av sesam?', 'Er den egnet for allergikere?', 'Er det fare for krysskontaminering?'],
    plain: ['Hvor står dere i dag?', 'Hvilke pizzaer har dere?', 'Når stenger dere?', 'Er det ost på Margheritaen?', 'Hva koster Margheritaen?'] },
  // ── europe-languages-2 (23 October 2026, docs/europe-languages-2-report.md §3): the button is each statute's phrase (Finland has
  // none — the consumer must expressly accept the obligation to pay; Latvia's and Lithuania's are the Directive's own text in the
  // language); the card button names the amount, as Spain's and Italy's do. Greek covers Greece and Cyprus (el-CY over el-GR).
  { lang: 'pl', base: 'pl-PL', countries: { PL: 'pl-PL' }, button: ['Zamówienie z obowiązkiem zapłaty', 'Zapłać {amount}'], plans: { payg: 'Bez abonamentu', unlimited: 'Bez limitu' },
    safety: ['Czy to jest bezglutenowe?', 'Macie opcje bez laktozy?', 'Mój syn ma alergię na orzechy', 'Mam alergię na orzeszki ziemne', 'Mam nietolerancję laktozy', 'Mam celiakię', 'Córka ma EpiPen', 'Czy może zawierać śladowe ilości sezamu?', 'Czy to jest bezpieczne dla alergików?', 'Czy jest ryzyko zanieczyszczenia krzyżowego?'],
    plain: ['Gdzie dziś stoicie?', 'Jakie macie pizze?', 'O której zamykacie?', 'Czy na Marghericie jest ser?', 'Ile kosztuje Margherita?'] },
  { lang: 'cs', base: 'cs-CZ', countries: { CZ: 'cs-CZ' }, button: ['Objednávka zavazující k platbě', 'Zaplatit {amount}'], plans: { payg: 'Bez měsíčního poplatku', unlimited: 'Neomezený' },
    safety: ['Je to bezlepkové?', 'Máte varianty bez laktózy?', 'Můj syn má alergii na ořechy', 'Jsem alergická na arašídy', 'Mám intoleranci laktózy', 'Mám celiakii', 'Dcera nosí EpiPen', 'Může obsahovat stopy sezamu?', 'Je to vhodné pro alergiky?', 'Hrozí křížová kontaminace?'],
    plain: ['Kde dnes stojíte?', 'Jaké máte pizzy?', 'V kolik zavíráte?', 'Je na Margheritě sýr?', 'Kolik stojí Margherita?'] },
  { lang: 'sk', base: 'sk-SK', countries: { SK: 'sk-SK' }, button: ['Objednávka s povinnosťou platby', 'Zaplatiť {amount}'], plans: { payg: 'Bez mesačného poplatku', unlimited: 'Neobmedzený' },
    safety: ['Je to bezlepkové?', 'Máte možnosti bez laktózy?', 'Môj syn má alergiu na orechy', 'Som alergická na arašidy', 'Mám intoleranciu laktózy', 'Mám celiakiu', 'Dcéra nosí EpiPen', 'Môže obsahovať stopy sezamu?', 'Je to vhodné pre alergikov?', 'Hrozí krížová kontaminácia?'],
    plain: ['Kde dnes stojíte?', 'Aké máte pizze?', 'O koľkej zatvárate?', 'Je na Margherite syr?', 'Koľko stojí Margherita?'] },
  { lang: 'hu', base: 'hu-HU', countries: { HU: 'hu-HU' }, button: ['Fizetési kötelezettséggel járó megrendelés', 'Fizetés: {amount}'], plans: { payg: 'Havidíj nélkül', unlimited: 'Korlátlan' },
    safety: ['Ez gluténmentes?', 'Van laktózmentes választék?', 'A fiam diófélékre allergiás', 'Allergiás vagyok a földimogyoróra', 'Laktózérzékeny vagyok', 'Lisztérzékeny vagyok', 'A lányomnak EpiPenje van', 'Tartalmazhat nyomokban szezámmagot?', 'Allergiásoknak is megfelel?', 'Van keresztszennyeződés veszélye?'],
    plain: ['Hol vagytok ma?', 'Milyen pizzáitok vannak?', 'Mikor zártok?', 'Van sajt a Margheritán?', 'Mennyibe kerül a Margherita?'] },
  { lang: 'ro', base: 'ro-RO', countries: { RO: 'ro-RO' }, button: ['Comandă ce implică o obligație de plată', 'Plătiți {amount}'], plans: { payg: 'Fără abonament', unlimited: 'Nelimitat' },
    safety: ['Este fără gluten?', 'Aveți opțiuni fără lactoză?', 'Fiul meu are alergie la nuci', 'Sunt alergică la arahide', 'Am intoleranță la lactoză', 'Am boala celiacă', 'Fiica mea are un EpiPen', 'Poate conține urme de susan?', 'Este potrivit pentru alergici?', 'Există risc de contaminare încrucișată?'],
    plain: ['Unde sunteți azi?', 'Ce pizza aveți?', 'La ce oră închideți?', 'Margherita are brânză?', 'Cât costă Margherita?'] },
  { lang: 'hr', base: 'hr-HR', countries: { HR: 'hr-HR' }, button: ['Narudžba s obvezom plaćanja', 'Platite {amount}'], plans: { payg: 'Bez mjesečne pretplate', unlimited: 'Neograničeno' },
    safety: ['Je li ovo bez glutena?', 'Imate li opcije bez laktoze?', 'Moj sin je alergičan na orašaste plodove', 'Alergična sam na kikiriki', 'Imam intoleranciju na laktozu', 'Imam celijakiju', 'Kći ima EpiPen', 'Može li sadržavati tragove sezama?', 'Je li prikladno za alergičare?', 'Postoji li rizik od unakrsne kontaminacije?'],
    plain: ['Gdje ste danas?', 'Koje pizze imate?', 'Kad zatvarate?', 'Ima li sira na Margheriti?', 'Koliko košta Margherita?'] },
  { lang: 'sl', base: 'sl-SI', countries: { SI: 'sl-SI' }, button: ['Naročilo z obveznostjo plačila', 'Plačajte {amount}'], plans: { payg: 'Brez mesečne naročnine', unlimited: 'Neomejeno' },
    safety: ['Je to brez glutena?', 'Imate možnosti brez laktoze?', 'Moj sin je alergičen na oreščke', 'Alergična sem na arašide', 'Imam laktozno intoleranco', 'Imam celiakijo', 'Hči ima EpiPen', 'Lahko vsebuje sledi sezama?', 'Je primerno za alergike?', 'Obstaja nevarnost navzkrižne kontaminacije?'],
    plain: ['Kje ste danes?', 'Katere pice imate?', 'Kdaj zaprete?', 'Je na Margheriti sir?', 'Koliko stane Margherita?'] },
  { lang: 'fi', base: 'fi-FI', countries: { FI: 'fi-FI' }, button: ['Tilaa ja sitoudu maksamaan', 'Maksa {amount}'], plans: { payg: 'Ilman kuukausimaksua', unlimited: 'Rajaton' },
    safety: ['Onko tämä gluteeniton?', 'Onko teillä laktoosittomia vaihtoehtoja?', 'Pojallani on pähkinäallergia', 'Olen allerginen maapähkinälle', 'Minulla on laktoosi-intoleranssi', 'Minulla on keliakia', 'Tyttärelläni on EpiPen', 'Voiko siinä olla seesamin jäämiä?', 'Sopiiko tämä allergiselle?', 'Onko ristikontaminaation riskiä?'],
    plain: ['Missä olette tänään?', 'Mitä pizzoja teillä on?', 'Milloin suljette?', 'Onko Margheritassa juustoa?', 'Paljonko Margherita maksaa?'] },
  { lang: 'et', base: 'et-EE', countries: { EE: 'et-EE' }, button: ['Tellimus koos maksekohustusega', 'Maksa {amount}'], plans: { payg: 'Kuutasuta', unlimited: 'Piiramatu' },
    safety: ['Kas see on gluteenivaba?', 'Kas teil on laktoosivabu valikuid?', 'Mu pojal on pähkliallergia', 'Olen maapähklite suhtes allergiline', 'Mul on laktoositalumatus', 'Mul on tsöliaakia', 'Mu tütrel on EpiPen', 'Kas see võib sisaldada seesami jälgi?', 'Kas see sobib allergikule?', 'Kas on ristsaastumise oht?'],
    plain: ['Kus te täna olete?', 'Milliseid pitsasid teil on?', 'Mis kell te sulgete?', 'Kas Margherital on juustu?', 'Kui palju Margherita maksab?'] },
  { lang: 'lv', base: 'lv-LV', countries: { LV: 'lv-LV' }, button: ['Pasūtījums ar pienākumu maksāt', 'Maksāt {amount}'], plans: { payg: 'Bez ikmēneša maksas', unlimited: 'Neierobežots' },
    safety: ['Vai tas ir bez glutēna?', 'Vai jums ir varianti bez laktozes?', 'Manam dēlam ir alerģija pret riekstiem', 'Man ir alerģija pret zemesriekstiem', 'Man ir laktozes nepanesība', 'Man ir celiakija', 'Manai meitai ir EpiPen', 'Vai tas var saturēt sezama pēdas?', 'Vai tas der alerģiskiem cilvēkiem?', 'Vai ir savstarpējas piesārņošanas risks?'],
    plain: ['Kur jūs šodien esat?', 'Kādas picas jums ir?', 'Cikos jūs slēdzat?', 'Vai uz Margheritas ir siers?', 'Cik maksā Margherita?'] },
  { lang: 'lt', base: 'lt-LT', countries: { LT: 'lt-LT' }, button: ['Užsakymas su mokėjimo pareiga', 'Mokėti {amount}'], plans: { payg: 'Be mėnesinio mokesčio', unlimited: 'Neribotas' },
    safety: ['Ar tai be glitimo?', 'Ar turite variantų be laktozės?', 'Mano sūnus alergiškas riešutams', 'Esu alergiška žemės riešutams', 'Netoleruoju laktozės', 'Sergu celiakija', 'Dukra turi EpiPen', 'Ar gali būti sezamo pėdsakų?', 'Ar tinka alergiškiems?', 'Ar yra kryžminio užteršimo rizika?'],
    plain: ['Kur šiandien esate?', 'Kokias picas turite?', 'Kada uždarote?', 'Ar ant Margheritos yra sūrio?', 'Kiek kainuoja Margherita?'] },
  { lang: 'el', base: 'el-GR', countries: { GR: 'el-GR', CY: 'el-CY' }, button: ['Παραγγελία με υποχρέωση πληρωμής', 'Πληρωμή {amount}'], plans: { payg: 'Χωρίς μηνιαία συνδρομή', unlimited: 'Απεριόριστο' },
    safety: ['Είναι χωρίς γλουτένη;', 'Έχετε επιλογές χωρίς λακτόζη;', 'Ο γιος μου έχει αλλεργία στους ξηρούς καρπούς', 'Είμαι αλλεργική στα φιστίκια', 'Έχω δυσανεξία στη λακτόζη', 'Έχω κοιλιοκάκη', 'Η κόρη μου έχει EpiPen', 'Μπορεί να περιέχει ίχνη σουσαμιού;', 'Είναι κατάλληλο για αλλεργικούς;', 'Υπάρχει κίνδυνος διασταυρούμενης επιμόλυνσης;'],
    plain: ['Πού είστε σήμερα;', 'Τι πίτσες έχετε;', 'Τι ώρα κλείνετε;', 'Έχει τυρί η Μαργαρίτα;', 'Πόσο κοστίζει η Μαργαρίτα;'] },
  { lang: 'bg', base: 'bg-BG', countries: { BG: 'bg-BG' }, button: ['Поръчка със задължение за плащане', 'Плащане {amount}'], plans: { payg: 'Без месечна такса', unlimited: 'Неограничен' },
    safety: ['Това без глутен ли е?', 'Имате ли варианти без лактоза?', 'Синът ми е алергичен към ядки', 'Алергична съм към фъстъци', 'Имам непоносимост към лактоза', 'Имам цьолиакия', 'Дъщеря ми носи EpiPen', 'Може ли да съдържа следи от сусам?', 'Подходящо ли е за алергични?', 'Има ли риск от кръстосано замърсяване?'],
    plain: ['Къде сте днес?', 'Какви пици имате?', 'В колко затваряте?', 'Има ли сирене на Маргаритата?', 'Колко струва Маргаритата?'] },
]
const LOC = read('lib/i18n/locales.ts')
const LOCALES = JSON.parse('[' + /export const LOCALES = \[([^\]]*)\]/.exec(LOC)[1].replace(/'/g, '"') + ']')
const BASES = JSON.parse('[' + /export const LANGUAGE_BASES: readonly AppLocale\[\] = \[([^\]]*)\]/.exec(LOC)[1].replace(/'/g, '"') + ']')
const PARENT = Object.fromEntries([.../export const LOCALE_PARENT[^=]*=\s*\{([^}]*)\}/.exec(LOC)[1].matchAll(/'([a-z]{2}-[A-Z]{2})':\s*'([a-z]{2}-[A-Z]{2})'/g)].map(m => [m[1], m[2]]))
const chain = l => { const c = []; for (let x = l; x && x !== 'en-GB'; x = PARENT[x]) c.unshift(x); return c }
const EN = JSON.parse(read('messages/en-GB.json'))
const messagesOf = l => chain(l).reduce((acc, x) => deep(acc, JSON.parse(read(`messages/${x}.json`))), EN)
const BUILT = LANGS.filter(L => LOCALES.includes(L.base) && Object.values(L.countries).every(l => LOCALES.includes(l)))

// ── the rows: europe-settings' SQL, this run's short names, the built languages' countries switched ON ─────────────────
// europe-languages-2: + 20261038 (the thirteen languages after it, also NOT RUN when written).
const SHORT_SQL = ['supabase/migrations/20261037_europe_language_short_names.sql', 'supabase/migrations/20261038_europe_language_short_names_2.sql']
const SHORT = Object.fromEntries(SHORT_SQL.flatMap(f => [...read(f).matchAll(/set short_name = '([^']+)'\s+where country_code = '([A-Z]{2})'/g)].map(m => [m[2], m[1]])))
const ON = BUILT.flatMap(L => Object.keys(L.countries))
const rowsWith = on => EF.rowsWith(on).map(r => (SHORT[r.countryCode] ? { ...r, shortName: SHORT[r.countryCode] } : r))
const SEG = Object.fromEntries([...read('lib/marketing-country.ts').matchAll(/\b([A-Z]{2}): '([a-z]{2})'/g)].map(m => [m[1], m[2]]))

;(async () => {
  console.log(`europe-languages-1 — built: ${BUILT.map(L => L.base).join(', ') || 'none'}; not built yet: ${LANGS.filter(L => !BUILT.includes(L)).map(L => L.base).join(', ') || 'none'}`)
  const R = EF.renderer(kit, 'el1')
  const rowsOn = rowsWith(ON), rowsOff = rowsWith([])

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · THE LANGUAGES — bases and variants, translation-check, plan names, the order button, the EU 14 in the language')
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const bundle = entry => { const b = esbuild.buildSync({ entryPoints: [path.join(REPO, entry)], bundle: true, write: false, platform: 'node', format: 'cjs', alias: { '@': REPO }, logLevel: 'silent' }); const m = { exports: {} }; new Function('module', 'exports', 'require', b.outputFiles[0].text)(m, m.exports, require); return m.exports }
  const AL = await kit.bundle('el1-allergens', "export { allergenLabel } from '@/lib/allergen-label'\nexport * from '@/lib/allergens'")
  const UK14 = AL.allergenVocab('uk14')
  for (const L of BUILT) {
    const locs = [...new Set([L.base, ...Object.values(L.countries)])]
    t(`${L.base}: a full base (LANGUAGE_BASES); ${locs.filter(l => l !== L.base).map(l => `${l} over ${PARENT[l]}`).join(', ') || 'no regional variant'}`,
      BASES.includes(L.base) && locs.filter(l => l !== L.base).every(l => chain(l)[0] === L.base))
    for (const l of locs) {
      const r = spawnSync(process.execPath, ['scripts/translation-check.cjs', '--locale', l], { cwd: REPO, encoding: 'utf8' })
      t(`${l}: translation-check — 0 structural`, r.status === 0 && /\*\*Structural: 0\*\*/.test(r.stdout), r.stdout.slice(-400))
      const M = messagesOf(l)
      const button = L.buttonBy?.[l] ?? L.button
      t(`${l}: the order button says ordering means paying: "${M.order.placeOrder}" / "${M.order.payAmount}"`, M.order.placeOrder === button[0] && M.order.payAmount === button[1], [M.order.placeOrder, M.order.payAmount])
      // The demo's five-step bar has no room to wrap: German's "Kücheneinstellungen" pushed it 80px past a 390px screen (e2e).
      const steps = Object.values(M.demoGetStarted.stepper).join(''), enSteps = Object.values(EN.demoGetStarted.stepper).join('')
      t(`${l}: the demo's five-step bar is no longer than English's (${steps.length} ≤ ${enSteps.length} characters)`, steps.length <= enSteps.length, M.demoGetStarted.stepper)
    }
    const B = messagesOf(L.base)
    t(`${L.base}: plan names — "${B.planNames?.payg?.name}", Pro, "${B.planNames?.unlimited?.name}"; Pro has no name of its own`, B.planNames?.payg?.name === L.plans.payg && B.planNames?.unlimited?.name === L.plans.unlimited && !B.planNames?.pro?.name && !!B.planNames?.pro?.description)
    const labels = UK14.map(a => AL.allergenLabel(a, L.base))
    t(`${L.base}: the EU 14 shown in the language (${labels.join(', ')})`, labels.filter((x, i) => x !== UK14[i]).length >= 10 && labels.every((x, i) => x === (B.menuBadges.allergen[UK14[i].replace(/[^A-Za-z]/g, '')] ?? UK14[i])), labels)
    t(`${L.base}: "hatch" appears nowhere; HatchGrab and Pro kept`, !Object.values(flat(B)).some(v => /\bhatch\b/i.test(v)))
  }
  t('every English locale shows the stored allergen label (nothing looked up)', ['en-GB', 'en-US', 'en-IE', 'en-AU', 'en-NZ', 'en-CA'].every(l => UK14.every(a => AL.allergenLabel(a, l) === a)))

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · COUNTRIES SWITCHED ON (fixture) — the landing page in the language, native prices, hreflang, sitemap')
  // europe-languages-2: prices are the APP's money formatter (lib/money-format.ts), not raw Intl — the registry overrides Intl
  // where a country writes its currency differently (RON's "lei", never ro-RO Intl's "RON"; HUF's two card-processor decimals).
  const MF = await kit.bundle('el1-money', "export * from '@/lib/money-format'")
  const pp = Object.fromEntries(EF.sqlRows().prices.map(p => [`${p.country_code}|${p.plan_key}`, p]))
  const ldOf = html => { const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html || ''); return m ? JSON.parse(m[1]) : null }
  const langsOf = m => Object.fromEntries(Object.entries(m?.alternates?.languages || {}).map(([k, v]) => [k, String(v).replace('https://www.hatchgrab.com', '')]))
  const pages = {}
  for (const L of BUILT) for (const [cc, l] of Object.entries(L.countries)) {
    const row = rowsOn.find(r => r.countryCode === cc), seg = SEG[cc]
    const P = await R.page('landing', seg, rowsOn); pages[cc] = P
    const tx = text(P.html), M = flat(messagesOf(l))
    // "No English left": no en-GB sentence of the page's own namespaces (where the language's words differ) is on the page.
    const leftovers = Object.entries(flat(EN)).filter(([k, v]) => /^(landing|landingNav|landingFooter|pricing|planTable|siteFooter)\./.test(k) && v.length >= 14 && !/[{<]/.test(v) && M[k] !== v && tx.includes(v)).map(([k]) => k)
    const fmt = minor => MF.formatWholeAmount(minor, { currency: row.currency, locale: row.locale }).replace(/[  ]/g, ' ')
    const pro = fmt(pp[`${cc}|pro`].monthly_minor), unl = fmt(pp[`${cc}|unlimited`].monthly_minor)
    t(`/${seg} (${cc}, ${l}): renders in the language («${M['landingNav.logIn']}»), no en-GB sentence left, prices ${pro} / ${unl} from the rows`,
      !!P.html && !P.redirectedTo && tx.includes(M['landingNav.logIn']) && leftovers.length === 0 && tx.includes(pro) && tx.includes(unl), { redirect: P.redirectedTo, leftovers: leftovers.slice(0, 8), seen: tx.match(/(CHF|kr\.?|€)\s?\d[\d.,']*|\d[\d.,' ]*\s?(€|kr\.?)/g)?.slice(0, 8) })
    const app = (ldOf(P.html)?.['@graph'] || []).find(n => n['@type'] === 'SoftwareApplication')
    t(`/${seg}: og:locale ${l.replace('-', '_')}, canonical /${seg}, JSON-LD offers in ${row.currency}, inLanguage ${l}`,
      P.meta?.openGraph?.locale === l.replace('-', '_') && P.meta?.alternates?.canonical === `https://www.hatchgrab.com/${seg}` && app?.offers?.every(o => o.priceCurrency === row.currency) && JSON.stringify(ldOf(P.html)).includes(`"inLanguage":"${l}"`), [P.meta?.openGraph?.locale, app?.offers?.map(o => o.priceCurrency)])
    // A currency whose symbol is shared ("kr") gets one line naming it — in the page's language, never the registry's English
    // name ("Swedish kronor"); the frame is the language's pricing.currencyLine with Intl's name for the currency.
    const enName = { SEK: 'Swedish kronor', DKK: 'Danish kroner', NOK: 'Norwegian kroner' }[row.currency]
    if (enName) t(`/${seg}: the currency line in the language ("${M['pricing.currencyLine'].replace('{currency}', new Intl.DisplayNames([l], { type: 'currency' }).of(row.currency)).replace('{code}', row.currency)}"), not "${enName}"`,
      !tx.includes(enName) && tx.includes(M['pricing.currencyLine'].replace('{currency}', new Intl.DisplayNames([l], { type: 'currency' }).of(row.currency)).replace('{code}', row.currency)))
    t(`/${seg}: the short name is the language's own ("${row.shortName}") in the title`, String(P.meta?.title?.absolute ?? P.meta?.title ?? '').includes(row.shortName), P.meta?.title)
  }
  // hreflang: every live locale and every new one, the same set on /uk and on each new page
  const uk = await R.page('landing', 'uk', rowsOn)
  const want = { 'en-GB': '/uk', 'en-US': '/us', 'en-IE': '/ie', 'en-AU': '/au', 'en-NZ': '/nz', 'en-CA': '/ca', 'x-default': '/' }
  for (const L of BUILT) for (const [cc, l] of Object.entries(L.countries)) want[l] = `/${SEG[cc]}`
  const sorted = o => JSON.stringify(Object.entries(o).sort())
  t(`hreflang reciprocal: /uk and all ${ON.length} new pages list the same ${Object.keys(want).length} alternates (the live six, x-default and ${ON.length} new)`,
    [uk, ...Object.values(pages)].every(p => sorted(langsOf(p.meta)) === sorted(want)), { uk: langsOf(uk.meta) })
  const sm = await R.sitemap(rowsOn)
  t(`sitemap: every new page listed with its own locale among the alternates`, ON.every(cc => sm.some(e => e.url === `https://www.hatchgrab.com/${SEG[cc]}` && e.alternates?.languages?.[rowsOn.find(r => r.countryCode === cc).locale] === `https://www.hatchgrab.com/${SEG[cc]}`)))
  // switched off (the live state today)
  const offPages = await Promise.all(ON.map(cc => R.page('landing', SEG[cc], rowsOff)))
  const smOff = await R.sitemap(rowsOff)
  t(`switched off (as the database is today): every new /<cc> redirects to /uk, and none is in the sitemap or /uk's hreflang`,
    offPages.every(p => /\/uk/.test(String(p.redirectedTo))) && !ON.some(cc => smOff.some(e => e.url === `https://www.hatchgrab.com/${SEG[cc]}`)), offPages.map(p => p.redirectedTo))

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · THE WHATSAPP GUARD — each language\'s safety questions caught, plain questions answered (Option B)')
  const G = bundle('lib/allergen-guard.ts')
  for (const L of BUILT) {
    const w = G.guardWordsFor(L.base)
    t(`${L.lang}: lib/allergen-guard/${L.lang}.json is in GUARD_WORDS (Unicode normaliser)`, !!w && w.language === L.lang && w.normalise === 'unicode' && G.hasGuardWords(L.base))
    const missed = L.safety.filter(m => !G.mentionsAllergen(m, 'uk14', L.base)), caught = L.plain.filter(m => G.mentionsAllergen(m, 'uk14', L.base))
    t(`${L.lang}: ${L.safety.length} safety questions go to the allergen reply`, missed.length === 0, missed)
    t(`${L.lang}: ${L.plain.length} plain questions do not (a presence question reaches the AI, which answers from the tags)`, caught.length === 0, caught)
    t(`${L.lang}: a tagged Dairy dish triggers the caveat on the language's own dairy words`, (w.caveatWords?.uk14?.dairy ?? []).length >= 3 && [...G.caveatTriggerWords(['Dairy'], 'uk14', L.base)].length > 1)
  }
  t('English is unchanged: "is it gluten free?" caught in en-GB, a German question is not matched by the English list', G.mentionsAllergen('is it gluten free?', 'uk14', 'en-GB') && !G.mentionsAllergen('Wo stehen Sie heute?', 'uk14', 'en-GB'))
  const W = await kit.bundle('el1-wa', "export { generateWhatsAppReply } from '@/lib/whatsapp-classifier'")
  let aiCalls = 0
  const realFetch = globalThis.fetch
  globalThis.fetch = async u => { if (String(u).includes('generativelanguage')) aiCalls++; throw new Error('no network in this harness') }
  try {
    for (const L of BUILT) {
      const row = rowsOn.find(r => r.countryCode === Object.keys(L.countries)[0])
      globalThis.__harnessDb = kit.fakeDb({ menu_items_db: [{ truck_id: 't1', name: 'Margherita', category_id: 'c1', price: 12, is_available: true, is_active: true, allergens: ['Dairy', 'Gluten'], dietary_info: [], menu_categories: { name: 'Pizza' } }] })
      const time = { timeZone: row.defaultTimezone, locale: row.locale, timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
      const wbase = { money: { currency: row.currency, locale: row.locale }, allergenSet: 'uk14', truckName: 'Pizza Kitchen', truckEmoji: '🍕', truckId: 't1', events: [], scheduleUrl: 'https://x/o', orderUrl: 'https://x/o', isFollowUp: false, time }
      const before = aiCalls
      const a = await kit.quietAsync(() => W.generateWhatsAppReply({ ...wbase, customerMessage: L.safety[0] }))
      const mid = aiCalls
      const p = await kit.quietAsync(() => W.generateWhatsAppReply({ ...wbase, customerMessage: L.plain[1] }))
      const M = flat(messagesOf(L.base))
      const allergenReply = Object.entries(M).filter(([k]) => /^whatsappCustomer\./.test(k) && /allerg/i.test(k)).map(([, v]) => v.replace(/\{[^}]*\}/g, '').slice(0, 25))
      t(`${L.lang}: WhatsApp, "${L.safety[0]}" → the fixed allergen reply in the language, never the AI's menu answer`, mid - before <= 1 && allergenReply.some(s => (a.reply ?? '').includes(s.trim())), { reply: a.reply, calls: mid - before })
      const price = MF.formatMajor(12, { currency: row.currency, locale: row.locale }).replace(/[  ]/g, ' ')
      t(`${L.lang}: WhatsApp, "${L.plain[1]}" → answered on the menu path (classifier and menu AI asked; offline here, so the summary with ${price}), not the allergen reply`,
        aiCalls - mid === 2 && String(p.reply ?? '').replace(/[  ]/g, ' ').includes(price), { reply: p.reply, calls: aiCalls - mid })
    }
  } finally { globalThis.fetch = realFetch; delete globalThis.__harnessDb }

  // ══ 4 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · NUMBERS — the separator from Intl; Swiss German writes a point')
  const D = await kit.bundle('el1-decimal', "export * from '@/lib/decimal-input'")
  for (const L of BUILT) for (const l of new Set([L.base, ...Object.values(L.countries)])) {
    const row = rowsOn.find(r => r.locale === l) ?? { currency: 'EUR' }
    const comma = new Intl.NumberFormat(l).formatToParts(1.5).find(p => p.type === 'decimal').value === ','
    const ok = comma ? D.usesDecimalComma(l) && D.normaliseDecimal('27,50', l) === '27.50' && D.decimalForInput(27.5, l) === '27,5'
      : !D.usesDecimalComma(l) && D.normaliseDecimal('27.50', l) === '27.50' && D.decimalForInput(27.5, l) === '27.5'
    t(`${l}: decimal ${comma ? 'COMMA ("27,50" typed → 27.50)' : 'POINT ("27.50" typed as is)'}; ${MF.formatAmount(2750, { currency: row.currency, locale: l })} · ${MF.formatWholeAmount(2700, { currency: row.currency, locale: l })}`, ok)
  }
  if (BUILT.some(L => L.base === 'de-DE')) {
    const ch = MF.formatAmount(2750, { currency: 'CHF', locale: 'de-CH' }).replace(/[  ]/g, ' '), chW = MF.formatWholeAmount(2700, { currency: 'CHF', locale: 'de-CH' }).replace(/[  ]/g, ' ')
    t(`de-CH and de-LI: "${ch}" and "${chW}" — the Swiss form; typed "27.50" kept, never read as 2750`, ch === 'CHF 27.50' && chW === 'CHF 27' && !D.usesDecimalComma('de-CH') && !D.usesDecimalComma('de-LI'), [ch, chW])
    const CH = flat(messagesOf('de-CH'))
    t('de-CH: no "ß" anywhere (Swiss "ss"); the decimal examples written with a point ("3.5", "0.50"); "Rappen", not "Cent"', !Object.values(CH).some(v => /ß/.test(v)) && /3\.5/.test(CH['errorsManage.charges_fee_pct']) && /0\.50/.test(CH['errorsManage.charges_fee_fixed']) && /Rappen/.test(CH['compare.fee.fixedAria']))
    t('de-AT: only Austrian words differ ("gratis testen", "ohne Anstellen", "USt.", the +43 phone example); months ("Jänner") are Intl\'s', JSON.stringify(Object.keys(flat(JSON.parse(read('messages/de-AT.json')))).sort()) === JSON.stringify(['compare.orders.captionNo', 'landing.meta.description', 'manageTeam.phonePlaceholder', 'orderCard.chargesSummary', 'pricing.card.tryFree']) && new Intl.DateTimeFormat('de-AT', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 1))) === 'Jänner')
    // europe-languages-2 Stage 0: one key of its own — the team form's phone example in Liechtenstein's +423.
    t('de-LI: Liechtenstein writes as Switzerland does — only its phone example (+423) differs', JSON.stringify(flat(JSON.parse(read('messages/de-LI.json')))) === JSON.stringify({ 'manageTeam.phonePlaceholder': '+423 660 234 567' }))
  }

  // ══ 5 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · THE NOT RUN SQL — short names in each language; switched off')
  for (const f of SHORT_SQL) {
    const sql = read(f)
    t(`${f.replace(/^.*\/(\d+)_.*$/, '$1')}: one begin/commit, only short_name updates, each guarded by enabled = false; the language's own name for each built country`,
      (sql.match(/\bbegin;/g) || []).length === 1 && (sql.match(/\bcommit;/g) || []).length === 1 && !/\b(insert|delete|alter|drop)\b/i.test(sql.replace(/--[^\n]*/g, ''))
      && [...sql.matchAll(/^update [^\n]+$/gm)].every(m => /set short_name = '[^']+'\s+where country_code = '[A-Z]{2}' and enabled = false;$/.test(m[0])) && ON.filter(cc => cc !== 'LU').every(cc => !!SHORT[cc]), SHORT)   // LU: "Luxembourg" is already its French name
  }

  console.log(`\n${fail ? '🔴' : '✅'} europe-languages-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
