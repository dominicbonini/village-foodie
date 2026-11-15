# app-fixes-2: one word for logging in, a way out of "Access denied", /dev out of the app, the reports and the manual

*15 November 2026. Web code only, so no app resubmission is needed. **Not deployed.** No database reads or writes.*

## Summary

- **"Log in", never "Sign in"**, everywhere in HatchGrab's own auth and account wording, matching the landing page's "Log in".
  - **English:** 21 en-GB keys reworded, including the user menu's "Log out". The admin console's two strings and the API's English fallback were changed too.
  - **Left alone:** another company's steps (Stripe, 123 Reg) and the comparison table's row.
  - **Duplicates:** the two from app-fixes-1 were merged.
  - **Other languages:** Bengali, Hindi and Urdu now use their own landing-page word for "log in". Every other language already used its own word for "log in", so none of them changed.
- **Dashboard "Access denied"** (bad or expired token): a **"Back to log in"** button now goes to `/login`, on the web and in the app.
- **In the app, `/dev` now goes to `/app`.** `/signup`, `/setup` and `/admin` stay in the app. The website is unchanged.
- **Reports committed:** `docs/app-fixes-1-report.md`, `docs/gusto-move-1-report.md` and `docs/gusto-move-1/`.
- **Reference manual V16.24:** entries for app-fixes-1 and app-fixes-2, with the open UIScene item and the gusto-move-1 incident.
- **Full sweep:** 223 run, **218 passed, 5 failed**. The 5 are the same ones that failed before this work, for the same reasons.

**Commits:**

| Commit | What |
|---|---|
| `612bbf7c` | the app-fixes-1 and gusto-move-1 reports (item 4) |
| `e965d654` | app-fixes-2: code, words in every locale, back-translations, harnesses, re-pins, screenshots |
| `a0b93ab0` | manual V16.24 |
| (this report) | committed on its own, last |

## The brief

**Garbled spans:** none.

**Contradictions:** none. Three points needed care; none is a real conflict:

- **Item 4 commits files from earlier workstreams.** Item 6 says "commit this workstream's files only", but item 4 names those files explicitly, so I committed them in their own commit.
  - **Checked first:** they hold first names, order numbers and IDs, but no email addresses or phone numbers.
  - **Not named, so left uncommitted:** `docs/capacity-one-source-2-report.md`.
- **The app's login route** (item 2) is `/login`. It is the same route on the web: native sign-out lands there too (`lib/native/signOut.ts`), and it is on the stay-in-app list. So one link serves both.
- **"Sign out".** It isn't on your list, but "Log in" next to "Sign out" mixes the two words. I changed it to **"Log out"** (`userMenu.signOut`, and the admin console's button). Say if you'd rather keep "Sign out"; it is one key.

## 1. "Log in", never "Sign in"

### 1.1 en-GB, before → after (the 21 reworded keys)

| Key | Before | After |
|---|---|---|
| `auth.login.title` | Sign in to your kitchen | Log in to your kitchen |
| `auth.login.submit` | Sign in | Log in |
| `auth.login.submitting` | Signing in… | Logging in… |
| `auth.login.resetSuccess` | Password updated successfully. Please sign in. | Password updated. Please log in. |
| `auth.login.emailChanged` | Email address updated. Please sign in with your new email address. | Email address updated. Please log in with your new email address. |
| `auth.forgot.back` | Back to sign in | Back to log in |
| `auth.signup.signIn` | Sign in | Log in |
| `auth.signup.haveAccount` | Already have an account? Sign in | Already have an account? Log in |
| `auth.sessionAlert.title` | Your sign-in needs attention | Your login needs attention |
| `auth.sessionAlert.body` | …New changes may not save until you sign in again. | …until you log in again. |
| `auth.sessionAlert.signIn` | Sign in again | Log in again |
| `errorsOnboarding.not_signed_in` | Not signed in | Not logged in |
| `errorsOnboarding.account_exists` | There’s already an account with that email — sign in instead. | …— log in instead. |
| `errorsOnboarding.deletion_sign_in` | Sign in to request account deletion. | Log in to request account deletion. |
| `errorsManage.sign_in_required` | Sign in required | Log in required |
| `errorsKitchen.sign_in_check_failed` | Could not check your sign-in right now | Could not check your login right now |
| `demoGetStarted.signIn` | Sign in | Log in |
| `userMenu.signOut` | Sign out | **Log out** (see the brief) |
| `manageMenuImport.discard.setupBody` | …You can add your menu any time: sign in and tap <b>Import menu</b>… | …log in and tap… |
| `managePayments.permission.body` | …set up from their own signed-in account… | …their own logged-in account… |
| `managePayments.admin.body` | …from their own signed-in account… | …their own logged-in account… |

