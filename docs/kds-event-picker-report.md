# The KDS event picker will not scroll — diagnosis

**Date:** 1 September 2026
**READ-ONLY.** No file changed, no fix implemented, nothing committed or deployed.
Marked **READ**, **INFERRED**, **UNKNOWN** throughout.

---

## The answer in one line

🔴 **The KDS picker's card has no height cap and no overflow rule; the dashboard's has both.** All 17
events are in the DOM — the card simply grows past the viewport inside a `fixed inset-0` overlay, which
does not scroll. **Nothing is truncated at fetch time.**

```
KDS       kds/page.tsx:2798    class="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl"
DASHBOARD AddOrderPanel:2550   class="bg-white rounded-2xl w-full max-w-sm mx-auto max-h-[80vh] overflow-y-auto"
                                                                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
```

---

## 1. The two pickers

🔴 **They are TWO SEPARATE IMPLEMENTATIONS, not one component rendered twice.** Neither imports the
other; there is no shared event-picker component anywhere.

| | KDS | Dashboard |
|---|---|---|
| **file:line** | `app/dashboard/[token]/kds/page.tsx:2796-2820` | `components/dashboard/AddOrderPanel.tsx:2540-2612` |
| Title | **"Change event"** | **"Select event"** |
| Reached by | Manage event ▾ → Change event (`:2848`) | Manage event ▾ → sets `activeTab('add')` + `pendingOpenEventPicker` (`page.tsx:5289`), which opens the panel's own picker |
| Length | ~25 lines | ~73 lines |

**KDS, quoted:**

```jsx
{showEventPicker && !isDemo && (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" …>
    <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Change event</h3>
      …
      <div className="flex flex-col gap-2">
        {events.map(event => { … })}
      </div>
      <button …>Cancel</button>
```

**Dashboard, quoted:**

```jsx
<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" …>
  <div className="bg-white rounded-2xl w-full max-w-sm mx-auto max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
    <div className="px-4 pt-4 pb-3 border-b border-slate-100 …">
      <p className="font-black text-slate-900 text-base">Select event</p>
    …
    <div className="p-3 space-y-2">
      {upcomingEvents.length > 0 ? upcomingEvents.map(ev => { … })
```

⚠️ **The KDS's own comment says the list was "the chip strip's list, moved"** (`:2794`) — **INFERRED: it
was lifted from a horizontal strip, where a height cap was meaningless, into a vertical modal, where it
is the only thing that matters.**

## 2. Every behavioural difference

| | KDS (`kds/page.tsx`) | Dashboard (`AddOrderPanel.tsx`) |
|---|---|---|
| **Endpoint** | `/api/events/manage?token=…&upcoming=true` (`:678`) | the same endpoint, via `fetchUpcomingEvents()` (`:723`) |
| **State** | `events` (`:408`) — **the full upcoming list, unfiltered**, per its own comment at `:687` | `upcomingEvents` (`:362`) — local state, fetched once when empty |
| **When fetched** | on load, with the KDS's own poll | **lazily — only when the picker first opens** (`:723`) |
| **Count** | **no limit, no slice** | **no limit, no slice** |
| **Ordering** | as returned — `event_date` then `start_time` ascending | same |
| **Filtering in the list** | 🔴 **none** — every upcoming event is rendered | 🔴 **none either**, but each row is *evaluated*: `blocked` when offline and not cached (`:2562`) |
| **Row content** | venue (first comma-segment) · day · start time · `●` if open | date · start–end · venue+town · status badges (Live / Finished / Future) · "Reconnect to load" · "Selected" |
| **Disabled rows** | none | `disabled={blocked}` when offline |
| **Loading state** | none — empty list until fetched | skeletons, and never flashes "No events" before a successful load (`:2579-2584`) |
| **On selection** | `setShowEventPicker(false); switchEvent(event)` (`:2809`) — **switches the whole screen's event, with a confirm** | `setManualEvent(ev)`, `resetManual()` if changing, `fetchManualSlots(...)`, `setManualSlot('')`, `onEventChange?.(ev.id)` (`:2565`) — **selects an event for the order being built** |
| **Extra UI** | Cancel | Done, plus a future-event warning and a "today, not yet open" note |
| **Demo** | hidden entirely (`!isDemo`) | shown but guarded inside `openEventPicker` |

🔴 **THEY ARE NOT THE SAME JOB.** The KDS picker **changes which event the kitchen screen is showing**;
the dashboard picker **chooses which event a manual order is being added to.** That matters for the fix
in §8 — they share a shape and a data source, not a purpose.

