# Status-bar strip white, page shifted down — read-only diagnosis

**Verdict: the hypothesis is CONFIRMED, in full, including the "whether or not any banner is showing" clause.**
Nothing was changed. No build, no deploy, no SQL, no git state operation.

**The cause:** the banner-stack wrapper at [app/dashboard/[token]/page.tsx:2897](../app/dashboard/%5Btoken%5D/page.tsx#L2897) —
an **unconditional** `<div>` carrying `paddingTop: env(safe-area-inset-top)` and **no background** — sits
above `AppHeader` in the dashboard's flex column. It reserves the strip's height and paints nothing, so the
root's `bg-slate-50` shows through as the white strip; and because `AppHeader` still carries its own
`env(safe-area-inset-top)`, the page is pushed down by **twice** the inset.

⚠️ **One correction to the brief, stated up front:** the banner safe-area work did **not** land in
`acb13d1`. It landed in **`f9c6972`** (18 Aug, 14:41, "offline updates"). `acb13d1` (15:15) touched only the
`CapacityBreachBanner` props *inside* the already-existing wrapper. Detail and pickaxe output in Q4.

---

## Q1 · The banner wrapper, exactly as it stands

`app/dashboard/[token]/page.tsx:2897`:

```tsx
      <div style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <OfflineBanner conflicts={outboxConflicts} resolveLabel={resolveConflictLabel} onAcknowledge={acknowledgeConflicts} onSynced={()=>{reseedRef.current();refreshPendingStatus()}} />
        {/* WEB-only counterpart: no queue on web, so just a clear "you're offline, orders won't send" bar
            (renders null on native, where OfflineBanner owns the offline state). */}
        <WebOfflineBanner />
        {/* Piece 2 — reconnect capacity-exceeded flag (detection only, non-blocking, dismissible). Fed by
            the server's detectCapacityBreaches; a fresh fetchAll after a drain refreshes it. */}
        <CapacityBreachBanner breaches={capacityBreaches} orders={orders} dismissedSig={effectiveBreachDismissedSig} onDismiss={dismissBreaches} />
        {/* Assign opens the STANDARD grid for that order — same component, same rules. The order is
            looked up live in `orders` so the grid gets the real row (and its current buzzer, which is
            null by definition here); if it has since left the fetched window the banner row simply does
            nothing rather than opening a grid against a phantom. */}
        <BuzzerLostBanner
          losses={buzzerLosses}
          dismissedKeys={dismissedBuzzerLosses}
          onDismiss={(k)=>setDismissedBuzzerLosses(prev=>{const n=new Set(prev);n.add(k);return n})}
          onAssign={(l)=>{const ord=orders.find(o=>o.order_key===l.order_key);if(ord)setBuzzerTarget(ord)}}
        />
      </div>
```

| Question | Answer |
|---|---|
| **Element** | plain `<div>` |
| **`paddingTop`** | `env(safe-area-inset-top)` — bare, no `max()` floor |
| **Background classes** | 🔴 **NONE.** No `className` attribute at all — no `bg-*`, nothing. The only attribute is the inline `style`. |
| **Conditional on having children?** | 🔴 **NO.** It is written unconditionally into the JSX. There is no `&&`, no ternary, no `children.length` test, no wrapping component that could return `null`. |
| **Renders when no banner is showing?** | 🔴 **YES — and this is the defect.** |

**Why "no banner showing" still renders the box.** The conditionality lives in the *children*, one level too
low. Each returns `null` independently, and the wrapper never learns that:

| Child | Returns `null` when |
|---|---|
| `OfflineBanner` | `components/native/OfflineBanner.tsx:108` — `if (!isNativeApp()) return null`; `:206` — `if (!conflictBanner && !syncBanner) return null` |
| `WebOfflineBanner` | `components/WebOfflineBanner.tsx:66` — `if (isNativeApp() \|\| !offline) return null` |
| `CapacityBreachBanner` | `components/dashboard/CapacityBreachBanner.tsx:36` — `if (!breaches \|\| breaches.length === 0) return null`; `:38` — `if (sig === dismissedSig) return null` |
| `BuzzerLostBanner` | `components/dashboard/BuzzerLostBanner.tsx:51` — `if (visible.length === 0) return null` |

On a healthy native dashboard — online, no conflicts, no breaches, no lost buzzers — **all four return
`null`**. React still renders the wrapper `<div>`: an element with zero content, `box-sizing: border-box`,
and a `padding-top` of exactly the safe-area inset. **Its rendered height is the inset. Its painted colour is
none.**

---

## Q2 · 🔴 Is the inset applied twice? — YES

**The wrapper** (`app/dashboard/[token]/page.tsx:2897`):

```tsx
      <div style={{ paddingTop: 'env(safe-area-inset-top)' }}>
```

**`AppHeader`** (`components/shared/AppHeader.tsx:41-45`):

```tsx
    <header
      className={`bg-slate-900 ${sticky ? 'sticky top-0' : 'relative'} z-50 shadow-md`}
      /* Native app: extend the dark header UP into the status-bar/safe-area inset so no page content shows
         above it. env(safe-area-inset-top) is 0 in a normal browser → web is byte-for-byte unchanged. Pairs
         with capacitor contentInset:'never' + viewport-fit=cover, which let CSS own the safe area. */
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
```

**Byte-identical declarations, both rendering, one directly above the other in the same flex column.**

### What each inset actually contributes

They are not symmetrical, and the asymmetry is exactly why *both* symptoms appear together:

| | Painted? | Contributes height? |
|---|---|---|
| **Wrapper's inset** | ❌ **No background.** The root's `bg-slate-50` shows through. | ✅ inset px |
| **`AppHeader`'s inset** | ✅ It is *inside* `<header className="bg-slate-900 …">`, so this padding paints **navy** (`#0F172A`) | ✅ inset px |

So the total downward shift is **2 × `env(safe-area-inset-top)`**, of which the **top half is near-white and
the bottom half is navy**. That is precisely the reported picture: a white strip, then the dark header
starting below it, and everything below shifted down by noticeably more than one status bar.

`AppHeader`'s padding is doing exactly the job it was written for — it just no longer starts at the top of the
viewport, because something unpainted is occupying that space first.

### Why the strip reads as *white*, not merely unpainted

Two facts compound:

1. Nothing paints the wrapper, so the strip shows the app-shell root: `bg-slate-50` = **`#F8FAFC`**.
2. The dashboard still asks iOS for **light** status-bar glyphs, correctly for a navy header —
   `app/dashboard/[token]/page.tsx:201`:

```tsx
  useEffect(()=>{if(isNativeApp()){setLastScreen('dashboard');void configureStatusBar()}},[]) // configureStatusBar here too (not only cold-launch /app) so the WebView overlays the status bar wherever AppHeader renders
```

`configureStatusBar()` defaults to `'light'`, and `lib/native/statusBar.ts:70`:

```ts
    // Style.Dark = LIGHT glyphs, Style.Light = DARK glyphs. Inverted, hence StatusBarContent above.
    await StatusBar.setStyle({ style: content === 'dark' ? Style.Light : Style.Dark })
```

→ **white clock and battery, drawn on `#F8FAFC`.** "Barely legible" is the arithmetic of those two lines.

---

## Q3 · DOM order at the top of the dashboard

Root: `app/dashboard/[token]/page.tsx:2875`.

| # | Element | Background | Padding | In flow? |
|---|---|---|---|---|
| — | `<div className="bg-slate-50 h-dvh flex flex-col overflow-hidden">` | **`bg-slate-50` = `#F8FAFC`** | none | root |
| 1 | `<AppLockGate />` | `fixed inset-0 z-[80] bg-slate-900` **when locked**; `null` otherwise (`components/native/AppLockGate.tsx:63`) | — | ❌ `fixed` / `null` |
| 2 | 🔴 **`<div style={{ paddingTop: 'env(safe-area-inset-top)' }}>`** | 🔴 **NONE** | `padding-top: env(safe-area-inset-top)` | ✅ **YES — TOPMOST IN FLOW** |
| 2a–d | `OfflineBanner`, `WebOfflineBanner`, `CapacityBreachBanner`, `BuzzerLostBanner` | each paints its own bar when shown | own `py-2`/`py-3` | all `null` in the steady state |
| 3 | `{isDemo && <DemoModeBanner …/>}` | — | — | not demo → nothing |
| 4 | `{isDemo && <DemoWelcome …/>}` | — | — | not demo → nothing |
| 5 | `<KeepAwakePrompt … />` | — | — | `null` unless pref on and lock unheld (`KeepAwakePrompt.tsx:22`) |
| 6 | `<DevOfflineToggle /> <DevOutboxInspector />` | — | — | `null` in production (`DevOfflineToggle.tsx:27` — `if (IS_PROD \|\| !isNativeApp()) return null`) |
| 7 | `<DeviceSetupGate … />` | `fixed inset-0 bg-black/70 z-[60]` when needed | — | ❌ `fixed` / `null` once configured (`OperatorDeviceConfig.tsx:94-95`) |
| 8 | `<AppHeader sticky={false} … />` | **`bg-slate-900` = `#0F172A`** | `padding-top: env(safe-area-inset-top)`, inner `px-4 py-3` | ✅ yes |

### 🔴 The topmost element, and what colour it paints

**Topmost in flow is the unnamed banner-stack `<div>` at line 2897.** It paints **nothing** — it has no
`className` and therefore no background, so it is fully transparent.

**Therefore the colour actually visible in the status-bar strip is painted by the app-shell root,
`<div className="bg-slate-50 h-dvh flex flex-col overflow-hidden">` — Tailwind `slate-50`, `#F8FAFC`.**
That is the white the operator is seeing. `AppHeader`'s navy begins one full inset lower.

⚠️ **Secondary observation, recorded not recommended:** the wrapper has no `shrink-0`, unlike its sibling
header. In an `h-dvh overflow-hidden` flex column with `box-sizing: border-box`, its flex base size *is* that
padding, so under shrink pressure it could compress — which would make the symptom height-dependent rather
than constant. The hardware report describes a constant shift, so it is not shrinking in practice. Noted only
because it bears on how any future check should be read.

---

## Q4 · 🔴 Every commit today that changed what is topmost or added an inset

Commits touching the dashboard page, `AppHeader`, the KDS page, `capacitor.config.ts` or `app/layout.tsx`:

```
acb13d1 2026-08-18 15:15 offline fixes
f9c6972 2026-08-18 14:41 offline updates
dcb8862 2026-08-18 12:22 KDS and other fixes
7672bae 2026-08-17 22:36 KDS fixes
```

Three commits today. Pickaxe on the exact declaration:

```
$ git log -S"paddingTop: 'env(safe-area-inset-top)'" -- app/dashboard/[token]/page.tsx components/shared/AppHeader.tsx
f9c6972 2026-08-18 14:41 offline updates
881957a 2026-07-01 23:22 iPad app: manage Admin link + top safe-area inset fixes
```

### 🔴 `f9c6972` — 14:41, "offline updates" — **THIS IS THE ONE**

It is the only commit in the repository's history that added an `env(safe-area-inset-top)` to the *dashboard
page*. Its diff moved four banners that had been direct children of the app-shell root into a new wrapper:

```
-      <OfflineBanner conflicts={outboxConflicts} … />
-      <WebOfflineBanner />
-      <CapacityBreachBanner breaches={capacityBreaches} dismissedSig={breachDismissedSig} onDismiss={setBreachDismissedSig} />
-      <BuzzerLostBanner
+      <div style={{ paddingTop: 'env(safe-area-inset-top)' }}>
+        <OfflineBanner conflicts={outboxConflicts} … />
+        <WebOfflineBanner />
+        <CapacityBreachBanner breaches={capacityBreaches} orders={orders} dismissedSig={breachDismissedSig} onDismiss={setBreachDismissedSig} />
+        <BuzzerLostBanner
```

It also carries `docs/breach-banner-safe-area-report.md` — the write-up of this very change.

### `acb13d1` — 15:15, "offline fixes" — **NOT the source**

⚠️ The brief attributes the banner safe-area work to this commit. Its entire dashboard-page diff touching the
wrapper region is one line, *inside* the wrapper `f9c6972` had already created:

```
-        <CapacityBreachBanner breaches={capacityBreaches} orders={orders} dismissedSig={breachDismissedSig} onDismiss={setBreachDismissedSig} />
+        <CapacityBreachBanner breaches={capacityBreaches} orders={orders} dismissedSig={effectiveBreachDismissedSig} onDismiss={dismissBreaches} />
```

Dismiss-signature plumbing. It changed no inset, no wrapper, no background, and nothing about what is topmost.

### `dcb8862` — 12:22, "KDS and other fixes"

Touched neither the dashboard page's top-of-tree nor any inset (its 37 files are overwhelmingly `docs/`, plus
`lib/native/useHeartbeat.ts` and `lib/plan-features.ts`). Not implicated.

