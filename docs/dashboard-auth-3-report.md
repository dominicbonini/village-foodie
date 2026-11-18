# dashboard-auth-3 — Sign out ends this device only, then commit

18 November 2026. **Committed locally on main as `9198f4a0` (dashboard-auth-2 and -3 together). Not pushed, not deployed.** docs/ is left uncommitted. No database reads or writes, and no SQL was run. Nothing visible changes for any user.

## Summary

- **Sign out** (web and app) now ends **this device's session only**. Every other device on the same account stays signed in, including a kitchen iPad sharing the owner's login.
  - In the app, Sign out also clears the stored session, **even when the server can't be reached**. Before, an offline Sign out left the session in place.
  - Face ID / Touch ID app lock is untouched.
- **A password reset** still signs out everywhere, now stated in the code rather than left to the default.
- **The email change** keeps its screens and words exactly ("Signing you out…", then the log-in page). It now signs out only the device that confirms it (your answer, Q1 A).
- **Checks:**
  - New: `scripts/dashboard-auth-3.cjs`, 21 passed, 0 failed. It runs the real Supabase auth client against an in-memory auth server and proves a second device stays signed in after Sign out, and that a password reset still ends it.
  - Three deliberate breakages are each caught.
  - `dashboard-auth-2`: 95/0.
  - tsc and lint are clean.
  - The older harnesses pass, or fail exactly as they do on HEAD.

## 0 · Prompt check

- **Contradiction, asked and answered:** "Email change: keep this device signed in" couldn't be met without changing visible words ("Signing you out…" and "Please log in with your new email address."), which "no visible change" forbids. I stopped and asked; you chose **Q1 A**.
- **Garbled spans:** none.

## 1 · What changed

| File | Change |
|---|---|
| `lib/native/signOut.ts` (the one Sign out control: dashboard UserMenu, Manage, admin) | Web: `supabase.auth.signOut({ scope: 'local' })`, then `/login` as before. App: `nativeSignOut()` (below), then `/login` as before. The "this was on purpose" flag is still set first, so no "signed out" banner flashes on the way out. |
| `lib/native/session.ts` `nativeSignOut` | `signOut({ scope: 'local' })`. If that fails (offline, or a server error; auth-js then keeps the session and returns an error), the stored session `hg-native-auth` and its code verifier are **removed by hand**, so the app is signed out regardless. The storage key is now a named constant (`NATIVE_AUTH_STORAGE_KEY`); same value. |
| `app/(app)/verify-email/VerifyEmailSuccess.tsx` | `signOut({ scope: 'local' })`; the screen, the words and the redirect to `/login?message=email_changed` are unchanged. |
| `app/(app)/reset-password/page.tsx` | `signOut({ scope: 'global' })`, the same as the old default, now stated. |
| App lock (`lib/native/appLock.ts`, `components/native/AppLockGate.tsx`) | **Unchanged.** Sign out never touched it and still doesn't. |

**What "local" means** (Supabase): the server revokes only the session this device holds, and the device forgets it. Other devices' sessions and refresh tokens stay valid. "global" (the old default for every one of these calls) revoked every session of the account.

**After deploy:**
- Signing out on a phone no longer signs out the truck's other devices.
- If a device is lost, the way to end its session is a **password reset**, which still signs out everywhere.

## 2 · Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | clean |
| ESLint, the changed and new files | clean |
| **`node scripts/dashboard-auth-3.cjs`** (new) | **21 passed, 0 failed** |
| Mutation: the web Sign out back on the default scope | caught (5 failures) |
| Mutation: the app Sign out back on the default scope | caught (4 failures) |
| Mutation: the app no longer clears its session when offline | caught (1 failure) |
| `node scripts/dashboard-auth-2.cjs` | 95 passed, 0 failed |
| 100 harnesses that read the changed files (the dashboard-auth-2 list plus those reading the sign-out, session, email-change and password-reset files; live-data ones excluded) | all pass, except those below that fail the same way on HEAD |

**How `dashboard-auth-3.cjs` works.** No network, no database.
- The **real** `@supabase/supabase-js`, as installed, runs against an in-memory stand-in for Supabase's auth server. The stand-in models:
  - password sign-in;
  - rotating refresh tokens;
  - `/logout` with scope `local`, `global` or `others`;
  - `/user`.
