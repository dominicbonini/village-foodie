# Event pause reverts itself — read-only diagnosis

**READ-ONLY. Nothing was edited, created or deleted except this report.** No commit, no build, no
`next dev`, no `next build`, no `cap sync`, no deploy, no SQL, no database write. 🔴 **No `git stash`,
`checkout` or `restore` — the only git command run was `status`.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

# 🔴 THE PAUSE DID NOT REVERT. ONLY THE KDS'S DISPLAY OF IT DID.

**The KDS reads its pause state from `data.truck.paused_until`. `/api/dashboard` sets that field to a
HARDCODED `null` on every response — the pause is EVENT-scoped now and lives on
`truck_events.paused_until`, which the KDS never reads.**

**So: the operator paused, the banner appeared from optimistic local state, the handler's own immediate
`fetchAllRef.current()` returned `truck.paused_until: null`, and the banner vanished.** ✅ **The event
stayed paused on the server, and customers were genuinely blocked throughout.**

# ⚠️ AND THE SECOND CONSEQUENCE IS WORSE THAN THE FIRST

🔴 **THE KDS CAN NEVER RESUME.** `isPaused` is derived from that same always-null value, so it is
permanently false — which means the toggle's resume arm is unreachable and **every tap sends another
2-hour pause.** ⚠️ **Whether the operator can undo their own pause from that screen is the part I would
check first, and it is Q9.**

---

# Q1 — THE TWO CALLERS

## THE KDS — READ, in full

```tsx
  const togglePause = useCallback(async () => {
    const isPaused = pausedUntil && new Date(pausedUntil) > new Date()
    if (!isPaused) {
      const confirmed = window.confirm('Pause orders? Customers will see "Not accepting orders" until you resume.')
      if (!confirmed) return
    }
    const paused_until = isPaused
      ? null
      : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    setPausedUntil(paused_until)
    const res = await fetch('/api/dashboard/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, pin, action: 'set_paused', paused_until, eventId: activeEventIdRef.current }),
    })
    const data = await res.json()
    if (data?.queued) {
      setPendingSyncCount(c => c + 1)
      return
    }
    fetchAllRef.current()
  }, [token, pin, pausedUntil])
```

## THE DASHBOARD — READ, its four durations and its resume

```tsx
                <button key={mins} onClick={()=>{const until=new Date(Date.now()+mins*60000).toISOString();fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'set_paused',paused_until:until,eventId:activeEvent?.id})});markPending('vanPausedUntil',until);setVanPausedUntil(until);setShowPauseModal(false)}} …>{label}</button>
```
```tsx
              <button onClick={()=>{const until=new Date('2099-01-01').toISOString();…markPending('vanPausedUntil',until);setVanPausedUntil(until);setShowPauseModal(false)}} …>Until I turn it back on</button>
```
```tsx
              <button onClick={()=>{fetch('/api/dashboard/action',{…body:JSON.stringify({token,pin,action:'set_paused',paused_until:null,eventId:activeEvent?.id})});markPending('pausedUntil',null);markPending('vanPausedUntil',null);setPausedUntil(null);setVanPausedUntil(null);setVanOnlinePausedUntil(null)}} …>▶ Resume orders</button>
```

## The comparison

| | KDS | Dashboard |
|---|---|---|
| endpoint | `/api/dashboard/action` | **the same** |
| action | `set_paused` | **the same** |
| body | `{token, pin, action, paused_until, eventId}` | **the same shape** |
| **duration** | 🔴 **hardcoded 2 hours** | 10 / 20 / 30 min, or `2099-01-01` |
| **units** | ✅ **an ISO TIMESTAMP** — `new Date(Date.now() + 2*60*60*1000).toISOString()` | ✅ **an ISO TIMESTAMP** — `new Date(Date.now() + mins*60000).toISOString()` |
| optimistic local write | `setPausedUntil(…)` — 🔴 **UNGUARDED** | `markPending('vanPausedUntil', until)` **then** `setVanPausedUntil(…)` |
| after the write | 🔴 **`fetchAllRef.current()` immediately** | **nothing** — it waits for the next poll |
| gate | `window.confirm` | a styled modal |

# ✅ NO MINUTES/TIMESTAMP CONFUSION. BOTH SEND AN ABSOLUTE ISO INSTANT, AND THE SERVER STORES IT VERBATIM.

⚠️ **The dashboard's own value is computed as `mins*60000` — minutes converted to an instant before it
leaves the client. The server never sees a duration from either caller.**

