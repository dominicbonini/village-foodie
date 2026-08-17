# KDS EVENT ISOLATION — THE FIX

**Diagnosis accepted from `docs/kds-event-isolation-report.md`, including its correction that the KDS
picker is `upcoming=true` rather than today-only. Not re-derived.**

**File changed:** `app/dashboard/[token]/kds/page.tsx` — **the only source file written.**
🔴 **The dashboard and `/api/dashboard` were NOT touched** — `git diff --stat` on
`app/dashboard/[token]/page.tsx` and on `app/api` is **empty**. No fix required a server change, so
there was nothing to stop on.
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `diff` and `show` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any database write.

**No span of the prompt arrived garbled, and with Span A superseded no instruction contradicts another.**

---

## 0. 🔴 THE BEHAVIOUR CHANGE, STATED BEFORE ANYTHING ELSE

**A KDS handed tomorrow's event will now SHOW tomorrow's event.** Today it silently shows today's.

That is correct — the operator picked it from a list that labels it `Thu 21` — but it makes a **real
new state reachable: a kitchen screen sitting on tomorrow's empty board during today's service.**
Before this change that state was unreachable *because the bug hid it*, and the screen quietly showed
today's orders instead. **The fix does not add a way to select tomorrow; the picker has offered it
since the candidate set became `upcoming=true`. It removes the accident that made choosing it look
like nothing had happened.**

⚠️ **Nothing warns the operator that the board they are on is not today's.** The event bar names the
venue and shows `📅 <date>` for non-demo events, and that is the whole of it. **Reported, not built —
it was not in scope.**

---

## 1. FIX 1 — THE KDS SENDS `date`

### 1.1 The dashboard's derivation, quoted BEFORE reuse

```tsx
  const selectedOrDefaultEvent:TruckEvent|null=selectedEventId
    ?(upcomingEvents.find(e=>e.id===selectedEventId)??null)
    :pickDefaultEventByTime(upcomingEvents)
```
```tsx
  const stockEvent:TruckEvent|null=selectedOrDefaultEvent
```
```tsx
  // Keep the scoping ref current (cheap — no fetch, runs on every event-list poll).
  useEffect(()=>{
    selectedEventRef.current=stockEvent?{id:stockEvent.id,date:stockEvent.event_date}:null
  },[stockEvent])
```
```tsx
      const sel=selectedEventRef.current
      if(sel){p.set('event_id',sel.id);p.set('date',sel.date)}
```

### 1.2 🔴 THE TWO INVARIANTS, AND HOW EACH HOLDS IN THE KDS'S VERSION

**INVARIANT 1 — the id and the date come from ONE resolved event object, never two lookups.**

The dashboard takes both from `stockEvent`, a single `TruckEvent`, in one expression. **The KDS's
equivalent resolved object is `activeEvent`** — itself already a single lookup of the held id:

```tsx
  const activeEvent: TruckEvent | null = selectedEventId
    ? events.find(e => e.id === selectedEventId) ?? null
    : null
```

**The pair is taken from it in one expression, exactly as the dashboard does:**

```tsx
  useEffect(() => {
    eventScopeRef.current = activeEvent ? { id: activeEvent.id, date: activeEvent.event_date ?? null } : null
  }, [activeEvent])
```

🔴 **HOW IT HOLDS:** `id` is `activeEvent.id` and `date` is `activeEvent.event_date`, read from the
same object in the same statement. **There is no path on which the request's `event_id` and its `date`
describe different events.** The obvious wrong shape — `params.set('event_id', selectedEventId)` from
the closure and `params.set('date', events.find(...)?.event_date)` from a second lookup — is one poll
away from disagreeing, and **a request whose `date` does not contain its `event_id` is precisely the
input the server does not reject.**

⚠️ **ONE DIFFERENCE FROM THE DASHBOARD, DELIBERATE:** `TruckEvent.event_date` is nullable, so the KDS
sends the id alone when the date is null rather than a bare `date=`, which the route would read as an
empty string matching no row. **The dashboard passes `sel.date` unguarded.** Not copied.

