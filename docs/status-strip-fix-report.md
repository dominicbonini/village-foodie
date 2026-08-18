# Double inset — fixed. The wrapper no longer claims the strip.

**Diagnosis accepted from [docs/status-strip-shift-report.md](status-strip-shift-report.md) and re-read before touching anything.**
**Model chosen: (a).** The banners moved BELOW `AppHeader`. The wrapper's `paddingTop` is gone — not
conditionalised, not painted, **gone**. One file changed: `app/dashboard/[token]/page.tsx`.

⚠️ **This does not reach the iPad until `npx cap sync ios` and a rebuild.** See §7.

---

## 1 · The DOM order, before and after

**Before** — the app-shell root is `bg-slate-50 h-dvh flex flex-col overflow-hidden`:

| # | Element | In flow? |
|---|---|---|
| 1 | `<AppLockGate />` | `fixed` / `null` |
| 2 | 🔴 **`<div style={{ paddingTop: 'env(safe-area-inset-top)' }}>`** — the four banners | ✅ **topmost in flow, painted nothing** |
| 3 | `{isDemo&&<DemoModeBanner …/>}` | ✅ in-flow bar |
| 4 | `{isDemo&&<DemoWelcome …/>}` | `fixed` / `null` |
| 5 | `<KeepAwakePrompt … />` | ✅ in-flow bar |
| 6 | `<DevOfflineToggle /> <DevOutboxInspector />` | `fixed` / `null` |
| 7 | `<DeviceSetupGate … />` | `fixed` / `null` |
| 8 | `<AppHeader sticky={false} … />` — `bg-slate-900`, `paddingTop: env(safe-area-inset-top)` | ✅ |
| 9 | tabs bar · 10 event bar · 11 card-payments banner · 12 `<main>` | ✅ |

**After — extracted by executing a parser over the file, not by reading it:**

```
FINAL DIRECT CHILDREN OF THE APP-SHELL ROOT, IN ORDER:
   1. <AppLockGate />
   2. {isDemo&&<DemoWelcome token={token} orderUrl={customerOrderUrl} isSample=…
   3. <DevOfflineToggle />
   4. <DevOutboxInspector />
   5. <DeviceSetupGate token={token} onOpenOrder={openOrderFromPush} />
   6. <AppHeader
   7. <div className="bg-slate-900 border-b border-slate-700 shrink-0 z-40">      ← tabs
   8. {(activeTab==='orders'||activeTab==='add'||activeTab==='stock'||…)&&(       ← event bar
   9. <div>                                                                       ← THE BANNER STACK
  10. {isDemo&&<DemoModeBanner action={<DemoGetStarted …
  11. <KeepAwakePrompt keepScreenOn={keepScreenOn} wakeState={wakeState} …
  12. {truck?.online_payments_paused_at&&(                                        ← card-payments banner
  13. <main className={`w-full min-[1400px]:max-w-5xl …
```

### 🔴 (a) is true, and I went further than the four banners in the wrapper

The brief's model — *"the header owns the strip unconditionally and no banner ever reaches it"* — was not
satisfied by moving the wrapper alone. **`DemoModeBanner` and `KeepAwakePrompt` were also in-flow bars above
`AppHeader`**, both plain `w-full … shrink-0` blocks:

```tsx
    <div ref={innerRef} className={`w-full bg-orange-50 px-4 py-2 shrink-0 border-b-2 border-slate-900 ${className}`}>
```
```tsx
      <div className="w-full bg-amber-600 text-white text-xs font-semibold px-4 py-2 flex items-center justify-center gap-2 shrink-0">
```

On a demo truck, or on any truck with keep-screen-on pending, either would have become the element under the
iOS clock the moment it showed — the same defect, merely conditional rather than unconditional. Leaving them
would have made "no banner ever reaches the strip" false while every other claim stayed true. **Both moved
down with the stack, in their original relative order.** `DemoWelcome` stayed put: it is a `fixed inset-0`
modal and never participates in the column.

### Proof that nothing above the header is in flow — executed

```
EVERY ELEMENT ABOVE AppHeader — is it out of flow or null?
  AppLockGate          return-null sites= 1   root: fixed inset-0 z-[80] bg-slate-900 …
  DemoWelcome          return-null sites= 1   root: fixed inset-0 z-[80] bg-black/60 …
  DevOfflineToggle     return-null sites= 1   root: fixed left-2 z-[9999] …   (and `if (IS_PROD …) return null`)
  DevOutboxInspector   return-null sites= 1   root: fixed right-2 z-[9999] …
  DeviceSetupGate      return-null sites= 3   root: fixed inset-0 bg-black/70 z-[60] …
