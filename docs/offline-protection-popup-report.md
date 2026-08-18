# Offline protection — does the monitor consult the off switch? Read-only diagnosis

🔴 **NOTHING WAS EDITED EXCEPT THIS FILE.** No commit, stage, revert, stash or clean; no `git stash`,
`checkout` or `restore` — `status` and `show` only. No build, no deploy, no SQL, no schema change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

# 🔴 THE HEADLINE: THE CODE IN THIS REPO DOES CONSULT THE SWITCH — SO THE OBSERVATION AND THE SOURCE DISAGREE, AND ONLY ONE CHECK SEPARATES THE TWO EXPLANATIONS

**`heartbeat-monitor` reads `offline_protection_override` and `continue`s without writing when it is
false.** An event with `offline_protection_override = false` **cannot** be paused by the function as it
is written here. **So either the DEPLOYED function is older than this file, or the override was not
`false` at 11:20:29 and was set false afterwards.** ⚠️ **Q7 names the single line that settles it.**

🔴 **AND ONE THING IS SETTLED WITHOUT ANY CHECK: THE POPUP IS NOT THE PAUSE.** It fires off a durable
marker with **no recency window and no protection-state gate**, ack'd **per device**, so "first load of a
fresh build" is exactly the shape of a replayed old notice. §Q4–Q6.

---

# Q1 — THE MONITOR'S QUERY AND ITS WRITE, IN FULL

```ts
  const { data: stalledVans, error } = await supabase
    .from('truck_vans')
    .select('id, name, auto_pause_on_offline, last_heartbeat_at')
    .eq('active', true)
    .or(`last_heartbeat_at.lt.${staleThreshold},last_heartbeat_at.is.null`)
```
```ts
    const { data: liveEvents } = await supabase
      .from('truck_events')
      .select('id, online_paused_until, offline_protection_override, status, event_date, start_time')
      .eq('van_id', van.id)
      .eq('status', 'open')
```
```ts
      if (ev.online_paused_until && new Date(ev.online_paused_until).getTime() > now.getTime()) {
        continue // still genuinely paused — leave it
      }
      const effective = ev.offline_protection_override !== null && ev.offline_protection_override !== undefined
        ? ev.offline_protection_override
        : (van.auto_pause_on_offline ?? false)
      if (!effective) {
        console.log(`[heartbeat-monitor]     event ${ev.id}: SKIP — offline protection OFF (override=${ev.offline_protection_override}, vanDefault=${van.auto_pause_on_offline})`)
        continue // offline protection off for this event → don't pause
      }
      const { error: updErr } = await supabase
        .from('truck_events')
        .update({ online_paused_until: autoPauseUntil, last_offline_pause_at: now.toISOString() })
        .eq('id', ev.id)
```

🔴 **SAID PLAINLY: YES, IT READS IT, AND IT READS IT BEFORE THE WRITE.** The precedence is
**event override ?? van default ?? false**, and a `false` override beats a `true` van default. **The
write is unreachable for an event whose override is `false`.**

⚠️ **THE VAN-LEVEL FLAG IS DELIBERATELY NOT IN THE STALE-VAN FILTER** — its own comment says so:
*"NOT pre-filtered by `auto_pause_on_offline` — effective offline-protection is decided PER live event
below"*. **So a van with the default off still appears in `staleVans` and still logs**, which is worth
knowing when reading `paused:0` runs: **a run can see stale vans and pause nothing.**

✅ **THE MONITOR IS THE ONLY WRITER OF `last_offline_pause_at` IN THE REPO.** `grep` returns four other
hits and every one is a READ or a comment: `/api/dashboard`'s select and its
`eventLastOfflinePauseAt`, the dashboard's popup comment, and the migration that adds the column.
🔴 **So the 95ms correlation you measured points at this function and at nothing else in this codebase.**

---

# Q2 — WHERE "OFFLINE PROTECTION OFF" IS WRITTEN, AND WHAT IT GATES

**Two columns, two scopes:**