**INVARIANT 2 — the ref is written in an effect keyed on that object, so the value in flight is
always the committed selection.**

The dashboard's effect is keyed on `[stockEvent]`; **the KDS's is keyed on `[activeEvent]`**, quoted
above. It is declared **immediately below `activeEvent`**, and that position is load-bearing:

```tsx
  useEffect(() => {
    fetchAll()
  }, [fetchAll])
```

is declared further down the same component. **React runs passive effects in declaration order within
a commit**, so on the render where the operator's switch lands, the ref is written *before* the
request that reads it is built. 🔴 **Moving either effect past the other reopens a one-poll window in
which the new id would travel with the old date** — which is the exact malformed request the server
silently mishandles. The comment in the file says so, in those words.

🔴 **AND WHY A REF RATHER THAN A DEPENDENCY, WHICH THE DASHBOARD'S COMMENT ONLY HINTS AT.**
`activeEvent` is `events.find(...)`, and `setEvents(fetched)` installs **fresh objects on every
60-second poll**, so its identity changes every poll. In `fetchAll`'s dependency array that would
re-create `fetchAll` → re-run the fetch effect → fetch again → **an unbounded request loop.**
`selectedEventId` **stays** in `fetchAll`'s deps, because that identity change is what makes a switch
refetch at all on this surface. **Verified by reading both dep arrays; not by running it.**

### 1.3 The change

```tsx
      const requestedEventId = applyEventScope(params, selectedEventId)
```

```tsx
  const applyEventScope = useCallback((params: URLSearchParams, fallbackId: string | null): string | null => {
    const scope = eventScopeRef.current
    if (scope) {
      params.set('event_id', scope.id)
      if (scope.date) params.set('date', scope.date)
      return scope.id
    }
    if (fallbackId) { params.set('event_id', fallbackId); return fallbackId }
    return null
  }, [])
```

⚠️ **THE FALLBACK IS NOT A SECOND LOOKUP — IT IS THE PRE-RESOLUTION CASE, AND IT PRESERVES TODAY'S
BEHAVIOUR EXACTLY.** Before the first `/api/events/manage` response, `activeEvent` is null while
`selectedEventId` may already hold the `?event_id=` handover from the dashboard. **Sending that bare
id is what this file did before this change.** No date accompanies it, so there is nothing for it to
disagree with, and **that path is unchanged rather than newly weakened** — had the fallback been
dropped, a multi-event day would have gone from "the handed-over id, honoured" to "no id at all,
server picks `todayEvents[0]`", which is a regression the fix would have introduced itself.
Verified by harness check 8.

---

## 2. 🔴 EVERY FETCH TO `/api/dashboard` THAT BUILDS ITS OWN PARAMS

**EXECUTED — `grep -n "api/dashboard"` and `grep -n "URLSearchParams"` across the repo.** There are
**four** callers of this endpoint, two per surface, and **every one builds its params independently.**

| # | Caller | Sent BEFORE | Needed changing? | State now |
|---|---|---|---|---|
| 1 | **KDS `fetchAll`** (`kds/page.tsx:403`) | `token`, `pin`, `van_id`, `event_id` | 🔴 **YES — the core defect** | ✅ **+ `date`, via `applyEventScope`** |
| 2 | 🔴 **KDS `submitPin`** (`kds/page.tsx:1154`) | **`token`, `pin` — NOTHING ELSE** | 🔴 **YES, and this is the site a copy would have missed** | ✅ **+ `event_id` + `date`, via the SAME helper** |
| 3 | Dashboard `fetchAll` (`page.tsx:850`) | `token`, `pin`, `event_id`, `date` | ✅ **NO** — already correct | **untouched** |
| 4 | Dashboard `submitPin` (`page.tsx:1437`) | `token`, `pin`, `event_id`, `date` | ✅ **NO** — already correct | **untouched** |