```

**Every one of the five is either `position: fixed` or returns `null`. `AppHeader` is now the first and only
in-flow child of the app shell, so it is the only element that can occupy the status-bar strip.**

---

## 2 · The cost of (a): what a banner below the header looks like

**It looks like the banner that is already there.** The card-payments banner has sat outside `<main>`, below
the event bar, since it was written — with its own comment saying why:

```tsx
      {/* ⚠️ IT SITS OUTSIDE <main> ON PURPOSE, so it shows on EVERY tab and is not inside the scroll
          container that Add manages itself. */}
      {truck?.online_payments_paused_at&&(
```

The stack now sits immediately above it, in the same position, for the same reason. So this is not a new
layout idea being tried on a live operator screen — it is the page's own existing pattern, applied to the
bars that were the exception.

**Placement is below the event bar, not directly under the header, deliberately.** Header, tabs and event bar
are three contiguous bars of chrome (`bg-slate-900`, `bg-slate-900`, `bg-slate-800`). A red alert wedged
between two navy bars reads as a rendering fault. Below all three, it reads as the top of the content.

### Does anything depend on them being above?

| Possible dependency | Checked | Verdict |
|---|---|---|
| Renders on every tab | still an app-shell child, **outside `<main>`** | ✅ unchanged |
| Not inside the scroll container | `<main>` is the only scroller; the stack is its sibling | ✅ unchanged |
| Stacking / z-index | all four banner roots are plain `w-full` blocks — **no `fixed`, no `sticky`, no `z-*`** | ✅ nothing to reorder |
| Dismissal, conditions, copy, grouping | not touched — see §3 | ✅ unchanged |
| The safe-area inset | that WAS the dependency, and it is the thing being removed | 🔴 deliberately broken |

The one real cost: **an offline banner is now the fourth bar down rather than the first thing on screen.**
It is full-width, red or amber, directly above the content, and above the fold on every device — but it is no
longer the very top pixel. That is the price of the header owning the strip, and it is the trade the chosen
model makes.

---

## 3 · Nothing about any banner changed — proved by comparison, not by assertion

The six moved components were extracted from `HEAD`'s copy of the file and from the working tree, with JSX
comments stripped and whitespace normalised, then compared:

```
PER-BANNER INVOCATION, BEFORE vs AFTER (whitespace-normalised):
  OfflineBanner          before=1 after=1  IDENTICAL=True
  WebOfflineBanner       before=1 after=1  IDENTICAL=True
  CapacityBreachBanner   before=1 after=1  IDENTICAL=True
  BuzzerLostBanner       before=1 after=1  IDENTICAL=True
  DemoModeBanner         before=1 after=1  IDENTICAL=True
  KeepAwakePrompt        before=1 after=1  IDENTICAL=True

ALL SIX INVOCATIONS BYTE-IDENTICAL (props, order, conditions): True
```

Same components, same props, same order within the stack, same conditions. **No banner component file was
opened for editing.** The diff is four hunks in one file:

```
@@ -2881,35 +2881,9 @@    the wrapper + its four banners removed from above AppHeader
@@ -2934   +2908,4 @@      DemoModeBanner's old site replaced by a pointer comment
@@ -2950   +2926,0 @@      KeepAwakePrompt lifted from above AppHeader
@@ -3143,0 +3120,39 @@     the whole block re-inserted below the event bar
```

---

## 4 · 🔴 The inset is applied exactly once, and the element applying it paints it

**Where it ends up:** `components/shared/AppHeader.tsx:45`, unchanged and untouched —

```tsx
    <header
      className={`bg-slate-900 ${sticky ? 'sticky top-0' : 'relative'} z-50 shadow-md`}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
```

The padding is **inside** an element whose background is `bg-slate-900` (`#0F172A`), so the inset it reserves
is the inset it paints. That is the manual's intended mechanism, restored exactly.

**Proof nothing else adds it** — a scan of all 325 `.ts`/`.tsx`/`.css` files with JSX comments, block comments
and line comments stripped first, so a mention inside a comment cannot register:

```
files scanned: 325
EXECUTABLE occurrences of env(safe-area-inset-top): 2
  ./app/dashboard/[token]/kds/page.tsx
      style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}
  ./components/shared/AppHeader.tsx
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
```

Two in the entire codebase, on **two different pages**:

- `AppHeader` — the dashboard, manage and admin header. **One inset in the dashboard's column.**
- the KDS's own hand-rolled header — a different route, out of scope, untouched (§6).

`app/dashboard/[token]/page.tsx` now contains **zero** executable occurrences. The two textual matches left in
that file are both inside `{/* … */}` comments, and both exist to stop the padding being reintroduced.

---

## 5 · Web and desktop are unchanged — and why removing a padding is safe here

The concern is fair: removing a padding is not automatically a no-op. It is here, for a reason specific to
what was removed.

**`env(safe-area-inset-top)` resolves to `0px` in every desktop and mobile browser** — there is no safe area
to report. The wrapper's *entire* computed `padding-top` on web was therefore `0px`. This is the exact
property the code that introduced it claimed for itself:

```
🔴 BARE `env()` IS THEREFORE THE ONE FORM THAT LEAVES WEB BYTE-IDENTICAL: 0 on web and desktop,
0 on Android by design (see lib/native/statusBar.ts), the true inset on iOS.
```

Removing a declaration whose computed value is `0px` changes no box on web. And note what was **not** used:
the `max(0.5rem, …)` floor. Had the wrapper carried a floor, removing it would have deleted a real 8px on web
— the comment above is explicit that the floor was rejected precisely so web stayed at zero. **The absence of
a floor is what makes this removal free.**

The wrapper itself survives as a bare `<div>`, so the four banners remain children of one block rather than
becoming four separate flex items. No `shrink-0`, no background and no classes were added — the element's
class list is empty before and after, so its flex behaviour is unchanged too.

⚠️ **The one thing web DOES see: the vertical order.** The stack moved below the header, tabs and event bar
on every platform, web included. That is the fix, not a side effect, and it is the same reordering the brief
chose. Nothing moves by a pixel that was not intended to move by exactly that much.

---

## 6 · KDS and Android — confirmed untouched

**KDS.** Out of scope and not edited. `app/dashboard/[token]/kds/page.tsx` still carries its own
`paddingTop: 'max(0.625rem, env(safe-area-inset-top))'` on a `bg-white` header, with
`configureStatusBar('dark')` for dark glyphs — its white strip is painted by its own header, by design. It
appears in the executable scan in §4 for exactly that reason, and its byte count is unchanged.

**Android.** Not edited, and structurally unreachable. `lib/native/statusBar.ts:60` forbids exactly this:

```ts
    // 🚫 DO NOT ADD env(safe-area-inset-top) OR --safe-area-inset-top HANDLING FOR ANDROID.
    // ONLY ONE MECHANISM MAY OWN THE INSET. On Android 15+ Capacitor's core SystemBars plugin has ALREADY
    // padded the WebView's parent down by the status-bar height … AppHeader's paddingTop:
    // env(safe-area-inset-top) is safe precisely BECAUSE env() resolves to 0 there.
```

`env()` is 0 on Android, so the padding removed here was 0 there, and the change is a no-op. **This fix
removes an inset; it cannot add one, so it cannot break the "only one mechanism owns the inset" rule that
file exists to protect.** `capacitor.config.ts` and `statusBar.ts` were not opened.

---

## 7 · ⚠️ This does not reach the iPad without a sync and a rebuild

**Plainly: nothing in this change is live on the device until the native shell is rebuilt.**

The iOS shell loads `https://www.hatchgrab.com/app` from `server.url`, so the *page* comes over the wire —
but reaching it still needs the deployed web build, and the standing project workflow for getting a change
onto hardware is `npx cap sync ios` followed by an Xcode build. The sequence is: **deploy the web change →
`npx cap sync ios` → rebuild in Xcode → install on the iPad.**

**Can Cursor run the sync?** It can run the *command* — `npx cap sync ios` is an ordinary shell command and
this environment can execute shell commands. **It cannot do the part that matters**: `cap sync` only copies
config and plugins into `ios/App`; the actual build and install is Xcode on macOS, driven by you, with a
signing identity and a connected device. So the honest answer is **no — not end to end.** I have not run
`cap sync`, because the brief says no build and no deploy, and running it would rewrite
`ios/App/App/capacitor.config.json`, which is a build artifact this task has no business touching.

⚠️ One trap worth restating from `capacitor.config.ts`: run the sync with `CAP_SERVER_URL` **unset**. Set, it
bakes a localhost URL into the shipped config.

---

## 8 · 🔴 SEPARATE LIVE DEFECT — `village` on the event-cancel path. NAMED, NOT FIXED.

**Not fixed, not absorbed. Nothing in `app/api/` was touched.**

`app/api/events/action/route.ts:179-183`, inside the `action === 'cancel'` branch:

```ts
    // Fetch event details before cancelling (for email + reject-memory).
    const { data: eventRow } = await supabase
      .from('truck_events')
      .select('venue_name, village, event_date, scraped_signature')
      .eq('id', eventId)
      .single()
```

`truck_events` has no `village` column. Postgres answers `42703: column truck_events.village does not exist`
— the same error my seed preflight hit on the same column name, which is how this surfaced.

### Does it fail the request, or is it caught?

**Neither. It is silently discarded — worse than caught.** The destructure takes `data` and **throws the
`error` away**: there is no `error` binding, no `if (error)`, no `try`. PostgREST returns the failure, the
client hands back `data: null`, and the route continues as though the event simply had no row.

`const { error } = await …` guards exist on the very next statement and elsewhere in the same function — this
one select is the exception.

### What actually breaks

`eventRow` is `null`, and it is read at four sites downstream. **The cancel itself still succeeds** — the
`UPDATE` to `status: 'cancelled'` is a separate statement and is checked — and the affected orders are still
cancelled. What is lost is everything that needed the event's details:

| Line | Code | Consequence when `eventRow` is `null` |
|---|---|---|
| `:196` | `if (payload?.suppress && eventRow) {` | 🔴 **The whole reject-memory block is skipped.** No row is written to `rejected_event_signatures`. |
| `:234-236` | `venueName: eventRow?.venue_name ?? null,`<br>`village: eventRow?.village ?? null,`<br>`eventDate: eventRow?.event_date ?? null,` | 🔴 **The customer cancellation email loses its venue, village and date** — every customer of the cancelled event is emailed a cancellation that does not say which event. |
| `:248-250` | `if (eventRow?.event_date) { … rebuildProductionSlotUsage(…) }` | 🔴 **The rebuild never runs.** The cancelled event's items stay in the date-keyed `production_slot_usage` rows and keep bleeding into other same-date events' capacity projections — the exact drift the comment above it says it exists to prevent. |

### The operator action it breaks

**Cancelling an event, and rejecting a scraped pending event.** Both take this branch. The operator sees a
successful cancel, so nothing looks wrong — but:

1. **Rejecting a scraped event does not stick.** The suppression signature is never stored, so the scraper
   bridge re-creates the same event on its next run. The operator rejects it again. And again. From the
   outside this is indistinguishable from "the reject button doesn't work", and there is no error anywhere to
   point at it.
2. **Customers get a cancellation email with no event named** — no venue, no village, no date.
3. **Capacity projections silently drift** on any date that has more than one event.

⚠️ Note `:265` does the same `.single()` fetch for a different action and selects
`venue_name, event_date, scraped_signature` — **without `village`**, and it *does* check its result
(`if (!eventRow) return … 404`). So the correct column list and the correct error handling both already exist
in this file, twenty lines below. **This is one select out of step with its own neighbour.** I have not
changed it.

---

## 9 · Verification

### Verified by EXECUTION

| Claim | How |
|---|---|
| ✅ **The inset is applied exactly once, and the element applying it paints it** | Comment-stripping scan of all 325 `.ts`/`.tsx`/`.css` files: **2 executable occurrences**, on two different pages; **0** in the dashboard page. The surviving dashboard one is inside `<header className="bg-slate-900 …">`. |
| ✅ **The page no longer sits at twice the inset** | Follows from the above by construction: the dashboard column now contains exactly one `env(safe-area-inset-top)`. The parser-extracted child list shows `AppHeader` as the first in-flow child, with nothing before it that has a box. |
| ✅ **Nothing above the header can occupy the strip** | Per-component audit of all five remaining pre-header children: every one is `position: fixed` or returns `null`. |
| ✅ **No banner changed** | Byte-identical comparison of all six invocations between `HEAD` and the working tree, comments stripped, whitespace normalised — **True** for all six. |
| ✅ **Byte integrity of the edited file** | Before/after scan: 0 flagged control bytes both sides; non-ASCII class count unchanged at 53 (§10). |

### Verified by SOURCE ONLY

| Claim | Basis, and its limit |
|---|---|
| ⚠️ **A visible banner is not hidden under the status bar** | **Source only.** It follows deductively — every banner is now below a header that starts at viewport top and fills the inset — but I have not rendered it on a device. This is the claim most worth checking on hardware, by forcing an offline banner. |
| ⚠️ **Web and desktop unchanged** | **Source only**, resting on `env(safe-area-inset-top)` computing to `0px` off-iOS and on the removed declaration carrying no `max()` floor. The wrapper keeps an empty class list, so its flex behaviour is unchanged. No browser was opened. |
| ⚠️ **KDS and Android untouched** | **Source only** — neither file was edited; the KDS's inset still appears in the executable scan; `env()` is 0 on Android by the documented design. |
| ⚠️ **The `village` defect's runtime behaviour** | **Source only.** The discarded-error reading is from the destructure and the four `eventRow` read sites; I did not execute the cancel path. |

### 🔴 Not offered as verification

`npx tsc --noEmit` reports no error involving this file. **The brief is right that this is not verification**
and it is not offered as such — a JSX reorder is exactly the class of change TypeScript cannot fail on. It is
recorded only to say the file still compiles.

**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any commit, any SQL.

---

## 10 · Integrity

### Byte-level scan — separate pass per file, byte tool (`open(path,'rb')`), never grep

Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.

**`app/dashboard/[token]/page.tsx` — BEFORE (`git show HEAD:…`) vs AFTER (working tree):**

| | Bytes | NUL | Other flagged | **Total flagged** | TAB / LF / CR | non-ASCII | distinct classes |
|---|---|---|---|---|---|---|---|
| **Before** | 405491 | 0 | 0 | **0** | 0 / 5188 / 0 | 3756 | **53** |
| **After** | 406902 | 0 | 0 | **0** | 0 / 5203 / 0 | 3767 | **53** |

**Zero flagged control bytes on both sides. No sanitisation was needed and none was performed.**

Class census delta — only counts moved, and only in classes the file already contained. **No class was
introduced or eliminated** (53 → 53):

| Class | Before | After | Δ |
|---|---|---|---|
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 2588 | 2592 | +4 |
| U+2014 EM DASH | 535 | 538 | +3 |
| U+1F534 LARGE RED CIRCLE | 126 | 127 | +1 |
| U+26A0 WARNING SIGN | 92 | 93 | +1 |
| U+FE0F VARIATION SELECTOR-16 | 91 | 92 | +1 |
| U+00D7 MULTIPLICATION SIGN | 12 | 13 | +1 |
| *all other 47 classes* | — | — | **0** |

Every delta is comment text I added. U+26A0 and U+FE0F moved together, +1 each — the file's existing
convention of pairing the warning sign with a variation selector is preserved exactly.

**`docs/status-strip-fix-report.md`** — scanned as a separate pass after writing; figures in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the number
changes the file, which changes the number. The digit-stable figure, and the one that matters, is the flagged
count: **zero**. Length, LF count and the full class census were measured on the final file and reported in
chat.

### Carrier-aware variation-selector check

Per emoji-presentation base, bare versus followed by U+FE0F. Counts in the chat reply (same constraint as
above). The rule they satisfy: `Emoji_Presentation=Yes` bases are 100% bare — a VS-16 on them is redundant —
and `Emoji_Presentation=No` bases are 100% paired, without which they render as monochrome text glyphs. **No
base appears both bare and paired.**

### `git status --porcelain`

Printed in the chat reply.

| Entry | Pre-existed this task? |
|---|---|
| `M docs/reference-manual.md` | ✅ **YES — pre-existed this entire session.** Sole entry in the opening git snapshot; nothing here has touched it. |
| `M lib/truck-logo.ts` | ❌ No — the header-logo fix from an earlier request in this session. |
| `?? scripts/seed-thai-kitchen-screenshots.sql` | ❌ No — the Thai Kitchen seed, earlier in this session. |
| `?? docs/screenshot-seed-report.md` | ❌ No — that task's report. |
| `?? docs/status-strip-shift-report.md` | ❌ No — the diagnosis this fix implements. |
| `M app/dashboard/[token]/page.tsx` | ❌ No — **this task's only code change.** |
| `?? docs/status-strip-fix-report.md` | ❌ No — **this report.** |

Nothing was committed, staged, reverted, stashed or cleaned. **No `git stash`, `git checkout` or
`git restore` was run at any point in this session.** The only git commands used here were read-only:
`git diff`, `git show HEAD:<path>` and `git status`.

---

## 11 · Flags

1. **I moved two bars the brief did not list** — `DemoModeBanner` and `KeepAwakePrompt` (§1). Model (a) says
   *no banner ever reaches the strip*; leaving these two would have left that false on a demo truck or
   whenever keep-screen-on is pending. Position only: their copy, conditions and props are byte-identical.
2. **The offline banner is no longer the top pixel** (§2). It is still full-width and above the fold on every
   device, but it now sits below three bars of chrome. That is inherent to (a), not a defect.
3. **No instruction in this prompt contradicted another, and no span arrived garbled.** Nothing needed asking.
4. **`app/api/events/action/route.ts:181` is reported and deliberately NOT fixed** (§8) — it breaks the
   event-cancel and scraped-event-reject paths in three ways and is silently swallowed, so nothing surfaces
   it to an operator.
