# languages-1 — report

**Date:** 22 October 2026 · **Branch:** main (not committed, not pushed, not deployed) · **Database:** untouched (no SQL run,
read-only or otherwise; none needed) · **No real language or country is switched on.**

## Summary

- **The groundwork is in.** A later country with a non-English language is now:
  - its country row and prices (NOT RUN SQL, switched off);
  - one line in `lib/i18n/locales.ts`;
  - one `messages/<locale>.json`;
  - an allergen-guard word file;
  - a back-translation file.

  The recipe is `docs/i18n/add-a-country.md` (§6 below).
- **Proved end to end with a made-up language** ("eo-XA": accented, ~30 % longer, Esperanto formats) in a throwaway copy of
  the tree. It ran through every surface the language phases capture, with WebKit and Chromium screenshots at 390 and 1280
  in `docs/languages-1/`.
  - **0 of 1,770** eo-XA HTML views overflow at 390px because of the language.
  - Every view where English remains (129 of 3,374) is explained (§6.2). None is a product string that escaped messages.
  - The run found and fixed **two real bugs** a first non-English country would have hit: the weekly-post route never
    passed the truck's language to the posters, and the poster design editor crashed on a language's poster key (§6.3).
  - It also found **three phone layouts** that could not hold longer words. They are fixed in CSS scoped to non-English
    pages, so English bytes are untouched.
- **English is byte-identical.** GB/US/IE/AU/NZ/CA output is unchanged:
  - **8,890 of 8,890** captured views (every language phase's GB and US surfaces);
  - **2,850 of 2,850** date, time and money answers (475 × 6 countries);
  - all 28 marketing artefacts (pages, plans PDFs, sitemaps, llms.txt).

  The only change to the English message files is **101 new keys** per locale, with none changed or removed.
- **Allergen guard:**
  - its trigger words are now data per language (`lib/allergen-guard/<lang>.json`, per allergen set);
  - English answers are identical on 1,190 messages × 5 allergen sets;
  - a language with no list **fails safe**: every menu question gets the allergen reply, the AI never answers one, and the
    gap is reported.
- **Checks:** the full sweep passes, **162/162 harnesses** (including the new `languages-1.cjs`) (14 harness files re-pinned, each named in §9). tsc is clean, the build passes, and lint is
  identical to the baseline (2,445 / 378).

---

## 1 · The locale engine

### 1.1 One list

`lib/i18n/locales.ts` is now the only place locales are named. It holds `LOCALES`, `LOCALE_PARENT` (canada-1) and a new
`LANGUAGE_BASES`, which is empty today.

- `scripts/split-messages.cjs` reads all three from that file, evaluating it with `ts.transpileModule`; it no longer keeps
  its own list.
- It generates `lib/i18n/locale-files.ts`, and `lib/i18n/messages.ts` loads every file through it.
- Adding a locale is therefore its line plus its messages file. Nothing else names it.

### 1.2 A non-English locale is its own base, not an override of en-GB

- An **English** locale (en-US/IE/AU/NZ/CA) stays exactly as it was: a sparse override of en-GB, or of its
  `LOCALE_PARENT`.
- A **language base** (e.g. fr-FR) is a full file. split-messages writes a namespace file for every one of en-GB's 111
  namespaces.
- en-GB is only its **last resort**, key by key. `scripts/translation-check.cjs` lists every key that would fall back (as
  a STRUCTURAL problem), so none ships unnoticed.
- A regional variant (fr-BE over fr-FR) uses `LOCALE_PARENT`, exactly as en-CA does over en-US.

### 1.3 Only the visitor's language goes to the browser

For a language base, each generated catalog line is:

```ts
registerLanguage('<ns>', '<locale>', typeof window === 'undefined' ? require('…/<locale>/<ns>.json') : () => import('…/<locale>/<ns>.json'))
```

- **On the server**, the words register synchronously, so SSR, emails, PDFs, tickets and WhatsApp have them at once.
- **In the browser**, it is a loader that runs only when a page is in that language (`ensureLanguage`).
- `useT` re-renders when the words land (`useSyncExternalStore` on the registry version).
- **SSR pages** (marketing, the truck page, the embed, the custom-domain page) seed the language's words for their own
  namespaces through `pageSeedProps` (`lib/i18n/page-words.ts`), so there is no English flash.
- **English pages get no seed prop at all**, so their payloads are unchanged.
- **Today**, with no base, all 111 catalog modules are byte-for-byte the repo's own (languages-1 §1).
- **Not done:** a client-bundle inspection of a real Next build with a language switched on. The registry-level proof is
  in `scripts/languages-1.cjs` §2: the language loader never runs for any of the six English locales.

### 1.4 Dates, ordinals, times, numbers, money: Intl in the country's locale

- `lib/time-utils.ts`: for a non-English locale, every date form is Intl's (`formatOrdinalDate`, `formatShortOrdinalDate`,
  `formatShortDate`, `formatNumericDate`, `formatNumericDayMonth`).
  - There is no hand-built English ordinal and no forced "/" separator.
  - The 12-hour clock is Intl's own.
