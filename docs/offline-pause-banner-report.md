# The offline-pause banner — read-only diagnosis

**DIAGNOSIS ONLY. Nothing was changed** except this report. No build was run. **No copy is proposed** —
the wording decision is yours.

🔴 **BOTH REPORTED PROBLEMS ARE CONFIRMED, AND (a) IS SHARPER THAN STATED.** The button is not merely
*sometimes* unable to work — for the offline case it is offered **only** in the state where it cannot work.
🔴 **(b) IS CONFIRMED: the figure is a DEADLINE, not a prediction, and reconnecting resumes far sooner —
so the number actively misleads.**

---

## 1 · The component and its gate

**File:** `app/dashboard/[token]/page.tsx`. **No separate component** — it is an inline IIFE in the Orders
tab body, anchored on the copy `Customers can browse but not order`. **READ.**

```tsx
{paused&&pauseUntilEffective&&(()=>{const minsLeft=Math.max(0,Math.round((new Date(pauseUntilEffective).getTime()-Date.now())/60000));const isIndefinite=new Date(pauseUntilEffective).getFullYear()>=2099;return<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 text-center"><p className="text-red-700 font-black text-sm">⏸ Orders paused{pauseReason==='offline'?' (device offline)':''}{isIndefinite?'':(` — resuming in ~${minsLeft} min`)} · Customers can browse but not order</p>
  {/* Prominent inline Resume — one tap, no hunting in the ··· menu. Clears BOTH paused_until
      and online_paused_until on the active event (set_paused resume). */}
  <button onClick={()=>{fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:null,eventId:activeEvent?.id})});markPending('pausedUntil',null);markPending('vanPausedUntil',null);setPausedUntil(null);setVanPausedUntil(null);setVanOnlinePausedUntil(null)}} className="mt-2 w-full sm:w-auto bg-red-600 text-white font-black text-sm px-6 py-2.5 rounded-xl hover:bg-red-700 transition-colors">▶ Resume orders</button>
  {pauseReason==='offline'&&<p className="text-red-500 text-xs mt-1.5">If your connection is unstable, orders may pause again.</p>}
</div>})()}
```

**Every gate:**

```tsx
  const isFuturePause=(s:string|null)=>!!s&&new Date(s).getTime()>Date.now()
  const manualPaused=isFuturePause(pausedUntil)||isFuturePause(vanPausedUntil)
  const offlinePaused=isFuturePause(vanOnlinePausedUntil)
  const pauseUntilEffective=[vanPausedUntil,pausedUntil,vanOnlinePausedUntil].find(isFuturePause)??null
```
```tsx
  const activeEventLive=selectedOrDefaultEvent?.status==='open'
  const offlinePausedDisplay=offlinePaused&&!(deviceOnline&&activeEventLive)
  const paused=manualPaused||offlinePausedDisplay
  const pauseReason:'manual'|'offline'|null=manualPaused?'manual':offlinePausedDisplay?'offline':null
```

## 2 · 🔴 THE CENTRAL QUESTION — does it distinguish offline from back-online?

**YES, it distinguishes them — and that makes problem (a) WORSE, not better.** **READ.**

```tsx
  const offlinePausedDisplay=offlinePaused&&!(deviceOnline&&activeEventLive)
```

**The hypothesis under test is REFUTED as written, and replaced by a sharper one.** The banner does not
"render identically in both states". For an offline pause it renders **only while `deviceOnline` is false**
(or the event is not live) — the moment `navigator.onLine` flips true on a live event,
`offlinePausedDisplay` goes false, `paused` goes false, and **the whole block disappears immediately**,
without waiting for the database to clear.

🔴 **SO THE CONSEQUENCE IS THE OPPOSITE OF HARMLESS: in the offline case, "Resume orders" is displayed
EXACTLY AND ONLY when the device has no connectivity to send it.** It is not a button that sometimes fails
— it is a button that, on this path, can never succeed.

⚠️ **The block serves two causes and the button is only broken for one.** With `pauseReason === 'manual'`
the same block renders regardless of connectivity, and there the button is correct and useful. **Any change
must not remove it from the manual case.** **READ.**

