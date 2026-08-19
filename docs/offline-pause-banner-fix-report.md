# Offline pause banner — match the KDS rule, stop the button that lies

**One file changed: `app/dashboard/[token]/page.tsx`. 25 changed executable lines.** The KDS, the customer
menu route, the monitor, the heartbeat and the backstop constant are untouched — confirmed by empty diffs.

🔴 **THE SILENT-FAILURE DEFECT IN THE RESUME HANDLER IS REPORTED, NOT TOUCHED**, as instructed. §Reported.

🔴 **UNOBSERVED.** Nothing was exercised on a device. Behavioural claims are **READ-FROM-SOURCE**.

---

# Phase 1 — confirmations

**All seven established facts re-read and TRUE.** No stop condition. Details below.

## 1 · The block and its gates, as they stood

```tsx
{paused&&pauseUntilEffective&&(()=>{const minsLeft=Math.max(0,Math.round((new Date(pauseUntilEffective).getTime()-Date.now())/60000));const isIndefinite=new Date(pauseUntilEffective).getFullYear()>=2099;return<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 text-center"><p className="text-red-700 font-black text-sm">⏸ Orders paused{pauseReason==='offline'?' (device offline)':''}{isIndefinite?'':(` — resuming in ~${minsLeft} min`)} · Customers can browse but not order</p>
  <button onClick={()=>{fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:null,eventId:activeEvent?.id})});markPending('pausedUntil',null);markPending('vanPausedUntil',null);setPausedUntil(null);setVanPausedUntil(null);setVanOnlinePausedUntil(null)}} className="mt-2 w-full sm:w-auto bg-red-600 text-white font-black text-sm px-6 py-2.5 rounded-xl hover:bg-red-700 transition-colors">▶ Resume orders</button>
  {pauseReason==='offline'&&<p className="text-red-500 text-xs mt-1.5">If your connection is unstable, orders may pause again.</p>}
</div>})()}
```

```tsx
  const isFuturePause=(s:string|null)=>!!s&&new Date(s).getTime()>Date.now()
  const manualPaused=isFuturePause(pausedUntil)||isFuturePause(vanPausedUntil)
  const offlinePaused=isFuturePause(vanOnlinePausedUntil)
  const pauseUntilEffective=[vanPausedUntil,pausedUntil,vanOnlinePausedUntil].find(isFuturePause)??null
  const activeEventLive=selectedOrDefaultEvent?.status==='open'
  const offlinePausedDisplay=offlinePaused&&!(deviceOnline&&activeEventLive)
  const paused=manualPaused||offlinePausedDisplay
  const pauseReason:'manual'|'offline'|null=manualPaused?'manual':offlinePausedDisplay?'offline':null
```

✅ **Confirmed:** the offline block rendered only while the device was offline, and the Resume button was
unconditional inside it.

## 2 · The KDS rule, and the field

```tsx
        {anyPaused && (
          <div className="bg-red-500 text-white text-sm font-medium px-4 py-2.5 flex items-center justify-between flex-shrink-0">
            <span>⏸ Orders paused{pauseReason === 'offline' ? ' (device offline)' : ''} — customers cannot order</span>
            {pauseReason === 'manual' && <button onClick={togglePause} className="underline text-white text-xs">Resume</button>}
```

🔴 **THE FIELD IS `pauseReason`, AND THE DASHBOARD ALREADY HAS THE IDENTICAL ONE** — same name, same
`'manual'|'offline'|null` type, same derivation shape. **It does not infer offline-ness any other way.**
**READ.** So the KDS's rule is copyable verbatim rather than re-derived, which is what §3A does.

## 3 · The existing ack pattern, in full

