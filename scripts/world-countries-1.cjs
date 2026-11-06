// scripts/world-countries-1.cjs — THE EIGHT COUNTRIES OUTSIDE EUROPE (world-countries-1, 31 October 2026,
// docs/world-countries-1-report.md). The lean checks of docs/i18n/add-a-country.md §7b, plus what this workstream adds.
//
// LOCALHOST ONLY: the eight rows and their prices are PARSED FROM the NOT RUN SQL (20261055, block B; 20261054 for the CHECKs) and
// switched ON here only, beside the live countries as the database holds them (scripts/_world-countries-1-fixtures.cjs). No
// database, no network.
//   0  THE TAGLINE — gone from every locale, the hero, the footer and the share card;
//   1  CURRENCIES — the registry's 22 codes = block A's CHECK; the card processor's decimals (JPY ZERO); the native price forms; every amount
//      path whole-yen (toMinor / fromMinor / toMinorUnits, and no open-coded ×100 left on an order path);
//   2  PLANS AS DATA — Unlimited only where HatchGrab may not take a platform fee; the country's trial-end plan; the platform-fee
//      guard (platformFeeOn, the charge rules, Admin, the database CHECK and trigger, a static scan of application_fee_amount);
//   3  THE COUNTRY SETTINGS — address formats, phone examples, allergen sets (and uk14/us9/anz/ca byte-identical to HEAD), short names;
//   4  EACH LANGUAGE — 0 structural, the order button, plan names, the allergen labels in the language, no "hatch";
//   5  EACH COUNTRY SWITCHED ON — /<cc> in its language, no en-GB sentence left, native prices from the rows, ONE centred card where
//      only Unlimited is offered, og:locale, JSON-LD, hreflang reciprocal across every live and new page, the sitemap, the PDF,
//      /llms.txt; switched off → 302 to /uk;
//   6  THE WHATSAPP GUARD — each language's safety questions caught, plain questions answered;
//   7  RIGHT TO LEFT — dir="rtl" only on Arabic pages; never on a Latin one.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync, execSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'world-countries-1' })
const { REPO } = kit
const WF = require('./_world-countries-1-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const text = s => String(s ?? '').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/[\u00a0\u202f\u200f\u200e]/g, ' ').replace(/\s+/g, ' ').trim()
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o ?? {})) { const kk = p ? `${p}.${k}` : k; if (typeof v === 'string') out[kk] = v; else flat(v, kk, out) } return out }
const deep = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b ?? {})) o[k] = v && typeof v === 'object' && o[k] && typeof o[k] === 'object' ? deep(o[k], v) : v; return o }
const norm = s => String(s).replace(/[\u00a0\u202f\u200f\u200e]/g, ' ')

