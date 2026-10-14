# Language Phase 0: foundations

next-intl is in, display text is no longer used as a lookup key, and every date word goes through one path. There is no visible change.

**Date:** 14 October 2026
**Sources:** `docs/language-readiness-audit-report.md` (§1, §2c, §3, §4.1, §4.2 phase 0, §4.5) and Dominic's two briefs of 14 October. The second brief chose **option A** for short month names.
**Step 0 checkpoint:** `234b6a2099c02ff1d489f4c24397cadc17c872fc`, "US readiness sweep: allergens, marketing tags, placeholders, plans PDF (checkpoint)". Its parent is `e54c7ea05b7491b14d0b8c13944680553bf7e26f`. Everything below is uncommitted on top of it.
**SQL:** none. No table, column, row or stored value changed.

---

## Summary

| # | Item | Result |
|---|---|---|
| 1 | Framework | next-intl **4.14.8** installed at an exact version, in no-URL-routing mode. One language resolver (`lib/i18n/locales.ts`). en-GB is the full message base; en-US is deep-merged over it. Keys are typed, so a missing key fails `tsc`. Providers sit in the order, confirmation/status, dashboard, KDS (both routes), Manage and setup layouts. One helper serves code with no request and no React. One real key runs end to end on the client (the order page's tip heading) and one on the server (the plans PDF heading). Both render today's UK text. |
| 2 | Keys separated from labels | The plan-table rows have ids. These also now use a single constant or helper instead of matching display text: the price words, the "Coming soon" cell, the pricing card's "/mo", the cost calculator's zero test, the contact topics, Walk-up, the Private type, the 'Other' revenue line, the demo-kitchen categories and the 'mains' default. Stored values and rendered words are unchanged. Other cases found are listed in §2.3. |
| 3 | One date-word path | Three ordinal implementations became one. Eight hand-written month/day lists in the five named files became Intl calls (§3). The weekly-post table uses `Intl.formatToParts`. Short months follow **option A**. All 48,823 GB and US date answers are byte-identical on the server, in Chromium and in WebKit. |
| 4 | Rules | `.cursor/rules/language.mdc` (`alwaysApply`) holds the eleven rules, the extra line and the short-month note. A new harness, `scripts/ui-literals.cjs`, fails if a file outside the committed baseline gains inline UI text. It is registered. |
| 5 | Message parity | New harness `scripts/messages-parity.cjs`: valid ICU, no apostrophe that ICU would read as a quote, every en-US key present in en-GB, no empty strings, and every message rendered in every locale. It is registered. |

**Proof:**
- `language-phase-0` passes 168/168.
- Every existing parity harness passes.
- `tsc --noEmit` is clean.
- eslint shows no rule growth on any app file.
- `next build` exits 0 with the same rendering mode for every route.
- The full sweep result is in §6.
- Client bundle growth is about **+12 KB gzipped** on each page that has a provider (§6).

---

## 1 · Framework

### What is in
- **next-intl 4.14.8**, `--save-exact`. Released 29 September; 4.14.9, released 2 October, is under two weeks old.
  - `package.json` reads `"next-intl": "4.14.8"` and the lockfile agrees.
  - ⚠️ **4.14 brings `@swc/core`, `@parcel/watcher` and `next-intl-swc-plugin-extractor` as hard dependencies**, for its message-extraction feature, which this build does not use. That adds about 780 lockfile lines.
  - npm's script blocker skipped their install scripts. Both ship prebuilt binaries per platform, so the build works on macOS here and will pick the Linux ones on Vercel.
  - Nothing at runtime loads them; the plugin only uses them when extraction is switched on.
- **No URL routing.** No `[locale]` segment, no next-intl middleware, routing or navigation import, no change to `proxy.ts`, and no URL changed. The route table from `next build` lists every route in the same rendering mode as before.
- **`next.config.ts`** wraps the existing config in `createNextIntlPlugin("./lib/i18n/request.ts")`. That is the only change.

### The files

| File | Role |
|---|---|
| `messages/en-GB.json` | Full base. Phase 0 holds two keys: `order.tipHeading` and `plansPdf.title`. |
| `messages/en-US.json` | `{}`. Only keys whose US wording differs will go here, so nothing is in it yet. |
| `lib/i18n/locales.ts` | **The resolver.** `resolveLocale(tag)` returns en-GB or en-US on an exact match, otherwise **en-GB**. `localeOfCountry(settings)` returns that country's `locale`. |
| `lib/i18n/messages.ts` | `messagesFor(locale)` deep-merges en-US over en-GB, so a missing US key shows the UK text and never a raw key. `pickNamespaces` selects a subset. |
| `lib/i18n/translator.ts` | **`translatorFor(locale, namespace)`**: next-intl's `createTranslator` for code with no request and no React (emails, PDFs, API responses, tickets, crons). Client-safe, because tickets are built in the browser. |
| `lib/i18n/request.ts` | next-intl's request config for **server components** (`getTranslations({ locale, namespace })`). It uses the locale it is asked for, otherwise en-GB. |
| `lib/i18n/app-config.d.ts` | Typed keys: `AppConfig.Messages = typeof en-GB`, `Locale = 'en-GB' \| 'en-US'`. |
| `lib/i18n/typecheck.ts` | **Proof that a missing key is a compile error.** It holds a missing key and a missing namespace, each under `@ts-expect-error`. `tsc` fails if either one ever stops being an error. Nothing imports this file. |
| `lib/i18n/namespaces.ts` | The namespaces each surface's provider sends. Phase 0 sends `order` for the order and confirmation surfaces and nothing for the others, which have no keys yet. |
| `lib/i18n/client.tsx` | `I18nProvider`, `useTruckLocale`, `useT` (below). |

### Who sees which language (as decided)
- **A truck's surfaces**, and its customers', use **its country's `country_settings.locale`**, falling back to en-GB. This covers the order page, confirmation/status, dashboard, KDS, Manage and setup.
  - Each page tells its layout's provider the locale once it has loaded:

| Page | Locale passed |
|---|---|
| order page | `pageTs.locale` |
| status page | `order?.time?.locale` |
| dashboard | `dashTime.locale` |
| KDS | `kdsTime.locale` |
| Manage | `countrySettings?.locale` |
| setup | the chosen country's `locale` (newly carried in the setup country list) |

  - The time settings already carry the country's locale, so no new request was needed except in setup.
- **Until the truck loads, the provider is en-GB.** The pages show only a loader in that moment, so no truck text appears in the wrong language.
- **Marketing** uses the visitor's resolved country (lib/visitor-country.ts). That is already how the metadata works, and the marketing words move in phase 1e.
- There is no language column and no SQL.

### Providers and the one client hook (a decision, recorded)
- **`I18nProvider`** is in each layout:
  - `app/trucks/[slug]/order/layout.tsx`
  - `app/order/[id]/layout.tsx` (new)
  - `app/dashboard/[token]/layout.tsx` (new)
  - `app/dashboard/[token]/kds/layout.tsx`
  - `app/kds/[kds_token]/layout.tsx`
  - `app/manage/[token]/layout.tsx` (new)
  - `app/setup/layout.tsx` (new)
- It renders **next-intl's `NextIntlClientProvider`** with only that surface's namespaces. It sits **alongside** the existing `CountrySettingsProvider`: the layout wraps the page, and the page still provides its country settings inside.
- **Client components use `useT(namespace)` rather than next-intl's `useTranslations`.**
  - Reason: `useTranslations` throws when no provider is above it.
  - Several components render outside these layouts: shared controls on other pages (admin uses `components/manage/primitives.tsx`), and harnesses that render a page alone.
  - `useT` reads the same messages and ICU and has the same typed keys, but **falls back to en-GB** with no provider, which is the agreed fallback.
  - The one hook keeps the design singular. `.cursor/rules/language.mdc` names it.
- **Server components use `getTranslations`.** The request config is in place and tested by calling it directly (§6). No server component uses it yet.
  - The server key went through `translatorFor` in the plans PDF instead.
  - Reason: the server components that render visible text (landing, features, compare) are rendered by `marketing-country-parity` and `us-readiness` outside a Next request. Giving them `getTranslations` belongs with phase 1e, along with that harness support.

### The two end-to-end keys (today's UK text, byte-identical)
- **Client:**
  - **Where:** the order page's tip heading, "Add a tip for the truck?" (`app/trucks/[slug]/order/page.tsx`, `tOrder('tipHeading')`).
  - **Proven by:** a real mount (react-dom/client on the repo's mini DOM, effects running):

    | Truck | Provider | Words |
    |---|---|---|
    | GB | en-GB | UK |
    | US | **switches to en-US** | UK (no override yet) |
    | unsupported locale | en-GB | UK |
    | no provider | en-GB | UK, no throw |

  - `phase3-screens` and `money-sweep-parity` still render the tip block unchanged.
- **Server:**
  - **Where:** the plans PDF heading, "Plans and features" (`lib/plans-pdf.ts`, `translatorFor(s.locale, 'plansPdf')('title')`).
  - **Proven by:** the PDF HTML for GB and US is byte-identical to BEFORE.

---

## 2 · Keys separated from labels

Every rendered word and every stored value is unchanged. The code compares ids.

### 2.1 Done

| What | Before | Now |
|---|---|---|
| **Plan-table rows** | `ROW_FEATURE_MAP`, `trialFeatureValue`, `DETAIL_OVERRIDES`, `NAME_OVERRIDES`, `HIDDEN_ROWS`, Manage's Billing trial column and `isRowComingSoon`, and Admin's plan table all looked rows up **by display name** | Each of the 33 rows has a typed `id` (`PlanRowId`), and every lookup uses it. `PAY_AT_HATCH_ROW` names the special row. A mistyped id fails `tsc`. The parity guard still reports nothing. |
| **"Coming soon" cells** | The comparison table and the PDF chose the cell's CSS class by comparing the label `'Coming soon'` | They compare the cell's state (`value === 'coming_soon'`). |
| **Price words** | `'Free'`, `'Free trial'`, `'Lifetime'`, `'0%'`, `'Pay at Hatch'`, `'Unlimited'` and `'—'` were typed in five files and matched by exact string in `NON_SECRET_PRICE` | `lib/price-words.ts`: `PRICE_WORD.<id>`, one definition. The producers write `PRICE_WORD.x`, and the mask asks `isPriceWord`. "Pay at Hatch" stays a brand name in every country. ⚠️ The mask still recognises a word by its text, because a cell carries text. Since the words and the mask now come from one definition, a reworded word cannot drift from the mask. When phase 1e makes the words translatable, cells should carry the id; recorded there. |
| **Pricing card "/mo"** | `PlanPrice` split the finished "£29/mo" back apart with `endsWith('/mo')` | `planPriceParts(plan, s)` returns `{ amount, perMonth, minor }`. `planPrice` is built from it, so the two cannot disagree; checked for every plan in GB and US. The landing page's unused `prices` variable went with it. |
| **Cost calculator zero test** | `gbpIn(f, n) === gbpIn(f, 0)` compared two formatted strings | `roundsToZero(n, f, 0)` in `lib/money-format.ts` asks the formatter's own rounding. Proven to give the same answer as the string test for 32 values (GBP and USD, including −0.4, −0.5 and 1e-9). |
| **Contact topics** | `/contact?topic=General%20Enquiry` and four others typed into ten hrefs | `lib/contact-topics.ts`: `CONTACT_TOPIC` (id → the value the Tally form matches, never shown) and `contactHref(id, extra)`. The same ten links come out byte for byte. The visible link text is separate and unchanged. |
| **Walk-up** | `'Walk-up'` typed as the stored default in 6 places and compared in 3 | `lib/walk-up.ts`: `WALK_UP_NAME` (stored data, never reworded) and `isWalkUp()`. The channel label "Walk-up" on Manage's order list is display text, so it stays for phase 1d. |
| **Private type** | `.ilike('name', PRIVATE_TYPE_NAME)` inline | One helper, `whereNamedPrivate(query)`, in `lib/private-events/type.ts`, case-insensitive as the unique index is. The stored name is unchanged. Everything else already compared `kind === 'private'`. |
| **'Other' revenue line** | `'Other'` typed three times in Reports | `OTHER_REVENUE_BUCKET`, one constant. ⚠️ **Only partly separated, deliberately.** The line merges with a truck's own category called "Other" and sorts by that name. A separate id plus a translated label would change both, so the split is a **phase 1d decision**. Byte-identical today. |
| **Demo kitchen** | `KNOWN_MAIN_CATEGORIES` and the rest typed English category names | `STANDARD_CATEGORY` (id → name) in `lib/menu-extract.ts`. The demo sets are built from ids and give the same results (6 category sets checked). `STANDARD_CATEGORIES` keeps its order, so the importer prompt is byte-identical. |
| **'mains' default** | `'mains'` typed at **13** sites (the brief named two; 11 more were found and moved the same way: dashboard ×2, order page ×5, slots API, prep-utils, slot-capacity, helpers) | `DEFAULT_CATEGORY_KEY` in `lib/category-key.ts`. |

### 2.2 Proof
- `scripts/language-phase-0.cjs` §2 compares these outputs byte for byte with BEFORE, for GB and US:
  - every plan price, label, allowance, fee row and footnote;
  - every section and row (shown name, detail, trial cell, every cell's glyph);
  - the price mask on every word;
  - the plans PDF HTML;
  - the feature comparison and cost comparison renders;
  - the landing page fully rendered (GB, and US switched on);
  - both footers;
  - demo assumptions;
  - cook-time defaults;
  - ticket bytes for walk-up orders (58/80 mm, GB/US).
- §4 adds the checks beyond byte-identity:
  - the ids are unique;
  - no lookup by name is left;
  - the price parts rebuild the price;
  - `roundsToZero` equals the old string test;
  - the links are rebuilt from ids;
  - there is one Walk-up helper, one Private helper and one 'mains' constant.
- `money-sweep-parity` (3,057 GB strings and byte streams, including every CSV and Reports) and `phase3-screens` pass unchanged.

### 2.3 Other English-as-key found and left as is (not safe to change byte-identically in this phase)
- **`components/shared/RejectOrderModal.tsx:38,49,98`.** The reasons are labels that are **stored and emailed** to the customer, and `reason === 'Other'` picks the free-text box.
  - Separating them means storing a code plus a label, which is a change to stored data.
  - **Recommendation:** phase 1b, with the reason codes.
- **`components/shared/EventCancelModal.tsx:41`.** Same pattern. Same recommendation.
- **`lib/whatsapp-classifier.ts:251, 289`.** `'Other'` is the fallback category in an English reply. It is reply text and moves with phase 1a's WhatsApp replies.
- **`lib/cuisines.ts`.** Cuisine names are stored comma-joined and matched by the discovery filter. They are already constants (`CUISINE_OTHER`). Separating them is stored data, so **list for a later phase**.
- **Manage `customer_email ? 'Online' : 'Walk-up'` channel labels (15457, 15529).** Display text, not a key. Phase 1d.
- **The plan word `'Demo'`.** `planPrice('demo')` returns it. It is not a price word, so it is masked as before. Unchanged.

---

## 3 · One date-word path

- **One ordinal:** `ordinalSuffix` and `ordinalDay` in `lib/time-utils.ts`. This is the weekly post's rule, which checks the teens first.
  - `lib/weekly-post/format.ts` re-exports it under its old names, `ordinal` and `ordinalSuffix`.
  - `lib/utils.ts` `formatFriendlyDate` uses it.
  - The other two implementations are gone.
- **Names from Intl:** `weekdayName(ymd, locale, 'long' | 'short')` and `monthName(ymd, locale, 'long' | 'short')`. Both use `Intl.DateTimeFormat.formatToParts` on the calendar date, pinned to UTC, so no date can shift a day.
- **Short month, option A:** for English locales, the first three letters of Intl's **full** month name ("September" → "Sep").
  - The code comment says this rule is English-only, gives the French example ("juin" and "juillet" are both "jui"), and says each later language must define its form in `SHORT_MONTH_RULES`.
  - A language with no rule gets Intl's own short form, never a truncation. This is checked: French June and July stay distinct.
  - The same note is in `.cursor/rules/language.mdc`.
- **Lists replaced: eight, in the five files the brief named:**
  - `time-utils` `SHORT_DAYS` / `SHORT_MONTHS`;
  - `preorder` `PREORDER_MONTHS` / `PREORDER_WEEKDAYS`;
  - `weekly-post/week` `WEEKDAY_NAMES`;
  - `weekly-post/locale` `MONTHS_LONG` / `MONTHS_SHORT`;
  - `whatsapp/copy` (the inline list in `formatResetDate`).
- **`lib/weekly-post/locale.ts`** is on `formatToParts` for GB and US through `intlLocaleFor(country)`. The order, separator and raised ordinals are unchanged.
- **Pre-order labels** take an optional `locale`, defaulting to en-GB. The label is English in every country today, as it was. Phase 1a moves its words.
- **Left, and why:** three admin/dev lists that the audit counted:
  - `app/admin/page.tsx:1614` (a day *index* from a scraper setting, not a date);
  - `lib/admin/screenshot-events.ts:112` (an admin AI prompt);
  - `app/dev/ticket-preview/page.tsx:325`.

  All are admin or dev only and outside the audit's scope. Two key by day number, where Intl needs a date. **Recommendation:** leave them.
- **Noticed, not changed:** about eight existing places already format dates with Intl's en-GB short month (`formatYmd(…, { month: 'short' })`), so they write "**Sept**" today and keep doing so, because the brief keeps every output byte-identical:
  - Manage's schedule and Reports date labels (`app/manage/[token]/page.tsx:8026, 8512, 8756, 15049, 15174, 15238`);
  - the inbound-schedule email (`app/api/inbound-schedule/route.ts:311`);
  - the public truck list card (`components/TruckListCard.tsx:103`). **Recommendation:** route them through `monthName` in their phase so the product writes "Sep" everywhere. That would be a named visible change.

**Proof:**
- `scripts/_language-date-fixtures.ts` holds 48,823 answers per engine, covering:
  - every day of 2026, plus 31 Dec 2025, 1 Jan 2027 and 29 Feb 2028;
  - four time settings (GB 24h, GB 12h, US 12h, US 24h);
  - both poster countries, every date style, with capitals and raised ordinals on and off;
  - ordinals 0–131 from both ordinal functions;
  - pre-order labels at four clock times, and open labels for five rules;
  - WhatsApp reset dates;
  - "Today"/"Tomorrow" around a fixed now;
  - every Monday- and Sunday-first week of 2026, in both time styles, with a cancellation and a day off;
  - event captions and "when" phrases for −1…+9 days.
- These run **on the server (Node) and in the browser bundle** (the same fixtures bundled with esbuild for the browser, run in **Chromium 153 and WebKit 26.6** with a London clock pinned).
- All three engines are byte-identical to BEFORE, and to each other, in every section. The WebKit run is the closest available check of the iPad's Safari engine.

---

## 4 · Rules for all future code

### The rules file
**`.cursor/rules/language.mdc`** (`alwaysApply: true`) holds:
- the eleven rules of audit §4.5 in plain words, updated for what now exists (`useT`, `getTranslations`, `translatorFor`, `PRICE_WORD`, `contactHref`, `isWalkUp`);
- the added line: **"Words that work in both countries are preferred in new copy; existing UK text stays byte-identical until its phase."**;
- the English-only short-month note;
- who sees which language.

⚠️ **`.cursor/rules` was a single FILE**, the repo's working-rules note, so a `.cursor/rules/` folder could not be created next to it.
- The note now lives at **`.cursor/rules/working-rules.mdc`**. Its text is **byte-identical** (checked with `cmp`), with a three-line `alwaysApply` header added above it.
- Cursor reads project rules from that folder, so the note now applies as its own text intends.
- Its sentence "recoverable … `git show HEAD:.cursor/rules`" refers to the old single-file path. That still works for any commit up to `234b6a2`. It was left as written because the body is copied unchanged.

### `scripts/ui-literals.cjs` (registered)
- **What it counts:** for each `.tsx` file, the JSX text and the literal `placeholder` / `title` / `label` / `aria-label` / `alt` values.
- **Baseline:** `scripts/fixtures/ui-literals-baseline.json` lists the 140 in-scope files that existed at the checkpoint, holding 2,635 inline strings.
- **A file not in the baseline must have zero, or the harness fails.** This phase's own new files (four layouts and `lib/i18n/client.tsx`) are deliberately not in the baseline, so they are held to that rule.
- **A file in the baseline that grows is printed but does not fail.** The brief keeps existing counts where they are rather than freezing them; phases 1a–1e bring them down.
- **Out of scope**, as in the audit: admin, `app/dev`, and the native developer panels.
- **Control:** a temporary new file holding `<p title="Hello there">Hello</p>` failed with "2 inline user-facing strings". The file was removed and the harness went green.

---

## 5 · Message parity harness (`scripts/messages-parity.cjs`, registered)

For every file in `messages/`, it checks:
1. **Shape:** nested objects of non-empty strings.
2. **Base:** every key in every other file exists in en-GB.
3. **ICU:** valid in every string, **and no straight apostrophe next to `{`, `}`, `#`, `|` or another apostrophe**, where ICU would start a quoted literal and silently swallow text.
4. **Rendering:** every message renders through next-intl's own `createTranslator`, in every locale's merged messages, with sample values for each argument. That includes both plural branches, every select option and rich-text tags. It must render with no error and produce a non-empty result.

**Control:** a temporary file with four faults failed five checks:
- an empty string (failing both the shape and rendering checks);
- an extra key;
- `Don'{t}`;
- an unclosed plural.

The file was removed. The `AREAS` list is where phases 1a–1e add each surface's BEFORE/AFTER comparison.

---

## 6 · Proof

**BEFORE** was captured right after Step 0, on `234b6a2`, before any edit: `scripts/fixtures/language-phase-0-before.json.gz` (821 KB). The capture is deterministic: two runs were compared and found identical.

**`scripts/language-phase-0.cjs`** (registered, with the shared module `scripts/_language-phase-0-after.cjs`) passes **168/168**:
- **§1:** every date-word answer on the server, Chromium and WebKit equals BEFORE, and the browser equals the server.
- **§2:** every key-separated output equals BEFORE for GB and US (§2.2 above).
- **§3 (framework):**
  - exact version; no URL routing;
  - resolver cases; deep merge; a missing US key shows UK text;
  - namespaces picked; the request config;
  - typed-key proof;
  - providers in all seven layouts, and the locale reported by all six pages;
  - the client mount (GB, US, unsupported, no provider);
  - the client and server keys.
- **§4 (keys):** see §2.2.
- **§5 (dates):**
  - no hand-written list in the seven date files;
  - one ordinal;
  - the English-only comment;
  - "Sep" in en-GB and en-US;
  - French not truncated;
  - weekday names from Intl;
  - the rule also in the rules file.

**Existing harnesses run after the change:**

| Harness | Result |
|---|---|
| money-sweep-parity | 3,057 GB strings and byte streams identical |
| marketing-country-parity | 121/121 |
| phase3-screens | 86/86 |
| order-charges | 260/260 |
| us-readiness | 50/50 |
| time-dates-parity | GB identical, US correct |
| event-types-render | pass |
| private-events | 206/206 |
| design-editor | 107/107 |
| signup-country | 62/62 |
| phone-parity | pass |

**Six older harnesses pinned the exact old source of lines this phase changed on purpose** (three more turned up in the full sweep; see below). Each was updated to name the new form. They are re-run green, and the lint on them is clean:

| Harness | What changed | Result |
|---|---|---|
| `plan-feature-order` | 5 checks read the feature map, the trial exceptions, `visibleRows` and the PDF class by row name or label. They now read the id forms. | 29/29 |
| `places-posts-gating` | 2 checks read the Social media posts row and its map entry by name. They now read its id. | 48/48 |
| `weekly-post` | The broken-ordinal control patched `format.ts`. The rule lives in `time-utils.ts` now, so it patches there. It still fails as required. | 251/251 |
| `schedule-graphics-places` ("no line of the page was lost") | 2 stale "now" forms (Billing's import line and trial price) plus 5 new named edits (Pay at Hatch by id, Walk-up ×2, 'Other' ×2), each with its new form | 269/269 |
| `country-settings-parity` | Snapshots `FEATURE_SECTIONS` whole, so the new `id` field showed up. It now compares what the rows say, without the id. The id itself is checked by `language-phase-0`. | all sections identical |
| `printing-escpos-identity` | Its broken-variant compile copies the ticket's imports into a temp folder. It now copies `lib/walk-up.ts` too. | 18 fixtures byte-identical to HEAD |

**Static checks and build:**
- `npx tsc --noEmit`: clean, including `lib/i18n/typecheck.ts`.
- eslint, per rule against HEAD, on all 66 touched files: **no rule grew on any app file.**
  - The four new CommonJS harnesses carry `@typescript-eslint/no-require-imports`, as every harness in `scripts/` does.
  - The one warning the re-pinned `country-settings-parity` gained was removed.
- `npx next build`: exit 0. The route table shows the same rendering mode for every route.

**Client bundle growth from next-intl**, in gzipped KB of the client JS each page loads:

| Page group | Before | After | Growth |
|---|---:|---:|---:|
| Order page `/trucks/[slug]/order` | 233.1 | 245.1 | **+12.0** |
| Confirmation `/order/[id]` · status `/order/[id]/manage` | 139.5 · 144.8 | 151.1 · 156.5 | **+11.6 · +11.7** |
| Dashboard `/dashboard/[token]` | 371.0 | 383.0 | **+12.0** |
| KDS `/dashboard/[token]/kds` · `/kds/[kds_token]` | 233.0 · 233.0 | 244.9 · 244.9 | **+11.9 · +11.9** |
| Manage `/manage/[token]` | 463.2 | 475.0 | **+11.8** |
| Setup `/setup` | 174.5 | 186.0 | **+11.5** |
| Compare · trucks list | 158.1 · 152.2 | 160.4 · 154.0 | +2.3 · +1.8 (the shared money and contact-link modules) |
| Landing | 151.3 | 151.3 | 0 |
| Every other page | | | ≤ +0.5 (22 pages unchanged) |

- About 12 KB gzipped is next-intl's client runtime plus the ICU parser, plus the two message files.
- **Recommendation for phase 1:** switch on next-intl's `precompile` option (`experimental.messages.precompile`) once messages are many. That drops the ICU parser from the browser.

**Full sweep** (`node scripts/run-harnesses.cjs`): **113 run, 110 passed, 3 failed.** All three were more pins naming the old source of lines this phase changed on purpose. Each was updated to name the new form and re-run green; lint on them is clean:

| Harness | What changed | Result |
|---|---|---|
| `compare-no-system` | Pinned `gbpIn(f, n) === gbpIn(f, 0)`. It now pins the `roundsToZero` form. `language-phase-0` §4 proves the two answer alike. | 54/54 |
| `printing-copy` | Found the "Kitchen ticket printing" row by its `{ name:` opening. Rows open with their id now. | copy rules hold |
| `event-types` | The dashboard's "every line that left is an enumerated move" check now lists the walk-up and 'mains' lines, with a companion check that their replacements (`WALK_UP_NAME`, `isWalkUp`, `DEFAULT_CATEGORY_KEY` ×2) are present. Its variant compile also gains `lib/price-words.ts`, which `lib/features.ts` now imports. | 190/190, 42 of 42 variants failing as required |

The three new harnesses (`language-phase-0`, `messages-parity`, `ui-literals`) passed in the sweep, as did the 107 others.

---

## 7 · Decisions taken in this phase, each keeping UK output identical

1. **`useT` instead of `useTranslations` in client components** (§1). It is the same next-intl machinery, plus the agreed en-GB fallback when no provider is present.
2. **The provider starts in en-GB and switches when the page knows the truck** (`useTruckLocale`). The alternative was a layout that looks the truck up on the server, which is an extra database read per page load.
3. **The server key is in the plans PDF via `translatorFor`.** `getTranslations` is configured and tested but not yet used in a server component; it waits for phase 1e and its harness support.
4. **Setup's country list now carries `locale`**, so the wizard can follow the chosen country. The API response gains one field; it is not visible.
5. **`.cursor/rules` became a folder.** The old note moved unchanged to `working-rules.mdc`.
6. **`ui-literals` fails on new files only** and reports growth in existing files without failing (as briefed).
7. **The 'Other' revenue line is a constant, not yet an id.** The split changes merging and sorting, so it is a phase 1d decision.
8. **Admin and dev date lists left as is** (§3).
9. **13 'mains' sites, not 2.** The 11 extra sites were found and moved the same way.

## 8 · Files

**New:**
- `messages/en-GB.json`, `messages/en-US.json`
- `lib/i18n/{locales,messages,translator,request,namespaces,typecheck}.ts`, `lib/i18n/app-config.d.ts`, `lib/i18n/client.tsx`
- `lib/price-words.ts`, `lib/contact-topics.ts`, `lib/walk-up.ts`, `lib/category-key.ts`
- `app/{dashboard/[token],manage/[token],order/[id],setup}/layout.tsx`
- `.cursor/rules/language.mdc`, `.cursor/rules/working-rules.mdc` (moved from `.cursor/rules`)
- `scripts/language-phase-0.cjs`, `scripts/_language-phase-0-after.cjs`, `scripts/_language-date-fixtures.ts`, `scripts/messages-parity.cjs`, `scripts/ui-literals.cjs`
- `scripts/fixtures/language-phase-0-before.json.gz`, `scripts/fixtures/ui-literals-baseline.json`

**Changed:**
- `package.json`, `package-lock.json`, `next.config.ts`
- **Dates:** `lib/time-utils.ts`, `lib/weekly-post/{format,locale,week,caption,caption-template}.ts`, `lib/preorder.ts`, `lib/whatsapp/copy.ts`, `lib/utils.ts`
- **Keys:** `lib/plan-features.ts`, `lib/landing-table.ts`, `lib/pricing.ts`, `lib/features.ts`, `lib/money-format.ts`, `lib/plans-pdf.ts`, `lib/demo-assumptions.ts`, `lib/menu-extract.ts`, `lib/private-events/type.ts`, `lib/printing/ticket.ts`, `lib/prep-utils.ts`, `lib/slot-capacity.ts`, `lib/signup-countries.ts`, `lib/signup-country-types.ts`
- **Screens:**
  - `app/landing/page.tsx`, `app/compare/CostComparison.tsx`, `app/trucks/[slug]/{TruckClient.tsx,order/page.tsx,order/layout.tsx}`, `app/venues/[slug]/VenueClient.tsx`, `app/order/[id]/manage/page.tsx`
  - `app/dashboard/[token]/{page.tsx,kds/page.tsx,kds/layout.tsx}`, `app/kds/[kds_token]/layout.tsx`, `app/manage/[token]/page.tsx`, `app/setup/page.tsx`, `app/admin/page.tsx`
  - `app/api/dashboard/action/route.ts`, `app/api/slots/[truckId]/route.ts`
  - `components/Footer.tsx`, `components/landing/{LandingFooter,FeatureComparison}.tsx`, `components/dashboard/{AddOrderPanel.tsx,helpers.ts}`
- **Harnesses:** `scripts/harnesses.json`, `scripts/{plan-feature-order,places-posts-gating,weekly-post,schedule-graphics-places,country-settings-parity,printing-escpos-identity,compare-no-system,printing-copy,event-types}.cjs`

**Rules kept:**
- No SQL, deploy or push.
- Nothing committed after Step 0.
- No process killed.
- No `outreach_templates` change and no email.
- Pizzeria Gusto untouched; US checks on fixtures only.
- No `.env*` file read.
- No stored data changed.
