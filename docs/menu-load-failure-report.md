# The 15:00 menu-load failure — two symptoms, one budget of three per minute

> ## ✅ CONFIRMED BY THE VERCEL LOGS — 14:53, and the framing below is superseded in one respect
>
> **EIGHT 429s in fifty seconds, ALL on `/api/events`.** In the same window `/api/menu/test-kitchen` returned **200** and logged `[MENU API] Returning…`, `/api/slots/test-truck` returned **200** three times, and `/trucks/test-kitchen/order` returned **200** twice.
>
> 🔴 **THE MENU WAS NEVER RATE-LIMITED. IT WAS NEVER EVEN SLOW.** The prediction in §5 — that `/api/menu` is outside the limiter's positive allowlist — is confirmed by observation, and the prediction in §2 that a menu fault could not produce that string is now moot: **the menu did not fault.**
> 🔴 **THE DEPLOYED CHANGES ARE EXONERATED.** `[MENU API] Returning…` is the success log at `route.ts:641`, which is emitted **after** the new readiness block. The new code ran and the route succeeded.
> 🔴 **WHAT REMAINS IS A RATE LIMIT PLUS A COPY DEFECT.** See §10-§12 appended at the end.


**Date:** 11 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE HEADLINE

**🔴 THE STRICT RATE LIMITER IS `slidingWindow(3, '1 m')` — THREE REQUESTS PER MINUTE, KEYED ON IP — AND BOTH `/api/events` AND `/api/discovery/events` ARE ON IT, SHARING ONE BUCKET.**

**🔴 THE STRING YOU SAW IS NOT A MENU ERROR.** *"We couldn't load the menu right now"* is `eventsRetryCard`. It renders **only** when the **events** fetch has failed **three times in a row**. `/api/menu` cannot produce it — a menu failure renders a different, page-replacing string.

**🔴 SO (a) AND (b) ARE ONE CAUSE, NOT TWO.** Both are the events data. On the order page they are literally two branches of **one ternary** fed by **one fetch**: when `eventsError` is true you get the card, and the picker that would otherwise render **is the branch it replaced.**

**✅ AND THE INTERMITTENCY IS EXPLAINED BY THE MECHANISM, NOT WAVED AT.** A sliding window refills by itself. *"Cleared on a later retry"* is the signature of a rate limiter; a deterministic code defect does not do that. **The deployed code changes cannot produce it** — `/api/menu` is not rate-limited at all, and every changed line sits **after** the last error return.

⚠️ **§28 of the manual is WRONG about this limiter.** It records *"STRICT — 60/min (raised from 3/min)"*. The code says **3**, and its own comment says it was put back. **The manual describes a configuration that is not running.**

---

## 1. The string, and exactly what makes it appear

**Source: QUOTED.** A repo-wide grep returns **one** hit.

`app/trucks/[slug]/order/page.tsx:1431-1446`:

```tsx
  // Shown in place of the event card when the events fetch failed (after auto-retries) — friendly,
  // not alarming, with a Retry that re-runs the events effect (setReloadKey bump). Used by both the
  // eventsError branch AND the catch-all, so the event section is NEVER a silent blank.
  const eventsRetryCard = (
    <div className="mt-3 bg-slate-100 rounded-xl px-4 py-4 text-center">
      <p className="text-slate-600 text-sm font-medium">We couldn&apos;t load the menu right now.</p>
      <p className="text-slate-400 text-xs mt-0.5 mb-3">Please check your connection and tap to retry.</p>
      <button
        onClick={() => setReloadKey(k => k + 1)}
        disabled={eventLoading}
        …
```

🔴 **THE COMPONENT IS NAMED `eventsRetryCard` AND ITS OWN COMMENT SAYS *"when the events fetch failed"*. THE COPY SAYS "menu". THE COPY IS WRONG.** That single mislabel is why symptom (a) reads as a menu problem and sent the investigation to the wrong route.

### Its two render sites — `:1577-1632`

```tsx
          {isDemo ? null : eventLoading ? (
            …Loading events…
          ) : eventsError ? (
            eventsRetryCard                       // ← SITE 1
          ) : noEvents ? (
            …No upcoming events in the next 2 weeks…
          ) : events.length > 0 ? (
            …the event card, or the PICKER…
          ) : (
            // Belt-and-braces: not loading, no error flag, no events, not noEvents — only reachable
            // via a failure that slipped past the flags. NEVER a silent blank → show the retry card.
            eventsRetryCard                       // ← SITE 2
          )}
```

### What must happen — QUOTED, `:449-503`

```tsx
    let cancelled = false
    const loadEvents = async () => {
      setEventsError(false)
      setEventLoading(true)
      const backoffMs = [1000, 2000] // waits BEFORE retry attempts 2 and 3
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(`/api/events?truck=${slug}`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          …
          setEventsError(false)
          setEventLoading(false)
          return // success — stop retrying
        } catch {
          if (cancelled) return
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, backoffMs[attempt]))
            if (cancelled) return
            continue // retry
          }
          // All attempts exhausted → surface the retry card (no silent blank).
          setEventsError(true)
          setEventLoading(false)
        }
      }
    }
```

| Trigger | Reaches the card? |
|---|---|
| **Any non-`ok` response from `/api/events`** — 400, 404, **429**, 500, 502, 504 | ✅ **YES**, via `throw new Error(\`HTTP ${res.status}\`)` |
| **A thrown error** — network failure, DNS, TLS, abort | ✅ **YES** |
| **Malformed JSON** — `res.json()` throws | ✅ **YES** |
| **Empty payload** — `data.events` empty | 🔴 **NO** — that is `setNoEvents(true)`, a different card |
| **Timeout** | ⚠️ **Only an OS/browser-level one.** 🔴 **This fetch has NO AbortController and NO timeout.** It waits indefinitely |
| **Anything from `/api/menu`** | 🔴 **NO. This card is not reachable from the menu fetch at all** |