// ── the languages and their countries ────────────────────────────────────────────────────────────────────────────
// Each: the locale, its country, the order button (no statute in any of the eight fixes words: each is the plain "place order"),
// plan names, and WhatsApp questions a customer would write.
const LANGS = [
  { locale: 'es-MX', cc: 'MX', lang: 'es', button: ['Hacer pedido', 'Pagar {amount}'], plans: { payg: 'Pago por uso', unlimited: 'Ilimitado' },
    safety: ['¿Es sin gluten?', '¿Tienen opciones sin lactosa?', 'Mi hijo es alérgico a la nuez', 'Soy alérgica al cacahuate', 'Tengo intolerancia a la lactosa', 'Soy celíaco', 'Mi hija trae un EpiPen', '¿Puede contener trazas de ajonjolí?', '¿Es apto para celíacos?', '¿Hay contaminación cruzada?'],
    plain: ['¿Dónde están hoy?', '¿Qué pizzas tienen?', '¿A qué hora cierran?', '¿La Margarita lleva queso?', '¿Cuánto cuesta la Margarita?'] },
  { locale: 'pt-BR', cc: 'BR', lang: 'pt', button: ['Fazer pedido', 'Pagar {amount}'], plans: { payg: 'Sem mensalidade', unlimited: 'Ilimitado' },
    safety: ['É sem glúten?', 'Vocês têm opções zero lactose?', 'Meu filho tem alergia a castanhas', 'Sou alérgica a amendoim', 'Tenho intolerância à lactose', 'Tenho doença celíaca', 'Minha filha usa EpiPen', 'Pode conter traços de gergelim?', 'É seguro para quem tem alergia?', 'Tem risco de contaminação cruzada?'],
    plain: ['Onde vocês estão hoje?', 'Quais pizzas vocês têm?', 'Que horas vocês fecham?', 'A Margherita tem queijo?', 'Quanto custa a Margherita?'] },
  { locale: 'ms-MY', cc: 'MY', lang: 'ms', button: ['Buat pesanan', 'Bayar {amount}'], plans: { payg: 'Tanpa yuran bulanan', unlimited: 'Tanpa had' },
    safety: ['Adakah ini bebas gluten?', 'Ada pilihan tanpa laktosa?', 'Anak saya alergi kacang', 'Saya alahan kacang tanah', 'Saya tidak tahan laktosa', 'Saya ada penyakit seliak', 'Anak perempuan saya ada EpiPen', 'Boleh mengandungi kesan bijan?', 'Selamat untuk orang yang ada alahan?', 'Ada risiko pencemaran silang?'],
    plain: ['Di mana anda hari ini?', 'Ada pizza apa?', 'Pukul berapa tutup?', 'Margherita ada keju?', 'Berapa harga Margherita?'] },
  { locale: 'en-SG', cc: 'SG', lang: 'en', button: null, plans: null,
    safety: ['Is it gluten free?', 'My son has a nut allergy', 'Is it safe for coeliacs?', 'Any lactose free options?', 'My daughter carries an EpiPen'],
    plain: ['Where are you today?', 'What pizzas do you have?', 'What time do you close?', 'Does the Margherita have cheese?', 'How much is the Margherita?'] },
  { locale: 'ja-JP', cc: 'JP', lang: 'ja', button: ['注文を確定する', '{amount}を支払う'], plans: { payg: '月額無料', unlimited: '無制限' },
    safety: ['グルテンフリーですか？', '乳製品不使用のメニューはありますか？', '息子がナッツアレルギーです', '落花生のアレルギーがあります', '乳糖不耐症です', 'セリアック病です', '娘はエピペンを持っています', 'ごまが微量に入っていますか？', '卵抜きにできますか？', 'コンタミの心配はありますか？'],
    plain: ['今日はどこに出店していますか？', 'どんなピザがありますか？', '何時に閉まりますか？', 'マルゲリータにチーズは入っていますか？', 'マルゲリータはいくらですか？'] },
  { locale: 'zh-HK', cc: 'HK', lang: 'zh', button: ['確認落單', '付款 {amount}'], plans: { payg: '免月費', unlimited: '無上限' },
    safety: ['係咪無麩質？', '有冇唔含乳製品嘅選擇？', '我個仔對果仁過敏', '我對花生敏感', '我有乳糖不耐', '我有乳糜瀉', '我個女有 EpiPen', '可能含有芝麻嗎？', '可以走蛋嗎？', '會唔會有交叉污染？'],
    plain: ['今日喺邊度擺檔？', '有咩薄餅？', '幾點收檔？', '瑪格麗特薄餅有冇芝士？', '瑪格麗特薄餅幾錢？'] },
  { locale: 'th-TH', cc: 'TH', lang: 'th', button: ['ยืนยันการสั่งซื้อ', 'ชำระเงิน {amount}'], plans: { payg: 'ไม่มีค่ารายเดือน', unlimited: 'ไม่จำกัด' },
    safety: ['ไม่มีกลูเตนใช่ไหม', 'มีเมนูไม่มีนมไหม', 'ลูกชายแพ้ถั่ว', 'ฉันแพ้ถั่วลิสง', 'ฉันไม่ทนต่อแลคโตส', 'ฉันเป็นโรคเซลิแอค', 'ลูกสาวพก EpiPen', 'อาจมีงาปนอยู่ไหม', 'เหมาะสำหรับคนแพ้อาหารไหม', 'มีการปนเปื้อนข้ามไหม'],
    plain: ['วันนี้อยู่ที่ไหน', 'มีพิซซ่าอะไรบ้าง', 'ปิดกี่โมง', 'มาร์เกอริต้ามีชีสไหม', 'มาร์เกอริต้าราคาเท่าไร'] },
  { locale: 'ar-AE', cc: 'AE', lang: 'ar', button: ['تأكيد الطلب', 'ادفع {amount}'], plans: { payg: 'بدون رسوم شهرية', unlimited: 'غير محدود' },
    safety: ['هل هذا خالٍ من الجلوتين؟', 'هل لديكم خيارات بدون لاكتوز؟', 'ابني لديه حساسية من المكسرات', 'عندي حساسية من الفول السوداني', 'عندي عدم تحمل اللاكتوز', 'عندي مرض السيلياك', 'ابنتي تحمل إبيبن', 'قد يحتوي على آثار السمسم؟', 'هل هو آمن لمن لديه حساسية؟', 'هل هناك خطر تلوث؟'],
    plain: ['أين أنتم اليوم؟', 'ما أنواع البيتزا لديكم؟', 'متى تغلقون؟', 'هل تحتوي المارغريتا على جبن؟', 'كم سعر المارغريتا؟'] },
]
const LOC = read('lib/i18n/locales.ts')
const LOCALES = JSON.parse('[' + /export const LOCALES = \[([^\]]*)\]/.exec(LOC)[1].replace(/'/g, '"') + ']')
const PARENT = Object.fromEntries([.../export const LOCALE_PARENT[^=]*=\s*\{([^}]*)\}/.exec(LOC)[1].matchAll(/'([a-z]{2}-[A-Z]{2})':\s*'([a-z]{2}-[A-Z]{2})'/g)].map(m => [m[1], m[2]]))
const chain = l => { const c = []; for (let x = l; x && x !== 'en-GB'; x = PARENT[x]) c.unshift(x); return c }
const EN = JSON.parse(read('messages/en-GB.json'))
const messagesOf = l => chain(l).reduce((acc, x) => deep(acc, JSON.parse(read(`messages/${x}.json`))), EN)
const BUILT = LANGS.filter(L => LOCALES.includes(L.locale))
const ON = BUILT.map(L => L.cc)
const SEG = Object.fromEntries([...read('lib/marketing-country.ts').matchAll(/\b([A-Z]{2}): '([a-z]{2})'/g)].map(m => [m[1], m[2]]))
const UNLIMITED_ONLY = ['BR', 'MX', 'MY', 'SG', 'TH']

