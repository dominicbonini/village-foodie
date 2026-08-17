# The finish-time label, the KDS order-ready toggle, and the shared Event actions menu

**No `next dev`, no `next build`, no `cap sync`, no deploy, no database write, no SQL.** `lib/payments/`
was not edited and is absent from the diff. **`npx tsc --noEmit` passes with no output** — not a build.

**Files changed by THIS task: three.** `components/shared/EventActionsModal.tsx` (new),
`app/dashboard/[token]/kds/page.tsx`, `app/dashboard/[token]/page.tsx`. ⚠️ **Five other entries in
`git status` are from three earlier tasks and are NOT this task's** — see D6.

**No span of the prompt arrived garbled.** ⚠️ **ONE INSTRUCTION REVERSES AN EARLIER AGREED DECISION —
flagged rather than applied silently, and then applied:** the KDS's recently-closed `Extend 30 min`
was deliberately KEPT last task on your agreement, and you have now asked for it removed. **I treated
the later instruction as the decision and removed it (KDS only).** See the "Extras" section.

Every claim is marked **READ** or **INFERRED**. **Dashboard and KDS are reported separately.**

# 🔴 PART B'S ANSWER, UP FRONT: THE CHIP EXISTS. I DID NOT CHANGE ITS GATING, AND HERE IS WHY.

**It is real, it is wired, and it is one tap away — but that tap is on the Payments chip, not on
anything labelled "ready step".** B2 has the proof and B4 has the reasoning. **This is the third
report on this control, so I verified it from the code rather than from either previous report.**

---

# PART A — REMOVE THE CURRENT TIME FROM THE MENU BUTTON

## A1. The label on both surfaces, before

**KDS — READ:**

```tsx
              <button onClick={() => { setShowEventMenu(false); setFinishTimeTarget({ id: activeEvent.id, end_time: activeEvent.end_time ?? null, event_date: activeEvent.event_date ?? null }) }}
                className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">
                Change event finish time{activeEvent.end_time ? ` (now ${activeEvent.end_time.slice(0, 5)})` : ''}
              </button>
```

**DASHBOARD — READ:**

```tsx
              <button onClick={()=>{setShowEventMenu(false);setFinishTimeTarget({id:activeEvent.id,end_time:activeEvent.end_time??null,event_date:activeEvent.event_date??null})}}
                className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Change event finish time{activeEvent.end_time?` (now ${activeEvent.end_time.slice(0,5)})`:''}</button>
```

## A2. The suffix removed

✅ **Both now read exactly `Change event finish time`.** **READ — the shared menu, which is where the
label now lives (see A4):**

```tsx
          {/* ⚠️ NO "(now HH:MM)" SUFFIX. The finish-time modal states the current time in its first
              sentence and again as the select's starting value; a third copy here was the only one that
              could go stale against a change made on the other surface. */}
          <button onClick={onChangeFinishTime}
            className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Change event finish time</button>
```

⚠️ **The staleness point is not decoration: the button reads `activeEvent.end_time` from whichever
screen's event list it is rendered from, so a change made on the other surface could leave a `(now
21:00)` on a button whose modal correctly says 19:30.** Removing it removes that possibility.

## A3. 🔴 The MODAL still shows the current finish time — untouched

**READ — `components/shared/EventFinishTimeModal.tsx`, NOT edited by this task (absent from the
diff):**

```tsx
        <p className="text-sm text-slate-600">
          {current
            ? <>This event is currently set to finish at <span className="font-bold text-slate-900">{current}</span>.</>
            : 'This event has no finish time set.'}
        </p>
```

**And again on the select itself:**

```tsx
              {!options.includes(selected) && (
                <option value={selected}>{selected || '--:--'} (current)</option>
              )}
              {options.map(t => (
                <option key={t} value={t}>{t}{t === current ? ' (current)' : ''}</option>
              ))}
```

**And a third time in the confirm's safe button:**

```tsx
              {current ? `Keep ${current}` : 'Keep as is'}
```

✅ **THREE PLACES INSIDE THE MODAL STILL NAME IT.** ⚠️ **`components/shared/EventFinishTimeModal.tsx`
does not appear in `git diff --stat` at all — the operator can still see exactly what they are
changing.**

## A4. Where the label lives

🔴 **IT WAS AT THE CALL SITES, NOT IN THE COMPONENT — so one change did NOT cover both.** The shared
component owns the *modal*; the *menu button that opens it* was written out in each page.

**Stated plainly, as A4 requires: I changed both.** ✅ **And I then went further, because you asked
mid-task for the whole menu to be DRY: the button now lives in the new
`components/shared/EventActionsModal.tsx`, so there is one copy of this label in the codebase and the
next change to it cannot miss a surface.** See the Extras section.

---

# PART B — 🔴 THE ORDER-READY TOGGLE, VERIFIED FROM CODE

## B1. The chip, in full

# ✅ IT EXISTS. NOT "NOT FOUND".

**READ — `app/dashboard/[token]/kds/page.tsx`, all four pieces.**

**THE STATE — the lazy initialiser, as B5 requires:**

```ts
  const [readyStepOn, setReadyStepOn] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem(`hg_kds_readystep_${token}`) !== 'off'
  })
