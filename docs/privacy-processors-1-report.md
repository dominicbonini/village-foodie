# privacy-processors-1: Anthropic and Namecheap in the Privacy Policy's section 6 (27 Nov 2026)

## 1 · Summary

- **Committed:** `e535b1b6` on france-vat-1. Not pushed or deployed.
- **The English policy:**
  - section 6 names **Anthropic (Claude)** (translating messages you send us and helping draft our replies) and **Namecheap** (our email mailboxes), both **United States**;
  - the international-transfers sentence names both;
  - "Last updated" is **27 November 2026**, with `PRIVACY_UPDATED`, `TERMS_VERSION` (2026-11-27) and the sitemap date following.
- **The 54 used languages carry the same two rows and two clauses.** I wrote them myself in this session (no API translator), and each file passes the legal translation checker. **All 54 still need a native-speaker check** (§4).
- **Checks:**
  - new harness **privacy-processors-1 9 / 0**;
  - the 31 legal and privacy harnesses give the same results as before this change, except where the change itself needed a re-pin (§5);
  - `tsc` 0 errors.

## 2 · The English change (`content/legal/privacy-policy.md`, `lib/legal.ts`)

**What I matched.** Section 6 is a three-column table: `| Provider | What it does | Where |`.

- The rows carry no "PBC", no links and no per-row safeguard, so the new rows have none.
- The provider cell is the name alone, or the name with the product in brackets, as in "Google (Gemini)" and "Meta (WhatsApp)". So the cell reads "Anthropic (Claude)".
- The rows are **grouped by location**: UK (Supabase, Vercel), then EU (Brevo, PostHog), then United States (Google (Gemini), Apple and Google, Meta (WhatsApp), Stripe). There's no alphabetical order inside a group, so the two new rows go **at the end of the US group**, after Stripe, in alphabetical order between themselves.

```
| Stripe | Taking payments from your customers and passing them on to you | United States |
| Anthropic (Claude) | Translating messages you send us and helping draft our replies | United States |
| Namecheap | Our email mailboxes | United States |
```

**The transfers sentence**, in the paragraph's own style: each clause is «X, which [is handled / use …] in the United States», separated by semicolons, with "and" before the last one. That "and" moved from push notifications to the new last clause.

> … payments, which are handled by Stripe in the United States; push notifications, which are delivered by Apple and Google in the United States; **message translation and reply drafting, which use Anthropic in the United States; and our email mailboxes, which Namecheap hosts in the United States.**

**The dates** (your decision 1, as lib/legal.ts requires):

- the .md's `**Last updated:** 27 November 2026`;
- `PRIVACY_UPDATED = '27 November 2026'`;
- `TERMS_VERSION = '2026-11-27'`, with its doc comment. It's written only at signup, so nobody is asked to re-accept anything;
- the sitemap's `/privacy` lastmod follows `PRIVACY_UPDATED` (app/sitemap.ts reads it);
- every translated `/xx/privacy` page shows the English date, written its own way.

Nothing else in the English text changed. The harness proves it byte for byte.

## 3 · Namecheap's location (step 2): nothing points elsewhere

- **Every mailbox connection uses `mail.privateemail.com`** (Namecheap Private Email): the outreach send, the IMAP box, and the Inbox's send (`lib/inbox/send.ts`, through `lib/outreach-mail-envelope.ts` / `-box.ts`). It comes from one constant, `OUTREACH_MAIL_HOST` in lib/outreach-mail-config.ts.
- **No mail host is stored** in any migration or setting.
- **The MX records** of hatchgrab.com and villagefoodie.co.uk are `mx1.privateemail.com` / `mx2.privateemail.com` (public DNS).
- The only other Namecheap name in the code, `ap.www.namecheap.com` (lib/custom-domain/dns.ts), is a DNS help link, not a mailbox.
- So "United States" stands, as Namecheap's own help article says (PhoenixNAP, Phoenix, Arizona).

## 4 · The other languages

**"Used" languages** (Open item 41(b)) are the **54 language bases an enabled country uses**: 59 installed, minus the five unused vi-VN, hi-IN, ur-PK, fil-PH and ta-LK.

**What each showed before this change:** its own translation (content/legal/<base>/privacy-policy.md), with the **old six-row US list**, under whatever date the English carried. Not an English fallback: a page falls back to English only when a language has no translation file.

**Now** (your decision 1), all 54 carry the two rows and the two transfers clauses:

