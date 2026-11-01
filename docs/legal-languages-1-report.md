# legal-languages-1 — report

*1 November 2026. Branch: `main` (working tree; nothing committed, pushed or deployed). Follows docs/world-countries-2-report.md.*

## Summary

A visitor, customer or truck now sees their own language on every page, and in everything we send them, that the audit can reach.

- **Legal documents:** the Privacy Policy, Terms of Service and Country-specific terms exist in all 28 language bases (84 files).
  - Each is served at its country's address (`/fr/privacy`, `/at/terms`, `/jp/country-terms`).
  - A note at the top of each says the English version governs, and links to it.
  - The date is the English date in the local format. No legal date or `TERMS_VERSION` moved.
  - A drift harness fails the moment the English changes and a translation has not been redone.
- **The account pages:** signup, login, forgot/reset password and verify-email were English everywhere; they now speak the visitor's language. Signup's consent links point at the visitor's own translation.
- **New 404 and error pages** in every language. Until now Next.js's built-in English pages answered in every country.
- **Account emails** follow the operator's truck (password reset, email change, resend verification). Before, they were always en-GB.
- **Links in emails:** the privacy link in every customer email points at the email's own language.
- **Stripe:** the order page's card form and Manage's onboarding open in the page's language.
- **Smaller fixes found by the audit:**
  - the built-in "Private" event type's name;
  - the weekly post's private-event label;
  - stored dietary tags in Manage's menu;
  - a font error's English technical reason.
- **The audit** renders the whole product in each of the 28 languages (≈3,500 views per language, every country switched on in fixtures). **All 28 languages are clean:** no unexplained English sentence on any non-English view, and no other-language sentence on any English view.

**No database change: no NOT RUN SQL in this workstream.** The outreach templates were listed (read-only) and not changed (§6).

| Proof | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `npm run build` | ✓, with `/[country]/privacy`, `/[country]/terms`, `/[country]/country-terms` and `/_not-found` among the routes |
| `scripts/legal-languages-1.cjs` (new, the drift harness) | **220 / 220** |
| `scripts/legal-languages-1-payments.cjs` (new, run by hand; see §3) | **3 / 3** |
| `scripts/legal-languages-1-audit.cjs` (new, the whole-product language audit, 28 languages) | **28 / 28 languages clean**: 3,529 views in the language and 3,544 English views each, every capture complete |
| `scripts/legal-languages-1-screens.cjs` (new, WebKit 390) | **20 / 20**: 10 screenshots in `docs/legal-languages-1/` |
| translation-check, every locale (28 bases and the 6 regional ones) | **0 structural** in every one |
| `scripts/world-countries-1-identity.cjs` (37 live countries vs the HEAD capture) | **440 / 440**. English countries are byte-identical. The 28 non-English countries differ only by their footer's three legal links (84 views, re-pinned precisely) |
| ESLint, the 41 changed or new code files vs HEAD | **0 regressions**; the 14 new files are clean |
| Full sweep (`scripts/run-harnesses.cjs`, 174 harnesses) | **171 / 174**. The 3 failures fail on the same check at HEAD (recorded in docs/world-countries-2-report.md), and none is touched here:
- schedule-graphics-places: "the Feature gates the tab…";
- canada-1: "postal code (not ZIP)…";
- europe-languages-1: "de-CH: no ß" in the comparison namespace.

The first run of this sweep found 7 more. Each was a harness reading a link or a listing this workstream changed; all are re-pinned precisely (§5) or, for places-posts-gating, satisfied by moving the product line. A fresh `npm run build` after the last change also passes |

---

## §1 · The legal documents in every language

### 1.1 What exists

`content/legal/<base>/` holds `privacy-policy.md`, `terms-and-conditions.md` and `country-specific-terms.md` for all 28 language bases:

| Script | Languages |
|---|---|
| Latin | fr-FR, de-DE, es-ES, it-IT, pt-PT, nl-NL, sv-SE, da-DK, nb-NO, pl-PL, cs-CZ, hu-HU, sk-SK, ro-RO, hr-HR, sl-SI, fi-FI, et-EE, lv-LV, lt-LT, pt-BR, ms-MY |
| Greek | el-GR |
| Cyrillic | bg-BG |
| CJK | ja-JP, zh-HK |
| Thai | th-TH |
| Arabic (right to left) | ar-AE |

The regional locales read their base:

| Locale | Reads |
|---|---|
| de-AT, de-CH, de-LI | de-DE |
| es-MX | es-ES |
| nl-BE | nl-NL |
| el-CY | el-GR |
| fr-LU | fr-FR |

de-CH and de-LI get ß → ss when the page is served, as their messages do.

Each translation follows the English exactly:
- the same sections, numbering and cross-references;
- the same dates, retention periods and company details;
- the processor table, kept as a table;
- the legal register, with no new promises.

### 1.2 How a translation is tied to its English

- **Line 1 is a stamp:** `<!-- translation-of: privacy-policy.md sha256:… -->`, the hash of the English file it translates.
- **The date line** is `**<Last updated>:** {{LAST_UPDATED}}`. The page writes in the English document's own date (`lib/legal.ts`), formatted the local way: "31 octobre 2026", "2026年10月31日", "31 أكتوبر 2026" (Gregorian, Latin digits). **A translation can never show a different date from the English**, and translating moves neither `PRIVACY_UPDATED` nor `TERMS_VERSION`. This follows the manual's legal-date rule.
- **The drift checker** (`scripts/_legal-translations.cjs`, CLI `node scripts/_legal-translations.cjs <locale> [file]`) compares a translation with today's English and checks:
  - the stamp;
  - headings, levels and section numbers;
  - bullets per section, and tables (rows × columns);
  - link targets;
  - every number (dates aside);
  - every email and web address;
  - every processor name;
  - no full-width digits.
- **Any later English edit fails `scripts/legal-languages-1.cjs` §1** until each translation is redone and re-stamped. The harness proves this by editing the English in memory: a word, a retention period, a heading.

### 1.3 The pages

- **Routes:** `app/[country]/(legal)/{privacy,terms,country-terms}/page.tsx` and its layout, served at the country's own address.
- **Chrome:** the same `LegalChrome` and `LegalPage` as the English pages, in the language. The header, footer links and contact link (`/contact?country=XX`) stay in that country.
- **The note:** at the top, in the language. For example, fr-FR: "Ceci est une traduction. En cas de divergence avec la version anglaise, la version anglaise prévaut." The link goes to the English page (`/privacy` etc., `lang="en-GB"`). Messages key `legalChrome.translationNote` exists in all 28 bases with back-translations.
- **Metadata:** the title and description are in the language. Canonical points to itself. hreflang names the English page as `en-GB` and `x-default`.
- **English stays reachable everywhere:**
  - `/privacy`, `/terms` and `/country-terms` are unchanged, byte for byte;
  - an English-speaking country's address (e.g. `/ie/privacy`) redirects to the English page;
  - so does a switched-off country's.
- **`<html lang>` and `dir="rtl"`:** the proxy (`proxy.ts`) recognises a legal address and sets the page language from it.
- **Every link to a legal document** now goes through `lib/legal.ts` `legalPath(doc, { country, locale })`. English returns the old address, so every English page is unchanged. The link sites:
  - the landing and marketing footer;
  - the HatchGrab contact page;
  - signup's consent line;
  - the demo's consent line and email note;
  - the operator menu;
  - the order page (two places, and the confirmation);
  - account deletion.
- **Customer emails:** the privacy link in their footer is the email's own language (`lib/email-privacy.ts`, via the translator's locale).

### 1.4 Screenshots (WebKit, 390 wide)

`docs/legal-languages-1/` holds two files per script:

| Script | Files |
|---|---|
| Latin | `privacy-fr-FR-webkit-390.png`, `terms-fr-FR-webkit-390.png` |
| Greek | `privacy-el-GR-…`, `terms-el-GR-…` |
| Cyrillic | `privacy-bg-BG-…`, `terms-bg-BG-…` |
| CJK | `privacy-ja-JP-…`, `terms-ja-JP-…` |
| Arabic | `privacy-ar-AE-…`, `terms-ar-AE-…` (right to left) |