🔴 **ALL THREE ATTEMPTS MUST FAIL.** One success at any attempt returns and clears the flag. With 1 s + 2 s backoff the whole burst spans **~3 seconds**, so a fault lasting less than that never surfaces.

### Can it appear for a 200?

🔴 **YES — one way only.** Site 2, the belt-and-braces `else`. Reachable when `!eventLoading && !eventsError && !noEvents && events.length === 0`. **QUOTED:** a 200 whose `data.events` is non-empty but where **every event is filtered out by the 14-day/end-time filter** at `:470-475` leaves `upcoming.length === 0` → `setNoEvents(true)`… so that lands on `noEvents`, not here. **Not established** what else reaches site 2; the comment itself says *"only reachable via a failure that slipped past the flags."*

⚠️ **A `/api/menu` failure renders something ELSE entirely** — `:539-547`:

```tsx
      .catch((err: any) => {
        console.error('[ORDER FORM] Menu fetch error:', err?.message || err)
        setError('This truck is not currently taking orders.')
      })
```

🔴 **"This truck is not currently taking orders." is the menu-failure string.** You did not see it.

---

## 2. Every non-success path in `app/api/menu/[truckId]/route.ts`

**Source: QUOTED. There are exactly TWO, both 404. `grep -n "status: [0-9]"` returns two lines in the whole 700-line file.**

### 404 #1 — line 52 · `{ error: 'Truck not found' }`

```ts
  let truckQuery = await supabase
    .from('trucks')
    .select('*')
    .eq('slug', truckId)
    .single()

  if (truckQuery.error || !truckQuery.data) {
    truckQuery = await supabase
      .from('trucks')
      .select('*')
      .eq('id', truckId)
      .single()
  }

  const truck = truckQuery.data
  const truckError = truckQuery.error

  console.log('[MENU API] Truck found:', truck?.name, 'Error:', truckError)

  if (truckError || !truck) {
    return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
  }
```

**Trigger:** neither the slug nor the id lookup resolves. ⚠️ **Note both reads are `select('*')`**, so a missing column cannot 42703 them.

### 404 #2 — line 151 · `{ error: 'This event is not yet confirmed' }`

```ts
    if (!isDashboard && explicitEvent && !['confirmed', 'open'].includes(explicitEvent.status)) {
      return NextResponse.json({
        error: 'This event is not yet confirmed',
        event_status: explicitEvent.status,
        ordering_available: false,
      }, { status: 404 })
    }
```

**Trigger:** an `?event_id=` naming an event whose status is neither `confirmed` nor `open`, on a non-dashboard call.

### 🔴 THERE ARE NO OTHERS

- **No `try`/`catch` anywhere in the route** — a grep for `catch` returns nothing.
- **No 500 return.** An unhandled throw becomes a **platform 500**, not a route response.
- **No timeout, no `maxDuration` override** (`vercel.json` sets one only for `verify-schedule-url`).
- **Every Supabase error is destructured and IGNORED except the truck lookup** — `catError`, `itemsError` are logged (`:127-128`) and never returned. **A failed category read yields a 200 with an empty menu.**

⚠️ **So a `/api/menu` fault most likely produces either a 404, a 200-with-less-data, or a platform 500 — and none of the three produces the string you saw.**

---

## 3. The full diff, `4f0f2c5` → HEAD

**Source: QUOTED.** Three hunks. **Every added line is a comment, an import, or code that runs AFTER both 404s.**

```diff
@@ -10,6 +10,8 @@
 import { canAccess } from '@/lib/features'
+// ⚠️ TEMPORARY — delete with the online-payments switch. See the migration named in that file.
+import { resolveOnlineCardPayments } from '@/lib/payments/online-payments-switch'
```

```diff
@@ -641,6 +643,42 @@
   const logo = await resolveTruckLogo(supabase, truck.id, truck.logo_storage_path)
 
+  // ── 🔴 CARD-PAYMENT READINESS — A SEPARATE QUERY, DELIBERATELY ─────────────────────────────────
+  … 18 lines of comment …
+  let cardPaymentsReady = false
+  if (truck.operator_id) {
+    const { data: op, error: opErr } = await supabase
+      .from('operators')
+      .select('stripe_charges_enabled')
+      .eq('id', truck.operator_id)
+      .maybeSingle()
+    if (opErr) {
+      console.error('[MENU API] readiness lookup failed — falling back to Pay-at-Hatch:', opErr.message)
+    }
+    cardPaymentsReady = resolveOnlineCardPayments(op, truck).offered
+  }
+
   return NextResponse.json({
```

```diff
@@ -667,6 +705,10 @@
       ordering_available: orderingAvailable,
+      /** 🔴 Whether to OFFER a card option. …  */
+      card_payments_ready: cardPaymentsReady,
```

| Changed line | On the success path? | Can it throw? |
|---|---|---|
| `import { resolveOnlineCardPayments }` | ⚠️ **module load** — before everything | 🔴 **Only at build/cold-start if the module were missing.** It is tracked and committed; a missing module fails the **build**, loudly |
| 22 comment lines | no | no |
| `let cardPaymentsReady = false` | ✅ yes, line **~663** | no |
| `if (truck.operator_id)` | ✅ yes | 🔴 **no** — `truck` is non-null by line 53 |
| the `operators` `select(...)` | ✅ yes | ⚠️ **`await` on a PostgREST call.** Supabase-js returns `{data, error}`; it **does not throw on a query error**. A network-level failure inside the client could reject — **not established** whether supabase-js surfaces that as `error` or a rejection |
| `console.error(...)` | ✅ yes | no |
| `resolveOnlineCardPayments(op, truck).offered` | ✅ yes | 🔴 **no** — the function is pure and every branch returns |
| `card_payments_ready: cardPaymentsReady` | ✅ yes, in the response object | no |