# ✅ CONFIRMED: THE PIN-SUBMIT PATH IS HANDLED, AND THROUGH THE SAME HELPER RATHER THAN A COPY.

```tsx
    const requestedEventId = applyEventScope(params, selectedEventId)
```

**There is ONE implementation of "put this read's event scope on the params", called twice.** A copy
of `fetchAll`'s three lines into `submitPin` would have been the fifth duplicated block in this
codebase's history of exactly that, and the brief named this site for that reason.

⚠️ **`van_id` IS STILL NOT SENT BY `submitPin`, AND WAS NOT ADDED.** It was not in scope. Its absence
means the first board after PIN entry is **not van-filtered**, so on a multi-van truck it can include
another van's orders for one response, until the first `fetchAll` poll corrects it. **Reported,
unfixed.** ⚠️ **Note the asymmetry this creates with the new code: that response IS event-scoped and
IS event-verified, but not van-scoped.**

⚠️ **The dashboard's two callers were read to confirm they need nothing, and not otherwise touched.**

---

## 3. FIX 2 — THE CLIENT VERIFIES WHAT IT WAS SERVED

### 3.1 What I did: RENDER NOTHING, WITH A NOTICE. Not "follow the server".

```tsx
      const servedEventId = data.offlinePauseEventId
      if (requestedEventId && servedEventId !== undefined && servedEventId !== requestedEventId) {
        console.error(`[kds] event scope mismatch — requested ${requestedEventId}, served ${servedEventId ?? 'null'}; rendering no orders`)
        setEventScopeMismatch({ requested: requestedEventId, served: servedEventId ?? null })
        setOrders([])
        setLoading(false)
        return
      }
      setEventScopeMismatch(null)
```

🔴 **WHY NOT "FOLLOW THE SERVER AND CORRECT THE HEADER".** Adopting the served id would move the board
to an event the operator did not choose — and **"seed once, then hold" exists precisely to stop this
board auto-advancing off a cook's unserved orders while nobody is watching.** The file's own comment
calls a time- or status-driven move *"a kitchen defect"*. A silent correction here would be that same
auto-advance wearing a different hat: the header would change by itself, and the operator's chosen
event would be gone from the screen with no record that they had chosen it. **So: no orders, and a
notice that names the event they picked.**

🔴 **IT RETURNS BEFORE ANY STATE IS WRITTEN — before `setTruck`, before the pause read, before
`setOrders`.** Every event-scoped field in that response describes the wrong event; **a partial apply
would be the same defect with fewer symptoms.**

🔴 **`setOrders([])` IS PART OF THE GUARANTEE, NOT TIDINESS.** Returning without clearing would leave
the previous event's array on screen under the new header — **which is the reported defect exactly.**

⚠️ **`undefined` IS NOT A MISMATCH.** An older server that does not send the field must not blank a
working board, so only a **present-and-different** value counts.

### 3.2 The notice

```tsx
      {eventScopeMismatch && (
        <div className="bg-red-700 text-white text-sm font-medium px-4 py-3 flex-shrink-0">
          <div className="font-black">⚠️ Orders not loaded for this event</div>
          <div className="text-xs mt-0.5 text-red-100">
            The server answered with a different event, so nothing is shown rather than the wrong
            orders{activeEvent ? ` for ${activeEvent.venue_name}` : ''}. Pick the event again, or reload.
          </div>
        </div>
      )}
```

⚠️ **AN EMPTY GRID ON A KITCHEN SCREEN READS AS "NO ORDERS", WHICH WOULD BE A LIE.** This is the
sentence that stops it being one. It names **the event the operator chose**, not the one the server
picked — their question is *"where are my orders"*, and the answer is *"not loaded"*, not *"renamed"*.
It sits **above** the pause banner: a paused board still shows the right orders; this one shows none.

### 3.3 ⚠️ `offlinePauseEventId` IS A NAME/MEANING MISMATCH, AND IT IS BEING USED ANYWAY

