# KDS preference persistence, Event actions, and a proper finish-time control

**No `next dev`, no `next build`, no deploy, no archive, no database write, no SQL.** `lib/payments/`
was not opened for edit and does not appear in the diff. **Exactly ONE file changed:**
`app/dashboard/[token]/kds/page.tsx`. **Part D is report-only and nothing in it was touched. Part E is
skipped — nothing native changed.**

**No span of the prompt arrived garbled.** ⚠️ **ONE INSTRUCTION PAIR NEEDED A RULING RATHER THAN A
CHOICE, AND I HAVE FLAGGED IT INSTEAD OF DECIDING QUIETLY — see C5.** I did not stop the task for it,
because the reading that satisfies both instructions is the one the prompt's own wording points at
("do not **silently** orphan orders"); **if you meant a hard stop, say so and I will remove the
control.**

Every claim is marked **READ** or **INFERRED**. **Dashboard and KDS are reported separately.**

**A typecheck was run (`npx tsc --noEmit`) and passed with no output.** That is not a build.

---

# PART A — PERSIST THE KDS VIEW PREFERENCES

## A1. Every header toggle, and where each was stored BEFORE

**READ** — the header runs `kds/page.tsx:1156-1432`. **Ten controls; five are device toggles.**

| # | Control | State | Stored BEFORE | Survived a return? |
|---|---|---|---|---|
| 1 | **Window / Cook** | `viewOverride` | `localStorage` `hg_kds_view_<token>` | ✅ **yes — but one frame late** |
| 2 | **List / Grid** | `layoutOverride` | `localStorage` `hg_kds_layout_<token>` | ✅ **yes — one frame late** |
| 3 | **Sound 🔔 / 🔕** | `soundEnabled` | `localStorage` `hg_kds_sound_<token>` | ✅ **yes — one frame late** |
| 4 | **Payments 💷** | `showPaymentsPref` | **Capacitor `Preferences`** `hg_kds_payments_<token>` | ✅ **yes — async by necessity** |
| 5 | **Screen on / off** | `keepScreenOn` | `localStorage` `hg_keepawake_<token>` | ✅ **yes — AT FIRST PAINT** |
| 6 | Extra wait `<select>` | `extraWaitMins` | 🔴 **SERVER** (event/truck) | n/a — not a device pref |
| 7 | Pause orders | `pausedUntil` | 🔴 **SERVER** | n/a |
| 8 | 📱 This device | `deviceOpen` | nowhere — opens a sheet | n/a |
| 9 | "Open cook screen" | — | a link | n/a |
| 10 | **Event actions** (was `⋯`) | `showEventMenu` | nowhere — opens a menu | n/a |

# 🔴 THE FINDING: ALL FIVE ALREADY PERSISTED. THREE RESTORED ONE FRAME TOO LATE.

**READ** — the code as it stood, `:346-352`:

```ts
  useEffect(() => {
    if (typeof window === 'undefined') return
    const v = localStorage.getItem(`hg_kds_view_${token}`)
    if (v === 'window' || v === 'cook') setViewOverride(v)
    const l = localStorage.getItem(`hg_kds_layout_${token}`)
    if (l === 'list' || l === 'grid') setLayoutOverride(l)
  }, [token])
```

**An effect runs AFTER the first paint.** Until it did, `viewOverride` was `null`, and **READ**,
`:1003-1005`:

```ts
  const activeView: KdsView = can('cook_screen')
    ? (viewOverride ?? (isDemo ? 'window' : kdsView))
    : 'window'
```

🔴 **SO A COOK DEVICE PAINTED A WINDOW BOARD FIRST.** `kdsView` defaults to `'window'`. For that frame
the card took the window branch — **prices on** (`showPrices = viewMode !== 'cook'`), **ready tickets
on the board**, and the **window button set including the completion/payment buttons**. **INFERRED,
and it is why this was worth fixing rather than merely tidying: on an unattended grill screen that is a
frame of money UI on a device deliberately configured never to show any.**

## A2. The `keep_screen_on` pattern, quoted, and reused

**READ** — the pattern, `kds/page.tsx:134-144`, unchanged by this task:

```ts
  // PER-DEVICE keep-screen-on pref (mirrors sound + the dashboard). Lazy initializer reads localStorage
  // SYNCHRONOUSLY at first paint (SSR-guarded) so the KeepAwakePrompt can't flash. KDS previously read the
  // truck DB column even on native — this is its first per-device path. Default ON.
…
  const [keepScreenOn, setKeepScreenOn] = useState(() => {
    if (typeof window === 'undefined') return !isDemo
    const pref = localStorage.getItem(`hg_keepawake_${token}`)
    return isDemo ? pref === 'on' : pref !== 'off'
  })
```

**Three properties: a `useState` LAZY INITIALISER, an SSR guard, and a token-scoped localStorage key.**
✅ **REUSED VERBATIM. NO SECOND MECHANISM: the same keys, the same scoping, the same writer effects —
only the READ moved out of an effect and into the initialiser.**

**AFTER — READ, the new `:151-172`:**

```ts
  const [viewOverride, setViewOverride] = useState<'window' | 'cook' | null>(() => {
    if (typeof window === 'undefined') return null
    const v = localStorage.getItem(`hg_kds_view_${token}`)
    return v === 'window' || v === 'cook' ? v : null
  })
  const [layoutOverride, setLayoutOverride] = useState<'list' | 'grid' | null>(() => {
    if (typeof window === 'undefined') return null
    const l = localStorage.getItem(`hg_kds_layout_${token}`)
    return l === 'list' || l === 'grid' ? l : null
  })
```

```ts
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem(`hg_kds_sound_${token}`) !== 'off'
  })
```