```

**THE PERSISTENCE KEY — `hg_kds_readystep_<token>`, and its writer:**

```ts
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(`hg_kds_readystep_${token}`, readyStepOn ? 'on' : 'off')
  }, [readyStepOn, token])
```

**THE CHIP, WITH ITS RENDER CONDITION AND HANDLER:**

```tsx
        {activeView === 'window' && !hidePayments && (
          <button
            onClick={() => setReadyStepOn(v => !v)}
            title={readyStepOn
              ? 'Ready step on — an order is marked ready, then handed over. Tap to complete orders in one step.'
              : 'Ready step off — orders are completed in one step on this screen. Tap to bring the ready step back.'}
            className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
              readyStepOn ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
            }`}
          >
…
            <span aria-hidden>✓</span>
            <span className="hidden sm:inline text-xs">{readyStepOn ? 'Ready step' : 'No ready step'}</span>
          </button>
        )}
```

**THE WIRING TO THE CARD:**

```tsx
                readyStepOff={cardViewMode === 'window' && !readyStepOn}
```

**AND THE CARD'S BRANCH — READ, `components/dashboard/OrderCard.tsx`:**

```tsx
      if (readyStepOff) {
        if (['confirmed', 'modified', 'cooking', 'ready'].includes(order.status)) {
          return completionBtn()
        }
      }
```

## B2. 🔴 EVERY GATE, AND THE ONE TEST KITCHEN FAILS

**There are TWO gates on the chip itself and a third on the value behind one of them.**

```tsx
        {activeView === 'window' && !hidePayments && (
```

**Gate 1 — READ:**

```ts
  const activeView: KdsView = can('cook_screen')
    ? (viewOverride ?? (isDemo ? 'window' : kdsView))
    : 'window'
```

**Gate 2, expanded — READ:**

```ts
  const { showPaidStep } = resolvePaidStep(truck, activeEvent)
  const hidePayments = showPaidStep && showPaymentsPref !== true
```

**WHAT A TRUCK MUST HAVE SET FOR THE CHIP TO APPEAR:**

| # | Condition | Met when |
|---|---|---|
| 1 | `activeView === 'window'` | the KDS is on the **Window** tab (the default) |
| 2 | `!hidePayments` | **EITHER** `show_paid_step` is OFF for this truck/event **OR** this device's Payments chip is **ON** |

# 🔴 TEST KITCHEN FAILS GATE 2, AND THE EVIDENCE IS YOUR OWN SCREENSHOT.

**INFERRED, from code plus your screenshot — and the inference is short and checkable:**

```
You see a chip reading "No payments", greyed.
  → That chip renders only when `showPaidStep` is TRUE          (its own gate)
  → It reads "No payments" only when `hidePayments` is TRUE     (its label ternary)
  → `hidePayments === true`  ⇒  `!hidePayments === false`
  → THE READY STEP CHIP CANNOT RENDER.
```

⚠️ **STATED AS AN INFERENCE, NOT A READ, AND HERE IS ITS LIMIT** — this is exactly the mistake the
brief warns about, so I am naming the boundary. **I cannot read `trucks.show_paid_step` or this
device's `hg_kds_payments_<token>` from the repository**; they are runtime values. **What I can say
with certainty is the logic, and that a greyed "No payments" chip is only reachable when
`hidePayments` is true.** ⚠️ **The earlier error was the opposite kind — reasoning from a column
DEFAULT to a live value. This reasons from an observed rendering back to the value that must produce
it, which is sound.**

✅ **CONFIRM IT IN ONE LOOK: if the chip beside Sound is GREEN and reads "Payments", the Ready step
chip should be immediately to its right. If it is GREY and reads "No payments", it will not be
there.**

## B3. Not applicable — it exists

✅ **The control was built and is present. This report is not correcting a second false claim; B1
quotes working code.** ⚠️ **What the previous report got wrong was not the existence — it was failing
to say that the chip is invisible on precisely the configuration you were testing.**

## B4. 🔴 THE GATING — what it should be, and why I did NOT change it

# I LEFT THE GATE ALONE. THAT IS A JUDGEMENT AND YOU CAN OVERRULE IT.

**WHY `!hidePayments` WAS CHOSEN — and the reason survives inspection. READ,
`components/dashboard/OrderCard.tsx`, the branch ORDER:**

```tsx
    if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
      if (['confirmed', 'modified'].includes(order.status)) {
        return kdsMode ? (
          <>
            <Btn label="Start cooking" … />
            <Btn label="Ready"         … />
          </>
        ) : (
          <Btn label="Ready" … />
        )
      }
…
      return null
    }

    if (viewMode === 'window') {
      if (readyStepOff) { … }
```

🔴 **A WINDOW DEVICE WITH PAYMENTS OFF TAKES THE COOK BRANCH AND RETURNS BEFORE `readyStepOff` IS EVER
EVALUATED.** On such a device `Ready` is the **only** action the card has — there is no completion
button, because the device is deliberately configured to show no money. **So "ready step off" has no
coherent meaning there: turning it off would leave the card with nothing to press.**

**INFERRED, and this is the whole of my reasoning: the gate is not arbitrary, it is the exact
boundary of where the setting can vary.** Removing it would put a control on screen that either does
nothing, or — worse — would have to be made "work" by showing a money button on a device configured
not to show one. **On a truck trading real money, that is not a trade I will make without you asking
for it explicitly.**

# ✅ WHAT TO DO INSTEAD — ONE TAP, NO CODE CHANGE

**Tap the `💷 No payments` chip so it turns green and reads `Payments`.** The Ready step chip appears
immediately beside it, and you can then turn the ready step off. **READ — the payments chip's own
tooltip already describes this trade:**

```
              ? 'Payments off — this screen finishes at Ready. Tap to take payment here.'
              : 'Payments on — tickets stay until paid & collected. Tap to finish at Ready instead.'
```

⚠️ **THE REAL DEFECT, NAMED: DISCOVERABILITY, NOT GATING.** Nothing on that screen tells an operator
that a second control is hidden behind the first, and a `title` does not appear on a touch device.
🔴 **IF YOU WANT IT VISIBLE ON A PAYMENTS-OFF DEVICE TOO, SAY SO AND I WILL RENDER IT THERE IN A
LOCKED "ON" STATE** — visible, explaining that this device finishes at Ready because it does not take
payments, following the demo event-lock precedent (`show, don't hide`) rather than inventing a
behaviour the card cannot support. **I did not do that unprompted because a locked control is a
design decision, not a bug fix.**

⚠️ **Window/Cook is untouched, as required — it remains the two-device role split and is separate from
this.**

## B5. The requirements, checked against the built control

| Requirement | Status |
|---|---|
| Per-device, independent of the dashboard's setting | ✅ **`localStorage` keyed by token; the KDS never passes `effectiveOrderReady`, and `OrderCard` reads that prop only in its `solo` branch, which the KDS never renders** |
| `keep_screen_on`'s lazy-initialiser pattern, no second mechanism | ✅ **same `useState(() => …)` + SSR guard + `hg_kds_*_<token>` key as `keepScreenOn`, `viewOverride`, `layoutOverride`, `soundEnabled`** |
| 🔴 Restores on the FIRST FRAME | ✅ **resolved in the initialiser, before the first render — there is no frame in which it is unapplied** |
| Reachable in the views an operator uses | ⚠️ **Window view, but ONLY with Payments on — B2/B4** |

## B6. 🔴 THE LIFECYCLE WITH THE STEP OFF — `cooking` confirmed present

**READ — the branch, unchanged by this task:**

```tsx
      if (readyStepOff) {
        if (['confirmed', 'modified', 'cooking', 'ready'].includes(order.status)) {
          return completionBtn()
        }
      }
```

✅ **`'cooking'` IS IN THE LIST. CONFIRMED BY READING, NOT BY MEMORY.**

| Status | Step ON | 🔴 Step OFF |
|---|---|---|
| `pending` | `✓ Confirm` / `✗ Reject` | **identical** — handled before this branch |
| `confirmed` | `⏳ Waiting` + **DISABLED** completion | ✅ **`completionBtn()` — ENABLED** |
| `modified` | `⏳ Waiting` + **DISABLED** completion | ✅ **`completionBtn()` — ENABLED** |
| `cooking` | `🔥 Cooking…` + **DISABLED** completion | ✅ **`completionBtn()` — ENABLED** |
| `ready` | `completionBtn()` | ✅ **`completionBtn()`** |
| `collected` | `↩ Undo` | **identical** — falls through |

# ✅ EVERY NON-TERMINAL STATUS HAS AN ENABLED COMPLETION BUTTON. NO ORDER CAN BE STRANDED.

🔴 **WHY `'cooking'` MATTERS, restated because it is the one that would break silently:** without it a
`cooking` order would fall past the window block into the solo block, which has cases for
`confirmed`/`modified`, `ready` and `collected` **and none for `cooking`**, reaching `return null` — **a
card with NO BUTTONS on the only screen that takes money.** A cook device on the same truck can put an
order into `cooking` at any moment, so it is a live path.

## B7. ⚠️ Capacity — late, never never

**READ — `lib/slot-bookings.ts`, the single source:**

```ts
    // Occupies the oven from placement THROUGH cooking; RELEASES at 'ready' (done cooking — sitting on
    // the counter) and at collected/cancelled/rejected. …
    .in('status', ['pending', 'confirmed', 'modified', 'cooking'])
```

✅ **`'ready'` AND `'collected'` ARE BOTH OUTSIDE THE ALLOW-LIST**, and `lib/capacity-breach.ts` states
the same rule: *"'ready' is released, 'collected'/'cancelled'/'rejected' are terminal — none contribute
load"*.

- **Step ON:** the slot frees at `ready` — when the food comes off the grill.
- **Step OFF:** the slot frees at `collected` — when the customer takes it.

# ✅ LATE, NOT NEVER. A skipped ready step delays the release across the handover window; it cannot strand a slot.

⚠️ **INFERRED: the cost is an UNDERSELL — the capacity engine may refuse a new order for a window that
is genuinely free. Never an oversell.** ⚠️ **NOT VERIFIED, stated as a gap: I did not read the
`collected` handler to confirm it rebuilds. If it does not, the delay becomes permanent.**

---

# EXTRAS — THE THREE MID-TASK INSTRUCTIONS

## E-i. 🔴 The KDS `Extend 30 min` removed — and this reverses an agreed decision

**BEFORE — READ:**

```tsx
      {recentlyClosed && activeEvent && (
        <div className="mx-3 mt-2 mb-1 bg-slate-100 border border-slate-200 rounded-xl p-3 flex items-center justify-between flex-shrink-0">
          <span className="text-sm text-slate-600">Event finished · {activeEvent.venue_name} ended at {formatTime(activeEvent.end_time)}</span>
          <button onClick={() => extendEvent(activeEvent.id, 30)} className="text-sm font-medium text-teal-600 hover:text-teal-700 ml-3 flex-shrink-0">Extend 30 min</button>
        </div>
      )}
```

**AFTER — READ, the button gone, the banner kept:**

```tsx
      {recentlyClosed && activeEvent && (
        <div className="mx-3 mt-2 mb-1 bg-slate-100 border border-slate-200 rounded-xl p-3 flex items-center justify-between flex-shrink-0">
          <span className="text-sm text-slate-600">Event finished · {activeEvent.venue_name} ended at {formatTime(activeEvent.end_time)}</span>
        </div>
      )}
```

⚠️ **FLAGGED, THEN DONE: last task this button was deliberately KEPT on your agreement** (*"Dominic
agreed it stays"*), on the reasoning that recovering a closed event is a different job from adjusting
a live one. **You have now said it is not supposed to be there. I treated the later instruction as the
decision.**

✅ **RECOVERY IS NOT LOST:** Event actions → **Change event finish time** reaches the same write, with a
picker and a confirm, and can set any future time rather than only +30.

🔴 **DASHBOARD: UNCHANGED. The instruction named the KDS**, and its banner still carries the button
(`page.tsx:3186`). ⚠️ **THE TWO SURFACES NOW DIFFER HERE — say the word and I will remove the
dashboard's too.**

⚠️ **`extendEvent` IS NOW DEAD CODE IN `kds/page.tsx`.** **READ** — `grep` shows its only remaining
mentions in that file are inside comments; the function is defined and never called. **It is still
live on the dashboard.** **Left in place rather than deleted: removing it is a separate decision, and
`tsc` does not flag it (`noUnusedLocals` is not enabled). Reported so it is not rediscovered.**

## E-ii. The "Change event" button now matches its siblings

**BEFORE — READ, a bordered, left-aligned list row among filled buttons:**

```tsx
              <button onClick={() => { setShowEventMenu(false); setShowEventPicker(true) }}
                className="w-full text-left py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 border border-slate-100 rounded-xl px-3 mb-4">
                Change event
              </button>
```

**AFTER — READ, in the shared menu:**

```tsx
          <button onClick={onChangeEvent}
            className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm mb-4">
            Change event
          </button>
```

✅ **Same `bg-slate-100 … font-bold … text-sm` as Change finish time / Finish event.** ⚠️ **Behaviour
untouched — same `switchEvent`, same confirm.**

## E-iii. 🔴 THE EVENT MENU IS NOW ONE COMPONENT — and Restart Event exists on the KDS

**You were right, and it was the gap I reported last task without fixing.**

# ✅ `components/shared/EventActionsModal.tsx` — the DASHBOARD's modal, lifted, because it was the more complete of the two.

**READ — the item the KDS did not have:**

```tsx
        {canStart && onStartEvent && (
          <button onClick={onStartEvent}
            className="w-full bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 text-sm mb-3">
            {event.status === 'closed' ? 'Restart Event' : 'Start Event'}
          </button>
        )}
```

**WHAT THE TWO MENUS OFFER NOW:**

| Item | Dashboard before | KDS before | **Both now** |
|---|---|---|---|
| **Start / Restart Event** | ✅ | 🔴 **MISSING** | ✅ |
| Change event | ✅ `📅 Change event` | ✅ `Change event` | ✅ **`Change event`, filled** |
| Note for customers | ✅ + helper line | ⚠️ `Customer note`, no helper | ✅ **identical, helper included** |
| Pause / Resume orders | ✅ | 🔴 **MISSING from the menu** | ✅ |
| Add extra wait | ✅ | 🔴 **MISSING from the menu** | ⚠️ **dashboard only — see below** |
| Change event finish time | ✅ | ✅ | ✅ |
| Finish event | ✅ | ✅ | ✅ |
| Cancel event | ✅ | ✅ | ✅ |

**HOW TWO SURFACES SHARE ONE MENU WHEN THEIR ACTIONS DIFFER — READ, the contract:**

```
// Each item is a callback, and an OMITTED callback hides that item. That is what lets two surfaces that
// do the same thing DIFFERENTLY still share the menu: "change event" opens a tab on the dashboard and a
// picker overlay on the KDS; pausing goes through a duration modal on one and a toggle on the other.
// What must NOT differ — the order of the items, their labels, their colours, and which statuses reveal
// which — lives here and only here.
```

**KDS CALL SITE — READ:**

```tsx
        <EventActionsModal
          event={{ id: activeEvent.id, venue_name: activeEvent.venue_name, status: activeEvent.status }}
          noteValue={eventNoteInput}
          onNoteChange={setEventNoteInput}
          onSaveNote={() => saveEventNote(activeEvent.id)}
          onStartEvent={() => { setShowEventMenu(false); void openEvent(activeEvent.id) }}
          onChangeEvent={events.length > 1 ? () => { setShowEventMenu(false); setShowEventPicker(true) } : undefined}
          paused={isPaused}
          onPause={() => { setShowEventMenu(false); togglePause() }}
          onResume={() => { setShowEventMenu(false); togglePause() }}
          onChangeFinishTime={() => { setShowEventMenu(false); setFinishTimeTarget({ id: activeEvent.id, end_time: activeEvent.end_time ?? null, event_date: activeEvent.event_date ?? null }) }}
          onFinishEvent={() => finishEvent(activeEvent.id)}
          onCancelEvent={() => cancelEventFromMenu(activeEvent)}
          onClose={() => setShowEventMenu(false)}
        />
```

**DASHBOARD CALL SITE — READ:**

```tsx
        <EventActionsModal
          event={{id:activeEvent.id,venue_name:activeEvent.venue_name,status:activeEvent.status}}
…
          onStartEvent={()=>{openEvent(activeEvent.id);setShowEventMenu(false)}}
          onChangeEvent={()=>{setShowEventMenu(false);setActiveTab('add');setPendingOpenEventPicker(true)}}
          paused={paused}
          onPause={isDemo?undefined:()=>{setShowEventMenu(false);setShowPauseModal(true)}}
          onResume={()=>{fetch('/api/dashboard/action',…);…;setShowEventMenu(false)}}
          extraWaitControl={renderExtraWait('w-full')}
…
```

**⚠️ THREE DIFFERENCES THAT REMAIN, DELIBERATELY, AND YOU SHOULD KNOW ABOUT ALL THREE:**

1. 🔴 **`Add extra wait` is dashboard-only in the menu.** The KDS already has it **in its header** as a
   `<select>`; passing it here too would give one screen two of the same control. **The KDS's is one
   tap closer, which on a kitchen screen is the better place.** **Say the word and I will move it.**
2. ⚠️ **Pause now appears TWICE on the KDS** — in the header (where it has always been) and now in the
   menu. **Identical handler (`togglePause`), so they cannot disagree.** **I did not remove the header
   one: it is a mid-service control and the header is faster.**
3. ⚠️ **The dashboard's `📅` emoji on "Change event" is gone** — the KDS never had it, and one label
   cannot have it both ways. **The census records the lost `U+1F4C5` (D2).**

✅ **WHAT DID NOT MOVE: `switchEvent`'s confirm, the styled finish confirm, `EventCancelModal`, the
pause-duration modal and the event picker overlay are all still each surface's own and are unchanged.
Only the MENU that launches them is shared.**

---

# PART C — BOUNDARIES

## C1. `git diff --stat`

```
$ git diff --stat
 app/dashboard/[token]/kds/page.tsx | 300 ++++++++++++++++---------------------
 app/dashboard/[token]/page.tsx     | 131 ++++++++--------
 app/manage/[token]/page.tsx        |  35 ++++-
 components/DemoGetStarted.tsx      |  80 +++-------
 components/dashboard/OrderCard.tsx |  24 +++
 5 files changed, 278 insertions(+), 292 deletions(-)
```

🔴 **ONLY TWO OF THOSE FIVE ARE THIS TASK'S** — the KDS and the dashboard — **plus the untracked
`components/shared/EventActionsModal.tsx`. The other three are earlier tasks' (D6).**

| Boundary | Proof |
|---|---|
| **No payment path** | `lib/payments/**` and `app/api/**` absent |
| **No capacity engine** | `lib/slot-bookings.ts`, `lib/capacity-breach.ts` absent |
| **No gate** | `lib/features.ts`, `lib/plan-features.ts` absent |
| **No migration** | `supabase/**` absent; **no SQL run** |
| **No card change** | 🔴 `components/dashboard/OrderCard.tsx` shows `24 +++` — **that is the EARLIER ready-step task, not this one. This task did not touch it** |
| **Finish-time modal untouched** | `components/shared/EventFinishTimeModal.tsx` absent from the diff (A3) |

## C2. What a Pizzeria Gusto operator sees differently on the KDS

**Four visible changes, none of which touch how an order moves.** The Event actions menu now opens the
**same modal the dashboard has always used**, so it gains a **Start / Restart Event** button whenever
the event is not yet live or has finished — something the kitchen screen simply could not do before —
and gains Pause / Resume alongside the header control it already had. **`Change event` is now a filled
button like its siblings** rather than a bordered row, so the menu reads as one set of controls.
**`Change event finish time` no longer carries `(now 18:30)`**, because the modal behind it says so
three times over. And 🔴 **the `Extend 30 min` button on the "Event finished" banner is gone** — the
banner itself stays so an operator still knows the event ended, and extending is now done through
Event actions with a picker and a confirm instead of one unconfirmed tap above the order grid.
⚠️ **The Ready step chip is unchanged and still only appears with Payments ON — B4.**

## C3. 🔴 `seededRef` and `setSelectedEventId`

# ✅ UNTOUCHED. Verified, including a hit I had to chase down.

**READ — the seed, byte-identical:**

```ts
    if (seededRef.current) return
    if (!events.length) return          // nothing to seed FROM yet — wait for the first successful fetch
    seededRef.current = true
    if (selectedEventId && events.some(e => e.id === selectedEventId)) return   // the URL seed resolved
    setSelectedEventId(pickDefaultEventByTime(events)?.id ?? null)
  }, [events, selectedEventId])
```

⚠️ **`git diff` DOES contain one line mentioning `seededRef`, and I checked it rather than reporting a
clean grep:**

```
-                (seededRef) is not touched — see the seed note. */}
```

✅ **It is a COMMENT, removed with the old inline menu markup — not the seed.** 🔴 **And I restored the
reassurance it carried into the new call site**, because it is the thing most worth re-checking
whenever this menu changes:

```
          ⚠️ IT CALLS THE SAME switchEvent, WITH THE SAME CONFIRM, AND THE SEED (seededRef) IS NOT TOUCHED
```

**No line adding or removing `setSelectedEventId` exists in the diff. SEED ONCE THEN HOLD survives.**

---

# PART D — INTEGRITY

## D1 / D2. Non-ASCII census, before and after

### `app/dashboard/[token]/kds/page.tsx` — 33 classes BEFORE, **33 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+00D7 MULTIPLICATION SIGN | 4 | 3 | **−1** | the modal's `×` close button **moved into the shared component** |
| U+2014 EM DASH | 155 | 159 | **+4** | prose in the new comments |
| U+2500 BOX DRAWINGS | 1466 | 1428 | **−38** | the old menu's comment rules left with it |
| U+26A0 WARNING SIGN | 35 | 39 | **+4** | caveat markers — **all 4 paired** |
| U+FE0F VAR SELECTOR-16 | 35 | 39 | **+4** | ✅ **exactly matches the U+26A0 delta** |
| *all 28 other classes* | — | — | **0** | unchanged |

### `app/dashboard/[token]/page.tsx` — 53 classes BEFORE, **53 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+00D7 MULTIPLICATION SIGN | 13 | 12 | **−1** | the `×` close button moved into the component |
| **U+1F4C5 CALENDAR** | 3 | 2 | **−1** | 🔴 **the `📅` on "Change event" — the KDS never had it, so unifying the label dropped it. Declared at E-iii** |
| U+2014 EM DASH | 509 | 506 | **−3** | comment prose moved out |
| U+2192 RIGHTWARDS ARROW | 112 | 110 | **−2** | removed comments |
| U+23F1 STOPWATCH | 4 | 3 | **−1** | the `⏱` in the extra-wait comment that moved |
| U+23F8 DOUBLE VERTICAL BAR | 3 | 2 | **−1** | `⏸ Pause orders` moved into the component |
| U+2500 BOX DRAWINGS | 2290 | 2297 | **+7** | one new comment rule, old ones removed |
| U+25B6 BLACK RIGHT TRIANGLE | 3 | 2 | **−1** | `▶ Resume orders` moved into the component |
| *all 45 other classes* | — | — | **0** | unchanged |

✅ **NEITHER FILE GAINED OR LOST A CLASS. `U+1F4C5` fell from 3 to 2 — still present, so no class was
lost.**

### `components/shared/EventActionsModal.tsx` — NEW FILE, 9 classes

**No "before" exists, so no class can be gained.** ⚠️ **Every class already existed in both parents:**

```
U+00D7  2     the × close button and one prose use
U+1F534 2     headline markers
U+2014  8     em dashes in prose
U+2026  2     ellipses in placeholder copy
U+23F8  1     the ⏸ on Pause orders          (came from the dashboard)
U+2500  94    comment box rules
U+25B6  1     the ▶ on Resume orders         (came from the dashboard)
U+26A0  5     caveat markers — ALL PAIRED
U+FE0F  5     exactly matches the U+26A0 count
```

🔴 **THE GLYPHS ON THE PAUSE/RESUME BUTTONS MOVED RATHER THAN BEING RETYPED — the dashboard's counts
fell by exactly the amounts this file gained, which is the check that they are the same characters and
not lookalikes.**

## D3. 🔴 Carrier-aware variation-selector check

| File | Base | BEFORE n / paired / bare | AFTER n / paired / bare | Verdict |
|---|---|---|---|---|
| **KDS** | U+26A0 | 35 / 34 / **1** | 39 / 38 / **1** | ✅ **bare UNCHANGED at 1** |
| | U+2705 | 2 / 0 / 2 | 2 / 0 / 2 | ✅ unchanged |
| | U+2713 | 4 / 0 / 4 | 4 / 0 / 4 | ✅ **the Ready step chip's ✓ is untouched** |
| | U+1F534 | 48 / 0 / 48 | 48 / 0 / 48 | ✅ unchanged |
| **Dashboard** | U+26A0 | 75 / 72 / **3** | 75 / 72 / **3** | ✅ **identical — no warning sign added or removed** |
| | U+2705 | 4 / 0 / 4 | 4 / 0 / 4 | ✅ unchanged |
| | U+2713 | 3 / 0 / 3 | 3 / 0 / 3 | ✅ unchanged |
| | U+1F534 | 91 / 0 / 91 | 91 / 0 / 91 | ✅ unchanged |
| **New component** | U+26A0 | *(new)* | 5 / **5** / **0** | ✅ **all paired** |
| | U+1F534 | *(new)* | 2 / 0 / 2 | ✅ matches both parents' bare form |

🔴 **THE BARE U+26A0s ARE PRE-EXISTING — ONE IN THE KDS, THREE IN THE DASHBOARD — AND BOTH COUNTS ARE
UNCHANGED.** All warning signs added are paired.

## D4. Byte scan of every edited file

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). **Never
grep.**

```
  app/dashboard/[token]/kds/page.tsx        122,128 bytes  offending=0  CR=0   (was 123,132)
  app/dashboard/[token]/page.tsx            390,423 bytes  offending=0  CR=0   (was 394,728)
  components/shared/EventActionsModal.tsx     7,492 bytes  offending=0  CR=0   (new)
```

✅ **Zero offending bytes, zero CR, before and after, in all three.** ⚠️ **Both pages SHRANK — 1,004
and 4,305 bytes — against a 7,492-byte component that replaces two copies. INFERRED: this is a real
de-duplication, not a re-housing.**

## D5. Byte scan of this report

Separate pass, run after writing: **38,559 bytes, offending = 0, CR = 0** — no NUL, no control byte
below 0x09, no CRLF, no lone CR. **Carrier-aware check on this report:**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 59 | 0 | 59 |
| U+1F534 LARGE RED CIRCLE | 42 | 0 | 42 |
| U+26A0 WARNING SIGN | 34 | **34** | **0** |

**Every warning sign in this report is paired; ZERO are bare — 34 of 34**, and the file's total U+FE0F
count is **34**, which accounts for all of them and leaves none attached to any other base. ⚠️ **The
two unpaired bases are internally consistent (0 of 59, 0 of 42), so neither is split across two
renderings.** ✅ **U+2500 does not appear in this report at all.**

## D6. 🔴 `git status`, and which entries are THIS task's

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/DemoGetStarted.tsx
 M components/dashboard/OrderCard.tsx
?? components/shared/CuisinePicker.tsx
?? components/shared/EventActionsModal.tsx
?? components/shared/EventFinishTimeModal.tsx
?? docs/cuisine-field-report.md
?? docs/finish-time-dry-report.md
?? docs/kds-ready-toggle-report.md
```

| Entry | This task? |
|---|---|
| `?? components/shared/EventActionsModal.tsx` | ✅ **YES — the shared menu** |
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **PARTLY — this task + the earlier ready-step toggle + the finish-time extraction, all uncommitted** |
| `M app/dashboard/[token]/page.tsx` | ⚠️ **PARTLY — this task + the finish-time extraction** |
| `?? docs/kds-ready-toggle-report.md` | ✅ **YES — this report (overwrites the previous one)** |
| `?? components/shared/EventFinishTimeModal.tsx` | ❌ **NO — the finish-time extraction task** |
| `?? components/shared/CuisinePicker.tsx` | ❌ **NO — the cuisine task** |
| `M app/manage/[token]/page.tsx` | ❌ **NO — the cuisine task** |
| `M components/DemoGetStarted.tsx` | ❌ **NO — the cuisine task** |
| `M components/dashboard/OrderCard.tsx` | ❌ **NO — the ready-step toggle task** |
| `?? docs/cuisine-field-report.md` | ❌ **NO** |
| `?? docs/finish-time-dry-report.md` | ❌ **NO** |

🔴 **FOUR TASKS' WORK IS NOW STACKED UNCOMMITTED AND BOTH PAGE FILES CARRY MORE THAN ONE OF THEM.**
**INFERRED: they can no longer be committed separately without splitting hunks by hand. If separate
commits matter, this is the point to stop and land them.**

---

# PART E — WHAT YOU MUST TEST

### Finding the Ready step control

**1. 🔴 FIND IT.** Open the KDS on **Window** view and look at the header chips beside Sound.
**PASS:** if the money chip is **green, reading `Payments`**, a **`✓ Ready step`** chip sits beside it.
**FAILURE / EXPECTED-IF-GREY:** if the money chip is **grey, reading `No payments`**, the Ready step
chip is **correctly absent** — that is B2, not a bug. **Tap the money chip to green and the Ready step
chip appears.** 🔴 **If it is green and there is still no Ready step chip, that IS a defect — tell
me.**

**2. It stays hidden where it would do nothing.** Switch to **Cook**; then back to Window and tap
Payments back to grey.
**PASS:** the chip disappears in both cases.
**FAILURE:** it renders on Cook — there is no "off" there (B4).

**3. 🔴 TOGGLE IT OFF, PLACE AN ORDER, COMPLETE IT.** With Payments on, tap the chip to grey
(`No ready step`), then take an order through to confirmed.
**PASS:** the card shows the completion button **enabled immediately** — no `⏳ Waiting`, no greyed
button — and one press completes it.
**FAILURE:** still disabled, or the order cannot be completed. 🔴 **Stop and tell me.**

**4. 🔴 THE `cooking` CASE.** With the step OFF, use a Cook screen (or second device) to press **Start
cooking**, then look at the window device.
**PASS:** that order shows an **enabled** completion button.
**FAILURE:** the card shows **no buttons at all** (B6).

**5. 🔴 LEAVE AND RETURN — NO WRONG-STATE FLASH.** With the step OFF, tap Dashboard then re-enter the
KDS; then repeat with a **full app kill and relaunch**.
**PASS:** the chip is grey from the first frame **and no card ever shows a `⏳ Waiting` chip or a
disabled button**, not even for an instant.
**FAILURE:** a flash of the ready-step UI before it settles. ⚠️ **Film at 60fps if unsure.**

**6. Per device.** Set it OFF on one tablet; open the KDS on a second device.
**PASS:** the second starts with the step **ON**; the first stays OFF.
**FAILURE:** the setting follows the truck.

### The finish-time label

**7. 🔴 THE MODAL STILL SHOWS THE CURRENT TIME.** Event actions → **Change event finish time**, on
**both** surfaces.
**PASS:** the button reads `Change event finish time` with **no `(now HH:MM)`**; the modal's first
sentence reads *"This event is currently set to finish at 18:30."*, the select opens on 18:30 marked
`(current)`, and the confirm's safe button reads `Keep 18:30`.
**FAILURE:** the modal does not name the current time anywhere. 🔴 **That is the one thing A3 protects
— report it.**

### The shared Event actions menu

**8. 🔴 RESTART EVENT EXISTS ON THE KDS.** Finish an event, then open Event actions on the KDS.
**PASS:** an orange **`Restart Event`** button at the top. On a not-yet-started event it reads
**`Start Event`**.
**FAILURE:** no such button — the extraction did not take.

**9. The menus match.** Open Event actions on both surfaces on the same event and compare top to
bottom.
**PASS:** same order, same labels, same colours — Start/Restart, Change event, Note + Save note,
Pause/Resume, Change event finish time, Finish event, Cancel event.
**FAILURE:** any difference other than the two declared ones — **Add extra wait is dashboard-only in
the menu, and the KDS also keeps Pause in its header** (E-iii).

**10. Every action still works — both surfaces.** Test each item: Start, Change event (KDS opens the
picker; dashboard switches to the Add tab), Save note, Pause then Resume, Change finish time, Finish
event, Cancel event.
**PASS:** each behaves exactly as before; the finish and cancel confirms still appear.
**FAILURE:** any item does nothing or opens the wrong thing. ⚠️ **`Change event` differs BY DESIGN
between the surfaces — that is not a failure.**

**11. The KDS banner.** Finish an event and look at the banner within ten minutes.
**PASS:** `Event finished · <venue> ended at HH:MM` with **NO `Extend 30 min` button**.
**FAILURE:** the button is still there. ⚠️ **The DASHBOARD still has its copy — that is deliberate
(E-i); tell me if you want it gone too.**

**12. 🔴 THE KDS SEED STILL HOLDS.** On a day with more than one event, open the KDS, use the menu,
change the event, and keep working for a few minutes.
**PASS:** the selected event changes only when you change it, and never on its own.
**FAILURE:** the board jumps to a different event. 🔴 **The menu was rebuilt around `switchEvent`, so
this is the regression to watch hardest — report it at once.**
