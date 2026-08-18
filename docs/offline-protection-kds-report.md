# Offline protection on the KDS — read-only diagnosis

**READ-ONLY. Nothing was edited, created or deleted except this report.** No commit, no build, no
`next dev`, no `next build`, no `cap sync`, no deploy, no SQL, no database write. NO `git stash`,
`checkout` or `restore` — only `status`, `grep` and file reads.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

# THE PREMISE IS FALSE, AND THAT IS THE FINDING: THE KDS DOES SEND A HEARTBEAT.

**READ — `app/dashboard/[token]/kds/page.tsx:848-868`, in full:**

```tsx
  useEffect(() => {
    if (!activeEventLive) return
    const sendHeartbeat = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      try {
        await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, vanId: vanId || undefined }),
        })
      } catch {}
    }
    sendHeartbeat() // immediate ping on the confirmed->open flip
    const heartbeatInterval = setInterval(sendHeartbeat, 15000)
    return () => { clearInterval(heartbeatInterval) }
  }, [token, vanId, activeEventLive])
```

**The KDS is NOT absent from the mechanism.** It emits the same 15-second ping to the same endpoint
with the same body shape as the dashboard. **So "the KDS's absence is being read as an offline
device" is not the explanation — the explanation has to be about WHEN its heartbeat starts.**

# THE LEADING EXPLANATION: BOTH SURFACES GATE THE HEARTBEAT ON `activeEventLive`, AND THE KDS TAKES LONGER TO RESOLVE IT. THIRTY SECONDS IS THE WHOLE BUDGET.

INFERRED, from four READ facts:

1. **The switch is a client navigation** — `router.push('/dashboard/${token}/kds…')`
   (`page.tsx:1302`). The dashboard component **unmounts**, so its effect cleanup runs and
   `clearInterval` stops the ping **immediately**.
2. **The KDS's ping is gated `if (!activeEventLive) return`**, and `activeEventLive` is
   `activeEvent?.status === 'open'` where `activeEvent = events.find(e => e.id === selectedEventId)`.
3. **`events` arrives from a SECOND round trip made INSIDE `fetchAll`** — `/api/events/manage?upcoming=true`,
   issued only after the `/api/dashboard` response has been parsed. Until it lands, `events` is `[]`,
   `activeEvent` is null, `activeEventLive` is false, **and the effect returns without arming anything.**
4. **The monitor's threshold is 30 seconds** — READ, `supabase/functions/heartbeat-monitor/index.ts:24`:
   `const STALE_THRESHOLD_SECONDS = 30`.

**So the gap between the dashboard's last ping and the KDS's first one is: navigation + PIN/auth +
`/api/dashboard` + `/api/events/manage` + a render. If that exceeds 30 seconds — a cold KDS mount on a
slow connection, a PIN prompt, or an events fetch that fails and leaves `events` empty — the van is
stale and the next monitor run pauses ordering.** INFERRED; not observed.

# Q1 — THE MECHANISM, END TO END

| Step | Where | READ |
|---|---|---|
| Emit | both surfaces, `setInterval(sendHeartbeat, 15000)` | quoted above |
| Receive | `app/api/heartbeat/route.ts` | stamps `truck_vans.last_heartbeat_at` |
| Decide stale | `supabase/functions/heartbeat-monitor/index.ts:24-38` | `last_heartbeat_at.lt.<now-30s>` **OR `is.null`** |
| Write the pause | the monitor | `truck_events.online_paused_until = now + 2h`, plus `last_offline_pause_at` |
| Customer gate | `app/api/menu/[truckId]/route.ts` and `app/api/orders/submit/route.ts` | read the EVENT's `paused_until` / `online_paused_until` |

**Authoritative:** `truck_events.online_paused_until` — it is what the customer gate reads.
`last_offline_pause_at` is a **durable display/forensics marker** for the dashboard's one-time popup
and is never consulted by the gate. `truck_vans.last_heartbeat_at` is the input, not the state.

# Q2 — THE EMITTERS, AND WHAT STOPPING LOOKS LIKE

| Surface | Emitter | Guard | Mount |
|---|---|---|---|
| **Dashboard** | `page.tsx:1211-1223` | `if(!activeEventLive)return` | deps `[token,vanId,activeEventLive,deviceOnline]` |
| **KDS** | `kds/page.tsx:848-868` | `if (!activeEventLive) return` | deps `[token, vanId, activeEventLive]` |
| Manage | `manage/[token]/page.tsx:337` | — | exists so a dashboard->Manage switch does not stop the only heartbeat |

