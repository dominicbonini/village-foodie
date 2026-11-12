// lib/region-blocks.ts — world-countries-5 (12 November 2026, docs/world-countries-5-report.md §3): THE REGIONS HATCHGRAB IS NOT
// AVAILABLE IN, inside a country that is otherwise open. One list, as data, read by lib/trade-area.ts `checkTradeArea` — which
// signup (/api/setup and the signup step itself), provisioning and Manage › Where you trade all run — so a truck can neither
// sign up nor move its base into one. The refusal is `tradeArea.region_blocked`: "Sorry, HatchGrab isn’t available in your
// region yet." (Dominic's approved wording), in every language.
//
// HOW A TOWN IS MATCHED (pure, client-safe; names compared after `norm` below — accents and case dropped, any non-letter run
// one space):
//   • `regionStems`: a stem found inside the PICKED place's top-level region name (Places `administrative_area_level_1`, kept
//     as base_region — the shared 'intl' address format keeps it since world-countries-5). Places names a region in the
//     visitor's language, so the stems cover the English, local and neighbouring-language spellings.
//   • `regionCodes`: the picked place's region code, for a format that keeps one (Canada: "SK").
//   • `towns`: the town's own name — its first comma-separated part, the whole of it — for the region's main towns. This
//     also catches a TYPED town (no suggestion picked, so no region), and is how South Ossetia is refused: Places files its
//     towns under Georgia's own regions (Shida Kartli, Mtskheta-Mtianeti, Imereti, Racha-Lechkhumi), so no region name
//     identifies it.
// A town typed by hand that is not on its `towns` list is not caught — the region name is only known from a picked place.

export interface RegionBlock {
  /** ISO 3166-1 alpha-2 of the country it sits in. */
  country: string
  /** ISO 3166-2 code(s) of what is blocked (for the report and Admin; not matched on). */
  iso: string
  /** English name, for the report and logs. */
  name: string
  regionStems?: readonly string[]
  regionCodes?: readonly string[]
  towns?: readonly string[]
}