- **Where it goes:** each language's own table wording and transfer-sentence style. Its own separators (`;`, `፤`, `·`, `、`, `；`, or commas in hy-AM, km-KH, lo-LA, th-TH), and its "and" moved to the new last clause. In ja-JP and ko-KR the sentence is one chain of clauses, so the two new clauses join that chain.
- **Names and countries:** provider names are untranslated ("Anthropic (Claude)", "Namecheap"). "United States" is copied from that language's own Stripe row in section 6.
- **Stamp:** each file is re-stamped to the new English file's sha256.
- **Checker:** every one passes the legal translation checker: structure, tables, numbers, processors named, stamp.
- **The 5 unused bases are untouched.** They were already stale before this change (stamped against an older English) and still are. That's pre-existing.

**🔴 Native-speaker check: all 54, to add to Open item 6.**

am-ET, ar-AE, az-AZ, bg-BG, bn-BD, bs-BA, ca-AD, cs-CZ, da-DK, de-DE, el-GR, es-ES, et-EE, fi-FI, fr-FR, he-IL, hr-HR, hu-HU, hy-AM, id-ID, is-IS, it-IT, ja-JP, ka-GE, kk-KZ, km-KH, ko-KR, lo-LA, lt-LT, lv-LV, mk-MK, mn-MN, ms-MY, nb-NO, ne-NP, nl-NL, pl-PL, pt-BR, pt-PT, ro-RO, ru-KZ, si-LK, sk-SK, sl-SI, sq-AL, sr-RS, sv-SE, sw-TZ, th-TH, tr-TR, uk-UA, uz-UZ, zh-HK, zh-TW.

Worth a closer look: hosting verbs ("hosts" has no settled word in several languages), the et-EE genitive «Anthropicu», and the km-KH / lo-LA / si-LK wording.

The two new cells, as written:

| Base | Anthropic (Claude): what it does | Namecheap: what it does | Where |
|---|---|---|---|
| am-ET | የሚልኩልንን መልዕክቶች መተርጎምና ምላሾቻችንን ለማርቀቅ ማገዝ | የኢሜይል ሳጥኖቻችን | ዩናይትድ ስቴትስ |
| ar-AE | ترجمة الرسائل التي ترسلها إلينا والمساعدة في صياغة ردودنا | صناديق بريدنا الإلكتروني | الولايات المتحدة |
| az-AZ | Bizə göndərdiyiniz mesajların tərcüməsi və cavablarımızın hazırlanmasına kömək | E-poçt qutularımız | Amerika Birləşmiş Ştatları |
| bg-BG | Превод на съобщенията, които ни изпращате, и помощ при изготвянето на нашите отговори | Нашите имейл пощенски кутии | Съединени американски щати |
| bn-BD | আপনি আমাদের যে মেসেজ পাঠান তা অনুবাদ করা ও আমাদের উত্তরের খসড়া তৈরিতে সাহায্য করা | আমাদের ইমেইল মেইলবক্স | যুক্তরাষ্ট্র |
| bs-BA | Prevođenje poruka koje nam šaljete i pomoć pri sastavljanju naših odgovora | Naši sandučići e-pošte | Sjedinjene Američke Države |
| ca-AD | Traduir els missatges que ens envies i ajudar a redactar les nostres respostes | Les nostres bústies de correu electrònic | Estats Units |
| cs-CZ | Překlad zpráv, které nám posíláte, a pomoc s přípravou našich odpovědí | Naše e-mailové schránky | Spojené státy |
| da-DK | Oversættelse af beskeder, du sender os, og hjælp til at skrive udkast til vores svar | Vores e-mailpostkasser | USA |
| de-DE | Übersetzung der Nachrichten, die Sie uns senden, und Hilfe beim Entwerfen unserer Antworten | Unsere E-Mail-Postfächer | Vereinigte Staaten |
| el-GR | Μετάφραση των μηνυμάτων που μας στέλνετε και βοήθεια στη σύνταξη των απαντήσεών μας | Οι γραμματοθυρίδες email μας | Ηνωμένες Πολιτείες |
| es-ES | Traducción de los mensajes que nos envía y ayuda en la redacción de nuestras respuestas | Nuestros buzones de correo electrónico | Estados Unidos |
| et-EE | Teie meile saadetud sõnumite tõlkimine ja abi meie vastuste koostamisel | Meie e-postkastid | Ameerika Ühendriigid |
| fi-FI | Meille lähettämiesi viestien kääntäminen ja apu vastaustemme luonnostelussa | Sähköpostilaatikkomme | Yhdysvallat |
| fr-FR | Traduction des messages que vous nous envoyez et aide à la rédaction de nos réponses | Nos boîtes aux lettres électroniques | États-Unis |
| he-IL | תרגום ההודעות שאתם שולחים אלינו וסיוע בניסוח התשובות שלנו | תיבות הדואר האלקטרוני שלנו | ארצות הברית |
| hr-HR | Prevođenje poruka koje nam šaljete i pomoć pri sastavljanju naših odgovora | Naši sandučići e-pošte | Sjedinjene Američke Države |
| hu-HU | Az Ön által nekünk küldött üzenetek fordítása és segítség a válaszaink megfogalmazásában | E-mail-postafiókjaink | Egyesült Államok |
| hy-AM | Ձեր կողմից մեզ ուղարկված հաղորդագրությունների թարգմանություն և օգնություն մեր պատասխանների նախագծման մեջ | Մեր էլփոստի արկղերը | Ամերիկայի Միացյալ Նահանգներ |
| id-ID | Menerjemahkan pesan yang Anda kirim kepada kami dan membantu menyusun draf balasan kami | Kotak surat email kami | Amerika Serikat |
| is-IS | Þýðir skilaboð sem þú sendir okkur og hjálpar við að semja drög að svörum okkar | Tölvupósthólfin okkar | Bandaríkin |
| it-IT | Traduzione dei messaggi che Lei ci invia e aiuto nella stesura delle nostre risposte | Le nostre caselle di posta elettronica | Stati Uniti |
| ja-JP | お客様から当社に送られたメッセージの翻訳および当社の返信の下書き作成の支援 | 当社のメールボックス | 米国 |
| ka-GE | თქვენ მიერ ჩვენთვის გამოგზავნილი შეტყობინებების თარგმნა და ჩვენი პასუხების მომზადებაში დახმარება | ჩვენი ელფოსტის ყუთები | ამერიკის შეერთებული შტატები |
| kk-KZ | Бізге жіберген хабарламаларыңызды аудару және жауаптарымыздың жобасын дайындауға көмектесу | Біздің электрондық пошта жәшіктеріміз | АҚШ |
| km-KH | ការបកប្រែសារដែលអ្នកផ្ញើមកយើង និងការជួយព្រាងចម្លើយតបរបស់យើង | ប្រអប់សំបុត្រអ៊ីមែលរបស់យើង | សហរដ្ឋអាមេរិក |
| ko-KR | 귀하가 당사에 보내는 메시지 번역 및 당사 답장 초안 작성 지원 | 당사의 이메일 사서함 | 미국 |
| lo-LA | ການແປຂໍ້ຄວາມທີ່ທ່ານສົ່ງຫາພວກເຮົາ ແລະ ການຊ່ວຍຮ່າງຄຳຕອບຂອງພວກເຮົາ | ກ່ອງອີເມວຂອງພວກເຮົາ | ສະຫະລັດອາເມລິກາ |
| lt-LT | Jūsų mums siunčiamų žinučių vertimas ir pagalba rengiant mūsų atsakymų juodraščius | Mūsų el. pašto dėžutės | Jungtinės Amerikos Valstijos |
| lv-LV | Jūsu mums sūtīto ziņojumu tulkošana un palīdzība mūsu atbilžu sagatavošanā | Mūsu e-pasta pastkastes | Amerikas Savienotās Valstis |
| mk-MK | Преведување на пораките што ни ги испраќате и помош при составувањето на нашите одговори | Нашите поштенски сандачиња за е-пошта | Соединети Американски Држави |
| mn-MN | Таны бидэнд илгээсэн мессежийг орчуулах, бидний хариултын төслийг бэлтгэхэд туслах | Бидний имэйлийн хайрцаг | Америкийн Нэгдсэн Улс |
| ms-MY | Menterjemah mesej yang anda hantar kepada kami dan membantu merangka balasan kami | Peti mel e-mel kami | Amerika Syarikat |
| nb-NO | Oversette meldinger du sender oss og hjelpe til med å lage utkast til svarene våre | E-postkassene våre | USA |
| ne-NP | तपाईंले हामीलाई पठाउनुभएका सन्देशहरू अनुवाद गर्ने र हाम्रा जवाफहरूको मस्यौदा तयार गर्न सहयोग गर्ने | हाम्रा इमेल मेलबक्सहरू | संयुक्त राज्य अमेरिका |
| nl-NL | Vertalen van berichten die u ons stuurt en helpen bij het opstellen van onze antwoorden | Onze e-mailpostvakken | Verenigde Staten |
| pl-PL | Tłumaczenie wiadomości, które Państwo do nas wysyłają, i pomoc w przygotowywaniu naszych odpowiedzi | Nasze skrzynki pocztowe | Stany Zjednoczone |
| pt-BR | Tradução das mensagens que você nos envia e ajuda na redação das nossas respostas | Nossas caixas de e-mail | Estados Unidos |
| pt-PT | Traduzir as mensagens que nos envia e ajudar a redigir as nossas respostas | As nossas caixas de correio eletrónico | Estados Unidos |
| ro-RO | Traducerea mesajelor pe care ni le trimiteți și ajutor la redactarea răspunsurilor noastre | Căsuțele noastre de e-mail | Statele Unite |
| ru-KZ | Перевод сообщений, которые Вы нам отправляете, и помощь в подготовке наших ответов | Наши почтовые ящики | США |
| si-LK | ඔබ අපට එවන පණිවිඩ පරිවර්තනය කිරීම සහ අපගේ පිළිතුරු කෙටුම්පත් කිරීමට උදව් කිරීම | අපගේ ඊමේල් තැපැල් පෙට්ටි | එක්සත් ජනපදය |
| sk-SK | Preklad správ, ktoré nám posielate, a pomoc pri príprave našich odpovedí | Naše e-mailové schránky | Spojené štáty |
| sl-SI | Prevajanje sporočil, ki nam jih pošljete, in pomoč pri pripravi naših odgovorov | Naši e-poštni predali | Združene države Amerike |
| sq-AL | Përkthimi i mesazheve që na dërgoni dhe ndihma në hartimin e përgjigjeve tona | Kutitë tona postare të email-it | Shtetet e Bashkuara |
| sr-RS | Prevođenje poruka koje nam šaljete i pomoć pri sastavljanju naših odgovora | Naši sandučići e-pošte | Sjedinjene Američke Države |
| sv-SE | Översätter meddelanden som du skickar till oss och hjälper till att formulera utkast till våra svar | Våra e-postlådor | USA |
| sw-TZ | Kutafsiri ujumbe unaotutumia na kusaidia kuandaa rasimu za majibu yetu | Masanduku yetu ya barua pepe | Marekani |
| th-TH | การแปลข้อความที่ท่านส่งถึงเราและการช่วยร่างคำตอบของเรา | กล่องอีเมลของเรา | สหรัฐอเมริกา |
| tr-TR | Bize gönderdiğiniz mesajların çevrilmesi ve yanıtlarımızın taslağının hazırlanmasına yardımcı olunması | E-posta kutularımız | Amerika Birleşik Devletleri |
| uk-UA | Переклад повідомлень, які ви нам надсилаєте, і допомога в підготовці наших відповідей | Наші поштові скриньки | США |
| uz-UZ | Bizga yuborgan xabarlaringizni tarjima qilish va javoblarimiz qoralamasini tayyorlashga yordam berish | Elektron pochta qutilarimiz | Amerika Qoʻshma Shtatlari |
| zh-HK | 翻譯閣下傳送給本公司的訊息，並協助草擬本公司的回覆 | 本公司的電郵信箱 | 美國 |
| zh-TW | 翻譯你傳送給本公司的訊息，並協助草擬本公司的回覆 | 本公司的電子郵件信箱 | 美國 |