| Column | Scope | Meaning |
|---|---|---|
| `truck_events.offline_protection_override` | 🔴 **ONE EVENT** | `true` = on for this event · `false` = **off for this event** · `null` = **inherit the van** |
| `truck_vans.auto_pause_on_offline` | the van (all its events) | the default when the event says `null`; `?? false` if absent |

**The writer — `app/api/dashboard/action/route.ts:2464`:**

```ts
    if (action === 'set_offline_protection') {
      const { value, eventId } = body
      if (value !== true && value !== false && value !== null) { … 400 … }
      const patch: Record<string, unknown> = { offline_protection_override: value }
      if (value === false) patch.online_paused_until = null // disabling clears the offline pause too
      const { error } = await supabase.from('truck_events').update(patch).eq('id', eventId).eq('truck_id', truck.id)
```

🔴 **NOTE WHAT TURNING IT OFF DOES AND DOES NOT DO: it clears `online_paused_until` — and it does NOT
clear `last_offline_pause_at`.** The durable marker survives the switch being turned off. **That single
line explains your third observation (`online_paused_until` null on every event) sitting beside a marker
old enough to still fire a popup.**

**Every consumer:**

| Consumer | What the switch gates there |
|---|---|
| `supabase/functions/heartbeat-monitor` | 🔴 **THE PAUSE ITSELF** — `if (!effective) continue` |
| `app/api/menu/[truckId]/route.ts:259` | 🔴 **THE CUSTOMER-FACING BLOCK** — `offlinePaused = offlineProtectionEnabled && ev.online_paused_until …`, so with the switch off an existing `online_paused_until` **does not block ordering** |
| `app/dashboard/[token]/page.tsx:1080` | the dashboard's own toggle state (`setEventOfflineOverride`) |
| `app/dashboard/[token]/page.tsx:1756` | the choke point every write to it goes through |
| 🔴 **the popup** | ❌ **NOTHING. It does not read this column at all** — §Q4 |

**So: the switch stops the PAUSE (at the monitor) and the CUSTOMER BLOCK (at the menu route) — and it
does not stop the NOTICE.**

---

# Q3 — THE FLAPPING

**The pause path** is quoted in Q1. **The clear path is `/api/heartbeat` → `clearOfflinePauseForVans`**,
which nulls `online_paused_until` on a returning ping.

**How `1, 0, 1, 0` happens — three mechanisms, and they are not exclusive:**

1. 🔴 **PAUSE, THEN SKIP, THEN A PING CLEARS IT, THEN PAUSE AGAIN.** A run that pauses returns `1`. The
   next run hits `if (ev.online_paused_until && … > now) continue` and returns `0` **for as long as the
   pause stands (2h)**. 🔴 **SO A SECOND `1` WITHIN EIGHT MINUTES PROVES SOMETHING CLEARED IT IN
   BETWEEN** — a heartbeat arriving, or `set_offline_protection(false)`, which also nulls it.
2. **A device that pings and then stops.** ⚠️ **15s pings against a 30s threshold DO produce this**, and
   they need no bug: `setInterval` suspends in a backgrounded WebView, the screen locks, the tab is
   hidden, or the network drops for ~31s. **Ping → clear → suspend → stale → pause → resume → ping →
   clear → suspend.** Every cycle is one `1` and some `0`s.
3. ⚠️ **DIFFERENT VANS ON DIFFERENT RUNS.** `paused` is a COUNT per run, not a per-event flag. **Six
   `1`s could be one van six times or six vans once each** — the return value cannot tell them apart,
   **but the function's own log lines can: they name the van and the event on every pause.**

🔴 **WHAT THE FLAPPING DOES NOT TELL YOU: whether the switch was consulted.** Every one of these
mechanisms is consistent with both explanations in the headline.

---

# Q4 — THE POPUP (DASHBOARD ONLY)

```tsx
      {showOfflinePausedNotice&&(
            <div className="text-3xl mb-2">📡</div>
            <h3 className="font-black text-slate-900 text-base mb-1">Offline protection kept you covered</h3>
            <p className="text-slate-600 text-sm">Orders were paused while your device was offline. Customer orders are active again now.</p>
```

