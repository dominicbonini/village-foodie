# Operator authentication — full investigation

🔴 **NOTHING WAS CHANGED.** No auth was touched, `dashboard_pin` was not wired, no token rotated, no
route guarded. No database was queried. The only file written is this report.

**Prompt integrity:** no span arrived garbled and no instruction contradicted another.

## Which of the three I did — plainly

**None of them.** No parse, no typecheck, no execution. File reads and greps only.

⚠️ **This bounds two answers.** §B5's JWT lifetime is a **Supabase project setting**, not in this
repository — **CANNOT DETERMINE**. §C10's truck list is **SQL for you to run**, not results.

## 🔴 The codebase already knows about this flaw

Before anything else — `app/api/manage/route.ts:228-229`:

```ts
  // KNOWN-WEAK: token-only access resolves to requestingUserRole='owner' (no session) → it passes this
  // gate. That weakness is recorded HONESTLY via auth_method ('token' vs 'authenticated') on every log.
```

**This is not an unknown defect. It is a documented, accepted weakness with an audit trail already
distinguishing `'token'` from `'authenticated'` on every allergen write** (`:235`). That audit column is
the one piece of the target design that already exists.

---

# A. EVERY TOKEN-AUTHENTICATED SURFACE

Worked outward from the **29 page routes and 64 API routes**, then classified — not from a guard list.

## A1 + A2. The surfaces, their check, what they permit, and whether a session is resolved

### Pages

| Page | Check | Permits | Resolves a session? |
|---|---|---|---|
| `/dashboard/[token]` | path token → `/api/dashboard` | full console | ❌ page itself: no |
| `/dashboard/[token]/kds` | path token → `/api/dashboard` | KDS board | ❌ no |
| `/manage/[token]` | path token → `/api/manage` | full management | ❌ no |
| 🔴 **`/kds/[kds_token]`** | `kds_token` → **redirects to a `dashboard_token` URL** | **see D12 — escalation** | ❌ no |
| `/dashboard` (no token) | ✅ **session only** | resolves and redirects | ✅ **yes** |
| `/manage` (no token) | ✅ **session only** | resolves and redirects | ✅ **yes** |
| `/admin`, `/admin/whatsapp-templates` | session + `operators.is_admin` | admin console | ✅ **yes** |
| `/app` | native session | routing only | ✅ **yes** |
| `/order/[id]/manage` | order id + `?truck=` | one customer's own order | ❌ (customer surface) |

⚠️ **`proxy.ts:212-214` session-gates the `/dashboard` and `/manage` PAGES** — but `:220` puts
**`/api` on the public list**, and the native UA marker at `:234` bypasses the page gate too. **The page
redirect is not the boundary; the API is, and it has none.**

### API routes — token accepted, and whether a session gates

**29 routes read a token. Grouped by what the session actually does:**

**🔴 GROUP 1 — TOKEN ONLY. No session code at all. (13 routes)**

| Route | The check | Permits |
|---|---|---|
| **`/api/dashboard`** | `verifyToken(token, pin)` | **every order incl. full customer PII**, settings, events, stock |
| **`/api/dashboard/action`** | `verifyToken(token, pin)` | **refunds, cancel, reject, mark-paid, manual orders, stock** |
| `/api/events/action` · `/events/manage` · `/events/affected-orders` | `.eq('dashboard_token', token)` | event create/confirm/cancel + affected orders |
| `/api/heartbeat` | same | van online state |
| `/api/manage/process-menu` · `process-allergens` · `process-schedule` · `verify-schedule-url` · `whatsapp-preview` | same | menu writes, AI spend, scraping |
| `/api/demo/restart` · `demo/return` · `demo/save-email` | same | demo lifecycle |

**The shape is identical in all of them** — `app/api/manage/route.ts:24-31` is representative:

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

**One string, one equality, a service-role client.**

🔴 **The PIN in `verifyToken` is dead** — `app/api/dashboard/action/route.ts:90-96`:

```ts
async function verifyToken(token: string, pin?: string) {
  const { data: truck } = await supabase
    .from('trucks').select('*').eq('dashboard_token', token).single()
  if (!truck) return null
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) return null
  return truck
}
```

