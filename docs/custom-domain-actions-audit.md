# Custom domain — authentication and abuse audit of four `/api/manage` actions

**WHICH OF THE THREE I PERFORMED: A PARSE. No typecheck, no execution.** This is a read. Every claim
below is a quotation from a file on disk or from `git show HEAD:<file>`. **Nothing was run, no request
was issued, no email was sent, no DNS lookup was made, and no file was changed except this report.**

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

🔴 **THE HEADLINE, BEFORE THE DETAIL — AND IT CORRECTS THE PREMISE OF THE QUESTION.** All four actions
**do** carry authentication. `docs/custom-domain-corrections-report.md` recorded that they carry no
**plan** check, and that is true; it did not say they were unauthenticated, and they are not. Every one
sits behind `resolveTruckAccess`, which denies by default.

🔴 **BUT THERE IS ONE WAY PAST IT, AND IT IS NOT A PLAN QUESTION.** `resolveTruckAccess` returns
`role: 'owner'` with **no session at all** for any truck whose id begins `demo-`. A demo truck's
`dashboard_token` is minted by a **public, unauthenticated endpoint** and handed to an anonymous
visitor. So the honest answer to *"can these be invoked without a valid operator token"* is **yes — via
a demo token, which anyone can obtain at five per hour per IP.** §3.

🔴 **AND `/api/manage` HAS NO RATE LIMIT OF ANY KIND.** Not at the proxy — it is *structurally* outside
the limited set — and not in the route. §5.

---

## 1. WHAT THE CALLER CONTROLS — working back from here, as instructed

A caller makes one HTTP request. `POST /api/manage`, `Content-Type: application/json`. They control the
entire body, which the route destructures with no schema:

```ts
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, action } = body                                        // :276-277
```

| Input | Controlled by the caller? | Constrained by what? |
|---|---|---|
| `token` | ✅ fully | Must match a row's `dashboard_token`. §2, §3. |
| `action` | ✅ fully | A string compared against `if (action === '…')` chains. No allowlist precedes dispatch. |
| `body.address` (preflight) | ✅ **fully — any hostname they like** | `checkSubdomain()` only; then it is looked up. §4.1 |
| `body.to` (send_instructions) | ✅ **fully — any email address they like** | One regex. §4.4 |
| Cookies / `Authorization` | ✅ they choose to send none | §2 |
| Origin, Referer, User-Agent | ✅ | Not consulted by this route. |

There is **no CSRF token, no origin check, no nonce, no idempotency key and no request signature**
anywhere in `app/api/manage/route.ts`.

So the two things worth chasing are **the address a caller names** (which we then resolve, on our
network, on our Vercel quota) and **the address a caller names** in the other sense — the inbox we then
email, from our domain, on our Brevo allowance.

---

## 2. THE GATE ALL FOUR SIT BEHIND — traced, not inferred from where the file sits

All four actions are inside `POST`, which spans **lines 275-1914**. (`GET` is 142-272; the file has two
exports and no others — `grep -n "^export"` returns exactly `142:export async function GET` and
`275:export async function POST`.) The four sit at 1025-1057, 1058-1082, 1147-1158 and 1160-1193 — all
inside `POST`, all **after** the block below, which is unconditional and has no early return before it:

```ts
  const truck = await getTruck(token)
  if (!truck) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  // ── 🔴 DENY BY DEFAULT. …
  const access = await resolveTruckAccess(req, truck)                              // :286
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const requestingUserRole = access.role
```

`resolveTruckAccess` (`:96-129`), in full order of decision:

