# "Orders dashboard" from Manage — two controls, one label, two failures

Date: 14 August 2026 · physical iPad13,19, iOS 26.6, native app
**READ-ONLY DIAGNOSIS. No edits, no commits, no builds, no deploys. Nothing proposed.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

# 🔴 THE HEADLINE — THE SAFARI EJECTION IS EXPLAINED, AND IT IS NOT WHAT ANYONE THOUGHT

**`server.url` ends in a PATH, and Capacitor's navigation policy compares by STRING PREFIX, not by
origin.**

**READ, `node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift:101-115`:**
```swift
        // otherwise, is this a new window or a main frame navigation but to an outside source
        let toplevelNavigation = (navigationAction.targetFrame == nil || navigationAction.targetFrame?.isMainFrame == true)

        // Check if the url being navigated to is configured as an application url (whether local or remote)
        let isApplicationNavigation = navURL.absoluteString.starts(with: bridge.config.serverURL.absoluteString) ||
            navURL.absoluteString.starts(with: bridge.config.localURL.absoluteString)

        if !isApplicationNavigation, toplevelNavigation {
            // disallow and let the system handle it
            if UIApplication.shared.applicationState == .active {
                UIApplication.shared.open(navURL, options: [:], completionHandler: nil)
            }
            decisionHandler(.cancel)
            return
        }
```

**And the baked config, READ from `ios/App/App/capacitor.config.json`:**
```
  server.url  : https://www.hatchgrab.com/app
  dashboard   : https://www.hatchgrab.com/dashboard/<token>
  manage      : https://www.hatchgrab.com/manage/<token>
```

> ## 🔴 `"https://www.hatchgrab.com/dashboard/…".starts(with: "https://www.hatchgrab.com/app")` IS **FALSE**.
> ## Every TOP-LEVEL navigation to any path outside `/app` is cancelled and handed to `UIApplication.shared.open` — **which is Safari.**

**And the escape hatch is not configured:** `shouldAllowNavigation(to: host)` iterates
`allowedNavigationHostnames`, and 🔴 **`allowNavigation` is NOT FOUND in `capacitor.config.ts` or the
baked JSON** — so that list is empty and returns `false` for every host, **including our own**.

🔴 **THE APP IS SAME-ORIGIN WITH ITSELF AND STILL TREATED AS "AN OUTSIDE SOURCE", BECAUSE THE COMPARISON
IS A PREFIX MATCH ON A URL THAT INCLUDES `/app`.** ✅ **Soft navigation (`router.push`) is unaffected** —
it never creates a `navigationAction`, so this policy is never consulted. **That is why some controls
work and others eject.**

---

# PART A — THE CONTROL

## A1. 🔴 THERE ARE **TWO** CONTROLS WITH THE SAME LABEL, AND THEY ARE DIFFERENT ELEMENTS

⚠️ **"Order dashboard" as a literal string: NOT FOUND. The label is "← Orders dashboard"**, and it
exists twice.

### Control 1 — the manage header. `app/manage/[token]/page.tsx:562-565`
```tsx
        <AppLink href={`/dashboard/${token}`}
          className="text-xs text-slate-400 hover:text-orange-400 font-bold transition-colors hidden sm:block">
          ← Orders dashboard
        </AppLink>
```
**`hidden sm:block` ⇒ visible at ≥640px only.**

### Control 2 — the UserMenu dropdown. `components/dashboard/UserMenu.tsx:211-219`
```tsx
            {/* Orders dashboard link — mobile only (desktop header already has it) */}
            {showDashboardLink && (
              <a
                href={`/dashboard/${token}`}
                className="sm:hidden flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 w-full"
              >
                ← Orders dashboard
              </a>
            )}
```
**`sm:hidden` ⇒ visible below 640px only.** Rendered on manage because `page.tsx:568` passes
`showDashboardLink`.

## A2. The exact elements — **and they are NOT the same mechanism**

| | Control 1 (header) | Control 2 (UserMenu) |
|---|---|---|
| Element | **`AppLink`** | 🔴 **a RAW `<a href>`** |
| `<Link>`? | no | **no** |
| `window.open`? | no | no |
| `target="_blank"`? | no | no |
| Native behaviour | `e.preventDefault(); router.push(href)` | 🔴 **a full top-level document navigation** |

