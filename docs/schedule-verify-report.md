# The wizard's schedule verify — why nothing populated

**Date:** 4 August 2026. **Read-only.** Nothing changed, no SQL run, no migration.
No garbled spans.

---

## THE ANSWER, PLAINLY

**Events arrived, and they rendered — as a read-only summary. There is no editable list in the wizard,
and there never was one on that route.**

Not "events never arrived": the server returned `found: true` with an events array, and the wizard put
it on screen. Not "rendered behind the wizard overlay": the Settings modal is never opened from the
wizard at all, so there is nothing behind anything.

The wizard's Route A is a **URL enrolment** flow, not an import flow. It verifies that the scraper can
read the page, saves `schedule_url` + `scraper_preference: 'auto'`, shows a green confirmation with a
preview of up to five dates, and **writes no `truck_events` rows whatsoever**. Its own comment says so:

```ts
setSchedVerifiedEvents(data.events || [])   // display only — NOT persisted; the scraper picks them up
```

So "the events did not populate anywhere — no editable list, no modal, nothing he could act on" is an
accurate description of what the code does. There is nothing to act on because this route was built to
hand the page to the scraper, which then submits dates for approval later.

---

## S1. THE WIZARD'S SCHEDULE STEP, TRACED

### (a) Every hop from the fetch to the render

