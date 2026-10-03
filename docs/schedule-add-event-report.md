# Add event with places down the side, the Places pill removed, and four bugs fixed

**3 October 2026 · branch `schedule-graphics` · commit `17b4ad1`**
**`git branch --show-current` → `schedule-graphics`.** `main` untouched at `deec9f5`.

🔴 **No migration was needed and none was written.** Every column this build uses already exists from
`20261003_truck_places.sql` and `20261004_schedule_places_stage2.sql`. **No SQL was run.**

🔴 **The `truck_events` guarantees from `docs/schedule-places-report.md` §3 are untouched** and still
asserted every run: one insert names `truck_place_id`, **zero** updates anywhere, and the insert key
set is `cebc78e`'s plus that one key.

> Nothing in the prompt arrived garbled, and nothing in it contradicted anything else.

---

## 1 · The four bugs

### 🔴 Bug 3 — "No events yet" on almost every place. **Your guess was right.**

**Root cause.** One predicate did two jobs:

```ts
export const NON_TRADING_STATUSES = ['cancelled', 'closed'] as const
export function isTradingStatus(s) { return !NON_TRADING_STATUSES.includes(s) }
```

…and **both** `lastEventAt` and `nextEventAt` used it. 🔴 **`closed` is the NORMAL END STATE of an
event that traded** — the operator closes it at the end of service — so excluding it from "Last"
excluded essentially every past event. A place seeded from a real event therefore had no Last, no
Next, and read **"No events yet"**. The count was wrong the same way.

**Fix.** "Did it happen" and "is it still to come" are **different questions** and now have different
answers, exactly as the brief specifies:

| | rule | used by |
|---|---|---|
| `countsAsTraded` | **not `cancelled`** — `closed`, `confirmed`, `unconfirmed` all count | **Last**, and the "n times in the last year" count |
| `countsAsUpcoming` | not `cancelled` **and not `closed`** | **Next** only |

⚠️ `isTradingStatus` is kept as a `@deprecated` alias of the *upcoming* rule, because that is what
every existing caller meant by it.

⚠️ **The harness had the bug written into it too.** A fixture line read
`ev({ status: 'closed' }), // not trading — out` and expected the count to exclude it. Corrected, and
the correction is commented as such.

### 🔴 Bug 4 — "Last time" with no times, and the wrong one of the two

**Root cause, two parts, both in the one line builder:**

```ts
export function placeSubLine(p) {
  if (p.next_event_date) return `Next: ${shortDay(p.next_event_date)}`   // ← Next FIRST
  if (p.last_event_date) return `Last: ${shortDay(p.last_event_date)}`   // ← and no times
  return 'No events yet'
}
```

1. **No times at all** — only `shortDay`. (The picker row had a conditional time clause, but with bug 3
   unfixed it almost never had a `last_event_date` to attach it to, so the visible symptom was the
   list row.)
2. 🔴 **Next was preferred over Last**, which is wrong for what the line is *for*: in the picker the
   operator is choosing a place **to repeat**, and the times are what picking it will put in the form.
   A future date tells them nothing about that.

**Fix.** `placeWhenLine` in the shared lib — **Last first**, Next only when there is no past visit,
times appended in 24-hour `HH:MM–HH:MM` to match the form, and `No events yet` only when there is
genuinely neither. `timeRangeLabel` trims the seconds (`17:00:00` → `17:00`) and omits the dash when
there is no end time, so a timeless event shows the date alone rather than a dangling separator.

### 🔴 Bug 1 — pressing a star reloaded the screen

**Root cause.**

```ts
const toggleFavourite = async (p) => {
  await api('sg_upsert_place', { id: p.id, is_favourite: !p.is_favourite })
  reload(p.id)        // ← sets places to null → spinner → re-reads → RE-SEEDS
}
```

`reload()` cleared the list to `null`, which *is* the loading state, so the pane showed its spinner and
re-ran `sg_places` — **which seeds**. The operator lost their scroll position and their search text,
and a one-boolean write cost a round trip plus a write.