---

# Q2 — THE COLUMNS

| Column | Meaning | Written by | Read by |
|---|---|---|---|
| **`truck_events.paused_until`** | 🔴 **THE MANUAL PAUSE.** The operator's own "stop taking orders" | `set_paused` — **both callers** | ✅ **the customer ordering gate** · ✅ the dashboard, as `vanPausedUntil` · 🔴 **NOT the KDS** |
| **`truck_events.online_paused_until`** | The OFFLINE AUTO-pause. Applied when a van's heartbeat goes stale | `heartbeat-monitor` (sets), `/api/heartbeat` (clears), `set_paused` **on resume only** | the customer gate · the dashboard as `vanOnlinePausedUntil` |
| **`truck_events.last_offline_pause_at`** | When the last offline auto-pause was applied — display/forensics only | `heartbeat-monitor` | not on either pause path |
| **`trucks.paused_until`** | 🔴 **DEAD.** A legacy truck-level column | **NOTHING** | 🔴 **the KDS — via a response field that is hardcoded null** |

**READ — the server writes the EVENT column:**

```ts
      const patch = resuming
        ? { paused_until: null, online_paused_until: null }
        : { paused_until }
      await supabase.from('truck_events').update(patch).eq('id', eventId).eq('truck_id', truck.id)
```

**READ — the customer gate reads the EVENT columns:**

```ts
    // (Pause is EVENT-scoped — the per-event guard below reads truck_events.paused_until /
    // online_paused_until. The old truck-level guard here was removed: nothing writes
    // trucks.paused_until anymore, and a stale pre-migration value would have falsely 423'd
```
```ts
        .select('van_id, status, paused_until, online_paused_until')
```

# 🔴 AND HERE IS THE MISMATCH, QUOTED FROM BOTH SIDES

**READ — `/api/dashboard` OVERRIDES `truck.paused_until` to `null`, deliberately:**

```ts
      // ── DELIBERATE OVERRIDES — these are NOT the raw column values, and must stay AFTER the spread ──
      // Pause + extra-wait are EVENT-scoped now — sourced from the selected event, not the truck.
      // (Legacy trucks.* columns left unread; the badge reads these via the response.)
      paused_until:        null,
```

**and serves the real value under a different key:**

```ts
    vanPausedUntil: eventPausedUntil,            // event-scoped (key kept for the client)
    vanOnlinePausedUntil: eventOnlinePausedUntil, // event-scoped (key kept for the client)
```

**READ — the KDS reads the overridden one, in BOTH of its fetch paths:**

```tsx
      setPausedUntil(data.truck?.paused_until ?? null)
```
```tsx
    setPausedUntil(data.truck?.paused_until ?? null)
```

**READ — the dashboard reads the real one, through the guard:**

```tsx
      setPausedUntil(applyPending('pausedUntil',data.truck?.paused_until||null))              // manual truck pause (dual-source)
      setVanPausedUntil(applyPending('vanPausedUntil',data.vanPausedUntil??null))              // manual van pause (dual-source)
```

# 🔴 STATED PLAINLY: THE KDS WRITES ONE COLUMN AND READS ANOTHER — AND THE ONE IT READS IS HARDCODED NULL BY THE API AND WRITTEN BY NOTHING.

⚠️ **The manual already records the column as dead:** *"`trucks.paused_until` is DEAD — nothing has
written it since the truck-level guard was removed from order submission. A column that looks live and
is not."* ✅ **The dashboard reads `data.truck?.paused_until` too — but it is one of THREE sources it
ORs together, and the live one, `vanPausedUntil`, is right beside it.**

---

# Q3 — WHAT UNPAUSES

**EXECUTED — every writer that clears or shortens a pause, repo-wide:**

| Writer | Column | Could it fire within ONE SECOND? |
|---|---|---|
| `set_paused` with a null body — the explicit Resume | `paused_until` **and** `online_paused_until` | ⚠️ **only if the operator taps Resume.** Not observed |
| `/api/heartbeat` — `.update({ online_paused_until: null })` | 🔴 **`online_paused_until` ONLY** | ✅ **YES — the KDS beats every 15s and once on mount.** ⚠️ **But it CANNOT touch the manual pause** |
| `set_offline_protection` with `value === false` | `online_paused_until` only | ✗ requires a settings toggle |
| `heartbeat-monitor` (Edge Function, cron) | 🔴 **SETS `online_paused_until`; never clears `paused_until`** | ✗ |
| `auto-event-scheduler` | ⚠️ **neither** — EXECUTED: zero `paused_until` occurrences | ✗ |
| an expiry comparison | ⚠️ **CLIENT-SIDE ONLY, and it writes nothing** — `isFuturePause` / `new Date(pausedUntil) > new Date()` are render-time reads | ✗ |
| a poll response overwriting local state | 🔴 **YES — Q4** | 🔴 **YES, AND THIS IS THE ONE** |

