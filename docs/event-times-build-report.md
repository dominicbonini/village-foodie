# Event times — hour + minute dropdowns

Date: 14 August 2026
Status: BUILT. **Two files changed: `app/manage/[token]/page.tsx` and `lib/time-utils.ts`.**
`tsc --noEmit` clean. Non-ASCII census **176 → 176** and **3 → 3**, no class gained or lost in either.

No `next dev`, no `next build`, no commit, no deploy, no migration. Four read-only `SELECT`s were run to
answer item 3b against real data.

🔴 **Pizzeria Gusto: all 34 of its rows that hold both times pass the new server rule** — run through the
real shipped `hasValidEventTimes` via jiti, not reasoned about (section 8). Its stored times are untouched;
this change writes nothing.

**Nothing in the prompt arrived garbled. No instruction contradicted another.** Item 1's "STOP if one
component cannot serve all four" did not trigger, but the markup forced a design decision that is worth
reading before the rest — section 1.

---

## 1. ONE SHARED CONTROL — and it renders ONE time, not a start/end pair

**`EventTimeSelect`, [app/manage/[token]/page.tsx:6514](app/manage/[token]/page.tsx#L6514).** All four
sites use it. **Eight call sites** (four sites × start and end), zero duplicated option lists.

🔴 **A start+end pair component was impossible, and this is a fact about the markup, not a preference.**
On the importer's desktop grid the two times live in **separate `<td>` cells**
([:7692-7710](app/manage/[token]/page.tsx#L7692-L7710)) with a van column able to sit between them. A
component spanning both would have to emit two `<td>`s, and a React component returning a fragment of
sibling cells cannot carry the per-cell `style`/`pointerEvents` each site sets differently.

**One-time granularity is the only shape all four can share**, so I did not stop — the instruction's
condition was *"if one component cannot serve all four"*, and one does. Each site renders it twice.

| Site | Where | Start | End |
|---|---|---|---|
| 1 | Importer review — **mobile card** | [:7469](app/manage/[token]/page.tsx#L7469) | [:7479](app/manage/[token]/page.tsx#L7479) |
| 2 | Importer review — **desktop, future rows** | [:7693](app/manage/[token]/page.tsx#L7693) | [:7702](app/manage/[token]/page.tsx#L7702) |
| 3 | Importer review — **desktop, past rows** | [:7778](app/manage/[token]/page.tsx#L7778) | [:7787](app/manage/[token]/page.tsx#L7787) |
| 4 | **Edit event modal** | [:8080](app/manage/[token]/page.tsx#L8080) | [:8100](app/manage/[token]/page.tsx#L8100) |

**The per-site differences are absorbed as props, not as copies:** `className` (each site keeps its own
`fieldCls()` / `ci()` / modal classes verbatim), `placeholder`, `label` (screen-reader name — the grid
sites have no visible `<label>`), `minExclusive`, `disabled`.

⚠️ **`SCHEDULE_TIME_OPTIONS` is deleted, not deprecated.** Grep across the repo finds **no consumer** —
the only three matches are comments, two of which are mine describing the removal. The third is a stale
mention in [lib/kitchen-capacity.ts:99](lib/kitchen-capacity.ts#L99) (*"Mirrors the SCHEDULE_TIME_OPTIONS
pattern"*) which now names a symbol that no longer exists. **Not edited — it is an unrelated file and a
comment — but it will confuse the next reader.**

---

## 2. THE MINUTE STEP IS 5, AND IT IS NOT REACHABLE FROM OUTSIDE

[app/manage/[token]/page.tsx:6474-6475](app/manage/[token]/page.tsx#L6474-L6475):

```tsx
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
```

**Module-level constants. `EventTimeSelect` takes no step, granularity or minute-list prop**, so there is
no signature through which a call site could ask for a different one. The constraint is recorded above
them in a comment naming both halves of the reason — the customer picker's hardcoded `['00','05',…,'55']`
and the server's `collection_interval_mins` walk — so the next person to "make it flexible" reads why
first.

---

## 3. THE END-AFTER-START GUARD

### 3c — what `applyStartTimeChange` did, quoted BEFORE anything changed

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

**Four branches:** clearing the start keeps the end; **no end yet → auto-fill start + 3 h, clamped to
23:00**; **an end at or before the new start is CLEARED to `''`**; otherwise the end stands.

**🔴 The third branch — the one the instruction names — is byte-identical. I did not touch it.**

**One branch did have to change, and item 5 is why.** The `Math.min(…, 23 * 60)` ceiling was the old
dropdown's last option. With hours widened to 00–23 and minutes at a 5 step, **every start from 20:05
onward clamps to 23:00** — so a **23:30** start would have auto-filled **23:00, an end before its own
start**, silently, in the exact code path meant to be helpful. That value was unreachable before (23:00
was the highest start) and is reachable now.

```tsx
    if (clamped <= startMins) return { start_time: newStart, end_time: '' }
```

Leaving the field empty is the only honest answer: there is no valid three-hour end, and `minExclusive`
then offers the operator only valid ones. ⚠️ **The `<=` is deliberate** — a 20:00 start clamps to exactly
23:00 and must still auto-fill, which it does.

### 3a — client-side: I chose to BLOCK, and to FLAG what blocking cannot reach

**BLOCK, because it is what the deleted `filter(t => t > start_time)` did** — an invalid end was never
selectable, and preserving that is the smallest behavioural delta. `minExclusive` reproduces it across a
split control:

- **hours** whose best case cannot beat the boundary are omitted (`h * 60 + 55 > minMins`);
- **minutes** are narrowed only *inside* the boundary hour (`h * 60 + m > minMins`);
- **changing the hour re-picks the minute** so the emitted value always satisfies the boundary — and it
  keeps the operator's existing minute, **including an off-grid one**, whenever that minute still can.

🔴 **Blocking cannot repair a pair that is ALREADY invalid**, which is the case item 4 forbids me to
coerce. So every site also **flags**:

| Site | Flag |
|---|---|
| 1 — mobile card | the end `<label>` turns amber and the selects take the amber field styling — `fieldCls(!ev.end_time \|\| endBeforeStart)` |
| 2, 3 — desktop rows | the end cell takes the amber border — `ci(missingEnd \|\| endBeforeStart)` |
| 4 — modal | `validateEventForm` raises **"End time must be after the start time"**, which **blocks the save** and paints the field red |

One shared predicate, [app/manage/[token]/page.tsx:6582](app/manage/[token]/page.tsx#L6582):

```tsx
function endIsNotAfterStart(start: string | null | undefined, end: string | null | undefined): boolean {
  const s = hhMmToMins(start); const e = hhMmToMins(end)
  return s !== null && e !== null && e <= s
}
```

⚠️ **A missing time is NOT this error** — it stays the existing "needs a time" amber, so the two states
remain distinguishable.

### 3b — server-side, and whether any existing row fails

[lib/time-utils.ts:39-58](lib/time-utils.ts#L39-L58):

```ts
export function hasValidEventTimes(start?: string | null, end?: string | null): boolean {
  const ok = (t?: string | null) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d/.test(t)
  if (!ok(start) || !ok(end)) return false
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  return mins(end as string) > mins(start as string)
}
```

⚠️ **Compared as MINUTES, not strings.** Callers pass raw DB values (`'17:00:00'`, 8 chars) *and* form
values (`'17:00'`, 5 chars); a string compare across those two shapes is silently wrong — the same defect
that already makes the dashboard's auto-open check fire a minute late.

**This tightens four existing call sites**, which is the whole point — none of them checked ordering:
[app/api/manage/route.ts:667](app/api/manage/route.ts#L667) (edit, live only),
[:675](app/api/manage/route.ts#L675) (create, always),
[app/api/dashboard/action/route.ts:1079](app/api/dashboard/action/route.ts#L1079) (live only),
[app/api/events/action/route.ts:56](app/api/events/action/route.ts#L56) and
[:126](app/api/events/action/route.ts#L126) (confirm / open transitions).

**🔴 MY READING OF THE SAVE PATHS, AND THEN THE DATA:**

*Reading first.* The risk is not the create path — a new event must pass the form. It is
[app/api/events/action/route.ts:56](app/api/events/action/route.ts#L56), which validates a **row already
in the database** on the confirm transition. Any row written by a path that never saw the UI filter — the
schedule importer, `/api/inbound-schedule`, the scraper, all of which pass `start_time`/`end_time`
through with no normalisation — could hold `end <= start` and would become **unconfirmable**, with an
error message about *times* that would read as a bug.

*Then the data.* **Zero rows fail.** Every live row was run through the **real, shipped** function:

| Population | Count | Newly refused |
|---|---|---|
| `truck_events` rows total | 97 | — |
| …holding **both** times | 81 | 🔴 **0** |
| …**Pizzeria Gusto** | 34 | ✅ **0** — all accepted |
| …status `confirmed` or `open` (the re-confirm path) | 9 | ✅ **0** — all accepted |

⚠️ **Two rows hold an off-5-grid end (`22:30 → 23:59`)** — both `Demo event`, both `closed`, on demo
trucks. **They pass**, because the rule is ordering, not granularity. Nothing about them is coerced.

---

## 4. 🔴 EXISTING TIMES ARE NEVER COERCED — how

**Three mechanisms, and the first is the one that matters most:**

**(a) The component has no lifecycle and cannot fire on its own.** There is no `useEffect`, no
normalise-on-mount, no default-value write. `onChange` is reachable **only** from a `<select>`'s own
`onChange`. **A value that is merely displayed round-trips byte-identically** because nothing runs.

**(b) The stored value is injected as an option rather than filtered away:**

```tsx
const hours = HOUR_OPTIONS.filter(h => minMins === null || Number(h) * 60 + 55 > minMins)
if (curH && !hours.includes(curH)) hours.push(curH)          // preserve a stored/earlier hour
hours.sort()

const minutes = minutesFor(curH)
const minuteOptions = curM && !minutes.includes(curM) ? [...minutes, curM].sort() : minutes
```

So a stored `23:59` renders as hour `23`, minute `59` — **`59` appended to the 5-step list and sorted
into place**, displayed correctly, and re-emitted unchanged if untouched. The old flat select had no
matching option for it at all and rendered blank.

**(c) Even an active hour change keeps an off-grid minute:**

```tsx
const keeps = curM !== '' && (minMins === null || Number(h) * 60 + Number(curM) > minMins)
onChange(`${h}:${keeps ? curM : (minutesFor(h)[0] ?? '00')}`)
```

Moving `23:59` to hour 21 yields **`21:59`**, not `21:00`. The minute is only replaced when it genuinely
cannot survive the end-after-start boundary.

⚠️ **`splitHhMm` ignores seconds and never parses them.** Values reach these sites as `HH:MM` already
(the modal opener `substring(0, 5)`s; the importer yields `HH:MM`), but if a `HH:MM:SS` value ever
arrived, it would **display** correctly and **re-emit as `HH:MM` only if edited** — the seconds would be
dropped by an active edit. No live row has non-zero seconds.

---

## 5. THE HOUR RANGE, AND WHY OVERNIGHT STAYS IMPOSSIBLE

00–23, so 06:00 and 23:30 are expressible for the first time. **No overnight support was attempted.** The
end-after-start rule refuses `19:00 → 00:30` at three layers (option filtering, `validateEventForm`,
`hasValidEventTimes` — the last verified refusing it in section 8), which is what keeps the customer
page's `for (h = startH; h <= endH; h++)` from producing an empty hour list.

**Zero existing rows start outside 07–23**, so nothing changes for any current event.

---

## 6. WHAT WAS NOT TOUCHED

Verified by `git diff --quiet` per file:

| Forbidden by item 6 | Status |
|---|---|
| Storage format | ✅ unchanged — still `HH:MM` on the wire into a `time` column; no migration |
| The slot engine (`lib/slot-availability.ts`, `lib/slot-bookings.ts`) | ✅ **UNCHANGED** |
| `generateCollectionTimes` (`lib/slot-generation.ts`) | ✅ **UNCHANGED** |
| Customer order page (`app/trucks/[slug]/order/page.tsx`) | ✅ **UNCHANGED** |
| Pre-order cutoff `<input type="time">` ([:9651](app/manage/[token]/page.tsx#L9651)) | ✅ still present, not in the diff |
| KDS slot `<input type="time">` ([app/dashboard/[token]/page.tsx:4416](app/dashboard/[token]/page.tsx#L4416)) | ✅ **file UNCHANGED** |

**`git status` lists exactly the two intended files** (plus `docs/`).

---

## 7. THE THREE TRACES

### (i) An existing **12:30** event — e.g. Pizzeria Gusto

| Step | Value |
|---|---|
| DB | `12:30:00` |
| Modal opener [:6787](app/manage/[token]/page.tsx#L6787) `substring(0,5)` | `'12:30'` |
| `splitHhMm` | `h='12'`, `m='30'` |
| Hour list | 00–23, contains `12` |
| Minute list | `'30'` is a multiple of 5 → **already in `MINUTE_OPTIONS`**, no injection |
| **Renders** | **`12` : `30`** |
| Operator saves without touching it | state still `'12:30'` → `upsert_event` → `12:30:00` |
| **Net** | 🔴 **byte-identical. No `onChange` fired.** |

### (ii) An existing **17:45** event

| Step | Value |
|---|---|
| `splitHhMm` | `h='17'`, `m='45'` |
| Minute list | `'45'` **is** a multiple of 5 → in the standard list |
| **Renders** | **`17` : `45`** |
| **Under the OLD control** | 🔴 `<select value="17:45">` matched **no option** in a 30-minute list → rendered **blank**, while the row's amber flags said nothing was missing. **This case is the bug the change fixes** |
| Saves | `'17:45'`, unchanged |

⚠️ **The injection path (4b) is exercised by `23:59`, not by `17:45`** — 45 is on the 5-grid. The live
`22:30 → 23:59` demo rows are the only stored values that need it, and they render `23` : `59` with `59`
sorted into the minute list.

### (iii) A **new 12:10** event, in the Edit event modal

| Action | Emitted | Then |
|---|---|---|
| Start hour → `12` | `'12:00'` (no minute yet → first allowed) | `applyStartTimeChange('12:00','')` → end auto-fills **`15:00`** |
| Start minute → `10` | `'12:10'` | `applyStartTimeChange('12:10','15:00')` → `'15:00' <= '12:10'` false → **end stands** |
| End field | `minExclusive='12:10'` → hours **12–23** (11 excluded: `11*60+55 = 715 ≤ 730`); in hour 12, minutes **`15`–`55`** | |
| Save | `start_time: '12:10'`, `end_time: '15:00'` | |
| Server | `hasValidEventTimes('12:10','15:00')` → **true** (verified, §8) | stored `12:10:00` / `15:00:00` |
| Slots | `generateCollectionTimes('12:10','15:00',5,10,30)` → `12:10, 12:15, 12:20…` | |
| Customer picker | hours `12`–`15`; in hour 12 minutes `≥ 10` → `10,15,20…` | 🔴 **the two lists agree exactly** — which is what the 5-minute step exists to guarantee |

---

## 8. VERIFICATION

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ **clean, exit 0** |
| Non-ASCII census, `app/manage/[token]/page.tsx` | ✅ **176 → 176**, class list byte-identical |
| Non-ASCII census, `lib/time-utils.ts` | ✅ **3 → 3**, class list byte-identical |
| `SCHEDULE_TIME_OPTIONS` consumers | ✅ **none** — constant removed; 3 comment mentions only |
| All four sites on the shared control | ✅ **8 `<EventTimeSelect>` call sites**, 0 remaining inline option lists |
| Files changed | ✅ **2** |
| Migration | ✅ none |

⚠️ **The census caught me.** My first `hasValidEventTimes` comment used `🔴 ⚠️ ✅`, which took
`lib/time-utils.ts` from 3 classes to 7 — a file that has never held an emoji. **Rewritten in plain
ASCII before anything else**, and the re-run is byte-identical. The rule earned its place.

### The server rule, exercised for real (jiti against the shipped module)

`13 passed, 0 failed` — including live shapes (`'17:00:00' → '20:00:00'` true; `'22:30:00' → '23:59:00'`
true), the new rule (`'17:00' → '17:00'` false, `'20:00' → '09:00'` false, overnight `'19:00' → '00:30'`
false, `'17:00' → '17:01'` true), and unchanged behaviour (nulls, empties, garbage, `'24:00'` all false).

Then **every live row through the real function**: 81 rows with both times, **0 newly refused**; Gusto 34
of 34 accepted; all 9 `confirmed`/`open` rows accepted.

---

## 9. 🔴 WHAT I HAVE NOT EXERCISED

1. **Nothing was rendered. There is no browser in this loop.** Every claim in section 7 about what
   *displays* is a hand-execution of `EventTimeSelect`'s branches. **`tsc` proves it compiles and the
   trace proves the logic; neither proves a pixel.**
2. **🔴 THE LAYOUT IS THE LEAST-VERIFIED PART, AND IT IS WHERE I EXPECT TROUBLE.** Each site's existing
   `className` — written for **one** full-width select — is now applied to **two** selects inside a
   `flex gap-1 w-full`. The desktop `ci()` class carries `w-full`, so two of them in a flex row will
   compete for a column sized for one control. **Worth looking at the desktop importer grid first**, at
   both 1024px and 1440px. If it is too tight, the fix is per-site `className`, not a component change.
3. **The `<td>` sites lost `style={{ minHeight: '48px' }}`** — it lived on the old `<select>` and the
   component takes no `style` prop. **Row height on the desktop grid may change.** Deliberate (a `style`
   prop would have been a fifth way to configure one control) but unverified.
4. **The pure page-local helpers were not unit-tested.** `EventTimeSelect`, `endIsNotAfterStart`,
   `splitHhMm`, `hhMmToMins` and the amended `applyStartTimeChange` are declared inside a 10,000-line
   client component and cannot be imported by a harness. 🔴 **Only `hasValidEventTimes` was genuinely
   executed.** Everything else in sections 3c, 4 and 7 is traced by reading.
5. **No save was performed.** No event was created, edited or confirmed. The claim that a 12:10 event
   stores `12:10:00` follows from the unchanged `upsert_event` body, not from a round trip.
6. **The importer was not run.** The 17:45 case is traced from `lib/schedule-extract.ts`'s output shape;
   I did not extract a real schedule.
7. **One edge case I found and did not fully close:** if a stored end is invalid *and* the operator
   re-selects the same hour, `minutesFor()` can be empty and the fallback emits `:00` — which may still
   be invalid. It stays flagged and the modal still refuses to save, so nothing bad is stored, **but the
   control does not self-repair that pair.** No live row is in this state.
8. **iOS/Android were not considered.** Neither the component nor any gate is platform-dependent, but
   `purchaseCtaAllowed()`-style suppression does not touch these sites and I did not check the native
   shell's `<select>` rendering — **two selects where there was one is exactly the kind of thing a native
   picker sheet renders differently.**
