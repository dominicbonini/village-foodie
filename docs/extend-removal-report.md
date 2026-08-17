# Removing every remaining one-tap "Extend 30 min"

**No `next dev`, no `next build`, no `cap sync`, no deploy, no database write, no SQL.** `lib/payments/`
was not opened for edit and is absent from the diff. **`npx tsc --noEmit` passes with no output** —
that is not a build.

**Files changed by THIS task: two.** `app/dashboard/[token]/page.tsx` and
`app/dashboard/[token]/kds/page.tsx`. ⚠️ **Three other entries in `git status` are earlier tasks' and
are NOT this task's** — see D6.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Every claim is marked **READ** or **INFERRED**. **Dashboard and KDS are reported separately.**

# ✅ THE RESULT: ZERO ONE-TAP EXTEND CONTROLS REMAIN, AND `extendEvent` IS GONE FROM BOTH FILES.

**The sweep found ONE live control left — the dashboard's banner — and, once removed, `extendEvent`
had no callers on either surface, so both copies were deleted.** ⚠️ **B3's conditions for keeping it
were checked first and neither holds; the reasoning is quoted there.**

---

# PART A — FIND THEM ALL

## A1. Every hit, swept across the whole repo

**READ** — `grep -rn "extendEvent" --include="*.ts" --include="*.tsx" .` and
`grep -rn "Extend\|+30 min\|+30min"`, both excluding `node_modules`. **Complete, before any edit.**

### `extendEvent` — 14 hits, of which only THREE were code

| file:line | What |
|---|---|
| `app/dashboard/[token]/page.tsx:2234` | 🔴 **the function definition** |
| `app/dashboard/[token]/page.tsx:3186` | 🔴 **A LIVE CALL — the recently-closed banner's button** |
| `app/dashboard/[token]/kds/page.tsx:939` | 🔴 **the function definition** |
| `page.tsx:2215, 2220, 2221` · `kds/page.tsx:955, 961, 963, 1536, 1537, 1563, 1571` · `EventFinishTimeModal.tsx:6` | **comments only** |

**THE ONE LIVE CONTROL, WITH ITS SURROUNDING MARKUP — READ,
`app/dashboard/[token]/page.tsx:3182-3187`:**

```tsx
            {/* Recently closed banner */}
            {recentlyClosed&&activeEvent&&(
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 mb-4 flex items-center justify-between">
                <span className="text-sm text-slate-600">Event finished · {activeEvent.venue_name} ended at {formatTime(activeEvent.end_time)}</span>
                <button onClick={()=>extendEvent(activeEvent.id,30)} className="text-sm font-medium text-teal-600 hover:text-teal-700">Extend 30 min</button>
              </div>
            )}
```

### "Extend" / "+30" copy — 14 hits

| file:line | What | In scope? |
|---|---|---|
| `page.tsx:3186` | 🔴 **`>Extend 30 min</button>`** | ✅ **YES — the only live control** |
| `kds/page.tsx:1424` | `<option value="30">+30 min</option>` | 🔴 **NO — this is ADD EXTRA WAIT, a different feature** |
| `page.tsx:2802` | `<option value={30}>+30 min</option>` | 🔴 **NO — the same extra-wait control** |
| `kds/page.tsx:950` · `page.tsx:2243` | `showKdsToast(\`Extended to ${newEnd}\`)` / `showToast(...)` | ✅ **inside `extendEvent` — went with it** |
| `kds/page.tsx:257, 260, 1409, 1541, 1548, 1568, 1834` · `page.tsx:4481` · `EventFinishTimeModal.tsx:6, 130` | **comments** | ⚠️ **three were stale — fixed, see B1** |
| `app/api/auth/resend-verification/route.ts:48` | `// Extend expiry by 24 hours` | 🔴 **NO — unrelated** |

🔴 **THE EXTRA-WAIT `+30 min` OPTIONS ARE NOT THIS CONTROL AND WERE NOT TOUCHED.** They set
`set_extra_wait`, an event-level buffer on NEW-order time quotes; they do not write `end_time`.
**INFERRED, and the codebase already warns about the confusion** — the dashboard's old menu comment
read *"NOT an order-wait buffer. Labelled explicitly so it isn't confused with 'Add extra wait' now
sitting beside it."*

## A2. Each hit by surface, affordance and confirm

