# Language Phase 1c — onboarding text into the message files (no visible change)

**Status:** built and proven. Not committed, pushed or deployed.

**Step 0:** **no commit was made, because none was needed.** The Phase 1b work was not uncommitted: it is in your commit `89b3f29` ("template update"), which has `lib/i18n/registry.ts`, `scripts/language-phase-1b.cjs`, `messages/ns/**` and `scripts/split-messages.cjs`.
- HEAD at the start was **`accbb61`** ("email speed sending"), whose parent is `9fa4491`.
- BEFORE was captured on `accbb61`, from clean worktrees.
- The only uncommitted files at the start were the V15.9 manual and its report, which are docs; they are untouched. `supabase/.temp/cli-latest` was not touched.

**SQL:** none.

**Garbled spans or contradictions:** none found.

**en-US:** `messages/en-US.json` is still `{}`.

---

## 1 · What moved

**379 new messages in 14 namespaces** (13 new, plus 2 messages added to 1b's `demo`). The file now holds 1,775 messages in 46 namespaces.

| Namespace | Messages | Surface |
|---|---:|---|
| `setup` | 24 | the setup wizard (`app/setup/page.tsx`) |
| `whereBased` | 1 | `WhereBasedStep` (the countries-load fallback) |
| `cuisinePicker` | 5 | `components/shared/CuisinePicker.tsx` |
| `priceControls` | 6 | `components/shared/PriceControls.tsx` (the "(+£1.30)" difference is now one message, `diffUp` / `diffDown`) |
| `auth` | 61 | signup, login, forgot-password, reset-password and verify-email pages |
| `emailSignup` | 19 | the signup verification and welcome emails (`lib/email-signup.ts`) |
| `demoGetStarted` | 85 | `components/DemoGetStarted.tsx`, the demo sign-up flow |
| `demoUpload` | 40 | `components/landing/DemoUpload.tsx` |
| `demo` | +2 | the sign-up offer that `DemoLoopComplete` reads |
| `goLive` | 25 | the go-live checks: title, detail and where for each issue (`lib/go-live-text.ts`) |
| `walkthrough` | 17 | the Manage walkthrough (`components/manage/Walkthrough.tsx`) |
| `errorsOnboarding` | 61 | every onboarding API refusal (§2) |
| `emailAccount` | 26 | the emails built inside the auth and account routes: change email, resend verification, password reset, account deletion |
| `demoSaveEmail` | 7 | the demo save-email email and its warning |

### How each surface reads its words (as in 1a and 1b)
- **Client components** use `useT` from `lib/i18n/use-t` and import their catalog. **Server and lib code** uses `translatorFor`. Every file that reads a namespace imports it; `messages-split` passes 90/90.
- **Locale:**
  - the truck's (`localeForTruck`) once a truck exists;
  - the chosen signup country's (`localeForTruck({ country })`) for setup's `create_truck` refusals and the demo wizard's steps;
  - en-GB before either is known: the signup, login and password pages, every refusal before sign-in, and the auth routes' own emails.
  - **verify-email** reads the operator's oldest truck's country as a best-effort read: any failure gives en-GB, and every recorded write is identical.
  - **The signup verification email** uses the demo truck's locale when the account came from a demo; **the welcome email** uses the truck's. Both builders take an optional `locale` (default en-GB) and the routes pass it.
- **Go-live checks return codes, not words.** `checkGoLive` returns `{ code, params }` and stays import-free. `goLiveIssueText(issue, locale)` in the new `lib/go-live-text.ts` is the one place their words are produced, the same pattern as 1b's `printerText`. Walkthrough stops carry their id, and the component looks up the title and body.
- **States set in an effect hold codes:**
  - `useSignupCountries` holds `{ server }`, and the hook's return is unchanged;
  - DemoGetStarted's `error` and `fieldErrors`;
  - DemoUpload's `message`.

  Each is proven with `__after` fixtures. Submit handlers that run on each render call `t` directly.
- **Whole sentences built from pieces before are now one message each:** 13 in all (messages-parity lists them), e.g. the signup emails' greeting with and without a name, the demo privacy lines, "Saved — kept until …", and the go-live details. Their renders are compared byte for byte.

### Stored content is not translated (as instructed)
The rows written when a demo or a new truck is provisioned are **byte-identical on fixtures**:
- **New truck:** 18 `provisionTruck` runs per country. Every refusal, the `trucks` and `truck_vans` inserts, the return value and the warnings ("Van 1", `Demo Kitchen (xxxxxx)`).
- **Demo:**
  - the real `provisionDemo` and `restartDemoService` on the in-memory database: the template menus, 80 seeded orders, "Van 1", "Demo event" and `demo_sessions`;
  - outreach, return and restart runs;
  - US return and restart.

`lib/provision-truck.ts`, `lib/demo-templates.ts`, `lib/demo-kitchen.ts` and the provisioning and seed files are **unchanged**. None of their words reach a visitor; their messages go to logs and the admin screen.

---

## 2 · Named difference 1 — onboarding API refusals gain `"code"` and `"params"`

Every refusal *that we write* in 18 route files now comes from `onboardingErrorBody` (15 files changed). The routes are under `app/api/setup`, `app/api/signup`, `app/api/auth/*` (9), `app/api/demo/*` (5) and `app/api/account/request-deletion`:

```
{ error: <today's English, byte for byte>, …every field it already carried…, code, params }
```

**61 codes.** **Proof** (`scripts/_lp1c-api.cjs`): 306 views, GB and US.
- **152 refusals with a new code** (59 distinct codes). For each one:
  - the BEFORE body is the exact prefix;
  - every field is unchanged and in place;
  - the only additions are `code` and `params`, last;
  - the message rendered with its params equals `error`, in en-GB and en-US.
- **The other 154 views** (successes, redirects, text passed through) are byte-identical.
- **In every view, all emails, database writes and auth calls are byte-identical.**
- A source check confirms no literal refusal is left without a code.

**Two bodies already had a `code`** (`confirm_mismatch`, `partial_stamp`). They are unchanged; their words now come from the same code's message.

**Text passed through without a code** (it is not our sentence):
- the country, zone and town refusals from `lib/trade-area.ts`, which returns words and is shared with Manage (Phase 1d);
- `provisionTruck`'s exception message and the database's `error.message`;
- Supabase's `createUser` message;
- `provisionDemo`'s `reason`.

**Not moved, on purpose:** two staff-only emails that go to HatchGrab's own inbox ("🛠 Menu build requested", "[ACTION] Account deletion requested").

**Screens still show `error`.** Switching them to read codes (`errorText`) is listed for later, as in 1b.

### One error-body helper, not a third copy
`customerErrorBody` (1a) and `kitchenErrorBody` (1b) were the same code apart from the namespace they read.
- **There is now one helper:** `errorBody(namespace, locale, code, params, extra)` in `lib/i18n/error-body.ts`.
- `customerErrorBody`, `kitchenErrorBody` and the new `onboardingErrorBody` are **thin wrappers** over it, with the same arguments and the same output.
- **Proven:**
  - `language-phase-1a` passes 1050/1050;
  - `language-phase-1b`'s `api` area passes 1275/1275 (every kitchen refusal field by field);
  - `language-phase-1c`'s `api` area passes.
- `.cursor/rules/language.mdc` rule 1 now names the helper: a new surface adds a wrapper, never a copy.

---

## 3 · Proof

**`scripts/language-phase-1c.cjs` — 4,498 checks, 0 failed.** It uses 1b's layout: one module per area, and BEFORE captured with `--recapture` in a clean worktree of `accbb61` (`scripts/fixtures/language-phase-1c-before/`, 1,230 views).

| Area | BEFORE views | What it renders, GB and US |
|---|---:|---|
| `setup` | 294 | every wizard step and state (checking / based / identity × `verify=`); the countries list loading, failed and with the server's own error; the country guess; **the US zone list**; every town, zone and country error; every identity state including **phone checks**; 21 recorded button presses per country; `WhereBasedStep` / `TownInput` / `ZoneSelect`; CuisinePicker (9); PriceControls (every mode, 15 cells); AppHeader; **the provisioned new-truck rows** |
| `auth` | 168 | signup, login, forgot, reset and verify pages in every state; 11 submit paths recording what each handler sets; verify-email's 10 server outcomes with their writes; **both signup emails** (subject, HTML, text) with every name/truck combination |
| `demo` | 374 | the demo modal in every variant, step and error; 49 recorded presses per country (save, wizard, the whole sign-up chain, upload); DemoUpload in every phase; DemoLoopComplete; **the provisioned demo rows** |
| `goLive` | 88 | every go-live check failing and passing (including 1, many and 1,000 dishes, capped and uncapped vans, email states, all failures at once); every walkthrough step for both tours, at phone width; Manage's done screen |
| `api` | 306 | every onboarding refusal and success body, emails and writes (§2) |

- **Deterministic:** each area was captured at least twice and the captures were byte-compared (`cmp`), with the api area captured three times.
- **Sensitivity:** with `diffDown` swapped for `diffUp`, four setup views failed; the swap was reverted.

### The other checks
- **messages-parity: 8,965 passed.**
  - New area `_messages-parity-1c.cjs`, registered in `AREAS`: **379 messages** — 337 plain ones rendered by the BEFORE surfaces, 1 matched in the source, 13 built from pieces.
  - **AREAS BEFORE:** Phase 0, Phase 1a, Phase 1b. **AFTER:** Phase 0, Phase 1a, Phase 1b, Phase 1c.
  - ⚠️ **Phase 1b's area was re-scoped:** "added since `0914760`" would have absorbed 1c's messages. It now counts what 1b added (present at `accbb61`); still 982.
- **messages-split: 90/90.** The `NAMESPACES` sets gained:
  - `setup: ['setup', 'whereBased']`;
  - the demo sign-up flow's namespaces on `order`, `dashboard` and `kds`, because they import `DemoGetStarted`;
  - Manage's `cuisinePicker`, `priceControls`, `walkthrough` and `whereBased`.
- **ui-literals:** the baseline was lowered from **1,838 to 1,684** in 12 files:
  - forgot-password 6→0, login 9→1, reset-password 8→1, setup 14→0, signup 17→0, verify-email 11→0, VerifyEmailSuccess 3→0;
  - DemoGetStarted 50→0, DemoUpload 30→0;
  - Walkthrough 4→0, CuisinePicker 3→0, PriceControls 1→0.

  What is left in scope: login's and reset-password's `alt="HatchGrab"`, and AppHeader's 1 — the same brand-name alt (see §5).
- **language-phase-0** 168, **1a** 1,050, **1b** 3,687 — all pass.
- **`npx tsc --noEmit`:** clean.
- **ESLint:** compared rule by rule with `accbb61` for all 71 touched or new files. **No rule count grew in any of the 63 source files.** The 8 new `.cjs` harness files carry `require()` imports, as every CommonJS harness does.
- **`npm run build`:** exit 0.
- **Full sweep** (`run-harnesses`): **122 run, 122 passed, 0 failed**, exit 0 (after the `batch-reservation-edit-lock` re-pin in §4; the first sweep had failed only that one).

### Client JS per page (gz KB, from each page's client-reference manifest)

| Page | Before (`accbb61`) | After 1c | Change |
|---|---:|---:|---:|
| / | 192.7 | 192.7 | +0.0 |
| /(legal)/privacy | 143.9 | 143.9 | +0.0 |
| /(legal)/terms | 143.9 | 143.9 | +0.0 |
| /1ng7n4p5omux2gdk9kqvwz | 151.3 | 155.1 | +3.8 |
| /_global-error | 7.5 | 7.5 | +0.0 |
| /_not-found | 139.4 | 139.4 | +0.0 |
| /admin | 400.5 | 400.5 | +0.0 |
| /admin/outreach | 139.5 | 139.5 | +0.0 |
| /admin/outreach/p/[prospectId] | 327.5 | 327.5 | +0.0 |
| /admin/whatsapp-connections | 141.5 | 141.5 | +0.0 |
| /admin/whatsapp-templates | 142.1 | 142.1 | +0.0 |
| /app | 140.5 | 140.5 | +0.0 |
| /compare | 160.3 | 164.1 | +3.8 |
| /contact | 144.7 | 144.7 | +0.0 |
| /dashboard | 139.8 | 139.8 | +0.0 |
| /dashboard/[token] | 386.7 | 387.8 | +1.1 |
| /dashboard/[token]/kds | 244.1 | 245.1 | +1.0 |
| /dev/ticket-preview | 156.8 | 156.8 | +0.0 |
| /domain | 152.5 | 152.8 | +0.3 |
| /features | 145.1 | 149.0 | +3.9 |
| /forgot-password | 140.5 | 145.1 | +4.6 |
| /hire | 143.0 | 143.0 | +0.0 |
| /kds/[kds_token] | 244.1 | 245.1 | +1.0 |
| /landing | 151.3 | 155.1 | +3.8 |
| /login | 141.1 | 145.8 | +4.7 |
| /manage | 139.5 | 139.5 | +0.0 |
| /manage/[token] | 472.5 | 473.1 | +0.6 |
| /o/[slug] | 139.5 | 139.5 | +0.0 |
| /order/[id] | 143.5 | 143.5 | +0.0 |
| /order/[id]/manage | 150.8 | 150.8 | +0.0 |
| /p/[token] | 139.5 | 139.5 | +0.0 |
| /reset-password | 141.1 | 145.8 | +4.7 |
| /setup | 178.8 | 179.1 | +0.3 |
| /signup | 141.5 | 146.0 | +4.5 |
| /trucks | 153.9 | 153.9 | +0.0 |
| /trucks/[slug] | 165.2 | 165.2 | +0.0 |
| /trucks/[slug]/order | 243.0 | 244.0 | +1.0 |
| /venues/[slug] | 185.7 | 185.7 | +0.0 |
| /verify-email | 140.0 | 144.9 | +4.9 |

**Why each page grew:**
- **Signup, login, forgot, reset and verify (+4.5–4.9)** and **/landing, /features, /compare (+3.8–3.9)** had no message runtime before. They now carry the runtime 1b measured (`createTranslator`, ~2.3 KB gz), plus the registry and hook (~0.5–1 KB), plus their own words.
  - The marketing pages grow because they mount the demo flow in scope (`DemoUpload` / `DemoGetStarted`).
  - The hashed route is the same landing page.
- **The dashboard, KDS, order page and Manage (+0.6–1.1)** carry only the new words of the pieces they import (the demo flow, the walkthrough, the price and cuisine controls), since they already had the runtime.
- **Every page that renders none of this is unchanged.**

---

## 4 · Existing harnesses re-pinned (named, none weakened)

- **`_language-phase-1a-after.cjs`** and **`batch-reservation-edit-lock.cjs`:** both looked for the body-building line in `customer-errors.ts` / `kitchen-errors.ts`. It now lives in `error-body.ts`, so both check that line there **and** the wrapper's delegation.
- **`_messages-parity-1b.cjs`:** scoped to 1b's own messages (§3).
- **`signup-country.cjs`:** the step order is pinned on the step keys, and `setup.steps.based` is asserted to be exactly "Where you’re based".
- **`phone-parity.cjs`**, two checks:
  - the API's phone refusal is the `phone_invalid` code, filled from the chosen country's row;
  - DemoGetStarted's `phoneErrorMessage(…, wordsLocale)`.
- **`schedule-graphics-places.cjs`:** the walkthrough `build` stop is found by id, with its title read from the message file; three named lines in the Manage page are listed as moved.
- **`event-types.cjs`:** **failing at the start, not caused by this phase.**
  - Its "RESTORED" checks compared against `origin/main`, a moving ref. The push of 15 October made `origin/main` the Phase 1b code, whose dashboard reads those words from messages, so five checks failed with this branch untouched.
  - **Pinned to `f4bd277`**, the commit that was live from 9 to 15 October. Every restored line was checked to be in it. 192/192.

---

## 5 · Decisions recorded

- **AppHeader's `alt` stays "HatchGrab" inline.** The setup area moved it into an `appHeader` namespace; I reverted that, because brand names stay inline (1a §5, as login and reset-password keep it). The namespace was removed.
- **Pages keep showing a route's `error` text**, not its code, as in 1b. Nothing visible could differ.
- **`lib/resolve-operator-truck.ts` also selects `country`** (a read only), so the welcome email can use the truck's locale.
- **`scripts/audit-go-live.mjs` now builds with esbuild**, because the words module imports the catalogue. Only the compile, load and words part was tested, offline.
- **Three lines of `app/manage/[token]/page.tsx` (Phase 1d's file) changed** for the walkthrough intro: L128, L129 and L6713.

---

## 6 · Listed for later (each would be a visible change, or another phase's surface)

1. **Wrong or mixed English kept byte for byte:**
   - "Your account’s ready, but we couldn’t reach us to create your truck" (the demo flow);
   - straight beside curly apostrophes across setup, demo and auth;
   - "Signing in..." / "Sending..." / "Saving..." (three dots) beside "…";
   - "Password must be at least 8 characters" with no full stop on reset-password (signup's has one — two codes);
   - "1 of your 1 dishes" (go-live; an ICU plural with only `other`);
   - "(1 days)" in the save-email email;
   - lower-case "unnamed van";
   - the internal "(Phase 4 Step 2)" in a go-live detail;
   - "changeId required".
2. **UK-only wording** shown on the US path, kept until en-US has its own words: the `you@yourtruck.co.uk` placeholder (signup and demo), "van", "customisations", "trading", "carry on setting up". Also save-email's `'en-GB'` date and the deletion email's raw ISO date (Phase 2).
3. **Words this phase could not reach:**
   - `lib/trade-area.ts` (country, zone and town refusals: words, not codes; shared with Manage);
   - `WHERE_YOU_TRADE_COPY` (`lib/settings-copy.ts`);
   - `priceModeChoices` / `priceRoundingChoices` (`lib/copy/serviceSettings.ts`);
   - `DEMO_KITCHEN_MESSAGES` (admin only);
   - DemoWelcome's button name (`lib/order-completion-label.ts`).
4. **The auth routes' emails are always en-GB.** Password reset and change email have no operator locale on those routes.
5. **Formats left as they were:**
   - zone names via `replace(/_/g, ' ')`;
   - `0` / `0.00` price placeholders;
   - the step number via `String(i + 1)`;
   - van names joined with ", " (`Intl.ListFormat` would add "and").
6. **`setup.phoneRequired`** has the same words as DemoGetStarted's own copy; the two could be joined.
7. **Screens reading `code` rather than `error`** (all phases so far).

---

## 7 · Files

**New — code:**
- `lib/i18n/error-body.ts`, `lib/i18n/onboarding-errors.ts`, `lib/go-live-text.ts`;
- generated: `lib/i18n/catalog/*` and `messages/ns/*` for the 13 new namespaces.

**New — harnesses:**
- `scripts/language-phase-1c.cjs`, `scripts/_lp1c-{fixtures,setup,auth,demo,goLive,api}.cjs`, `scripts/_messages-parity-1c.cjs`;
- `scripts/fixtures/language-phase-1c-before/*.json.gz` (5).

**Changed — code:**
- **Pages:** `app/setup/page.tsx`, `app/signup/page.tsx`, `app/login/page.tsx`, `app/forgot-password/page.tsx`, `app/reset-password/page.tsx`, `app/verify-email/page.tsx` and `VerifyEmailSuccess.tsx`.
- **Components:** `components/setup/WhereBasedStep.tsx`, `components/shared/{CuisinePicker,PriceControls}.tsx`, `components/DemoGetStarted.tsx`, `components/landing/DemoUpload.tsx`, `components/dashboard/DemoLoopComplete.tsx`, `components/manage/Walkthrough.tsx`, `app/manage/[token]/page.tsx` (3 lines).
- **Lib:** `lib/email-signup.ts`, `lib/go-live-checks.ts`, `lib/walkthrough.ts`, `lib/resolve-operator-truck.ts`.
- **i18n:** `lib/i18n/{customer-errors,kitchen-errors,namespaces}.ts`, `messages/en-GB.json`.
- **Routes:** 15 route files under `app/api/{setup,signup,auth,demo,account}`.
- **Scripts:** `scripts/audit-go-live.mjs`.

**Changed — rules and harnesses:**
- `.cursor/rules/language.mdc` (rule 1);
- `scripts/messages-parity.cjs` (AREAS), `scripts/harnesses.json`, `scripts/fixtures/ui-literals-baseline.json`;
- the re-pins in §4.
