# Kitchen Capacity panel — diagnosis, fix, and the duplicate offline banner

Date: 14 August 2026 · iPad13,19 (iOS 26.6), **landscape**
**PART A: DIAGNOSED, NOTHING DELETED — 🔴 STOPPED FOR YOUR DECISION, as instructed.**
**PART B: FIXED.** Two files: `app/dashboard/[token]/page.tsx` · `components/dashboard/DayLoadStrip.tsx`

`tsc --noEmit`: **exit 0, zero output** · **0 NUL, 0 control bytes < 0x09** · **no codepoint class gained
or lost in either file.** No `next dev`, no `next build`, no `cap sync`, no deploy, no commit.

**No span of the prompt arrived garbled. No instruction contradicted another** — though the fix is
larger than "two lines", and the reason is set out in full at B2.

---

# 🔴 READ FIRST — THE FIX IS BIGGER THAN THE BRIEF IMPLIES, AND HERE IS WHY

**The brief describes two causes and implies two line edits.** The `max-h-[60vh]` half is one line. **The
other half is not, and it cannot be, for a reason that is provable from the CSS:**

> **Inside a scrolling `<main>` there is NO pure-CSS way to size a sticky child to the scrollport.** A
> sticky element's `top` resolves against the scrollport; its **height** still comes from its own box, and
> CSS has no token meaning *"my scroll container's visible height"*. `height:100%` resolves against the
> parent's height, and the row's height is auto by design.

**That leaves exactly two ways to give the panel a viewport height, and one of them is forbidden:**

| Route | Verdict |
|---|---|
| `calc(100dvh − Npx)` — subtract the chrome | 🔴 **FORBIDDEN BY THE MANUAL, IN TERMS.** *"Hardcoded pixel offsets (`calc(100dvh - Npx)`, fixed heights) are FRAGILE — they desync when related layout/chrome changes… **Do NOT reintroduce magic-number offsets.**"* **And it would be wrong here anyway:** six of the bars above `<main>` are conditional (offline chip, demo strip, keep-awake prompt, event bar…), so there is no single N |
| ✅ **Flex fit** — stop `<main>` scrolling, let the columns scroll | ✅ **The manual's own prescribed pattern**, and **already shipping on the Add tab in landscape**: *"left menu `flex-1 min-h-0 overflow-y-auto`, right cart `flex-1 min-h-0 overflow-y-auto`"* |

🔴 **SO THE ORDERS TAB NOW USES THE ADD TAB'S PATTERN, SCOPED TO `lg:` ONLY.** `<main>` stops scrolling
at ≥1024px on the Orders tab; the orders column and the capacity panel become **sibling** scrollers.
**Below 1024px nothing changed at all.**

⚠️ **THIS IS THE PART TO PUSH BACK ON IF YOU WANT TO.** It changes which element scrolls on a live
trading surface in landscape. It is display-only, it is `lg:`-gated, and it is the pattern the manual
prescribes — **but nothing here has been rendered.**

---

# PART A — THE DUPLICATE OFFLINE BANNER (diagnosed, NOT changed)

## A1. Both banners, quoted

### 1. Orange/amber — `components/native/OfflineBanner.tsx:177-183`. **READ.**
```tsx
  let syncBanner: ReactNode = null
  if (phase === 'offline') {
    syncBanner = (
      <div className="w-full bg-amber-500 text-white text-sm font-semibold px-4 py-2 text-center">
        📴 Offline — {queued} {queued === 1 ? 'order' : 'orders'} saved on this device, will sync when you&apos;re back online.
      </div>
    )
```
**Component:** `OfflineBanner`, mounted at `app/dashboard/[token]/page.tsx:2574` (and KDS `:994`).

### 2. Dark — `app/dashboard/[token]/page.tsx:2594-2598`. **READ**, with its own comment:
```tsx
      {/* Persistent OFFLINE chip — shown on EVERY tab whenever offline (single isOffline source), so the
          operator always knows. Complements OfflineBanner (order-focused, native-only): this signals the
          global offline state + what's locked, on Settings/Stock too. Slim shrink-0 bar in the app-shell. */}
      {isOffline&&(
        <div className="w-full bg-slate-800 text-white text-xs font-semibold px-4 py-1.5 flex items-center justify-center gap-2 shrink-0">
          <span>📴 Offline — orders &amp; stock save on this device; settings are locked</span>
        </div>
      )}
```
**Component:** none — **inline in the dashboard page**, part of the app-shell.

