# KDS header — `Pause orders` off, `Screen on` into its slot, demo gap closed

**One file changed: `app/dashboard/[token]/kds/page.tsx`.** `EventActionsModal` is untouched, so the
dashboard is untouched. No API, no SQL, no migration.

⚠️ **This needs a DEPLOY, not a rebuild** — the iPad loads the remote URL. See §6.

---

# Stage 1 — read only

## Q1 · The two gates, and what a demo gets instead of the modal

**Header button gate** (`kds/page.tsx`, before this edit):

```tsx
        {activeEvent?.status === 'open' && (!isDemo || isPaused) && (
          <button onClick={togglePause} …>
            {isPaused ? 'Paused — tap to resume' : 'Pause orders'}
          </button>
        )}
```

**The modal's mount, and both its openers** — all three `!isDemo`:

```tsx
      {showEventMenu && activeEvent && !isDemo && (
        <EventActionsModal
```
```tsx
        {activeEvent && !isDemo && (            // phone opener, sm:hidden
```
```tsx
          {!isDemo && (                          // event-bar opener, hidden sm:block
```

### 🔴 `setShowDemoEventLock` does not exist on the KDS at all

It is **dashboard-only** (`app/dashboard/[token]/page.tsx:310, 3103, 3765, 5139`). The KDS has no demo
lock surface, no `DemoLockChip`, and no substitute for the modal — **on a demo the KDS simply renders no
Manage-event opener.**

What the dashboard's lock surface *is*, for completeness — it is **purely informational and cannot pause
or resume anything**:

```tsx
              <h3 …><span aria-hidden>🔒</span> Manage event</h3>
              …
              This is where you start and close a service, pause orders when the queue gets long, or switch to a different event.
              …
              We keep one event running in the demo so there's always something to play with. You get full control when you sign up.
            <button onClick={()=>setShowDemoEventLock(false)} …>Got it</button>
```

**One heading, two paragraphs and a dismiss button. No pause control, no resume control, no write of any
kind.** So even on the dashboard it is not a fallback — it is an explanation of why there isn't one.

## Q2 · Every state the header button rendered in, and where the action lives now

| # | State | Button showed | Where the action lives after removal |
|---|---|---|---|
| 1 | Real truck · event `open` · not paused | `Pause orders` | ✅ **Manage event → `⏸ Pause orders`.** Modal gated `event.status === 'open'`; both openers `!isDemo`, both reachable. |
| 2 | Real truck · event `open` · paused | `Paused — tap to resume` | ✅ **Manage event → `▶ Resume orders`**, plus the red pause banner's `Resume` link (unchanged). |
| 3 | 🔴 **Demo · event `open` · paused** | `Paused — tap to resume` | 🔴 **Nothing — the mount and both openers were `!isDemo`.** This is the gap, and it is closed in Stage 2. |
| 4 | Demo · event `open` · not paused | *(gate false — nothing rendered)* | Nothing to replace. Pause stays unavailable in demo, deliberately. |
| 5 | Any truck · event not `open` | *(gate false)* | Nothing to replace — the modal's own row is gated identically. |

**Only state 3 lacked a replacement, so the button was not removed until it had one.**

⚠️ **AND ONE PREMISE IN THE BRIEF IS WRONG, WITH EVIDENCE.** The brief says that on a paused demo *"the
header button is currently the ONLY resume control"*, repeating the claim in the code's own comment. **It
was not.** The red pause banner further down the same file carries a Resume link and is gated on
`anyPaused` alone — **no `isDemo` term**:

```tsx
        {anyPaused && (
          <div className="bg-red-500 text-white …">
            <span>⏸ Orders paused{pauseReason === 'offline' ? ' (device offline)' : ''} — customers cannot order</span>
            {pauseReason === 'manual' && <button onClick={togglePause} className="underline text-white text-xs">Resume</button>}
          </div>
        )}
```

Since a demo pause would be a *manual* pause (`paused_until`), `pauseReason === 'manual'` holds and the
link renders. **A paused demo could always resume from the banner.** This does not change the work — the
brief asks for the action to live in Manage event, and the banner only appears while paused and offers no
pause direction — but the false premise is corrected rather than inherited, and the stale comment that
generated it has been rewritten in place.

---

# Stage 2 — the change

## The header

`Pause orders` is **removed at every width**. The `hidden sm:block` `Screen on` mount moves into the slot
it vacated. The `⏸ Pause orders` row inside `EventActionsModal` is unchanged and keeps its
`event.status === 'open'` gate.