# ✅ NOTHING SERVER-SIDE CLEARS `truck_events.paused_until` EXCEPT AN EXPLICIT RESUME. THE PAUSE DID NOT REVERT IN THE DATABASE.

⚠️ **On the cron question you raised: `heartbeat-monitor` is a Supabase Edge Function invoked by cron,
so its traffic WOULD appear in `net._http_response` — that is the right table for it. But it is the
wrong mechanism to look at: it writes `online_paused_until`, never `paused_until`, so no row there can
explain a manual pause disappearing.**

---

# Q4 — THE POLL. 🔴 YES, AND IT IS NOT EVEN THE POLL — IT IS THE HANDLER'S OWN REFETCH.

**READ — the last line of the KDS's own pause handler:**

```tsx
    fetchAllRef.current()
```

🔴 **THE HANDLER REFETCHES IMMEDIATELY AFTER ITS OWN WRITE, and that refetch carries
`truck.paused_until: null` — not because it is stale, but because the API always sends null there.**
⚠️ **So this is not a race the write could win by being awaited. `await res.json()` HAS already
completed; the write is durable. The refetch would overwrite the banner even if it ran an hour later.**

| | KDS | Dashboard |
|---|---|---|
| optimistic write guarded? | 🔴 **NO.** A bare `setPausedUntil` | ✅ **YES.** `markPending` registers the intent BEFORE the setState |
| what a refetch does to it | 🔴 **overwrites it with `null`, every time** | ✅ **`applyPending` returns the DESIRED value until the server echoes it** |
| refetch timing | 🔴 **immediately, in the handler** | the 60s poll or a Realtime event |

**READ — the dashboard's guard, and its comment names this exact failure:**

```tsx
  // A field the operator edits optimistically registers its key here; any background refetch (poll /
  // realtime / reseed) applies the DESIRED value over server state until the server ECHOES it (then the
  // key is released). Stops the write-round-trip clobber (the flip-back bug) without a per-toggle ref that
  // a future edit has to remember. Used by: pause + extra-wait (dual-source live), and category-available
```

# 🔴 "THE FLIP-BACK BUG" IS NAMED IN THE DASHBOARD'S OWN COMMENT, AND THE MECHANISM THAT FIXED IT THERE WAS NEVER ADDED TO THE KDS.

⚠️ **THE GUARD ALONE WOULD NOT SAVE THE KDS. `applyPending` releases its key when the server value
matches — and the server value for `truck.paused_until` is permanently `null`, so the key would never
release. The column mismatch is the primary defect; the missing guard is why it surfaces in one
second rather than in sixty.**

---

# Q5 — THE OFFLINE OUTBOX

# ✅ NEITHER CALLER ROUTES PAUSE THROUGH `gatedAction`. BOTH USE A BARE `fetch`.

**EXECUTED — both quoted handlers call `fetch('/api/dashboard/action', …)` directly; `gatedAction`
appears in neither.** ✅ **So there is no outbox op, no `kind:'status'` queue entry, and no replay.**

⚠️ **BUT THE KDS READS A `queued` FLAG ANYWAY:**

```tsx
    if (data?.queued) {
      setPendingSyncCount(c => c + 1)
      return
    }
```

🔴 **That branch is vestigial. `data` here is the parsed body of a normal `fetch`, and the `set_paused`
handler returns `{ success: true }` — EXECUTED: it has no `queued` field.** ⚠️ **The only thing that
ever produced `queued` was the service worker's old fake-success mutation queue, which is recorded as
inert. So the branch cannot fire, and on a genuine offline the `fetch` THROWS — unhandled, since there
is no try/catch — and `setPausedUntil` has already run.**

**What the banner reflects: LOCAL INTENT ONLY, on both surfaces, until a refetch replaces it.**
🔴 **On the KDS a failed pause would therefore leave the banner up until the next fetch, which is the
mirror image of the observed bug — an unpaused event displaying as paused.**

---

# Q6 — THE BANNER

## THE KDS — READ

