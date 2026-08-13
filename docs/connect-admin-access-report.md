# Platform-admin access to the Payments tab — diagnosis and build

Date: 13 August 2026
Status: DIAGNOSED, then BUILT. **Two files changed** — [app/api/stripe/connect/route.ts](app/api/stripe/connect/route.ts)
and [components/manage/PaymentsTab.tsx](components/manage/PaymentsTab.tsx). `tsc --noEmit` clean.
17 of 17 assertions pass. Neither file gained a non-ASCII character class.

No `next dev`, no `next build`, no commit, no deploy. **No migration is needed** — `operators.is_admin`
already exists and is already populated; nothing was added to any table.

`requireOwner` was not weakened for anyone. `truck_users` still grants nothing on this route. The Connect
flow's behaviour once pressed is unchanged. The walk-up section and the Billing tab were not opened.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 1. EVERY NOTION OF "ADMIN" IN THIS CODEBASE — QUOTED

There are exactly two, and they are unrelated.

### (a) PLATFORM ADMIN — `operators.is_admin`

| | |
|---|---|
| **Stored** | `operators.is_admin`, a boolean on the operator row |
| **Who can hold it** | any operator; it is set out-of-band, not self-serve |
| **Scope** | 🔴 **the whole platform** — it is not per truck |
| **Canonical check** | `verifyAdmin()` in `lib/auth/admin.ts` |

**QUOTED**, `lib/auth/admin.ts:1-4` and its body:

```ts
// Canonical admin check — the SINGLE source used by both the admin API (app/api/admin/route.ts) and the
// server-side /landing gate (app/landing/layout.tsx). Do not fork this: web resolves the operator from the
// Supabase session cookie; the native app (no cookie on fetches) passes its session as a Bearer, which is
// only consulted when a NextRequest is supplied and there's no cookie user. Authority = operators.is_admin.
export async function verifyAdmin(req?: NextRequest): Promise<boolean> {
  const supabaseAuth = await createSupabaseServerClient()
  let { data: { user } } = await supabaseAuth.auth.getUser()   // WEB (cookie) — resolves first
  … Bearer fallback for native …
  if (!user) return false
  const { data: operator } = await serviceClient
    .from('operators').select('is_admin').eq('auth_user_id', user.id).single()
  return !!operator?.is_admin
}
```

Other places the same flag is read directly (not via `verifyAdmin`): `app/dashboard/page.tsx:26-30`
(redirects admins to `/admin`), `app/api/native/my-trucks/route.ts:44-51` (`is_admin` grants all-truck
access in the native app), `app/app/page.tsx:65`.

⚠️ **The cron routes do NOT use this.** `verifyAdmin` is the console/landing gate; the cron routes
authenticate with `CRON_SECRET`. Your brief said "used by `verifyAdmin` on the cron routes" — the
function name is right, the cron attribution is not.

### (b) PER-TRUCK ROLE — `truck_users.role`

| | |
|---|---|
| **Stored** | `truck_users.role`, one of `'owner' \| 'manager' \| 'staff'` |
| **Who can hold it** | any auth user invited to a specific truck |
| **Scope** | one truck |
| **Checked** | `app/api/manage/route.ts:63-68` |

**QUOTED**, `app/api/manage/route.ts:60-68`:

```ts
const isOperator = !!(sessionOperator && truck.operator_id && sessionOperator.id === truck.operator_id)
if (!isOperator) {
  const { data: truckUser } = await supabase
    .from('truck_users').select('role').eq('auth_user_id', user.id).eq('truck_id', truck.id).single()
  if (truckUser?.role) userRole = truckUser.role as 'owner' | 'manager' | 'staff'
}
```

### 🔴 The comment that says the Connect route ignores it — QUOTED, `route.ts:75-76`

```ts
// 🔴 OWNERSHIP, not membership. `truck_users` role is deliberately NOT consulted: a 'manager' row
// would satisfy a membership test and must not reach account creation.
```

**Verified after the build: `grep "from('truck_users')"` still matches nothing in this route.**

---

## 2. WHICH DO YOU HOLD? — LIVE ROWS

**QUOTED from the database:**

```
OPERATORS — is_admin:
  contact@pizzeriagusto.co.uk        is_admin= false  id= 814efb07-…
  dbonini82@gmail.com                is_admin= true   id= d926161e-33b9-4031-b2a6-21253418538f
  dominicbonini@hotmail.com          is_admin= false  id= 1e4308fc-…
  hello@villagefoodie.co.uk          is_admin= false  id= 9f4c2d4d-…
  hello1@villagefoodie.co.uk         is_admin= false  id= 7c7d40de-…
  realthaifood@villagefoodie.co.uk   is_admin= false  id= f150ec81-…
  testtruck@villagefoodie.co.uk      is_admin= false  id= 570ec276-…
  tt4@villagefoodie.co.uk            is_admin= false  id= 8e41a930-…
```