- English keeps its rules exactly. The 2,850-answer English grid (475 per country × 6) is identical to before languages-1.
- **Money** was already Intl in the currency's locale. Only the "/mo" and " a month" words moved: `perMonthText` in
  `lib/price-text.ts` uses `planFeatures.perMonth.*`, the same output as `perMonthLabel` in GB and CA (asserted).
- **Spot checks** (languages-1 §3):
  - fr-FR "vendredi 9 octobre";
  - de-DE "Fr., 9. Okt." and "09.10.2026";
  - "29 €" with a no-break space.
- `lib/time-utils.ts` and `lib/money-format.ts` stay import-free; 34 harnesses compile them standalone.

### 1.5 `<html lang>`, hreflang, og:locale

- **`<html lang>`** comes from the proxy header, as before: fr-FR stays fr-FR. A truck surface whose language is a base
  also sets `document.documentElement.lang` (`I18nProvider`).
- **Emails and the plans PDF:** `<html lang="fr-FR">` for a non-English locale, and **no attribute for English**
  (`langAttrOf`), so English bytes are identical.
- **og:locale and JSON-LD `inLanguage`** follow the locale (fr_FR / fr-FR). The custom-domain page now sets og:locale for a
  non-English truck.
- **hreflang was already data-driven:** it names each switched-on country's `country_settings.locale`. A French country
  therefore gets `hreflang="fr-FR"` with no code change.

### 1.6 Plan names: in the language file (`planNames.<key>.{name,description,subtitle}`)

**Chosen over a `plan_translations` table**, because it is the simpler correct option:

- it is **one file per country prompt**, with no migration and no table;
- the translation checker already covers it (presence, glossary, invariants, back-translation);
- prices stay in `plan_prices`, which is the data that varies.

**How it works:**

- `lib/plan-names.ts` `localizePlans(catalog, locale)` returns the **same object** for English: nothing is copied, so
  nothing can change.
- For a language, it overlays the names, falling back to the DB row's English.
- **"Pro" is never renamed** (the glossary invariant).
- It is applied wherever plan names are shown:
  - landing, /features, /compare;
  - the plans PDF;
  - the plan refusal;
  - Manage's API;
  - the dashboard plan blocks;
  - `PlanCatalogProvider`.
- `messages-parity` exempts these keys, which are the one set en-GB does not hold.

## 2 · Hardcoded English moved into messages

**English is byte-identical everywhere** (§7). About 100 keys were added per English locale; none was changed or removed.

### 2.1 Moved