⚠️ **A THIRD ONE EXISTS AND DID NOT RENDER ON YOUR iPAD:** `components/WebOfflineBanner.tsx`, mounted at
`page.tsx:2577`. **It is web-only** (`if (isNativeApp() || typeof window === 'undefined') return`).

## A2. 🔴 YOUR HYPOTHESIS IS **REFUTED**. One detector, two consumers.

**You proposed two independent detectors — `navigator.onLine` vs the Capacitor Network plugin. That is
not what the code does. Both banners subscribe to the SAME module.** READ, side by side:

**`OfflineBanner.tsx:81-89`:**
```tsx
  useEffect(() => {
    if (!isNativeApp()) return
    startReachability()
    …
    const unsub = onReachabilityChange((online) => {
      onlineRef.current = online
      if (!online) { cancelRetry(); retryAttempt.current = 0; setPhase('offline'); return }
```

**`page.tsx:850` — the dark chip's source, literally the same two calls:**
```tsx
  useEffect(()=>{if(!isNativeApp())return;startReachability();return onReachabilityChange(online=>setIsOffline(!online))},[])
```

**And the dashboard's own comment at `:467-469` says so explicitly:**
> *"SINGLE offline source for all offline gating… **Driven by the SAME reachability signal
> OfflineBanner/heartbeat use, so everything agrees.**"*

**What that shared module actually is — `lib/native/reachability.ts:1-18`. READ:**
```
// "Can we actually reach the server right now?" — NOT navigator.onLine (which is true on a connected-but-
// dead uplink). A lightweight periodic health-check (HEAD /api/ping) with DEBOUNCE thresholds…
// @capacitor/network events are used only as an INSTANT hint that then forces a check.
const FAIL_THRESHOLD = 3   // consecutive failures (~30s) before declaring OFFLINE
```

🔴 **CONCLUSION: this is NOT a detection bug and there is nothing to reconcile.** `startReachability()` is
idempotent, both consumers read one `online` flag, **so the two banners can never disagree and will
always appear together.** **The duplication is purely presentational.**

⚠️ **`navigator.onLine` DOES appear on the dashboard** — `page.tsx:466` `deviceOnline` — but it feeds only
the **heartbeat** (`:1092-1095`) and the paused-display guard (`:632`). **It drives neither banner.**
Your instinct that a `navigator.onLine` path exists was right; **it is not wired to either of the two
things you saw.**

## A3. Which surface each renders on

| Banner | Web | Native | Gate (READ) |
|---|---|---|---|
| Orange `OfflineBanner` | 🔴 **NO** | ✅ **YES** | `OfflineBanner.tsx:108` `if (!isNativeApp()) return null` |
| Dark chip | 🔴 **NO** | ✅ **YES** | inherits from `isOffline`, native-gated at its single source (`page.tsx:850`) |
| `WebOfflineBanner` | ✅ **YES** | 🔴 **NO** | `if (isNativeApp() …) return` |

✅ **Both of the banners you saw are native-only, which is why they appear together only in the app.**
⚠️ The dark chip's gating is deliberate and documented at `page.tsx:845-849`: on web there is **no
outbox**, so *"will sync"* would be **a false promise** — a web offline change is lost, not queued.

## A4. 🔴 NEITHER DELETED. What a merged banner would have to carry.

**Both messages are load-bearing and the overlap is only the word "Offline":**

| Fact | Orange | Dark | Can it be dropped? |
|---|---|---|---|
| You are offline | ✅ | ✅ | the only true duplicate |
| 🔴 **The queued-order COUNT** (`{queued}`, live-polled every 5s) | ✅ | ❌ | 🔴 **NO.** It is the operator's only sight of how much is unsynced |
| 🔴 **"settings are LOCKED"** | ❌ | ✅ | 🔴 **NO.** It is the only warning that controls will refuse |
| **Stock also saves locally** | ❌ | ✅ | no — a separate promise from orders |
| **"will sync when back online"** | ✅ | ❌ | the reassurance that nothing is lost |
| **On EVERY tab** (Settings/Stock too) | ❌ | ✅ | 🔴 the dark chip's entire reason to exist |
| **Distinct sync phases** (`syncing…` / `Synced N ✓`) | ✅ | ❌ | 🔴 **NO.** The orange bar is a state machine, not a static string |

