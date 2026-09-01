# Dashboard-token exposure — full investigation

🔴 **NOTHING WAS CHANGED, FIXED, DELETED OR ROTATED.** No PostHog config was touched, no route guard
added, no token altered. No database was queried. No SQL was run. The only file written is this report.

**Prompt integrity:** no span arrived garbled and no instruction contradicted another.

## Which of the three I did — plainly

**None of them.** No parse, no typecheck, no execution. File reads and greps only.

⚠️ **Consequence for §D:** I did not query the database, so the truck list is **the SQL for you to run**,
not results. ⚠️ **Consequence for §C11:** PostHog's server-side project settings are outside this
repository and are **CANNOT DETERMINE**.

---

# A. WHAT THE TOKEN ACTUALLY GRANTS

## A1. Every route that authenticates on `dashboard_token` alone

**Twenty-one lookup sites across the API.** `grep -rn "eq('dashboard_token'" app` returns them all. The
ones that matter, with what each permits:

| Route | Auth | Permits |
|---|---|---|
| **`/api/manage` GET** | token only | 🔴 **The entire management payload** — menu, items, prices, modifiers, bundles, discount codes, vans, team, settings, `schedule_url`, plan, trial expiry |
| **`/api/manage` POST** | token only | 🔴 **48 actions** — `upsert_item` (prices), `upsert_category`, `delete_item`, `bulk_delete_items`, `update_truck`, `update_settings`, `upsert_event`, `delete_event`, `add_van`, `delete_van`, `invite_team_member`, `remove_team_member`, `upsert_bundle`, `save_slot_capacity` |
| **`/api/dashboard` GET** | token (+ PIN, see below) | 🔴 **Every order with full customer PII**, truck settings, events, stock |
| **`/api/dashboard/action` POST** | token (+ PIN) | 🔴 **Order state machine + money** — confirm, reject, cancel **with refund**, mark paid, add manual orders, set stock |
| **`/api/events/action`, `/api/events/manage`, `/api/events/affected-orders`** | token only | event create/confirm/cancel, and the orders each affects |
| **`/api/stripe/connect`** | token only (`:66`, `:115`) | ⚠️ **Stripe Connect account actions** — see A1 note |
| **`/api/manage/commit-menu`, `process-menu`, `process-allergens`, `process-schedule`, `verify-schedule-url`, `whatsapp-preview`** | token only | menu writes, AI spend, schedule scraping |
| **`/api/heartbeat`** | token only | van online state |
| **`/api/native/bind-device`** | token only | binds a device, attaches a push token |
| **`/api/account/request-deletion`** | token *or* Bearer | 🔴 **schedules account deletion** |

**The shape is identical everywhere** — `app/api/manage/route.ts:24-31`:

```ts
async function getTruck(token: string) {
  const { data } = await supabase
    .from('trucks')
    .select('*')
    .eq('dashboard_token', token)
    .single()
  return data
}
```

**One string, one equality, service-role client. No session, no cookie, no password.**

### 🔴 THE PIN IS NOT A SECOND FACTOR — IT IS NEVER SET

`app/api/dashboard/action/route.ts:90-96` and `app/api/dashboard/route.ts:115` both gate on:

```ts
async function verifyToken(token: string, pin?: string) {
  const { data: truck } = await supabase
    .from('trucks').select('*').eq('dashboard_token', token).single()
  if (!truck) return null
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) return null
  return truck
}
```

🔴 **`truck.dashboard_pin &&` short-circuits when the column is null — and it is always null.** A
repo-wide grep for `dashboard_pin` returns **five hits**: the two guards above, the redact list, and
`lib/provision-truck.ts:404`:

```ts
        // verifyToken (api/dashboard/action) REJECTS when a pin is set and unmatched — a provisioned truck
        // must never carry one.
        dashboard_pin: null,
```

**No route, no UI, no action ever sets a PIN.** So the PIN branch is dead on every truck this codebase
created. **The token alone is sufficient on every route in the table.**

## A2. Does `/manage/<token>` require anything beyond the token?

**The PAGE is session-gated. The API behind it is not. That distinction is the whole finding.**

`proxy.ts:212-214`:

```ts
  const isProtected =
    (pathname.startsWith('/dashboard') && !isDemoDashboard(pathname)) ||
    pathname.startsWith('/manage')
```