🔴 **THE DECISIVE POINT: ALL OF IT RUNS AT LINE ~663, WELL PAST THE LAST ERROR RETURN AT LINE 151.** A fault here cannot produce a 404. It could only produce an **unhandled rejection → platform 500**, and that would still show *"This truck is not currently taking orders."*, not the card you saw.

⚠️ **The added query IS one extra round trip on the hottest customer endpoint**, as its own comment concedes. **INFERRED:** it adds latency, not a failure mode.

---

## 4. The `resolveOnlineCardPayments` call site, in context

**Source: QUOTED.** `app/api/menu/[truckId]/route.ts:641-682`:

```ts
  console.log('[MENU API] Returning menu with', menu.items.length, 'items')

  // Logo: operator upload → Village Foodie discovery fallback (shared resolver, Section 14/27).
  const logo = await resolveTruckLogo(supabase, truck.id, truck.logo_storage_path)

  // ── 🔴 CARD-PAYMENT READINESS — A SEPARATE QUERY, DELIBERATELY ──────────────────────────────────
  // Readiness lives on `operators.stripe_charges_enabled`, but this page is truck-slug-scoped, so it
  // has to be reached through `trucks.operator_id`.
  …
  let cardPaymentsReady = false
  if (truck.operator_id) {
    const { data: op, error: opErr } = await supabase
      .from('operators')
      .select('stripe_charges_enabled')
      .eq('id', truck.operator_id)
      .maybeSingle()
    if (opErr) {
      console.error('[MENU API] readiness lookup failed — falling back to Pay-at-Hatch:', opErr.message)
    }
    cardPaymentsReady = resolveOnlineCardPayments(op, truck).offered
  }

  return NextResponse.json({
    truck: {
      id: truck.id,
      name: truck.name,
      …
```

### Scope — every variable checked

| Variable | Declared | In scope? |
|---|---|---|
| `truck` | `:46`, guarded non-null at `:51-53` | ✅ **yes, and provably non-null** |
| `supabase` | module scope | ✅ |
| `op` | destructured in the same block | ✅ |
| `opErr` | same | ✅ |
| `cardPaymentsReady` | `let`, one line above | ✅ |
| `resolveOnlineCardPayments` | imported at `:13` | ✅ |

✅ **No variable is used out of scope. tsc is clean.**

### Can the operators lookup fail, and what happens

**QUOTED — the resolver, `lib/payments/online-payments-switch.ts:41-54`:**

```ts
export function resolveOnlineCardPayments(
  operator: { stripe_charges_enabled?: boolean | null } | null | undefined,
  truck: { online_payments_paused_at?: string | null } | null | undefined,
): { offered: boolean; pausedAt: string | null } {
  const pausedAt = truck?.online_payments_paused_at == null ? null : String(truck.online_payments_paused_at)
  return {
    offered: operator?.stripe_charges_enabled === true && pausedAt === null,
    pausedAt,
  }
}
```

| Lookup outcome | Effect on the route |
|---|---|
| **Errors** (`opErr` set, `op` null) | logged, then `resolveOnlineCardPayments(null, truck)` → `{ offered: false }`. 🔴 **The route continues to a normal 200.** |
| **Returns null** (`.maybeSingle()` on no row) | identical — `operator?.…` short-circuits. ✅ **`.maybeSingle()`, not `.single()`, so zero rows is not `PGRST116`** |
| **`truck.operator_id` is null** | the whole block is skipped; `cardPaymentsReady` stays `false` |
| **`online_payments_paused_at` absent** (pre-migration) | `== null` is true → `pausedAt = null` → treated as **not paused** |

🔴 **THE WHOLE ROUTE'S WORST CASE IS `card_payments_ready: false`.** That is the pre-deploy behaviour exactly. **It cannot 404, cannot 500, and cannot empty the menu.** The comment block says so, and the code matches the comment.

---

## 5. 🔴 EVERY RATE LIMIT — AND THE ONE THAT MATTERS

⚠️ **CORRECTION TO MY OWN FIRST PASS.** I initially searched `app/`, `lib/` and `components/` for limiter usage and concluded `strictRatelimit` was dead code. **That was wrong — the middleware is at the repo ROOT, `proxy.ts`, and it applies both tiers.** Stated because the wrong conclusion would have exonerated the right cause.

### The limiters — `lib/ratelimit.ts`, QUOTED

```ts
export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  analytics: true,
  prefix: 'vf_rl',
})

// STRICT tier — public bulk-scrapeable data only (/api/discovery, public /api/events). Intentionally tight
// (3/min): this is a competitor-harvest target, not an interactive flow. (Was mistakenly 60/min — same as
// general — which left the "strict" scraper tier not actually strict.)
export const strictRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, '1 m'),
  analytics: true,
  prefix: 'vf_rl_strict',
})

export const demoRatelimit = new Ratelimit({ … Ratelimit.slidingWindow(5, '1 h'), prefix: 'vf_rl_demo' })
export const signupRatelimit = new Ratelimit({ … Ratelimit.slidingWindow(3, '1 h'), prefix: 'vf_rl_signup' })
export const signupEmailRatelimit = new Ratelimit({ … Ratelimit.slidingWindow(3, '1 d'), prefix: 'vf_rl_signup_email' })
```

