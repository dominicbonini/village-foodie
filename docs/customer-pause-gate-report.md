# The customer page and the offline pause — the gate still reads the column

🔴 **NOTHING WAS EDITED EXCEPT THIS FILE.** No commit, stage, revert, stash or clean; no `git stash`,
`checkout` or `restore`. No build, no deploy, no SQL.

**No span of the prompt arrived garbled.** **Every claim is READ (quoted) or INFERRED.**
**The API and the client are reported separately.**

# 🔴 THE HEADLINE: THE GATE IS INTACT, THE MODE WORK NEVER TOUCHED IT, AND THE LIKELIEST CAUSE IS THE CLIENT — BUT I CANNOT PROVE IT READ-ONLY

---

# THE API

## Q1 — THE GATE, QUOTED

```ts
      let vanAutoPause = false
      if (ev.van_id) {
        const { data: van } = await supabase.from('truck_vans').select('auto_pause_on_offline').eq('id', ev.van_id).single()
        vanAutoPause = van?.auto_pause_on_offline ?? false
      }
      const offlineProtectionEnabled =
        ev.offline_protection_override !== null && ev.offline_protection_override !== undefined
          ? ev.offline_protection_override
          : vanAutoPause

      const manualPaused = ev.paused_until ? new Date(ev.paused_until) > new Date() : false
      const offlinePaused = offlineProtectionEnabled && ev.online_paused_until
        ? new Date(ev.online_paused_until) > new Date()
        : false

      if (offlinePaused) { isPaused = true; pauseReason = 'offline' }
      if (manualPaused) { isPaused = true; pauseReason = 'manual' }
```

✅ **IT READS `online_paused_until`, AND FOR YOUR EVENT EVERY TERM RESOLVES TO PAUSED:**
`offline_protection_override = true` ⇒ `offlineProtectionEnabled = true`; `online_paused_until` is two
hours in the future ⇒ `offlinePaused = true` ⇒ `isPaused`, `pauseReason = 'offline'`.
🔴 **THE COLUMNS IT READS: `van_id`, `paused_until`, `online_paused_until`,
`offline_protection_override`, plus `truck_vans.auto_pause_on_offline`.**

## Q3 / Q4 — 🔴 THE MODE WORK DID NOT TOUCH THIS FILE, AND THE GATE IS **NOT** CONDITIONED ON THE MODE

✅ **EXECUTED — `git diff f9c6972~1 HEAD --stat -- app/api/menu/` produces NOTHING; the last commit to
touch that directory is `f7aed6c "payment fix again"`, which predates the mode work.** **The mode
changes landed in `heartbeat-monitor`, `/api/heartbeat` and `/api/orders/submit` only.**

🔴 **SO THE GATE STILL SAYS "protection on AND a live `online_paused_until` ⇒ paused", with no mode
term at all** — which is correct for mode `'pause'` and, ⚠️ **INFERRED, would be WRONG for mode
`no_auto_accept` if the monitor ever wrote `online_paused_until` in that mode (it does not — it writes
`offline_no_autoaccept_until` instead). Not your case, and not a defect today.**

## ⚠️ THE ONE API-SIDE CANDIDATE I CANNOT EXCLUDE: WHICH EVENT THE ROUTE RESOLVES

```ts
      .in('status', ['open', 'confirmed'])
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(1)
      .maybeSingle()
    effectiveEventId = openEvent?.id ?? null
```
🔴 **WITHOUT AN `event_id` PARAM THE ROUTE PICKS THE EARLIEST UPCOMING `open`-OR-`confirmed` EVENT — and
a `confirmed` event on an earlier date OUTRANKS your open 21 August one.** ⚠️ **If a customer opened the
page with no event id and another event sorted first, the gate would read THAT event's columns — where
`online_paused_until` is null — and correctly show no pause. **INFERRED: this is the strongest
server-side candidate and it needs one query to confirm or kill.**

## Q2 — SUBMIT
⚠️ **The submit route's own pause guard is EVENT-scoped and reads the same columns** — its comment says
*"Pause is EVENT-scoped — the per-event guard below reads `truck_events.paused_until` /
`online_paused_until`"*. 🔴 **So a paused event should be REJECTED server-side, not merely hidden.**
**That an order could still be PLACED is therefore evidence the request resolved a DIFFERENT event, or
that the deployed build differs — it is not explained by the UI alone.**

---

# THE CLIENT

## Q5 — WHAT IT RENDERS AND WHEN IT REFETCHES

```tsx
  const isPaused = !!truck?.paused
  const isOrderingBlocked = isPaused || isClosed || orderingTimeNotSet
```
```tsx
          setTruck(data.truck) // refresh paused/pauseReason/ordering_available; basket untouched
```
🔴 **THERE IS NO PAUSE POLL.** The 30-second interval is a **clock tick only** — its own comment says
*"re-derive ASAP + the selectable list every 30s WITHOUT refetching"*. `refetchMenu` runs on load and
from the banner's own "check again" button.

🔴 **SO AN ALREADY-OPEN CUSTOMER PAGE NEVER PICKS UP A PAUSE ON ITS OWN — not after 30 seconds, not
after an hour. It needs a reload or that button.** ⚠️ **INFERRED, AND IT MATCHES YOUR OBSERVATION
EXACTLY: the pause was written one minute before you looked; any page opened before that shows no
notice and will happily submit — and the submit call is where the server should refuse it.**

## Q6 — THE COMPARISON IS SERVER-SIDE AND TIMEZONE-SAFE
```ts
        ? new Date(ev.online_paused_until) > new Date()
```
✅ **Both sides are evaluated in the API route on the server: a `timestamptz` parsed to an absolute
instant, compared to the server's own `now`.** 🔴 **No device clock and no local-time formatting are
involved, so the BST class of error this session recorded does NOT apply here.**

---

# Q7 — THE ONE CHEAPEST CHECK

🔴 **OPEN THE CUSTOMER PAGE FRESH — A NEW TAB OR A HARD RELOAD — AND SEE WHETHER THE PAUSE NOTICE
APPEARS.** (NOT PERFORMED.)

- **It appears ⇒ the gate reads the column correctly and the page you were looking at was STALE (Q5).
  Nothing is broken server-side.**
- **It does not ⇒ the gate is not seeing this event: check which `event_id` the page requested and
  whether an earlier `confirmed` event outranks it in that fallback query.**

⚠️ **One reload, no database access, and it splits the two candidates cleanly.**

---

# WHAT I CANNOT DETERMINE READ-ONLY

- 🔴 **WHETHER THE PAGE YOU LOOKED AT HAD BEEN OPEN SINCE BEFORE 16:47** — the single most likely
  explanation, and invisible from source.
- 🔴 **WHICH EVENT THE REQUEST RESOLVED**, which needs the URL's `event_id` or a query.
- ⚠️ **Whether the deployed build matches `HEAD`** — the same open question as `heartbeat-monitor`.

---

# INTEGRITY

```
docs/customer-pause-gate-report.md   bytes 7,152
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. Code points only.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 15 | 0 | 15 |
| U+26A0 (warning sign) | 7 | 7 | 0 |
| U+2705 (check mark button) | 4 | 0 | 4 |

U+26A0 is the only TEXT-presentation base and every occurrence is PAIRED with U+FE0F.

## Working tree

```
?? docs/customer-pause-gate-report.md
?? docs/offline-setting-scope-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `?? docs/customer-pause-gate-report.md` | 🔴 **THIS TASK — the only file written. NO SOURCE FILE WAS TOUCHED** |
| everything else | ✅ pre-existing — earlier tasks this session |

No `git stash`, `git checkout` or `git restore` was run at any point.