Key names (`signIn`, `sign_in_required`, …) are unchanged, so the API's refusal **code** `sign_in_required` is unchanged too. Only the words changed.

**Outside the message files:**

- **Admin console** (`app/(app)/admin/page.tsx`, English only): "Sign out" → "Log out", and "Reload and sign in again." → "…log in again."
- **The API's English fallback** (`lib/truck-access.ts`): "Sign in required" → "Log in required". Screens word it from the code; this is the text used when they can't.

**Left alone, as the brief says:**

- `managePayments.onboarding.restricted` and `.firstRun`: "you'll sign in to Stripe".
- `customDomain.providers.123reg.signIn`: the 123 Reg step.
- `comparison.features.staff.explain`: "Staff sign in with their own login and role."

**Already "log in" or "login" (a noun), so unchanged:** the order email's "Log in to your HatchGrab dashboard", "Go to login", "No login needed", "Staff logins" and similar.

**Checked:** no other en-GB message says "sign in" or "sign out", and no English locale (en-US, en-AU, …) overrides any of these keys back. `scripts/app-fixes-2.cjs` fails if either happens again.

### 1.2 Duplicate keys merged

| Removed (added by app-fixes-1) | Now uses | Where |
|---|---|---|
| `auth.forgot.backToLogin` | `auth.forgot.back` | "email sent" on Forgot password; "Back to log in" on the reset link cards |
| `auth.reset.logIn` | `auth.login.submit` | "Log in" after a password reset |

Each pair had the same words in every language once "Back to sign in" became "Back to log in". Both keys were removed from all 103 locale files and all back-translations, and no code reads them (checked).

**Kept:** `auth.reset.sendNewLink` ("Send a new link") and `auth.reset.requestNew` ("Request a new reset link") are different words, so they stay separate.

### 1.3 The other languages

Each language uses the word its own landing page uses for "log in" (`landingNav.logIn`). I compared that word with the auth flow's in all 48 shipped bases:

- **Bengali, Hindi and Urdu changed.** Their auth flow used the transliterated "sign in" (সাইন ইন / साइन इन / سائن اِن) while their landing page says "log in" (লগ ইন / लॉग इन / لاگ اِن).
  - The same 21 keys were moved onto the "log in" word, including "log out" (লগ আউট / लॉग आउट / لاگ آؤٹ).
  - **Left alone:** their Stripe and 123 Reg steps.
- **45 bases unchanged.** Each already used its own word for "log in" in the auth flow, for example fr-FR "Se connecter", de-DE "Anmelden", ja-JP "ログイン".
- **Three for you to glance at, unchanged:**
  - **es-ES:** the landing nav says "Entrar"; the auth flow says "Iniciar sesión". These are synonyms, and "Iniciar sesión" is the usual Spanish for "log in".
  - **ro-RO:** the landing nav says "Autentificare"; the auth flow says "Conectați-vă" / "conectare".
  - **ne-NP:** the landing page itself says साइन इन ("sign in"). No landing-page changes were allowed, so the auth flow keeps matching it.
- **Back-translations** (`docs/i18n/back/*.json`, 48 files): the English back-translation of every reworded key now says "Log in" / "log in" / "login" / "Log out".
- **Structure:** `scripts/translation-check.cjs` shows **Structural: 0** for bn-BD, hi-IN, ur-PK and fr-FR.
- **Namespace files:** `messages/ns` regenerated with `scripts/split-messages.cjs`.

## 2. Dashboard "Access denied" gets a way forward

`app/(app)/dashboard/[token]/page.tsx`: under "Access denied" and its sentence, a **"Back to log in"** button goes to `/login`.

- **Worded by** `auth.forgot.back`. The dashboard now loads the `auth` namespace (`lib/i18n/namespaces.ts`) and imports its catalog.
- **Web and app:** it sits outside the native-only branch. The "← brand" link below it is unchanged.
- **When it shows:**
  - **In the app** (native session): whenever the token is bad or expired.
  - **On the website:** a visitor with no session never sees "Access denied". The session gate in `proxy.ts` sends them to `/login` first. It shows to a logged-in operator whose token is wrong or expired, or for a demo link.

