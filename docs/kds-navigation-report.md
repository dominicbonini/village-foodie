# The KDS opened in Safari — tracing the picker path

Date: 14 August 2026 · physical iPad13,19, iOS 26.6, **inside the native app, ONLINE**
**READ-ONLY DIAGNOSIS. No edits, no commits, no builds, no deploys. Nothing proposed.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

# 🔴 FIRST — WHERE MY EARLIER REPORT WAS WRONG, STATED PLAINLY

**`docs/kds-native-report.md` is wrong, and not in the way the brief expects.** Its claim about the
picker turns out to be **correct as a statement about the source** — the picker does call `openKDS`, and
I re-verified it independently below. **The error is different and worse:**

> 🔴 **I marked "the KDS is reachable" as READ when what I had actually read was the SOURCE, not the
> BEHAVIOUR.** A gated branch in a file is not a gated branch on a device. The report's own
> "WHAT I HAVE NOT ESTABLISHED" said *"nothing here was run on it"* — and then the headline said
> **"ALREADY NATIVE-READY AND ALREADY REACHABLE"** anyway. **The device is the authority and it
> disagrees.**

**I am not defending it.** What follows is a fresh trace, and it ends in an honest "I cannot tell from
here" plus the one observation that would settle it.

---

# PART A — THE THREE SURFACES, TRACED INDEPENDENTLY

## A1. The multi-van picker — quoted in full, `app/dashboard/[token]/page.tsx:4260-4275`

```tsx
      {/* KDS van picker modal */}
      {showKDSPicker&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&setShowKDSPicker(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-slate-900">Open kitchen screen</h3>
            <p className="text-sm text-slate-500">Choose which van's kitchen screen to open:</p>
            {vans.map(van=>(
              <button key={van.id} onClick={()=>{openKDS(van);setShowKDSPicker(false)}} className="w-full py-3 px-4 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 hover:border-orange-300 hover:bg-orange-50 text-left transition-colors flex items-center justify-between">
                {van.name}
                <span className="text-xs text-slate-600">Kitchen screen →</span>
              </button>
            ))}
            <button onClick={()=>setShowKDSPicker(false)} className="text-sm text-slate-400 hover:text-slate-600 pt-1">Cancel</button>
          </div>
        </div>
      )}
```

✅ **There is exactly ONE picker in the entire repository.** A sweep for `showKDSPicker`, `KDSPicker`,
`kdsPicker`, `"Choose which van"` and `"kitchen screen to open"` returns only `page.tsx` (`:452` state,
`:1164` open, `:4261-4275` render). **No second picker exists in `UserMenu`, the KDS or anywhere else.**

## A2. The navigation call after selection — **the exact line**

```tsx
              <button key={van.id} onClick={()=>{openKDS(van);setShowKDSPicker(false)}} …>
```

| Candidate | Verdict |
|---|---|
| `openKDS(van)` | ✅ **THIS ONE** |
| raw `window.open` | 🔴 **NO** — not in the modal |
| `router.push` directly | 🔴 **NO** |
| `<a target="_blank">` | 🔴 **NO** — it is a `<button>`, with no `href` and no `target` |

**READ. It is a `<button>` whose only navigation is `openKDS(van)`.**

## A3. It DOES call `openKDS` — so how could Safari still open?

**`openKDS`, quoted again in full — `page.tsx:1148-1159`:**
```tsx
  // Open the Kitchen Display. NATIVE: soft-route to the in-app KDS (/dashboard/[token]/kds — dashboard_token
  // based, authenticates natively; van preserved via query) so it stays in the webview — window.open('_blank')
  // escapes to Safari / no-ops in WKWebView. WEB: unchanged — new tab (van's standalone /kds/[kds_token], or
  // the in-app KDS when the van has no kds_token).
  const openKDS=(van?:{id?:string;name?:string;kds_token?:string|null})=>{
    if(isNativeApp()){
      const q=van?.id?`?van_id=${encodeURIComponent(van.id)}${van.name?`&van_name=${encodeURIComponent(van.name)}`:''}`:''
      router.push(`/dashboard/${token}/kds${q}`)
      return
    }
    window.open(van?.kds_token?`/kds/${van.kds_token}`:`/dashboard/${token}/kds`,'_blank')
  }
```

**`isNativeApp()` — `lib/native/device.ts:20-23`:**
```ts
/** True inside the native iOS shell. */
export function isNativeApp(): boolean {
  return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()
}
```
**Imported at `page.tsx:52`:** `import { isNativeApp, setLastScreen } from '@/lib/native/device'`.
**The same import is used at `:192` and `:850`** for status-bar configuration and reachability — **both
of which were observably working on this device**, since the app was running native and showing native
offline behaviour.