```ts
    offlinePauseEventId: selectedEventId,         // the event the marker belongs to (ack key)
```

**The name and the comment describe the offline-pause popup's ack key.** The VALUE is the route's own
`selectedEventId` — the exact id the orders query filtered on:

```ts
      .eq('event_id', selectedEventId)
```

**It is the only field in the response that carries that value**, so it is the only field this check
can use. 🔴 **NOT RENAMED, AS INSTRUCTED — and renaming it would be a server change, which is out of
scope regardless.** ⚠️ **The risk of relying on it is stated rather than hidden:** its contract is
about a pause marker, so a future change to the offline-pause feature could legitimately alter what it
holds and would break this guard **silently**, because the guard's failure mode is "never fires".
A field named for its actual meaning — `servedEventId` — would be the durable form.

---

## 4. FIX 3 — DEFENCE IN DEPTH: THE PER-ORDER `event_id` FILTER

```tsx
      const rawOrders = data.orders ?? []
      const incomingOrders = requestedEventId
        ? rawOrders.filter((o: Order) => o.event_id === requestedEventId)
        : rawOrders
      if (incomingOrders.length !== rawOrders.length) {
        console.error(`[kds] ${rawOrders.length - incomingOrders.length} order(s) dropped by the event_id filter for ${requestedEventId} — Fixes 1 and 2 should have made this unreachable`)
      }
```

**Applied in both read paths** — `fetchAll` and `submitPin`.

🔴 **IT SHOULD NEVER FIRE, AND THE COMMENT SAYS SO.** The route's orders query is
`.eq('event_id', selectedEventId)`, so **every row it returns already carries the served id**; Fix 1
makes the served id the requested one, and Fix 2 refuses the response outright when it is not. **If
this filter ever drops a row, one of those three statements is false — which is why it logs at
`error` rather than dropping silently.** ⚠️ **It is skipped entirely when we asked for nothing** (the
cold-launch unscoped read), because with no requested id there is nothing to test against and the
server's choice is legitimate.

### 🔴 WOULD IT ALONE HAVE PREVENTED THE OBSERVED SYMPTOM? PARTLY — AND THE PART IT MISSES MATTERS.

✅ **YES for the misattribution.** On the observed switch it would have compared every returned row's
`event_id` (today's event) against the requested id (tomorrow's) and dropped **all** of them. **Orders
from one event could not have appeared under another event's name.**

🔴 **NO for the operator's actual problem.** The result would have been a **silently empty board with
no explanation** — indistinguishable from "this event has no orders yet", on a screen where that is a
completely normal state. **The operator would have learned nothing, and the request would have gone on
being wrong every 60 seconds.** ⚠️ **And it would have been strictly worse than the observed bug in
one respect: an empty board invites no investigation, whereas the wrong orders were at least noticed.**
That is why it is third and not first: **it bounds the damage; it does not diagnose or repair.**

---

## 5. REPORT ONLY — THE BST 00:00–01:00 WINDOW

**NOT FIXED. Quoted:**

```ts
  const date  = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]
```

`toISOString()` is **UTC**. The manual's §7 rule is *never use `toISOString()` (UTC) to decide whether
an event date is "today"*, and **this default does exactly that**: between 00:00 and 01:00 local in
BST, the UTC date is still yesterday, so `todayEvents` is built from **yesterday's** rows.

### Does Fix 1 remove it for the KDS?

✅ **YES, ON EVERY SCOPED READ — because the default is never reached.** The expression is
`get('date') || <UTC today>`; once the KDS sends an explicit `date`, the left operand wins and the UTC
fallback is not evaluated. **The date sent is `activeEvent.event_date`, a stored `event_date` column
value, so no client clock and no timezone participates.**

🔴 **NO, ON THE TWO UNSCOPED READS**, which are unchanged by this task:
- the **cold-launch** first fetch, before any events have arrived — no `date`;
- the **`?event_id=` handover** before the events list lands — id only, no `date`.