Checked for each page:
- nothing scrolls sideways;
- the note is in the first screen;
- the Arabic page is `dir="rtl"`, with its title laid out right to left;
- every script is set in the same font stack as the Latin page.

⚠️ **An observation, not changed here.** On these app-chrome pages, the computed body font is the system stack (`ui-sans-serif, system-ui, …`), on the English page too. WebKit draws Greek, Cyrillic, Japanese and Arabic with the system's fonts, and the shots show all of them clean. The landing page names its own stack and is unaffected. Whether Geist should apply on app pages is outside this brief.

---

## §2 · The other public pages

| Page | State |
|---|---|
| Landing, /features, /compare and the comparison pages' surrounding text, the plans PDF, the country picker, /about | Already in every language (Language Phase 1e onwards). Covered by the audit's 1e area |
| **Signup, login, forgot password, reset password** | **Were English in every country. Fixed.** `proxy.ts` gives these four pages the language from `?lang=` if it is a valid locale, else the visitor's country (?country → cookie → IP). English sets nothing, so English is byte-identical. Their layouts wrap the page in `lib/i18n/auth-locale.tsx` `<AuthLocale>`, which seeds the words server-side so the first paint is already in the language. The password-reset email's link carries `&lang=` |
| **verify-email** | Its client half is now seeded in the language (`PageLocale` with the auth words) |
| **404 and error pages** | **Did not exist**: Next's built-in English pages answered everywhere. New: `app/not-found.tsx` (the page's language from the proxy's header, else the visitor's country's, else en-GB), `app/error.tsx` (the document's language) and `app/global-error.tsx` (it replaces `<html>`, so it names the failed document's language, else the browser's). The error pages show nothing until a non-English language's words have arrived, so they never flash English. New namespace `errorPage` (6 strings) in en-GB and all 28 bases, with back-translations |
| The demo pages | Already in the language (Language Phase 1c / demo-2c). The consent links now point at the chosen country's translation |
| **Contact** | The surrounding text is translated, and the legal links go to the country's translation. **The form itself is the embedded Tally form (`app/contact/HatchGrabContact.tsx:48`, form id 7R2Ra2) and it is English. Listed as a gap, as the brief asked; no replacement built** |
| Cookie / browser-storage notice | **None exists.** PostHog runs memory-only and nothing sets a consent banner. Browser storage is described in Privacy §5, which is translated with the policy |

---

## §3 · Everything we send

| What | State |
|---|---|
| Customer emails (order confirmation, ready, rejected, cancelled, refunds) | Already in the order's language (Language Phase 1a). **Their privacy link now points at the same language** |
| Operator emails, tickets, KDS (1b) and the go-live, demo and onboarding emails (1c) | Already in the truck's language |
| **Account emails** (password reset, change email, resend verification) | **Were en-GB for everyone. Fixed.** `lib/i18n/server-locale.ts` `localeForOperator(db, operatorId, visitorCountry)` uses the truck's country, else the requesting visitor's country, else en-GB, and a failed read falls back to the visitor's. Proved by a unit check with a fake database in `legal-languages-1.cjs` §5 |
| WhatsApp replies and caveats | Already in the language (1a / 1d2) |
| Plans PDF | Already in the language (1e) |
| Weekly post and social captions | Already in the language. **The private event's public name in the weekly post was the English constant; it is now `privateEvents.publicName` in the truck's language**, passed to every week built (`app/api/weekly-post/route.ts`, `lib/weekly-post/week-data.ts`) |
| Push notifications | Already worded from messages in the truck's language (1b) |
| **Stripe's card form** (the order page's Payment Element) | **Now created in the page's language** (`stripe.elements({ locale })`) |
| **Stripe Connect onboarding** (Manage › Payments, embedded) | **Now created in the truck's language** (`loadConnectAndInitialize({ locale })`) |