**A single merged banner would need to say, at minimum:**
> *"Offline — N orders & stock saved on this device, will sync when you're back online. Settings are
> locked."*

⚠️ **Three things make that harder than it reads, and they are why I stopped rather than merging:**
1. **The orange bar is not a banner, it is a PHASE MACHINE** — `offline` / `syncing` / `synced` — and it
   also renders **two separate conflict banners** above itself (payment and status), one of which
   requires a two-step acknowledgement. **Merging means moving the count into the chip, or moving
   "settings are locked" into a component whose header comment says it is deliberately order-focused.**
2. **They live at different levels.** The chip is a `shrink-0` child of the app-shell **outside**
   `<main>`, on every tab; the orange bar is mounted once near the top. **A merge picks one home and
   changes where the other's information appears.**
3. **The copy convention is "device", never "iPad"** (`OfflineBanner.tsx:4`), and the wording is
   deliberately different in register — the chip is a status strip, the bar is a promise.

🔴 **NOTHING WAS CHANGED. STOPPED FOR YOUR DECISION, as A4 instructs.**

---

# PART B — THE CAPACITY PANEL (FIXED)

## B1. Both lines, and their full elements, BEFORE

**`components/dashboard/DayLoadStrip.tsx:72-75`:**
```tsx
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
      <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Kitchen capacity</p>
      <div className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto">
```

**`app/dashboard/[token]/page.tsx` — the whole chain, BEFORE:**
```tsx
:2842  <main className={`… flex-1 min-h-0 ${activeTab==='add'?'overflow-hidden px-4':'overflow-y-auto px-4 py-4 pb-20'}`}>
:2846    <div>                                              {/* orders tab, no classes */}
:2863      <div className="lg:flex lg:gap-5 lg:items-start">
:2866        <div className="@container lg:flex-1 lg:min-w-0">
:3345        <aside className="hidden lg:block lg:w-48 lg:flex-shrink-0 lg:sticky lg:top-0">
```

## B2. AFTER — a flex fit rooted in `h-dvh`. **No `vh` and no magic offset survives.**

```tsx
  <main className={`… flex-1 min-h-0 ${activeTab==='add'?'overflow-hidden px-4'
      :activeTab==='orders'?'overflow-y-auto lg:overflow-hidden px-4 py-4 pb-20 lg:pb-4'
      :'overflow-y-auto px-4 py-4 pb-20'}`}>
    <div className="lg:h-full lg:min-h-0 lg:flex lg:flex-col">
      <div className="lg:flex lg:gap-5 lg:items-stretch lg:flex-1 lg:min-h-0">
        <div className="@container lg:flex-1 lg:min-w-0 lg:min-h-0 lg:overflow-y-auto">   {/* orders scroller */}
        <aside className="hidden lg:flex lg:flex-col lg:w-48 lg:flex-shrink-0 lg:min-h-0">
```
```tsx
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col min-h-0 flex-1">
      <p className="… mb-2 shrink-0">Kitchen capacity</p>
      <div className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto">
```

### ✅ `dvh`, not `vh` — and it is stronger than a unit swap

**`max-h-[60vh]` is GONE, not converted.** The requirement was *"use `dvh`, not `vh`"*, and the fix
satisfies it **by inheritance rather than by literal**: the height now derives from the app-shell root
at `page.tsx:2568`, which is **`h-dvh`**, through `<main className="flex-1 min-h-0">` and the flex chain
above. 🔴 **A `dvh` fraction would still have been a guess about how much chrome sits above the panel;
the flex fit measures it.** **`vh` no longer appears anywhere in `DayLoadStrip.tsx`** — verified, the
file's only remaining bracket values are none.