So a browser hitting `https://www.hatchgrab.com/manage/<token>` with no session is 307'd to `/login`.

🔴 **BUT `/api/*` IS ON THE PUBLIC LIST** — `proxy.ts:217-225` includes `pathname.startsWith('/api')`.
And `/api/manage` defaults to the **highest** privilege when no session is present —
`app/api/manage/route.ts:44` and `:198`:

```ts
  let userRole: 'owner' | 'manager' | 'staff' = 'owner'
…
  } catch { /* if auth check fails, default to owner */ }
```

```ts
  let requestingUserRole: 'owner' | 'manager' | 'staff' = 'owner'
```

🔴 **The role is initialised to `'owner'` and only ever *narrowed* if a session resolves to a `truck_users`
row. No session ⇒ owner.** So `curl 'https://www.hatchgrab.com/api/manage?token=<token>'` returns the
full payload with owner privileges, and a POST performs any of the 48 actions. **The page redirect is
cosmetic against anyone using the API directly.**

⚠️ **The native app is a second bypass of the page gate** — `proxy.ts:234`: a request whose UA contains
`HatchGrabNativeApp` skips the session check entirely and defers to client-side auth.

## A3. Does a token reach customer personal data? **Yes.**

`app/api/dashboard/route.ts:251-260` — the orders read is `.select('*')`, twice:

```
  251:      .from('orders')
  252-      .select('*')
  259:      .from('orders')
  260-      .select('*')
```

**There is no order-level redaction.** The `TRUCK_REDACT` / `SECRETISH` scrubbing at `:41-61` applies to
the **`trucks` row only** — `publicTruckFields(row)` is called on the truck, not on orders.

The PII columns are written at `app/api/orders/submit/route.ts:1000-1002` — `customer_name`,
`customer_email`, `customer_phone` — and rendered by the dashboard client at
`app/dashboard/[token]/page.tsx:2174` and `components/dashboard/AddOrderPanel.tsx:1242`.

🔴 **So a token yields: every customer's name, email address and phone number, their full order history,
what they ordered, what they paid, and any notes they typed** — for as long as that truck has been
trading.

⚠️ **What the token does NOT expose about the truck itself** — `app/api/dashboard/route.ts:41-52`
redacts `dashboard_token`, `dashboard_pin`, `kds_pin`, `messenger_page_token`, `whatsapp_sender`,
`sheet_id`, plus anything matching `/(^|_)(token|secret|password|credential|pin|key)(_|$)/i`. **This is
the one place the codebase already treats the token as a credential.**

## A4. Do tokens expire, rotate, or get revoked? **No, to all three.**

**`grep -rn "dashboard_token" app lib | grep -iE "update|set |insert"` returns ONE line, and it is a
comment.** The only writer is the INSERT in `lib/provision-truck.ts:309`:

```ts
    // Existing convention, kept for support-desk readability: `gusto-3d87b5d15a6f`.
    dashboard_token: `${suffixed.slice(0, 24)}-${randomBytes(6).toString('hex')}`,
```

🔴 **There is no expiry column, no rotation endpoint, no revoke action, and no code anywhere that
changes a token after creation.** A token is valid from provisioning until someone changes it by hand.

⚠️ **The format is also a weakness in its own right.** `<slug-prefix>-<6 random bytes>` — the first
segment is the truck's public slug and **only 48 bits are random**. `realthaifood-23f80551121b` shows
the shape exactly. The comment says the readable prefix exists "for support-desk readability".

---

# B. EVERY CHANNEL THE TOKEN LEAKS THROUGH

Worked outward from the token, as instructed.

## B5. Every place the token appears in a URL

| # | Channel | Source |
|---|---|---|
| 1 | 🔴 **The browser address bar**, on every dashboard/manage/KDS page view | `/dashboard/<token>`, `/manage/<token>`, `/dashboard/<token>/kds` |
| 2 | 🔴 **Server-side redirects** | `app/dashboard/page.tsx:43,80` — `redirect(\`/dashboard/${truck.dashboard_token}\`)` |
| 3 | 🔴 **AN EMAIL, to the truck's contact address** | `app/api/inbound-schedule/route.ts:275` |
| 4 | **Admin console links** | `app/admin/page.tsx:1060,1064` — `linkBtn(\`/dashboard/${r.op.dashboard_token}\`…)` |
| 5 | **In-app links** | `UserMenu.tsx:209`, `dashboard:3336`, `OperatorDeviceConfig.tsx:148`, `kds:1828` |
| 6 | **Demo redirects** | `app/api/demo/route.ts:150`, `app/api/demo/return/route.ts:45,51` |
| 7 | **API responses** | `/api/native/my-trucks` and `/api/native/switch-truck` return `dashboard_token` to the app |