export const REGION_BLOCKS: readonly RegionBlock[] = [
  // ── Ukraine: Crimea and Sevastopol, all of Luhansk, and the oblasts with occupied parts — Donetsk, Zaporizhzhia and Kherson
  //    (Dominic: "block those oblasts", whole). Europe/Simferopol is also left out of Ukraine's time zones (the rows migration).
  { country: 'UA', iso: 'UA-43', name: 'Crimea',
    regionStems: ['crimea', 'crimee', 'krim', 'krym', 'qirim', 'kirim', 'kırım', 'крим', 'крым', 'クリミア', '克里米亚', '克里米亞', 'القرم', 'קרים', 'ყირიმ', '크림'],
    towns: ['simferopol', 'yalta', 'kerch', 'feodosia', 'feodosiya', 'yevpatoria', 'evpatoria', 'yevpatoriya', 'dzhankoi', 'dzhankoy', 'alushta', 'bakhchysarai', 'bakhchisaray',
      'сімферополь', 'симферополь', 'ялта', 'керч', 'керчь', 'феодосія', 'феодосия', 'євпаторія', 'евпатория', 'джанкой', 'алушта', 'бахчисарай'] },
  { country: 'UA', iso: 'UA-40', name: 'Sevastopol',
    regionStems: ['sevastopol', 'sebastopol', 'sewastopol', 'szewastopol', 'севастопол', 'セヴァストポリ', 'セバストポリ', '塞瓦斯托波尔', '塞瓦斯托波爾', 'سيفاستوبول', 'סבסטופול', 'სევასტოპოლ'],
    towns: ['sevastopol', 'sebastopol', 'sewastopol', 'севастополь', 'inkerman', 'інкерман', 'инкерман', 'balaklava', 'балаклава'] },
  { country: 'UA', iso: 'UA-09', name: 'Luhansk oblast',
    regionStems: ['luhans', 'lugans', 'ługańs', 'luhańs', 'луганс', 'ルハーンシク', 'ルガンスク', '卢甘斯克', '盧甘斯克', '卢汉斯克', 'لوهانسك', 'لوغانسك', 'לוהנסק', 'ლუგანსკ', 'ლუჰანსკ'],
    towns: ['luhansk', 'lugansk', 'alchevsk', 'sievierodonetsk', 'severodonetsk', 'lysychansk', 'lisichansk', 'krasnyi luch', 'khrustalnyi', 'rovenky', 'stakhanov', 'kadiivka',
      'луганськ', 'луганск', 'алчевськ', 'алчевск', 'сєвєродонецьк', 'северодонецк', 'лисичанськ', 'лисичанск', 'кадіївка', 'стаханов'] },
  { country: 'UA', iso: 'UA-14', name: 'Donetsk oblast',
    regionStems: ['donets', 'donetsk', 'donezk', 'donieck', 'donec', 'донец', 'ドネツク', '顿涅茨克', '頓涅茨克', 'دونيتسك', 'דונצק', 'დონეცკ'],
    towns: ['donetsk', 'mariupol', 'makiivka', 'makeevka', 'horlivka', 'gorlovka', 'kramatorsk', 'sloviansk', 'slavyansk', 'bakhmut', 'artemivsk', 'yenakiieve', 'pokrovsk', 'kostiantynivka',
      'донецьк', 'донецк', 'маріуполь', 'мариуполь', 'макіївка', 'макеевка', 'горлівка', 'горловка', 'краматорськ', 'краматорск', 'слов янськ', 'славянск', 'бахмут'] },
  { country: 'UA', iso: 'UA-23', name: 'Zaporizhzhia oblast',
    regionStems: ['zaporiz', 'zaporozh', 'zaporoz', 'zaporoż', 'saporis', 'zaporij', 'запоріз', 'запорож', 'ザポリージャ', 'ザポリッジャ', '扎波罗热', '扎波羅熱', 'زابوريجيا', 'זפוריז', 'ზაპოროჟ'],
    towns: ['zaporizhzhia', 'zaporizhia', 'zaporozhye', 'melitopol', 'berdiansk', 'berdyansk', 'enerhodar', 'energodar', 'tokmak', 'polohy',
      'запоріжжя', 'запорожье', 'мелітополь', 'мелитополь', 'бердянськ', 'бердянск', 'енергодар', 'энергодар', 'токмак'] },
  { country: 'UA', iso: 'UA-65', name: 'Kherson oblast',
    regionStems: ['kherson', 'cherson', 'herson', 'jerson', 'херсон', 'ヘルソン', '赫尔松', '赫爾松', 'خيرسون', 'חרסון', 'ხერსონ'],
    towns: ['kherson', 'cherson', 'nova kakhovka', 'kakhovka', 'henichesk', 'genichesk', 'skadovsk', 'oleshky', 'beryslav',
      'херсон', 'нова каховка', 'новая каховка', 'каховка', 'генічеськ', 'геническ', 'скадовськ', 'скадовск', 'олешки'] },
  // ── Georgia: Abkhazia by its region; South Ossetia by its towns (Places has no region for it — see the header).
  { country: 'GE', iso: 'GE-AB', name: 'Abkhazia',
    regionStems: ['abkhaz', 'abchas', 'abjas', 'abcaz', 'abhaz', 'apkhaz', 'apsny', 'აფხაზ', 'абхаз', 'アブハジア', '阿布哈兹', '阿布哈茲', 'أبخازيا', 'אבחזיה'],
    towns: ['sukhumi', 'sokhumi', 'sukhum', 'gagra', 'gudauta', 'pitsunda', 'bichvinta', 'ochamchire', 'ochamchira', 'tkvarcheli', 'tkuarchal', 'gali', 'gulripshi', 'novy afon', 'new athos',
      'სოხუმი', 'გაგრა', 'გუდაუთა', 'ბიჭვინთა', 'ოჩამჩირე', 'ტყვარჩელი', 'გალი', 'сухум', 'сухуми', 'гагра', 'гудаута', 'пицунда', 'очамчира', 'ткуарчал', 'гал', 'новый афон'] },
  { country: 'GE', iso: 'GE-SK (part): South Ossetia', name: 'South Ossetia',
    regionStems: ['osset', 'oset', 'ossez', 'samachablo', 'tskhinvali region', 'ოსეთ', 'სამაჩაბლო', 'ცხინვალის რეგიონ', 'осет', '南奥塞梯', '南奧塞梯', '南オセチア'],
    towns: ['tskhinvali', 'tskhinval', 'akhalgori', 'leningori', 'leningor', 'java', 'dzau', 'znauri', 'znaur', 'kvaisi', 'kvaisa',
      'ცხინვალი', 'ახალგორი', 'ჯავა', 'ზნაური', 'კვაისი', 'цхинвал', 'цхинвали', 'ахалгори', 'ленингор', 'джава', 'дзау', 'знаур', 'знаури', 'квайса', 'квайси'] },
  // ── Moldova: Transnistria (the left bank of the Dniester). Bender (Tighina) is a separate municipality in law (MD-BD) but is
  //    held by Transnistria, so its name is on the town list too (world-countries-5 report §3).
  { country: 'MD', iso: 'MD-SN', name: 'Transnistria',
    regionStems: ['transnistr', 'transdnie', 'transdnis', 'pridnestrov', 'stinga nistrului', 'stanga nistrului', 'left bank of the dniester', 'приднестров', 'заднестров', 'nistrului'],
    towns: ['tiraspol', 'bender', 'bendery', 'tighina', 'ribnita', 'rybnitsa', 'rybnica', 'dubasari', 'dubossary', 'grigoriopol', 'dnestrovsc', 'dnestrovsk', 'slobozia', 'camenca',
      'тирасполь', 'бендеры', 'бендер', 'тигина', 'рыбница', 'дубоссары', 'григориополь', 'днестровск', 'слободзея'] },
  // ── Canada: Saskatchewan (CA-SK) — until an order can show GST and PST as separate lines. canada-2's own closure for it in
  //    lib/address-formats.ts is removed in favour of this; Quebec (language) and Manitoba (tax lines) keep theirs.
  { country: 'CA', iso: 'CA-SK', name: 'Saskatchewan', regionCodes: ['SK'], regionStems: ['saskatchewan'] },
]

/** Accents and case dropped, every run of non-letters/digits one space — the allergen guard's `unicodeNorm`. */
export function norm(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

const NORMED = REGION_BLOCKS.map(b => ({
  block: b,
  stems: (b.regionStems ?? []).map(norm).filter(Boolean),
  towns: new Set((b.towns ?? []).map(norm).filter(Boolean)),
}))

/** The block a truck's base falls in, or null. `region`/`regionCode` only from a PICKED place; `town` as stored. */
export function blockedRegionOf(country: string, at: { region?: string | null; regionCode?: string | null; town?: string | null }): RegionBlock | null {
  const region = at.region ? norm(at.region) : ''
  const town = at.town ? norm(at.town.split(',')[0]) : ''
  for (const { block, stems, towns } of NORMED) {
    if (block.country !== country) continue
    if (at.regionCode && block.regionCodes?.includes(at.regionCode)) return block
    if (region && stems.some(s => region.includes(s))) return block
    if (town && towns.has(town)) return block
  }
  return null
}