### 🔴 SO HOW? There are exactly three ways, and I can eliminate one of them

| # | Explanation | Status |
|---|---|---|
| 1 | **The deployed JS predates the gate** | ⚠️ **NOT ELIMINATED** — see Part B. Weak on dates, but I cannot see the deployment |
| 2 | **`isNativeApp()` evaluated `false`** at that moment | ⚠️ **NOT ELIMINATED** from here. It is a synchronous Capacitor call with no hydration flag, so a false reading would be surprising — **but `:192`/`:850` run in effects, and `openKDS` runs in a click handler; nothing proves they agreed** |
| 3 | **A stale service-worker bundle served old JS** | ✅ **ELIMINATED — PROVEN.** `public/sw.js:113-133` intercepts **only** `GET /api/dashboard`, `GET /api/events/manage`, and `request.destination === 'image' \| 'font'`. **It never caches HTML documents or JS chunks**, and `SHELL_ASSETS = ['/offline.html']` is the whole precache. **A stale SW cannot serve an old bundle.** |

🔴 **I cannot choose between 1 and 2 from here, and I will not guess.** The observation that settles it is
in the closing section.

## A4. The other two surfaces — **traced separately, as required**

### The header button — `page.tsx:2741-2745`
```tsx
              <button onClick={handleOpenKDS} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-500 hover:text-white transition-colors whitespace-nowrap">
                Kitchen screen
                <svg className="w-3.5 h-3.5" … d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
              </button>
```
**READ: `<button>`, no `href`, no `target`. The glyph is decorative SVG.** → `handleOpenKDS`.

### The UserMenu entry — `components/dashboard/UserMenu.tsx:169-177`
```tsx
                <button
                  onClick={() => { onOpenKDS?.(); setOpen(false) }}
```
**READ: a `<button>` calling an injected callback.** The dashboard supplies it at **`page.tsx:2694`**:
```tsx
          onOpenKDS={handleOpenKDS}
```
🔴 **PROVEN by the prop, not assumed — it is the same `handleOpenKDS`.**

### And `handleOpenKDS` — `page.tsx:1161-1165`
```tsx
  const handleOpenKDS=()=>{
    if(vans.length===1){openKDS(vans[0]);return}
    if(vans.length===0){openKDS();return}
    setShowKDSPicker(true)
  }
```

### Three separate traces, three answers

| Surface | Element | Reaches | Gated in source? |
|---|---|---|---|
| **Header button** | `<button onClick={handleOpenKDS}>` | `openKDS` | ✅ YES |
| **UserMenu entry** | `<button onClick={onOpenKDS}>` ← `handleOpenKDS` | `openKDS` | ✅ YES |
| **Van picker** | `<button onClick={()=>openKDS(van)}>` | `openKDS` **directly** | ✅ YES |

🔴 **ALL THREE CONVERGE ON ONE FUNCTION, AND THAT FUNCTION IS GATED.** ⚠️ **Convergence is precisely why
this failure is informative: if the picker ejected, the header button on a single-van truck runs the
identical line and would eject too.** The picker is not a special case — **it is the case that happened
to be observed.**

---

# PART B — IS PRODUCTION STALE?

## B1. When the gate landed

```
$ git blame -L 1148,1160 -- app/dashboard/[token]/page.tsx
21cdb96b (Dominic Bonini 2026-07-01 23:10:58 +0100 1152)   const openKDS=(van?:…)=>{
21cdb96b (Dominic Bonini 2026-07-01 23:10:58 +0100 1153)     if(isNativeApp()){
21cdb96b (Dominic Bonini 2026-07-01 23:10:58 +0100 1155)       router.push(`/dashboard/${token}/kds${q}`)
```
**Commit `21cdb96b`, 1 July 2026 23:10:58 +0100 — *"iPad native app: full operator+admin experience +
login-loop fix (V8.7)"***

**And the diff shows it REPLACED an ungated version — the code that would produce exactly this symptom:**
```diff
-  const handleOpenKDS=()=>{
-    if(vans.length===1){
-      const van=vans[0]
-      if(van?.kds_token){window.open(`/kds/${van.kds_token}`,'_blank')}
-      else{window.open(`/dashboard/${token}/kds`,'_blank')}
+  const openKDS=(van?:{id?:string;name?:string;kds_token?:string|null})=>{
+    if(isNativeApp()){
```
🔴 **The pre-1-July behaviour IS "open the KDS in a new window, ungated" — which in the shell is
Safari.** ⚠️ **That is what a stale bundle would look like, exactly.**

## B2. Is it on the deploying branch?