**#3 is the worst of the non-analytics channels** — `app/api/inbound-schedule/route.ts:275` and the
email body:

```ts
        const manageUrl = `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/manage/${truck.dashboard_token}?tab=schedule`
```
```
              <a href="${manageUrl}" style="background:#ea580c;…">
…
          text: `Hi there,\n\nWe found ${n} new event${…} on your schedule that need your approval:\n\n${eventListText}\n\nReview them at: ${manageUrl}\n\n…`,
```

🔴 **A live credential is sent in plaintext email, in both the HTML and text parts, to
`truck.contact_email`.** It then lives in that mailbox, in Brevo's sending logs, and in every mail
server between.

✅ **What does NOT carry the token — checked and clean:** the **QR code and copy-link** encode
`${NEXT_PUBLIC_HATCHGRAB_URL}/trucks/${truck.slug}/order` (`app/manage/[token]/page.tsx:8729`) — the
**customer** URL, keyed on the public slug. **Printed posters and QR codes are not a token channel.**
No WhatsApp template carries one either.

## B6. What each third-party script on a token-bearing route receives

| Script | Loads on a token-bearing route? | What it receives |
|---|---|---|
| **PostHog** | 🔴 **YES — every route** (root layout) | 🔴 **`$current_url` on every `$pageview` and `$autocapture` event — i.e. the token** |
| **Stripe Connect JS** | 🔴 **YES** — `/manage/<token>` → Payments | ⚠️ loads from `connect-js.stripe.com`; **CANNOT DETERMINE** what it reads from `location` |
| **Stripe.js** | ❌ No | injected only on `/trucks/<slug>/order` (`order/page.tsx:142`), which carries a **slug**, not a token |
| Tally, OpenStreetMap tiles | ❌ No | public/customer pages only |

**PostHog's initialisation, complete** — `app/providers.tsx:5-10`:

```ts
if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only',
  })
}
```

🔴 **URL SCRUBBING: NONE EXISTS IN CODE.** A grep for
`before_send|beforeSend|sanitize_properties|property_denylist|mask` filtered to PostHog returns **zero
hits**. Three of those options are exactly what would strip a path segment, and none is set.

**Stripe Connect** — `components/manage/PaymentsTab.tsx:24,247`:

```ts
import { loadConnectAndInitialize } from '@stripe/connect-js'
…
    return loadConnectAndInitialize({
```

which fetches `https://connect-js.stripe.com/v1.0/connect.js` (read from
`node_modules/@stripe/connect-js/dist/connect.esm.js`). ⚠️ **Whether it transmits `location.href` is
Stripe's implementation and I did not read it — CANNOT DETERMINE.**

## B7. Referer leakage to third-party origins

🔴 **NO REFERRER POLICY IS SET ANYWHERE.** A case-insensitive grep for
`referrer-policy|referrerPolicy|referrerpolicy` across every `.ts`, `.tsx` and `.json` outside
`node_modules` returns **ZERO HITS** — nothing in `next.config.ts`, nothing in `vercel.json`, nothing in
`proxy.ts`, and no `<meta name="referrer">` in the root layout.

**So the browser default applies (`strict-origin-when-cross-origin` in modern browsers), which sends only
the ORIGIN cross-site — not the path.** ⚠️ **INFERRED**, browser behaviour, not read from this repo.
**That is the one thing limiting this class of leak, and it is a default nobody chose.**

⚠️ **It does NOT protect same-origin subresource requests.** PostHog's own capture calls transmit
`$current_url` **as an event property in the request body** — a referrer policy would not touch it, which
is why B6 is the live channel and B7 is not.

**Outbound links on token-bearing pages:** `PaymentsTab` opens Stripe-hosted flows, and the manage page
links to the operator's own `website`. Both cross-origin, both limited by the browser default above.

## B8. Do tokens appear in server logs?

🔴 **YES — unavoidably, by virtue of being in the URL path.**

