# Event start/end times — what depends on the 30-minute grid

Date: 14 August 2026
Status: READ-ONLY INVESTIGATION. **No file was edited. No migration written or run. No write of any kind.**
No `next dev`, no `next build`, no commit, no deploy.

🔴 **Pizzeria Gusto was not touched.** Three read-only `SELECT`s were run against the live database
(schema probe, event-time histogram, truck/van/category config). They are reads; nothing was written.

**HEADLINE:** the 30-minute grid exists in **exactly one constant**, `SCHEDULE_TIME_OPTIONS`, used by
**four selects in one file**. **Nothing downstream depends on it.** Storage is a Postgres `time`, the
validator has no grid rule, the slot engine is entirely relative arithmetic, and — the useful surprise —
**the customer-facing collection picker is already an hour dropdown plus a 5-minute-step minute dropdown**,
i.e. the exact control you are proposing, and it already handles off-grid event starts correctly.

⚠️ **Nothing in the prompt arrived garbled. No instruction contradicted another.** Your mid-turn addition
(the schedule importer) is section 1c and section 6 — it turns out to share the same constant, and it is
where the current grid is actively causing a defect today.

---

## 1. THE CONTROL

### a. The Edit event modal's start/end inputs

[app/manage/[token]/page.tsx:7894-7919](app/manage/[token]/page.tsx#L7894-L7919):

```tsx
<div className="sm:col-span-2 grid grid-cols-2 gap-2">
  <div>
    <label className="block text-xs font-bold text-slate-600 mb-1">Start time<span className="text-red-400 ml-0.5">*</span></label>
    <select value={editingEvent.start_time}
      onChange={e => {
        const { start_time, end_time } = applyStartTimeChange(e.target.value, editingEvent.end_time)
        setEditingEvent(p => ({ ...p!, start_time, end_time }))
        if (formErrors.start_time) setFormErrors(p => ({ ...p, start_time: '' }))
      }}
      className={`w-full border rounded-xl px-3 py-2 text-sm text-slate-900 … ${formErrors.start_time ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}>
      <option value="">Select</option>
      {SCHEDULE_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
    {formErrors.start_time && <p className="text-xs text-red-500 mt-1">{formErrors.start_time}</p>}
  </div>
  <div>
    <label className="block text-xs font-bold text-slate-600 mb-1">End time<span className="text-red-400 ml-0.5">*</span></label>
    <select value={editingEvent.end_time}
      onChange={e => { setEditingEvent(p => ({ ...p!, end_time: e.target.value })); if (formErrors.end_time) setFormErrors(p => ({ ...p, end_time: '' })) }}
      className={`w-full border rounded-xl px-3 py-2 text-sm text-slate-900 … ${formErrors.end_time ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}>
      <option value="">Select</option>
      {(editingEvent.start_time ? SCHEDULE_TIME_OPTIONS.filter(t => t > editingEvent.start_time) : SCHEDULE_TIME_OPTIONS).map(t => <option key={t} value={t}>{t}</option>)}
    </select>
    {formErrors.end_time && <p className="text-xs text-red-500 mt-1">{formErrors.end_time}</p>}
  </div>
</div>
```

⚠️ **The end select's option list is DERIVED from the start** (`filter(t => t > start_time)`) — a two-dropdown
rewrite has to decide what that becomes, since "later than the start" can no longer be a filter over one
flat list. It is a **lexicographic string comparison**, which is correct for zero-padded `HH:MM` at any
granularity (section 5).

⚠️ **`applyStartTimeChange` runs on every start change** and is the second grid-adjacent behaviour —
[app/manage/[token]/page.tsx:6442-6452](app/manage/[token]/page.tsx#L6442-L6452):

```tsx
function applyStartTimeChange(newStart: string, currentEnd: string): { start_time: string; end_time: string } {
  if (!newStart) return { start_time: '', end_time: currentEnd }
  if (!currentEnd) {
    const [h, m] = newStart.split(':').map(Number)
    const clamped = Math.min(h * 60 + m + 180, 23 * 60)
    const autoEnd = `${Math.floor(clamped / 60).toString().padStart(2, '0')}:${(clamped % 60).toString().padStart(2, '0')}`
    return { start_time: newStart, end_time: autoEnd }
  }
  if (currentEnd <= newStart) return { start_time: newStart, end_time: '' }
  return { start_time: newStart, end_time: currentEnd }
}
```

**It is already grid-independent** — pure minute arithmetic, `+180` then clamp to `23*60`. A 12:10 start
auto-fills 15:10. 🔴 **But the clamp is `23*60` = 23:00**, matching the constant's last option; with an
hour dropdown reaching 23:xx, a 21:30 start would auto-fill **23:00, not 23:59** — and `23:00 <= 23:30`
is false, so it would stand. Not a break, but a decision the brief will need.

### b. Where the 30-minute options come from

**A generated array — one constant, one definition.**
[app/manage/[token]/page.tsx:6435-6440](app/manage/[token]/page.tsx#L6435-L6440):

```tsx
const SCHEDULE_TIME_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const totalMins = 7 * 60 + i * 30
  const h = Math.floor(totalMins / 60).toString().padStart(2, '0')
  const m = (totalMins % 60).toString().padStart(2, '0')
  return `${h}:${m}`
})
```

**33 options, `07:00` → `23:00`, step 30.** Two constraints hide in that one line and both are worth
naming before you brief the change:

| Hidden constraint | Value | Consequence today |
|---|---|---|
| Earliest selectable time | **07:00** | a 06:00 breakfast pitch **cannot be entered at all** |
| Latest selectable time | **23:00** | a 23:30 finish cannot be entered |
| Granularity | 30 min | the subject of the change |

🔴 **An hour dropdown of 00–23 removes the first two silently.** That is almost certainly what you want,
but it is a **second** behaviour change riding along with the granularity one, and it should be stated in
the brief rather than discovered.

### c. Every other place that renders an event time picker

**Four selects, all in `app/manage/[token]/page.tsx`, all reading the same constant. There is no second
source.** Verified by grep: `SCHEDULE_TIME_OPTIONS` appears at `:6435` (definition) and `:7309`, `:7526`,
`:7604`, `:7905` (uses), plus the four `endTimeOptions` filters at `:7302`, `:7499`, `:7583`, `:7915`.

| # | Site | Surface | Option set | Data it edits |
|---|---|---|---|---|
| 1 | [:7302-7318](app/manage/[token]/page.tsx#L7302-L7318) `renderMobileCard` | **Schedule importer review — mobile card** | `SCHEDULE_TIME_OPTIONS`; end filtered `> start` | `editedEvents` (extracted, not yet saved) |
| 2 | [:7499-7530](app/manage/[token]/page.tsx#L7499-L7530) `renderDesktopRow` | **Schedule importer review — desktop, future rows** | same | `editedEvents` |
| 3 | [:7583-7610](app/manage/[token]/page.tsx#L7583-L7610) historical rows | **Schedule importer review — desktop, past rows** | same | `editedEvents` |
| 4 | [:7894-7919](app/manage/[token]/page.tsx#L7894-L7919) | **Edit event modal** (the one you named) | same | `editingEvent` → `upsert_event` |

**Sites 1–3 are the schedule importer** you flagged mid-turn — they are all inside `renderScheduleReview`
([:7157](app/manage/[token]/page.tsx#L7157)), which edits `editedEvents`, the AI-extracted rows, via
`updateEvent` ([:7195-7209](app/manage/[token]/page.tsx#L7195-L7209)). **`updateEvent` calls the same
`applyStartTimeChange`**, so all four sites share both the option list and the start→end coupling.
**One constant, one helper, four call sites — a single change reaches all of them.** Section 6 covers the
importer in full; it is the place the grid is actively wrong today.

**Not event time pickers, checked and excluded:**

| Location | What it is |
|---|---|
| [app/dashboard/[token]/page.tsx:4416](app/dashboard/[token]/page.tsx#L4416) `<input type="time">` | an **order's collection slot** in the KDS edit modal, only when `editModalSlots.length === 0` |
| [app/manage/[token]/page.tsx:9460](app/manage/[token]/page.tsx#L9460) `<input type="time">` | the **pre-order daily cutoff** (`cutoffStr(gVal)`), a truck setting |
| [app/trucks/[slug]/order/page.tsx:540-580](app/trucks/[slug]/order/page.tsx#L540-L580) | the **customer collection-time picker** — section 4e |

`app/admin/page.tsx` renders no event time control (grep for a `select`/`input` bound to `start_time`
under `app/admin`, `app/dashboard`, `components`: **no matches**).

---

## 2. STORAGE

### a. Column type and format — LIVE-VERIFIED, not inferred

There is **no `CREATE TABLE truck_events`** in `supabase/migrations/` — the table predates the migration
directory (only `alter table` statements exist). So I probed the live database read-only.

**Type — `time`, confirmed by the server's own error:**

```
supabase.from('truck_events').select('id').eq('start_time', 'zzz')
→ {"code":"22007","message":"invalid input syntax for type time: \"zzz\""}
```

**Format and nullability, from 97 live rows:**

| Property | Live value |
|---|---|
| Postgres type | **`time`** (`time without time zone` — INFERRED that it is the `without` variant; the error names only `time`) |
| Wire format via PostgREST | **`HH:MM:SS`**, string length **8 in every non-null row** — e.g. `"17:00:00"` |
| Nullable | 🔴 **YES** — 16 of 97 rows have both `start_time` and `end_time` NULL |
| Minute components, `start_time` | `:00` × 67, `:30` × 14 |
| Minute components, `end_time` | `:00` × 68, `:30` × 11, 🔴 **`:59` × 2** |

🔴 **Off-grid times already exist in production.** The two `23:59:00` rows are `Demo event` rows on
`demo-ekwwmqeej70hd5da4d61wzetcw` and `demo-15yy2ecnkemmchrr8np69p29n8` (both `status: closed`, dated
24 July and 2 August). **Not Gusto, and not operator-entered** — the demo provisioner writes them. But it
proves the column, the engine and every reader already tolerate a non-:00/:30 value in live data.

⚠️ **A `time` column accepts seconds.** Nothing in the proposed change writes them, but note the DB will
happily store `12:10:30`; the grid was never what prevented that.

### b. What exact string the control writes

**`HH:MM` — five characters, no seconds.** The chain:

1. **Load** — the modal opener strips seconds:
   [app/manage/[token]/page.tsx:6772](app/manage/[token]/page.tsx#L6772) (and identically at `:6984`,
   `:7005`, `:7054`, `:6607`):
   ```tsx
   start_time: ev.start_time ? ev.start_time.substring(0, 5) : '',
   end_time:   ev.end_time   ? ev.end_time.substring(0, 5)   : '',
   ```
   **This is why the select matches an option at all** — `'17:00:00'` would match none.
2. **Edit** — the select writes `e.target.value`, one of the 33 `HH:MM` strings, into `editingEvent`.
3. **Save** — [app/manage/[token]/page.tsx:6675](app/manage/[token]/page.tsx#L6675):
   ```tsx
   await api('upsert_event', { ...editingEvent, latitude: lat, longitude: lng })
   ```
   The whole `EditingEvent` object is spread; `start_time` goes over the wire as `"17:00"`.
4. **Write** — [app/api/manage/route.ts:670](app/api/manage/route.ts#L670) (update) and
   [:687](app/api/manage/route.ts#L687) (insert) pass `start_time, end_time` **straight into the
   `update`/`insert` object with no transformation**. Postgres coerces `'17:00'` → `17:00:00`.

**No normalisation, no rounding, no snapping anywhere on this path.** The control's option list is the
*only* thing that has ever constrained the value.

The importer path is the same shape —
[app/manage/[token]/page.tsx:6743-6744](app/manage/[token]/page.tsx#L6743-L6744) sends
`start_time: ev.start_time || ''` to the same `upsert_event`.

### c. Fixed-length / `:00`-`:30`-suffix parsing

**Grepped `slice`, `substring`, `split` on both fields across `lib`, `app`, `components`. Every hit is
one of three safe shapes, and none assumes a `:00`/`:30` suffix:**

| Shape | Example | Grid-safe? |
|---|---|---|
| `slice(0,5)` / `substring(0,5)` — strip seconds | [lib/time-utils.ts:5](lib/time-utils.ts#L5) `formatTime`; [lib/slot-bookings.ts:100](lib/slot-bookings.ts#L100); [app/manage/[token]/page.tsx:6772](app/manage/[token]/page.tsx#L6772); [app/dashboard/[token]/kds/page.tsx:803](app/dashboard/[token]/kds/page.tsx#L803) | ✅ takes `HH:MM` regardless of the minute value |
| `split(':').map(Number)` → `h*60+m` | [app/trucks/[slug]/order/page.tsx:565](app/trucks/[slug]/order/page.tsx#L565), [:1292](app/trucks/[slug]/order/page.tsx#L1292), [:2070](app/trucks/[slug]/order/page.tsx#L2070); [app/dashboard/[token]/kds/page.tsx:782](app/dashboard/[token]/kds/page.tsx#L782), [:801](app/dashboard/[token]/kds/page.tsx#L801); [app/api/menu/[truckId]/route.ts:246](app/api/menu/[truckId]/route.ts#L246); [app/api/orders/submit/route.ts:947](app/api/orders/submit/route.ts#L947); [components/dashboard/AddOrderPanel.tsx:38](components/dashboard/AddOrderPanel.tsx#L38) | ✅ full minute precision; `[2]` (seconds) is simply dropped |
| String comparison | section 5 | ✅ with one caveat |

🔴 **`slice(0, 5)` is the only fixed length in the codebase, and it is the RIGHT one** — it removes
seconds and keeps the whole minute field. **No `slice(0, 3)`, no `slice(3)`, no hour-only truncation of a
stored time exists.** The one place that takes the hour alone is `availableHours`
([app/trucks/[slug]/order/page.tsx:547](app/trucks/[slug]/order/page.tsx#L547)), which destructures
`const [startH] = ...split(':').map(Number)` deliberately — section 4e.

---

## 3. VALIDATION

### a. `hasValidEventTimes`, in full

[lib/time-utils.ts:36-42](lib/time-utils.ts#L36-L42):

```ts
/** Both event times present + valid HH:MM — the precondition for an event going LIVE (confirmed/open). The
 *  slot/collection/capacity engine needs BOTH (start = floor, end = the slot-range/"available until" bound);
 *  a null time can't project slots. DRAFTS (unconfirmed) may omit them — this gates only the live transition. */
export function hasValidEventTimes(start?: string | null, end?: string | null): boolean {
  const ok = (t?: string | null) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d/.test(t)
  return ok(start) && ok(end)
}
```

🔴 **It constrains NEITHER to a grid NOR to an ordering.** It checks one thing per value: *is this a
syntactically valid 24-hour clock time*. `[0-5]\d` accepts **every minute from 00 to 59**, so `12:07`,
`12:10` and `23:59` all pass today, unchanged.

⚠️ **Three things it deliberately does not do**, all pre-existing and all unaffected by the change:

1. **It does not check `end > start`.** `hasValidEventTimes('20:00', '09:00')` returns `true`. Ordering is
   enforced *only* by the UI's `filter(t => t > start_time)` — **which the two-dropdown rewrite removes**.
   🔴 **This is the single most important consequence in this report:** the option-list filter is currently
   the only thing standing between an operator and an end-before-start event, and a filtered flat list has
   no equivalent in an hour+minute pair. **The brief must say what replaces it.**
2. **The regex is not anchored at the end** (`/^…:[0-5]\d/`, no `$`), so `'17:00:00'` passes — intentional,
   since server paths compare DB values.
3. **It permits `00:00`–`06:59` and `23:01`–`23:59`**, which the current dropdown cannot produce. The
   validator is already wider than the control.

### b. Every server-side save path that validates event times

**Four call sites, three routes. All call the same `hasValidEventTimes`; none adds a grid or ordering rule.**

| # | Route and line | Trigger | Rule | Message |
|---|---|---|---|---|
| 1 | [app/api/manage/route.ts:667](app/api/manage/route.ts#L667) | `upsert_event`, **edit** | only if `status` is `confirmed`/`open` (`isLive`) | *"A live event needs a start and end time…"* |
| 2 | [app/api/manage/route.ts:675](app/api/manage/route.ts#L675) | `upsert_event`, **create** | **always** — manual events auto-confirm | *"Add a start and end time before this event can go live."* |
| 3 | [app/api/dashboard/action/route.ts:1079](app/api/dashboard/action/route.ts#L1079) | dashboard time edit | only if `isLive` | same as 1 |
| 4 | [app/api/events/action/route.ts:56](app/api/events/action/route.ts#L56) and [:126](app/api/events/action/route.ts#L126) | **confirm** / **open** transition | always | *"Add a start and end time before this event can go live."* |

**Client-side, `validateEventForm`** ([app/manage/[token]/page.tsx:6623-6631](app/manage/[token]/page.tsx#L6623-L6631))
checks **presence only** — `if (!form.start_time)`. No format check, no ordering check.

🔴 **Net: nothing server-side would reject a `12:10` event today.** The grid is a UI convention with no
enforcement behind it.

---

## 4. 🔴 THE SLOT ENGINE

### a. How slot boundaries are derived from `start_time`

**One generator, 41 lines, entirely relative.** [lib/slot-generation.ts:24-41](lib/slot-generation.ts#L24-L41):

```ts
export function generateCollectionTimes(
  startTime: string,
  endTime: string,
  intervalMins: number,
  slotDurationMins: number,
  graceAfterEndMins: number = 0
): CollectionTimeRow[] {
  const start = toMins(startTime)
  const end = toMins(endTime)
  const result: CollectionTimeRow[] = []

  for (let mins = start; mins <= end + graceAfterEndMins; mins += intervalMins) {
    const prodMins = Math.floor(mins / slotDurationMins) * slotDurationMins
    result.push({ collection_time: toStr(mins), production_slot: toStr(prodMins) })
  }

  return result
}
```

**Two different anchors, and the distinction is the whole answer:**

| Field | Anchor | Off-grid safe? |
|---|---|---|
| `collection_time` | 🔴 **the event start** — `mins = start; mins += intervalMins` | ✅ **completely.** Any start yields a clean interval walk from it |
| `production_slot` | 🔴 **MIDNIGHT** — `Math.floor(mins / slotDurationMins) * slotDurationMins` | ⚠️ this is the only absolute-grid arithmetic in the engine |

Called from three places, all with the same shape:
[app/api/slots/[truckId]/route.ts:148](app/api/slots/[truckId]/route.ts#L148),
[app/api/dashboard/route.ts:408](app/api/dashboard/route.ts#L408),
[lib/orders/place-in-slot.ts:138](lib/orders/place-in-slot.ts#L138).

**Live config — verified, all fourteen trucks including Gusto are identical:**
`collection_interval_mins = 5`, `slot_duration_mins = 10`. Gusto's Van1: `kitchen_capacity = 2`,
`capacity_window_mins = 5`. Gusto's cooking categories: Pizza and Specials, `prep_secs = 300` (5 min),
`batch_size = 2`.

🔴 **AND THE MIDNIGHT ANCHOR TURNS OUT TO BE DEAD.** `collection_times` has **0 rows for every truck**
(live-verified, whole table). That matters because the read path re-keys:

[app/api/slots/[truckId]/route.ts:155-160](app/api/slots/[truckId]/route.ts#L155-L160):
```ts
const timeMap: Record<string, string> = {}
;(staticTimes ?? []).forEach(r => { timeMap[r.collection_time] = r.production_slot })
const times = rawTimes.map(t => ({
  ...t,
  production_window_key: timeMap[t.collection_time] || t.collection_time,
}))
```

With an empty table the map is empty, so **`production_window_key` degenerates to `collection_time`** —
the unfloored value. And the write side keys the same way:
[lib/slot-bookings.ts:254](lib/slot-bookings.ts#L254) `const productionSlot = timeMap[ct] || ct`.

**The floored `production_slot` field has no live reader.** Its three consumers are
`projectOvenOccupancy` ([lib/slot-availability.ts:285-287](lib/slot-availability.ts#L285-L287)),
`projectOrderTailWindow` ([:350](lib/slot-availability.ts#L350)) and
`getBatchCountsByCollectionTime` ([lib/slot-bookings.ts:346](lib/slot-bookings.ts#L346)) — **grep finds no
caller for any of the three** outside a `@deprecated` wrapper. `deriveProductionSlot`, the same floor()
expressed standalone, is **imported at [app/api/dashboard/action/route.ts:23](app/api/dashboard/action/route.ts#L23)
and never called** — a dead import.

**Live enforcement runs through `projectBackwardOccupancy` + `fitOrderBackward`**
([app/api/slots/[truckId]/route.ts:255](app/api/slots/[truckId]/route.ts#L255) →
[lib/slot-availability.ts:136](lib/slot-availability.ts#L136), [:161](lib/slot-availability.ts#L161)),
which read `productionSlotUnits` keyed by raw collection time and compute cooking windows as
`deadline − k·prepMins` — **pure relative arithmetic with no absolute grid**.

**Confirmed against live data:** the `production_slot_usage` minute histogram is
`{00:17, 05:8, 10:8, 15:7, 20:5, 25:10, 30:7, 35:6, 40:7, 45:4, 50:7, 55:5, 59:1}` — **every 5-minute
value, not multiples of 10.** If the floor()ed key were live, only `:00,:10,:20,:30,:40,:50` could appear.

### b. TRACE — event starts 12:10, `slot_duration_mins = 10`

Real config: `intervalMins = 5`, `slotDurationMins = 10`, `GRACE_MINS = 30`. `12:10` → `730`.

| Iteration | `mins` | `collection_time` | `Math.floor(mins/10)*10` | `production_slot` | **live window key** |
|---|---|---|---|---|---|
| 1 | 730 | **12:10** | `floor(73.0)*10 = 730` | **12:10** | **12:10** |
| 2 | 735 | **12:15** | `floor(73.5)*10 = 730` | **12:10** | **12:15** |
| 3 | 740 | **12:20** | `floor(74.0)*10 = 740` | **12:20** | **12:20** |

**The first three collection boundaries are 12:10, 12:15, 12:20 — exactly as clean as a 12:00 start.**
730 is divisible by 10, so even the vestigial `production_slot` lands on the event start. **Nothing
degrades.**

Capacity, traced with Gusto's real numbers (`prep = 5`, `batch = 2`, `capacity_window_mins = 5`,
`kitchen_capacity = 2`), one pizza at the 12:10 slot:
`eventStartMins = 730`; `loadRunsOffFront` ([lib/slot-availability.ts:904](lib/slot-availability.ts#L904))
asks `slotMins − nw·prep < max(eventStartMins − prep, nowMins)` → `730 − 1·5 = 725 < max(725, now)` →
`725 < 725` is **false** → **fits**. Byte-identical in shape to a 17:00 start. **The `− prep` and
`− capacityStep` allowances are relative offsets, so they follow the start wherever it lands.**

### c. TRACE — event starts 12:05, `slot_duration_mins = 10`

`12:05` → `725`.

| Iteration | `mins` | `collection_time` | `Math.floor(mins/10)*10` | `production_slot` |
|---|---|---|---|---|
| 1 | 725 | **12:05** | `floor(72.5)*10 = 720` | 🔴 **12:00** — five minutes *before* the event starts |
| 2 | 730 | **12:10** | `730` | 12:10 |
| 3 | 735 | **12:15** | `730` | 12:10 |

**Answer to the three options you offered: none of them. It does not round, it does not error, and it
does not produce a partial slot.**

- **The collection time is never rounded** — `12:05` is emitted verbatim as the first bookable slot.
- **There is no error path.** `generateCollectionTimes` has no validation, no guard, no throw.
- **What actually happens is subtler:** the *first row's* `production_slot` names a window
  (`12:00`) that begins before the event opens. It is not "partial" — it is a full 10-minute window whose
  first half is outside the event.

🔴 **And it has no live effect, because that field is dead** (section 4a). The live key for the 12:05
collection time is `12:05` itself, and the backward model reasons in offsets from it. **Off-grid starts
are already safe on this path.**

⚠️ **The one caveat, stated precisely:** this holds because `production_slot` currently has no reader.
**If anyone repopulates `collection_times`, or revives `projectOvenOccupancy`, the midnight floor becomes
live again** and a `:05`/`:15`/`:25`/`:35`/`:45`/`:55` start would key its first slot into a pre-open
window. **[lib/slot-generation.ts:36](lib/slot-generation.ts#L36) is the one line to note in the brief** —
not to change now, but as the known landmine.

### d. Does anything assume `:00` or `:30`?

**Systematic grep across `lib/` and `app/` for `Math.floor` / `Math.ceil` / `Math.round` / `%` in any
minute, slot, window or time context — 40 hits, every one classified:**

| Pattern | Where | Grid assumption? |
|---|---|---|
| `% 60`, `Math.floor(mins/60)` | 8 sites — `toStr`-style formatters in [lib/slot-generation.ts:22](lib/slot-generation.ts#L22), [lib/slots.ts:23](lib/slots.ts#L23), [lib/preorder.ts:141](lib/preorder.ts#L141), [lib/slot-availability.ts:682](lib/slot-availability.ts#L682), [lib/provision-demo-event.ts:86](lib/provision-demo-event.ts#L86) | ❌ none — minutes→`HH:MM` |
| `((mins % 1440) + 1440) % 1440` | [lib/slot-availability.ts:681](lib/slot-availability.ts#L681), [lib/preorder.ts:80](lib/preorder.ts#L80) | ❌ none — day wrap |
| `Math.round(capacityWindowMins ?? 5)` | [lib/slot-availability.ts:121](lib/slot-availability.ts#L121), [:633](lib/slot-availability.ts#L633), [:678](lib/slot-availability.ts#L678), [lib/capacity-breach.ts:78](lib/capacity-breach.ts#L78), [lib/slot-display.ts:89](lib/slot-display.ts#L89) | ❌ none — a **duration**, from `truck_vans` |
| `Math.round(cfg.secs / 60)` | [lib/slot-availability.ts:651](lib/slot-availability.ts#L651), [:716](lib/slot-availability.ts#L716), [:902](lib/slot-availability.ts#L902) | ❌ none — prep seconds→minutes |
| `Math.ceil(N / batch)` | [lib/slot-availability.ts:652](lib/slot-availability.ts#L652), [:718](lib/slot-availability.ts#L718), [lib/slot-capacity.ts:79](lib/slot-capacity.ts#L79) | ❌ none — batch counting |
| 🔴 `Math.floor(mins / slotDurationMins) * slotDurationMins` | **[lib/slot-generation.ts:36](lib/slot-generation.ts#L36)** and its twin **[lib/slot-bookings.ts:49](lib/slot-bookings.ts#L49)** | 🔴 **the ONLY absolute-grid arithmetic in the repo** — and it snaps to `slot_duration_mins` (10), **not to 30**. Dead per 4a |

**Grep for a literal `30` used as a time grid: the only hit is `i * 30` in `SCHEDULE_TIME_OPTIONS`
itself.** No `% 30` exists anywhere. No `'HH:00'` string construction exists anywhere.

🔴 **Conclusion: the 30-minute grid is a property of one `Array.from` call and of nothing else in the
system.** The engine has never known about it.

⚠️ **Two hardcoded values that are grid-adjacent and worth knowing:**
- `generateSlots(start_time, end_time, 5)` — [app/api/manage/route.ts:721](app/api/manage/route.ts#L721)
  and [:366](app/api/manage/route.ts#L366) write `slot_capacity` rows at a **hardcoded 5-minute** interval
  from the event start. Off-grid safe (it walks from `start`), but it means **the `slot_capacity` grid is
  5-minute regardless of the truck's `collection_interval_mins`**.
- `GRACE_MINS = 30` — [app/api/slots/[truckId]/route.ts:145](app/api/slots/[truckId]/route.ts#L145). A
  **duration** added to the end, not a grid. Unaffected.

### e. 🔴 The customer collection-time picker — IT IS ALREADY THE CONTROL YOU WANT

**Yes, it derives from the event start. No, a `:10` start would not shift anything off round numbers —
because the minute list is a fixed constant that is only ever *filtered*, never *generated*.**

[app/trucks/[slug]/order/page.tsx:540-580](app/trucks/[slug]/order/page.tsx#L540-L580):

```tsx
// Calculate available hours from event times (customer-facing only)
const availableHours = useMemo(() => {
  if (!event?.start_time || !event?.end_time) {
    // Fallback if no event hours: 10:00-23:00
    return Array.from({length:14}, (_,i) => String(i+10).padStart(2,'0'))
  }
  const [startH] = event.start_time.split(':').map(Number)
  const [endH] = event.end_time.split(':').map(Number)
  const hours = []
  for (let h = startH; h <= endH; h++) hours.push(String(h).padStart(2, '0'))
  return hours
}, [event])

// Filter minutes based on first/last hour of event
const availableMinutes = useMemo(() => {
  const allMinutes = ['00','05','10','15','20','25','30','35','40','45','50','55']
  if (!event?.start_time || !event?.end_time || !slotHour) return allMinutes
  const [startH, startM] = event.start_time.split(':').map(Number)
  const [endH, endM] = event.end_time.split(':').map(Number)
  const selectedH = parseInt(slotHour)
  if (selectedH === startH) return allMinutes.filter(m => parseInt(m) >= startM)   // first hour
  if (selectedH === endH)   return allMinutes.filter(m => parseInt(m) <= endM)     // last hour
  return allMinutes
}, [...])
```

🔴 **This is an hour dropdown plus a 5-minute-step minute dropdown — precisely the control you are
proposing for the operator side, already shipped, already live for Gusto's customers.**

Traced for a **12:10** start and a 21:00 end:

| Selection | Options offered | Correct? |
|---|---|---|
| Hour | `12 … 21` (`startH = 12`, `endH = 21`) | ✅ |
| Minutes, hour = 12 | `startH` branch → `≥ 10` → **`10,15,20,25,…,55`** | ✅ the 12:00 and 12:05 slots are correctly withheld |
| Minutes, hours 13–20 | all twelve | ✅ |
| Minutes, hour = 21 | `endH` branch → `≤ 0` → **`00`** | ✅ |

**The options stay on round 5-minute numbers.** They do not shift, because they are never derived from
the start — only clipped by it. And the server agrees: `generateCollectionTimes(12:10, 21:00, 5, 10)`
emits `12:10, 12:15, 12:20 …`, the same set.

🔴 **THE CONSTRAINT THIS IMPLIES, AND IT IS THE REASON TO PICK 5-MINUTE STEPS:**
`availableMinutes` is a **fixed list of multiples of 5**. The server walks from the event start in
`collection_interval_mins` (5) steps. **The two agree if and only if the event start's minute is a
multiple of 5.**

- **Start 12:10 or 12:05** → server offers `12:10, 12:15, …`; picker offers `10, 15, …`. ✅ **identical.**
- **Start 12:07** → server offers `12:07, 12:12, 12:17 …`; picker offers `10, 15, 20 …`. 🔴 **DISJOINT —
  every customer selection would be a time the server never generated.**

**Your proposed `00,05,…,55` minute dropdown is therefore exactly right and exactly safe. A free-text or
1-minute-step control would not be.** ⚠️ **Say this constraint out loud in the build brief** — it is the
difference between a change with no downstream risk and one that silently breaks customer ordering.

⚠️ **One residual, INFERRED, not caused by this change:** `availableHours` runs `h = startH; h <= endH`,
so an event ending **00:30** (`endH = 0`) after a **19:00** start yields an empty hour list. Pre-existing;
the current 07:00–23:00 dropdown cannot express it, but **an hour dropdown of 00–23 could**, which would
make a latent bug reachable. Worth a line in the brief.

---

## 5. ARE EVENT TIMES COMPARED AS STRINGS?

**Yes — in six places. Five are safe at any granularity; one is already off by a minute and one is a
genuine latent risk in the importer.**

| # | Site | Comparison | Verdict |
|---|---|---|---|
| 1 | [app/manage/[token]/page.tsx:7302](app/manage/[token]/page.tsx#L7302), [:7499](app/manage/[token]/page.tsx#L7499), [:7583](app/manage/[token]/page.tsx#L7583), [:7915](app/manage/[token]/page.tsx#L7915) | `SCHEDULE_TIME_OPTIONS.filter(t => t > ev.start_time)` | ✅ **safe.** Zero-padded `HH:MM` sorts lexicographically exactly as it sorts chronologically. It works for `12:10` as well as `12:00`. **But it is the ordering guard that a two-dropdown rewrite deletes** — section 3a |
| 2 | [app/manage/[token]/page.tsx:6450](app/manage/[token]/page.tsx#L6450) | `if (currentEnd <= newStart) return { …, end_time: '' }` | ✅ **safe**, same reason. Clears a now-invalid end |
| 3 | 🔴 [lib/schedule-extract.ts:199](lib/schedule-extract.ts#L199) | `if (end && start && end <= start) return ''` | ⚠️ **safe only while the model zero-pads.** The prompt at [:57-58](lib/schedule-extract.ts#L57-L58) says *"Times MUST be `HH:MM`"*, but nothing validates it. An unpadded `'9:30'` compares as **greater** than `'17:00'`, so a 9:30–17:00 event would keep its end and a 17:00–9:30 one would not be caught. **Pre-existing, unrelated to granularity, but it lives in the importer you asked me to review** |
| 4 | 🔴 [app/dashboard/[token]/kds/page.tsx:267-269](app/dashboard/[token]/kds/page.tsx#L267-L269) and [app/dashboard/[token]/page.tsx:820-821](app/dashboard/[token]/page.tsx#L820-L821) | `const currentTime = new Date().toTimeString().slice(0, 5)` then `e.start_time <= currentTime` | ⚠️ **compares `'17:00:00'` (DB, 8 chars) against `'17:00'` (5 chars).** A prefix sorts *lower*, so `'17:00:00' <= '17:00'` is **false** at exactly 17:00 and only becomes true at 17:01. **The stale-auto-open check fires up to a minute late, today.** Granularity-independent — it is a seconds/length mismatch, not a grid one. ⚠️ Also uses **device** local time, not the event tz that [lib/time-utils.ts:28](lib/time-utils.ts#L28) exists to provide |
| 5 | [app/manage/[token]/page.tsx:7146-7148](app/manage/[token]/page.tsx#L7146-L7148) | `` `${a.event_date}T${a.end_time \|\| a.start_time \|\| '00:00'}` `` then `localeCompare` | ✅ **safe.** Sorting only; the `'00:00'` fallback is shorter than `HH:MM:SS` but sorts as the earliest either way |
| 6 | [supabase/functions/auto-event-scheduler/index.ts:73](supabase/functions/auto-event-scheduler/index.ts#L73) | `String(e.end_time).slice(0, 5) <= currentTime` | ✅ **safe and correct** — normalises to `HH:MM` on both sides first. **This is the one that does it right**, and the header comment at [:8-10](supabase/functions/auto-event-scheduler/index.ts#L8-L10) documents the UTC-vs-local bug it fixed. ⚠️ Compare with #4, which never got the same treatment |

Also checked and safe: `.order('start_time', { ascending: true })`
([app/api/slots/[truckId]/route.ts:90](app/api/slots/[truckId]/route.ts#L90)) sorts in Postgres as a
`time`, not a string. `pickDefaultEventByTime` ([lib/time-utils.ts:90-91](lib/time-utils.ts#L90-L91))
builds `new Date(\`${event_date}T${time}\`)` and compares **milliseconds** — full precision, grid-agnostic.

🔴 **None of the six breaks on a `:10` or `:25` value.** Lexicographic comparison of zero-padded `HH:MM`
is chronologically correct at **any** granularity — the grid was never what made these work. The two real
defects (#3's padding assumption, #4's length mismatch) are independent of it and exist today.

---

## 6. 🔴 THE SCHEDULE IMPORTER — WHERE THE GRID IS ALREADY WRONG

You added this mid-turn. It is the strongest argument for the change, because **the importer can already
produce times the dropdown cannot display.**

**The extractor is not grid-constrained.** [lib/schedule-extract.ts:57-58](lib/schedule-extract.ts#L57-L58):

```
- Times MUST be "HH:MM" in 24-hour format
- "5pm" → "17:00", "5:30pm" → "17:30"
```

**Nothing snaps to :00/:30.** A pub page reading *"we're there 5:45 till 9"* yields `start_time: "17:45"`.
The post-processing at [lib/schedule-extract.ts:189-202](lib/schedule-extract.ts#L189-L202) passes
`start_time` through **verbatim** (`start_time: ev.start_time ?? ''`) and only nulls a non-increasing end.

That value lands in `editedEvents` and is rendered by the three review-grid selects
([:7309](app/manage/[token]/page.tsx#L7309), [:7526](app/manage/[token]/page.tsx#L7526),
[:7604](app/manage/[token]/page.tsx#L7604)) as `<select value="17:45">` — **against an option list that
contains no `17:45`.**

**What the operator sees — INFERRED, I rendered nothing:**

1. The select's `value` matches no `<option>`, so the browser leaves `selectedIndex = -1` and the control
   **displays blank** (or the `—:—` placeholder). **The extracted 17:45 is invisible.**
2. The amber "needs attention" flags do **not** fire: `rowAmber` and `isEv`
   ([:7292](app/manage/[token]/page.tsx#L7292), [:7158](app/manage/[token]/page.tsx#L7158)) test
   `!ev.start_time`, and `'17:45'` is truthy. **So the row looks incomplete but is not flagged as
   incomplete** — the two signals disagree.
3. If the operator saves without touching it, `editedEvents` still holds `17:45`, so
   [:6743](app/manage/[token]/page.tsx#L6743) sends **17:45** to `upsert_event` and the DB stores
   `17:45:00`. **The stored value is correct and the screen never showed it.**
4. If the operator *does* open the dropdown to "fix the blank", they can only pick `17:30` or `18:00` —
   **the UI forces a wrong time onto correctly-extracted data.**

🔴 **So the 30-minute grid is not merely limiting on the importer — it silently hides and can corrupt
valid extracted times.** An hour + 5-minute-step pair displays `17:45` correctly and removes the whole
failure mode.

⚠️ **Same exposure, same cause, in the other ingest paths** — none of which normalises times either:
[scripts/import-hatchesup-schedule.js:703-704](scripts/import-hatchesup-schedule.js#L703-L704)
(`start_time: ev.start_time || null`) and
[app/api/inbound-schedule/route.ts:52-53](app/api/inbound-schedule/route.ts#L52-L53), [:219-220](app/api/inbound-schedule/route.ts#L219-L220).
**Off-grid rows can already reach the DB without ever passing through a dropdown.**

---

## 7. WHAT THE CHANGE WOULD ACTUALLY TOUCH

**Summary of dependency, so the brief can be scoped:**

| Layer | Depends on the 30-min grid? |
|---|---|
| `truck_events.start_time` / `end_time` (`time`, nullable) | ❌ no |
| `hasValidEventTimes` + all four server validators | ❌ no — `[0-5]\d` already accepts every minute |
| `generateCollectionTimes` collection boundaries | ❌ no — walks from the start |
| `generateCollectionTimes` `production_slot` (midnight floor) | ⚠️ snaps to `slot_duration_mins`, **not 30**, and **has no live reader** |
| `projectBackwardOccupancy` / `fitOrderBackward` (live enforcement) | ❌ no — relative offsets only |
| `generateSlots` → `slot_capacity` | ❌ no — walks from the start at a hardcoded 5 |
| Customer collection picker | ❌ no — **already hour + 5-minute steps** |
| Auto-open / auto-close (app + edge fn) | ❌ no |
| Display (`formatTime`, `formatTimeRange`) | ❌ no |
| **`SCHEDULE_TIME_OPTIONS` + 4 selects** | 🔴 **yes — this is the entire dependency** |

**Four things the brief must decide, none of them discovered by me casually — each is a behaviour the
current control provides and a two-dropdown pair does not:**

1. 🔴 **What replaces `filter(t => t > start_time)`.** It is the **only** end-after-start guard in the
   system; `hasValidEventTimes` does not check ordering (§3a) and no server route does either.
2. 🔴 **The 07:00 floor and 23:00 ceiling disappear** with a 00–23 hour list. Almost certainly desirable —
   but it is a second change, and it makes the `availableHours` wrap-around bug (§4e) reachable.
3. ⚠️ **`applyStartTimeChange`'s `Math.min(…, 23*60)` clamp** still pins the auto-end at 23:00.
4. ⚠️ **Keep the minute step at 5.** §4e shows why: the customer picker's minute list is a hard-coded
   `['00','05',…,'55']`, and the server walks the event start in `collection_interval_mins = 5` steps. A
   start whose minute is not a multiple of 5 makes the two lists **disjoint**.

---

## 8. WHAT I HAVE NOT VERIFIED

1. **Nothing was rendered. No browser, no page.** Section 6's account of a `<select>` whose `value`
   matches no option is **INFERRED** from the DOM spec and React's controlled-select behaviour, not
   observed. **Worth one look at a real import with an off-grid time before you rely on the detail.**
2. **No slot request was made.** The 12:10 and 12:05 traces are hand-executions of
   [lib/slot-generation.ts:35-38](lib/slot-generation.ts#L35-L38) against live config values. The code was
   not run.
3. **The "dead code" claims are grep-based.** `projectOvenOccupancy`, `projectOrderTailWindow`,
   `getBatchCountsByCollectionTime` and `deriveProductionSlot` have no caller **that grep over
   `lib/`, `app/`, `components/` can see**. A dynamic or string-keyed call would not show up. **INFERRED**,
   though the live `production_slot_usage` histogram (§4a) independently corroborates it.
4. **`time without time zone` is INFERRED.** The server's error names only `time`; I did not read
   `information_schema` (no SQL execution path is available through PostgREST).
5. **The 97-row histogram is every `truck_events` row that exists**, but it is a snapshot taken today. It
   proves off-grid values are *tolerated*; it does not prove every downstream reader has *exercised* one —
   the two `23:59` rows are demo events with `status: closed`, so they may never have been ordered against.
6. **I did not test the ordering-guard removal.** Claim #1 in section 7 is reasoning about what the four
   `filter` calls do, not a demonstration that an end-before-start event can be saved. ⚠️ **It would take
   one deliberate attempt against a test truck to confirm** — and it should be confirmed before the
   rewrite, since it is the one place the change could make things worse rather than better.
7. **No Gusto row was read beyond its truck config, van and menu categories**, and nothing was written
   anywhere.