**1. `schedVerify`** ([app/manage/[token]/page.tsx:2936](app/manage/[token]/page.tsx#L2936)) — normalise,
blocked-domain check, then:

```ts
const res = await fetch('/api/manage/verify-schedule-url', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token, url }),
})
const data = await res.json().catch(() => ({} as any))
```

**2. The success branch** — the only thing it does with a successful response:

```ts
if (data.found) {
  try {
    await api('update_truck', { data: { schedule_url: url, scraper_preference: 'auto' } })
    setSchedVerifiedEvents(data.events || [])   // display only — NOT persisted; the scraper picks them up
  } catch (e: any) {
    setSchedVerifyError(e?.message || "We read your schedule, but couldn't save it just now — try again.")
  }
  return
}
```

Two writes, and neither is an event: `trucks.schedule_url` and `trucks.scraper_preference`. The events
go into **component state only**.

**3. The render** ([:5382-5395](app/manage/[token]/page.tsx#L5382-L5395)) — a green panel:

```jsx
{schedVerifiedEvents && (
  <div className="rounded-xl border border-green-200 bg-green-50 p-3">
    <p className="text-sm font-bold text-green-800">✓ We can read your schedule</p>
    <p className="text-xs text-green-700 mt-0.5">
      Found {schedVerifiedEvents.length} upcoming date{…}. We'll check your page regularly and send new
      dates for your approval — nothing goes live until you confirm it.
    </p>
    {schedVerifiedEvents.length > 0 && (
      <ul className="mt-2 flex flex-col gap-1">
        {schedVerifiedEvents.slice(0, 5).map((ev, i) => (
          <li key={i} className="text-xs text-green-800">• {ev.event_date || 'Date TBC'}{ev.venue_name ? ` — ${ev.venue_name}` : ''}</li>
        ))}
        {schedVerifiedEvents.length > 5 && <li …>…and {schedVerifiedEvents.length - 5} more</li>}
      </ul>
    )}
```

**That is the end of the chain.** `<li>` elements. No inputs, no selects, no save button, no modal.

*(Both the count line and the five-item preview are present in `HEAD`, so this is what was on screen —
not something added since.)*

### (b) 🔴 Does it share Settings' path? **No. It has entirely its own handling.**

`onVerifySuccess` — the function that feeds `pendingVerifyEvents` and opens the "Events found on your
website" modal — is a **prop of `SettingsTab` and of nothing else**. Three occurrences in the file:

| Line | What |
|---|---|
| [:618](app/manage/[token]/page.tsx#L618) | passed to `<SettingsTab onVerifySuccess={setPendingVerifyEvents} …>` |
| [:7873](app/manage/[token]/page.tsx#L7873) | its entry in SettingsTab's prop type |
| [:8003](app/manage/[token]/page.tsx#L8003) | called by Settings' `handleVerifyUrl` |

`MenuTab` — which owns the wizard — **is never given it**. `schedVerify` cannot call it, does not call
it, and `pendingVerifyEvents` is never set from the wizard. The ScheduleTab effect that opens the modal
is therefore never triggered by a wizard verify.

Two functions, same endpoint, completely separate outcomes:

| | Settings `handleVerifyUrl` | Wizard `schedVerify` |
|---|---|---|
| On `found: true` | `onVerifySuccess(data.events)` → editable modal | `setSchedVerifiedEvents(…)` → read-only panel |
| Writes `schedule_url` | on blur, separately | yes, here, with `scraper_preference: 'auto'` |
| Can create `truck_events` | **yes**, via the modal's save | **no** |
| Editing | full per-field | **none** |

### (c) Is there any editing at all on the wizard's Route A? **None.**

The only interactive controls in that block are the URL input and the Verify button, and **both are
disabled the moment a verify succeeds** (`disabled={schedVerifying || !!schedVerifiedEvents}`). After a
successful verify the route is inert: a green panel, a bullet list, and a Continue.

⚠️ Worth noting for S3: **the wizard already has an event list elsewhere.** Route B (photo/text) renders
`schedExtracted` as a list and has a real save — `schedSaveExtracted`
([:3025](app/manage/[token]/page.tsx#L3025)) loops `upsert_event` and then calls `goToSettingsReview()`.
That list is also **read-only** (`<li>` with date · venue · time), but the *save path* exists and works.
So the wizard has one working write path for events; Route A simply does not use it.

### (d) The z-index question — settled, and it is not the explanation

It does not arise, because the modal is never opened from the wizard (see (b)). For completeness, had
it been:

* the wizard's schedule overlay is `fixed inset-0 … z-50` ([:5325](app/manage/[token]/page.tsx#L5325));
* the import modal is `fixed inset-0 … z-50` ([:7804](app/manage/[token]/page.tsx#L7804)), and its own
  comment reads *"rendered outside the isActive gate so it can open from any tab"*;
* at equal z-index, paint order decides — and `<ScheduleTab>` is rendered **after** `<MenuTab>` in the
  page's JSX, so the modal would have painted **on top of** the wizard, not behind it.

`ScheduleTab` is also mounted at all times (rendered unconditionally with an `isActive` prop rather than
gated on it), and its `pendingVerifyEvents` effect carries no `isActive` guard — so mounting and
dependency-firing are both fine. **Every condition in S1(d) checks out; the path simply is not taken.**

---

## S2. DID THE EVENTS ARRIVE?

### (a) The endpoint's response shapes — and yes, the client can tell them apart

[app/api/manage/verify-schedule-url/route.ts:210-235](app/api/manage/verify-schedule-url/route.ts#L210-L235):

| Outcome | Response |
|---|---|
| Reached, parsed, **≥1 event** | `{ found: true, events: [...], rule_detected: 'scroll_lazy' \| 'scroll_next' }` |
| Reached, parsed, **0 events** | `{ found: false, events: [], reason: 'no_events' }` |
| Reached, body under 50 chars | `{ found: false, events: [], reason: 'no_content' }` |
| No text at all, HTTP ≥400 | `{ found: false, reason: 'blocked', status }` |
| DNS / connection / cert error | `{ found: false, reason: 'unreachable' }` |
| Chromium failed to launch | `{ found: false, reason: 'launch_failed' }` |

**`found: true` is returned only after `if (events.length === 0) return … 'no_events'`, so it implies at
least one event.** The two cases are structurally distinct, not just different counts.

### (b) What the wizard shows in each case — they do NOT look the same

| Server | Wizard shows |
|---|---|
| `found: true` | green **"✓ We can read your schedule"** + "Found N upcoming dates…" + up to 5 bullets |
| `reason: 'no_events'` | red **"We couldn't find any upcoming events on this page. Make sure the URL points directly to where your schedule is listed."** |

So a zero-event result and a populated result are clearly different on screen, and that is **not** the
explanation. Dominic reported seeing the success message, which means the server genuinely returned
`found: true` with a non-empty array.

**What the success message promises is the part worth reading closely:** *"We'll check your page
regularly and send new dates for your approval — nothing goes live until you confirm it."* That is
accurate about the enrolment model, and it is also the reason nothing appeared to act on — the approval
step happens later, from the scraper, not now.

### (c) SQL

Identify the truck first:

```sql
select id, name, slug, created_at, setup_step, schedule_url, scraper_preference, scraper_rule
from trucks
where id not like 'demo-%'
order by created_at desc
limit 5;
```

Then, for that truck, whether ANY events exist:

```sql
select id, event_date, start_time, end_time, venue_name, town, postcode, status, source, created_at
from truck_events
where truck_id = '<TRUCK_ID>'
order by created_at desc, event_date;
```

**The prediction this settles.** If the diagnosis is right, the second query returns **zero rows** while
the first shows `schedule_url` populated and `scraper_preference = 'auto'` (and probably
`scraper_rule` set, since the verify route writes it on success). That combination is the signature of
"verified and enrolled, nothing imported" — which is Route A working exactly as built. If instead there
ARE `truck_events` rows, then something did write them and the question becomes why they were not
visible, which is a different investigation.

---

## S3. WHAT REUSE WOULD TAKE

### (a) What the modal depends on — all of it ScheduleTab-local

The modal is JSX **inside `ScheduleTab`'s return** ([:7803](app/manage/[token]/page.tsx#L7803)), not a
component. It closes over eight pieces of ScheduleTab state:

| State | Line |
|---|---|
| `extractedEvents` | [:6253](app/manage/[token]/page.tsx#L6253) |
| `editedEvents` | [:6254](app/manage/[token]/page.tsx#L6254) |
| `selectedEvents` | [:6255](app/manage/[token]/page.tsx#L6255) |
| `expandedEventIds` | [:6257](app/manage/[token]/page.tsx#L6257) |
| `focusedEventIds` | [:6258](app/manage/[token]/page.tsx#L6258) |
| `exclusionTerms` | [:6260](app/manage/[token]/page.tsx#L6260) |
| `showImportModal` | [:6263](app/manage/[token]/page.tsx#L6263) |
| `importModalTitle` | [:6264](app/manage/[token]/page.tsx#L6264) |

plus `updateEvent` ([:6930](app/manage/[token]/page.tsx#L6930)) — declared **inside an IIFE within the
modal's own render**, closing over `setEditedEvents` — and `saveExtractedEvents`
([:6482](app/manage/[token]/page.tsx#L6482)), the write path.

**Nothing is extracted. There is no `<EventReviewModal>` to import.** It is a large block of JSX welded
to one component's state.

### (b) The smallest change that reuses it rather than copying it

🔴 **Do not lift the JSX into the wizard.** That is the second-copy failure this session has hit
repeatedly, and this block is far larger than the ones that have already drifted.

**The smallest change is to give the wizard the trigger Settings already has, not the UI.** The modal is
opened by exactly one thing — `pendingVerifyEvents` becoming non-empty — and it is *already* rendered
outside the `isActive` gate specifically so it can open from any tab. So:

1. `MenuTab` gains an `onVerifySuccess` prop, wired to the same page-level `setPendingVerifyEvents` that
   `SettingsTab` is already given at [:618](app/manage/[token]/page.tsx#L618).
2. `schedVerify`'s `found` branch calls it instead of (or as well as) `setSchedVerifiedEvents`.

That is one prop, one call site, and **zero new UI** — the existing modal opens over the wizard (it is
`z-50` and painted after MenuTab, so it lands on top, per S1(d)).

Two consequences to decide rather than discover:

* **Route A currently writes `scraper_preference: 'auto'` and enrols the URL.** Those are two different
  promises — "scrape this page from now on" and "import these dates now". Reusing the modal means the
  operator does both in one action. That may be right, but it is a product decision, not a refactor.
* **The wizard's Route A green panel becomes redundant** once a modal opens over it. It should probably
  be reduced to the enrolment confirmation only, or the modal should replace it.

### (c) The conflict with step progression — real, and it is the modal's save

`saveExtractedEvents` is ScheduleTab's, and it knows nothing about `importStep`. After saving it does
ScheduleTab things — reload, close, toast — and **will not call `goToSettingsReview()`**, so the wizard
would sit on the schedule step with the modal closed and no forward move.

The wizard's own Route B already solves exactly this: `schedSaveExtracted` ends with

```ts
goToSettingsReview()   // K1 — was finishSetup(); the review screen now owns that call
```

So the reuse needs a completion signal — an optional `onSaved?: () => void` on the save path, called by
the wizard to advance and left undefined by Settings. One optional callback, no duplicated UI, and the
step progression stays owned by the wizard where it belongs.

---

## S4. Q11 — still accurate

**Confirmed after this session's changes.** The line has moved from `:4045` to
**[:4076](app/manage/[token]/page.tsx#L4076)** (this session's edits shifted it), and it is unchanged:

```tsx
? <Btn label="Set up / review allergens" colour="orange" size="sm" icon="🛡️" disabled={noMenu}
    onClick={() => { setWizardInitialMode(0); onOpenAllergenWizard() }} />
```

**`mode` is still in scope**, declared 39 lines above in the same IIFE at
[:4037](app/manage/[token]/page.tsx#L4037):

```ts
const mode = (truck as any).allergen_display_mode as 'per_dish' | 'card' | 'both' | null
```

So the one-line fix stands exactly as reported:

```tsx
onClick={() => { setWizardInitialMode(mode === 'per_dish' || mode === 'both' ? 1 : 0); onOpenAllergenWizard() }}
```

No new state, no new prop, no change to `AllergenWizardModal` — `initialMode={1}` is already the shape
the import wizard passes it.
