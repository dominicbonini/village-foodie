# Three KDS defects — two fixed, one STOPPED at diagnosis

Scope honoured: **three files** — `app/dashboard/[token]/kds/layout.tsx`,
`app/dashboard/[token]/kds/page.tsx`, `app/dashboard/[token]/page.tsx`. No `next dev`, no
`next build`, no `cap sync`, no deploy, no commit, no database write, no Stripe call, no migration,
nothing under `lib/payments/`.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Dashboard and KDS are near-duplicate surfaces and are reported **separately**. Every claim is marked
**READ** or **INFERRED**.

> ✅ **VERIFIED: `npx tsc --noEmit` exits 0 with no output.** No emit, no `.next`, no bundler.

🔴 **PART C IS A STOP, NOT A FIX.** The KDS's Dashboard control is **already an `AppLink`**, already
gated by `isNativeApp()`, already routing through `router.push`. Per C5 I changed nothing there and
report the cause instead. **It is the most consequential finding in this report — read Part C first if
you read nothing else.**

---

# PART A — THE STATUS-BAR OVERLAP

## A1. Both layout roots and both headers, side by side

### KDS — READ, `app/dashboard/[token]/kds/layout.tsx` in full, before:

```tsx
export default function KdsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-screen h-screen overflow-hidden m-0 p-0">
      {children}
    </div>
  )
}
```

**READ** — the page root inside it, `kds/page.tsx:1067`:

```tsx
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden">
```

**READ** — and the KDS's own header, `kds/page.tsx:1083`, before:

```tsx
      <header className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
```

🔴 **No inset of any kind. NOT FOUND in the whole file before this task: `safe-area`, `env(`, or any
`paddingTop`.** And **NOT FOUND: `AppHeader`** — the KDS does not use the shared header at all.

### DASHBOARD — READ, `app/dashboard/[token]/page.tsx:2639`:

```tsx
    <div className="bg-slate-50 h-dvh flex flex-col overflow-hidden">{/* App-shell (KDS flex pattern) for EVERY tab: fixed-viewport h-dvh column where the top bars are shrink-0 and only <main> scrolls. … */}
```

**Its header is the shared component**, `components/shared/AppHeader.tsx:40-46` — **READ**:

```tsx
    <header
      className={`bg-slate-900 ${sticky ? 'sticky top-0' : 'relative'} z-50 shadow-md`}
      /* Native app: extend the dark header UP into the status-bar/safe-area inset so no page content shows
         above it. env(safe-area-inset-top) is 0 in a normal browser → web is byte-for-byte unchanged. Pairs
         with capacitor contentInset:'never' + viewport-fit=cover, which let CSS own the safe area. */
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
```

> 🔴 **THE DIFFERENCE IN ONE LINE: the dashboard renders `AppHeader`, which carries the inset. The KDS
> hand-rolls its own `<header>` and never had it.** Two headers, one mechanism, applied to one of them.

## A2. Exactly how the dashboard achieves its inset

**`style={{ paddingTop: 'env(safe-area-inset-top)' }}` — a CSS environment variable, on the header
element.** Not a Capacitor config value, not a plugin, not a JS measurement.

**READ** — the two things that make `env()` non-zero, both already in place:

- `app/layout.tsx:68`: *"viewport-fit=cover lets the page extend under the device safe areas so
  env(safe-area-inset-*) is …"*
- `lib/native/statusBar.ts:10-13`: *"env(safe-area-inset-top) + viewport-fit=cover +
  contentInset:'never') assumes the WebView extends under … so env(safe-area-inset-top) is the SINGLE
  top inset, filled by the dark header bg."*

⚠️ **READ**, `lib/native/statusBar.ts:38`, and it matters for what this fix does NOT do:

```
    // 🚫 DO NOT ADD env(safe-area-inset-top) OR --safe-area-inset-top HANDLING FOR ANDROID.
```

**INFERRED:** on Android `env(safe-area-inset-top)` resolves to 0, so this change is inert there — the
same property that makes it inert on the web.

## A3. The same mechanism, applied to the KDS

**READ, as committed** — `kds/page.tsx`:

```tsx
      {/* ── Header ──────────────────────────────────────────────────────────────────────────────────
          🔴 THE SAFE-AREA INSET, AND IT IS THE SAME ONE AppHeader USES — NOT A SECOND MECHANISM.
          components/shared/AppHeader.tsx:45 carries `style={{ paddingTop: 'env(safe-area-inset-top)' }}`,
          which is why every dashboard/manage/admin header renders BELOW the status bar. This header is
          hand-rolled and never had it, so the KDS rendered full-bleed and its top-right control sat UNDER
          the battery indicator (device-verified).
          🔴 MOVING THE CONTROL LEFT WOULD NOT HAVE FIXED IT. On iPad landscape the status bar spans the
          FULL width — clock left, battery right — so a leftward move collides with the clock instead. And
          any horizontal answer breaks the moment the bar grows taller (call in progress, screen recording,
          personal hotspot). The inset is the only answer that tracks all of those, because iOS reports the
          new height and env() follows it.
          ⚠️ WEB IS BYTE-FOR-BYTE UNCHANGED: env(safe-area-inset-top) resolves to 0 in a normal browser.
          Pairs with viewport-fit=cover (app/layout.tsx) and contentInset:'never', which let CSS own the
          safe area — see lib/native/statusBar.ts for why iOS is the only platform where env() is non-zero.
          ⚠️ The padding goes on the HEADER, not the layout root: the root is the flex column that owns the
          board's height, and padding there would inset the scroll region as well as the chrome. */}
      <header
        className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0"
        style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}
      >
```

⚠️ **One deliberate difference from `AppHeader`, and it is not a second mechanism.** `AppHeader` uses a
bare `env(...)` because its own `px-4 py-3` sits on an inner `<div>`, so the inset adds to a zero top
padding. **This header's `py-2.5` is on the element itself**, so a bare `env()` would have **replaced**
that 10px with 0 on the web and in Safari — the header would have lost its top padding everywhere
`env()` is 0. `max(0.625rem, env(...))` keeps `py-2.5`'s 10px as the floor. **`0.625rem` IS `py-2.5`.**

## A4. `h-screen` → `h-dvh`

**READ** — the manual already records this as the KDS's one divergence, `reference-manual.md:3995-3997`:

```
- **`h-screen`, not `h-dvh`** — the one divergence from the pattern §35 insists on. In the shell there
  is no collapsing chrome so the two agree; ⚠️ **an operator opening the KDS in mobile Safari gets the
  wrong height.**
```

**READ, as committed** — `kds/layout.tsx`:

```tsx
export default function KdsLayout({ children }: { children: React.ReactNode }) {
  return (
    // h-dvh, NOT h-screen. This was the one surface still on h-screen while every other operator page
    // uses h-dvh (the app-shell pattern S35 insists on). In the Capacitor shell the two agree - there is
    // no collapsing browser chrome - so this changes nothing on the iPad. It matters in MOBILE SAFARI,
    // where h-screen (100vh) is the LARGEST viewport, taller than what is actually visible while the
    // address bar is showing: the bottom of the board sat under the browser chrome and the shell's
    // overflow-hidden meant it could not be scrolled to. h-dvh tracks the real height.
    // The inner page keeps w-full h-full and fills this box, so nothing below needed to change.
    <div className="w-screen h-dvh overflow-hidden m-0 p-0">
      {children}
    </div>
  )
}
```

⚠️ **This file was pure ASCII and still is** — the comment above uses `S35` and plain hyphens
deliberately, so the file gains no character class. See E2.

**Three more instances of the same divergence, also changed** — the KDS's full-height early-return
states at `kds/page.tsx:1028`, `:1035`, `:1061` were each `h-screen`. **They are the root of their own
render branch and have the identical mobile-Safari problem**, so all three moved to `h-dvh`.
**`grep -c h-screen` on the KDS is now 0.**

**What changes:** ✅ **In the Capacitor shell, nothing** — there is no collapsing chrome, so
`100vh === 100dvh`. **INFERRED:** in mobile Safari the board's bottom row is now reachable, where before
it sat under the address bar inside an `overflow-hidden` shell that could not scroll to it.

## A5. How the header renders — 🔴 ALL INFERRED, nothing was rendered

| Situation | INFERRED result |
|---|---|
| **iPad portrait, shell** | `env(safe-area-inset-top)` ≈ 20-24pt. Header padding grows from 10px to that; the white header fills the strip and the top-right control clears the battery. |
| **iPad landscape, shell** | Same inset, applied the same way. 🔴 **The point of insetting rather than moving:** the status bar spans the full width — clock left, battery right — so the whole header row drops below it and **no horizontal position is assumed**. |
| **Taller status bar** (call, screen recording, hotspot) | iOS reports a larger inset; `env()` follows; the header drops further. ⚠️ **This is the case a `pt-6` or a moved button would fail**, and it is why `max()` takes `env()` as a variable rather than baking a number. |
| **Web / mobile Safari** | `env(safe-area-inset-top)` = 0, so `max(0.625rem, 0)` = **10px = the original `py-2.5`. Byte-identical rendering.** |
| **Android shell** | `env()` = 0 by design (`statusBar.ts:38`), so also unchanged. |