## 3. Container differences

**Both overlays are `fixed inset-0 … z-50 flex … justify-center p-4`.** ✅ **Nothing creates a containing
block for `position: fixed`** — no `transform`, `filter`, `will-change`, `perspective` or `contain` on
any ancestor in the KDS (the only `transition-transform` is on a chevron at `:2097`, unrelated). **So
both overlays are viewport-relative, as intended.**

🔴 **THE DIFFERENCE IS ENTIRELY IN THE CARD:**

| | KDS `:2798` | Dashboard `:2550` |
|---|---|---|
| height cap | 🔴 **none** | ✅ `max-h-[80vh]` |
| overflow | 🔴 **none** | ✅ `overflow-y-auto` |
| inner list | `flex flex-col gap-2` — **no cap, no overflow** | `p-3 space-y-2` inside the scrolling card |
| click-through guard | overlay checks `e.target === e.currentTarget` | card has `onClick={e => e.stopPropagation()}` |

⚠️ **A second, phone-specific aggravation.** The KDS overlay is `items-end sm:items-center`. Below
640px the card is bottom-anchored, so **the overflow spills off the TOP** — the earliest events, and the
header with the × button, go off-screen first. Above 640px it is centred and spills **both ways**.
**INFERRED from the classes; not measured on a device.**

## 4. 🔴 Unscrollable, or truncated? — **Unscrollable. Everything is in the DOM.**

**READ — `app/api/events/manage/route.ts:24-40`, the entire query:**

```ts
let query = supabase
  .from('truck_events')
  .select(`*, event_deals ( id, bundle_id, active, overridden )`)
  …
  .order('start_time', { ascending: true })

if (status) query = query.eq('status', status)
if (upcoming === 'true') {
  const today = new Date().toISOString().split('T')[0]
  query = query.gte('event_date', today)
}

const { data, error } = await query
return NextResponse.json({ events: data })
```

🔴 **THERE IS NO `.limit()`, NO `.range()` AND NO PAGINATION.** And the KDS assigns the result whole:

```ts
// The FULL upcoming list, unfiltered — see the candidate-set note on `events`.
const fetched: TruckEvent[] = eventsData.events ?? []
```

then renders `{events.map(...)}` with **no `.slice()`**.

✅ **So every event is fetched, and every one is rendered into the DOM. The card is taller than the
viewport and the overlay cannot scroll. This is an overflow bug, not a fetch bug — and the fix is CSS,
not query.**

## 5. How many events, and how many are unreachable

**READ from production, server date 2026-09-01:**

```
total events for test-truck-3-2 : 28
upcoming=true would return      : 17
```

All 17: Test Event 12 (1 Sep, open) → Test Event 28 (17 Sep).

**Height estimate — INFERRED, not measured.** Each row is `py-2.5` + one text line ≈ **46px**, plus
`gap-2` (8px) ≈ **54px per event**. 17 × 54 ≈ **918px**, plus header (~44px), `p-5` padding (40px) and
the Cancel button (~40px) ≈ **~1,040px of card.**

⚠️ **So on a phone (~700–800px usable) roughly the first 11–13 are reachable and 4–6 are not; on a
tablet in portrait most fit and the last 1–3 do not.** 🔴 **Because the list is sorted ascending, the
events lost are always the LATEST — Test Events 24–28, exactly the fourteen new September ones you have
just created.** **UNKNOWN precisely how many on your device** — I did not measure a real viewport.

## 6. The route, and whether the Suspense change is implicated

**READ — `app/kds/[kds_token]/page.tsx:71-75`:**

```jsx
return (
  <Suspense fallback={null}>
    <KdsPage token={truck.dashboard_token} vanId={van.id} vanName={van.name} />
  </Suspense>
)
```

**Yes — the app and a browser reach the same component.** The app opens `/kds/<kds_token>`, which now
renders `KdsPage` **in place**; a browser at `/dashboard/<token>/kds` renders the same component from
its own route. **Same file, same picker.**

✅ **THE SUSPENSE CHANGE IS NOT IMPLICATED, AND I CHECKED RATHER THAN ASSUMED.** `<Suspense>` renders no
DOM element of its own and creates no containing block, so it cannot affect a `fixed`-positioned
descendant. **The picker's overlay is viewport-relative either way.**