**The two restore effects were deleted; the WRITERS are untouched.** ✅ **The validation is kept
(`v === 'window' || v === 'cook'`), so a corrupt value still falls through to `null` = today's default
resolution — not to a crash and not to a wrong view.**

**READ** — the sound effect, now only installing the unlock:

```ts
  useEffect(() => {
    installAudioUnlock()
  }, [])
```

## 🔴 THE PAYMENTS TOGGLE WAS DELIBERATELY LEFT ON `Preferences`

**READ** — `:159-168`, its own reasoning:

```
  // ⚠️ CAPACITOR PREFERENCES, NOT localStorage, UNLIKE the view/layout/sound prefs beside it. Those
  // predate the native shell. Preferences persists to UserDefaults on iOS, which survives the hard
  // navigations and cold-kills that can hand a WKWebView a fresh localStorage (the reasoning is written
  // out in lib/native/preferencesStorage.ts). On web the plugin falls back to localStorage, so a browser
  // KDS persists too. This toggle changes which orders LEAVE THE BOARD, so losing it silently is worse
  // than losing a list/grid preference.
```

⚠️ **IT ALREADY PERSISTS PER DEVICE AND ALREADY SURVIVES A RETURN, so A2's requirement is met without
touching it.** 🔴 **AND IT CANNOT TAKE THE LAZY PATTERN: `Preferences.get` is async and cannot be read
in a `useState` initialiser** — stated in the code at `:363-368`. **Moving it to localStorage to make it
lazy would trade native durability for one frame, on the toggle whose own comment says losing it is the
worst of the five. NOT DONE, deliberately.** ⚠️ **Its one-frame gap resolves to `null` → HIDE
payments, which is the safe direction; the view's gap resolved to SHOW them, which is why the view was
the one that needed fixing.**

## A3. ⚠️ Window/Cook is a two-device ROLE — what happens on reassignment

**STATED PLAINLY: the preference is sticky to the DEVICE, not to the job, so reassigning a device is a
MANUAL act and nothing detects it.**

**INFERRED, from the storage:** move the grill iPad to the hatch and it **still boots into Cook** —
no prices, no payment buttons, ready tickets vanishing off its board — **until somebody taps Window.**
**And this change makes that MORE immediate, not less:** it used to paint a window board for one frame
before flipping to cook, which was a misleading flicker rather than a hint.

⚠️ **THE FAILURE IS QUIET IN BOTH DIRECTIONS.** A window device left on Cook cannot take money; a cook
device left on Window shows prices at the grill and will not clear its board at Ready. 🔴 **No screen
anywhere lists what each device is set to** — the same gap the payments toggle already has.

✅ **Persisting it is still right**: the alternative is re-picking the role every time the screen
sleeps, which on an unattended KDS is worse. **The residual risk is reassignment, and it is unchanged
by this task** — reported, not fixed, because a device-role display is outside this scope.

## A4. Restoration does not fight the seed-once-then-hold logic

✅ **CONFIRMED — `seededRef` and `setSelectedEventId` are BYTE-IDENTICAL. READ, the current file,
`:521-527` before the edits and `:536-542` after; the block is untouched:**

```ts
  useEffect(() => {
    if (seededRef.current) return
    if (!events.length) return          // nothing to seed FROM yet — wait for the first successful fetch
    seededRef.current = true
    if (selectedEventId && events.some(e => e.id === selectedEventId)) return   // the URL seed resolved
    setSelectedEventId(pickDefaultEventByTime(events)?.id ?? null)
  }, [events, selectedEventId])
```

**They cannot interact. INFERRED, and the reason is structural:** the view/layout/sound prefs are
**render-time display state** keyed on `token`; the seed is **event-selection state** keyed on
`events`. **The restored prefs are not in that effect's dependency array, do not call
`setSelectedEventId`, and do not touch `seededRef`.** ✅ **`git diff` for this file contains neither
identifier** — see G6.

⚠️ **AND THE LAZY READ MAKES THE INTERACTION STRICTLY LESS POSSIBLE, NOT MORE:** the value is now
resolved before the first render, so it cannot cause a re-render that re-runs any effect. **The old
effect DID cause exactly one extra render pass; that pass is now gone.**

## A5. First-ever launch with nothing stored

**READ — the defaults, unchanged in every case:**

| Pref | Nothing stored | Where |
|---|---|---|
| View | `null` → `activeView` falls to `kdsView` → **`'window'`** (or `'window'` outright without Max) | `:1003-1005` |
| Layout | `null` → `activeLayout` falls to `displayMode` = **the truck's `display_mode`** | `:1006` |
| Sound | `getItem(...) !== 'off'` → **ON** | the initialiser |
| Payments | `null` → `hidePayments` resolves **not-on → HIDE** | `:1022` |
| Screen | `pref !== 'off'` → **ON** (demo: `pref === 'on'` → OFF) | `:140-144` |

✅ **IDENTICAL TO BEFORE.** The old code only ever called `setViewOverride` / `setLayoutOverride`
inside a validity check and only called `setSoundEnabled` when `s !== null`; **the new initialisers
return `null` / `true` in exactly the same cases.** ⚠️ **`null` overrides are still never written, so
a first-ever launch does not stamp a preference the operator never chose.**

---

# PART B — RENAME THE ⋯ MENU TO "Event actions"

## B1. The two controls, side by side

**KDS, BEFORE — READ, `kds/page.tsx:1427-1430`:**

```tsx
            <button onClick={() => { setEventNoteInput(activeEvent.customer_note || ''); setShowEventMenu(true) }}
              className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:border-slate-400">
              ⋯
            </button>
```

**DASHBOARD — READ, `app/dashboard/[token]/page.tsx:3006-3009`, unchanged by this task:**