Stripe notes:
- `lib/stripe-locale.ts` maps our locales to Stripe's codes:
  - es-MX → `es-419`, nb-NO → `nb`;
  - pt-BR and zh-HK keep their own codes;
  - every other language → its language code;
  - every English locale → nothing, which leaves Stripe on its default exactly as before.
- **No Stripe-hosted page takes a locale here:** there is no Checkout or billing-portal session in the code, and onboarding uses embedded Account Sessions, whose language is set client-side (done).
- Stripe's own emails and receipts are configured in Stripe's dashboard, not in this repository.

⚠️ **The Stripe-locale proof is a separate, by-hand harness.** The sweep's screen refuses any listed file that names Stripe, which would have refused the whole run. I did not disguise the name. Instead, `scripts/legal-languages-1-payments.cjs` holds that check (3/3) and sits in a new `names_payment_provider` group in `scripts/harnesses.json`, with the reason written there. It builds no client, holds no key and makes no request.

---

## §4 · The audit

### 4.1 What it does

`node scripts/legal-languages-1-audit.cjs [--locales …] [--jobs 4] [--reuse]`

1. For every language base, it runs `scripts/languages-1-e2e.cjs`, which copies the tree, switches the fixture truck and its country to that language (every country on), and captures every area the language phases render:
   - **1a:** order page, status page, customer emails, WhatsApp;
   - **1b:** dashboard, KDS, tickets, operator emails;
   - **1c:** setup, sign-in, signup, demo, go-live, the account API answers and emails;
   - **1d:** Manage's Menu, Schedule, Settings;
   - **1d2:** Payments, Billing, Team, Social, the poster, WhatsApp, the domain;
   - **1e:** marketing pages, /features, /compare, the PDF, Billing.