`dashboard_pin` is written `null` at `lib/provision-truck.ts:404` and **set by nothing** — a repo-wide
grep returns five hits: two guards, the redact list, and that INSERT. **The `&&` short-circuits on every
truck.**

**⚠️ GROUP 2 — SESSION RESOLVED BUT NOT ENFORCING. (2 routes, and these are the dangerous ones)**

`/api/manage` GET (`:44`) and POST (`:198`):

```ts
  let userRole: 'owner' | 'manager' | 'staff' = 'owner'
…
  } catch { /* if auth check fails, default to owner */ }
```

🔴 **The role is INITIALISED to the maximum and only ever NARROWED if a session resolves to a
`truck_users` row.** No session ⇒ owner. The session is used to *reduce* privilege, never to grant it.
**Deny-by-default is inverted here.**

⚠️ **The `staffBlockedActions` list at `:241-252` is therefore unreachable for a token-only caller** —
it only fires when `requestingUserRole === 'staff'`, which requires a resolved session.

**✅ GROUP 3 — SESSION ENFORCED. (7 routes)**

`/api/admin/*` (`verifyAdmin`), `/api/native/my-trucks`, `/api/native/switch-truck` (Bearer +
`permittedTruckIds`), `/api/stripe/connect`, `/api/account/request-deletion`, `/api/setup`,
`/api/manage/commit-menu`. ⚠️ **`/api/stripe/connect` accepts a token AND has an admin allow-list — I did
not enumerate which actions a bare token reaches. CANNOT DETERMINE.**

**GROUP 4 — not operator surfaces:** `/api/webhooks/whatsapp` (Meta), `/api/inbound-schedule` (scraper),
`/api/signup`, `/api/auth/verify-signup`, `/api/native/bind-device` (token = which truck, by design).

## A3. Native-WebView reachable vs web-only

🔴 **ALL OF THEM ARE REACHABLE FROM THE NATIVE WEBVIEW.** `capacitor.config.ts:50` sets
`allowNavigation: [CAP_SERVER_HOST]` — **hostname only, no path allow-list** — so every path on
`www.hatchgrab.com` stays in the shell.

**What the app actually navigates to:** `/app`, `/login`, `/dashboard/<token>`,
`/dashboard/<token>/kds`, `/manage/<token>`, `/admin`.

⚠️ **The native app is the ONE surface that already carries a session on shared endpoints** —
`lib/native/session.ts:47-50`:

```ts
export async function nativeAuthHeader(): Promise<Record<string, string>> {
  const t = await getNativeAccessToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}
```

**Web-only in practice:** `/kds/<kds_token>` (a printed/shared link for a kitchen screen).

---

# B. WHAT SESSION PLUMBING ALREADY EXISTS

## B4. How a session is created, stored and read

