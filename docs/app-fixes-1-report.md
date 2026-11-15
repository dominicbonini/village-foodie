# app-fixes-1: password-reset dead ends, Carte & stock on phones, the Paramètres crash in the app, the landing page inside the app, raw keys in printing

*14–15 November 2026 · not deployed · no data changed · commit: c6e806cb (code, words, scripts, screenshots); this report is not committed*

## Summary

**The Paramètres crash and the raw printing labels have the same cause.** It is a defect in production builds, not a missing translation. On iPhone and iPad, in French and in English, the app's Paramètres now loads with proper printing labels.

- **What broke.** Turbopack's production build collapsed an import cycle in `lib/printing` into one module group and emitted only one module's code. The `printing` words were never registered, so labels showed as raw keys such as `printing.card.title`. On top of that, `printerMessageText` did not exist, so Paramètres crashed in the app.
- **Why it never showed elsewhere.** The printing card renders only inside the app, which is why Safari always worked. Dev builds were also unaffected.
- **How it was found.** The crash was reproduced on the deployed site in an app context, the faulty factory was found in the deployed JavaScript, and it was fixed in web code.
- **How the fix was proved.** On a local production build, iPhone and iPad both load Paramètres with proper labels. A new checker confirms all 6,131 chunks of that build are sound.
- **When it started.** 15 October (89b3f297).

The other four items are done in web code: the auth dead ends, Carte & stock on phones, the landing page inside the app, and the missing-key check (which found no missing keys). The app needs no resubmission and no native change was made.

| Check | Result |
|---|---|
| Sweep | 222 run · 217 passed · 5 failed |
| New swept harness (`scripts/app-fixes-1.cjs`) | 49/49 |
| New key check (`scripts/messages-keys-used.cjs`) | 50/50 |
| Browser proof against a production build (`scripts/app-fixes-1-screens.cjs`, by hand) | 62/62 |

There are 57 screenshots in `docs/app-fixes-1/`.

**One finding needs your decision before the next native build.** It is not caused by this work. A build made with the current Xcode (27.2) does not launch on the iOS 26.5 and 27 simulators: *"UIScene life cycle is required for app"*. See §3.6.

## The brief

**Garbled spans:** none.

**Contradictions:** none. Three points needed care, none of them a real conflict:

- **"No landing-page changes" and point 4 ("navigation to '/' goes to /app").** No landing-page file was touched. The redirect happens only for requests carrying the app's user-agent marker, in `proxy.ts` and in a link guard that is off outside the app.
- **"Never test against Pizzeria Gusto or Le Roi du Churrasco."** I only read Le Roi's settings (one read-only SELECT, listed in §7). Every test ran on test trucks: Pizza Kitchen (`test-truck`) and a French demo truck. Le Roi's shape (France, trial plan, two presses) was applied to those trucks inside the test browser only, by rewriting the API answer. No row was changed.
- **The kitchen screen (KDS).** Your note during the work, that the KDS is part of the dashboard and stays in the app, is applied. `/kds` and `/dashboard/<token>/kds` are on the stay-in-app list.

---

## 1. Password reset and login: every end state has a way forward

Screens were walked on the desktop web and in the app context: the iPhone user agent with the app's `HatchGrabNativeApp` marker and a stub of Capacitor's iOS bridge. "Before" is the deployed site and "after" is a local production build.

- **Emails:** none were sent. Every POST that would send an email or change a password was answered by the harness.
- **Screenshot names:** `before-auth-…` / `after-auth-…`, each in a `-web` and an `-app` version.

| # | Screen | Before | After |
|---|---|---|---|
| 01 | Log in | Form, plus "Forgot your password?" | Unchanged |
| 02 | Forgot password | Form, plus "Back to sign in" | Unchanged |
| 03 | **"Check your email"** | **Dead end:** no link at all | **"Back to log in"** button → `/login` |
| 04 | **Reset link page, no or invalid token** | One link, "Request a new reset link" | **"Send a new link"** (→ `/forgot-password`) **+ "Back to log in"** (→ `/login`), plus the logo the other auth cards have |
| 04b | Set new password | Form | Unchanged |
| 05 | **Link expired** (on submit) | A red line under a form that can never succeed | **A card:** "This reset link has expired. Please request a new one." + **"Send a new link"** + **"Back to log in"** |
| 06 | **Link already used** (on submit) | Same red line | **The same card**, with "…already been used…" |
| 07 | **Password updated** | Jumped straight to `/login?message=password_reset` | **A card:** "Password updated successfully. Please sign in." + **"Log in"** → `/login`. The sign-out of any old session still runs first, and the button does a full page load |
| 08 | **Email link failed** (`/auth/callback` → `/login?error=invalid_link`) | Plain login form, nothing said | Login form with **"That link has expired or isn't valid."** above it |

