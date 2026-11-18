# dashboard-auth-2 — every client sends its sign-in; log what would be refused

18 November 2026. **Not committed, pushed or deployed.** No database writes. No SQL was run this round; every check ran on in-memory data. Nothing visible changes for any user, and no wording changed.

## Summary

- **Step 1 (clients carry the sign-in) is done.**
  - A new wrapper `staffFetch` adds the app's Bearer at send time; the web already sends its cookie. It is used by every staff call to the routes in scope, from the dashboard, Add order, the KDS, printing, the ready-email undo and device binding.
  - The offline queue now reads the session **when it sends**, so a replay carries whoever is signed in at that moment.
  - With no session, every call goes exactly as before. A slow session read is capped at 1.5 s.
  - The private-link calls now carry the sign-in.
  - "Sign in again" and "Access denied" now return to the page the person was on.
- **Step 2 (the shadow log, in log mode) is done.**
  - `requireMember` is called on all 15 staff routes, 18 handlers in total. It never refuses and never delays the response.
  - It writes an `auth_shadow:<action>` row only for a caller the planned rule would refuse.
  - Board reads are throttled to about one row per truck, caller kind and client per hour, each row carrying the count of reads suppressed since the last.
  - The heartbeat and demo trucks are exempt.
- **Checks:**
  - The new harness: 95 passed, 0 failed.
  - Three deliberate breakages are each caught.
  - tsc and lint are clean.
  - Every older harness that reads these files passes, or fails exactly as it does on HEAD.
- **Found while checking sign-out (§2):**
  - Nothing signs a device out on a timer.
  - But "Sign out", finishing a password reset, and confirming an email change all sign that account out on **every** device. On a truck sharing the owner's account, that includes the kitchen iPad. Decision D-A below.

## 0 · Prompt check

- **Your answers:** Q1 A, with the count of suppressed reads on each row; Q2 A. Both are built as answered.
  - The pasted note credits "Cursor's recommendations". Those were the two options I put to you here; no other tool was involved.
- **Garbled spans:** none.
- **Contradictions:** none left after Q1/Q2.

## 1 · What was built

| File | Change |
|---|---|
| `lib/native/staffFetch.ts` (new) | `staffFetch(url, init)`: the same signature and result as `fetch`, plus `staffAuthHeaders()`.<br>• In the app it adds `Authorization: Bearer <current session>`; on the web it adds nothing, because the cookie goes by itself.<br>• It never overrides a header the caller set.<br>• No session: sent as before.<br>• A session read that throws: sent without the header.<br>• A session read that hangs (auth-js can retry a refresh for up to ~30 s): sent without the header after **1.5 s**.<br>• `setStaffClientMarker('kds-link')` adds `X-HG-Client: kds-link`, a label for the log, never a credential. |
| `lib/native/orderGate.ts` | `post()` calls `staffAuthHeaders()` **inside** the send, so live sends and replays carry the session current at send time. Queued ops still store only `url` and `body`, with no header. |
| `app/(app)/dashboard/[token]/page.tsx` | All 50 calls to `/api/dashboard`, `/api/dashboard/action`, `/api/events/action`, `/api/events/manage`, `/api/events/affected-orders`, `/api/event-types` and `/api/manage` go through `staffFetch`. That includes the two `private_link` calls, which previously had no Bearer and already failed in the app. The "Access denied" link is now `/login?next=<this page>`. |
| `app/(app)/dashboard/[token]/kds/page.tsx` | All 12 staff calls go through `staffFetch`. When opened from `/kds/<kds_token>` (the only entry that passes `token` as a prop), it sets the kitchen-screen marker. |
| `components/dashboard/AddOrderPanel.tsx`, `lib/useReadyEmailUndo.ts`, `lib/printing/networkGuard.ts`, `lib/native/device.ts` | Their staff calls go through `staffFetch`. `device.ts` loads it lazily, to avoid an import cycle with `session.ts`. |
| `lib/auth/login-href.ts` (new) + `components/auth/SessionAlertBanner.tsx` | `loginHrefBackHere()` returns `/login?next=<path+query>`, built from `window.location` only, so it is always a same-origin path. Both links render only after mount, so server and client agree. `/login` already honours `next`. |
| `lib/auth/require-member.ts` (new) | `requireMember(req, supabase, truck, action, { route, group, actor?, replay?, mode? })`; `AUTH_MODE = { group1: 'log', group2: 'log', read: 'log' }`. Details in §3. |
| 15 routes | One `requireMember` call per handler, right after the token/PIN check, each followed by `if (gate.refuse) return gate.refuse`, which can't fire in log mode. Listed in §3. |