| # | Surface | Affordance | Confirm? |
|---|---|---|---|
| 1 | **DASHBOARD** — recently-closed banner | one-tap `Extend 30 min`, teal text link above the order area | 🔴 **NONE** |
| 2 | **KDS** — recently-closed banner | *(already removed last task)* | — |
| 3 | **KDS** — header, beside Event actions | *(removed earlier — comment remains)* | — |
| 4 | **DASHBOARD** — Event actions menu | *(replaced by the shared picker)* | ✅ now picker + confirm |
| 5 | **KDS** — Event actions menu | never had a `+30`; has the picker | ✅ picker + confirm |

## A3. 🔴 ALREADY REMOVED vs REMAINING — read from the current files, not from earlier reports

| Control | Status BEFORE this task | Verified by |
|---|---|---|
| KDS header `+30 min` | ✅ **ALREADY GONE** | only a comment at `kds:1541` |
| KDS banner `Extend 30 min` | ✅ **ALREADY GONE** | the banner at `kds:1572` has a single `<span>` child |
| Dashboard Event actions `Extend event +30 min` | ✅ **ALREADY GONE** | replaced by `Change event finish time` |
| 🔴 **Dashboard banner `Extend 30 min`** | 🔴 **STILL PRESENT** | `page.tsx:3186`, quoted at A1 |
| `extendEvent` (dashboard) | 🔴 **PRESENT, and still called once** | `page.tsx:2234` |
| `extendEvent` (KDS) | ⚠️ **PRESENT but ALREADY DEAD** | no caller after last task |

⚠️ **ONE EARLIER REPORT WAS STALE AND I FOUND IT BY READING RATHER THAN TRUSTING IT.** `kds:1571`
still claimed *"`extendEvent` therefore still has one caller and is NOT dead"* — true when written,
false once the dashboard's button went. **Corrected in B1.**

---

# PART B — REMOVE THEM

## B1. Every removal, before and after

### REMOVAL 1 — the dashboard's banner button

**BEFORE — READ:** *(quoted in full at A1)*

```tsx
                <button onClick={()=>extendEvent(activeEvent.id,30)} className="text-sm font-medium text-teal-600 hover:text-teal-700">Extend 30 min</button>
```

**AFTER — READ, the whole banner:**

```tsx
            {/* Recently closed banner */}
            {/* ⚠️ "Extend 30 min" REMOVED FROM THIS BANNER (16 August), matching the KDS's, which lost
                its copy first. It called `extendEvent(activeEvent.id,30)` — one tap, relative, with no
                confirm and no undo, which is the shape that got pressed by accident.
                🔴 RECOVERY IS NOT LOST. Event actions ▾ -> "Change event finish time" reaches the same
                write behind a picker and a confirm, and can set any future time rather than only +30.
                ⚠️ THE BANNER ITSELF STAYS — it is how an operator knows the event has ended. It keeps
                `justify-between` so the sentence sits exactly where it did; there is no empty slot,
                because a single flex child with that class simply starts at the left edge. */}
            {recentlyClosed&&activeEvent&&(
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 mb-4 flex items-center justify-between">
                <span className="text-sm text-slate-600">Event finished · {activeEvent.venue_name} ended at {formatTime(activeEvent.end_time)}</span>
              </div>
            )}
```

### REMOVAL 2 — `extendEvent` on the dashboard

**BEFORE — READ, the whole function:**