## B3. ✅ All 37 rows remain in the DOM. Nothing capped, sliced or virtualised.

`:76` is unchanged: `{upcoming.map(s => {…})}` — **every filtered slot renders.** The list keeps
`overflow-y-auto`, so it is still independently scrollable; what changed is that its height is now the
space actually available rather than 60% of a viewport.

🔴 **THE ENGINE'S OUTPUT IS UNTOUCHED.** The complete diff of `DayLoadStrip.tsx` is **three className
strings plus comments** — proven at C3. No filter, no sort, no `tone`, no `label`, no threshold.

## B4. 🔴 `lg:items-start` — REMOVED, replaced by `lg:items-stretch`. Here is why the stretch failure cannot occur.

**Your objection was exactly right, and it was right about the OLD structure:**
> *"`items-stretch` sizes the panel to the ROW, and the row is driven by the orders grid, which grows
> without bound as orders arrive."*

✅ **True while the row's height was CONTENT-driven. It no longer is.** The row now carries
**`lg:flex-1 lg:min-h-0`** inside `lg:h-full lg:min-h-0 lg:flex lg:flex-col`, inside a **non-scrolling**
`<main>` of definite height. **So:**

| | Before | After |
|---|---|---|
| What sets the row's height | 🔴 **the orders grid** — unbounded, grows with every order | ✅ **the viewport remainder** — `flex-1` of a bounded column |
| What `items-stretch` would have given the panel | 🔴 thousands of pixels | ✅ **exactly one screen** |
| Where the orders go instead | they made the page tall | ✅ they scroll **inside their own column** (`lg:overflow-y-auto`) |

🔴 **THE TWO CHANGES ARE ONE CHANGE AND MUST NEVER BE SEPARATED.** If anyone removes `lg:flex-1
lg:min-h-0` from the row while leaving `lg:items-stretch`, **your unbounded-height bug returns exactly as
you described it.** That warning is written into the code at the row itself, not only here.

## B5. ✅ Portrait and phone are untouched — every change is `lg:`-gated

| Element | Below 1024px |
|---|---|
| `<main>` | `overflow-y-auto px-4 py-4 pb-20` — 🔴 **byte-identical to before.** `lg:overflow-hidden` and `lg:pb-4` do not apply |
| Orders wrapper | all four classes are `lg:` → **no classes apply**, identical to the bare `<div>` |
| The row | all five classes are `lg:` → **not even `display:flex`**, identical to before |
| Orders column | `@container` unchanged; the four new classes are all `lg:` |
| `<aside>` | **`hidden`** — as before. `lg:flex` replaced `lg:block`, and neither applies |
| `DayLoadStrip` card + list | ⚠️ **NOT `lg:`-gated** — but they are inside the `hidden` aside, so `display:none`. **The `strip` variant is a different return branch and was not touched at all** |

✅ **The iPad in PORTRAIT is 820pt wide → below `lg` → it renders the horizontal `strip`, exactly as it
does today.**

## B6. 🔴 THE NESTED-SCROLLER HAZARD — REMOVED, NOT MITIGATED

**The hazard was real and the fix eliminates it rather than working around it.**

| | Before | After (at `lg`) |
|---|---|---|
| `<main>` | 🔴 **scrolls** | ✅ **`lg:overflow-hidden` — does not scroll** |
| Orders column | static | ✅ **scrolls** |
| Capacity list | 🔴 **scrolls INSIDE a scrolling page** | ✅ **scrolls, as a SIBLING of the orders scroller** |
| Relationship | 🔴 **nested** | ✅ **siblings — neither contains the other** |

✅ **`position: sticky` is now absent from this chain entirely.** `lg:sticky lg:top-0` was removed from
the `<aside>` because `<main>` no longer scrolls, so it had nothing to stick to. §27 records
`sticky top-[51px]` as unreliable in this WebView and §22a records the whole stacked-sticky pattern as
the thing the app-shell replaced — **so an inert sticky was not worth keeping, and no offset replaced
it.** **No `top-[Npx]` was introduced anywhere.**

**What I can claim confidently:** this is **structurally the same arrangement as the Add Order tab in
landscape**, which the manual records as the fix for the previous instance of this exact class, and it
contains **no sticky element and no hardcoded offset** — the two ingredients of the `top-[51px]` failure.

