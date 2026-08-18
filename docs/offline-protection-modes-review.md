# Offline protection as one switch with two modes — read-only review

🔴 **NOTHING WAS EDITED EXCEPT THIS FILE.** No commit, stage, revert, stash or clean; no `git stash`,
`checkout` or `restore`. No build, no deploy, no SQL, no schema change. **Nothing was designed and
nothing is recommended.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

**Every claim is marked READ (quoted) or INFERRED.** **Manage and dashboard are reported separately.**

# 🔴 THE HEADLINE, BEFORE THE DETAIL

**The operator is right that most of it exists.** ✅ **The no-auto-accept behaviour is already built,
end to end, and has been for a long time — status `pending`, slot claimed and held, customer told the
truck will confirm, order in the pending queue with a pulsing count.** 🔴 **What does not exist is
anywhere to STORE a third state: both settings are `boolean`, so the mode has nowhere to live.**
**Q1 names the options and their costs; Q9 says plainly that both need a migration.**

---

# Q1 — WHERE THE SETTING LIVES

```sql
  add column if not exists auto_pause_on_offline boolean not null default false;
```
```sql
alter table truck_events
  add column if not exists offline_protection_override boolean default null;

comment on column truck_events.offline_protection_override is
  'Per-event override for offline protection. null = use van default (auto_pause_on_offline). true/false = explicit override set from dashboard.';
```

**READ. Two columns, both boolean, one nullable-for-inherit.**