⚠️ **The one thing I cannot infer: whether the inset is large enough for the specific control.** The
padding matches whatever iOS reports, so the header sits below the bar by construction — but only a
device shows whether the result looks right.

---

# PART B — THE VAN PICKER ASKS EVERY TIME

## B1. `handleOpenKDS` and the picker, before

**READ** — `app/dashboard/[token]/page.tsx:1204-1208`:

```tsx
  const handleOpenKDS=()=>{
    if(vans.length===1){openKDS(vans[0]);return}
    if(vans.length===0){openKDS();return}
    setShowKDSPicker(true)
  }
```

**READ** — the picker's render condition and body, `page.tsx:4357-4371`:

```tsx
      {showKDSPicker&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&setShowKDSPicker(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-slate-900">Open kitchen screen</h3>
            <p className="text-sm text-slate-500">Choose which van's kitchen screen to open:</p>
            {vans.map(van=>(
              <button key={van.id} onClick={()=>{openKDS(van);setShowKDSPicker(false)}} …>
                {van.name}
                <span className="text-xs text-slate-600">Kitchen screen →</span>
              </button>
            ))}
            <button onClick={()=>setShowKDSPicker(false)} className="text-sm text-slate-400 hover:text-slate-600 pt-1">Cancel</button>
          </div>
        </div>
      )}
```

🔴 **The picker is stateless in every sense: it renders the van list, calls `openKDS`, and closes.
Nothing anywhere records what was chosen — so "ask again next time" was not a bug in the picker, it was
the absence of any reason not to ask.**

## B2. The three sites that already trust `activeEvent.van_id`

**READ** — `page.tsx:1687-1694`:

```tsx
  const saveKitchenCapacity=async(value:number|null)=>{
    if(!activeEvent?.van_id)return
    markPending('kitchenCapacity',value); setKitchenCapacity(value) // optimistic + guard
    …
    await fetch('/api/manage',{…,body:JSON.stringify({token,action:'update_van_settings',vanId:activeEvent.van_id,kitchen_capacity:value})})
```

**READ** — `page.tsx:1696-1700`:

```tsx
  const saveCapacityWindow=async(value:number)=>{
    if(!activeEvent?.van_id)return
    markPending('capacityWindowMins',value); setCapacityWindowMins(value) // optimistic + guard
    await fetch('/api/manage',{…,body:JSON.stringify({token,action:'update_van_settings',vanId:activeEvent.van_id,capacity_window_mins:value})})
```

**READ** — `page.tsx:4004-4006`, the van chip beside "Total capacity":

```tsx
                      {activeEvent.van_id&&activeVanName&&(
                        <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5 flex-shrink-0">🚐 {activeVanName}</span>
                      )}
```

⚠️ **This page already writes VAN SETTINGS through `activeEvent.van_id` — a write, on a capacity
figure the kitchen depends on. Reading it to decide which kitchen screen to open is strictly less
trusting than what it already does.**

## B3. The rule applied — skip when unambiguous, ask when not

**READ, as committed:**

```tsx
  const handleOpenKDS=()=>{
    if(vans.length===0){openKDS();return}
    if(vans.length===1){openKDS(vans[0]);return}
    const eventVan=activeEvent?.van_id?vans.find(v=>v.id===activeEvent.van_id):undefined
    if(eventVan){openKDS(eventVan);return}
    setShowKDSPicker(true)
  }
```

**The full comment above it — READ:**

```tsx
  // ── 🔴 SKIP WHEN UNAMBIGUOUS, ASK WHEN NOT ──────────────────────────────────────────────────────
  // WHAT WAS WRONG: this keyed on `vans.length` ALONE, so a truck with two vans was asked which kitchen
  // screen to open EVERY time — even when the event on screen already named one. Device-observed: pick
  // Van1, go back to the dashboard, open the KDS again, get asked again. Nothing remembered anything
  // because nothing had to: the answer was already on the page and was not being read.
  // ⚠️ LIVE-VERIFIED that this changes NOTHING for either live truck — Pizzeria Gusto and Tikka Tonic
  // each have exactly one van, so both already took the first branch and never saw the picker.
  //   …
  //   4. several vans and the event names none -> ASK. That is the case the picker exists for.
  // ⚠️ The van must still be one of THIS truck's vans: `vans.find` is the membership test, so an event
  // carrying a stale or foreign van_id falls through to the picker rather than opening on a van that is
  // not in the list.
```