### `6d97476` — 16:01, "offline fix" (HEAD)

Two `docs/` files only. Touched none of the files in question.

**Answer: exactly one commit today changed what is topmost or added an inset — `f9c6972`.**

For completeness, the two *pre-existing* insets, neither of which changed today:

```
$ git log -S"max(0.625rem, env(safe-area-inset-top))" -- app/dashboard/[token]/kds/page.tsx
0665740 2026-08-15 23:39 ipad ongoing        ← the KDS header's inset
881957a 2026-07-01 23:22 …safe-area inset fixes  ← AppHeader's inset (7 weeks old, unchanged)
```

---

## Q5 · Capacitor `contentInset` and `viewport-fit=cover`

**`contentInset` is still `'never'`** — `capacitor.config.ts`:

```ts
  ios: {
    // 'never' = don't let the OS auto-inset the scroll view for safe areas; the WEB layer owns the inset
    // instead (viewport-fit=cover + env(safe-area-inset-top) padding on AppHeader), so the dark header
    // extends into the status-bar strip and no page content shows above it. ('always' double-insets against
    // the CSS env padding and let content bleed into the top inset once scroll was enabled.)
    contentInset: 'never',
    backgroundColor: '#1C1C1E',
```

**`viewport-fit=cover` is present** — `app/layout.tsx:65-71`:

```ts
export const viewport: Viewport = {
  …
  // viewport-fit=cover lets the page extend under the device safe areas so env(safe-area-inset-*) is
  … 
  viewportFit: 'cover',
```

And the overlay is still requested at runtime — `lib/native/statusBar.ts:69`:

```ts
    await StatusBar.setOverlaysWebView({ overlay: true })
```

🔴 **The alternative cause named in the brief is REFUTED.** The native side is unchanged and still correct:
the WebView extends under the status bar, the OS reserves nothing, and CSS owns the inset exactly as designed.
`git log` confirms `capacitor.config.ts` has not been touched today. **The double inset is entirely inside the
web layer**, which also explains why the symptom is a *doubled* band rather than a native band plus a CSS
band — the native side is contributing zero, as intended.

---

## Q6 · 🔴 Does the KDS show this too?

**The shift: NO. The KDS is unaffected, and that isolates the cause to the wrapper.**

`app/dashboard/[token]/kds/page.tsx:1706` onward:

```tsx
  return (
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden">

      {/* Offline warning + sync state (native only); also drives reachability + the outbox drain on reconnect. */}
      <OfflineBanner conflicts={outboxConflicts} … />
      {/* WEB-only counterpart (renders null on native): a clear "you're offline, orders won't send" bar. */}
      <WebOfflineBanner />

      {/* App-lock overlay (per-device biometric/passcode) — no-op on web / when off. */}
      <AppLockGate />
```