**Not changed:**
- `/api/heartbeat` (exempt);
- `/api/manage` (already requires a session);
- the customer-facing routes;
- the KDS link itself, which still hands the page the dashboard token (Q2 A);
- the `sendBeacon` flush in `useReadyEmailUndo`: a beacon can't carry headers, so in the app it stays token-only. It fires only when a tab closes within 4 s of pressing Ready.

## 2 · Sign-out: timers and silent refresh (checked in code)

**Nothing signs a device out on a timer.**
- The only `signOut()` calls are:
  - the Sign out control (`lib/native/signOut.ts`, used by UserMenu, Manage and admin);
  - the password-reset page after a new password is set (`app/(app)/reset-password/page.tsx:113`);
  - the email-change success page (`app/(app)/verify-email/VerifyEmailSuccess.tsx:15`).
- There is no idle or inactivity logic anywhere.
- Face ID / Touch ID App Lock (`components/native/AppLockGate.tsx`) locks the screen and never touches the session.
- The repo's `supabase/config.toml` sets no session timebox or inactivity timeout.
- ⚠️ **The hosted project's settings can't be read from the repo.** Please check Supabase dashboard → Authentication → Sessions: "Time-box user sessions" and "Inactivity timeout" should both be off (0). If either is on, kitchens will be signed out on a schedule.

**A failed silent refresh is retried before anything is treated as signed out**, when the failure is the network:
- auth-js retries a network failure itself (200/400/800 ms backoff, within its 30 s tick) and tries again on the next ticks.
- If the session still ends, `lib/auth/session-observer.ts` checks again at **2 s, 10 s and 45 s** before showing the "sign in again" banner. The page never navigates away.
- On the web, the proxy's stale-cookie rule keeps the dashboard up regardless.
- A **definitive** refusal (a revoked refresh token) can't be retried. auth-js ends the session immediately, and only then does the banner appear.

**⚠️ Found: one person's "Sign out" signs out every device.**
- `auth.signOut()` with no options uses scope **`global`** (auth-js `GoTrueClient.signOut(options = { scope: 'global' })`). It revokes **every** session of that account.
- All three calls above use it.
- Today every real truck shares the owner's account across its devices. Pizzeria Gusto's 787 actions came from one account. So if the owner presses Sign out on their phone, or resets their password, the kitchen iPad loses its session within the hour, and the banner appears mid-service.
- That contradicts "a signed-in device stays signed in until someone signs out" in spirit: someone did sign out, but somewhere else.
- **Not changed**; it's D-A below.

## 3 · The shadow log

### Who is calling

| Caller kind | Meaning | Planned rule | Logged? |
|---|---|---|---|
| `member` | Signed-in owner, manager or staff member of this truck | allowed | no |
| `admin` | Signed-in HatchGrab admin | allowed | no |
| `foreign_operator` | Signed in, but an operator of another truck | **would refuse** | yes |
| `kds` | Nobody signed in, on a screen opened from `/kds/<kds_token>` | **would refuse** (D2 i) | yes |
| `token_only` | Nobody signed in: the link (and PIN) only | **would refuse** | yes |
| `unresolved` | The sign-in check itself failed | under enforcement a **retryable 503**, never a refusal | yes |
| `demo` | A `demo-` truck (same rule as `resolveTruckAccess`) | exempt | no |

The client kind is `kds` when the marker is present, else `app` (user agent `HatchGrabNativeApp`), else `web`.

### Groups

