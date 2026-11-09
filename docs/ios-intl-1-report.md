# ios-intl-1: iOS 1.1 in every HatchGrab language and country, built and uploaded

*9 November 2026. Committed on main, not pushed; nothing deployed to the website. One database write, the demo truck's events, through a committed migration. No `.env*` file was opened, read, listed, parsed or tested. Nothing was submitted for review.*

## Summary

**Ready to submit.** Version **1.1 (build 3)** is uploaded, processed (VALID), attached to 1.1 and in internal TestFlight ("HatchGrab Testing", where you are the tester). App Store Connect shows it **PREPARE_FOR_SUBMISSION** with nothing missing:
- 29 listing locales, each with text, What's New, its own support / privacy / marketing pages and 3 + 3 screenshots;
- 29 app-info localisations (name "HatchGrab", subtitle, privacy URL);
- the review notes updated for the new features, with the demo account kept.

**The binary is in 29 languages.** en plus the 28 language bases (zh-HK also as zh-Hant) have localised permission prompts (camera, Bluetooth, local network, Face ID) and a localised offline screen. All of it is generated from `messages/` (`nativeShell.binary`), with a harness check so the web and the binary can't drift. The archived app carries all 30 `.lproj` folders plus Base.

**Availability** is exactly the 42 country_settings countries that are App Store territories:
- Moldova and Ukraine are removed;
- Liechtenstein and Gibraltar are not App Store territories;
- "available in new territories" stays off.

**Checks:**
- new harness `ios-intl-1` 16/16;
- `messages-parity` green: the camera prompt is registered as new wording;
- typecheck clean;
- full sweep: §9.

**By hand, for you:** the App Privacy and age-rating answers (§7), then Submit (§10). Seven questions only you can settle are in §7.4.

## 0 · Flags, premises and decisions

- **No span of the brief arrived garbled.**
- **One contradiction, resolved by your decision.** The brief said to put `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_PATH` in `.env.local`, but the standing rule is that an agent never opens any `.env*` file. You chose (b): the settings live in `~/.appstoreconnect/hatchgrab-asc.json` (chmod 600, outside the repo), and every script reads them through `scripts/ios/asc.cjs`.
  - No `.env*` file was touched.
  - `.env.local` is gitignored (`.gitignore:34`, `.env*`), confirmed without opening it.
  - The key file `AuthKey_VSH6CA7249.p8` is in `~/.appstoreconnect/private_keys/`, chmod 600, and was never printed or committed.
  - `AuthKey_JA3JCJK2R3.p8` (17 August, probably the APNs push key) was left untouched in Downloads, as you said.
- **Premise corrected: the app was not "UK storefront only".** It has been on sale in **44 storefronts since 31 August**: the 42 country_settings territories plus Moldova and Ukraine. **For the next manual update:** the manual's "UK storefront only" statements (V16.10, §11, §36, §85.6) are wrong and need correcting, as you asked to be recorded.
- **Premise corrected: two builds had been uploaded, not one.** Build 1 (20 August) is the approved 1.0 and build 2 (27 August) was never released, so the new build is **3**.
- **Blocker met and cleared.** The first upload was refused: "PLA Update available" and "No signing certificate iOS Distribution found". You accepted the updated Program License Agreement, and the upload then succeeded.
- **My mistake, recorded.** A review-notes command I wrote waited on stdin for 4½ hours (a stray `cat` with no input). It was killed and re-run; nothing else was affected.

## 1 · App Store Connect access and the live facts (Part 0)