⚠️ **`deviceOnline` is `navigator.onLine`** (`useState(typeof navigator!=='undefined'?navigator.onLine:true)`),
not the reachability ping. Airplane mode sets it false reliably; a connected-but-dead uplink does not.
**READ.**

## 3 · What the button does

```tsx
onClick={()=>{fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:null,eventId:activeEvent?.id})});markPending('pausedUntil',null);markPending('vanPausedUntil',null);setPausedUntil(null);setVanPausedUntil(null);setVanOnlinePausedUntil(null)}}
```

**It makes a network call. READ.** A raw `fetch` to `/api/dashboard/action` with `action: 'set_paused'`.

🔴 **THE `fetch` IS NOT AWAITED, HAS NO `.catch()`, AND IS NOT ROUTED THROUGH `gatedAction`.** Three
consequences, all **READ** from the code:

1. **It does not queue.** Every offline-durable write on this dashboard goes through `gatedAction`; this one
   does not, so there is no outbox op and no replay.
2. **It fails silently.** No `await`, no error handling, no toast. The rejected promise is unhandled —
   which surfaces in a console as an unhandled rejection and **nowhere in the UI**.
3. 🔴 **THE OPTIMISTIC STATE IS APPLIED UNCONDITIONALLY, BEFORE AND REGARDLESS OF THE RESULT.**
   `markPending(...)` and the four `set…(null)` calls run synchronously on the same tick. **So pressing it
   offline clears the local pause state and the red block disappears — while the server is untouched and
   customers are still blocked.**

⚠️ **That is the most operationally serious finding in this report: the control does not merely fail to
work offline, it reports success.** The operator sees the banner vanish and reasonably concludes ordering
has resumed. **INFERRED** for the operator's belief; **READ** for the state change.

⚠️ **It will re-appear on the next poll** once `/api/dashboard` returns the unchanged `online_paused_until`
— so the observable is a banner that disappears and comes back, with no error in between. **INFERRED.**

## 4 · 🔴 The ~119 min figure — a DEADLINE, not a prediction

```tsx
const minsLeft=Math.max(0,Math.round((new Date(pauseUntilEffective).getTime()-Date.now())/60000));
```
```tsx
{isIndefinite?'':(` — resuming in ~${minsLeft} min`)}
```

**It counts down to `pauseUntilEffective`**, which for an offline pause resolves to **`vanOnlinePausedUntil`
= `truck_events.online_paused_until`**. **READ.**

**That field is written by the heartbeat monitor as a fixed two-hour deadline:**

```ts
  const AUTO_PAUSE_DURATION_HOURS = 2
  const autoPauseUntil = new Date(now.getTime() + AUTO_PAUSE_DURATION_HOURS * 60 * 60 * 1000).toISOString()
```
```ts
        : { online_paused_until: autoPauseUntil, last_offline_pause_at: now.toISOString() }
```

🔴 **CONFIRMED: it is a hard expiry, not an estimate of anything.** 119 minutes means the monitor wrote the
pause about one minute ago and it is set to lapse in two hours. **It predicts nothing about recovery and
is not derived from connectivity, signal, or any observation of the device.**

🔴 **AND IT IS THE WRONG NUMBER TO SHOW, because the pause almost never runs to that deadline** — see §5.
The deadline is a **backstop** so a permanently-dead van does not block ordering forever; the normal exit
is a returning heartbeat, in seconds. **The banner shows the backstop as though it were the plan.**

⚠️ **`last_offline_pause_at` is NOT read by this banner.** It is a separate durable marker driving the
one-time popup (§8). **READ.**

## 5 · 🔴 RESUME ON RECONNECT — automatic, and fast

**Ordering resumes AUTOMATICALLY on reconnect. It does NOT wait for the deadline and does NOT require the
button.** **READ.**

`app/api/heartbeat/route.ts`:

```ts
async function clearOfflinePauseForVans(vanIds: string[]) {
  if (vanIds.length === 0) return
  await supabaseAdmin
    .from('truck_events')
    .update({ online_paused_until: null })
    .in('van_id', vanIds)
    .not('online_paused_until', 'is', null)
```

**The device pings on its heartbeat interval; the ping stamps `last_heartbeat_at` and then clears
`online_paused_until` for that van's events.** The dashboard's own comment puts the timing at
**"~1-2s"** in the background, with the local override hiding the banner immediately:

```tsx
  // it stops showing the OFFLINE pause IMMEDIATELY, without waiting ~15-30s for the DB online_paused_until
  // to clear (the reconnect-heartbeat below clears it in the background within ~1-2s).
```

✅ **So the banner CAN honestly promise automatic recovery — that is exactly what the system does.** 🔴
**What it cannot honestly do is show a two-hour countdown as the route back, or offer a manual button as
the mechanism.** Both describe the exception, not the rule.

## 6 · Where the pause actually lives

**Server-side, authoritatively. The customer gate does not depend on the operator's device at all.**
**READ** — this is the **customer** path (`app/api/menu/[truckId]/route.ts`), read as such:

```ts
      .select('van_id, paused_until, online_paused_until, offline_protection_override, extra_wait_mins, extra_wait_started_at, start_time, end_time, event_date')
```
```ts
      const offlinePaused = offlineProtectionEnabled && ev.online_paused_until
        ? new Date(ev.online_paused_until) > new Date()
```

**A customer hitting the ordering page is blocked by a server read of `truck_events.online_paused_until`.**
The operator's device is irrelevant to that decision — it was only the *cause* (a stale heartbeat), never
the enforcement.

**The client side is display-only, plus one override:** `offlinePausedDisplay` suppresses the operator's
banner on local reconnect, and the dashboard's own comment is explicit that **"The CUSTOMER page is
untouched: it stays DB-driven (authoritative server state)."** **READ.**

⚠️ **So there is a deliberate window where the operator's banner is gone and customers are still blocked** —
between the local `navigator.onLine` flip and the heartbeat clearing the row. Documented as ~1–2 s.
**CANNOT DETERMINE** how long it is in practice on a poor connection; **what would settle it:** timestamp
the banner's disappearance against the row's `online_paused_until` going null.

## 7 · The persistent "⏸ Paused" chip

**`app/dashboard/[token]/page.tsx`, in the event bar, via the shared `eventStatusDisplay`:**

```tsx
                {(()=>{const st=eventStatusDisplay(activeEvent.status,paused);return(
```

`lib/event-display.ts`:

```ts
export function eventStatusDisplay(status: string | null | undefined, paused: boolean): EventStatusDisplay {
  if (paused) return { label: '⏸ Paused', tone: 'paused' }
  if (status === 'open') return { label: '● Live', tone: 'live' }
```

🔴 **It is driven by the SAME `paused` variable as the red block** — so it is *not* independent. **READ.**

**Answering the question directly: if the red block were dismissed, the chip would still show — but only
because dismissal would be a separate UI state.** Both derive from `paused`, so **as long as the pause is
real and the device still believes it is offline, the chip stands.** ✅ **An operator who dismissed the
block would retain a standing indication that ordering is off.** ⚠️ **`paused` also drives the chip's
suppression: the same local-reconnect override that hides the block hides the chip**, so neither survives
the moment `deviceOnline` flips — which is correct for the chip and is the point at issue for the block.

## 8 · Dismissibility, and the patterns that already exist

**The red block is NOT dismissible today.** No close control, no state, no storage key. **READ.**

🔴 **TWO ESTABLISHED DISMISSAL PATTERNS ALREADY EXIST ON THIS DASHBOARD — a new banner should follow one
rather than invent a third.**

**(i) The per-event, per-device acknowledgement, keyed on a durable marker** — this is the closest
precedent, and it is *already about offline pauses*:

```tsx
  // Offline-pause notification: durable marker from /api/dashboard (set only by heartbeat-monitor,
  // survives the reconnect clear). Fires a one-time popup when it's NEWER than this device's ack.
  const[lastOfflinePauseAt,setLastOfflinePauseAt]=useState<string|null>(null)
  const[offlinePauseEventId,setOfflinePauseEventId]=useState<string|null>(null)
  const[showOfflinePausedNotice,setShowOfflinePausedNotice]=useState(false)
  // OK → record the acknowledged marker for THIS event so a poll tick / reload won't re-pop it; a
  // newer offline pause (newer timestamp) clears the guard and re-fires.
  const ackOfflinePausedNotice=()=>{
    if(typeof window!=='undefined'&&offlinePauseEventId&&lastOfflinePauseAt)
      localStorage.setItem(`hg_offline_pause_ack_${offlinePauseEventId}`,lastOfflinePauseAt)
    setShowOfflinePausedNotice(false)
  }
```

✅ **This is the mechanism `last_offline_pause_at` exists for** — and it is why that field survives the
reconnect clear while `online_paused_until` does not.

**(ii) The signature-keyed breach dismissal**, same shape, different key:

```tsx
  const storedBreachAck=…localStorage.getItem(`hg_breach_ack_${selectedEventId}`)…
      try{localStorage.setItem(`hg_breach_ack_${selectedEventId}`,sig)}catch{…}
```

⚠️ **Both are per-device `localStorage` keyed on the event, and both store a VALUE (a timestamp or a
signature) rather than a boolean — so a NEWER occurrence re-fires.** That property is the reason they work.

## 9 · Every other surface showing this pause state

| Surface | What it shows | Read as |
|---|---|---|
| **Operator dashboard** | the red block (§1) + the `⏸ Paused` chip (§7), both on `paused` | **READ — operator path** |
| **KDS** (`app/dashboard/[token]/kds/page.tsx`) | its own red bar on `anyPaused = isPaused \|\| offlinePausedDisplay`, with a `Resume` link shown only for `pauseReason === 'manual'` | **READ — operator path** |
| **Customer ordering page** | blocked server-side by `/api/menu/[truckId]`'s `online_paused_until` read (§6) | **READ — CUSTOMER path, read as such** |
| **Email / push notification** | **none found** for the pause state | **READ** (sweep found no sender) |
| **One-time operator popup** | `showOfflinePausedNotice`, fired from `last_offline_pause_at` (§8) | **READ — operator path** |

✅ **The KDS already does the thing the dashboard does not: it gates its Resume control on the pause
REASON.** Its comment states the rule — *"RESUME IS OFFERED ONLY FOR A MANUAL PAUSE. `togglePause` writes
`paused_until`; an offline pause is cleared by the next successful heartbeat, not by a button, so offering
one here would be a control that does not do what it says."*

🔴 **So the correct behaviour is already implemented, argued and shipped — on the KDS. The dashboard's
block predates or ignores it.** That is the single most useful fact in this report: **there is no design
question to resolve, only an inconsistency to close.**

⚠️ **A fact verified on the operator surface is not a fact about the customer surface.** I read
`/api/menu/[truckId]` for the customer claim in §6 and nothing else on that path; I did not read the
customer order page's rendering.

---

## Summary of the two reported problems

| | Verdict |
|---|---|
| **(a) "Resume orders" cannot work offline** | 🔴 **CONFIRMED, and worse than described.** For `pauseReason === 'offline'` the button is shown *only* while the device is offline. It is un-awaited, un-caught, not queued — and it applies its optimistic state unconditionally, so it **looks** like it worked. |
| **(b) "~119 min" is a deadline, not a prediction** | 🔴 **CONFIRMED.** It counts down to `online_paused_until`, a fixed `now + 2h` written by the monitor as a backstop. **Reconnection resumes in ~1–2 s via the heartbeat**, so the figure describes the exception and hides the rule. |

**Neither is a defect in offline protection**, which behaved exactly as designed throughout.

**No instruction contradicted another, and no span arrived garbled.**

---

## Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.

**Result: zero NUL bytes and zero other flagged control bytes.** Counts, the non-ASCII census and the
per-base carrier-aware variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
