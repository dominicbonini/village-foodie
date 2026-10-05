# COMBINING THE BRANCHES — `event-types` into `schedule-graphics`

**Branch:** `schedule-graphics` only. Nothing pushed, nothing merged into `main`, nothing deployed, no
SQL run, no migration written. `event-types` is left exactly as it was and is not to be built on again.

| Commit | |
|---|---|
| `5a50e59` | the merge itself (parents `50759fd` schedule-graphics, `5cde26d` event-types) |
| `24e9a78` | Event types as the third Schedule pill; the schedule cards back in Settings; the place-based usual-type rule |

---

## 1 · THE HEADLINE

The risk in this merge was **not** the feature overlap. It was that the merge base (`a7391d8`) predates
`main`'s revert `deec9f5` — *"Revert: Schedule graphics, stage 1"* — and that revert is in `event-types`'
history, because that branch was cut from `main` after it. So `git merge` set about re-applying the
revert of stage 1 onto the branch that had spent two days building on stage 1.

Git reports a conflict only where **both** sides touched the same lines. Everywhere schedule-graphics
had left a stage-1 line alone, the revert applied **cleanly and silently**. Four such places are in §2.

---

## 2 · THE FOUR SILENT LOSSES — none of which appeared in the conflict list

| What | How it would have failed |
|---|---|
| `supabase/migrations/20261003_truck_places.sql` | **Deleted outright.** Staged as `D` with no conflict, because schedule-graphics had not edited the file since the base. It is the migration that creates `truck_places`, and it **has been applied to production by hand** — losing the file would have left the schema with no record of itself |
| `schedule-graphics-places.cjs`'s entry in `scripts/harnesses.json` | Dropped from the `harnesses` array. The file survived (it conflicted); its **registration** did not, so the runner would have reported it as unregistered and the branch's largest harness would have stopped being swept |
| `scripts/_outreach-schema-census.cjs` | **The whole scoped-payload-reader fix reverted** — `declarationInScope` gone, `soleDeclaration` + the file-wide regex back. That is the 3 October fix for a false positive (`app/api/manage/route.ts` has five locals called `patch`, so the embed handler's `patch.website` was reported as `truck_places.website`) |
| `scripts/outreach-schema-census.cjs` | Its two companion proofs (V9b/V9c) and the scoping control, same cause |

For both census files, **event-types' entire diff against the base was the revert** — it had made no
change of its own — so the resolution was to take schedule-graphics' version whole.

### How they were found

Not by reading the conflicts. By a **line-level multiset audit** over every file in the merge, run three
ways, because no single form of it is sufficient:

1. **merged vs each tip** — flags everything, including legitimate replacements. 27 files.
2. **lines a branch ADDED (absent from the base) that the merge dropped** — unambiguous losses, and the
   form that proved the dashboard page's 118 "lost" lines were event-types *moving* five controls into
   `ThisEventCard.tsx`, not a revert. 42, all of them my own conflict resolutions.
3. **base lines the revert removed that schedule-graphics still needs** — the form that caught the two
   census files, which form 2 cannot see because those lines are *in* the base.

⚠️ **The lesson for next time.** A merge whose base predates a revert that one side carries is not a
merge, it is a merge plus a revert, and the revert is the half with no conflict markers. The audit in
`scratchpad` is three files; the two in-repo guards that now cover this ground permanently are the
line-level diffs in `scripts/schedule-graphics-places.cjs` and `scripts/event-types.cjs`.

---

## 3 · EVERY CONFLICT AND HOW IT WAS RESOLVED

22 content conflicts across 9 files, plus 3 modify/delete.

| File | n | Resolution |
|---|---|---|
| `app/manage/[token]/page.tsx` | 8 | §3.1 |
| `app/api/manage/route.ts` | 4 | §3.2 |
| `scripts/outreach-schema-census.cjs` | 3 | all keep HEAD — two had an empty other side, the third replaced a weaker "all six tables" check with the superset that also covers `event_post_backgrounds` |
| `components/manage/primitives.tsx` | 2 | §3.3 |
| `app/api/dashboard/route.ts` | 1 | **union** of two import lines: `hasEventOverride` (event-types) joins `resolveCategoriesForVan` (schedule-graphics) |
| `app/api/menu/[truckId]/route.ts` | 1 | **union**: schedule-graphics' `eventVanId` **and** event-types' probed `eventTypeForOffline`, both inside the same block |
| `scripts/_outreach-schema-census.cjs` | 1 | keep HEAD (and then the whole file restored — §2) |
| `scripts/slot-interval-settings.cjs` | 1 | §3.4 |
| `scripts/harnesses.json` | 1 | keep HEAD's `schedule-places-render.cjs` exclusion; the file is now the **exact union** of both lists, verified set-wise in both directions |
| `lib/schedule-graphics/places.ts` | modify/delete | keep HEAD |
| `scripts/schedule-graphics-places.cjs` | modify/delete | keep HEAD |
| `components/manage/ScheduleGraphicsTab.tsx` | modify/delete | accept the delete — stage 1's tab is gone on both sides |

### 3.1 `app/manage/[token]/page.tsx`

| # | Resolution |
|---|---|
| 1 | Keep HEAD — imports plus the `Truck` interface. The other side was the revert's shorter interface (no `default_group_post_wording`) |
| 2 | Keep HEAD — the modern `Tab` type, `MENU_SECTIONS`, `SCHEDULE_SECTIONS`. The other side was main's pre-revert `Tab` with `modifiers`/`deals` |
| 3 | **Merged comment.** Both branches moved `Toggle` into primitives, for different reasons; both reasons are now written at the one site |
| 4 | Keep HEAD — the tab list without the retired `deals`/`modifiers`/`graphics` tabs |
| 5 | Keep HEAD — the `ScheduleTab` mount with `section`/`onSectionChange`/places/notices |
| 6 | **Union** — HEAD's `truck_place_id: null` on a new event **and** event-types' `setEventTypeId(null)` |
| 7 | **Union** — both mounts kept (the Schedule settings modal and the Event types panel). Both are removed later, by items 2 and 4, as separate commits |
| 8 | Keep HEAD, **then re-apply the three label changes by hand.** The other side was 1,275 lines of main's un-reorganised Settings — taking it would have rendered Settings **twice**. But three of those lines were real event-types work (`SERVICE_SETTING_LABELS` for "Do you take cash?", "Offline order protection", "Collection times"), so they were applied to schedule-graphics' Settings individually |

### 3.2 `app/api/manage/route.ts` — `upsert_event`

Three of the four keep HEAD (their side was the revert: the imports, the `sg_places` staff-gate entries,
and the 248-line Places block). The fourth is the insert, and it is a **union**:

```ts
const resolvedPlaceId = await resolveEventPlaceId(targetTruckId, pickedPlaceId, venue_name, town)
const typedEventTypeId = await resolveRequestedTypeId(targetTruckId, body.event_type_id)
const { data, error } = await supabase.from('truck_events').insert({ …,
  order_ready_override: typedEventTypeId ? null : seededOrderReady,
  order_ready_source:   typedEventTypeId ? null : 'seed',
  event_type_id:        typedEventTypeId,
  …, truck_place_id: resolvedPlaceId }).select().single()
```

⚠️ Kept as **one object literal on one line**, because the harness reads it with an AST walker to prove
`truck_place_id` is written by exactly one insert and no update.

### 3.3 `components/manage/primitives.tsx` — the `Toggle` you asked about

Both branches moved `Toggle` here. **One definition survives: event-types'**, because it is a strict
superset — three optional props (`faded`, `ariaLabel`, `title`) plus `type="button"`, `role="switch"`,
`aria-checked` and `shrink-0` on the track.

**Every caller on both sides was checked.** Nothing on `page.tsx` passes any of the three new props, so
every existing call renders with the same geometry and the same colours; the measured track is
unchanged (`w-11 h-6`, green-500/slate-300), which `scripts/schedule-places-render.cjs` lifts from the
file and measures. 🔴 **Being exact: the rendered DOM is not byte-identical** — the four attributes above
are added unconditionally. None of them paints: `type="button"` prevents form submission, `role`/
`aria-checked` are announced not drawn, and `shrink-0` only changes anything in a flex row that is
already overflowing, where it is a fix. `components/dashboard/OrderCard.tsx` keeps its **own** `Toggle`,
deliberately — a different surface with its own palette.

`Select` existed only on event-types, so there was nothing to lose. `Btn` keeps schedule-graphics'
optional `className`; `Input` keeps event-types' `maxLength`/`inputRef`/`autoFocus`.

### 3.4 `scripts/slot-interval-settings.cjs`

Genuinely both sides. Schedule-graphics had **re-anchored** the slice (Kitchen capacity moved to Menu,
so the old end marker had left the file and `indexOf` returned −1 — which made the slice empty and every
copy check below it pass against nothing). Event-types had **strengthened the title check** to read from
`SERVICE_SETTING_LABELS`. Both kept: HEAD's anchors, event-types' two constant-based assertions.

### 3.5 `lib/features.ts`

Not a conflict — and that is the point. It auto-merged to event-types' version, which had dropped
`schedule_graphics` as part of the revert, and `tsc` caught it. **Both keys are present with their
original plan sets**, the schedule-graphics block lifted verbatim from the merge base.

---

## 4 · HARNESS BASELINES THE MERGE INVALIDATED

Three guards went red for the right reason and were **re-aimed, not waived**.

| Guard | Was | Now |
|---|---|---|
| `event-types.cjs` — the price path | byte-identical to the `9d3ecb8` worktree, zero differences | **byte-identical to one NAMED parent per file.** Stronger after a merge: "zero diffs from one baseline" could no longer tell the other branch's reviewed code from this feature reaching the money path. `paid-step.ts` is event-types'; the other three are schedule-graphics'. A premise check asserts the two parents genuinely differ there, so the claim is not free |
| `event-types.cjs` — the dashboard enumerated moves | `git show HEAD:…` | **pinned to the merge's first parent.** A floating `HEAD` would have become the merge commit itself the moment it landed, turning the check into a comparison of a tree with itself — the trap that file's own `BEFORE_REF` comment warns about. It has now caught three harnesses in this repo |
| `schedule-graphics-places.cjs` — the add-event insert | "today's plus `truck_place_id` and nothing else" | **all three added keys, each attributed to a branch**, with the two event-types keys read off *that branch's own insert* rather than retyped — so a hand-resolved conflict cannot put a differently-named key in a money-adjacent write and have the harness agree |

---

## 5 · EVENT TYPES AS THE THIRD SCHEDULE PILL

`SCHEDULE_SECTIONS` gains `{ id: 'event-types', label: 'Event types' }`, the `ScheduleSection` type and
the `?section=` guard gain the id, and the mount is one line. The header button and the full-screen
overlay are **gone** — two routes to one screen is exactly what the Places pill was removed for.

**It is the same component, not a second grid.** `EventTypesPanel` gained an `inline` flag that swaps
the shell and nothing else:

| | overlay | inline (the pill) |
|---|---|---|
| wrapper | `fixed inset-0` backdrop, click-to-close | the page's own flow |
| box | `shadow-2xl`, `max-h-[92vh]` | the shared `<Card>`'s `shadow-sm border border-slate-200`, no height cap |
| body | `flex-1 min-h-0 overflow-y-auto` | nothing — the manage scroller already scrolls |
| ✕ | yes | no — the pill above is how you leave |
| **width, columns, "+ New event type", footer** | **identical, one expression, one button, one footer** |

The harness asserts that arithmetic: one width expression, one header button, one footer constant, in
code (not comments). 🔴 **The first attempt was wrong and the lint caught it** — the shell was written as
a component defined inside the render, which is a new type on every render, so React would have
unmounted and remounted the grid, taking its sideways scroll position and any focused control with it on
every keystroke. The content is a value now and the wrapper is chosen after it.

---

## 6 · "USUAL TYPE FOR THIS PLACE" NOW USES PLACES

`lib/event-types/read.ts` gains `usualTypeForPlace`. With a place picked, the default type is the type of
the truck's most recent event **at the same place**, resolved through `placeForEvent` — the Places list's
own resolver, which follows `merged_into_id`. **That is the whole reason for the change:** when an
operator merges "Kings Arms" into "The Kings Arms", the history of both names is one pitch, and a
normalised-name match cannot see that — it is the weakest of `placeForEvent`'s three passes.

- **The name rule is demoted, not replaced.** `truck_place_id` is written only by the Add event modal,
  so every scraped event and everything before 3 October has none; those still match by name.
- ⛔ **A picked place with no history is Standard, and does NOT fall through to the name.** Falling
  through would let a same-named but different pitch supply a type the operator never used there.
- `placeForEvent` is **passed in** rather than imported inside `lib/event-types/read.ts`, so the
  event-types module still imports nothing from schedule-graphics — the arrangement §8.2 of the
  investigation report asked for, intact across the merge.
- The client half is one prop: `placeId={editingEvent.truck_place_id ?? null}`, undebounced (picking a
  place is one deliberate press, not typing).

**Proved against a stub client and the REAL resolver** — both sides of a merge, the no-place fallback,
the no-history case, and a 42703 failing open to Standard.

---

## 7 · FINDING EVENTS AUTOMATICALLY — BACK IN SETTINGS

- **"Your schedule" and "Import exclusions"** are back in Settings › Schedule, in their original
  position above `CustomDomainSetup`, **restored from `8f50c49`** — the commit before they moved — so
  the fields, the wording and the saves are byte-identical rather than retyped.
- ⚠️ **The state and the handler never left `SettingsTab`.** `settingsExclusionList`, `verifying`,
  `verifyError`, the `get_exclusion_terms` load and `handleVerifyUrl` were all still there; only the JSX
  had travelled. This is a restoration, not a reimplementation.
- **Gone:** the "Finding events automatically" card, `components/manage/ScheduleSettingsModal.tsx`
  (deleted), the `showScheduleSettings` state, the two modal props, and the "Where we find your events
  has moved…" pointer in Settings.
- **`lib/copy/scheduleVerify.ts` stays**, as asked. It was created by the move, but the setup wizard
  reads the same five strings, so one home for them is worth having whether or not a modal exists.
- **The van filter is back where it sat** — one `justify-between` row with the caption, which also
  restores "· Change in Settings" and `onSwitchTab` to `ScheduleTab`.

### ⚠️ One interpretation you should check

You asked to remove the card and to "put the van filter back where it sat before the card was added".
The row it sat in had the caption as its other half, so **I restored the caption line with it** — the
link now points at Settings, which is true again. If you wanted the filter alone in an otherwise empty
row, say so and it is one line.

---

## 8 · THE BUZZER ROW — CLOSED, NO CHANGE

Recorded as asked. **The rule stands as built: if a van has buzzers, the reminder is on.** The proposed
per-van "Remind me to add a buzzer" default is not wanted, so the migration it would have needed is not
written. The open item in `docs/reference-manual.md` is struck through and marked **CLOSED 4 Oct — NO
CHANGE, by Dominic's decision**. ⚠️ §39's three layers are untouched: `truck_vans.buzzer_count` is
capability, `truck_events.buzzer_prompt` is behaviour, `orders.buzzer_number` is the fact. The decision
is about the default only, not about collapsing them.

---

## 9 · CHECKS

| | |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run build` | compiled successfully |
| ESLint | `page.tsx` has the **same 5 pre-existing errors** as the merge commit — no new ones on added lines. `EventTypes.tsx`, `read.ts` and the event-types route are clean. One real error was introduced and fixed: *Cannot create components during render* (§5) |
| `page.tsx` line-level diff | the in-repo guard (pinned to `719ac91`) passes; every edited line carries a `movedEdits` entry whose replacement is asserted present |
| dashboard `page.tsx` line-level diff | the in-repo guard (now pinned to the merge's **first parent**) passes |
| whole-merge audit | at `5a50e59`: 42 lines unaccounted, **all 42 my own deliberate replacements** (two insert lines, two Toggle doc comments, one harness comment, the revert's restored pre-fix code) |

### Harnesses — all green

```
event-types                      131 passed · 42 variants failed as required
schedule-graphics-places         255 passed · variants failed as required
event-types-render              1038 measured · Chromium + WebKit
schedule-places-render           984 measured · Chromium + WebKit
capacity-move-identity            53 · van-category-settings        68
weekly-post                      207 · outreach-schema-census       42
screenshot-truck-details         173 · collection-times-hint       pass
slot-interval-settings          pass · slot-interval-event-override pass
slot-interval-grid-routing      pass · slot-interval-van-resolution pass
slot-interval-van-list-tolerance pass · customer-path-identity      pass
printing-gating                 pass · printing-network-guard       pass
batch-reservation-edit-lock     pass · batch-reservation-switch     pass
batch-reservation-writers       pass · add-order-render             pass
```

The full sweep was **not** run, as instructed. ⚠️ Two files in `scripts/harnesses.json` fail the runner's
own Stripe screen (`event-types.cjs`, `schedule-graphics-places.cjs`); that is **pre-existing on both
tips** and the merge neither caused nor fixed it — both were run directly.

### Measured at 1440 / 820 / 390 in Chromium and WebKit

| Screen | Result |
|---|---|
| **Event types pill** | card capped at 1000px and never grows with the types (1000 / 788 / 358); **left-aligned** at 16px; the columns scroll sideways **inside** the card (1388px grid in a 998px scroller) while the page does not; no ✕ |
| **Add event modal + type picker** | the select stays inside the form pane at every width and is the **same size as the Van select above it** (38×592 Chromium, 23×342 WebKit — identical to its neighbour in both); the "(usual for this place)" hint wraps to at most three lines and never overflows |
| **Settings › Schedule** | no horizontal scroll; "Import exclusions" below "Your schedule"; the URL box and Verify both stay inside the card and neither is squeezed (Verify ≥ 65px, address ≥ 100px); both cards the same width |
| **Caption + van filter row** | one row, filter to the right of the caption and inside it, at every width; a one-van truck gets the caption alone with no sideways scroll |

🔴 **A finding, not a regression.** In WebKit a native `<select>` ignores vertical padding, so the Event
type picker renders **23px** tall instead of 38px — and so does the **Van select directly above it**, and
every other native select in that form. It is a product-wide shape this build did not introduce, so the
harness asserts *parity with its neighbour* rather than an absolute floor, and it is named here instead.
`components/manage/primitives.tsx` already exports a non-native `Select` (with `appearance-none`) that
does not have this problem; converting the Add event form to it is a separate, Manage-wide change.

---

## 10 · ONE LOCALHOST TEST LIST — BOTH FEATURES, THIS BRANCH

> Village Spice or Pizza Kitchen. **Not Pizzeria Gusto.** `git checkout schedule-graphics`, `npm run dev`.

**The merge did not lose anything**

1. **Menu** — Items, Extras, Deals and **Kitchen capacity** are four pills; capacity asks "Same kitchen
   capacity for all vans?" with the green switch, no van picker.
2. **Schedule › Events** — the list loads; **+ Add event** opens the two-pane modal with the places list
   on the left and **Tidy up places** reachable from it.
3. **Schedule › Weekly post** — the pane loads and the poster renders.
4. **Settings** — the sticky pill bar is flush at the top on load and does **not** jump on the first
   scroll; all eight sections jump correctly.
5. **Dashboard** — the **"This event"** card shows Buzzers, Take cash, Order-ready step, Offline
   protection and Collection times, and Collection times still hands over to the existing box.

**Event types as the third pill**

6. **Schedule** now shows three pills: **Events · Weekly post · Event types**. There is **no** "Event
   types" button in the Schedule header any more.
7. Open **Event types**. The grid is inline on the page — left-aligned with everything else, in a white
   card, **not** an overlay, and there is no ✕.
8. With several types, the columns **scroll sideways inside the card**; the page itself does not scroll
   sideways. On a phone width you get the column picker and one column.
9. **+ New event type** is in the card's header; the two footer lines are underneath.
10. Change something in the **Standard** column — it saves, and the same value is showing in **Settings**
    when you go and look (one save path, Settings' own action).
11. `…/manage/<token>?tab=schedule&section=event-types` opens the pill directly. An old
    `?section=places` link still lands on **Events**.

**The usual type for this place**

12. Make an event type (e.g. *Festival*). Add an event, **pick a place from the list**, and save with
    that type.
13. Add a second event and **pick the same place**: the Event type field pre-fills with *Festival* and
    the hint reads **(usual for this place)**.
14. **The merge case** — in **Tidy up places**, merge another place into that one. Add an event at the
    *merged-away* name: the usual type still comes through, because both names are one pitch now.
15. Pick a place you have **never** used: the field stays on **Standard** — it does not borrow a type
    from a similarly-named place.
16. Type a venue name **without** picking a place: the old name-matching rule still fills the field.
17. Edit an existing event: there is **no** Event type field in the form (the dashboard's own control
    changes a live event's type, with its confirm).

**Finding events automatically, back in Settings**

18. **Settings › Schedule** shows **Your schedule** and **Import exclusions**, above the custom-domain
    card and the QR code — and there is **no** "Where we find your events has moved…" line.
19. Switch between *I'll add events myself* and *Find my events automatically*; the choice saves.
20. Paste your schedule URL and press **Verify** — the found events arrive for approval exactly as
    before. Try a Facebook URL: you get the blocked-domain message.
21. Remove an import-exclusion term; it goes and stays gone after a reload.
22. **Schedule › Events** has **no** "Finding events automatically" card. The caption is back above the
    list, reading "…· **Change in Settings**", and pressing it takes you to Settings.
23. The **van filter** is on the right of that caption row. On a one-van truck the row is the caption
    alone.

**The buzzer row**

24. A van **with** buzzers: "Remind me to add a buzzer" is **on**. Nothing changed here, deliberately.

---

## 11 · FILES

| File | |
|---|---|
| `app/manage/[token]/page.tsx` | 8 conflicts; the pill; the cards restored; the modal/card/pointer removed; the caption row back |
| `app/api/manage/route.ts` | 4 conflicts; `upsert_event` carries both branches' keys |
| `app/api/event-types/route.ts` | `usual_for_venue` resolves by place first, through `placeForEvent` |
| `app/api/dashboard/route.ts`, `app/api/menu/[truckId]/route.ts` | one union conflict each |
| `components/manage/EventTypes.tsx` | `inline` shell; `EventTypeSelect` takes `placeId` |
| `components/manage/primitives.tsx` | one `Toggle` (event-types' superset), one `Select` |
| `components/manage/ScheduleSettingsModal.tsx` | **deleted** |
| `lib/event-types/read.ts` | `usualTypeForPlace` |
| `lib/features.ts` | both keys, original plan sets |
| `supabase/migrations/20261003_truck_places.sql` | **restored** after the merge deleted it |
| `scripts/_outreach-schema-census.cjs`, `scripts/outreach-schema-census.cjs` | **restored** — the whole diff was the revert |
| `scripts/harnesses.json` | the exact union of both lists |
| `scripts/event-types.cjs` | two baselines re-aimed; the pill mount; the place-rule suite |
| `scripts/schedule-graphics-places.cjs` | the insert guard widened and attributed; the modal/card assertions inverted; W46/W47 retired |
| `scripts/event-types-render.cjs` | the pill measured at three widths, both engines |
| `scripts/schedule-places-render.cjs` | Settings › Schedule and the caption row replace the modal and card fixtures; the picker measured in the Add event modal |
| `docs/reference-manual.md` | three open items closed (including the buzzer row); the V13.9 status block amended to one branch |

---

## 12 · NOTHING WAS RUN

No SQL. No migration written — none was expected and none was needed. The two event-types migrations
(`20261009`, `20261010`) and the four schedule-graphics ones are unchanged and already applied by hand;
this work neither adds to them nor reads a column that is not in one.