**WEB — cookies, via `@supabase/ssr`.** `lib/supabase/server.ts`, complete:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )
}
```

and `lib/supabase/client.ts` is `createBrowserClient(url, anonKey)` — cookie-backed, no options.

**NATIVE — `@capacitor/preferences`.** `lib/native/session.ts:17-28`:

```ts
export function getNativeSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'hg-native-auth', storage: preferencesAuthStorage } },
    )
  }
  return _client
}
```

**Server-side refresh happens in the proxy on every matched request** — `proxy.ts:190`:
`const { data: { user } } = await supabase.auth.getUser()`, with `:192-196` recording that
`getUser()` **rotates an expired access token** and that every redirect must carry the refreshed cookies.

## B5. 🔴 The session's actual lifetime

**What IS in source:**

| Property | Value | Source |
|---|---|---|
| Refresh tokens used? | ✅ **yes** | `autoRefreshToken: true` (native, `session.ts:24`); `@supabase/ssr` defaults on for web |
| Session persisted? | ✅ **yes** | `persistSession: true` (native); cookies (web) |
| Automatic refresh? | ✅ **yes**, client-side timer **and** server-side on every proxy-matched request | `session.ts:24`; `proxy.ts:190` |

🔴 **WHAT IS NOT IN SOURCE — AND IT IS THE NUMBER THAT DECIDES §B15:** the **JWT expiry** and the
**refresh-token lifetime / rotation / reuse-interval** are **Supabase project settings**, configured in
the dashboard. **They appear nowhere in this repository. CANNOT DETERMINE.** I did not log in to check.

**Supabase's platform defaults are a 1-hour JWT and a long-lived refresh token, but I am not going to
assert your project's values from memory — read them off Authentication → Sessions before deciding
anything in §E15.**

**What happens when a refresh FAILS — read from the code that handles it:**

- **Proxy:** `getUser()` returns `user: null` → `proxy.ts:236` → for a `/dashboard` or `/manage` **page**,
  `307 → /login`. ⚠️ **Unless the UA marker is present** (`:234`), in which case it defers.
- **Native:** `hasNativeSession()` returns false → `app/app/page.tsx:29` → `go('/login')` **on cold
  launch only**.
- 🔴 **Token-authenticated API routes: NOTHING HAPPENS.** They never look at the session, so a failed
  refresh is invisible to them. **That is precisely why the KDS keeps working today (see B8) — and
  precisely what the target design removes.**

## B6. Every path that can END a session

| # | Path | Quote |
|---|---|---|
| 1 | **Explicit sign-out (web)** | `lib/native/signOut.ts:26` — `await supabase.auth.signOut()`, then a hard nav to `/login` |
| 2 | **Explicit sign-out (native)** | `lib/native/session.ts:55` — `try { await getNativeSupabase().auth.signOut() } catch {}` |
| 3 | **Reset-password flow** | `app/reset-password/page.tsx:75` — `await createSupabaseBrowserClient().auth.signOut()` |
| 4 | **Email-verification success** | `app/verify-email/VerifyEmailSuccess.tsx:9` — `supabase.auth.signOut().then(…)` |
| 5 | **Expiry / failed refresh** | no explicit code — the session simply stops resolving (B5) |
| 6 | 🔴 **A storage clear** | web: cookies cleared. **Native: Preferences cleared — survives a WebView data clear, which localStorage does not** |
| 7 | ⚠️ **A hard navigation, historically** | `lib/native/preferencesStorage.ts:3-7` records that localStorage *"did NOT survive the hard /login → /app → dashboard navigation"* — **the defect the Preferences migration fixed** |

**Sign-out is invoked from three UI surfaces:** `components/dashboard/UserMenu.tsx:9`,
`app/manage/[token]/page.tsx:33`, `app/admin/page.tsx:12` — all via `operatorSignOut`.

## B7. 🔴 Is the localStorage migration complete? **No. There is a third auth store.**

The migration's rationale — `lib/native/preferencesStorage.ts:3-7`:

```ts
// WHY: in a WKWebView remote-URL shell, localStorage is NOT reliably durable across a hard navigation
// (/login → /app → dashboard) or a cold app-kill — the web view can hand back a fresh/empty localStorage,
// so getNativeSupabase()'s session silently vanishes → hasNativeSession() goes false → bounce to /login →
// login writes a new localStorage session that again doesn't survive → infinite login loop. @capacitor/
// preferences persists to native storage (UserDefaults on iOS), which survives navigations and cold-kills.
```

✅ **The session of record is migrated.** Native = `hg-native-auth` in Preferences; web = cookies.

🔴 **BUT `lib/supabase-browser.ts` IS A BARE `createClient` IN BROWSER CODE**, complete:

```ts
import { createClient } from '@supabase/supabase-js'

export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

**No `auth` options — so it uses the library default, which is `localStorage` under
`sb-<ref>-auth-token`.** It is imported by **the dashboard and the KDS** —
`app/dashboard/[token]/page.tsx:54` and `app/dashboard/[token]/kds/page.tsx:25` — for **Realtime
subscriptions and anon reads** (`:1182`, `:996`, `:1057`).

⚠️ **It is not the session of record and nothing authenticates against it today**, so this is not a
live bug. **But it is a third auth store on the same origin, on the two surfaces that matter most, and
an authenticated redesign that reached for the nearest browser client would land on the one backed by
the storage the manual says is unreliable in this WebView.** Worth closing before, not after.

## B8. 🔴 What happens TODAY on the KDS with no session and a token URL?

**IT WORKS COMPLETELY. That is the behaviour the fix must not regress, and it is the crux of this report.**

Traced:

1. The device loads `https://www.hatchgrab.com/dashboard/<token>/kds`.
2. `proxy.ts:212-213` marks it protected; `:236` would 307 to `/login`… **unless** the native UA marker
   is present (`:234`), which it is in the app. **On a web browser with no session it WOULD bounce.**
3. The page calls `/api/dashboard?token=…` — **`/api` is public at `proxy.ts:220`**, and the route never
   looks at a session.
4. Orders render. Actions post to `/api/dashboard/action` — token only.
5. Realtime runs on `supabaseBrowser` (anon key), **no session involved**.

🔴 **So today a KDS tablet works indefinitely with no session, no login, and no expiry — forever, on
nothing but the URL.** It cannot be logged out because it was never logged in.

**That is simultaneously the vulnerability and the property the hard constraint demands.**

---

# C. AUTHORISATION DATA

## C9. How a caller maps to permitted trucks

**Two independent grants**, and the canonical resolver is
`app/api/native/my-trucks/route.ts:42-60`:

```ts
export async function resolvePermittedTrucks(userId: string): Promise<{ isAdmin: boolean; ids: Set<string> }> {
  const ids = new Set<string>()
  const { data: op } = await supabaseAdmin.from('operators').select('id, is_admin').eq('auth_user_id', userId).maybeSingle()
  if (op?.is_admin) {
    const { data: all } = await supabaseAdmin.from('trucks').select('id').eq('active', true).order('created_at', { ascending: true })
    all?.forEach((t: { id: string }) => { if (!isDemoIdentifier(t.id)) ids.add(t.id) })
    return { isAdmin: true, ids }
  }
  if (op) {
    const { data: owned } = await supabaseAdmin.from('trucks').select('id').eq('operator_id', op.id).eq('active', true)
    owned?.forEach((t: { id: string }) => ids.add(t.id))
  }
  const { data: memberships } = await supabaseAdmin.from('truck_users').select('truck_id').eq('auth_user_id', userId)
  memberships?.forEach((m: { truck_id: string | null }) => { if (m.truck_id) ids.add(m.truck_id) })
  return { isAdmin: false, ids }
}
```

**Ownership** = `trucks.operator_id → operators.id`. **Membership** = a `truck_users` row.
**Admin** = `operators.is_admin` → every active non-demo truck.

⚠️ **The web router duplicates this logic rather than importing it** —
`app/dashboard/page.tsx:25-50` re-implements owner-then-staff resolution. **Two implementations of one
question is exactly the drift risk a redesign should collapse.**

## C10. 🔴 Does every truck have a resolvable owner? — SQL for you to run

**This is the question that decides whether an authenticated-only design locks anyone out.** I did not
query the database.

```sql
-- Trucks that NO authenticated user could reach under a deny-by-default design.
-- READ-ONLY. Run by hand.
SELECT t.id,
       t.name,
       t.active,
       t.excluded,
       t.plan,
       t.operator_id,
       (SELECT count(*) FROM public.truck_users tu WHERE tu.truck_id = t.id) AS membership_rows,
       (SELECT count(*) FROM public.orders o WHERE o.truck_id = t.id)        AS orders_all_time,
       (SELECT max(o.created_at) FROM public.orders o WHERE o.truck_id = t.id) AS last_order_at
  FROM public.trucks t
 WHERE t.operator_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.truck_users tu WHERE tu.truck_id = t.id)
 ORDER BY last_order_at DESC NULLS LAST, t.id;
```

🔴 **Every row this returns is a truck that would be BRICKED by the target design** — no owner, no
member, so no session could ever authorise it. **Each needs an operator created (`/api/admin/create-operator`
does this) BEFORE any enforcement ships.**

⚠️ **`lib/provision-truck.ts:416` writes `operator_id: null` at creation** — *"set afterwards by
/api/admin/create-operator — a separate concern"* — so **an unowned truck is the normal state
immediately after provisioning**, not an anomaly. Expect hits.

**A companion query, because it bounds the migration:**

```sql
-- Every operator account and what it can reach.
SELECT o.id, o.email, o.is_admin,
       (SELECT count(*) FROM public.trucks t WHERE t.operator_id = o.id)          AS owns,
       (SELECT count(*) FROM public.truck_users tu WHERE tu.auth_user_id = o.auth_user_id) AS member_of
  FROM public.operators o
 ORDER BY o.is_admin DESC, owns DESC;
```