```ts
async function resolveTruckAccess(req, truck): Promise<TruckAccess> {
  if (isDemoIdentifier(truck.id)) {                                                // :98  ← §3
    return { ok: true, role: 'owner', userId: null, operatorId: null, via: 'demo' }
  }
  const userId = await resolveCallerId(req)
  // 🔴 THE INVERSION. No caller ⇒ no access.
  if (!userId) return { ok: false, status: 401, error: 'Sign in required' }         // :104-106
  const { data: op } = await supabase.from('operators').select('id, is_admin').eq('auth_user_id', userId).maybeSingle()
  if (op?.is_admin) return { ok: true, role: 'owner', … via: 'admin' }              // :112
  if (op && truck.operator_id && op.id === truck.operator_id)                       // :116
    return { ok: true, role: 'owner', … via: 'owner' }
  const { data: truckUser } = await supabase.from('truck_users').select('role')
    .eq('auth_user_id', userId).eq('truck_id', truck.id).maybeSingle()
  if (truckUser?.role) return { ok: true, role: truckUser.role, … via: 'member' }   // :123
  // 🔴 AUTHENTICATED, BUT NOT ON THIS TRUCK. A token is not a grant.
  return { ok: false, status: 403, error: 'You do not have access to this truck' }  // :128
}
```

`resolveCallerId` (`:69-76`) tries the **cookie session** first (`createSupabaseServerClient().auth.getUser()`)
and falls back to a **native Bearer JWT** verified by `supabase.auth.getUser(jwt)`. A forged or absent
credential yields `null`, which is a 401.

**So a valid `dashboard_token` alone is NOT sufficient.** The token names the truck; the session names
the caller; both are required — except in §3.

**The staff gate**, immediately after (`:309-328`), is a second, narrower filter:

```ts
    'domain_provision', 'domain_send_instructions', 'domain_confirm',              // :324
  ]
  if (staffBlockedActions.includes(action) && requestingUserRole === 'staff') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
```

⚠️ **`domain_preflight` and `domain_status` are deliberately absent from that list**, and the code says
so: *"`domain_preflight` and `domain_status` are reads and are deliberately absent"* (`:323`). **A staff
member can therefore call preflight** — the one of the four with an unbounded outbound side effect.

---

## 3. 🔴 THE ONE PATH THAT NEEDS NO OPERATOR TOKEN — the demo carve-out

`resolveTruckAccess`'s **first line** returns `owner` with `userId: null` for any truck whose id starts
`demo-`. `isDemoIdentifier` is a prefix test and nothing more (`lib/demo.ts`):

```ts
export function isDemoIdentifier(identifier?: string | null): boolean {
  return typeof identifier === 'string' && identifier.startsWith(DEMO_PREFIX)
}
```