- **`dbonini82@gmail.com` holds `is_admin = true`, and is the only operator that does.**
- 🔴 **`truck_users` is EMPTY across the entire database — 0 rows.** So you hold no per-truck role
  anywhere, and neither does anyone else. Role (b) is currently theoretical.
- ⚠️ `dbonini82@gmail.com` also **owns test-kitchen** (`operator_id = d926161e-…`). That is why that
  truck's Payments tab worked: **as its owner, not as an admin.** Admin granted nothing here until now.
- `dominicbonini@hotmail.com` — your other account — is **`is_admin = false`** and owns `test-truck-3-2`.

---

## 3. 🔴 SEEING vs PRESSING — EVERY ACTION, AND THE RECOMMENDATION

The route serves four actions. **QUOTED** (`grep -n "action ===" route.ts`).

| Action | What it does | Writes? | Admin? |
|---|---|---|---|
| **`status`** | Reads Stripe readiness (`readAccountReadiness`), then `cacheReadiness` mirrors `charges_enabled` into `operators` | a **cache mirror** of a value just read from Stripe | ✅ **YES** |
| **`requirements`** | One v1 retrieve for the "Action needed" badge. *"This one makes a single v1 retrieve and writes nothing."* | no | ✅ **YES** |
| **`create_account`** | `POST /v2/core/accounts` → a real connected account, then persists the id, verifies posture, registers payment-method domains | 🔴 **irreversible at Stripe** | ❌ **NO** |
| **`account_session`** | Mints the client secret that mounts **Stripe's own embedded onboarding form** | no DB write — but it opens the **bank details and photo ID** form | ❌ **NO** |

### Recommendation, with reasoning: **admins read, admins do not press.**

- **`create_account` — no.** The route's own comment states the stake: *"The account already exists at
  Stripe by this line and CANNOT BE DELETED."* It is created against **the operator's** email and
  country and becomes the merchant of record for their customers' money. A support action that cannot be
  undone and that enters someone else into a financial relationship is not support; it is acting as them.
- **`account_session` — no, and this one is sharper than it looks.** It is only a client secret, so it
  reads harmless. What it unlocks is the form that collects **bank account numbers and identity
  documents**. An admin who can mount it can type an operator's bank details, and there is no audit trail
  in this app that would show who did. The right answer is that support never sees that form at all.
- **`status` and `requirements` — yes.** They read state that the operator is already being shown. The
  one wrinkle is `cacheReadiness`, which writes `operators.stripe_charges_enabled` — but it writes
  **only** a value just read from Stripe, so an admin refreshing it can move that column no further than
  towards the truth. ⚠️ Stated rather than hidden: this is the one database write an admin can now
  trigger on this route, and it is idempotent against Stripe's own answer.

**Built to this shape.** The allow-list is an **allow**-list, not a deny-list, so any action added later
is owner-only until someone deliberately says otherwise.

---

## 4. WHAT AN ADMIN ACTUALLY SEES — AND WHETHER IT ACHIEVES WHAT YOU WANT

**For a truck with NO connected account** (real-thai-food and pizzeria-gusto today), an admin sees:

- the **"Not connected"** header card — title *"Not connected"*, body *"Takes about 10 minutes. You'll
  need your bank details and ID."*, chip *"Not connected"*;
- the Stripe fee line and the plan-fee pointer;
- the walk-up section, unchanged;
- and, where the button was, the new **"Viewing as platform admin"** note.

🔴 **Honest answer to your question: for an unconnected truck this achieves very little.** It confirms
"this truck has no Stripe account" — which `operators.stripe_account_id` already tells you, and which
the admin console could show without any of this. The card is the same near-empty card the operator sees.

**Where it does earn its keep is a CONNECTED truck**, and there are none yet. Then the admin sees things
that exist nowhere else in the product:

- which of the five states the account is in (`requirements` / `pending` / `ready` / `restricted` /
  `unsupported`) with the operator's exact wording;
- `chargesEnabled` reconciled **live from Stripe**, not the cached column;
- `detailsSubmitted` and `cardPaymentsStatus`;
- the "Action needed" badge, from the same `requirements` read the operator's tab uses.

That is the difference between "the column says false" and "I can see the sentence they are reading",
which is the thing you asked for. **It just will not show you anything interesting until a truck actually
connects.** ⚠️ And the embedded Stripe panels — the onboarding form and the notification banner — are
**not** shown to an admin (section 6), so "exactly what an operator sees" has one deliberate gap.

---

## 5. THE BUILD — WIDENING THE GATE WITH THE EXISTING CHECK

### What was reused — QUOTED

```ts
// ⚠️ THE CANONICAL PLATFORM-ADMIN CHECK, NOT A NEW ONE. Authority is `operators.is_admin`; the same
// function gates the admin console and the /landing preview. Its own header says "Do not fork this".
import { verifyAdmin } from '@/lib/auth/admin'
```

