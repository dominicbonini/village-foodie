# world-countries-1 — report

*31 October – 1 November 2026. Branch: `main` (working tree, nothing committed, pushed or deployed). Progress log:
`docs/i18n/world-countries-1-progress.md`.*

## Summary

The tagline is gone everywhere. Eight countries are added: Brazil, Mexico, Japan, Singapore, Hong Kong, Malaysia, Thailand and the UAE. Each has:
- its currency, with native price forms (JPY is whole yen on every amount path);
- its country settings and allergen set;
- its own language: es-MX, pt-BR, ms-MY, en-SG, ja-JP, zh-HK, th-TH, ar-AE. Every one has 0 structural problems.

Brazil, Mexico, Malaysia, Singapore and Thailand offer Unlimited only. This is done as data: Pay as you go and Pro are not offered there, no platform fee is allowed, and Unlimited is where a trial ends.

All eight stay **switched off** in the SQL; they are switched on only in test fixtures. **Nothing has been run against the database.**

One decision is open: **right-to-left (RTL) layout for Arabic.** Pages already turn right to left. But making the shared screens fully correct means converting about 430 left/right style classes across shared components. You said to ask before making that change (§4.3).

| Proof | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `npm run build` | ✓ |
| ESLint, every changed file | no file worse than HEAD |
| `scripts/world-countries-1.cjs` (all 8 countries on, in fixtures) | **177 / 177** |
| `scripts/world-countries-1-identity.cjs` (37 live countries vs a HEAD capture) | **439 / 439** — byte-identical apart from the tagline |
| `scripts/world-countries-1-screens.cjs` (WebKit, real fonts) | **43 / 43** |
| translation-check, each new language | **0 structural** in all eight |
| Full sweep (`scripts/run-harnesses.cjs`) | **169 / 172** — the 3 failures fail on the same check at HEAD (§5) |

---

## §0 · The tagline

"Less time booking. More time cooking." is removed from:
- the landing hero (`app/landing/page.tsx`);
- every footer (`components/landing/LandingFooter.tsx`), with its two CSS rules;
- the share card (`public/logos/hatchgrab-share-card.png`, now the logo alone, centred);
- every locale's messages and back-translation files (`landing.hero.tagline`, `landingFooter.tagline`).

At HEAD the tagline lived only in those three source files, the two message keys and the share-card picture. Meta descriptions, OG / JSON-LD, `/llms.txt` and the emails never carried it (grep at HEAD, and the identity harness).

With the tagline gone, the gap from the headline to the button was too tight on laptop and desktop. It is now 1.8rem (`landing.css`; the margins collapse, hence 1.8 not 2). Phone spacing is unchanged.

Before and after shots, WebKit: `docs/world-countries-1/hero-uk-{390,1440}-{before,after}.png`, plus `share-card-{before,after}.png`.

**Share-card cache.** Facebook, LinkedIn, WhatsApp and Slack cache the OG image for days. Links shared before the deploy keep the old card until each platform re-fetches it (Facebook Sharing Debugger → "Scrape again"; LinkedIn Post Inspector).

Re-pinned for this one named change (each marked `⚠️ RE-PINNED (world-countries-1, tagline)`, every other byte still compared):
`_lp-tagline.cjs` (the shared cut), `language-phase-0`, `_lp1e-named`, `language-phase-1e-tidy`, `plans-data-model`,
`marketing-country-parity` (its /features region now ends at the footer links instead of the tagline), and
`world-countries-1-identity`.

---

## §1 · Currencies, prices and plans

### 1.1 Currencies (`lib/currencies.ts`, block A's CHECK)

There are 8 new registry entries. The CHECK and the registry list the same 22 codes, in the same order. Each one prints as its own country prints it:

| Currency | Home form (its language) | Side by side | Why |
|---|---|---|---|
| BRL | R$ 29,00 · R$ 59 | R$ | The real's own sign; Brazilian shops put a space after it. |
| MXN | $349 | MX$ | Mexico writes the peso with "$". The page names the currency (es-MX), and international lists say MX$. |
| JPY | ￥1,980 | ￥ | Full-width ￥, as Japanese shops print it. The yuan writes itself CN¥, so ￥ names one currency. **Zero-decimal.** |
| SGD | $29 | SGD 29 | "$" at home. Side by side, Intl writes "SGD 29" (as it does SEK), and the registry follows Intl. |
| HKD | HK$119 | HK$ | The letters already name it. |
| MYR | RM 29 | RM | Intl's ms-MY form puts a space after RM. Malaysian menus print both "RM29" and "RM 29"; Intl's is kept. |
| THB | ฿199 | ฿ | The baht's own sign. |
| AED | 59 د.إ. | د.إ. | The dirham's Arabic sign, after the number. It names one currency, so the side-by-side form is the same. |

**JPY is zero-decimal on every amount path.** Stripe's minor unit for JPY is one yen, so ¥1,980 is sent as 1980, never 198000. Every place that multiplied or divided by 100 now asks the currency:
- server: `toMinor` / `fromMinor` (`lib/order-repricing.ts`), used by the order submit route, the dashboard action route (refunds, edits, manual payments), the ledger, draft promotion and demo seeding;
- client: `toMinorUnits` / `minorDigits` (`lib/money-format.ts`), used by the order page, the Add Order panel, the dashboard and the Charges card.

`world-countries-1.cjs` §1 proves the helpers (`toMinor(1200, 'JPY')` = 1200, `fromMinor` = 1200, `toMinorUnits(1980)` = 1980, "￥1,980"; every two-decimal currency exactly as before). It also scans every order and payment path, and finds no money converted with a hard-coded ×100 or ÷100 left in any of them. A real ¥ order end to end in Stripe test mode is a switch-on step (§9).

**Event pricing (half yen).** `lib/event-pricing/price.ts` works in two-decimal units internally, so a percentage uplift on a yen price can carry half a yen (￥990 + 15 % = ￥1,138.50). The customer sees ￥1,139 (Intl shows the yen whole) and pays ￥1,139 (`toMinor` rounds the same way), so display and charge agree. Two things remain: the stored price keeps the .50, and the "nearest pound" rounding option means "nearest yen" in Japan, where there is no nearest-￥10 option. Logged, not changed.

### 1.2 Prices (block B, `plan_prices`)

| | Pay as you go | Pro | Unlimited | Offered |
|---|---|---|---|---|
| BR | R$0 + 0.99% | R$59 incl. R$8.000 | R$149 | **Unlimited only** |
| MX | $0 + 0.99% | $349 incl. $50,000 | $849 | **Unlimited only** |
| JP | ￥0 + 0.99% | ￥1,980 incl. ￥250,000 | ￥2,980 | all three |
| SG | $0 + 0.99% | $29 incl. $4,000 | $59 | **Unlimited only** |
| HK | HK$0 + 0.99% | HK$119 incl. HK$15,000 | HK$269 | all three |
| MY | RM0 + 0.99% | RM29 incl. RM4,000 | RM69 | **Unlimited only** |
| TH | ฿0 + 0.99% | ฿199 incl. ฿25,000 | ฿449 | **Unlimited only** |
| AE | AED0 + 0.99% | AED59 incl. AED8,000 | AED149 | all three (country stays off) |

Pay as you go is 0 a month + 0.99% (`fee_bps = 99`) in every country where it is offered. The rows for the plans that aren't offered keep these prices, so turning one on later is a single flag.

