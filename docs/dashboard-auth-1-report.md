# dashboard-auth-1 — dashboard writes that accept the link without sign-in (review only)

18 November 2026. **Review only:** no code changed, nothing written to the database, nothing committed. Read-only SQL (counts only) is listed in §3. Pizzeria Gusto and Le Roi du Churrasco appear only in counts.

## Summary

- **Requiring a signed-in team member is safe for real trucks on the web today.**
  - In the last 60 days every audited dashboard write on a real truck came from a signed-in account.
  - All 69 token-only writes were on 5 demo trucks.
  - Web requests already carry the sign-in cookie.
- **It is not safe yet for the iPhone/iPad/Android app or the kitchen screen at `/kds/<kds_token>`.**
  - The app keeps its sign-in outside cookies and sends it only on reads.
  - Every write it makes, live or replayed from the offline queue, reaches the server with the link alone.
  - A wall-mounted KDS nobody signs in to has no identity at all.
  - Turning enforcement on today would refuse those writes, and the offline queue would throw them away after 5 tries.
- **Recommendation:**
  1. Fix the clients so every write carries the sign-in. No behaviour change.
  2. Log, without refusing, which writes would be refused.
  3. Enforce for event, money and Manage-level actions (option b, widened).
  4. Then the rest, with a carve-out for kitchen screens and the heartbeat.
  5. Add a "Reset dashboard link" button (option d) alongside.
- **Also found:**
  - Several Manage-level routes (`/api/event-types`, `/api/weekly-post`, the WhatsApp signup and the AI import routes) accept the dashboard token with no sign-in. One of them has a comment claiming it checks sign-in, but the code never does.
  - `refund` works with the link alone.
  - The KDS link hands out the full dashboard token.

## 0 · Prompt check

- **Garbled spans:** none.
- **Contradictions:** none.
- One point of practice: "show SQL inline in chat" and "chat: only a two-line summary" are both met by posting the SQL as a chat message while working (done), then ending with the two lines.
- **Not verified:** the hosted Supabase project's session settings (they live in the Supabase dashboard, not the repo); see §2.

## 1 · Inventory

How each route authorises:
- **token** = the truck's `dashboard_token` (in the body, or `?token=`);
- **PIN** = `dashboard_pin`, checked only if the truck set one (no real truck has; §3);
- **session** = Supabase cookie (web) or `Authorization: Bearer` (app);
- **member checked** = whether the route refuses a caller who is not a signed-in owner, admin or team member.

### 1a · Routes the dashboard, Add order and the KDS call

| Route | Callers | What it does | R/W | Authorises on | Member checked? |
|---|---|---|---|---|---|
| `GET /api/dashboard` | dashboard, KDS (both kinds) | The whole board: orders with customer names/phones/emails, menu, stock, events, settings | R | token + PIN | **No.** Refuses only a signed-in operator of *another* truck (403). Token-only is allowed. |
| `POST /api/dashboard/action` | dashboard, Add order, KDS, offline queue, `useReadyEmailUndo` | 56 actions (§1b) | W (4 reads) | token + PIN | **No** (sign-in used for the audit log only). Exception: `create_event_now` requires a member. |
| `POST /api/events/action` | dashboard, KDS | `confirm`, `open`, `close`, `cancel`, `update` (times/notes/auto open-close), `dismiss_overlap`, `restore_rejected` | W | **token only** (no PIN check) | **No** |
| `GET /api/events/manage` | dashboard, Add order, KDS | Event list with order counts | R | token (`?token=` in URL) | No |
| `GET /api/events/affected-orders` | dashboard, KDS | Orders on an event (before cancelling it) | R | token (`?token=` in URL) | No |
| `GET /api/slots/[truckId]` | Add order, dashboard | Collection slots (token optional, for staff extras) | R | public; token unlocks staff view | No |
| `GET /api/menu/[truckId]` | dashboard | Menu | R | public | No |
| `POST /api/printing` | dashboard (printing) | Claim/release the network printer, set its address (`truck_vans`) | W | token + PIN | No |
| `GET /api/printing` | dashboard | Printer state | R | token + PIN | No |
| `POST /api/heartbeat` | dashboard, KDS, app (`useHeartbeat`) | Writes `truck_vans.last_heartbeat_at`; the heartbeat monitor **pauses online ordering** when it goes stale | W | token, or the van's `kds_token` | No. **Must stay so** (§4). |
| `POST /api/manage` (`get_vans`, `menu_review_state`, `update_van_settings`, `upsert_van_category`, `private_link`) | dashboard | Van capacity/window, per-van category settings, private link | R/W | token + **session** (`resolveTruckAccess`) | **Yes** (owner/admin/member; demo allowed) |
| `POST /api/event-types` (`load`, `event_item_prices`, `save_event_item_prices`, `assign`) | dashboard (event card) | Event type assignment, per-event prices | R/W | **token only** | **No.** The file header says it uses `resolveTruckAccess`; it does not. |
| `POST /api/native/bind-device` / `GET` | app | Binds the device to a van (`van_devices`) | W | token (+ optional session for van scoping) | Partly |
| `GET /api/native/my-trucks`, `POST /api/native/switch-truck` | app | The trucks this user may open, and that truck's dashboard token | R | **Bearer session** | **Yes** |
| `GET /api/auth/me`, `POST /api/auth/update-profile` | dashboard, KDS | Who am I; edit my name | R/W | session (cookie or Bearer) | Yes (own profile) |
| `POST /api/demo/restart`, `GET /api/demo/return`, `/api/demo/save-email` | demo dashboards | Demo reset / return / email | W | token, demo trucks only (restart also checks admin/demo session) | n/a (demo) |
| `GET /api/ping` | `WebOfflineBanner`, reachability | Connectivity probe | R | none | n/a |