| Area | What now reads messages |
|---|---|
| Manage › Menu | Allergen card text ("Contains / May contain": `manageMenuImport.allergenCardText`); the import wizard's trial line; the allergen wizard's dietary column labels (`menuBadges.dietary.*`, via `lib/dietary-label.ts`); prep-time and group-rule labels in the truck's locale |
| Menu upload (Manage + demo) | `components/menu/MenuUploadFields.tsx` (`demoUpload.fields.*`) |
| Setup / demo | Where-you-trade heading, intro, labels and button (`whereYouTrade.*`; DemoGetStarted via `useTIn`) |
| Cuisines | `CuisinePicker` by id (`cuisinePicker.cuisine.<id>`; `lib/cuisines.ts` `cuisineId`) |
| Dietary tags | The order page and `DietaryToggles` (`menuBadges.dietary.<id>`); stored values stay English codes |
| Store badges | `components/StoreBadges.tsx` (`landingFooter.badges.*`) |
| Session banner | `SessionAlertBanner` (`auth.sessionAlert.*`) |
| Embed widget + custom domain | New `embed` namespace: "Loading schedule…", the empty state, "Powered by"; `app/domain/page.tsx` meta description, "Order from", og:locale |
| Dashboard / KDS | Degraded-connection banner (`dashboardBanners.degraded.*`); the "reverted" toast (`orderCard.reverted`); private-event confirms and title (`privateEvents.*`); add-order fit popup and suffix (`addOrder.fitMessage.*`, `addOrder.fitSuffix`) |
| Fonts | "Your own" licence, "Could not load fonts" (`fontPicker.*`) |
| Posters, captions, QR | "Powered by" (`posterWords.poweredBy`, `manageSettings.qrPoweredBy`); a non-English truck's poster dates and spec from Intl (`lib/weekly-post/locale.ts` `languageSpec`) |
| Public feeds | `/api/events` and `/api/embed/events`: a private event's public name in the truck's language (`privateEvents.publicName`) |
| Server-worded refusals (screens show `error` verbatim) | `/api/manage` insufficient permissions; `/api/stripe/connect` (account not saved / no account / request failed); `/api/dashboard/action` stock-table, payment-record and slot-board warnings (`errorsKitchen.*`); private-event write errors (now codes) |
| Emails | The found-events review email (`emailOperator.newEvents.*`, the count an ICU plural, including the "Unknown venue" fallback); the offline auto-reject reason (`emailCustomer.offlineRejectReason`) |
| WhatsApp | The reply-cap handoff (`whatsappCustomer.capHandoff` / `capContact`); a non-English truck's AI replies get a language rule and a localised caveat |
| Plans | Names and descriptions (§1.6); "/mo" and " a month" (`planFeatures.perMonth.*`) |
| /features | The meta title (`featuresPage.metaTitle`) |

The engine modules that many harnesses compile standalone stay **import-free**: the slot fit message, slot display, reply
cap and poster draw. Each takes its words as an optional parameter. The English default is what it always printed, and
every screen passes the words from messages.

### 2.2 What is left, and why

The europe-readiness §B.7 inventory found 268 literal sites outside admin and Village Foodie. A re-scan today:

- **44 are gone** from the source.
- The **224** still present are classified below. Every one is in a bucket; there is no unclassified remainder.
- Many were already translated by earlier phases, through an id or key. The literal survives only as an id-label or an
  English default.

