# The offline-pause notice across devices

**READ ONLY. Nothing changed except this file.** No fix, no schema proposed. `next dev` / `next build`
were not run. **Surface: `app/dashboard/[token]/page.tsx` — the DASHBOARD. The KDS is a near-duplicate and
was checked only for whether it carries this notice at all (§5); nothing here describes its behaviour.**

# 🔴 THE SHORT ANSWER

**The acknowledgement is `localStorage` and nothing else, so it is per-device by construction.** The
notice compares the server's incident marker against *this device's* stored ack — a device that never
acked has no ack to find, so it fires. ✅ **It is bounded: 24 hours, and only while offline protection is
ON.** So the iPhone showed it because that phone had not acked, and the incident was under a day old.

🔴 **A CORRECT FIX NEEDS SERVER-SIDE STATE. THERE IS NO COLUMN FOR IT TODAY**, and the code already says
so in a comment. ⚠️ **BUT THE CHEAP NEAR-FIX YOU SUGGESTED WOULD BREAK A DELIBERATE DESIGN INTENT** — §7
is the part to read before deciding, because the code argues explicitly for the behaviour you saw.

---

## 1 · The notice and every condition that renders it

**READ — `app/dashboard/[token]/page.tsx`, the effect that raises `showOfflinePausedNotice`:**

```tsx
  useEffect(()=>{
    if(typeof window==='undefined') return
    if(!offlinePauseEventId||!lastOfflinePauseAt) return
    if(!effectiveOfflineProtection) return
    const markerMs=new Date(lastOfflinePauseAt).getTime()
    if(!Number.isFinite(markerMs)||Date.now()-markerMs>OFFLINE_NOTICE_MAX_AGE_MS) return
    const ack=localStorage.getItem(`hg_offline_pause_ack_${offlinePauseEventId}`)
    if(!ack||markerMs>new Date(ack).getTime()) setShowOfflinePausedNotice(true)
  },[lastOfflinePauseAt,offlinePauseEventId,effectiveOfflineProtection])
```

**Five conditions, all of which must hold:**

| # | Condition | Source |
|---|---|---|
| 1 | `offlinePauseEventId` non-null | from `/api/dashboard` |
| 2 | `lastOfflinePauseAt` non-null | `truck_events.last_offline_pause_at`, written only by `heartbeat-monitor` |
| 3 | `effectiveOfflineProtection` true | 🔴 **GATE 1** — *"A DISABLED FEATURE MUST NOT ANNOUNCE THAT IT ACTED"* |
| 4 | marker age ≤ `OFFLINE_NOTICE_MAX_AGE_MS` | 🔴 **GATE 2** — `const OFFLINE_NOTICE_MAX_AGE_MS=24*60*60*1000` |
| 5 | **no ack, OR marker newer than the ack** | 🔴 **THE PER-DEVICE PART** |

⚠️ **THE SAME KEY ALSO DRIVES A SECOND CONTROL — an inline block, not just the popup**, with the opposite
sense and the same rule:

```tsx
    const ack=localStorage.getItem(`hg_offline_pause_ack_${offlinePauseEventId}`)
    setOfflinePauseAcked(!!ack&&markerMs<=new Date(ack).getTime())
```

> *"⚠️ DELIBERATELY THE SAME KEY AS THE POPUP, WHICH COUPLES THEM: acknowledging either one dismisses both
> for THAT incident."*

## 2 · The acknowledgement — 🔴 `localStorage` ONLY

**Both writers, READ:**

```tsx
  const dismissOfflinePauseBlock=()=>{
    if(typeof window!=='undefined'&&offlinePauseEventId&&lastOfflinePauseAt)
      localStorage.setItem(`hg_offline_pause_ack_${offlinePauseEventId}`,lastOfflinePauseAt)
```
```tsx
  const ackOfflinePausedNotice=()=>{
    if(typeof window!=='undefined'&&offlinePauseEventId&&lastOfflinePauseAt)
      localStorage.setItem(`hg_offline_pause_ack_${offlinePauseEventId}`,lastOfflinePauseAt)
```

| | |
|---|---|
| **What is written** | the incident timestamp (`last_offline_pause_at`), **not a boolean** |
| **Where** | 🔴 **`localStorage`. NOT Capacitor Preferences. NOT both. No API call** |
| **Keyed on** | the **event id** — `hg_offline_pause_ack_<eventId>` |

✅ **PER-DEVICE BY CONSTRUCTION, AND DELIBERATELY SO.** The code states the reasoning for its sibling:
*"Per device is right for both: it records that THIS operator, on THIS screen, has seen it."*