⚠️ **Both are bounded to the first response and self-correct on the next poll**, once `activeEvent`
resolves and the ref carries a pair. **INFERRED from the code paths; not observed.**

### Does the dashboard remain exposed?

**Symmetrically, and it is NOT touched by this task.**

```tsx
      const sel=selectedEventRef.current
      if(sel){p.set('event_id',sel.id);p.set('date',sel.date)}
```

✅ **Not exposed whenever a selection exists** — it sends `date` for the same reason. 🔴 **Exposed on
the same shape the KDS is: when `selectedEventRef.current` is null**, which happens only when
`selectedOrDefaultEvent` resolves to null, i.e. the truck has no upcoming event at all. ⚠️ **In that
state there is no event to scope to and the board is empty regardless**, so the window has nothing to
corrupt. **The exposure is real in the route and effectively unreachable from either client once a
selection exists.**

⚠️ **A SEPARATE `toISOString()` LIVES ON THE CANDIDATE LIST AND IS NOT AFFECTED BY ANY OF THIS:**

```ts
    const today = new Date().toISOString().split('T')[0]
    query = query.gte('event_date', today)
```

During the same window this is a **`gte` against an earlier date, so it returns MORE rows, not fewer**
— yesterday's events would appear in the picker. **Cosmetic, not a scoping failure. Reported, unfixed.**

---

## 6. VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION.** `npx tsc --noEmit` exits 0. `npx eslint` on the KDS reports a
finding set **byte-identical to the HEAD version of the same file**, compared by piping
`git show HEAD:…` through `eslint --stdin` and diffing the sorted sets. **This change adds no lint
finding.** (`applyEventScope` was added to `fetchAll`'s dep array purely to keep that true; it is an
empty-dep `useCallback`, so its identity is fixed and no hook is re-created.)

### 6.1 EXECUTED — a 19-assertion harness, all passing

**The client path was transcribed line-for-line from the edited file, and the SERVER's resolution
branch (`route.ts:176-188`, `249-262`) was transcribed unchanged**, against three events — two today,
one tomorrow — and six orders.

| # | Assertion | Result |
|---|---|---|
| 1 | **The OLD path reproduces the reported defect** — no `date`, and event A's orders returned for a request naming C | ✅ **PASS** |
| 2 | **The request carries BOTH `event_id` and `date`, and the date is the event's OWN** | ✅ **PASS** |
| 3 | **Selecting tomorrow shows TOMORROW's orders**, not today's | ✅ **PASS** |
| 4 | **Today→today is unaffected** — A then B, correct both ways, no mismatch raised | ✅ **PASS** |
| 5 | **A served/requested mismatch renders NO orders** and records both ids | ✅ **PASS** |
| 6 | **The per-order filter is INERT** — 0 rows dropped across three switches | ✅ **PASS** |
| 7 | **The unscoped cold-launch read is unchanged** — no id, no date, server falls back, filter skipped, **no false mismatch** | ✅ **PASS** |
| 8 | **The `?event_id=` handover before events land is unchanged** — id sent, no date, honoured | ✅ **PASS** |

### 6.2 The six required claims

| Claim | Method |
|---|---|
| The KDS request carries both `event_id` and `date` | ✅ **EXECUTED** — harness check 2 asserts the query string. **This is an executed check of transcribed logic, not a captured network request.** |
| Selecting tomorrow's event shows tomorrow's orders, not today's | ✅ **EXECUTED** — check 3, with check 1 reproducing the old behaviour first |
| A served/requested mismatch cannot render orders under the wrong header | ✅ **EXECUTED** — check 5. ⚠️ **The NOTICE itself is READ only** — no component was rendered |
| The per-order `event_id` filter is present and inert | ✅ **EXECUTED** — check 6 (0 dropped); presence **READ** at both call sites |
| The dashboard is unchanged in every branch | ✅ **EXECUTED** — `git diff --stat app/dashboard/[token]/page.tsx app/api` is **empty**. Not one byte |

### 6.3 🔴 WHAT WAS **NOT** VERIFIED