**In the app:**

- `/login` is the app's login route. The app's `/app` sends a signed-out device there.
- The harness clicks "Log in" on screen 07 and checks it lands on `/login`, on the web and in the app.
- A first-login password set now goes to `/app` in the app; on the web it still goes to `/dashboard`.

**Wording.** Short, and through the normal pipeline (`messages/<locale>.json` → `node scripts/split-messages.cjs`, back-translations in `docs/i18n/back/`).

- **New keys:** `auth.forgot.backToLogin` "Back to log in", `auth.reset.sendNewLink` "Send a new link", `auth.reset.logIn` "Log in", `auth.login.invalidLink` "That link has expired or isn't valid."
- **Other languages:** for "Back to log in" and "Send a new link", each language reuses its existing translations of `auth.forgot.back` and `auth.reset.requestNew` (same meaning). "Log in" uses each language's login button word.
- **Kept as they were:** the existing "Back to sign in" (on the forgot form) and "Request a new reset link". Changing existing English would have needed named changes in four pinned fixture files, so new keys were added instead.

> ⚠️ **Decision for you: "log in" or "sign in".** The brief asked for "Log in" / "Back to log in" and I used those words. The rest of the auth flow says **"Sign in"**: the login page's title and button, the forgot form's "Back to sign in", and "…Please sign in." So the flow now mixes the two. Tell me which you want and I will make it one word everywhere.

## 2. Dashboard › Carte & stock on phones

Your approved layout is implemented in `app/(app)/dashboard/[token]/page.tsx`, the stock tab only. Behaviour and wording are unchanged.

### What changed

- **Category rows:** the name is on line 1. "(sold: N)", "Reste : N" and "FERMÉ" are on line 2 underneath, never beside the name.
- **Shared fixed columns.** Headings, category rows and item rows use the same columns on the right:

  | Column | Below 640px | From 640px |
  |---|---|---|
  | Price (right-aligned) | 60px | 80px |
  | Limit box | 48px | 64px |
  | Actif switch | 44px | 48px |
  | Gap between columns | 4px | 8px |

  All rows use the same 9px right inset: an item row's padding plus its border. On phones the card padding is 12px and items are not indented.
- **Item names** wrap (`[overflow-wrap:anywhere]`) instead of pushing the columns right.
- **Phones:** the number box's spin buttons are hidden below 640px, where touch phones don't draw them anyway, so "30" stays readable.

### Measured

Measured in WebKit on the French demo truck. Long names were injected: "Picanha grelhada com farofa e vinagrete", "Supercalifragilisticexpialidocious" and "Feijoada completa à brasileira (pour deux)". A category limit of 30 with 4 sold gives "Reste : 26".