**Both skip the ping when `!navigator.onLine`.**
**YES — STOPPING IS WHAT THE SERVER INTERPRETS AS OFFLINE.** The monitor has no concept of a device;
it reads one timestamp per van and compares it to `now - 30s`. **An unmounted interval and a dead
device are indistinguishable to it.**

⚠️ **The dashboard carries `deviceOnline` in its deps and the KDS does not** — so an offline->online
transition re-arms the dashboard's ping immediately and the KDS's only on the next 15s tick.

# Q3 — THE RESUME PATH

**A returning heartbeat clears it, not a cron.** READ, `app/api/heartbeat/route.ts:19-25`:

```ts
async function clearOfflinePauseForVans(vanIds: string[]) {
  if (vanIds.length === 0) return
    .update({ online_paused_until: null })
    .in('van_id', vanIds)
    .not('online_paused_until', 'is', null)
```

**So an operator sitting on the KDS is paused only until its next successful ping — at most ~15
seconds after `activeEventLive` becomes true. It SELF-CLEARS and does not require returning to the
dashboard.** ⚠️ **But the DASHBOARD's display clears instantly via `offlinePausedDisplay`, and the KDS
has no equivalent — see Q6/Q8.**

# Q4 — THE VAN AXIS

**The heartbeat is VAN-scoped in the table and TRUCK-scoped in the no-van branch.** READ:

- **KDS:** `const vanId = searchParams.get('van_id') ?? ''` (`:85`) — so it sends a van id **only when
  the URL carries one**. `router.push` adds `van_id` **only on native** (`page.tsx:1296-1302`).
- **Dashboard:** identical source (`page.tsx:192`), and in practice usually empty.
- **Route, no vanId:** stamps **ALL the truck's active vans** and clears their pauses.
- **Route, with vanId:** looks the van up by `kds_token` first, then **falls back to `dashboard_token`
  and verifies the van belongs to that truck** — so a KDS on the dashboard token still stamps.

# THE SCOPE CHANGES WITH THE SURFACE, AND NOT BY DESIGN: a dashboard ping refreshes EVERY van; a KDS ping opened with `?van_id=` refreshes ONE. On a multi-van truck, moving to a van-scoped KDS stops refreshing the other vans — INFERRED, and a second candidate worth separating from the first.

# Q5 — NATIVE vs WEB

| | Dashboard | KDS |
|---|---|---|
| `navigator.onLine` skip | yes | yes |
| `deviceOnline` in deps | **yes** | **no** |
| Native foreground re-ping | **yes** — `onAppResume` (`page.tsx:1196-1200`) | **NO EQUIVALENT FOUND** |
| `?van_id=` on the link | — | native only |

# BACKGROUNDING: A BACKGROUNDED APP IS INDISTINGUISHABLE FROM AN OFFLINE ONE.

`setInterval` is throttled or suspended in a backgrounded WebView, so the ping stops and the van goes
stale in 30 seconds. **The dashboard has a foreground re-ping to recover fast; the KDS does not** —
INFERRED from its absence in the file. **A sleeping kitchen iPad pausing a truck's ordering is
therefore a live risk on the KDS specifically, and it is the reason the keep-screen-on control exists.**

# Q6 — THE DASHBOARD'S GATING

```tsx
  const offlinePausedDisplay=offlinePaused&&!(deviceOnline&&activeEventLive)
  const paused=manualPaused||offlinePausedDisplay
  const pauseReason:'manual'|'offline'|null=manualPaused?'manual':offlinePausedDisplay?'offline':null
```

**Inputs:** `offlinePaused` = `isFuturePause(vanOnlinePausedUntil)` (server truth) · `deviceOnline` =
`navigator.onLine` + online/offline listeners · `activeEventLive` = the resolved event is `'open'`.

- **Surface-agnostic:** `isFuturePause`, the server value, and `activeEventLive` — the KDS has all three.
- **Dashboard-specific:** `deviceOnline` — **the KDS has no such state.** It has `isOffline` from the
  outbox's reachability, which is a different signal for a different job.

# Q7 — WHAT IS ALREADY SHARED

| Module | Dashboard | KDS | Extractable? |
|---|---|---|---|
| `/api/heartbeat` endpoint | ✅ | ✅ | already shared |
| the 15s emitter effect | inline | **inline, near-duplicate** | **the `useGatedActionResult` case, not the `applyPending` case** — it closes over `token`, `vanId` and `activeEventLive` only, touches no shared ref, and has no call sites beyond its own effect |
| `offlinePausedDisplay` | inline | absent | needs a `deviceOnline` equivalent first |
| `gatedAction` / outbox / `OfflineBanner` | ✅ | ✅ | ⚠️ **a DIFFERENT mechanism — reachability for queuing writes, not for pausing ordering** |