**Write** (the popup's OK):

```tsx
  const ackOfflinePausedNotice=()=>{
    if(typeof window!=='undefined'&&offlinePauseEventId&&lastOfflinePauseAt)
      localStorage.setItem(`hg_offline_pause_ack_${offlinePauseEventId}`,lastOfflinePauseAt)
    setShowOfflinePausedNotice(false)
  }
```

**Read:**

```tsx
    const markerMs=new Date(lastOfflinePauseAt).getTime()
    if(!Number.isFinite(markerMs)||Date.now()-markerMs>OFFLINE_NOTICE_MAX_AGE_MS) return
    const ack=localStorage.getItem(`hg_offline_pause_ack_${offlinePauseEventId}`)
    if(!ack||markerMs>new Date(ack).getTime()) setShowOfflinePausedNotice(true)
```

**Keyed on:** `offlinePauseEventId` (per event, per device). **Stored value:** `lastOfflinePauseAt` — a
timestamp, **not a boolean**.

🔴 **CONFIRMED FROM THE MONITOR THAT A NEW PAUSE WRITES A NEW MARKER**, which is what makes a dismissal
incident-scoped rather than permanent:

```ts
        : { online_paused_until: autoPauseUntil, last_offline_pause_at: now.toISOString() }
```

**So `markerMs > ack` becomes true again on the next pause, and the notice re-fires.** ✅ That property is
inherited wholesale by the block's dismissal.

## 4 · The countdown and its constant

```tsx
const minsLeft=Math.max(0,Math.round((new Date(pauseUntilEffective).getTime()-Date.now())/60000));
```
```ts
  const AUTO_PAUSE_DURATION_HOURS = 2
  const autoPauseUntil = new Date(now.getTime() + AUTO_PAUSE_DURATION_HOURS * 60 * 60 * 1000).toISOString()
```

✅ **Confirmed: a flat `now + 2h` backstop, not a prediction.**

## 5 · The chip

```tsx
                {(()=>{const st=eventStatusDisplay(activeEvent.status,paused);return(
```
```ts
export function eventStatusDisplay(status: string | null | undefined, paused: boolean): EventStatusDisplay {
  if (paused) return { label: '⏸ Paused', tone: 'paused' }
```

✅ **It reads `paused` and nothing else.** It has no knowledge of the block, of `offlinePauseAcked`, or of
any dismissal. **Dismissing the block cannot hide it. READ.**

---

# Phase 2 — stop conditions

| Condition | Result |
|---|---|
| Offline and manual pauses indistinguishable | ❌ Distinguishable — `pauseReason` (§2). |
| Dismissing the block would hide the chip | ❌ It cannot — the chip reads `paused` (§5). |
| Instructions contradict | ❌ No. |
| Garbled span | ❌ None. |

**Proceeded.**

---

# Phase 3 — the changes

## A · Resume, gated on the KDS's own rule

```tsx
              {pauseReason==='manual'&&<button onClick={()=>{fetch('/api/dashboard/action',…)}} className="mt-2 w-full sm:w-auto bg-red-600 text-white font-black text-sm px-6 py-2.5 rounded-xl hover:bg-red-700 transition-colors">▶ Resume orders</button>}
```

**The handler body is byte-identical** — only a gate was placed around it (verified by execution).

## B · Countdown removed from the offline case only

```tsx
              {offlineCase
                ? <><p className="text-red-700 font-black text-sm">⏸ Offline protection is on — customers can browse but not order.</p>
                    <p className="text-red-600 text-xs mt-1.5">Ordering resumes automatically when your connection returns.</p></>
                : <p className="text-red-700 font-black text-sm">⏸ Orders paused{isIndefinite?'':(` — resuming in ~${minsLeft} min`)} · Customers can browse but not order</p>}
```

⚠️ **The manual branch KEEPS the countdown, deliberately.** There the deadline is the operator's own
chosen duration — a real forecast, not a backstop. **Removing it from both would have degraded the case
that was working.**

## C · Dismissal — the existing key, not a new one

```tsx
  const dismissOfflinePauseBlock=()=>{
    if(typeof window!=='undefined'&&offlinePauseEventId&&lastOfflinePauseAt)
      localStorage.setItem(`hg_offline_pause_ack_${offlinePauseEventId}`,lastOfflinePauseAt)
    setOfflinePauseAcked(true)
    setShowOfflinePausedNotice(false)
  }
```

```tsx
  useEffect(()=>{
    if(typeof window==='undefined') return
    if(!offlinePauseEventId||!lastOfflinePauseAt){setOfflinePauseAcked(false);return}
    const markerMs=new Date(lastOfflinePauseAt).getTime()
    if(!Number.isFinite(markerMs)){setOfflinePauseAcked(false);return}
    const ack=localStorage.getItem(`hg_offline_pause_ack_${offlinePauseEventId}`)
    setOfflinePauseAcked(!!ack&&markerMs<=new Date(ack).getTime())
  },[lastOfflinePauseAt,offlinePauseEventId])
```

**Render gate:** `!(pauseReason==='offline'&&offlinePauseAcked)`.

✅ **Executed check: exactly ONE offline-pause localStorage key exists in the file —
`hg_offline_pause_ack_` — with no `hg_offline_pause_block_*` or any other variant.** Nothing was invented.

⚠️ **THE KEY IS SHARED WITH THE POPUP, WHICH COUPLES THEM — STATED SO YOU CAN OVERRULE IT.** Acknowledging
either dismisses both **for that incident**: tapping OK on the popup pre-dismisses the block, and
dismissing the block suppresses the popup. **I judged that coherent** — they report the same incident, one
acknowledgement covering both is the honest reading of "one incident, one ack", and the ⏸ chip stands
either way. **If you want them independent, that needs a second key, which is exactly what the brief told
me not to invent.**

## D · Copy

Two short sentences. **States protection is on, states browse-but-not-order, states automatic resumption,
and names no duration.** The old third line — *"If your connection is unstable, orders may pause again."* —
is removed; it rendered only in the offline case, so the manual path is unaffected.

## E · The chip

**Untouched.** No edit anywhere near `eventStatusDisplay` or its call site.

---

# Phase 4 — verification

## The five scenarios, from the code as written — READ-FROM-SOURCE, unobserved

| # | Scenario | Outcome |
|---|---|---|
| 1 | **Offline pause, device offline** | The block renders with the two-sentence offline copy. 🔴 **No Resume button** (`pauseReason==='manual'` is false). 🔴 **No countdown** (offline branch omits `minsLeft`). A **Dismiss** link is present. |
| 2 | **Offline pause, dismissed, still offline** | The block does **not** render — `offlinePauseAcked` is true and the gate excludes it. ✅ **The ⏸ Paused chip still shows**, because `paused` is still true and the chip never reads the ack. |
| 3 | **Dismissed → reconnect → NEW offline pause an hour later** | ✅ **It appears again.** The monitor writes a fresh `last_offline_pause_at`; the effect re-runs on that change, `markerMs <= ack` becomes false, `offlinePauseAcked` returns to false, and the block renders. **This is the stored-timestamp property, inherited from the existing pattern.** |
| 4 | **MANUAL pause** | ✅ **Unchanged.** Same copy, same countdown, same Resume button with a byte-identical handler. Not dismissible — the Dismiss link is gated on `offlineCase`. |
| 5 | **The ⏸ chip** | ✅ **Visible in all four**, since `paused` is true in each and the chip is derived from it alone. |

## Verified by EXECUTION

```
EXECUTABLE-ONLY CHANGED LINES: 25
```

```
--- A: Resume gated on the KDS rule ---
  button now inside pauseReason==='manual' : True
  resume handler body unchanged            : True
--- B: countdown removed from offline only ---
  countdown now in the non-offline branch  : True
  offline branch has no minsLeft           : True
--- C: dismissal reuses the EXISTING key ---
  stores the marker (not a boolean)        : True
  newer-marker-wins read                   : True
--- D/E: copy + chip ---
  two sentences, no duration in offline    : True
  old 'unstable' third line gone           : True
  chip untouched (reads `paused`)          : True
--- untouched ---
  offlinePausedDisplay=offlinePaused             before=1 after=1
  const paused=manualPaused||offlinePausedDispla before=1 after=1
  pauseReason:'manual'|'offline'|null            before=1 after=1
```

`git diff --stat` on the KDS, `app/api/menu`, `supabase/functions/heartbeat-monitor` and
`app/api/heartbeat` is **empty**.

⚠️ **ONE OF MY OWN CHECKS WAS WRONG AND I AM RECORDING IT.** A check asserting
`count('hg_offline_pause_ack_') == 3` reported **False**. The count is **4**, not 3 — I had forgotten my
own added read. Re-run as a key-uniqueness check instead, the result is what matters: **exactly one
offline-pause key exists in the file.** The assertion was mis-specified, not the code.

## Not offered as verification

`tsc` is clean for this file. **That is not verification** — every change here is a JSX condition, and the
previous code, which offered a button that could not work, typechecked equally well.

## What remains UNPROVEN

- **That the block renders as described on a device.** Nothing was exercised.
- **That the re-fire in scenario 3 works end to end** — it depends on the monitor writing a fresh
  `last_offline_pause_at`, which is READ from the monitor but not observed.
- **What would settle both:** airplane-mode the device on a live event, dismiss, restore signal, then
  induce a second pause and confirm the block returns.

---

# 🔴 Reported, NOT touched: the resume handler still fails silently

Per the brief, left exactly as found. Restating so it is not lost:

```tsx
onClick={()=>{fetch('/api/dashboard/action',{…});markPending('pausedUntil',null);markPending('vanPausedUntil',null);setPausedUntil(null);setVanPausedUntil(null);setVanOnlinePausedUntil(null)}}
```

**Un-awaited, no `.catch()`, not routed through `gatedAction`** — so it does not queue, fails silently, and
**applies its optimistic state unconditionally**, telling the operator ordering resumed when the server may
never have heard.

⚠️ **THIS CHANGE REDUCES THE BLAST RADIUS BUT DOES NOT FIX IT.** The button is now shown only for a manual
pause — where the device is usually online — so the common case is safe. **But a manual pause on a device
that goes offline afterwards still presents a button that will lie in exactly the same way.** The defect is
narrowed, not closed, and it needs its own task.

---

# Phase 5 — integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) as a **separate pass after** each write — never
grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.

**Result: zero NUL bytes and zero other flagged control bytes on both files.** Counts, the non-ASCII class
delta and the per-base carrier-aware variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
