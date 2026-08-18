# Offline protection — one name, two columns, two scopes

🔴 **NOTHING WAS EDITED EXCEPT THIS FILE.** No commit, stage, revert, stash or clean; no `git stash`,
`checkout` or `restore`. No build, no deploy, no SQL.

**No span of the prompt arrived garbled.** **Every claim is READ (quoted) or INFERRED.**
**The manage page and the dashboard are reported separately.**

# 🔴 THE HEADLINE: THE SETTING IS NOT STORED PER DEVICE — BUT THE TWO SURFACES WRITE DIFFERENT COLUMNS AT DIFFERENT SCOPES

✅ **Q2 IS CLEAN: NOTHING ABOUT THIS SETTING IS IN localStorage, Preferences, sessionStorage OR A
COOKIE.** ✅ **EXECUTED — a grep for `auto_pause_on_offline` / `offline_protection` alongside
`localStorage|Preferences|sessionStorage|cookie` returns NOTHING, and the full `hg_*` key inventory
(20 keys: app-lock, breach ack, demo state, device id/letter, KDS view prefs, keep-awake, last screen,
outbox, prov seq, sound) contains no offline-protection key.** 🔴 **So a per-device COPY is not the
defect here — which leaves the scope split below as the mechanism that can genuinely make two devices
disagree.**

---

# Q1 — WHERE THE SETTING LIVES

| Column | Table | Scope | null means |
|---|---|---|---|
| `auto_pause_on_offline` | `truck_vans` | 🔴 **THE VAN** | n/a — `boolean not null default false` |
| `offline_protection_override` | `truck_events` | 🔴 **ONE EVENT** | **inherit the van** |
| `offline_protection_mode` | `truck_vans` | the van | n/a — `text not null default 'pause'` |
| `offline_protection_mode_override` | `truck_events` | one event | inherit the van |
| `offline_no_autoaccept_until` | `truck_events` | one event | ⚠️ **NOT A SETTING — a runtime marker written by the monitor** |

**RESOLUTION ORDER — READ, from `heartbeat-monitor`:**
```ts
      const effective = ev.offline_protection_override !== null && ev.offline_protection_override !== undefined
        ? ev.offline_protection_override
        : (van.auto_pause_on_offline ?? false)
```
**Event override ?? van default ?? false. The dashboard mirrors it exactly
(`effectiveOfflineProtection`), and the customer gate in `/api/menu/[truckId]` uses the same chain.**

🔴 **THERE IS NO TRUCK-LEVEL ROW. "One setting for the truck" is expressed as a VAN default plus a
per-event override — so on a multi-van truck it is already one setting PER VAN.**

---

# Q3 — THE MANAGE PAGE (VAN SCOPE)

```tsx
    setVans(prev => prev.map(v => v.id === vanId ? { ...v, auto_pause_on_offline: enabled } : v))
```
```tsx
    await api('update_van_settings', { vanId, [field]: value })
```
```ts
    if (autoPauseOnOffline !== undefined) updates.auto_pause_on_offline = autoPauseOnOffline
```
**READ: it writes `truck_vans.auto_pause_on_offline` — THE VAN DEFAULT — and it sets local state
OPTIMISTICALLY before the server answers, with no revert-on-failure in that helper.**

# Q4 — 🔴 THE DASHBOARD (EVENT SCOPE) — AND THEY ARE NOT THE SAME COLUMN

```ts
      const patch: Record<string, unknown> = { offline_protection_override: value }
```
```tsx
      body:JSON.stringify({token,pin,action:'set_offline_protection',value,eventId:activeEvent.id})
```

🔴 **SAID PLAINLY, AS ASKED: THE MANAGE PAGE WRITES THE VAN DEFAULT AND THE DASHBOARD WRITES THE EVENT
OVERRIDE. TWO COLUMNS, TWO SCOPES, ONE NAME.** ⚠️ **This is by design — the dashboard's own comment
calls it a per-event override — but it is exactly the shape that produces your symptom without any
device-local storage being involved:**

- **A laptop on Event A with `offline_protection_override = true` shows ON.**
- **A phone on Event B (or on the same truck before that override existed) resolves to the VAN default
  and shows OFF.**
- 🔴 **Both are reading the same database correctly. Neither is stale. The setting "for the truck" has
  two answers because it is two columns.**

---

# Q5 — THE READ PATH

**Dashboard — READ:**
```tsx
    supabaseBrowser.from('truck_events').select('offline_protection_override, offline_protection_mode_override, order_ready_override').eq('id',selectedEventId).single()
```
```tsx
      if(data.vanAutoPause !== undefined) setVanAutoPause(data.vanAutoPause)
```
**Two sources: a direct per-event select for the override, and `/api/dashboard`'s `vanAutoPause` for
the default. `effectiveOfflineProtection` resolves them.**