⚠️ **The `vans.length===0` test moved above `===1`** — no behaviour change (the two are mutually
exclusive), but the branches now read in the order a person would ask them.

## B4. 🔴 Do the van and the event agree? Yes — by construction, not by coincidence

**This was the risk worth taking seriously: a van from event A with an event id from event B would be
worse than asking every time.** It is now impossible, because **both come from the same object**.

**READ, as committed** — `openKDS` now takes the event from `activeEvent`:

```tsx
  // 🔴 THE EVENT ID COMES FROM `activeEvent`, NOT FROM `selectedEventId`, AND THAT IS THE SAME OBJECT
  // handleOpenKDS BELOW TAKES THE VAN FROM. `activeEvent` IS the resolution (`= resolvedEvent =
  // selectedOrDefaultEvent`), so when a selection exists the two are identical, and when one has not
  // committed yet this hands over the event the dashboard is ACTUALLY SHOWING rather than nothing at all.
  const openKDS=(van?:{id?:string;name?:string;kds_token?:string|null})=>{
    const ev=activeEvent?.id?`event_id=${encodeURIComponent(activeEvent.id)}`:''
```

**Why `activeEvent` is the right single source — READ**, `page.tsx:2301-2304`:

```tsx
  const resolvedEvent:TruckEvent|null=selectedOrDefaultEvent
  // Fall back to the last known event when upcomingEvents is transiently empty
  // (failed refetch) but the selection is still live — never blank the event bar
  const activeEvent:TruckEvent|null=resolvedEvent
```

and `page.tsx:646-648`:

```tsx
  const selectedOrDefaultEvent:TruckEvent|null=selectedEventId
    ?(upcomingEvents.find(e=>e.id===selectedEventId)??null)
    :pickDefaultEventByTime(upcomingEvents)
```

✅ **So `activeEvent.id === selectedEventId` whenever a selection exists, and is the time-based default
otherwise.** The previous version sent `selectedEventId`, which is **null** before the auto-select
effect commits — so this is also a small improvement to the handoff: the KDS now receives the event the
dashboard is displaying rather than nothing.

⚠️ **A runtime detail checked rather than assumed:** `activeEvent` is declared at line 2333, *below*
`openKDS` (1195) and `handleOpenKDS` (1231). That is safe because both are **arrow-function bodies**,
never called during render — `grep` confirms every use is an `onClick` or a prop passed to a child
(`onOpenKDS={handleOpenKDS}`) — and `activeEvent` is initialised at 2333, **above the earliest early
return at 2495**. ✅ `tsc` accepts it; the closure captures the binding and reads it at click time.

## B5. Should the chosen van PERSIST? — REPORTED, NOT IMPLEMENTED

**Does it today? NO. READ:** `showKDSPicker` is `useState(false)` (`page.tsx:481`), the picker calls
`openKDS(van)` and closes. **NOT FOUND: any write of the chosen van to Preferences, localStorage or the
database.** The choice lives only in the URL of the KDS that was just opened.

**Does `van_devices` already store per-device config? YES. READ**,
`app/api/native/bind-device/route.ts:79-84`:

```ts
  const patch: Record<string, unknown> = { truck_id: truck.id, device_id, last_seen: new Date().toISOString() }
  if (van_id !== undefined) patch.van_id = van_id
  if (default_screen !== undefined) patch.default_screen = default_screen
  if (notify_enabled !== undefined) patch.notify_enabled = !!notify_enabled
  if (push_token !== undefined) patch.push_token = push_token
  if (platform !== undefined) patch.platform = platform
```

🔴 **`van_devices.van_id` already exists and is already written — by `DeviceSetupGate`, on first setup.**
So a device is **already bound to a van**, and the picker is asking a question the database has an
answer to.

**What persisting would involve, reported and stopped:**

1. **Reading `van_devices.van_id` on the dashboard.** It is fetched by `fetchDeviceConfig` in the native
   shell today, but the dashboard page does not read it — that is the work.
2. **Deciding precedence.** Three candidates would then exist: the event's van, the device's bound van,
   and an explicit pick. ⚠️ **They can disagree** — a device bound to Van1 viewing an event on Van2 is a
   real state, and getting that order wrong is worse than a picker.
3. **Deciding whether a pick WRITES.** Writing the device's binding because someone opened a kitchen
   screen would change what push notifications that device receives (`van_devices` scopes the push
   routing) — **a side effect well outside "which screen opens".**
4. **Native-only.** `van_devices` is keyed on a Capacitor `device_id`; a web browser has none, so this
   would help the iPad and do nothing on the web.

⚠️ **My reading, offered and not acted on: with the event-van rule above, the remaining ambiguous case
is narrow — several vans at one event with no van on the event — and it is not obvious that persistence
beats asking there.** The device binding answers "which van is this iPad", which is a different question
from "which van's board do I want to look at now". **Stopping here as instructed.**

---

# PART C — THE DASHBOARD BUTTON. 🔴 DIAGNOSED, AND NOT CHANGED

## C1 / C2. The control, in full

**READ** — `app/dashboard/[token]/kds/page.tsx:1084-1093`, complete and unmodified:

```tsx
        {/* Back to the orders dashboard — staff are auto-routed to KDS on login and otherwise have no
            way back to place orders. Unconditional (all roles): /dashboard/[token] has no staff block,
            so this can't loop. Label collapses to just ← on narrow widths to avoid crowding. */}
        <AppLink
          href={`/dashboard/${token}`}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
        >
          <span aria-hidden>←</span>
          <span className="hidden sm:inline">Dashboard</span>
        </AppLink>
```

**It is an `AppLink`.** Not a `<Link>`, not a raw `<a>`, not a `router.push` call site, and 🔴 **not a
`window.open`** — `grep -n "window.open" kds/page.tsx` returns **NOT FOUND**.

## C3. Is it gated by `isNativeApp()`? — YES

**READ** — `components/native/AppLink.tsx` in full:

```tsx
export function AppLink({ href, onClick, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
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
      {children}
    </a>
  )
}
```

✅ **Gated, and it is the same mechanism `AppHeader` uses** — `AppLink` is the shared internal-route
anchor. **The control is already correct.**

## C4. Explaining the observed sequence — nothing, Safari, sign-in, back

**Each step, with what I can and cannot prove:**

### Step 1 — "nothing happened"

**INFERRED, two candidates, and I cannot separate them without the device:**

- **(a)** `isNativeApp()` returned **true**, `preventDefault()` fired, and `router.push` began a soft
  navigation that had to fetch the route's RSC payload over the network. On a cold route that is a
  visible pause with no visual feedback — **the control has no pending state.**
- **(b)** `isNativeApp()` returned **false** and the plain `<a>` began a full-document navigation, which
  also shows nothing until it resolves.

### Step 2 — "a brief Safari page"

🔴 **This step proves the click was NOT handled natively.** `router.push` cannot open Safari. So on that
click **`isNativeApp()` returned false**, `preventDefault` never ran, and the anchor performed a **hard
navigation** to `/dashboard/<token>`.

**READ** — what a hard navigation meets, `capacitor.config.ts:29-34`:

```
  // match on the full serverURL INCLUDING ITS PATH:
  //     navURL.absoluteString.starts(with: bridge.config.serverURL.absoluteString)
  …
  // allowNavigation is checked BEFORE that prefix test and matches on HOSTNAME ONLY, so one entry
```

**READ** — and `allowNavigation` **is** baked into the shipped config,
`ios/App/App/capacitor.config.json:8`:

```json
		"allowNavigation": [
```

⚠️ **So on a build containing that config, a hard nav to a sibling path should be ALLOWED and should NOT
reach Safari.** That leaves two explanations, and they are testable:

| Explanation | How to tell |
|---|---|
| 🔴 **The iPad is running a build made BEFORE `allowNavigation` was baked in.** It was added in V11.18 and needs a `cap sync` + rebuild to reach a binary. | Rebuild and retry. If it stops ejecting, this was it. |
| ⚠️ **`isNativeApp()` is intermittently false** (§11, unresolved — the cold-start-race hypothesis was refuted in V11.19, leaving SSR/first-frame, an iframe, or a foreign WebView). | It would eject only sometimes, and only the FIRST tap after a launch. |

**INFERRED: the first is the more likely of the two**, because the ejection was reproducible enough to
report, and because a `cap sync` has not been run since `allowNavigation` was added.

### Step 3 — "asked to sign in"

🔴 **This was almost certainly the PIN gate, not a Supabase login — and that distinction matters.**

**READ** — `/dashboard/[token]` authenticates by **dashboard token plus an optional PIN**, not by a
session: `page.tsx:752`:

```tsx
      if(res.status===401){if(data.requiresPin){setRequiresPin(true);setLoading(false);return};setError('Invalid access link');setLoading(false);return}
```

and it renders a prompt at `page.tsx:2520`: `if(requiresPin&&!authenticated)return(`.

**READ** — and the PIN is **in-memory only**, `kds/page.tsx:125`:

```tsx
  const [pin, setPin] = useState(() => searchParams.get('pin') ?? '')
```

**NOT FOUND: any persistence of the PIN** — no localStorage, no Preferences, no cookie. **INFERRED: a
fresh Safari tab has no PIN, gets a 401 with `requiresPin`, and renders a prompt an operator would
reasonably describe as "asking to sign in".**

### Step 4 — "returned to the dashboard"

**INFERRED:** the app was still on the dashboard behind Safari — either because the operator dismissed
Safari and returned to the app, or because a soft navigation had already completed. **The app's state
was never lost; Safari was a separate window on top of it.**

## C5. Not changed, and why

🔴 **STOPPED, as instructed.** The control is already an `AppLink`, already gated, already using the
mechanism `AppHeader` uses. **Changing it would have been changing correct code to chase a symptom whose
cause is in the native config or in `isNativeApp()`, neither of which is in this task's scope.**

⚠️ **And a warning about the obvious "fix":** replacing `AppLink` with a bare `router.push` would
**remove the web behaviour** (a plain anchor with a real `href`) and would still eject if
`isNativeApp()` is the thing failing — because the gate is the same predicate.

## C6. 🔴 What the sign-in prompt implies about session state

**The native session and the Safari session are COMPLETELY separate, and not merely different cookie
jars. READ** — `lib/native/session.ts:22-24`:

```ts
      // distinct storageKey so it never clashes with the web cookie client's keys; Preferences-backed
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'hg-native-auth', storage: preferencesAuthStorage } },
```

**READ** — and why, `session.ts:7-10`:

```
// Storage is @capacitor/preferences rather than localStorage: in the WKWebView remote-URL shell,
// localStorage did NOT survive the hard /login → /app → dashboard navigation, so the session vanished →
```

🔴 **The native session lives in Capacitor Preferences — a NATIVE store. Safari cannot read it at all**,
not through cookies and not through localStorage. **So yes: the operator was ejected into a logged-out
web context.** ⚠️ For `/dashboard/[token]` specifically the missing credential is the **PIN**, not the
Supabase session — the dashboard token is in the URL and travels with the ejection.

**What an operator does to recover mid-service — and it is reassuring:**

1. 🔴 **Do NOT sign in, in Safari.** It achieves nothing for the app and puts a second live session on a
   different surface.
2. **Return to the HatchGrab app** — app switcher, or swipe up. ✅ **The native session was never
   touched: it is in Preferences, and nothing in this sequence writes there.** The board is as it was.
3. If the app itself asks for a PIN, that is the ordinary per-device PIN prompt.

⚠️ **The real operational cost is attention, not access:** an unattended kitchen screen that has jumped
to Safari **is not showing orders**, and nobody is watching it. **That is the reason to fix the cause,
and the reason a `cap sync` + rebuild should be the first thing tried.**

---

# PART D — BOUNDARIES

## D1. `git diff --stat`

```
 app/api/dashboard/action/route.ts       | 100 +++-
 app/api/events/affected-orders/route.ts |   6 +-
 app/api/orders/cancel/route.ts          |  13 +-
 app/dashboard/[token]/kds/layout.tsx    |   9 +-
 app/dashboard/[token]/kds/page.tsx      | 204 +++++--
 app/dashboard/[token]/page.tsx          |  56 +-
 app/order/[id]/manage/page.tsx          |  13 +-
 docs/push-registration-report.md        | 978 +++++++++++++++++++-------------
 docs/reference-manual.md                | 595 ++++++++++++++++++-
 ios/App/App/AppDelegate.swift           |  41 ++
 lib/printing/printWatcher.ts            |   8 +-
```

⚠️ **The tree has been dirty for two days, so THIS TASK'S ENTRIES are named explicitly:**
`app/dashboard/[token]/kds/layout.tsx`, part of `app/dashboard/[token]/kds/page.tsx`, part of
`app/dashboard/[token]/page.tsx`, and this report. **Everything else is earlier work** — the `'modified'`
status fixes (`action/route.ts`, `affected-orders`, `orders/cancel`, `manage/page.tsx`,
`printWatcher.ts`), the APNs delegate (`AppDelegate.swift`), and the V11.19 manual.

**Proof by path, counted from the diff:**

| Concern | Files in the diff |
|---|---|
| `lib/payments` | **0** |
| `lib/slot*` (capacity engine) | **0** |
| `lib/capacity*` | **0** |
| `supabase/migrations` | **0** |
| `lib/features` / `lib/plan-features` (the gate) | **0** |

## D2. What changes for a Pizzeria Gusto operator mid-service

The kitchen screen's header now sits **below the status bar** instead of under it, so the top-right
control is reachable in portrait and in landscape and stays reachable if the bar grows taller during a
call or a screen recording — and because the fix is an inset rather than a moved button, nothing
collides with the clock on the left either. **The van picker change is invisible to Gusto: they have one
van, so they were already taking the single-van branch** — it only helps a multi-van truck, which now
goes straight through when the event on screen names a van and is still asked when it does not. 🔴 **The
Dashboard button is UNCHANGED and may still eject to Safari**, so if it happens mid-service the operator
should return to the app rather than sign in to the Safari page — **the app's own session is intact and
the board is as they left it** — and the first real fix to try is a `cap sync` and rebuild, because
`allowNavigation` is in the config but may not be in the binary on that iPad.

## D3. No customer-facing surface is affected

✅ **Confirmed.** All three edited files are operator surfaces behind a dashboard token. **NOT FOUND in
this task's changes: any file under `app/trucks/`, `app/order/`, `lib/email*`, or any API route.** No
database write, no schema change, no email.

---

# PART E — INTEGRITY

## E1 / E2. Non-ASCII census, side by side

| File | bytes | classes before → after | Gained | Lost |
|---|---|---|---|---|
| `app/dashboard/[token]/kds/layout.tsx` | 190 → 887 | **0 → 0** | NONE | NONE |
| `app/dashboard/[token]/kds/page.tsx` | 99,851 → 101,652 | **32 → 32** | NONE | NONE |
| `app/dashboard/[token]/page.tsx` | 378,595 → 381,182 | **53 → 53** | NONE | NONE |

**Every difference explained:**

- 🔴 **`kds/layout.tsx` was PURE ASCII and still is — 0 classes before and after.** The new comment
  deliberately writes `S35` rather than the section sign and uses plain hyphens, so a file that had never
  held a non-ASCII byte still has not. ⚠️ **This is the file where a reflexive `§` or an em dash would
  have added the first character class to a 190-byte file.**
- `kds/page.tsx` — U+2500 BOX DRAWINGS **+80** (the section rules in the new header comment), U+2014 EM
  DASH **+4**, U+26A0 **+2** with U+FE0F **+2** (paired), U+1F534 **+2**. All classes the file held.
- `page.tsx` — U+2500 **+56**, U+1F534 **+4**, U+2014 **+3**, U+26A0 **+3** with U+FE0F **+3** (paired).
  All classes the file held.

⚠️ **No currency symbol, arrow or dash was touched in any of the three** — this task changed layout and
control flow, not copy.

## E3. Carrier-aware variation-selector check

🔴 Carriers read from **what actually precedes each U+FE0F**, never from a Unicode-category filter — a
`category == 'So'` filter silently misses bases such as U+2139 INFORMATION SOURCE (category `Ll`).

| File | U+26A0 before → after (n / paired / bare) | carriers after | sum = total U+FE0F |
|---|---|---|---|
| `kds/layout.tsx` | 0/0/0 → 0/0/0 | none | 0 = 0 ✅ |
| `kds/page.tsx` | 17/16/**1** → 19/18/**1** | U+26A0 ×18, **U+2600 BLACK SUN ×1** | 19 = 19 ✅ |
| `page.tsx` | 62/59/**3** → 65/62/**3** | U+26A0 ×62, **U+2699 GEAR ×1** | 63 = 63 ✅ |

✅ **Every warning sign added in this task is paired.** The bare counts — 1 and 3 — are **unchanged**,
i.e. pre-existing and untouched. ⚠️ **Both edited page files carry a non-warning-sign carrier** (a sun, a
gear), which is precisely the case a raw U+26A0-versus-U+FE0F total misreports.

## E4. Byte scan of every edited file — byte-level, never grep

All three scanned for NUL, every control byte below 0x09, the 0x0B/0x0C pair, 0x0E-0x1F and 0x7F.
**Offending: 0 in every file. CRLF: 0. Lone CR: 0.**

## E5. Byte scan of this report

Separate pass after writing: **37,544 bytes scanned, offending = 0** — no NUL, no control byte below
0x09, no CRLF, no lone CR.

**And the carrier-aware check on this report, measured in that same pass:**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+26A0 WARNING SIGN | 30 | 30 | **0** |
| U+1F534 LARGE RED CIRCLE | 29 | 0 | 29 |
| U+2705 WHITE HEAVY CHECK MARK | 13 | 0 | 13 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 140 | 0 | 140 |
| U+1F6AB NO ENTRY SIGN | 1 | 0 | 1 |
| U+1F690 MINIBUS | 1 | 0 | 1 |

**Sum of per-base paired = 30 = total U+FE0F count = 30** — every selector has a named carrier, no
orphan, no double-count, **zero bare warning signs**. Bare is correct for the other five: four are
emoji-presentation-by-default (the last two are quoted from source — the no-entry sign from
`statusBar.ts`'s Android warning and the minibus from the dashboard's van chip), and U+2500 is a
**box-drawing rule** inside quoted comments. ⚠️ **U+2500 is not an emoji at all**, and reporting it as
unpaired would be exactly the false positive this method exists to prevent.

## E6. `git status` and `git diff --stat`

`git diff --stat` is at D1. ⚠️ **The tree has been dirty for two days and this task's entries are named
there explicitly.** Nothing staged, branch still `main`.

---

# PART F — WHAT YOU MUST TEST

⚠️ **None of this has been observed. `tsc` is clean and every change is quoted, but nothing rendered.**

⚠️ **A `cap sync` and a rebuild are needed before ANY of this reaches the iPad** — and that rebuild is
also the first candidate fix for Part C.

### 1. The status-bar overlap — iPad PORTRAIT

Open the KDS in the app.

- **PASS:** the whole white header sits **below** the status bar; the top-right control is fully visible
  and tappable; no order content shows above the header.
- **FAIL:** the control is still under the battery → the inset is not in the build, or `env()` is
  resolving to 0 (check `viewport-fit=cover` and `contentInset:'never'`).

### 2. 🔴 ROTATE THE iPAD to landscape

- **PASS:** the header still sits below the bar, **and nothing collides with the CLOCK on the left** —
  the whole row moved down, not sideways.
- **FAIL:** anything overlaps at either end → report it; a horizontal answer is not the fix and should
  not be attempted.

### 3. 🔴 START A SCREEN RECORDING so the status bar grows taller

With the KDS open, start a screen recording (or take a call, or enable a hotspot).

- **PASS:** the header **grows with the bar** and the control stays clear. This is the case a fixed
  padding would fail.
- **PASS:** stopping the recording returns it to the normal height.
- **FAIL:** the taller bar covers the control → `env()` is not being re-evaluated; report it.

### 4. `h-dvh` — mobile SAFARI, not the app

Open the KDS in mobile Safari with the address bar showing.

- **PASS:** the bottom row of the board is visible and reachable.
- ✅ **In the app, expect NO visible change** — `100vh` and `100dvh` agree there.

### 5. The van picker — needs a MULTI-VAN truck

⚠️ **Gusto and Tikka Tonic cannot exercise this** — one van each. Use a test truck with two.

- **PASS (unambiguous):** with the event on screen bound to a van, tapping Kitchen screen opens it
  **without asking**, and the KDS header names that van.
- **PASS (ambiguous):** with an event bound to **no** van, the picker still appears.
- 🔴 **PASS (agreement):** the van in the KDS header and the event the KDS lands on are **the same event's
  van** — check the URL carries both `van_id` and `event_id` and that they belong together.
- **FAIL:** it asks when the event names a van → the change is not in the build.
- 🔴 **FAIL:** the KDS opens on event A scoped to event B's van → **stop and report**; that is worse than
  the original behaviour.

### 6. Single-van regression check — do this on Gusto

- **PASS:** tapping Kitchen screen behaves **exactly as before** — no picker, straight through.
- **FAIL:** a picker appears → the `vans.length===1` branch has been disturbed.

### 7. 🔴 The Dashboard button — UNCHANGED, and this is a diagnostic, not a verification

After the rebuild, tap Dashboard on the KDS.

- **PASS:** it navigates in-app, no Safari. ✅ **That confirms the missing-`allowNavigation`-in-the-binary
  explanation**, and the defect is closed by the rebuild alone.
- **FAIL:** it still ejects to Safari → **`isNativeApp()` is returning false**, which is the §11
  unresolved item. Note whether it was the **first** tap after launch and whether it reproduces.
- ⚠️ **If it ejects: return to the app rather than signing in to the Safari page.** The app's session is
  in native Preferences and was not affected.