```tsx
                  <button onClick={()=>{setEventNoteInput(activeEvent.customer_note||'');setShowEventMenu(true)}}
                    className="flex-shrink-0 text-xs font-semibold text-white bg-slate-700 border border-slate-500 hover:bg-slate-600 rounded px-2.5 py-1 transition-colors">
                    Event actions ▾
                  </button>
```

🔴 **AND THE DASHBOARD ALREADY MADE THIS EXACT ARGUMENT, IN A COMMENT, ABOUT THIS EXACT GLYPH** —
**READ**, `page.tsx:2992-2993`:

```
                {/* Labeled, obviously-tappable trigger for the event-level actions (pause / +30 / finish /
                    cancel / note) — names the menu so those actions are discoverable, not hidden behind ⋯. */}
```

⚠️ **The two handlers are otherwise the SAME LINE**: both set `eventNoteInput` from
`customer_note` and open `showEventMenu`. **Only the label differed.**

## B2. The rename — both labels

**AFTER — READ, `kds/page.tsx:1521-1524`:**

```tsx
            <button onClick={() => { setEventNoteInput(activeEvent.customer_note || ''); setShowEventMenu(true) }}
              className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:border-slate-400 font-semibold">
              <span className="hidden sm:inline">Event actions </span>▾
            </button>
```

| Surface | Label |
|---|---|
| **Dashboard** | `Event actions ▾` |
| **KDS, after** | `Event actions ▾` |

✅ **The words and the `▾` match the dashboard exactly.** ⚠️ **ONE DELIBERATE DIFFERENCE: the word
collapses below `sm` and the `▾` carries it alone.** This control sits in the KDS event header **beside
the venue name and the time range**, on a screen whose card column floor is 240px — the same
`hidden sm:inline` idiom the header's own Dashboard link, Sound chip and Payments chip already use.
**The dashboard's copy has a full-width header row and needs no collapse.** ⚠️ **The colours are NOT
matched** — the KDS keeps its own light bordered chip; the dashboard's is dark on a dark header.
**Matching those would have made a white-header control unreadable.**

## B3. "Change event" is already inside it

✅ **CONFIRMED — READ, `kds/page.tsx:1642-1647`, untouched by this task:**

```tsx
            {events.length > 1 && (
              <button onClick={() => { setShowEventMenu(false); setShowEventPicker(true) }}
                className="w-full text-left py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 border border-slate-100 rounded-xl px-3 mb-4">
                Change event
              </button>
            )}
```

⚠️ **ONE COSMETIC DIFFERENCE, LEFT ALONE AS OUT OF SCOPE:** the dashboard's entry reads
`📅 Change event` (`page.tsx:4990`); the KDS's has no emoji. **Not changed — B2 scoped the rename to
the trigger.**

## B4. The event strip is gone — no remnant

✅ **CONFIRMED. "Not found" is the result.** **READ** — the only surviving `⋯` in the file is inside
**my own new comment quoting the old label** (line 1514); there is no `⋯` control left. The only
`events.map` (line 1702) is the **event PICKER overlay** the menu opens, which is correct. The only
`overflow-x-auto` row (line 1439) is the **"To make" pill bar**, a different feature.

**READ** — the strip's replacement note, still in place at `:1634-1641`:

```
            {/* ── CHANGE EVENT — WAS A PERMANENT STRIP OF CHIPS ABOVE THE BOARD ────────────────────
                🔴 THE STRIP LISTED EVERY UPCOMING EVENT AND THE HEADER DIRECTLY BELOW IT ALREADY NAMED
                THE SELECTED ONE, so it spent a row of a kitchen screen restating what the next row
                said. …
                ⚠️ PRESENTATION ONLY. It calls the SAME switchEvent, with the SAME confirm, and the seed
                (seededRef) is not touched — see the seed note. */}
```

---

# PART C — A PROPER FINISH-TIME CONTROL

## C1. `extendEvent` and its dashboard equivalent

**KDS — READ, `kds/page.tsx:876-889`, LEFT IN PLACE (the recently-closed banner still calls it):**

```ts
  const extendEvent = async (eventId: string, addMins: number) => {
    const ev = events.find(e => e.id === eventId); if (!ev) return
    const [h, m] = ev.end_time.split(':').map(Number)
    const total = h * 60 + m + addMins
    const newEnd = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    try {
      const res = await fetch('/api/events/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'update', eventId, payload: { end_time: newEnd } }) })
      const data = await res.json()
      if (data?.queued) { setPendingSyncCount(c => c + 1); return }
      if (!res.ok) throw new Error(data.error)
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, end_time: newEnd } : e))
      showKdsToast(`Extended to ${newEnd}`)
    } catch (err: any) { showKdsToast(err.message || 'Failed') }
  }
```

**DASHBOARD — READ, `page.tsx:5020-5023`, unchanged by this task:**

```tsx
              {/* Extends the event's END TIME by 30 min (extendEvent → end_time) — NOT an order-wait buffer.
                  Labelled explicitly so it isn't confused with "Add extra wait" now sitting beside it. */}
              <button onClick={()=>{extendEvent(activeEvent.id,30);setShowEventMenu(false)}}
                className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Extend event +30 min</button>
```

🔴 **EVERYTHING IT WRITES, READ FROM THE SERVER — `app/api/events/action/route.ts:154-171`:**

```ts
  if (action === 'update') {
    const allowed = [
      'venue_name', 'venue_address', 'start_time', 'end_time',
      'customer_note', 'auto_open', 'auto_close', 'notes'
    ]
    const safe = Object.fromEntries(
      Object.entries(payload).filter(([k]) => allowed.includes(k))
    )

    const { error } = await supabase
      .from('truck_events')
      .update({ ...safe, updated_at: now })
      .eq('id', eventId)
      .eq('truck_id', truck.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
```

