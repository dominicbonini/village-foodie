# The offline-pause notice — gated on protection, and on recency

**File changed — ONE source file:** `app/dashboard/[token]/page.tsx` 🔴 **(GUSTO'S LIVE PATH)**.
**Also written:** `docs/offline-notice-gate-report.md` (this file).
🔴 **NOTHING UNDER `app/api` WAS TOUCHED. `heartbeat-monitor`, the pause write, the clear path,
`set_offline_protection`, the customer ordering gate, `useHeartbeat` and the KDS are all untouched.**
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore`. **No build, no deploy, no SQL, no migration, no schema change.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# FIX 1 — THE PROTECTION GATE

## 1.1 🔴 THE MONITOR'S EXPRESSION, QUOTED BEFORE REUSING IT

```ts
      const effective = ev.offline_protection_override !== null && ev.offline_protection_override !== undefined
        ? ev.offline_protection_override
        : (van.auto_pause_on_offline ?? false)
```

**Event override wins · `null` inherits the van · absent falls to `false`.**

## 1.2 ONE RESOLUTION ON THIS SURFACE — AND THE FILE HAD TWO ALREADY

```ts
  const effectiveOfflineProtection=eventOfflineOverride!==null?eventOfflineOverride:vanAutoPause
```

🔴 **I DID NOT ADD A THIRD COPY — I REMOVED ONE.** That expression appeared **twice** in this file (the
offline-alert hook at `:1006` and the settings card's toggle) and now appears **once**, hoisted beside
the two state declarations it reads, with **both existing call sites and the notice pointing at it.**
✅ **Its order is the monitor's, link for link.** ⚠️ **The third link, `?? false`, is carried by
`useState<boolean>(false)` on `vanAutoPause` rather than repeated — the value can never be `undefined`
here.**

## 1.3 The gate itself

```ts
    if(!effectiveOfflineProtection) return
```

**One line, before any localStorage read.** 🔴 **A disabled feature can no longer announce that it
acted** — which was true whatever the monitor did, because `set_offline_protection(false)` clears
`online_paused_until` and **deliberately leaves `last_offline_pause_at` behind.**

---

# FIX 2 — THE RECENCY WINDOW

```ts
const OFFLINE_NOTICE_MAX_AGE_MS=24*60*60*1000
```
```ts
    const markerMs=new Date(lastOfflinePauseAt).getTime()
    if(!Number.isFinite(markerMs)||Date.now()-markerMs>OFFLINE_NOTICE_MAX_AGE_MS) return
```

## 🔴 24 HOURS, AND WHY THAT NUMBER

| Requirement | 24h |
|---|---|
| **An operator offline overnight still learns their ordering was paused** | ✅ **Shut at 22:00, opened at 09:00 = 11 hours.** Even a late finish and an early start (23:30 → 07:00, 7.5h) is comfortably inside it, with more than double the margin |
| **They learn it before the next service, not during it** | ✅ A pause from yesterday evening still surfaces when they open up in the morning |
| **A marker from weeks ago never surfaces** | ✅ **Anything beyond one day is silent** — including the case you observed, an old event's marker replaying on a fresh build |
| **Proportionate to what it reports** | ✅ **The pause itself lasts 2 hours** (`AUTO_PAUSE_DURATION_HOURS = 2`), so 24h is already **twelve times** the duration of the thing being reported. Beyond that the notice describes a state the truck has long since left |

⚠️ **WHY NOT LONGER:** 48h or 72h would keep re-firing across a gap in trading — a truck that works
Friday and Sunday would be told on Sunday about Friday. ⚠️ **WHY NOT SHORTER:** 12h fails the
overnight case if an operator finishes at 21:00 and opens at 10:00.

⚠️ **`Number.isFinite` GUARDS A MALFORMED TIMESTAMP** — an unparseable marker yields `NaN`, and `NaN >
x` is false, so without it a bad value would have fallen through to showing the notice. **It now
suppresses, which is the same direction as the other two gates.**

⚠️ **THE CONSTANT IS AT MODULE SCOPE, NOT INSIDE THE COMPONENT** — a const declared in the body is a new
binding every render and `react-hooks/exhaustive-deps` then wants it in the dependency array. **It was
briefly inside, that warning appeared, and moving it out restored the file's exact lint counts.**

---

# FIX 3 — THE PER-DEVICE ACK: REPORTED, NOT CHANGED

```ts
      localStorage.setItem(`hg_offline_pause_ack_${offlinePauseEventId}`,lastOfflinePauseAt)
```

🔴 **UNCHANGED. Per device, per event, as it was.** Here is what per-OPERATOR would take — **described,
and stopped, because every route needs something this brief forbids:**

| Approach | What it needs | Verdict |
|---|---|---|
| A column on `truck_events` — e.g. `offline_pause_ack_at` | 🔴 **A MIGRATION**, plus a write path (a new action) and a read on `/api/dashboard` | 🔴 **STOPPED — schema + API** |
| A per-user ack row (`user_id`, `event_id`, `acked_at`) | 🔴 **A NEW TABLE, RLS, an API to write it** | 🔴 **STOPPED — schema + API** |
| Reuse an existing per-operator store | ⚠️ **There isn't one.** The dashboard authenticates by token + PIN; `actor.actorId` exists **server-side** in the action route, and no client-side per-operator preference store exists on this surface | 🔴 **Not available** |
| Widen the ack to the truck (all devices) via an existing column | 🔴 Still a write path under `app/api` | 🔴 **STOPPED** |

⚠️ **AND ONE HONEST NOTE ON WHETHER IT IS EVEN THE RIGHT FIX:** per-device is arguably correct for this
message. **It tells the person looking at THIS screen that ordering was paused; a second operator on a
second device has not been told anything by the first one's tap.** 🔴 **The defect you observed was
never the per-device ack — it was an un-gated marker with no window. Fixes 1 and 2 close exactly that,
and the ack is left alone.**

---

# 🔴 PIZZERIA GUSTO — WHAT THEIR OPERATOR SEES, BEFORE AND AFTER

| Case | Before | After |
|---|---|---|
| **Protection ON, pause in the last 24h, not yet acked on this device** | notice shows | ✅ **NOTICE SHOWS — unchanged. This is the case the feature exists for and nothing narrows it** |
| **Protection ON, pause older than 24h** | 🔴 notice shows | **silent** |
| **Protection OFF (event override false, or the van default off with no override)** | 🔴 **notice shows — a switched-off feature claiming it acted** | ✅ **silent** |
| **A fresh device / new build, protection ON, recent pause** | notice shows | ✅ **NOTICE SHOWS — deliberately.** A device that has never been told still gets told |
| **A fresh device / new build, old marker** | 🔴 **notice shows — the case you reported** | ✅ **silent** |
| **Already acked on this device** | silent | ✅ silent — unchanged |

🔴 **SUPPRESSING IT WHEN IT SHOULD FIRE IS WORSE THAN SHOWING IT WHEN IT SHOULD NOT, AND BOTH GATES WERE
WRITTEN TO THAT RULE:** they remove the OFF case and the OLDER-THAN-A-DAY case **and nothing else.** The
"always shows, no per-device suppression pref" behaviour the effect's own comment defends is intact for
every live pause.

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint` on the file: 82 errors / 26 warnings = 108 — IDENTICAL to the
count recorded for this file in every task this session.** ⚠️ **It was briefly 109** (one
`exhaustive-deps` warning from the in-component constant); **that is why the constant is at module
scope, and the parity is restored rather than accepted at 109.**

| Required claim | Method |
|---|---|
| No render when protection resolves false | ✅ **EXECUTED (source)** — `if(!effectiveOfflineProtection) return` precedes every other read in the effect. 🔴 **Not rendered — no browser** |
| Still renders for a recent pause with protection on | ✅ **SOURCE READ** — both new guards pass and the original ack comparison is unchanged (`!ack || markerMs > ack`) |
| No render for a marker older than the window | ✅ **SOURCE READ** — `Date.now()-markerMs>OFFLINE_NOTICE_MAX_AGE_MS` returns first |
| The resolution order matches the monitor's | ✅ **EXECUTED (source)** — the monitor's expression is quoted in §1.1 and the dashboard's is the same order; **and the count of that expression in this file went from 2 to 1** |
| The KDS is unaffected | ✅ **EXECUTED** — `grep -c "kept you covered\|lastOfflinePauseAt"` on the KDS returns **0**; the KDS never mounted this notice and is not in the diff |
| Nothing under `app/api` changed | ✅ **EXECUTED** — the diff for this task is one file, `app/dashboard/[token]/page.tsx`. `heartbeat-monitor`, `set_offline_protection`, `/api/menu/[truckId]` and `/api/heartbeat` are untouched |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RENDERED, AND NO NOTICE WAS RAISED OR SUPPRESSED IN A BROWSER.** All six claims are
  source-read or `grep`-verified.
- ⚠️ **This changes only what is DISPLAYED. It does not touch what the monitor writes** — if the deployed
  function is ignoring the switch (the open question from the previous report, settled by one log line),
  **it still is. The marker will still be written; it will simply no longer be announced.**
- ⚠️ **The 24-hour window is a judgement, not a measurement.** No data on how long operators actually
  stay offline was available to me.

---

# INTEGRITY

⚠️ **"BEFORE" is the figure the previous report recorded for this file**; the tree was already dirty and
`checkout` is forbidden. **The census is also checked against `HEAD`.**

```
app/dashboard/[token]/page.tsx
BEFORE   393,662 bytes · 5,058 lines · 53 non-ASCII classes
AFTER    396,735 bytes · 5,093 lines · 53 classes
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 53 before, 53 after; `added-vs-HEAD: none`, `removed: none`.**
**Carrier-aware: `U+26A0` n=88, 86 paired, ⚠️ 2 bare — both pre-existing and neither in this diff.**

## This report — a SEPARATE pass, run AFTER writing

```
docs/offline-notice-gate-report.md   bytes 12,435
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 28 | 0 | 28 |
| U+26A0 (warning sign — TEXT presentation) | 14 | 14 | 0 |
| U+2705 (check mark button) | 18 | 0 | 18 |

U+26A0 is the only base here with TEXT presentation used as an emoji, and every occurrence is
PAIRED with U+FE0F. U+1F534 and U+2705 have emoji presentation by default, so bare is correct.

## Working tree

```
 M app/dashboard/[token]/page.tsx
?? docs/offline-notice-gate-report.md
?? docs/offline-protection-popup-report.md
```

🔴 **THE TREE IS SHORT BECAUSE YOU COMMITTED MID-TASK, NOT BECAUSE ANYTHING WAS CLEANED.** `git log`
now reads `fa72f9a "scroll bar"` over `dcb8862 "KDS and other fixes"` over `7672bae`, where it was
`7672bae` when this task began. **Two commits arrived from your terminal while I worked; I ran no
commit, stage, stash, checkout or restore, and `git stash list` is empty.**

| Entry | Pre-existing? |
|---|---|
| 🔴 `M app/dashboard/[token]/page.tsx` | 🔴 **THIS TASK — the only source file written.** ⚠️ It was `M` before this task too, but everything that made it `M` has since been committed in `dcb8862`/`fa72f9a`, so **this `M` is now THIS TASK'S EDIT AND NOTHING ELSE** |
| 🔴 `?? docs/offline-notice-gate-report.md` | 🔴 **THIS TASK** — this file |
| `?? docs/offline-protection-popup-report.md` | ✅ **pre-existing — the read-only diagnosis this task acts on** |
| everything else that was dirty this session | ✅ **now committed by you** — the KDS phone-header arc, the van-count field, the payment-method work, the landing pages, the manual's V11.26 update and the Add-order fixes are all in `dcb8862`/`fa72f9a` |

⚠️ **ONE CONSEQUENCE, STATED: the census figures above were measured against the OLD `HEAD` (`7672bae`)
before those commits landed.** They were correct then and remain correct now — **`added-vs-HEAD: none`
only gets more trivially true once the intermediate work is in `HEAD`** — but a re-run today compares
against a different baseline than the one named.

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