| Bucket | Sites | Where | Why it stays |
|---|---|---|---|
| Already shown through messages by id or key | 39 | Manage settings-section and emoji-category labels; event status; conflict kinds; price words; key templates (`cancelReasons.{x}`, `statusName.{x}`, `priceMode.{x}` …); dietary vocabulary (stored codes); the font licence | The English literal is an id or a fallback, never displayed |
| English defaults of import-free engines | 15 | `lib/slot-fit-message.ts`, `lib/slot-display.ts`, `lib/whatsapp/reply-cap.ts`, `lib/weekly-post/draw.ts`, `lib/private-events/{copy,resolve}.ts`, `lib/schedule-graphics/event-preview.ts` | Every screen passes the words from messages; the default keeps standalone harnesses and GB captures byte-identical |
| Dead code, or constants pinned by older captures | 22 | `describePreorder*` (no caller); `KITCHEN_SETUP_EXPLAINER` (unused); `TRIAL_NOT_STARTED_*` (the language-phase 1d captures pin them); `summarisePricing` (unused); place-merge refusals (callers test only truthiness) | Nothing shows them |
| Staff, ops, logs, machine | 81 | Stripe/Meta/Instagram/Messenger webhook bodies; WhatsApp token alerts and custom-domain outage emails (to Dominic); cron alerts; ledger notes; provisioning warnings; `lib/stripe/connect.ts` log and thrown setup message; places field mask; font-store UA | Not read by an operator or customer, or in English by design for support |
| API errors that carry a code | 18 | `/api/manage` (sign-in, access, token), `/api/stripe/connect`, Vercel domain errors, `/api/inbound-schedule` "No events provided" (a bot API) | The screen words the code; the English `error` is the last resort |
| Stored data | 7 | "Customer cancelled", "Event cancelled: …" (`orders.cancellation_reason`); Stripe/ledger descriptions; "Demo event" | Written to the database in English. Translating stored reasons needs codes in the schema, a separate change |
| Third-party names and their UI words | 12 | Registrar field labels (`lib/custom-domain/dns.ts`: they must match the registrar's own page); Tally contact topics; the map pin label; schema.org platform list | They are not ours to translate |
| English-only samples and site defaults | 13 | `lib/weekly-post/locale.ts` GB/US samples (a language uses Intl's own); `lib/site-metadata.ts` defaults (every marketing page sets its own); `busyWeek.*` key templates | Correct as they are |
| Village Foodie (UK-only) | 12 | `lib/utils.ts` calendar, brand, email config, the VF strings in shared pages | Out of scope (the brief) |
| AI prompts | 5 | WhatsApp classifier and reply prompts; the allergen-card transcription prompt | Instructions to the model, in English by design. The reply's language is set by a language rule (§3.4) |

**Also left on purpose, outside the scan:**

- **The sign-in, sign-up and reset pages are en-GB by design.** They run before a country is known, as they did before.
- **The legal pages** (`content/legal/`): a language version needs a lawyer.
- **Admin, outreach, and `outreach_templates` rows:** untouched.
- **Ticket printing folds to ASCII** (§8, limits).

## 3 · Allergen safety in any language

### 3.1 The words are data

- `lib/allergen-guard/en.json` holds the guard's English trigger words, moved verbatim from `lib/whatsapp-classifier.ts`:
  - stems and whole tokens;
  - anz-1's and canada-1's per-set additions under `bySet`;
  - the caveat families per allergen set under `caveatWords`.
- `lib/allergen-guard.ts` chooses the list by the truck's language (its country's locale).
- The classifier holds none of the words any more.

### 3.2 English is byte-identical

English keeps the **ASCII normaliser** exactly as it was. All 1,190 messages are answered identically before and after,
under each allergen set (none, uk14, us9, anz, ca): `scripts/languages-1.cjs` §6, against
`scripts/fixtures/allergen-guard-en-before.json`.

anz-1 and canada-1 now evaluate the guard from `lib/allergen-guard.ts`, and their pins are unchanged.

### 3.3 A new language

- Its file uses the Unicode normaliser: accents and case folded, any script. A German fixture catches "Ist das glutenfrei?",
  "ALLERGIE!" and "Unverträglichkeit", and lets "Wo seid ihr heute?" through.
- The rule is **Option B, absence and safety words only**:
  - "free from", intolerance, allergy, coeliac, safe for, and "-frei" / "sans" / "senza";
  - **not** bare allergen names. A presence question may reach the AI, which answers only from the tags.

### 3.4 No list means it fails safe

A truck whose language has no file:

1. **is matched against every language's list**, Unicode-aware;
2. **never gets the AI's menu answer.** `!hasGuardWords(locale)` sends every menu question to the allergen reply;
3. **is reported:**
   - a console warning, once per language;
   - an "Other" flag in translation-check, naming FAIL SAFE;
   - a check in languages-1 §6.

Proved in languages-1 §6: a fr-FR truck asked a plain menu question gets the allergen reply, and the menu AI is never
called. The e2e shows the same for eo-XA (§6).

**A non-English truck's AI replies** also carry a language rule (reply in the truck's language, copy names and prices
exactly), and the caveat's quoted sentence is localised. The same applies to the allergen-card transcription prompt.

