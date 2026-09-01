# Deny-by-default on the operator API

**Build only.** Nothing committed, pushed or deployed. The KDS route and its token exchange are
untouched. No token rotated. `dashboard_pin` / `kds_pin` not wired. The session observer and the proxy's
refresh behaviour are untouched — all verified `git diff` clean below.

**Prompt integrity:** no span arrived garbled and no instruction contradicted another.

## Which of the three I did — plainly

| | |
|---|---|
| **Parse** | ✅ **Yes.** `ts.transpileModule` on all three changed files — **0 diagnostics each**. |
| **Typecheck** | ✅ **Yes.** `npx tsc --noEmit` — **clean**. ⚠️ It caught a real error the parse did not: see §The typecheck earned its place. |
| **Execution** | ✅ **Yes.** The real `/api/manage` GET and POST were **run**, seven caller shapes. §Proof. |

🔴 **No UI was rendered, nothing ran on a device, and no real Supabase session was used.**

---

# 🔴 THE HEADLINE: WHAT WAS ENFORCED, AND WHAT WAS NOT

**`/api/manage` is now deny-by-default. The five route families the KDS depends on are NOT, and I stopped
rather than break the kitchen screen — as the brief instructed.**

That split is clean and was not a compromise: **the KDS never calls `/api/manage`.** A grep of
`app/dashboard/[token]/kds/page.tsx` for `/api/manage` returns **0 hits**. What it calls is:

```
   11  /api/dashboard
    9  /api/events/action
    6  /api/dashboard/action
    3  /api/events/manage
    1  /api/events/affected-orders
```

🔴 **Enforcing those five would break a kitchen tablet that has never logged in — which is the entire
purpose of `kds_token`.** §7 sets out why in full. **They are untouched.**

---

# PHASE 1 — READ AND REPORT

## 1. Where the role was initialised, and every place it was narrowed

**`/api/manage` GET, `:44-71` (before):**

```ts
  let userRole: 'owner' | 'manager' | 'staff' = 'owner'
  let currentUserId: string | null = null
  let currentOperatorId: string | null = null
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (user) {
      currentUserId = user.id
      …
      const isOperator = !!(sessionOperator && truck.operator_id && sessionOperator.id === truck.operator_id)
      if (!isOperator) {
        const { data: truckUser } = await supabase
          .from('truck_users').select('role').eq('auth_user_id', user.id).eq('truck_id', truck.id).single()
        if (truckUser?.role) userRole = truckUser.role as 'owner' | 'manager' | 'staff'
      }
    }
  } catch { /* if auth check fails, default to owner */ }
```

**`/api/manage` POST, `:198-224` (before):** identical shape —
`let requestingUserRole: … = 'owner'`, narrowed only inside `if (user)`, `catch {}` silent.

🔴 **Exactly ONE narrowing site in each, and it is reachable only with a session.** `'staff'` was
therefore unreachable without one, and the `catch` comment states the intent outright: *"default to
owner"*.

**`/api/dashboard`** — `:115`, the whole check:

```ts
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) {
```

**`/api/dashboard/action`** — `:90-96`:

```ts
async function verifyToken(token: string, pin?: string) {
  const { data: truck } = await supabase
    .from('trucks').select('*').eq('dashboard_token', token).single()
  if (!truck) return null
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) return null
  return truck
}
```

🔴 **Neither has a role concept at all** — no `userRole`, no narrowing, no session. And
`dashboard_pin` is `null` on every provisioned truck (`lib/provision-truck.ts:404`, written by nothing
else), so the `&&` short-circuits and the PIN branch never fires.

## 2. How a session is resolved server-side

**WEB — cookies.** `lib/supabase/server.ts:4-23`, adapter is `cookieStore.getAll()` / `.set()`.
Used as `const { data: { user } } = await supabaseAuth.auth.getUser()`.

**NATIVE — a Bearer JWT.** The established pattern, `app/api/native/my-trucks/route.ts:12-18`:

