# Three overlay defects — two fixed, one that was not a defect

Scope honoured: **three files edited, one created.** No `next dev`, no `next build`, no `cap sync`,
no deploy, no commit, no package installed, no migration, no payment path, no capacity change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Dashboard, KDS and manage are reported **separately**. Every claim is marked **READ** or **INFERRED**.

> ✅ `npx tsc --noEmit` exits 0.

🔴 **PART C IS NOT A DEFECT, AND THE ERROR IS MINE.** The refund form **already has a named dismissal
arm** — a "Cancel" button. `docs/overlay-audit-report.md` said it had none. That was wrong, I have
found out exactly how I got it wrong, and I have changed nothing there. Part C explains both.

---

# PART A — THE CANCEL-ORDER MODAL LEAKED STATE BETWEEN ORDERS

**Surface: DASHBOARD only.** Neither the KDS nor manage carries an order-cancel modal.

## A1. The three arms, and what each reset — READ, before the change

**Arm 1 — "Keep order"**, `app/dashboard/[token]/page.tsx:4565`:

```tsx
<button disabled={cancelBusy} onClick={()=>{setShowCancelModal(false);setCancellingOrder(null);setCancelReason('');setCancelNote('');setCancelRefund(true);setCancelError(null)}} className="flex-1 border border-slate-200 text-slate-600 font-medium py-3 rounded-xl text-sm disabled:opacity-50">Keep order</button>
```

**Arm 2 — the successful cancel**, `:2219-2220`, inside `confirmCancelOrder`:

```tsx
    setShowCancelModal(false);setCancellingOrder(null);setCancelReason('');setCancelNote('')
    setCancelRefund(true);setCancelError(null)
```

**Arm 3 — the Android back closer**, `:2356`:

```tsx
    [showCancelModal && !!cancellingOrder, () => setShowCancelModal(false)],
```

| State | Keep order | Successful cancel | **Back** |
|---|---|---|---|
| `showCancelModal` | ✅ | ✅ | ✅ |
| `cancellingOrder` | ✅ | ✅ | 🔴 **no** |
| `cancelReason` | ✅ | ✅ | 🔴 **no** |
| `cancelNote` | ✅ | ✅ | 🔴 **no** |
| `cancelRefund` | ✅ | ✅ | 🔴 **no** |
| `cancelError` | ✅ | ✅ | 🔴 **no** |

**READ** — and opening the modal initialises none of it, so nothing downstream repairs it:

```tsx
page.tsx:1865   if(action==='cancel'){const ord=orders.find(o=>o.order_key===orderKey)??null;setCancellingOrder(ord);setShowCancelModal(true);return}
```

🔴 **THE BACK HANDLER CREATED THIS PATH.** The modal has no close glyph, no backdrop dismiss and no
Escape — **READ**, `:4488`, the container has no `onClick` at all:

```tsx
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
```

so before last turn the only two ways out were arms 1 and 2, and **both reset everything**.

## A2. 🔴 One reset per modal, called by every arm — the fix, in full

**READ** — the new functions, declared with the state they own (`:556` onward), so they are in scope
for `useAndroidBack`, which builds its array **during render**:

```tsx
  // ── 🔴 ONE RESET PER MODAL, CALLED BY EVERY ARM. THE DEFECT WAS THREE CALL SITES, NOT ONE OF THEM. ──
  // Both real arms cleared five pieces of state; the Android back closer cleared ONE (`setShowCancelModal
  // (false)`), so a back-dismiss carried the reason, the customer-facing note AND the refund decision to
  // the NEXT order cancelled. The modal has no close glyph, no backdrop dismiss and no Escape, so before
  // the back handler existed that path did not exist either — the handler created it.
  // 🔴 THE FIX IS NOT A FOURTH CALL SITE. Three hand-maintained copies is the defect; a fourth copy is
  // more of it. Every way out of these modals now goes through one function, so a piece of state added
  // here is cleared by every arm at once and cannot be forgotten by one of them.
  // ⚠️ `cancelBusy` IS DELIBERATELY NOT RESET HERE. It is owned by the in-flight refund
  // (confirmCancelOrder sets and clears it around the await), and every arm is unreachable while it is
  // true — the buttons are `disabled={cancelBusy}`. Clearing it here would be this function reaching into
  // a request it does not own.
  const resetCancelModal=()=>{
    setShowCancelModal(false);setCancellingOrder(null)
    setCancelReason('');setCancelNote('')
    setCancelRefund(true)      // 🔴 THE DANGEROUS ONE — back to "refund the customer" every time
    setCancelError(null)
  }
  const resetRejectModal=()=>{
    setShowRejectModal(false);setRejectingOrder(null)
    setRejectReason('');setRejectNote('')
  }
```

**Every caller — READ, and there are exactly three per modal:**

```tsx
// cancel, arm 1 (the button)
<button disabled={cancelBusy} onClick={resetCancelModal} className="flex-1 border border-slate-200 text-slate-600 font-medium py-3 rounded-xl text-sm disabled:opacity-50">Keep order</button>

// cancel, arm 2 (confirmCancelOrder, after the refund settles)
    resetCancelModal()
    setActionLoading(`cancel-${orderKey}`)

// cancel, arm 3 (Android back)
    [showCancelModal && !!cancellingOrder, resetCancelModal],