then, at `:1753-1756`:

```tsx
      <header
        className="flex flex-wrap content-start items-center gap-x-3 gap-y-2 px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0"
        style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}
      >
```

| | Dashboard | KDS |
|---|---|---|
| Root background | `bg-slate-50` `#F8FAFC` | `bg-slate-50` `#F8FAFC` |
| Unpainted inset wrapper above the header | 🔴 **YES** | ✅ **NO** — the banners are direct children, exactly as the dashboard's were before `f9c6972` |
| Number of insets in the column | 🔴 **2** | ✅ **1** |
| Element carrying the inset | `AppHeader`, `bg-slate-900` | its own `<header>`, `bg-white` |
| Who paints the strip | 🔴 **nobody** → root `#F8FAFC` shows | ✅ the header itself → `bg-white` |
| Glyph style requested | `configureStatusBar()` → `'light'` → `Style.Dark` → **white glyphs** | `configureStatusBar('dark')` (`kds/page.tsx:759`) → `Style.Light` → **dark glyphs** |
| **Page shifted down?** | 🔴 **YES, by 2 × inset** | ✅ **NO** |

⚠️ **One nuance that must not be misread on hardware.** The KDS's status-bar strip **is also white** — but for
an entirely different and intended reason: its header genuinely *is* `bg-white`, it paints the strip itself,
and it asks iOS for **dark** glyphs to suit. That is correct rendering, not the defect. **The discriminating
symptom between the two screens is the SHIFT, not the colour.** A "the KDS strip is white too" observation
would be a false negative.