- The repo's own `nativeSignOut` and `operatorSignOut` are bundled with only their device, storage and web-client seams stubbed.

What it covers:
- **A · static:**
  - each of the four call sites names its scope;
  - no `auth.signOut()` with the default scope is left anywhere in `app/`, `lib/` or `components/`;
  - the intent flag is still set before signing out;
  - the app-lock files are unchanged and not referenced.
- **B · two devices, one account; the app signs out:**
  - the server is asked for `scope=local`;
  - the app's stored session is gone;
  - it routes to `/login`;
  - 🔴 **the other device still refreshes its session and still reads its user**.
- **C · the web Sign out:** `scope=local`, the session is gone, the page goes to `/login`, and the other device is still signed in. **The app offline:** the logout never reaches the server, but the app's stored session (and its code verifier) is still cleared.
- **D · the contrast:**
  - a password reset (`global`) **does** end the other device's session;
  - the **old default** would have ended it too, which shows the change matters;
  - the email change (`local`) signs out the confirming device and leaves the other signed in.

**Harnesses re-pinned for this round**, each with a dated note:
- `scripts/app-fixes-1.cjs`: the reset page's sign-out is now pinned as `signOut({ scope: 'global' })` (49/49).
- `scripts/cwv-2.cjs`: a new named-edit module, `scripts/_named-dashboard-auth-3.cjs`, puts back exactly this round's two edits under `app/(app)` (each found exactly once) before its "every file under app/(app) is its pre-move self" comparison. Any other change still fails. Back to 43/1: the one remaining failure is its path freeze on dashboard and API routes, which fails on HEAD too.

**Failing the same way on HEAD (not this work):**
- `app-fixes-2`: the "Log in, never Sign in" rule against my events-create-2 message; reported in dashboard-auth-2.
- `billing-1`, `france-1`, `language-phase-1d2`, `costs-accounts-1`, `cwv-2` (1): path-freeze and language checks.
- `event-types-render`: measurement failures.
- `subtab-row`: crashes building a fixture.
- `allergen-card-country-screens` failed once in the sweep and passed on a re-run (a flaky screenshot run).

**Side effect, undone:** the sweep's screenshot harnesses rewrote 13 committed screenshots in docs/. They are restored to their committed versions; none is in the commit.

## 3 · The commit

`9198f4a0` — "dashboard-auth-2/3: every staff client sends its sign-in; shadow-log what the member rule would refuse; Sign out ends this device only". 38 files:

**dashboard-auth-2:**
- **New code:** `lib/native/staffFetch.ts`, `lib/auth/require-member.ts`, `lib/auth/login-href.ts`.
- **Clients:** the dashboard and KDS pages, `AddOrderPanel`, `SessionAlertBanner`, `orderGate`, `device`, `networkGuard`, `useReadyEmailUndo`.
- **Routes:** the 15 staff routes.
- **Harnesses:** `scripts/dashboard-auth-2.cjs`, plus the re-pinned `event-types`, `order-charges` and `app-fixes-2`.

**dashboard-auth-3:**
- **Code:** `lib/native/signOut.ts`, `lib/native/session.ts`, `VerifyEmailSuccess.tsx`, `reset-password/page.tsx`.
- **Harnesses:** `scripts/dashboard-auth-3.cjs` and `scripts/_named-dashboard-auth-3.cjs`, plus the re-pinned `app-fixes-1` and `cwv-2`.

The working tree is clean apart from docs/. The parallel languages session kept committing to main during this work; none of its commits touched these files.

## 4 · Still open (from dashboard-auth-2)

- **Before deploy:** check the hosted Supabase settings (Authentication → Sessions). "Time-box user sessions" and "Inactivity timeout" should be off, or kitchens are signed out on a schedule.
- **After deploy:** run the read-only SQL in docs/dashboard-auth-2-report.md §5 after a week of service, to see which trucks and screens would be refused.
- **Before any group is enforced:**
  - the refusal wording, using "Log in", not "Sign in";
  - the offline queue holding ops until log-in instead of dropping them;
  - kitchen screens signed in and the KDS link no longer exposing the dashboard token;
  - Manage's own calls moved to `staffFetch`.