```

⚠️ **Note what arm 3 now is: the function itself, not a wrapper.** `() => resetCancelModal()` would
have worked identically and would have been one more place for the two to drift. Passing the reference
means the closer and the button are **literally the same function object**.

## A3. The refund checkbox — the dangerous one

**READ** — it decides whether the customer's money goes back:

```tsx
543:  const[cancelRefund,setCancelRefund]=useState(true)
4512: <input type="checkbox" checked={cancelRefund} onChange={e=>{setCancelRefund(e.target.checked);setCancelError(null)}} className="mt-0.5"/>
2228: …refund_declined:refundableMinor>0&&!cancelRefund…
```

✅ **It resets. READ, from `resetCancelModal`:**

```tsx
    setCancelRefund(true)      // 🔴 THE DANGEROUS ONE — back to "refund the customer" every time
```

**Back to `true`, not to `false`, and not left alone.** ⚠️ **`true` is the safe default and the
original `useState(true)`**: the failure mode this closes is an operator who declines a refund on
order A (the documented no-show case), presses back, then cancels order B and sends
`refund_declined: true` for a customer they never made that decision about. Resetting to `true` means
the worst a leak could now do is offer a refund that the operator can still decline — a recoverable
direction, and the same one the two real arms already chose.

## A4. The Reject modal — same shape, same fix

**Surface: DASHBOARD only.** **READ**, before:

```tsx
2244: setShowRejectModal(false);setRejectingOrder(null);setRejectReason('');setRejectNote('')     // success
4595: <button onClick={()=>{setShowRejectModal(false);setRejectingOrder(null);setRejectReason('');setRejectNote('')}} …>Keep order</button>
2357: [showRejectModal && !!rejectingOrder, () => setShowRejectModal(false)],                      // back
```

**READ**, after — the same three-into-one:

```tsx
    resetRejectModal()
    setActionLoading(`reject-${orderKey}`)
<button onClick={resetRejectModal} className="flex-1 border border-slate-200 text-slate-600 font-medium py-3 rounded-xl text-sm">Keep order</button>
    [showRejectModal && !!rejectingOrder, resetRejectModal],