**Vercel logs every request line including the path.** `/dashboard/realthaifood-23f80551121b` is a
request path, so it is in the platform's request log, its analytics, and any log drain. **Nothing in
this repository can change that while the token is a path segment.**

✅ **Application code does NOT log tokens deliberately** — a grep of `console.*` in
`/api/manage`, `/api/dashboard` and `/api/dashboard/action` for lines mentioning `token` returns
**zero hits**.

⚠️ **But error paths can still surface one.** `/api/manage` GET and POST return
`{ error: 'Invalid token' }` without echoing the value — good — while `?token=` on GET requests puts it
in the query string of every `/api/manage` call, which is logged the same way.

## B9. Is the token in browser storage?

🔴 **YES — as ~20 localStorage KEY NAMES**, on the dashboard and KDS:

```
  app/dashboard/[token]/kds/page.tsx:203   localStorage.getItem(`hg_kds_keepawake_${token}`)
  app/dashboard/[token]/kds/page.tsx:235   localStorage.getItem(`hg_kds_view_${token}`)
  app/dashboard/[token]/kds/page.tsx:318   localStorage.getItem(`hg_kds_sound_${token}`)
  app/dashboard/[token]/page.tsx:573       localStorage.getItem(`hg_keepawake_${token}`)
  app/dashboard/[token]/page.tsx:1312      localStorage.setItem(`hg_sound_${token}`, …)
  lib/walkthrough.ts:34,43                 walkthroughKey(token)
  lib/sound-prefs.ts:53,71                 soundConfigKey(token)
```

**The token is the key, not the value — equally readable to anything on the origin.** ⚠️ **PostHog
persists to the same store** (`localStorage+cookie`, its default), so both live in the same origin's
localStorage.

✅ **NOT in `@capacitor/preferences`.** `lib/native/preferencesStorage.ts` backs the **Supabase auth
session** under `storageKey: 'hg-native-auth'` (`lib/native/session.ts:24`). A grep for
`dashboard_token|dashboardToken` across `lib/native` and `components/native` returns only
`lib/native/trucks.ts:5,19,31` — an **in-memory** type and return value. **The native app holds the token
in memory and in the WebView URL, and does not persist it.**

✅ **NOT in a cookie set by this app.** No `document.cookie` write carries it.

---

# C. THE POSTHOG CONFIGURATION

## C10. The init, what it wraps, and what would have to change

**The init is quoted in B6.** It wraps **every route in the application**, because it is mounted in the
**root layout** — `app/layout.tsx:79-89`:

```jsx
    <html lang="en">
      <body className={…}>
        <CSPostHogProvider>
          {children}
        </CSPostHogProvider>
      </body>
    </html>
```

**No route escapes it.** The four nested layouts (`dashboard/[token]/kds`, `kds/[kds_token]`, `(legal)`,
`landing`) declare **zero** `<html>`, `<body>` or PostHog references — they nest inside the root.

**And the `init()` call is at MODULE SCOPE, not inside the component** (`providers.tsx:5-10`) — it runs
**on import**, guarded only by `typeof window !== 'undefined'`. Rendering the provider conditionally
would therefore **not** be enough on its own: the module executes when it is imported.

### 🔴 DESCRIBED, NOT IMPLEMENTED — what a code fix would have to do

Any of these would work; all are **deploy-blocked** and none is written here:

1. **Move `init()` out of module scope** into an effect that reads the pathname, and skip it on
   `/dashboard`, `/manage`, `/admin`, `/kds`, `/app`, `/login`. ⚠️ **Must also handle client-side
   navigation** — the operator app soft-navigates between `/dashboard/<token>` and `/manage/<token>`, so
   a mount-time check alone would miss the second.
2. **Add a `before_send` hook** that rewrites `$current_url` / `$pathname` / `$host`, redacting the token
   segment. ⚠️ **Must cover every URL-bearing property**, not just `$current_url` — autocapture also
   emits `$pathname`, and `$referrer`/`$initial_current_url` carry it too.
3. **Set `autocapture: false` and `capture_pageview: false`** and capture explicitly. ⚠️ **The nine
   existing `capture()` calls are all customer-side**, so this would lose nothing operator-side — but it
   changes public-page analytics, which is a product decision.
4. **Stop putting the credential in the path** — the actual fix, and the largest.