✅ **`truck_events.end_time` and `updated_at`. NOTHING ELSE. No order, no status, no production slot,
no payment call** — and the route imports nothing from `lib/payments/`.

## C2. The new control

**Three pieces, all READ from the file as it now stands.**

**(1) THE OPTIONS — future relative to NOW, both directions:**

```ts
  const finishTimeOptions = (() => {
    if (!activeEvent?.event_date) return [] as string[]
    const now = Date.now()
    const out: string[] = []
    for (let mins = 0; mins < 24 * 60; mins += 15) {
      const hh = String(Math.floor(mins / 60)).padStart(2, '0')
      const mm = String(mins % 60).padStart(2, '0')
      if (new Date(`${activeEvent.event_date}T${hh}:${mm}`).getTime() > now) out.push(`${hh}:${mm}`)
    }
    return out
  })()
```

# 🔴 THE VALIDATION, QUOTED, IS THE SINGLE LINE `.getTime() > now`.

✅ **The comparison is against `Date.now()`, NOT against `end_time`.** That is exactly the requirement:
a truck scheduled until 21:00 that sells out at 19:20 **is offered 19:30**, because 19:30 is ahead of
the clock even though it is behind the current finish. ⚠️ **Built against
`activeEvent.event_date`, not today**, so a past-dated event yields an empty list and the modal says so
rather than offering times that have gone. ⚠️ **Recomputed every render, deliberately**, so an operator
who holds the picker open past 19:45 is no longer offered 19:45.

**(2) EARLIER TIMES ARE SELECTABLE, AND FLAGGED WHEN CHOSEN:**

```tsx
                {finishTimePicker.current && finishTimePicker.selected < finishTimePicker.current && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                    That is earlier than the current finish time. Customers will not be able to order for times after it.
                  </p>
                )}
```

**(3) THE CURRENT FINISH TIME IS SHOWN — in three places:** in the menu button
(`Change event finish time (now 21:00)`), in the picker's sentence, and as the select's starting value
and `(current)` suffix:

```tsx
            <p className="text-sm text-slate-600">
              {finishTimePicker.current
                ? <>This event is currently set to finish at <span className="font-bold text-slate-900">{finishTimePicker.current}</span>.</>
                : 'This event has no finish time set.'}
            </p>
```

⚠️ **The submit button is disabled while `selected === current`**, so "confirm" can never be a no-op
write.

## C3. The final label

# **`Change event finish time (now 21:00)`**

**READ** — `kds/page.tsx`, inside the Event actions menu:

```tsx
              <button onClick={() => { setShowEventMenu(false); setFinishTimePicker({ eventId: activeEvent.id, current: (activeEvent.end_time || '').slice(0, 5), selected: (activeEvent.end_time || '').slice(0, 5) }) }}
                className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">
                Change event finish time{activeEvent.end_time ? ` (now ${activeEvent.end_time.slice(0, 5)})` : ''}
              </button>
```

⚠️ **The current time is in the LABEL, not behind the tap** — the specific thing `+30 min` could not
do. The modal heading is the shorter **"Change finish time"**, because the word "event" is already
carried by the menu it opens from.

## C4. 🔴 UNDOABLE — I CHOSE A CONFIRMATION, NOT AN UNDO

**A two-step commit: `finishTimePicker` (writes nothing) → `finishTimeConfirm` (the only writer).**

**READ** — the confirm:

```tsx
      {finishTimeConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 text-base mb-1">Change finish time?</h3>
            <p className="text-sm text-slate-600">
              This event will finish at <span className="font-bold text-slate-900">{finishTimeConfirm.next}</span>
              {finishTimeConfirm.current ? <> instead of <span className="font-bold text-slate-900">{finishTimeConfirm.current}</span></> : null}.
            </p>
```

**WHY A CONFIRMATION AND NOT AN UNDO — three reasons, and the first is decisive:**

1. 🔴 **THE SCREEN IS UNATTENDED.** An undo toast expires. A tap that nobody was standing in front of
   would be undoable **only by whoever happened to be looking during the seconds it was up** — which is
   precisely the population that did not see the accidental tap either. **A confirmation does not
   expire; it blocks.**
2. 🔴 **§38's RULE POINTS THE SAME WAY.** *Back may dismiss a decision but never make one.* An undo
   inverts that: the write has already happened and the operator must ACT to unmake it. **A confirm
   keeps the destructive direction behind a deliberate press and the safe direction behind everything
   else** — the backdrop, the back gesture, and a button that **names the time it keeps**
   (`Keep 21:00`, never a bare "Cancel" beside an event control).
3. ✅ **IT MATCHES THE SURFACE'S OWN IDIOM.** Finish event and Cancel event already gate on styled
   confirms in this same file. **A third pattern here would be the inconsistency.**

⚠️ **AND THE PICKER ITSELF IS THE FIRST HALF OF THE UNDO:** closing it discards `selected` entirely —
the draft lives inside the picker's state object, so there is nothing to leak back in on the next open.
**Every open starts from the event's current finish time.**

## C5. ⚠️ ORDERS DUE AFTER A SHORTENED FINISH TIME — AND THE INSTRUCTION RULING

**WHAT HAPPENS TO THEM, QUOTED: NOTHING. The `update` handler writes `end_time` and `updated_at` and
touches no order** (the allow-list in C1). **READ** — no order write, no status change, no cancellation
and no email exists on that path.