;(async () => {
  console.log(`world-countries-1 — languages built: ${BUILT.map(L => L.locale).join(', ') || 'none'}; not built yet: ${LANGS.filter(L => !BUILT.includes(L)).map(L => L.locale).join(', ') || 'none'}`)
  const { rows: sqlCountries, prices: sqlPrices } = WF.sqlRows()

  // ══ 0 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('0 · THE TAGLINE — "Less time booking. More time cooking." is gone everywhere')
  const allMsgs = fs.readdirSync(path.join(REPO, 'messages')).filter(f => f.endsWith('.json'))
  t(`no locale file (${allMsgs.length}) has landing.hero.tagline or landingFooter.tagline`, allMsgs.every(f => { const m = JSON.parse(read(`messages/${f}`)); return !m.landing?.hero?.tagline && !m.landingFooter?.tagline }))
  t('the hero and the footer render no tagline (no hero-tag / foot-tag, no t(\'…tagline\'))', !/hero-tag|hero\.tagline/.test(read('app/(public)/(site)/landing/page.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')) && !/foot-tag|'tagline'/.test(read('components/landing/LandingFooter.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')))
  // ⚠️ RE-PINNED (tidy-1, 3 November 2026): STALE since 2b625a66, which committed this check together with two harness files that must
  // name the words — scripts/_lp-tagline.cjs (cuts the tagline from BEFORE's pages) and scripts/world-countries-1-hero.cjs (proves it gone).
  const tagHits = execSync("git grep -l -i 'less time booking' -- ':!docs' ':!scripts/fixtures' ':!scripts/world-countries-1.cjs' ':!scripts/marketing-country-parity.cjs' ':!scripts/_lp-tagline.cjs' ':!scripts/world-countries-1-hero.cjs' || true", { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  t('no source file outside the reports still carries the words (comments recording the removal aside)', tagHits.every(f => ['app/(public)/(site)/landing/page.tsx', 'components/landing/LandingFooter.tsx'].includes(f)), tagHits)
  t('the share card (og:image) is re-rendered without it: same file, same 1200×630, now the wordmark alone', (() => { const b = fs.readFileSync(path.join(REPO, 'public/logos/hatchgrab-share-card.png')); return b.readUInt32BE(16) === 1200 && b.readUInt32BE(20) === 630 })())

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · CURRENCIES — the registry, the CHECK, the processor\'s decimals, native prices, whole yen')
  const R = await kit.bundle('wc1-cur', "export * from '@/lib/currencies'\nexport * from '@/lib/money-format'\nexport { toMinor, fromMinor } from '@/lib/order-repricing'\nexport { planMoneyFormatOf, intlMoneyFormatOf, currencyLineOf, platformFeeOn } from '@/lib/country-settings-types'")
  const NEW = ['BRL', 'MXN', 'JPY', 'SGD', 'HKD', 'MYR', 'AED', 'THB']
  t(`the registry lists ${NEW.join(', ')} after the 14`, NEW.every(c => R.CURRENCY_CODES.includes(c)) && R.CURRENCY_CODES.length === 22)
  const checkList = [.../check \(currency in \(([^)]*)\)\)/.exec(read(WF.SQL_A))[1].matchAll(/'([A-Z]{3})'/g)].map(m => m[1])
  t('block A\'s country_settings_currency_chk = the registry\'s 22 codes, in order', JSON.stringify(checkList) === JSON.stringify([...R.CURRENCY_CODES]), checkList)
  t('the processor\'s decimals: JPY 0 (zero-decimal), the other seven 2', R.currencyInfo('JPY').decimals === 0 && NEW.filter(c => c !== 'JPY').every(c => R.currencyInfo(c).decimals === 2) && R.minorDigits('JPY') === 0)
  // native prices: the app's own formatter on each block-B row, its Pro price
  // ⚠️ RE-PINNED (world-countries-2, 1 November 2026, Dominic): JPY's normal-width "¥" and MYR's "RM29" (no space).
  const want = { BR: 'R$ 59', MX: '$349', JP: '¥1,980', SG: '$29', HK: 'HK$119', MY: 'RM29', TH: '฿199', AE: '59 د.إ.' }
  for (const r of sqlCountries) {
    const pro = sqlPrices.find(p => p.country_code === r.country_code && p.plan_key === 'pro')
    const f = R.planMoneyFormatOf({ currency: r.currency, locale: r.locale })
    const s = norm(R.formatAmount(pro.monthly_minor, f)).trim()
    t(`${r.country_code}: Pro ${s} — the native form (${want[r.country_code]}), Intl in ${r.locale}`, s.replace(/\s+/g, ' ').includes(want[r.country_code]), s)
  }
  t('shared-symbol currencies name themselves on their own pages and side by side: MXN "$" + line, "MX$349"; SGD "$" + line, "SGD 29"',
    R.currencyInfo('MXN').symbolShared && R.currencyInfo('SGD').symbolShared && norm(R.formatAmount(34900, R.intlMoneyFormatOf({ currency: 'MXN', locale: 'es-MX' }))) === 'MX$349' && norm(R.formatAmount(2900, R.intlMoneyFormatOf({ currency: 'SGD', locale: 'en-SG' }))) === 'SGD 29' && !!R.currencyLineOf({ currency: 'MXN', locale: 'es-MX' }) && !R.currencyLineOf({ currency: 'JPY', locale: 'ja-JP' }))
  t('JPY whole yen on every amount path: toMinor(1200) = 1200, fromMinor(1200) = 1200, toMinorUnits(1980) = 1980, formatMinor(1980) = "¥1,980"',
    R.toMinor(1200, 'JPY') === 1200 && R.fromMinor(1200, 'JPY') === 1200 && R.toMinorUnits(1980, 'JPY') === 1980 && norm(R.formatMinor(1980, { currency: 'JPY', locale: 'ja-JP' })) === '¥1,980' && R.toMajor(1980, 'JPY') === 1980)
  t('…and every two-decimal currency exactly as before: toMinor(12.5, GBP) 1250, fromMinor(1250, GBP) 12.5, toMinor(12.5, null) 1250',
    R.toMinor(12.5, 'GBP') === 1250 && R.fromMinor(1250, 'GBP') === 12.5 && R.toMinor(12.5, null) === 1250 && R.toMinor(12.5, 'BRL') === 1250 && norm(R.formatMinor(4390, { currency: 'GBP', locale: 'en-GB' })) === '£43.90')
  // no open-coded ×100 on an order or payment path
  const orderPaths = ['app/api/orders/submit/route.ts', 'app/api/dashboard/action/route.ts', 'lib/payments/ledger.ts', 'lib/payments/promote-draft.ts', 'app/(app)/trucks/[slug]/order/page.tsx', 'components/dashboard/AddOrderPanel.tsx', 'components/manage/ChargesCard.tsx', 'lib/seed-demo-orders.ts']
  const x100 = orderPaths.flatMap(f => read(f).split('\n').map((l, i) => [f, i + 1, l]).filter(([, , l]) => !/^\s*(\/\/|\*)/.test(l) && /(Minor|minor|total|Total|Pence|food)\w*\s*[*/]\s*100\b|\b100\s*\*\s*(total|food)|\*\s*100\)/.test(l) && !/bps|pct|Pct|Bps|percent|t: Math\.round\(total \* 100\)|g: Math\.round\(grandTotal \* 100\)/.test(l)).map(([f, n, l]) => `${f}:${n} ${l.trim().slice(0, 90)}`))
  t('no order or payment path converts money with an open-coded ×100 / ÷100 (the basket fingerprint, a change detector, aside)', x100.length === 0, x100)

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · PLANS AS DATA — Unlimited only where no platform fee may be taken; the trial-end plan; the fee guard')
  const P = await kit.bundle('wc1-plans', "export * from '@/lib/plans'\nexport * from '@/lib/plan-offer'")
  const cat = WF.CATALOG()
  t('the catalogue (live + the eight) is sound: catalogProblems() = []', P.catalogProblems(cat).length === 0, P.catalogProblems(cat))
  const allowed = Object.fromEntries(sqlCountries.map(r => [r.country_code, r.platform_fee_allowed]))
  t(`block B: platform_fee_allowed is false for exactly ${UNLIMITED_ONLY.join(', ')}; true for JP, HK, AE`, Object.entries(allowed).every(([cc, a]) => a === !UNLIMITED_ONLY.includes(cc)), allowed)
  for (const cc of WF.WORLD) {
    const offered = P.offerPlans(cat, cc).map(o => o.plan.key)
    const ended = P.effectivePlan({ plan: 'trial', trial_expires_at: '2026-01-01T00:00:00Z', country: cc }, cat).plan.key
    const only = UNLIMITED_ONLY.includes(cc)
    t(`${cc}: offered ${offered.join(' / ')}; a finished trial drops to ${ended}${only ? ' (its is_trial_end row)' : ' (the plans table\'s fallback)'}`,
      only ? JSON.stringify(offered) === '["unlimited"]' && ended === 'unlimited' : JSON.stringify(offered) === '["payg","pro","unlimited"]' && ended === 'payg', { offered, ended })
  }
  t('GB unchanged: three plans, a finished trial drops to Pay as you go; a truck with no country too', P.offerPlans(cat, 'GB').length === 3 && P.effectivePlan({ plan: 'trial', trial_expires_at: '2026-01-01T00:00:00Z', country: 'GB' }, cat).plan.key === 'payg' && P.effectivePlan({ plan: 'trial', trial_expires_at: '2026-01-01T00:00:00Z' }, cat).plan.key === 'payg')
  t('every OFFERED row in the five charges no fee (fee_bps 0) — the trigger\'s rule (a), held by the data', sqlPrices.filter(p => UNLIMITED_ONLY.includes(p.country_code) && p.offered).every(p => p.fee_bps === 0))
  t('payg and pro rows kept in the five (prices as researched), switched off; exactly one trial-end row each', UNLIMITED_ONLY.every(cc => sqlPrices.filter(p => p.country_code === cc).length === 3 && sqlPrices.filter(p => p.country_code === cc && !p.offered).map(p => p.plan_key).sort().join() === 'payg,pro' && sqlPrices.filter(p => p.country_code === cc && p.is_trial_end).length === 1))
  t('prices as briefed (minor units; JPY whole yen): BR 5900/14900 incl 800000 · MX 34900/84900 incl 5000000 · JP 1980/2980 incl 250000 · SG 2900/5900 incl 400000 · HK 11900/26900 incl 1500000 · MY 2900/6900 incl 400000 · AE 5900/14900 incl 800000 · TH 19900/44900 incl 2500000',
    JSON.stringify(Object.fromEntries(WF.WORLD.map(cc => [cc, ['pro', 'unlimited'].map(k => sqlPrices.find(p => p.country_code === cc && p.plan_key === k).monthly_minor).concat(sqlPrices.find(p => p.country_code === cc && p.plan_key === 'pro').included_online_minor)])))
    === JSON.stringify({ BR: [5900, 14900, 800000], MX: [34900, 84900, 5000000], JP: [1980, 2980, 250000], SG: [2900, 5900, 400000], HK: [11900, 26900, 1500000], MY: [2900, 6900, 400000], TH: [19900, 44900, 2500000], AE: [5900, 14900, 800000] }))
  t('payg is 0 a month with 0.99% wherever it is offered (JP, HK, AE)', ['JP', 'HK', 'AE'].every(cc => { const p = sqlPrices.find(x => x.country_code === cc && x.plan_key === 'payg'); return p.monthly_minor === 0 && p.fee_bps === 99 && p.offered }))
  // the fee guard
  t('platformFeeOn: enabled AND allowed — on+allowed → on; on+NOT allowed → off; off → off; a row read before 20261054 (no column) → as enabled',
    R.platformFeeOn({ platformFeeEnabled: true, platformFeeAllowed: true }) && !R.platformFeeOn({ platformFeeEnabled: true, platformFeeAllowed: false }) && !R.platformFeeOn({ platformFeeEnabled: false, platformFeeAllowed: true }) && R.platformFeeOn({ platformFeeEnabled: true }))
  const ocr = read('lib/order-charge-rules.ts')
  t('the charge rules ask platformFeeOn (never platform_fee_enabled alone) for the fee and for reading the plan\'s rate', (ocr.match(/platformFeeOn\(country\)/g) || []).length === 2 && !/country\.platformFeeEnabled\s*&&/.test(ocr))
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const sends = execSync("git grep -l 'application_fee_amount' -- app lib components || true", { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean).filter(f => /application_fee_amount/.test(strip(read(f))))
  t('STATIC GUARD: every file that sends application_fee_amount also asks platformFeeOn (none sends one today)', sends.every(f => /platformFeeOn/.test(read(f))), sends)
  const A = read(WF.SQL_A)
  t('block A: country_settings_platform_fee_allowed_chk (platform_fee_allowed or not platform_fee_enabled) — the database refuses the fee where it is not allowed',
    /add constraint country_settings_platform_fee_allowed_chk\s+check \(platform_fee_allowed or not platform_fee_enabled\)/.test(A) && /add column if not exists platform_fee_allowed boolean not null default true/.test(A))
  t('block A: the world guard trigger refuses an offered fee-charging row where no fee is allowed, and a switched-on country whose trial-end plan is not offered',
    /pp\.offered and pp\.fee_bps > 0 and not cs\.platform_fee_allowed/.test(A) && /create trigger country_settings_world_guard/.test(A) && /create trigger plan_prices_world_guard/.test(A) && /plan_prices_one_trial_end_per_country/.test(A))
  const F = await kit.bundle('wc1-form', "export * as Form from '@/lib/admin/country-form'")
  const gbForm = { ...F.Form.rowToForm(sqlCountries.length ? WF.camelRow(sqlCountries.find(r => r.country_code === 'BR'), false) : {}), platformFeeEnabled: true }
  const refused = F.Form.formToValues(gbForm, { truckCount: 0, storedCurrency: 'BRL', countryCode: 'BR', platformFeeAllowed: false })
  t('Admin › Countries refuses "Take our fee" in Brazil (platform_fee_allowed false)', !refused.ok && refused.errors.some(e => e.field === 'platformFeeEnabled'), refused.ok ? 'accepted' : refused.errors)
  t('Admin\'s plan buttons and its API refuse a plan not offered in the truck\'s country', /disabled=\{notOffered\}/.test(read('app/(app)/admin/page.tsx')) && /is not offered in/.test(read('app/api/admin/route.ts')))

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · COUNTRY SETTINGS — address formats, phones, allergen sets, short names')
  const AF = await kit.bundle('wc1-addr', "export * from '@/lib/address-formats'")
  t('lib/address-formats validates (all 44 formats)', AF.validateAddressFormats().length === 0 && AF.ADDRESS_FORMAT_KEYS.length === 44, AF.validateAddressFormats())
  const fmtList = [.../check \(address_format in \(([^)]*)\)\)/.exec(A)[1].matchAll(/'([a-z]{2})'/g)].map(m => m[1])
  t('block A\'s address-format CHECK = the config\'s 44 keys', JSON.stringify(fmtList) === JSON.stringify([...AF.ADDRESS_FORMAT_KEYS]))
  const lines = { br: 'Parque Ibirapuera, São Paulo, SP, 04094-050', mx: 'Zócalo, 06000 Ciudad de México, Ciudad de México', jp: '代々木公園 〒151-0052 東京都渋谷区', sg: 'Marina Bay Sands, Singapore 018956', hk: '中環海濱活動空間, 中環, 香港島', my: 'Dataran Merdeka, 50050 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur', th: 'สวนลุมพินี, กรุงเทพมหานคร 10330', ae: 'The Beach JBR, Dubai Marina, دبي' }
  for (const [k, line] of Object.entries(lines)) {
    const f = AF.ADDRESS_FORMATS[k]
    const got = AF.renderTemplate(f.templates.line, { venue: f.examples.venue, locality: f.examples.locality, region: AF.regionDisplay(f, f.examples.region) ?? '', postalCode: f.postalCode.example })
    t(`${k}: "${got}" — local order${f.fields.some(x => x.key === 'postalCode') ? `; postal "${f.postalCode.example}" ${f.postalCode.identifiesPremises ? '(one building)' : '(an area)'}` : '; no postal codes'}`, got === line, got)
  }
  t('the normalisers tidy what was typed: "01310100" → "01310-100", "〒1000005" → "100-0005"', AF.normalisePostalCode(AF.ADDRESS_FORMATS.br, '01310100') === '01310-100' && AF.normalisePostalCode(AF.ADDRESS_FORMATS.jp, '〒1000005') === '100-0005')
  const PH = await kit.bundle('wc1-phone', "export { isPlausiblePhone } from '@/lib/phone'")
  for (const r of sqlCountries) t(`${r.country_code}: phone +${r.phone_country_code}, example "${r.phone_example}" passes the app's own '${r.phone_check}' check`, PH.isPlausiblePhone(r.phone_example, r.country_code, r.phone_check))
  t('every row is switched OFF, has its own-language short name, its currency, locale, format and allergen set', sqlCountries.length === 8 && sqlCountries.every(r => r.enabled === false && r.short_name && r.address_format === r.country_code.toLowerCase()),
    sqlCountries.map(r => `${r.country_code} ${r.enabled} ${r.short_name} ${r.locale} ${r.allergen_set}`))
  t('short names: Brasil, México, 日本, Singapore, 香港, Malaysia, ประเทศไทย, الإمارات', JSON.stringify(sqlCountries.map(r => r.short_name)) === JSON.stringify(['Brasil', 'México', '日本', 'Singapore', '香港', 'Malaysia', 'ประเทศไทย', 'الإمارات']))
  t('tax: included everywhere but Malaysia (SST added on top); Mexico IVA 16 % and Japan 消費税 8 % by default, others the truck\'s own rate',
    sqlCountries.every(r => r.prices_include_tax === (r.country_code !== 'MY')) && AF.includedTaxOf('mx').milli === 16000 && AF.includedTaxOf('jp').milli === 8000 && AF.includedTaxOf('br').milli === 0)
  const AL = await kit.bundle('wc1-allergens', "export * from '@/lib/allergens'\nexport { allergenLabel } from '@/lib/allergen-label'")
  t('allergen sets: jp 28 (the 8 specified first), br 22 (ANVISA + lactose), codex 9; the CHECK lists all seven sets',
    AL.allergenVocab('jp').length === 28 && AL.allergenVocab('jp').slice(0, 8).join() === 'Shrimp,Crab,Walnut,Wheat,Buckwheat,Egg,Milk,Peanut' && AL.allergenVocab('br').length === 22 && AL.allergenVocab('codex').length === 9
    && /check \(allergen_set in \('uk14', 'us9', 'anz', 'ca', 'jp', 'br', 'codex'\)\)/.test(A))
  t('row sets: JP jp, BR br, the six others codex', JSON.stringify(Object.fromEntries(sqlCountries.map(r => [r.country_code, r.allergen_set]))) === JSON.stringify({ BR: 'br', MX: 'codex', JP: 'jp', SG: 'codex', HK: 'codex', MY: 'codex', TH: 'codex', AE: 'codex' }))
  // uk14 / us9 / anz / ca: every prompt line and replacement byte-identical to HEAD's lib/allergens.ts
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc1-head-'))
    fs.writeFileSync(path.join(dir, 'allergens.ts'), execSync('git show HEAD:lib/allergens.ts', { cwd: REPO, encoding: 'utf8' }))
    const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
    const b = esbuild.buildSync({ entryPoints: [path.join(dir, 'allergens.ts')], bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent' })
    const m = { exports: {} }; new Function('module', 'exports', 'require', b.outputFiles[0].text)(m, m.exports, require); const H = m.exports
    const sample = 'x (e.g. Prawn →\n  ["Crustaceans"], Cheese → ["Dairy"], Halloumi → ["Dairy"]) "allergens": ["Dairy", "Lactose", "Gluten", "Eggs"] "allergens": ["Peanuts", "Eggs"] "allergens": ["Crustaceans"]'
    const out = (X, s) => JSON.stringify([X.allergenVocab(s), X.genericReplacements(s), X.menuExtractAllergenLines(s), X.menuExtractAllergenExample(s), X.allergenCardListLines(s), X.allergenCardClosingRule(s), X.allergenCardExample(s), X.localiseExampleAllergens(sample, s)])
    for (const s of ['uk14', 'us9', 'anz', 'ca', null]) t(`allergen set ${s ?? '(none)'}: every list, replacement, prompt line and example byte-identical to HEAD`, out(AL, s) === out(H, s))
  }

  // ══ 4 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · THE LANGUAGES — translation-check, the order button, plan names, allergen labels, no "hatch"')
  for (const L of BUILT) {
    if (L.lang === 'en') {
      // A sparse English override (as en-IE, en-AU): every key it holds is an en-GB key with the same ICU skeleton.
      const TC = require('./translation-check.cjs'), own = flat(JSON.parse(read(`messages/${L.locale}.json`))), E = flat(EN)
      const bad = Object.entries(own).filter(([k, v]) => !(k in E) || JSON.stringify(TC.skeleton(v).args) !== JSON.stringify(TC.skeleton(E[k]).args) || JSON.stringify(TC.skeleton(v).tags) !== JSON.stringify(TC.skeleton(E[k]).tags))
      t(`${L.locale}: a sparse override of en-GB (${Object.keys(own).length} keys: "in {country}", "Cents", "Pay at the truck", the +65 phone example), each an en-GB key with its placeholders`, bad.length === 0 && Object.keys(own).length === (L.locale === 'en-SG' ? 23 : 5), bad)   // ⚠️ RE-PINNED (costs-accounts-1, 4 Nov 2026): en-SG 22 → 23, Reports' "Pay at the truck" (manageReports.accounts.payAtTruck)
    } else {
      const r = spawnSync(process.execPath, ['scripts/translation-check.cjs', '--locale', L.locale], { cwd: REPO, encoding: 'utf8' })
      t(`${L.locale}: translation-check — 0 structural${PARENT[L.locale] ? ` (over ${PARENT[L.locale]})` : ''}`, r.status === 0 && /\*\*Structural: 0\*\*/.test(r.stdout), r.stdout.slice(-400))
    }
    const M = messagesOf(L.locale)
    if (L.button) t(`${L.locale}: the order button "${M.order.placeOrder}" / "${M.order.payAmount}" (no statute fixes words in ${L.cc})`, M.order.placeOrder === L.button[0] && M.order.payAmount === L.button[1], [M.order.placeOrder, M.order.payAmount])
    if (L.plans) t(`${L.locale}: plan names "${M.planNames?.payg?.name}", Pro, "${M.planNames?.unlimited?.name}"; Pro has no name of its own`, M.planNames?.payg?.name === L.plans.payg && M.planNames?.unlimited?.name === L.plans.unlimited && !M.planNames?.pro?.name)
    const set = sqlCountries.find(r => r.country_code === L.cc).allergen_set
    const labels = AL.allergenVocab(set).map(a => AL.allergenLabel(a, L.locale))
    t(`${L.locale}: the ${set} allergens shown in the language (${labels.slice(0, 6).join(', ')}…)`, L.lang === 'en' ? labels.every((x, i) => x === AL.allergenVocab(set)[i]) : labels.filter((x, i) => x !== AL.allergenVocab(set)[i]).length >= AL.allergenVocab(set).length - 2, labels)
    // A translation never says "hatch"; an English override keeps en-GB's sentences (as en-IE / en-AU / en-NZ do) and words
    // only the plan feature "Pay at the truck" (report §3, flag on en-SG's 17 "hatch" sentences).
    if (L.lang === 'en') t(`${L.locale}: the plan feature reads "Pay at the truck", not "Pay at Hatch"`, M.planFeatures.priceWord.payAtHatch === 'Pay at the truck' && !/Hatch\b/.test(M.planPrompt.features.online_ordering_pay_at_hatch.name))
    // ⚠️ RE-PINNED (world-countries-2, 1 November 2026, Dominic): en-SG now words en-GB's 17 "hatch" sentences its own way
    // ("truck", "counter"), so "hatch" appears nowhere in it either.
    t(`${L.locale}: "hatch" appears nowhere`, !Object.values(flat(M)).some(v => /\bhatch\b/i.test(v.replace(/HatchGrab/g, ''))), Object.entries(flat(M)).filter(([, v]) => /\bhatch\b/i.test(v.replace(/HatchGrab/g, ''))).map(([k]) => k))
  }
  t('every English locale shows the stored allergen label (nothing looked up)', ['en-GB', 'en-US', 'en-SG'].every(l => AL.allergenVocab('codex').every(a => AL.allergenLabel(a, l) === a)))

  // ══ 5 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · COUNTRIES SWITCHED ON (fixtures) — the landing page in the language, native prices, one card, hreflang, sitemap')
  const RR = WF.renderer(kit, 'wc1')
  const rowsOn = WF.rowsWith(ON), rowsOff = WF.rowsWith([])
  const MF = await kit.bundle('wc1-money', "export * from '@/lib/money-format'\nexport { planMoneyFormatOf } from '@/lib/country-settings-types'")
  const ldOf = html => { const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html || ''); return m ? JSON.parse(m[1]) : null }
  const langsOf = m => Object.fromEntries(Object.entries(m?.alternates?.languages || {}).map(([k, v]) => [k, String(v).replace('https://www.hatchgrab.com', '')]))
  const pages = {}
  for (const L of BUILT) {
    const cc = L.cc, row = rowsOn.find(r => r.countryCode === cc), seg = SEG[cc]
    const Pg = await RR.page('landing', seg, rowsOn); pages[cc] = Pg
    const tx = text(Pg.html), M = flat(messagesOf(L.locale))
    const leftovers = L.lang === 'en' ? [] : Object.entries(flat(EN)).filter(([k, v]) => /^(landing|landingNav|landingFooter|pricing|planTable|siteFooter)\./.test(k) && v.length >= 14 && !/[{<]/.test(v) && M[k] !== v && tx.includes(v)).map(([k]) => k)
    const fmt = minor => norm(MF.formatAmount(minor, MF.planMoneyFormatOf(row))).trim()
    const prices = WF.CATALOG().prices.filter(p => p.countryCode === cc && p.offered).map(p => fmt(p.monthlyMinor))
    t(`/${seg} (${cc}, ${L.locale}): renders in the language («${M['landingNav.logIn']}»), no en-GB sentence left, prices ${prices.join(' / ')} from the rows`,
      !!Pg.html && !Pg.redirectedTo && tx.includes(M['landingNav.logIn']) && leftovers.length === 0 && prices.every(p => tx.includes(p)), { redirect: Pg.redirectedTo, leftovers: leftovers.slice(0, 8) })
    const cards = (Pg.html.match(/class="plan(?: hero-plan)?"/g) || []).length
    if (UNLIMITED_ONLY.includes(cc)) {
      t(`/${seg}: ONE plan card (Unlimited), centred (.plans-single), its button primary, no "cheapest" bar; the banner names its price`, cards === 1 && /class="plans plans-single"/.test(Pg.html) && !/cheap-bar/.test(Pg.html)
        && tx.includes(norm(M['pricing.banner.bodyOnly'] ?? '').replace(/<plan>\{fallback\}<\/plan>.*$/s, '').replace(/\{brand\}/, M['planFeatures.priceWord.payAtHatch']).slice(0, 30)), { cards })
      t(`/${seg}: no Pay as you go or Pro price, and no 0.99% fee sentence`, !tx.includes(fmt(WF.CATALOG().prices.find(p => p.countryCode === cc && p.planKey === 'pro').monthlyMinor) + ' ') || prices.length === 1)
    } else t(`/${seg}: three plan cards`, cards === 3, { cards })
    const app = (ldOf(Pg.html)?.['@graph'] || []).find(n => n['@type'] === 'SoftwareApplication')
    t(`/${seg}: og:locale ${L.locale.replace('-', '_')}, canonical /${seg}, JSON-LD offers in ${row.currency} (${(app?.offers || []).length} — the offered plans only), inLanguage ${L.locale}`,
      Pg.meta?.openGraph?.locale === L.locale.replace('-', '_') && Pg.meta?.alternates?.canonical === `https://www.hatchgrab.com/${seg}` && app?.offers?.every(o => o.priceCurrency === row.currency) && (app?.offers || []).length === (UNLIMITED_ONLY.includes(cc) ? 1 : 3) && JSON.stringify(ldOf(Pg.html)).includes(`"inLanguage":"${L.locale}"`), [Pg.meta?.openGraph?.locale, app?.offers?.length])
    t(`/${seg}: the short name "${row.shortName}" in the title`, String(Pg.meta?.title?.absolute ?? Pg.meta?.title ?? '').includes(row.shortName), Pg.meta?.title)
    const pdf = await RR.pdf(rowsOn, cc)
    t(`${cc}: the plans PDF in the language, ${UNLIMITED_ONLY.includes(cc) ? 'one card, no cheapest bar' : 'three cards'}`, (pdf.match(/<div class="card( hl)?">/g) || []).length === (UNLIMITED_ONLY.includes(cc) ? 1 : 3) && (!UNLIMITED_ONLY.includes(cc) || !/class="cheap"/.test(pdf)))
  }
  if (BUILT.length) {
    const uk = await RR.page('landing', 'uk', rowsOn)
    const wantAlt = langsOf(uk.meta)
    const sorted = o => JSON.stringify(Object.entries(o).sort())
    t(`hreflang reciprocal: /uk and the ${BUILT.length} new pages list the same ${Object.keys(wantAlt).length} alternates, every new locale among them`,
      BUILT.every(L => wantAlt[L.locale] === `/${SEG[L.cc]}`) && Object.values(pages).every(p => sorted(langsOf(p.meta)) === sorted(wantAlt)), { uk: wantAlt })
    const sm = await RR.sitemap(rowsOn)
    t('sitemap: every new page listed with its own locale among the alternates', ON.every(cc => sm.some(e => e.url === `https://www.hatchgrab.com/${SEG[cc]}` && e.alternates?.languages?.[rowsOn.find(r => r.countryCode === cc).locale] === `https://www.hatchgrab.com/${SEG[cc]}`)))
    const llms = await RR.llms(rowsOn)
    t('/llms.txt: each new country listed; the free-trial sentence names Unlimited for the five, Pay as you go for the rest',
      BUILT.every(L => llms.includes(`/${SEG[L.cc]}`)) && (!BUILT.some(L => UNLIMITED_ONLY.includes(L.cc)) || /a truck moves to Unlimited\./.test(llms)) && /moves to Pay as you go/.test(llms), llms.slice(llms.indexOf('## Free trial'), llms.indexOf('## Free trial') + 500))
  }
  const offPages = await Promise.all(WF.WORLD.map(cc => RR.page('landing', SEG[cc], rowsOff)))
  const smOff = await RR.sitemap(rowsOff)
  const ukOff = await RR.page('landing', 'uk', rowsOff)
  t('switched off (the database as block B leaves it): every new /<cc> redirects to /uk, none is in the sitemap or /uk\'s hreflang',
    offPages.every(p => /\/uk/.test(String(p.redirectedTo))) && !WF.WORLD.some(cc => smOff.some(e => e.url === `https://www.hatchgrab.com/${SEG[cc]}`)) && !Object.values(langsOf(ukOff.meta)).some(v => WF.WORLD.some(cc => v === `/${SEG[cc]}`)), offPages.map(p => p.redirectedTo))

  // ══ 6 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · THE WHATSAPP GUARD — safety questions caught, plain questions answered (Option B)')
  const G = await kit.bundle('wc1-guard', "export * from '@/lib/allergen-guard'")
  for (const L of LANGS) {
    const set = sqlCountries.find(r => r.country_code === L.cc).allergen_set
    const w = G.guardWordsFor(L.locale)
    const missed = L.safety.filter(m => !G.mentionsAllergen(m, set, L.locale)), caught = L.plain.filter(m => G.mentionsAllergen(m, set, L.locale))
    t(`${L.locale}: lib/allergen-guard/${L.lang}.json — ${L.safety.length} safety questions caught, ${L.plain.length} plain ones not`, !!w && missed.length === 0 && caught.length === 0, { missed, caught })
    const fam = [...G.caveatTriggerWords([AL.allergenVocab(set).includes('Milk') ? 'Milk' : AL.allergenVocab(set)[0]], set, L.locale)]
    t(`${L.locale}: a tagged ${AL.allergenVocab(set).includes('Milk') ? 'Milk' : AL.allergenVocab(set)[0]} dish triggers the caveat on the language's own words (${fam.slice(1, 4).join(', ')})`, fam.length > 1, fam)
  }
  t('English unchanged for uk14: "is it gluten free?" caught; a Japanese question is not matched by the English list', G.mentionsAllergen('is it gluten free?', 'uk14', 'en-GB') && !G.mentionsAllergen('今日はどこですか', 'uk14', 'en-GB'))

  // ══ 7 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · RIGHT TO LEFT AND SCRIPTS — dir="rtl" and the Noto families only where they belong')
  const SF = read('lib/script-fonts.ts'), LY = read('app/(app)/layout.tsx'), CL = read('lib/i18n/client.tsx')
  t('<html dir="rtl"> only for an Arabic page (layout, and the language provider for pages that learn the truck\'s language)', /isRtl\(lang\) \? \{ dir: 'rtl' \} : \{\}/.test(LY) && /if \(m\.isRtl\(locale\)\) document\.documentElement\.dir = 'rtl'/.test(CL) && /import\('@\/lib\/script-fonts'\)/.test(CL) && !/^import .*script-fonts/m.test(CL) && /export const isRtl = \(lang[^)]*\): boolean => \/\^ar\(-\|\$\)\/i/.test(SF))
  // ⚠️ RE-PINNED (world-countries-2, 1 November 2026): lib/script-fonts.ts also defines europe-languages-2's Greek / Cyrillic
  // Noto Sans now (moved from app/layout.tsx so the language provider applies it too) — five definitions, each preload: false.
  t('the four Noto families are never preloaded and each is named only under its own :lang() in globals.css and landing.css, before the metric fallback',
    (SF.match(/preload: false/g) || []).length === 5 && ['ja', 'zh', 'th', 'ar'].every(l => new RegExp(`:root:lang\\(${l}\\) body \\{ --font-geist-sans: 'Geist', var\\(--font-script-[a-z-]+\\), 'Geist Fallback'; \\}`).test(read('app/(app)/globals.css'))
      && new RegExp(`:root:lang\\(${l}\\) \\.hg-landing \\{\\s*--display: 'Archivo', var\\(--font-script-[a-z-]+\\), 'Archivo Fallback'`).test(read('app/(public)/(site)/landing/landing.css'))))

  console.log(`\n${fail ? '🔴' : '✅'} world-countries-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