⚠️ **STORING THE TIMESTAMP RATHER THAN A BOOLEAN IS WHAT MAKES A LATER INCIDENT RE-FIRE** — confirming
your established fact: *"the monitor writes a fresh `last_offline_pause_at` on every pause, so
`marker > ack` becomes true again."*

⚠️ **AND `localStorage` IS WEAKER THAN IT LOOKS INSIDE THE iOS SHELL.** This codebase records elsewhere
that a cold kill can clear it while Preferences survives — *"the window where localStorage was cleared by
a cold kill but Preferences still holds the real value"*. **So the same device can lose its own ack.**
⚠️ **CANNOT DETERMINE whether that happened here;** it would look identical to the cross-device case.

## 3 · 🔴 WHY A DEVICE THAT WAS NOT OPEN SHOWS IT

**It compares the marker against THIS DEVICE'S STORED ACK — never against a session start, and never
"render whenever non-null".**

```tsx
    const ack=localStorage.getItem(`hg_offline_pause_ack_${offlinePauseEventId}`)
    if(!ack||markerMs>new Date(ack).getTime()) setShowOfflinePausedNotice(true)
```

🔴 **`!ack` IS THE WHOLE ANSWER.** A device that was closed during the incident has no key for that event,
so the first branch is true on its first load. **The iPad's dismissal wrote to the iPad's `localStorage`
and the iPhone has no way to see it.**

✅ **IT WOULD NOT FIRE INDEFINITELY.** Gate 2 bounds it: **24 hours from the incident**, after which every
fresh device stops showing it for ever. **It fires once per device within that window, then never again
for that incident on that device.**

⚠️ **THE FIRING IS TIED TO THE DATA ARRIVING, NOT TO A POLL LOOP** — the effect's deps are
`[lastOfflinePauseAt, offlinePauseEventId, effectiveOfflineProtection]`, so it evaluates when
`/api/dashboard` delivers the marker.

## 4 · The age bound

**READ:** `const OFFLINE_NOTICE_MAX_AGE_MS=24*60*60*1000` — and the reasoning is written out:

> *"🔴 GATE 2 — A WINDOW, BECAUSE ANY NON-NULL MARKER USED TO FIRE HOWEVER OLD. 24 hours: an operator who
> shut the laptop at 22:00 and opens it at 09:00 (11h) still learns their ordering was paused… a marker
> from the previous week, or from an event that has since been re-run, never surfaces. The pause itself
> lasts 2h, so 24h is already twelve times the thing it reports on."*

✅ **Your three-day-old stamp on a closed event: NO. A fresh device would NOT show it.** ⚠️ **The event's
own status is not consulted — only the marker's age**, so a closed event inside 24h still surfaces.

## 5 · 🔴 THE SAME SHAPE ELSEWHERE — THIS IS A CLASS, NOT ONE CONTROL

**`grep -rno "hg_[a-z_]*\(ack\|dismiss\|seen\|intro\)[a-z_]*"` over `app lib components`:**

| Key | Where | Store | Same shape? |
|---|---|---|---|
| `hg_offline_pause_ack_<eventId>` | dashboard | localStorage | — the subject |
| 🔴 `hg_breach_ack_<eventId>` | dashboard, capacity-breach banner | localStorage | ✅ **YES — and it says so: "THE PATTERN IS THE OFFLINE-PAUSE NOTICE'S, COPIED RATHER THAN INVENTED"** |
| `hg_demo_seen_orders_<token>` | dashboard, demo | localStorage | ⚠️ Demo-only |
| `hg_demo_kds_intro_<token>` | **KDS**, demo | localStorage | ⚠️ Demo-only |
| `hg_outbox_conflict_ack` | `lib/native/outbox.ts` | ⚠️ **Capacitor Preferences, not localStorage** | ✅ Same idea, **different store** |

🔴 **SO THERE ARE TWO OPERATOR-FACING INSTANCES OF EXACTLY THIS PATTERN** — the offline-pause notice and
the capacity-breach banner — **and the breach one stores a SIGNATURE rather than a timestamp so a worse
breach re-fires.** ⚠️ **Anything done to one should be considered for the other**, or they diverge.

⚠️ **The KDS does NOT carry the offline-pause notice** — its only `hg_*` ack key is the demo intro.
**Read only far enough to establish that; nothing else about the KDS is claimed.**

## 6 · Server-side state that exists today

**Reporting what is THERE. No schema proposed.**