**Fix.** Optimistic, in `usePlaces.setFavourite`:

- the row is patched **before** the `await`, so it moves between FAVOURITES and ALL PLACES on the tap;
- **no refetch on either outcome** — a reload here would re-seed;
- on failure the star is **reverted** and **one short line** appears in the pane. ⚠️ Not a toast: a
  toast disappears and would leave a star showing a state the database does not hold.

### 🔴 Bug 2 — an empty search showed nothing until "Show all places"

**Root cause.** The picker gated the non-favourites behind a click:

```ts
const expanded = showAllPlaces || q.length > 0
const shown = expanded ? [...favs, ...rest] : favs
```

With no search typed, `shown` was **favourites only** — and a truck with no favourites got an empty
array, which then fell through to the empty-state line reading **"No places match."** on a search the
operator had not typed.

**Fix.** There is no `showAllPlaces` and no such message. `PlaceList` renders **FAVOURITES and ALL
PLACES unconditionally**, and the only two empty states are *"Nothing matches "x""* (reachable only
with a search typed) and *"No places yet"* (reachable only with none at all).

---

## 2 · The Truck field — finding and recommendation

🔎 **It is a VAN, not another truck on the account.**

| | |
|---|---|
| **What it writes** | `truck_events.van_id` |
| **Where the options come from** | `get_vans` → `truck_vans` filtered `.eq('truck_id', truck.id).eq('active', true)` |
| **When it shows** | only when `vans.length > 1` |

**Is the places list correct for it?** ✅ **Yes.** `truck_places.truck_id` keys places to the same
truck the vans belong to, and the manage console is token-scoped to one truck (`dashboard_token`). A
van is a vehicle, not a separate place namespace — two vans trading at the same village hall are one
place, which is what the operator means.

**Multi-truck accounts exist** — `trucks.operator_id` can own several, and `/api/native/my-trucks`
lists them — but each truck has its **own** manage URL and its own places. The dropdown cannot show
another truck's vans (`.eq('truck_id', …)`), and the places list cannot show another truck's places.
**Nothing is wrong with the data model and I changed none of it.**

⚠️ **The one wrinkle, reported not changed: the LABEL.** "Truck" here means *van*. An operator with two
trucks on one account reads "Truck" as "which of my businesses", and the answer is neither — it is
"which vehicle". The label predates this work and appears on other surfaces, so renaming it is a
copy decision across several screens rather than a fix to make inside this brief.
**Recommendation:** rename it **"Van"** (or "Which van") wherever `van_id` is chosen, in one pass, and
leave the data model exactly as it is.

---

## 3 · The breakpoint, and the measurements

### 🔴 `md` — 768px. Measured either side of it, in both engines.

```
767×1000   two-pane: false (expected false) · doc 767 vs viewport 767
768×1000   two-pane: true  (expected true)  · doc 768 vs viewport 768
```

**Why `md` and not `lg`.** The brief's test is "iPad portrait (820px) should get the two-pane layout if
the form fits without horizontal scroll". At 820 it does: the modal is 820 wide, the places pane takes
its 380, and **the form still has 372px** with no horizontal page scroll and the footer on screen. At
`lg` (1024) an iPad in portrait would have fallen back to the phone two-step flow, which is the worse
answer for a device with the room. The boundary is asserted from both sides so the choice cannot drift
to whatever the next edit happens to produce.

### The measurements — **Chromium and WebKit agree to the pixel**

| viewport | modal | places pane | form pane | footer |
|---|---|---|---|---|
| **1440×900** desktop | 1040×686 | 380 @ x224 | **592** @ x624 | y728, on screen |
| **820×1180** iPad portrait | 820×686 | 380 @ x24 | **372** @ x424 | y868, on screen |
| **390×844** phone | 390×844 (full sheet) | — (step 1) | 350 @ x20 | y779, on screen |

