# The auto-reject delay picker

**Built on both surfaces, following the MODE's own path exactly.** No migration, no sweep change, no
claim-function change, no SQL run. The mode control, its two labels, the orange warning and the toggle are
untouched.

⚠️ **ONE TENSION IN THE BRIEF, RESOLVED BY THE BRIEF ITSELF AND FLAGGED RATHER THAN CHOSEN SILENTLY.** The
header says *"UI only. No backend"*, but a picker that persists needs a write path, and Phase 1.2 says
*"Quote how the MODE is read, written and persisted end to end… The delay must follow the identical path"*
— which requires the same two API routes. **I read 1.2 as defining the scope of "no backend": no new
system, no sweep, no migration — the additive plumbing for this one control is part of the control.**
🔴 **Three files outside the two components changed, all additively; every one is named in §Phase 3.** Say
if that reading is wrong and I will strip them.

---

# PHASE 1 · READ-ONLY

## 1 · The two surfaces — 🔴 THEY DUPLICATE. IT IS TWO EDITS, NOT ONE.

**They share the copy module and the `OFFLINE_PROTECTION_MODES` array. They share NO component.**

**The dashboard card — `app/dashboard/[token]/page.tsx`:**

```tsx
                  <div role="radiogroup" aria-label={OFFLINE_PROTECTION_SWITCH_LABEL} className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-2">
                    {OFFLINE_PROTECTION_MODES.map(m=>(
                      <button key={m.value} type="button" role="radio" aria-checked={effectiveOfflineMode===m.value}
                        onClick={()=>{if(effectiveOfflineMode!==m.value)void setOfflineMode(m.value)}}
```

**Settings → Van — `app/manage/[token]/page.tsx`:**

```tsx
                <div role="radiogroup" aria-label={OFFLINE_PROTECTION_SWITCH_LABEL} className="mt-3 pt-3 border-t border-teal-200 flex flex-col gap-2">
                  {OFFLINE_PROTECTION_MODES.map(m => {
                    const selected = (van.offline_protection_mode ?? 'pause') === m.value
                    …onClick={() => { if (!selected) void updateVanSetting(van.id, 'offline_protection_mode', m.value) }}
```

🔴 **SAME SHAPE, DIFFERENT CODE, DIFFERENT COLOURS (slate vs teal), AND — THE IMPORTANT PART — DIFFERENT
SCOPES.** The dashboard writes the **event override**; Manage writes the **van default**. **So the picker
had to land twice, and it does.** ✅ **READ.**

## 2 · How the MODE is persisted, end to end

| | Dashboard (event override) | Manage (van default) |
|---|---|---|
| Component | `setOfflineMode(m.value)` — optimistic, reverts on failure | `updateVanSetting(van.id, 'offline_protection_mode', m.value)` |
| Request | `POST /api/dashboard/action`, `action: 'set_offline_protection'`, `{ mode, eventId }` | `api('update_van_settings', { vanId, offlineProtectionMode })` |
| Handler | `if (mode === 'pause' \|\| mode === 'no_auto_accept' \|\| mode === null) patch.offline_protection_mode_override = mode` | `if (offlineProtectionMode === 'pause' \|\| … ) updates.offline_protection_mode = offlineProtectionMode` |
| Column | `truck_events.offline_protection_mode_override` | `truck_vans.offline_protection_mode` |
| Read back | `/api/dashboard` → `vanOfflineMode`; the override via a direct `supabaseBrowser` select | `get_vans`' named select |
| Chain | `eventOfflineModeOverride ?? vanOfflineMode` | — |

⚠️ **AND ONE TRAP THE MODE ALREADY DOCUMENTS, WHICH THE DELAY INHERITS:**

> *"⚠️ THE MODE'S REQUEST KEY IS NOT ITS COLUMN NAME… A key the handler does not name is dropped
> SILENTLY — the allowlist warning in that file."*

## 3 · Does the mode have an event-override UI? — **YES, and it is the dashboard card**

✅ **So the delay gets one too, on the same surface, writing the same kind of column.** **The question's
premise — "if the mode's override has no UI, the delay's should not either" — does not apply: it has
one.** ✅ **READ.**

## 4 · The nullable-numeric-with-an-off-state precedent — `buzzer_count`

**The handler. READ — `app/api/manage/route.ts`:**

```ts
    // Buzzers: null = this van has no buzzers (the toggle off), 1..BUZZER_MAX_COUNT = rack size. …
    // `!== undefined` and not a truthiness test, so an explicit null CLEARS rather than being skipped.
    if (buzzer_count !== undefined)       updates.buzzer_count = buzzer_count
```

**The control. READ — `app/manage/[token]/page.tsx`:**