### 1b · The 56 actions on `/api/dashboard/action` (all token + PIN, none member-checked except `create_event_now`)

| Group | Actions |
|---|---|
| **Reads** | `get_item_overrides`, `get_stock`, `get_events`, `create_event_places` |
| **Orders during service** | `manual` (walk-up), `confirm`, `reject`, `cancel`, `cooking`, `ready`, `send_ready_email`, `undo_ready`, `collected` / `collected_cash` / `collected_card`, `undo_collected`, `edit`, `mark_paid` / `mark_paid_cash` / `mark_paid_card`, `undo_mark_paid` |
| **Money** | **`refund`**: a real card refund through Stripe, capped at what was captured |
| **Stock during service** | `set_item_availability`, `set_stock`, `set_category_stock`, `set_category_available`, `set_modifier_option_available`, `set_modifier_option_stock`, `decrement_stock` |
| **Service controls** | `set_paused`, `set_extra_wait`, `set_auto_accept`, `set_online_payments_paused`, `set_offline_protection`, `set_buzzer`, `set_order_ready_override`, `set_collection_intervals_override` |
| **Settings** | `set_print_trigger_mode`, `set_add_order_layout`, `set_sound_config`, `set_show_paid_step_override`, `set_completion_presses_override`, `set_buzzer_prompt_override`, `set_takes_cash_override`, `save_prep_configs`, `update_category` |
| **Events** | `update_event` (times; needs an event id since events-create-2), `create_event_now` (**member only**) |

### 1c · Manage-level routes that also accept the dashboard token with no sign-in

These aren't called by the dashboard, but they take the same token. `/manage/<token>` is the same token as `/dashboard/<token>`.

| Route | What it does | Authorises on |
|---|---|---|
| `/api/event-types` (`create`, `update`, `delete`, `reorder`, `set_type_pricing`, `set_type_item_price`, `set_private_link_ordering`, …) | Event types and their prices | token only |
| `/api/weekly-post` (27 write statements) | Weekly social post and its settings | token only (comment says otherwise) |
| `/api/manage/whatsapp-signup` | Stores the Meta WhatsApp business connection | token only |
| `/api/manage/process-menu`, `process-schedule`, `process-allergens`, `verify-schedule-url` | AI extraction (costs money per call; one writes) | token only |
| `/api/manage/whatsapp-preview` | Generates an AI reply preview | token only |

`/api/manage` itself, `commit-menu`, `billing`, `paperwork` and `weather` do require a session.

## 2 · How each client signs in