🔴 **`Screen on` IS STILL THE ACQUISITION MECHANISM, CONFIRMED.** `screenOnBtn` and `toggleKeepScreenOn`
are **byte-identical** before and after (verified by execution, §5): a real `<button type="button">` whose
`onClick` runs `toggleKeepScreenOn` → `applyKeepScreenOn(true)`, with `aria-pressed={screenHeld}`. Safari
grants `wakeLock` only on a completed gesture and drops it on visibility loss, so the element and its
handler had to survive the move intact — **only its position in the row changed.**

⚠️ **It keeps `hidden sm:block`**, so the phone row is untouched, and the phone's own `sm:hidden` call to
the same helper on the expanded line is not touched either. **Two mounts before, two after.**

⚠️ **The sound chip and the screen control are still adjacent** — nothing renders between the vacated slot
and `soundBtn`, so the pair simply swapped order (screen, then sound). Its comment was updated to say so
rather than left claiming an adjacency that had moved.

## 🔴 The paused demo: option (a), and why not (c)

**Chosen: (a) — widen the modal opener so a demo whose event is PAUSED reaches the real modal.**

Four gates now carry `(!isDemo || isPaused)` — the exact condition the removed button carried, moved onto
the surface that replaces it:

```tsx
      {showEventMenu && activeEvent && (!isDemo || isPaused) && (      // mount
        {activeEvent && (!isDemo || isPaused) && (                     // phone opener
          {(!isDemo || isPaused) && (                                  // event-bar opener
```

and the pause direction stays unavailable in demo, because `EventActionsModal` renders its pause row only
when `onPause` is passed:

```tsx
          onPause={isDemo ? undefined : () => { setShowEventMenu(false); togglePause() }}
          onResume={() => { setShowEventMenu(false); togglePause() }}
```

**That reproduces the removed button's asymmetry exactly: a demo can RESUME and still cannot PAUSE.**

### Why not (c)

(c) would need proof that a demo event cannot be paused at all. **It is close to true but not provable, and
asserting it is what the earlier refusal was protecting against:**

- ✅ `heartbeat-monitor` never writes the manual column — it writes `online_paused_until` /
  `offline_no_autoaccept_until` / `last_offline_pause_at` only.
- ✅ The KDS reads `data.vanPausedUntil` (manual), with `vanOnlinePausedUntil` deliberately excluded, so an
  offline auto-pause cannot turn `isPaused` true.
- ✅ The dashboard passes `onPause={isDemo?undefined:…}`, so its modal offers no pause in demo.
- 🔴 **But `set_paused` carries NO server-side demo guard:**

```ts
    if (action === 'set_paused') {
      const { paused_until, eventId } = body
      if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
      …
      await supabase.from('truck_events').update(patch).eq('id', eventId).eq('truck_id', truck.id)
```

**So `truck_events.paused_until` can hold a value on a demo row whatever today's UI offers** — a legacy
row, a direct write, or a truck that stops being treated as demo. **(c) would be a bet on unreachability;
(a) costs one condition on three gates and removes the need to bet.** The cost of being wrong is a demo
stuck paused with no way back, which is precisely the failure the original gate was written for.

⚠️ **`EventActionsModal` IS NOT TOUCHED**, so Gusto's live path is untouched: the change is entirely in the
KDS's mount and openers. Verified by `git status` (§7) — the shared component is not in the diff.

## One thing found while editing, and fixed

🔴 **A TDZ bug I introduced and caught before it shipped.** The Android back-handler array at `:929` is
evaluated *during render*, and `isPaused` is declared at `:~1534` — referencing it there would have been a
`ReferenceError` on every render. The identical expression is inlined from `pausedUntil` (declared `:165`)
instead, so back/escape dismisses exactly what can be opened:

```tsx
    [showEventMenu && !!activeEvent && (!isDemo || (pausedUntil ? new Date(pausedUntil) > new Date() : false)), () => setShowEventMenu(false)],
```

⚠️ **`tsc` did not flag it.** It surfaced only because the first compile failed on a *different* error (a
JSX comment in an attribute position) and the file was re-read. **Another reason tsc-clean is not
verification.**

## Comments corrected rather than left to rot

The removed button carried two comment blocks, one headed **"THIS BUTTON IS NOT A DUPLICATE OF THE
EVENT-ACTIONS ITEM. DO NOT DELETE IT."** Leaving them above a deleted button would be exactly the drift
this codebase warns about. They are replaced with a block that (i) records that the argument was
*discharged* by moving its recovery arm rather than ignored, and (ii) corrects the "only resume control"
claim by naming the pause banner.

---

# Stage 3 — the row count

**Header contents after the change, at `sm:` and above** (the iPad case), in DOM order:

`← Dashboard` · event/venue text · the two step switches (`hidden sm:contents`) · **`Screen on` / `Screen off`** · sound chip · `This device` · `Manage event ▾`(event bar) · the view/settings expander trigger

**Removed from that row: `Pause orders`.** Added: nothing — `Screen on` was already on the row, on its own
second line.

| Layout | Before | After | Basis |
|---|---|---|---|
| iPad **landscape** (1024–1194px) | **2 rows** — `Screen on` alone on row 2 | **1 row** | 🔴 **ESTIMATE.** One item removed from a `flex-wrap` row that overflowed by exactly one item. Not measured. |
| iPad **portrait** (768–834px) | 2 rows | **1 row, tight** | 🔴 **ESTIMATE**, and the weaker of the two — 768px is the narrowest `sm:`+ case and the one most likely to still wrap. |
| Phone (`< sm:`) | unchanged | unchanged | The button was `hidden sm:block`; its only sub-`sm:` arm was `isDemo && isPaused`, now served by the widened openers. |

⚠️ **BOTH ROW COUNTS ARE ESTIMATES, NOT MEASUREMENTS.** No browser was opened and no layout was computed;
the brief forbids `next dev`. The claim rests on removing one flex child from a row that wrapped by one
child. **If portrait still wraps, the next candidate is the sound chip, not `Screen on`.**

⚠️ The phone layout, the `Screen settings` expander, the banner stack and the event bar are untouched.

---

# Verification

## Verified by EXECUTION

Both file versions were read, JSX and line comments stripped, and compared:

```
1. 'Pause orders' in executable JSX      : before=2  after=1
   'Paused - tap to resume'              : before=1  after=0
   onClick={togglePause} (header button)  : before=2  after=1
2. togglePause() calls (modal handlers)  : before=2  after=2
3. screenOnBtn mounts                    : before=2  after=2
   screenOnBtn helper body unchanged     : True
   toggleKeepScreenOn body unchanged     : True
4. Manage-event openers                  : before=2  after=2
   '(!isDemo || isPaused)' occurrences   : before=1  after=3
5. modal mount gate now                  : showEventMenu && activeEvent && (!isDemo || isPaused) && (
6. onPause demo-aware                    : True
   onResume unconditional                : True
7. back-handler avoids the TDZ ref       : True
8. header order: Screen on before sound  : True
```

**The two surviving matches on line 1 are accounted for and are not header buttons:**
`'Pause orders'` ×1 is the `window.confirm` string **inside `togglePause`** (`:1300`), which the brief
forbids changing; `onClick={togglePause}` ×1 is the **pause banner's Resume link** (`:2455`), explicitly
out of scope.

| Claim | Verdict |
|---|---|
| ✅ **`Pause orders` is absent from the KDS header at every width** | The button's JSX is gone; both its labels drop to 0 in executable code, and the one remaining literal is the confirm string inside the handler. |
| ✅ **`Screen on` is on row one and still acquires from a click** | `screenOnBtn` and `toggleKeepScreenOn` are **byte-identical**; two mounts before and after; it now precedes the sound chip in DOM order. |
| ✅ **Pause/resume reachable from Manage event in every state the button covered** | Both openers and the mount now carry `(!isDemo || isPaused)`; the modal's own row keeps `status === 'open'`, matching the button's gate. |
| ✅ **A paused demo can resume — the route** | **Manage event → `▶ Resume orders`** (mount + both openers widened, `onResume` passed unconditionally). **Second, pre-existing route:** the red pause banner's `Resume` link. |
| ✅ **The dashboard is unchanged** | `EventActionsModal` is not in the diff; `git status` lists one code file. |

## Verified by SOURCE ONLY

| Claim | Basis, and its limit |
|---|---|
| ⚠️ **The header is one row on iPad** | **ESTIMATE.** One item removed from a row that overflowed by one. Not measured, no browser opened. |
| ⚠️ **`EventActionsModal` renders the pause row only when `onPause` is passed** | Read at `:145-152` — `event.status === 'open' && (paused ? … : (onPause && (…)))`. Not rendered. |
| ⚠️ **`set_paused` has no demo guard** | Read at `action/route.ts:2459-2472`; the `isDemoIdentifier` uses in that file are all email suppression. Not executed. |
| ⚠️ **`heartbeat-monitor` never writes `paused_until`** | Read — it selects and writes only `online_paused_until`, `offline_no_autoaccept_until`, `last_offline_pause_at`. |

## 🔴 Not offered as verification

