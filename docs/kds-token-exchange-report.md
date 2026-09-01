# KDS token exchange — the owner credential is out of the URL

**Build only.** Nothing committed, pushed or deployed. `kds_pin` and `dashboard_pin` were **not** wired
(0 references added). No token was rotated. The dashboard and manage access checks are untouched —
`app/api/dashboard/route.ts` and `app/api/manage/route.ts` both verified `git diff` clean.

⚠️ **`proxy.ts` shows as modified in `git status`. That is the PREVIOUS workstream** (session
resilience), not this one: its diff contains **zero** lines mentioning `kds`, and its mtime (14:24) is
22 minutes before this task's first edit (14:46).

**Prompt integrity:** no span arrived garbled and no instruction contradicted another.

## Which of the three I did — plainly

| | |
|---|---|
| **Parse** | ✅ **Yes.** `ts.transpileModule` on both changed files — **0 diagnostics each**. |
| **Typecheck** | ❌ **No.** `tsc --noEmit` was not run. A parse is not a typecheck. |
| **Execution** | ✅ **Yes.** The real server component was **run**, five cases. §Proof. |

🔴 **No UI was rendered and no device was used.** The KDS client component was stubbed in the harness —
what was executed is the route's decision and the props it hands over, not the screen.

**Two files changed:**

```
  M app/kds/[kds_token]/page.tsx        (+45 −2)
  M app/dashboard/[token]/kds/page.tsx  (+30 −4)
```

---

# PHASE 1 — READ AND REPORT

## 1. `app/kds/[kds_token]/page.tsx` before the change, in full

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function VanKdsPage({
  params,
}: {
  params: Promise<{ kds_token: string }>
}) {
  const { kds_token } = await params

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
}
```

**Looks up:** the van by `kds_token` (id, name, truck_id, active), then its truck by `van.truck_id`
(`dashboard_token`, active). Service-role client, so RLS is not in play.

**Redirects to:** a template literal interpolating **`truck.dashboard_token` directly into the path**,
with `van_id` and the URL-encoded `van_name` in the query string.

🔴 **The destination is a client-visible URL. It lands in the address bar, browser history, the Referer
header, Vercel's request logs and PostHog's `$current_url` — where live dashboard tokens have already
been confirmed.**

## 2. What each token grants

**`kds_token` — one van's screen.** The only check, `app/kds/[kds_token]/page.tsx:19`:

```ts
    .eq('kds_token', kds_token)
```

Plus `app/api/heartbeat/route.ts:85`, the only other consumer:

```ts
      .eq('kds_token', token)
```

**`dashboard_token` — the whole truck.** `app/api/dashboard/action/route.ts:90-96`:

```ts
async function verifyToken(token: string, pin?: string) {
  const { data: truck } = await supabase
    .from('trucks').select('*').eq('dashboard_token', token).single()
  if (!truck) return null
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) return null
  return truck
}
```

and `app/api/manage/route.ts:24-31`:

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

🔴 **That grants refunds against real card payments, every customer's name/email/phone, price rewrites,
menu deletion and settings.** A van-scoped screen credential was being exchanged for it, on a redirect.

⚠️ **`dashboard_pin` is null on every provisioned truck** (`lib/provision-truck.ts:404`, written by
nothing else), so the `&&` short-circuits and the PIN branch never fires. **Not wired here, as
instructed.**

## 3. Every consumer of `/dashboard/<dashboard_token>/kds`

**The route's own reader** — `app/dashboard/[token]/kds/page.tsx:64` (before the change):

```ts
  const { token } = useParams<{ token: string }>()
```

**What breaks if the KDS is reached another way:** everything, unless `token` is supplied. There are
**93 `token` references** in that file, all feeding routes that authenticate on `dashboard_token`:

```
   652:  const eventsRes = await fetch(`/api/events/manage?token=${token}&upcoming=true`)
   678:  body: JSON.stringify({ token, action: 'open', eventId: ev.id, payload: {} }),
  1160:  body: { token, pin, action: 'set_buzzer', order_key: orderKey, buzzerNumber },
  1256:  body: { token, pin, action: 'reject', order_key: orderKey, rejectionReason: fullReason },
  1400:  fetch('/api/events/action', { … body: JSON.stringify({ token, action: 'open', eventId, … }) })