`req` is passed through, so the native app's Bearer path works exactly as the web's cookie path does. **No
second notion of admin was introduced and no new column, table or migration is involved.**

### The new resolver — QUOTED

```ts
async function requirePlatformAdmin(token: string, req: NextRequest): Promise<Ctx | null> {
  const { data: truck } = await supabase
    .from('trucks').select('id, operator_id, country').eq('dashboard_token', token).single()
  if (!truck) return null
  if (!truck.operator_id) return null
  if (!(await verifyAdmin(req))) return null
  return { operatorId: truck.operator_id, email: null, country: truck.country ?? null, viewer: 'platform_admin' }
}
```

### 🔴 `operatorId` IS THE TRUCK'S OPERATOR, NOT THE ADMIN'S — the subtle bug that was avoided

`requireOwner` returns `sessionOperator.id`, which is safe only because for an owner it **equals**
`truck.operator_id`. For an admin those are different rows. Had the fallback returned the admin's own id,
the route's very next statement —

```ts
const { data: operator } = await supabase.from('operators')
  .select('id, stripe_account_id, …').eq('id', ctx.operatorId).single()
```

— would have read **the admin's own Stripe account** and displayed it as the truck's, and
`cacheReadiness` would have written the truck's readiness onto the admin's row. Silently wrong data.
Asserted in verification.

### The order, and why it is load-bearing — QUOTED

```ts
const ctx = (await requireOwner(token)) ?? (await requirePlatformAdmin(token, req))
if (!ctx) {
  return NextResponse.json({ error: 'Unauthorised', code: 'NOT_PERMITTED' }, { status: 403 })
}
```

`requireOwner` runs **first and unmodified**. Its ownership condition is byte-identical — asserted by
regex in verification. Nobody who is not an owner or an `is_admin` operator gains anything.

### The action gate — QUOTED

```ts
const ADMIN_READABLE_ACTIONS = new Set(['status', 'requirements'])
…
if (ctx.viewer === 'platform_admin' && !ADMIN_READABLE_ACTIONS.has(action)) {
  console.warn(`[stripe/connect] admin READ-ONLY refusal action=${action} operator=${ctx.operatorId}`)
  return NextResponse.json(
    { error: 'Only the truck\'s owner can do this', code: 'ADMIN_READ_ONLY' },
    { status: 403 },
  )
}
```

The `status` responses gained one additive field, `viewer`, so the tab knows who is looking. Every
existing field is unchanged.

---

## 6. WHAT AN ADMIN SEES WHERE THE BUTTON WOULD BE

Two changes in `PaymentsTab.tsx`.

**(a) The button is owner-only in the markup** — not disabled, replaced:

```tsx
{state === 'not_connected' && isAdminViewer && (
  <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
    <p className="text-xs font-semibold text-slate-700">Viewing as platform admin</p>
    <p className="text-xs text-slate-500 mt-0.5">
      This truck has not connected Stripe. Only the owner can start it, from their own
      signed-in account — there is nothing to press here.
    </p>
  </div>
)}
{state === 'not_connected' && !isAdminViewer && (
  <button onClick={createAccount} disabled={creating || !!configError} …>
```

⚠️ **A sentence, not a greyed button, deliberately.** A disabled control says *"this is yours and you
cannot use it yet"*; a line of text says *"this is not yours"* — which is the true statement. It is the
same distinction the walk-up section already draws for its coming-soon row. The neutral `bg-slate-50` /
`border-slate-100` is the codebase's existing quiet grouping treatment: no amber, because nothing is
wrong.

**(b) Connect.js is not initialised for an admin** — 🔴 this one is functional, not cosmetic:

```tsx
if (isAdminViewer) return null
if (!status?.accountId || !publishableKey) return null
```

`fetchClientSecret` calls `account_session`, which the server now refuses for an admin. Without this
guard, an admin opening a **connected** truck would mount Connect.js, take a 403 inside the iframe and
see a Stripe-branded error. Not mounting is also the correct product answer: those panels are Stripe's
onboarding and account-management forms, and they belong to the operator.

---

## 7. THE MISLEADING COPY — THREE CASES, THREE MESSAGES

The component turned **every** non-200 into `configError` under one fixed headline. A 403 about who is
signed in therefore rendered as *"Card payments aren't configured yet — Unauthorised"*. Now:

| Case | Trigger | Headline | Body |
|---|---|---|---|
| **Permissions** | HTTP **403** | **"Only the truck's owner can set up payments"** | "Stripe is connected by the person whose bank account receives the money, so it has to be set up from their own signed-in account. Nothing is wrong with this truck or with HatchGrab." |
| **Configuration** | `keyMissing` — an account exists but `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is absent | "Card payments aren't configured yet" *(unchanged)* | the existing env message |
| **Reachability** | any other failure (500, network) | **"We couldn't check this truck's Stripe account"** | the underlying message |

The mechanism — `post()` now attaches the HTTP status to the error it throws:

```ts
const err: PostError = new Error(data.error || `Request failed (${res.status})`)
err.status = res.status
if (typeof data.code === 'string') err.code = data.code
throw err
…
if ((e as PostError)?.status === 403) setPermissionError('not_permitted')
else setFetchError(…)
```

⚠️ **The permissions card names neither the owner nor the account.** Who owns a truck is not this
screen's to disclose to whoever is holding the manage link, so the copy says what to do without saying
who. The card is slate, not amber — nothing is broken.

---

## 8. VERIFICATION — THE FOUR VIEWERS ON real-thai-food

Modelled against the **quoted** resolvers, with `ADMIN_READABLE_ACTIONS` **read out of the source file**
so the harness cannot drift, and with the operator rows read live. **Read-only: no writes of any kind.**

`real-thai-food: operator_id=f150ec81-… , truck_users rows=0`

| Viewer | `status` | `requirements` | `create_account` | `account_session` | What the tab shows |
|---|---|---|---|---|---|
| **The truck's own owner** (`realthaifood@…`) | 200 | 200 | 200 | 200 | "Not connected" card **+ the Connect Stripe button, enabled** |
| **A platform admin** (`dbonini82@…`) | **200** | **200** | 🔴 **403 ADMIN_READ_ONLY** | 🔴 **403 ADMIN_READ_ONLY** | "Not connected" card **+ "Viewing as platform admin"** note; **Connect.js not mounted** |
| **A `truck_users` member who is neither** | 403 | 403 | 403 | 403 | "Only the truck's owner can set up payments"; no button, no iframes |
| **Signed out, manage token only** | 403 | 403 | 403 | 403 | identical to the row above |

⚠️ The third row is **modelled**, because `truck_users` is empty in this database — there is no real
member to test. It is exact nonetheless: the route never queries that table, so a member's outcome is
determined entirely by ownership and `is_admin`, both of which are false for them.

### Assertions — 17 of 17 pass

```
  PASS  owner resolves as owner
  PASS  owner may create_account
  PASS  platform admin resolves as platform_admin
  PASS  admin operatorId is the TRUCK's operator, not the admin's   [f150ec81-…]
  PASS  admin MAY status
  PASS  admin MAY requirements
  PASS  admin may NOT create_account
  PASS  admin may NOT account_session
  PASS  non-owner non-admin still refused
  PASS  signed-out token-only still refused
  PASS  truck_users is never queried by the route
  PASS  requireOwner ownership condition unchanged
  PASS  admin fallback runs only after requireOwner
  PASS  route reuses verifyAdmin from lib/auth/admin
  PASS  Connect.js is not mounted for an admin viewer
  PASS  the Connect button is owner-only in the markup
  PASS  403 no longer renders as a configuration problem
```

### Typecheck

`npx tsc --noEmit` — clean.

### 🔴 What this does NOT prove

The harness models the resolvers; it does not execute them behind a real Supabase session cookie. The
model is line-for-line against the quoted source and the allow-list is parsed from the file itself, but
**an end-to-end check needs you to sign in as `dbonini82@gmail.com` and open real-thai-food's Payments
tab.** Expected result: the tab loads, shows "Not connected", and shows the admin note where the button
was.

---

## 9. NON-ASCII CENSUS

| File | Classes before | Classes after | Gained |
|---|---|---|---|
| `app/api/stripe/connect/route.ts` | 8 | 8 | **none** |
| `components/manage/PaymentsTab.tsx` | 10 | 10 | **none** |

Both comments added use `🔴`, `⚠️`, `—` and `─`, all already in those files' vocabularies.

---

## 10. WHAT WAS NOT TOUCHED

- **`requireOwner`** — the ownership condition is byte-identical; only the returned object gained
  `viewer: 'owner'`. Nobody who is not an owner or a platform admin gains anything, and `truck_users`
  grants nothing on this route (asserted).
- **What the Connect flow does once pressed** — `create_account`'s body, `createConnectedAccount`, the
  persist, the posture read and the domain registration are all unchanged. Only *who may reach it* moved.
- **The walk-up payments section and the Billing tab** — not opened.
- **`lib/auth/admin.ts`** — read only. `verifyAdmin` is unmodified; its header says "Do not fork this",
  and it was not forked.
- **`operators.is_admin`** — read only. No value changed, no migration.

⚠️ One stale comment I did correct, because it now describes the opposite of the code: the route's
header block said "OWNER ONLY, AND RESOLVED THE SAME WAY MANAGE RESOLVES IT". It now states the
owner/admin split and the read-only rule. That is inside the file being changed, not a separate edit.