```

⚠️ **No money, but not cosmetic:** the reject reason is **required and shown to the customer**
(`:4581`, *"Reason — required (shown to the customer)"*), so the leak sent order B's customer order
A's rejection reason.

## A5. Every OTHER overlay whose dismissal arm resets less than its real arms

**Swept: all 24 back-handler registrations across the three registration sites** (dashboard 14, KDS 6,
AddOrderPanel 4). **Three divergences remain. None moves money, so none is fixed — as instructed.**

| # | Overlay | Real arm does | Back closer does | Consequence | Money? |
|---|---|---|---|---|---|
| 1 | `capacityConfirm` — `AddOrderPanel.tsx:2300` / `:434` | `setManualSlot(''); setCapacityConfirm(null)` | `setCapacityConfirm(null)` | ⚠️ The operator is returned to the form with the **refused slot still selected** and no modal explaining it | **No** — placing still needs an explicit second tap |
| 2 | `showOfflinePausedNotice` — `page.tsx:513` / `:2418` | `ackOfflinePausedNotice` — writes a `localStorage` ack marker, then hides | hides only | ✅ The notice **re-pops on the next poll or reload**. Informational; the failure is in the safe direction | **No** |
| 3 | `editItemModal` — `page.tsx:2035` / `:2405` | `closeEditItemModal` — also clears `editModalMods`, `editModalNotes` | `setEditItemModal(null)` | ✅ **No observable consequence** — `openEditItemModal` re-initialises both on every open (`:2032`) | **No** |

🔴 **STATED PLAINLY, BECAUSE IT IS THE INSTRUCTION'S TRIGGER: none of the three moves money, so I have
not stopped and have not touched them.** #3 is the interesting one — it is the same divergence as the
cancel modal, made harmless by one line in the opener that the cancel modal did not have.

✅ **And the new event-cancel modal cannot join this list**: its closer and its "Keep event" button are
the same expression, and its form fields live in the component (Part B).

---

# PART B — ONE GATE FOR ONE OPERATION

## B1. All three gates, before — READ

**DASHBOARD**, `app/dashboard/[token]/page.tsx:2255-2264`:

```tsx
  const cancelEventFromMenu=async(eventId:string)=>{
    if(!window.confirm('Cancel this event? This cannot be undone.')) return
    try{
      const res=await fetch('/api/events/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'cancel',eventId,payload:{}})})
      const data=await res.json(); if(!res.ok) throw new Error(data.error)
      setTodayEvents(prev=>prev.filter(e=>e.id!==eventId))
      setSelectedEventId(null); setShowEventMenu(false); showToast('Event cancelled')
      fetchAllRef.current() // re-sync so the cancelled event drops out immediately
    }catch(err:any){showToast(err.message||'Failed','error')}
  }
```

**KDS**, `app/dashboard/[token]/kds/page.tsx:897-914` — the same dialog, different bookkeeping:

```tsx
  const cancelEventFromMenu = async (eventId: string) => {
    if (!window.confirm('Cancel this event? This cannot be undone.')) return
    try {
      const res = await fetch('/api/events/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'cancel', eventId, payload: {} }) })
      const data = await res.json()
      if (data?.queued) { setPendingSyncCount(c => c + 1); setShowEventMenu(false); return }
      if (!res.ok) throw new Error(data.error)
      …
      const remaining = events.filter(e => e.id !== eventId)
      setEvents(remaining)
      setSelectedEventId(pickDefaultEventByTime(remaining)?.id ?? null); setShowEventMenu(false); showKdsToast('Event cancelled')
      fetchAllRef.current()
    } catch (err: any) { showKdsToast(err.message || 'Failed') }
  }
```

**MANAGE** — the modal, quoted in full in B2.

🔴 **All three POST the same `action: 'cancel'` to the same endpoint.** The two `window.confirm`
dialogs render OS buttons labelled **OK** and **Cancel** — so on the operation that cancels every live
order and strands the card holds behind them, **"Cancel" means "do not cancel"**.

## B2. Manage's modal — READ, the version that was lifted

```tsx
      {showEventCancelModal && cancellingEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Cancel this event?</h3>
              <p className="text-sm text-slate-500 mt-1">
                {cancellingEvent.venue_name}{cancellingEvent.town ? `, ${cancellingEvent.town}` : ''}
                {' · '}
                {fmtDate(cancellingEvent.event_date)}
                {cancellingEvent.start_time && cancellingEvent.end_time
                  ? ` · ${formatTime(cancellingEvent.start_time)}–${formatTime(cancellingEvent.end_time)}`
                  : ''}
              </p>
              {affectedOrderCount > 0 && (
                <p className="text-sm font-medium text-red-600 mt-2">
                  {affectedOrderCount} order{affectedOrderCount !== 1 ? 's' : ''} will be cancelled and customers notified.
                </p>
              )}
            </div>
            …Reason — optional (select) … Message to customers — optional (textarea) …
            <div className="flex gap-3">
              <button onClick={() => { setShowEventCancelModal(false); setEventCancelReason(''); setEventCancelNote('') }} …>Keep event</button>
              <button onClick={() => confirmCancelEvent()} className="flex-1 bg-red-600 …">Cancel event</button>
            </div>
```

**Structure:** identity line (venue, town, date, time window) → affected-order count → optional reason
→ optional message to customers → **safe arm left, destructive arm right**.

## B3. Extracted, not reimplemented

**NEW FILE: `components/shared/EventCancelModal.tsx`.** The JSX above is lifted **verbatim** — same
classes, same copy, same `·` separators, same en dash in the time range. All three surfaces now render
one definition.

⚠️ **Nothing was in the way, but extracting necessarily edits manage, and that edit is quoted in full
in E2 so you can see its whole extent.** It is three things: two `useState` lines deleted, the handler
taking its two fields as arguments, and 57 lines of JSX becoming 7.

🔴 **THE COMPONENT OWNS THE REASON AND THE NOTE, AND THAT IS PART A's LESSON APPLIED.** **READ:**

```tsx
export function EventCancelModal({ event, affectedOrderCount, busy = false, onKeep, onConfirm }: {
  event: TruckEvent
  affectedOrderCount: number
  busy?: boolean
  onKeep: () => void
  onConfirm: (reason: string, note: string) => void
}) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
```

**The caller gates the mount** (`{eventCancelTarget && <EventCancelModal … />}`), so **every open is a
fresh mount with empty fields**. There is no reset function to call, therefore no reset for a fourth
call site to forget. Had this been built as a controlled component with `reason`/`setReason` props,
all three callers would have had to clear it by hand — **the exact three-drifting-call-sites shape
that Part A exists to remove.**

**Manage, after — READ:**

```tsx
      {showEventCancelModal && cancellingEvent && (
        <EventCancelModal
          event={cancellingEvent}
          affectedOrderCount={affectedOrderCount}
          onKeep={() => setShowEventCancelModal(false)}
          onConfirm={(reason, note) => { void confirmCancelEvent(reason, note) }}
        />
      )}
```

**Dashboard, after — READ:**

```tsx
      {eventCancelTarget&&(
        <EventCancelModal
          event={eventCancelTarget}
          affectedOrderCount={eventCancelCount}
          busy={eventCancelBusy}
          onKeep={()=>setEventCancelTarget(null)}
          onConfirm={(reason,note)=>{void doCancelEvent(eventCancelTarget.id,reason,note)}}
        />
      )}
```

**KDS, after** — identical but for spacing and `doCancelEvent`'s offline branch.

**READ** — the dashboard handler, split into a gate-opener and the request:

```tsx
  // ⚠️ TAKES THE EVENT, NOT AN ID. The modal names the venue, the date and the window, so it needs the
  // row; and the one call site is inside a block already gated on `activeEvent`, so handing the object
  // over is both simpler and safer than a lookup that could miss and silently cancel nothing.
  const cancelEventFromMenu=async(ev:TruckEvent)=>{
    setShowEventMenu(false)
    setEventCancelCount(0); setEventCancelTarget(ev)
    try{
      const res=await fetch(`/api/events/affected-orders?eventId=${ev.id}&token=${token}`)
      const data=await res.json()
      if(res.ok) setEventCancelCount(data.count??0)
    }catch{ /* silently fail - the gate still works, the count just stays hidden */ }
  }
```

⚠️ **AN INTERIM DRAFT LOOKED THE EVENT UP BY ID** (`todayEvents.find(…) ?? upcomingEvents.find(…)`)
**and returned silently if it missed — a cancel button that does nothing.** Passing the object removes
the failure mode rather than handling it.

🔴 **THE EVENT MENU IS CLOSED ON THE WAY IN, ON BOTH SURFACES.** The shared modal renders at `z-50`
and so does the event menu it opens from. Closing the menu removes the stacking question instead of
answering it with a z-index, and leaves **exactly one overlay for the back button to dismiss**.
⚠️ This differs from `finishConfirm`, which stacks at `z-[60]` over the menu — that is its existing
behaviour and is **not** touched.

## B4. The final labels

```tsx
          <button onClick={onKeep} disabled={busy} …>Keep event</button>
          <button onClick={() => onConfirm(reason, note)} disabled={busy} …>
            {busy ? 'Cancelling…' : 'Cancel event'}
          </button>
```

| Arm | Label | Position |
|---|---|---|
| Safe | **"Keep event"** | left |
| Destructive | **"Cancel event"** | right, `bg-red-600` |

✅ **Neither is the bare word "Cancel".** "Keep event" says what it preserves; "Cancel event" names the
operation it performs.

⚠️ **ONE DELIBERATE DEVIATION FROM THE BRIEF'S EXAMPLE, FLAGGED RATHER THAN QUIETLY MADE.** You wrote
the affirmative as *"Cancel this event"*. I kept **"Cancel event"** — manage's existing label, which
operators already use, and which satisfies the stated requirement (it names the operation). The
heading above it already reads *"Cancel this event?"*, so the sentence is present either way. Say the
word and it becomes "Cancel this event".

## B5. ✅ The affected-order count works on the dashboard and the KDS

**READ** — `app/api/events/affected-orders/route.ts`, in full:

```ts
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('eventId')
  const token = req.nextUrl.searchParams.get('token')
  if (!eventId || !token) return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  // Verify token belongs to a real truck
  const { data: truck } = await supabase.from('trucks').select('id').eq('dashboard_token', token).single()
  if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { count, error } = await supabase
    .from('orders').select('id', { count: 'exact', head: true })
    .eq('event_id', eventId).eq('truck_id', truck.id)
    .in('status', ['pending', 'confirmed', 'modified'])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ count: count ?? 0 })
}
```

🔴 **IT AUTHENTICATES ON `trucks.dashboard_token` — the SAME token the dashboard and the KDS already
hold in their route params.** Manage passes its `token` to this endpoint today and it works, which is
proof the two are the same value. **Nothing manage has that they do not.**

**INFERRED**, and it is the operationally important half: **the KDS is the surface most likely to be
offline**, and the count is fetched separately from the cancel. On a failed fetch the `catch` leaves
the count at 0, `affectedOrderCount > 0` is false, and **the line is not rendered** — so the modal
never claims "0 orders will be cancelled" about an event it could not count. The gate still works; it
just carries less information. That is the correct degradation and it is why the count is seeded 0
rather than -1 or null.

## B6. ✅ What cancelling an event DOES is unchanged

**READ** — the request bodies, before and after:

```ts
// before, dashboard + KDS
body: JSON.stringify({token,action:'cancel',eventId,payload:{}})
// after, dashboard + KDS
body: JSON.stringify({token,action:'cancel',eventId,payload:{cancellationReason,cancellationNote}})
```

⚠️ **THE ONE CHANGE, AND IT IS A JUDGEMENT CALL I AM FLAGGING.** The operator can now supply a reason
and a customer message from the dashboard and the KDS. Both are **optional**, both default to `''`,
and the endpoint has accepted them since manage's modal was written — **manage has been sending them
all along.** Leave both blank and the body is what `payload:{}` produced. Adopting the good gate means
adopting its fields; refusing them would have meant reimplementing a cut-down copy, which B3 forbids.

✅ **Everything else is byte-identical**: the same endpoint, the same optimistic list updates, the same
toasts, the same `fetchAllRef.current()` re-sync, and — on the KDS — the same `data?.queued` offline
branch and the same deliberate `pickDefaultEventByTime` re-pick.

🔴 **HELD AUTHORISATIONS ARE STILL STRANDED.** Nothing in this change touches
`app/api/events/action/route.ts`, which still has no payment import of any kind. That remains the
parked defect in `docs/event-cancel-holds-report.md`. The modal is now the obvious place for its money
summary to live, and the component header says so.

## B7. ✅ Registered with the back handler, non-committing arm

**READ** — dashboard `:2407` and KDS, the same line:

```tsx
    [!!eventCancelTarget && !eventCancelBusy, () => setEventCancelTarget(null)],