**This is why the KDS is not the cheapest check** — see below.

---

## Q7 · What it looked like before today

`git show f9c6972^:app/dashboard/[token]/page.tsx`, from the same root:

```tsx
    <div className="bg-slate-50 h-dvh flex flex-col overflow-hidden">{/* App-shell (KDS flex pattern) for EVERY tab: … */}
      {/* App-lock overlay (per-device biometric/passcode) — covers the screen until unlocked. No-op on web
          / when off. Rendered first so it's on top. */}
      <AppLockGate />
      {/* Package 3: first-launch per-device setup (default screen + van). App-only overlay — renders null
          on web and once this device is configured. */}
      <OfflineBanner conflicts={outboxConflicts} resolveLabel={resolveConflictLabel} onAcknowledge={acknowledgeConflicts} onSynced={()=>{reseedRef.current();refreshPendingStatus()}} />
      {/* WEB-only counterpart: no queue on web, so just a clear "you're offline, orders won't send" bar
          (renders null on native, where OfflineBanner owns the offline state). */}
      <WebOfflineBanner />
```

**Previous topmost element in flow:** `<OfflineBanner />` — a **direct child** of the root, with **no
wrapper and no inset of its own**. On a healthy native dashboard it returns `null`.

**So the first element that actually PAINTED anything was `AppHeader` itself:** `bg-slate-900` = **`#0F172A`**,
with `paddingTop: env(safe-area-inset-top)`. Its navy padding filled the status-bar strip from the very top of
the viewport, the white glyphs sat on navy, and the total top inset was **1 ×** the safe area.

**That is the manual's intended mechanism, verbatim, and it was working until 14:41 today.**

---

# 🔴 The cause

**Named, from source: the unconditional, unpainted banner-stack wrapper added in `f9c6972`.**

One element, two symptoms, both necessarily:

1. **White strip** — the wrapper has no background, so the topmost painted surface in the status-bar region is
   the app-shell root's `bg-slate-50` (`#F8FAFC`). The dashboard still requests light glyphs (correct for the
   navy header that no longer reaches the top), so iOS draws a white clock and battery on near-white.
2. **Page shifted down** — the inset is applied twice: once by the wrapper (unpainted), once by `AppHeader`
   (navy, inside the header). Total top offset is `2 × env(safe-area-inset-top)`, which is the "noticeably
   more space above the logo".
3. **Dark header begins below the strip** — a direct consequence of (1): the wrapper's inset-height box is a
   preceding sibling, so the header cannot start until it ends.

Everything the brief hypothesised holds, including the crucial clause: because the four banners return `null`
independently and the wrapper is not gated on having rendered children, **the box and its padding exist on
every single dashboard load, banner or no banner.**

### The confidence I actually have, stated honestly

This is a determination **from source**, not an observation. Read-only, without a device, I can prove:
the wrapper is unconditional; it has no background; it carries the inset; `AppHeader` carries the same inset;
both are in flow; nothing between them renders; the root is `bg-slate-50`; the native config is unchanged and
still hands the inset to CSS; and `f9c6972` is the only commit that introduced any of it.

What I cannot do read-only is *observe the rendering*. Every step is deterministic CSS over code I have
quoted, and the predicted picture matches all three reported symptoms exactly — but the confirmation is
inferential, and I am naming it as such rather than as a device-verified fact.

### 🔴 The ONE cheapest check that would confirm it

**Open the Manage screen in the same build, on the same device, without changing anything.**

`app/manage/[token]/page.tsx:556-562` — the identical app shell, the identical header, and **no wrapper**:

```tsx
    <div className="bg-slate-50 h-dvh flex flex-col overflow-hidden">{/* App-shell (KDS flex pattern): fixed-viewport column, bars are shrink-0, only <main> scrolls … Matches the dashboard. */}
      {/* Header */}
      …
      <AppHeader
        sticky={false}
```

It controls for everything the KDS does not:

| Variable | Dashboard | **Manage** | KDS |
|---|---|---|---|
| Root | `bg-slate-50 h-dvh flex flex-col overflow-hidden` | **identical** | `w-full h-full` variant |
| Header component | `AppHeader`, `bg-slate-900`, `sticky={false}` | **identical** | hand-rolled, `bg-white` |
| Inset form | bare `env()` | **identical** | `max(0.625rem, env())` |
| Glyph style | `configureStatusBar()` → light | **identical** (`manage/page.tsx:322`) | `'dark'` |
| Banner-stack wrapper | 🔴 present | ✅ **absent** | ✅ absent |