**INFERRED, and this is the part that matters: "nothing" is not the same as "orphaned".** Those orders
**keep their `slot`, keep their status, stay on the board, stay in `confirmedOrders`, still print,
still capture.** `end_time` feeds **slot GENERATION for new orders** — **READ**,
`lib/slot-generation.ts:24-38`:

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
```

✅ **So shortening removes FUTURE offerings; it does not reach backwards into orders already taken.**

🔴 **THE INSTRUCTION RULING, FLAGGED RATHER THAN DECIDED QUIETLY.** C2 requires earlier times to be
selectable; C5 says *"If nothing handles it, STOP and report — do not silently orphan orders."*
**Nothing handles it.** I read the operative word as **"silently"**, and satisfied both by making the
confirmation **name the affected orders**, so the shortening cannot be silent:

```tsx
  const ordersDueAfter = (endTime: string) =>
    activeOrders.filter(o => !!o.slot && o.slot.slice(0, 5) > endTime).length
```

```tsx
            {finishTimeConfirm.affected > 0 && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mt-3">
                <span className="font-bold">{finishTimeConfirm.affected} order{finishTimeConfirm.affected === 1 ? ' is' : 's are'} due after {finishTimeConfirm.next}.</span>{' '}
                {finishTimeConfirm.affected === 1 ? 'It stays' : 'They stay'} on the board and still {finishTimeConfirm.affected === 1 ? 'needs' : 'need'} making. Changing the finish time only stops NEW orders being placed for later times.
              </p>
            )}
```

⚠️ **THIS IS A JUDGEMENT AND YOU MAY OVERRIDE IT.** If C5 meant a hard stop — build nothing until
orphan handling exists — **say so and I will remove the control in one edit.** I did not stop because
stopping would have delivered nothing while leaving `+30 min` absent, and because the count makes the
consequence explicit at the moment of decision. ⚠️ **ASAP (null-slot) orders are excluded from the
count deliberately: they have no promised time to fall after.**

🔴 **THE RESIDUAL RISK, STATED: nothing tells the CUSTOMER.** A customer holding a 20:45 slot on an
event now finishing at 19:30 gets **no email and no notification** — their order is still valid and
still owed, but their expectation is now wrong. **NOT FIXED, NOT IN SCOPE, and the operator sees the
count that tells them to make the calls.**

## C6. Consumers of `end_time` — capacity, pre-orders, the customer page

| Consumer | Effect of a finish-time change | READ |
|---|---|---|
| **Slot generation** | ✅ **THE INTENDED ONE** — the collection-time list is regenerated between start and `end + grace` | `lib/slot-generation.ts:24-38` |
| **Capacity engine** | 🔴 **NO DEPENDENCY ON `end_time`.** `getProductionSlotUnits` filters on `truck_id`, `event_id` and `.in('status', [...])` | `lib/slot-bookings.ts:216-226` |
| **`production_slot_usage`** | ✅ **UNTOUCHED** — no rebuild is called on this path; the update handler does not import it | `events/action/route.ts:154-171` |
| **Order submit** | reads `end_time` only to carry the event's window onto the order | `app/api/orders/submit/route.ts:520,910` |
| **Event sorting/overlap** | `lib/time-utils.ts:110`, `lib/event-conflicts.ts:72` — ordering and clash detection only | READ |
| **`auto_close`** | ⚠️ documented as *"closes automatically at end_time"* — **NO enforcing code found in `app/` or `lib/`** | `20260522_event_system.sql:74-76` |
| **Payments** | 🔴 **NONE.** The route imports nothing from `lib/payments/` | READ |

⚠️ **THE `auto_close` GAP IS A "NOT FOUND", STATED PLAINLY.** The column comment promises automatic
closure at `end_time`, and I found no scheduler implementing it (`app/api/cron/` holds
account-deletion-due, cancel-stale-authorizations, capture-stranded-authorizations, demo-cleanup).
**INFERRED: if it were implemented, shortening the finish time would ALSO auto-close the event — which
would make C5's orders visible on a closed event. It is not implemented, so today the change is
purely an ordering-window change.** **Reported, not investigated.**

## C7. Registered with the back handler, non-committing

**READ** — the new arms:

```ts
  useAndroidBack([
    [isDemo && showKdsIntro, () => dismissKdsIntro()],
    [!!finishTimeConfirm && !finishTimeBusy, () => setFinishTimeConfirm(null)],
    [!!finishTimePicker, () => setFinishTimePicker(null)],
    [deviceOpen && !isDemo, () => setDeviceOpen(false)],
    [!!finishConfirm, () => setFinishConfirm(null)],
    [showEventPicker, () => setShowEventPicker(false)],
    [!!eventCancelTarget && !eventCancelBusy, () => setEventCancelTarget(null)],
    [showEventMenu && !!activeEvent && !isDemo, () => setShowEventMenu(false)],
    [showScreenOffWarning, () => setShowScreenOffWarning(false)],
  ])
```

✅ **BOTH ARMS ONLY CLEAR STATE. Neither calls `applyFinishTime`. Back can never change a finish
time.** ✅ **Ordered innermost-first per the list's own rule: the confirm is `z-[70]`, the picker
`z-[60]`, so they precede the `z-50` entries.** ⚠️ **The confirm's arm is gated on `!finishTimeBusy`,
so a press mid-write cannot unmount the modal while its POST is in flight — the same guard
`eventCancelTarget` uses.**

---

# PART D — REPORT ONLY, NOT FIXED

## D1. Both order-ready toggles claim to control the email. The email is not gated.

**STRING 1 — the DASHBOARD's per-event toggle. READ, `app/dashboard/[token]/page.tsx:3938`:**

```tsx
                  <p className="text-xs text-slate-500 mt-0.5">Show a &ldquo;Mark ready&rdquo; button on the orders screen and notify customers by email when their order is ready.</p>
