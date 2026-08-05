# iPad white screen — is the native server path responding differently?

**Date:** 5 August 2026. **Read-only.** Nothing changed. No `cap sync`, no `next dev`, no `next build`.
Target: `http://192.168.50.104:3000/app` — the dev server on this Mac's en0 address, which is the URL baked into `ios/App/App/capacitor.config.json`.

---

## THE ANSWER

**The two responses are IDENTICAL. The native path is not responding differently — because for `/app` there is no native path.**

`/app` is not on `proxy.ts`'s protected list, so the `isNativeApp` branch is **never reached** for this URL. The UA marker is inert here. Whatever is white-screening the iPad, **it is not a server-side divergence at `/app`**, and the premise that a different server path is selected for this URL does not hold.

---

## 1. The two requests

### Request 1 — no marker (Safari-like)

```
curl -s -D - -o /dev/null --max-time 5 http://192.168.50.104:3000/app
```

```
HTTP/1.1 200 OK
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding
link: </_next/static/media/797e433ab948586e-s.p.29207c2f.woff2>; rel=preload; as="font"; crossorigin=""; type="font/woff2", </_next/static/media/caa3a2e1cccd8315-s.p.3b6cae6d.woff2>; rel=preload; as="font"; crossorigin=""; type="font/woff2"
Cache-Control: no-store, must-revalidate
X-Powered-By: Next.js
Content-Type: text/html; charset=utf-8
Date: Wed, 05 Aug 2026 15:15:40 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked
```

curl exit **0**.

### Request 2 — with `HatchGrabNativeApp`

```
curl -s -D - -o /dev/null --max-time 5 -A "Mozilla/5.0 HatchGrabNativeApp" http://192.168.50.104:3000/app
```

```
HTTP/1.1 200 OK
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding
link: </_next/static/media/797e433ab948586e-s.p.29207c2f.woff2>; rel=preload; as="font"; crossorigin=""; type="font/woff2", </_next/static/media/caa3a2e1cccd8315-s.p.3b6cae6d.woff2>; rel=preload; as="font"; crossorigin=""; type="font/woff2"
Cache-Control: no-store, must-revalidate
X-Powered-By: Next.js
Content-Type: text/html; charset=utf-8
Date: Wed, 05 Aug 2026 15:15:40 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked
```

curl exit **0**.

### Difference: none that matters

**Status line, every header, and every header value are byte-for-byte identical**, including `Content-Type`, `Cache-Control` and the `link` preload set. Both served within the same second.

I also compared the response **bodies**, which the requested command discards:

| | No marker | With marker |
|---|---|---|
| Body size | 27,612 bytes | 27,646 bytes |
| Rendered visible text | `Loading…` (29 chars) | `Loading…` (29 chars) |

The 34-byte delta is entirely **per-request dev-server artifacts** — the `self.__next_r` request id (`832lkWCIrjC4SK1wsRRhs` vs `r9-VGxpjovp68DYtD25Yc`) and Turbopack HMR flight-payload ordering. **No application content differs.** Two requests without the marker would differ by the same class of noise.

---

## 2. Why they are identical — `/app` is not protected

`proxy.ts:142`:

```ts
const isProtected =
  (pathname.startsWith('/dashboard') && !isDemoDashboard(pathname)) ||
  pathname.startsWith('/manage')
```

**`/app` matches neither.** The marker is read at `:164` and consumed at `:166`:

```ts
const isNativeApp = (request.headers.get('user-agent') || '').includes('HatchGrabNativeApp')
if (isProtected && !user && !isNativeApp) { /* 307 to /login */ }
```

With `isProtected === false` the whole condition short-circuits before `isNativeApp` is used. **For `/app`, marker and no-marker traverse the same code.**

### ✅ `proxy.ts` IS live — verified, not assumed

I did not want to report "identical" without excluding "the middleware is not running at all", so I tested a route that **is** protected:

| Request | Result |
|---|---|
| `/dashboard`, **no marker** | **`307 Temporary Redirect`** → `location: /login?next=%2Fdashboard` |
| `/dashboard`, **with marker** | **`200 OK`** |