**Every reader of `truck_vans.auto_pause_on_offline`** — `supabase/functions/heartbeat-monitor` ·
`app/api/dashboard/route.ts` (returns `vanAutoPause`) · `app/api/manage/route.ts` (`get_vans`, and the
update allowlist) · `app/api/menu/[truckId]/route.ts` (the customer gate) ·
`app/dashboard/[token]/page.tsx` · `app/manage/[token]/page.tsx` (the Van card) ·
`app/dashboard/[token]/kds/page.tsx` (the screen-off warning's van list).

**Every reader of `truck_events.offline_protection_override`** — `heartbeat-monitor` ·
`app/api/menu/[truckId]/route.ts` · `app/api/dashboard/action/route.ts` (`set_offline_protection`) ·
`app/dashboard/[token]/page.tsx`.

## 🔴 THE OPTIONS — NAMED, COSTED, NOT CHOSEN

| # | Shape | What it needs | Notes |
|---|---|---|---|
| **A** | **A SECOND COLUMN carrying the mode** — e.g. `truck_vans.offline_protection_mode text` + `truck_events.offline_protection_mode_override text`, `'pause' \| 'no_auto_accept'`, null = inherit | 🔴 **a migration (2 columns + a CHECK)** · the `get_vans` named select · the manage update allowlist · a new/extended dashboard action · `/api/dashboard` to return it · the monitor to read it | ✅ **The existing boolean keeps its exact meaning — ON/OFF — so every current reader stays correct if it ignores the new column.** ⚠️ Two columns to keep in step, and the event-level inherit rule doubles |
| **B** | **BOTH COLUMNS BECOME AN ENUM** — `'off' \| 'pause' \| 'no_auto_accept'` | 🔴 **a migration WITH A DATA CONVERSION** (`true → 'pause'`, `false → 'off'`, and the event override's `null` must stay inherit) · **every reader above rewritten**, because `if (!effective)` and `? :` on a boolean stop compiling/meaning what they meant · both API routes · both UIs | 🔴 **A BREAKING READ FOR EVERY CONSUMER, INCLUDING THE DEPLOYED EDGE FUNCTION — and a Postgres column cannot change type and be read by an old function body at the same moment.** ⚠️ Cleanest end state, worst migration |
| **C** | **A JSON/settings blob** on the van (e.g. `offline_protection jsonb`) | a migration (1 column) · every reader learns the blob | ⚠️ **No precedent in this schema for a settings blob**; the codebase's pattern is explicit columns with `?? inherit` chains |
| **D** | 🔴 **NO SCHEMA CHANGE AT ALL — reuse `truck_vans.auto_accept`** as the mode by leaving protection ON and having the monitor flip auto-accept instead of pausing | ✅ no migration | 🔴 **REJECTED ON ITS FACE AND REPORTED ONLY FOR COMPLETENESS: it would make an OPERATOR-OWNED setting change itself behind their back, and there is no way to tell "the monitor turned this off" from "the operator did".** |

---

# Q2 — EVERY CONSUMER, AND WHAT IT WOULD NEED

| Consumer | What it does today (READ) | Under a three-state model |
|---|---|---|
| `heartbeat-monitor` | `const effective = ev.offline_protection_override !== null && … ? ev.offline_protection_override : (van.auto_pause_on_offline ?? false)` then `if (!effective) continue` | 🔴 **must learn the mode; `pause` keeps today's write, `no_auto_accept` must NOT write `online_paused_until` — Q7** |
| **dashboard** `effectiveOfflineProtection` | `eventOfflineOverride!==null?eventOfflineOverride:vanAutoPause` — one resolution, three readers (the alert hook, the notice gate, the Settings toggle) | ⚠️ **stays as the ON/OFF answer under option A; becomes a mode resolution under B** |
| **dashboard** Settings card | a single `<Toggle>` + `OFFLINE_PROTECTION_CARD_DESCRIPTION` | 🔴 **needs a mode control beside the toggle, and the copy stops being true — Q5** |
| **manage** Van card | `van.auto_pause_on_offline ? 'Enabled — online orders pause…' : 'Disabled — …'` | 🔴 **same: a mode control and new copy** |
| the notice (`showOfflinePausedNotice`) | gated on `effectiveOfflineProtection` + a 24h window | ⚠️ **"Offline protection kept you covered / Orders were paused" is PAUSE-mode copy.** In no-auto-accept mode it would announce something that did not happen |
| `/api/menu/[truckId]` (the customer gate) | `offlinePaused = offlineProtectionEnabled && ev.online_paused_until …` | ✅ **needs nothing if the monitor never writes the column in the new mode** — no pause, no block |
| **KDS** | reads `auto_pause_on_offline` only to name vans in the screen-off warning | ⚠️ **copy-only: that warning says the screen going off may pause orders** |

---

# Q3 — WHAT ALREADY EXISTS FOR AUTO-ACCEPT — ✅ THE OPERATOR IS RIGHT

```ts
          const allItemsAutoAccept = orderLines.every(l => autoAcceptByName[l.name] !== false)
```
```ts
            truck.auto_accept && allItemsAutoAccept && !anyForcesPending
```
```ts
      const status = autoAccepted ? 'confirmed' : 'pending'
```

**READ. `trucks.auto_accept` is the truck-level switch; a per-item `auto_accept=false`, a past
`force_pending` pre-order deadline, and a note needing review each force the whole order pending.**

**End to end for a non-auto-accepted order — READ:**

| Stage | What happens |
|---|---|
| Slot | 🔴 **CLAIMED AND HELD. `placeOrderInSlotLocked` runs BEFORE the auto-accept decision and `finalSlot` goes into the insert either way — the status does not gate the claim** |
| Status on arrival | `pending` |
| Customer sees | `Order received!` + *"{truck} will confirm your order shortly."* |
| Email | `params.autoAccepted ? 'Order confirmed!' : 'Order received!'` — the same split |
| Operator sees | the order in the pending queue, with a pulsing count badge in the header (`pendingOrders.length>0 && …`) |
| Confirmation email to the customer | 🔴 **gated on `autoAccepted`** — an accepted-later order gets its confirmation when the operator confirms |

🔴 **CONFIRMED: THE LIFECYCLE THE NEW MODE NEEDS IS ALREADY BUILT AND IS IN DAILY USE BY EVERY
AUTO-ACCEPT-OFF TRUCK.** **What does not exist: (i) anywhere to store the mode, (ii) a way for the
MONITOR to make a truck behave as auto-accept-off temporarily without touching the operator's own
`auto_accept` setting, and (iii) any copy that says "we may not have seen this yet" specifically.**

---

# Q4 — THE CUSTOMER MESSAGE

**Today, auto-accept off — READ:**

```tsx
              : <><span className="font-semibold text-slate-700">{truckName}</span> will confirm your order shortly.</>
```
```ts
  const heading = isReady ? 'Your order is ready! 🎉' : params.autoAccepted ? 'Order confirmed!' : 'Order received!'
```

⚠️ **IS IT SUITABLE? PARTLY.** *"will confirm your order shortly"* is true and reassuring, **but it
implies the truck HAS the order and is deciding.** 🔴 **In an outage the truck may not have seen it at
all, which is a different promise — the brief's own wording ("may not have seen it yet") is not in the
product today.** **New copy would be needed, and it would have to be conditional on the mode being
active AT SUBMIT TIME, which nothing on that path currently knows.** ⚠️ **INFERRED: that means the
customer path would need the mode too, not just the monitor.**

---

# Q5 — EVERY OPERATOR-FACING STRING, AND WHETHER IT SURVIVES

**All of them live in one file — `lib/copy/offlineProtection.ts` — which is the good news.**

| String | Text (READ) | Under the new model |
|---|---|---|
| `OFFLINE_PROTECTION_CARD_DESCRIPTION` | *"Pauses online orders if this device goes offline"* | 🔴 **DESCRIBES A MODE, NOT THE FEATURE. Needs rewording** |
| `OFFLINE_PROTECTION_EXPLAINER_BODY` | *"…customer ordering may be paused."* | 🔴 **mode-specific** |
| `OFFLINE_PROTECTION_REMINDER` | *"⚠️ Keep your dashboard or kitchen screen on…, or customer ordering may be paused."* | 🔴 **mode-specific** |
| `OFFLINE_PROTECTION_ENABLE_CONFIRM` | *"…online orders may pause automatically."* | 🔴 **mode-specific** |
| `OFFLINE_PROTECTION_DISABLE_CONFIRM` | *"…online orders will continue — customers may place orders you cannot see."* | ⚠️ **STILL TRUE for OFF, and it is the closest thing in the product to describing the new mode** |
| `OFFLINE_PROTECTION_EXPLAINER_LEAD` | *"You must keep your dashboard or kitchen screen on and online during service."* | ✅ **survives — it is about screen presence, not about what happens** |
| **manage** Van card | *"Enabled — online orders pause if kitchen device loses connection"* / *"Disabled — online orders continue even if kitchen device goes offline"* | 🔴 **both mode-specific; "Enabled" would need to name WHICH mode** |
| **dashboard** Settings card heading | `Offline protection` | ✅ **survives as the switch's name** |
| the notice | *"Offline protection kept you covered / Orders were paused while your device was offline."* | 🔴 **pause-mode only** |

⚠️ **AND THE FILE'S OWN RULES WOULD CARRY OVER:** *"Say 'may be paused' … never 'will pause'"* and
*"No timings or mechanism"*. **A second mode's copy would have to obey both.**

---

# Q6 — SCOPE

**READ: VAN-level default (`truck_vans.auto_pause_on_offline`, `not null default false`) with a
PER-EVENT override (`truck_events.offline_protection_override`, nullable, `null` = inherit).** **There
is no truck-level row for this** — a multi-van truck sets it per van.

⚠️ **INFERRED, not recommended: a mode stored at a different scope from the switch would create a state
the resolver has no rule for (protection ON at the event, mode set only on the van, or vice versa).
Whether the mode follows the same two-level shape is a decision, not a finding.** **What IS a finding:
the `?? inherit` chain is the file's established pattern and `resolvePaidStep` shows the same shape for
three other settings, so the precedent exists either way.**

---

# Q7 — THE MONITOR

```ts
      const { error: updErr } = await supabase
        .from('truck_events')
        .update({ online_paused_until: autoPauseUntil, last_offline_pause_at: now.toISOString() })
        .eq('id', ev.id)
```

🔴 **THE MINIMAL CHANGE, STATED WITHOUT CHOOSING IT: in `no_auto_accept` mode the monitor must NOT
write `online_paused_until` — that column is what the customer gate reads, and writing it IS the pause.**

**Two candidate shapes, both READ from the surrounding code:**
- **Do nothing at all** — the mode needs no server-side action, because a truck that is offline already
  cannot auto-accept anything: the auto-accept decision happens on the SUBMIT path, and 🔴 **nothing
  there knows the truck is offline.** ⚠️ **So "do nothing" would NOT produce the behaviour — orders
  would still auto-confirm during the outage.**
- **Write a different marker** the submit path can read (the mode itself, or a timestamp), so
  `/api/orders/submit` forces `pending`. 🔴 **That is a new field AND a change to the submit path.**

⚠️ **THAT IS THE ONE PLACE WHERE "MOSTLY BUILT" STOPS BEING TRUE: the auto-accept decision is made at
submit time from truck/item config, and there is currently no signal on that path saying "this truck is
offline right now".**

---

# Q8 — WHAT SURFACES THE BATCH AFTERWARDS

**READ: nothing batch-shaped.** Orders placed during an outage in the new mode would arrive `pending`
with their slots held, and would appear **individually** in the pending queue with the header's pulsing
count (`pendingOrders.length`). ⚠️ **The two banners that DO fire after a reconnect are about other
things: `CapacityBreachBanner` (slots over a ceiling) and `BuzzerLostBanner`.** 🔴 **There is no "12
orders arrived while you were away" surface, and no marker on those rows distinguishing them from any
other pending order.**

---

# Q9 — 🔴 MIGRATIONS AND API CHANGES, SAID PLAINLY

🔴 **BOTH SERIOUS OPTIONS NEED A SCHEMA CHANGE. THERE IS NO NO-MIGRATION PATH THAT IS HONEST.**

| | Option A (second column) | Option B (enum) |
|---|---|---|
| **Migration** | 🔴 **YES** — 2 columns + CHECK, additive | 🔴 **YES** — type change + data conversion, **not additive** |
| `app/api/manage` | the `get_vans` named select + the update allowlist | same |
| `app/api/dashboard` | return the mode beside `vanAutoPause` | same |
| `app/api/dashboard/action` | extend or add an action beside `set_offline_protection` | rewrite it |
| `app/api/orders/submit` | 🔴 **YES, for the mode to affect auto-accept — Q7** | same |
| `supabase/functions/heartbeat-monitor` | read the mode; skip the write in the new mode | 🔴 **rewrite its boolean logic, and deploy ORDER matters against the type change** |
| Copy | Q5's list | same |

---

# ⚠️ PIZZERIA GUSTO — `auto_pause_on_offline = true` ON A LIVE VAN

| | Option A | Option B |
|---|---|---|
| Their existing value | ✅ **UNTOUCHED — `true` still means the switch is ON**, and the new mode column defaults to `'pause'` (or null-inherits it), so **their behaviour is identical on day one** | 🔴 **CONVERTED — `true → 'pause'` by the migration. Correct if the conversion runs; 🔴 if it does not, every reader sees an unexpected value and the fail-safe is `false`/OFF, i.e. protection silently OFF on a live van** |
| Their per-event overrides | ✅ unchanged | 🔴 must convert too, **preserving `null` = inherit** |
| Risk on the day | ⚠️ low — additive, old readers keep working | 🔴 **the deployed edge function reads the column directly; a type change and a function deploy cannot be simultaneous** |

---

# WHAT I CANNOT DETERMINE READ-ONLY

- ⚠️ **Whether any truck currently relies on `auto_pause_on_offline = false` meaning something other
  than "no protection"** — that is data, not code.
- ⚠️ **How many trucks have a per-event override set** — the same.
- 🔴 **Nothing here is a recommendation. Options A–D are described; the choice, and the schema decision
  in Q9, are yours.**

---

# INTEGRITY

```
docs/offline-protection-modes-review.md   bytes 17,090
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 40 | 0 | 40 |
| U+26A0 (warning sign — TEXT presentation) | 20 | 20 | 0 |
| U+2705 (check mark button) | 10 | 0 | 10 |
| U+1F389 (party popper) | 1 | 0 | 1 |

U+26A0 is the only TEXT-presentation base here; any BARE occurrence is quoted verbatim from a
source string that writes it bare. The rest have emoji presentation by default, so bare is
correct for them. NO SOURCE FILE WAS EDITED, so there is no before/after census to report.

## Working tree

```
 M app/dashboard/[token]/page.tsx
 M components/dashboard/CapacityBreachBanner.tsx
?? docs/breach-banner-copy-report.md
?? docs/breach-banner-safe-area-report.md
?? docs/offline-notice-gate-report.md
?? docs/offline-order-numbering-capacity-report.md
?? docs/offline-protection-modes-review.md
?? docs/offline-protection-popup-report.md
?? docs/oversell-warning-review-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `?? docs/offline-protection-modes-review.md` | 🔴 **THIS TASK — the only file written** |
| `M app/dashboard/[token]/page.tsx`, `M components/dashboard/CapacityBreachBanner.tsx`, and every other `?? docs/*.md` | ✅ **pre-existing — earlier tasks this session.** 🔴 **THIS TASK EDITED NO SOURCE FILE** |

⚠️ **The tree is short because you committed mid-session (`dcb8862`, `fa72f9a`); nothing was cleaned by
me.** No `git stash`, `git checkout` or `git restore` was run at any point.