```tsx
      {isPaused && (
        <div className="bg-red-500 text-white text-sm font-medium px-4 py-2.5 flex items-center justify-between flex-shrink-0">
          <span>⏸ Orders paused — customers cannot order</span>
```
```tsx
  const isPaused = pausedUntil ? new Date(pausedUntil) > new Date() : false
```

🔴 **DERIVED FROM LOCAL STATE ONLY, and that state has exactly two sources: the optimistic
`setPausedUntil` in the handler, and `data.truck?.paused_until` — which is always null.**

# ✅ SO YES — IT CAN SHOW "PAUSED" WHILE THE SERVER HAS NO PAUSE RECORDED, AND IT DOES THE OPPOSITE HERE: IT SHOWS UNPAUSED WHILE THE SERVER HAS ONE.

## THE DASHBOARD — READ

```tsx
  const manualPaused=isFuturePause(pausedUntil)||isFuturePause(vanPausedUntil)
  const offlinePaused=isFuturePause(vanOnlinePausedUntil)
```
```tsx
  const pauseUntilEffective=[vanPausedUntil,pausedUntil,vanOnlinePausedUntil].find(isFuturePause)??null
```

✅ **Three sources OR'd, one of which — `vanPausedUntil` — is the live event column, and all three pass
through `applyPending`. The dashboard's banner reflects server state reconciled with local intent.**

---

# Q7 — TIMEZONE AND CLOCK

# ✅ NO TIMEZONE BUG HERE. EVERY COMPARISON IS BETWEEN TWO ABSOLUTE INSTANTS.

```tsx
  const isPaused = pausedUntil ? new Date(pausedUntil) > new Date() : false
```
```ts
      if (ev.online_paused_until && new Date(ev.online_paused_until).getTime() > now.getTime()) {
```

⚠️ **`toISOString()` produces a `Z`-suffixed UTC string; `new Date(isoString)` parses it to an absolute
instant; `new Date()` is also an absolute instant. The comparison never consults a calendar or a
timezone, so BST cannot shift it.** ✅ **A device clock that is WRONG would misjudge it — but by the
clock's error, not by an hour of BST, and it would affect the dashboard identically.**

🔴 **AND THE OBSERVED FAILURE IS NOT AN EXPIRY AT ALL.** A 2-hour pause read as expired would require a
clock two hours fast; the pause vanished in **one second**, and the mechanism that removed it —
`setPausedUntil(null)` from the refetch — does not consult the clock. ✅ **The expiry comparison is
exonerated by the timing alone.**

---

# Q8 — WHICH SURFACES ARE AFFECTED

# 🔴 THE KDS. NOT THE DASHBOARD.

| Surface | Affected? | Why |
|---|---|---|
| **KDS** | 🔴 **YES** | It reads `data.truck.paused_until`, which the API hardcodes to `null`, and its optimistic write is unguarded and immediately refetched |
| **Dashboard** | ✅ **NO** | It reads `data.vanPausedUntil` — the live event column — ORs it with two others, guards every one with `applyPending`, and does not refetch in the handler |

**The claims this rests on, so you can check the weakest first:**

1. 🔴 **`/api/dashboard` returns `truck.paused_until: null` unconditionally.** ✅ **EXECUTED — the
   literal is quoted above, inside a "DELIBERATE OVERRIDES" block.** **This is the load-bearing claim;
   if it is wrong, the whole conclusion goes.**
2. 🔴 **The KDS's only source for `pausedUntil` is that field.** ✅ **EXECUTED — both assignments quoted;
   there is no third.**
3. **The dashboard reads `vanPausedUntil` and guards it.** ✅ **EXECUTED.**
4. **Nothing server-side clears `paused_until` but an explicit resume.** ✅ **EXECUTED — Q3's table.**

⚠️ **NOT TESTED ON THE DASHBOARD, per your note — and I am not claiming it was. The conclusion above is
a source read, and item 3 is the claim it would test.**

---

# Q9 — THE ONE CHEAPEST CHECK

# 🔴 QUERY `truck_events` FOR THAT EVENT AND READ `paused_until`.

```
select id, venue_name, paused_until, online_paused_until, last_offline_pause_at
from truck_events where id = '<the event>';
```

**It separates every candidate in one row, and it costs nothing:**