**Component:** none — it is inline JSX in `app/dashboard/[token]/page.tsx:4458`.
🔴 **MOUNT: THE DASHBOARD ONLY. `grep` for it in the KDS returns 0 — the KDS has no copy of this popup,
does not read `lastOfflinePauseAt`, and cannot show or acknowledge it.**

**The one render condition, at `:1186`:**

```tsx
  useEffect(()=>{
    if(typeof window==='undefined') return
    if(!offlinePauseEventId||!lastOfflinePauseAt) return
    const ack=localStorage.getItem(`hg_offline_pause_ack_${offlinePauseEventId}`)
    if(!ack||new Date(lastOfflinePauseAt).getTime()>new Date(ack).getTime()) setShowOfflinePausedNotice(true)
  },[lastOfflinePauseAt,offlinePauseEventId])
```

**Fields read:** `data.lastOfflinePauseAt` (`truck_events.last_offline_pause_at`) and
`data.offlinePauseEventId` (the served event id), both from `/api/dashboard`. **Nothing else.**

🔴 **IS IT GATED ON PROTECTION BEING ON AT DISPLAY TIME? NO. IT DOES NOT READ
`offline_protection_override`, `auto_pause_on_offline` OR `online_paused_until` AT ALL.** A marker
written while protection was on, shown after it was turned off, **fires exactly as if the feature were
still enabled — and its comment says the "always shows" behaviour is deliberate** (*"an operator must
never miss that their orders were paused while away"*), **but that reasoning was written for a device
that was away, not for a feature that has since been switched off.**

⚠️ **AND THE COPY ASSERTS A RECOVERY IT NEVER CHECKED: *"Customer orders are active again now."*** With
the switch off, `online_paused_until` was cleared by the switch rather than by a reconnect — **the
sentence happens to be true, for a different reason than the one it gives.**

---

# Q5 — THE ACK

```tsx
    if(typeof window!=='undefined'&&offlinePauseEventId&&lastOfflinePauseAt)
      localStorage.setItem(`hg_offline_pause_ack_${offlinePauseEventId}`,lastOfflinePauseAt)
```

**`ackOfflinePausedNotice` writes `hg_offline_pause_ack_<eventId>` = the marker's timestamp.**

🔴 **YES, IT IS PER DEVICE — `localStorage`, and per EVENT within that device.** There is no server-side
acknowledgement and no user-level record.

🔴 **SO A FRESH INSTALL, A NEW BUILD THAT CLEARED STORAGE, A DIFFERENT BROWSER, A PRIVATE WINDOW, ANOTHER
DEVICE, OR A CLEARED SITE DATA ALL REPLAY THE NOTICE FOR ANY EVENT WHOSE MARKER IS NON-NULL.** ⚠️ **That
is precisely the shape of "on first load of a fresh build, the operator saw it".**

---

# Q6 — IS IT GATED ON THE PAUSE BEING RECENT OR CURRENT?

🔴 **NEITHER. THERE IS NO WINDOW.** The only comparison is *marker vs this device's ack for that event*.
**A marker from any date fires on a device that has never acked it** — the age of the pause, whether it
has expired, and whether `online_paused_until` is still set are all unread.

⚠️ **THE ONE THING THAT BOUNDS IT IS WHICH EVENT `/api/dashboard` SERVED:** `offlinePauseEventId` is the
selected event, so the notice can only ever be about the event currently on screen. **For your 21 Aug
event that bound is not much of a bound — it will keep firing on every un-acked device until that event
is no longer the served one.**

---

# Q7 — THE ONE CHEAPEST CHECK

🔴 **READ `heartbeat-monitor`'s FUNCTION LOGS FOR THE 11:20:29 RUN.** (NOT PERFORMED.)

**The function logs one of exactly two lines per event, and both print the override AS THE FUNCTION SAW
IT AT THAT INSTANT:**

```
[heartbeat-monitor]     event <id>: SKIP — offline protection OFF (override=false, vanDefault=…)
[heartbeat-monitor]     event <id>: PAUSED until <ts> (van <name> stale; …)
```

- **A `PAUSED` line for that event** ⇒ the override was **not** false when the function read it ⇒
  🔴 **the switch was flipped after 11:20**, and the deployed code is this code.
- **No `SKIP`/`PAUSED` pair matching this file's wording at all** ⇒ 🔴 **the deployed function is an
  older build that predates the gate** ⇒ **the monitor is ignoring the switch.**

⚠️ **One log query answers it. Nothing in the database can, because a column read at 11:20:29 leaves no
trace of its value at 11:20:29.**

---

# ⚠️ SEPARATELY — `auto-event-scheduler` RETURNED 502 FIVE TIMES

**Named, not fixed, and not absorbed into the above.** 11:11:57 · 11:19:59 · 11:24:00 · 11:30:01 ·
11:35:03.

**What that function does when it works:**

```ts
      .eq('auto_open', true)
      .update({ status: 'open', opened_at: timestamp })
      .update({ status: 'closed', closed_at: timestamp })
```

🔴 **A 502 FROM AN EDGE FUNCTION IS A BOOT OR RUNTIME FAILURE — THE PASS DID NOT RUN.** The function's
own error paths return **500** (`return new Response('error', { status: 500 })` in its sibling) or log
and continue; **502 is the platform failing to get a response out of it at all**, so nothing was read
and nothing was written.

**What that means for an event that should have opened:**

- 🔴 **IT STAYS `confirmed`.** No `opened_at`, no `status = 'open'`.
- 🔴 **AND THAT SILENCES OFFLINE PROTECTION FOR IT, BY CONSTRUCTION** — `heartbeat-monitor` only looks at
  `.eq('status', 'open')`. **An event that never auto-opened cannot be offline-paused, however offline
  the van is.**
- ⚠️ **Auto-CLOSE fails the same way**, so a finished event can stay `open` past its end time — and an
  event that is still `open` **remains eligible for offline pausing indefinitely.**
- ⚠️ **The runs are ~4–8 minutes apart, which is not a fixed cadence** — five failures inside 24 minutes
  with successful-looking gaps between them reads as intermittent, not a permanent outage. **Whether any
  run in that window succeeded is in the same logs Q7 asks for.**

---

# WHAT I CANNOT DETERMINE READ-ONLY

- 🔴 **WHETHER THE DEPLOYED `heartbeat-monitor` MATCHES THIS FILE.** This repo's copy has the gate; a
  deployed function is not a file in this tree, and I ran nothing against Supabase.
- 🔴 **WHAT `offline_protection_override` WAS AT 11:20:29.** Its current value is `false`; a column keeps
  no history, and `set_offline_protection` writes no action-log entry (unlike the order actions).
- ⚠️ **Which van produced each of the six `paused:1` runs.** The return value is a count.
- ✅ **What I CAN state from source, without qualification: the popup is dashboard-only, has no recency
  window, is not gated on protection being enabled, is ack'd only in this device's `localStorage`, and
  the durable marker it reads is never cleared by anything — including by turning the feature off.**

---

# INTEGRITY

```
docs/offline-protection-popup-report.md   bytes 15,736
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 29 | 0 | 29 |
| U+26A0 (warning sign — TEXT presentation) | 12 | 12 | 0 |
| U+2705 (check mark button) | 3 | 0 | 3 |
| U+1F4E1 (satellite antenna) | 1 | 0 | 1 |

U+26A0 is the only base here with TEXT presentation used as an emoji, and every occurrence is
PAIRED with U+FE0F. The rest have emoji presentation by default, so bare is correct for them.
NO SOURCE FILE WAS EDITED, so there is no before/after census to report for one.

## Working tree

```
?? docs/offline-protection-popup-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `?? docs/offline-protection-popup-report.md` | 🔴 **THIS TASK — the only file written, and the only entry it created** |
| every `M` entry and every other `??` | ✅ **ALL pre-existing** — earlier tasks this session. 🔴 **THIS TASK EDITED NO SOURCE FILE, and neither edge function is modified** |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