```tsx
              {van.buzzer_count != null && (
                <div className="flex items-center justify-between gap-3 pl-4">
                  <p className="text-sm text-slate-700">{SETTING_COPY.buzzers.countLabel}</p>
                  <select
                    value={van.buzzer_count}
                    aria-label="Number of buzzers"
                    onChange={e => updateVanSetting(van.id, 'buzzer_count', parseInt(e.target.value))}
```

> *"CONDITIONALLY RENDERED… there is no useful thing to say about a count when the van has no buzzers,
> and a disabled 1-20 select showing "10" would read as a stored value that is not stored."*

✅ **Three rules taken from it verbatim:** `!== undefined` so an explicit null clears; a plain `<select>`
with the stored value; and **conditional rendering rather than a disabled control**. ⚠️ **One difference,
and it is the right one: buzzers have a separate on/off toggle, so `null` is expressed by the toggle. The
delay has no toggle, so `Off` is the first OPTION in the select.** **Same rule, one control instead of two.**

---

# PHASE 2 · STOP CONDITIONS

| Condition | Result |
|---|---|
| Both surfaces cannot be updated without changing shared behaviour | ❌ **Not tripped** — they share no component; each was edited on its own |
| The delay cannot follow the mode's persistence path | ❌ **Not tripped** — it follows it exactly, both scopes |
| Instructions contradict | ⚠️ **"UI only, no backend" vs Phase 1.2's identical-path requirement — flagged at the top, resolved by 1.2, not chosen silently** |
| Garbled span | ❌ None |

---

# PHASE 3 · THE BUILD

**Six files. Two are the controls; four are the path the mode already uses.**

| File | What |
|---|---|
| `lib/copy/offlineProtection.ts` | the label, the help line, the options and the range formatter |
| `app/manage/[token]/page.tsx` | the picker (van default) |
| `app/dashboard/[token]/page.tsx` | the picker (event override) + read + write |
| `app/api/manage/route.ts` | `get_vans` select + `update_van_settings` accepts `offlineAutoRejectMins` |
| `app/api/dashboard/route.ts` | van select + returns `vanAutoRejectMins` |
| `app/api/dashboard/action/route.ts` | `set_offline_protection` accepts `autoRejectMins` |

## a · The picker

**`Off` plus 5, 10, 15, 20, 25, 30. `Off` is the first option and writes `null`.** The value is the
integer; `''` in the DOM maps to `null` on write and back on read (`van.offline_auto_reject_mins ?? ''`).

## b · Only in `no_auto_accept`

**Both pickers render INSIDE the mode block**, so they appear and disappear with the choice. **In `pause`
the control is not rendered at all** — not disabled, not greyed. ✅ **A control that cannot fire is not
shown, and `pause` blocks customers server-side so nothing could be waiting.**

## c · The copy — suggested, adjust freely

> **Auto-reject orders left waiting**
> *While you're offline, an order waiting longer than this is rejected for you and the customer is told
> your connection dropped. Off means every order waits for you.*

**It says the order is rejected, says the customer is told, gives no timing at all in the sentence, and
names what Off does.** ⚠️ **It deliberately does not say "automatically" twice or explain the sweep.**

## d · 🔴 THE RANGE, NOT THE NUMBER

**Executed from the real helper:**

```
  OFF option -> "Off"   (stored value: null)
  stored  5 -> label "5–10 min"
  stored 10 -> label "10–15 min"
  stored 15 -> label "15–20 min"
  stored 20 -> label "20–25 min"
  stored 25 -> label "25–30 min"
  stored 30 -> label "30–35 min"
```

**Why a range and not "about 5 minutes":** the sweep runs every five minutes, so N means N to N+5 —
**never sooner, sometimes later.** *"5 minutes"* would be a promise the schedule cannot keep, which is
exactly the *"resuming in ~119 min"* mistake: a backstop reported as a prediction. **A range cannot be
read as a countdown.** ⚠️ **THE RANGES OVERLAP AT THEIR EDGES — 5–10 and 10–15 both contain 10 — and that
is honest rather than tidy, because the behaviour overlaps too.** ⚠️ **The stored value is always the
LOWER bound**, which is the number the sweep compares against, so the database and the label agree.

## e · Off is the default and is not an error

**`Off` is a plain first `<option>`, in the same type and colour as the others.** No amber, no warning, no
"not configured", no empty state. **Every van reads `null` today and that is correct.**

## f · Both surfaces, no drift

**The label, the help line, the options and the range formatter all come from
`lib/copy/offlineProtection.ts`** — the same module the mode's own labels come from. **Neither surface
spells any of it out.**

---

# PHASE 4 · VERIFICATION