```ts
async function userIdFromBearer(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') || ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!jwt) return null
  const { data } = await supabaseAdmin.auth.getUser(jwt)
  return data.user?.id ?? null
}
```

Client side, `lib/native/session.ts:47-50`:

```ts
export async function nativeAuthHeader(): Promise<Record<string, string>> {
  const t = await getNativeAccessToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}
```

🔴 **`/api/manage` READ NEITHER OF THE NATIVE HALVES.** It used only `createSupabaseServerClient()`
(`:51`, `:202`) — cookies — and the native app has no cookie. **Its Manage screen worked ONLY because of
the `'owner'` default this task inverts.** That is blocker #1 in §7.

## 3 & 4. Every route authenticating on `dashboard_token`, what it permits, and whether it resolves a session

Worked outward from all 64 API routes. **29 read a token; 13 resolve no session whatsoever.**

| Route | Permits | Session today? |
|---|---|---|
| **`/api/manage` GET** | the whole management payload | ⚠️ **read, but only to NARROW** |
| **`/api/manage` POST** | 48 actions incl. all menu/price/settings/team writes | ⚠️ **read, but only to NARROW** |
| **`/api/dashboard`** | every order **with full customer PII**, settings, events, stock | ❌ **none** |
| **`/api/dashboard/action`** | 🔴 **refunds**, cancel, reject, mark-paid, manual orders, stock | ❌ **none** |
| `/api/events/action` · `manage` · `affected-orders` | event create/confirm/cancel + affected orders | ❌ **none** |
| `/api/manage/process-menu` · `process-allergens` · `process-schedule` · `verify-schedule-url` · `whatsapp-preview` | menu writes, AI spend, scraping | ❌ **none** |
| `/api/heartbeat` | van online state | ❌ none |
| `/api/demo/restart` · `return` · `save-email` | demo lifecycle | ❌ none |
| `/api/stripe/connect`, `/api/account/request-deletion`, `/api/setup`, `/api/manage/commit-menu`, `/api/native/*`, `/api/admin/*` | various | ✅ **enforced** |

Measured directly:

```
  dashboard/route.ts                         session refs: 1   (a comment)
  dashboard/action/route.ts                  session refs: 0
  events/action/route.ts                     session refs: 0
  events/manage/route.ts                     session refs: 0
  events/affected-orders/route.ts            session refs: 0
```

## 5. The existing role checks and the 24 blocked actions

`app/api/manage/route.ts:241-252` — **unchanged by this task**:

```ts
  const staffBlockedActions = [
    'upsert_event', 'upsert_item', 'upsert_category', 'delete_item', 'delete_category', 'bulk_delete_items',
    'upsert_subcategory', 'delete_subcategory',
    'update_truck', 'update_settings', 'add_van', 'rename_van', 'delete_van',
    'invite_team_member', 'remove_team_member', 'upsert_bundle', 'delete_bundle',
    'upsert_modifier_group', 'delete_modifier_group', 'upsert_modifier_option', 'delete_modifier_option',
    'set_item_modifier_group', 'set_item_modifier_groups_bulk', 'set_item_group_excluded_options', 'set_item_preorder_bulk',
    'upsert_upsell_rule', 'delete_upsell_rule',
  ]
  if (staffBlockedActions.includes(action) && requestingUserRole === 'staff') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
```

Plus `:236` `canEditAllergens = requestingUserRole === 'owner' || requestingIsAdmin`, and the
manager gates at `:925`, `:1080`, `:1083`, `:1258`.

## 6. How a caller maps to permitted trucks

The canonical resolver, `app/api/native/my-trucks/route.ts:42-60`: `operators.is_admin` → every active
non-demo truck; else `trucks.operator_id === operators.id` (ownership) plus any `truck_users` row
(membership). ⚠️ **`app/dashboard/page.tsx:25-50` re-implements the same question** — two
implementations, a drift risk this task does not close.