| What exists | Shape | Could it carry an ack? |
|---|---|---|
| `truck_events.last_offline_pause_at` | timestamptz, per event | ⚠️ It is the INCIDENT marker; there is **no matching ack column** |
| `van_devices` (`20260701_van_devices.sql`) | one row per device, natural key `device_id` | ✅ **Per-device server state already exists and is already identified** |
| `device_notification_prefs` (`20260728…`) | `(device_id, type)` → `enabled`, FK to `van_devices` | ✅ **A per-device, per-type settings table with a live write path** |
| `truck_events` per-event override columns | `online_paused_until`, `offline_protection_override`, … | ⚠️ Event-scoped settings, written by `/api/dashboard/action` |

🔴 **NOTHING TODAY STORES "SOMEBODY ACKNOWLEDGED INCIDENT X".** ✅ **But the two things a server-side ack
would need already exist: a per-event identity (`last_offline_pause_at`) and a settings write path on
`truck_events` that the dashboard already uses.**

⚠️ **AND THE CODE ALREADY CONCEDES THIS, in the effect's own comment:**

> *"⚠️ THE PER-DEVICE ACK IS UNCHANGED — see the report: making it per-operator needs a column or an API
> change, and neither was built."*

## 7 · 🔴 THE CHEAPEST CHANGES, AND THE HONEST DIFFERENCE

### Fully satisfies: a server-side acknowledgement — **needs a column**

A truck-level or event-level "acknowledged up to" timestamp, written on dismiss and compared instead of
(or as well as) the local one. **One column, one write in the existing action route, one field on the
existing `/api/dashboard` response.** ⚠️ **It also changes the meaning: "somebody on this truck cleared
it" rather than "this screen has seen it" — which is what you asked for, and is NOT what the breach
banner's comment argues for.**

### Mostly satisfies with no server state: bound by session start

**Show the notice only when the marker is newer than this device's session/page-load time.** ✅ **It
removes exactly the annoyance you saw** — a device opening later cannot replay an incident that ended
before it started — **and costs one `useRef(Date.now())` and one comparison.**

🔴 **BUT IT CONTRADICTS A STATED DESIGN INTENT, AND I AM NOT GOING TO SLIDE PAST THAT.** Gate 2's comment
exists to preserve precisely the case session-bounding would remove:

> *"an operator who shut the laptop at 22:00 and opens it at 09:00 (11h) still learns their ordering was
> paused, and so does one who opens the next morning before service"*

**and the effect's own header says:**

> *"ALWAYS shows (no per-device suppression pref — an operator must never miss that their orders were
> paused while away)"*

⚠️ **SO SESSION-BOUNDING IS NOT A SMALLER VERSION OF THE SERVER FIX. It is a different decision:** it
trades "a second device repeats a handled notice" for "a device that was closed during the incident is
never told at all". **On a two-device truck where both are usually open, that trade is probably fine —
which is your call, not mine.**

⚠️ **A THIRD OPTION EXISTS AND IS THE SMALLEST OF ALL, though it fixes less:** move the ack from
`localStorage` to **Capacitor Preferences**, as `hg_outbox_conflict_ack` already does. **It fixes nothing
across devices** — but it removes the cold-kill loss noted in §2, so the *same* device stops re-asking.
**Only worth anything if what you actually saw was one device forgetting, which §2 says is
indistinguishable from here.**

---

## Marking summary

| Claim | Status |
|---|---|
| The five render conditions, quoted | ✅ **READ** |
| The ack is localStorage only, keyed on event, storing a timestamp | ✅ **READ** — both writers quoted |
| `!ack` is why a fresh device fires | ✅ **READ** |
| The 24h bound, and no event-status check | ✅ **READ** — constant and comment quoted |
| Two operator-facing instances of the pattern | ✅ **READ** — the breach banner says it copied this one |
| The KDS does not carry this notice | ⚠️ **INFERRED FROM ABSENCE** — key search only; the KDS was not read in full |
| The server-side state that exists | ✅ **READ** — migrations named |
| **That the iPhone fired for the reason above** | ⚠️ **INFERRED.** Consistent with the code, but **UNOBSERVED**. ⚠️ **A cold-kill wipe of that phone's own localStorage would look identical.** What would settle it: on the iPhone, check whether `hg_offline_pause_ack_<eventId>` exists now — it will, since you dismissed it; the question is whether it existed before |
| Which fix is right | ⚠️ **A DECISION, NOT A FINDING. Presented, not chosen** |

**Surfaces:** the **dashboard** was read; the **KDS** only for the presence of ack keys; `lib/native/outbox.ts`
for the Preferences-backed sibling. **No behaviour of one is claimed of another.**

**No instruction contradicted another, and no span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. ⚠️ **This report is
the only file written** — nothing else was touched. The result, the non-ASCII census and the
carrier-aware per-base variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