**Where the caller gets such a token.** `POST /api/demo` is a public endpoint that provisions a demo
truck and hands its `dashboard_token` to an anonymous visitor — `app/api/demo/save-email/route.ts:4`
states it plainly: *"Authenticated by the demo's own dashboard_token, which the caller already holds
(it's in their URL)."* `lib/demo.ts` confirms the id, slug **and** `dashboard_token` all carry the
prefix. So a caller with no account, no email and no session can mint a truck on which they are
`owner`.

**Its only limiter is on the minting, not on the use** (`app/api/demo/route.ts:102`):

```ts
      const { success } = await demoRatelimit.limit(ip)
```
```ts
export const demoRatelimit = new Ratelimit({          // lib/ratelimit.ts:145
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  prefix: 'vf_rl_demo',
})
```

🔴 **Five demo trucks per hour per IP. Once minted, the token is good indefinitely and every call made
with it is unlimited** — see §5.

⚠️ **This is a pre-existing carve-out, not something the custom-domain workstream introduced**, and it
is documented at `:85-94` as a deliberate decision. **What is new is the set of actions now sitting
behind it.** The four in this audit, plus `domain_provision`, are reachable by a demo caller because
`canAccess('demo', 'embed_schedule')` is **true** — `PLAN_FEATURES.demo = new Set(TRIAL_FEATURES)`,
`TRIAL_FEATURES = [...MAX_FEATURES]`, and `'embed_schedule'` is in `MAX_FEATURES` (`lib/features.ts:69`).

⚠️ **`domain_provision` is outside the four I was asked about, but it is the step that unlocks two of
them**, so it is recorded here rather than omitted: it is the action that writes `custom_domain`, and
`domain_confirm` and `domain_send_instructions` both refuse until that column is set. §4.

✅ **One amplification that is NOT available.** The Brevo sender display name is `truck.name`, and
**no action in this route writes `trucks.name`** — `update_truck`'s allowlist (`:1304`) does not contain
it, and the other `name` writes target `menu_categories`, `menu_items_db`, `modifier_groups`,
`modifier_options`, `truck_events`, `truck_users` and `truck_vans`. So a demo caller cannot choose the
name an email appears to come from; it stays the generated `Demo Kitchen (xxxxxx)`.

---

## 4. THE FOUR ACTIONS

| Action | Auth before it | Staff-blocked? | Plan check | Reachable with no operator token? | Worst caller-driven effect |
|---|---|---|---|---|---|
| `domain_preflight` | ✅ `resolveTruckAccess` | 🔴 **No** | 🔴 No | **Yes — demo carve-out** | 2-4 outbound DoH lookups + 1 authenticated Vercel API call, **on a hostname the caller names**, unlimited rate |
| `domain_status` | ✅ `resolveTruckAccess` | 🔴 No | 🔴 No | **Yes — demo carve-out** | 1 Vercel API call, but only on **our own stored** value; nothing caller-supplied |
| `domain_confirm` | ✅ `resolveTruckAccess` | ✅ Yes | 🔴 No | **Yes — demo carve-out** | One column write on the caller's own row. Refused unless a domain is already verified |
| `domain_send_instructions` | ✅ `resolveTruckAccess` | ✅ Yes | 🔴 No | **Yes — demo carve-out** | 🔴 **An email through Brevo to any address the caller supplies**, plus 1-2 DoH + 1 Vercel call. Unlimited rate |

### 4.1 `domain_preflight` — lines 1025-1055

**1. Authentication before it.** `resolveTruckAccess` at `:286`, quoted in §2. **Nothing action-specific.**
No plan check, and **not** on the staff-blocked list.

**2. Invocable without a valid operator token?** **Yes, via §3.** With a real truck's token and no
session it is a **401**; with a `demo-` token and no session it runs as `owner`.

**3. What a caller could cause.** The address is caller-supplied and is looked up:

```ts
    const verdict = checkSubdomain(typeof body.address === 'string' ? body.address : '')   // :1026
    …
    const [caa, dns] = await Promise.all([checkCaa(verdict.host), detectDnsProvider(verdict.host)])  // :1035
    …
      const cfg = await getDomainConfig(verdict.host)                                       // :1042
```

Per call that is:

- **`checkCaa`** → `query(parent, 'CAA')`, and **`detectDnsProvider`** → `query(parent, 'NS')`.
- `query` (`lib/custom-domain/dns.ts:41-57`) walks `RESOLVERS` **sequentially, falling through on
  failure** — Cloudflare `https://cloudflare-dns.com/dns-query`, then Google `https://dns.google/resolve`.
  So **2 outbound DoH requests minimum, 4 maximum**, each with `AbortSignal.timeout(4_000)`
  (`DNS_TIMEOUT_MS = 4_000`, `:23`).
- **`getDomainConfig`** → one authenticated `GET` to `api.vercel.com` carrying `VERCEL_API_TOKEN`.

🔴 **So one request from a caller becomes three to five outbound requests, one of them spending our
Vercel API quota, all targeted at a name the caller chose.** `checkSubdomain` rejects apexes and
malformed input but does **not** restrict which registrable domain may be named.

**RATE LIMITING: THERE IS NONE.** See §5 — quoted there rather than repeated.

**4. Recipient address.** Not applicable — this action sends no mail.

### 4.2 `domain_status` — lines 1058-1082

**1. Authentication before it.** `resolveTruckAccess` at `:286`. Nothing action-specific; no plan check;
not staff-blocked.

**2. Invocable without a valid operator token?** **Yes, via §3.**

**3. What a caller could cause.** 🔴 **The least of the four, and for a structural reason: nothing the
caller sends is used.** The address comes from the truck row, not the body:

```ts
    const address = truck.custom_domain ?? null                    // :1059
    if (address) {
      const cfg = await getDomainConfig(address)                   // :1062
```

A demo truck has no `custom_domain`, so the branch does not run and **no outbound call is made at all**.
The response is a read of the caller's own row plus `suggestFromWebsite(truck.website)`. **RATE
LIMITING: none** — but there is nothing here worth limiting.

**4. Recipient address.** Not applicable.

### 4.3 `domain_confirm` — lines 1147-1158

**1. Authentication before it.** `resolveTruckAccess` at `:286`, **plus** the staff gate — `domain_confirm`
**is** on `staffBlockedActions` (`:324`), so a `staff` role gets 403. No plan check.

**2. Invocable without a valid operator token?** **Yes, via §3** (demo grants `owner`, not `staff`).

**3. What a caller could cause.** Almost nothing, and a state precondition is why:

```ts
    if (!truck.custom_domain || !truck.custom_domain_verified_at) {
      return NextResponse.json({ error: 'There is nothing to confirm yet' }, { status: 400 })   // :1148-1150
    }
    const { error } = await supabase.from('trucks')
      .update({ custom_domain_confirmed_at: new Date().toISOString() }).eq('id', truck.id)      // :1151-1152
```

One timestamp on the caller's **own** row, scoped by `.eq('id', truck.id)`. No outbound call, no email.
Reaching it requires a domain that has already gone live. **RATE LIMITING: none.** The write is
idempotent in effect (it only ever overwrites its own column), so unbounded calls cost one UPDATE each
and nothing more.

**4. Recipient address.** Not applicable.

### 4.4 `domain_send_instructions` — lines 1160-1193

**1. Authentication before it.** `resolveTruckAccess` at `:286`, **plus** the staff gate (`:324` lists it,
with the reason stated at `:322`: *"`domain_send_instructions` sends mail on the truck's behalf"*). **No
plan check** — this is the one the corrections report flagged.

**2. Invocable without a valid operator token?** **Yes, via §3**, but only after `custom_domain` is set —
see below.

**3. What a caller could cause.** The path in full:

```ts
  if (action === 'domain_send_instructions') {
    const to = typeof body.to === 'string' ? body.to.trim() : ''
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json({ error: 'That does not look like an email address' }, { status: 400 })
    }
    const address = truck.custom_domain
    if (!address) return NextResponse.json({ error: 'No address has been set up yet' }, { status: 400 })  // :1166

    const cfg = await getDomainConfig(address)          // 1 Vercel API call
    …
    const dns = await detectDnsProvider(address)        // 1-2 DoH calls
    …
      await sendConfirmationEmail({ to, subject: mail.subject, html: mail.html, text: mail.text,
                                    senderName: truck.name })                                    // :1187
```

🔴 **`sendConfirmationEmail` is the codebase's single Brevo POST helper** — `lib/email.ts:541-565`,
`POST https://api.brevo.com/v3/smtp/email`, `sender: { name: senderName, email: EMAIL_FROM_ADDRESS }`,
`to: [{ email: params.to }]`. The mail leaves **our domain**, on **our Brevo allowance**, to **an inbox
the caller named**.

🔴 **`truck.custom_domain` AT `:1166` IS THE ONLY THING STANDING BETWEEN A DEMO CALLER AND AN OPEN
MAILER — AND IT IS A STATE CHECK, NOT AN AUTHORISATION CHECK.** A freshly minted demo truck has a null
column, so it returns 400. But the same caller may first call `domain_provision`, which **passes** its
plan check for `demo` (§3) and writes `custom_domain`. After that, `domain_send_instructions` succeeds
for every address they supply, at any rate.

⚠️ **The repository already names this exact vector, in the comment beside the signup limiter**
(`lib/ratelimit.ts:166-169`):

> **PER-EMAIL (3/day): protects a THIRD PARTY.** Without it, anyone can use our signup form to
> mail-bomb an arbitrary inbox with verification emails, and a per-IP limit does nothing to stop that
> (rotate the IP, keep the address). **This is the standard vector for any unauthenticated endpoint that
> emails an address it was handed.**

**`domain_send_instructions` is that shape, and it has neither of the two limiters that comment
describes.** The corresponding protections that *do* exist elsewhere:

```ts
export const signupRatelimit      = Ratelimit.slidingWindow(3, '1 h'), prefix: 'vf_rl_signup'
export const signupEmailRatelimit = Ratelimit.slidingWindow(3, '1 d'), prefix: 'vf_rl_signup_email'
```

⚠️ And the same comment records why the ceiling matters: *"Brevo Free is a shared 300/day cap that stops
sending SILENTLY … the first casualty is order confirmations for LIVE trucks."*

**4. 🔴 IS THE RECIPIENT CALLER-SUPPLIED OR READ FROM THE TRUCK RECORD?**

**CALLER-SUPPLIED. `body.to`, line 1161.** It is **not** read from the truck record and is **not**
compared against it. The only validation is the regex at `:1162`, which checks shape, not ownership.

⚠️ `truck.contact_email` **is** read one line later — but only as `operatorEmail` **inside the message
body** (`:1183`), for the reply-to prose. It never constrains the destination.

---

## 5. RATE LIMITING ON `/api/manage` — quoted, and it is an absence

🔴 **THERE IS NONE, AT EITHER LAYER.**

**At the proxy.** `proxy.ts:6-11` states it as a design property rather than an omission:

> Rate-limit SCOPE = a **POSITIVE ALLOWLIST** of ONLY the public, scraping-prone endpoints. INVERTED by
> design (NOT "limit every `/api/*` minus an exempt list"). Operator surfaces — the dashboard / manage /
> KDS pages AND every API they poll (`/api/dashboard`, **`/api/manage`**, `/api/kds`, `/api/heartbeat`,
> `/api/ping`, `/api/slots`, `/api/menu`, `/api/orders`, …) — are **STRUCTURALLY OUTSIDE this set: they
> are never even considered for limiting**, so no future edit to an exempt list can accidentally
> re-expose them. **ONLY paths matched by the two predicates below are ever limited.**

The predicates are `isCustomerEvents` (`p === '/api/events'`), `isStrictPublic` (`/api/discovery…`),
`isGeneralPublic` (`/trucks…`) and `isEmbedPublic` (`/embed…`, `/api/embed/…`). **`/api/manage` matches
none of them**, so it never reaches `limiter.limit(key)` at `proxy.ts:216`.

**And the proxy does not authenticate it either.** `isProtected` covers page routes only, and `/api` is
on the *public* list:

```ts
  const isProtected =
    (pathname.startsWith('/dashboard') && !isDemoDashboard(pathname)) ||
    pathname.startsWith('/manage')                                            // :296-298
  const isPublic =
    pathname.startsWith('/login') || pathname.startsWith('/signup') ||
    pathname.startsWith('/api') || …                                          // :301-309
```

`proxy.ts:339-341` says so outright: *"the edge redirect was never the boundary — proxy.ts puts `/api` on
the public list, so the API was always reachable without it."*

**In the route.** `grep -n "ratelimit\|Ratelimit\|limit(" app/api/manage/route.ts` returns **six hits,
all of them PostgREST `.limit(1)` / `.limit(20)` query modifiers** at lines 243, 343, 397, 485, 1896 and
1908. **No limiter is imported and none is called.**

**The buckets that exist and do not apply here**, for completeness — `lib/ratelimit.ts`:

| Bucket | Window | Prefix | Applies to |
|---|---|---|---|
| `ratelimit` (GENERAL) | 60 / 1 m | `vf_rl` | `/trucks…` |
| `strictRatelimit` | 3 / 1 m | `vf_rl_strict` | `/api/discovery…` |
| `eventsRatelimit` | 600 / 1 m | `vf_rl_events` | `/api/events` exactly |
| `embedRatelimit` | 600 / 1 m | `vf_rl_embed` | `/embed…`, `/api/embed/…` |
| `customHostRatelimit` | 600 / 1 m | `vf_rl_customhost` | custom hosts |
| `demoRatelimit` | 5 / 1 h | `vf_rl_demo` | `POST /api/demo` — **minting** a demo, not using one |
| `signupRatelimit` | 3 / 1 h | `vf_rl_signup` | `/signup` |
| `signupEmailRatelimit` | 3 / 1 d | `vf_rl_signup_email` | `/signup`, **per recipient address** |

🔴 **The last row is the protection `domain_send_instructions` does not have.**

---

## 6. WHAT IS ACTUALLY LIVE TODAY — checked against HEAD, not assumed

| At `HEAD` (`1d85241`, = production) | State |
|---|---|
| `domain_preflight` | **ABSENT** |
| `domain_status` | **ABSENT** |
| `domain_confirm` | **ABSENT** |
| `domain_send_instructions` | **ABSENT** |
| `domain_provision` | **ABSENT** |
| `resolveTruckAccess` | 🔴 **ABSENT** |

✅ **None of the four is deployed.** They exist only in the uncommitted working tree, and the three
`custom_domain` migrations are unapplied, so the columns they read do not yet exist in the live schema.

🔴 **BUT THE GATE IS NOT DEPLOYED EITHER, AND THAT IS THE MORE IMPORTANT HALF.** `git show HEAD` on this
route shows production still running the pre-fix shape:

```ts
  // ── Resolve requesting user's role and ID ────────────────
  let requestingUserRole: 'owner' | 'manager' | 'staff' = 'owner'      // HEAD:198
  let requestingUserId: string | null = null
```

**In production today, `POST /api/manage` authenticates on `dashboard_token` alone and defaults every
caller to `owner`.** The deny-by-default inversion and the four domain actions are in the **same
uncommitted batch**, so the gate and the actions would ship together — but until that batch ships, the
existing actions on that route are the exposure, not these four.

⚠️ **I did not audit those existing actions.** That is outside this brief and is stated so the absence
is not read as a clean bill.

---

## 7. SUMMARY — the four questions, answered flatly

1. **What authentication runs?** `resolveTruckAccess(req, truck)` at `app/api/manage/route.ts:286`, for
   all four, unconditionally, before dispatch. Cookie session first, native Bearer second; **401** with
   no caller, **403** for a caller with no role on that truck. `domain_confirm` and
   `domain_send_instructions` additionally refuse `staff`; `domain_preflight` and `domain_status` do not.
2. **Invocable without a valid operator token?** **Yes — one way, for all four:** a `demo-` prefixed
   truck id short-circuits `resolveTruckAccess` to `owner` with `userId: null`, and demo tokens are
   issued to anonymous callers by the public `POST /api/demo` at 5/hour/IP. With a **real** truck's
   token and no session, all four are **401**.
3. **What an unauthenticated (demo) caller could cause.** `domain_preflight`: 3-5 outbound requests per
   call — 2-4 DoH lookups plus one authenticated Vercel API call — **on any hostname they name**, at
   **no rate limit**. `domain_send_instructions`: **one Brevo email per call to any address they supply**,
   from our domain, on the shared Brevo allowance, at **no rate limit** and with **no per-recipient
   limiter** — reachable only after `domain_provision` sets `custom_domain`, which a demo truck's plan
   permits. `domain_status` and `domain_confirm`: negligible, and for structural reasons (nothing
   caller-supplied is used; a state precondition blocks the other).
4. **Recipient on `send_instructions`?** 🔴 **CALLER-SUPPLIED — `body.to`, line 1161**, validated by one
   shape regex and never compared to `truck.contact_email`, which is used only as reply-to prose inside
   the message body.

**I added no gate, no limiter and no check. Nothing outside this report was modified.**

---

## 8. What remains unobserved

1. **Nothing was executed.** No request was made to `/api/manage`, `/api/demo`, Brevo, Vercel or any
   DoH resolver. **The demo-carve-out chain in §3 and §4.4 is traced through source, not demonstrated.**
   In particular I did **not** mint a demo truck and confirm the sequence end to end.
2. **`checkSubdomain` was not exhaustively probed.** I read that it rejects apexes and malformed input;
   I did not enumerate what hostnames it *accepts*, so the true breadth of §4.1's "any hostname they
   name" is bounded by a function I have read but not fuzzed.
3. **Whether Brevo, Cloudflare, Google DNS or the Vercel API impose their own limits is unknown** — no
   provider-side quota was consulted. The absence recorded here is the absence *in this codebase*.
4. **The other ~60 actions on `POST /api/manage` were not audited**, nor was `GET`.
5. **HEAD's pre-fix auth shape (§6) was read, not exercised** — I did not verify against the deployed
   site that production behaves as that source says.
6. **`app/api/demo/route.ts` was read only for its limiter call.** I did not audit demo provisioning
   itself, nor confirm that a demo `dashboard_token` is returned in the HTTP response as opposed to only
   appearing in a redirect URL — `save-email/route.ts:4` states the caller holds it, and I took that.