## 4 · The glossary as data

- `scripts/glossary-build.cjs` reads `docs/i18n/seo-glossary-eu.md` and writes `lib/i18n/glossary/{de,nl,fr,es,it}.json`:
  - 28 concepts each, with a **Use** term, alternatives and confidence;
  - 12 concepts tied to en-GB patterns, so the checker knows where a term is expected;
  - banned terms;
  - the invariants: HatchGrab, Pro, WhatsApp, Stripe and the rest.
- `--check` fails if the JSON and the markdown differ.
- **Low-confidence rows are kept and flagged** for a native check, never dropped.
- Covered: food truck, street food, pick-up time, kitchen capacity, Pay at the truck (Pay at Hatch), plan names, and the
  others in the glossary.

## 5 · The automatic translation check: `scripts/translation-check.cjs`

```
node scripts/translation-check.cjs --locale fr-FR [--report docs/<name>-translation-flags.md]
```

| Kind | Checks | Blocks? |
|---|---|---|
| **Structural** | Every en-GB key present (each missing one is listed as an en-GB fallback); no extra keys (except `planNames`); ICU parses; placeholders, `select` options, `plural` exact cases plus `other`, and rich-text tags identical to en-GB | **Yes** (exit 1) |
| English left | en-GB vocabulary words in the translation. The allowlist is brand names, words that are the same in most languages, and multi-word product names (App Store, Google Play, Tap to Pay…) | Flag |
| Glossary | Each glossary concept the en-GB string uses must appear as its **Use** term; banned terms flagged | Flag |
| Invariants and numbers | Brands and "Pro" unchanged; every number, price, % and currency sign kept | Flag |
| Length | Much longer than en-GB, where the key looks like a button, tab or label (likely overflow) | Flag |
| Back-translation | For each key, the translator's own English back-translation (`docs/i18n/back/<locale>.json`), compared with en-GB by content-word overlap. Drifting keys go in a short table for Dominic | Flag |
| Plans | Every public plan except Pro has a translated name | Flag |
| Allergen guard | No `lib/allergen-guard/<lang>.json` → "FAILS SAFE" | Flag |

**On the pseudo-language** (4,995 keys, including plan names): **0 structural**; english 0 · glossary 0 · banned 0 ·
invariants 0 · numbers 0 · drift 0 · plans 0 · length 3 · other 1.