```ts
  const extendEvent=async(eventId:string,addMins:number)=>{
    const ev=todayEvents.find(e=>e.id===eventId); if(!ev) return
    const[h,m]=ev.end_time.split(':').map(Number)
    const total=h*60+m+addMins
    const newEnd=`${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`
    try{
      const res=await fetch('/api/events/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'update',eventId,payload:{end_time:newEnd}})})
      const data=await res.json(); if(!res.ok) throw new Error(data.error)
      setTodayEvents(prev=>prev.map(e=>e.id===eventId?{...e,end_time:newEnd}:e))
      showToast(`Extended to ${newEnd}`)
    }catch(err:any){showToast(err.message||'Failed','error')}
  }
```

**AFTER — READ, a comment in its place:**

```ts
  // ── `extendEvent` DELETED (16 August) ───────────────────────────────────────────────────────────
  // 🔴 IT HAD NO CALLERS LEFT. Its last one was the recently-closed banner's "Extend 30 min", removed
  // above; the Event actions menu moved to `applyFinishTime` when the shared picker replaced it. A
  // relative, unconfirmed +30 writer left sitting in a money screen is an invitation to re-add a button
  // to it, which is the thing being removed.
  // ⚠️ NOTHING QUEUED CAN LAND ON IT. It was a CLIENT function; an offline replay carries the POST body
  // to /api/events/action and is served by that route's `update` handler, which is untouched. Any op
  // queued before this change still replays correctly.
  // 🔴 THE CAPABILITY IS NOT GONE — `applyFinishTime` makes the identical write (action:'update',
  // payload `{ end_time }`), from an absolute picker behind a confirm.
```

### REMOVAL 3 — `extendEvent` on the KDS

**BEFORE — READ:**

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

**AFTER — READ:**

```ts
  // ── `extendEvent` DELETED (16 August) ───────────────────────────────────────────────────────────
  // 🔴 IT HAD NO CALLERS LEFT once this screen's recently-closed banner lost its "Extend 30 min". The
  // Event actions menu moved to `applyFinishTime` when the shared picker replaced the +30 control.
  // ⚠️ NOTHING QUEUED CAN LAND ON IT. It was a CLIENT function; an offline replay carries the POST body
  // to /api/events/action and is served by that route's `update` handler, which is untouched — so an op
  // queued before this change still replays, and `pendingSyncCount` is still incremented by
  // `applyFinishTime`'s own `data?.queued` branch below.
  // 🔴 THE CAPABILITY IS NOT GONE — `applyFinishTime` makes the identical write.
```

⚠️ **THE KDS's `data?.queued` BRANCH IS NOT LOST WITH IT** — `applyFinishTime` carries its own:

```ts
      if (data?.queued) { setPendingSyncCount(c => c + 1); setFinishTimeTarget(null); return }
```

### REMOVALS 4–6 — three stale comments corrected

**READ — the KDS header note, which claimed the banner button was "deliberately left":**

```
                lib/payments/ at all.
                ⚠️ EVERY ONE-TAP EXTEND IS NOW GONE FROM BOTH SURFACES (16 August) — this header's, the
                recently-closed banner's on both screens, and the dashboard Event actions menu's. The
                capability lives only in "Change event finish time", behind a picker and a confirm. */}
```

**READ — the KDS banner note, which claimed `extendEvent` was "NOT dead":**

```
          ⚠️ THE DASHBOARD'S BANNER NOW MATCHES: its copy was removed in the same sweep, and `extendEvent`
          itself is deleted from both files — it had no callers left. */}
```

**READ — both `applyFinishTime` headers, which described `extendEvent` as still existing:**

```
  // ⚠️ ABSOLUTE, NOT RELATIVE — and now the ONLY writer of this column on this screen. The deleted
  // `extendEvent` took `addMins` and could only push the finish LATER; this takes the time itself.
```

⚠️ **`components/shared/EventFinishTimeModal.tsx:6` still quotes the old dashboard button in its
header, as the "before" it replaced. Left deliberately — it is history, not a claim about the present,
and the file is absent from the diff.**

## B2. 🔴 NO ORPHANED BANNER, EMPTY CONTAINER OR DANGLING DIVIDER

**Both vacated areas, quoted after the change.**

**DASHBOARD — READ:**

```tsx
            {recentlyClosed&&activeEvent&&(
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 mb-4 flex items-center justify-between">
                <span className="text-sm text-slate-600">Event finished · {activeEvent.venue_name} ended at {formatTime(activeEvent.end_time)}</span>
              </div>
            )}
```

**KDS — READ:**

```tsx
      {recentlyClosed && activeEvent && (
        <div className="mx-3 mt-2 mb-1 bg-slate-100 border border-slate-200 rounded-xl p-3 flex items-center justify-between flex-shrink-0">
          <span className="text-sm text-slate-600">Event finished · {activeEvent.venue_name} ended at {formatTime(activeEvent.end_time)}</span>
        </div>
      )}
```

✅ **NEITHER IS ORPHANED: both still render a sentence, which is the banner's actual job — telling the
operator the event has ended.** ⚠️ **`justify-between` is retained in both. With one child it is a
no-op: the span sits at the left edge exactly where it did.** ⚠️ **No `border-t`, no divider and no
spacer was left behind — the removed element was a direct sibling of the span, not wrapped.**

✅ **The function bodies left no dangling `try`/`catch` or unused import: `showToast`, `showKdsToast`,
`setTodayEvents`, `setEvents` and `setPendingSyncCount` are all still used elsewhere in their files —
`tsc` passes clean.**

## B3. 🔴 WAS IT SAFE TO DELETE `extendEvent`? BOTH CONDITIONS CHECKED FIRST.

**CONDITION 1 — does `EventFinishTimeModal` call it? ❌ NO. READ, the component's entire contract with
its caller:**

```tsx
  /** Fired ONLY from the confirm step. The caller performs the write and then closes. */
  onConfirm: (newEnd: string) => void
```

**And both call sites pass `applyFinishTime`, never `extendEvent`:**

```tsx
          onConfirm={newEnd => { void applyFinishTime(finishTimeTarget.id, newEnd) }}
```
```tsx
          onConfirm={newEnd=>{void applyFinishTime(finishTimeTarget.id,newEnd)}}
```

⚠️ **The modal fetches nothing at all** — its own header says so: *"IT WRITES NOTHING. THE CALLER OWNS
THE REQUEST."*

**CONDITION 2 — could a queued offline replay land on it? ❌ NO, and the reason is structural.**
**INFERRED, from what a queued op actually is:** `extendEvent` was a **client-side function**; an
outbox entry stores the **HTTP request**, not a JS reference. A replay re-issues
`POST /api/events/action` with `{action:'update', payload:{end_time}}` and is served by the server
handler — **READ, `app/api/events/action/route.ts:154-171`, UNTOUCHED by this task:**

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

✅ **ANY OP QUEUED BEFORE THIS CHANGE STILL REPLAYS CORRECTLY. The route is not in the diff.**

**REMAINING CALLERS OF `extendEvent` — READ, `grep -rn "extendEvent" app components`:**

```
NONE. Every surviving mention is inside a comment.
```

## B4. 🔴 DO BOTH BANNERS NOW MATCH? YES.

| | Dashboard | KDS |
|---|---|---|
| Condition | `recentlyClosed&&activeEvent` | `recentlyClosed && activeEvent` |
| Copy | `Event finished · {venue} ended at {time}` | **identical** |
| Text style | `text-sm text-slate-600` | **identical** |
| Buttons | 🔴 **NONE** | 🔴 **NONE** |
| Container | `bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between` | **identical** |

⚠️ **TWO DIFFERENCES REMAIN, AND BOTH ARE LAYOUT, NOT AFFORDANCE:** the dashboard uses `p-4 mb-4`; the
KDS uses `mx-3 mt-2 mb-1 p-3 flex-shrink-0`. **INFERRED: the KDS's tighter padding and `flex-shrink-0`
belong to its fixed-viewport flex column, and matching them would change the dashboard's spacing for
no behavioural gain. Reported, not changed — "whatever remains in one is in the other" is satisfied
for content and controls.**

## B5. "Change event finish time" on BOTH surfaces

✅ **PRESENT, and it is now literally ONE button shared by both. READ —
`components/shared/EventActionsModal.tsx:122`, mounted by each surface:**

```tsx
          <button onClick={onChangeFinishTime}
            className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Change event finish time</button>
```

**AND BOTH WIRINGS — READ:**

```tsx
          onChangeFinishTime={() => { setShowEventMenu(false); setFinishTimeTarget({ id: activeEvent.id, end_time: activeEvent.end_time ?? null, event_date: activeEvent.event_date ?? null }) }}
```
```tsx
          onChangeFinishTime={()=>{setShowEventMenu(false);setFinishTimeTarget({id:activeEvent.id,end_time:activeEvent.end_time??null,event_date:activeEvent.event_date??null})}}
```

✅ **Both still work: each opens `EventFinishTimeModal`, which validates on `.getTime() > now`, offers
earlier times, counts orders due after, and calls `onConfirm` → each surface's `applyFinishTime`.**
⚠️ **`applyFinishTime` exists on BOTH files and neither was touched by this task** — confirmed by the
diff, which contains no line adding or removing it.

---

# PART C — BOUNDARIES

## C1. `git diff --stat`

```
$ git diff --stat
 app/dashboard/[token]/kds/page.tsx | 335 ++++++++++++++++---------------------
 app/dashboard/[token]/page.tsx     | 150 +++++++++--------
 app/manage/[token]/page.tsx        |  35 +++-
 components/DemoGetStarted.tsx      |  80 +++------
 components/dashboard/OrderCard.tsx |  24 +++
 5 files changed, 305 insertions(+), 319 deletions(-)
```

🔴 **ONLY TWO OF THOSE FIVE ARE THIS TASK'S** — and those two also carry three earlier tasks' work,
still uncommitted (D6).

| Boundary | Proof |
|---|---|
| **No payment path** | `lib/payments/**` absent; `app/api/**` absent |
| **No capacity engine** | `lib/slot-bookings.ts`, `lib/capacity-breach.ts` absent |
| **No gate** | `lib/features.ts`, `lib/plan-features.ts` absent |
| **No migration** | `supabase/**` absent; **no SQL run** |
| **No API route** | `app/api/events/action/route.ts` **NOT modified** — the server `update` handler is untouched (B3) |
| **No shared component** | `components/shared/**` absent — the modals are unchanged |
| **Extra wait untouched** | the `+30 min` `<option>`s at `kds:1424` and `page:2802` are not in the diff |

## C2. What a Pizzeria Gusto operator sees differently

**One thing disappears, on one screen.** The dashboard's "Event finished" banner no longer carries a
teal **Extend 30 min** link — the sentence stays exactly where it was, so the banner still tells them
the event has ended, but there is nothing to press on it. The KDS's banner lost the same link last
task and is unchanged here. 🔴 **EXTENDING AN EVENT IS NOW TWO PRESSES EVERYWHERE, ON BOTH SCREENS:**
Event actions ▾ → **Change event finish time** → pick a time → **Change finish time**. That is a real
workflow change for anyone who used the one-tap version — it is slower, and the `+30` shortcut is gone
entirely. ✅ **In exchange the control names the time it is moving from and to, can bring a finish time
FORWARD as well as back, counts any orders due after the new time, and cannot be triggered by an
accidental tap.** ⚠️ **Nothing about an order's lifecycle, payment or capacity changed — the write
behind both routes is the same single `end_time` update.**

## C3. `seededRef` and `setSelectedEventId`

# ✅ UNTOUCHED. Verified, including two diff hits I chased down.

**READ — the seed, byte-identical:**

```ts
    if (seededRef.current) return
    if (!events.length) return          // nothing to seed FROM yet — wait for the first successful fetch
    seededRef.current = true
    if (selectedEventId && events.some(e => e.id === selectedEventId)) return   // the URL seed resolved
    setSelectedEventId(pickDefaultEventByTime(events)?.id ?? null)
  }, [events, selectedEventId])
```

⚠️ **`git diff` contains two lines mentioning `seededRef`, and BOTH are COMMENTS from the earlier
Event-actions extraction, not this task:**

```
+          ⚠️ IT CALLS THE SAME switchEvent, WITH THE SAME CONFIRM, AND THE SEED (seededRef) IS NOT TOUCHED
-                (seededRef) is not touched — see the seed note. */}
```

✅ **No line in the diff adds or removes `setSelectedEventId`. SEED ONCE THEN HOLD survives.**

---

# PART D — INTEGRITY

## D1 / D2. Non-ASCII census, before and after

### `app/dashboard/[token]/kds/page.tsx` — 33 classes BEFORE, **33 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 48 | 50 | **+2** | headline markers in the two replacement comments |
| U+2014 EM DASH | 159 | 163 | **+4** | prose in the new comments |
| U+2500 BOX DRAWINGS | 1428 | 1489 | **+61** | one new comment box rule |
| U+26A0 WARNING SIGN | 39 | 40 | **+1** | one caveat marker — **paired** |
| U+FE0F VAR SELECTOR-16 | 39 | 40 | **+1** | ✅ **exactly matches the U+26A0 delta** |
| *all 28 other classes* | — | — | **0** | unchanged — including `U+00B7`, the banner's `·`, still 9 |

### `app/dashboard/[token]/page.tsx` — 53 classes BEFORE, **53 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 91 | 94 | **+3** | headline markers in the two replacement comments |
| U+2014 EM DASH | 506 | 509 | **+3** | prose in the new comments |
| U+2500 BOX DRAWINGS | 2297 | 2358 | **+61** | one new comment box rule |
| **U+25BE DOWN TRIANGLE** | 3 | 4 | **+1** | the `Event actions ▾` reference in the banner comment |
| U+26A0 WARNING SIGN | 75 | 78 | **+3** | caveat markers — **all 3 paired** |
| U+FE0F VAR SELECTOR-16 | 73 | 76 | **+3** | ✅ **exactly matches the U+26A0 delta** |
| *all 47 other classes* | — | — | **0** | unchanged — `U+00B7` still 30 |

# ✅ NEITHER FILE GAINED OR LOST A CHARACTER CLASS.

⚠️ **Every delta is an ADDITION from replacement comments, not a loss from deleted code — because the
removed markup and both function bodies were pure ASCII apart from the banner's `·`, which stays.**

## D3. 🔴 Carrier-aware variation-selector check

| File | Base | BEFORE n / paired / bare | AFTER n / paired / bare | Verdict |
|---|---|---|---|---|
| **KDS** | U+26A0 | 39 / 38 / **1** | 40 / 39 / **1** | ✅ **bare UNCHANGED at 1** |
| | U+2705 | 2 / 0 / 2 | 2 / 0 / 2 | ✅ unchanged |
| | U+2713 | 4 / 0 / 4 | 4 / 0 / 4 | ✅ unchanged |
| | U+1F534 | 48 / 0 / 48 | 50 / 0 / 50 | ✅ consistent — all bare |
| **Dashboard** | U+26A0 | 75 / 72 / **3** | 78 / 75 / **3** | ✅ **bare UNCHANGED at 3** |
| | U+2705 | 4 / 0 / 4 | 4 / 0 / 4 | ✅ unchanged |
| | U+2713 | 3 / 0 / 3 | 3 / 0 / 3 | ✅ unchanged |
| | U+1F534 | 91 / 0 / 91 | 94 / 0 / 94 | ✅ consistent — all bare |

🔴 **THE BARE U+26A0s ARE PRE-EXISTING — ONE IN THE KDS, THREE IN THE DASHBOARD — AND BOTH COUNTS ARE
UNCHANGED.** All four warning signs added across the two files are paired. ⚠️ **The added U+25BE is
bare, matching the three already in that file and the three in the KDS.**

## D4. Byte scan of every edited file

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). **Never
grep.**