🔴 **IT IS NOT GUARDED BY `markPending`/`applyPending`.** It has its own optimistic pattern:
```tsx
    const prev=eventOfflineOverride
    setEventOfflineOverride(value)
      if(!res.ok)throw new Error('write failed')
```
**On failure the handler reverts to `prev`. ⚠️ INFERRED: a write that SUCCEEDS on the server but whose
response is lost (a dropped connection) reverts locally while the database holds the new value — a
transient disagreement that the next per-event select corrects.**

**Manage — READ:** `vans` from `/api/manage`'s `get_vans`, whose select is filtered `.eq('active',
true)` and re-read on load. ⚠️ **Its optimistic set has no revert, so a failed write leaves the toggle
showing the value it did not save until the page is reloaded.**

# Q6 — ACROSS AN EVENT SWITCH
✅ **The dashboard's per-event read is keyed on `selectedEventId`, resets to `null` when there is no
event, and carries a `cancelled` guard against a stale in-flight response** — so it cannot show the
previous event's override after a switch. ⚠️ **But `vanAutoPause` arrives from `/api/dashboard`, which
resolves the SELECTED event's van — so on a multi-van truck the DEFAULT can change with the event too.**

---

# Q7 — 🔴 LEGITIMATE VERSUS DEFECT, FOR TWO DEVICES ON ONE TRUCK

| Observable | Verdict |
|---|---|
| **Pause state / the paused banner** | ✅ **LEGITIMATE** — a phone that has been away and a laptop that has been polling will genuinely differ until each next fetch |
| **Heartbeat age, "device offline" wording** | ✅ **LEGITIMATE — per device by definition** |
| **The reconnect notice ("kept you covered")** | ✅ **LEGITIMATE — its ack is per-device localStorage, deliberately** |
| **The breach banner's dismissal** | ✅ **LEGITIMATE — same, per device** |
| **The strip marker** | ✅ legitimate — follows each device's last poll |
| 🔴 **The toggle's POSITION for the same event** | 🔴 **DEFECT** |
| 🔴 **The resolved mode for the same event** | 🔴 **DEFECT** |
| 🔴 **Whether customers can order** | 🔴 **DEFECT if it differs** — it is server-side, one answer |
| ⚠️ **The toggle's position when the two devices have DIFFERENT EVENTS selected** | ⚠️ **NOT A DEFECT — Q4. It is the per-event override doing what it was built to do** |

---

# Q8 — THE ONE CHEAPEST CHECK

🔴 **PUT BOTH DEVICES ON THE SAME EVENT AND COMPARE THE TOGGLE.** (NOT PERFORMED.)

- **They agree ⇒ the earlier difference was the per-event override (Q4) or a stale build, and the
  setting is being read correctly.**
- **They still differ ⇒ hard-reload the phone. If it then agrees, it was the build; if it does not, the
  read genuinely differs per device and Q2's clean result is wrong somewhere I did not look.**

⚠️ **It needs no database access and no deploy, and it separates the two candidates in one action —
which is why it beats reading the columns: the columns would tell you what is stored, not what each
device resolved.**

---

# WHAT I CANNOT DETERMINE READ-ONLY

- 🔴 **WHICH EVENT EACH DEVICE HAD SELECTED at the moment you looked** — and Q4 makes that the single
  most likely explanation after the build.
- ⚠️ **Whether the phone was on an older build.** Two commits landed today (`f9c6972`, `acb13d1`) and a
  phone holding a cached bundle would predate both.
- ⚠️ **Whether `truck_vans` has more than one active van for this truck**, which would make even the
  VAN default legitimately different between two screens pointed at different vans.

---

# INTEGRITY

```
docs/offline-setting-scope-report.md   bytes 9,003
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. Code points only.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 21 | 0 | 21 |
| U+26A0 (warning sign) | 11 | 11 | 0 |
| U+2705 (check mark button) | 9 | 0 | 9 |

U+26A0 is the only TEXT-presentation base and every occurrence is PAIRED with U+FE0F.
NO SOURCE FILE WAS EDITED, so there is no before/after census to report.

## Working tree

```
?? docs/offline-setting-scope-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `?? docs/offline-setting-scope-report.md` | 🔴 **THIS TASK — the only file written. NO SOURCE FILE WAS TOUCHED** |
| `?? app/1ng7n4p5omux2gdk9kqvwz/`, the other `?? docs/*.md`, any `M` entry | ✅ **pre-existing** — earlier tasks this session |
| `M supabase/.temp/cli-latest` | ⚠️ pre-existing — written by the Supabase CLI, not by an edit |

No `git stash`, `git checkout` or `git restore` was run at any point.