2. It also dumps the same views for GB (`--dump-gb`).
3. It reads every view: visible text, title and meta, OG, JSON-LD, alt and aria text, form and API errors, toasts.
4. It **fails on**:
   - an English sentence (three or more consecutive words that are English and not the language's own) in a non-English view;
   - a sentence in the language on an English (GB) view.
5. Its summary goes to `docs/legal-languages-1/audit-summary.json`, with every exclusion and its reason. The dumps (tens of MB per language) stay in scratch.

### 4.2 What it found and what was fixed

| Finding | Fix |
|---|---|
| Auth pages English in every country | `AuthLocale` + proxy (§2) |
| Account emails in en-GB | `localeForOperator` (§3) |
| Private event type shown as stored ("Private") in every language | `components/manage/EventTypes.tsx` renames the private kind as rows load, in both the panel and the event's type picker; English unchanged |
| Weekly post's private label English | §3 |
| **Stored dietary tags shown raw** in Manage › Menu: the item list, the allergen wizard's pills, a card's extracted options | `dietaryLabel(d, locale)`, as the order page already did. English is unchanged, since en-GB's words equal the stored names and no English locale overrides them |
| **A font failure's technical reason** (our own English `Error` text from `lib/weekly-post/font-store.ts`) inside a translated sentence | A non-English truck gets the existing "could not be added: unknown error" wording, and the reason goes to the server log. English is byte-identical |
| 404 and error pages English | §2 |
| Legal links English | §1.3 |

### 4.3 What the audit itself got wrong, and how it was fixed

- **A race in the e2e harness.** Parallel languages shared one bundle cache (`node_modules/.cache/*-languages-1-e2e`), so a run could read another's half-written bundle: a Spanish run loaded Lithuanian words, and others got a broken module. Fixed: one cache per language (`HG_KIT_CACHE_SUFFIX = languages-1-e2e-<locale>`). The audit now also **fails a language whose capture failed**, rather than reading a partial dump as clean.
- **The setup wizard's press flows looked for buttons by their English label**, so in another language they could not press "Continue" and never captured the later states. `scripts/_lp1c-setup.cjs` now also looks for `setup.continue` / `setup.back` in the language. English is unchanged, since en-US has no such override.

### 4.4 Exclusions (each in `EXCLUDE` / `QUOTED` with its reason; listed in the summary JSON)

- **The fixtures' own data:** dish, category, deal, modifier, note and venue names the harnesses write into their fake database ("Drinks", "Coke", "Olives", "Well done"). An operator's stored menu is shown as stored in every language. One- and two-word names are blanked as whole words even where en-GB has the same word; longer phrases only when en-GB does not.
- **Harness inputs:** English notice strings injected into state; builders called without the locale their real caller passes; fake model replies; the harness's own storage and fetch logs; the 1a fixture's fixed English pre-order label (the real one is built in the truck's language, `lib/preorder.ts`); event-type rows injected into state (the product renames them as it loads them).
- **Emails to HatchGrab staff** (build-request, domain check, the [ACTION] deletion email): admin, English by design.
- **Legacy constant exports** (`lib/copy/*`, `lib/settings-copy.ts`, `lib/kitchen-capacity.ts`) that no screen renders.
- **The DNS record's field names** ("Type / Name / Value", "Target" on Cloudflare) in the custom-domain instructions are each provider's own on-screen labels, quoted verbatim so the truck can match them (`lib/custom-domain/dns.ts`). For an unknown provider the generic "Type / Name / Value" also stays English (see decision D6).
- **On an English page, the setup wizard's refusal for a switched-off country** is in that country's language. The wizard speaks the country being signed up from, by design (Language Phase 1c).
- **Admin, not captured and English:** `app/admin` (every tab), `/api/admin/*` and `components/admin/*`.

A harness assertion (`legal-languages-1.cjs` §6) keeps every fixed-English translator (`translatorFor('en-GB' | DEFAULT_LOCALE, …)`) to a named list with its reason:
- the legacy `lib/copy` exports;
- `lib/charge-settings.ts` (internal);
- the weekly-post refusal fallback beside its code;
- the private-event default label;
- the English legal pages;
- verify-email's invalid-link branch (no account, so no language);
- request-deletion's coded refusal;
- a type test.

### 4.5 Result

`✅ legal-languages-1-audit: 28 of 28 language(s) clean`. In every language:
- **3,529 views** in the language, all captures complete (exit 0);
- **3,544 English (GB) views**;
- **0** views with an unexplained English sentence;
- **0** English views with a sentence in the language.

Per language, 115–150 views are excluded by a named rule and 100–189 views have English that the run traced to the capture itself.

⚠️ **The "capture's own" bucket was spot-checked rather than trusted.** It covers English that is either harness text or en-GB product text that the capture put into state itself. I traced the eight largest groups in ja-JP to their source, and each product path is translated; only the harness's injected state is English:
- the Schedule tab's deal warning "… is sold out": a fixture `stock_warning`. The product builds it with `stockT('stockWarning')`, `app/api/manage/route.ts:426`;
- the PIN screen's "Can't reach the server right now": injected state. The product uses `t('pin.unreachable')`;
- the setup step's town error: the harness reads the refusal code back as en-GB on purpose (`_lp1c-setup.cjs`);
- signup's "already registered": a fake API reply with no code;
- the poster's place names: fixture venues;
- among others.

Each view and its run is listed in `docs/legal-languages-1/audit-summary.json`.

Earlier runs, for the record:
1. **First run:** 0 of 28 clean. Real gaps fixed: §4.2. Harness gaps fixed: §4.3.
2. **Second run:** 27 of 28. The shared bundle cache made three languages' captures fail part-way, and the partial dumps read clean. That is why the audit now fails a partial dump.
3. **Third run, with a cache per language:** 28 of 28.

---

## §5 · Files changed

**New**
- Legal pages:
  - `app/[country]/(legal)/layout.tsx`
  - `app/[country]/(legal)/privacy/page.tsx`, `terms/page.tsx`, `country-terms/page.tsx`
  - `components/legal/translated-legal.tsx`
  - `lib/legal-documents.ts`
- Error pages: `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`
- Account pages: `app/forgot-password/layout.tsx`, `app/reset-password/layout.tsx`, `lib/i18n/auth-locale.tsx`
- Helpers: `lib/i18n/use-legal-path.ts`, `lib/stripe-locale.ts`
- `content/legal/<28 bases>/{privacy-policy,terms-and-conditions,country-specific-terms}.md` (84 files)
- `lib/i18n/catalog/errorPage.ts` and `messages/ns/*/errorPage` (generated by `split-messages`)
- Harnesses:
  - `scripts/_legal-translations.cjs`
  - `scripts/legal-languages-1.cjs`
  - `scripts/legal-languages-1-audit.cjs`
  - `scripts/legal-languages-1-screens.cjs`
  - `scripts/legal-languages-1-payments.cjs`
- Docs:
  - `docs/legal-languages-1/` (10 screenshots, `audit-summary.json`)
  - `docs/i18n/legal-languages-1-progress.md`
  - this report

**Modified: product**
- Legal: `lib/legal.ts` (`legalPath`, `legalUrl`, `legalBaseOf`, `legalAddressOf`, `LEGAL_DOCS`; no constant changed), `components/legal/LegalPage.tsx`, `components/legal/LegalChrome.tsx`, `next.config.ts` (`content/legal` traced into the three routes)
- Proxy and auth: `proxy.ts`, `app/login/layout.tsx`, `app/signup/layout.tsx`, `app/signup/page.tsx`, `app/verify-email/page.tsx`
- Legal link sites: `components/landing/LandingFooter.tsx`, `app/contact/page.tsx`, `app/contact/HatchGrabContact.tsx`, `components/DemoGetStarted.tsx`, `components/landing/DemoUpload.tsx`, `components/dashboard/UserMenu.tsx`, `components/manage/DeleteAccountSection.tsx`
- Order page and Manage: `app/trucks/[slug]/order/page.tsx`, `components/manage/PaymentsTab.tsx`, `components/manage/EventTypes.tsx`, `app/manage/[token]/page.tsx` (dietary tags)
- Weekly post: `app/api/weekly-post/route.ts`, `lib/weekly-post/week-data.ts`
- Emails and locale: `lib/email-privacy.ts`, `lib/i18n/translator.ts` (`translatorLocale`), `lib/i18n/server-locale.ts` (`localeForOperator`)
- Account routes: `app/api/auth/forgot-password/route.ts`, `app/api/auth/change-email/route.ts`, `app/api/auth/resend-verification/route.ts`
- i18n wiring: `lib/i18n/namespaces.ts`, `lib/i18n/page-words.ts`

**Modified: messages**
- `messages/en-GB.json` and the 28 base files: `legalChrome.translationNote` and `errorPage`
- `docs/i18n/back/<28>.json`: their back-translations
- The generated catalogs

**Modified: harnesses**
- `scripts/languages-1-e2e.cjs`: `--dump-gb`, and the per-language cache
- `scripts/_lp1c-setup.cjs`: presses find the language's buttons
- ⚠️ RE-PINNED (legal-languages-1), each precise and commented in place:
  - `scripts/world-countries-1-identity.cjs`: the 28 non-English countries' three legal hrefs only;
  - `scripts/ireland-3.cjs`: its "lib/legal.ts changed nothing else in code" check takes out exactly the two imports and the named `legalPath` block (and fails if they are not where named). Its legal-folder listing reads files only, since `content/legal/` now holds a folder per language;
  - `scripts/anz-terms.cjs`, `scripts/canada-2.cjs`: the same files-only listing;
  - `scripts/legal-follow-ups.cjs`: the order page's privacy link is `legalPath('privacy', { locale })`;
  - `scripts/demo-2.cjs`: the demo's privacy link is `useLegalPath('privacy')`;
  - `scripts/schedule-graphics-places.cjs`: the "no line lost" guard names the three dietary-tag lines with their new form;
  - `scripts/_messages-parity-1e.cjs`: the two new 404 and error sentences named as new wording.
- `places-posts-gating.cjs` asks that the weekly-post plan gate come first in each handler and sit directly before dispatch. So the private-event label is passed inline as `privateEventLabel(locale)` where it is used, not held in a line between them: the product moved, not the proof.
- `scripts/harnesses.json`:
  - `legal-languages-1.cjs` listed;
  - `_legal-translations.cjs` under shared modules;
  - the audit under one-off tools;
  - the screens under needs-a-browser;
  - the payments check in the new `names_payment_provider` group

---

## §6 · Outreach emails (out of scope: listed, nothing changed)

`outreach_templates`, read with one SELECT and nothing written:

| Slug | Label | Channel | Active |
|---|---|---|---|
| `hu_rate_email` | Hatches Up — Customers | email | yes |
| `hatches-up-map-only` | Hatches Up - map only | email | yes |
| `general_email` | (A) First contact - not HU | email | yes |
| `chaser_email` | Chaser — already contacted | email | no |
| `wa_intro` | WhatsApp — short intro | WhatsApp | yes |
| `chase-1` | Chase 1 - HU Ordering | email | yes |
| `wa_chaser` | WhatsApp — short chaser | WhatsApp | yes |
| `b-first-contact-not-hu` | (B) First contact - not HU | email | yes |
| `chase-1-hu-map-only` | Chase 1 - HU Map Only | email | yes |
| `chase-2-hu-map-only-payg` | Chase 2 - HU map only PAYG | email | yes |
| `chase-unltd-offer` | Chase - unltd offer | email | yes |
| `general-outreach-not-vf-or-hu` | (A) General outreach - not VF or HU | email | yes |

---

## §7 · Decisions needed from Dominic

```
D1  Terms §3 says "Section 9" where it means Section 10. Every translator flagged it; the translations
    keep the English as written. Fixing the English re-dates the Terms and TERMS_VERSION (the
    legal-date rule) and needs all 28 translations re-stamped (the drift harness will list them).
    Fix it now, or leave it?

D2  These translations were made by AI translators and back-translated, and they pass the structure
    checks. No lawyer or native legal reviewer has read them. The English governs, and every page
    says so. Do you want a native legal review before going live in any country (which ones first)?

D3  es-MX reads the Spain Spanish (es-ES) legal text. Is that acceptable, or do you want a Mexican
    Spanish legal variant?

D4  The Canada section of the Country-specific terms says it is "not yet available in French". That
    is still true for Canada (no Canadian French is built), but it reads oddly now that a French
    translation exists for France. Reword it, or leave it?

D5  The contact form is the embedded Tally form, in English. Replace it with our own form in every
    language, add translated Tally forms per language, or accept it?

D6  For a DNS provider we have no verified steps for, the record's field names stay English
    ("Type / Name / Value"), as most registrars' screens show them. Translate the generic case, or
    keep it?
```

Translator notes, for the record (no decision needed):
- "merchant of record" has no settled term in several languages; each translator chose the closest term, and the back-translations (`docs/i18n/back/`, legal parts in scratch) show the choice.
- pl-PL and sv-SE render "$75" and "£100" as "75 AUD" and "100 GBP". The amount and currency are unchanged; the drift checker compares the numbers.
- Some translations quote the demo's checkbox in the app's own wording in that language rather than translating the English quote, so the quote matches what the visitor sees.

---

## §8 · Not done, and why

- **Contact form (Tally):** listed, not replaced (brief).
- **Translated pages are not in the sitemap.** The English sitemap is unchanged, byte for byte (the identity harness). The translated pages carry hreflang to the English and canonical to themselves. Adding them to the sitemap is a small follow-up if wanted.
- **The 12 unregistered files** the sweep warns about (`_midnight-*`, `_address-formats-1-after.cjs`, `_lp-address-formats-1.cjs`, `_lp-allergen-card-country.cjs`, `_lp2-named-usl.cjs`, `allergen-card-country-screens.cjs`) belong to other workstreams and were already unregistered. They were not touched.

## Undo (only if Dominic asks)

No SQL was run or proposed. Undo is a working-tree revert of the files in §5.