**`AppLink`'s interception, READ (`components/native/AppLink.tsx:25-41`):**
```tsx
  const router = useRouter()
  return (
    <a
      {...rest}
      href={href}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented) return
        if (isNativeApp()) {
          e.preventDefault()
          router.push(href)
        }
      }}
    >
```

## A3. 🔴 CONTROL 2 IS **UNGATED**. Stated plainly.

**`isNativeApp` IS imported in `UserMenu.tsx:8` and used elsewhere in that file — but NOT on this
link.** There is no `isNativeApp()`, no `onClick`, no interception: **it is a bare anchor.**
✅ **Control 1 is gated**, inside `AppLink`.

## A4. Every navigation that leaves manage

| file:line | Target | Element | Gated? |
|---|---|---|---|
| `manage/page.tsx:455` | `/dashboard/${token}` — **staff auto-redirect** | `router.replace` | ✅ **soft nav, never consults the policy** |
| `manage/page.tsx:562` | `/dashboard/${token}` | `AppLink` | ✅ **YES** |
| 🔴 `UserMenu.tsx:214` | `/dashboard/${token}` | **raw `<a>`** | 🔴 **NO** |
| `UserMenu.tsx:~205` | `/manage/${token}` | `Link` | ⚠️ soft nav — same-page anyway |
| `UserMenu.tsx:~222` | `/admin` | `Link` | ⚠️ soft nav |
| `manage/page.tsx:1183`, `:1735` | external (schedule URL, "View original card") | `<a target="_blank">` | ❌ ungated — **CORRECT; these should leave the app** |
| `manage/page.tsx:9257` | `qrDataUrl` (a `data:` URI download) | `<a href>` | ⚠️ not a route |
| `manage/page.tsx:10164` | `?tab=billing` | `<a href>` | ⚠️ **same-document query change** |

🔴 **Exactly ONE ungated internal route navigation on manage: `UserMenu.tsx:214`.**

---

# PART B — FAILURE (a): THE SAFARI ATTEMPT

## B1. It is **not** a `window.open`, and it does not need to be

**A2 found no `window.open` and no `target="_blank"` on either control.** ⚠️ **So the mechanism from
`docs/kds-navigation-report.md` — `createWebViewWith` → `UIApplication.shared.open` — is NOT the one
that fired here.** **A different function in the same file is.**

## B2. How Safari opens without a `window.open` — **`decidePolicyFor`, quoted in the headline**

**The chain, all READ:**
1. A raw `<a href="/dashboard/…">` is tapped → **a real top-level navigation**, so
   `toplevelNavigation == true`.
2. `shouldAllowNavigation(to: "www.hatchgrab.com")` → **`allowedNavigationHostnames` is empty**
   (`allowNavigation` NOT FOUND in either config) → **false**.
3. `isApplicationNavigation` = does the URL **start with** `https://www.hatchgrab.com/app`? →
   🔴 **NO** — it starts with `https://www.hatchgrab.com/dashboard`.
4. → `UIApplication.shared.open(navURL)` → **Safari**, and `decisionHandler(.cancel)`.

✅ **This reproduces the observation exactly, including offline: Safari opens and then fails to load,
because the device has no connectivity.** ⚠️ **The Safari attempt has NOTHING to do with being offline —
it would happen online too. Offline merely made it visible as a failure rather than a working
hand-off.**

## B3. 🔴 SAME ORIGIN, DIFFERENT PATH — and the path is what decides

```
  server.url  : https://www.hatchgrab.com/app
  manage      : https://www.hatchgrab.com/manage/<token>
  dashboard   : https://www.hatchgrab.com/dashboard/<token>
```
**Same scheme, same host, same port. Cross-origin is NOT the issue.** 🔴 **Capacitor's check is
`absoluteString.starts(with:)` against a serverURL that carries `/app`, so every sibling path in our own
app is "an outside source".**

⚠️ **CONSEQUENCE WORTH STATING: `/manage` itself is also outside `/app`.** Every top-level navigation
into manage, the KDS, admin or the dashboard has the same exposure. **Only soft navigation and the
initial load are safe — which is why the shell works at all.**

---

# PART C — FAILURE (b): NOTHING HAPPENS WHEN ONLINE

## C1. 🔴 THE CONTROL IS NOT DISABLED, HIDDEN OR NO-OP'D WHEN OFFLINE. **There is no condition.**

