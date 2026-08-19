# Offline Order Protection — layout, copy, and a mandatory delay

**All three changes are in, on both surfaces.** No sweep change, no claim-function change, no migration,
no SQL run, and **no value written for any van that does not have one**.

🔴 **THE DECISION YOU ASKED ME TO STATE RATHER THAN BURY (Change 2c): THE MODE IS WRITTEN IMMEDIATELY, AND
CHOOSING IT ALSO WRITES THE DEFAULT DELAY.** Deferring the mode write was the alternative and I rejected
it — reasoning in §2c.

⚠️ **REVISED MID-TASK, TWICE, ON YOUR INSTRUCTIONS: the default is 15 minutes, there is no "Choose a delay"
option, and the labels are PLAIN MINUTES rather than ranges.** The picker opens on `15 mins`, and
selecting the mode writes 15 for a van that has none. **§2a, §2c and the label note are the revised
versions; nothing else in this report changed.**

---

# PHASE 1 · READ-ONLY

## 1 · Both surfaces, as they stood

**Dashboard — `app/dashboard/[token]/page.tsx`:**

```tsx
                  <p className="text-sm font-semibold text-slate-800">{OFFLINE_PROTECTION_SWITCH_LABEL}{demoLockChip}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{OFFLINE_PROTECTION_CARD_DESCRIPTION}</p>
                  {!isDemo&&<p className="text-xs text-amber-600 mt-1">⚠️ <strong>{OFFLINE_PROTECTION_EXPLAINER_LEAD}</strong> {OFFLINE_PROTECTION_EXPLAINER_BODY}</p>}
                …
                  <div role="radiogroup" … className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-2">
                    {OFFLINE_PROTECTION_MODES.map(m=>(
                      <button key={m.value} type="button" role="radio" …>
                    ))}
                    <div className="mt-1 pt-3 border-t border-slate-100">   ← the picker, BELOW A DIVIDER
```

**Settings → Van — `app/manage/[token]/page.tsx`:** identical structure, teal instead of slate, writing
`updateVanSetting(...)` instead of `setOfflineMode(...)`, and its picker likewise sat under
`className="mt-1 pt-3 border-t border-teal-200"`.

✅ **Confirmed again: they duplicate. Two edits, sharing only the copy module.**

## 2 · The copy module's exports, before

```ts
OFFLINE_PROTECTION_EXPLAINER_LEAD · OFFLINE_PROTECTION_EXPLAINER_BODY · OFFLINE_PROTECTION_EXPLAINER
OFFLINE_PROTECTION_REMINDER (unused, kept) · OFFLINE_PROTECTION_ENABLE_CONFIRM · OFFLINE_PROTECTION_DISABLE_CONFIRM
OFFLINE_PROTECTION_CARD_DESCRIPTION · OFFLINE_PROTECTION_SWITCH_LABEL · OFFLINE_PROTECTION_SWITCH_HELP (unused, kept)
OFFLINE_MODE_PAUSE_LABEL/HELP · OFFLINE_MODE_NO_AUTO_ACCEPT_LABEL/HELP · OFFLINE_PROTECTION_MODES
OFFLINE_AUTO_REJECT_LABEL · OFFLINE_AUTO_REJECT_HELP · OFFLINE_AUTO_REJECT_OFF_LABEL
OFFLINE_AUTO_REJECT_OPTIONS · offlineAutoRejectLabel
```

## 3 · The indented sub-setting precedent — the buzzer count

```tsx
              {van.buzzer_count != null && (
                <div className="flex items-center justify-between gap-3 pl-4">
                  <p className="text-sm text-slate-700">{SETTING_COPY.buzzers.countLabel}</p>
                  <select …>
```

✅ **`pl-<n>` on the dependent row, no divider, conditionally rendered.** ⚠️ **I used `pl-6`, not `pl-4`:
the buzzer row indents under a toggle row, whereas this indents under a RADIO — `w-4` plus `gap-2.5` is
26px, so `pl-6` (24px) lines the control up with the option's label text. **Same idiom, measured for a
different parent.**

## 4 · How each surface writes the mode

| | Dashboard | Settings → Van |
|---|---|---|
| Call | `setOfflineMode(m.value)` | `updateVanSetting(van.id, 'offline_protection_mode', m.value)` |
| Shape | optimistic, reverts + toasts on failure | optimistic patch, then `api(...)` |
| Scope | `truck_events.offline_protection_mode_override` | `truck_vans.offline_protection_mode` |

✅ **Change 2c is implemented on exactly these — no new path.**

---

# PHASE 2 · STOP CONDITIONS

| Condition | Result |
|---|---|
| Mandatory delay requires writing a value for vans that have none | ❌ **Not tripped.** Nothing is written on render; see §2b |
| Both surfaces cannot change without altering shared behaviour | ❌ **Not tripped** — they share only copy, and both consume it |
| Instructions contradict | ❌ No |
| Garbled span | ❌ None |