🔴 **WHAT I CANNOT CLAIM, AND WILL NOT: that it has been observed.** Nothing was rendered. **INFERRED**
from the class values and from the Add tab's precedent. ⚠️ **One residual I can name but not test:** with
`<main>` non-scrolling at `lg`, a touch drag that starts on the capacity panel scrolls the panel and
**will not chain to the orders column**. That is correct behaviour, and it is also **new** behaviour.

---

# PART C — BLAST RADIUS

## C1. ✅ Still exactly one importer. Other surfaces untouched.

```
app/dashboard/[token]/page.tsx:41    import { DayLoadStrip } from '@/components/dashboard/DayLoadStrip'
app/dashboard/[token]/page.tsx:2973  <DayLoadStrip … variant="strip" />
app/dashboard/[token]/page.tsx:3378  <DayLoadStrip … variant="sidebar" />
```
**`git status` shows NO modification to** `app/dashboard/[token]/kds/page.tsx`,
`app/trucks/[slug]/order/page.tsx` or `app/admin/page.tsx`. ⚠️ `app/manage/[token]/page.tsx` **does**
appear as modified — **from an EARLIER task, not this one; this task did not open it for editing.**

## C2. What changes for each live operator

**Pizzeria Gusto:** on a landscape iPad or a desktop browser the Orders tab stops scrolling as a whole
page and instead scrolls the order column internally, while the Kitchen capacity panel fills the screen height
and shows roughly every slot at once instead of stopping around 18:35 — **on a phone or a portrait iPad
nothing whatsoever changes, and no order, price, gate or capacity number is affected on any device.**

**Tikka Tonic:** identical in every respect — the panel is ungated, so the same landscape/desktop change
applies and the same portrait/phone no-op applies, **with nothing altered in what the truck can do or
what its customers see.**

## C3. ✅ No capacity calculation, slot generation or threshold changed. **Layout only.**

**Proven from the diff, not asserted.** The **entire** `DayLoadStrip.tsx` code diff:
```diff
-    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
-      <p className="… uppercase tracking-widest mb-2">Kitchen capacity</p>
-      <div className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto">
+    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col min-h-0 flex-1">
+      <p className="… uppercase tracking-widest mb-2 shrink-0">Kitchen capacity</p>
+      <div className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto">
```
**Three className strings. Nothing else** — the `upcoming` filter/sort, `TONE`, `tone`, `label` and the
`is_grace`/`nowMins` guards are byte-identical. `lib/slot-generation.ts`, `lib/slot-availability.ts` and
`app/api/dashboard/route.ts` were **not opened for editing and do not appear in `git status`.**
**In `page.tsx` the code diff is five className strings; every other added line is a comment.**

---

# PART D — INTEGRITY

## D1 / D2. Non-ASCII census, before and after

| File | Bytes | Lines | Distinct non-ASCII | Gained | Lost |
|---|---|---|---|---|---|
| `app/dashboard/[token]/page.tsx` | 366,542 → **370,177** (+3,635) | 4,777 → 4,809 | **53 → 53** | **NONE** | **NONE** |
| `components/dashboard/DayLoadStrip.tsx` | 5,229 → **6,721** (+1,492) | 93 → 109 | **2 → 2** | **NONE** | **NONE** |

**Every changed count explained:**

- **`page.tsx`** — `─` 1795→1850 **(+55)**, `🔴` 62→66 **(+4)**, `—` 476→480 **(+4)**, `⚠` 53→55 **(+2)**,
  `FE0F` 51→53 **(+2)**: the four new comment blocks, in the file's existing house style. ✅ **The
  `⚠`/`FE0F` pair moves in lockstep — no half-written `⚠️`.**
  ⚠️ **`→` 112→111 (−1)** — the one **removed** codepoint: the old aside comment read *"bars live outside
  main **→** offset is 0"*, and that comment was replaced because it described the sticky behaviour that
  no longer exists. **Accounted for, not unexplained.**
