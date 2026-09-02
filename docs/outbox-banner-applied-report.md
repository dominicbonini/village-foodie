# Outbox banner wording — applied and measured

**Applied. NOT deployed, NOT committed. No SQL, no migrations.**
**One file: `components/native/OfflineBanner.tsx` — 6 insertions, 6 deletions.**

---

## VERIFICATION

**EXECUTION.** The banner markup was **extracted programmatically from the file itself** (not retyped),
rendered in headless Chromium against the **real compiled Tailwind stylesheet** fetched from the running
dev server, and measured at six widths. **The pre-change string was rendered alongside it from the
backup, so every delta is measured, not inferred.**

**SANITY ONLY, not verification:** `npx tsc --noEmit` clean.

**No span of the prompt arrived garbled.**

---

## 1 · What was applied

**Both amendments are in: "this device" everywhere (no "tablet"), and `:131` reads "It hasn't gone
through".** `grep -ci tablet` on the file returns **0**.

### Option A — the five strings

| Line | Before | After |
|---|---|---|
| `:129` | `⚠ PAYMENT NOT RECORDED` | **unchanged, as proposed** |
| **`:131`** | `{orders} — marked as paid on this device, but the server rejected it.` | **`{orders} — marked paid on this device only. It hasn't gone through.`** |
| `:133` | `Check the order and take payment again if it is still owed.` | **unchanged, as proposed** |
| **`:168`** | `⚠ {orders} — update didn't sync, needs review` | **`⚠ {orders} — this change didn't go through. Check the order.`** |
| **`:201`** | `{N} changes saved on this device, syncing…` | **`{N} changes saved on this device. Still trying to send them.`** |

### The consistency pass — three strings

| Line | Before | After |
|---|---|---|
| **`:181`** | `📴 Offline — {N} changes saved on this device, will sync when you're back online. Settings are locked.` | **`📴 No connection — {N} changes saved on this device. They'll be sent when you're back online. Settings are locked.`** |
| **`:187`** | `Back online — syncing {N} changes…` | **`Back online — sending {N} changes…`** |
| **`:193`** | `All changes synced.` | **`All changes sent.`** |

**"sync" now survives only in internal identifiers** — the `Phase` union (`:30`) and `setPhase('syncing')`
/ `setPhase('synced')`. **No operator-facing string contains it.**

### Strings only — the whole diff

```
6 insertions(+), 6 deletions(-)
```

**Every changed line is JSX text inside an existing element.** No condition, no branch, no prop, no
state, no import. **`Option B` was NOT implemented and copy was NOT split by surface**, as instructed —
both still need a `reason` field rather than parsing `last_error`.

⚠️ `app/dashboard/[token]/page.tsx`, `lib/native/orderGate.ts` and `lib/native/menuSnapshot.ts` also
appear in `git status`. **None was touched by this task** — they are the uncommitted write-loss and
menu-snapshot work from the previous two.

---

## 2 · 🔴 THE MEASUREMENT — does `:168` wrap?

**Test string: `{orders}` = `#12, #14, #15 +2 more`**, i.e. the "+N more" case, sharing the row with the
Dismiss button, exactly as you specified.

### The widths, established from the manual rather than assumed

`docs/reference-manual.md:17389` — *"**Working profiles:** phone 1080×1920 at 420dpi · 10-inch tablet
2560×1440 at 320dpi (landscape)."*

**Converted to CSS pixels:** phone 1080 ÷ 2.625 = **411px portrait**; 10-inch tablet 2560 ÷ 2 = **1280px
landscape**, **720px portrait**.

| Width | Device | NEW | OLD | Delta | Dismiss on the row? | Overflow |
|---|---|---|---|---|---|---|
| **411px** | **phone portrait (documented)** | **2 lines**, 56px | **2 lines**, 56px | **0px, 0 lines** | ✅ **YES** | ✅ none |
| **600px** | small Android tablet portrait | 🔴 **2 lines**, 56px | 1 line, 36px | **+20px, +1 line** | ✅ **YES** | ✅ none |
| **720px** | **10-inch tablet portrait (documented)** | ✅ **1 line**, 36px | 1 line, 36px | **0px, 0 lines** | ✅ YES | ✅ none |
| **768px** | iPad mini portrait | ✅ **1 line**, 36px | 1 line | 0 | ✅ YES | ✅ none |
| **1024px** | iPad landscape | ✅ **1 line**, 36px | 1 line | 0 | ✅ YES | ✅ none |
| **1280px** | **10-inch tablet landscape (documented)** | ✅ **1 line**, 36px | 1 line | 0 | ✅ YES | ✅ none |

### The exact threshold, found by binary search

```
NEW wraps below 604px   (one line at >= 604px)
OLD wraps below 508px
```

> ## ✅ AT EVERY DOCUMENTED TABLET WIDTH — 720px PORTRAIT AND 1280px LANDSCAPE — THE NEW STRING IS ONE
> LINE, 36px, IDENTICAL TO THE OLD ONE. IT DOES NOT WRAP.

**The 96px the string gained (409px → 505px of text) is absorbed entirely by the available width.**

### Where it does wrap, and what that costs

- **600px** — a 7-8" Android tablet in portrait. 🔴 **This is the only measured width where the new
  string wraps and the old one did not.** Cost: **+20px of bar height, one extra line.**
- **411px** — the documented phone portrait profile. **Both strings already wrapped to two lines**, so
  **this change costs nothing there.** ⚠️ Worth stating plainly: **the old string was already wrapping on
  the documented phone profile.**

### 🔴 What it looks like when it wraps — rendered and inspected, not described

At 600px:

```
⚠ #12, #14, #15 +2 more — this change didn't go through. Check the
order.                                                    [Dismiss]
```

- **The order numbers stay on the first line** — the thing the operator must act on is never the part
  that wraps.
- **"Check the / order." breaks across the two lines**, leaving a short second line.
- ✅ **Dismiss stays on the row**, vertically centred against the two-line block, full 54px wide and
  reachable. It does **not** drop below.
- ⚠️ **One visible change I did not expect and am reporting:** the row is `justify-center`, so a
  **one-line** message sits **centred**; once it wraps the span fills the available width and the text
  reads **left-aligned** from the `px-4` padding. **On a wrapping width the bar changes alignment, not
  just height.** It is not broken — but it looks different from every other bar in the stack.
- ✅ **No horizontal overflow of the row or the page at any width tested.**

---

## 3 · What I could not establish

1. 🔴 **That this is what an operator sees.** **Headless Chromium against the real stylesheet is not the
   Android WebView on the physical tablet.** Font rendering and default line-height can differ, and the
   604px threshold sits close enough to 600px that a small metric difference moves it.
2. **Whether a 7-8" Android tablet is actually in use.** **The manual documents a phone and a 10-inch
   tablet.** If nothing runs at 600px, the wrap case measured above never occurs in the field.
3. **The other five strings' layout.** **Only `:168` was measured**, because it is the only one that
   shares a row with a control — the rest are `text-center` blocks that wrap harmlessly. ⚠️ **`:181` is
   now the longest string in the file and I did not measure it.**
4. **Whether `{orders}` can exceed the tested `+2 more` form.** `NAMED_LIMIT = 3` caps the named orders,
   but a longer provisional id (e.g. `#A13`) would widen it slightly.
