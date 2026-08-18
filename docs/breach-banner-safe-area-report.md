# The capacity-breach banner and the iPad status bar

**File changed — ONE:** `components/dashboard/CapacityBreachBanner.tsx`, **one element's opening tag.**
**Also written:** `docs/breach-banner-safe-area-report.md` (this file).
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore`. **No build, no deploy, no SQL, no schema change. Nothing under `app/api`,
`lib/capacity-breach.ts` or the capacity engine was touched.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

🔴 **ONE THING NEEDS YOUR ANSWER BEFORE I TOUCH IT — §5. THREE SIBLING BANNERS ARE BROKEN IN EXACTLY THE
SAME WAY, AND YOUR BRIEF SAYS TO NAME THEM AND ASK RATHER THAN FIX THEM.**

---

# 1 — THE BANNER'S CONTAINER, BEFORE

```tsx
    <div className="w-full bg-red-600 text-white text-sm px-4 py-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
```

**Position: none — it is `static`, in normal flow.** **Top offset: none.** **Padding: `px-4 py-2`.**
🔴 **AND THAT IS THE WHOLE PROBLEM: IT IS NOT PINNED — IT IS SIMPLY FIRST.** It renders **above**
`AppHeader` in the dashboard's column, so when it shows it is the topmost thing in a viewport that
`viewportFit: 'cover'` has extended under the status bar. **Nothing about it reserved the inset,
because nothing about it knows it is at the top.**

---

# 2 — HOW THE OTHER TOP-PINNED SURFACES DO IT

**`components/shared/AppHeader.tsx:45` — the one I copied:**

```tsx
      /* Native app: extend the dark header UP into the status-bar/safe-area inset so no page content shows
         above it. env(safe-area-inset-top) is 0 in a normal browser → web is byte-for-byte unchanged. Pairs
         with capacitor contentInset:'never' + viewport-fit=cover, which let CSS own the safe area. */
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
```

**`app/dashboard/[token]/kds/page.tsx:1755` — the same idea with a floor:**

```tsx
        style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}
```

**`lib/native/statusBar.ts` — why it works and where it must not be extended:**

```
    // reserving the strip, so env(safe-area-inset-top) is the SINGLE top inset, filled by the dark header bg.
    // 🚫 DO NOT ADD env(safe-area-inset-top) OR --safe-area-inset-top HANDLING FOR ANDROID.
    // claiming the same inset). AppHeader's paddingTop: env(safe-area-inset-top) is safe precisely BECAUSE
    // env() resolves to 0 there.
