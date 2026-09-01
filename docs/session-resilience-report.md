# Session refresh resilience — never sign an operator out involuntarily

**Build only.** Nothing committed, pushed or deployed. No Supabase project setting was changed. No
token-based access check was altered. `app/kds/[kds_token]/page.tsx` and `app/app/page.tsx` are untouched
— both verified `git diff` clean. **No new Supabase client was constructed** (grep for
`createClient|createBrowserClient|createServerClient` in both new files returns **0**).

**Prompt integrity:** no span arrived garbled and no instruction contradicted another.

## Which of the three I did — plainly

| | |
|---|---|
| **Parse** | ✅ **Yes.** `ts.transpileModule` on the observer (to execute it) and on `proxy.ts` — **0 diagnostics**. |
| **Typecheck** | ❌ **No.** `tsc --noEmit` was not run. `transpileModule` type-checks nothing. |
| **Execution** | ✅ **Yes.** The real observer module was **run**, ten cases. Table in §Proof. |

🔴 **NO REAL SESSION EXPIRY HAS BEEN OBSERVED, AND NOTHING HAS BEEN TESTED ON A DEVICE.** No tablet, no
emulator, no browser. Every event in the proof is a **simulated** call into the real module's handler. No
UI was rendered.

**Five files: two new, three edited.**

```
 ?? lib/auth/session-observer.ts            (new)
 ?? components/auth/SessionAlertBanner.tsx  (new)
  M app/layout.tsx                          (+5)
  M lib/native/signOut.ts                   (+9)
  M proxy.ts                                (the redirect condition)
```

---

# PHASE 1 — READ AND REPORT

## 1. Every Supabase browser client, with its auth options and storage adapter

**Four. Three can hold a user session; one is service-role.**

**(a) `lib/supabase/client.ts` — WEB, cookies.** Complete:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**No auth options passed.** Adapter: `@supabase/ssr`'s cookie storage.

**(b) `lib/supabase/server.ts` — WEB server-side, cookies.** Adapter is explicit, `:10-21`:

```ts
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
```

**(c) `lib/native/session.ts:19-25` — NATIVE, `@capacitor/preferences`.** The only one with options:

```ts
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'hg-native-auth', storage: preferencesAuthStorage } },
    )
```

Adapter: `lib/native/preferencesStorage.ts:14-25`, `Preferences.get/set/remove`.

**(d) `lib/supabase-browser.ts` — see §2.** No options; library defaults.

*(`lib/supabase.ts` and `app/verify-email/page.tsx` also call `createClient`, but with
`SUPABASE_SERVICE_ROLE_KEY` server-side. No user session.)*

## 2. 🔴 What `lib/supabase-browser.ts` is for — and whether it is needed

The whole file:

```ts
import { createClient } from '@supabase/supabase-js'

export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

**Two importers, both operator surfaces:**
- `app/dashboard/[token]/page.tsx:54` — Realtime channels (`:1182` orders, `:1187` truck), one anon read (`:1148`)
- `app/dashboard/[token]/kds/page.tsx:25` — Realtime channels (`:996`, `:1018`), one anon read (`:1057`)

**Purpose: Realtime subscriptions and a couple of anon-key reads. Nothing authenticates against it.**

**Its options are the library defaults**, read from `GoTrueClient.js:19-24`: `autoRefreshToken: true`,
`persistSession: true`, `detectSessionInUrl: true`, **default storage = localStorage**.

### Does it hold a session today?

**Almost certainly not — but "almost" is the problem.**

- ❌ **Nothing writes a session to localStorage.** Login uses the cookie client (`app/login/page.tsx:31`)
  or the native client. So the localStorage slot is empty and the client has no session, no refresh timer
  and no refresh token.
- ⚠️ **BUT `detectSessionInUrl: true`.** It is a module-level singleton constructed on import — i.e. on
  the dashboard and the KDS. Any load of those pages carrying auth tokens in the URL fragment would make
  it **parse, adopt and persist a session to localStorage**, at which point it becomes a fourth auth
  store with its own refresh timer.
- 🔴 **And localStorage is the store `lib/native/preferencesStorage.ts:3-7` documents as unreliable in
  this WebView** — *"the web view can hand back a fresh/empty localStorage"*.

### Is it needed? **No — stated plainly.**

Its importers need **Realtime and anon reads**, both of which
`createSupabaseBrowserClient()` provides. The only reason to keep a separate client is to avoid
Realtime attaching the operator's JWT to the socket — a deliberate choice, but **nothing in the file or
its call sites says so**, so it reads as an accident rather than a decision.

⚠️ **NOT CHANGED HERE.** Retiring it means touching two large operator pages and their Realtime wiring,
which is outside this task's scope. **Recommended as its own small change, with the caveat that swapping
the client alters what credential the Realtime socket presents — a behaviour change to verify, not a
find-and-replace.**

## 3. `proxy.ts`'s `getUser()`, and which requests it runs on

`proxy.ts:189-190`:

```ts
  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser()