**One variable differs: the wrapper.** So the read is unambiguous — if Manage's navy header reaches the top of
the screen with white glyphs legible on it, while the dashboard shows the white band, the wrapper is the sole
cause and nothing else needs testing. It costs one tap, no rebuild, no code change, and no deploy.

The KDS is the *worse* check for the reason in Q6: its strip is legitimately white, so it cannot discriminate
on colour, and its header, inset form and glyph style all differ — three confounds where Manage has none.

---

## Flags

1. ⚠️ **The brief's commit attribution is wrong.** The banner safe-area wrapper landed in **`f9c6972`**
   (14:41), not `acb13d1` (15:15). `acb13d1` changed only `CapacityBreachBanner`'s dismiss props inside the
   existing wrapper. Corrected rather than worked around, because "which commit" is the question Q4 asks.
2. ⚠️ **"Does the KDS show this too?" has a two-part answer** and the halves point opposite ways: the **shift**
   — no; the **white strip** — yes, but by design and with dark glyphs. Reported both ways in Q6 so a hardware
   glance at the KDS is not misread as refuting the diagnosis.
3. **No instruction in this prompt contradicted another, and no span arrived garbled.** Nothing needed asking.
4. **Nothing was recommended and nothing was changed** in the files under diagnosis. Per the instruction, this
   report is the only file this task wrote.

---

# Integrity

## Byte-level scan of this report

Byte-level Python pass (`open(path, 'rb')`, integer comparison against the flagged set) — **not** grep.
Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.

```
--- docs/status-strip-shift-report.md   (final state, this file)
    NUL(0x00)=0
    other flagged control bytes (<0x09, 0x0B, 0x0C, 0x0E-0x1F, 0x7F)=0
    TOTAL FLAGGED=0
    allowed control bytes present: TAB(0x09)=0  CR(0x0D)=0   (LF only)
```

⚠️ **Self-reference caveat, stated rather than fudged:** this report cannot print its own byte length or LF
count inside itself — writing the number changes the file, which changes the number. The figure that matters
and is stable under an ASCII-digit edit is the flagged-byte count: **zero**. Length and LF count were measured
on the final file and reported in chat.

The non-ASCII in this file is confined to em/en dashes, arrows, box-free table pipes, and the traffic-light
and warning emoji used as markers. Full class census in the chat reply.

## Carrier-aware variation-selector check

Per emoji-presentation base: occurrences **bare** versus occurrences **followed by U+FE0F**.

```
CARRIER-AWARE VARIATION-SELECTOR CHECK — docs/status-strip-shift-report.md
BASE          BARE  +FE0F  NAME
U+1F534         ..      0  LARGE RED CIRCLE
U+26A0           0     ..  WARNING SIGN
U+2705          ..      0  WHITE HEAVY CHECK MARK
U+274C          ..      0  CROSS MARK
```

Exact counts are in the chat reply (same self-reference constraint as above). The rule they satisfy: the
`Emoji_Presentation=Yes` bases (U+1F534, U+2705, U+274C) are **100% bare** — a VS-16 on them is redundant —
and the single `Emoji_Presentation=No` base, U+26A0 WARNING SIGN, is **100% paired**, without which it would
render as a monochrome text glyph. **No base appears both bare and paired.**

## `git status --porcelain`

Printed in the chat reply. Expected entries and their provenance:

| Entry | Pre-existed this task? |
|---|---|
| `M docs/reference-manual.md` | ✅ **YES — pre-existed everything.** It is the sole entry in this session's opening git snapshot and no task here has touched it. |
| `M lib/truck-logo.ts` | ❌ No — the header-logo fix from an earlier request in this session. **Not this task.** |
| `?? scripts/seed-thai-kitchen-screenshots.sql` | ❌ No — the Thai Kitchen seed from an earlier request, amended in the immediately preceding turn. **Not this task.** |
| `?? docs/screenshot-seed-report.md` | ❌ No — that task's report, likewise. **Not this task.** |
| `?? docs/status-strip-shift-report.md` | ❌ No — **this report, the only file this task wrote.** |

Nothing was committed, staged, reverted, stashed or cleaned. **No `git stash`, `git checkout` or `git restore`
was run at any point in this session.**