⚠️ **NOTHING WAS RENDERED.** No page was opened, no request made, no value written. **Every visual claim
is READ-FROM-SOURCE and unobserved.** `tsc --noEmit` passes and is **not** offered as verification;
`next dev` / `next build` were not run.

## What renders, per mode × surface × stored value

| Mode | Surface | Van/event value | Renders |
|---|---|---|---|
| `pause` | dashboard | NULL | **No picker.** Mode rows only |
| `pause` | dashboard | 15 | **No picker** — the value is stored and invisible |
| `pause` | Settings → Van | NULL | **No picker** |
| `pause` | Settings → Van | 15 | **No picker** |
| `no_auto_accept` | dashboard | NULL | Picker showing **`Off`**, plus the help line |
| `no_auto_accept` | dashboard | 15 | Picker showing **`15–20 min`** |
| `no_auto_accept` | Settings → Van | NULL | Picker showing **`Off`** |
| `no_auto_accept` | Settings → Van | 15 | Picker showing **`15–20 min`** |

⚠️ **The dashboard shows the RESOLVED value — `eventAutoRejectOverride ?? vanAutoRejectMins` — so a van
default of 15 with no event override displays `15–20 min` there too**, exactly as the mode's own chain
behaves. **Changing it on the dashboard writes the EVENT override and leaves the van default alone.**

⚠️ **The dashboard's select is `disabled={isOffline}`**, matching the mode radios beside it — settings are
locked offline on that surface.

## ✅ Switching to `pause` does NOT clear a stored delay

**Established from the write paths, not assumed.** The only writers of either column are the two selects
themselves:

- `updateVanSetting(van.id, 'offline_auto_reject_mins', …)` — fires only from the picker's `onChange`.
- `setAutoRejectMins(…)` — fires only from the dashboard picker's `onChange`.

**The mode's own writers touch different columns:** `offline_protection_mode` / `offline_protection_mode_override`,
and `set_offline_protection`'s `value === false` branch clears `online_paused_until` and
`offline_no_autoaccept_until` — **neither of which is the delay.** ✅ **So switching to `pause`, or
switching the whole feature off, leaves the delay stored and it returns when `no_auto_accept` is chosen
again.** **That is the behaviour you asked for, and it is what the implementation does.**

## Executable line counts

| File | Before | After | − | + |
|---|---|---|---|---|
| `lib/copy/offlineProtection.ts` | 28 | 36 | 0 | 8 |
| `app/api/manage/route.ts` | 1129 | 1136 | 2 | 9 |
| `app/manage/[token]/page.tsx` | 8476 | 8496 | 4 | 24 |
| `app/api/dashboard/route.ts` | 437 | 440 | 1 | 4 |
| `app/dashboard/[token]/page.tsx` | 3167 | 3196 | 3 | 32 |
| `app/api/dashboard/action/route.ts` | 1448 | 1454 | 0 | 6 |

⚠️ **The removals are all rewrites of one line into a longer one** — the two named selects, the
`updateVanSetting` union and its request-key ternary, and the two `useState` lines the new state sits
beside. **Nothing was deleted.**

## ⚠️ Two named-select changes, and the deploy rule they carry

`get_vans` and `/api/dashboard`'s van select now name `offline_auto_reject_mins`. **A named select over a
column PostgREST cannot see returns 42703 and fails the whole statement** — for `get_vans` that means
*"Manage → Settings renders no vans at all"*, in that file's own words. ✅ **The column exists, applied by
hand and verified against `information_schema`**, so the precondition is met — but the rule is recorded
here because it is the one way this change could break a live screen.

## Marking

| Claim | Status |
|---|---|
| The two surfaces duplicate and share no component | ✅ **READ** — both quoted |
| The mode's persistence path, both scopes | ✅ **READ** — component, request, handler, column, read-back |
| `buzzer_count` is the nullable-numeric precedent | ✅ **READ** — handler and control quoted |
| The option labels and copy | ✅ **EXECUTED** — printed from the real helper |
| Line counts | ✅ **EXECUTED** — comment-stripped comparison |
| Switching mode does not clear the delay | ✅ **READ** — every writer of the two columns enumerated |
| **What any of it looks like** | ⚠️ **READ-FROM-SOURCE and UNOBSERVED.** Nothing was rendered |
| `tsc --noEmit` passes | ⚠️ **A breakage check, NOT verification** |

**Surfaces, kept apart:** the **dashboard** card and **Settings → Van** were each read and edited on their
own; they share only the copy module. **The KDS renders no offline-protection control and was not
touched.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** every write —
never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. **Files: the six source files
and this report.** The result, the non-ASCII census of characters introduced, and the carrier-aware
variation-selector figures per emoji-presentation base are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