| Client | Page gate | What its API calls carry | Notes |
|---|---|---|---|
| **Web dashboard** `/dashboard/<token>` | `proxy.ts:448-450`: session required, else `/login?next=…`. **But** a stale-but-present `sb-…auth-token` cookie skips the redirect (`proxy.ts:494-495`), so the page can run with an expired, unrefreshable session. | Same-origin `fetch` sends the session **cookie** automatically, so web writes already carry identity. | The audit log confirms it: Gusto's writes are all "signed in", source `web`. |
| **Web KDS** `/dashboard/<token>/kds` | Same as the dashboard | Cookie, same as above | |
| **Kitchen screen** `/kds/<kds_token>` | **Not gated** (`proxy.ts:445`) | **No identity.** The page renders the same KDS with the **full `dashboard_token`** (`app/(app)/kds/[kds_token]/page.tsx:73`). | It can do everything a dashboard link can: read customer data, change statuses, take payments, refund, pause, open/close/cancel events. All 13 real vans have a `kds_token`. |
| **iPhone / iPad / Android app** | A WebView of `https://www.hatchgrab.com/app` (`capacitor.config.ts:17-26`), the same web app in both shells, user agent `HatchGrabNativeApp` (skips the proxy redirect, `proxy.ts:470`). | The session lives in app storage (`hg-native-auth`), **not cookies**. It is sent as a Bearer **only where code adds `nativeAuthHeader()`**: the `/api/dashboard` reads, `create_event_*`, most `/api/manage`. **Not added:** 23 `/api/dashboard/action` calls and 8 `/api/events/action` calls in the dashboard page, the KDS's event and pause calls, `/api/event-types`, and **every offline-queue send** (`lib/native/orderGate.ts:268-275`: `Content-Type` only). | So today, **every app write is token-only.** `private_link` calls from the app already fail (no Bearer to `/api/manage`), an existing bug. |
| **Offline queue** (app) | n/a | Stores `{url, body}`; the body includes `token` and `pin` **in plain text** (`lib/native/outbox.ts:69-85`). Sends `Content-Type` only, live and on replay. | A 401 is terminal: an op that gets one burns an attempt and is dead-lettered after 5 (`orderGate.ts:52-61, 446-450`). |
| **Demo dashboards** | Exempt by path (`proxy.ts:133, 449`) | Token only | `resolveTruckAccess` treats demo trucks as owner; `resolveActor` has no demo case. Enforcement needs a demo carve-out. |