⚠️ **But the change did alter who sees this.** Before, `/kds/<kds_token>` redirected to
`/dashboard/<token>/kds`; now it renders in place. **INFERRED: the bug predates that change and is
reachable by both paths** — the card has never had a height cap. **UNKNOWN whether anyone hit it before
the event count grew**, which is the more likely reason it surfaced now: **with 3 events it fits; with
17 it does not.**

## 7. Which platforms

🔴 **This is NOT Android-specific, and you have already half-confirmed that: you report the same on
iPad.**

**Evidence from source:** the picker markup contains **zero** platform branches — no `isNativeApp`, no
`Capacitor`, no `getPlatform`, no `ios`/`android` conditional. **The classes are identical on every
platform**, and both shells are webviews loading the same production page.

✅ **So it must reproduce on the web too**, at any viewport short enough for 17 rows to overflow —
**INFERRED from the absence of any platform branch, and consistent with your iPad observation.**

⚠️ **UNKNOWN — whether it reproduces on a desktop browser**, where a tall window may fit all 17 and hide
the defect entirely. **That is the likeliest reason this was never seen in development.** I did not
measure a desktop viewport.

⚠️ **One webview-specific aggravation worth naming, INFERRED:** `max-h-[80vh]` — the class the dashboard
has and the KDS lacks — resolves against the **visual viewport**, which in a webview with dynamic
toolbars is smaller than a browser's. **So even the working picker has less room in the app than on the
web.** Not the cause here, but relevant to the fix.

---

## 8. Proposed fix — NOT IMPLEMENTED

### The minimal, correct change

**Give the KDS card the same two properties the dashboard card already has**, and put the scroll on the
**list**, not the card, so the header and Cancel stay pinned:

- Cap the card: `max-h-[85dvh]` (**`dvh`, not `vh`** — it tracks the webview's dynamic toolbars, which
  `vh` does not; this is the aggravation in §7).
- Make the card a column: `flex flex-col`, so the list can flex and the header/footer cannot be pushed
  off.
- Put `flex-1 overflow-y-auto` on the **inner list** (`:2803`), leaving `Change event` and `Cancel`
  always reachable — 🔴 **better than the dashboard's arrangement, which scrolls the whole card including
  its header.**
- Add `onClick={e => e.stopPropagation()}` to the card, matching the dashboard, so a tap on a row's
  padding cannot dismiss the modal.

**That is four class changes in one JSX element and one child. No query change, no data change.**

### Should they be one component?

**My recommendation: not yet — and the reason is §2.**

⚠️ **They render similar lists but do different jobs**: one switches the kitchen screen's event (with a
confirm and a full reload of orders); the other picks an event for an order being built (fetching slots,
resetting the basket). **Merging them means reconciling `switchEvent` with `setManualEvent`, the offline
blocking, the loading skeletons and two different sets of badges** — a much larger change than the bug
warrants, and one that touches the live kitchen screen.

✅ **What I would extract instead is the SHELL, not the picker**: a small `<ModalCard>` that owns
`max-h-[85dvh] flex flex-col`, a pinned header, a `flex-1 overflow-y-auto` body and a pinned footer.
**Both pickers keep their own rows and their own selection behaviour, and neither can have this bug
again.** 🔴 **The KDS's own comment already records that the list was moved from a horizontal strip
without its container being reconsidered — a shared shell is what stops that recurring.**

⚠️ **And one thing to decide, not for me:** with 17 upcoming events the list is long whatever it does.
**A date filter, a "next 7 days" default, or grouping by week may matter more to the operator than
scrolling 17 rows** — but that is a product judgement and the scroll bug should be fixed regardless.

---

## What I could not establish

1. **UNKNOWN — the exact number of unreachable events on your device.** §5's height figures are
   **INFERRED from Tailwind classes, not measured** in a browser or on hardware.
2. **UNKNOWN — whether it reproduces on a desktop browser.** Likely not, if the window is tall enough.
3. **UNKNOWN — when it started.** **INFERRED: the card never had a cap, and the defect surfaced when the
   event count grew past a viewport-full**, not from a code change.
4. **NOT OBSERVED — I loaded no page and measured no viewport.** Everything here is READ from source,
   the API route and production data.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** ⚠️ One note: the
brief asks for either §2 (two implementations) or §3 (same component) — **they are two implementations,
so §2 applies, but §3's container question still has a real answer**, and I have given both rather than
skipping one on a technicality, because the container comparison *is* the diagnosis.