Asserted at **every** width, in both engines:

- 🔴 **no horizontal page scroll**;
- 🔴 **the footer is on screen without scrolling** — Cancel and Add event always reachable;
- 🔴 **the modal itself does not scroll — the body does**;
- the header sits above the body, the body ends where the footer begins, the close button is inside
  the modal, and the switch is visible.

**Two-pane (≥768) also asserts:** the panes share a top edge, the list is exactly **380px**, the form
is to the *right* of it, **Area and Postcode share a row**, there is no "Address details" collapse, and
the address wrapper computes to **`display: contents`** — which is what makes its four fields grid
items.

**Phone (<768) also asserts:** one column, "Address details" **is** a collapse and **starts
collapsed**, the sheet is exactly the viewport tall, and the visual field order is
**Date → Start → End → Truck → Notes**.

🔴 **And a control:** with the two-pane grid removed, 1440px **must stack**. Without it the
side-by-side assertions would pass on a modal that never had two panes.

⚠️ **The staleness guard earned its place.** The harness throws if the compiled CSS has no
`md:grid-cols-[380px_minmax(0,1fr)]` rule — and it did throw, because the build predated this modal.
Measuring against that build would have reported one column at every width and "passed" the phone
assertions for the wrong reason.

---

## 4 · The modal, and what it is made of

### The shell

🔴 **A flex column, not a scroller.** It was one `overflow-y-auto` box, so Cancel / Add event sat at
the bottom of the *content*. Now: `shrink-0` header → scrolling body → `shrink-0` footer.

⚠️ **The footer is a flex SIBLING, not `position: sticky`.** Sticky needs a scroll ancestor; in a
flex column whose body is the scroller, a sticky footer is a no-op. This is the distinction the
measurement checks (`!modalScrolls` and `footerOnScreen` together).

**Header:** title · the two-option **One event | Upload schedule** switch · a round **close button**
with `aria-label="Close"`. **Escape closes it too.**
⛔ The **"Add manually" button and the "or add manually" divider are gone** — the form is simply there
when "One event" is selected; there was never a third state for those two controls to express.

⚠️ **Escape's handler is declared *after* `closeAddModal`.** Above it, the effect read a `const` before
its declaration — which React Compiler's immutability rule flags, and which would be a real
temporal-dead-zone error if the effect ever ran in that pass.

### One form, two field orders — and **no second copy of the JSX**

Desktop/iPad: **Date · Venue name · Full address · Area · Postcode · Start · End · Truck · Notes.**
Phone: **Date · Start/End · Truck · Notes**, then a collapsed **Address details** holding the four
address fields.

🔴 **`max-md:order-N` plus a `md:contents` wrapper does it.** On `md`+ the wrapper and its inner div
are `display: contents`, so the four fields are grid items exactly where they were; on a phone they
are a real block that collapses and is ordered last. ⚠️ **Collapsed, not unmounted** — the fields stay
in the DOM, so their values submit and `validateEventForm` sees them either way. Duplicating the
fields would have been two sets of validation and two places to add the next one.

### Places logic is **reused, not rewritten**

| piece | used by |
|---|---|
| `usePlaces` — load, seed, optimistic favourite | the modal's left pane **and** Tidy up |
| `PlaceList` — search, FAVOURITES / ALL PLACES, the star | both |
| `PlaceDetail` — the five fields, Events here, the three controls | Tidy up (unchanged logic) |

🔴 **One hook, so Tidy up and the picker cannot seed twice on one screen.** Two components each
calling `sg_places` would seed twice and race each other's reads. Asserted: exactly one `usePlaces(`
call site and exactly one `api('sg_places')`.

**Seeding and typing.** The hook is enabled when the modal opens for a new event (or Tidy up shows).
⚠️ **It never blocks the form:** the right pane renders immediately and only the left pane spins, so
the operator can start on the date before the places arrive. A failure resolves the list to `[]` with
one error line, and the venue they type is still saved as a place on submit. The seed stays idempotent
— the existing harness checks are green.