```

**It runs on essentially every request.** The matcher, `:331-335`:

```ts
export const config = {
  matcher: [
    '/((?!_next_next/image|favicon.ico|apple-touch-icon.png|logos|photos|sw.js|manifest.json|offline.html).*)',
  ],
}
```

A negative lookahead excluding eight static paths. **Every page, every `/api/*` call, every RSC payload
fetch** triggers a `getUser()` — and `:193` records that it **rotates** an expired token.

## 4. What the dashboard and KDS do TODAY on a 401

**They do NOT surface a session problem, and they do not retry.**

**KDS**, `kds/page.tsx:528-537`:

```ts
      if (res.status === 401) {
        if (data.requiresPin) {
          setRequiresPin(true)
          setLoading(false)
          return
        }
        throw new Error(data.error ?? 'Unauthorized')
      }

      if (!res.ok) throw new Error('Failed to fetch')
```

**A 401 becomes a generic thrown Error** carrying the server's message (`'Invalid token'`).

**Dashboard**, `page.tsx:926` and `:935`:

```ts
      if(res.status===401){if(data.requiresPin){setRequiresPin(true);setLoading(false);return};setError('Invalid access link');setLoading(false);return}
```
```ts
      if(!res.ok){if(authenticatedRef.current){console.warn('[fetchAll] dashboard fetch failed:',res.status,'— keeping existing state')}else{setError(data.error||'Failed to load')};setLoading(false);return}
```

🔴 **A 401 renders "Invalid access link" — which is about the TOKEN, not the session, and would be
actively misleading during an auth failure.** ✅ **But `:935` already contains the instinct this task
formalises:** once authenticated, a failed fetch logs and **keeps existing state** rather than wiping the
screen. **That precedent is the model; this work extends it from fetch failures to auth failures.**

## 5. 🔴 What the KDS would lose on a navigation to /login

**Almost everything on screen. This is why the bounce had to go.**

**IN MEMORY — lost on any navigation.** `app/dashboard/[token]/kds/page.tsx` declares **68**
`useState`/`useRef` values. They include the loaded order set, the selected event, per-order UI state,
the buzzer assignments in flight, the pending-print set, scroll position, and every modal's state.

**PERSISTED — survives.** Ten `localStorage` keys, all *preferences*, not work:

```
  hg_kds_view_${token}        hg_kds_layout_${token}      hg_kds_cardmode_${token}
  hg_kds_sound_${token}       hg_kds_payments_${token}    hg_kds_readystep_${token}
  hg_kds_keepawake_${token}   hg_keepawake_${token}       hg_soundcfg_${token}
  hg_demo_kds_intro_${token}
```

⚠️ **The offline outbox (`lib/native/outbox.ts`, Capacitor Preferences) also survives** — queued order
actions are durable. **But the board itself is not.**

🔴 **So a mid-service bounce costs the operator the live board and every in-flight interaction, and
returns them to a screen that must re-fetch everything — at the moment they are busiest.** The
preferences surviving is no consolation.

---

# PHASE 2 — WHAT WAS BUILT

## The observer — `lib/auth/session-observer.ts` (new)

**One module, subscribing once**, handling the three events explicitly:

```ts
  client.auth.onAuthStateChange((event) => {
    switch (event) {
      case 'TOKEN_REFRESHED':
        publish(null)
        return

      case 'SIGNED_IN':
        publish(null)
        return

      case 'SIGNED_OUT': {
        if (userInitiatedSignOut) return
        void (async () => {
          const ok = await attemptRecovery(client)
          if (ok || userInitiatedSignOut) { publish(null); return }
          publish({ reason: 'signed_out_involuntary', recovered: false })
        })()
        return
      }

      default:
        return
    }
  })
```

⚠️ **It subscribes to the client for the runtime it is in** — `getNativeSupabase()` natively (Preferences,
`hg-native-auth`), `createSupabaseBrowserClient()` on web (cookies). **Both already existed.**

## How a user-initiated sign-out is distinguished — **declared, not inferred**

🔴 **auth-js fires an identical `SIGNED_OUT` for both. Nothing on the event separates them**, so the
difference is stated by the control that causes it. `lib/native/signOut.ts` is the **single** sign-out
path (UserMenu, manage, admin all route through `operatorSignOut`), and it now declares intent first:

```ts
  // ── 🔴 DECLARE THE INTENT BEFORE CAUSING THE EVENT. ──────────────────────────────────────────────
  // auth-js fires an identical `SIGNED_OUT` for this and for a rejected refresh token; nothing on the
  // event distinguishes them, so the difference has to be stated, not inferred. This is the ONLY caller
  // of beginUserSignOut(), and this function is the ONLY sign-out control (UserMenu, manage, admin all
  // route through it) — so "flag set" and "the operator asked" are the same fact.
  // ⚠️ BEFORE the await, not after: the event fires during signOut(), so setting it afterwards would
  // race the observer and show a banner on the way out the door.
  beginUserSignOut()
```

⚠️ **A module flag, not `sessionStorage`** — the event fires in the same JS context during the `await`,
before either the hard `window.location` (web) or the `router.replace` (native). A storage round-trip
would add a private-mode throw to a path whose job is certainty. **The flag is deliberately not cleared
on a timer:** if a sign-out never completes, the residue is "we think they meant to" — no banner, the
quiet failure.

## The recovery schedule, and why

```ts
const RECOVERY_DELAYS_MS = [2_000, 10_000, 45_000] as const
```

**Reasoning, from the file:** auth-js already retried the *network* case internally with 200/400/800ms
backoff bounded at `AUTO_REFRESH_TICK_DURATION_MS = 30s` (`GoTrueClient.js:3865-3881`). Anything under
~30s duplicates work the library has already done and failed at. These cover what the library does
**not** retry: a tablet whose wifi dropped and is coming back. **2s** catches an instant blip, **10s** an
AP reconnect, **45s** a genuine outage that resolves. Total **~57s**, then it stops — *"a client that
retries forever against a revoked token is a client hammering the auth server on every tablet at once."*

### ⚠️ What a recovery attempt can and cannot do — stated honestly in the code

By the time `SIGNED_OUT` arrives, auth-js has **already** run `_removeSession()` and cleared this
client's slot. **So this cannot resurrect a session from a refresh token we no longer hold.** What it
*can* recover is the slot being **repopulated by someone else** in the meantime — the proxy writing a
rotated cookie pair (`proxy.ts:203-206` `carrySessionCookies`), or another tab refreshing successfully.
**That is a real shape in a multi-tab operator setup, and it is the only shape a client-side recovery can
honestly claim.**

## The banner — `components/auth/SessionAlertBanner.tsx` (new)

🔴 **It never navigates.** `<a href="/login">`, not `router.push` — the choice is the operator's, it
looks like a link, and it works even if the router is in a bad state. Non-blocking by construction:
`fixed` + `pointer-events-none` on the wrapper, re-enabled on the bar, **bottom** so it cannot cover an
order row under the sticky headers.

**The copy deliberately does not say "you have been signed out"** — from the operator's point of view
they have not been; the screen is still theirs and still working:

> **Your sign-in needs attention**
> Everything on screen is still here. New changes may not save until you sign in again.

## Mounted once, at the app boundary — `app/layout.tsx`

```jsx
        <CSPostHogProvider>
          {children}
          <SessionAlertBanner />
        </CSPostHogProvider>
```

⚠️ **Harmless on customer pages:** with no session, no `SIGNED_OUT` can fire, so it renders `null`.

## The proxy — the distinction implemented

```ts
  const hasStaleButRealSession = hasOperatorSession
  if (isProtected && !user && !isNativeApp && !hasStaleButRealSession) {
```

**The distinction, quoted from the comment above it:**

> **THE DISTINCTION IS THE PRESENCE OF THE CREDENTIAL, NOT ITS VALIDITY.** `hasOperatorSession` (line 107,
> already computed above for the rate-limiter's operator bypass — **reused, not reimplemented**) tests for
> an `sb-<ref>-auth-token` cookie. A browser that never signed in has none. A browser whose refresh failed
> still has one, because auth-js clears it CLIENT-SIDE and the request that raced that clear still carries
> it.

⚠️ **It is deliberately NOT a validity check and must not become one.** It answers *"did someone sign in
on this browser at some point"* — exactly the question separating a first-time visitor from an operator
having a bad minute.

⚠️ **This is not a weakening of access control.** The edge redirect was never the boundary — `proxy.ts:220`
puts `/api` on the public list, so the API was always reachable without it.

✅ **`app/app/page.tsx`'s cold-launch bounce is UNCHANGED**, as instructed — verified `git diff` clean.
A cold launch with no session is not a mid-service logout.

---

# PROOF BY EXECUTION

**The real module, transpiled from disk and run in a `vm` with stubbed clients.** `setTimeout` in the
sandbox fires on `setImmediate`, so **the real 2s/10s/45s schedule is traversed in order** — each sleep
still awaits a tick — **without the wall-clock wait**. The backoff column shows the delays actually
requested.

```
================================================================================================================
session-observer.ts — REAL MODULE, EXECUTED
================================================================================================================
  PASS  1  TOKEN_REFRESHED → no banner
        got: null
        getSession calls=0 (no recovery attempted)
  PASS  2  SIGNED_OUT involuntary, recovery fails → BANNER
        got: {"reason":"signed_out_involuntary","recovered":false}
        recovery attempts=3, backoff=[2000,10000,45000]
  PASS  3  SIGNED_OUT involuntary, recovery SUCCEEDS → no banner
        got: null
        recovery attempts=2 (stopped early), backoff=[2000,10000]
  PASS  4  SIGNED_OUT user-initiated → no banner, NO recovery
        got: null
        getSession calls=0 (must be 0 — never touched the network)
  PASS  5  banner → TOKEN_REFRESHED clears it
        got: [true,null]
  PASS  6  banner → SIGNED_IN clears it
        got: null
  PASS  7  user signs out mid-recovery → no banner
        got: null
        the post-recovery re-check of the flag
  PASS  8  INITIAL_SESSION/USER_UPDATED/PASSWORD_RECOVERY ignored
        got: {"reason":"signed_out_involuntary","recovered":false}
        getSession calls=3 (no extra recovery triggered)
  PASS  9  startSessionObserver() idempotent
        got: 1
  PASS  10 native runtime subscribes exactly once
        got: 1
        via getNativeSupabase(), not the cookie client

  10/10 pass
```

**The three the brief named, read directly:** case 1 (TOKEN_REFRESHED → no banner, no network),
case 2 (involuntary SIGNED_OUT → recovery attempted three times on the real schedule, then the banner),
case 4 (user-initiated → **no banner and zero `getSession` calls** — it never touches the network,
proving the flag short-circuits before recovery).

⚠️ **Case 7 is the one worth noting**: the operator pressing Sign out *during* the 57-second recovery
window produces no banner, because the flag is re-checked after recovery returns.

---

## What remains unverified

1. 🔴 **NO REAL SESSION EXPIRY HAS BEEN OBSERVED. NOTHING HAS BEEN TESTED ON A DEVICE.** No tablet, no
   emulator, no browser, no real Supabase. Every event above was injected into the module's handler.
2. 🔴 **NO UI HAS BEEN RENDERED.** The banner's placement, its non-blocking behaviour and its appearance
   over the KDS board are read from JSX, **not seen**.
3. **No typecheck and no build.** `tsc --noEmit` and `next build` were not run. The parse is clean
   (0 diagnostics on `proxy.ts` and the observer) but a parse is not a typecheck.
4. 🔴 **THE PROXY CHANGE WAS NOT EXECUTED.** Its condition was parsed and `hasOperatorSession` confirmed
   in function scope (declared `:107`, used `:258`), but no request was routed through it.
5. ⚠️ **The recovery path's real-world hit rate is unknown.** It can only succeed when another context
   repopulated the storage slot; **I have not measured how often that happens.** In the common
   single-tab case it will exhaust all three attempts and show the banner — which is the correct
   outcome, just not a recovery.
6. ⚠️ **`lib/supabase-browser.ts` was left in place** — §2 argues it is unnecessary, but retiring it
   changes what credential the Realtime socket presents and belongs in its own change.
7. **Supabase project settings were not touched or read**, as instructed.