---

# CHANGE 1 · The copy and its order

**New export:**

```ts
export const OFFLINE_PROTECTION_PURPOSE =
  "If your device loses its connection, this stops orders arriving while you can't see them."
```

**The resulting order, identical on both surfaces — confirmed by line number, not by eye:**

| Position | Dashboard | Settings → Van |
|---|---|---|
| heading | `:3916` | `:9825` |
| **purpose line (NEW)** | `:3917` | `:9826` |
| 🔴 **orange warning** | `:3918` | `:9827` |
| **`CARD_DESCRIPTION`, moved down** | `:3934` | `:9849` |
| the two options | `:3935` | `:9850` |

🔴 **THE ORANGE WARNING DID NOT MOVE AND DID NOT CHANGE.** Same `⚠️`, same `text-amber-600`, same
`<strong>` on the lead, same two constants, same position between the two description lines. **Its line is
byte-identical on both surfaces — it is not in either diff.**

✅ **Neither surface spells either line out. Both come from the copy module**, which is why they cannot
drift.

# CHANGE 2 · The delay is mandatory

## a · No `Off`

`OFFLINE_AUTO_REJECT_OFF_LABEL` is **deleted** and replaced by `OFFLINE_AUTO_REJECT_DEFAULT_MINS = 15`.
**There is no placeholder and no unchosen state** — the six ranges are the whole menu, and the picker
opens on `15 mins`. **`grep -rn` for the old name, for `'offline_auto_reject_mins', null` and for
`autoRejectMins:null` across `app lib` returns NOTHING** — no control can write null any more. **The
reason is in the module, in the words you gave:**

```ts
// 🔴 THERE IS NO "OFF" OPTION, AND ITS ABSENCE IS THE POINT. An operator who chooses "Keep taking
// orders, confirm them yourself" MUST choose a delay: without one an order placed while the van is
// offline can sit indefinitely and the customer never learns it was not accepted — which is the outcome
// this whole feature exists to prevent.
```

## b · 🔴 Nothing changes retroactively

✅ **No backfill, no column default, no write on render.** The only writers are the two `onChange`
handlers, and both are guarded:

```tsx
onChange={e=>{if(e.target.value!=='')void setAutoRejectMins(parseInt(e.target.value))}}
```

**So a `''` can never reach a write.** ⚠️ **And the API handlers still accept `null`** — that path is
simply unreachable from the UI now. **Deliberately left alone: it is backend, and you said the backend
does not change.**

## c · 🔴 THE DECISION: the mode is written, the picker prompts

**Chosen. Stated, not buried. The mode saves on tap, and the same tap writes the default delay when the
van has none.**

```tsx
                        onClick={()=>{if(effectiveOfflineMode!==m.value){void setOfflineMode(m.value)
                          if(m.value==='no_auto_accept'&&effectiveAutoRejectMins==null)void setAutoRejectMins(OFFLINE_AUTO_REJECT_DEFAULT_MINS)}}}
```

🔴 **THAT IS WHAT KEEPS 2b TRUE.** Choosing the mode IS the operator interaction, so the write happens
then — **never on render.** A van nobody touches keeps NULL. **And it is skipped when a delay is already
stored, so re-selecting the mode never overwrites an existing choice.**

**Why, in order of weight:**

1. 🔴 **DEFERRING THE MODE WRITE WOULD MAKE THE RADIO LIE.** The operator taps "Keep taking orders,
   confirm them yourself", the radio fills in — and nothing is saved until a second, separate choice.
   **This codebase has a recorded incident for exactly that shape: a Resume button that reported success
   for a write it had not awaited.** A control that shows a state it has not persisted is the defect, not
   the fix.
2. **The mode is a real, complete choice on its own.** `no_auto_accept` with no delay is precisely today's
   behaviour on all seventeen vans — orders arrive, nothing auto-rejects. **It is a valid resting state,
   not a broken one**, which is why leaving it is safe.
3. **Both write paths are optimistic-then-revert.** Deferring one would mean holding UI state that
   disagrees with the server until a second action — a second source of truth for one setting.

✅ **THE COST THAT EXISTED BEFORE THIS REVISION IS GONE.** An operator can no longer select the mode and
leave with no delay — the tap that sets the mode sets the delay too, so there is no second decision to
forget.

🔴 **ONE RESIDUAL CASE, AND I AM NAMING IT RATHER THAN LETTING YOU FIND IT.** A van that ALREADY stores
`no_auto_accept` with a NULL delay — set before this build — renders the picker showing `15 mins` while
the column is still NULL, and **the sweep treats NULL as off**, so nothing would auto-reject until the
operator touches the control. **The display and the stored value disagree for that one combination.**
⚠️ **No such van exists today — all seventeen are `pause`** — and the write-on-mode-select closes it for
every van from here on. **Fixing the legacy case would mean writing on render, which 2b forbids.**

## d · The database is untouched