| Group | What |
|---|---|
| **group1** | Events: `/api/events/action` (all), `update_event`, `create_event_now`. Money: `refund`. Manage-level: `/api/event-types` writes, `/api/weekly-post` writes, `whatsapp-signup`, `process-menu`, `process-schedule`, `process-allergens`, `verify-schedule-url`, `whatsapp-preview`. |
| **group2** | Every other `/api/dashboard/action` action (walk-ups, statuses, payments, stock, pauses, settings), printing writes (`claim`, `release`, `set_address`), device binding. |
| **read** | `/api/dashboard` (the board), `/api/events/manage`, `/api/events/affected-orders`, and the read actions of `/api/dashboard/action` (`get_item_overrides`, `get_stock`, `get_events`, `create_event_places`), `/api/event-types` (`load`, `event_item_prices`, `usual_for_venue`), `/api/weekly-post` (`load`, `captions`, `event_load`, `font_catalogue`, `font_sample`, `font_usage`, `place_picture_list`, `social_overview`, `render`, `event_render`, `event_preview_entry`, and the GET), printer state, and device binding (GET). |

**Routes calling `requireMember` (one call per handler):**
- `/api/dashboard/action`, `/api/dashboard` (GET, after the PIN check, reusing its own caller lookup);
- `/api/events/action`, `/api/events/manage`, `/api/events/affected-orders`;
- `/api/event-types`, `/api/weekly-post` (GET + POST), `/api/printing` (GET + POST), `/api/native/bind-device` (GET + POST);
- `/api/manage/whatsapp-signup`, `process-menu`, `process-schedule`, `process-allergens`, `verify-schedule-url`, `whatsapp-preview`.

### The row

One `action_audit_log` insert:

| Column | Value |
|---|---|
| `action` | `auth_shadow:<action>`. Only a name matching `^[a-z_]{1,40}$`, else `auth_shadow:unknown`. |
| `truck_id` | the truck's id |
| `order_key`, `amount_minor`, `before_state` | **NULL** |
| `actor_kind`, `actor_id` | the caller's auth id when one resolved (an operator id, never a customer's) |
| `actor_label` | **NULL** (no names or emails) |
| `source` | `web`, `native` or `offline_replay` |
| `after_state` | `{ route, caller_kind, client: web/app/kds, group, mode: 'log', method }`, plus `reads_suppressed_before` (and `suppressed_since`) on read rows |

- **Never in the row:** the token, the PIN, an order key, or any customer field. Nothing from the request body is copied except the action name, after the check above.
- **A server log line goes with each row:** `[auth-shadow] would refuse <route> <action> truck=<id> caller=<kind> client=<kind> group=<g> mode=log`.