- **`DayLoadStrip.tsx`** — **only `—` 9→10 (+1).** 🔴 **This file has only ever held TWO non-ASCII
  classes (`—` and `→`), so the comment was written deliberately ASCII-only apart from one em dash** —
  no `🔴`, no `⚠️`, none of the markers used freely in `page.tsx`. **A house style is per-file here.**

## D3. Byte scan — byte-level tool, never grep

| File | NUL (0x00) | Ctrl < 0x09 | Other C0 (0x0B-0x1F, 0x7F) |
|---|---|---|---|
| `app/dashboard/[token]/page.tsx` | **0** | **0** | **0** |
| `components/dashboard/DayLoadStrip.tsx` | **0** | **0** | **0** |

## D4. This report — separate post-write pass

*(Run after the file was on disk; result stated in the session output.)*

## D5. `git status` and `git diff --stat`

```
$ git status --porcelain
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
?? docs/appstore-completeness-report.md
?? docs/appstore-report.md
?? docs/brand-home-link-report.md
?? docs/capacity-panel-report.md
?? docs/completeness-sweep-report.md
?? docs/dependency-pin-report.md
?? docs/ipad-build-report.md
?? docs/presubmission-housekeeping-report.md
?? docs/privacy-manifest-report.md
?? ios/App/App/PrivacyInfo.xcprivacy

$ git diff --stat
 app/(legal)/layout.tsx                |  54 +++-
 app/contact/page.tsx                  |  14 +-
 app/dashboard/[token]/page.tsx        |  75 ++++-
 app/manage/[token]/page.tsx           |  50 ++--
 components/dashboard/DayLoadStrip.tsx |  22 +-
 components/shared/AppHeader.tsx       |  28 +-
 docs/reference-manual.md              | 512 +++++++++++++++++++++++++++++++++-
 ios/App/App.xcodeproj/project.pbxproj |   8 +-
 ios/App/App/Info.plist                |  16 ++
 lib/plan-features.ts                  |  14 +-
 package.json                          |  24 +-
 11 files changed, 737 insertions(+), 80 deletions(-)
```

🔴 **THIS TASK CHANGED EXACTLY TWO FILES.** ⚠️ **`git diff` is cumulative across every uncommitted task
in this sequence**, so `page.tsx`'s diff also contains the earlier access-denied `isNativeApp()` ternary
and `manage/page.tsx` is entirely earlier work. **Nothing was committed.**

## D6. ✅ `tsc --noEmit`: **EXIT 0, ZERO OUTPUT** — and that is not verification

🔴 **TSC-CLEAN MEANS IT COMPILES. NOTHING MORE.** Stated explicitly because this change is **entirely
CSS classes, which TypeScript does not check at all**:

- It cannot see a Tailwind class, cannot know whether `lg:flex-1` is valid, and would be equally happy
  with a typo like `lg:flex1`.
- It does **not** prove the panel fills the height, that the orders column scrolls, or that anything
  looks right in either orientation.
- **Nothing was rendered** — no browser, no simulator, no iPad. **Every height claim is INFERRED from
  class values.**

---

# WHAT REMAINS UNPROVEN

1. 🔴 **Nothing was rendered.** The flex fit is **INFERRED** correct from the class chain and from the Add
   tab's identical, already-shipping arrangement. **It has not been seen.**
2. 🔴 **PART A IS NOT DONE, DELIBERATELY.** Both offline banners are untouched and both still render.
3. ⚠️ **The touch-scroll behaviour of two sibling scrollers at `lg` is new and untested**, including
   whether a drag begun on the panel behaves acceptably (B6).
4. ⚠️ **I did not verify the truck's `collection_interval_mins`.** "37 rows" assumes your 5-minute
   premise; the fix is independent of it either way.
5. ⚠️ **Interaction with the two open iPad display defects is unknown.** §27's four-for-four tab split
   turned on which tabs have an `overflow-y-auto` `<main>` — **the Orders tab no longer does at `lg`,
   which changes the evidence base for that finding.** It may help, hurt, or do nothing; **worth
   re-testing defects (a) and (b) on this build specifically.**
6. **No `cap sync`, no build, no deploy** — the iPad is running the previously installed binary against
   **production**, so **none of this is on the device until it is deployed.**