## C11. The roles, and what each permits

**Three roles**, typed at `app/api/manage/route.ts:68` as `'owner' | 'manager' | 'staff'`.

| Role | Permits |
|---|---|
| **owner** | everything, including allergen writes (`:236` — `canEditAllergens = requestingUserRole === 'owner' \|\| requestingIsAdmin`) |
| **manager** | everything except inviting owners/managers (`:1083`) and some member operations (`:925`, `:1258`) |
| **staff** | 🔴 **blocked from 24 write actions** — `staffBlockedActions` at `:241-249`: all menu CRUD, `update_truck`, `update_settings`, van CRUD, team management, bundles, modifiers, upsell rules |
| **admin** | `operators.is_admin`, orthogonal — every active non-demo truck |

🔴 **AND ALL OF IT IS UNREACHABLE FOR A TOKEN-ONLY CALLER.** `:250` fires only when the role is
`'staff'`, and the role is `'owner'` unless a session narrows it. **The role system is fully built and
currently only constrains people who bothered to log in.**

---

# D. THE KDS SPECIFICALLY

## D12. How the KDS authenticates, and what `kds_token` / `kds_pin` do

**There are TWO KDS entry points and they differ.**

**(a) `/dashboard/<dashboard_token>/kds`** — the in-app KDS. Authenticates on the **dashboard_token**,
exactly as the dashboard does. Same `/api/dashboard` and `/api/dashboard/action` calls.

**(b) 🔴 `/kds/<kds_token>` — A TOKEN-EXCHANGE ENDPOINT, AND THIS IS A FINDING.**
`app/kds/[kds_token]/page.tsx`, complete:

```tsx
  const { data: van } = await supabase
    .from('truck_vans')
    .select('id, name, truck_id, active')
    .eq('kds_token', kds_token)
    .single()

  if (!van || !van.active) redirect('/login')

  const { data: truck } = await supabase
    .from('trucks')
    .select('dashboard_token, active')
    .eq('id', van.truck_id)
    .single()

  if (!truck || !truck.active) redirect('/login')

  redirect(
    `/dashboard/${truck.dashboard_token}/kds?van_id=${van.id}&van_name=${encodeURIComponent(van.name)}`
  )
```

🔴 **A `kds_token` — a van-scoped credential meant for a kitchen screen, copyable from Manage as
`https://www.hatchgrab.com/kds/<kds_token>` (`app/manage/[token]/page.tsx:8920`) — REDIRECTS TO A URL
CONTAINING THE TRUCK'S FULL `dashboard_token`.**

**Consequences, all of which follow from the redirect:**
1. **Privilege escalation by design.** Anyone with the KDS link holds the owner credential one hop later.
2. **The `dashboard_token` lands in the address bar**, and therefore in PostHog (`$current_url`) and in
   Vercel's request logs — see `docs/token-exposure-investigation-report.md`.
3. **`kds_token` cannot be rotated independently of the harm** — rotating it does not un-leak the
   dashboard_token it already exchanged for.

**`kds_pin`:** 🔴 **it exists on the `trucks` table and is referenced NOWHERE in application code.** It
appears only in the redaction list, `app/api/dashboard/route.ts:45`:

```ts
  'kds_pin',              // auth secret (exists on the table; unreferenced anywhere in this repo)
```

**So `kds_pin` does nothing. Like `dashboard_pin`, it is an unwired credential column.**

## D13. 🔴 What would break if the KDS required a session

**This is the surface most at risk, and the honest answer is: quite a lot, in the worst possible
conditions.**