### The scope — `proxy.ts:16-19`, QUOTED

```ts
const isStrictPublic = (p: string) =>
  p === '/api/events' || p === '/api/discovery' || p.startsWith('/api/discovery/')
const isGeneralPublic = (p: string) =>
  p === '/trucks' || p.startsWith('/trucks/')
```

### The application — `proxy.ts:78-109`, QUOTED

```ts
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1'

  const isStrict = isStrictPublic(pathname)
  const inLimitedScope = isStrict || isGeneralPublic(pathname)
  const isDev = process.env.NODE_ENV !== 'production'
  const isLoopback = !forwarded || ip === '127.0.0.1' || ip === '::1'
  const authHeader = request.headers.get('authorization') || ''
  const hasBearer = authHeader.startsWith('Bearer ')
  const hasOperatorSession = request.cookies.getAll().some(c => c.name.startsWith('sb-') && c.name.includes('auth-token'))
  const operatorBypass = (hasBearer || hasOperatorSession) && !isStrict

  let rlRemaining: number | null = null

  if (inLimitedScope && !isDev && !isLoopback && !operatorBypass) {
    const limiter = isStrict ? strictRatelimit : ratelimit

    const { success, remaining } = await limiter.limit(ip)

    if (!success) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': isStrict ? '300' : '60',
        },
      })
    }
    rlRemaining = remaining
  }
```

### The full table

| Tier | Threshold | Window | 🔴 Keyed on | Routes | Status / body | Scope | Store |
|---|---|---|---|---|---|---|---|
| 🔴 **STRICT** | 🔴 **3** | **1 minute** | 🔴 **IP** — `x-forwarded-for` first hop | 🔴 **`/api/events` (exact), `/api/discovery`, `/api/discovery/*`** | **429**, `{"error":"Too many requests"}`, `Retry-After: 300` | per-tier, **one shared bucket across all its routes** | **Upstash Redis**, prefix `vf_rl_strict` |
| **GENERAL** | 60 | 1 minute | **IP** | `/trucks`, `/trucks/*` — **page routes only** | **429**, same body, `Retry-After: 60` | per-tier | Upstash Redis, `vf_rl` |
| DEMO | 5 | 1 hour | **IP** | `/api/demo`, `/api/demo/build-request` | 429 | per-route | Upstash Redis, `vf_rl_demo` |
| SIGNUP (IP) | 3 | 1 hour | **IP** | `/api/signup` | 429 | per-route | Upstash Redis, `vf_rl_signup` |
| SIGNUP (email) | 3 | 1 day | **email address** | `/api/signup` | 429 | per-route | Upstash Redis, `vf_rl_signup_email` |

### 🔴 WHAT IS **NOT** LIMITED, AND IT CONTRADICTS THE MANUAL

- 🔴 **`/api/menu/[truckId]` IS NOT RATE-LIMITED AT ALL.** It matches neither predicate — `isGeneralPublic` tests `/trucks` *page* paths, not `/api/menu`. **§28's claim *"GENERAL — 60/min — everything else, including /api/menu"* is false**; the allowlist is positive, so anything unlisted is simply never considered.
- 🔴 **§28's claim *"STRICT — 60/min (raised from 3/min, V7.8 §11)"* IS FALSE.** The code is `slidingWindow(3, '1 m')`, and the comment above it records the reversal: *"Was mistakenly 60/min … which left the 'strict' scraper tier not actually strict."* **The manual documents a configuration that is not running.**
- ⚠️ **`operatorBypass` EXPLICITLY EXCLUDES STRICT** — `(hasBearer || hasOperatorSession) && !isStrict`. **An operator testing their own live site is rate-limited exactly like a scraper.**
- ⚠️ **§28's own RULE block warns about this exact failure:** *"doing so caused two regressions (events disappearing on the dashboard when /api/events/manage got a 429; customer ordering blocked behind shared café/CGNAT IPs)."*

### 🔴 THE ARITHMETIC

**One bucket of 3 per minute per IP covers BOTH `/api/events` and `/api/discovery/events`** — the same `strictRatelimit` instance, the same `vf_rl_strict` prefix, keyed on `ip` alone with no route in the key.

| Action | STRICT requests |
|---|---|
| Load `/trucks/<slug>/order` | **1** (`/api/events?truck=`) |
| …if that first call fails | **+2** (the retry loop, within ~3 s) |
| Tap **"Change event"** → `/trucks/<slug>` | **1** (`/api/discovery/events`) |
| …if that fails | **+2** (`MAX_ATTEMPTS = 3`, backoff `[400, 1200]`) |
| Navigate back to the order page | **1** |

🔴 **A NORMAL THREE-STEP JOURNEY — order page → change event → back — COSTS EXACTLY 3. THE FOURTH REQUEST IN THAT MINUTE IS A 429.** And **one** failed fetch anywhere burns the entire minute's budget in three seconds, which then 429s everything else and *makes its own retries fail*.

⚠️ **A deploy is precisely when someone reloads a site repeatedly to check it.**

---

## 6. What the event picker's calendar renders from

**Source: QUOTED. 🔴 THERE ARE TWO DIFFERENT PICKERS AND THEY USE DIFFERENT ENDPOINTS.** Which one you saw decides which fetch failed — but **both are on the same STRICT bucket**, so the diagnosis does not fork.

### Picker A — in-page, on the order page (no event selected)

**Renders from `events`**, `page.tsx:1606-1626`:

```tsx
                  <p className="text-xs font-black text-orange-600 …">Choose which event to order for</p>
                  {events.map((e) => {
                    const poOpenDate = preorderOpenDate(truck?.preorder_open_rule, e.date_iso)
                    …
                        <TruckListCard event={eventToVillage(e, truckName)} slug={slug} forceOrderButton />
```