```

Placed **after `finishConfirm`** and before the rest, matching the innermost-first z-order convention.

⚠️ **`&& !eventCancelBusy` is the one addition to the convention, and it earns its place:** back cannot
dismiss the modal while the cancel request is in flight. Without it, a press during the round trip
would unmount the modal while the POST was still running — the operator would be left on the board
with no idea whether the event had been cancelled. The buttons are already `disabled={busy}`; this
gives the back button the same discipline.

✅ **The closer is the same expression as `onKeep`** (`() => setEventCancelTarget(null)`), so this
modal cannot develop the A5 divergence.

---

# PART C — 🔴 THE REFUND FORM ALREADY HAS A NAMED ARM. MY EARLIER FINDING WAS WRONG.

## C1. What it actually offers — READ, `components/dashboard/PaymentActionsModal.tsx:315-318`

```tsx
      <div className="flex gap-3">
        <button onClick={onClose} disabled={busy}
          className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm disabled:opacity-50">Cancel</button>
        <button onClick={submit} disabled={!submittable || busy}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40">
          {busy ? 'Refunding…' : `Refund ${money(Math.max(0, Math.min(amountMinor, refundableMinor)))}`}
        </button>
      </div>
```

**Every way out of the refund branch:**

| Arm | Present? |
|---|---|
| **Named button — "Cancel"** | ✅ **YES**, bottom-left, `flex-1`, full width of half the modal |
| Backdrop tap | ✅ yes, `onClick={e => e.target === e.currentTarget && !busy && onClose()}` |
| Escape | ❌ no |
| Android back | ❌ no registration — see C4 |

**And it is consistent across all five branches — READ:**

```
:172  >Done<              (after a refund)
:203  >Got it<            (offline)
:223  >Cancel<  :226 'Remove payment'   (in-person payment)
:252  >Got it<            (paid by card, nothing to do)
:316  >Cancel<  :318 'Refund £x'        (the refund form)
```

## C2. Nothing added, and here is exactly how I got it wrong

🔴 **`docs/overlay-audit-report.md` B1 named this "the one real B1 offender". That claim is false and I
am withdrawing it.**

**The cause is methodological, not a typo.** The audit located overlays by `fixed inset-0` and then
extracted button lines from a **fixed 55-line window** below each match. In this file the match is at
`:152` — inside the shared `shell()` helper — while the refund branch's buttons are at `:315`, **163
lines further down**. The window caught the three short branches' buttons (`:171`, `:202`) and stopped
long before the refund form's. I then reported the absence of what I had not looked at.

⚠️ **The lesson worth keeping: a windowed extraction reports "not found" identically whether the thing
is absent or merely out of frame.** The audit's own rule — *"'Not found' is a result. State it
plainly"* — is what made that failure load-bearing rather than harmless.

**Nothing has been added.** A second dismissal arm on a modal that has one would be worse than the
imaginary defect. **`components/dashboard/PaymentActionsModal.tsx` is not in this task's diff.**

⚠️ **One real, smaller observation, reported and not fixed:** the safe arm is the bare word
**"Cancel"** on a modal about an *order*, in an app where "Cancel" also means "cancel the order". The
house pattern elsewhere names what is preserved ("Keep order", "Keep event"). That is a consistency
item of the same class as D1, not a defect, and it is outside this scope.

## C3. Does it submit, or lose typed input, without warning?

✅ **It cannot submit.** `onClose` is a dismissal; the only path to a refund is `submit`, which is
gated:

```tsx
  const submittable = !!reason && amountMinor > 0 && amountMinor <= refundableMinor && (!noteRequired || note.trim().length > 0)
  const submit = async () => {
    if (!onRefund || !submittable || busy) return
```

✅ **It cannot be dismissed mid-refund.** Both the backdrop (`&& !busy`) and both buttons
(`disabled={busy}`) are locked while a refund is in flight.

⚠️ **It DOES discard a typed amount and note without warning** — `onClose` unmounts and the local
`useState` goes with it, from either the button or the backdrop. **Reported, not changed:** that is
ordinary form-sheet behaviour in this app (the edit-order modal, the deal editor and the invite sheet
all do the same), the affirmative action is one tap away, and adding a discard-confirm here would make
this one modal unlike every other. It is listed so the decision is yours, not mine by omission.

## C4. Back-handler registration

🔴 **There is none, and there never was.** **READ** — `PaymentActionsModal` is mounted twice on the
dashboard surface, neither from the page's registration list:

```tsx
components/dashboard/OrderCard.tsx:587    open={confirmRemovePayment}
app/dashboard/[token]/page.tsx:3538       <PaymentActionsModal open onClose={()=>setPayModalOrder(null)}
```

The first is owned by `OrderCard`'s `confirmRemovePayment` state; the second by the page's
`payModalOrder`, which is **not** in `useAndroidBack`. So the honest answer to "does its registration
still point at the non-committing arm" is: **there is no registration to check.** Back over the refund
form does nothing — inert, per D2.

---

# PART D — REPORT ONLY

## D1. The End-event confirm renders the destructive arm first

**READ** — `app/dashboard/[token]/page.tsx:4373-4374` and `kds/page.tsx:1616-1617`, identical:

```tsx
<button onClick={()=>doFinishEvent(finishConfirm.eventId)} className="flex-1 bg-red-600 text-white font-black text-sm py-2.5 rounded-xl hover:bg-red-700">Yes</button>
<button onClick={()=>setFinishConfirm(null)} className="flex-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-200">Cancel</button>
```

**The red "Yes" is leftmost.** Eleven of the twelve styled confirms put the safe arm there — including,
now, the event-cancel modal on all three surfaces. ⚠️ It is also the confirm most likely to be tapped
in a hurry at the end of service. **Changed nothing**, as instructed.

## D2. The dashboard's unwired overlays — and they are inert, not harmful

**READ** — the page's `useAndroidBack` list now has **14** entries (13 + the event-cancel modal). The
surface carries more, from mounted children:

| Overlay | Source | Wired? | Harmful? |
|---|---|---|---|
| `PaymentActionsModal` — remove payment | `OrderCard.tsx:587` (`confirmRemovePayment`) | ❌ | ✅ inert |
| `PaymentActionsModal` — **refund form** | same | ❌ | ✅ inert |
| `PaymentActionsModal` — 2 explainers | same | ❌ | ✅ inert |
| `PaymentActionsModal` — **second mount** | `page.tsx:3538` (`payModalOrder`) | ❌ | ✅ inert |
| `DealsModal` | `DealsModal.tsx:237` | ❌ | ✅ inert |
| `BuzzerGrid` — picker | `BuzzerGrid.tsx:182` | ❌ | ✅ inert |
| `BuzzerGrid` — **blocking mode** | `BuzzerGrid.tsx:182` | ❌ | ✅ **correctly** — see below |
| `BuzzerGrid` — take-from-another-order confirm | `BuzzerGrid.tsx:151` | ❌ | ✅ inert |
| `UserMenu` — dropdown scrim | `UserMenu.tsx:108` | ❌ | ✅ inert |
| `UserMenu` — device sheet | `UserMenu.tsx:297` | ❌ | ✅ inert |
| `DeviceSetupGate` | `OperatorDeviceConfig.tsx:75` | ❌ | ✅ inert |
| `AppLockGate` | `AppLockGate.tsx:66` | ❌ | ✅ **correctly** — a lock must not be dismissible |
| `DemoWelcome`, `DemoGetStarted` | demo only | ❌ | ✅ inert |

🔴 **"Inert" is a property of the design, not an assumption.** **READ** —
`lib/native/backHandler.ts:11-19`: registering *any* listener replaces Capacitor's `goBack()` branch
app-wide, so an unregistered overlay goes from *"back throws the page away"* to *"back does nothing"*.
Every row above is therefore a missing convenience, not a live hazard.

⚠️ **One of them must stay unwired, and it is a decision rather than an omission.** **READ**,
`BuzzerGrid.tsx:184` and `:198`:

```tsx
        onClick={blocking ? undefined : (e) => { if (e.target === e.currentTarget) onClose() }}
            {/* No ✕ in blocking mode — "No buzzer" below is the only exit, and it is an active choice. */}
```

In blocking mode there **is** no non-committing arm. Wiring back to `onClose()` would make the press
*make the choice* — the one thing the convention forbids.

**New this turn:** `PaymentActionsModal`'s second mount at `page.tsx:3538` was not in the audit's
count of 27. The dashboard surface therefore carries **28**, of which **18** are wired.

## D3. What a shared modal primitive would have to cover

**READ** — `components/ui/` contains exactly one file, `Tooltip.tsx`. There is no `Modal`, `Dialog`,
`Sheet`, `ConfirmDialog` or `useConfirm` anywhere. **Not built, as instructed.** From reading all 82,
a primitive would need to own:

1. **The shell** — `fixed inset-0`, the scrim, `z-50`, `items-end sm:items-center`, the card, the
   `max-h-[90vh] overflow-y-auto` that four sheets get wrong.
2. **Dismissal policy as a declared type, not a per-modal decision** — the audit found four distinct
   backdrop behaviours: dismiss, dismiss-unless-busy, dismiss-only-if-`id`, and explicit no-op
   (`onClick={() => {}}`). A primitive would name these instead of re-deciding them 82 times.
3. **Arm ordering by role** — pass `safe` and `destructive`, let the component place them. This alone
   would have prevented D1.
4. **Escape**, currently implemented in 3 overlays of 82.
5. **Back-handler registration**, so an overlay registers *itself* rather than needing a hand-kept
   list in each page — the root cause of D2.
6. **Focus management and `role="dialog"`/`aria-modal`**, present on 6 overlays and absent from the
   rest.
7. **A reset contract** — mount-on-open, so Part A's defect is structurally impossible.

⚠️ **Points 3, 5 and 7 are the three defects of this task, each of which a primitive would have made
unrepresentable.** That is the argument for one — and it is still not an argument for doing it today
across two live operator surfaces.

---

# PART E — BOUNDARIES

## E1. `git diff --stat` — this task's files

```
 app/dashboard/[token]/kds/page.tsx |  70 ++++++++++++++++++++--
 app/dashboard/[token]/page.tsx     | 117 ++++++++++++++++++++++++++++++++++---
 app/manage/[token]/page.tsx        |  75 +++++-------------------
 3 files changed, 189 insertions(+), 73 deletions(-)
```

plus one new file, `components/shared/EventCancelModal.tsx`.

✅ **Boundary greps against this task's diff and the new component — all zero:**

```
  lib/payments         pages diff: 0 | new component: 0
  gatedAction          pages diff: 0 | new component: 0
  supabase/migrations  pages diff: 0 | new component: 0
  lib/slot             pages diff: 0 | new component: 0
  lib/capacity         pages diff: 0 | new component: 0
  package.json         pages diff: 0 | new component: 0
```

**No payment path, no offline gate, no migration, no slot or capacity code, no dependency.**
`components/dashboard/PaymentActionsModal.tsx` is **not in the diff** (Part C).

## E2. Do the three operations still do exactly what they did?

**CANCELLING AN ORDER — dashboard.** ✅ **Yes.** `confirmCancelOrder` is unchanged except that six
`set*` calls became one function call. **READ** — the refund still goes first, the same body still
reaches the same endpoint:

```tsx
2228: const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'cancel',order_key:orderKey,cancellationReason:fullReason||null,refunded_minor:refundedMinor,refund_declined:refundableMinor>0&&!cancelRefund},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
```

**REJECTING AN ORDER — dashboard.** ✅ **Yes.** Same substitution, same request.

**CANCELLING AN EVENT — all three surfaces.** ✅ **Yes**, with B6's flagged addition. The full manage
diff, so the extent is visible:

```diff
-  const [eventCancelReason, setEventCancelReason] = useState('')
-  const [eventCancelNote, setEventCancelNote] = useState('')
-  const confirmCancelEvent = async () => {
+  const confirmCancelEvent = async (cancellationReason: string, cancellationNote: string) => {
-          payload: { cancellationReason: eventCancelReason, cancellationNote: eventCancelNote },
+          payload: { cancellationReason, cancellationNote },
-    finally { setCancellingEvent(null); setEventCancelReason(''); setEventCancelNote('') }
+    finally { setCancellingEvent(null) }
```

plus 57 lines of JSX replaced by the 7-line component call. **The endpoint call, the optimistic
`setEvents` filter and the order-count toast are untouched.**

## E3. What a Pizzeria Gusto operator sees differently

Almost nothing, and nothing at all unless they cancel something. Cancelling an **order** looks
identical — same modal, same "Keep order", same refund checkbox; the only difference is invisible,
which is that dismissing it with the Android back button now clears the form exactly as "Keep order"
always did, so the next order they cancel starts blank instead of inheriting the last one's reason,
message and refund decision. Cancelling an **event** from the dashboard or the KDS is the visible
change: instead of a grey system box reading *"Cancel this event? This cannot be undone."* with **OK**
and **Cancel**, they get the same white modal they already know from Settings — the venue and date,
**"3 orders will be cancelled and customers notified"** in red, an optional reason, an optional
message to those customers, and **Keep event** beside **Cancel event**. On an iPad nothing else
changes at all; on Android the back button now dismisses that modal instead of doing nothing. The
event menu closes as the modal opens, so there is one thing on screen rather than two. ⚠️ **What has
not changed is what cancelling does** — the same orders are cancelled and the same emails sent, and
the card holds behind them are still stranded.

---

# PART F — INTEGRITY

## F1. Non-ASCII census BEFORE

```
app/dashboard/[token]/page.tsx     53 classes   U+2500:2050 U+2014:494 U+2192:113 U+1F534:83 U+26A0:67 U+FE0F:65 …
app/dashboard/[token]/kds/page.tsx 32 classes   U+2500:995 U+2014:130 U+1F534:36 U+2192:22 U+26A0:20 U+FE0F:20 …
app/manage/[token]/page.tsx       176 classes   U+2500:3752 U+2550:954 U+2014:814 U+2192:239 U+FE0F:108 U+1F534:105 U+26A0:99 …
components/dashboard/PaymentActionsModal.tsx  9 classes  (measured, then NOT edited — Part C)
```

**Measured before writing, exactly as instructed.**

## F2. Census AFTER — every difference explained

| File | Classes | Gained | Lost |
|---|---|---|---|
| `app/dashboard/[token]/page.tsx` | **53 → 53** | **none** | **none** |
| `app/dashboard/[token]/kds/page.tsx` | **32 → 32** | **none** | **none** |
| `app/manage/[token]/page.tsx` | **176 → 176** | **none** | **none** |
| `components/shared/EventCancelModal.tsx` | 8 (NEW FILE) | n/a | n/a |

**Every count that moved, and why:**

```
dashboard  U+2500 2050 -> 2114   the new section rules      U+2014 494 -> 500   em dashes in new comments
           U+1F534  83 ->   87   four new red headers       U+26A0  67 ->  68   one new warning note
           U+FE0F   65 ->   66   tracks U+26A0 exactly
KDS        U+2500  995 -> 1055   the new section rules      U+2014 130 ->  132  em dashes in new comments
           U+1F534  36 ->   37   one new red header         (U+26A0/U+FE0F unchanged)
manage     no count changed at all — the JSX removed carried none of these
```

🔴 **THE AFTER-CENSUS CAUGHT A VIOLATION AND IT WAS FIXED BEFORE THIS REPORT WAS WRITTEN.** The first
draft of the `resetCancelModal` comment contained a literal `✕` — describing the arm the modal does
*not* have — and that added **U+2715 MULTIPLICATION X**, a 54th class, to a file that had 53. It was
rewritten to *"no close glyph"*. ⚠️ **This is the eighth task in a row where the after-census caught
what review did not, and the third where the offending glyph was inside a sentence about glyphs.**

**The new file's 8 classes** are `U+2500, U+2014, U+26A0, U+FE0F, U+1F534, U+00B7, U+2013, U+2026`.
`U+00B7` (the ` · ` separators), `U+2013` (the en dash in the time range) and `U+2026` are **inherited
verbatim from manage's JSX** — changing them would change what renders. No baseline exists for a new
file.

## F3. 🔴 Carrier-aware variation-selector check

Per emoji-presentation base, counting how many are **followed by U+FE0F**:

| File | U+2705 | U+1F534 | U+2500 | U+26A0 n / paired / **bare** |
|---|---|---|---|---|
| `dashboard/page.tsx` | 4, none paired | 87, none paired | 2114, none paired | 68 / 65 / **3** |
| `kds/page.tsx` | 2, none paired | 37, none paired | 1055, none paired | 20 / 19 / **1** |
| `manage/page.tsx` | 8, none paired | 105, none paired | 3752, none paired | 99 / 91 / **8** |
| `EventCancelModal.tsx` | absent | 2, none paired | 102, none paired | **3 / 3 / 0** |

⚠️ **THE BARE COUNTS ARE PRE-EXISTING AND UNCHANGED — MEASURED AGAINST `git show HEAD:`, NOT ASSUMED:**

```
dashboard/page.tsx   bare warning signs 3 -> 3   (delta +0)
kds/page.tsx         bare warning signs 1 -> 1   (delta +0)
manage/page.tsx      bare warning signs 8 -> 8   (delta +0)
```

**Every warning sign this task added is paired.** ⚠️ The per-file `sum(paired) != total FE0F` because
these files also pair selectors onto bases outside the four checked (`⚙️`, `▶️`, `⏱️`, `✏️`, `🛡️`) —
which is why the delta against the file's own history, not the ratio, is the meaningful measure.
✅ The new component balances exactly: **3 = 3**.

## F4. Byte scan of every edited file

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). Never
grep.

```
  app/dashboard/[token]/page.tsx                  387949 bytes  offending=0  CR=0
  app/dashboard/[token]/kds/page.tsx              105922 bytes  offending=0  CR=0
  app/manage/[token]/page.tsx                     782627 bytes  offending=0  CR=0
  components/shared/EventCancelModal.tsx            6213 bytes  offending=0  CR=0
  components/dashboard/PaymentActionsModal.tsx     18104 bytes  offending=0  CR=0   (control — not edited)
```

✅ **Zero offending bytes, zero CR, in all five.**

## F5. Byte scan of this report

Separate pass, run after writing: **46,441 bytes, offending = 0** — no NUL, no control byte below
0x09, no CRLF, no lone CR. Its own carrier-aware check:

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 47 | 0 | 47 |
| U+1F534 LARGE RED CIRCLE | 27 | 0 | 27 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 4 | 0 | 4 |
| U+26A0 WARNING SIGN | 25 | 25 | **0** |

**Every warning sign is paired; ZERO are bare.** ⚠️ **The per-base sum does NOT equal this report's
total U+FE0F count, and that is correct rather than a discrepancy:** D3 quotes five other
emoji-presentation bases verbatim from the audit (a gear, a play triangle, a stopwatch, a pencil and a
shield), each carrying its own selector. Counting those five as orphans would be the false positive
this method exists to prevent - the same reason F3 measures the delta against each file's history
rather than a ratio. Measured: 30 selectors, 25 on warning signs, 5 on those bases.

## F6. `git status` and `git diff --stat`

```
M app/api/orders/submit/route.ts
 M app/api/webhooks/instagram/route.ts
 M app/api/webhooks/messenger/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M docs/reference-manual.md
?? components/shared/EventCancelModal.tsx
?? docs/android-audit-report.md
?? docs/android-back-handler-report.md
?? docs/event-cancel-holds-report.md
?? docs/fcm-sender-report.md
?? docs/overlay-audit-report.md
?? docs/overlay-fixes-report.md
?? docs/whatsapp-onboarding-report.md
?? docs/whatsapp-routing-report.md
?? docs/whatsapp-signature-report.md
?? lib/fcm.ts
?? lib/meta/
?? lib/native/backHandler.ts
?? supabase/migrations/20260816_trucks_phone_number_id.sql
```

```
app/api/orders/submit/route.ts          |  66 +++-
 app/api/webhooks/instagram/route.ts     |  48 ++-
 app/api/webhooks/messenger/route.ts     |  48 ++-
 app/api/webhooks/meta/whatsapp/route.ts | 173 +++++++++--
 app/dashboard/[token]/kds/page.tsx      |  70 ++++-
 app/dashboard/[token]/page.tsx          | 117 ++++++-
 app/manage/[token]/page.tsx             |  75 +----
 components/dashboard/AddOrderPanel.tsx  |  22 ++
 docs/reference-manual.md                | 519 +++++++++++++++++++++++++++++++-
 9 files changed, 1016 insertions(+), 122 deletions(-)
```

🔴 **THIS TASK'S ENTRIES ARE FOUR:** `app/dashboard/[token]/page.tsx`,
`app/dashboard/[token]/kds/page.tsx`, `app/manage/[token]/page.tsx` (modified) and
`components/shared/EventCancelModal.tsx` (new). Everything else — `app/api/orders/submit/route.ts`,
`lib/fcm.ts`, the three Meta webhook routes, `lib/meta/`, `components/dashboard/AddOrderPanel.tsx`,
`lib/native/backHandler.ts`, the reference manual, the `20260816` migration and the eight untracked
reports — is **prior turns' work, uncommitted as instructed and untouched here.**

---

# PART G — WHAT YOU MUST TEST

Numbered, with an explicit PASS and FAILURE for each. ⚠️ **Items 1–3 need an Android device; items
4–8 work on any device, iPad included.**

### The Part A fix — the state leak

**1. The refund checkbox does not travel between orders.** 🔴 **The headline test.**
Take a paid card order, tap Cancel, **untick** *"Refund £x to their card"*, choose a reason, type a
note. Press the **Android back button**. Now tap Cancel on a **different** paid order.
- **PASS:** the reason is *"Select a reason"*, the note is empty, and the refund box is **ticked**.
- **FAILURE:** any field carries over — most seriously the box still unticked, which would decline a
  refund you never declined.

**2. "Keep order" is unchanged.** Repeat item 1 but press **"Keep order"** instead of back.
- **PASS:** identical result to item 1 — a blank form on the next order.
- **FAILURE:** any difference between the two routes. They now call the same function, so a difference
  means one arm is not calling it.

**3. The reject modal.** Tap Reject on a pending order, choose a reason, type a note, press **back**.
Reject a different order.
- **PASS:** blank reason and note.
- **FAILURE:** the previous order's reason appears — it would be sent to this customer.

### The Part B fix — one gate, three surfaces

**4. Dashboard.** Event bar → menu → **Cancel event**.
- **PASS:** the white modal, naming the venue and date; if the event has live orders, a red line
  *"N orders will be cancelled and customers notified"*; **Keep event** left, **Cancel event** right;
  the event menu has closed behind it. **No grey system dialog appears.**
- **FAILURE:** a system OK/Cancel box; or the count line missing on an event that **does** have live
  orders (check the board first — the count covers `pending`, `confirmed` and `modified`).

**5. KDS.** Same, from the KDS event menu.
- **PASS:** identical modal and count. ⚠️ **Also test it with the tablet offline** — the count line
  should simply be absent and the modal still work.
- **FAILURE:** a system dialog; or the modal failing to open when offline.

**6. Manage.** Settings → Schedule → cancel an event.
- **PASS:** exactly what it did before — this surface should look **unchanged**.
- **FAILURE:** any visible difference. It is the same component; a difference means the extraction
  altered it.

**7. "Keep event" really keeps it.** Open the modal on all three surfaces, type a message, press
**Keep event**. Reopen it.
- **PASS:** the event is still there and the message box is **empty**.
- **FAILURE:** the event vanished, or the previous message is still typed in.

**8. Android back on the event modal.** Open it, press **back**.
- **PASS:** the modal closes, the event is **not** cancelled, and the board is intact.
- **FAILURE:** the event is cancelled; or the page navigates away.

### Part C — nothing changed, confirm nothing broke

**9. The refund form.** Open a card-paid order's PAID chip → **Refund**.
- **PASS:** the form has a **Cancel** button bottom-left and **Refund £x** bottom-right; Cancel closes
  without refunding; the backdrop also closes it; neither works mid-refund.
- **FAILURE:** any change from today's behaviour — this file was not edited, so any difference is
  something else.

**10. Regression sweep on the money paths.** Cancel one order **with** the refund ticked and confirm
the refund lands; cancel one **with it unticked** and confirm the money stays.
- **PASS:** both behave exactly as before this change.
- **FAILURE:** either differs. 🔴 **Stop and revert — `confirmCancelOrder`'s request body was not
  touched, so a difference here means something unintended reached it.**