**Never slows or breaks the write:**
- In log mode `requireMember` returns `{ refuse: null }` at once.
- The caller lookup (when the route hasn't already done it) and the insert run in a task that is not awaited, registered with Next's `after()` through the repo's `keepAlive`, so the runtime keeps it alive past the response.
- Every error is caught.
- Routes that load the truck with a narrow column list (no `operator_id`) get it fetched by the helper, so an owner isn't misread as token-only.

**Board-read throttle:**
- At most one row per truck × caller kind × client per hour, **per server instance**. Serverless instances come and go, so the counts are a floor, not an exact total.
- A row's `reads_suppressed_before` is how many reads that instance skipped since its previous row for the same key.
- Writes are never throttled.

## 4 · Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | clean |
| ESLint, the new and changed files | clean / same counts as HEAD |
| **`node scripts/dashboard-auth-2.cjs`** (new, in memory) | **95 passed, 0 failed** |
| Mutation: switch group2 to `enforce` | caught (9 failures) |
| Mutation: drop the header from the queue's send | caught (2 failures) |
| Mutation: log signed-in members too | caught (8 failures) |
| events-overlap unit / routes / offline drain (scratchpad) | 27 / 46 / 7 passed, 0 failed |
| events-create-2 routes (scratchpad) | 85 passed, 0 failed (one check updated: a refused call now leaves only its shadow row) |
| 97 harnesses that read the changed files (live-data ones excluded) | all pass, except the 7 below that fail the same way on HEAD |

What the new harness covers:
- **A · static:**
  - all 18 handler calls are present, each followed by the refusal return;
  - the heartbeat has none;
  - in `/api/dashboard/action` the gate runs after the token/PIN check and before every action;
  - the board gate runs after the PIN check;
  - `AUTH_MODE` is all `log`;
  - no bare staff `fetch` is left in the five client files, and both bind-device calls use the wrapper;
  - the queue's `post()` reads the session inside the send, and outbox ops store no header;
  - the KDS marker is set only on the link entry;
  - the private-link calls use the wrapper, and both sign-in links carry `next`.
- **B · the wrapper:**
  - a session adds the Bearer, and the caller's header is never overridden;
  - no session sends without it;
  - a throwing session read still sends;
  - a hanging one sends after ~1.5 s without the header;
  - the marker rides along and clears;
  - method and body pass through.
- **C · the queue:** a write queued offline under session A and replayed under session B is sent with **B**. The op stores no session. It keeps its `expected_from`. Signed out, a live send goes exactly as before.
- **D · the routes:**
  - **Log mode changes nothing:** the same requests through the real gate and through a no-op gate give the same status, body and writes, for token-only, owner and foreign callers on `set_extra_wait`, `cooking`, `get_stock`, a wrong PIN, `events/action update` and `events/manage`.
  - **Rows:** none for owner, manager or staff. Token-only gets one row with the right fields. Foreign operator, kitchen screen, app, offline replay (source `offline_replay`), refund (group1) and an injected action name (`auth_shadow:unknown`) are each classified correctly. A wrong PIN is refused before the gate and writes nothing. Unresolved is logged. Demo trucks and the heartbeat write nothing.
  - **Content:** no token, PIN, order key or customer name, email or phone in any row, and `actor_label` is NULL.
  - **Throttle:** 7 board reads in 66 minutes gave 2 rows, the second saying 4 suppressed since 12:00. The app gets its own row. A member reading writes nothing.
  - **Logging can't hurt the write:** a database that throws on the insert still returns at once, and a 400 ms insert isn't waited for.
- **E · enforce mode (unit only, not switched on):** members pass; token-only, foreign and kitchen-screen callers get 403 `sign_in_required`; a failed check gets a retryable 503; demo passes.

**Harnesses re-pinned for this build**, each with a dated note:
- `scripts/event-types.cjs`: the `fetch(` → `staffFetch(` and `href="/login"` → `href={loginHrefBackHere()}` edits are put back exactly before its dashboard line comparison, and asserted in their new form (192/192).
- `scripts/order-charges.cjs`: the `auth_shadow:*` rows are taken out of its byte-for-byte write comparison, and the in-memory row ids they shifted are renumbered exactly (261/261).
- `scripts/app-fixes-2.cjs`: the Access denied button goes to `loginHrefBackHere()`, still `/login` (54/55; the remaining failure is below).

**Failing the same way on HEAD (checked in a temporary HEAD worktree, since removed):**
- `app-fixes-2`: 1 failure. ⚠️ It's the "Log in, never Sign in" wording rule: my events-create-2 message `errorsKitchen.sign_in_to_create` says "Sign in as a team member to create an event." It should say "Log in…". The dashboard-auth-1 report's §8 suggestions should use "Log in" too. Not changed here (no wording changes).
- `billing-1` (1), `france-1` (1), `language-phase-1d2` (213), `costs-accounts-1` (1), `cwv-2` (1): path-freeze and language checks, all already failing on HEAD.
- `event-types-render`: measurement failures; 4 on HEAD, 2 here.
- `subtab-row`: crashes building a fixture, on HEAD too.

**Side effect, undone:** the sweep's screenshot harnesses rewrote 13 committed screenshots in docs/ (allergen card, comparison features, costs-accounts, paperwork). They are restored to their committed versions.

## 5 · Read-only SQL for after deploy

Counts only, with no customer data in any row. Run after a week of real service:

```sql
-- 1 · would-refuse rows by truck, action, caller kind and client (last 7 days)
select truck_id,
       action,
       after_state->>'caller_kind' as caller_kind,
       after_state->>'client'      as client,
       after_state->>'group'       as grp,
       count(*)                    as rows,
       sum(coalesce((after_state->>'reads_suppressed_before')::int, 0)) as reads_suppressed
from action_audit_log
where action like 'auth_shadow:%'
  and created_at >= now() - interval '7 days'
group by 1, 2, 3, 4, 5
order by rows desc;

-- 2 · per group: how many real trucks would be refused, and how often
select after_state->>'group' as grp,
       count(distinct truck_id) as trucks,
       count(*) as rows
from action_audit_log
where action like 'auth_shadow:%'
  and truck_id not like 'demo-%'
  and created_at >= now() - interval '7 days'
group by 1
order by 1;

-- 3 · per truck and day: is it one screen all the time, or a one-off?
select truck_id,
       created_at::date as day,
       after_state->>'caller_kind' as caller_kind,
       after_state->>'client' as client,
       count(*) as rows
from action_audit_log
where action like 'auth_shadow:%'
  and created_at >= now() - interval '14 days'
group by 1, 2, 3, 4
order by 1, 2;
```

**What to look for:**
- `client = 'kds'` rows: kitchen screens running with nobody signed in. They need a sign-in before D2 is enforced.
- `client = 'app'` with `token_only`: an app whose session has gone.
- `foreign_operator`: any at all is worth a look.

## 6 · Decisions and follow-ups

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D-A | "Sign out" signs out every device for that account | (i) keep `global`; (ii) the Sign out button signs out **this device only** (`scope: 'local'`), while password reset and email change stay `global` (a security reset should end other sessions) | **(ii).** It matches "stays signed in until someone signs out" on that device. |
| D-B | The "Log in" wording rule | Reword `sign_in_to_create` to "Log in as a team member to create an event." (49 locales) and use "Log in" for the enforcement messages | **Yes**, in the enforcement round (no wording changes in this one). |

**Before switching any group to `enforce`:**
1. The refusal's words (messages, 49 locales). The enforce body today is a code only: `{ code: 'sign_in_required', requiresSignIn: true }`.
2. The offline queue must treat `sign_in_required` as "hold until logged in", not a failure. Today a 401/403 is terminal and dead-letters after 5 tries.
3. The KDS link must stop handing out the dashboard token, and kitchen screens must be signed in (D2 i).
4. Manage's own calls to the §1c routes (`components/manage/*`, the Manage page) don't use `staffFetch` yet. In the app they will show up as `client = 'app'`, `token_only` rows. Moving them is a small follow-up of the same kind as step 1.
5. Retire the PIN (D6 iii) once members are enforced.
6. Switching on is then one line per group in `lib/auth/require-member.ts` `AUTH_MODE`.

## 7 · Files

**New:**
- `lib/native/staffFetch.ts`
- `lib/auth/require-member.ts`
- `lib/auth/login-href.ts`
- `scripts/dashboard-auth-2.cjs`

**Changed (client):**
- `app/(app)/dashboard/[token]/page.tsx`
- `app/(app)/dashboard/[token]/kds/page.tsx`
- `components/dashboard/AddOrderPanel.tsx`
- `components/auth/SessionAlertBanner.tsx`
- `lib/native/orderGate.ts`
- `lib/native/device.ts`
- `lib/printing/networkGuard.ts`
- `lib/useReadyEmailUndo.ts`

**Changed (routes):**
- `app/api/dashboard/action/route.ts`
- `app/api/dashboard/route.ts`
- `app/api/events/action/route.ts`
- `app/api/events/manage/route.ts`
- `app/api/events/affected-orders/route.ts`
- `app/api/event-types/route.ts`
- `app/api/weekly-post/route.ts`
- `app/api/printing/route.ts`
- `app/api/native/bind-device/route.ts`
- `app/api/manage/whatsapp-signup/route.ts`, `process-menu/route.ts`, `process-schedule/route.ts`, `process-allergens/route.ts`, `verify-schedule-url/route.ts`, `whatsapp-preview/route.ts`

**Harnesses:**
- `scripts/event-types.cjs`
- `scripts/order-charges.cjs`
- `scripts/app-fixes-2.cjs`