| Width | Before: limit-box right edges (px) | Before: switch centres (px) | After |
|---|---|---|---|
| 320 | 311, 222, 238, 272, 251, 226 (MAINS's switch pushed off the card) | 343, 254, 270, 304, 283, 256 | **One line each:** 234 / 260 |
| 375 | 311, 277, 278, 281 | 343, 309, 310, 311 | **289 / 315** |
| 390 | 311, 292, 293, 296 | 343, 324, 325, 326 | **304 / 330** |
| 430 | 333, 332, 336 | 365, 364, 366 | **344 / 370** |
| 820 (iPad) | 723, 722, 726 | 663, 755, 754, 756 | **722 / 754** |
| 1280 (desktop) | 1183, 1182, 1186 | 1123, 1215, 1214, 1216 | **1182 / 1214** |

After the change, at every width:

- no horizontal scroll;
- no item name runs into its price;
- no row leaves the card;
- "Reste : N" is on the line under its category name.

**iPad and desktop** look the same as before, except that the counts are now under the name and everything lines up to the pixel.

**Screenshots:** `before-stock-{320,375,390,430,820,1280}.png` and `after-stock-…`.

## 3. Paramètres crashed in the iPhone app ("Une erreur est survenue")

### 3.1 The exception, found

1. **Simulator: not possible.** Xcode 27.2 is installed and the app built. But a build from the current SDK refuses to launch on the iOS 26.5 and 27 simulators (§3.6), so the real shell could not be run.
2. **App context in WebKit, local dev server: no crash.** The setup was Playwright WebKit, the app's user-agent marker, and a stub of Capacitor's iOS bridge: `window.webkit.messageHandlers.bridge`, plus `window.Capacitor` with PluginHeaders for every installed plugin. That makes `@capacitor/core` report `ios`, so every app-only branch runs. It made no difference whether the truck had the demo plan, Le Roi's trial-plan shape, printing on or off, Bluetooth or wired.
3. **The same setup against the deployed site: reproduced at once.** On Pizza Kitchen with French settings, in the app context, the console showed:

   ```
   Error: MISSING_MESSAGE: printing.card (fr-FR)
   TypeError: (0,tw.printerMessageText) is not a function.
   ```

   That second error is what took the page to "Une erreur est survenue". In English it is the same: `MISSING_MESSAGE: printing.card (en-GB)`.
4. **The deployed chunk** (`4ea3eff3a4f7d4d3.js`, byte-identical to a local production build from 13 November) shows the cause:

   ```
   466019,375647,47834,852807,967316,e=>{"use strict";e.s(["getPrinterTransport",…],466019); …transport.ts's code only… }
   ```

   Turbopack merged five modules into one factory:
   - `transport.ts` (466019)
   - the `printing` catalog (375647)
   - `printerText.ts` (47834)
   - `netAddress.ts` (852807)
   - `netTransport.ts` (967316)

   It emitted only `transport.ts`'s body and exports. `printerText.ts` and the catalog were never in the build at all. So the `printing` words were never registered, and the labels showed as raw keys: `printing.card.title` is the "abc.def.ghi" you saw on the iPad. `printerMessageText`, which the card calls whenever it shows a printer status, was undefined: that is the crash.
5. **Why only the app.** `PrintingSettings` renders only when `isNativeApp()`, so Safari on the same phone never ran it. Dev builds do not merge modules, so nothing local showed it either.

### 3.2 Root cause and fix (web code)

**The cause** was an import cycle that a `require()` closed:

- `lib/printing/transport.ts` did `require('./netTransport')` inside `getPrinterTransport()`;
- `netTransport.ts` imported `isNetPrinterAvailable` back from `./transport`, plus `printerText` and the `printing` catalog.

**The fix:**

- `isNetPrinterAvailable` / `NET_PRINTER_PLUGIN` moved to a new `lib/printing/netAvailability.ts`, which imports nothing from `lib/printing`. `transport.ts` re-exports them, so callers are unchanged.
- `transport.ts` imports both backends statically. The old `require()` never kept a plugin out of the web bundle anyway, because a synchronous `require` is bundled.
- No value-import cycle is left in `lib/printing`, and there is no `require()` (both checked by `scripts/app-fixes-1.cjs`).

**Proved on a local production build** (`next build && next start`):

- iPhone and iPad, app context, French: Paramètres loads, the printing card is in French with its settings open, and there is no `MISSING_MESSAGE` and no `is not a function`.
- English: the same with English labels.
- **`scripts/turbopack-merged-modules-check.cjs`** (new; by hand after a build):
  - **Before the fix:** run on the deployed chunks, it flags exactly modules 47834, 852807 and 967316.
  - **After the fix:** on the final build, *"every module used as a value has its exports set"* across 6,131 chunks.

Screenshots: `before-parametres-app-{iphone,ipad}.png` (the deployed site: the iPad gets the error page) and `after-parametres-app-…`, `after-printing-en-GB.png`, `after-printing-fr-FR.png`.

### 3.3 Which change caused it

The two commits together; neither alone:

- **18 Sep 2026, 5f70e07a** ("kitchen capacity" in the log; it added the wired printer): created the cycle with `require('./netTransport')`.
- **15 Oct 2026, 89b3f297** ("template update" in the log; this is **Language Phase 1b, the namespace split**): moved the printing words into `printerText.ts` and the `printing` catalog. Both were imported by `netTransport.ts`, so they joined the cycle Turbopack collapsed. From then on, the card's words, and the function that words a printer status, were missing in every production build.

The language-world work was not the cause. The project has been on Next 16 (Turbopack builds) since its first commit.

### 3.4 One broken section can never take down the whole Paramètres page

- **`components/shared/IsolatedSections.tsx`** (new): every card of the Paramètres tab has its own error boundary. A card that throws is replaced by "This section didn't load. / Try again" (fr: "Cette section ne s'est pas chargée. / Réessayer"). Every other card stays usable, and the error is still logged.
- **Each card is a `<Section>{() => …}</Section>`.** Inline JSX is otherwise built during the dashboard's own render, where no inner boundary can catch it. `<Section>` builds it inside the card's boundary.
- **Proved** in the app context on the production build:
  - **The test:** a deliberately bad value (`online_payments_paused_at: 'not-a-date'`) made the card-payments card throw.
  - **The result:** only that card was replaced; "Acceptation auto des commandes" and every other card stayed. Screenshot: `after-section-contained-app.png`.
  - **The caveat:** before `<Section>` was added, the same test took the whole page down, because that card's date formatting ran during the dashboard's own render. The fix is what makes the boundaries work for inline cards.
- **Not one boundary per card:** the "Écran des commandes" group (menu layout through buzzer prompt) is a single wrapper in the code, so it is one section.

### 3.5 The error page's second button

`app/(app)/error.tsx`:

- **Dashboard (including its kitchen screen) and Manage, web and app:** the button is **"Back to dashboard"** (fr-FR **"Retour au tableau de bord"**) and goes to `/dashboard/<that truck's token>`. Both routes carry the same token. The line above it reads "…or go back to your dashboard." (`errorPage.errorBodyDashboard`).
- **Anywhere else in the app:** `/app`, never the home page.
- **Elsewhere on the website:** unchanged.
- **Locales:** added to every one through the pipeline (`errorPage.backToDashboard`, `errorPage.errorBodyDashboard`, `errorPage.sectionFailed`).
- **Proved:**
  - **App:** a French dashboard that throws after load shows "Retour au tableau de bord" → `/dashboard/<token>`.
  - **Web:** a demo dashboard that throws on its first render shows "Back to dashboard" → `/dashboard/<token>`.
  - **Screenshots:** `after-error-page-app.png`, `after-error-page-web.png`.
- **The 404 page** in the app now points "home" at `/app` as well.

> **The error page's language** is the page's own (`<html lang>`), as before. If a dashboard throws on its very first render, before the truck's language is applied, the error page is in English. Once the truck's language is set, it is in that language.

### 3.6 Finding for your decision: the iOS build and UIScene (native, not changed)

- **The finding.** Building the iOS app with Xcode 27.2 for the iOS 26.5 simulator succeeds. Launching it fails: `Application failed to launch: UIScene life cycle is required for app`. The app uses the old app-delegate-only lifecycle, so the next build made with this SDK may not run on current iOS.
- **What it doesn't affect.** This has nothing to do with this work's fixes, which are all web code, or with the app version already in the store.
- **What it needs.** Adopting UIScene is an Xcode / native change, so per the brief **I stopped and did not make it**.
- **No traces left.** Nothing was changed in `ios/`: only the built copy's generated config was pointed at localhost, in the scratchpad. The simulator was shut down and the test install removed.

## 4. The landing page inside the app

### 4.1 Every way the app could reach the landing page or another public page

Both shells keep every address on `www.hatchgrab.com` inside the app: `allowNavigation` on iOS, and Android's own host check. So the risk was same-site links and navigations.

| # | Where | Before (in the app) | Now (in the app) |
|---|---|---|---|
| 1 | Error page, second button | `/`, the landing page | Dashboard / Manage → `/dashboard/<token>`; elsewhere → `/app` (§3.5) |
| 2 | 404 page "home" | `/` | `/app` |
| 3 | User menu › Privacy / Terms (`<Link>`) | The legal page, inside the app | Opens in the **phone's browser** |
| 4 | Manage › Delete account › privacy link (`target=_blank`) | iOS: Safari. Android: inside the app | Phone's browser on both |
| 5 | Any link to an order page, schedule, truck page, `/p/` private event, `/docs/` paperwork, `/embed/`, `/venues/`, `/hire` | Inside the app | Phone's browser |
| 6 | Any link, redirect or typed address to `/`, a country page, features, FAQ, compare, about, contact, `/try`, `/demo` | The landing / marketing page, with no way back | `/app` (→ dashboard, or login when signed out) |
| 7 | Dashboard header logo (`BrandHomeLink`), auth cards' logo (`FlowLogo`) | Already inert in the app | Unchanged |
| 8 | Logout | `/login` (the app's login) | Unchanged |
| 9 | Dashboard › "Écran cuisine" (KDS) | Stays in the app (`router.push`) | Unchanged, as you asked |
| 10 | Order link / QR code in the dashboard and Manage | Copy and QR only, no link | Unchanged |
| 11 | Other sites (WhatsApp Manager, Meta pricing, Stripe invoice PDFs, DNS providers, uploaded allergen cards, a truck's custom domain) | Leave for the phone's browser (the shell does this) | Unchanged |
| 12 | Plan prompt "Upgrade" | Manage › Billing (stays in the app; hidden on iOS) | Unchanged |
| 13 | Dashboard "Access denied" (bad token) | In the app: an inert "← HatchGrab", no link | **Unchanged:** a dead end, but not a landing exit. See §8 |
| 14 | Demo walkthrough's phone preview (an iframe of the order page) | Iframe | Unchanged: iframes are never redirected |

### 4.2 The fix (web code; the website outside the app is unchanged)

- **`lib/app-navigation.ts`** (new, pure) is the one list:
  - **Stay in the app:** the dashboard including KDS, Manage, login and the account pages, `/app`, admin, the API and static files.
  - **Phone's browser:** customer- and organiser-facing pages.
  - **Everything else:** `/app`.
- **`components/native/InAppNavigationGuard.tsx`** (new; mounted in the `(app)` layout; does nothing unless `isNativeApp()`). A click listener in the capture phase, so it acts before a Next `<Link>`, and only on same-site links that leave the app:
  - **A customer page** is opened through the bare domain `hatchgrab.com`. Neither shell keeps that host, so iOS opens Safari and Android the default browser. The domain answers with a 308 redirect to `www`, keeping the path (checked). The app claims no universal links or app links that could pull it back.
  - **Anything else** goes to `/app`.
  - **No native change:** no browser plugin was needed.
- **`proxy.ts`**, the catch-all, runs only for requests with the app's user-agent marker. A GET for a page outside the stay list redirects to `/app`. "A page" means a top-level document (`Sec-Fetch-Dest: document`) or a client-side navigation (the RSC header); API calls, assets and iframes pass.
- **Checked against the dev server:**
  - **App marker:** `/`, `/fr`, `/features`, `/trucks/…/order` and `/privacy` → 307 `/app`. `/app`, `/login`, `/dashboard/…`, `/manage/…`, `/api/…` and `/offline.html` pass.
  - **Website, no marker:** every one is unchanged.
  - **Iframes:** pass.
- **Proved in the browser:**
  - **The app:** opening `/` lands on `/app`; a link to `/` goes to `/app`; a link to an order page is handed off and never rendered in the app.
  - **The website:** `/` is still the website.

> **Kept in the app, for you to confirm:** `/signup`, `/setup`, `/admin` and `/dev` (internal tools and account creation, not public pages). Say if any of them should leave the app too.

## 5. Raw keys and missing keys

- **Nothing was missing.** All 37 keys the printing card uses exist in en-GB and fr-FR, and so do its status codes. The raw keys were the dropped namespace from §3, not missing words.
- **New check, `scripts/messages-keys-used.cjs` (swept).** It reads every `.ts` / `.tsx` file under `app/`, `components/` and `lib/` (868 files) with the TypeScript parser. It ties each `t(…)` / `t.rich(…)` / `t.raw(…)` call to its own translator by scope, so an inner `const t = getPrinterTransport()` is not mistaken for one. That covers 4,911 calls. It checks:
  1. every literal key exists in en-GB (4,780 keys);
  2. every key built at run time (91, such as `features.${feature}.name`) starts with the fixed part of a real en-GB key;
  3. every used key exists in **all 48 shipped language bases**. English regionals hold only their differences and fall back to en-GB by design.
- **Result:** 50/50 pass, and nothing needed fixing.
  - **Probe:** a file planted with a missing key and a bad built key failed both checks, while a shadowing local `t` was correctly ignored.
  - **Not checked:** one generic helper whose namespace is a variable (`lib/i18n/error-body.ts`) is listed and skipped.
- **The check for the actual cause** is `scripts/turbopack-merged-modules-check.cjs` (§3.2). A namespace the bundle drops cannot be seen from source.

## 6. Tests

### Commands

| Command | What it is | Result |
|---|---|---|
| `node scripts/app-fixes-1.cjs` | Swept; source only | **49/49** |
| `node scripts/messages-keys-used.cjs` | Swept | **50/50** |
| `BASE=http://localhost:3100 BEFORE_BASE=https://www.hatchgrab.com TEST_TRUCK_TOKEN=… FR_DEMO_TOKEN=… node scripts/app-fixes-1-screens.cjs` | By hand: a production build + Playwright WebKit. Tokens come from the environment; none are in the repo | **62/62**, 51 screenshots (+6 "before" Carte & stock shots from the dev run) |
| `node scripts/turbopack-merged-modules-check.cjs` | By hand, after `next build` | ✅ final build; 🔴 3 modules on the deployed chunks |
| `npx tsc --noEmit` | | Clean |
| eslint, touched files vs HEAD | | No new problems in code. The dashboard page has 2 fewer. One existing `<a href="/login">` on the forgot form is still flagged, as at HEAD |

### Full sweep: 222 run · 217 passed · 5 failed

Run on the final tree. The 5 failures are the same ones that failed before this work:

| Harness | Why it fails |
|---|---|
| paperwork-1 | `content/legal/ru-KZ/*.md` missing |
| legal-languages-1 | `content/legal/ru-KZ/*.md` missing |
| world-countries-3 | `content/legal/ru-KZ/*.md` missing |
| tidy-1 | `content/legal/ru-KZ/privacy-policy.md` missing |
| contact-1 | the ru-KZ legal file, and its `planTable` pin |

**The first sweep** (222 run · 205 passed · 17 failed) found the 12 harnesses that needed this work's intended changes recorded (below).

**After the commit,** I reran app-fixes-1, messages-keys-used, cwv-2, costs-accounts-1, loyalty-1, event-types and messages-split on the committed tree. All exit 0.

### Re-pins

Re-pins for this work's intended changes. Each one takes back exactly the recorded edits, so every other byte is still compared:

- **`scripts/_named-app-fixes-1.cjs` and `scripts/fixtures/app-fixes-1-edits.json`:**
  - this work's exact edits as before/after pairs, generated from the diff and proven to round-trip;
  - the `proxy.ts` undo;
  - the new file recorded by its hash;
  - two STRUCTURAL render proofs: Carte & stock "layout only" (text, attributes and component stand-ins byte-identical), and the auth views (every BEFORE text and link kept, plus exactly the recorded rewording and additions).
- **`_moved-paths.cjs` `changedSince`** (loyalty-1, cwv-2, costs-accounts-1): applies those undos.
- **`cwv-2.cjs`:** the `app/(app)` and layout pins, and "proxy.ts otherwise as before".
- **`costs-accounts-1.cjs`:** the new file is not "untracked" while it matches its hash.
- **`event-types.cjs`:** the dashboard accounting; the price-column classes.
- **`event-types-render.cjs`:** the Carte & stock fixture moved to the new columns; the long-name check now means "the column keeps its fixed width".
- **`_lp2-named.cjs` (+ `_lp1d2-named.cjs`):** the structural entries.
- **`language-phase-1b` / `-1c`:** now honour a named entry's `proveWith`, as the Phase 2, 1d, 1d2 and 1e checks already did.
- **`_lp1b-dashboard.cjs`:** `IsolatedSections` renders for real. It adds no element, so the settings views are byte-identical to BEFORE.
- **`_messages-parity-1e.cjs`:** the seven new keys registered as new wording.
- **`lib/i18n/namespaces.ts`:** `errorPage` added to the dashboard's namespaces (messages-split).

## 7. SQL (read-only, all run through the Supabase MCP; no writes)

```sql
select t.id, t.name, t.country, t.created_at from trucks t where t.id like 'demo-%' and t.country = 'FR' order by t.created_at desc limit 10;
```
```sql
select column_name from information_schema.columns where table_schema='public' and table_name='trucks' order by ordinal_position;
```
```sql
select id, country, currency, plan, feature_overrides, print_trigger_mode, kds_mode, crew_mode, display_mode, auto_accept, time_selection_enabled, preorders_enabled, default_walkup_payment, takes_cash, sound_config, completion_presses, add_order_layout, timezone, allergen_display_mode, tipping_enabled, card_fee_payer, service_fee_enabled, (dashboard_pin is not null) has_pin, (kds_pin is not null) has_kds_pin, preferred_contact_method, (select count(*) from truck_vans v where v.truck_id=t.id and v.active is not false) vans from trucks t where t.name ilike '%roi du churrasco%' or t.id in ('demo-mk65q66spjck0g9mxt50btfxtr');
```
```sql
select dashboard_token from trucks where id = 'demo-mk65q66spjck0g9mxt50btfxtr';
```
```sql
select id, dashboard_token, plan, country from trucks where id in ('test-truck');
```
```sql
select id, event_date, start_time, end_time, status, van_id from truck_events where truck_id='test-truck' and event_date >= current_date - 1 order by event_date, start_time limit 8;
```

Le Roi du Churrasco appears only in the third query (its settings, read-only). No undo is needed: nothing was written.

## 8. Not done, open, for your decision

1. **Deploy (not done).** The app runs the deployed website, so the iPhone and iPad fixes reach Le Roi only after a deploy. No app resubmission is needed.
2. **UIScene (§3.6).** This native change is needed before the next iOS build. Not made, as the brief instructs.
3. **"Log in" or "Sign in" (§1).** Choose one word for the auth flow.
4. **In-app list (§4.2).** Confirm `/signup`, `/setup`, `/admin` and `/dev` stay in the app.
5. **Dashboard "Access denied" in the app (§4.1 #13).** It is still a dead end with no link: a bad token there has nowhere useful to go. It could offer "Back to log in". Not changed, because it was not in the brief.
6. **Translations of the new keys** (5 new, plus 2 reusing existing words), in 48 languages: written by me and back-translated in `docs/i18n/back/`. They need a native-speaker check, like earlier batches.
7. **Flaky existing check:** `event-types-render.cjs`'s Manage › Event types dropdown font-size checks ("16px vs 14px").
   - **Evidence it predates this work:** they fail on one random case per run (820/6, 820/1, 820/3, 1440/3). HEAD's own version of the harness fails them too against the same build.
   - **Status:** not touched by this work, and not re-pinned.

## 9. Files

### Committed

**Code (new):**

- `lib/printing/netAvailability.ts`
- `lib/app-navigation.ts`
- `components/native/InAppNavigationGuard.tsx`
- `components/shared/IsolatedSections.tsx`

**Code (changed):**

- `lib/printing/transport.ts`, `lib/printing/netTransport.ts`
- `app/(app)/dashboard/[token]/page.tsx`
- `app/(app)/error.tsx`, `app/(app)/not-found.tsx`, `app/(app)/layout.tsx`
- `app/(app)/login/page.tsx`, `app/(app)/forgot-password/page.tsx`, `app/(app)/reset-password/page.tsx`
- `proxy.ts`
- `lib/i18n/namespaces.ts`

**Words:** `messages/<locale>.json` (en-GB + 48 bases), `messages/ns/**`, `docs/i18n/back/<locale>.json`

**Scripts (new):** `scripts/app-fixes-1.cjs`, `scripts/app-fixes-1-screens.cjs`, `scripts/messages-keys-used.cjs`, `scripts/turbopack-merged-modules-check.cjs`, `scripts/_named-app-fixes-1.cjs`, `scripts/fixtures/app-fixes-1-edits.json`

**Scripts (re-pinned):** `harnesses.json`, `_moved-paths.cjs`, `cwv-2.cjs`, `costs-accounts-1.cjs`, `event-types.cjs`, `event-types-render.cjs`, `_lp2-named.cjs`, `_lp1d2-named.cjs`, `_lp1b-dashboard.cjs`, `language-phase-1b.cjs`, `language-phase-1c.cjs`, `_messages-parity-1e.cjs`

**Docs:** `docs/app-fixes-1/` (57 screenshots). This report is written after the commit and is not committed

### Left alone

Not this workstream's, so not committed:

- `docs/capacity-one-source-2-report.md` (the previous workstream's report)
- `docs/gusto-move-1-report.md`, `docs/gusto-move-1/`