**Control 1, quoted in full at A1** — its className is layout only (`hidden sm:block`), there is no
`disabled`, no `isOffline &&`, no conditional render. **Control 2 likewise.**

🔴 **So C1's premise does not hold, and the brief's own note — *"being blocked offline may itself be
correct - settings are locked offline"* — does not apply to this control. Nothing blocks it.**

## C2. **The question has no subject: there is no condition to clear.**

⚠️ **And that MATTERS, because it eliminates the most attractive hypothesis.** A stuck `isOffline` flag
would have been the neat explanation for "nothing happened after reconnecting" — **and it cannot be,
because manage has no such flag.**

## C3. 🔴 MANAGE USES **NONE** OF §35's THREE DETECTORS. A fourth state: no detector at all.

**Searched `app/manage/[token]/page.tsx` for all of them:**

| Detector | Present? |
|---|---|
| `lib/native/reachability.ts` — `onReachabilityChange` / `startReachability` / `isOnline` | 🔴 **NOT FOUND** |
| `lib/native/network.ts` — `getNetworkStatus` / `addNetworkListener` | 🔴 **NOT FOUND** |
| `navigator.onLine` as state | 🔴 **NOT FOUND as state** |
| `isOffline` (any) | 🔴 **NOT FOUND** |

**The single occurrence of any of them, `:324-329`:**
```
  // nothing. navigator.onLine guard so a GENUINE connectivity loss on Manage still lets the van pause
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
```
⚠️ **A one-line guard INSIDE a heartbeat function — not state, not subscribed, and it re-renders
nothing.**

🔴 **So the manage page never learns that connectivity changed.** §35's N8 records three mechanisms
answering one question; **manage answers it with none.**

## C4. What could be failing silently — 🔴 **`router.push` is the candidate, and it fails without a sound**

Control 1 (the one visible on an iPad — see D1) does:
```tsx
          e.preventDefault()
          router.push(href)
```
**`e.preventDefault()` runs FIRST and unconditionally cancels the browser navigation.** Then
`router.push` attempts a client-side navigation, which in the App Router **fetches an RSC payload for
the destination**.

🔴 **`router.push` RETURNS `void` AND ITS PROMISE IS NOT AWAITED, so a failed fetch has nowhere to
surface.** There is **no `.catch`, no error state and no fallback to `window.location`**. ⚠️ **INFERRED,
not verified: after an offline period the router's cache holds a failed/aborted entry for
`/dashboard/[token]`, the refetch fails or is served from that poisoned entry, and the result is exactly
what was reported — the anchor's default is cancelled and nothing replaces it.**

✅ **This is the ONLY code path on that control that can produce "nothing at all"**, because the default
navigation is already cancelled by the time anything can go wrong.

## C5. What the handler depends on — **and it is less than you'd fear**

`AppLink`'s handler reads **only** `isNativeApp()` (a synchronous `Capacitor.isNativePlatform()`) and
`router` from `useRouter()`. 🔴 **It reads NO token, NO Supabase session and performs NO async work of
its own.** So a stale session cannot make *this* handler return early.

⚠️ **BUT the DESTINATION does.** `/dashboard/[token]` is a client component that authenticates on mount;
§40 records its `loading` state starting `true` with an early-return. **INFERRED: if `router.push`
succeeded and the destination then failed to authenticate after the offline period, the operator would
see a spinner or a bounce — not "nothing".** **"Nothing at all" points at the navigation never
starting, which is C4.**

---

# PART D — IS THIS THE SAME AS THE KDS EJECTION?

## D1. 🔴 DIFFERENT MECHANISMS. **Proven by element type, not assumed.**

| Surface | Control | Mechanism |
|---|---|---|
| **Dashboard → KDS** | `<button onClick={handleOpenKDS}>` → `openKDS` | `router.push` on native; `window.open` on web |
| **Manage → dashboard (header)** | `AppLink` | `router.push` on native; plain `<a>` on web |
| 🔴 **Manage → dashboard (UserMenu)** | **raw `<a href>`** | 🔴 **always a top-level navigation, on every platform** |

**Three surfaces, three different constructs. The KDS report's conclusion is not evidence about manage,
and this report's is not evidence about the KDS.**

## D2. 🔴 THIS DOES **NOT** EXPLAIN THE KDS EJECTION. I am not forcing one story onto both.