## 7. 🔴 WHAT BREAKS IF EACH ROUTE REQUIRES A SESSION

**Three blockers. One is fatal to the KDS; two were fixable and I fixed them.**

### 🔴 BLOCKER 1 — THE KDS. FATAL. This is why the five route families are untouched.

The KDS now renders at `/kds/<kds_token>`. Its callers:

| Caller | Has a session? |
|---|---|
| `app/dashboard/page.tsx:75` — staff web router `redirect(\`/kds/${kdsToken}\`)` | ✅ yes |
| `app/dashboard/[token]/page.tsx:1404` — Open KDS `window.open` | ✅ yes (same browser) |
| 🔴 **A copied KDS link pasted into a kitchen tablet that has never logged in** | ❌ **NO** |

That third case is not an edge case — it is what `kds_token` exists for, and Manage has a button that
produces exactly that URL (`app/manage/[token]/page.tsx:8920`).

🔴 **So enforcing `/api/dashboard`, `/api/dashboard/action`, `/api/events/action`, `/api/events/manage`
or `/api/events/affected-orders` would take a kitchen screen offline mid-service. The brief says to say
so and stop rather than break it, and that is what I did.** ⚠️ Those five also have **no session code at
all** — enforcing them is building machinery, not inverting a default, which is outside this brief too.

### 🔴 BLOCKER 2 — THE NATIVE MANAGE SCREEN. Fixable, and fixed.

`app/manage/[token]/page.tsx:297` sent **no headers**:

```ts
      const res = await fetch(`/api/manage?token=${token}`)
```

and `/api/manage` read **no Bearer**. So in the app: no cookie, no Bearer, `user` null, role defaults to
`'owner'` — **the native Manage screen depended on the exact defect being removed.** Inverting without
fixing this would have signed every native operator out of Manage.

### 🔴 BLOCKER 3 — FOUR `/api/manage` CALLS FROM THE DASHBOARD. Fixable, and fixed.

`app/dashboard/[token]/page.tsx:1244` (`get_vans`), `:1929` and `:1936` (`update_van_settings` —
kitchen capacity and window, **changed mid-service**), `:1960` (`get_vans`). None sent an auth header.

⚠️ **`components/DemoGetStarted.tsx:574,595,603` also calls `/api/manage` with no session** — a prospect
has no account at all. **Covered by the demo carve-out**, which is why the carve-out is not optional.

---

# PHASE 2 — WHAT WAS BUILT

## The inversion — before and after

**GET, before:**
```ts
  let userRole: 'owner' | 'manager' | 'staff' = 'owner'
  …
  } catch { /* if auth check fails, default to owner */ }
```
**GET, after:**
```ts
  // 🔴 DENY BY DEFAULT. Was: `let userRole = 'owner'` narrowed only on a resolved session, so no
  // session meant owner. Now the role is GRANTED by resolveTruckAccess or the request is refused.
  const access = await resolveTruckAccess(req, truck)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const userRole = access.role
```

**POST, before:** `let requestingUserRole: 'owner' | 'manager' | 'staff' = 'owner'` … `} catch {}`
**POST, after:** the same three lines as GET. **Both are now `const`** — the role cannot be reassigned
downstream, which is what made the old default reachable.

## Per-truck authorisation — the one resolver