| Risk | Why the KDS specifically |
|---|---|
| 🔴 **A mid-service bounce to `/login`** | The KDS is a **wall-mounted screen with a queue of orders**. A 307 to `/login` during service is the failure the hard constraint forbids outright. |
| 🔴 **Nobody is there to log in** | The screen may be unattended, greasy-handed, or across the kitchen. A re-auth prompt is not answerable in the moment. |
| 🔴 **The device sleeps** | `lib/native/keepAwake.ts:163-173` releases the wake lock on background and reacquires on foreground. **A long sleep is exactly when a refresh timer misses its window.** |
| 🔴 **Shared/unattended screens have no "who"** | The target design asks *who is the caller*. A kitchen screen's honest answer is *"the kitchen"* — **not an operator identity.** `/kds/<kds_token>` exists precisely because a van screen is not a person. |
| ⚠️ **Offline** | The outbox (`lib/native/outbox.ts`) replays queued ops on reconnect. **A session that expired while offline would fail every replay at once**, with a queue of real orders behind it. |
| ⚠️ **The web KDS has no native session at all** | `/kds/<kds_token>` on a browser-based screen has no Preferences store and no app. It would need a cookie session, i.e. a login on that screen. |

🔴 **STATED PLAINLY: the KDS is the one surface where "every operator surface requires an authenticated
session" collides head-on with "an operator must never be logged out except by choosing to."** A design
that treats a shared kitchen display as a *person* will either log it out or force a permanent session —
and a permanent session on an unattended screen is a credential with different clothes.

---

# E. THE GAP

## E14. What must change, route by route

| Route | Change needed | Plumbing present? |
|---|---|---|
| **`/api/manage` GET + POST** | 🔴 **Invert the default**: `requestingUserRole` must start as *no access* and be *granted* by a resolved session, not start at `'owner'` and be narrowed | ✅ **Present** — the session read, the `operators`/`truck_users` lookups and the three-role gates all exist. **This is a default-value inversion plus a deny return, not new machinery.** |
| **`/api/dashboard`** | Add session resolution; check the caller is permitted for the token's truck | ⚠️ **Partly** — `resolvePermittedTrucks` exists in `my-trucks` and is **exported**; the route imports nothing today |
| **`/api/dashboard/action`** | Same, and 🔴 **refunds/cancels should require owner or manager**, not merely "permitted" | ⚠️ same |
| **`/api/events/action` · `manage` · `affected-orders`** | Same pattern | ⚠️ same |
| **`/api/manage/process-*`, `verify-schedule-url`, `whatsapp-preview`** | Same pattern; these also spend money (AI, scraping) | ⚠️ same |
| **`/api/heartbeat`** | ⚠️ **Judgement call** — a van heartbeat is machine-to-machine. Session-gating it may be wrong | — |
| **`/api/native/bind-device`** | ⚠️ Token = *which truck*, by design. Its POST is already the documented shape | ✅ correct as-is |
| 🔴 **`/kds/<kds_token>`** | **Stop redirecting to a `dashboard_token` URL.** It must resolve the van without minting the owner credential into the address bar | ❌ **Must be built** |
| **`proxy.ts`** | ⚠️ **Leave it.** Edge gating is not the boundary and the brief says server-side. Note `:220` puts `/api` outside it entirely | — |

**The single highest-value change is `/api/manage`'s two default values.** Both roles are already
resolved from real data; only the fallback is wrong.

## E15. 🔴 Is "never logged out" achievable with the current configuration?

**Honestly: not as things stand, and the blocking fact is one I cannot read from this repository.**

**What is in the code's favour:**
- ✅ `autoRefreshToken: true` and `persistSession: true` (`session.ts:24`).
- ✅ **Native storage is genuinely durable** — Preferences/UserDefaults survives cold-kill and WebView
  data clears, which is *stronger* than a web cookie.
- ✅ **The server refreshes too** — `proxy.ts:190` rotates on every matched request, and `:192-206`'s
  `carrySessionCookies` exists specifically because a redirect used to throw the refreshed pair away.
- ✅ **An active kitchen tablet makes constant requests**, so a refresh window is unlikely to be missed
  while in use.

**What is against it:**
1. 🔴 **The refresh-token lifetime is a project setting I have not read. CANNOT DETERMINE.** If refresh
   tokens expire (rather than rotating indefinitely), **a session ends on a timer regardless of code** —
   and no amount of application work prevents it. **Read Authentication → Sessions before designing
   anything.**
2. 🔴 **A device that sleeps through the refresh window is the realistic failure.** Refresh happens on a
   timer and on request activity; a tablet asleep overnight does neither. `keepAwake.ts` releases on
   background by design.
3. 🔴 **There is no refresh-failure recovery path today** — the code either has a user or does not. The
   only responses in the codebase are 307 and `go('/login')`.