| Fact (read 9 Nov) | Value |
|---|---|
| App | HatchGrab, `com.hatchgrab.app`, id 6803543106, primary locale **en-GB** |
| Localisations before this work | en-GB only, for the app info and for 1.0 |
| 1.0 (build 1) | READY_FOR_SALE |
| 1.0 name / subtitle | "HatchGrab" / "Food Truck Kitchen Ordering" |
| 1.0 privacy URL | `https://www.hatchgrab.com/privacy` |
| 1.0 support URL | `https://hatchgrab.com/contact` |
| 1.0 marketing URL | none |
| 1.0 keywords | "food truck,street food,pre-order,kitchen display,catering,orders,van,market stall,pitch,trader, pos" |
| 1.0 promotional text | "Take pre-orders, protect your kitchen from over-ordering, and keep serving even when the signal drops. Built for food trucks, not restaurants." |
| 1.0 description | 1,128 characters (saved) |
| Screenshot display types asked for | **APP_IPHONE_65** (1284×2778, portrait) and **APP_IPAD_PRO_3GEN_129** (2752×2064, landscape), 3 each |
| 1.0 iPhone screenshot subjects | Add order's "Confirm order" sheet; Orders; the Add order menu |
| 1.0 iPad screenshot subjects | Orders with the capacity rail; Add order; the kitchen screen |
| Availability | 44 territories since 31 Aug; new territories off |
| Age rating | 4+; every declaration none/false (§7.2) |
| Builds | 1 (20 Aug, in 1.0) and 2 (27 Aug, unreleased); highest = 2 |
| Review contact | Dominic Bonini, dominic@hatchgrab.com, +447941042253 |
| Demo account | `tester@hatchgrab.com`, password set (never printed) |
| Review notes | the offline / native-capabilities notes (kept, extended in §6) |
| TestFlight | one internal group, "HatchGrab Testing" (all builds) |

## 2 · Availability (Part 1)

- **country_settings:** 44 countries, all enabled.
- **App Store territories among them: 42.** All 42 were already available.
- **Not territories:** **LI** (Liechtenstein) and **GI** (Gibraltar). They can't be added; people there install from another storefront, in practice Switzerland and the UK. Their `ios_app_available` flag is on, like every country's.
- **Removed (your decision):** **MDA** (Moldova) and **UKR** (Ukraine). New territories stays off.
- **Final list (42):** ARE, AUS, AUT, BEL, BGR, BRA, CAN, CHE, CYP, CZE, DEU, DNK, ESP, EST, FIN, FRA, GBR, GRC, HKG, HRV, HUN, IRL, ITA, JPN, LTU, LUX, LVA, MEX, MLT, MYS, NLD, NOR, NZL, POL, PRT, ROU, SGP, SVK, SVN, SWE, THA, USA.
- **The script:** `scripts/ios/availability.cjs`. With no flag it shows what would change; `--apply` changes it.

## 3 · What ships in the binary (Part 2)

**Native changes since the approved 1.0 build** (base `b4c7517b`, the 20 August state; build 1 was uploaded that day):

| Change | Where | Web half |
|---|---|---|
| **`hatchgrab-net-printer` plugin** (wired / LAN ticket printing, raw TCP 9100) | `plugins/hatchgrab-net-printer` (Swift and Java), `ios/App/CapApp-SPM/Package.swift`, `package.json` | **Live.** `lib/printing/netTransport.ts`'s chunks (`65e25b621b59fd06.js`, `7296d1efad472f74.js`) are served byte-identical by www.hatchgrab.com (200) |
| `NSLocalNetworkUsageDescription` | Info.plist | the same wired-printing code (live) |
| `NSCameraUsageDescription` | Info.plist | the menu / dish / document photo uploads (live) |
| `LSApplicationCategoryType` = food-and-drink | project file | none |
| Notification icon colour (`#EF8B2C`); the never-existing `beep.wav` default removed | `capacitor.config.ts` (already in `ios/App/App/capacitor.config.json`) | none |
| Shared scheme | `xcshareddata` | none |
| **This brief:** localisations, `NSLocalizedString`, version 1.1 / build 3 | §4 | none |

- **Unchanged:** Capacitor 8.4.0 (core, ios; android 8.4.1) and every plugin version are the same as 1.0's.
- **Nothing to deploy before review.** The shell loads production, which already serves everything above.
- **The web must stay frozen between the recording and the decision.** That is the manual's rule for a remote-URL shell (§10).

**Export compliance (re-run).**
- No cryptography symbol appears in any native Swift: the app's four files and the new plugin. The search covered CommonCrypto, CryptoKit, SecKey, SecItem, Security, CCCrypt, CC_SHA, kSecAttr, OpenSSL, libcrypto, SecRandom, SecTrust and NWProtocolTLS.
- The plugin uses `NWParameters.tcp`: plain TCP on Apple's Network framework, no TLS.
- **`ITSAppUsesNonExemptEncryption = false` stays**, and build 3 carries it (App Store Connect shows `usesNonExemptEncryption: false`).
- `scripts/ios-intl-1.cjs` now repeats this audit on every sweep.