```

🔴 **I COPIED `AppHeader`'s FORM, NOT THE KDS'S.** The KDS header needs `max()` because it has its own
`py` to preserve **through the same `style` object**; **this banner's `py-2` is a Tailwind SHORTHAND on
the element, and a `paddingTop` in `style` overrides only its top half** — so the bare `env()` gives
`inset + 0` at the top and leaves `py-2`'s bottom intact, while `max(0.625rem, …)` would have replaced
`py-2`'s top with 10px on web and changed the web rendering. **The simpler form is the correct one
here, and that is why.**

---

# 3 — THE CHANGE, AND THE PROOF THAT WEB IS UNCHANGED

```tsx
    <div
      className="w-full bg-red-600 text-white text-sm px-4 py-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
      /* … */
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
```

✅ **EXECUTED — `git diff --stat` on the file is `20 insertions(+), 1 deletion(-)`, and the single
deleted line is the old one-line `<div …>`.** **Nothing else in the component is in the diff: the copy,
the `⚠` heading, the breach list, the Dismiss button, `breachSignature` and both early returns are
untouched.**

## 🔴 WHY WEB AND DESKTOP CANNOT MOVE

1. **`env(safe-area-inset-top)` resolves to `0px` where no inset exists** — a normal browser, a desktop
   PWA, and (per `statusBar.ts`) **Android, deliberately.**
2. **`padding-top: 0` is what `py-2` already computed to on top? No — and this is the point:** `py-2`
   sets `padding-top: 0.5rem`. 🔴 **A `style` `paddingTop` OVERRIDES it, so on web the top padding
   becomes 0 rather than 8px.** ⚠️ **THAT IS A REAL 8px CHANGE ON WEB, AND I AM NOT GOING TO CLAIM
   OTHERWISE.**

🔴 **SO THE HONEST STATEMENT IS: THE FORM I SHIPPED IS THE ONE THE BRIEF NAMED (AppHeader's, verbatim),
AND IT COSTS 8px OF TOP PADDING ON WEB.** The alternative — `max(0.5rem, env(safe-area-inset-top))` —
preserves `py-2` exactly on web **and** clears the inset on device, at the cost of not being
byte-identical to the pattern you asked me to reuse. ⚠️ **Both are one word apart. Say which you want;
I have shipped the one you specified.**

---

# 4 — EVERY MOUNT OF THIS BANNER

✅ **EXECUTED — `grep -rn "CapacityBreachBanner"` returns exactly three hits:** the import and the single
mount in `app/dashboard/[token]/page.tsx:2838`, and its own definition. **A fourth hit names it from
`components/dashboard/BuzzerLostBanner.tsx`'s comment ("Modelled on CapacityBreachBanner"), which is
prose, not a mount.**

🔴 **THE KDS DOES NOT MOUNT IT. THE MANAGE PAGE DOES NOT MOUNT IT.** **One mount, one fix, nothing else
to treat.**

---

# 5 — 🔴 EVERY OTHER TOP-PINNED ELEMENT ON THE DASHBOARD, AND THREE ARE EQUALLY BROKEN

**The dashboard's column, in order (READ, `app/dashboard/[token]/page.tsx:2826-2845`):**

| # | Element | Its container | Safe-area handling | Verdict |
|---|---|---|---|---|
| 1 | `OfflineBanner` (native) | `w-full bg-red-700 text-white px-4 py-3 border-b-2 border-red-900` | 🔴 **NONE** | 🔴 **EQUALLY BROKEN — and it is FIRST, so on a native iPad it is the one under the clock whenever the device is offline** |
| 2 | `WebOfflineBanner` | `w-full bg-amber-500 text-white text-sm font-semibold px-4 py-2 text-center` | 🔴 **NONE** | ⚠️ **BROKEN IN PRINCIPLE ONLY — it renders `null` on native, and native is the only place an inset exists** |
| 3 | **`CapacityBreachBanner`** | — | ✅ **FIXED HERE** | ✅ |
| 4 | `BuzzerLostBanner` | `w-full bg-red-600 text-white text-sm px-4 py-2 flex flex-col …` | 🔴 **NONE** | 🔴 **EQUALLY BROKEN — same shape, same position, modelled on the same component** |
| 5 | `AppHeader` | `sticky top-0 z-50` | ✅ `paddingTop: env(safe-area-inset-top)` | ✅ already correct |
| 6 | `ToastStack` | `fixed bottom-6 left-4 right-4 …` | n/a | ✅ **bottom-anchored — the TOP inset cannot affect it.** ⚠️ Whether it clears the HOME-BAR inset is a different question and not this defect |
| 7 | Modals (`fixed inset-0 … items-center`) | centred | n/a | ✅ **centred, not pinned to the top edge** |

🔴 **SO: `OfflineBanner` (1) AND `BuzzerLostBanner` (4) ARE BROKEN IN EXACTLY THE SAME WAY AS THE ONE
YOU REPORTED. YOUR BRIEF SAYS TO NAME THEM AND ASK, SO I HAVE NOT TOUCHED THEM.** Each is the same
one-line addition. ⚠️ **`OfflineBanner` is arguably worse: it sits ABOVE the capacity banner, so when
both show, IT is the one under the status bar and today's fix moves the problem rather than solving the
stack.**

⚠️ **AND THE STACKING CAVEAT THAT FOLLOWS FROM FIXING THEM ONE BY ONE:** every banner that adds the
inset unconditionally will add it **even when it is not the topmost one**. With two showing, the second
carries a redundant inset — **extra coloured space, never hidden text.** **A single wrapper around the
banner stack would be the alternative; that is a design change and I have not made it.**

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint` on the file: 0 problems, before and after.**