# Q8 — WHAT THE OPERATOR SEES

- **Dashboard:** a red banner with minutes remaining and `(device offline)`, an inline **Resume**
  button, and a one-time popup driven by `lastOfflinePauseAt` / `offlinePauseEventId`.
- **KDS:** its banner is driven by `isPaused`, which reads **`vanPausedUntil` only** — the MANUAL
  column. `vanOnlinePausedUntil` was **deliberately excluded** in the V11.24 pause fix.

# SO THE KDS SHOWS NOTHING AT ALL WHEN OFFLINE PROTECTION FIRES. Ordering is paused for customers and the kitchen screen looks normal. That is the worst half of this report.

# Q9 — THE ONE CHEAPEST CHECK

```sql
select id, online_paused_until, last_offline_pause_at from truck_events where id = '<the event>';
select id, name, last_heartbeat_at, now() - last_heartbeat_at as age from truck_vans where truck_id = '<truck>' and active;
```

**The `age` column separates every candidate in one row.** If a van's age exceeds 30s while the KDS is
open and its event is live, the gate never armed (candidate 1). If one van is fresh and others are
stale, it is the van-scope narrowing (candidate 2). If all are fresh but `online_paused_until` is set,
the pause predates the switch and nothing about the KDS caused it.

⚠️ **`net._http_response` IS THE WRONG TABLE.** `heartbeat-monitor` is a Supabase **Edge Function**
invoked by cron, so its own traffic appears there — but the **heartbeat** is a browser `fetch` to a
Next.js route on Vercel and never passes through `pg_net`. **A dispatch is not a result:** rows there
would tell you the monitor RAN, never that a device pinged.

**NOT PERFORMED. RECOMMENDING NOTHING.**

# VERIFICATION

| Claim | Method |
|---|---|
| The KDS sends a heartbeat | ✅ **READ** — quoted in full |
| Both gate on `activeEventLive` | ✅ **READ** — both effects quoted |
| 30-second threshold | ✅ **READ** — `STALE_THRESHOLD_SECONDS = 30` |
| A returning ping clears the pause | ✅ **READ** — `clearOfflinePauseForVans` |
| The KDS shows nothing for an offline pause | ✅ **READ** — `isPaused` reads `vanPausedUntil` only |
| The dashboard has a foreground re-ping and the KDS does not | ✅ **READ** — present at `page.tsx:1196`, absent from the KDS |
| **That the switch gap exceeds 30s in practice** | 🔴 **INFERRED. No device was watched, no query was run, no timing was measured.** |
| **That van-scope narrowing occurs** | 🔴 **INFERRED** — it requires `?van_id=`, which is native-only |

**NOTHING WAS OBSERVED RUNNING.**

# INTEGRITY

## Byte-level scan — SEPARATE pass over this report AFTER writing

**Byte-level tool (Python over `open(…,'rb')`), never grep. It is the only file this pass wrote.**

```
  docs/offline-protection-kds-report.md   13,135 bytes
  NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
TOTAL OFFENDING: 0
```

## Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 | 2 | 0 | 2 |
| U+2705 | 10 | 0 | 10 |
| **U+26A0** | **4** | **4** | **0** |

`U+1F534` and `U+2705` have **emoji presentation by default** — bare is correct for both.
**`U+26A0` is the only TEXT-presentation base here**, and **every one of its 4 occurrences is
PAIRED — 4 OF 4, ZERO BARE.** **No other emoji-presentation base occurs in this report.**
The total `U+FE0F` count is 4, which exactly accounts for the 4 paired warning signs.

## `git status --porcelain`

```
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M docs/privacy-manifest-report.md
 M docs/reference-manual.md
?? docs/add-order-overflow-fix-report.md
?? docs/add-order-overflow-report.md
?? docs/event-actions-rename-report.md
?? docs/kds-copy-apply-report.md
?? docs/kds-screen-on-header-report.md
?? docs/offline-protection-kds-report.md
```

**Which entries were already there before this pass began:**

| Entry | Pre-existing? |
|---|---|
| **`?? docs/offline-protection-kds-report.md`** | **THIS PASS — the only new entry, and the only file written** |
| everything else | **ALL pre-existing** — the source files and reports from earlier tasks this session, including `M docs/reference-manual.md` and `?? docs/kds-event-isolation-report.md` |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