- **NOTHING WAS RENDERED AND NOTHING WAS TAPPED.** No `next dev`, no `next build`, no `cap sync`, no
  device, no captured request.
- **THE HARNESS IS A TRANSCRIPTION.** It proves the scope logic and the server's response to it; it
  says nothing about React's effect ordering in a real commit. 🔴 **INVARIANT 2 rests entirely on a
  source-level argument about declaration order** — the ref effect is declared above the fetch effect,
  and React runs passive effects in declaration order. **That is READ, not observed**, and it is the
  weakest link in this fix: if it were wrong, a switch would send the new id with the old date and
  Fix 2 would catch it as a mismatch — **the board would go empty with a notice rather than showing
  wrong orders**, which is the failure mode this design chose to have.
- **The notice's copy, colour and position** are source-read only.

---

## 7. INTEGRITY

### 7.1 `app/dashboard/[token]/kds/page.tsx`

**Byte-level tool (Python over `open(…,'rb')`), never grep.**

```
BEFORE   bytes 149,420   chars 144,624   lines 2,197
AFTER    bytes 160,748   chars 155,512   lines 2,339
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 33 distinct classes before, 33 after. NO NEW CLASS, NONE REMOVED.**
Occurrences 2,359 → 2,572. Seven classes moved, every one of them comment furniture:

| Codepoint | Before | After | Δ |
|---|---|---|---|
| U+2500 ─ | 1825 | 1964 | +139 |
| U+2014 — | 223 | 253 | +30 |
| U+1F534 🔴 | 88 | 102 | +14 |
| U+FE0F | 74 | 87 | +13 |
| U+26A0 ⚠️ | 73 | 86 | +13 |
| U+2192 → | 19 | 21 | +2 |
| U+21D2 ⇒ | 7 | 9 | +2 |
| **the other 26 classes** | — | — | **0** |

✅ **`U+26A0` and `U+FE0F` moved by the SAME +13**, which is what a correctly-paired addition looks
like. **Carrier-aware check on the source: `U+26A0` n=86, 86 paired, 0 bare.** `U+1F534` n=102 bare
(emoji presentation by default), `U+2705` n=2, `U+2713` n=4, `U+23F8` n=1 — all bare, all unchanged.

### 7.2 This report — SEPARATE pass, run AFTER writing

```
docs/kds-event-isolation-fix-report.md   bytes 23,930
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE.** Bare versus paired per base,
never as a raw total:

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 🔴 | 28 | 0 | 28 |
| U+2705 ✅ | 26 | 0 | 26 |
| **U+26A0 ⚠️** | **20** | **20** | ✅ **0** |
| U+1F4C5 📅 | 2 | 0 | 2 |

`U+1F534`, `U+2705` and `U+1F4C5` have **emoji presentation by default** — bare is correct and they
render as emoji everywhere. **`U+26A0` is the one base here that defaults to TEXT presentation**, and
every one of its 20 occurrences is **PAIRED — 20 OF 20, ZERO BARE**. The report's total
`U+FE0F` count is 20, which exactly accounts for the 20 paired warning signs and leaves none
attached to any other base. ⚠️ **No other emoji-presentation base occurs in this report at all.**

### 7.3 Working tree

```
 M app/dashboard/[token]/kds/page.tsx
 M docs/reference-manual.md
?? docs/kds-event-isolation-fix-report.md
?? docs/kds-event-isolation-report.md
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`M app/dashboard/[token]/kds/page.tsx`** | 🔴 **THIS TASK.** The file was clean at HEAD — the only source file written |
| 🔴 **`?? docs/kds-event-isolation-fix-report.md`** | 🔴 **THIS TASK** — this file |
| `M docs/reference-manual.md` | ✅ **pre-existing** — the V11.24 update, still uncommitted. **Left alone as instructed** |
| `?? docs/kds-event-isolation-report.md` | ✅ **pre-existing** — the accepted diagnosis. **Left alone as instructed** |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