**How I determined it, all READ:**
```
$ git merge-base --is-ancestor 21cdb96b HEAD        →  YES
$ git merge-base --is-ancestor 21cdb96b origin/main →  YES
$ git log origin/main..HEAD --oneline               →  (empty — HEAD is pushed)
$ git log -1                                        →  d307e4a  2026-08-14  "add order tidy"
$ git remote -v                                     →  origin  https://github.com/dominicbonini/village-foodie.git
```
✅ **Current branch is `main`, `HEAD == origin/main == d307e4a`, and `21cdb96b` is an ancestor of both.**
**So the fix has been on `main` for six weeks and is pushed.**

⚠️ **What this does NOT establish: that `main` is the branch production deploys from, or that any deploy
has succeeded since.** There is no `vercel.json`, no CI config I inspected, and **I did not query the
hosting provider.** *"On origin/main"* and *"in the deployed bundle"* are different facts.

## B3. 🔴 **CANNOT TELL FROM HERE.**

**Reasoning:** the code is right, it is six weeks old, it is pushed, and the SW is eliminated as a stale-
JS vector (A3). **That makes "stale production" unlikely — but "unlikely" is not "false", and I have no
view of what is actually deployed.**

### What would settle it — and one of these takes ten seconds

1. 🔴 **THE SINGLE MOST DECISIVE OBSERVATION, AND IT IS FREE: WHAT URL DID SAFARI SHOW?**
   - **`https://www.hatchgrab.com/kds/<long-token>`** → the **web branch ran**
     (`window.open(van.kds_token ? …)`). ⇒ **`isNativeApp()` was false, or the bundle is old.**
   - **`https://www.hatchgrab.com/dashboard/<token>/kds`** → ⚠️ **ambiguous** — both branches can produce
     that path, so it would tell us the van had no `kds_token` and little else.
   - **Anything else** → neither branch, and everything above needs re-opening.
2. **Check the deployment**: does the production build's commit SHA include `21cdb96b`?
3. **In Safari Web Inspector on the device**, evaluate `Capacitor.isNativePlatform()` on the dashboard —
   settles explanation 2 directly.

---

# PART C — THE PICKER SHOULD OFTEN NOT APPEAR

## C1. The condition — `page.tsx:1161-1165` (quoted in A4)

🔴 **It keys on ONE thing: `vans.length`.** Two or more vans ⇒ picker, unconditionally.

## C2. ✅ **THE DASHBOARD ALREADY KNOWS THE EVENT'S VAN.**

**READ — `activeEvent.van_id` is present and used repeatedly:**
```
:1645   if(!activeEvent?.van_id)return
:1654   if(!activeEvent?.van_id)return
:3861   const capDisabled=locked||!hasCap||!activeEvent.van_id||isOffline
:3906   {activeEvent.van_id&&activeVanName&&(
```
and it is typed on the event — `components/dashboard/types.ts:38` `van_id: string | null`.

🔴 **SO `handleOpenKDS` ASKS A QUESTION THE PAGE HAS ALREADY ANSWERED.** It reads `vans.length` and never
looks at `activeEvent.van_id`, even though the kitchen-capacity controls twenty lines away depend on it.
**READ, not inferred.**

## C3. When the picker is genuinely needed

| Situation | Needed? |
|---|---|
| `activeEvent.van_id` set — the event resolves to one van | 🔴 **NO. The answer is already on screen** |
| No active event, or `van_id` null | ✅ **YES — genuinely ambiguous** |
| Several vans at one event | ✅ **YES** — ⚠️ **but `activeEvent.van_id` is a single column** (`types.ts:38`), so **one event resolves to at most one van**. INFERRED: this case needs a second event, not a second van on one event |
| One van | ✅ Already skipped (`vans.length===1`) |

## C4. Van counts for Pizzeria Gusto and Tikka Tonic — 🔴 **NOT DETERMINED**

**I did not query the database.** No van count is derivable from source. ⚠️ **And it is load-bearing for
the question you are really asking:** if both live trucks have **one** van, `handleOpenKDS` takes the
`vans.length===1` branch, **the picker never appears for them, and auto-routing would change nothing** —
their exposure is the header button's single-van path, which runs the same `openKDS` line.

**Settled by:** `select truck_id, count(*) from truck_vans where active group by truck_id` — a read-only
query I have not run.

## C5. ✅ Nothing implemented. Reported only.

---

# PART D — EVERY `window.open` AND `target="_blank"`

## D1 / D2. The sweep

### `window.open` — **8 occurrences, ONE on an operator surface**