**The proposed next step.** Under the manual's rule (§43; legal-languages-1), a translation goes live only with its native read. Send these two rows and the one transfers clause per language to native readers, and correct any wording they flag. Each correction is a text-only edit followed by re-stamping (`scripts/_legal-translations.cjs` `stamp()`) and the checker. Until then, the pages carry my wording, marked for checking.

## 5 · Harnesses and tsc

**New harness `scripts/privacy-processors-1.cjs` (registered): 9 passed, 0 failed.** It checks:

- the rows, their place and the clauses;
- the date and its mirrors;
- that nothing else changed in English or lib/legal.ts (byte for byte);
- all 54 bases: rows present, checker passes, "United States" matches their Stripe row, nothing else changed;
- the 5 unused bases untouched;
- the undo chained in.

**The undo chain** (how older harnesses keep comparing exactly their own change):

- **The named edit:** `scripts/_named-privacy-processors-1.cjs` with `scripts/fixtures/privacy-processors-1-legal-edits.json` holds 168 [now, before] pairs for 56 files, generated from the diff and proved to give back `2d2119f4` byte for byte.
- **Wiring:** it is chained **first** by `_named-till-pack-5-6.cjs` (newest change first). That module's "landed" flag and shown date / lastmod now follow the newest round.

**Re-pins** (each with a dated ⚠️ note):