| Result | Reading |
|---|---|
| `paused_until` is a FUTURE timestamp, ~2h out | 🔴 **CONFIRMED.** The pause is live in the database and only the KDS's display reverted — **customers were blocked the whole time**, and the KDS cannot resume it |
| `paused_until` is NULL | 🔴 **A DIFFERENT DEFECT** — something cleared it, and Q3 says nothing should have. The write itself would then be the suspect (`eventId` null → the 400 guard) |
| `paused_until` PAST | ⚠️ an expiry after all — but a 2h pause cannot have expired in a second |
| `online_paused_until` set instead | ⚠️ an offline auto-pause coinciding, unrelated to the tap |

⚠️ **AND IT MUST BE RUN BEFORE ANY FURTHER TAP ON THAT SCREEN. Because `isPaused` is permanently false
there, the next tap sends ANOTHER 2-hour pause rather than a resume, and each one overwrites the
timestamp — so tapping to investigate destroys the evidence of when the first pause was set.**

**NOT PERFORMED. RECOMMENDING NOTHING.**

---

# 🔴 VERIFICATION

| Claim | Method |
|---|---|
| Both callers send an ISO timestamp, not minutes | ✅ **EXECUTED** — both handlers read in full |
| The server writes `truck_events.paused_until` | ✅ **EXECUTED** |
| **`/api/dashboard` hardcodes `truck.paused_until: null`** | ✅ **EXECUTED** — the literal and its comment quoted |
| **The KDS's only pause source is that field** | ✅ **EXECUTED** — both assignments; no third exists |
| The dashboard reads `vanPausedUntil` under `applyPending` | ✅ **EXECUTED** |
| The customer gate reads the EVENT columns | ✅ **EXECUTED** |
| Nothing clears `paused_until` but an explicit resume | ✅ **EXECUTED** — repo-wide scan; the heartbeat paths touch `online_paused_until` only |
| `auto-event-scheduler` never touches a pause | ✅ **EXECUTED** — zero occurrences |
| Neither caller uses `gatedAction`; the `queued` branch is vestigial | ✅ **EXECUTED** — `set_paused` returns `{ success: true }` |
| Every expiry comparison is instant-vs-instant | ✅ **EXECUTED** |
| **That the banner vanished BECAUSE of the handler's refetch** | 🔴 **INFERRED.** It follows from the three executed facts above and matches the ~1s timing, but **no device was watched and no network trace was taken** |
| **That the event is still paused in the database** | ⚠️ **CANNOT BE DETERMINED READ-ONLY — that is Q9** |
| **That the KDS cannot resume** | 🔴 **INFERRED** from `isPaused` being permanently false. **Not exercised** |

🔴 **NOTHING WAS OBSERVED RUNNING. No pause was set, no query was run, no device was touched.**

---

# INTEGRITY

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. A SEPARATE pass over this report AFTER writing. It is the only file
this task wrote.**

```
  docs/event-pause-diagnosis-report.md   (SEPARATE PASS)    21,267  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 40 | 0 | 40 |
| U+2705 WHITE HEAVY CHECK MARK | 38 | 0 | 38 |
| **U+26A0 WARNING SIGN** | **21** | **21** | ✅ **0** |
| U+2717 BALLOT X | 4 | 0 | 4 |
| U+23F8 DOUBLE VERTICAL BAR | 2 | 0 | 2 |
| U+25B6 BLACK RIGHT-POINTING TRIANGLE | 2 | 0 | 2 |

# ✅ EVERY WARNING SIGN IN THIS REPORT IS PAIRED — 21 OF 21, ZERO BARE.

⚠️ **Nothing quoted here carries a bare `U+26A0`** — the KDS page, the dashboard page and the action
route all pair theirs — **so 0 is the correct number rather than a suppressed one.**

✅ **The report's total `U+FE0F` count is 21, which exactly accounts for the 21 paired warning signs and
leaves none attached to any other base.** ✅ **The five unpaired bases are internally consistent — 0 of
40, 0 of 38, 0 of 4, 0 of 2, 0 of 2 — so no base is split across two renderings.** ⚠️ **`U+23F8` and
`U+25B6` are bare because each is inside a verbatim quote of the product's own banner copy —
`⏸ Orders paused` and `▶ Resume orders` — which the source writes bare.

## `git status --porcelain`

```
$ git status --porcelain
 M components/dashboard/OrderCard.tsx
?? docs/event-pause-diagnosis-report.md
?? docs/kds-cook-type-report.md
```

**Which entries were already there before this pass began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`?? docs/event-pause-diagnosis-report.md`** | 🔴 **THIS PASS — the only new entry, and the only file written** |
| `M components/dashboard/OrderCard.tsx` · `?? docs/kds-cook-type-report.md` | ✅ pre-existing — the Cook type task |