| file:line | Surface | Gated by `isNativeApp()`? |
|---|---|---|
| 🔴 `app/dashboard/[token]/page.tsx:1158` | **OPERATOR — `openKDS` web branch** | ✅ **YES** — unreachable when `isNativeApp()` is true (the `return` above it) |
| `app/page.tsx:169` | Village Foodie map (consumer) | ❌ **UNGATED** — ⚠️ but the operator brand logos were made non-navigating today, so it is not on an operator path |
| `app/venues/[slug]/VenueClient.tsx:79` | consumer venue | ❌ ungated — **external Tally URL; SHOULD leave the app** |
| `app/trucks/[slug]/TruckClient.tsx:76` | consumer truck | ❌ ungated — same, external |
| `components/EventListCard.tsx:99,100` | consumer | ❌ ungated — **external calendar links; correct to leave** |
| `lib/provision-demo.ts:136` | — | **a comment, not a call** |

✅ **On operator-reachable surfaces there is exactly ONE `window.open`, and it is the gated one.**

### `target="_blank"` on operator surfaces — **all internal ones use `AppLink`**

| file:line | What | Gated? |
|---|---|---|
| `app/dashboard/[token]/kds/page.tsx:1176` | 🔴 **"Open cook screen"** — `<AppLink href={/dashboard/${token}/kds?view=cook…} target="_blank">` | ✅ **YES** — `AppLink` calls `e.preventDefault(); router.push(href)` when native |
| `app/admin/page.tsx:968, 1649, 2106` | internal links, all `<AppLink … target="_blank">` | ✅ **YES** |
| `app/admin/page.tsx:1256` | truck's `schedule_url` — **external** | ❌ ungated — **correct; it should open outside** |
| `app/manage/[token]/page.tsx:1183, 1735` | "View original card" — **external** | ❌ ungated — **correct** |
| `components/dashboard/DemoWelcome.tsx:169` | the customer order URL — external-ish | ❌ ungated — ⚠️ **the one I would look at twice**: it is a HatchGrab URL on an operator surface, and in the shell it would eject to Safari |

🔴 **D2's premise is confirmed** — `WebViewDelegationHandler.swift:328-333` calls
`UIApplication.shared.open(url)` and returns `nil`, so **every ungated `window.open` or raw
`<a target="_blank">` ejects.** ✅ **But no ungated INTERNAL one exists on an operator surface**, which is
why this sweep does not explain the observation either.

---

# PART E — INTEGRITY

## E1. Byte-scan of every file opened — byte-level tool, never grep

| File | NUL | Ctrl < 0x09 | Other C0 |
|---|---|---|---|
| `app/dashboard/[token]/page.tsx` | 0 | 0 | 0 |
| `app/dashboard/[token]/kds/page.tsx` | 0 | 0 | 0 |
| `components/dashboard/UserMenu.tsx` | 0 | 0 | 0 |
| `components/native/AppLink.tsx` | 0 | 0 | 0 |
| `lib/native/device.ts` | 0 | 0 | 0 |
| `lib/native/serviceWorker.ts` | 0 | 0 | 0 |
| `public/sw.js` | 0 | 0 | 0 |
| `components/dashboard/types.ts` | 0 | 0 | 0 |
| `app/page.tsx` | 0 | 0 | 0 |
| `app/venues/[slug]/VenueClient.tsx` | 0 | 0 | 0 |
| `app/trucks/[slug]/TruckClient.tsx` | 0 | 0 | 0 |
| `components/EventListCard.tsx` | 0 | 0 | 0 |

## E2. This report — separate post-write pass

*(Run after the file was on disk; result stated in the session output.)*

## E3. `git status` — nothing changed

```
 M app/(legal)/layout.tsx
 M app/contact/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/dashboard/DayLoadStrip.tsx
 M components/shared/AppHeader.tsx
 M docs/reference-manual.md
 M ios/App/App.xcodeproj/project.pbxproj
 M ios/App/App/Info.plist
 M lib/plan-features.ts
 M package.json
?? components/shared/BrandHomeLink.tsx
?? docs/… (report files)
?? ios/App/App/PrivacyInfo.xcprivacy
```
🔴 **Identical to before this task.** Every entry is earlier work; **this task changed nothing.**

---

# WHAT I HAVE NOT ESTABLISHED

1. 🔴 **WHY SAFARI OPENED. I do not know, and the source cannot tell me.** All three surfaces are gated
   on `main`; the device says otherwise; **the code and the observation are both facts and they
   disagree.** The URL Safari displayed (B3) is the cheapest thing that would resolve it.
2. 🔴 **What is actually deployed.** *"On origin/main"* is proven; *"in the running bundle"* is not.
3. **Whether `isNativeApp()` returned false**, and whether it can disagree between an effect and a click
   handler in this shell. **Not tested.**
4. **Van counts for the two live trucks** (C4) — a read-only query I did not run.
5. **I did not re-verify the KDS route itself**, so I cannot rule out that `router.push` succeeded and
   something on arrival ejected. ⚠️ **The URL check distinguishes this too.**
6. **No remedy is proposed, per the brief.**