`npx tsc --noEmit` is clean. **It is not verification** — and this task proves the point twice: it caught a
JSX syntax error but did **not** catch the TDZ reference to `isPaused`, which would have thrown on every
render.

**Not run:** `next dev`, `next build`, any deploy, any commit, any SQL.

---

# 6 · ⚠️ Deploy, not rebuild

Both the KDS and the dashboard are **web pages served from `server.url`**, so the iPad picks this up on the
next load of the route **once the web app is deployed**. An Xcode rebuild reinstalls the shell and changes
nothing here. No `cap sync`, no native file touched.

---

# 7 · Integrity

## Byte-level scan — separate pass, byte tool, never grep

Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. **Before** is `git show HEAD:<path>`.

| File | | Bytes | NUL | Other flagged | **Total flagged** | TAB / LF / CR | classes |
|---|---|---|---|---|---|---|---|
| `kds/page.tsx` | before | 233564 | 0 | 0 | **0** | 0 / 3114 / 0 | 34 |
| `kds/page.tsx` | after | 235228 | 0 | 0 | **0** | 0 / 3123 / 0 | 34 |

**Zero flagged control bytes on both scans. No sanitisation needed, none performed.**

Class census delta — **no class added, none removed**:

```
   U+2500 BOX DRAWINGS LIGHT HORIZONTAL       2701 ->  2699  (-2)
   U+2014 EM DASH                              435 ->   438  (+3)
   U+1F534 LARGE RED CIRCLE                     210 ->   215  (+5)
   U+FE0F VARIATION SELECTOR-16                148 ->   150  (+2)
   U+26A0 WARNING SIGN                         143 ->   145  (+2)
   U+23F8 DOUBLE VERTICAL BAR                    3 ->     2  (-1)
   U+2026 HORIZONTAL ELLIPSIS                    1 ->     2  (+1)
   classes before=34 after=34   NEW=none  REMOVED=none
```

⚠️ **U+23F8 DOUBLE VERTICAL BAR −1 is the deleted `⏸` from the removed button's own comment**, not from any
rendered string: the banner's `⏸ Orders paused` and the modal's `⏸ Pause orders` both still carry theirs.
U+26A0 and U+FE0F moved together (+2/+2), preserving the file's pairing convention.

**`docs/kds-header-screen-on-swap-report.md`** — scanned as a separate pass after writing; figures in chat.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.

## Carrier-aware variation-selector check

Per emoji-presentation base, bare versus followed by U+FE0F. Counts in the chat reply. The rule they
satisfy: `Emoji_Presentation=Yes` bases 100% bare, `Emoji_Presentation=No` bases 100% paired. **No base
appears both bare and paired.**

## `git status --porcelain`

| Entry | Pre-existed this task? |
|---|---|
| `M docs/reference-manual.md` | ✅ **YES** — the V11.29 update from the previous turn, uncommitted. Not touched here. |
| `M app/dashboard/[token]/kds/page.tsx` | ❌ No — this task's only code change. |
| `?? docs/kds-header-screen-on-swap-report.md` | ❌ No — this report. |

⚠️ **THE TREE CHANGED UNDER ME MID-TASK AGAIN, AND IT WAS NOT ME.** The two earlier KDS reports
(`kds-truck-not-found-report.md`, `kds-handover-fix-report.md`) and the handover code fix were committed
**outside this session** as `98e4235` ("kitchen screen fix", 18 Aug 21:02) while this edit was in
progress — `git ls-files` now shows both reports tracked. That is why they no longer appear as `??`.
**`git show HEAD:` in §7's byte table therefore reads from `98e4235`, which already contains the handover
fix — so the before/after figures isolate THIS edit alone, which is what they are meant to do.**

Nothing was committed, staged, reverted, stashed or cleaned. **No `git stash`, `git checkout` or
`git restore` at any point.** Read-only git only: `git show HEAD:<path>`, `git status`.

---

# 8 · Flags

1. ⚠️ **The brief's "ONLY resume control" premise is wrong** — the pause banner's Resume link is ungated on
   `isDemo` (Q2). Corrected in the code comment as well as here. **The work is unchanged**: Manage event is
   still the route the brief asked for, and the banner offers no pause direction.
2. 🔴 **Option (c) was available and was declined on evidence**, not assumed away: `set_paused` has no
   server-side demo guard, so `paused_until` can hold a value on a demo row regardless of the UI.
3. ⚠️ **Row count is an ESTIMATE at both orientations**, portrait being the weaker claim.
4. ⚠️ **A TDZ reference was introduced and caught** before it shipped; `tsc` did not flag it.
5. **No instruction in this prompt contradicted another, and no span arrived garbled.**
