# Three small items — dev gating, one home for the trigger mode, an honest connection state — BUILD

**Date:** 6 August 2026. Supersedes the header-alignment report of the same name.
**Six files changed, one new.** No `next dev` / `next build`. No garbled spans in the brief.

🔴 **ONE PREMISE IN THE BRIEF IS WRONG — see item 3.** The compare table does **not** say `coming_soon`; it says `max: true`. Flagged, not built on.

---

# 1. ✅ `/dev` IS NOW UNREACHABLE IN PRODUCTION

## What I chose: **a directory layout that 404s** — `app/dev/layout.tsx` (new)

```tsx
import { notFound } from 'next/navigation'
export const dynamic = 'force-dynamic'

export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound()
  return <>{children}</>
}
```

**Why a layout and not a page-level check:** a Next.js layout wraps its **whole subtree**, so every page added under `app/dev/` later is gated **by default rather than by being remembered**. That is exactly the property the brief asked for, and it is the same idiom the codebase already uses at [app/landing/layout.tsx](app/landing/layout.tsx).

**Why `notFound()` and not a redirect:** in production these routes genuinely do not exist. A 404 says so without advertising that something is there. ⚠️ `/landing` redirects instead because it *is* a real production route that is merely admin-only — different situation, deliberately different verb.

| | |
|---|---|
| **What a production request returns** | **HTTP 404**, rendering the app's not-found page. Server-side, before any of the harness ships |
| **Local development** | ✅ **Untouched.** The condition is `NODE_ENV === 'production'` alone, so `next dev` never evaluates it. `/dev/ticket-preview` is the only way anyone can see a ticket before hardware exists — breaking it would have been worse than leaving it exposed |
| **`proxy.ts`** | Not changed. The layout is the gate; adding a second would be a second place to remember |

⚠️ **KNOWN LIMIT, recorded in the file rather than left implicit:** a layout wraps **pages, not Route Handlers**. If a `route.ts` is ever added under `app/dev/`, this will not gate it. **There are zero today** (`find app/dev -name "route.ts"` → 0), and `app/dev/` contains exactly one file.

✅ **No operator surface links to `/dev`** — the only repo reference is a comment in `mapOrderToTicket.ts`.

---

# 2. ✅ `print_trigger_mode` — THE COLUMN IS NOW THE ONLY HOME

## ⚠️ ESTABLISHED FIRST: the card could NOT reach the truck — but the route to it already existed

**The card was device-local by construction.** Its props were `{ plan, featureOverrides, trialExpiresAt }` — no truck id, no token, no save callback.

🔴 **But I did not have to invent a route, and this is the distinction the brief asked me to draw.** Every sibling truck-level setting in the same Settings tab already does exactly this — the parent holds `truck`, `token` and `pin`, and POSTs a `set_*` action:

```ts
body: JSON.stringify({ token, pin, action: 'set_auto_accept', value: val })   // the established idiom
```

So the card gained `mode` + `onChangeMode` props from the dashboard, which is **the existing pattern applied once more**, not a new mechanism.

## 🔴 The best news: the column already reaches the client, free

`/api/dashboard`'s truck payload is **spread-and-redact**, not a hand-picked include list:

```ts
truck: { ...publicTruckFields(truck), /* deliberate overrides */ }
```

That inversion was made after the same bug bit three times (`sound_config`, `keep_screen_on`, `show_paid_step` — a column the dashboard read that nobody remembered to add, arriving `undefined` and silently falling back). **Because of it, `print_trigger_mode` arrives with no API change at all.** Had the projection still been an include list, this task would have quietly shipped a setting that always read as its default.

## What changed