4. ⚠️ **The web KDS has no durable store at all** — cookies, in a WebView the manual already documents as
   unreliable for localStorage.

**What would have to change, and the trade-off in each:**

| Option | What it buys | The trade-off |
|---|---|---|
| **Lengthen the refresh-token TTL / enable indefinite rotation** (project setting, no deploy) | Sessions survive long sleeps | 🔴 **A stolen refresh token is valid for as long as you set.** You are trading one long-lived credential for another — better, because it is revocable and per-user, but not free |
| **Refresh proactively on foreground** — a `appStateChange` hook | Closes the sleep gap | Small, and the hook already exists (`lib/native/app.ts:6-19`) |
| **Never bounce; degrade instead** — on refresh failure, keep the board rendered read-only and show a non-blocking "sign in to take actions" strip | 🔴 **Satisfies the hard constraint directly** — nobody is ever logged *out* mid-service, they lose *writes* | Must be built; needs a decision about what a KDS may do unauthenticated |
| **Treat a kitchen display as a DEVICE, not a person** — a per-device credential bound in `van_devices`, revocable per device | Fits what a KDS actually is; revocable, per-van, auditable | 🔴 **Must be built.** But `van_devices` already binds a device to a truck+van, and `bind-device` already exists — **this is the closest thing to a foundation already in the repo** |

🔴 **MY HONEST READ: the constraint is achievable for the DASHBOARD and MANAGE with the current
plumbing plus a foreground-refresh hook and a degrade-don't-bounce rule. It is NOT achievable for a
shared, unattended KDS by giving it a person's session — that surface needs a device credential, not a
user session.** Forcing one design onto both is what would produce the mid-service logout.

## E16. A phased approach

| Phase | Scope | What it actually closes | Risk to the constraint |
|---|---|---|---|
| **0 — prerequisites** | Run C10's SQL; create operators for every unowned truck; fix `/kds/<kds_token>` so it stops minting a dashboard_token into the URL | 🔴 **Removes the escalation path and prevents bricking trucks** | **None** — no enforcement yet |
| **1 — observe** | Log `auth_method: 'token' \| 'authenticated'` on **every** operator route, as `/api/manage:235` already does for allergens. Change no behaviour | **Nothing yet — it tells you who would break** | **None**. 🔴 **Do this first; it is the only way to size Phase 3 honestly** |
| **2 — enforce where it is safe** | Deny-by-default on `/api/manage` **POST** (writes only) and the `process-*` routes | 🔴 **Closes price rewrites, menu deletion, settings changes, AI spend** — most of D13's severity list, minus refunds | **Low.** These are deliberate, attended actions on a laptop or phone, not mid-service taps |
| **3 — enforce reads and order actions** | `/api/manage` GET, `/api/dashboard`, `/api/dashboard/action`, `/api/events/*` | 🔴 **Closes the customer-PII harvest and refunds** | 🔴 **HIGH — this is the KDS.** Do not start until E15's degrade-don't-bounce behaviour exists |
| **4 — the KDS device model** | Per-device credential in `van_devices`; retire `kds_token` exchange; wire or drop `kds_pin` | Closes the last token surface | **Highest** — but by then it is the only one left |

⚠️ **Phase 2 alone removes the two most damaging *write* capabilities without touching the surface that
must never log out.** If only one phase ships, that is the one.

---

## What remains unverified

1. **I ran nothing** — no parse, no typecheck, no execution, and **no database was queried**. §C10 is SQL
   for you, not results.
2. 🔴 **THE JWT AND REFRESH-TOKEN LIFETIMES ARE CANNOT DETERMINE.** They are Supabase project settings,
   absent from this repository. **§E15's conclusion depends on them and should be re-read once you have
   the actual numbers.**
3. **`/api/stripe/connect`'s per-action authorisation was not enumerated** — it accepts a token *and*
   has an admin allow-list; which actions a bare token reaches needs a closer read.
4. **Nothing here was tested against a running app.** The B8 trace is read from routing code, not
   observed on a device.
5. **I did not check whether any unexpected `truck_users` row already exists** — the durable-access
   question raised in the token report, and the one thing enforcement would *not* retroactively close.
6. **No fix, guard, migration or config change was written**, as instructed.
