# world-countries-3 — report

*1 November 2026. Branch: `main` (working tree; nothing committed, pushed or deployed). Follows docs/world-countries-2-report.md (§7 G2) and docs/legal-languages-1-report.md (§7 D1, D4).*

## Summary

Three legal text fixes, made in English and in all 28 translations:

1. **Mexico's complaints authority is named.** It is the Secretaría Anticorrupción y Buen Gobierno, with the federal law it enforces and that law's start date.
2. **Terms §3 points at the right section.** It said "Section 9"; it now says "Section 10", which is "Data protection".
3. **Canada's Quebec line** now says a *Canadian French* version is not yet available.

The UAE section is unchanged.

**No date moved, and that is what the legal-date rule requires here.** The rule moves a changed document's "Last updated", its `lib/legal.ts` constant and `TERMS_VERSION` to the date of the change. That date is 1 November 2026, which the Terms, the Country-specific terms, `TERMS_UPDATED`, `COUNTRY_TERMS_UPDATED` and `TERMS_VERSION` (`'2026-11-01'`) already carry. `PRIVACY_UPDATED` (31 October 2026) is untouched, because the Privacy Policy is not edited. The brief names `PRIVACY_UPDATED` among the things to move "exactly as the rule requires", and the rule does not move it. So signup keeps recording `terms_version` '2026-11-01', and the sitemap's lastmods are unchanged (the identity harness).

**No database change: no NOT RUN SQL.** No outreach template was read or touched.