**How long a session lasts:**
- In the repo: `supabase/config.toml` sets `jwt_expiry = 3600` (local CLI), and nothing sets session timebox or inactivity limits. With Supabase defaults:
  - the access token lasts 1 hour and is refreshed automatically (web: `@supabase/ssr` cookies, refreshed by the proxy's `getUser()` on every request; app: auth-js `autoRefreshToken`);
  - refresh tokens and sessions don't expire, so a device stays signed in indefinitely while refreshes succeed.
- **Unverified:** the hosted project's settings. Worth checking in the Supabase dashboard (Auth → Sessions) before enforcing: a timebox or inactivity timeout there would sign kitchens out on a schedule.

**If it expires mid-service:**
- **Web:** the page keeps running (stale-cookie rule). Writes would arrive with no valid identity. After an involuntary sign-out, `lib/auth/session-observer.ts` retries at 2s, 10s and 45s, then shows `SessionAlertBanner` linking to `/login`, without `next`, so the person loses their place.
- **App:** a failed refresh fires `SIGNED_OUT` and the same banner. From then on `nativeAuthHeader()` returns nothing, so calls are token-only. There is no retry-on-401. Biometric App Lock is a device lock, not a re-login.
- **Offline orders queued while signed in and replayed after expiry:** today the queue never sends identity, so nothing changes. Under enforcement, a replay with no valid session would get 401, which the queue treats as final: **the walk-ups would be dead-lettered.** The fix (§4) is a fresh header at send time, plus treating `sign_in_required` as "hold until signed in", never as a failure.

**Shared kitchen devices are already the norm.**
- **No real truck has a staff account.** One real truck has one team member (a manager); the other 11 have only the owner.
- Pizzeria Gusto's 787 audited actions over 22 trading days came from **one** signed-in account on the web.
- So the realistic model today is one iPad or laptop signed in as the owner and used by everyone. Member-only enforcement doesn't break that.
- The cost: anyone at that device has the owner's full Manage powers (billing, payouts, menu). Staff accounts, or a kitchen-device sign-in, are the longer-term answer (D5).

## 3 · Real usage (read-only, last 60 days, all trucks)

The SQL is in the chat message for this review; every statement was a SELECT.

> ⚠️ `action_audit_log` records only payment-type actions (`collected`, `undo_collected`, `manual_paid_at_order`, `mark_paid`, plus refund/reject/capture paths). **Status changes, stock, pauses and every event action are not logged anywhere with an actor.** No other table records who acted, except `order_payments.created_by`. So the counts below are a sample, not the whole picture.

**Audited writes by action, actor and source:**

| Action | Signed in | Token only |
|---|---|---|
| `collected` | 405 (4 trucks) | 67 (5 trucks) |
| `manual_paid_at_order` | 130 (3 trucks) | 2 (2 trucks) |
| `mark_paid` | 275 (2 trucks) | 0 |
| `undo_collected` | 1 | 0 |

Every row has source `web`. There are **no** `native` or `offline_replay` rows: no audited action came from the app or the queue in 60 days.

**Per truck:**

| Truck id | Demo? | Token-only writes | Signed-in writes |
|---|---|---|---|
| demo-m2tcdgwsqxnyn250y86ek5gs07 | yes | 52 (5 Oct) | 0 |
| demo-2ge3p3vd36yv3md6z6dnnvgvne | yes | 9 (16 Oct) | 2 |
| demo-gsse7ryjzccydr4n6fdktmnht8 | yes | 3 (1 Oct) | 0 |
| demo-fs4nr5zjkeb9t53z3qztvrcj6h | yes | 3 (5–7 Oct) | 0 |
| demo-8m8109mdhm02zvrr78t3ynykfj | yes | 2 (27 Oct) | 0 |
| pizzeria-gusto | no | **0** | 787 (one account) |
| test-truck | no | **0** | 19 (one account) |
| demo-8c95xz1twsn1xfhx3a4nkjv7j3 | yes | 0 | 3 |

**Trucks a member-only rule would have affected (audited actions):** **0 real trucks.** 5 demo trucks, covered by a demo carve-out.

**Context** (orders in 60 days):
- pizzeria-gusto: 404 orders (301 walk-ups) over 22 days;
- test-truck: 25;
- test-truck-us: 5;
- one demo: 69.

Other counts:
- **12 real trucks, 0 with a PIN.** 1 real truck has a team member (1 manager, 0 staff).
- 72 app device bindings on 5 real trucks, last bound 16 Nov.
- 13 real vans, all with a `kds_token`.

## 4 · Options

| | (a) Member for all writes | (b) Member for event-changing actions; token(+PIN) for walk-ups and statuses | (c) PIN compulsory for token-only writes | (d) "Reset dashboard link" on its own |
|---|---|---|---|---|
| **Protects against** | A leaked link doing anything. Gives a real name on every action. | A leaked link confirming, cancelling, opening or closing events (what stops service and misleads customers). Not refunds, statuses or customer data. | A link leaked *without* the PIN. Not a leaked link plus PIN, and not an ex-staff member who knows the PIN. | A link known to have leaked, or ex-staff, once someone notices and presses the button. Nothing until then. |
| **What could break** | **App:** every write until the client fix ships (§2). **`/kds/<kds_token>` screens:** every write. **Offline queue:** dead-lettered replays. **Web:** a session that fails to refresh mid-service would block walk-ups. **Demos:** everything, without the carve-out. **Heartbeat:** gating it would pause online ordering, so it must be exempt. | **App and `/kds/<kds_token>`:** Start/Finish/Cancel event, auto-open from the KDS (`kds/page.tsx:816`), and `set_paused` if included. Walk-ups keep working. | Every real truck (0 have a PIN) must set one, and every device must type it. The PIN travels in URLs (`/api/dashboard?…&pin=`) and in the queue in plain text, so it leaks the same way the token does. Staff share it. | Every screen holding the old token stops: KDS screens, bookmarks, bound app devices, `/manage/<token>`. **Queued offline ops carry the old token in their body**, so on replay they get 401 and are dead-lettered. |
| **Effort** | Medium-large: client fix (~4 files, ~45 call sites), one server helper, ~6 routes, outbox hold state, KDS device decision, wording × 49 locales. | Medium: the same client fix for the event calls, a server check on 2 routes. | Small server-side; heavy on onboarding and support. | Small-medium: new token, swap, "send the new link" flow, a grace window for old-token replays. |
| **Rollout without lockout** | Client fix first (no behaviour change) → shadow log → enforce by group → watch → widen. | Client fix for event calls → shadow → enforce. | Not recommended. | Ship any time; accept the old token for queued replays for ~24h, or refuse to reset while devices have queued ops. |

## 5 · Recommendation and rollout

**(b), widened to money and Manage-level actions, then (a), plus (d) alongside. Not (c).**

1. **Step 1: make every client carry its sign-in.** No behaviour change; ship and leave for a week.
   - `lib/native/orderGate.ts` `post()` adds `await nativeAuthHeader()` at send time, so every live and replayed queue send carries the current session.
   - Add `nativeAuthHeader()` to the direct `/api/dashboard/action`, `/api/events/action` and `/api/event-types` calls in the dashboard page and the KDS page (≈45 sites). Better: one small `staffFetch()` wrapper they all use.
   - Fix the existing app bug: `private_link` calls to `/api/manage` without the Bearer.
2. **Step 2: shadow log.**
   - A server helper `requireMember(req, truck, action)` that, in **log mode**, never refuses. It records `would_refuse` with action, truck, source and actor kind.
   - It writes to the server log, plus one `action_audit_log` row per refused-in-shadow write with `action = 'auth_shadow:<action>'`. That's append-only and has no customer data, so it fits the table's rules. Or log only, if you'd rather keep the table to real actions (D3).
   - Run it for 2 weeks covering real service. Expected result: zero real-truck hits except `/kds/<kds_token>` screens and the app.
3. **Step 3: enforce group 1.** Event actions (`/api/events/action` all, `update_event`), `refund`, and the Manage-level token routes in §1c (`/api/event-types` writes, `/api/weekly-post` writes, `whatsapp-signup`, the AI process routes).
   - None of these is needed at the hatch to take an order.
   - The refusal is 403 `sign_in_required` with the wording in §8.
4. **Step 4: hold, don't drop.**
   - The offline queue treats 401/403 `sign_in_required` as **paused**, not failed: the ops stay queued, and the banner asks for sign-in.
   - The web and app session banner links to `/login?next=<current page>`.
5. **Step 5: enforce group 2.** After two clean weeks:
   - **Order and payment actions:** `manual`, statuses, `collected*`, `mark_paid*`, `edit`, `cancel`, `reject`.
   - **Stock:** the stock actions.
   - **Settings:** service controls and settings.
   - **Kitchen screens** keep working through the KDS decision (D2).
6. **Never enforced:**
   - `/api/heartbeat`: refusing it pauses online ordering;
   - reads needed to show the board: keep token+session as today, with D4 below;
   - demo trucks: carve-out by truck id, the same rule as `resolveTruckAccess`.
7. **Separately, any time: (d) "Reset dashboard link"** in Manage › Settings, owner only.
   - It makes a new token, shows "Send the new link to your team", and accepts the old token **for queued replays only** for 24 hours.
   - It also regenerates `kds_token`s, or offers to.

## 6 · Decisions for you

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Which actions need a member in step 3 | (i) events only; (ii) events + refund + Manage-level routes; (iii) all writes at once | **(ii).** Refund is real money and §1c is config, while none of them is needed to take an order. |
| D2 | Wall-mounted kitchen screens (`/kds/<kds_token>`) | (i) must be signed in like the dashboard; (ii) a kitchen screen may do **only** its van's order statuses, `set_buzzer`, `set_extra_wait` and `set_paused` with its `kds_token`, and is refused events, money, settings and the full board's customer contacts; (iii) leave as today | **(ii).** Kitchens shouldn't need an account on a wall screen. The KDS gets its own scoped credential instead of the dashboard token. |
| D3 | Where the shadow log goes | (i) server logs only; (ii) also `action_audit_log` rows `auth_shadow:*` | **(ii).** Countable with the same SQL as §3, and it survives log retention. |
| D4 | Reading the board (customer names/phones/emails) with the link alone | (i) keep; (ii) require a member (or the scoped KDS credential) for `GET /api/dashboard` too | **(ii), in step 5.** The read exposes more customer data than any write. |
| D5 | Shared owner sign-in on kitchen devices | (i) accept; (ii) push trucks to add staff accounts; (iii) build a "kitchen device" sign-in later | **(i) now, (iii) later.** It's how every real truck works today. |
| D6 | PIN | (i) keep optional; (ii) make compulsory; (iii) retire once members are enforced | **(i), then (iii).** It's sent in URLs and stored in plain text, and no real truck uses it. |
| D7 | Old token after a reset | (i) dead at once; (ii) valid 24h for queued replays only | **(ii).** Otherwise a reset during service drops queued walk-ups. |

## 7 · Files to change (estimate)

**Step 1** (about 5 files):
- `lib/native/orderGate.ts`;
- `app/(app)/dashboard/[token]/page.tsx`;
- `app/(app)/dashboard/[token]/kds/page.tsx`;
- `components/dashboard/AddOrderPanel.tsx` (uses `gatedAction`; check its direct calls);
- a new `lib/native/staffFetch.ts` (optional wrapper).

**Steps 2–5** (about 10–12 files):
- a new `lib/auth/require-member.ts` (log/enforce mode, demo carve-out, KDS scope);
- the routes: `app/api/dashboard/action/route.ts`, `app/api/events/action/route.ts`, `app/api/event-types/route.ts`, `app/api/weekly-post/route.ts`, `app/api/manage/whatsapp-signup/route.ts`, `app/api/manage/process-{menu,schedule,allergens}/route.ts`, `verify-schedule-url`, `whatsapp-preview`, and `app/api/dashboard/route.ts` (D4);
- the queue and banners: `lib/native/outbox.ts` and `orderGate.ts` (the hold state), `components/native/OfflineBanner.tsx`, `components/auth/SessionAlertBanner.tsx` (`next`);
- messages: about 4 keys × 49 locales + split.

**D2 (scoped KDS credential):**
- `app/(app)/kds/[kds_token]/page.tsx`, so it stops passing the dashboard token;
- a KDS-scoped check in the routes it calls.

**(d) Reset link:**
- a Manage settings action in `app/api/manage/route.ts`;
- the Settings UI;
- the grace window in the token lookups.

## 8 · Wording (en-GB; short; for all languages)

| Where | Text |
|---|---|
| Refusal (`errorsKitchen.sign_in_required`) | "Sign in to do this." |
| Event action refused | "Sign in as a team member to change events." |
| Queue paused (offline banner) | "{n, plural, one {1 change is} other {# changes are}} waiting. Sign in to send them." |
| Session banner button | "Sign in again" (returns to the same page) |
| Kitchen screen refused (D2) | "This kitchen screen can't do that. Use the dashboard." |
| Reset link button (Manage › Settings) | "Reset dashboard link" |
| Reset confirm | "Reset the link? Screens using the old link will stop working. Kitchen screens need the new link." |
| After reset | "Link reset. Send the new link to your team." |

The existing `errorsKitchen.sign_in_to_create` ("Sign in as a team member to create an event.") stays as it is.

## 9 · Other risks noticed

1. **`/api/event-types`'s header says it uses `resolveTruckAccess`; the code doesn't.**
   - It creates, edits and deletes types and prices with the token alone.
   - `/api/weekly-post` is the same.
   - `/api/manage/whatsapp-signup` stores a Meta business connection on the token alone.
2. **`refund` works with the link alone.** The money goes back to the customer's card, so this is damage rather than theft, but it is irreversible.
3. **The KDS link is the dashboard link in disguise.** `/kds/<kds_token>` renders with the full `dashboard_token`, so anyone who opens a KDS link can read it from the page and use every route above, and `/manage/<token>`'s token-only routes.
4. **Tokens and the PIN in URLs:**
   - `/api/dashboard?token=…&pin=…` is polled continuously;
   - `/api/events/manage?token=`, `/api/events/affected-orders?…&token=` and `/api/native/bind-device?token=` also carry it;
   - the page path itself is `/dashboard/<token>`.

   These appear in Vercel request logs and browser history. No `Referrer-Policy` header is set; the browser default keeps the path off cross-site referrers, so that leak is low. Move tokens to a header or POST body over time.
5. **The offline queue stores `token` and `pin` in plain text** in app storage (`hg_outbox_op_<id>`).
6. **A signed-in operator of another truck** is refused on the board read (403) but **not on writes**: `foreignOperator` is ignored by `/api/dashboard/action` and `/api/events/action`.
7. **The proxy's stale-cookie rule** keeps the dashboard page up with an expired session. That's good for service, but it means the API is the only real gate. Enforcement must handle "page up, identity gone" with the hold-and-sign-in flow, not an error screen.
8. **`SessionAlertBanner` and the dashboard's "Access denied" link go to `/login` without `next`**, so a mid-service re-sign-in loses the page.
9. **The PIN is compared with `!==`** (no constant-time compare). There is no PIN-specific lockout; only the general per-IP API limit in `proxy.ts` applies to callers who aren't signed in. It's low risk because no real truck has set a PIN, but it is relevant if the PIN becomes compulsory.
10. **The audit log covers only payment actions.** Status, stock, pause and event changes have no record of who acted. The shadow log in step 2 partly fills this.

## 10 · Not verified

- Hosted Supabase session settings (timebox / inactivity).
- Whether any real truck runs a `/kds/<kds_token>` screen with nobody signed in: status changes aren't audited, so step 2's shadow log is what will show it.
- auth-js's exact refresh-on-read timing in the app.
