# pricing-copy-1 — the plan wording, in every language

11 November 2026 · on main, local only, **not pushed, not deployed** · no database writes · Pizzeria Gusto not touched.

## Summary

- **Done, as asked, in all 61 locale files that carry these strings** (39 language bases plus the English, Spanish and French variants that have their own banner text):
  1. The banner sentence "Prefer to take payment up front? Add online card payments any time." is **deleted** from `pricing.banner.body` and `pricing.banner.bodyOnly`, and its translation from every locale. Nothing else in those strings changed.
  2. The Pay as you go card (`pricing.fee.feeOnly`) now reads **"<b>{fee}</b> on online orders only. Walk-up orders are always free."** — no asterisk, no "card". Each translation was edited minimally: the asterisk and the word for "card" dropped, nothing retranslated.
  3. `compare.plan.summaryFeeOnly`: "online card orders" → "online orders" in **both** branches, every locale.
  4. The same Pay as you go fee line, found in three more places and changed the same way: `compare.orders.feeOnly` (/compare's orders card), `comparison.costs.feeOnly` (the comparison pages) and /llms.txt's Pay as you go line.
- **Pro, Unlimited, their asterisks, the footnote and the plan table's fee row are untouched** in every locale. The harness checks this key by key.
- **Places I did NOT change and need your decision** (§3): the plan table's fee row (shared by all three plans), the 3 published FAQ answers (database rows), Pay as you go's plan description (database row), the terms' fee clause, and an Admin › FAQ helper line.
- Split / catalog generation, translation-check (73 locales, 0 structural), messages-split, messages-parity and the RTL check all **pass**. The new harness `scripts/pricing-copy-1.cjs` passes, **1,391 checks**.
- Full sweep (a clean worktree at `d71bf0bd`): **212 run · 192 passed · 20 failed**.
  - The 20 are the same harnesses that failed before this work, each with **exactly the same failing checks as at the parent commit `280fd2e3`**: languages-world-1's open items, as listed in billing-2's report.
  - **No failure is pricing-copy-1's.**

**Flag — another session is working in this tree.** While I worked, a billing-3 session committed to main (`b3db1644`, `280fd2e3`) and left uncommitted edits in `lib/billing/*`, `components/manage/BillingScreen.tsx`, `app/api/manage/billing/route.ts`, `lib/plans.ts`, a new migration `20261090_billing_3_trial_plan.sql`, and **new `billing.*` keys in `messages/en-GB.json`**.
- I touched none of it.
- It has since committed (`b9b13b65`, `fcdbf6b1`, on top of my first commit). Its commit kept my strings: I checked HEAD's en-GB.
- `messages/en-GB.json` is the one file we share. I staged it as HEAD's file plus my six keys only, so **none of billing-3's uncommitted keys are in my commit**; its edits are still in the working tree.
- I ran the sweep in a clean worktree at my last commit so their unfinished work could not mix in.

## 1 · The prompt
- Nothing arrived garbled.
- No instructions contradicted each other.
- One reading: your key names are shorthand for the real paths, and the mapping is unambiguous:
  - `pricing.body` → `pricing.banner.body`
  - `pricing.bodyOnly` → `pricing.banner.bodyOnly`
  - `pricing.feeOnly` → `pricing.fee.feeOnly`
  - `compare.summaryFeeOnly` → `compare.plan.summaryFeeOnly`

## 2 · Every place changed (en-GB shown; every locale changed the same way — Appendix)

| # | Where it shows | Key / file | Before | After |
|---|---|---|---|---|
| 1 | Landing pricing banner (every /<country>), and the plans PDF's banner | `pricing.banner.body` | "…without connecting a card processor at all. **Prefer to take payment up front? Add online card payments any time.** When your trial ends you move to <u>Pay as you go</u> — no monthly fee — unless you choose a plan. No card to start, no contract, cancel anytime." | "…without connecting a card processor at all. When your trial ends you move to <u>Pay as you go</u> — no monthly fee — unless you choose a plan. No card to start, no contract, cancel anytime." |
| 2 | The same banner where the trial ends into a paid plan, and the PDF | `pricing.banner.bodyOnly` | "…card processor at all. **Prefer to take payment up front? Add online card payments any time.** When your trial ends, <u>{plan}</u> is {price} a month. …" | "…card processor at all. When your trial ends, <u>{plan}</u> is {price} a month. …" |
| 3 | The Pay as you go card: landing pricing section, and the plans PDF's cards | `pricing.fee.feeOnly` | "<b>0.99%*</b> on online card orders only. Walk-up orders are always free." | "<b>0.99%</b> on online orders only. Walk-up orders are always free." |
| 4 | /compare's "We suggest Pay as you go" panel | `compare.plan.summaryFeeOnly` | "{price} per truck per month, plus {pct} on online card orders." / "No monthly fee — {pct} on online card orders only." | "…plus {pct} on online orders." / "No monthly fee — {pct} on online orders only." |
| 5 | /compare's orders card fee line, when Pay as you go is the plan shown | `compare.orders.feeOnly` | "0.99% on every online card order — **£24.75** a month per truck." | "0.99% on every online order — **£24.75** a month per truck." |
| 6 | Comparison pages (HatchGrab vs …): our order-fee cell and our cost line for Pay as you go | `comparison.costs.feeOnly` | "0.99% per online card order" | "0.99% per online order" |
| 7 | /llms.txt, each country's Pay as you go line (English) | `lib/llms-text.ts:141` | "- Pay as you go: £0 per truck per month. 0.99% on online card orders." | "- Pay as you go: £0 per truck per month. 0.99% on online orders." |

- Item 5 says "card order", singular, and has no asterisk.
- Items 5 and 6 are the same edit as item 3 (the word for "card" dropped), so I applied it.
- /features and the Manage › Billing plan table use **no** Pay as you go fee sentence of their own. They show the plan table, whose fee row is listed in §3.

## 3 · Places I did not change — your decision

| Place | Text now | Why I did not change it |
|---|---|---|
| **Plan table fee row** — /features, the plan table in Manage › Billing, and the plans PDF's table (`planTable.pay.fee`, every locale) | "HatchGrab fee on online card orders*" — one row label, with cells 0.99% / 0.99% after £4,000 / none | **The label is shared by all three plans.** Dropping "card" and the asterisk would change Pro's and Unlimited's row too, which the brief says keep exactly. Options: (a) leave it; (b) a separate Pay as you go wording would need a new cell note, which is a layout change. |
| **Published FAQ answers** — database rows, not code: `faq_items` …0001, …0002 and …0005, plus their `faq_translations` | "{payg.name} charges {payg.fee} on online card orders." · "On online card orders, {payg.name} charges {payg.fee}, and {pro.name} charges {pro.fee}…" · "You only pay {payg.fee} on online card orders when you take them." | The FAQ isn't seed text in code; it's live rows, edited in Admin › FAQ and re-translated on publish. **…0002 mixes Pay as you go and Pro in one clause**, so "the same change" would also reword Pro's. That is a content edit to live rows, which I'm not authorised to make. |
| **Pay as you go's plan description** — `plans.description`, a core-table row shown on Manage's current-plan card and in Admin | "No monthly fee. You only pay when a customer pays online by card." | A database row in a core table (I ask before changing those), and a different sentence from the three above. Suggested, if you want it: "No monthly fee. You only pay when a customer orders online." |
| **Terms of use** — `content/legal/terms-and-conditions.md` §fees, line 70 | "**HatchGrab fees on online card orders.** Depending on your plan, we charge a stated percentage of the value of online orders your customers pay for by card…" | Legal text, and the clause covers every plan. ⚠️ **It now disagrees with the site:** the cards say the fee is on online orders, while the terms say orders "your customers pay for by card". Under billing-1 the fee is charged on pre-orders paid at collection too. Worth aligning in the next terms change. |
| Admin › FAQ token help (`lib/faq/live-values.ts:110`) | "{K.fee} — Its fee on online card orders, as a percentage" | Not a public page; describes the token for every plan. |
| /llms.txt's general fee paragraph (`lib/llms-text.ts:87`) and Pro's line (`:142`) | "The HatchGrab fee is 0.99% of online card orders, on the plans that charge one…" · "…then 0.99% on online card orders." | The first covers every plan and the second is Pro's, both of which keep their text. |
| The footnote (`pricing.footnote`) | "* Plus Stripe's card processing on online card orders (currently …)…" | Kept exactly, as asked. I checked live `plan_prices`: every switched-on country that offers Pay as you go also offers Pro with its asterisked fee, so the footnote always has a referent on the cards. BR, MX, MY, SG and TH show Unlimited only, and nothing changes there. |

## 4 · How the edits were made
- One script made text-level replacements in the 61 `messages/*.json` files, so formatting and key order are unchanged.
  - Each banner's deleted span was found from that locale's own text: the 2nd sentence, a question, plus the 3rd, "add card payments any time".
  - Japanese and Thai write it without a question mark, so I named their sentences by hand. Greek uses ";" as its question mark. Turkish's first sentence contains ";", so its sentence was also named by hand.
  - The word for "card" was dropped per language with a fixed pair list. Where dropping it left an odd phrase, the nearest existing word was used instead:
    - Estonian "veebis kaardiga makstud tellimustelt" → "veebitellimustelt"
    - Finnish "kortilla maksetuista verkkotilauksista" → "verkkotilauksista"
    - Lithuanian "internetu kortele apmokėtą užsakymą" → "internetinį užsakymą"
    - German "Online-Kartenbestellung" → "Online-Bestellung"
    - Arabic "طلبات الدفع بالبطاقة" → "الطلبات"
    - Chinese 網上信用卡訂單 → 網上訂單, 線上刷卡訂單 → 線上訂單
  - Nothing else was retranslated.
- Back-translations (`docs/i18n/back/*.json`, 51 files) were edited the same way: the sentence out, "card" and the asterisk out.
- `scripts/split-messages.cjs` regenerated `messages/ns/*/{pricing,compare,comparison}.json`. The catalog modules needed no change, because no key was added.

## 5 · Checks

| Check | Result |
|---|---|
| translation-check, all 73 locales | 0 structural each |
| messages-split | 205 passed, 0 failed |
| messages-parity | 1,001,306 passed, 0 failed |
| languages-world-1-rtl | 111 passed, 0 failed |
| **pricing-copy-1** (new) | **1,391 passed, 0 failed** |
| france-1 · language-phase-2 · ireland-1 · us-legal-draft | 74/74 · 2004/2004 · 55/55 · 36/36 |
| Full sweep, clean worktree at `d71bf0bd` | **212 run · 192 passed · 20 failed** — the same 20 as before, each failing exactly the same checks as at `280fd2e3` (compared check by check). One file left out of the run: billing-3's harness, below |

**`scripts/pricing-copy-1.cjs` proves:**
- In every locale file, between the commit before the change and the change's commit, only the six keys moved, and no key was added or removed.
- Each moved string keeps the same placeholders, tags and select branches.
- `body` and `bodyOnly` each lose exactly ONE span. It is the same span in both, cut right after the first sentence, which stays, and it leaves no doubled space.
- The Pay as you go line had the asterisk and now has none.
- In all four fee strings, the word for "card" was there before and is gone now, and the string only got shorter.
- `pricing.fee.included` (Pro), `pricing.footnote` and `planTable.pay.fee` are unchanged everywhere.
- en-GB matches the brief word for word.
- The back-translations moved only for these keys.
- The rendered landing for /uk, /us, /fr, /de, /jp and /ae shows the new line and no deleted sentence, and Pro still has its asterisk and the footnote.
- The plans PDF (GB, FR) is changed the same way.
- /llms.txt: Pay as you go's line changed, and Pro's line and the general paragraph did not.
- The commits touch only messages, their split files, back-translations, `lib/llms-text.ts`, harnesses and this report — no `app/` or `components/` file.

**How the sweep was triaged.**
- The first full run at my commit failed **21**: the pre-existing 20, with 4 of them (copy-truth-1, faq-2, faq-3, faq-1) and faq-4 also failing **new** landing-identity checks caused by this change.
- I re-pinned copy-truth-1, faq-2, faq-3 and faq-4 the same way (commit `d71bf0bd`). Each is now back to its earlier count: copy-truth-1 1, faq-2 9, faq-3 1, faq-1 2, and faq-4 0 — it passes.
- I then compared each of the 20 failing harnesses' failing-check lists at `280fd2e3` and at my commit: identical.
- ⚠️ **The runner refuses the whole run** while `scripts/billing-3.cjs` is listed: the other session committed it, and it contains the word the screen bans. I didn't touch it. For the final run I used a copy of the list with that one file left out (my scratchpad, not the repo). **billing-3's session needs to fix its harness**, or every sweep is refused.

**Re-pins.** The harnesses that hold the landing page byte-identical to an older snapshot now put this change's wording back before hashing, then compare every other byte as before. That is `scripts/_lp-pricing-copy-1.cjs` `asBefore`, the same pattern as the seo-geo-2, site-chrome-1 and billing re-pins:
- `faq-1`, `faq-2`, `faq-3`, `faq-4`, `copy-truth-1`, `seo-geo-2` and `store-badges-1`: the landing hashes for GB, US, IE, DE, FR, JP, AE and BR match their pins again, byte for byte.
- `world-countries-2`: en-GB's banner.body, with the sentence put back, is HEAD's again.
- How the pairs work:
  - They come from the BEFORE and AFTER commits, not the working tree, so the other session's edits can't move them.
  - They are per language, because the Spanish variants share an AFTER text but deleted different sentences.
  - They are scoped: the comparison keys apply only when a caller asks, since a short Japanese pair also matched Unlimited's own sentence.
  - A wrong pair can only make a comparison fail, never pass.
- The literal-string harnesses now read the new line:
  - `pricing-pages` (4 checks)
  - `ai-search-1` (/llms.txt)
  - `country-settings-parity` C1 and `marketing-country-parity` T-panel (/compare's orders card)
- Each changed line carries a "⚠️ RE-PINNED (pricing-copy-1, 11 November 2026)" note.

## 6 · Screenshots (localhost)
`scripts/pricing-copy-1-screens.cjs` opened the real pages on `next dev`:
- Host and pages: `hatchgrab.localhost:3123`, because the country pages answer only on a HatchGrab host. Pages: /uk and /fr, at 390 and 1280.
- Each shot is the pricing section, cut from a full-page screenshot. For the screenshot only, the sticky nav was made static and the dev badge hidden.
- Files in `docs/pricing-copy-1/`:
  - `before-uk-390.png`, `before-uk-1280.png`, `before-fr-390.png`, `before-fr-1280.png`
  - `after-uk-390.png`, `after-uk-1280.png`, `after-fr-390.png`, `after-fr-1280.png`
  - each with a `.txt` of the section's text
- Neither page scrolled sideways, and no page error was logged.
- The text diff, before → after, is exactly the intended change:
  - **/uk:** "Prefer to take payment up front? Add online card payments any time." gone · "0.99%*" → "0.99%" · "online card orders only" → "online orders only". Pro's "0.99%*" and the footnote are unchanged.
  - **/fr:** "Vous préférez encaisser à l'avance ? Ajoutez le paiement en ligne par carte quand vous voulez." gone · "0,99 %*" → "0,99 %" · "commandes en ligne payées par carte." → "commandes en ligne.".

## 7 · Commits (main, local, not pushed)
- `62865ee5` the wording: 61 messages files, their split files, 51 back-translation files, lib/llms-text.ts
- `9d53c86f` the harness, the screenshot script, the re-pin module and 8 re-pinned harnesses
- `78ec03d0` the harness checks the footnote without naming the processor (the sweep's screen refuses that word in a listed harness)
- `d71bf0bd` 4 more re-pins: copy-truth-1, faq-2, faq-3 and faq-4
- the screenshots and this report

Not done, as instructed: no deploy, no landing-page change beyond these strings, no database row touched. The only SQL was read-only checks:
- the `plans` rows
- the FAQ answers that mention the fee
- the switched-on countries' offered plans

## Undo (only if Dominic asks)
⛔ DO NOT RUN unless Dominic asks.
- `git revert` the pricing-copy-1 commits, newest first (`git log --grep=^pricing-copy-1:`).
- No database change was made, so there is no SQL to undo.

## Appendix · every locale

| Locale | Sentence deleted from the banner (body and bodyOnly) |
|---|---|
| ar-AE | تفضّل استلام الدفع مقدّمًا؟ أضف الدفع بالبطاقة عبر الإنترنت في أي وقت. |
| bg-BG | Предпочитате да вземате плащането предварително? Добавете онлайн плащания с карта по всяко време. |
| cs-CZ | Chcete raději inkasovat předem? Online platby kartou můžete přidat kdykoli. |
| da-DK | Vil du hellere tage betaling på forhånd? Tilføj onlinebetaling med kort når som helst. |
| de-DE | Lieber im Voraus kassieren? Fügen Sie jederzeit Online-Kartenzahlungen hinzu. |
| el-GR | Προτιμάτε να εισπράττετε εκ των προτέρων; Προσθέστε online πληρωμές με κάρτα όποτε θέλετε. |
| en-AU | Prefer to take payment up front? Add online card payments any time. |
| en-BB | Prefer to take payment up front? Add online card payments any time. |
| en-BS | Prefer to take payment up front? Add online card payments any time. |
| en-GB | Prefer to take payment up front? Add online card payments any time. |
| en-GH | Prefer to take payment up front? Add online card payments any time. |
| en-JM | Prefer to take payment up front? Add online card payments any time. |
| en-KE | Prefer to take payment up front? Add online card payments any time. |
| en-NG | Prefer to take payment up front? Add online card payments any time. |
| en-TT | Prefer to take payment up front? Add online card payments any time. |
| en-US | Prefer to take payment up front? Add online card payments any time. |
| es-AR | ¿Preferís cobrar por adelantado? Agregá el pago online con tarjeta cuando quieras. |
| es-CL | ¿Prefieres cobrar por adelantado? Agrega el pago online con tarjeta cuando quieras. |
| es-CO | ¿Prefieres cobrar por adelantado? Agrega el pago en línea con tarjeta cuando quieras. |
| es-EC | ¿Prefieres cobrar por adelantado? Agrega el pago online con tarjeta cuando quieras. |
| es-ES | ¿Prefieres cobrar por adelantado? Añade el pago online con tarjeta cuando quieras. |
| es-HN | ¿Prefieres cobrar por adelantado? Agrega el pago online con tarjeta cuando quieras. |
| es-MX | ¿Prefieres cobrar por adelantado? Agrega el pago online con tarjeta cuando quieras. |
| es-NI | ¿Prefieres cobrar por adelantado? Agrega el pago online con tarjeta cuando quieras. |
| es-PA | ¿Prefieres cobrar por adelantado? Agrega el pago en línea con tarjeta cuando quieras. |
| es-PY | ¿Preferís cobrar por adelantado? Agregá el pago online con tarjeta cuando quieras. |
| es-SV | ¿Prefieres cobrar por adelantado? Agrega el pago online con tarjeta cuando quieras. |
| es-UY | ¿Preferís cobrar por adelantado? Agregá el pago online con tarjeta cuando quieras. |
| et-EE | Eelistad makset kohe ette? Lisa veebipõhised kaardimaksed millal tahes. |
| fi-FI | Haluatko ottaa maksun etukäteen? Lisää korttimaksut verkossa milloin tahansa. |
| fr-CI | Vous préférez encaisser à l’avance ? Ajoutez le paiement en ligne par carte quand vous voulez. |
| fr-FR | Vous préférez encaisser à l’avance ? Ajoutez le paiement en ligne par carte quand vous voulez. |
| fr-MA | Vous préférez encaisser à l’avance ? Ajoutez le paiement en ligne par carte quand vous voulez. |
| fr-SN | Vous préférez encaisser à l’avance ? Ajoutez le paiement en ligne par carte quand vous voulez. |
| fr-TN | Vous préférez encaisser à l’avance ? Ajoutez le paiement en ligne par carte quand vous voulez. |
| he-IL | מעדיפים לגבות תשלום מראש? אפשר להוסיף תשלומי אשראי אונליין בכל עת. |
| hr-HR | Radije naplaćujete unaprijed? Online plaćanje karticom možete dodati bilo kada. |
| hu-HU | Inkább előre fizettetne? Az online kártyás fizetést bármikor bekapcsolhatja. |
| id-ID | Lebih suka menerima pembayaran di muka? Tambahkan pembayaran kartu online kapan saja. |
| is-IS | Viltu frekar fá greitt fyrir fram? Bættu við netgreiðslum með korti hvenær sem er. |
| it-IT | Preferisci incassare in anticipo? Aggiungi i pagamenti online con carta quando vuoi. |
| ja-JP | 先に代金を受け取りたい場合は、オンラインカード決済をいつでも追加できます。 |
| ko-KR | 결제를 미리 받고 싶으신가요? 온라인 카드 결제는 언제든 추가할 수 있습니다. |
| lt-LT | Norite, kad būtų sumokama iš anksto? Bet kada pridėkite mokėjimus kortele internetu. |
| lv-LV | Vēlaties saņemt samaksu uzreiz? Pievienojiet karšu maksājumus tiešsaistē jebkurā laikā. |
| ms-MY | Lebih suka terima bayaran di awal? Tambah pembayaran kad dalam talian bila-bila masa. |
| nb-NO | Vil du heller ta betalt på forhånd? Legg til kortbetaling på nett når som helst. |
| nl-NL | Liever vooraf laten betalen? Voeg op elk moment online kaartbetalingen toe. |
| pl-PL | Wolisz pobierać płatność z góry? Włącz płatności kartą online w dowolnej chwili. |
| pt-BR | Prefere receber adiantado? Ative pagamentos online com cartão quando quiser. |
| pt-PT | Prefere receber o pagamento antecipadamente? Adicione pagamentos online com cartão quando quiser. |
| ro-RO | Preferați să încasați în avans? Adăugați oricând plățile online cu cardul. |
| sk-SK | Chcete radšej platbu vopred? Online platby kartou si môžete pridať kedykoľvek. |
| sl-SI | Bi raje prejeli plačilo vnaprej? Spletna kartična plačila lahko dodate kadar koli. |
| sr-RS | Više volite naplatu unapred? Dodajte online plaćanje karticom bilo kada. |
| sv-SE | Vill du hellre ta betalt i förväg? Lägg till kortbetalning online när du vill. |
| th-TH | อยากรับเงินล่วงหน้าใช่ไหม เพิ่มการชำระเงินออนไลน์ด้วยบัตรได้ทุกเมื่อ |
| tr-TR | Ödemeyi önceden almayı mı tercih edersiniz? Online kartla ödemeyi istediğiniz zaman ekleyin. |
| vi-VN | Muốn thu tiền trước? Bạn có thể thêm thanh toán thẻ online bất cứ lúc nào. |
| zh-HK | 想預先收款？隨時可加設網上信用卡付款。 |
| zh-TW | 想預先收款？隨時都能加上線上刷卡付款。 |

| Locale | Pay as you go card (pricing.fee.feeOnly), after |
|---|---|
| ar-AE | `<b>{fee}</b> على الطلبات عبر الإنترنت فقط. الطلبات الحضورية مجانية دائمًا.` |
| bg-BG | `<b>{fee}</b> само за онлайн поръчки. Поръчките на място винаги са безплатни.` |
| cs-CZ | `<b>{fee}</b> pouze z online objednávek. Objednávky na místě jsou vždy zdarma.` |
| da-DK | `<b>{fee}</b> kun på onlinebestillinger. Bestillinger ved vognen er altid gratis.` |
| de-DE | `<b>{fee}</b> nur auf Online-Bestellungen. Bestellungen vor Ort sind immer gebührenfrei.` |
| el-GR | `<b>{fee}</b> μόνο στις online παραγγελίες. Οι παραγγελίες επί τόπου είναι πάντα δωρεάν.` |
| en-GB | `<b>{fee}</b> on online orders only. Walk-up orders are always free.` |
| es-CO | `<b>{fee}</b> solo en pedidos en línea. Los pedidos en ventanilla siempre son gratis.` |
| es-ES | `<b>{fee}</b> solo en pedidos online. Los pedidos en ventanilla siempre son gratis.` |
| es-PA | `<b>{fee}</b> solo en pedidos en línea. Los pedidos en ventanilla siempre son gratis.` |
| et-EE | `<b>{fee}</b> ainult veebitellimustelt. Tellimused kohapeal on alati tasuta.` |
| fi-FI | `<b>{fee}</b> vain verkkotilauksista. Tilaukset paikan päällä ovat aina maksuttomia.` |
| fr-FR | `<b>{fee}</b> uniquement sur les commandes en ligne. Les commandes au comptoir sont toujours gratuites.` |
| he-IL | `<b>{fee}</b> רק על הזמנות אונליין. הזמנות במקום תמיד בחינם.` |
| hr-HR | `<b>{fee}</b> samo za online narudžbe. Narudžbe na licu mjesta uvijek su besplatne.` |
| hu-HU | `<b>{fee}</b> csak az online rendelésekre. A helyszíni rendelések mindig díjmentesek.` |
| id-ID | `<b>{fee}</b> hanya untuk pesanan online. Pesanan langsung di tempat selalu gratis.` |
| is-IS | `<b>{fee}</b> eingöngu af netpöntunum. Pantanir á staðnum eru alltaf ókeypis.` |
| it-IT | `<b>{fee}</b> solo sugli ordini online. Gli ordini al banco sono sempre gratuiti.` |
| ja-JP | `オンライン注文にのみ<b>{fee}</b>。店頭注文は常に無料です。` |
| ko-KR | `온라인 주문에만 <b>{fee}</b> 수수료. 현장 주문은 언제나 무료입니다.` |
| lt-LT | `<b>{fee}</b> tik už užsakymus internetu. Užsakymai vietoje visada nemokami.` |
| lv-LV | `<b>{fee}</b> tikai par tiešsaistes pasūtījumiem. Pasūtījumi uz vietas vienmēr ir bez maksas.` |
| ms-MY | `<b>{fee}</b> untuk pesanan dalam talian sahaja. Pesanan walk-in sentiasa percuma.` |
| nb-NO | `<b>{fee}</b> bare på nettbestillinger. Bestillinger ved bilen er alltid gratis.` |
| nl-NL | `<b>{fee}</b> alleen op online bestellingen. Bestellingen aan de truck zijn altijd gratis.` |
| pl-PL | `<b>{fee}</b> tylko od zamówień online. Zamówienia na miejscu są zawsze bez opłat.` |
| pt-BR | `<b>{fee}</b> só nos pedidos online. Pedidos no balcão são sempre grátis.` |
| pt-PT | `<b>{fee}</b> apenas nas encomendas online. As encomendas ao balcão são sempre grátis.` |
| ro-RO | `<b>{fee}</b> doar pentru comenzile online. Comenzile la fața locului sunt mereu gratuite.` |
| sk-SK | `<b>{fee}</b> len pri online objednávkach. Objednávky na mieste sú vždy zadarmo.` |
| sl-SI | `<b>{fee}</b> le pri spletnih naročilih. Naročila na mestu so vedno brezplačna.` |
| sr-RS | `<b>{fee}</b> samo na online porudžbine. Porudžbine na licu mesta su uvek besplatne.` |
| sv-SE | `<b>{fee}</b> bara på onlinebeställningar. Beställningar på plats är alltid gratis.` |
| th-TH | `<b>{fee}</b> เฉพาะออเดอร์ออนไลน์ ออเดอร์หน้ารถไม่มีค่าธรรมเนียมเสมอ` |
| tr-TR | `Yalnızca online siparişlerde <b>{fee}</b>. Yerinde siparişler her zaman ücretsiz.` |
| vi-VN | `<b>{fee}</b> chỉ tính trên đơn online. Đơn mua tại chỗ luôn miễn phí.` |
| zh-HK | `只限網上訂單收取 <b>{fee}</b>。現場訂單一律免費。` |
| zh-TW | `僅線上訂單收取 <b>{fee}</b>。現場點餐永遠免費。` |

| Locale | compare.plan.summaryFeeOnly · compare.orders.feeOnly · comparison.costs.feeOnly, after |
|---|---|
| ar-AE | `{hasMonthly, select, yes {{price} لكل عربة شهريًا، بالإضافة إلى {pct} على الطلبات عبر الإنترنت.} other {بدون رسوم شهرية، {pct} على الطلبات عبر الإنترنت فقط.}}` · `{pct} على كل طلب عبر الإنترنت، أي <b>{over}</b> شهريًا لكل عربة.` · `{fee} لكل طلب عبر الإنترنت` |
| bg-BG | `{hasMonthly, select, yes {{price} на фуд трък на месец плюс {pct} за онлайн поръчки.} other {Без месечна такса — само {pct} за онлайн поръчки.}}` · `{pct} за всяка онлайн поръчка — <b>{over}</b> на месец за фуд трък.` · `{fee} за онлайн поръчка` |
| cs-CZ | `{hasMonthly, select, yes {{price} za food truck měsíčně plus {pct} z online objednávek.} other {Bez měsíčního poplatku — jen {pct} z online objednávek.}}` · `{pct} z každé online objednávky — <b>{over}</b> měsíčně na food truck.` · `{fee} za každou online objednávku` |
| da-DK | `{hasMonthly, select, yes {{price} pr. foodtruck pr. måned plus {pct} på onlinebestillinger.} other {Intet månedsgebyr — kun {pct} på onlinebestillinger.}}` · `{pct} på hver onlinebestilling — <b>{over}</b> om måneden pr. foodtruck.` · `{fee} pr. onlinebestilling` |
| de-DE | `{hasMonthly, select, yes {{price} pro Foodtruck und Monat, zzgl. {pct} auf Online-Bestellungen.} other {Keine Monatsgebühr – nur {pct} auf Online-Bestellungen.}}` · `{pct} auf jede Online-Bestellung – <b>{over}</b> pro Monat und Foodtruck.` · `{fee} pro Online-Bestellung` |
| el-GR | `{hasMonthly, select, yes {{price} ανά food truck τον μήνα, συν {pct} στις online παραγγελίες.} other {Χωρίς μηνιαία συνδρομή — μόνο {pct} στις online παραγγελίες.}}` · `{pct} σε κάθε online παραγγελία — <b>{over}</b> τον μήνα ανά food truck.` · `{fee} ανά online παραγγελία` |
| en-GB | `{hasMonthly, select, yes {{price} per truck per month, plus {pct} on online orders.} other {No monthly fee — {pct} on online orders only.}}` · `{pct} on every online order — <b>{over}</b> a month per truck.` · `{fee} per online order` |
| es-AR | `{hasMonthly, select, yes {{price} por food truck al mes, más {pct} en los pedidos online.} other {Sin abono mensual: solo {pct} en los pedidos online.}}` |
| es-CO | `{hasMonthly, select, yes {{price} por food truck al mes, más {pct} en los pedidos en línea.} other {Sin cuota mensual: solo {pct} en los pedidos en línea.}}` · `{pct} en cada pedido en línea: <b>{over}</b> al mes por food truck.` · `{fee} por pedido en línea` |
| es-ES | `{hasMonthly, select, yes {{price} por food truck al mes, más {pct} en los pedidos online.} other {Sin cuota mensual: solo {pct} en los pedidos online.}}` · `{pct} en cada pedido online: <b>{over}</b> al mes por food truck.` · `{fee} por pedido online` |
| es-PA | `{hasMonthly, select, yes {{price} por food truck al mes, más {pct} en los pedidos en línea.} other {Sin cuota mensual: solo {pct} en los pedidos en línea.}}` · `{pct} en cada pedido en línea: <b>{over}</b> al mes por food truck.` · `{fee} por pedido en línea` |
| et-EE | `{hasMonthly, select, yes {{price} toiduauto kohta kuus, lisaks {pct} veebitellimustelt.} other {Kuutasu pole — ainult {pct} veebitellimustelt.}}` · `{pct} igalt veebitellimuselt — <b>{over}</b> kuus toiduauto kohta.` · `{fee} iga veebitellimuse kohta` |
| fi-FI | `{hasMonthly, select, yes {{price} per ruokarekka kuukaudessa sekä {pct} verkkotilauksista.} other {Ei kuukausimaksua — vain {pct} verkkotilauksista.}}` · `{pct} jokaisesta verkkotilauksesta — <b>{over}</b> kuukaudessa per ruokarekka.` · `{fee} jokaisesta verkkotilauksesta` |
| fr-FR | `{hasMonthly, select, yes {{price} par food truck et par mois, plus {pct} sur les commandes en ligne.} other {Aucun abonnement mensuel : uniquement {pct} sur les commandes en ligne.}}` · `{pct} sur chaque commande en ligne, soit <b>{over}</b> par mois et par food truck.` · `{fee} par commande en ligne` |
| he-IL | `{hasMonthly, select, yes {{price} לפודטראק לחודש, ועוד {pct} על הזמנות אונליין.} other {ללא דמי מנוי — רק {pct} על הזמנות אונליין.}}` · `{pct} על כל הזמנת אונליין — <b>{over}</b> לחודש לכל פודטראק.` · `{fee} לכל הזמנת אונליין` |
| hr-HR | `{hasMonthly, select, yes {{price} po food trucku mjesečno, plus {pct} na online narudžbe.} other {Bez mjesečne naknade – samo {pct} na online narudžbe.}}` · `{pct} na svaku online narudžbu – <b>{over}</b> mjesečno po food trucku.` · `{fee} po online narudžbi` |
| hu-HU | `{hasMonthly, select, yes {{price} food truckonként havonta, plusz {pct} jutalék az online rendelések után.} other {Nincs havidíj — csak {pct} jutalék az online rendelések után.}}` · `{pct} jutalék minden online rendelés után — food truckonként havi <b>{over}</b>.` · `online rendelésenként {fee}` |
| id-ID | `{hasMonthly, select, yes {{price} per truk per bulan, ditambah {pct} untuk pesanan online.} other {Tanpa biaya bulanan — hanya {pct} untuk pesanan online.}}` · `{pct} untuk setiap pesanan online — <b>{over}</b> per bulan per truk.` · `{fee} per pesanan online` |
| is-IS | `{hasMonthly, select, yes {{price} á vagn á mánuði, auk {pct} af netpöntunum.} other {Ekkert mánaðargjald — aðeins {pct} af netpöntunum.}}` · `{pct} af hverri netpöntun — <b>{over}</b> á mánuði á hvern vagn.` · `{fee} af hverri netpöntun` |
| it-IT | `{hasMonthly, select, yes {{price} per food truck al mese, più {pct} sugli ordini online.} other {Nessun canone mensile — solo {pct} sugli ordini online.}}` · `{pct} su ogni ordine online — <b>{over}</b> al mese per food truck.` · `{fee} per ordine online` |
| ja-JP | `{hasMonthly, select, yes {1台あたり月額{price}、オンライン注文に{pct}。} other {月額料金なし。オンライン注文にのみ{pct}。}}` · `オンライン注文すべてに{pct}。1台あたり月<b>{over}</b>です。` · `オンライン注文ごとに{fee}` |
| ko-KR | `{hasMonthly, select, yes {푸드트럭 1대당 월 {price}, 온라인 주문에는 {pct} 수수료가 추가됩니다.} other {월 이용료 없음 — 온라인 주문에만 {pct} 수수료가 붙습니다.}}` · `모든 온라인 주문에 {pct} — 푸드트럭 1대당 월 <b>{over}</b>.` · `온라인 주문 1건당 {fee}` |
| lt-LT | `{hasMonthly, select, yes {{price} už furgoną per mėnesį ir {pct} nuo internetinių užsakymų.} other {Jokio mėnesinio mokesčio — tik {pct} nuo internetinių užsakymų.}}` · `{pct} nuo kiekvieno internetinio užsakymo — <b>{over}</b> per mėnesį vienam furgonui.` · `{fee} už kiekvieną internetinį užsakymą` |
| lv-LV | `{hasMonthly, select, yes {{price} par busiņu mēnesī, plus {pct} no tiešsaistes pasūtījumiem.} other {Bez ikmēneša maksas — tikai {pct} no tiešsaistes pasūtījumiem.}}` · `{pct} no katra tiešsaistes pasūtījuma — <b>{over}</b> mēnesī par busiņu.` · `{fee} par katru tiešsaistes pasūtījumu` |
| ms-MY | `{hasMonthly, select, yes {{price} setiap trak sebulan, ditambah {pct} untuk pesanan dalam talian.} other {Tanpa yuran bulanan — {pct} untuk pesanan dalam talian sahaja.}}` · `{pct} untuk setiap pesanan dalam talian — <b>{over}</b> sebulan bagi setiap trak.` · `{fee} setiap pesanan dalam talian` |
| nb-NO | `{hasMonthly, select, yes {{price} per matbil per måned, pluss {pct} på nettbestillinger.} other {Ingen månedsavgift – bare {pct} på nettbestillinger.}}` · `{pct} på hver nettbestilling – <b>{over}</b> i måneden per matbil.` · `{fee} per nettbestilling` |
| nl-NL | `{hasMonthly, select, yes {{price} per foodtruck per maand, plus {pct} op online bestellingen.} other {Geen maandkosten — alleen {pct} op online bestellingen.}}` · `{pct} op elke online bestelling — <b>{over}</b> per maand per foodtruck.` · `{fee} per online bestelling` |
| pl-PL | `{hasMonthly, select, yes {{price} miesięcznie za food truck plus {pct} od zamówień online.} other {Bez opłaty miesięcznej — tylko {pct} od zamówień online.}}` · `{pct} od każdego zamówienia online — <b>{over}</b> miesięcznie na food truck.` · `{fee} od zamówienia online` |
| pt-BR | `{hasMonthly, select, yes {{price} por food truck por mês, mais {pct} nos pedidos online.} other {Sem mensalidade — só {pct} nos pedidos online.}}` · `{pct} em cada pedido online — <b>{over}</b> por mês por food truck.` · `{fee} por pedido online` |
| pt-PT | `{hasMonthly, select, yes {{price} por food truck por mês, mais {pct} nas encomendas online.} other {Sem mensalidade — apenas {pct} nas encomendas online.}}` · `{pct} em cada encomenda online — <b>{over}</b> por mês por food truck.` · `{fee} por encomenda online` |
| ro-RO | `{hasMonthly, select, yes {{price} pe food truck pe lună, plus {pct} la comenzile online.} other {Fără abonament lunar — doar {pct} la comenzile online.}}` · `{pct} la fiecare comandă online — <b>{over}</b> pe lună per food truck.` · `{fee} per comandă online` |
| sk-SK | `{hasMonthly, select, yes {{price} za food truck mesačne plus {pct} z online objednávok.} other {Bez mesačného poplatku — iba {pct} z online objednávok.}}` · `{pct} z každej online objednávky — <b>{over}</b> mesačne na food truck.` · `{fee} za každú online objednávku` |
| sl-SI | `{hasMonthly, select, yes {{price} na food truck na mesec in {pct} od spletnih naročil.} other {Brez mesečne naročnine — samo {pct} od spletnih naročil.}}` · `{pct} od vsakega spletnega naročila — <b>{over}</b> na mesec na food truck.` · `{fee} na spletno naročilo` |
| sr-RS | `{hasMonthly, select, yes {{price} po food trucku mesečno, plus {pct} na online porudžbine.} other {Bez mesečne pretplate — samo {pct} na online porudžbine.}}` · `{pct} na svaku online porudžbinu — <b>{over}</b> mesečno po food trucku.` · `{fee} po online porudžbini` |
| sv-SE | `{hasMonthly, select, yes {{price} per foodtruck och månad, plus {pct} på onlinebeställningar.} other {Ingen månadsavgift – bara {pct} på onlinebeställningar.}}` · `{pct} på varje onlinebeställning – <b>{over}</b> i månaden per foodtruck.` · `{fee} per onlinebeställning` |
| th-TH | `{hasMonthly, select, yes {{price} ต่อคันต่อเดือน บวก {pct} สำหรับออเดอร์ออนไลน์} other {ไม่มีค่ารายเดือน — {pct} เฉพาะออเดอร์ออนไลน์}}` · `{pct} สำหรับทุกออเดอร์ออนไลน์ — คันละ <b>{over}</b> ต่อเดือน` · `{fee} ต่อออเดอร์ออนไลน์` |
| tr-TR | `{hasMonthly, select, yes {Food truck başına aylık {price}, ayrıca online siparişlerde {pct}.} other {Aylık ücret yok — yalnızca online siparişlerde {pct}.}}` · `Her online siparişte {pct} — food truck başına ayda <b>{over}</b>.` · `online sipariş başına {fee}` |
| vi-VN | `{hasMonthly, select, yes {{price} mỗi xe mỗi tháng, cộng {pct} trên đơn online.} other {Không phí hằng tháng — chỉ {pct} trên đơn online.}}` · `{pct} trên mỗi đơn online — <b>{over}</b> mỗi tháng cho mỗi xe.` · `{fee} mỗi đơn online` |
| zh-HK | `{hasMonthly, select, yes {每架美食車每月 {price}，網上訂單另收 {pct}。} other {無月費——只限網上訂單收取 {pct}。}}` · `每張網上訂單收取 {pct}——每架美食車每月 <b>{over}</b>。` · `每張網上訂單 {fee}` |
| zh-TW | `{hasMonthly, select, yes {每台餐車每月 {price}，線上訂單另收 {pct}。} other {免月費——僅線上訂單收取 {pct}。}}` · `每筆線上訂單收取 {pct}——每台餐車每月 <b>{over}</b>。` · `每筆線上訂單 {fee}` |