| Proof | Result |
|---|---|
| `scripts/world-countries-3.cjs` (new) | **12 / 12** |
| `scripts/legal-languages-1.cjs` (the legal drift harness: 28 languages × 3 documents re-stamped against today's English, structure and numbers equal; English governing; the pages rendered) | **220 / 220** |
| Legal-page harnesses | legal-follow-ups 34/34 · anz-terms 31/31 · canada-2 33/33 · europe-settings 67/67 · ireland-3 23/23 · us-legal-draft 36/36 · france-1 74/74 · seo-fixes 86/86 · world-countries-1 178/178 · world-countries-2 47/47 · about-page 58/58 |
| canada-1 | 84/85: the one failure ("postal code (not ZIP)…" in a message) fails at HEAD too and is not a legal document |
| translation-check, the 28 bases + es-MX | **0 structural** in every one (no message changed) |
| `scripts/world-countries-1-identity.cjs` (37 live countries vs the HEAD capture) | **440 / 440** |
| Full sweep (`scripts/run-harnesses.cjs`, 175 harnesses) | **172 / 175**. The 3 failures are the same checks that fail at HEAD (schedule-graphics-places "the Feature gates the tab…", canada-1 "postal code (not ZIP)…", europe-languages-1 "de-CH: no ß" in the comparison namespace); none is a legal document |

---

## §1 · The English sentences

**Country-specific terms, Mexico, "Complaints."**
- Before: "Tell us first at privacy@hatchgrab.com. If you are not satisfied, you can complain to the Mexican authority responsible for personal data protection."
- After: "Tell us first at privacy@hatchgrab.com. If you are not satisfied, you can complain to the Secretaría Anticorrupción y Buen Gobierno (Secretariat of Anti-Corruption and Good Governance), which enforces Mexico's Federal Law on the Protection of Personal Data Held by Private Parties (in force since 21 March 2025)."

**Terms of Service §3, "Your customers' data."**
- Before: "…Section 9 sets out how we handle that data on your behalf."
- After: "…Section 10 sets out how we handle that data on your behalf."
- Confirmed by reading the Terms: §9 is "Closing your account" and §10 is "Data protection". §10 is the section about handling customer data on the truck's behalf.

**Country-specific terms, Canada, "Quebec, Saskatchewan and Manitoba."**
- Before: "HatchGrab is not available yet to trucks based in Quebec, because it is not yet available in French, or to trucks…"
- After: "HatchGrab is not available yet to trucks based in Quebec, because a Canadian French version is not yet available, or to trucks…"

The UAE section still names "the UAE Data Office", unchanged (pinned byte for byte by world-countries-2's harness).

## §2 · Every translation

The same three changes are made in `content/legal/<base>/` for all 28 bases. Each paragraph was found at the same place as its English one (the section's index and the paragraph's position in it), and each replacement had to match exactly once. Every file was then re-stamped against today's English, and only after it passed the drift checker without the stamp (same headings, numbers, links, addresses and processors).
- **The authority's Spanish name is kept as written in every language**, followed by its English name translated in brackets.
- **es-ES (also read by Mexico):** the translation of the English name *is* the Spanish name, so it is not repeated. The law is named by its official title, "Ley Federal de Protección de Datos Personales en Posesión de los Particulares".
- **Dates** are in each language's own form ("21 mars 2025", "2025年3月21日", "21 مارس 2025").
- **de-CH / de-LI** read de-DE with ß → ss, as before. The new German sentence has no ß.
- **Japanese** gives the authority's role as a second sentence ("同省は…を執行しています。"), its natural shape.

Before → after, per language:

**fr-FR**
- Mexico: “…à l’autorité mexicaine chargée de la protection des données personnelles.” → “…à la Secretaría Anticorrupción y Buen Gobierno (Secrétariat à la lutte contre la corruption et à la bonne gouvernance), qui fait appliquer la loi fédérale mexicaine sur la protection des données personnelles détenues par des particuliers (en vigueur depuis le 21 mars 2025).”
- Canada: “…parce qu’il n’est pas encore disponible en français…” → “…parce qu’une version en français canadien n’est pas encore disponible…”
- Terms §3: “section 9” → “section 10”

**de-DE**
- Mexico: “…bei der mexikanischen Behörde beschweren, die für den Schutz personenbezogener Daten zuständig ist.” → “…bei der Secretaría Anticorrupción y Buen Gobierno (Sekretariat für Korruptionsbekämpfung und gute Regierungsführung) beschweren, die das mexikanische Bundesgesetz zum Schutz personenbezogener Daten im Besitz von Privatpersonen (in Kraft seit dem 21. März 2025) durchsetzt.”
- Canada: “…weil es noch nicht auf Französisch verfügbar ist…” → “…weil es noch keine kanadisch-französische Version gibt…”
- Terms §3: “Abschnitt 9” → “Abschnitt 10”

**es-ES**
- Mexico: “…ante la autoridad mexicana competente en materia de protección de datos personales.” → “…ante la Secretaría Anticorrupción y Buen Gobierno, que aplica la Ley Federal de Protección de Datos Personales en Posesión de los Particulares de México (en vigor desde el 21 de marzo de 2025).”
- Canada: “…porque aún no está disponible en francés…” → “…porque aún no existe una versión en francés de Canadá…”
- Terms §3: “sección 9” → “sección 10”

**it-IT**
- Mexico: “…all'autorità messicana competente per la protezione dei dati personali.” → “…alla Secretaría Anticorrupción y Buen Gobierno (Segreteria per la lotta alla corruzione e il buon governo), che applica la legge federale messicana sulla protezione dei dati personali detenuti da privati (in vigore dal 21 marzo 2025).”
- Canada: “…perché non è ancora disponibile in francese…” → “…perché non è ancora disponibile una versione in francese canadese…”
- Terms §3: “sezione 9” → “sezione 10”

**pt-PT**
- Mexico: “…à autoridade mexicana responsável pela proteção de dados pessoais.” → “…à Secretaría Anticorrupción y Buen Gobierno (Secretaria Anticorrupção e Bom Governo), que aplica a Lei Federal mexicana de Proteção de Dados Pessoais em Posse de Particulares (em vigor desde 21 de março de 2025).”
- Canada: “…porque ainda não está disponível em francês…” → “…porque ainda não existe uma versão em francês do Canadá…”
- Terms §3: “secção 9” → “secção 10”

**nl-NL**
- Mexico: “…bij de Mexicaanse autoriteit die verantwoordelijk is voor de bescherming van persoonsgegevens.” → “…bij de Secretaría Anticorrupción y Buen Gobierno (Secretariaat voor Corruptiebestrijding en Goed Bestuur), dat toeziet op de naleving van de Mexicaanse federale wet inzake de bescherming van persoonsgegevens in het bezit van particulieren (van kracht sinds 21 maart 2025).”
- Canada: “…omdat het nog niet in het Frans beschikbaar is…” → “…omdat er nog geen Canadees-Franse versie beschikbaar is…”
- Terms §3: “Onderdeel 9” → “Onderdeel 10”

**sv-SE**
- Mexico: “…till den mexikanska myndighet som ansvarar för skydd av personuppgifter.” → “…till Secretaría Anticorrupción y Buen Gobierno (sekretariatet för korruptionsbekämpning och god förvaltning), som verkställer Mexikos federala lag om skydd av personuppgifter som innehas av privata aktörer (i kraft sedan den 21 mars 2025).”
- Canada: “…eftersom det ännu inte finns på franska…” → “…eftersom det ännu inte finns någon kanadensisk-fransk version…”
- Terms §3: “Avsnitt 9” → “Avsnitt 10”

**da-DK**
- Mexico: “…til den mexicanske myndighed med ansvar for beskyttelse af personoplysninger.” → “…til Secretaría Anticorrupción y Buen Gobierno (sekretariatet for korruptionsbekæmpelse og god forvaltning), som håndhæver Mexicos føderale lov om beskyttelse af personoplysninger i private parters besiddelse (i kraft siden den 21. marts 2025).”
- Canada: “…fordi den endnu ikke findes på fransk…” → “…fordi der endnu ikke findes en canadisk-fransk version…”
- Terms §3: “Afsnit 9” → “Afsnit 10”

**nb-NO**
- Mexico: “…til den meksikanske myndigheten som har ansvar for vern av personopplysninger.” → “…til Secretaría Anticorrupción y Buen Gobierno (sekretariatet for korrupsjonsbekjempelse og godt styresett), som håndhever Mexicos føderale lov om vern av personopplysninger som private parter har (i kraft siden 21. mars 2025).”
- Canada: “…fordi tjenesten ennå ikke finnes på fransk…” → “…fordi det ennå ikke finnes en kanadisk-fransk versjon…”
- Terms §3: “Punkt 9” → “Punkt 10”

**pl-PL**
- Mexico: “…do meksykańskiego organu właściwego w sprawach ochrony danych osobowych.” → “…do Secretaría Anticorrupción y Buen Gobierno (Sekretariatu ds. Przeciwdziałania Korupcji i Dobrego Rządzenia), który egzekwuje meksykańską federalną ustawę o ochronie danych osobowych przechowywanych przez podmioty prywatne (obowiązującą od 21 marca 2025 r.).”
- Canada: “…ponieważ nie jest jeszcze dostępny w języku francuskim…” → “…ponieważ nie jest jeszcze dostępna wersja w kanadyjskiej odmianie języka francuskiego…”
- Terms §3: “Sekcja 9” → “Sekcja 10”

**cs-CZ**
- Mexico: “…u mexického orgánu příslušného pro ochranu osobních údajů.” → “…u Secretaría Anticorrupción y Buen Gobierno (Sekretariátu pro boj proti korupci a řádnou správu), který vymáhá mexický federální zákon o ochraně osobních údajů v držení soukromých subjektů (účinný od 21. března 2025).”
- Canada: “…protože zatím není k dispozici ve francouzštině…” → “…protože zatím není k dispozici kanadská francouzská verze…”
- Terms §3: “Oddíl 9” → “Oddíl 10”

**hu-HU**
- Mexico: “…panaszt tehet a személyes adatok védelméért felelős mexikói hatóságnál.” → “…panaszt tehet a Secretaría Anticorrupción y Buen Gobierno (Korrupcióellenes és Jó Kormányzási Titkárság) nevű hatóságnál, amely a magánfelek birtokában lévő személyes adatok védelméről szóló mexikói szövetségi törvényt (hatályos 2025. március 21. óta) érvényesíti.”
- Canada: “…mert még nem érhető el francia nyelven…” → “…mert kanadai francia változata még nem érhető el…”
- Terms §3: “A 9.” → “A 10.”

**sk-SK**
- Mexico: “…mexickému orgánu zodpovednému za ochranu osobných údajov.” → “…Secretaría Anticorrupción y Buen Gobierno (Sekretariátu pre boj proti korupcii a dobrú správu vecí verejných), ktorý presadzuje mexický federálny zákon o ochrane osobných údajov v držbe súkromných subjektov (účinný od 21. marca 2025).”
- Canada: “…pretože ešte nie je dostupný vo francúzštine…” → “…pretože ešte nie je dostupná kanadská francúzska verzia…”
- Terms §3: “Oddiel 9” → “Oddiel 10”

**ro-RO**
- Mexico: “…la autoritatea mexicană responsabilă de protecția datelor cu caracter personal.” → “…la Secretaría Anticorrupción y Buen Gobierno (Secretariatul pentru Combaterea Corupției și Buna Guvernare), care asigură aplicarea Legii federale mexicane privind protecția datelor cu caracter personal deținute de persoane private (în vigoare din 21 martie 2025).”
- Canada: “…deoarece nu este încă disponibil în limba franceză…” → “…deoarece nu există încă o versiune în franceza canadiană…”
- Terms §3: “Secțiunea 9” → “Secțiunea 10”

**hr-HR**
- Mexico: “…meksičkom tijelu nadležnom za zaštitu osobnih podataka.” → “…tijelu Secretaría Anticorrupción y Buen Gobierno (Tajništvo za borbu protiv korupcije i dobro upravljanje), koje provodi meksički Savezni zakon o zaštiti osobnih podataka u posjedu privatnih subjekata (na snazi od 21. ožujka 2025.).”
- Canada: “…jer još nije dostupan na francuskom jeziku…” → “…jer još nije dostupna kanadska francuska verzija…”
- Terms §3: “Odjeljak 9” → “Odjeljak 10”

**sl-SI**
- Mexico: “…pri mehiškem organu, pristojnem za varstvo osebnih podatkov.” → “…pri organu Secretaría Anticorrupción y Buen Gobierno (Sekretariat za boj proti korupciji in dobro upravljanje), ki izvršuje mehiški zvezni zakon o varstvu osebnih podatkov v posesti zasebnih subjektov (velja od 21. marca 2025).”
- Canada: “…ker še ni na voljo v francoščini…” → “…ker kanadska francoska različica še ni na voljo…”
- Terms §3: “Razdelek 9” → “Razdelek 10”

**fi-FI**
- Mexico: “…voit tehdä valituksen henkilötietojen suojasta vastaavalle Meksikon viranomaiselle.” → “…voit tehdä valituksen Secretaría Anticorrupción y Buen Gobierno -virastolle (korruptiontorjunnan ja hyvän hallinnon sihteeristö), joka valvoo Meksikon liittovaltion lakia yksityisten tahojen hallussa olevien henkilötietojen suojasta (voimassa 21. maaliskuuta 2025 alkaen).”
- Canada: “…koska se ei ole vielä saatavilla ranskaksi…” → “…koska Kanadan ranskankielistä versiota ei ole vielä saatavilla…”
- Terms §3: “Kohdassa 9” → “Kohdassa 10”

**et-EE**
- Mexico: “…võite esitada kaebuse Mehhiko asutusele, mis vastutab isikuandmete kaitse eest.” → “…võite esitada kaebuse asutusele Secretaría Anticorrupción y Buen Gobierno (korruptsioonivastase võitluse ja hea valitsemise sekretariaat), mis jõustab Mehhiko föderaalset seadust eraisikute valduses olevate isikuandmete kaitse kohta (kehtib alates 21. märtsist 2025).”
- Canada: “…sest see ei ole veel prantsuse keeles saadaval…” → “…sest Kanada prantsuskeelset versiooni ei ole veel saadaval…”
- Terms §3: “Jaotises 9” → “Jaotises 10”

**lv-LV**
- Mexico: “…jūs varat iesniegt sūdzību Meksikas iestādei, kas atbild par personas datu aizsardzību.” → “…jūs varat iesniegt sūdzību iestādei Secretaría Anticorrupción y Buen Gobierno (Korupcijas apkarošanas un labas pārvaldības sekretariāts), kas nodrošina Meksikas federālā likuma par privātpersonu rīcībā esošo personas datu aizsardzību izpildi (spēkā kopš 2025. gada 21. marta).”
- Canada: “…jo tas vēl nav pieejams franču valodā…” → “…jo Kanādas franču valodas versija vēl nav pieejama…”
- Terms §3: “9. sadaļā” → “10. sadaļā”

**lt-LT**
- Mexico: “…galite pateikti skundą Meksikos institucijai, atsakingai už asmens duomenų apsaugą.” → “…galite pateikti skundą institucijai Secretaría Anticorrupción y Buen Gobierno (Kovos su korupcija ir gero valdymo sekretoriatas), kuri užtikrina Meksikos federalinio įstatymo dėl privačių subjektų turimų asmens duomenų apsaugos vykdymą (galioja nuo 2025 m. kovo 21 d.).”
- Canada: “…nes ji dar neprieinama prancūzų kalba…” → “…nes Kanados prancūzų kalbos versija dar neprieinama…”
- Terms §3: “9 skyriuje” → “10 skyriuje”

**el-GR**
- Mexico: “…στη μεξικανική αρχή που είναι αρμόδια για την προστασία των δεδομένων προσωπικού χαρακτήρα.” → “…στη Secretaría Anticorrupción y Buen Gobierno (Γραμματεία για την Καταπολέμηση της Διαφθοράς και τη Χρηστή Διακυβέρνηση), η οποία επιβάλλει τον ομοσπονδιακό νόμο του Μεξικού για την προστασία των δεδομένων προσωπικού χαρακτήρα που κατέχουν ιδιώτες (σε ισχύ από τις 21 Μαρτίου 2025).”
- Canada: “…επειδή δεν είναι ακόμη διαθέσιμο στα γαλλικά…” → “…επειδή δεν είναι ακόμη διαθέσιμη έκδοση στα γαλλικά του Καναδά…”
- Terms §3: “ενότητα 9” → “ενότητα 10”

**bg-BG**
- Mexico: “…до мексиканския орган, отговарящ за защитата на личните данни.” → “…до Secretaría Anticorrupción y Buen Gobierno (Секретариат за борба с корупцията и добро управление), който прилага мексиканския Федерален закон за защита на личните данни, притежавани от частни лица (в сила от 21 март 2025 г.).”
- Canada: “…тъй като все още не е наличен на френски език…” → “…тъй като все още няма версия на канадски френски…”
- Terms §3: “Раздел 9” → “Раздел 10”

**pt-BR**
- Mexico: “…à autoridade mexicana responsável pela proteção de dados pessoais.” → “…à Secretaría Anticorrupción y Buen Gobierno (Secretaria Anticorrupção e Bom Governo), que aplica a Lei Federal mexicana de Proteção de Dados Pessoais em Posse de Particulares (em vigor desde 21 de março de 2025).”
- Canada: “…porque ainda não está disponível em francês…” → “…porque ainda não há uma versão em francês canadense…”
- Terms §3: “seção 9” → “seção 10”

**ms-MY**
- Mexico: “…kepada pihak berkuasa Mexico yang bertanggungjawab bagi perlindungan data peribadi.” → “…kepada Secretaría Anticorrupción y Buen Gobierno (Sekretariat Antirasuah dan Tadbir Urus Baik), yang menguatkuasakan Undang-undang Persekutuan Mexico mengenai Perlindungan Data Peribadi yang Dipegang oleh Pihak Swasta (berkuat kuasa sejak 21 Mac 2025).”
- Canada: “…kerana ia belum tersedia dalam bahasa Perancis…” → “…kerana versi bahasa Perancis Kanada belum tersedia…”
- Terms §3: “Seksyen 9” → “Seksyen 10”

**ja-JP**
- Mexico: “…個人データ保護を所管するメキシコの当局に苦情を申し立てることができます。” → “…Secretaría Anticorrupción y Buen Gobierno（汚職防止・良き統治省）に苦情を申し立てることができます。同省は、メキシコの「私人が保有する個人データの保護に関する連邦法」（2025年3月21日施行）を執行しています。”
- Canada: “…まだフランス語に対応していないため…” → “…カナダ・フランス語版がまだ提供されていないため…”
- Terms §3: “第9条” → “第10条”

**zh-HK**
- Mexico: “…向負責個人資料保護的墨西哥主管機構投訴。” → “…向 Secretaría Anticorrupción y Buen Gobierno（反貪污及善治秘書處）投訴；該機構負責執行墨西哥《私人持有個人資料保護聯邦法》（自2025年3月21日起生效）。”
- Canada: “…因為 HatchGrab 尚未有法文版本…” → “…因為 HatchGrab 尚未有加拿大法文版本…”
- Terms §3: “第9條” → “第10條”

**th-TH**
- Mexico: “…ร้องเรียนต่อหน่วยงานของเม็กซิโกที่รับผิดชอบด้านการคุ้มครองข้อมูลส่วนบุคคล” → “…ร้องเรียนต่อ Secretaría Anticorrupción y Buen Gobierno (สำนักเลขาธิการต่อต้านการทุจริตและธรรมาภิบาล) ซึ่งบังคับใช้กฎหมายสหพันธรัฐของเม็กซิโกว่าด้วยการคุ้มครองข้อมูลส่วนบุคคลที่อยู่ในความครอบครองของภาคเอกชน (มีผลใช้บังคับตั้งแต่วันที่ 21 มีนาคม 2025)”
- Canada: “…เนื่องจากยังไม่มีให้บริการเป็นภาษาฝรั่งเศส…” → “…เนื่องจากยังไม่มีฉบับภาษาฝรั่งเศสแบบแคนาดา…”
- Terms §3: “ข้อ 9” → “ข้อ 10”

**ar-AE**
- Mexico: “…إلى السلطة المكسيكية المختصة بحماية البيانات الشخصية.” → “…إلى Secretaría Anticorrupción y Buen Gobierno (أمانة مكافحة الفساد والحكم الرشيد)، التي تتولى إنفاذ القانون الاتحادي المكسيكي لحماية البيانات الشخصية التي يحوزها الأفراد والجهات الخاصة (الساري منذ 21 مارس 2025).”
- Canada: “…لأنه غير متوفر بعد باللغة الفرنسية…” → “…لأن نسخة باللغة الفرنسية الكندية غير متوفرة بعد…”
- Terms §3: “القسم 9” → “القسم 10”


⚠️ These translations were written in this workstream, by me, without a native or legal reviewer, as were the legal-languages-1 translations (that report's D2). The English governs and every translated page says so.

## §3 · What the proofs cover, and what they do not

- `world-countries-3.cjs` §3 checks every translation for the following:
  - its Mexico paragraph contains the Spanish name exactly, and the date's day and year;
  - its Terms §3 paragraph has 10 and no 9;
  - both files pass the drift checker against today's English.
- **Canada's reworded clause in each language has no fixed token to test.** Its before and after are listed above, and the drift checker proves the paragraph's structure and numbers.

## §4 · Re-pinned (⚠️ RE-PINNED (world-countries-3), each precise)

- **`scripts/_lp-world-countries-3.cjs` (new module).** It names the three English edits (`EDITS`) and has `asBefore(file, text)`, which takes them back exactly and throws unless each new sentence is there once and the old one nowhere.
- **`scripts/_lp-world-countries-2.cjs`.** Its `asBefore` applies world-countries-3's first, so every harness reading through it still pins every other byte of HEAD's text: legal-follow-ups, anz-terms, canada-2, europe-settings, france-1, ireland-3, us-legal-draft and the legal-languages-1 country-terms check.
- **`scripts/world-countries-2.cjs`, `scripts/legal-languages-1.cjs`.** Their direct comparison of the Terms with "HEAD + world-countries-2's six edits" takes back the §3 number first.
- **`scripts/harnesses.json`.** `world-countries-3.cjs` is listed; `_lp-world-countries-3.cjs` is under shared modules.

## §5 · Files changed

- **English:**
  - `content/legal/country-specific-terms.md` (Mexico, Canada)
  - `content/legal/terms-and-conditions.md` (§3)
- **Translations:** `content/legal/<28 bases>/country-specific-terms.md` and `terms-and-conditions.md`, 56 files, all re-stamped
- **Harnesses:**
  - `scripts/world-countries-3.cjs` (new)
  - `scripts/_lp-world-countries-3.cjs` (new)
  - `scripts/_lp-world-countries-2.cjs`
  - `scripts/world-countries-2.cjs`
  - `scripts/legal-languages-1.cjs`
  - `scripts/harnesses.json`
- **Not changed:** `lib/legal.ts` (no date or version moved), `content/legal/privacy-policy.md` and its translations, every messages file

## §6 · Decisions needed from Dominic

None for this change. Still open from earlier reports: the native legal review (legal-languages-1 D2) and the other world-countries-2 G-points.

## Undo (only if Dominic asks)

No SQL. A working-tree revert of the files in §5.