| Layer | Change |
|---|---|
| `components/dashboard/types.ts` | `print_trigger_mode?: 'lead_time' \| 'on_confirmed' \| null` on `TruckData`, with a note that the column is the only home |
| `app/api/dashboard/action/route.ts` | **New** `set_print_trigger_mode`, following `set_auto_accept`'s shape |
| `app/dashboard/[token]/page.tsx` | `savePrintTriggerMode()` — POST, then patch local truck state so the card updates before the next 60s poll (`saveAutoAccept`'s pattern exactly) |
| `components/printing/PrintingSettings.tsx` | 🔴 **`K.mode` deleted.** No Preferences read, no Preferences write. `mode` is a prop; `setTriggerMode` calls `onChangeMode` |

⚠️ **The value is WHITELISTED server-side, not passed through:**

```ts
const mode = body.value === 'on_confirmed' ? 'on_confirmed' : 'lead_time'
```

The column has a CHECK constraint, so an unexpected value would 400 from Postgres. Coercing to the safe default keeps the failure quiet and correct, matching `set_sound_config`'s sanitising idiom rather than trusting the client.

## Verified: there is exactly one home

```
$ grep -rn "hg_print_trigger_mode\|K.mode" app components lib
  ✅ none — the Preferences copy is gone
```

✅ **The other four stay in Preferences, correctly** — `hg_printer_name`, `hg_paper_width`, `hg_print_lead_mins`, `hg_print_enabled`. The printer is paired to one iPad, so those are device properties. The `K` constant now carries four keys and a comment saying why there is deliberately no fifth.

⚠️ **I am relying on your statement that the migration has been run and verified against the live schema.** I have no database access and did not attempt to confirm it. If it has not been applied, `set_print_trigger_mode` will 500 (the error is returned, not swallowed) and the card will read the default.

---

# 3. ✅ THE CARD NO LONGER CLAIMS A CONNECTION — but first, the premise

## 🔴 THE BRIEF'S PREMISE IS WRONG, AND I AM NOT BUILDING ON IT

> *"The compare table already says coming_soon honestly; the card should match."*

[lib/plan-features.ts:140](lib/plan-features.ts#L140):

```ts
{ name: 'Kitchen ticket printing', footnote: '5', …, starter: false, pro: false, max: true },
//                                                                              ^^^^^^^^^^ NOT 'coming_soon'
```

**The compare table asserts the feature is LIVE on Max.** Making the card "match the table" would mean the card also claims it works — the opposite of what you want. So I made the card honest against *reality*, not against the table.

⚠️ **The pricing table is therefore the other surface making a claim it cannot keep** — a Max customer is being sold kitchen ticket printing as a shipped feature. `lib/plan-features.ts` is in the do-not-touch list (pricing), so **I have changed nothing there and am raising it instead.** Footnote 5 does soften it (*"requires the HatchGrab kitchen app and a compatible thermal printer (neither supplied)"*), but that reads as a hardware caveat, not as "not built yet".

## What I chose

**Removed the thing that manufactured the false state; kept the rendering that is correct when true.**

```ts
// 🔴 NO connect(). It used to write 'Demo printer (Phase A stub)' and manufacture a connected state.
// Phase B writes a REAL paired name to K.printer and the connected rendering below lights up unchanged.
```

| Before | After |
|---|---|
| **"Connect a printer"** button writing `'Demo printer (Phase A stub)'` | 🔴 **Gone.** There is nothing behind it — no pairing, no scan, no failure path |
| Green **"● Connected"** after tapping it | Renders **only when `K.printer` holds a real name**. Nothing writes it in Phase A, so it never shows — the honest answer |
| *(nothing)* | Amber **"Coming soon"** chip in the header, and an amber panel: *"**No printer connected.** Bluetooth printer pairing isn't available yet — you can set your preferences here now and they'll apply as soon as it arrives."* |
| Settings **gated behind `printer`** | 🔴 **Reachable whether or not a printer is paired** |

🔴 **That last row is the root cause, and it is why the stub existed at all.** The real settings were behind `printer`, so the *only* way to reach them was to manufacture a connection. Removing the stub without ungating the settings would have made the card useless; ungating them removes the reason the lie was there.

✅ **The card is not hidden.** Paper width and lead minutes (device values) and the trigger mode (truck column) all remain configurable — they are real, and an operator can set them up before hardware arrives.

✅ **No second code path.** The "● Connected" branch is untouched, so Phase B lights it up by writing a real name to the same key. The `Printer: … / Disconnect` row now renders only when a pairing actually exists.

🔴 **No connection state, transport or queue was built** — all hardware-blocked.

---

# 🔴 GUSTO — EACH ITEM, VERIFIED NOT ASSUMED

| Item | What changes on their live path |
|---|---|
| **1 — `/dev` gate** | **Nothing.** A new `app/dev/layout.tsx` affects only routes under `/dev`. **Nothing links there** (grep: the sole repo reference is a code comment), and no operator flow reaches it |
| **2 — trigger mode** | **Nothing they can observe.** The card is gated on `isNativeApp()` **and** `canAccess(plan, 'ticket_printing')`, which is **`MAX_FEATURES` / `TRIAL_FEATURES` only** — verified in [lib/features.ts:54](lib/features.ts#L54). On the web the card returns `null` before any of this runs. The new `set_print_trigger_mode` action has **exactly one caller** (the card's `onChangeMode`), so it cannot fire for them. The `TruckData` field is additive and unread elsewhere |
| **3 — connection state** | 🔴 **The only one they could render, and only on a Max/trial iPad.** If they are on Max and open Settings on the iPad, they now see *"No printer connected — Bluetooth printer pairing isn't available yet"* and a **Coming soon** chip, instead of a Connect button that would have told them they were connected to a stub. **Strictly more honest; nothing they depend on is removed** |

⚠️ **What I could NOT verify:** Gusto's actual plan. I have no database access, so I cannot confirm whether they are on Max. What I *can* state is the gate: **anything below Max/trial renders `null`**, and the whole card is native-only. If they are not on a Max iPad, all three items are a complete no-op.

✅ **`/api/dashboard`'s response is unchanged** — the column already travelled via the spread. Their orders, payments, statuses and buzzers are untouched.

---

# VERIFY

## Build

```
$ npx tsc --noEmit
TSC EXIT: 0
```

| File | Baseline | Now | |
|---|---|---|---|
| `app/dev/layout.tsx` | *(new)* | **clean** | ✅ |
| `components/printing/PrintingSettings.tsx` | clean | **clean** | ✅ |
| `app/api/dashboard/action/route.ts` | 20 err, 1 warn *(taken from `HEAD` — no prior uncommitted edits)* | **20, 1** | ✅ same rules (`no-explicit-any` ×20, `no-unused-vars` ×1) |
| `app/dashboard/[token]/page.tsx` | 68 err, 25 warn | **68, 25** | ✅ every rule identical |
| `components/dashboard/types.ts` | 1 err, 0 warn | **1, 0** | ✅ |
| `app/dev/ticket-preview/page.tsx` | 0 err, 1 warn | **0, 1** | ✅ not touched |

⚠️ **I rewrote much of `PrintingSettings.tsx`, so I compared rules rather than counts** — clean before, clean after, so there is no rule that could have drifted. For `action/route.ts` I took the baseline from `HEAD` rather than trusting recollection, since that file had no prior uncommitted edits.

### Files changed

`app/dev/layout.tsx` **(new)** · `components/printing/PrintingSettings.tsx` · `app/api/dashboard/action/route.ts` · `app/dashboard/[token]/page.tsx` · `components/dashboard/types.ts`

### Out of scope — confirmed untouched

`lib/printing/ticket.ts` (renderer) · `lib/printing/mapOrderToTicket.ts` · `lib/printing/printWatcher.ts` logic · `lib/printing/transport.ts` · `components/printing/TicketPreview.tsx` · `lib/plan-features.ts` (pricing — see item 3) · the offline overlays and the conflict signal · commerce-policy, keep-awake, the native shell, the legal pages.

### ⚠️ Still true

- 🔴 **`lib/plan-features.ts` still advertises kitchen ticket printing as LIVE on Max** (`max: true`). Out of scope, raised in item 3, unchanged.
- **Nothing calls the print pipeline** — `usePrintWatcher` and `createStubTransport` still have zero call sites. **The trigger mode a truck now saves is still read by nothing.**
- 🔴 **PRIMING vs FLUSH-ON-CONNECT remains unresolved**, blocked on a real connection state.
- **`transport.ts` still cannot fail**, so the `failed` / `unknown` print paths remain unexercised.
- **No retry, backoff, pacing or give-up.**
- **Ordering is still acceptance order, not collection-time order.**
- **Nothing has been seen on paper.**