```
  app/dashboard/[token]/kds/page.tsx   122,095 bytes  offending=0  CR=0   (was 122,128)
  app/dashboard/[token]/page.tsx       391,343 bytes  offending=0  CR=0   (was 390,423)
```

✅ **Zero offending bytes, zero CR, before and after, in both.** ⚠️ **The KDS shrank by 33 bytes and the
dashboard grew by 920 — the dashboard lost less code than it gained in comment, which is expected when
a 12-line function is replaced by a 10-line explanation of why it is gone.**

## D5. Byte scan of this report

Separate pass, run after writing: **27,301 bytes, offending = 0, CR = 0** — no NUL, no control byte
below 0x09, no CRLF, no lone CR. **Carrier-aware check on this report:**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 30 | 0 | 30 |
| U+1F534 LARGE RED CIRCLE | 29 | 0 | 29 |
| U+26A0 WARNING SIGN | 28 | **28** | **0** |

**Every warning sign in this report is paired; ZERO are bare — 28 of 28**, and the file's total U+FE0F
count is **28**, which accounts for all of them and leaves none attached to any other base. ⚠️ **The
two unpaired bases are internally consistent (0 of 30, 0 of 29), so neither is split across two
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
?? docs/extend-removal-report.md
?? docs/finish-time-dry-report.md
?? docs/kds-ready-toggle-report.md
?? docs/kds-steps-model-report.md
```

| Entry | This task? |
|---|---|
| `M app/dashboard/[token]/page.tsx` | ⚠️ **PARTLY — this task + the finish-time extraction + the shared Event actions menu** |
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **PARTLY — this task + the ready-step toggle + the finish-time extraction + the shared menu** |
| `?? docs/extend-removal-report.md` | ✅ **YES — this report** |
| `?? components/shared/EventActionsModal.tsx` | ❌ **NO — the shared-menu task** |
| `?? components/shared/EventFinishTimeModal.tsx` | ❌ **NO — the finish-time task** |
| `?? components/shared/CuisinePicker.tsx` | ❌ **NO — the cuisine task** |
| `M app/manage/[token]/page.tsx` | ❌ **NO — the cuisine task** |
| `M components/DemoGetStarted.tsx` | ❌ **NO — the cuisine task** |
| `M components/dashboard/OrderCard.tsx` | ❌ **NO — the ready-step toggle task** |
| `?? docs/cuisine-field-report.md`, `?? docs/finish-time-dry-report.md`, `?? docs/kds-ready-toggle-report.md`, `?? docs/kds-steps-model-report.md` | ❌ **NO — earlier reports** |

🔴 **FIVE TASKS' WORK IS NOW STACKED UNCOMMITTED AND BOTH PAGE FILES CARRY FOUR OF THEM.** **INFERRED:
they can no longer be committed separately without splitting hunks by hand. If separate commits
matter, this is well past the point to land them.**