- The 3 length flags are pseudo artefacts: the bold and italic glyph buttons (1 character → 5 with the pseudo's brackets),
  and a 3-character number option.
- The 1 "other" flag is the expected one: eo has no allergen-guard file, so it fails safe.

**Every check catches a planted fault** (languages-1 §8): a missing key, a renamed placeholder, a dropped plural, an
untranslated string, a glossary miss, a changed brand, a banned term, a changed number, a tab three times longer, a drifting
back-translation, and an unnamed plan.

**What the drift table looks like for Dominic** (planted sample):

| Key | Flag | Translation |
|---|---|---|
| `orderCard.reverted` | meaning overlap 33 %. en-GB: "Order #{id} reverted" · back: "The order was deleted" | ⟦Öŕðéŕ #{id} ŕéṽéŕţéð⟧ |
| `privateEvents.publicName` | meaning overlap 0 %. en-GB: "Private event" · back: "Secret party" | ⟦Þŕîṽåţé éṽéñţ⟧ |

Flags never block the build. Structural problems always do.

## 6 · Proof: a made-up language, end to end

`node scripts/languages-1-e2e.cjs --shots --dump` does the following.

**1. Builds a throwaway copy of the tree.**
- node_modules is linked.
- `.env*`, `.git`, `docs` and the native projects are never copied.

**2. Switches eo-XA on, only the way a country prompt would.**
- Its line in `lib/i18n/locales.ts`.
- `messages/eo-XA.json`: en-GB accented and ~30 % longer, plus `planNames`.
- `split-messages`.

**3. Moves the language phases' US fixture truck and country to eo-XA**, and runs every capture: 1a, 1b, 1c, 1d, 1d2, 1e.
That covers:
- the order page, status page, customer emails and WhatsApp (1a);
- dashboard, KDS, tickets and operator emails (1b);
- setup, signup and demo (1c);
- Manage (1d, 1d2);
- landing, /features, /compare, the plans PDF and Billing (1e).

**4. Lists every en-GB word left** in an eo-XA view, excluding the fixtures' own data (truck, menu and customer names).

**5. Takes screenshots** with this tree's built CSS in WebKit and Chromium at 390 and 1280, and measures sideways scroll and
clipped text.

**6. Measures every eo-XA HTML view at 390px** in Chromium against its GB twin.

### 6.1 Result

- **6,891 views captured**, 3,374 of them in eo-XA (the rest are the phases' GB views).
- **Screenshots:** 72 in `docs/languages-1/` (18 surfaces × 2 engines × 2 widths):
  - landing, /features, /compare;
  - signup (setup and demo);
  - Manage › Menu, Schedule, Settings, Billing, and the shell;
  - the order page, status page and customer email;
  - dashboard, KDS, operator email and ticket;
  - the WhatsApp allergen reply, and a plain menu question.
- **The two WhatsApp shots prove the fail-safe:** eo has no guard file, so the plain menu question (`whatsapp-menu`) gets
  the allergen reply too.
- **Overflow at 390px: 0 of 1,770 eo-XA HTML views overflow because of the language.**
  - 65 scroll sideways in English as well. These are capture artefacts: a fragment rendered without the parent padding its
    `-mx-4` bar expects (Schedule's sub-tab bar), and the fixed-width 58/80 mm ticket.
  - Of the 72 screenshots, only those two kinds scroll, at both widths. The English screenshots of the same views scroll
    identically.
- **Clipped text:** only the dashboard's one-line rows at 390 (the venue line and the order's item summary). These rows use
  an ellipsis by design, and the item summary is clipped in English too.

### 6.2 English left: 129 of 3,374 views, every one explained

| Views | What | Why it is not a product string that escaped |
|---|---|---|
| 42 | `1d/copy` captures: en-GB constant exports (`gb('…')`) | Kept for older harness pins; the screens read messages |
| 41 | API bodies: the English `error` beside a `code` | The screen words the code in the truck's language; the English is the last resort |
| 16 | Fixture data | A typed reject/cancel note ("Sorry about this"), the demo menu rows, a typed "Other" cuisine, an internal id |
| 6 | Setup data views | A refusal object the screen words by its code; provisioning warnings for staff |
| 5 | Account emails (verify, change email, password, deletion) | en-GB by design (`DEFAULT_LOCALE`): an account is not tied to one country |
| 5 | QR and poster engine defaults | The capture calls `generateQRCode` with no `poweredBy` and reads the exported `POWERED_BY`; Manage and the renderer pass `posterWords.poweredBy` |
| 4 | Staff emails | Menu-build request, custom-domain alert to admin@, and a DNS field label |
| 3 | Legal pages' meta; JSON-LD names | Legal pages are en-GB documents; "HatchGrab Ltd" and the founder's name are names |
| 2 | Auth pages | en-GB by design |
| 2 | A ticket preview | The printer's ASCII fold turns the pseudo text back into plain letters ("Çĥéçķ ţĥé ŕåîļ" → "Check the rail"): the known ticket limit, not English left |
| 2 | Shown text translated; Cloudflare labels | Billing's check shows `worded` (translated) beside the English `error`; "Name" and "Target" are Cloudflare's own field labels |
| 1 | `weekCaption` | Unused function (deliberately left, §2.2) |

### 6.3 What the run found, and what was fixed

1. **Bug: the weekly-post route ignored the truck's language.** `app/api/weekly-post/route.ts` called
   `countryForTruck(truck)` without the locale. A French truck's posters and captions would have been worded and dated in
   English ("CANCELLED, sorry", "Powered by HatchGrab").
   - **Fix:** it now passes the locale it already had.
   - English is unchanged: the locale only matters for a language base.
2. **Bug: the poster design editor crashed on a language's poster key.** `components/manage/DesignEditor.tsx` read
   `LOCALES[country]`, which holds only GB and US, and threw "Cannot read properties of undefined (reading
   'dateStyles')".
   - **Fix:** it now reads `localeFor(country)`, which returns the same object for GB and US.
   - Found only after the e2e's social fixture was made to pass the language the way the route does.
3. **Three phone layouts could not hold ~30 % longer words:**
   - the marketing nav's "Log in" and CTA;
   - /features' plan-price column (`nowrap`);
   - Manage's Menu and Schedule header buttons.

   **Fix:** CSS rules under `:root:not(:lang(en))` in `app/landing/landing.css` and `app/globals.css`. The labels may wrap;
   no class name in the HTML changed, so every English byte is the same.
4. **The pseudo-language's own padding** was one unbreakable run of up to ~100 dots, which no real sentence has. It is now
   groups of six, so it wraps the way real longer words do.

## 7 · English byte-identity (GB/US/IE/AU/NZ/CA)

**Method.** Every capture the language phases make was taken before languages-1 began and again at the end, from the same
fixtures: 1a, 1b, 1c, 1d (all areas), 1d2 (all areas, plus the smoke runs), 1e (pages, parts, billing, router). They were
compared view by view.

| What | Before → after |
|---|---|
| Captured views (GB and US surfaces: order page, emails, WhatsApp, dashboard, KDS, tickets, setup, demo, Manage, Billing, landing, PDFs) | **8,890 / 8,890 identical** |
| Date, time and money answers: GB, US, IE, AU, NZ, CA (475 each) | **2,850 / 2,850 identical** |
| Marketing artefacts: 15 country pages, 5 plans PDFs, 2 sitemaps, llms.txt, 5 others | **28 / 28 identical** |
| Messages, each English locale | 4,892 keys: **0 changed, 0 removed**, 101 added |
| English allergen guard, 1,190 messages × 5 sets | **identical** (languages-1 §6) |
| Catalog modules with no language base | **all 111 byte-for-byte the repo's own** |

The CSS added for longer languages matches nothing on an English page (`:lang(en)`).

## 8 · Known limits (for the first real language)

1. **Ticket printing folds to ASCII** (printer limit). A French ticket loses its accents ("Commande prete"). This is
   unchanged and needs a codepage per printer model.
2. **Decimal-comma entry.** Prices typed into Manage still parse "12.50". A country that writes "12,50" needs the input
   parser changed: about one function, and not done here.
3. **Fonts:** poster and caption fonts are checked for Latin only. Latin-extended (Polish, Czech…) needs a font check
   before that country.
4. **The legal pages** stay en-GB documents.
5. **The sign-in, sign-up and reset pages** stay en-GB (they run before a country is known).
6. **Stored English** (cancellation reasons, ledger descriptions) shows in English on a French truck's order history.
   Translating it needs reason codes in the schema.
7. **The client-bundle split is proved at registry level, not by inspecting a real Next build** with a language switched
   on (§1.3).
8. **The European glossary's low-confidence rows** need a native check before launch (flagged by glossary-build).

## 9 · Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | passes |
| `npx eslint .` | 2,445 errors / 378 warnings, identical to the baseline (rule by rule, file by file) |
| `node scripts/run-harnesses.cjs` (full sweep) | **162 / 162 pass**, run after the last code change |
| `node scripts/languages-1.cjs` (new, in the sweep) | 91 / 91 |
| `messages-split` / `messages-parity` / `split-messages --check` / `glossary-build --check` | ✓ / ✓ / ✓ / ✓ |
| `node scripts/languages-1-e2e.cjs --shots --dump` (needs a browser and a build; not in the sweep) | Passes; §6 |

**Browser harnesses outside the sweep.** `live-text-place`, `phone-editor`, `social-posts-render` and
`social-tab-6-local` (all in `excluded.needs_a_browser`) compile DesignEditor, so they were run after the DesignEditor
fix. All four fail, and **they fail identically with HEAD's DesignEditor**, so the failures predate languages-1:

- a fixture's `week2.timeZone`;
- a stale source anchor ("no the editor grid");
- `Intl.ListFormat` against an old lib target, already in HEAD's FontPicker.

Not fixed here, because they are outside this brief.

**Re-pins.** Each is marked `⚠️ RE-PINNED (languages-1…)` in the file, and only for the approved changes.

| Harness | What moved |
|---|---|
| `add-order-fit-message.cjs` | The fit message and suffix take optional words (the panel passes messages); English defaults identical |
| `dot-overlap-labels.cjs` | The fit-suffix formatter's new optional words argument (two anchors) |
| `anz-1.cjs`, `canada-1.cjs` | The guard is read from `lib/allergen-guard.ts` (built with esbuild) and the caveat via `caveatTriggerWords`; their pins are unchanged |
| `event-types.cjs` | The dashboard's private-event words via `tPrivEv(…)`, en-GB asserted in messages |
| `outreach-reply-attach.cjs` | The plans PDF's `localizePlans` line |
| `place-pictures.cjs` | `poweredByEl`'s optional words argument |
| `private-events.cjs` | The feeds redact through `privateLabel` (the one message `privateEvents.publicName`, en-GB "Private event"); the dashboard confirms and title via `tPrivEv`; the dedup-order assertion and its V2 variant re-anchored |
| `schedule-graphics-places.cjs` | The Manage import window 9,000 → 10,000; four Manage lines named (dietary labels, group-rule locale, QR memo deps, StoreBadges locale) |
| `screenshot-truck-details.cjs` | `/api/inbound-schedule` "eighth build": the review email's lines named (added and removed) |
| `native-prices.cjs` | `perMonthLabel` → `perMonthText` |
| `phase3-screens.cjs` (`_phase3-screens-us.cjs`) | The same, plus the QR memo's deps line |
| `us-polish-batch.cjs` | DemoGetStarted's translators via `useTIn` |
| `us-readiness.cjs` (`_us-readiness-us.cjs`) | The allergen wizard's `wizLocale` line named |

## 10 · SQL

- **Read-only SQL run:** none. Nothing in this workstream needed the database.
- **NOT RUN SQL:** none. Plan names live in the messages files (§1.6), so there is no `plan_translations` table. No country
  row is added; that is each country prompt's step 2 (`docs/i18n/add-a-country.md`).

## 11 · Files

**New**
- `lib/allergen-guard.ts`, `lib/allergen-guard/en.json`
- `lib/plan-names.ts`, `lib/dietary-label.ts`, `lib/i18n/page-words.ts`, `lib/i18n/locale-files.ts` (generated)
- `lib/i18n/glossary/{de,nl,fr,es,it}.json` (generated)
- `lib/i18n/catalog/{embed,planNames}.ts` and `messages/ns/*/{embed,planNames}.json` (generated)
- `scripts/languages-1.cjs` (in the sweep), `scripts/languages-1-e2e.cjs` (needs a browser and a build)
- `scripts/translation-check.cjs`, `scripts/glossary-build.cjs`, `scripts/_pseudo-locale.cjs`
- `scripts/fixtures/languages-1-english-formats.json`, `scripts/fixtures/allergen-guard-en-before.json` (the BEFORE pins)
- `docs/i18n/add-a-country.md` (the recipe), `docs/languages-1/` (screenshots, findings, views)

**Changed:** the locale engine (`lib/i18n/{locales,messages,registry,use-t,client,page-locale,namespaces}.ts`,
`scripts/split-messages.cjs`), `lib/time-utils.ts`, `lib/price-text.ts`, `lib/page-lang.ts`, `lib/whatsapp-classifier.ts`,
the messages files (keys added only), and the screens and routes in §2.1. Also, from the e2e run (§6.3):
`app/api/weekly-post/route.ts` (the poster key with the locale), `components/manage/DesignEditor.tsx` (`localeFor`), and the
language-scoped CSS in `app/landing/landing.css` and `app/globals.css`.

## Undo (only if Dominic asks)

No database change was made, so there is no undo SQL. The code is uncommitted on main; `git diff` shows all of it.