### Tidy up places

Replaces the Places pill. The left pane becomes the list, the right pane the **existing**
`PlaceDetail`, with **"← Back to add event"**. "Show hidden places" is at the foot of the list.
Full-screen on a phone with the same back link.

### The pill row, and old links

Schedule pills are **Events · Weekly post**. `?section=` still works for those two.
⚠️ **An old `?section=places` link opens Events** — it simply does not match, so the default stands —
and **does not force Tidy up open**: a bookmark from yesterday should not put somebody inside a modal
they did not open.

---

## 5 · Harness results

**`node scripts/run-harnesses.cjs` → 82 run · 82 passed · 0 failed.** `tsc --noEmit` clean. ESLint:
**0 new errors or warnings** in any added line.

### `scripts/schedule-graphics-places.cjs` — ✅ **150 checks**

New this build, among them:

- **bug 3:** `countsAsTraded` / `countsAsUpcoming` each asserted over all four statuses · the reported
  symptom end to end (a place whose only event is a closed past one shows it as Last) · the count
  including closed and excluding cancelled · both rules case- and space-insensitive;
- **bug 4:** the line carries the times · **Last beats Next** when both exist · Next only without a
  past visit · no dangling separator when an event has no times · `No events yet` only when neither;
- **bug 1:** the optimistic patch is **before** the await, the revert patch is present, and there is
  **no `reload(` anywhere in `setFavourite`** · the error renders as a line, not a toast;
- **bug 2:** no `showAllPlaces`, no "Show all places", no "No places match" · both sections rendered
  unconditionally;
- the modal: two panes from `md`, the `shrink-0` footer with a scrolling body, the switch, the labelled
  close button, Escape declared after `closeAddModal`, the phone two-step, `md:contents`, the
  collapsed-but-present fields, Tidy up reusing `PlaceDetail`, one hook;
- the pills: **two**, no `id: 'places'`, and `?section=places` falling through without forcing Tidy up.

### 33 broken variants — **every one fails as required**

Including one per bug: **W5a/W5b** (closed stops counting as Last / in the count) · **W5c** (a closed
future date offered as next) · **W5d/W5e** (the line loses its times / prefers Next) · **W21** (the
star refetches) · **W21b** (the star writes before it paints) · **W22** (non-favourites hidden behind a
flag) · plus **W23** (the Places pill returns) and **W24** (the footer rejoins the scrolling body).

⚠️ **Three of my own assertions were wrong before they were right, and the reasons are in the file:**
`showAll` also matches `showAllergenModal`; the first `if (e.key === 'Escape')` in `page.tsx` is an
unrelated category-edit handler 2,300 lines above `closeAddModal`, so an `indexOf` ordering check found
the wrong one; and `rowsOf('form')` counts **DOM children**, not visual rows, because the address
wrapper is one child holding four fields — replaced by measuring the actual claim (Area and Postcode
sharing a row). A fourth: `fieldOrder` included `display: none` fields, which report a zero rect at
top 0 and sorted to the **front**, so the phone order read "Venue, Address, Area, Postcode, Date, …".

### `scripts/schedule-places-render.cjs` — ✅ both engines, identical

Not in the sweep (needs a build and local browsers); in `harnesses.json`'s `needs_a_browser` group.
Figures in §3.

---

## 6 · Localhost test list — Village Spice only

🔴 **Localhost uses the PRODUCTION database** (`ffphgwonshgxamtvefcv`). Real rows.
**Pizzeria Gusto must not be touched or used for any check.**

```bash
cd ~/dev/village-foodie
git checkout schedule-graphics && git status      # expect: clean, on schedule-graphics
npm run dev
```

**`http://localhost:3000/login`** first — the manage token alone is not enough — then
`http://localhost:3000/manage/<Village Spice token>`.