## C11. Can PostHog scrub server-side, without a deploy?

⚠️ **CANNOT DETERMINE from this repository — PostHog's project settings are not in it, and I did not log
in to check.** What I can state precisely is **what the repo does and does not do**, so you know what a
project-side control would be layering onto:

- **The client sends `$current_url` unmodified.** No `before_send`, no `sanitize_properties`, no
  `property_denylist` is configured in code (grep in B6).
- **Therefore anything that strips the token must act after ingest** — a project-level property filter,
  a transformation, or a redaction rule, **if the plan and version offer one.**

🔴 **Two things worth knowing before treating a project-side setting as the fix:**

1. **It would not be retroactive.** The events you have already observed —
   `realthaifood-23f80551121b`, `test-abc123def456`, repeatedly, across `$autocapture` and `$pageview` —
   **are already stored**. A filter changes what arrives next, not what is there.
2. **The token is also in `$referrer`, `$initial_current_url`, `$initial_referrer` and any session
   recording**, if recording is enabled. **Whether recording is on is a project setting I cannot see.**
   A rule targeting `$current_url` alone would leave the others.

---

# D. BLAST RADIUS

## D12. The SQL to run — I did not query the database

```sql
-- Every truck with a dashboard_token, and whether it is trading.
-- READ-ONLY. Run by hand.
SELECT t.id,
       t.name,
       t.slug,
       t.plan,
       t.active,
       t.excluded,
       t.show_on_hg,
       t.order_link_hg,
       t.is_customer,
       t.trial_expires_at,
       t.operator_id IS NOT NULL          AS has_login,
       left(t.dashboard_token, 12) || '…' AS token_prefix,   -- prefix only; do not paste full tokens around
       (SELECT count(*) FROM public.truck_events e
         WHERE e.truck_id = t.id AND e.event_date >= current_date) AS upcoming_events,
       (SELECT count(*) FROM public.orders o WHERE o.truck_id = t.id) AS orders_all_time,
       (SELECT max(o.created_at) FROM public.orders o WHERE o.truck_id = t.id) AS last_order_at
  FROM public.trucks t
 ORDER BY (t.active AND NOT t.excluded) DESC, last_order_at DESC NULLS LAST, t.id;
```

**Read "live/trading" as: `active = true` AND `excluded = false` AND `orders_all_time > 0` — with
`last_order_at` telling you whether it is trading *now*.** ⚠️ **The `demo-` prefixed rows are throwaway
prospect sandboxes and can be discounted.**

⚠️ **A second query worth running, because it bounds the exposure window** — the tokens you have already
seen in PostHog are the ones definitively leaked, but **every truck whose operator has ever opened a
dashboard is in the same position**:

```sql
-- Which trucks have a device bound (i.e. someone has actually used the console)?
SELECT t.id, t.name, count(vd.id) AS devices, max(vd.last_seen) AS last_seen
  FROM public.trucks t
  LEFT JOIN public.van_devices vd ON vd.truck_id = t.id
 GROUP BY t.id, t.name
 ORDER BY last_seen DESC NULLS LAST;
```

## D13. What an attacker with a trading truck's token could do, worst first

| # | Action | Route | Why it is this severe |
|---|---|---|---|
| 1 | 🔴 **Issue refunds against real card payments** | `/api/dashboard/action` `cancel` with `refunded_minor` | **Direct financial loss.** Money leaves the operator's Stripe balance. |
| 2 | 🔴 **Harvest every customer's name, email and phone** | `/api/dashboard` GET, `orders.select('*')` | **A personal-data breach with notification duties.** Silent — reads leave no trace an operator sees. |
| 3 | 🔴 **Reject or cancel live orders mid-service** | `/api/dashboard/action` `reject` / `cancel` | Customers standing at the hatch are told their food is cancelled; **confirmation emails fire automatically.** |
| 4 | 🔴 **Rewrite prices** | `/api/manage` `upsert_item` | Set a £12 pizza to £0.01 and order at will, or to £999 to kill trade. Takes effect on the live customer page immediately. |
| 5 | 🔴 **Delete the menu or the events** | `bulk_delete_items`, `delete_category`, `delete_event` | **A truck arrives at a pitch with no menu and no event.** |
| 6 | ⚠️ **Schedule account deletion** | `/api/account/request-deletion` | Token is one accepted credential on that route. |
| 7 | ⚠️ **Invite themselves as a team member** | `/api/manage` `invite_team_member` | 🔴 **Converts a leaked URL into a durable login that survives token rotation.** |
| 8 | ⚠️ **Touch Stripe Connect** | `/api/stripe/connect` | ⚠️ The route has an admin allow-list on some actions; **I did not enumerate which actions a token alone can reach — CANNOT DETERMINE without a closer read.** |
| 9 | ⚠️ **Change settings and contact details** | `update_truck`, `update_settings` | Redirect confirmation emails; change the WhatsApp number. |
| 10 | ⚠️ **Bind a device and receive push notifications** | `/api/native/bind-device` | Live order alerts for that truck. |