```

**Who navigates there:**

| Caller | Line | Behaviour |
|---|---|---|
| `app/dashboard/page.tsx:75` | `if (kdsToken) redirect(\`/kds/${kdsToken}\`)` | 🔴 the **staff** web router — a van-scoped user lands here |
| `app/dashboard/[token]/page.tsx:1404` | `window.open(van?.kds_token?\`/kds/${van.kds_token}\`:\`/dashboard/${token}/kds${ev?\`?${ev}\`:''}\`,'_blank')` | the dashboard's **Open KDS** button, preferring `/kds/` when the van has a token |

🔴 **So `/kds/<kds_token>` was already the PRIMARY entry, not an edge case** — every Open-KDS click on a
van with a `kds_token` escalated to a dashboard_token URL.

⚠️ **Note the asymmetry at `:1404`:** the `/kds/` branch drops the event-seed params (`ev`) that the
fallback branch passes. **Pre-existing; unchanged by this task.**

## 4. Where `kds_token` values are printed, shared or stored

| Where | Quote |
|---|---|
| 🔴 **Copied to the clipboard as a full URL** in Manage | `app/manage/[token]/page.tsx:8920` — ``await navigator.clipboard.writeText(`https://www.hatchgrab.com/kds/${kdsToken}`)`` |
| Returned by the Manage API | `app/api/manage/route.ts:970` (`get_vans`) and `:1037` (`delete_van`) both select `kds_token` |
| Held in the Manage client's `Van` type | `app/manage/[token]/page.tsx:73` |
| Held in the dashboard's van list | `app/dashboard/[token]/page.tsx:607` |
| Shown in the admin console's van shape | `app/admin/page.tsx:125` |
| Returned at provisioning | `lib/provision-truck.ts:520`, `:549` |
| **Generated by the database** | `lib/provision-truck.ts:514` — *"kds_token omitted deliberately — DB default `encode(gen_random_bytes(24),'hex')`"* — **192 bits of randomness** |

✅ **No QR code, poster or email carries a `kds_token`.** The QR/copy-link surfaces encode
`${NEXT_PUBLIC_HATCHGRAB_URL}/trucks/${truck.slug}/order` — the customer link, keyed on the public slug.
**The only distribution channel is the Manage copy-link button.**

## 5. 🔴 Can the KDS run on `kds_token` alone? **NO — and this decides the fix.**

**It cannot, without changing the dashboard access checks, which is explicitly out of scope.**

The KDS sends `token` to four route families, and every one resolves it as a `dashboard_token`:
`/api/dashboard`, `/api/dashboard/action`, `/api/events/manage`, `/api/events/action`. `kds_token` is
accepted by exactly **two** places in the entire codebase — this route and `/api/heartbeat:85` — neither
of which serves order data.

**So the fix is a ROUTE change, not a redirect change:** the `dashboard_token` is not removed, it is
**moved off the URL** — resolved server-side and handed to the client as a prop.

---

# PHASE 2 — THE FIX

## The approach taken, and why

**Serve the KDS directly at `/kds/<kds_token>`, with no redirect.** The server component resolves the
van and truck exactly as before, then **renders** the KDS client component, passing `dashboard_token`,
`vanId` and `vanName` as props.

**Why this and not the alternative:** item 5 rules out running on `kds_token`. The remaining option in
the brief — *"keep it server-side only, never in a redirect target, never in a client-visible URL,
never in a query string"* — is satisfied exactly: the token crosses in the RSC payload, which is not a
URL and is not captured by history, logs or `$current_url`.

**`app/kds/[kds_token]/page.tsx`** — the two lookups and both `/login` redirects are **byte-identical**;
only the final line changed:

```tsx
  return (
    <Suspense fallback={null}>
      <KdsPage token={truck.dashboard_token} vanId={van.id} vanName={van.name} />
    </Suspense>
  )
```

**`app/dashboard/[token]/kds/page.tsx`** — the component now accepts those as optional props, falling
back to its existing sources:

```tsx
type KdsPageProps = { token?: string; vanId?: string; vanName?: string }

export default function KdsPage({ token: tokenProp, vanId: vanIdProp, vanName: vanNameProp }: KdsPageProps = {}) {
  const routeParams = useParams<{ token?: string }>()
  const token = tokenProp ?? routeParams?.token ?? ''
```
```tsx
  const vanId = vanIdProp ?? searchParams.get('van_id') ?? ''
  const vanName = vanNameProp ?? searchParams.get('van_name') ?? ''
```

⚠️ **Both entry points keep working, unchanged.** Used as a page at `/dashboard/<token>/kds`, Next passes
`{ params, searchParams }` — no `token` prop — and the `useParams` fallback carries it exactly as before.
`app/dashboard/page.tsx:75` and `app/dashboard/[token]/page.tsx:1404` were **not touched** and both still
resolve.

⚠️ **`vanId`/`vanName` move to props only because the `/kds` route has no query string to carry them.**
They are **not credentials**; the values are identical either way.

## 🔴 What this widens — stated plainly, because swapping one leaked credential for another is no fix

**`kds_token`'s exposure INCREASES.** Before, it appeared in the address bar for one navigation and was
then replaced by the `dashboard_token`. Now it **stays there for the whole session** — so it reaches
browser history, Vercel request logs and PostHog's `$current_url` **persistently rather than once**.

**The trade is deliberate and it is not symmetric:**

| | Before | After |
|---|---|---|
| `dashboard_token` in the URL | 🔴 **the whole session** | ✅ **never** |
| `kds_token` in the URL | one navigation | ⚠️ the whole session |
| What a leak reaches | refunds, all customer PII, prices, menu, settings | **one van's kitchen screen** |

⚠️ **This is still a bearer credential in a URL and should not be read as solved.** The per-device model
in `docs/operator-auth-investigation-report.md` §E15 is the actual answer; this removes the escalation,
not the class.

⚠️ **One property genuinely lost, and it is small:** `/kds/<kds_token>` sits outside `proxy.ts`'s
`isProtected` list, so the page-level session gate does not apply. **It did not apply before either** —
the previous destination `/dashboard/<token>/kds` was gated, but the KDS has always worked token-only
because `/api` is public (`proxy.ts:220`), so the gate never bound. **No behaviour changes.**

---

# PROOF BY EXECUTION

The **real server component**, transpiled from disk and run in a `vm`. `redirect` is stubbed to throw a
tagged error carrying its target — which is what Next's own `redirect` does — and `react/jsx-runtime` is
stubbed so the element tree and its props can be inspected without rendering the 3,128-line KDS
component. The dashboard token used is the exact value confirmed leaked in PostHog.

```
  A  VALID kds_token
    outcome              : RENDERED (no redirect)
    FULL DESTINATION URL : https://www.hatchgrab.com/kds/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4
    contains dashboard_token? NO ✅
    props to KdsPage     : {"token":"<dashboard_token>","vanId":"van-1","vanName":"Van 1"}
      → the dashboard_token crossed as a PROP, not in the URL above

  B  INVALID kds_token (no match)
    outcome              : REDIRECT
    FULL DESTINATION URL : https://www.hatchgrab.com/login
    contains dashboard_token? NO ✅

  C  ABSENT kds_token (empty seg)
    outcome              : REDIRECT
    FULL DESTINATION URL : https://www.hatchgrab.com/login
    contains dashboard_token? NO ✅

  D  valid token, van INACTIVE
    outcome              : REDIRECT
    FULL DESTINATION URL : https://www.hatchgrab.com/login
    contains dashboard_token? NO ✅

  E  valid token, truck INACTIVE
    outcome              : REDIRECT
    FULL DESTINATION URL : https://www.hatchgrab.com/login
    contains dashboard_token? NO ✅

  no destination URL contains a dashboard_token....... PASS
  valid token RENDERS, does not redirect.............. PASS
  valid token receives the dashboard_token by prop.... PASS
  valid token receives vanId + vanName by prop........ PASS
  invalid token → /login (unchanged).................. PASS
  absent token → /login (unchanged)................... PASS
  inactive van → /login (unchanged)................... PASS
  inactive truck → /login (unchanged)................. PASS

  8/8 pass
```

🔴 **THE FULL DESTINATION URL IN EVERY CASE IS EITHER THE REQUEST URL ITSELF (`/kds/<kds_token>`, no
navigation) OR `/login`. NO dashboard_token APPEARS IN ANY OF THEM.**

⚠️ **On case C:** `/kds/[kds_token]` is a dynamic segment, so a genuinely *absent* segment is `/kds`,
which does not match the route and 404s at the router before this code runs. **The case exercised is an
empty segment**, the closest thing this component can actually receive.

**Corroborating grep:** the only `dashboard_token` references left in the route are the `select` on line
57 and the prop on line 73. **No template literal, no redirect target.**

---

## What remains unverified

1. 🔴 **NO UI WAS RENDERED AND NOTHING RAN ON A DEVICE.** The KDS component was stubbed. That the screen
   *works* when reached at `/kds/<kds_token>` is **not proven here** — only that the route hands it the
   right values without a redirect.
2. **No typecheck, no build.** `tsc --noEmit` and `next build` were not run. Both files parse with 0
   diagnostics, but **the prop-type change on a component that doubles as a Next page is exactly the kind
   of thing a typecheck would catch and a parse would not.**
3. ⚠️ **The `Suspense` boundary is defensive and unexercised.** The child reads `useSearchParams()`; this
   page is dynamic so it should not be prerendered, but that reasoning is **untested by a build**.
4. ⚠️ **Whether `useParams()` returns a non-null object on the `/kds` route was not observed** — the
   fallback is written `routeParams?.token` to survive either way, but that is defence, not evidence.
5. **`kds_pin` left alone, as instructed.** It remains a dead credential column, referenced nowhere but
   `app/api/dashboard/route.ts:45`'s redaction list.
6. **The event-seed asymmetry at `app/dashboard/[token]/page.tsx:1404`** — the `/kds/` branch drops the
   `event_id`/`date` seed the fallback branch passes — is **pre-existing and untouched**.