**Proved** (`scripts/app-fixes-2-screens.cjs`, WebKit, against the dev server; 10/10 pass): "Access denied" shows "Back to log in" and the click lands on `/login`, both on the website (desktop) and in the app (iPhone, the app's user agent plus the Capacitor bridge stub). Made-up tokens only; no truck was read.

Screenshots in `docs/app-fixes-2/`: `access-denied-web.png`, `access-denied-app.png`, `login-web.png` ("Log in to your kitchen", "Log in" button) and `reset-invalid-web.png` ("Send a new link", "Back to log in"). On localhost the brand reads "Village Foodie"; on hatchgrab.com it reads "HatchGrab".

## 3. `/dev` goes to `/app` inside the app

`lib/app-navigation.ts`: `/dev` was removed from the stay-in-app list, so inside the app `/dev` and `/dev/ticket-preview` now go to `/app`.

- **Both catch it:** the in-app link guard and the `proxy.ts` rule use this one list.
- **Unchanged:** `/signup`, `/setup` and `/admin` stay, as you decided.
- **Nothing links to `/dev`** from the app (checked).
- **Proved:**
  - in the app, `/dev/ticket-preview` → 307 `/app` (then `/login`, with no session);
  - `/signup` stays;
  - on the website, `/dev/ticket-preview` is unchanged.

## 4. Reports committed (`612bbf7c`)

- `docs/app-fixes-1-report.md`
- `docs/gusto-move-1-report.md`
- `docs/gusto-move-1/backup.json` and `record.md`

## 5. Reference manual V16.24 (`a0b93ab0`)

**Version:** the header and the front matter both read V16.24 / Version 16.24.

The new changelog entry covers:

- the printing import cycle: its root cause, the two commits behind it, a new rule against `require()` "lazy loading", and `scripts/turbopack-merged-modules-check.cjs` with when to run it;
- one error boundary per Paramètres card, and why each card must be a `<Section>{() => …}</Section>`;
- "Back to dashboard" on the error page;
- the auth end states, as a table that includes the new Access denied button;
- the Carte & stock phone layout;
- the in-app navigation guard and proxy rule, with the full stay / browser / app lists (`/dev` now in "app");
- `scripts/messages-keys-used.cjs`;
- the "Log in" wording.

**Open items:**

- **UIScene:** a native change is needed before the next iOS build. It was not made.
- **gusto-move-1:** a duplicate scraper event split Pizzeria Gusto's evening; 23 orders were moved and 6 renumbered. The root cause is marked **not yet investigated**.

**Two older sections annotated:**

- the login page's one button ("Sign in" → "Log in", §4.8 audit);
- the wired-printing section (no more `require('./netTransport')`).

## 6. Tests

### Commands

```
node scripts/app-fixes-2.cjs                                        # swept: 55 checks
BASE=http://localhost:3000 node scripts/app-fixes-2-screens.cjs     # by hand: 10 checks, screenshots
node scripts/run-harnesses.cjs                                      # the full sweep
npx tsc --noEmit -p .                                               # clean
```

- **Typecheck:** clean.
- **Lint:** no new problems. Error and warning counts on every changed file are the same as at the commit before.

### Full sweep: 223 run · 218 passed · 5 failed

The final run was on the committed tree (`a0b93ab0`). The 5 failures are the same ones app-fixes-1 reported, for the same reasons:

- **`paperwork-1`, `legal-languages-1`, `world-countries-3`, `tidy-1`:** `content/legal/ru-KZ/privacy-policy.md` is missing (ENOENT).
- **`contact-1`:** its pin on `planTable` still fails.
  - **Its one new failure:** in the first sweep, contact-1 also listed `messages/ns/en-GB/errorsOnboarding.json`. That was this work, and it has been re-pinned (§6).
  - **Now:** contact-1's list holds only the `planTable` files, as before this work.

**The first sweep failed 15.** Besides those 5:

- **Fixed by re-pins (§6):** messages-split, cwv-2, language-phase-1b, -1c, -1d, -1d2, -1e, -2 and messages-parity. All pass now.
  - **messages-split:** the auth catalog import had a trailing comment on its line; the check expects the import alone.
- **Passed on re-run, unchanged:** event-types-render, the dropdown check that also fails at random on the commit before this work (app-fixes-1 §8).

### Re-pins (fixtures and harnesses that pinned the old English or the old screens)

| File | Why | How |
|---|---|---|
| `scripts/fixtures/app-fixes-2-messages.json` (new) | The language-phase harnesses render screens with **frozen** words, so a reworded key must be recorded | The **seventh** stage record (after copy-truth-1): the 21 keys before → after, plus the 2 removed. Wired into `scripts/_lp2-frozen.cjs` `stageA()`. Exact. |
| `scripts/app-fixes-1.cjs` | It pinned the merged key names and "Back to sign in" | Now checks `auth.forgot.back` = "Back to log in", `auth.login.submit` = "Log in", and the old keys gone |
| `scripts/_named-app-fixes-1.cjs` | The auth view proofs added "Back to log in"; frozen renders now word that same link "Back to sign in" | Either wording of **that one link** is accepted; nothing else is loosened |
| `scripts/_lp2-named.cjs`, `scripts/_lp1d2-named.cjs` | language-phase-1b / -2 / -1d2 pin the Access denied view | A structural proof (`proveAccessDenied`): with the one button taken out, the view is byte-identical to before |
| `scripts/fixtures/app-fixes-2-edits.json` (new), `scripts/_named-app-fixes-2.cjs` (new), `scripts/_moved-paths.cjs`, `scripts/cwv-2.cjs` | cwv-2 pins `app/(app)` files byte for byte | This work's exact edits are recorded and undone first, before app-fixes-1's undo |
| `scripts/contact-1.cjs` | The public truck page bundles `errorsOnboarding`, which this work reworded | The stage record's keys, per namespace, are excused only in files that `app-fixes-2:` commits changed |
| `scripts/fixtures/language-phase-2-us-changed.txt` | Regenerated by language-phase-2 | Two lines added: the two US Access denied views (`code: app-fixes-2-access-denied`) |
| `scripts/harnesses.json` | Registry | `app-fixes-2.cjs` swept; `app-fixes-2-screens.cjs` under needs_a_browser; `_named-app-fixes-1/-2.cjs` under shared_modules |

**What the frozen fixtures still hold:** the language-phase captures (`scripts/fixtures/language-phase-*-messages-before.*.json`) still hold "Sign in". That is by design: they record the words as they were, and the stage record above names the change.

`scripts/_messages-parity-1e.cjs` still lists `auth.reset.logIn` and `auth.forgot.backToLogin` among app-fixes-1's new wording. That list is history, and an entry for a key that no longer exists has no effect.

## 7. SQL

None. No database reads or writes this session.

## 8. Open, for your decision

1. **"Sign out" → "Log out".** Done as an extension of item 1 (see the brief). Say if you want "Sign out" back.
2. **UIScene (from app-fixes-1, in the manual).** A native change is needed before the next iOS build. It was not made.
3. **gusto-move-1's root cause:** why the scraper's duplicate event sat alongside the live one. In the manual as not yet investigated.
4. **es-ES and ro-RO:** the landing nav's short label is a synonym of the auth flow's "log in" word (§1.3). Align them if you want one literal word.
5. **Bengali, Hindi and Urdu:** the new wording reuses each language's own landing-page word, but a native-speaker check would confirm it.
6. **`docs/capacity-one-source-2-report.md`** is still uncommitted. Item 4 didn't name it.
7. **Inside the app,** "Access denied" still shows an inert "← HatchGrab" line under the new button. This predates this work. It could be removed now that the button exists.

## 9. Files

**Committed in `e965d654`:**

- **Code:** `app/(app)/admin/page.tsx`, `app/(app)/dashboard/[token]/page.tsx`, `app/(app)/forgot-password/page.tsx`, `app/(app)/reset-password/page.tsx`, `lib/app-navigation.ts`, `lib/i18n/namespaces.ts`, `lib/truck-access.ts`
- **Words:** `messages/*.json` (en-GB reworded; bn-BD, hi-IN, ur-PK reworded; the two merged keys removed everywhere), `messages/ns/**` (regenerated), `docs/i18n/back/*.json`
- **Tests:** `scripts/app-fixes-2.cjs`, `scripts/app-fixes-2-screens.cjs`, `scripts/_named-app-fixes-2.cjs`, `scripts/fixtures/app-fixes-2-edits.json`, `scripts/fixtures/app-fixes-2-messages.json`, plus the re-pins in §6
- **Screenshots:** `docs/app-fixes-2/*.png` (4)

**Also committed:**

- `612bbf7c`: the reports (§4)
- `a0b93ab0`: `docs/reference-manual.md`
- **This report**, committed last

**Left alone:** `docs/capacity-one-source-2-report.md`.