**Privacy manifest (ITMS-91053).**
- The plugin uses no required-reason API (no UserDefaults, file timestamps, boot time, disk space or keyboards).
- The manifest already declares UserDefaults (CA92.1, Capacitor Preferences) and the device ID, with tracking false.
- No change was needed.

**Version and build.**
- `MARKETING_VERSION = 1.1` and `CURRENT_PROJECT_VERSION = 3` in both configurations.
- The `CURRENT_PROJECT_VERSION[sdk=*] = 1` override is removed.
- Xcode resolves 1.1 / 3; the archived Info.plist says `1.1` / `3`.

**Toolchain.** Xcode **27.2** (27B52) with the iOS **27.2** SDK, above Apple's upload minimum (an iOS 26 SDK).

## 4 · The app in every language (Part 3)

**Source.**
- `messages/<locale>.json` → `nativeShell.binary`, seven keys: `cameraUsage`, `bluetoothUsage`, `localNetworkUsage`, `faceIdUsage`, `offlineTitle`, `offlineDetail`, `retry`.
- They are in en-GB and all 28 bases, with back-translations in `docs/i18n/back/<locale>.json`.
- The variants inherit them.

**Generator: `scripts/ios/native-strings.cjs`.**
- It writes `ios/App/App/<lproj>/InfoPlist.strings` (the four purpose strings, plus `CFBundleDisplayName` = "HatchGrab") and `Localizable.strings` (the offline screen).
- It keeps the Xcode project's two localised groups, resource entries and `knownRegions` in step, under fixed `HG03…` ids, so it is idempotent.
- `--check` fails on any drift.

**The languages (30 `.lproj` folders plus Base):** en, fr, de, es, it, pt-PT, pt-BR, nl, sv, da, nb, pl, cs, hu, sk, ro, hr, sl, fi, et, lv, lt, el, bg, ms, ja, zh-HK and zh-Hant (the same words), th, ar.

**The Swift shell.** `HGBridgeViewController`'s three user-visible strings ("Can't reach HatchGrab", "Check your connection.", "Retry") now go through `NSLocalizedString`, with English fallbacks. The URL shown under them is diagnostic and is not translated.

**Accuracy (guideline 5.1.1).**
- Every purpose string says what the English says: same subject, same use, and "not used for anything else" where the English says it.
- **Bluetooth** is written the way each iOS writes it in Settings: 藍牙 (zh-HK), บลูทูธ (th), البلوتوث (ar), and "Bluetooth" elsewhere.

**Confirmed in the archive.** `HatchGrab-1.1-3.xcarchive` holds all 30 `.lproj` folders plus Base. zh-HK's `InfoPlist.strings` was read back from the built app.