🔴 **#7 is the one that changes the remediation.** Everything else is closed by rotating the token.
**A `truck_users` row is not** — it is keyed on `auth_user_id`, and `resolvePermittedTrucks` grants
access from it independently of any token.

---

# E. ROTATION

## E14. What breaks if a `dashboard_token` changes

| Thing | Breaks? | Where it lives |
|---|---|---|
| **Saved bookmarks / open browser tabs** | 🔴 **YES** | the operator's own browser |
| **The schedule-approval emails already sent** | 🔴 **YES** | `app/api/inbound-schedule/route.ts:275` — every past one dead-links |
| **localStorage preferences** | ⚠️ **Silently reset** | ~20 keys are `…_${token}`-suffixed (B9). Keep-awake, sound, KDS layout, walkthrough state all revert to defaults |
| **The native app's current screen** | ⚠️ **Until relaunch** | `lib/native/trucks.ts` holds it **in memory only**; `/api/native/my-trucks` re-reads it from the DB on next launch |
| ✅ **QR codes and printed posters** | ✅ **NO** | encode `/trucks/${truck.slug}/order` (`manage:8729`) — **slug, not token** |
| ✅ **WhatsApp messages** | ✅ **NO** | no template carries a dashboard link |
| ✅ **Customer order links** | ✅ **NO** | slug-based |
| ✅ **The native session** | ✅ **NO** | Supabase session under `hg-native-auth` in Preferences; **independent of the token** |
| ✅ **KDS token** | ✅ **NO** | `truck_vans.kds_token` is a separate credential |

🔴 **The headline: rotation costs the operator their bookmarks and their local UI preferences. It does
NOT cost them their QR codes, their posters, their customer links, or their app login.** That is a much
cheaper rotation than it first looks.

⚠️ **And rotation alone is not sufficient** — see D13 #7. **A leaked token that was used to create a
`truck_users` row leaves an access path rotation does not touch.**

## E15. Can any code path rotate a token today? **No.**

**Established in A4:** the only writer is the INSERT in `lib/provision-truck.ts:309`. There is no
rotation endpoint, no admin action, no manage action. **Rotation is a manual `UPDATE`.**

⚠️ **One caveat, and it is a hazard rather than a feature:** `app/api/admin/route.ts:93` is an
**unallowlisted** update —

```ts
  const { error } = await supabase.from('trucks').update(updates).eq('id', truckId)
```

— destructuring `{ truckId, discoveryTruckId, ...updates }` from the body. **An admin POST carrying a
`dashboard_token` key would write it.** No UI exposes that field, so it is not a rotation *path*; it is
an unguarded write surface that happens to include the credential column.

---

## What remains unverified

1. **I ran nothing** — no parse, no typecheck, no execution, and **no database was queried**. §D is SQL
   for you, not results.
2. **PostHog's project settings are CANNOT DETERMINE** — whether session recording is on, and whether a
   server-side redaction rule is available on your plan. §C11 states what the *client* does, which is
   the half that is knowable from here.
3. **Whether Stripe Connect JS transmits `location.href`** — Stripe's code, not read.
4. **`/api/stripe/connect`'s per-action authorisation was not enumerated** (D13 #8). It has an
   admin allow-list; which actions a bare token reaches needs a closer read of that file.
5. **The browser-default referrer behaviour in B7 is INFERRED**, not read from this repo — nothing here
   sets a policy either way.
6. 🔴 **I did not check whether any `truck_users` row already exists that should not** — that is the
   D13 #7 question, and it is the one thing rotation would not fix. **It needs a database query you have
   not asked me to write.**