**Fed by the same fetch as §1** — `fetch(\`/api/events?truck=${slug}\`)` → `setEvents(upcoming)`.

🔴 **PICKER A AND THE RETRY CARD ARE MUTUALLY EXCLUSIVE BRANCHES OF ONE TERNARY.** When `eventsError` is true the card renders **in the picker's place**. *"Did not render its calendar"* and *"showed the retry card"* are **the same event described twice.**

**Does it set state from a failed fetch?** 🔴 **NO.** `if (!res.ok) throw` at `:463` precedes every setter. ✅ **And a failure leaves an ERROR, not an empty list** — `setEventsError(true)`, never `setEvents([])`.

### Picker B — the truck profile, where **"Change event"** actually goes

**QUOTED, `page.tsx:1600-1604`:**

```tsx
                  cornerAction={events.length > 1 && (
                    <Link href={`/trucks/${slug}`} className="text-orange-600 text-xs font-bold hover:underline">
                      Change event
                    </Link>
                  )}
```

🔴 **"Change event" is a `<Link>` to `/trucks/[slug]` — a different page.** It renders through `TruckClient` → `useVillageData`, which fetches **`/api/discovery/events`** — `hooks/useVillageData.ts:26-62`:

```ts
    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = [400, 1200];
…
      controller = new AbortController();
      const localController = controller;
      const timeoutId = setTimeout(() => localController.abort(), 10000);
      try {
        const res = await fetch(`/api/discovery/events?t=${Date.now()}`, {
          signal: localController.signal,
          cache: 'no-store' as RequestCache,
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Failed to fetch discovery data');
        const { events: rawEvents, trucks: rawTrucks } = await res.json();
        if (!isMounted) return;
        setEvents(rawEvents || []);
        setAllTrucks(rawTrucks || []);
        setLoadError(false);
        setLoading(false);
      } catch (error: any) {
        …
        // Retries exhausted → surface an HONEST error state (NOT an empty result). allTrucks is left
        // as-is so any previously-loaded data isn't wiped.
        console.error('VillageData Sync Error (after retries):', error);
        setLoadError(true);
        setLoading(false);
      }
```

**Does it set state from a failed fetch?** 🔴 **NO** — `if (!res.ok) throw` precedes both setters, and the comment states the rule explicitly.
**Would a failure leave the list empty rather than showing an error?** 🔴 **NO** — `setLoadError(true)`, and `allTrucks` is **deliberately left as-is**.

⚠️ **BUT: `/api/discovery/events` also carries a 10-SECOND CLIENT ABORT.** A cold start on a 359-line route with several Supabase queries is a plausible way to exceed it — **INFERRED**, and a **second** candidate for symptom (b) independent of the 429.

⚠️ **And the `?t=${Date.now()}` cache-buster plus `cache: 'no-store'` defeats the route's own `export const revalidate = 300`** — every visitor hits the origin, and every hit spends one of the three.

---

## 7. Does "change event" re-fetch the menu? And do (a) and (b) share a cause?

**Source: QUOTED.**

### The menu fetch — `page.tsx:527-537`

```tsx
  const refetchMenu = useCallback(async () => {
    const menuUrl = event?.id ? `/api/menu/${slug}?event_id=${event.id}` : `/api/menu/${slug}`
    const r = await fetch(menuUrl, { cache: 'no-store' })
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${r.status}`)
    }
    const data = await r.json()
    setTruck(data.truck)
    setMenu(data.menu)
  }, [slug, event?.id])