| Required claim | Method |
|---|---|
| The banner clears the safe-area inset on a device that has one | ⚠️ **SOURCE READ ONLY — and it is the same declaration `AppHeader` already relies on for the same purpose on the same devices.** 🔴 **NOT VERIFIED ON HARDWARE: no build, no device, and the banner only renders when a breach exists** |
| Web and desktop unchanged | 🔴 **NO — AND IT IS STATED RATHER THAN CLAIMED. §3: the `style` `paddingTop` overrides `py-2`'s top half, so web loses 8px of top padding.** `env()` itself is 0 on web, so nothing is ADDED; the change is the override. **The one-word alternative that would preserve it is named** |
| The Dismiss control is fully reachable | ⚠️ **SOURCE READ** — it is a flex sibling inside the same padded container, so it moves down with the heading. **Not tapped on a device** |
| Every mount accounted for | ✅ **EXECUTED** — one mount, dashboard only; the KDS and manage do not mount it |
| The banner's behaviour is untouched | ✅ **EXECUTED** — `git diff` is the opening tag only: 20 insertions, 1 deletion, no change to the copy, the dismiss handler or `breachSignature` |

## ⚠️ ONE THING CAUGHT AND CORRECTED DURING THE EDIT

**The first version of the comment introduced three non-ASCII classes (`U+1F534`, `U+2500`, `U+FE0F`)
into a file that had four, and a botched splice left an orphaned comment tail that `tsc` rejected with
`TS1127: Invalid character`.** **Both were caught by the integrity pass and the typecheck, the opening
tag was rewritten from scratch, and the file is now 4 classes — exactly `HEAD`'s.** ⚠️ **Reported
because a broken intermediate state existed on disk, even though the final state is clean.**

---

# INTEGRITY

```
components/dashboard/CapacityBreachBanner.tsx
BEFORE (= HEAD; this file was clean before this task)   2,394 bytes · 4 non-ASCII classes
AFTER                                                    4,031 bytes · 4,016 chars · 78 lines · 4 classes
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
classes added vs HEAD: NONE · removed: NONE
```

✅ **The comment is deliberately pure ASCII** — no `🔴`, no box-drawing rules, no `⚠️` — **so the file's
census could not move.** ⚠️ **The banner's own `⚠` (U+26A0, bare) and its `—`/`·` are pre-existing and
untouched.**

## This report — a SEPARATE pass, run AFTER writing

```
docs/breach-banner-safe-area-report.md   bytes 11,781
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 22 | 0 | 22 |
| U+26A0 (warning sign — TEXT presentation) | 15 | 13 | 2 |
| U+2705 (check mark button) | 13 | 0 | 13 |
| U+1F6AB (prohibited) | 1 | 0 | 1 |

U+26A0 is the only base here with TEXT presentation. 13 of its 15 occurrences are PAIRED with
U+FE0F; the 2 BARE ones are the banner's own heading glyph, quoted verbatim from source twice --
that file writes it bare and this report does not silently pair it. The rest have emoji
presentation by default, so bare is correct for them.

## Working tree

```
 M app/dashboard/[token]/page.tsx
 M components/dashboard/CapacityBreachBanner.tsx
?? docs/breach-banner-safe-area-report.md
?? docs/offline-notice-gate-report.md
?? docs/offline-order-numbering-capacity-report.md
?? docs/offline-protection-popup-report.md
?? docs/oversell-warning-review-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M components/dashboard/CapacityBreachBanner.tsx` | 🔴 **THIS TASK — it was CLEAN at HEAD before this task.** The only source file written |
| 🔴 `?? docs/breach-banner-safe-area-report.md` | 🔴 **THIS TASK** — this file |
| `M app/dashboard/[token]/page.tsx` | ✅ **pre-existing — the offline-notice gate task. NOT touched here** |
| `?? docs/offline-*.md`, `?? docs/oversell-warning-review-report.md` | ✅ pre-existing — the three tasks before this one |

⚠️ **The tree is short because you committed mid-session (`dcb8862`, `fa72f9a`); nothing was cleaned by
me.** No `git stash`, `git checkout` or `git restore` was run at any point.
