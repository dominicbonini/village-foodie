# Buzzer number in the ready toast — Option A

**Date:** 3 August 2026 · Implements Option A from the preceding diagnosis. **Option B not built.**
No `next dev`, no `next build`, no migration, no SQL.

**Typecheck — exact command and result:**
```
npx tsc --noEmit -p tsconfig.json   →   TSC EXIT=0   (no output)
```

**Lint:** `lib/useToasts.ts` and `components/ToastStack.tsx` clean. Both large pages **identical to their
pre-change baselines**, measured by stashing each file individually:

```
dashboard  BASELINE: ✖ 93 problems (68 errors, 25 warnings)
dashboard  AFTER:    ✖ 93 problems (68 errors, 25 warnings)
KDS        BASELINE: ✖ 16 problems (14 errors, 2 warnings)
KDS        AFTER:    ✖ 16 problems (14 errors, 2 warnings)
```

**No mojibake or garbled spans** were found in any file read or edited.

---

## ⚠️ ONE FILE BEYOND THE TWO YOU NAMED — read this first

You specified **two edits** (`page.tsx:1620-1622`, `kds/page.tsx:561-565`). It took **three files**, and
the reason is a hard type constraint, not scope creep:

```ts
export type Toast = { id: number; msg: string; type: 'success' | 'error'; action?: ToastAction }
```
— `lib/useToasts.ts`, before this change

**`msg` was `string`. A white pill is markup, and markup cannot travel through a `string`.** There is no
way to render `bg-white text-slate-900 rounded px-1.5 font-black` around the number without widening that
type. The alternatives were both worse than telling you: put the buzzer in as plain text (fails the
17.85:1 requirement you specified) or invent a bespoke `pill?: string` field on `Toast` (same file count,
narrower but a new concept).

**The widening is additive and provably backwards-compatible.** `string` is a subtype of `ReactNode`, so
every existing `showToast` caller in the app — all of which pass a template literal — compiles and renders
exactly as before. `tsc` returning 0 across the whole project is the proof. **`components/ToastStack.tsx`
needed no change at all** and is byte-identical to `HEAD` (verified below): it already renders `{t.msg}`
inside a span, which accepts a fragment the moment the type allows one.

Flagging rather than burying it. If you would rather this were done without touching the shared type, the
only route is plain text at 3.30:1, and I would not ship that for this particular number.

---

## The change

### `lib/useToasts.ts` — the enabling widening

```ts
import type { ReactNode } from 'react'

export type Toast = { id: number; msg: ReactNode; type: 'success' | 'error'; action?: ToastAction }
export type ShowToast = (
  msg: ReactNode,
  type?: 'success' | 'error',
  opts?: { action?: ToastAction; duration?: number },
) => number
```

Parameter **order and defaults unchanged**. The comment above the type records why it is ReactNode and
that it was widened, never narrowed.

### `app/dashboard/[token]/page.tsx` — the ready toast

```tsx
showToast(
  done?.buzzer_number!=null
    ? <>Order #{num} ready · <span className="bg-white text-slate-900 rounded px-1.5 font-black">🔔 {done.buzzer_number}</span></>
    : `Order #${num} ready`,
  'success',{duration:4000,action:{label:'↩ Undo',run:()=>undoReady(orderKey,num)}})
```

`done` is the order already resolved a few lines above for `num`, so no new lookup. Matches the file's
compressed local style.

### `app/dashboard/[token]/kds/page.tsx` — the ready toast

```tsx
const readyOrder = orders.find(o => o.order_key === orderKey)
const num = readyOrder?.id ?? ''
scheduleReadyEmail(orderKey)
showToast(
  readyOrder?.buzzer_number != null
    ? <>Order #{num} ready · <span className="bg-white text-slate-900 rounded px-1.5 font-black">🔔 {readyOrder.buzzer_number}</span></>
    : `Order #${num} ready`,
  'success', { duration: 4000, action: { label: '↩ Undo', run: () => undoReady(orderKey, num) } })
