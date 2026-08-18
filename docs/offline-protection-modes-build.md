# Offline protection — one switch, two modes. Stage 1's answer, and the build.

**Files written — TEN:**

| File | What |
|---|---|
| 🔴 `supabase/migrations/20260818_offline_protection_mode.sql` | **NEW — WRITTEN, NOT RUN** |
| `lib/copy/offlineProtection.ts` | the switch + both modes, and four constants rewritten |
| `supabase/functions/heartbeat-monitor/index.ts` | resolves the mode; branches the write |
| 🔴 `app/api/heartbeat/route.ts` | the returning ping clears the new marker too |
| 🔴 `app/api/orders/submit/route.ts` | reads the marker; forces `pending` |
| `app/api/manage/route.ts` · `app/api/dashboard/route.ts` · `app/api/dashboard/action/route.ts` | plumbing for the mode |
| 🔴 `app/dashboard/[token]/page.tsx` **(GUSTO'S LIVE PATH)** · `app/manage/[token]/page.tsx` | the switch, then the mode choice |

🔴 **NO SQL WAS EXECUTED.** **Nothing was committed, staged, reverted, stashed or cleaned.** No
`git stash`, `checkout` or `restore`. No build, no deploy, no schema change applied.

**No span of the prompt arrived garbled this time** — ⚠️ **the previous send was truncated at
`🔴 "AUTO-ACCEPT" IS` and I stopped rather than guess; this one is complete and is what I built from.**

---

# STAGE 1

## Q1 — THE AUTO-ACCEPT DECISION, IN FULL

```ts
          if (
            truck.auto_accept && allItemsAutoAccept && !anyForcesPending
            && !((truck as any).notes_require_review !== false && orderHasNotes)
          ) {
            autoAccepted = true
          }
```
```ts
      const status = autoAccepted ? 'confirmed' : 'pending'
```

| Input | Where it comes from |
|---|---|
| `truck.auto_accept` | the `trucks` row already loaded by this route |
| `allItemsAutoAccept` | `.select('name, price, auto_accept, preorder_enabled')` on `menu_items` → `autoAcceptByName` |
| `anyForcesPending` | per-item pre-order deadlines, event-tz now, plan-gated |
| `notes_require_review` + `orderHasNotes` | the truck row + the order's own notes / `specialInstructions` / deal `slotNotes` |

🔴 **NOT ONE OF THE FOUR IS VAN-SCOPED OR TIME-SENSITIVE. Nothing on this path could know the van is
offline — which is exactly why "the monitor does nothing" would have shipped a mode that does nothing.**

## Q2 — 🔴 (a), THE MARKER. AND THE REASON IS A CONSTANT THAT CANNOT BE SHARED.

**(b) would need this, computed on Vercel:**
```ts
  const STALE_THRESHOLD_SECONDS = 30
  const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_SECONDS * 1000).toISOString()
```
🔴 **THAT CONSTANT IS A LOCAL INSIDE A DENO EDGE FUNCTION. It cannot be imported by `app/` or `lib/` —
different runtime, different deploy, no shared module — so (b) means the number 30 existing in two
places that ship independently.** ⚠️ **They would drift in the worst way: submit reading "not stale"
while the monitor has already acted, or the reverse. There is no way to keep one copy.**

**(a) as built:** the monitor writes an expiry, submit reads it.
```ts
      const patch = mode === 'no_auto_accept'
        ? { offline_no_autoaccept_until: autoPauseUntil }
        : { online_paused_until: autoPauseUntil, last_offline_pause_at: now.toISOString() }
```
```ts
          const noAutoAcceptUntil = eventRow?.offline_no_autoaccept_until ?? null
          const vanOfflineNoAutoAccept = !!noAutoAcceptUntil && new Date(noAutoAcceptUntil).getTime() > Date.now()
```

✅ **One owner of the staleness rule; every reader consumes a decision. The same shape
`online_paused_until` has had all along.** ⚠️ **The cost, stated: one more column and one more clear.**

## Q3 — THE VAN ROW, AND WHY (b) IS NOT FREE EITHER

**The submit path does NOT load the van row itself.** It loads the EVENT row twice (`eventCols`), and
the van is read only inside `eventKitchenCapacity` (`lib/orders/place-in-slot.ts`):

```ts
      .from('truck_vans')
      .select('kitchen_capacity, capacity_window_mins')
```

⚠️ **So (b) would mean either widening a CAPACITY helper's contract to carry staleness, or a second van
read on the hottest endpoint in the product.** ✅ **(a) costs neither: the marker lives on the EVENT
row, which this route already selects — one more column on an existing select, no round trip.**

## Q4 — THE MONITOR'S WRITE, AND THE MINIMAL CHANGE

**Before:**
```ts
        .update({ online_paused_until: autoPauseUntil, last_offline_pause_at: now.toISOString() })
```
**After — the mode resolved with the SAME chain the switch uses, then one branch:**
```ts
      const modeRaw = ev.offline_protection_mode_override ?? van.offline_protection_mode ?? 'pause'
      const mode = modeRaw === 'no_auto_accept' ? 'no_auto_accept' : 'pause'
```
🔴 **PAUSE is byte-identical to today. NO-AUTO-ACCEPT writes `offline_no_autoaccept_until` and NOTHING
ELSE** — not `online_paused_until` (that column IS the pause and the customer gate reads it), and not
`last_offline_pause_at` (that drives the "Orders were paused while your device was offline" notice,
which would be a false statement in this mode).

## Q5 — AN ORDER MID-FLIGHT WHEN THE VAN RETURNS

✅ **NOTHING RE-EVALUATES IT, CONFIRMED BY SEARCH.** The reconnect path only nulls markers on
`truck_events`; no code re-runs the auto-accept decision, and no path rewrites an order's status on
reconnect. **It stays `pending` with its slot held until an operator confirms it — a normal
non-auto-accepted order, which is the whole design.**

---

# STAGE 2 — THE BUILD

## The migration — 🔴 WRITTEN, NOT RUN

`supabase/migrations/20260818_offline_protection_mode.sql` adds three things and changes nothing:

```sql
alter table truck_vans   add column if not exists offline_protection_mode text not null default 'pause';
alter table truck_events add column if not exists offline_protection_mode_override text default null;
alter table truck_events add column if not exists offline_no_autoaccept_until timestamptz default null;
```
plus two CHECKs and a partial index.

🔴 **ADDITIVE, NOT DEPLOY-COUPLED — but the honest instruction is still MIGRATION FIRST.** No existing
column changes type, name, nullability or value, so **apply-then-deploy is a no-op** and
**deploy-then-apply degrades LOUDLY, not silently**: three named selects list the new columns
(`get_vans`, the monitor's two queries, and `eventCols` on submit), and PostgREST answers **42703** for
a column it cannot see, failing the whole statement. **Settings would render no vans, the monitor would
log a stale-van query failure, and submit would fall to its date fallback.** ⚠️ **Nothing would be
silently wrong; everything would be visibly broken. Apply first.**

✅ **`'pause'` IS THE DEFAULT AND THE FALLBACK EVERYWHERE** — column default, `?? 'pause'` in the
monitor, `?? 'pause'` on both surfaces — so **every existing row keeps today's behaviour with no
backfill and no conversion.**

## The copy — before and after

| Constant | Before | After |
|---|---|---|
| `OFFLINE_PROTECTION_CARD_DESCRIPTION` | *"Pauses online orders if this device goes offline"* | *"What happens when this van loses its connection."* |
| `OFFLINE_PROTECTION_EXPLAINER_BODY` | *"…customer ordering may be paused."* | *"…offline protection takes over — either pausing ordering or turning auto-accept off, whichever you chose."* |
| `OFFLINE_PROTECTION_REMINDER` | *"…or customer ordering may be paused."* | *"…or offline protection may take over."* |
| `OFFLINE_PROTECTION_ENABLE_CONFIRM` | *"…online orders may pause automatically."* | *"…offline protection takes over in the mode you chose."* |
| `OFFLINE_PROTECTION_DISABLE_CONFIRM` | *"…online orders will continue — customers may place orders you cannot see."* | ✅ **UNCHANGED — REUSED, NOT REWRITTEN.** It is about the switch being OFF and is already accurate |
| `OFFLINE_PROTECTION_EXPLAINER_LEAD` | *"You must keep your dashboard or kitchen screen on…"* | ✅ **UNCHANGED — it survives untouched, as you said** |

**And the new copy, verbatim as specified:**
```ts
export const OFFLINE_PROTECTION_SWITCH_LABEL = 'Offline protection'
export const OFFLINE_PROTECTION_SWITCH_HELP = 'What happens when this van loses its connection.'
export const OFFLINE_MODE_PAUSE_LABEL = 'Stop taking orders'
export const OFFLINE_MODE_PAUSE_HELP = "Customers can't order until you're back online."
export const OFFLINE_MODE_NO_AUTO_ACCEPT_LABEL = 'Keep taking orders, confirm them yourself'
export const OFFLINE_MODE_NO_AUTO_ACCEPT_HELP =
  "Auto-accept is turned off, so customers can still order but nothing is confirmed automatically. You'll confirm each one when you're back."
```
✅ **"Auto-accept" is left exactly as you wrote it, with a comment in the file saying not to reword it.**
✅ **One `OFFLINE_PROTECTION_MODES` array feeds both surfaces, so they cannot drift.**

## The UI — the same shape in both places

**Dashboard (Settings → the event card) and manage (Settings → the Van card):** the switch row exactly
as before, then — **only when the switch is ON** — a `role="radiogroup"` with one row per mode: a radio
dot, the label, the help line beneath.

🔴 **WITH THE SWITCH OFF, NEITHER SURFACE RENDERS THE MODE BLOCK AT ALL** — the card is what it was
before this change, because a visible mode picker under an off switch reads as a setting that is doing
something. **Manage's off-state line now reads *"Off — online orders continue even if this device goes
offline"*; its on-state line is the switch's own help rather than a description of one mode.**

## ✅ THE CUSTOMER MESSAGE IS UNTOUCHED

`grep` confirms `"will confirm your order shortly"` and the `autoAccepted ? 'Order confirmed!' : 'Order received!'` split are **not in this task's diff**, on the page or in the email.

---

# ⚠️ PIZZERIA GUSTO — `auto_pause_on_offline = true` ON A LIVE VAN

| | Before | After | Method |
|---|---|---|---|
| Their switch | ON | ✅ **ON — the boolean is untouched and no data was converted** | ✅ **source-read + the migration is additive** |
| Their mode | n/a | 🔴 **`'pause'` — the column default. Their behaviour is IDENTICAL to today** | ✅ source-read |
| Van offline | ordering pauses | ✅ **ordering pauses, same write, same 2h expiry** | ✅ source-read |
| Their Settings card | switch only | **switch + two modes, `Stop taking orders` pre-selected** | ✅ source-read |
| If they pick mode B | — | customers keep ordering; each order arrives `pending` with its slot held | 🔴 **SOURCE-READ ONLY — not exercised** |
| If the code ships before the migration | — | 🔴 **Settings shows no vans and the monitor pauses nothing — loud, not silent. APPLY FIRST** | ✅ source-read |

🔴 **NOT ONE CLAIM IN THIS TABLE IS EXECUTION-VERIFIED AGAINST THEIR DATA. No SQL was run, no order was
placed, no van was taken offline.**

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint` per file: copy 0/0 · monitor 0/0 · heartbeat 0/0 · submit
23/5 · manage API 21/2 · dashboard API 17/0 · action 19/1 · dashboard page 82/26 (108 — this session's
baseline) · manage page 285/77.** ⚠️ **Three `no-explicit-any` errors were introduced on the dashboard
by a cast, spotted against the baseline and removed; the file is back to 108.** ⚠️ **I have no
pre-existing baseline for the manage page or the API routes, so those counts are reported, not
compared.**

| Required claim | Method |
|---|---|
| The switch and both modes render on manage and on dashboard | ✅ **SOURCE READ** — both blocks quoted above, both mapping the same array. 🔴 **NOT RENDERED** |
| Every existing row defaults to today's behaviour | ✅ **SOURCE READ** — `not null default 'pause'`, `?? 'pause'` in the monitor and on both surfaces. **The migration has not run, so this is unexercised** |
| Mode B: an order placed while offline arrives `pending` with its slot held | ✅ **SOURCE READ** — `&& !vanOfflineNoAutoAccept` is the ONLY change to the decision, and `placeOrderInSlotLocked` runs above it and is untouched. 🔴 **NOT EXERCISED — no van was taken offline** |
| Mode B: nothing auto-confirms during an outage | ✅ **SOURCE READ** — same line. **This is the whole point and it is one boolean** |
| Mode A: identical to today | ✅ **EXECUTED (source)** — the monitor's pause branch is the original object, unchanged; `git diff` on that function is the mode resolution, the branch and one log string |
| The customer message is unchanged | ✅ **EXECUTED** — neither string is in the diff |
| The migration is written and not run | ✅ **EXECUTED** — the file exists as `?? supabase/migrations/20260818_offline_protection_mode.sql`; **no SQL was executed at any point** |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RUN, RENDERED, DEPLOYED OR MIGRATED.** No browser, no device, no database.
- 🔴 **THE EDGE FUNCTION IS NOT DEPLOYED BY THIS REPO'S DEPLOY.** `heartbeat-monitor` ships separately —
  **the mode does nothing until that function is redeployed**, and until then a van in mode B still
  pauses, because the deployed body only knows how to write `online_paused_until`.
- ⚠️ **The 2-hour expiry is inherited from the pause path.** In mode B it means auto-accept resumes on
  its own if the monitor stops running — the fail-safe direction, but not one I measured.

---

# INTEGRITY

```
lib/copy/offlineProtection.ts                    3,095 →  4,975 bytes · classes 5 → 5
supabase/functions/heartbeat-monitor/index.ts    6,248 →  8,367 bytes · classes 3 → 3
app/api/heartbeat/route.ts                       4,079 →  5,022 bytes · classes 1 → 1
app/api/orders/submit/route.ts                  83,547 → 85,660 bytes · classes 19 → 19
app/api/manage/route.ts                         78,884 → 79,285 bytes · classes 10 → 10
app/api/dashboard/route.ts                      52,065 → 52,601 bytes · classes 9 → 9
app/api/dashboard/action/route.ts              175,225 → 175,972 bytes · classes 14 → 14
app/dashboard/[token]/page.tsx                 393,662 → 402,912 bytes · classes 53 → 53
app/manage/[token]/page.tsx                    785,187 → 787,683 bytes · classes 176 → 176
supabase/migrations/20260818_…sql                    0 →  5,801 bytes · NEW FILE, 8 classes
ALL TEN: NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

✅ **NO EDITED FILE GAINED OR LOST A NON-ASCII CLASS.** 🔴 **NINE CHARACTERS WERE INTRODUCED AND
REMOVED BEFORE THIS REPORT WAS WRITTEN** — `U+2500 ─`, `U+1F534 🔴`, `U+26A0`+`U+FE0F` in the copy
file, the monitor and the heartbeat route, and `U+21D2 ⇒` in the submit route. **The integrity pass
caught all four files; the comments were rewritten in ASCII.** ⚠️ **The migration is a NEW file, so its
8 classes are a baseline, not a gain.**

## This report — a SEPARATE pass, run AFTER writing

```
docs/offline-protection-modes-build.md   bytes 17,222
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 30 | 0 | 30 |
| U+26A0 (warning sign — TEXT presentation) | 12 | 12 | 0 |
| U+2705 (check mark button) | 25 | 0 | 25 |

U+26A0 is the only TEXT-presentation base here and every occurrence is PAIRED with U+FE0F.
The rest have emoji presentation by default, so bare is correct for them.

## Working tree

```
 M app/api/dashboard/action/route.ts
 M app/api/dashboard/route.ts
 M app/api/heartbeat/route.ts
 M app/api/manage/route.ts
 M app/api/orders/submit/route.ts
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/dashboard/CapacityBreachBanner.tsx
 M lib/copy/offlineProtection.ts
 M supabase/functions/heartbeat-monitor/index.ts
?? docs/breach-banner-copy-report.md
?? docs/breach-banner-safe-area-report.md
?? docs/offline-notice-gate-report.md
?? docs/offline-order-numbering-capacity-report.md
?? docs/offline-protection-modes-build.md
?? docs/offline-protection-modes-review.md
?? docs/offline-protection-popup-report.md
?? docs/oversell-warning-review-report.md
?? supabase/migrations/20260818_offline_protection_mode.sql
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M` on the seven source files above + `M lib/copy/offlineProtection.ts`, `M supabase/functions/heartbeat-monitor/index.ts` | 🔴 **THIS TASK.** ⚠️ `app/dashboard/[token]/page.tsx` was already `M` from the offline-notice and breach-banner tasks |
| 🔴 `?? supabase/migrations/20260818_offline_protection_mode.sql` | 🔴 **THIS TASK — written, NOT run** |
| 🔴 `?? docs/offline-protection-modes-build.md` | 🔴 **THIS TASK** — this file |
| `M components/dashboard/CapacityBreachBanner.tsx` and the other `?? docs/*.md` | ✅ pre-existing — earlier tasks this session |

⚠️ **The tree was short at the start because you committed mid-session (`dcb8862`, `fa72f9a`); nothing
was cleaned by me.** No `git stash`, `git checkout` or `git restore` was run at any point.