### 1.3 Unlimited only, as data

Nothing is hard-coded to the five countries. Three data switches do it:

1. **`country_settings.platform_fee_allowed`** (default `true`). It is `false` for BR, MX, MY, SG and TH, because Stripe does not let a platform outside those countries take an application fee on their connected accounts.

   Today no Stripe call sends `application_fee_amount` (authorize, capture and refund each say so in their headers). The platform fee exists only as the charge rule `lib/order-charge-rules.ts` computes, and both of its reads now go through `platformFeeOn(country)` (`lib/country-settings-types.ts`). Where the fee is not allowed it is never computed, whatever else the row says. A **static guard** in `world-countries-1.cjs` §2 fails the day any file sends `application_fee_amount` without asking `platformFeeOn`.

   The fee is also guarded in three other places:
   - a CHECK refuses `platform_fee_enabled` without `platform_fee_allowed`;
   - Admin › Countries refuses to switch the fee on there;
   - the `plan_prices_world_guard` trigger refuses an *offered* plan with `fee_bps > 0` in such a country.

   Proved in `world-countries-1.cjs` §2.
2. **`plan_prices.offered`** (default `true`). Pay as you go and Pro rows are `false` in the five countries. Only an explicit `false` hides a plan, so code that runs before block A sees every plan as offered, which is today's behaviour. Surfaces that read it:
   - pricing section, /features, /compare, plans PDF and `/llms.txt`;
   - Manage › Billing, the plan prompts and the trial popup;
   - Admin (plan buttons are disabled where a plan isn't offered, and `/api/admin` refuses one).
3. **`plan_prices.is_trial_end`** (at most one per country, and only on an offered row). `true` on Unlimited in the five countries. `expiryFallbackFor(catalog, country)` (`lib/plans.ts`) returns that plan, or the plans table's expiry fallback (Pay as you go) where no row is flagged, which is today's behaviour everywhere else. `effectivePlan` uses it, so an ended trial or ended plan drops to the country's trial-end plan. The guard trigger refuses to switch on a country whose trial-end plan isn't offered there.

**The single-plan card.** Where only one plan is offered, the pricing section reuses the existing plan card, centred, with:
- the extras and money bullets folded in;
- the banner's `bodyOnly` sentence;
- no "which plan is cheapest" bar;
- a primary button.

The plans PDF does the same.

WebKit shots: `docs/world-countries-1/pricing-{br,mx,my,sg,th}-{390,1440}.png`. `world-countries-1-screens.cjs` checks the card is centred to the pixel at both widths.

### 1.4 What a truck in BR / MX / MY / SG / TH sees when its trial ends

- **During the trial:** the landing banner says *"When your trial ends you move to **Unlimited** at R$149 a month."* (in pt-BR; the same in each language). The trial popup in Manage uses its new `bodyKeeps` text: *"… When your trial ends you move to Unlimited, which keeps every feature."* It no longer warns that "some features will stop working".
- **When the trial ends:** `effectivePlan` gives Unlimited. Every feature stays on and no fee is taken on online orders. Manage › Billing shows Unlimited as the current plan and offers no other plan.
- 🔴 **Nothing bills Unlimited automatically.** The app has no subscription or checkout code; plan charging is outside the app today. In the UK a finished trial drops to Pay as you go, which earns the 0.99% fee straight away. In these five countries a finished trial lands on Unlimited and **earns nothing until you invoice the truck**. The popup's sentence "Billing only ever starts when you choose a plan and enter your payment details" is accurate today, but beside "you move to Unlimited at R$149 a month" the two read as a contradiction. **Decision for you (F1).**

### 1.5 Every surface that still assumes Pay as you go exists

| Surface | Status |
|---|---|
| Pricing section, /features, /compare, plans PDF, `/llms.txt` | Fixed: read `offered` and the country's trial-end plan. |
| Manage › Billing, plan prompts, trial popup | Fixed. |
| Admin truck editor and plan buttons; `/api/admin` | Fixed (refuses a plan that isn't offered). |
| `plans.is_expiry_fallback` (the database's single global fallback) | Unchanged on purpose: still Pay as you go, now overridden per country by `is_trial_end`. |
| **Terms §4** (`content/legal/terms-and-conditions.md:66–78`) | 🔴 **Not changed** (legal pages stay en-GB and are yours). It says *"One plan has no monthly fee"*, that a finished trial moves to *"our plan with no monthly fee"*, and that a failed payment *"moves your account to the plan with no monthly fee"*. None of these is true in the five countries. **Each country's Terms section needs this decided before switch-on (F2).** |
| Failed-payment downgrade (Terms §4) | No code for it exists today; it is Terms wording only. In the five countries "drop to the no-fee plan" has no plan to drop to (F2). |

---

## §2 · Country settings (block B; `lib/address-formats.ts`)

| | Address format | Phone (example; check) | Tax | Allergen set | Week | Clock |
|---|---|---|---|---|---|---|
| BR | city, UF, CEP `NNNNN-NNN` | +55 (11) 96123-4567; length | **included**, "Tributos", no default rate (a registered truck sets its own) | `br` | Sun | 24h |
| MX | C.P. city, estado (32 states) | +52 222 123 4567; length | **included**, IVA 16 % | `codex` | Sun | 12h |
| JP | 〒`NNN-NNNN`, prefecture + city (47 prefectures, Japanese names) | +81 090-1234-5678; length | **included**, 消費税 8 % (reduced rate on takeaway) | `jp` | Sun | 24h |
| SG | postal code (6 digits, one building) | +65 8123 4567; length | **included**, GST, no default (a registered truck sets 9 %) | `codex` | Sun | 12h |
| HK | district, area (no postcodes) | +852 5123 4567; length | none | `codex` | Sun | 12h |
| MY | poskod, bandar, negeri (16 states) | +60 012-345 6789; length | **added on top**, SST, no default (a registered truck sets its rate) | `codex` | Mon | 12h |
| TH | district, province, postal code | +66 081 234 5678; length | **included**, VAT, no default (a registered truck sets 7 %) | `codex` | Sun | 24h |
| AE | area, emirate (7 emirates, Arabic names) | +971 050 123 4567; length | **included**, VAT, no default (a registered truck sets 5 %) | `codex` | Mon | 12h |

All eight rows have:
- distances in km;
- no card surcharge, no service fee, and tipping off (not customary at a food truck in any of the eight);
- the allergen card on its own allowed;
- the platform fee switched off.

Card fees are Stripe's standard domestic rates. The in-person figures copy the online ones, and Tap to Pay is 0 until Stripe Terminal is confirmed per country (F7).

**Short names** (how the country sits inside its language's sentences): Brasil, México, 日本, Singapore, 香港, Malaysia, ประเทศไทย, الإمارات.

**Pay at the truck and the order button:**

| Language | "Pay at the truck" | Order button / pay button | Plan names (Pay as you go / Unlimited) |
|---|---|---|---|
| es-MX | Pago al recoger (es-ES's word, the same in Mexico) | Hacer pedido / Pagar {amount} | Pago por uso / Ilimitado |
| pt-BR | Pague na retirada | Fazer pedido / Pagar {amount} | Sem mensalidade / Ilimitado |
| ms-MY | Bayar semasa ambil | Buat pesanan / Bayar {amount} | Tanpa yuran bulanan / Tanpa had |
| en-SG | Pay at the truck | Place order / Pay {amount} (en-GB) | Pay as you go / Unlimited |
| ja-JP | 受け取り時に支払う | 注文を確定する / {amount}を支払う | 月額無料 / 無制限 |
| zh-HK | 取餐時付款 | 確認落單 / 付款 {amount} | 免月費 / 無上限 |
| th-TH | จ่ายตอนรับอาหาร | ยืนยันการสั่งซื้อ / ชำระเงิน {amount} | ไม่มีค่ารายเดือน / ไม่จำกัด |
| ar-AE | الدفع عند الاستلام | تأكيد الطلب / ادفع {amount} | بدون رسوم شهرية / غير محدود |

No statute fixes the order button's wording in any of the eight (Germany's "zahlungspflichtig bestellen" has no equivalent). "Pro" stays "Pro" everywhere.

**Allergen sets** (`lib/allergens.ts`, labels translated per language; Admin › Countries offers "Japan 28", "Brazil 22" and "Codex 9"):
- **`jp` (28)** — Japan's Consumer Affairs Agency list: the 8 mandatory items (shrimp, crab, walnut — mandatory since April 2025 — wheat, buckwheat, egg, milk, peanut), then the 20 recommended ones, as revised in 2024 (macadamia added, matsutake removed). ⚠️ *Flag (F3):* declaring allergens is **not** legally required for food service in Japan. This is the list diners expect, not a legal duty, and the 2024 revision should be re-checked when CAA next revises it.
- **`br` (22)** — ANVISA RDC 26/2015: wheat, rye, barley, oats; crustaceans, eggs, fish, peanuts, soy, milk; ten tree nuts named one by one; natural latex. Plus lactose (RDC 136/2017). ⚠️ *Flag (F3):* this is packaged-food law. Food service follows it in practice but is not strictly bound by it.
- **`codex` (9)** — the Codex labelling standard's list (gluten, crustaceans, eggs, fish, peanuts, soy, milk, tree nuts, sulphites), which MX, SG, HK, MY, TH and the UAE adopt for packaged food. ⚠️ *Flag (F3):* Codex has been revising this list (sesame among the candidate additions). Whether a revision has been adopted, and by which of the six countries, could not be confirmed from here. Sesame is not in the set today.

**WhatsApp allergen guards.** New guard-word files cover Malay, Japanese, Chinese, Thai and Arabic (`lib/allergen-guard/{ms,ja,zh,th,ar}.json`). Spanish and Portuguese gain the Mexican and Brazilian words, and Unicode is normalised before matching. `world-countries-1.cjs` §6 checks each language: its safety questions are caught, its plain questions are not, and a tagged dish triggers the caveat in the language's own words.

**Picker, hreflang, sitemap, robots, `/llms.txt`.** The picker, hreflang, sitemap and `/llms.txt` follow `enabled`. A switched-off row is in no router pick, country menu, hreflang set, sitemap, `/llms.txt` or signup list, and its `/<code>` redirects to `/uk`. The new segments are in `lib/marketing-country.ts` (`/br /mx /jp /sg /hk /my /th /ae`). `app/robots.ts` has no per-country rule, so it needs nothing. Proved switched off by the identity harness (the eight rows added switched off change none of the 146 views) and switched on by `world-countries-1.cjs` §5.

---

## §3 · Languages

The languages were added in the order you gave. Each was translated in ten parallel parts against shared STYLE / TERMS files, then one consistency pass made it read as one product, then it was merged and registered (`lib/i18n/locales.ts`). Legal pages stay en-GB. HatchGrab never changes.

| Locale | How | Keys | translation-check | Notes |
|---|---|---|---|---|
| es-MX | sparse override of es-ES, holding only what Mexico says differently | 415 | 0 structural | menú, celular, combo, toca, ingresa, "Hacer pedido". "móvil" is banned except in "catering móvil". |
| pt-BR | full base | 5,133 | 0 structural, 0 banned | você throughout; "food truck"; "Pague na retirada" |
| ms-MY | full base | 5,133 | 0 structural | the voice of Malaysian consumer apps; "trak" |
| en-SG | sparse English override of en-GB | 5 | n/a (sparse) | "in {country}", "Cents", "Pay at the truck", +65 phone example. ⚠️ Keeps en-GB's 17 sentences that say "hatch", as en-IE / en-AU / en-NZ do (F8). |
| ja-JP | full base | 5,133 | 0 structural | キッチンカー; です/ます; ⚠️ "Powered by HatchGrab" kept in English, as Japanese shops print it (F8) |
| zh-HK | full base, Traditional | 5,133 | 0 structural | Hong Kong usage (落單, 美食車); 由 HatchGrab 提供 |
| th-TH | full base, polite | 5,133 | 0 structural | ฟู้ดทรัค; polite register without ค่ะ / ครับ particles (as Thai apps write) |
| ar-AE | full base, Modern Standard Arabic | 5,133 | 0 structural | right to left; Latin digits; جهاز النداء (buzzer); الدفع عند الاستلام |

Each base language has:
- its SEO glossary table (`docs/i18n/seo-glossary-eu.md` → `lib/i18n/glossary/*.json`);
- CLDR plurals: every plural message carries the language's own categories (Arabic's six: zero / one / two / few / many / other);
- a back-translation file (`docs/i18n/back/<locale>.json`).

The full translation-check flag tables (English left, glossary, numbers, length) are summarised below. All of them are reviewed:
- **English left:** brand and tech words only (Bluetooth, Face ID, WhatsApp Manager, eftpos, DELETE, slug).
- **Glossary:** the agreed terms in another grammatical form (e.g. أوقات الاستلام, the plural of وقت الاستلام).
- **Numbers:** a small number written as a word ("two hours" → ساعتان).

**For a native reviewer** (nothing blocking; F9):
- **ar-AE:**
  - "Shellfish" is المحار, which usually means oysters and mussels; المحاريات, or القشريات والرخويات, may be better.
  - "Tree nuts" is المكسرات الشجرية (believed to be the Gulf labelling term).
  - Order numbers appear as both "الطلب رقم {id}" and "الطلب #{id}".
  - The verbs انقر and اضغط ("click" and "press") are mixed.
- **ja-JP:** "Powered by" in English (see above).
- **th-TH:** 40 glossary flags: อีเวนต์ส่วนตัว is used for "private event" where the glossary has งานส่วนตัว.
- **All languages:** demo dish names are transliterated (e.g. دبل بيكون).

**Order-page check per language** (`languages-1-e2e.cjs --locale <l> --areas 1a --shots --engines webkit --fonts`, real fonts):
- No customer view overflows because of the language.
- The English words left on customer views are the fixture truck's own data (dish names such as "Crispy", "Dip"; the operator's notices) plus "Sorry" and "released / cleared / within" in the card-hold sentence. All of these are rendered from US fixtures that are the same in every language.

Shots: `docs/world-countries-1/<locale>/order-page-webkit-{390,1280}.png` (and the basket, status page, customer email and WhatsApp replies) for pt-BR, ms-MY, ja-JP, zh-HK, th-TH and ar-AE. es-MX and en-SG are sparse overrides that render through es-ES and en-GB, so their landing and pricing shots are in `docs/world-countries-1/`.

Also fixed: on the Japanese and Chinese landing at 390, the header's "ログイン" (log in) wrapped mid-word ("ログイ / ン"). Those two languages now wrap a nav label only at a space (`word-break: keep-all`, under `:lang(ja)` and `:lang(zh)` only).

---

## §4 · Fonts and right to left

### 4.1 Fonts (`lib/script-fonts.ts`)

Noto Sans JP, Noto Sans HK, Noto Sans Thai and Noto Sans Arabic come through `next/font`, `preload: false`, with every `@font-face` limited to its script's unicode-range. They load only on their own pages:
- on marketing pages, the root layout puts the font class on `<body>`;
- on truck surfaces, the client provider loads the module only for ja / zh / th / ar (a dynamic import), so no Latin page ever carries it.

Each stack names the Noto face **right after the brand face and before the size-adjusted fallback**, which avoids the Greek bug. `world-countries-1-screens.cjs` §1–§2 proves it in WebKit:
- the right Noto file loads on /jp, /hk, /th and /ae;
- no Noto file is requested on /uk or on /mx, /br, /my or /sg;
- the headline's stack is in the right order.

⚠️ *Found, not changed (F10):* the same client-side step does **not** exist for Greek and Bulgarian. Their Noto is set only by the server layout. A truck page whose language becomes Greek on the client (the order page, the dashboard) draws Greek in the device's own font. This predates this work and is a two-line fix in `lib/i18n/client.tsx` if you want it.

### 4.2 RTL as built

- `dir="rtl"` goes on `<html>` for ar-AE pages only: the root layout sets it for marketing pages, and the client provider sets it on truck surfaces. Every other page has no `dir` attribute; the identity harness confirms byte-identity.
- Numbers, prices, phone numbers and the brand stay readable: Latin digits; "HatchGrab" and prices as left-to-right runs inside Arabic sentences; Intl's own marks around "59 د.إ.".
- The landing page and pricing section lay out right to left (they are flex and grid, which mirror by themselves). Shots: `landing-ae-390.png`, `pricing-ae-390.png`.
- Fixed while checking: on a phone the Arabic (and Thai) plan card's name touched its subtitle, because the tight Latin line height clipped the marks above and below. Those two scripts get their natural line height back (`landing.css`, under `:lang(ar)` and `:lang(th)` only).
- The order page, dashboard and KDS in Arabic (`docs/world-countries-1/ar-AE/`):
  - The **order page** works and mirrors: back button, deal card, category tabs, price on the left, item name on the right, basket bar.
  - The **dashboard** works and mirrors: tabs, summary tiles, order cards. Two defects are visible. A few labels are cut off (the "add wait time" select shows إضافة وقت انتظا), and where the operator's own English data sits beside Arabic, the punctuation lands on the wrong side (":Size").
  - The **KDS** capture shows its loading screen, as it does in every language (it needs a live fetch). Its static layout is the same flex and grid code.

### 4.3 🔴 The decision: convert the shared components to logical properties?

Fully correct RTL needs the **~430 physical-direction classes** in shared components converted to logical ones. These are `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l/r`, `border-l/r`, and the `translate-x` used by drawers and toggles. They live in the order page, the dashboard, the KDS, Manage and the emails, and that conversion is what fixes the margins, icon positions, slide-in directions and the label cut-off above. It touches almost every shared screen, so you asked to be asked before it is made.

The options:
- (a) convert all of them now;
- (b) convert only the customer order page, status page and emails, which customers see, and leave the operator screens for later;
- (c) leave it until the UAE is switched on.

The UAE stays switched off until you decide, so nothing customer-facing depends on this today.

---

## §5 · Proof, in full

| What | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit -p .` | 0 errors |
| Build | `npm run build` | ✓ (after every change, including the last CSS) |
| Lint | `eslint` on all changed files, compared per file with the HEAD worktree | no file has more errors or warnings than at HEAD |
| The workstream | `node scripts/world-countries-1.cjs` | 177 / 177 — §0 tagline · §1 currencies, native forms, whole yen · §2 plans as data, the trial-end plan, the fee guard · §3 country settings · §4 languages (translation-check, order button, plan names, allergen labels) · §5 switched on in fixtures (landing in the language, native prices, one card, hreflang, sitemap) · §6 the WhatsApp guard · §7 right to left and the script fonts |
| Byte identity | `node scripts/world-countries-1-identity.cjs compare <HEAD capture>` | 439 / 439 — 146 views (landing, /features, /compare HTML and metadata, plans PDF, sitemap, `/llms.txt`) of all 37 live countries; tagline cut from 108 of them; the eight new rows added switched off change nothing |
| Screens and fonts | `node scripts/world-countries-1-screens.cjs` | 43 / 43 |
| Hero | `node scripts/world-countries-1-hero.cjs before / after` | shots written |
| Order pages | `languages-1-e2e.cjs` × 6 languages (ar-AE with dashboard / KDS) | 0 overflow caused by a language; English left = fixture data only |
| Messages parity | `node scripts/messages-parity.cjs` | 529,590 passed, 0 failed |
| Full sweep | `node scripts/run-harnesses.cjs` (172 harnesses) | 169 passed, 3 failed — all three fail at HEAD |

The sweep's three failures already fail at HEAD on the same check (each run in the HEAD worktree to compare):
- `schedule-graphics-places`: "…and the Feature gates the tab, the pane, the shortcut and both routes — and nothing else".
- `canada-1`: "postal code (not ZIP) in the private-event note; card terminal (not reader); in Canada-shaped frames".
- `europe-languages-1`: "de-CH: no ß anywhere".

None of them is touched by this work.

**Harnesses re-pinned** (each marked `⚠️ RE-PINNED (world-countries-1…)` with the reason; every other check unchanged):
- language-phase-0, `_lp1e-named`, language-phase-1e-tidy, `_lp1d-named` and `_lp1d2-named` (the manage API's three new data fields);
- anz-1, canada-1, ireland-2, seo-fixes, languages-1, legal-follow-ups, currency-registry, europe-settings, `_address-formats-1-after`, admin-countries-1, countries-api, country-picker-1, `_phase3-screens-us`, event-types;
- the font stubs in `_lp1e-fixtures`, `_us-readiness-us`, language-phase-0, marketing-country-parity, us-readiness and us-polish-batch, plus `_real-fonts.cjs`;
- `_messages-parity-1e` (the 35 new en-GB keys named);
- plans-data-model and marketing-country-parity (tagline).

`scripts/harnesses.json` lists `world-countries-1.cjs`. The two shared modules, the screens and hero scripts (which need a build) and the identity script (which needs a HEAD capture) are in the excluded groups with reasons.

---

## §6 · Stripe: what to check in the Dashboard, per country

HatchGrab is a UK platform. Each new country needs Connect onboarding for that country before a truck there can take cards. **Nothing below was checked from here.**

| Country | Check in the Stripe Dashboard | Platform (application) fee | Local methods → backlog (not built) |
|---|---|---|---|
| **BR** Brazil | Connect › Settings: cross-border onboarding for Brazil (BRL). Brazilian accounts need a CPF/CNPJ. | **Not allowed** — Unlimited only | Pix (invite-only at Stripe), boleto |
| **MX** Mexico | Cross-border onboarding for Mexico (MXN); RFC tax ID at onboarding. | **Not allowed** — Unlimited only | OXXO, SPEI |
| **JP** Japan | Cross-border onboarding for Japan (JPY). Japanese accounts need extra KYC (登記, kana names). JPY is zero-decimal: test one order end to end. | Allowed | Konbini, PayPay |
| **SG** Singapore | Cross-border onboarding for Singapore (SGD). | **Not allowed** — Unlimited only | PayNow, GrabPay |
| **HK** Hong Kong | Cross-border onboarding for Hong Kong (HKD). | Allowed | FPS, Octopus (not at Stripe), AlipayHK, WeChat Pay |
| **MY** Malaysia | Cross-border onboarding for Malaysia (MYR). | **Not allowed** — Unlimited only | FPX, GrabPay, Touch 'n Go |
| **TH** Thailand | Cross-border onboarding for Thailand (THB). **Stripe Thailand may need Stripe sales** to enable a cross-border platform. | **Not allowed** — Unlimited only | PromptPay, TrueMoney |
| **AE** UAE | Cross-border onboarding for the UAE (AED). **Stays switched off until you decide.** | Allowed | — |

For every country also check:
- `defaults.currency` on a test connected account is the country's currency.
- Apple Pay domain verification for the HatchGrab domain on that account.
- Card payments work with manual capture (every card order is a hold, then captured).
- Stripe Terminal / Tap to Pay availability. The rows copy the online card fee into the in-person fields and set Tap to Pay to 0 until this is confirmed (F7).

## §7 · Backlog (not built)

- **Local wallets and methods**, per the table above: Pix, boleto, OXXO, SPEI, Konbini, PayPay, PayNow, GrabPay, FPS, AlipayHK, WeChat Pay, FPX, Touch 'n Go, PromptPay, TrueMoney.
- Billing for Unlimited in the five Unlimited-only countries (F1). *World-countries-2 (1 Nov): the wording now says "we'll be in touch before then to set up payment"; collecting the payment is still by hand.*
- Logical-property RTL conversion (§4.3). **Decided by Dominic, 1 November 2026 (F11): leave it until the UAE is switched on.** Nothing changed.
- ~~Greek and Bulgarian client-side font class (F10).~~ Done in world-countries-2.
- Half-yen display in event pricing (§1.1).

## §8 · Flags

| # | What | Needs |
|---|---|---|
| F1 | In BR / MX / MY / SG / TH a finished trial lands on Unlimited, and nothing bills it, so the truck earns HatchGrab nothing until it is invoiced. The popup ("billing only starts when you choose a plan") and the banner ("you move to Unlimited at R$149 a month") read as a contradiction there. | Wording resolved in world-countries-2 (docs/world-countries-2-report.md §2); payment set up by hand. |
| F2 | Terms §4 promises a plan with no monthly fee (after the trial and after a failed payment). None exists in the five countries. | Resolved in world-countries-2 (§1): Terms §4 reworded, eight country sections added. |
| F3 | Allergen sets: Japan's isn't legally required for food service; Brazil's is packaged-food law; whether a Codex revision (e.g. adding sesame) applies in each of the six countries is unchecked. | Accepted as built (Dominic, 1 Nov). |
| F4 | Tax: BR, SG, TH and AE have no default rate (a registered truck sets its own); MY adds SST on top; MX includes IVA 16 %; JP includes 消費税 8 %; HK has none. | Accepted as built (Dominic, 1 Nov). |
| F5 | MYR prints "RM 29" (Intl's form, with a space); Malaysian menus use both. JPY uses the full-width ￥. | Resolved in world-countries-2 (§3): "RM29", "¥". |
| F6 | Event pricing can store half a yen (shown and charged as the same whole yen); no "nearest ￥10" rounding. | Accepted as built (Dominic, 1 Nov); backlog. |
| F7 | Card fees are Stripe's standard online rates, copied into the in-person fields; Tap to Pay is 0 until confirmed. | Accepted as built (Dominic, 1 Nov). |
| F8 | en-SG keeps en-GB's "hatch" in 17 sentences (as en-IE, en-AU and en-NZ do); ja-JP keeps "Powered by" in English. | Resolved in world-countries-2 (§4). |
| F9 | Native-reviewer list (§3). | Accepted as built (Dominic, 1 Nov). |
| F10 | Greek and Bulgarian truck pages switched on the client don't load Noto. This predates this work. | Resolved in world-countries-2 (§5). |
| F11 | RTL logical-property conversion (§4.3). | **Decided (Dominic, 1 Nov): wait until the UAE is switched on.** Backlog. |

## §9 · How to switch each country on (when you decide)

1. Run block A (`20261054`), deploy this code, then run block B (`20261055`). All eight rows go in switched off.
2. Run the short check queries at the foot of each file.
3. Stripe: the checks in §6 for that country, and a hidden test truck end to end (sign up, menu, one card order, one pay-at-the-truck order, a refund). For **JP**, also check the order total, the receipt and the PDF show whole yen.
4. Terms: a country section in `content/legal/country-specific-terms.md`. For the five Unlimited-only countries, the Terms wording also needs a decision, because today's §4 says a finished trial "moves to our plan with no monthly fee" (F2).
5. Admin › Countries: switch the country on. The world guard refuses this if the country's trial-end plan isn't offered there.
6. **UAE:** stays off until you decide (and see §4.3).

## §10 · Files changed

**App and components** — `app/layout.tsx`, `app/globals.css` (script-font stacks; `dir` and body font class), `app/landing/page.tsx`, `app/landing/landing.css` (tagline; CTA gap; ja/zh nav wrap; ar/th plan card), `app/admin/page.tsx`, `app/api/admin/route.ts`, `app/api/orders/submit/route.ts`, `app/api/dashboard/action/route.ts`, `app/dashboard/[token]/page.tsx`, `app/manage/[token]/page.tsx`, `app/trucks/[slug]/order/page.tsx`, `components/admin/CountriesTab.tsx`, `components/dashboard/AddOrderPanel.tsx`, `components/landing/LandingFooter.tsx`, `components/manage/ChargesCard.tsx`, `components/pricing/PricingSection.tsx`.

**Library** — `lib/currencies.ts`, `lib/money-format.ts`, `lib/order-repricing.ts`, `lib/payments/ledger.ts`, `lib/payments/promote-draft.ts`, `lib/seed-demo-orders.ts`, `lib/plans.ts`, `lib/plans-server.ts`, `lib/plan-offer.ts`, `lib/plans-pdf.ts`, `lib/llms-text.ts`, `lib/country-settings.ts`, `lib/country-settings-types.ts`, `lib/order-charge-rules.ts`, `lib/admin/country-form.ts`, `lib/admin/country-actions.ts`, `lib/admin/country-store.ts`, `lib/address-formats.ts`, `lib/allergens.ts`, `lib/allergen-guard.ts`, `lib/allergen-guard/{en,es,pt}.json` and new `{ms,ja,zh,th,ar}.json`, `lib/marketing-country.ts`, `lib/script-fonts.ts` (new), `lib/i18n/locales.ts`, `lib/i18n/client.tsx`, `lib/i18n/glossary/*.json` (new: es-MX, pt-BR, ms, ja, zh, th, ar), and the generated `lib/i18n/locale-files.ts` and `lib/i18n/catalog/*` and `messages/ns/*` (split-messages).

**Messages** — new `messages/{es-MX,pt-BR,ms-MY,en-SG,ja-JP,zh-HK,th-TH,ar-AE}.json`; `en-GB` (+35 keys, −2 tagline keys), `en-US`, `en-AU` and all 22 existing languages (the 35 keys translated, the tagline removed); back-translations `docs/i18n/back/*.json`.

**Database (NOT RUN)** — `supabase/migrations/20261054_world_countries_1_schema.sql`, `supabase/migrations/20261055_world_countries_1_rows.sql`.

**Public** — `public/logos/hatchgrab-share-card.png`.

**Docs** — `docs/i18n/seo-glossary-eu.md` (seven new tables), `docs/i18n/world-countries-1-progress.md`, this report, `docs/world-countries-1/` (every screenshot).

**Scripts** — new: `world-countries-1.cjs`, `_world-countries-1-fixtures.cjs`, `world-countries-1-identity.cjs`, `world-countries-1-hero.cjs`, `world-countries-1-screens.cjs`, `_lp-tagline.cjs`. Changed: `glossary-build.cjs`, `translation-check.cjs`, `_real-fonts.cjs`, `harnesses.json`, the three `scripts/fixtures/language-phase-1*-us-changed.txt` lists, and the re-pinned harnesses in §5.

---

## §11 · NOT RUN SQL

Both blocks are NOT RUN, and nothing in this workstream touched the database. Run A, deploy, then run B. The code reads every new column tolerantly, so it may be deployed before A. Without the columns, every country reads as "platform fee allowed", every price row as offered and none as a trial end, which is exactly today's behaviour.

### Block A — `supabase/migrations/20261054_world_countries_1_schema.sql`

```sql
-- supabase/migrations/20261054_world_countries_1_schema.sql — world-countries-1 BLOCK A (31 October 2026,
-- docs/world-countries-1-report.md §1–§2). ⛔ NOT RUN — Dominic runs it. Run it BEFORE block B (20261055).
-- The code reads every part tolerantly, so it may deploy before this runs: without the new columns every country reads as
-- "platform fee allowed", every price row as "offered" and none as a trial end — exactly today's behaviour.
--
-- 1 · country_settings_currency_chk — the registry's 22 codes (lib/currencies.ts): + BRL MXN JPY SGD HKD MYR AED THB.
-- 2 · country_settings_address_format_chk — + br mx jp sg hk my th ae (lib/address-formats.ts WORLD_ROWS).
-- 3 · country_settings_allergen_set_chk — + jp (Japan's CAA list), br (ANVISA RDC 26/2015 + lactose), codex (the Codex list).
-- 4 · country_settings.platform_fee_allowed — may HatchGrab take a platform (application) fee in this country at all? Default
--     true (every existing row). False for BR MX MY SG TH (block B): Stripe does not let a platform outside those countries
--     collect an application fee on their connected accounts. The CHECK refuses platform_fee_enabled without it, so the fee can
--     never be switched on there by mistake.
-- 5 · plan_prices.offered — a price row may exist and be SWITCHED OFF: its prices are kept, but no page offers the plan. Default
--     true (every existing row). The switch-on triggers are unchanged (they ask for a ROW per public plan, offered or not).
-- 6 · plan_prices.is_trial_end — the plan a truck in that country drops to when its trial (or any plan) ends; at most one per
--     country, and only an offered row. No flagged row = the plans table's expiry fallback (Pay as you go), as today.
-- 7 · plan_prices_world_guard (a trigger on country_settings and plan_prices) refuses:
--     a) an OFFERED row that charges a fee (fee_bps > 0) in a country where platform_fee_allowed is false;
--     b) a SWITCHED-ON country whose trial-end plan (its flagged row's, else the expiry fallback) is not offered there.

begin;

-- 1 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.country_settings drop constraint if exists country_settings_currency_chk;
alter table public.country_settings add constraint country_settings_currency_chk
  check (currency in ('GBP', 'USD', 'EUR', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON',
                      'BRL', 'MXN', 'JPY', 'SGD', 'HKD', 'MYR', 'AED', 'THB'));

-- 2 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.country_settings drop constraint if exists country_settings_address_format_chk;
alter table public.country_settings add constraint country_settings_address_format_chk
  check (address_format in ('gb', 'us', 'ie', 'au', 'nz', 'ca', 'fr', 'at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'de', 'gi',
                            'gr', 'hu', 'it', 'lv', 'li', 'lt', 'lu', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se', 'ch',
                            'br', 'mx', 'jp', 'sg', 'hk', 'my', 'th', 'ae'));

-- 3 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.country_settings drop constraint if exists country_settings_allergen_set_chk;
alter table public.country_settings add constraint country_settings_allergen_set_chk
  check (allergen_set in ('uk14', 'us9', 'anz', 'ca', 'jp', 'br', 'codex'));

-- 4 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.country_settings add column if not exists platform_fee_allowed boolean not null default true;
comment on column public.country_settings.platform_fee_allowed is
  'world-countries-1: may HatchGrab take a platform (application) fee here? false where Stripe forbids it (BR MX MY SG TH). Overrides platform_fee_enabled (lib/country-settings-types.ts platformFeeOn).';
alter table public.country_settings drop constraint if exists country_settings_platform_fee_allowed_chk;
alter table public.country_settings add constraint country_settings_platform_fee_allowed_chk
  check (platform_fee_allowed or not platform_fee_enabled);

-- 5, 6 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.plan_prices add column if not exists offered boolean not null default true;
alter table public.plan_prices add column if not exists is_trial_end boolean not null default false;
comment on column public.plan_prices.offered is
  'world-countries-1: false = the row is kept but the plan is not offered in this country (no page, prompt or choice shows it).';
comment on column public.plan_prices.is_trial_end is
  'world-countries-1: the plan a truck in this country drops to when its plan ends (at most one per country). None = plans.is_expiry_fallback.';
alter table public.plan_prices drop constraint if exists plan_prices_trial_end_offered_chk;
alter table public.plan_prices add constraint plan_prices_trial_end_offered_chk check (offered or not is_trial_end);
create unique index if not exists plan_prices_one_trial_end_per_country on public.plan_prices (country_code) where is_trial_end;

-- 7 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.plan_prices_world_guard()
returns trigger language plpgsql set search_path to 'public' as $$
declare bad text;
begin
  -- a) an offered row that charges a fee where HatchGrab may not take one
  select string_agg(pp.country_code || ' (' || pp.plan_key || ')', ', ' order by pp.country_code, pp.plan_key) into bad
    from public.plan_prices pp join public.country_settings cs on cs.country_code = pp.country_code
   where pp.offered and pp.fee_bps > 0 and not cs.platform_fee_allowed;
  if bad is not null then
    raise exception 'plan_prices: these offered plans charge a platform fee where HatchGrab may not take one: %', bad
      using errcode = 'check_violation';
  end if;
  -- b) a switched-on country whose trial-end plan is not offered there
  select string_agg(cs.country_code, ', ' order by cs.country_code) into bad
    from public.country_settings cs
   where cs.enabled
     and not exists (
       select 1 from public.plan_prices pp
        where pp.country_code = cs.country_code and pp.offered
          and pp.plan_key = coalesce(
                (select t.plan_key from public.plan_prices t where t.country_code = cs.country_code and t.is_trial_end),
                (select p.key from public.plans p where p.is_expiry_fallback)));
  if bad is not null then
    raise exception 'country_settings: the plan a finished trial drops to is not offered in: %', bad
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

-- A trigger function, never called directly: revoked from every client role (the project's rule for every function create).
revoke all on function public.plan_prices_world_guard() from public, anon, authenticated;

drop trigger if exists country_settings_world_guard on public.country_settings;
create trigger country_settings_world_guard after insert or update on public.country_settings
  for each statement execute function public.plan_prices_world_guard();
drop trigger if exists plan_prices_world_guard on public.plan_prices;
create trigger plan_prices_world_guard after insert or update or delete on public.plan_prices
  for each statement execute function public.plan_prices_world_guard();

commit;

-- Check (read-only):
--   select pg_get_constraintdef(oid) from pg_constraint where conname in ('country_settings_currency_chk',
--     'country_settings_address_format_chk', 'country_settings_allergen_set_chk', 'country_settings_platform_fee_allowed_chk',
--     'plan_prices_trial_end_offered_chk');
--   select count(*) filter (where platform_fee_allowed) as allowed, count(*) as rows from public.country_settings;   -- 36 / 36
--   select count(*) filter (where offered) as offered, count(*) filter (where is_trial_end) as trial_end from public.plan_prices;
--   select tgname from pg_trigger where tgname in ('country_settings_world_guard', 'plan_prices_world_guard');
```

### Block B — `supabase/migrations/20261055_world_countries_1_rows.sql`

```sql
-- supabase/migrations/20261055_world_countries_1_rows.sql — world-countries-1 BLOCK B (31 October 2026,
-- docs/world-countries-1-report.md §1–§2). ⛔ NOT RUN — Dominic runs it, AFTER block A (20261054) and after the code is deployed
-- (the deployed code is what reads the new currencies, address formats and allergen sets; a row it cannot read is left out of
-- every list and named on Admin › Countries, never a broken page).
-- Eight countries, every one SWITCHED OFF (enabled = false): each /<code> keeps redirecting to /uk, and the country is in no
-- router pick, hreflang set, sitemap, menu, /llms.txt or signup list until Dominic switches it on in Admin › Countries.
-- Rows before prices (plan_prices references country_settings).
--
-- Common to every row (each sourced in the report §2): km; phone check 'length' (each example is libphonenumber's own mobile
-- example, which the app's check accepts); NO card surcharge, NO service fee, tipping off (not customary at a food truck in any
-- of the eight); the allergen card on its own allowed; the platform fee switched off. Card fees: Stripe's standard domestic card
-- rate for each country (the pricing research, docs/pricing-research-1-report.md); the in-person figures copy the online ones
-- and Tap to Pay is 0 until Stripe Terminal / Tap to Pay availability is confirmed per country (report §2, flagged).
-- short_name is each country's own name, as it sits inside that language's sentences.
-- 🔴 platform_fee_allowed = false for BR, MX, MY, SG and TH: Stripe does not let a platform outside those countries collect an
-- application fee on their connected accounts. There, Pay as you go and Pro are kept as rows but NOT OFFERED (offered = false),
-- and Unlimited is the trial-end plan (is_trial_end = true): a finished trial drops to Unlimited, never to a plan that charges a fee.
-- 🔴 JPY IS ZERO-DECIMAL: its minor unit is ONE YEN, so ¥1,980 is 1980 (not 198000).
begin;

insert into public.country_settings (
  country_code, name, enabled, currency, locale, time_format, date_order, week_start,
  phone_country_code, address_format, timezones, default_timezone,
  prices_include_tax, tax_label,
  card_surcharge_allowed, card_surcharge_cap_pct, card_surcharge_credit_only, card_surcharge_excluded_regions,
  service_fee_allowed, tipping_enabled_default, tip_presets_pct, allergen_set,
  starter_monthly_minor, pro_monthly_minor, max_monthly_minor, pro_allowance_minor, max_allowance_minor, platform_fee_pct,
  card_fee_online_pct, card_fee_online_fixed_minor, card_fee_in_person_pct, card_fee_in_person_fixed_minor,
  tap_to_pay_fixed_minor, card_fee_region_label,
  competitor_name, competitor_pct, competitor_fixed_minor, support_hours, updated_by,
  short_name, phone_example, phone_check, distance_unit,
  service_fee_recipient, service_fee_hatchgrab_bps, service_fee_hatchgrab_fixed_minor,
  service_fee_truck_max_bps, service_fee_truck_max_fixed_minor,
  platform_fee_enabled, fees_taxed, allergen_card_only_allowed, platform_fee_allowed
) values
  -- Brazil: BRL, pt-BR, prices include taxes (the truck sets its own rate, none by default), ANVISA list, cards 3.99% + R$0,39, NO platform fee (Stripe)
  ('BR', 'Brazil', false, 'BRL', 'pt-BR', '24h', 'dmy', 'sunday', '55', 'br', array['America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza', 'America/Recife', 'America/Maceio', 'America/Belem', 'America/Araguaina', 'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho', 'America/Boa_Vista', 'America/Rio_Branco', 'America/Noronha'], 'America/Sao_Paulo', true, 'Tributos', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'br', null, null, null, null, null, null, 3.99, 39, 3.99, 39, 0, 'Brazilian cards', null, null, null, null, 'world-countries-1 draft', 'Brasil', '(11) 96123-4567', 'length', 'km', 'truck', null, null, null, null, false, false, true, false),
  -- Mexico: MXN, es-MX, IVA 16 % included (data on the mx format), Codex list, cards 3.6% + MX$3, NO platform fee (Stripe)
  ('MX', 'Mexico', false, 'MXN', 'es-MX', '12h', 'dmy', 'sunday', '52', 'mx', array['America/Mexico_City', 'America/Cancun', 'America/Merida', 'America/Monterrey', 'America/Matamoros', 'America/Chihuahua', 'America/Ciudad_Juarez', 'America/Ojinaga', 'America/Mazatlan', 'America/Bahia_Banderas', 'America/Hermosillo', 'America/Tijuana'], 'America/Mexico_City', true, 'IVA', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'codex', null, null, null, null, null, null, 3.60, 300, 3.60, 300, 0, 'Mexican cards', null, null, null, null, 'world-countries-1 draft', 'México', '222 123 4567', 'length', 'km', 'truck', null, null, null, null, false, false, true, false),
  -- Japan: JPY (zero-decimal: minor units are whole yen), ja-JP, 消費税 8 % included on takeaway (data on the jp format), the CAA list, cards 3.6%
  ('JP', 'Japan', false, 'JPY', 'ja-JP', '24h', 'dmy', 'sunday', '81', 'jp', array['Asia/Tokyo'], 'Asia/Tokyo', true, '消費税', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'jp', null, null, null, null, null, null, 3.60, 0, 3.60, 0, 0, 'Japanese cards', null, null, null, null, 'world-countries-1 draft', '日本', '090-1234-5678', 'length', 'km', 'truck', null, null, null, null, false, false, true, true),
  -- Singapore: SGD, en-SG, prices include GST (a registered truck sets 9 %; none by default), Codex list, cards 3.4% + S$0.50, NO platform fee (Stripe)
  ('SG', 'Singapore', false, 'SGD', 'en-SG', '12h', 'dmy', 'sunday', '65', 'sg', array['Asia/Singapore'], 'Asia/Singapore', true, 'GST', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'codex', null, null, null, null, null, null, 3.40, 50, 3.40, 50, 0, 'Singapore cards', null, null, null, null, 'world-countries-1 draft', 'Singapore', '8123 4567', 'length', 'km', 'truck', null, null, null, null, false, false, true, false),
  -- Hong Kong: HKD, zh-HK, no sales tax, Codex list, cards 3.4% + HK$2.35
  ('HK', 'Hong Kong', false, 'HKD', 'zh-HK', '12h', 'dmy', 'sunday', '852', 'hk', array['Asia/Hong_Kong'], 'Asia/Hong_Kong', true, 'Tax', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'codex', null, null, null, null, null, null, 3.40, 235, 3.40, 235, 0, 'Hong Kong cards', null, null, null, null, 'world-countries-1 draft', '香港', '5123 4567', 'length', 'km', 'truck', null, null, null, null, false, false, true, true),
  -- Malaysia: MYR, ms-MY, SST ADDED on top where a truck is registered (rate 0 until it sets one), Codex list, cards 3% + RM1, NO platform fee (Stripe)
  ('MY', 'Malaysia', false, 'MYR', 'ms-MY', '12h', 'dmy', 'monday', '60', 'my', array['Asia/Kuala_Lumpur', 'Asia/Kuching'], 'Asia/Kuala_Lumpur', false, 'SST', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'codex', null, null, null, null, null, null, 3.00, 100, 3.00, 100, 0, 'Malaysian cards', null, null, null, null, 'world-countries-1 draft', 'Malaysia', '012-345 6789', 'length', 'km', 'truck', null, null, null, null, false, false, true, false),
  -- Thailand: THB, th-TH, prices include VAT (a registered truck sets 7 %; none by default), Codex list, cards 3.65% + ฿10, NO platform fee (Stripe)
  ('TH', 'Thailand', false, 'THB', 'th-TH', '24h', 'dmy', 'sunday', '66', 'th', array['Asia/Bangkok'], 'Asia/Bangkok', true, 'VAT', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'codex', null, null, null, null, null, null, 3.65, 1000, 3.65, 1000, 0, 'Thai cards', null, null, null, null, 'world-countries-1 draft', 'ประเทศไทย', '081 234 5678', 'length', 'km', 'truck', null, null, null, null, false, false, true, false),
  -- United Arab Emirates: AED, ar-AE (right to left), prices include VAT (a registered truck sets 5 %; none by default), Codex list, cards 2.9% + AED 1 — stays off until Dominic decides
  ('AE', 'United Arab Emirates', false, 'AED', 'ar-AE', '12h', 'dmy', 'monday', '971', 'ae', array['Asia/Dubai'], 'Asia/Dubai', true, 'VAT', false, null, false, '{}'::text[], false, false, '{}'::numeric[], 'codex', null, null, null, null, null, null, 2.90, 100, 2.90, 100, 0, 'UAE cards', null, null, null, null, 'world-countries-1 draft', 'الإمارات', '050 123 4567', 'length', 'km', 'truck', null, null, null, null, false, false, true, true);

insert into public.plan_prices (plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor, offered, is_trial_end) values
  ('payg', 'BR', 0, 0, 99, 0, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('pro', 'BR', 5900, 800000, 99, 5900, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('unlimited', 'BR', 14900, null, 0, 14900, true, true),   -- the trial-end plan: a finished trial drops to Unlimited
  ('payg', 'MX', 0, 0, 99, 0, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('pro', 'MX', 34900, 5000000, 99, 34900, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('unlimited', 'MX', 84900, null, 0, 84900, true, true),   -- the trial-end plan: a finished trial drops to Unlimited
  ('payg', 'JP', 0, 0, 99, 0, true, false),
  ('pro', 'JP', 1980, 250000, 99, 1980, true, false),
  ('unlimited', 'JP', 2980, null, 0, 2980, true, false),
  ('payg', 'SG', 0, 0, 99, 0, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('pro', 'SG', 2900, 400000, 99, 2900, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('unlimited', 'SG', 5900, null, 0, 5900, true, true),   -- the trial-end plan: a finished trial drops to Unlimited
  ('payg', 'HK', 0, 0, 99, 0, true, false),
  ('pro', 'HK', 11900, 1500000, 99, 11900, true, false),
  ('unlimited', 'HK', 26900, null, 0, 26900, true, false),
  ('payg', 'MY', 0, 0, 99, 0, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('pro', 'MY', 2900, 400000, 99, 2900, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('unlimited', 'MY', 6900, null, 0, 6900, true, true),   -- the trial-end plan: a finished trial drops to Unlimited
  ('payg', 'TH', 0, 0, 99, 0, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('pro', 'TH', 19900, 2500000, 99, 19900, false, false),   -- not offered: no platform fee here (Unlimited only)
  ('unlimited', 'TH', 44900, null, 0, 44900, true, true),   -- the trial-end plan: a finished trial drops to Unlimited
  ('payg', 'AE', 0, 0, 99, 0, true, false),
  ('pro', 'AE', 5900, 800000, 99, 5900, true, false),
  ('unlimited', 'AE', 14900, null, 0, 14900, true, false);

commit;

-- Check (read-only):
--   select country_code, enabled, currency, locale, short_name, allergen_set, platform_fee_allowed from public.country_settings
--    where country_code in ('BR','MX','JP','SG','HK','MY','TH','AE') order by country_code;   -- 8 rows, all enabled = false
--   select country_code, plan_key, monthly_minor, included_online_minor, fee_bps, offered, is_trial_end from public.plan_prices
--    where country_code in ('BR','MX','JP','SG','HK','MY','TH','AE') order by country_code, plan_key;   -- 24 rows
```

## Undo (only if Dominic asks)

Undo B first, then A. B's undo removes only the eight new countries' rows. A's undo restores the CHECKs exactly as they were before (14 currencies; the 36 address formats; uk14 / us9 / anz / ca).

```sql
-- Undo block B
begin;
delete from public.plan_prices where country_code in ('BR','MX','JP','SG','HK','MY','TH','AE');
delete from public.country_settings where country_code in ('BR','MX','JP','SG','HK','MY','TH','AE');
commit;
```

```sql
-- Undo block A (only after block B is undone)
begin;
drop trigger if exists country_settings_world_guard on public.country_settings;
drop trigger if exists plan_prices_world_guard on public.plan_prices;
drop function if exists public.plan_prices_world_guard();
drop index if exists public.plan_prices_one_trial_end_per_country;
alter table public.plan_prices drop constraint if exists plan_prices_trial_end_offered_chk;
alter table public.plan_prices drop column if exists is_trial_end;
alter table public.plan_prices drop column if exists offered;
alter table public.country_settings drop constraint if exists country_settings_platform_fee_allowed_chk;
alter table public.country_settings drop column if exists platform_fee_allowed;
alter table public.country_settings drop constraint if exists country_settings_allergen_set_chk;
alter table public.country_settings add constraint country_settings_allergen_set_chk
  check (allergen_set in ('uk14', 'us9', 'anz', 'ca'));
alter table public.country_settings drop constraint if exists country_settings_address_format_chk;
alter table public.country_settings add constraint country_settings_address_format_chk
  check (address_format in ('gb', 'us', 'ie', 'au', 'nz', 'ca', 'fr', 'at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'de', 'gi',
                            'gr', 'hu', 'it', 'lv', 'li', 'lt', 'lu', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se', 'ch'));
alter table public.country_settings drop constraint if exists country_settings_currency_chk;
alter table public.country_settings add constraint country_settings_currency_chk
  check (currency in ('GBP', 'USD', 'EUR', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON'));
commit;
```