1. **Schedule** shows **two** pills: **Events · Weekly post**. There is no Places pill. Open
   `…/manage/<token>?section=places` — it lands on **Events**, with no modal open.
2. **+ Add event.** A wide modal: header with **Add event**, the **One event | Upload schedule**
   switch, and a round **×**. Press **Escape** — it closes. Reopen; click the dark backdrop — it
   closes.
3. 🔴 **Bug 2:** with the search box **empty**, both **FAVOURITES** and **ALL PLACES** are listed
   straight away. There is no "Show all places" link and no "No places match".
4. 🔴 **Bug 3 + 4:** each row reads **"Last: Tue 6 Oct · 17:00–20:00"** — a date **and** times. Places
   that have traded should no longer say "No events yet"; a place with only a future booking shows
   **"Next: …"**.
5. 🔴 **Bug 1:** press a **star**. It fills or empties **instantly**, the row jumps between FAVOURITES
   and ALL PLACES, and **the screen does not reload** — your search text and scroll position stay put.
6. **Type in the search box** — it filters both sections by name, area or postcode.
7. **Pick a place.** Venue name, Full address, Area, Postcode, Start time and End time fill in; the
   **date stays empty**; the footer reads **"Filled from <place>"**. Change the end time and **Add
   event** — it saves with your edited time.
8. **The footer never scrolls away.** Scroll the form up and down: **Cancel** and **Add event** stay
   on screen.
9. **+ New place** (bottom-left of the list): the form clears its place, and on a phone the Address
   details section opens for you to type into. Save; the new place appears in the list next time.
10. **Tidy up places** (bottom-right, muted): the detail pane appears with **Name on posts · Short
    name · Address · Area · Postcode**, **Events here**, and **Favourite · Merge into another place ·
    Hide this place**, plus **Show hidden places**. **← Back to add event** returns you.
11. **Upload schedule** — switch to it; the existing flow is unchanged (photo / PDF / text), and the
    sticky footer is hidden there because that flow has its own buttons.
12. **Edit an existing event** (pencil on a row). **No place list** — just the form. Change the time
    and save, then reopen Add event → Tidy up: the event is **still under the same place**.
13. 📲 **iPad, portrait:** you get the **two-pane** layout (list left, form right), no sideways scroll.
14. 📱 **On a phone:** a full-screen sheet. **Step 1** "Where are you trading?" with a dashed **+ New
    place** and the two sections; tap a place → **Step 2** with the place pinned at the top and a
    **Change** link back. Order is **Date · Start/End · Truck · Notes**, with **Address details**
    collapsed below. Cancel + Add event are fixed at the bottom.
15. `node scripts/schedule-graphics-places.cjs` → **150 passed**; `node scripts/run-harnesses.cjs` →
    **82/82**.

---

## 7 · Noticed, not changed

- **The "Truck" label means "van"** — §2. A rename is a copy change across several screens.
- **`handleCopyEvent` and the per-event "Copy" button survive** in the Events list. That one copies a
  specific event deliberately, and it does **not** set `truck_place_id` — so a copied event matches by
  venue name, not by link. Consistent with every other non-modal insert, and worth knowing.
- **The 390px sheet is tall** — nine fields plus the picker — so step 2 scrolls internally. The footer
  is fixed, which is what makes that acceptable.
- **`isTradingStatus` is still exported** as a deprecated alias. Nothing in the tree calls it now; it
  is kept so an outside caller does not break silently on a rename. It can go in a later pass.
- **Seeding happens on modal open**, so an operator who opens Add event and cancels has still written
  place rows. Intended (the list must be complete), but it means "open the modal" is a write — the
  reason `sg_places` is on the staff-blocked action list.
- **`?section=weekly` is still a URL anyone can land on** while the pane is a placeholder. Harmless; it
  shows "Coming next" (or the upgrade line off-plan).
- **`scripts/_outreach-schema-census.cjs` is named far more narrowly than its contents** — unchanged
  from the last report, still worth a rename when something else touches it.