```ts
async function resolveTruckAccess(req: NextRequest, truck: { id: string; operator_id: string | null }): Promise<TruckAccess> {
  // ── The carve-out. Narrow, explicit, and first so the reasoning is impossible to miss.
  if (isDemoIdentifier(truck.id)) {
    return { ok: true, role: 'owner', userId: null, operatorId: null, via: 'demo' }
  }

  const userId = await resolveCallerId(req)
  // 🔴 THE INVERSION. No caller ⇒ no access. This is the line the whole workstream exists to add.
  if (!userId) {
    return { ok: false, status: 401, error: 'Sign in required' }
  }

  const { data: op } = await supabase
    .from('operators').select('id, is_admin').eq('auth_user_id', userId).maybeSingle()

  if (op?.is_admin) return { ok: true, role: 'owner', userId, operatorId: op.id, via: 'admin' }

  // Owner of THIS truck. ⚠️ `truck.operator_id &&` matters: without it, two nulls compare equal and
  // every unowned truck would hand ownership to any operator who asked.
  if (op && truck.operator_id && op.id === truck.operator_id) {
    return { ok: true, role: 'owner', userId, operatorId: op.id, via: 'owner' }
  }

  const { data: truckUser } = await supabase
    .from('truck_users').select('role').eq('auth_user_id', userId).eq('truck_id', truck.id).maybeSingle()
  if (truckUser?.role) {
    return { ok: true, role: truckUser.role as 'owner' | 'manager' | 'staff', userId, operatorId: op?.id ?? null, via: 'member' }
  }

  // 🔴 AUTHENTICATED, BUT NOT ON THIS TRUCK. A token is not a grant.
  return { ok: false, status: 403, error: 'You do not have access to this truck' }
}
```

**Both credentials, one answer:**
```ts
async function resolveCallerId(req: NextRequest): Promise<string | null> {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (user) return user.id
  } catch { /* no cookie / transient auth fault — fall through to the Bearer */ }
  return userIdFromBearer(req)
}
```

## 🔴 The demo carve-out — WHICH RULE I IMPLEMENTED

**I implemented the TRUCK-ID-PREFIX rule, `isDemoIdentifier(truck.id)` → `startsWith('demo-')`. NOT
`operator_id IS NULL`.** Quoted from the source:

```ts
 * 🔴 THE DEMO CARVE-OUT IS KEYED ON THE TRUCK ID PREFIX, NOT ON `operator_id IS NULL`.
 * A demo truck has no owner BY CONSTRUCTION — lib/provision-truck.ts writes `operator_id: null`, and a
 * prospect works one with no account at all, so there is no session to resolve and never will be.
 * ⚠️ THE `operator_id IS NULL` SHAPE WAS REJECTED DELIBERATELY: it would silently re-open this hole for
 * any REAL truck that ends up unowned — and an unowned real truck is the normal state immediately after
 * provisioning, before /api/admin/create-operator runs. A rule that grants owner to "whoever asks" the
 * moment a column is null is the same defect wearing a different condition.
 * The prefix rule is the one lib/demo.ts defines and the demo-cleanup cron already enforces before it
 * will delete anything (`isDemoIdentifier` → `startsWith('demo-')`), and assertReservedPrefix() in
 * provision-truck guarantees no operator truck can ever carry it. Same rule, same source, three places.
 */
```

**It is in ONE place** — first branch of `resolveTruckAccess`, serving both GET and POST.

## The stale "KNOWN-WEAK" note, struck

`:228-229` said *"KNOWN-WEAK: token-only access resolves to requestingUserRole='owner' (no session) → it
passes this gate."* Replaced with a strike recording that it no longer does, and that `auth_method` now
reads `'token'` **only** for the demo carve-out — so the audit trail still names exactly which rows were
written without an authenticated person behind them.

## ⚠️ SCOPE EXTENSION, DECLARED

**The brief named the route. Enforcing it without touching six client call sites would have broken the
native app and the dashboard's van controls** — the same class of harm as breaking the KDS. So:

| File | Change | Why unavoidable |
|---|---|---|
| `app/api/manage/route.ts` | the inversion, the resolver, the Bearer reader | the named work |
| `app/manage/[token]/page.tsx` | `nativeAuthHeader()` on 2 fetches | blocker 2 |
| `app/dashboard/[token]/page.tsx` | `nativeAuthHeader()` on 4 fetches | blocker 3 |

**Nothing else was touched. If you want those two client files left alone, the enforcement must not ship
— they are a matched pair.**

## The typecheck earned its place

🔴 **`tsc` caught a real error the parse did not:**