**Worth a native check** (the translators' notes):
- **Lithuanian, Latvian, Estonian:** the "it is not used for anything else" pronoun.
- **Malay:** "HatchGrab tidak dapat dicapai" is a little formal as a title.
- **Croatian, Slovenian, Hungarian:** the offline titles read "HatchGrab is unreachable", which means the same.
- **Latvian:** Retry is "Mēģināt vēlreiz", the messages' order.retry; the setup screen uses "Atkārtot".

## 5 · The store listing in every language (Part 4)

**Files: `data/store-listing/<appStoreLocale>.json`, one per locale (29).**
- Fields: `name`, `subtitle`, `promotionalText`, `description`, `keywords`, `whatsNew`, plus `shortDescription` (≤80, for Google Play), `messagesLocale` and `countrySegment`.
- **The format is meant for reuse by Google Play:** name → title, shortDescription → short description, description → full description.
- English back-translations of every translated field are in `docs/i18n/back-store-listing/`.

**The master (en-GB).**
- Subtitle "Food Truck Kitchen Ordering".
- The description covers: order ahead with collection times; capacity-limited times; walk-up orders; the kitchen screen; ticket printing over Bluetooth or the local network; offline protection ("Switch on…", because it is off by default); Face ID / Touch ID; keep-awake; notifications; events and locations.
- It says it is for operators and their staff (guideline 4.2).
- **It is true in all 44 countries:** no prices, plan names or trial lengths, no "subscribe" or "buy", no Android or other platform, no Facebook. The rules live in `scripts/ios/listing-rules.cjs` and also check the 112 plan names in every language.
- Variants: en-US / en-CA use "pickup" and "truck", en-AU "truck".
- **What's New:** "HatchGrab now speaks 29 languages. Print order tickets to a kitchen printer on your local network, as well as over Bluetooth. Fixes and improvements."

**Locales (29), confirmed against App Store Connect.**
- en-GB, en-US, en-AU, en-CA, fr-FR, de-DE (serves DE/AT/CH), es-ES, es-MX, it, pt-PT, pt-BR, nl-NL, sv, da, no, pl, cs, hu, sk, ro, hr, sl-SI, fi, el (serves GR/CY), ja, zh-Hant (serves HK), th, ar-SA (serves AE), ms.
- **Bulgarian, Estonian, Latvian and Lithuanian have no App Store locale.** App Store Connect answered "The language specified is not listed for localization" for bg, bg-BG, et, et-EE, lv, lv-LV, lt and lt-LT, so those countries see the primary language, en-GB.
- Slovenian exists only as `sl-SI`.

**Limits.** Every field is within its limit in every language: subtitles ≤30, keywords 89–99 of 100, promotional text ≤170, descriptions ~1.4–2.6k of 4,000.

**Keywords** come from the per-market search terms in `docs/seo-geo-1/keywords.csv`. Where none existed (MX, BR, JP, HK, TH, AE, MY), they come from that language's own landing words. Country-only words were left out where one listing serves several countries.

**URLs**, each confirmed to answer 200 at push time:

| URL | Points to |
|---|---|
| support | `https://www.hatchgrab.com/<country>/faq`, the language's FAQ, which links to contact |
| privacy | `/<country>/privacy`; English locales use `/privacy`, because their country paths redirect there |
| marketing | `/<country>`, the country landing |

The marketing URL had been cleared on 1.0, when hatchgrab.com served the Village Foodie map. It now points at HatchGrab's own landing.

**Your decision (optional): the "POS" keyword.** Three translators flagged it.
- The English master and most languages carry a POS / till-system search term (POS, Kassensystem, POSレジ, kasszarendszer…), because the keyword research includes it.
- The landing page itself says HatchGrab is **not a POS**.
- A keyword is a search term, not a claim, and the app does record walk-up payments, so I left it in.
- To drop it, edit `keywords` in the files and re-run `node scripts/ios/push-listing.cjs 1.1`.
- Fiscal-till words were already left out (kasa fiskalna, casa de marcat, blagajna, ταμειακό, pokladňa), because HatchGrab is not a certified till.

**Other translator notes (minor):**
- Some subtitles are squeezed to fit 30 characters: el drops "kitchen"; fr and fi use "&"; pt-PT uses the singular.
- In zh-HK the listing says 藍牙, the same as its permission prompt.

## 6 · Screenshots in every language (Part 5)

**Tool: `scripts/ios/store-shots.cjs`.**
- It renders the real dashboard and kitchen pages from **fixture data only**, on the render kit's stand-in: no database, no network, no real truck.
- It uses the built CSS and fonts, in WebKit, in each locale's language, currency and time format, at the two display types App Store Connect asks for.
- Alpha is stripped (3 channels); there is one orientation per device; the per-language fixture words are in `scripts/ios/store-words.cjs`.

**Subjects (the same as 1.0's set):**

| Shot | iPhone 6.5" (1284×2778) | iPad 13" (2752×2064) |
|---|---|---|
| 1 | the "Confirm order" sheet | Orders, with the capacity rail |
| 2 | Orders | Add order |
| 3 | the Add order menu | the kitchen screen |

**Native mode:** a paid plan and no trial, so there are no purchase prompts, below a status bar.

**A healthy service (the manual's V11.35 rule):**
- the event is Live;
- every order is due in the future (no "late" badge);
- every capacity slot is green (no over-capacity banner);
- every order shows its action buttons;
- the board is full, with three orders to confirm.
- 1.0's iPad shot had two red capacity slots; these have none.

**Measured:** 174 images (29 × 6), all at the right size, with no alpha, no sideways overflow, no "late" badge and no untranslated key.

**Contact sheets** of shot 1 for every locale are in `docs/ios-intl-1/`. The PNGs themselves are not committed (they total well over 100 MB); the script regenerates them.

**Seen, not changed:**
- **Hungarian:** forint prices ("5 850,00 Ft") wrap a long pizza name onto two lines. It is readable and true to the product.
- **Arabic:** the iPad's "Add extra wait" label (إضافة وقت انتظار) is truncated **by the product itself** at that width. That is a dashboard layout issue for later.

**Uploaded.** Every locale's two sets were replaced by these files and every asset processed (COMPLETE).

## 7 · Build, upload, TestFlight and review details (Part 6)

### 7.1 Build and upload

- **Archive:** `xcodebuild archive` (Release, generic iOS) succeeded.
- **Upload:** `xcodebuild -exportArchive` with `destination upload`, API-key authentication and `-allowProvisioningUpdates`. "Upload succeeded" (after your PLA acceptance). No keychain prompt appeared.
- **Build 3:** VALID; `usesNonExemptEncryption` false; **attached to 1.1** (read back: build 3).
- **TestFlight:** "HatchGrab Testing" is an internal group with access to all builds, so build 3 joined it automatically (internal state IN_BETA_TESTING).
  - Apple refuses a manual add to such a group ("Cannot add internal group to a build"), which is expected.
  - **You are the group's tester** (`dominicbonini@hotmail.com`), so build 3 is in TestFlight on your devices.

### 7.2 Review details

- **Contact and demo account:** kept exactly as on 1.0. The password was copied across without being printed.
- **Notes** (`scripts/ios/review-notes-1.1.txt`, 3,005 characters): the 1.0 notes kept, "Kitchen printing (iPad)" corrected to cover iPhone too, and a new "New in this version" section:
  - **Wired printing:** the path to it (Settings › Kitchen ticket printing › Wired), what the Local Network prompt is for, and what a reviewer sees with no printer present ("Print test ticket" reports it can't be reached).
  - It also says that a device not yet set to a van shows that message by design.
  - **29 languages.**
  - **The camera prompt.**
- **The demo truck.**
  - Verified by id: `test-truck-3-2` ("App Tester", trial until 31 Dec 2026) is owned by the operator `1e4308fc…`, whose login is `tester@hatchgrab.com` (not an admin, no Stripe account).
  - It had **no events after 17 September**.
  - Migration `20261083_ios_intl_1_demo_events.sql` (committed `2a5c18d9`, run with `scripts/db-migrate.cjs`) added one event a day for **9–22 November**, 09:00–17:00, in the same shape and van as its own last events.
  - It is guarded to abort unless the truck belongs to `tester@hatchgrab.com`, and it is idempotent.
  - Verified: 14 days with one event each, 14 rows, and no other truck touched. Today's event was already auto-opened.
  - ⚠️ **If review runs past 22 November, the notes' "a service every day" stops being true.** Re-run the migration with later dates, or tell me to.

### 7.3 Age rating: enter by hand (App Information › Age Rating)

**Answer as declared today; nothing changes.** Evidence is from a read-only research pass over the code.

| Question | Answer | Why |
|---|---|---|
| Advertising | No | No ad SDK; prompts are first-party |
| Alcohol, tobacco or drug use or references | None | The app has none. Operators' own menus could list drinks; if you want to be cautious, "Infrequent", but I'd keep None |
| Contests | None | Loyalty cards (off) are not contests |
| Gambling / simulated gambling / loot boxes | No / None / No | none |
| Guns or weapons; violence (cartoon, realistic, prolonged); horror or fear; mature or suggestive themes; sexual content and nudity; profanity or crude humour | None | a business tool |
| Health or wellness topics; medical or treatment information | No / None | allergen labels are food labelling |
| **Messaging and chat** | **No** | No user-to-user messaging in the app. WhatsApp auto-replies run server-side on WhatsApp; customer email links leave the app |
| **User-generated content** | **No** | Operator content goes to the public web pages, not to other app users. Customers' free-text names and notes appear only on that truck's own board. "Yes" would bring in guideline 1.2's report / block requirements |
| **Unrestricted web access** | **No** | `allowNavigation` is one host; every other host opens in Safari |
| Parental controls / age assurance | No / No | /terms requires 18+ |
| **Social media** | **No** | The weekly post hands an image to the iOS share sheet; nothing posts to a network |
| **Shared location** | **No** | No device location at all; schedules are business information |
| **Dating / relationships** | **No** | none |

### 7.4 App Privacy: enter by hand (App Privacy › Edit)

**Data used to track you: none.**
- No IDFA or ATT, `NSPrivacyTracking` false, no ad SDK, and PostHog runs in memory only with no identify call.
- **One caveat:** see item 7 under "Things only you can settle" below.

**Data linked to you** (purpose **App Functionality** unless noted; tracking **No** throughout):

| Category | Type | Why it is collected |
|---|---|---|
| Contact Info | **Name** | the account, team invites, walk-up customer names, Stripe onboarding |
| Contact Info | **Email Address** | sign-in, team invites, organiser emails, walk-up customers, contact email. Add **Developer's Advertising or Marketing** only if you will send operators marketing email |
| Contact Info | **Phone Number** | profile, contact, WhatsApp number, walk-up customers |
| Contact Info | **Physical Address** | entered in Stripe's embedded onboarding inside the app. Conservative, because Apple counts partner code in your app |
| Contact Info | **Other User Contact Info** | social handles, website |
| Financial Info | **Payment Info** | bank details in Stripe Connect onboarding (we never receive them). No customer card is ever entered in the app |
| Financial Info | **Other Financial Info** | item costs, accounts settings, reports |
| User Content | **Emails or Text Messages** | document shares to organisers, with your message; team invites |
| User Content | **Photos or Videos** | logos, dish photos, document photos, menu photos, all **kept** |
| User Content | **Other User Content** | menus, schedules, events, documents, post captions, order notes |
| Identifiers | **User ID** | the account id |
| Identifiers | **Device ID** | the app's device id and push token |
| Purchases | **Purchase History** | the orders taken and recorded in the app |
| Usage Data | **Product Interaction** | **Analytics** (PostHog) and **App Functionality** (the audit log) |

**Not collected:** Health, Fitness, Credit Info, Precise Location, Sensitive Info, Contacts, Audio, Gameplay, Customer Support (it is `mailto:`), Browsing History, Search History, Advertising Data, Crash Data, Performance Data, Other Diagnostic Data.

**Undecided:**
- **Coarse Location:** only if PostHog's GeoIP from the IP is on (item 1 below).
- **Other Data Types:** Stripe identity checks, if they run inside the app (item 5 below).

**Differences from what is declared today.**
- **App Store Connect's current App Privacy answers can't be read through the API, and the manual records only "privacy questionnaire answered".** Compare the list above with what the App Privacy page shows; every type above that isn't listed there is a difference.
- **The binary's privacy manifest** (`PrivacyInfo.xcprivacy`) declares only **Device ID**. That is normal: the manifest covers the binary and the questionnaire covers the product.
- **The manual's open item (§36), "does the upload path retain the image", is answered: it does.** So **Photos or Videos must be declared.**

**Gaps between the code and the live /privacy page** (last updated 4 Nov), for a later privacy-page update. Not changed here.
- **Not on the page:**
  - Upstash (IPs, and signup emails in plain text for rate limiting);
  - Google Places (venue searches);
  - Gemini's other uses (schedule reading, venue geocoding, allergens);
  - **Meta's JS SDK in the operator Settings screen**, with automatic event logging;
  - Stripe as the collector of operator identity and bank details;
  - Twilio (legacy; check whether it is still live);
  - Google Fonts (the font picker);
  - Tally (Village Foodie forms);
  - PostHog running in the app's launch, sign-in and setup screens;
  - data operators enter about third parties: team, organisers, walk-up customers.
- **On the page but not matched by the code:**
  - "Business address" is not a field;
  - deletion: "we will delete" (§8) sits beside "12 months after it closes" (§7), while the code anonymises after a 30-day window, executed by an admin.
- **/terms line 61** promises in-person Stripe payments through the app (card reader, contactless, phone). No Terminal or Tap to Pay code exists.
- **A side finding (web, not the app):** `/login?next=/dashboard/<token>` runs PostHog on `/login`, so a dashboard token can reach PostHog in `$current_url`. That is inferred, not observed. The native app skips this redirect.

**Google Play Data safety** (for the next workstream; enter in Play Console › App content › Data safety):
- **Encrypted in transit:** yes.
- **Deletion:** yes. It is in-app (Settings › Delete account) or by email. For Play's required URL, use `/privacy` §8 or add a page.
- **Shared:** none, provided Stripe onboarding and Meta Embedded Signup count as user-initiated and the rest are service providers. The exception is the Meta SDK's automatic event logging (item 7).
- **Collected:**

| Data type | Required? | Purposes |
|---|---|---|
| Name | required | App functionality, Account management |
| Email address | required | App functionality, Account management, Developer communications (plus Marketing only if used) |
| User IDs | required | App functionality, Account management, Fraud prevention / security |
| Phone number | optional | App functionality |
| Address (via Stripe) | optional | App functionality |
| Other personal info (social handles, website) | optional | App functionality |
| Financial: payment info (Stripe bank details) | optional | App functionality |
| Financial: purchase history | required | App functionality |
| Financial: other financial info | optional | App functionality |
| Messages: emails | optional | App functionality |
| Photos | optional | App functionality |
| Files and docs | optional | App functionality |
| App activity: app interactions | required | Analytics, App functionality / security |
| App activity: other user-generated content | optional | App functionality |
| Device or other IDs | optional (push) | App functionality |

- **Not collected:** precise location, health, contacts, calendar, audio, web browsing, installed apps, crash logs.
- **Approximate location:** only if PostHog GeoIP is on.
- **The manual's earlier Play declaration** (Supabase, Vercel, Brevo and Gemini as processors; "no financial features"; no advertising ID) is missing PostHog, Stripe, Meta, Upstash, Google Places and APNs / FCM.

**Things only you can settle:**
1. **PostHog project settings:** IP / GeoIP capture, exception autocapture, heatmaps. They decide Coarse Location and Crash Data.
2. **The Gemini API key tier.** The free tier may let Google use the content.
3. **Twilio:** whether the old WhatsApp webhook is still live.
4. **App Store Connect:** what App Privacy shows today. Compare it with the list above.
5. **Stripe:** whether its identity / date-of-birth step runs inside the app's embedded onboarding.
6. **Marketing email to operators:** whether you'll send it. It decides "Developer's Advertising or Marketing" on Email.
7. **The Meta JS SDK** loads on the WhatsApp Settings panel with `autoLogAppEvents: true, xfbml: true` before any click (`lib/whatsapp/embedded-signup.ts:155`), so Meta can receive app events.
   - Turning those off and loading the SDK only on "Set up" would make "no tracking" and Play's "not shared" safe without argument.
   - That's a code change I did **not** make. I'd recommend it before submitting.

## 8 · messages-parity (your follow-up request)

- **What actually failed.** `messages-parity` failed on **one key, `nativeShell.binary.cameraUsage`** (2 checks): its English could not be traced to the source at baseline `eb7ed44`, because the camera prompt was added to Info.plist after that commit.
- **The other six binary strings** pass as built from pieces of strings that already existed.
- **The variant files** (de-AT, de-CH, …, nl-BE) were not themselves failing. They have no `nativeShell` overrides and inherit en-GB / their base, as they should.
- **The fix.** It follows the harness's own mechanism for new wording: a `NEW_WORDING` entry in `scripts/_messages-parity-1e.cjs`, with its reason. The exact text stays held by `scripts/ios-intl-1.cjs`, which checks that Info.plist's English equals en-GB's.
- **Result:** `messages-parity` **597,453 passed, 0 failed**. The camera prompt is listed among the named new wordings.

## 9 · Checks

- **New harness:** `scripts/ios-intl-1.cjs`, 16/16, registered. It covers the binary's words in every language and their drift against messages, the listing rules for all 29 files, version / build / no override, the crypto audit, the privacy manifest, and that no `.env` is ever read.
- **Typecheck:** clean (`npx tsc --noEmit`, exit 0, before the other session's edits).
- **Translation check:** Structural 0 for ja-JP, ar-AE, zh-HK, bg-BG and lt-LT (and the earlier ones). en-GB's 3 ICU flags were already there at HEAD.
- **Full sweep** (`node scripts/run-harnesses.cjs`), run in a **clean worktree of HEAD** (`e3108076`, which includes gsc-index-2's two commits): **206 harnesses, 205 passed, 1 failed.** The failure is `event-types-render`, the dashboard measurement that was already failing before these briefs.
- **Why a clean worktree.** The same sweep in the shared working tree reported 6 failures: `us-rehearsal-fixes`, `language-phase-1c`, `language-phase-1d2`, `language-phase-2`, `paperwork-1` and `cwv-2`.
  - While it ran, **another session (`village-foodie-e6`, busy) had uncommitted edits in that tree:** the email sender (`lib/email*.ts`, `lib/paperwork/email.ts`, `lib/reviews/email.ts`, four API routes), `app/(app)/manage/[token]/page.tsx`, two fixtures and `harnesses.json`, with `email-sender-1` and `demo-claim-1` reports.
  - The email and language failures come from that **in-progress work**, not from any commit: all five pass at my commit `be975d1b` and at HEAD in a clean copy.
  - `cwv-2` had one failure of mine (every language gained `nativeShell.binary`), now exempted and committed, plus that session's uncommitted edit to the manage page.
  - I did not touch, stage or commit any of that session's files.

## 10 · What Dominic does by hand (in order)

1. **TestFlight:** open TestFlight on the iPad and install HatchGrab **1.1 (3)**. Check that:
   - you can sign in, and the permission prompts and offline screen appear in the device language (Settings › General › Language & Region);
   - wired printing works: Settings › Kitchen ticket printing › Wired › enter the printer's address › Print test ticket;
   - the offline test in the review notes works.
2. **Before submitting, decide item 7 in §7.4** (the Meta SDK). If you want it changed, tell me first: it's a web change you deploy, and the review then sees the deployed web.
3. **App Store Connect › HatchGrab › App Privacy › Edit:** enter the §7.4 answers, after settling items 1, 4, 5 and 6, then **Publish**.
4. **App Store Connect › HatchGrab › App Information › Age Rating › Edit:** confirm the §7.3 answers. They match today's; nothing should change. Save.
5. **App Store Connect › HatchGrab › iOS App › 1.1:**
   - check the screenshots and text (the language menu at the top right switches locale);
   - check "Build" shows 3 and "App Review Information" shows the notes and demo account;
   - optionally, edit the keywords if you decide against "POS" (§5);
   - then **Add for Review**, then **Submit for Review**. That's yours; I never pressed it.
6. **Freeze web deploys from submission until the decision.** The shell shows whatever production serves, and the reviewer's recording must match.
7. **If review is still open on 22 November**, extend the demo truck's events (§7.2).
8. **Push main to GitHub** when you're ready: the work is committed and not pushed (§11).

## 11 · Commits (main, explicit paths, not pushed)

- `2a5c18d9`: the demo-events migration (committed before it was run, as `db-migrate` requires).
- `be975d1b`: iOS 1.1 in every language: the localised binary, version / build, the store listings and back-translations, the scripts, the harness and the contact sheets.
- `e3108076`: `messages-parity` (`NEW_WORDING` for the camera prompt) and `cwv-2` (the new `nativeShell.binary` keys exempted).
- The last commit: this report.
- The tightened review notes went in with `be975d1b`.

**Outside the repo:**
- `~/.appstoreconnect/hatchgrab-asc.json` and `~/.appstoreconnect/private_keys/AuthKey_VSH6CA7249.p8`, both chmod 600;
- the 174 screenshots and the archive, in this session's scratchpad.

## SQL run in this workstream

All read-only, except the migration:
- the country_settings list and its columns, and the app-flag groups;
- the plans' names;
- the demo truck lookup: by name, through `truck_users` (none) and through `trucks.operator_id` → `operators` (`tester@hatchgrab.com`);
- its events from 9 to 22 November, its last events and its van;
- the event-table name and status values;
- the post-migration checks.

The full text of every statement was shown in chat.

### Undo (only if Dominic asks)

To remove the 14 demo events (only rows this migration created):

```sql
delete from public.truck_events
 where truck_id = 'test-truck-3-2' and event_date between date '2026-11-09' and date '2026-11-22'
   and source = 'manual' and venue_name ~ '^Test Event (29|3[0-9]|4[0-2])$';
```