**The marker works exactly as designed** — it defers the auth guard on a protected route. The mechanism is healthy; it simply has no bearing on `/app`.

---

## 3. 🔴 What I could NOT do — the dev server logs

**I cannot read what the dev server logged while those requests were served, and I am not going to invent it.**

- The server is **your** process: `next-server (v16.1.6)`, PID 95211, attached to **`ttys003`** — a terminal I have no channel to. Its stdout goes to your window.
- There is a `devserver.log` in the repo root, but it is **407KB dated 22 June** — a stale artifact from a previous run, not this one. Reporting from it would be reporting on a different server on a different day.
- I did not restart, tee or attach to the process, because that would have violated the standing rule that Cursor never touches your dev server (manual §22 / §27).

**What to do instead:** the two requests are timestamped **15:15:40 GMT** and the two `/dashboard` probes at **15:16:32 GMT**. Look at your terminal around those marks. What matters is whether anything was logged at all — four requests were served and all four returned cleanly, so I would expect routine compilation lines and no errors.

---

## 4. 🔴 WHERE THE WHITE SCREEN ACTUALLY IS

The server is returning a correct 200 with a correct shell to both clients. **`/app` renders `Loading…` and nothing else** — by design:

```tsx
// app/app/page.tsx — 'use client'
return (
  <div className="min-h-screen bg-slate-900 flex items-center justify-center">
    <p className="text-white/70 text-sm font-medium animate-pulse">Loading…</p>
  </div>
)
```

**Everything that decides where the app goes runs in a `useEffect` on the client**, and every branch ends in `router.replace(...)`:

| Branch | Destination |
|---|---|
| `!isNativeApp()` | `/dashboard` |
| no native session / no JWT | `/login` |
| device pinned to a truck | that truck's dashboard or KDS |
| `is_admin` | `/admin` |
| has trucks | `trucks[0]` dashboard |
| no permitted truck | `/login` |
| **`catch`** | `/login` |

⚠️ **A white screen is what this page looks like when that effect never completes** — the shell is `bg-slate-900`, so a true "white" screen is more likely *before* the shell paints than after. Three candidates, none of which a curl can distinguish and all of which are client-side:

1. **The JS bundle never loads or throws.** The HTML arrives (proven above), but if the client chunks fail the effect never runs and nothing redirects. On a device this is a blank page with a healthy 200 behind it.
2. **`isNativeApp()` / `hasNativeSession()` rejects at the native layer.** These call Capacitor Preferences. Manual §35 records that **a JS `try`/`catch` does not protect against a native throw** — and the `catch` here wraps only the `fetch`, not the two `await`s above it at lines 29-31.
3. **The build on the device predates the config.** DerivedData's active tree was last written **3 Aug 12:57**; `capacitor.config.json` was baked **3 Aug 12:53**; the last three commits are **4-5 Aug**. So whatever is installed is from 3 August and cannot contain anything from the last two days.

**The next diagnostic is Safari Web Inspector attached to the iPad WebView** (Develop → device → the app). The console will show whether the bundle loaded and whether the effect threw — neither of which is visible from this side. Nothing further can be learned by curling the server, because the server is behaving correctly.

---

## SUMMARY

| Question | Answer |
|---|---|
| Do the two responses differ? | **No.** Identical status line and identical headers; bodies differ only by per-request dev ids |
| Is the native path responding differently? | **No — and for `/app` there is no native path.** `isProtected` excludes it, so the marker is never consulted |
| Is the marker mechanism broken? | **No.** Proven working on `/dashboard`: 307 without, 200 with |
| Did the dev server log errors? | 🔴 **Unknown — I have no access to its output.** Stale `devserver.log` (22 June) is not this run. Timestamps to check: 15:15:40 and 15:16:32 GMT |
| Where is the fault, then? | **Client-side, after a healthy 200.** `/app` is a `'use client'` shell whose entire routing lives in a `useEffect` |