✅ **NULL still means off in the column and in the sweep.** No migration, no default, no change to
`claim_order_for_auto_reject`, which reads `coalesce(override, van) is not null` and skips a NULL van.

## The labels — plain minutes, on your call

**Executed from the real helper:**

```
  stored  5 -> "5 mins"      stored 20 -> "20 mins"
  stored 10 -> "10 mins"     stored 25 -> "25 mins"
  stored 15 -> "15 mins"     stored 30 -> "30 mins"
  default -> 15
```

⚠️ **THE RANGE FORM ("5–10 min") WAS TRIED AND DROPPED ON YOUR INSTRUCTION.** 🔴 **The underlying fact is
unchanged and is now recorded in the copy module rather than lost: the stored value is a FLOOR, not a
deadline** — an order is never rejected sooner than the number shown and may be rejected up to five
minutes later, because the sweep is a scheduled pass and not a timer. **The module carries a standing
instruction that nothing in this feature may phrase it as a countdown**, which is the one thing the
ranges were protecting.

# CHANGE 3 · The layout

**The picker moved INSIDE the second option.** The mode `.map` now returns a `<div className="flex flex-col
gap-2">` wrapping the radio button and, for `no_auto_accept` only when selected, the indented control:

```tsx
                      {m.value==='no_auto_accept'&&effectiveOfflineMode==='no_auto_accept'&&(
                        <div className="pl-6">
```

✅ **The divider is gone** — `mt-1 pt-3 border-t border-slate-100` (dashboard) and `… border-teal-200`
(manage) are both removed. **It reads as part of the option, not as a separate setting.**

---

# PHASE 3 · VERIFICATION

⚠️ **NOTHING WAS RENDERED.** No page opened, no request made, no value written. **Every visual claim is
READ-FROM-SOURCE and unobserved.** `tsc --noEmit` passes and is **not** verification; `next dev` /
`next build` were not run.

| Scenario | What renders / happens |
|---|---|
| **`pause` selected** | The two options and the lead-in. 🔴 **No picker on either surface** — it is inside the other option's block and that option is not selected |
| **`no_auto_accept` just selected, stored NULL** | The tap writes the mode **and** writes 15. The picker shows **`15–20 min`**, which is what is now stored |
| **`no_auto_accept` already stored, delay NULL (legacy)** | The picker shows **`15–20 min`** but the column is NULL and the sweep still skips the van. ⚠️ **Display/stored mismatch, named in §2c. No such van exists today** |
| **…and the operator navigates away** | 🔴 **NOTHING FURTHER IS WRITTEN.** For a fresh selection the delay already saved with the mode; for the legacy case the column stays NULL and behaviour is exactly today's |
| **`no_auto_accept`, stored 15** | The picker showing **`15 mins`** and the normal help line |
| **Switch to `pause` and back** | 🔴 **15 is still there.** Only the picker's `onChange` writes those columns; the mode's writers touch `offline_protection_mode(_override)`, and `set_offline_protection`'s off-branch clears `online_paused_until` and `offline_no_autoaccept_until` — **neither is the delay** |
| 🔴 **A van nobody touches** | 🔴 **NOTHING CHANGES. NO.** No backfill, no default, no render-time write, and the `''` guard makes a null write unreachable. All seventeen keep NULL and nothing auto-rejects |

## Executable line counts

| File | Before | After | − | + |
|---|---|---|---|---|
| `lib/copy/offlineProtection.ts` | 36 | 38 | 1 | 3 |
| `app/dashboard/[token]/page.tsx` | 3196 | 3201 | 10 | 15 |
| `app/manage/[token]/page.tsx` | 8496 | 8503 | 11 | 18 |

⚠️ **The removals are the two `<option value="">Off</option>` lines, the two divider `<div>`s, the two
`key`-moved buttons, and the one renamed export.** **No behaviour was deleted.**

## Marking

| Claim | Status |
|---|---|
| Both surfaces' before-markup, the copy exports, the buzzer precedent, both mode-write paths | ✅ **READ** |
| The resulting render order on both surfaces | ✅ **EXECUTED** — by line number, not by eye |
| No `Off`, no null-write reachable | ✅ **EXECUTED** — three greps, all empty |
| Line counts | ✅ **EXECUTED** — comment-stripped comparison |
| Switching mode preserves the value | ✅ **READ** — every writer of both columns enumerated |
| **What any of it looks like** | ⚠️ **READ-FROM-SOURCE and UNOBSERVED** |
| `tsc --noEmit` passes | ⚠️ **A breakage check, NOT verification** |

**Surfaces, kept apart:** the **dashboard** card (event override, slate) and **Settings → Van** (van
default, teal) were each read and edited on their own. **The KDS renders no offline-protection control and
was not touched.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** every write —
never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. **Files: the three source files
and this report.** The result, the non-ASCII census of characters introduced, and the carrier-aware
variation-selector figures per emoji-presentation base are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