```
app/dashboard/[token]/page.tsx(1244,86): error TS1308: 'await' expressions are only allowed within async functions and at the top levels of modules.
```

`:1244` sits in a **synchronous `useEffect` callback**, which cannot be `async` without changing its
cleanup contract. Rewritten as a promise chain:

```ts
    nativeAuthHeader()
      .then(h=>fetch('/api/manage',{method:'POST',headers:{'Content-Type':'application/json',...h},body:JSON.stringify({token,action:'get_vans'})}))
      .then(r=>r.json()).then(d=>{
```

**Both parse and typecheck are clean after the fix.** This is the concrete instance of the rule that a
parse is not a typecheck.

---

# PROOF BY EXECUTION

The **real `/api/manage`**, transpiled from disk and run in a `vm`, with the cookie and Bearer paths
stubbed independently so each caller shape is seen exactly as the route will see it. The POST case
sends `update_settings` — one of the 24 staff-blocked actions — so the role gate is exercised too.

```
======================================================================================================================
/api/manage — REAL ROUTE, EXECUTED
======================================================================================================================
caller                                    GET     role      POST        expected    verdict
----------------------------------------------------------------------------------------------------------------------
session WITH a role on this truck (owner) 200     owner     200         200         PASS
session WITH a role (staff)               200     staff     403         200         PASS
session, NO role on this truck            403     —         403         403         PASS
NO session at all                         401     —         401         401         PASS
DEMO truck, no session (carve-out)        200     owner     200         200         PASS
NATIVE bearer JWT (manager)               200     manager   200         200         PASS
platform admin, no role row               200     owner     200         200         PASS

  POST of a staff-BLOCKED action (update_settings):
    session WITH a role on this truck (owner)  → 200
    session WITH a role (staff)                → 403  "Insufficient permissions"
    session, NO role on this truck             → 403  "You do not have access to this truck"
    NO session at all                          → 401  "Sign in required"
    DEMO truck, no session (carve-out)         → 200
    NATIVE bearer JWT (manager)                → 200
    platform admin, no role row                → 200

  7/7 pass
```

🔴 **Row 2 is the one that proves the role system now runs:** a staff session gets the payload (200) but
is refused the blocked action (403 *"Insufficient permissions"*) — a branch that was **unreachable**
before, because `'staff'` required a session that nothing enforced.
🔴 **Row 4 is the flaw, closed:** no session was `'owner'`; it is now **401**.
🔴 **Row 3 is "a token is not a grant":** a real, authenticated operator holding a valid token for
someone else's truck gets **403**.

---

## What remains unverified

1. 🔴 **THE FIVE KDS ROUTE FAMILIES ARE STILL TOKEN-ONLY** — `/api/dashboard`,
   `/api/dashboard/action`, `/api/events/action`, `/api/events/manage`,
   `/api/events/affected-orders`. **Refunds and the customer-PII read are in that set and remain
   open.** That is the deliberate outcome of the KDS gate, not an oversight.
2. 🔴 **NOTHING RAN ON A DEVICE AND NO UI WAS RENDERED.** In particular, **that the native app's Manage
   screen still loads after the inversion is NOT proven** — it rests on `nativeAuthHeader()` returning a
   Bearer the route accepts, which was exercised in the harness but never against a real Supabase JWT.
3. **`next build` was not run.** Parse and typecheck are clean; neither is a build.
4. ⚠️ **The 401/403 responses have no client-side handling yet.** The manage page does
   `if (!res.ok) throw new Error(data.error)` — so a refused caller gets a thrown error, not a
   sign-in prompt. **Worth a follow-up before this ships.**
5. ⚠️ **The three demo trucks were not verified against the database** — I did not query it. The
   carve-out rests on the prefix rule, which `assertReservedPrefix()` guarantees, rather than on that
   count.
6. **The duplicated permitted-trucks logic** (`app/dashboard/page.tsx:25-50` vs
   `resolvePermittedTrucks`) is untouched and still two implementations of one question.