**`openKDS`'s native branch is `router.push` — a SOFT navigation, which never creates a
`navigationAction` and therefore never reaches `decidePolicyFor`.** ✅ **The mechanism proven here cannot
fire on that path.**

**What this DOES change is the ranking of the KDS hypotheses:**
- ⚠️ **The "cold-start race on `isNativeApp()`" hypothesis is now WEAKER but not dead.** If
  `isNativeApp()` returned false, `openKDS` would take `window.open(…, '_blank')` → `createWebViewWith`
  → Safari. **Still the only route that fits.**
- 🔴 **A stale deployed bundle becomes MORE plausible**, because we now know a second, independent
  ejection mechanism exists in the same build — **and an older bundle would have had the ungated
  `window.open` on the KDS path too.**

**They are best treated as two defects that share a consequence, not one defect seen twice.**

## D3. 🔴 `isNativeApp()` IS NEVER CALLED ON THE MANAGE PAGE. **NOT FOUND.**

So §40's loading-early-return safety question **does not arise on manage** — there is no direct native
check to be unsafe. **All native gating on that surface is inside `AppLink` and `UserMenu`, both of
which run after mount inside a click handler, where hydration timing cannot bite.**

⚠️ **This is worth recording as a fact about the surface: manage is the operator page with the LEAST
native awareness — no detector (C3), no native check (D3) — while carrying the one ungated internal
anchor in the app.**

---

# PART E — INTEGRITY

## E1. Byte-scan of every file opened — byte-level tool, never grep

| File | NUL | Ctrl < 0x09 | Other C0 |
|---|---|---|---|
| `app/manage/[token]/page.tsx` | 0 | 0 | 0 |
| `components/dashboard/UserMenu.tsx` | 0 | 0 | 0 |
| `components/native/AppLink.tsx` | 0 | 0 | 0 |
| `capacitor.config.ts` | 0 | 0 | 0 |
| `ios/App/App/capacitor.config.json` | 0 | 0 | 0 |
| `…/WebViewDelegationHandler.swift` | 0 | 0 | 0 |
| `…/CAPInstanceConfiguration.swift` | 0 | 0 | 0 |
| `lib/native/device.ts` | 0 | 0 | 0 |
| `docs/kds-navigation-report.md` | 0 | 0 | 0 |

## E2. This report — separate post-write pass

*(Run after the file was on disk; result stated in the session output.)*

## E3. `git status` — nothing changed

```
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/native/OfflineBanner.tsx
 M docs/reference-manual.md
 M ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png
 M ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png
 M ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png
?? docs/launch-screen-report.md
?? docs/offline-messaging-report.md
?? docs/offline-order-number-report.md
?? docs/refund-investigation-report.md
?? docs/whatsapp-connect-report.md
```
🔴 **All from earlier tasks. This one changed nothing.**

---

# WHAT I HAVE NOT ESTABLISHED

1. 🔴 **WHICH of the two controls was tapped.** On a full-screen iPad (820pt portrait / 1180pt
   landscape) `sm:` (640px) is satisfied, so **the header `AppLink` is visible and the UserMenu anchor
   is `sm:hidden`.** ⚠️ **That is in tension with failure (a): the gated control should not eject.**
   **Three ways to reconcile it, none verified:** the iPad was in Split View or Slide Over below 640px,
   exposing the UserMenu anchor; the operator opened the UserMenu on a narrow layout; or `isNativeApp()`
   returned false and `AppLink` fell through to its plain-anchor default — **which would ALSO eject, by
   the same `decidePolicyFor` path, and would tie both of today's ejections to one root cause.**
   🔴 **THIS IS THE SINGLE MOST USEFUL THING TO PIN DOWN, AND A SCREENSHOT OR THE LAYOUT WIDTH WOULD DO
   IT.**
2. ⚠️ **The `router.push` silent-failure explanation for (b) is INFERRED**, from the absence of any
   catch or fallback. **Not reproduced, and no console output was captured.**
3. **I did not test whether `allowNavigation` would fix (a)** — that is a proposal, and none is made.
4. **I did not check the dashboard or KDS for their own raw `<a>` internal links** beyond the sweep in
   A4, which covered manage only.
5. **Nothing was rendered or executed.** Every claim is read from source.
6. **No remedy is proposed, per the brief.**
