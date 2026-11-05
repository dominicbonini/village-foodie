# site-chrome-1: one header and one footer for every public page, the phone footer four to a row, the offline line put back

*5 November 2026.*

- **Committed on `main`:** the work in `8269100a`, the screenshots in `be5318cc`, this report in the commit after them. Not pushed, not deployed.
- **No database writes and no migrations.** Nothing touches trucks, orders, ordering pages or payments.
- **Run in parallel with loyalty-1.** Only this work's files were staged, by explicit path. The pre-check passed: perf-1 was committed on `main` (`f70e38c8`, `5622370d`) and no perf-1 worktree was left.

| # | Item | Outcome |
|---|---|---|
| 1 | Inventory | Every page route classified A, B or C (§1). Your answers: Q1 = A (inside the app the legal pages keep today's chrome) and Q2 = A (`/docs/<token>` is group C). |
| 2 | One header and footer for group A | **Done.** Every group-A page renders the landing's nav and footer through `components/landing/MarketingFrame.tsx`, and no page keeps its own copy. `/contact`'s own nav and footer are gone. Inside the app, and on Village Foodie's host, the legal pages keep `LegalChrome` exactly. |
| 3 | Group B logos link home | **Done** (`components/shared/FlowLogo.tsx`, inert inside the app). Forgot-password, verify-email and the demo walkthrough had no logo and now have one (flag 2). |
| 4 | Phone footer, four to a row | **Done, CSS only** (≤720px). The English footer goes from 425px to 276px at 360px. There is no overflow in any of the 28 languages, and every item is at least 44px tall. Desktop is pixel-identical. |
| 5 | Offline wording put back | **Done.** All 59 values are exactly `7e1effa7^`'s, the two `offlineApps` sentences and their code are gone, and `MARKETING_COPY_UPDATED` is 2026-11-05 (35.aj-8). |
| 6 | Reference manual | **V16.12.** Invariant **35.ao-13**, with your app exception, plus a subsection in §48 and a one-line changelog entry. |
| 7 | Proof | `scripts/site-chrome-1.cjs` **33 / 0** (swept). The compare with HEAD is **13 / 0**: the landing and `/features` in all 44 countries differ only in the offline sentence. `scripts/site-chrome-1-screens.cjs` **22 / 0**, with 76 screenshots and two measurement files. The full sweep is in §7. |

## Flags (read these first)

1. **The phone footer's reading order uses CSS `order`.** The markup order is Features, Pricing, FAQ, Privacy, Terms, About, Contact, country, and you asked for the markup not to change. On a phone only, `order` moves About up so the row reads "Features · Pricing · FAQ · About / Privacy · Terms · Contact · GB ⌄".
   - **The cost:** a screen reader and the Tab key still meet Privacy and Terms before About. Changing the markup instead would renumber React's ids on every page.
   - The rule counts from the END of the row (the last five items are always Privacy, Terms, About, Contact and the country menu), so it still works where a country has no FAQ link.
2. **Three focused flows had no logo at all:** /forgot-password, /verify-email and the demo walkthrough (/try). Your invariant says the flows show "a logo-only header that links home", so each gained one.
   - Forgot-password and verify-email get the card wordmark /login already shows.
   - The walkthrough gets a slim slate bar with the white wordmark above its demo banner, on phone and laptop.
   - /setup keeps its "Setting up" label beside the wordmark, as it was.
   - Say if you'd rather they had none.
3. **The shared footer carries "From the people behind Village Foodie".** The old /contact footer deliberately left that line off ("one brand on the page a reviewer opens"; /contact is the App Store support URL). It now shows on /contact and on the web legal pages, as on every other public page. Inside the app the legal pages are unchanged.
4. **The Terms page's new line reads "Country terms".** It reuses the old footer's existing, already-translated label (`legalChrome.countryTerms`), so nothing needed translating. It sits at the top of /terms and every /<country>/terms, linking that language's country terms. "Terms for your country" would need a new key in 28 languages; say if you want it.
5. **Inside the app,** the legal layouts test for the app with its existing marker: the web view appends `HatchGrabNativeApp` to its user agent (capacitor.config.ts; proxy.ts and lib/audit/actor.ts read the same marker). LegalChrome's own logo stays inert through `BrandHomeLink` / `isNativeApp()`.
6. **`LegalChrome` is not deleted.** The app and Village Foodie's host still use it, exactly as you asked. /contact's own nav and footer are deleted.
7. **Fonts are declared once now,** in `MarketingFrame`, instead of again in the landing, /about, /compare, the comparison page and /contact. In a production build the landing's three font class names (`__variable_…`) therefore become the ones /features already used. The fonts, their files and every rendered byte the harnesses compare are the same.
8. **Two landing pages already scroll sideways at 360px,** in the page body and not the footer: Czech (the pricing section's "cheap-head" heading, 373px) and Greek (the hero heading, 363px). The same was true before this work. Reported, not changed.
9. **The offline sentence is restored exactly as asked,** so on every page it again reads as if offline protection is always on. The manual records this as the wording gap you have accepted for now.

## 1 · Inventory (route → before → after)

| Route | Group | Before | After |
|---|---|---|---|
| `/<country>`, `/landing`, `/1ng7n4p5omux2gdk9kqvwz` (one module, `app/landing/page.tsx`) | A | `LandingNav` + `LandingFooter`, inline | `MarketingFrame` ("landing") — byte-identical |
| `/features`, `/<country>/features` | A | `MarketingFrame` | `MarketingFrame` ("page") |
| `/faq`, `/<country>/faq` | A | `MarketingFrame` | `MarketingFrame` ("page") |
| `/about` | A | `LandingNav` + `LandingFooter`, inline | `MarketingFrame` ("page") — byte-identical |
| `/compare`, `/<country>/compare` | A | `LandingNav` + `LandingFooter`, inline, split round the calculator | `MarketingFrame` ("split") — byte-identical |
| `/<country>/<section>/<slug>` (comparison pages) | A | `LandingNav` + `LandingFooter`, inline | `MarketingFrame` ("page", its JSON-LD after) |
| `/contact` on HatchGrab | A | its own nav (an unlinked logo, Log in) and a three-link footer (`HatchGrabContact.tsx`) | `MarketingFrame` ("page"); the form unchanged |
| `/privacy`, `/terms`, `/country-terms` | A | `LegalChrome` (logo-only header, four-link footer) | web on HatchGrab: `MarketingFrame` ("split", en-GB words, the visitor's country); in the app and on Village Foodie: `LegalChrome`, unchanged |
| `/<country>/privacy`, `/terms`, `/country-terms` (28 languages) | A | `LegalChrome` with the country's links | web: `MarketingFrame` ("split", that country, its language); in the app: `LegalChrome`, unchanged |
| `/signup` | B | wordmark in the card, not a link | the same wordmark, a link home |
| `/login`, `/reset-password` | B | card wordmark, not a link | `FlowLogo` card (a link home) |
| `/forgot-password`, `/verify-email` | B | no logo | `FlowLogo` card (flag 2) |
| `/setup` | B | wordmark in its header, not a link | `FlowLogo` header (a link home) |
| `/try/<slug>` (demo walkthrough) | B | no header | `FlowLogo` header bar (flag 2) |
| `/manage`, `/manage/<token>`, `/dashboard`, `/dashboard/<token>`, `…/kds`, `/kds/<token>`, `/admin…` | C | their own (`AppHeader` …) | unchanged |
| `/o/<slug>`, `/trucks/<slug>`, `/trucks/<slug>/order`, `/order/<id>`, `/order/<id>/manage`, `/p/<token>` | C | their own | unchanged |
| `/docs/<token>` (your Q2) | C | the truck's own page | unchanged |
| `/domain` (custom domains), `/app` (the app's start screen), `/dev/ticket-preview` | C | their own / none | unchanged |
| `/`, `/trucks`, `/venues/<slug>`, `/hire`, Village Foodie's `/contact` | C (Village Foodie; on HatchGrab `/` routes to the country page) | Village Foodie's | unchanged |

`scripts/site-chrome-1.cjs` §1 fails if a new page route appears that is in none of the three lists.

## 2 · The shared header and footer

- **`components/landing/MarketingFrame.tsx`** owns the language boundary, the demo modal, the `.hg-landing` chrome with its fonts and stylesheet, the landing's nav (logo → home, Upload menu, Log in) and the landing's footer (country menu, badges from the app flags, the FAQ link where the country has one, the comparison column where it applies). It has three shapes:
  - **"page":** the content inside `.hg-landing`.
  - **"landing":** `hg-hero-watch`, the nav's `ctaFirst` order, bare `#pricing` anchors, and the modal inside the chrome.
  - **"split":** the content OUTSIDE `.hg-landing`, used by /compare's calculator and the legal prose. The sheet's `.hg-landing * { margin: 0 }` reset would flatten them, and `chrome-nav-only` keeps the nav sticky.
- 🔴 **React's ids.** The frame spreads each page's elements in as siblings of the nav and footer, keeping even its `false` slots (`{showTestimonial && …}`), and adds `after` only when a page has one.
  - The country menu's `aria-controls` ids (useId) follow the element tree's shape. A first version shifted them (`_R_7et_` → `_R_trl_`), which the HEAD comparison caught, and the frame was rebuilt so every page's tree has its old shape.
- **The logo** is the landing's own: the top of the page on the landing; the country page on /<country>/… pages; `/landing` on the un-prefixed pages, which the router sends to the visitor's country page (`/uk`).
- **The legal pages on the web:** the nav, then the document in `<main class="bg-slate-50 px-4 py-10">`, then the footer. On the English documents the chrome's words are en-GB (their language) and the country is the visitor's.
  - "Questions? Get in touch — we're real people." and each document are byte-identical.
  - The Terms page gained its "Country terms" line (flag 4).
- **/contact on HatchGrab:** the body (eyebrow, heading, the two ways to reach us, the form) is byte-identical. If the visitor's country can't be read, the page still renders, without the chrome.

## 3 · The phone footer (`app/landing/landing.css`, ≤720px only)

- `.foot-links`: `repeat(4, minmax(0, 1fr))`, centred, `gap: 0 8px`.
- Every link and the country menu: `min-height: 44px`, centred; long labels wrap (`line-height: 1.2`, `overflow-wrap: anywhere`, `hyphens: auto`) and never use an ellipsis.
- The country trigger's own line (`grid-column: 1 / -1`) is removed: it is an ordinary cell.
- The reading order (flag 1).
- **Spacing:**
  - the footer's padding 3rem / 2.2rem → 2rem / 1.6rem;
  - `.foot-grid` gap → .9rem;
  - `.foot-right` gap → 1rem;
  - `.foot-base` 2.4rem / 1.4rem → 1.4rem / .9rem.
- **Apple's clear space** (10px) still holds: 16px above the badge, 20px between two badges, 22px below.
- **Desktop:** every rule outside the ≤720px blocks is byte-identical (checked), and the 1280px footer is pixel-identical before and after in GB, FR, DE, JP and AE.

**Footer height, before → after (`docs/site-chrome-1/footer-heights.json`):**

| Language | 360px | 430px |
|---|---|---|
| en-GB | 425 → 276 | 425 → 276 |
| fr-FR | 380 → 276 | 380 → 276 |
| de-DE | 380 → 276 | 380 → 276 |
| ja-JP | 380 → 276 | 380 → 276 |
| ar-AE (right to left) | 380 → 276 | 380 → 276 |

**At 360px, in all 28 languages and en-GB (`docs/site-chrome-1/overflow-360.json`):**
- no footer is wider than the phone (scrollWidth ≤ clientWidth);
- no footer item overflows its column;
- every link and the country button is at least 44px tall (the shortest is 44px);
- seven or eight items sit in exactly two rows;
- no page scrolls sideways more than it did before (flag 8).

## 4 · The offline words

- `landing.does.offlineBody` and `featuresPage.detail.offline_protection` are restored to each file's exact value at `7e1effa7^`, in en-GB, the 28 bases and the en-US override ("…Continue taking orders…"). That is 59 values, all matching.
- **en-GB:** "If you lose signal, online ordering pauses automatically so customers can't place orders you won't see. Carry on taking orders with the iPhone, iPad and Android app."
- **Removed:**
  - `landing.does.offlineApps` and `featuresPage.offlineApps` (59 keys across the language files and back-translations);
  - the code that appended them by store flag (`app/landing/page.tsx`, `app/features/page.tsx`).
- **Back-translations** are restored from the same commit. Nothing was re-translated. The split message files and catalogues were regenerated.
- **Untouched:** copy-truth-1's trial line and add-van words (`auth.signup.subtitle`, `demoGetStarted.freeMonth`, `manageSettings.vans.addConfirm` are unchanged against the commit before, checked).
- `MARKETING_COPY_UPDATED` = '2026-11-05' (35.aj-8); it moves only the sitemap's country-page lastmod.

**Every language, before and after** (59 values; each "after" compared with `git show 7e1effa7^:<file>`, all ✓):

| Language | Key | Before (HEAD: copy-truth-1's sentence ‖ + its apps sentence, shown where the store flags were on) | After (= 7e1effa7^) | Matches 7e1effa7^ |
|---|---|---|---|---|
| ar-AE | landing.does.offlineBody | فعّل حماية الطلبات دون اتصال، وستتوقف الطلبات عبر الإنترنت تلقائيًا إذا انقطعت الإشارة، حتى لا يتمكن العملاء من إرسال طلبات لن تراها. ‖ + apps sentence: واصل استقبال الطلبات عبر تطبيق iPhone وiPad وAndroid. | إذا انقطعت الإشارة، تتوقف الطلبات عبر الإنترنت تلقائيًا حتى لا يتمكن العملاء من إرسال طلبات لن تراها. واصل استقبال الطلبات عبر تطبيق iPhone وiPad وAndroid. | ✓ |
| ar-AE | featuresPage.detail.offline_protection | فعّل حماية الطلبات دون اتصال، وستتوقف الطلبات عبر الإنترنت تلقائيًا إذا انقطعت الإشارة، حتى لا يتمكن العملاء من إرسال طلبات لن تراها. ‖ + apps sentence: يتيح لك تطبيق iPhone وiPad وAndroid مواصلة استقبال الطلبات دون اتصال، أما لوحة التحكم على الويب فتحتاج إلى اتصال. | عند انقطاع الإشارة، يتوقف الطلب عبر الإنترنت مؤقتًا حتى لا يرسل العملاء طلبات لن تراها. يتيح لك تطبيق iPhone وiPad وAndroid مواصلة استقبال الطلبات دون اتصال، أما لوحة التحكم على الويب فتحتاج إلى اتصال. | ✓ |
| bg-BG | landing.does.offlineBody | Включете защитата на поръчките без интернет и онлайн поръчките спират автоматично, ако загубите сигнал, така че клиентите да не могат да правят поръчки, които няма да видите. ‖ + apps sentence: Продължавайте да приемате поръчки с приложението за iPhone, iPad и Android. | Ако загубите сигнал, онлайн поръчките спират автоматично, така че клиентите да не могат да правят поръчки, които няма да видите. Продължавайте да приемате поръчки с приложението за iPhone, iPad и Android. | ✓ |
| bg-BG | featuresPage.detail.offline_protection | Включете защитата на поръчките без интернет и онлайн поръчките спират автоматично, ако загубите сигнал, така че клиентите да не могат да правят поръчки, които няма да видите. ‖ + apps sentence: С приложението за iPhone, iPad и Android продължавате да приемате поръчки и без интернет; уеб таблото изисква връзка. | Ако загубите сигнал, онлайн поръчките спират, така че клиентите да не могат да правят поръчки, които няма да видите. С приложението за iPhone, iPad и Android продължавате да приемате поръчки и без интернет; уеб таблото изисква връзка. | ✓ |
| cs-CZ | landing.does.offlineBody | Zapněte ochranu objednávek offline a online objednávky se automaticky pozastaví, když ztratíte signál, aby zákazníci nemohli zadat objednávky, které neuvidíte. ‖ + apps sentence: Objednávky dál přijímáte v aplikaci pro iPhone, iPad a Android. | Když ztratíte signál, online objednávky se automaticky pozastaví, aby zákazníci nemohli zadat objednávky, které neuvidíte. Objednávky dál přijímáte v aplikaci pro iPhone, iPad a Android. | ✓ |
| cs-CZ | featuresPage.detail.offline_protection | Zapněte ochranu objednávek offline a online objednávky se automaticky pozastaví, když ztratíte signál, aby zákazníci nemohli zadat objednávky, které neuvidíte. ‖ + apps sentence: Aplikace pro iPhone, iPad a Android vám umožní přijímat objednávky i offline; webový přehled potřebuje připojení. | Když ztratíte signál, online objednávky se pozastaví, aby zákazníci nemohli zadat objednávky, které neuvidíte. Aplikace pro iPhone, iPad a Android vám umožní přijímat objednávky i offline; webový přehled potřebuje připojení. | ✓ |
| da-DK | landing.does.offlineBody | Slå offlinebeskyttelse af bestillinger til, så sættes onlinebestilling automatisk på pause, hvis du mister signalet, så kunderne ikke kan afgive bestillinger, du ikke ser. ‖ + apps sentence: Bliv ved med at tage imod bestillinger med appen til iPhone, iPad og Android. | Hvis du mister signalet, sættes onlinebestilling automatisk på pause, så kunderne ikke kan afgive bestillinger, du ikke ser. Bliv ved med at tage imod bestillinger med appen til iPhone, iPad og Android. | ✓ |
| da-DK | featuresPage.detail.offline_protection | Slå offlinebeskyttelse af bestillinger til, så sættes onlinebestilling automatisk på pause, hvis du mister signalet, så kunderne ikke kan afgive bestillinger, du ikke ser. ‖ + apps sentence: Appen til iPhone, iPad og Android lader dig tage imod bestillinger offline; webdashboardet kræver forbindelse. | Hvis du mister signalet, sættes onlinebestilling på pause, så kunderne ikke kan afgive bestillinger, du ikke ser. Appen til iPhone, iPad og Android lader dig tage imod bestillinger offline; webdashboardet kræver forbindelse. | ✓ |
| de-DE | landing.does.offlineBody | Schalten Sie den Offline-Bestellschutz ein, dann werden Online-Bestellungen automatisch pausiert, wenn Sie den Empfang verlieren, damit Kunden keine Bestellungen aufgeben, die Sie nicht sehen. ‖ + apps sentence: Mit der App für iPhone, iPad und Android nehmen Sie weiter Bestellungen an. | Wenn Sie den Empfang verlieren, werden Online-Bestellungen automatisch pausiert, damit Kunden keine Bestellungen aufgeben, die Sie nicht sehen. Mit der App für iPhone, iPad und Android nehmen Sie weiter Bestellungen an. | ✓ |
| de-DE | featuresPage.detail.offline_protection | Schalten Sie den Offline-Bestellschutz ein, dann werden Online-Bestellungen automatisch pausiert, wenn Sie den Empfang verlieren, damit Kunden keine Bestellungen aufgeben, die Sie nicht sehen. ‖ + apps sentence: Mit der App für iPhone, iPad und Android nehmen Sie offline weiter Bestellungen an; das Web-Dashboard braucht eine Verbindung. | Wenn Sie den Empfang verlieren, werden Online-Bestellungen pausiert, damit Kunden keine Bestellungen aufgeben, die Sie nicht sehen. Mit der App für iPhone, iPad und Android nehmen Sie offline weiter Bestellungen an; das Web-Dashboard braucht eine Verbindung. | ✓ |
| el-GR | landing.does.offlineBody | Ενεργοποιήστε την προστασία παραγγελιών εκτός σύνδεσης και οι online παραγγελίες σταματούν αυτόματα αν χαθεί το σήμα, ώστε οι πελάτες να μη στέλνουν παραγγελίες που δεν θα δείτε. ‖ + apps sentence: Συνεχίστε να δέχεστε παραγγελίες με την εφαρμογή για iPhone, iPad και Android. | Αν χαθεί το σήμα, οι online παραγγελίες σταματούν αυτόματα, ώστε οι πελάτες να μη στέλνουν παραγγελίες που δεν θα δείτε. Συνεχίστε να δέχεστε παραγγελίες με την εφαρμογή για iPhone, iPad και Android. | ✓ |
| el-GR | featuresPage.detail.offline_protection | Ενεργοποιήστε την προστασία παραγγελιών εκτός σύνδεσης και οι online παραγγελίες σταματούν αυτόματα αν χαθεί το σήμα, ώστε οι πελάτες να μη στέλνουν παραγγελίες που δεν θα δείτε. ‖ + apps sentence: Με την εφαρμογή για iPhone, iPad και Android συνεχίζετε να δέχεστε παραγγελίες εκτός σύνδεσης· ο πίνακας ελέγχου web χρειάζεται σύνδεση. | Αν χαθεί το σήμα, οι online παραγγελίες σταματούν, ώστε οι πελάτες να μη στέλνουν παραγγελίες που δεν θα δείτε. Με την εφαρμογή για iPhone, iPad και Android συνεχίζετε να δέχεστε παραγγελίες εκτός σύνδεσης· ο πίνακας ελέγχου web χρειάζεται σύνδεση. | ✓ |
| en-GB | landing.does.offlineBody | Switch on offline protection and online ordering pauses automatically if you lose signal, so customers can’t place orders you won’t see. ‖ + apps sentence: Carry on taking orders with the iPhone, iPad and Android app. | If you lose signal, online ordering pauses automatically so customers can’t place orders you won’t see. Carry on taking orders with the iPhone, iPad and Android app. | ✓ |
| en-GB | featuresPage.detail.offline_protection | Switch on offline protection and online ordering pauses automatically if you lose signal, so customers can’t place orders you won’t see. ‖ + apps sentence: The iPhone, iPad and Android app keeps you taking orders offline; the web dashboard needs a connection. | If you lose signal, online ordering pauses so customers can’t place orders you won’t see. The iPhone, iPad and Android app keeps you taking orders offline; the web dashboard needs a connection. | ✓ |
| en-US | landing.does.offlineBody | (inherited) ‖ + apps sentence: Continue taking orders with the iPhone, iPad and Android app. | If you lose signal, online ordering pauses automatically so customers can’t place orders you won’t see. Continue taking orders with the iPhone, iPad and Android app. | ✓ |
| es-ES | landing.does.offlineBody | Activa la protección de pedidos sin conexión y los pedidos online se pausan solos si te quedas sin cobertura, para que nadie haga pedidos que no vas a ver. ‖ + apps sentence: Sigue tomando pedidos con la app para iPhone, iPad y Android. | Si te quedas sin cobertura, los pedidos online se pausan solos para que nadie haga pedidos que no vas a ver. Sigue tomando pedidos con la app para iPhone, iPad y Android. | ✓ |
| es-ES | featuresPage.detail.offline_protection | Activa la protección de pedidos sin conexión y los pedidos online se pausan solos si te quedas sin cobertura, para que nadie haga pedidos que no vas a ver. ‖ + apps sentence: La app para iPhone, iPad y Android te permite seguir tomando pedidos sin conexión; el panel web necesita conexión. | Si te quedas sin cobertura, los pedidos online se pausan para que nadie haga pedidos que no vas a ver. La app para iPhone, iPad y Android te permite seguir tomando pedidos sin conexión; el panel web necesita conexión. | ✓ |
| et-EE | landing.does.offlineBody | Lülita sisse tellimuste võrguühenduseta kaitse ja veebitellimine peatub automaatselt, kui levi kaob, et kliendid ei saaks esitada tellimusi, mida sa ei näe. ‖ + apps sentence: Jätka tellimuste vastuvõtmist iPhone’i, iPadi ja Androidi rakendusega. | Kui levi kaob, peatub veebitellimine automaatselt, et kliendid ei saaks esitada tellimusi, mida sa ei näe. Jätka tellimuste vastuvõtmist iPhone’i, iPadi ja Androidi rakendusega. | ✓ |
| et-EE | featuresPage.detail.offline_protection | Lülita sisse tellimuste võrguühenduseta kaitse ja veebitellimine peatub automaatselt, kui levi kaob, et kliendid ei saaks esitada tellimusi, mida sa ei näe. ‖ + apps sentence: iPhone’i, iPadi ja Androidi rakendusega saad tellimusi vastu võtta ka võrguühenduseta; veebitöölaud vajab ühendust. | Kui levi kaob, peatub veebitellimine, et kliendid ei saaks esitada tellimusi, mida sa ei näe. iPhone’i, iPadi ja Androidi rakendusega saad tellimusi vastu võtta ka võrguühenduseta; veebitöölaud vajab ühendust. | ✓ |
| fi-FI | landing.does.offlineBody | Ota tilausten offline-suojaus käyttöön, niin verkkotilaukset keskeytyvät automaattisesti, jos yhteys katkeaa, jotta asiakkaat eivät voi tehdä tilauksia, joita et näe. ‖ + apps sentence: Jatka tilausten vastaanottamista iPhone-, iPad- ja Android-sovelluksella. | Jos yhteys katkeaa, verkkotilaukset keskeytyvät automaattisesti, jotta asiakkaat eivät voi tehdä tilauksia, joita et näe. Jatka tilausten vastaanottamista iPhone-, iPad- ja Android-sovelluksella. | ✓ |
| fi-FI | featuresPage.detail.offline_protection | Ota tilausten offline-suojaus käyttöön, niin verkkotilaukset keskeytyvät automaattisesti, jos yhteys katkeaa, jotta asiakkaat eivät voi tehdä tilauksia, joita et näe. ‖ + apps sentence: iPhone-, iPad- ja Android-sovelluksella voit jatkaa tilausten vastaanottamista ilman yhteyttä; selainpohjainen ohjauspaneeli tarvitsee yhteyden. | Jos yhteys katkeaa, verkkotilaukset keskeytyvät, jotta asiakkaat eivät voi tehdä tilauksia, joita et näe. iPhone-, iPad- ja Android-sovelluksella voit jatkaa tilausten vastaanottamista ilman yhteyttä; selainpohjainen ohjauspaneeli tarvitsee yhteyden. | ✓ |
| fr-FR | landing.does.offlineBody | Activez la protection des commandes hors ligne et la commande en ligne se met automatiquement en pause si vous perdez le réseau, pour que les clients ne passent pas de commandes que vous ne verriez pas. ‖ + apps sentence: Continuez à prendre des commandes avec l’app iPhone, iPad et Android. | Si vous perdez le réseau, la commande en ligne se met automatiquement en pause pour que les clients ne passent pas de commandes que vous ne verriez pas. Continuez à prendre des commandes avec l’app iPhone, iPad et Android. | ✓ |
| fr-FR | featuresPage.detail.offline_protection | Activez la protection des commandes hors ligne et la commande en ligne se met automatiquement en pause si vous perdez le réseau, pour que les clients ne passent pas de commandes que vous ne verriez pas. ‖ + apps sentence: L’app iPhone, iPad et Android vous permet de continuer à prendre des commandes hors ligne ; le tableau de bord web nécessite une connexion. | Si vous perdez le réseau, la commande en ligne se met en pause pour que les clients ne passent pas de commandes que vous ne verriez pas. L’app iPhone, iPad et Android vous permet de continuer à prendre des commandes hors ligne ; le tableau de bord web nécessite une connexion. | ✓ |
| hr-HR | landing.does.offlineBody | Uključite zaštitu narudžbi izvan mreže i online naručivanje automatski se pauzira ako izgubite signal, kako kupci ne bi slali narudžbe koje nećete vidjeti. ‖ + apps sentence: Nastavite primati narudžbe u aplikaciji za iPhone, iPad i Android. | Ako izgubite signal, online naručivanje automatski se pauzira kako kupci ne bi slali narudžbe koje nećete vidjeti. Nastavite primati narudžbe u aplikaciji za iPhone, iPad i Android. | ✓ |
| hr-HR | featuresPage.detail.offline_protection | Uključite zaštitu narudžbi izvan mreže i online naručivanje automatski se pauzira ako izgubite signal, kako kupci ne bi slali narudžbe koje nećete vidjeti. ‖ + apps sentence: Aplikacija za iPhone, iPad i Android omogućuje vam primanje narudžbi i izvan mreže; web nadzornoj ploči potrebna je veza. | Ako izgubite signal, online naručivanje se pauzira kako kupci ne bi slali narudžbe koje nećete vidjeti. Aplikacija za iPhone, iPad i Android omogućuje vam primanje narudžbi i izvan mreže; web nadzornoj ploči potrebna je veza. | ✓ |
| hu-HU | landing.does.offlineBody | Kapcsolja be az offline rendelésvédelmet, és ha megszűnik a térerő, az online rendelés automatikusan szünetel, így a vásárlók nem adhatnak le olyan rendelést, amelyet Ön nem látna. ‖ + apps sentence: A rendelésfelvételt folytathatja az iPhone-, iPad- és Android-alkalmazással. | Ha megszűnik a térerő, az online rendelés automatikusan szünetel, így a vásárlók nem adhatnak le olyan rendelést, amelyet Ön nem látna. A rendelésfelvételt folytathatja az iPhone-, iPad- és Android-alkalmazással. | ✓ |
| hu-HU | featuresPage.detail.offline_protection | Kapcsolja be az offline rendelésvédelmet, és ha megszűnik a térerő, az online rendelés automatikusan szünetel, így a vásárlók nem adhatnak le olyan rendelést, amelyet Ön nem látna. ‖ + apps sentence: Az iPhone-, iPad- és Android-alkalmazással offline is fogadhat rendeléseket; a webes vezérlőpulthoz internetkapcsolat kell. | Ha megszűnik a térerő, az online rendelés szünetel, így a vásárlók nem adhatnak le olyan rendelést, amelyet Ön nem látna. Az iPhone-, iPad- és Android-alkalmazással offline is fogadhat rendeléseket; a webes vezérlőpulthoz internetkapcsolat kell. | ✓ |
| it-IT | landing.does.offlineBody | Attiva la protezione ordini offline e gli ordini online si mettono in pausa automaticamente se perdi il segnale, così i clienti non possono inviare ordini che non vedresti. ‖ + apps sentence: Continua a prendere ordini con l’app per iPhone, iPad e Android. | Se perdi il segnale, gli ordini online si mettono in pausa automaticamente, così i clienti non possono inviare ordini che non vedresti. Continua a prendere ordini con l’app per iPhone, iPad e Android. | ✓ |
| it-IT | featuresPage.detail.offline_protection | Attiva la protezione ordini offline e gli ordini online si mettono in pausa automaticamente se perdi il segnale, così i clienti non possono inviare ordini che non vedresti. ‖ + apps sentence: L’app per iPhone, iPad e Android ti permette di continuare a prendere ordini offline; la dashboard web richiede una connessione. | Se perdi il segnale, gli ordini online si mettono in pausa, così i clienti non possono inviare ordini che non vedresti. L’app per iPhone, iPad e Android ti permette di continuare a prendere ordini offline; la dashboard web richiede una connessione. | ✓ |
| ja-JP | landing.does.offlineBody | オフライン注文保護をオンにすると、電波が途切れたときにオンライン注文の受付を自動で一時停止するので、確認できない注文が入ることはありません。 ‖ + apps sentence: iPhone、iPad、Androidのアプリで、そのまま注文を受け付けられます。 | 電波が途切れると、オンライン注文の受付を自動で一時停止するので、確認できない注文が入ることはありません。iPhone、iPad、Androidのアプリで、そのまま注文を受け付けられます。 | ✓ |
| ja-JP | featuresPage.detail.offline_protection | オフライン注文保護をオンにすると、電波が途切れたときにオンライン注文の受付を自動で一時停止するので、確認できない注文が入ることはありません。 ‖ + apps sentence: iPhone・iPad・Androidアプリならオフラインでも注文を受け続けられます。Webダッシュボードはインターネット接続が必要です。 | 電波が届かなくなると、オンライン注文が一時停止され、お客様が見えない注文を確定することはありません。iPhone・iPad・Androidアプリならオフラインでも注文を受け続けられます。Webダッシュボードはインターネット接続が必要です。 | ✓ |
| lt-LT | landing.does.offlineBody | Įjunkite užsakymų apsaugą be ryšio, ir užsakymai internetu automatiškai sustabdomi, jei dingsta ryšys, kad klientai negalėtų pateikti užsakymų, kurių nematytumėte. ‖ + apps sentence: Toliau priimkite užsakymus su iPhone, iPad ir Android programėle. | Jei dingsta ryšys, užsakymai internetu automatiškai sustabdomi, kad klientai negalėtų pateikti užsakymų, kurių nematytumėte. Toliau priimkite užsakymus su iPhone, iPad ir Android programėle. | ✓ |
| lt-LT | featuresPage.detail.offline_protection | Įjunkite užsakymų apsaugą be ryšio, ir užsakymai internetu automatiškai sustabdomi, jei dingsta ryšys, kad klientai negalėtų pateikti užsakymų, kurių nematytumėte. ‖ + apps sentence: Su iPhone, iPad ir Android programėle užsakymus galite priimti ir be ryšio; internetiniam valdymo skydeliui reikia ryšio. | Jei dingsta ryšys, užsakymai internetu sustabdomi, kad klientai negalėtų pateikti užsakymų, kurių nematytumėte. Su iPhone, iPad ir Android programėle užsakymus galite priimti ir be ryšio; internetiniam valdymo skydeliui reikia ryšio. | ✓ |
| lv-LV | landing.does.offlineBody | Ieslēdziet pasūtījumu aizsardzību bezsaistē, un pasūtīšana tiešsaistē automātiski tiek apturēta, ja pazūd signāls, lai klienti nevarētu veikt pasūtījumus, ko jūs neredzēsiet. ‖ + apps sentence: Turpiniet pieņemt pasūtījumus ar iPhone, iPad un Android lietotni. | Ja pazūd signāls, pasūtīšana tiešsaistē automātiski tiek apturēta, lai klienti nevarētu veikt pasūtījumus, ko jūs neredzēsiet. Turpiniet pieņemt pasūtījumus ar iPhone, iPad un Android lietotni. | ✓ |
| lv-LV | featuresPage.detail.offline_protection | Ieslēdziet pasūtījumu aizsardzību bezsaistē, un pasūtīšana tiešsaistē automātiski tiek apturēta, ja pazūd signāls, lai klienti nevarētu veikt pasūtījumus, ko jūs neredzēsiet. ‖ + apps sentence: Ar iPhone, iPad un Android lietotni varat turpināt pieņemt pasūtījumus bezsaistē; tīmekļa vadības panelim vajadzīgs savienojums. | Ja pazūd signāls, pasūtīšana tiešsaistē tiek apturēta, lai klienti nevarētu veikt pasūtījumus, ko jūs neredzēsiet. Ar iPhone, iPad un Android lietotni varat turpināt pieņemt pasūtījumus bezsaistē; tīmekļa vadības panelim vajadzīgs savienojums. | ✓ |
| ms-MY | landing.does.offlineBody | Hidupkan perlindungan pesanan luar talian dan pesanan dalam talian dihentikan seketika secara automatik jika anda hilang isyarat, supaya pelanggan tidak boleh membuat pesanan yang anda tidak nampak. ‖ + apps sentence: Teruskan mengambil pesanan dengan aplikasi iPhone, iPad dan Android. | Jika anda hilang isyarat, pesanan dalam talian dihentikan seketika secara automatik supaya pelanggan tidak boleh membuat pesanan yang anda tidak nampak. Teruskan mengambil pesanan dengan aplikasi iPhone, iPad dan Android. | ✓ |
| ms-MY | featuresPage.detail.offline_protection | Hidupkan perlindungan pesanan luar talian dan pesanan dalam talian dihentikan seketika secara automatik jika anda hilang isyarat, supaya pelanggan tidak boleh membuat pesanan yang anda tidak nampak. ‖ + apps sentence: Aplikasi iPhone, iPad dan Android membolehkan anda terus menerima pesanan secara luar talian; papan pemuka web memerlukan sambungan. | Jika tiada liputan, pesanan dalam talian dijeda supaya pelanggan tidak boleh membuat pesanan yang anda tidak nampak. Aplikasi iPhone, iPad dan Android membolehkan anda terus menerima pesanan secara luar talian; papan pemuka web memerlukan sambungan. | ✓ |
| nb-NO | landing.does.offlineBody | Slå på beskyttelse ved frakobling, så settes nettbestillingen automatisk på pause hvis du mister dekningen, slik at kundene ikke kan legge inn bestillinger du ikke ser. ‖ + apps sentence: Fortsett å ta imot bestillinger med appen for iPhone, iPad og Android. | Mister du dekningen, settes nettbestillingen automatisk på pause, så kundene ikke kan legge inn bestillinger du ikke ser. Fortsett å ta imot bestillinger med appen for iPhone, iPad og Android. | ✓ |
| nb-NO | featuresPage.detail.offline_protection | Slå på beskyttelse ved frakobling, så settes nettbestillingen automatisk på pause hvis du mister dekningen, slik at kundene ikke kan legge inn bestillinger du ikke ser. ‖ + apps sentence: Med appen for iPhone, iPad og Android kan du fortsette å ta imot bestillinger uten nett; nettoversikten krever tilkobling. | Mister du dekningen, settes nettbestillingen på pause, så kundene ikke kan legge inn bestillinger du ikke ser. Med appen for iPhone, iPad og Android kan du fortsette å ta imot bestillinger uten nett; nettoversikten krever tilkobling. | ✓ |
| nl-NL | landing.does.offlineBody | Zet de offlinebeveiliging voor bestellingen aan en online bestellen pauzeert automatisch als je verbinding wegvalt, zodat klanten geen bestellingen plaatsen die jij niet ziet. ‖ + apps sentence: Neem gewoon verder bestellingen op met de app voor iPhone, iPad en Android. | Valt je verbinding weg, dan pauzeert online bestellen automatisch, zodat klanten geen bestellingen plaatsen die jij niet ziet. Neem gewoon verder bestellingen op met de app voor iPhone, iPad en Android. | ✓ |
| nl-NL | featuresPage.detail.offline_protection | Zet de offlinebeveiliging voor bestellingen aan en online bestellen pauzeert automatisch als je verbinding wegvalt, zodat klanten geen bestellingen plaatsen die jij niet ziet. ‖ + apps sentence: Met de app voor iPhone, iPad en Android neem je offline gewoon bestellingen op; het webdashboard heeft een verbinding nodig. | Valt je verbinding weg, dan pauzeert online bestellen, zodat klanten geen bestellingen plaatsen die jij niet ziet. Met de app voor iPhone, iPad en Android neem je offline gewoon bestellingen op; het webdashboard heeft een verbinding nodig. | ✓ |
| pl-PL | landing.does.offlineBody | Włącz ochronę zamówień offline, a zamówienia online automatycznie się wstrzymają, gdy stracisz zasięg, więc klienci nie złożą zamówień, których nie zobaczysz. ‖ + apps sentence: Przyjmuj dalej zamówienia w aplikacji na iPhone, iPad i Android. | Gdy stracisz zasięg, zamówienia online automatycznie się wstrzymują, więc klienci nie złożą zamówień, których nie zobaczysz. Przyjmuj dalej zamówienia w aplikacji na iPhone, iPad i Android. | ✓ |
| pl-PL | featuresPage.detail.offline_protection | Włącz ochronę zamówień offline, a zamówienia online automatycznie się wstrzymają, gdy stracisz zasięg, więc klienci nie złożą zamówień, których nie zobaczysz. ‖ + apps sentence: Aplikacja na iPhone, iPad i Android pozwala dalej przyjmować zamówienia offline; panel w przeglądarce wymaga połączenia. | Gdy stracisz zasięg, zamówienia online się wstrzymują, więc klienci nie złożą zamówień, których nie zobaczysz. Aplikacja na iPhone, iPad i Android pozwala dalej przyjmować zamówienia offline; panel w przeglądarce wymaga połączenia. | ✓ |
| pt-BR | landing.does.offlineBody | Ative a proteção de pedidos offline e os pedidos online são pausados automaticamente se o sinal cair, para que os clientes não façam pedidos que você não vai ver. ‖ + apps sentence: Continue recebendo pedidos com o app para iPhone, iPad e Android. | Se o sinal cair, os pedidos online são pausados automaticamente para que os clientes não façam pedidos que você não vai ver. Continue recebendo pedidos com o app para iPhone, iPad e Android. | ✓ |
| pt-BR | featuresPage.detail.offline_protection | Ative a proteção de pedidos offline e os pedidos online são pausados automaticamente se o sinal cair, para que os clientes não façam pedidos que você não vai ver. ‖ + apps sentence: O app para iPhone, iPad e Android continua recebendo pedidos offline; o painel web precisa de conexão. | Se o sinal cair, os pedidos online são pausados para que os clientes não façam pedidos que você não vai ver. O app para iPhone, iPad e Android continua recebendo pedidos offline; o painel web precisa de conexão. | ✓ |
| pt-PT | landing.does.offlineBody | Ative a proteção de encomendas sem ligação e as encomendas online são pausadas automaticamente se perder a rede, para que os clientes não façam encomendas que não vai ver. ‖ + apps sentence: Continue a receber encomendas com a app para iPhone, iPad e Android. | Se perder a rede, as encomendas online são pausadas automaticamente, para que os clientes não façam encomendas que não vai ver. Continue a receber encomendas com a app para iPhone, iPad e Android. | ✓ |
| pt-PT | featuresPage.detail.offline_protection | Ative a proteção de encomendas sem ligação e as encomendas online são pausadas automaticamente se perder a rede, para que os clientes não façam encomendas que não vai ver. ‖ + apps sentence: A app para iPhone, iPad e Android permite-lhe continuar a receber encomendas offline; o painel web precisa de ligação. | Se perder a rede, as encomendas online são pausadas, para que os clientes não façam encomendas que não vai ver. A app para iPhone, iPad e Android permite-lhe continuar a receber encomendas offline; o painel web precisa de ligação. | ✓ |
| ro-RO | landing.does.offlineBody | Activați protecția comenzilor offline și comenzile online se pun automat pe pauză dacă pierdeți semnalul, ca clienții să nu plaseze comenzi pe care nu le-ați vedea. ‖ + apps sentence: Continuați să primiți comenzi cu aplicația pentru iPhone, iPad și Android. | Dacă pierdeți semnalul, comenzile online se pun automat pe pauză, ca clienții să nu plaseze comenzi pe care nu le-ați vedea. Continuați să primiți comenzi cu aplicația pentru iPhone, iPad și Android. | ✓ |
| ro-RO | featuresPage.detail.offline_protection | Activați protecția comenzilor offline și comenzile online se pun automat pe pauză dacă pierdeți semnalul, ca clienții să nu plaseze comenzi pe care nu le-ați vedea. ‖ + apps sentence: Aplicația pentru iPhone, iPad și Android vă permite să primiți comenzi și offline; panoul de control web are nevoie de conexiune. | Dacă pierdeți semnalul, comenzile online se pun pe pauză, ca clienții să nu plaseze comenzi pe care nu le-ați vedea. Aplicația pentru iPhone, iPad și Android vă permite să primiți comenzi și offline; panoul de control web are nevoie de conexiune. | ✓ |
| sk-SK | landing.does.offlineBody | Zapnite ochranu objednávok offline a online objednávanie sa automaticky pozastaví, ak stratíte signál, aby zákazníci nemohli zadávať objednávky, ktoré by ste nevideli. ‖ + apps sentence: Objednávky prijímajte ďalej v aplikácii pre iPhone, iPad a Android. | Ak stratíte signál, online objednávanie sa automaticky pozastaví, aby zákazníci nemohli zadávať objednávky, ktoré by ste nevideli. Objednávky prijímajte ďalej v aplikácii pre iPhone, iPad a Android. | ✓ |
| sk-SK | featuresPage.detail.offline_protection | Zapnite ochranu objednávok offline a online objednávanie sa automaticky pozastaví, ak stratíte signál, aby zákazníci nemohli zadávať objednávky, ktoré by ste nevideli. ‖ + apps sentence: Aplikácia pre iPhone, iPad a Android vám umožní prijímať objednávky aj offline; webový prehľad potrebuje pripojenie. | Ak stratíte signál, online objednávanie sa pozastaví, aby zákazníci nemohli zadávať objednávky, ktoré by ste nevideli. Aplikácia pre iPhone, iPad a Android vám umožní prijímať objednávky aj offline; webový prehľad potrebuje pripojenie. | ✓ |
| sl-SI | landing.does.offlineBody | Vklopite zaščito naročil brez povezave in spletno naročanje se samodejno ustavi, če izgubite signal, da kupci ne morejo oddati naročil, ki jih ne bi videli. ‖ + apps sentence: Naročila še naprej sprejemajte z aplikacijo za iPhone, iPad in Android. | Če izgubite signal, se spletno naročanje samodejno ustavi, da kupci ne morejo oddati naročil, ki jih ne bi videli. Naročila še naprej sprejemajte z aplikacijo za iPhone, iPad in Android. | ✓ |
| sl-SI | featuresPage.detail.offline_protection | Vklopite zaščito naročil brez povezave in spletno naročanje se samodejno ustavi, če izgubite signal, da kupci ne morejo oddati naročil, ki jih ne bi videli. ‖ + apps sentence: Z aplikacijo za iPhone, iPad in Android sprejemate naročila tudi brez povezave; spletna nadzorna plošča potrebuje povezavo. | Če izgubite signal, se spletno naročanje ustavi, da kupci ne morejo oddati naročil, ki jih ne bi videli. Z aplikacijo za iPhone, iPad in Android sprejemate naročila tudi brez povezave; spletna nadzorna plošča potrebuje povezavo. | ✓ |
| sv-SE | landing.does.offlineBody | Slå på skyddet för beställningar offline så pausas onlinebeställningen automatiskt om du tappar täckningen, så att kunderna inte kan lägga beställningar som du inte ser. ‖ + apps sentence: Fortsätt ta emot beställningar med appen för iPhone, iPad och Android. | Om du tappar täckningen pausas onlinebeställningen automatiskt, så att kunderna inte kan lägga beställningar som du inte ser. Fortsätt ta emot beställningar med appen för iPhone, iPad och Android. | ✓ |
| sv-SE | featuresPage.detail.offline_protection | Slå på skyddet för beställningar offline så pausas onlinebeställningen automatiskt om du tappar täckningen, så att kunderna inte kan lägga beställningar som du inte ser. ‖ + apps sentence: Appen för iPhone, iPad och Android låter dig fortsätta ta emot beställningar offline; översikten på webben kräver uppkoppling. | Om du tappar täckningen pausas onlinebeställningen, så att kunderna inte kan lägga beställningar som du inte ser. Appen för iPhone, iPad och Android låter dig fortsätta ta emot beställningar offline; översikten på webben kräver uppkoppling. | ✓ |
| th-TH | landing.does.offlineBody | เปิดการป้องกันออเดอร์เมื่อออฟไลน์ แล้วการสั่งซื้อออนไลน์จะหยุดชั่วคราวโดยอัตโนมัติหากสัญญาณหลุด ลูกค้าจึงไม่สามารถสั่งออเดอร์ที่คุณมองไม่เห็นได้ ‖ + apps sentence: รับออเดอร์ต่อได้ด้วยแอปบน iPhone, iPad และ Android | หากสัญญาณหลุด การสั่งซื้อออนไลน์จะหยุดชั่วคราวโดยอัตโนมัติ ลูกค้าจึงไม่สามารถสั่งออเดอร์ที่คุณมองไม่เห็นได้ รับออเดอร์ต่อได้ด้วยแอปบน iPhone, iPad และ Android | ✓ |
| th-TH | featuresPage.detail.offline_protection | เปิดการป้องกันออเดอร์เมื่อออฟไลน์ แล้วการสั่งซื้อออนไลน์จะหยุดชั่วคราวโดยอัตโนมัติหากสัญญาณหลุด ลูกค้าจึงไม่สามารถสั่งออเดอร์ที่คุณมองไม่เห็นได้ ‖ + apps sentence: แอปบน iPhone, iPad และ Android ช่วยให้คุณรับออเดอร์ต่อได้แม้ออฟไลน์ ส่วนแดชบอร์ดบนเว็บต้องเชื่อมต่ออินเทอร์เน็ต | หากสัญญาณหาย การสั่งออนไลน์จะหยุดชั่วคราว ลูกค้าจึงสั่งออเดอร์ที่คุณมองไม่เห็นไม่ได้ แอปบน iPhone, iPad และ Android ช่วยให้คุณรับออเดอร์ต่อได้แม้ออฟไลน์ ส่วนแดชบอร์ดบนเว็บต้องเชื่อมต่ออินเทอร์เน็ต | ✓ |
| zh-HK | landing.does.offlineBody | 開啟離線落單保護後，一旦失去訊號，網上落單會自動暫停，以免顧客落了你看不到的單。 ‖ + apps sentence: 你可繼續用 iPhone、iPad 及 Android 應用程式接單。 | 一旦失去訊號，網上落單會自動暫停，以免顧客落了你看不到的單。你可繼續用 iPhone、iPad 及 Android 應用程式接單。 | ✓ |
| zh-HK | featuresPage.detail.offline_protection | 開啟離線落單保護後，一旦失去訊號，網上落單會自動暫停，以免顧客落了你看不到的單。 ‖ + apps sentence: iPhone、iPad 及 Android App 讓你在離線時繼續接單；網上控制台則需要網絡連線。 | 如果失去網絡訊號，網上落單會暫停，以免客人落了你看不到的單。iPhone、iPad 及 Android App 讓你在離線時繼續接單；網上控制台則需要網絡連線。 | ✓ |


## 5 · The reference manual (V16.12)

- **Header and front matter:** V16.12.
- **Changelog:** a one-line V16.12 entry.
- **35.ao-13:** your text, with the app exception: "…except inside the native app, where legal pages keep the logo-only, link-free header (App Review 2.1 / 3.1.1)."
- **§48 "One header and one footer for every public page":** the frame and its three shapes, the legal pages in the app, the flows' logo and the phone footer. It also records that the offline sentence was restored on 5 Nov 2026 at your request, and that offline protection is off until a truck switches it on (the accepted wording gap).

## 6 · Proof

**`scripts/site-chrome-1.cjs` (swept): 33 passed, 0 failed.** It checks:
- the inventory (every route in A, B or C);
- only `MarketingFrame` renders `<LandingNav>` / `<LandingFooter>`;
- the legal pages: shared chrome on the web, `LegalChrome` with the app's user agent and on Village Foodie's host, the French pages, the Terms line;
- /contact;
- the logo → home on group A (rendered) and group B (`FlowLogo` renders `<a href="/">`; every B page draws it);
- the CSS (including desktop byte-identical outside the ≤720px blocks);
- the offline words in every language;
- group C: none of the 25 entries bundles a file this work changed (esbuild import graph; the offline message keys aside).

**`scripts/site-chrome-1.cjs compare` (HEAD `409c1c3e` captured in a worktree): 13 passed, 0 failed.**
- **All 88 pages** (the landing and /features in each of the 44 countries) are byte-identical once the offline sentence is put in. All 88 had a different sentence there, so the transform is exercised everywhere.
- **/about (GB, DE) and /compare (uk, de):** byte-identical.
- **The legal pages inside the app and on Village Foodie's host:** byte-identical (the Terms page's one new line removed by name, exactly once).

**`scripts/site-chrome-1-screens.cjs` (WebKit, by hand): 22 passed, 0 failed.** In `docs/site-chrome-1/`:
- **Before / after at 1280 and 390:** /uk, /contact, /privacy, /terms, /country-terms, /about, /fr/privacy, each as `<page>-<width>-top-<before|after>.jpg` (the header) and `<page>-<width>-footer-<before|after>.png`.
- **The phone footer:** `footer-<locale>-<360|430>-<before|after>.png` for en-GB, fr-FR, de-DE, ja-JP and ar-AE.
- **The measurements:** `footer-heights.json` and `overflow-360.json`.
- The fonts are the browser's fallbacks (next/font is stubbed in the renders), the same before and after.

**Other checks:**
- `tsc` is clean.
- **ESLint:** no changed file has more errors than at HEAD.
- **ui-literals:** `FlowLogo`'s `alt` reads `BRANDS.HATCHGRAB.name`.

**The logo click** is proven from the rendered links and the router: every group-A logo href and the group-B `/` route to the country page (`marketingRedirect`: `/landing` → `/uk`, `/` → `/uk`). The screenshots harness serves static pages, so it does not follow the links.

## 7 · Full sweep and re-pins

**`node scripts/run-harnesses.cjs` (196 registered, the three new scripts included): 196 run, 196 passed, 0 failed.**
- **The first sweep** (before the re-pins) failed 22. All 22 were run at HEAD in a clean worktree, and every one passed there, so none was a failure that already existed.
  - 21 were this work's intended changes, each re-pinned below.
  - The 22nd, `add-order-refresh`, is the manual's known load flake (§79), which passes alone. It is untouched and passed in the second sweep.
- **Nothing fails at HEAD,** so there are no HEAD failures to list separately.

**Re-pinned for this work's intended changes.** Each is named "⚠️ RE-PINNED (site-chrome-1)" and is precise or structural, through `scripts/_lp-site-chrome-1.cjs`:
- **`_lp2-named.cjs` (language-phase-1c, -2):** the focused flows' logo, a PRECISE transform of each BEFORE view (the link wrapped round the wordmark; the card and its image preload added on forgot / verify).
- **`_lp-copy-truth-1.cjs`:** copy-truth-1's offline transform is the identity now the old sentence is back (its anchor still checked). This fixes marketing-country-parity, language-phase-0 and plans-data-model; plans-data-model's "moved ≥ 3" check becomes "moved 0".
- **`_lp-contact-1.cjs` `contactProof`:** /contact's chrome is swapped back to BEFORE's after checking it is the shared frame's, so contact-1's proof still compares every byte of the body. This fixes language-phase-1e, 1e-tidy and plans-data-model.
- **`legalProof` (STRUCTURAL):** the legal pages' document body is byte-identical inside the shared frame. Used by language-phase-1e, 1e-tidy and plans-data-model.
- **The sitemap's country-page lastmod → 2026-11-05 (PRECISE),** in 1e, 1e-tidy and plans-data-model's `COPY_LASTMOD`.
- **`asCopyTruth`:** today's render with the offline sentence written as copy-truth-1 wrote it, its apps sentence exactly where both store badges show (copy-truth-1's own rule). Used where a hash was pinned between copy-truth-1 and now: faq-1, faq-2, faq-3, faq-4, seo-geo-2, store-badges-1. All their pins include `7e1effa7` (checked with git).
- **copy-truth-1:** the offline keys leave "the old text is gone" and are proven back instead; its offline-sentence checks become the restored sentence, whatever the flags; the copy date ≥ 2026-11-05.
- **legal-languages-1:** the translated legal pages link Privacy and Terms (shared footer) and "Get in touch" with the country; the country-terms link is on the Terms page's top.
- **language-phase-1e-tidy:** the copyright line has one home (the shared footer).
- **country-picker-1:** the trigger is an ordinary cell now.
- **seo-fixes:** /terms passes its `countryTermsHref`; the fonts are declared once, in `MarketingFrame`.
- **tidy-2:** the restored sentence itself names the apps.
- **features-list-1:** the copy date ≥ 2026-11-04.
- **reviews-weather-1:** its "nothing live touched" checks read its own commits, not the tree.
- **The two US listings** (`scripts/fixtures/language-phase-1e-us-changed.txt`, `language-phase-2-us-changed.txt`) now name this work's items, as the harnesses rewrote them.

## 8 · Files

**New:**
- `components/shared/FlowLogo.tsx`;
- `scripts/site-chrome-1.cjs`, `scripts/site-chrome-1-screens.cjs`, `scripts/_site-chrome-1-render.cjs`, `scripts/_lp-site-chrome-1.cjs`;
- `docs/site-chrome-1/` (76 images, 2 JSON files).

**Changed:**
- `components/landing/MarketingFrame.tsx`; `app/landing/page.tsx`, `app/landing/landing.css`, `app/features/page.tsx`, `app/about/page.tsx`, `app/compare/page.tsx`, `app/[country]/[section]/[slug]/page.tsx`, `app/contact/page.tsx`, `app/contact/HatchGrabContact.tsx`;
- `app/(legal)/layout.tsx`, `app/[country]/(legal)/layout.tsx`, `app/(legal)/terms/page.tsx`, `components/legal/LegalPage.tsx`, `components/legal/translated-legal.tsx`;
- `app/login`, `signup`, `forgot-password`, `reset-password`, `verify-email` (page and success), `setup`; `components/demo/DemoWalkthrough.tsx`;
- `lib/marketing-meta.ts`; `messages/*.json`, `messages/ns/*/{landing,featuresPage}.json`, `docs/i18n/back/*.json`;
- `docs/reference-manual.md`; `scripts/harnesses.json` and the re-pinned harnesses (§7).

**Not changed:** the footer's and nav's markup (`LandingFooter.tsx`, `LandingNav.tsx`), `LegalChrome.tsx`, every group-C route, `proxy.ts`, `vercel.json`, the database.