```

**Its effect re-runs when `refetchMenu` changes, i.e. when `slug` or `event?.id` changes** (`:539-547`).

✅ **So YES — selecting a different event re-fetches the menu, with `?event_id=<new id>`.** ⚠️ **But "Change event" itself does not**: it is a full navigation to `/trucks/[slug]`, which unmounts the order page entirely. **The menu is re-fetched when you come BACK with a new `?event_id`.**

### 🔴 CAN (a) AND (b) SHARE ONE CAUSE?

**YES, and on Picker A they are provably the same event.**

**What JOINS them — QUOTED:**

1. **One ternary, one fetch.** `:1581-1582` (card) and `:1606-1626` (picker) are branches of the same expression, both driven by the single `/api/events` effect. **Only one can render.**
2. **One rate-limit bucket.** `/api/events` and `/api/discovery/events` are both `isStrictPublic`, both keyed on `ip`, both drawing on `vf_rl_strict` at 3/min. **A burst on either starves the other.**
3. **Both are three-attempt retry loops** that consume the budget faster than it refills.

**What SEPARATES them — QUOTED:**

1. **Different endpoints and different components** if you mean Picker B — `/api/events` versus `/api/discovery/events`, `page.tsx` versus `useVillageData`.
2. **Only Picker B has a 10-second client timeout.** If (b) was a timeout and (a) was a 429, they are two mechanisms — **though a shared upstream slowness would explain both.**

🔴 **NEITHER SYMPTOM CAN BE CAUSED BY THE `/api/menu` CHANGES.** Symptom (a)'s string is unreachable from the menu fetch (§1) and `/api/menu` is not rate-limited (§5).

---

## 8. What an in-memory limiter would do across serverless instances

**Source: QUOTED — and the premise does not hold here.**

🔴 **THERE IS NO IN-MEMORY LIMITER IN THIS CODEBASE.** Every limiter is constructed with `redis: Redis.fromEnv()` — **Upstash Redis over REST**, five instances, five distinct prefixes. A grep for a `Map`- or module-scope-counter limiter finds none.

**So, from the code:**

| Question | Answer |
|---|---|
| Is the counter per-instance? | 🔴 **NO. It is GLOBAL**, in Redis, shared by every serverless instance and every edge region |
| Would that make the limit fire unpredictably? | 🔴 **NO — the OPPOSITE. It makes it fire CONSISTENTLY and EARLIER** than a per-instance counter would. An in-memory counter fragmented across N instances would effectively allow up to 3 × N; Redis allows exactly 3 |

⚠️ **INFERRED — what the shared store does introduce instead:**

- **A network round trip to Upstash (London, eu-west-2) on the critical path of every matched request**, before any application code runs.
- 🔴 **`await limiter.limit(ip)` is NOT wrapped in a try/catch.** A Redis timeout or outage would **reject inside the middleware**. **Not established** what Next.js returns then — most likely a 500 on **every** matched route. **That would be an intermittent, self-resolving, cross-endpoint failure**, which fits the symptoms as well as the 429 does.
- ⚠️ `analytics: true` on all five adds further Redis writes.

⚠️ **A separate observation, INFERRED:** the matcher is `'/((?!_next_next/image|favicon.ico|…).*)'`. **`_next_next/image` looks like a typo for `_next/image`**, so `/_next/*` requests are **not** excluded and every static asset runs the middleware — including `supabase.auth.getUser()` at `:136`. Not the cause here (those paths are outside both limiter predicates), but it is load on the same path.

---

## 9. Log lines to search for in the 15:00 window

**Source: QUOTED — exact strings, copy-paste ready.**

### 🔴 First: the 429 leaves NO log

**`proxy.ts` contains ZERO `console.*` calls.** A rate-limited request returns 429 from the edge and **writes nothing**.

🔴 **SEARCH THE EDGE/MIDDLEWARE REQUEST LOG FOR STATUS `429` ON `/api/events` AND `/api/discovery/events`, NOT THE FUNCTION LOGS.** ⚠️ **A 429 also means the route never ran — so the absence of `[events API]` or `[Discovery]` lines for a request you know was made is itself the evidence.**

⚠️ **The response also carries `X-RateLimit-Remaining`** (`:179`) on **successful** matched requests. Values of `2`, `1`, `0` on `/api/events` responses around 15:00 would show the budget draining.

### Server-side (Vercel function logs)

| String | File:line | Emitted when |
|---|---|---|
| `Events API error:` | `app/api/events/route.ts:82` | the `truck_events` query errored → **500** |
| `[events API] truck not found for slug/id:` | `app/api/events/route.ts:57` | slug and id both missed → ⚠️ **still a 200, with `events: []`** |
| `[Discovery] Scraped-discovery query failed — failing closed (empty):` | `app/api/discovery/events/route.ts:109` | |
| `[Discovery] orphaned-event fallback map build failed:` | `:134` | |
| `[Discovery] Operator events query failed:` | `:229` and `:308` | |
| `[Discovery] operator read-through (linked discovery) fetch failed:` | `:246` | |
| `[MENU API] Looking up truck:` | `menu/[truckId]/route.ts:27` | **every** menu request — its **absence** proves the route was not reached |
| `[MENU API] Truck found:` | `:49` | every menu request that got past the lookup |
| `[MENU API] Returning menu with` … `items` | `:641` | ✅ **a SUCCESSFUL menu response** |
| `[MENU API] readiness lookup failed — falling back to Pay-at-Hatch:` | `:677` | 🆕 **new in this deploy.** ⚠️ **Its presence would be the only sign the new code misbehaved — and it is non-fatal** |

### Client-side (browser console only — NOT in Vercel)

| String | File:line |
|---|---|
| `[ORDER FORM] Menu fetch error:` | `page.tsx:543` — 🔴 **the MENU failure. If this is absent, the menu was fine** |
| `VillageData Sync Error (after retries):` | `useVillageData.ts:59` — the `/api/discovery/events` failure behind Picker B |

⚠️ **The `/api/events` retry loop in `page.tsx` logs NOTHING** — its `catch` is bare (`} catch {`). **Symptom (a) is silent on both sides.** The only trace is the edge 429 and the missing `[events API]` lines.

### 🔴 The three-line test

1. **`429` on `/api/events` or `/api/discovery/events` in the edge log** → the rate limiter. **Expect three or more within one minute from one IP.**
2. **`Events API error:`** → a real database failure, not a limit.
3. **`[MENU API] Looking up truck:` present and `[MENU API] Returning menu with` present** → the menu route ran and succeeded, and symptom (a) was never about the menu.

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — the component, both render sites, the effect. The "can it appear for a 200" analysis is **QUOTED** except the site-2 reachability, marked **not established** |
| 2 | **QUOTED** — an exhaustive `grep "status: [0-9]"`, two hits; "no try/catch" is a **QUOTED negative search** |
| 3 | **QUOTED** — the full diff. The supabase-js rejection question is **not established** |
| 4 | **QUOTED** — call site, resolver, scope table, all four failure outcomes |
| 5 | **QUOTED** — all five limiters, the predicates, the application block, the 429 body. The journey arithmetic is **INFERRED** from those quotes |
| 6 | **QUOTED** — both pickers, both fetches, both error handlers. The 10 s timeout as a cause is **INFERRED** |
| 7 | **QUOTED** — the menu fetch, its deps, the `<Link>`. The join/separate analysis is **INFERRED** from quoted code |
| 8 | **QUOTED** — all five are Redis-backed, so the premise does not apply. The Redis-failure and matcher-typo observations are **INFERRED** and labelled |
| 9 | **QUOTED** — every string copied from source |

## Not established

- **The HTTP status of either failure.** Nobody captured it, and the 429 path writes no log — **only Vercel's edge request log can answer this.**
- **Which picker symptom (b) was.** "Change event" navigates to `/trucks/[slug]` (Picker B, `/api/discovery/events`), but the in-page Picker A is also an event picker and uses `/api/events`. **Both are on the same STRICT bucket, so the diagnosis holds either way.**
- **Whether Upstash Redis was healthy at 15:00.** `await limiter.limit(ip)` is unguarded; a Redis fault would fail every matched route intermittently and fits the symptoms as well as exhaustion does.
- **Whether supabase-js can reject rather than return `{error}`** on a transport failure — this decides whether the new `operators` read can throw at all.
- **What reaches the belt-and-braces `else` at `page.tsx:1628`.**
- **Whether `/api/discovery/events` exceeded the 10-second client abort** — that needs the route's duration in the function log for the window.

---

# ADDENDUM — §10-§12, against the confirmed 14:53 log evidence

## 10. The limiter that applies to `/api/events`

**Source: QUOTED.** `lib/ratelimit.ts:11-19`:

```ts
// STRICT tier — public bulk-scrapeable data only (/api/discovery, public /api/events). Intentionally tight
// (3/min): this is a competitor-harvest target, not an interactive flow. (Was mistakenly 60/min — same as
// general — which left the "strict" scraper tier not actually strict.)
export const strictRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, '1 m'),
  analytics: true,
  prefix: 'vf_rl_strict',
})
```

**Selected and applied — `proxy.ts:16-17`, `:78-79`, `:94-108`:**

```ts
const isStrictPublic = (p: string) =>
  p === '/api/events' || p === '/api/discovery' || p.startsWith('/api/discovery/')
```
```ts
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1'
```
```ts
  if (inLimitedScope && !isDev && !isLoopback && !operatorBypass) {
    const limiter = isStrict ? strictRatelimit : ratelimit

    const { success, remaining } = await limiter.limit(ip)

    if (!success) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': isStrict ? '300' : '60',
        },
      })
    }
```

| | |
|---|---|
| **Threshold** | 🔴 **3** |
| **Window** | **1 minute**, sliding |
| 🔴 **Keyed on** | 🔴 **THE CLIENT IP — and nothing else.** `limiter.limit(ip)`, where `ip` is the **first hop of `x-forwarded-for`**. No truck, no route, no session in the key |
| **Counter** | **Backed by a store — Upstash Redis** (`Redis.fromEnv()`), prefix `vf_rl_strict`. **Not in-memory.** Global across every serverless instance and edge region, so it is exact rather than fragmented |
| **Returns** | **HTTP 429**, body `{"error":"Too many requests"}`, header `Retry-After: 300` |
| **Scope** | 🔴 **ONE BUCKET SHARED** by `/api/events`, `/api/discovery` and `/api/discovery/*` — the prefix carries no route |
| **Bypasses** | dev; loopback/no-XFF; **operator credential — but `operatorBypass` is `&& !isStrict`, so it does NOT apply here** |

### 🔴 IT IS KEYED ON IP. THE THRESHOLD IS THREE PER MINUTE.

**Forty customers on one venue wifi share one `x-forwarded-for` first hop and therefore ONE bucket of three requests per minute.** The page spends **one** on load and **three** if that one fails.

⚠️ **CGNAT makes it worse than a venue wifi**: mobile carriers put thousands of subscribers behind one address, so a customer on 4G at a festival shares a bucket with strangers.

⚠️ **`Retry-After: 300` advertises five minutes** while the window is **one**. Nothing in the client reads the header, so it costs nothing today — but it is wrong.

⚠️ **The manual is wrong about this.** §28 records *"STRICT — 60/min (raised from 3/min, V7.8 §11)"*. **The code is 3**, and its own comment records the reversal.

---

## 11. How a 429 on `/api/events` says "We couldn't load the menu right now"

**Source: QUOTED. 🔴 YES — THE MESSAGE IS RENDERED FROM A FAILURE OF A DIFFERENT FETCH THAN THE ONE IT NAMES. THAT IS A COPY DEFECT ON TOP OF THE LOAD FAILURE.**

### The joining path, in four quoted steps

**STEP 1 — the fetch. `page.tsx:462-463`:**
```tsx
          const res = await fetch(`/api/events?truck=${slug}`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
```
🔴 **A 429 is `!res.ok`, so it throws — identical treatment to a 500. Nothing branches on the status.**

**STEP 2 — three failures set the flag. `:488-498`:**
```tsx
        } catch {
          if (cancelled) return
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, backoffMs[attempt]))
            if (cancelled) return
            continue // retry
          }
          // All attempts exhausted → surface the retry card (no silent blank).
          setEventsError(true)
          setEventLoading(false)
        }
```

**STEP 3 — the flag selects the card. `:1581-1582`:**
```tsx
          ) : eventsError ? (
            eventsRetryCard
```

**STEP 4 — the card names the wrong thing. `:1434-1437`:**
```tsx
  const eventsRetryCard = (
    <div className="mt-3 bg-slate-100 rounded-xl px-4 py-4 text-center">
      <p className="text-slate-600 text-sm font-medium">We couldn&apos;t load the menu right now.</p>
```

### 🔴 THE COPY DEFECT, STATED PLAINLY

| | |
|---|---|
| **What the string says failed** | the **menu** |
| **What actually failed** | 🔴 **`/api/events`** |
| **What the menu did** | ✅ **returned 200 and logged `[MENU API] Returning…`** |
| **The variable's own name** | `eventsRetryCard` |
| **The comment above it** | *"Shown in place of the event card when the **events fetch** failed"* |

🔴 **THE VARIABLE, THE COMMENT AND THE STATE FLAG ALL SAY "EVENTS". ONLY THE USER-FACING SENTENCE SAYS "MENU".**

⚠️ **THE CONFIRMED LOG IS THE PROOF, NOT AN INFERENCE.** In the same fifty seconds the menu returned **200** and its success line was written. **A message naming the menu was displayed while the menu was working.**

⚠️ **The second line compounds it:** *"Please check your connection and tap to retry."* The connection was fine and the server answered — with a refusal. **The copy blames the customer's network for a limit we imposed.**

🔴 **THE COST IS DIAGNOSTIC, AND IT WAS PAID.** This one sentence sent the investigation to `/api/menu` — the route the deploy had just changed — which is exactly the wrong place. **A message that names the wrong subsystem is worse than a generic one**, because it supplies a false lead with an air of specificity.

---

## 12. What fires `/api/events` repeatedly

**Source: QUOTED. 🔴 IT IS A RETRY LOOP, AMPLIFIED BY A RETRY BUTTON. It is NOT a poll and NOT an unstable dependency.**

### There is exactly ONE caller of the public `/api/events`

A repo-wide grep for `api/events` returns 25 hits; **every other one is `/api/events/manage`, `/api/events/action` or `/api/events/affected-orders`** — longer pathnames, so `p === '/api/events'` does not match them and they are **not** on the STRICT tier. **The only caller of the limited path is `page.tsx:462`.**

### The mechanism — `page.tsx:449-503`, QUOTED

```tsx
  useEffect(() => {
    let cancelled = false
    const loadEvents = async () => {
      setEventsError(false)
      setEventLoading(true)
      const backoffMs = [1000, 2000] // waits BEFORE retry attempts 2 and 3
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(`/api/events?truck=${slug}`)
          …
        } catch {
          …
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, backoffMs[attempt]))
            …
            continue // retry
          }
          setEventsError(true)
          setEventLoading(false)
        }
      }
    }
    loadEvents()
    return () => { cancelled = true }
  }, [slug, reloadKey])
```

### 🔴 `backoffMs = [1000, 2000]` IS THE SIGNATURE YOU OBSERVED

**One effect run = THREE requests at t=0, t≈1 s, t≈3 s.** Your log's *"one to two seconds apart, sustained"* **is that array, read back off the wire.**

### Is it a poll, a retry loop, an unstable dependency, or user-driven? — ALL THREE ANSWERS, RULED IN OR OUT

| Candidate | Verdict |
|---|---|
| **A poll** | 🔴 **NO.** The two `setInterval`s in the file are `:420` (a 30 s clock tick, no fetch) and `:558` (a 30 s **`/api/menu`** poll). **Neither touches `/api/events`.** |
| **An unstable effect dependency** | 🔴 **NO.** Deps are `[slug, reloadKey]`. `slug` comes from `const { slug } = use(params)` (`:159`) — a stable string. `reloadKey` is a `useState` number changed in exactly one place. **The effect runs once per mount.** |
| ✅ **A retry loop** | ✅ **YES — 3 requests per run, at 0 s / 1 s / 3 s.** |
| ✅ **User-driven amplification** | ✅ **YES — and this is the multiplier.** |

### 🔴 THE AMPLIFIER: THE RETRY BUTTON FEEDS THE LOOP

**`page.tsx:1438-1444`:**
```tsx
      <button
        onClick={() => setReloadKey(k => k + 1)}
        disabled={eventLoading}
        …
        {eventLoading ? 'Retrying…' : 'Retry'}
      </button>
```

🔴 **`setReloadKey` is in the effect's dependency array. Every tap re-runs `loadEvents` — THREE more requests into a bucket that is already empty.** The button is disabled only for the ~3 s the loop is running, so it can be tapped roughly every three seconds, indefinitely.

⚠️ **THE REMEDY THE UI OFFERS MAKES THE CONDITION WORSE AND CANNOT SUCCEED UNTIL THE WINDOW SLIDES.** The card invites a tap; the tap guarantees three more 429s; the card returns. **A customer following the instruction on screen is generating the failure they are trying to clear.**

### The arithmetic against your eight

**INFERRED**, from the quoted constants and your log:

```
  mount 1 (200 on /trucks/test-kitchen/order)   → 3 requests   t=0, 1, 3
  mount 2 (the second 200 in the log)           → 3 requests
  one Retry tap                                 → 3 requests
  ───────────────────────────────────────────────────────────
                                                  9 attempted
  minus those that succeeded before the bucket emptied  → 8 × 429 observed
```

✅ **Two page loads plus one or two Retry taps reproduces eight 429s in fifty seconds exactly.** ⚠️ **Not established** how many taps there actually were — the client logs nothing on this path (`} catch {` is bare) and the 429s carry no body we record.

### ⚠️ One more thing the code does not do

🔴 **The in-flight `fetch` is NOT abortable.** `cancelled` is checked *after* each `await`, so a fast unmount-remount leaves the previous run's request in flight — **already sent, already counted.** No `AbortController` on this fetch, unlike `useVillageData`'s.

---

## Addendum — quoted vs inferred

| § | Status |
|---|---|
| 10 | **QUOTED** — limiter, predicate, key derivation, application block, 429 body. The venue-wifi/CGNAT consequence is **INFERRED** from the quoted IP key |
| 11 | **QUOTED** — all four steps. The copy defect is **QUOTED** (variable name, comment and string disagree) and **CONFIRMED** by your 200 on `/api/menu` |
| 12 | **QUOTED** — the loop, the backoff array, the deps, the button, and the negative search establishing one caller. The 3+3+3 arithmetic is **INFERRED** |