```

**STRING 2 — the MANAGE truck default. READ, `lib/settings-copy.ts:125-129`:**

```ts
  orderReady: {
    label: 'Order-ready step',
    help: 'Show a “Mark ready” button on the orders screen and notify customers when their order is ready. '
      + 'Useful for collection at pubs and festivals. Applies to all events — you can still turn it on or '
      + 'off for a single event on its dashboard.',
```

**THE UNGATED SEND — READ, `app/api/dashboard/action/route.ts:428-440`:**

```ts
    if (action === 'ready') {
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'ready' }).eq('order_key', orderKey).eq('truck_id', truck.id)
…
      if (!body.defer_email) {
        await deliverReadyEmail(order, truck)
      }
```

🔴 **`deliverReadyEmail` is guarded ONLY by `defer_email`** — a client-side timing flag, not the
setting. **Neither `effectiveOrderReady` nor `order_ready_enabled` appears anywhere in this handler.**
**And the card's own comment states the design — READ, `OrderCard.tsx:131-133`:** *"Gates the
orders-screen (solo) Ready button — NOT the email (model A: the email always fires on ready)."*

⚠️ **CONSEQUENCE: an operator who turns the step OFF to stop the emails will still send them**, from
any KDS cook screen, which has a Ready button unconditionally. **REPORT ONLY — not changed.**

## D2. The stuck Window tablet

**READ — `components/dashboard/OrderCard.tsx:866-875`:**

```tsx
      } else {
        // Cooking gate active
        if (['confirmed', 'modified'].includes(order.status)) {
          return (
            <>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">⏳ Waiting</span>
              {completionBtnDisabled()}
            </>
          )
```

**And the button is genuinely inert — READ, `:668-676`:**

```tsx
  const completionBtnDisabled = () => (
    <button disabled className="flex-1 bg-slate-200 text-slate-400 font-bold py-3 rounded-xl text-sm cursor-not-allowed">
```

🔴 **A truck with `kds_mode` ON running ONE Window tablet, payments on, cannot complete any order from
that screen** until another surface writes `'ready'`. **The gate is `truck.kds_mode`** (`kds/page.tsx`,
`const kdsMode = truck?.kds_mode ?? false`), **not the order-ready setting.** **REPORT ONLY — not
changed.**

## D3. The recently-closed banner's "Extend 30 min"

**READ — `kds/page.tsx:1437-1442`, UNCHANGED by this task:**

```tsx
      {recentlyClosed && activeEvent && (
        <div className="mx-3 mt-2 mb-1 bg-slate-100 border border-slate-200 rounded-xl p-3 flex items-center justify-between flex-shrink-0">
          <span className="text-sm text-slate-600">Event finished · {activeEvent.venue_name} ended at {formatTime(activeEvent.end_time)}</span>
          <button onClick={() => extendEvent(activeEvent.id, 30)} className="text-sm font-medium text-teal-600 hover:text-teal-700 ml-3 flex-shrink-0">Extend 30 min</button>
        </div>
      )}
```

# 🔴 MY VIEW: NO — Part C's control should NOT replace it, and the reason is that the risks are opposite.

**INFERRED, and the removed header control's own note already drew this line** (*"a DIFFERENT
affordance (recovering an event that has already ended) and is deliberately left"*):

- **This one is RECOVERY, not adjustment.** It appears only within 10 minutes of an event closing, and
  its job is to un-strand a truck still serving. **Putting a two-step confirm in front of a recovery
  control makes the emergency slower.**
- **The accident profile is different.** An accidental `+30` on a **finished** event extends an event
  nobody is ordering from; an accidental `+30` on a **live** event moves a service the truck is in the
  middle of. **The header control was the dangerous one and it is gone.**
- ⚠️ **THREE REAL PROBLEMS WITH IT REMAIN, and I am reporting them rather than fixing them:** it is
  **~14px** (`text-sm`) sitting **above the order grid**; it has **no confirmation**; and it is
  **relative**, so pressing it twice silently adds an hour. 🔴 **The strongest counter-argument to my
  own position: this control is reachable when the event has closed, which is when a truck is packing
  up and least likely to be watching the screen.** **Your call, not mine. NOT CHANGED.**

---

# PART E — SYNC

# ✅ E1: SKIPPED. NOTHING NATIVE CHANGED.

**One file changed and it is a React page component:** `app/dashboard/[token]/kds/page.tsx`. **No
`ios/` file, no `android/` file, no `capacitor.config.*`, no `package.json`, no plugin added or
removed.** **`npx cap sync` was NOT run**, correctly — E2 does not apply, and `cap sync` was permitted
only if native config had changed. `git status` in G6 is the proof.

---

# PART F — BOUNDARIES

## F1. `git diff --stat`

```
$ git diff --stat
 app/dashboard/[token]/kds/page.tsx | 242 +++++++++++++++++++++++++++++++++----
 1 file changed, 221 insertions(+), 21 deletions(-)
```

✅ **ONE FILE. Therefore, by inspection of the stat alone:**

| Boundary | Proof |
|---|---|
| **No payment path** | `lib/payments/**` absent; `app/api/**` absent |
| **No capacity engine** | `lib/slot-bookings.ts`, `lib/capacity-breach.ts`, `lib/slot-generation.ts` absent |
| **No gate** | `lib/features.ts`, `lib/plan-features.ts` absent |
| **No migration** | `supabase/migrations/**` absent |
| **No API route** | `app/api/events/action/route.ts` **NOT modified** — the new control POSTs to the existing handler |
| **No shared component** | `components/**` absent — `OrderCard.tsx` untouched |
| **No native** | `ios/**`, `android/**` absent |

✅ **The seed is untouched:** `git diff` contains neither `seededRef` nor `setSelectedEventId`.

## F2. What a Pizzeria Gusto operator sees differently mid-service

**Almost nothing changes, and that is deliberate.** The board, the cards, the buttons, the colours and
every order's lifecycle are byte-identical — no status, capture, capacity or email behaviour moved.
Three things differ. First, when the KDS is reopened after being closed or backgrounded, it now comes
back **already** in the view, layout and sound state it was left in, instead of showing a
window-shaped board for a frame before flipping to cook — **on Gusto's grill screen that removes a
flash of prices and payment buttons on a device configured never to show them**. Second, the `⋯` in
the event row now reads **`Event actions ▾`**, the same words as the dashboard, so the menu that
finishes and cancels a service is named rather than hinted at. Third, that menu has a new entry,
**`Change event finish time (now 21:00)`**, which opens a picker and then a confirmation — so
adjusting a finish time is two deliberate presses that both show the before and after, and **an
accidental press changes nothing**, where the control it replaces wrote immediately with no undo.
⚠️ **Gusto's payments toggle is not rendered at all** (`show_paid_step` is off by default), so nothing
about money UI changes for them either way.

---

# PART G — INTEGRITY

## G1 / G2. Non-ASCII census, before and after, side by side

**One file was edited. Every difference is explained.**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+00A7 SECTION SIGN | 3 | 4 | **+1** | the `§38` citation in the back-handler comment |
| U+1F534 LARGE RED CIRCLE | 38 | 47 | **+9** | headline markers in the new comments |
| U+2014 EM DASH | 135 | 151 | **+16** | prose in the new comments |
| U+2500 BOX DRAWINGS | 1100 | 1375 | **+275** | comment box rules |
| U+26A0 WARNING SIGN | 21 | 34 | **+13** | caveat markers — **all 13 paired with U+FE0F** |
| U+FE0F VAR SELECTOR-16 | 21 | 34 | **+13** | ✅ **exactly matches the U+26A0 delta** |
| **U+25BE DOWN TRIANGLE** | **0** | **3** | 🔴 **+3, A NEW CLASS** | **see the ruling below** |
| U+22EF MIDLINE ELLIPSIS | 1 | 1 | 0 | ⚠️ the `⋯` moved from the BUTTON into a comment quoting it |
| *all 25 other classes* | — | — | **0** | unchanged |
| **TOTAL CLASSES** | **32** | **33** | **+1** | |

# 🔴 THE FILE GAINED ONE CHARACTER CLASS. FLAGGED, NOT HIDDEN.

**U+25BE BLACK DOWN-POINTING SMALL TRIANGLE, ×3** — once in the rendered label and twice in the
comment explaining it. **This is a direct consequence of B2's instruction to "rename to match the
dashboard exactly": the dashboard's label IS `Event actions ▾`, and dropping the `▾` would have made
the labels differ.** ⚠️ **I judged the explicit instruction to outrank the standing census rule here,
because the glyph is not new to the codebase and not new to this control — only to this file.**

✅ **AND IT IS BYTE-IDENTICAL TO THE DASHBOARD'S.** Verified by direct scan of both files: **U+25BE
with NO following U+FE0F** in all three KDS occurrences and all three dashboard occurrences
(`page.tsx:2978, 3008, 3160`). **The two surfaces cannot render it differently.**

⚠️ **U+22EF DID NOT LEAVE THE FILE, which is why the count is unchanged rather than zero.** The `⋯`
button is gone; the surviving occurrence is inside my own comment quoting the label that was removed.
**Deliberate — the comment explains what changed and needs the glyph to do it.**

## G3. 🔴 Carrier-aware variation-selector check

**Per emoji-presentation base, how many are FOLLOWED by U+FE0F.**

**THE EDITED FILE — `app/dashboard/[token]/kds/page.tsx`:**

| Base | BEFORE n / paired / bare | AFTER n / paired / bare | Verdict |
|---|---|---|---|
| U+26A0 WARNING SIGN | 21 / 20 / **1** | 34 / 33 / **1** | ✅ **bare count UNCHANGED at 1** |
| U+2705 CHECK MARK | 2 / 0 / 2 | 2 / 0 / 2 | ✅ unchanged |
| U+1F534 RED CIRCLE | 38 / 0 / 38 | 47 / 0 / 47 | ✅ consistent — all bare, as before |
| U+2600 BLACK SUN | 1 / 1 / 0 | 1 / 1 / 0 | ✅ unchanged |
| U+25BE TRIANGLE | 0 | 3 / 0 / 3 | ✅ **matches the dashboard's bare U+25BE** |

🔴 **THE ONE BARE U+26A0 IS PRE-EXISTING, NOT MINE.** The file arrived with 20 paired and 1 bare; it
now has 33 paired and 1 bare. **All 13 warning signs I added are paired, matching the dominant form.
The pre-existing inconsistency is left exactly as found** — fixing it is outside this scope, and
reported here so it is on the record.

**THIS REPORT** — see G5.

## G4. Byte scan of the edited file

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). **Never
grep.**

```
  app/dashboard/[token]/kds/page.tsx   125,591 bytes   offending=0   CR=0
```

✅ **Zero offending bytes, zero CR.** (Before: 106,236 bytes, offending 0, CR 0.)

## G5. Byte scan of this report, and its carrier check

Separate pass, run after writing: **46,692 bytes, offending = 0, CR = 0** — no NUL, no control byte
below 0x09, no CRLF, no lone CR.

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 36 | 0 | 36 |
| U+1F534 LARGE RED CIRCLE | 34 | 0 | 34 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 22 | 0 | 22 |
| U+25BE BLACK DOWN-POINTING SMALL TRIANGLE | 11 | 0 | 11 |
| U+26A0 WARNING SIGN | 36 | **36** | **0** |

**Every warning sign in this report is paired; ZERO are bare — 36 of 36**, and the file's total U+FE0F
count is **36**, which accounts for all of them and leaves none attached to any other base. ⚠️ **The
four unpaired bases are the carrier-correct state, not a defect:** each is internally consistent
(0 of 36, 0 of 34, 0 of 22, 0 of 11), so no base is split across two renderings. ✅ **U+25BE is bare
here exactly as it is bare in both source files**, which is what makes the quoted label faithful.

## G6. `git status` and `git diff --stat`, with THIS task's entries named

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
?? docs/kds-preferences-report.md
?? docs/kds-ready-step-report.md
```

```
$ git diff --stat
 app/dashboard/[token]/kds/page.tsx | 242 +++++++++++++++++++++++++++++++++----
 1 file changed, 221 insertions(+), 21 deletions(-)
```

| Entry | This task? |
|---|---|
| `M app/dashboard/[token]/kds/page.tsx` | ✅ **YES — Parts A, B, C** |
| `?? docs/kds-preferences-report.md` | ✅ **YES — this report** |
| `?? docs/kds-ready-step-report.md` | ❌ **NO — the previous task's report, still uncommitted** |

🔴 **NO OTHER FILE WAS CREATED, MODIFIED OR DELETED.**

---

# PART H — WHAT YOU MUST TEST

**Every item has an explicit PASS and FAILURE. Items 1–6 are the persistence work, 7–13 the finish-time
control, 14–15 the rename.**

### Preferences

**1. Set every header toggle, then leave and return.**
Set Cook, Grid, Sound off, Screen off (and Payments on if `show_paid_step` is on for the truck). Tap
Dashboard, then re-enter the KDS.
**PASS:** all of them come back exactly as set.
**FAILURE:** any one reverts to Window / the truck's layout / Sound on.

**2. 🔴 THE FLASH — the point of Part A.** With the device set to **Cook**, fully close and reopen the
KDS (or hard-reload) and **watch the first paint**.
**PASS:** the cook board is there from the first frame — no prices, no payment buttons, at any moment.
**FAILURE:** a window-shaped board with prices appears briefly before flipping to cook. ⚠️ **Worth
filming at 60fps if you are unsure; this is a one-frame defect.**

**3. Cold kill, not just a navigation.** Swipe the app away on the iPad, relaunch to the KDS.
**PASS:** view, layout and sound restored; **Payments** restored too (it is in `Preferences` /
UserDefaults, which survives this).
**FAILURE:** anything defaults. ⚠️ **If only Payments resets, that is the `Preferences` plugin, not
this change.**

**4. First-ever launch.** In a private window or after clearing site data, open the KDS.
**PASS:** Window, the truck's own List/Grid setting, Sound ON, Screen ON, Payments hidden.
**FAILURE:** any other combination — especially payments UI appearing.

**5. Two trucks, one iPad.** Open truck A's KDS, set Cook; open truck B's KDS.
**PASS:** truck B is unaffected (keys are token-scoped).
**FAILURE:** truck B opens in Cook.

**6. 🔴 THE SEED IS UNHARMED.** With a stored Cook preference, reopen the KDS on a day with more than
one event.
**PASS:** the same event is selected as before this change, and it does **not** re-resolve while you
work.
**FAILURE:** the selected event changes on reopen or jumps mid-service. ⚠️ **This is the regression to
watch hardest — report it immediately.**

### Change event finish time

**7. Open it.** Event actions → `Change event finish time (now HH:MM)`.
**PASS:** the button shows the event's real current finish time; the modal repeats it.
**FAILURE:** it shows `(now )`, a wrong time, or nothing.

**8. Change to a LATER time.** Pick a time after the current finish → Review change → Change finish
time.
**PASS:** toast `Finish time now HH:MM`; the event header's time range updates; the dashboard shows the
same new time after a refresh.
**FAILURE:** header unchanged, or the dashboard disagrees.

**9. 🔴 Change to an EARLIER time.** With the event running until, say, 21:00, pick a time ~15 minutes
ahead of now.
**PASS:** it is **selectable**, an amber note appears in the picker, and it applies.
**FAILURE:** earlier times are missing or greyed out — that is the exact defect C2 exists to prevent.

**10. 🔴 Try to select a PAST time.**
**PASS:** times already gone are **not in the list at all**; only the current finish appears as a
non-submittable `(current)` entry once it is past.
**FAILURE:** any time earlier than the clock is offered. ⚠️ **Also leave the picker open across a
quarter-hour boundary, then reopen it — the just-passed time must be gone.**

**11. 🔴 UNDO — the accidental tap.** Open it, pick a time, then (a) press **Cancel**, (b) tap the
**backdrop**, and (c) on Android press **back** — from both the picker and the confirm.
**PASS:** in all six cases the finish time is **unchanged** and no toast fires.
**FAILURE:** any of them writes. 🔴 **Back committing a change is the worst possible result here.**

**12. The no-op guard.** Open it and press Review change without changing anything.
**PASS:** the button is disabled.
**FAILURE:** it opens a confirm for a change to the same time.

**13. 🔴 AN ORDER DUE AFTER A SHORTENED FINISH TIME — C5.** Take an order for a late slot, then set the
finish time earlier than it.
**PASS:** the confirm names the count (`1 order is due after 19:30…`); after applying, **that order is
still on the board, still cookable, still completable**, and the customer ordering page no longer
offers times after 19:30.
**FAILURE:** the order vanishes, changes status, or is cancelled — **stop and tell me**. ⚠️ **Expected
and NOT a failure: the customer is not notified. That is reported at C5 and is not built.**

### The rename

**14. The label.** Look at the event header on a wide screen and on a narrow one.
**PASS:** `Event actions ▾` on wide; a `▾` alone when narrow; both open the same menu.
**FAILURE:** the triangle renders as a box, or the label wraps the header onto two lines.

**15. The menu is intact.** Open it.
**PASS:** Change event (when >1 event), Customer note + Save, **Change event finish time**, Finish
event, Cancel event.
**FAILURE:** any entry missing — particularly Change event, which a previous task moved here.