```

The existing single-expression `orders.find(...)?.id ?? ''` became a named `readyOrder` so the same row
supplies both the display id and the buzzer — one lookup, not two. Matches the file's spaced local style.

---

## Confirmations you asked for — proven, not asserted

I verified these with a script against the working tree and `git show HEAD:` rather than by reading.

### ✅ The no-buzzer string is byte-identical to today's

```
dashboard HEAD occurrences: 1  |  now: 1  |  literal preserved: True
kds       HEAD occurrences: 1  |  now: 1  |  literal preserved: True
```

The literal `` `Order #${num} ready` `` is present in both files, unchanged from `HEAD`, and is what the
`else` branch passes. An order with no buzzer gets **exactly the string it gets today** — no suffix, no
separator, no `Buzzer —`, no empty pill. The `!= null` test means buzzer `0` would still render, though
the rack is 1-based so that value cannot occur.

### ✅ The pill renders the same on both surfaces

```
dashboard classes: 'bg-white text-slate-900 rounded px-1.5 font-black'
kds       classes: 'bg-white text-slate-900 rounded px-1.5 font-black'
IDENTICAL:    True
MATCHES SPEC: True
```

Extracted from both files by regex and compared — byte-identical, and equal to the classes you specified.

⚠️ **They are identical today by inspection, not by construction.** Two literals that agree now are two
literals that can drift, and this codebase has been bitten by exactly that (the `DEMO_COPY` header records
four divergences of one string). A shared constant would make it structural. I did **not** add one,
because that is a fourth file and you scoped this to the toast call sites — flagging it as the durable
option if you want it later.

### ✅ Duration, undo affordance, and the rest of the toast are untouched

```
dashboard duration:4000 present: True  |  undoReady affordance intact: True
kds       duration:4000 present: True  |  undoReady affordance intact: True
ToastStack.tsx unchanged: True
green-600 still the success ground: True  (NOT darkened, as instructed)
```

### ✅ Not done, as instructed

- **The toast was NOT darkened.** `bg-green-600` is untouched, so white body text on it remains **3.30:1** against a 4.5:1 requirement. That is a real defect on **every** success toast in the app and is left alone for its own change. The white pill is a local remedy for the buzzer number specifically — it does not fix the surrounding text.
- **The card chip is untouched** — `components/dashboard/OrderCard.tsx` not opened.
- **The header styling is untouched** — `getHeaderStyle` not opened.
- **The status badge is untouched** — `types.ts` not opened.
- **Option B not built.**

---

## Contrast

| Element | Colours | Ratio | AA at 14px bold |
|---|---|---|---|
| **The buzzer pill (new)** | `slate-900` on `white` | **17.85:1** | ✅ |
| Surrounding toast text (unchanged) | `white` on `green-600` | **3.30:1** | 🔴 **FAILS** — pre-existing, left alone deliberately |

The pill is the highest-contrast element in the toast by a wide margin, which is the intent: at the moment
the operator presses the buzzer, the number is the most legible thing on screen even though the text
around it is not.

---

## Files touched

| File | Reason |
|---|---|
| [lib/useToasts.ts](lib/useToasts.ts) | `Toast.msg` and `ShowToast`'s first param widened `string` → `ReactNode` so a pill can be rendered. Backwards-compatible; nothing else changed. |
| [app/dashboard/[token]/page.tsx](app/dashboard/[token]/page.tsx) | Ready toast gains the buzzer pill when one is set. |
| [app/dashboard/[token]/kds/page.tsx](app/dashboard/[token]/kds/page.tsx) | Same, byte-identical markup. |

**Not touched:** `components/ToastStack.tsx` (verified identical to `HEAD`), `OrderCard.tsx`,
`helpers.ts`, `types.ts`.

⚠️ `git status` also shows the signup-fix and manual-update files as modified. **Those are from earlier
tasks and are not part of this change.**

---

## Verify on screen

1. Mark a **buzzered** order ready on the dashboard → toast reads `Order #12 ready · 🔔 7` with the number in a solid-white pill.
2. Mark an order with **no buzzer** ready → toast reads `Order #12 ready`, exactly as before. No pill, no separator, no gap.
3. Same two on the **KDS** → visually identical to the dashboard.
4. **240px KDS column** — the toast is `fixed bottom-6 left-4 right-4 max-w-sm mx-auto`, viewport-anchored rather than column-scoped, so it is unaffected by column width; worth one glance to confirm the pill does not push the `↩ Undo` button out of the row on the narrowest device.
5. **Undo still works** and still cancels the deferred email within the 4s window.
6. Any **other** success toast (collected, confirmed, stock) — unchanged.