- `till-pack-5-6` G2, G3, G4, G6 take this edit back before checking their own round. G4 still runs the structure checker on the real file.
- `till-pack-5-6` H7: the message files are compared with `comparison.fit` set aside. **This was a regression from compare-suits-fix-2 (26 Nov), not from this change.** I missed it then because that run's baseline crashed; it's fixed here.
- `france-privacy-1`'s /privacy render check reads the shown date from the chain, not a typed «25 November 2026».

**The 31 legal and privacy harnesses**, now against the commit before this change (`2d2119f4`, run in a clean worktree):

| Harness | Now | Before |
|---|---|---|
| plans-data-model | 154 / 0 | 154 / 0 |
| ai-search-1 | 28 / 0 | 28 / 0 |
| seo-fixes | 86 / 0 | 86 / 0 |
| money-sweep-parity | ✅ identical | ✅ identical |
| us-legal-draft | 36 / 0 | 36 / 0 |
| legal-follow-ups | 34 / 0 | 34 / 0 |
| ireland-3 | 23 / 0 | 23 / 0 |
| anz-terms | 31 / 0 | 31 / 0 |
| canada-2 | 33 / 0 | 33 / 0 |
| about-page | 58 / 0 | 58 / 0 |
| france-1 | 72 / 2 | 72 / 2 (pre-existing) |
| europe-settings | 67 / 0 | 67 / 0 |
| demo-2 | 69 / 0 | 69 / 0 |
| language-phase-1e-tidy | 61 / 0 | 61 / 0 |
| paperwork-1 | 114 / 1 | 114 / 1 (pre-existing) |
| reviews-weather-1 | 79 / 0 | 79 / 0 |
| site-chrome-1 | 34 / 1 | 34 / 1 (pre-existing) |
| cwv-1 | 27 / 0 | 27 / 0 |
| cwv-2 | 42 / 2 | 42 / 2 (pre-existing) |
| world-countries-2 | 47 / 0 | 47 / 0 |
| legal-languages-1 | 407 / 1 | 407 / 1 (pre-existing: `lib/enquiries/answer-pack-server.ts` is an unnamed fixed-English translator) |
| world-countries-3 | 12 / 0 | 12 / 0 |
| seo-geo-2 | 89 / 0 | 89 / 0 |
| contact-1 | 193 / 60 | 193 / 60 (pre-existing) |
| tidy-1 | 89 / 1 | 89 / 1 (pre-existing) |
| pricing-copy-2 | 663 / 0 | 663 / 0 |
| app-fixes-1 | 49 / 0 | 49 / 0 |
| france-notes-1 | 44 / 0 | 44 / 0 |
| france-privacy-1 | **47 / 0** (re-pinned) | 47 / 0 |
| france-privacy-2 | 36 / 0 | 36 / 0 |
| till-pack-5-6 | **64 / 0** (re-pinned) | crashed in the worktree (a symlinked folder, EISDIR); 64 / 0 at its own commit |

Every failure left is also there before this change; none is new. **`tsc --noEmit`: 0 errors.**

## 6 · Check it on localhost

Run `npm run dev`, then open:

- **http://localhost:3000/privacy**: the English policy, section 6 and the "International transfers" paragraph, dated 27 November 2026;
- a translation, for example http://localhost:3000/fr/privacy or http://localhost:3000/de/privacy, which shows the same rows in that language under the English date.

## 7 · What needs you

1. **The native-speaker check of the 54 languages** (§4): add them to Open item 6.
2. **compare-cache-1 is still waiting on your four answers**: the per-country refresh tags on `/api/revalidate`, the draft-mode preview route, the other host, and the `marketing-countries` refreshes. I haven't started it.

## Flags

- Nothing arrived garbled. The one contradiction ("no other wording change" against the date rule and the transfers paragraph) was asked and resolved by your decisions 1 and 2.
- No database writes, no .env opened, no push, no deploy. Only the privacy policy (English and the 54 bases), lib/legal.ts's three date lines and the legal harnesses changed.

## Undo (only if Dominic asks)

`git revert e535b1b6`. That one commit holds the English policy, the 54 translations, lib/legal.ts, the named edit and the harness re-pins.
