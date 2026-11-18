# events-create-2 — "Create event now" on the dashboard

17 November 2026 · built locally, **not committed, not pushed, not deployed** (you said you'll test first).

## Summary

Signed-in staff can now make an event from the dashboard. The event is created approved, started, selected and public, by the same code Manage uses. The button appears in three places:

- the Change event list;
- beside "Select event" in the amber boxes on Orders and Add order;
- the dark event bar when it says "Approve an event to take orders".

If the new event overlaps one that is approved, or one waiting for approval, the sheet asks first. Offline, the buttons are disabled and say why.

All checks pass:

| Check | Result |
|---|---|
| Route checks | 85 / 0 |
| Manage's create vs HEAD | Same writes in all 5 cases |
| tsc | Clean |
| Message parity | 0 failed |
| Translation check, 48 languages | Structural 0 |
| Screenshots | 134, with 0 raw keys, "undefined", cut-offs or sideways scroll |
| Harnesses this move touched | All green (some re-pinned, listed below) |

One harness, **time-dates-parity**, fails 21 checks. It fails identically on HEAD, so it was broken by the events-overlap-2 commit, not by this build. Details are in §7.

## 1 · Step 0, and two flags

- **Step 0 (done before the build):** the events-overlap-8 work was committed locally as `5a15ada8` (100 files) and not pushed.
- **Possibly garbled wording:** the hard rules say "No database writes except the step 0 commit". Step 0 was a **git** commit, not a database write, so I read the rule as "no database writes at all". **No database writes or reads of any kind were made this round.** All testing ran on in-memory fixtures. If you meant something else by it, tell me.
- **Mockup:** the brief mentions a mockup, but none was available to me. I built from the written spec (D1–D11 and the wording you gave).
- **No contradictions found** between instructions.

## 2 · What was built

### Server

**`lib/events/create-event.ts` (new): the one way a person makes an event.**

- Manage › Schedule's `upsert_event` create branch was moved here **verbatim**: the van, the order-ready seed, the place link (`resolveEventPlaceId`) and the insert.
- Two follow-up steps moved with it: deal seeding and slot capacity / production-usage refresh.
- Manage calls the same functions in the same order.
- The only thing the insert gained is `opened_at`. Manage passes `null`, and the column is nullable with no default, so Manage stores what it always did. This is proved below.

**`app/api/dashboard/action/route.ts`**

- **`create_event_now`:**
  - **Who (D1):** a signed-in owner, manager, staff member or admin of this truck. Token-only callers get **403 "Sign in as a team member to create an event."**, even with the right PIN, and so does an operator of another truck.
  - **Validation:** 400 `event_details_invalid` with a reason:

    | Reason | When | Message |
    |---|---|---|
    | `name` | No name | "Add an event name" |
    | `times` | A start or end time is missing or unreadable | "Add a start and end time" |
    | `end` | End at or before start | "The end time must be after the start" |
    | `date` | The date is not the truck's today | "Events made here are for today only" |
    | `van` | On a truck with more than one active van: no van chosen, or a van not in the list | "Choose a van" |

  - **Overlap (D4):** 409 `event_overlaps`, carrying `{kind, id, name, start, end}`:
    - `kind: 'approved'` when an approved or started event overlaps; this uses the same rules as the overlap-2 questions (`approvedOverlaps` + `overlapTarget`);
    - otherwise `kind: 'unapproved'` for an overlapping unapproved event;
    - `confirm_overlap: true` creates anyway.
  - **What is stored (D2/D3/D10):**
    - `status: 'open'`;
    - `confirmed_at` and `opened_at` = now;
    - `source: 'dashboard'`;
    - `auto_open: false`;
    - `auto_close` from the truck's setting (default true);
    - public, with no type (Standard);
    - the order-ready seed exactly as an untyped Manage event gets it;
    - deals seeded and slot capacity written, as Manage does.
  - **D9:** a typed new venue creates a Places row, through the same "existing place first, The/no The" rule Manage uses.
- **`create_event_places`** (read-only): feeds the sheet. It returns:
  - up to 6 places: favourites first, then most recently traded, skipping hidden and merged places;
  - each place's last times;
  - the active vans;
  - whether this caller may create.
- **D11:** the dead `update_event` insert branch is gone. With no `event_id`, the action now returns 400 `event_id_required`. The unused `event_date` read that only fed that insert went with it.
- **`app/api/manage/route.ts`:** calls the helper. Behaviour is unchanged, as proved in §5. Imports that only the moved code used were removed.

### Screens

**`components/shared/CreateEventSheet.tsx` (new).** Layout:

- "Where are you trading?": up to 6 places (★ marks favourites), each showing its area and last times, then "+ Somewhere else";
- "Event name", "Starts" and "Ends": always shown, always required;
- "Add town or postcode": collapsed by default;
- "Which van?": only on trucks with more than one active van;
- the note "Customers will see this event and can order online.";
- buttons "Create and start" / "Cancel".

Defaults and errors:

- Start is now, rounded down to the quarter hour (D7).
- End is the place's last end if that is later than the start, else start + 3 hours, capped at 23:59 (D8).
- Field errors appear under their fields.
- The two overlap questions use your exact wording, and long event names wrap.

Scrolling and fit:

- The header is fixed, the form scrolls, and the buttons are fixed.
- The sheet is sized to the **visual viewport**, so "Create and start" stays above the iOS keyboard.
- **Added after the screenshots showed a problem:** on a 320px phone with the keyboard open, only about 25px of the form was visible. Below 480px of visible height the footer now goes compact: the note moves into the scrolling form, and Cancel sits beside "Create and start". The form then keeps about 100px.

Other screens:

- **`components/dashboard/NoEventBox.tsx` (new):** the amber box shared by Orders and Add order. It holds the message, "Select event" and "Create event now". It wraps rather than squeezing on a 320px phone. When disabled it shows why (offline / not signed in).
  - **Fixed in passing:** on a phone with no event selected, Add order used to show nothing (the box was `hidden sm:block`). It now shows the box.
- **`components/shared/EventPickerPanel.tsx`:** a new optional `createAction`.
  - **D6:** the "+ Create event now" button sits at the **top** when nothing approved is on today, else at the **bottom**.
  - The title, the approval summary and the top button are now **fixed above** the list. Only the list scrolls. Done and the bottom button are fixed in the footer. The card never exceeds 85dvh.
- **Dashboard page** (`app/(app)/dashboard/[token]/page.tsx`):
  - wires all three entry points: the list (via AddOrderPanel), the Orders box, and the dark event bar's no-event state. The bar's button shows from tablet width up; on phones the box just below carries it;
  - on success: the event is added to the lists and selected, then the toast **"Event created and started" / "Switch the kitchen screen to this event too."** shows for 7 seconds, then a refresh;
  - "Use {other}" selects the existing event; "Approve {event}" runs the existing approve path;
  - not shown in demo mode.
- **`components/ToastStack.tsx`:** a line break in a toast message now shows as a line break (`whitespace-pre-line`). No other toast changes.

### Languages

- 27 keys, in en-GB and all 48 language bases:
  - 24 under `kitchenModals.createEvent.*`;
  - `errorsKitchen.sign_in_to_create`, `event_details_invalid` (a select on the reason) and `event_overlaps`.
- en-US says "ZIP code" and en-CA "postal code" for the postcode fields, matching their existing overrides.
- Each file was re-read right before writing, and only keys were added.
- `split-messages` regenerated; `--check` matches (121 namespaces).
- The new keys are registered as new wording in `scripts/_messages-parity-1e.cjs`.
- I wrote the translations myself. The word for "event" matches each language's existing dashboard strings (for example 出店 in Japanese, 영업 일정 in Korean, 活動 in Chinese).

## 3 · Hard rules

- Pizzeria Gusto and Le Roi du Churrasco were not touched or read.
- No database reads or writes.
- No push or deploy, and no commit of this build.
- No landing-page or customer-facing changes. The only customer-visible effect is the intended one: a created event is public.
- No .env files opened.
- **SQL:** none was run this round, so there is none to show.
- `lib/whatsapp-classifier.ts`, `lib/whatsapp/upcoming-events.ts` and `scripts/whatsapp-approved-only-1.cjs` were already uncommitted from an earlier workstream. This build did not touch them.

## 4 · Files

**New:**
- `lib/events/create-event.ts`
- `components/shared/CreateEventSheet.tsx`
- `components/dashboard/NoEventBox.tsx`
- `docs/events-create-2/` (134 screenshots)
- this report

**Changed (code):**
- `app/api/dashboard/action/route.ts`
- `app/api/manage/route.ts`
- `app/(app)/dashboard/[token]/page.tsx`
- `components/dashboard/AddOrderPanel.tsx`
- `components/shared/EventPickerPanel.tsx`
- `components/ToastStack.tsx`

**Changed (messages):** `messages/*.json` (en-GB, 48 bases, en-US, en-CA) and the regenerated `messages/ns/*`.

**Harnesses re-pinned.** Each has a dated "RE-PINNED (events-create-2 …)" note explaining the change.

| Harness | What changed | Result |
|---|---|---|
| `scripts/schedule-graphics-places.cjs` | The insert, `resolveEventPlaceId` and the merge-rule imports are now read from `lib/events/create-event.ts`. The insert's new key `opened_at` is attributed to this build. W15/W16 variants re-aimed. | 270/270 |
| `scripts/event-types.cjs` | The creation-path checks read the helper. The dashboard path is "calls `insertTruckEvent`, no insert of its own". | 192/192 |
| `scripts/_messages-parity-1e.cjs` | The new keys registered as new wording. | 0 failed |

Leftovers from my events-overlap-2 commit were also fixed:

| Harness | Leftover fixed | Result |
|---|---|---|
| `scripts/event-types.cjs` | The approved-only auto-select lines; the time-based default is now `pickDashboardDefaultEvent` | (in the 192/192 above) |
| `scripts/us-rehearsal-fixes.cjs` | `openEvent` → `doOpenEvent` split | 64/64 |
| `scripts/us-polish-batch.cjs` | 5 → 7 event-menu refusals (Approve / Keep) | 46/46 |
| `scripts/money-sweep-parity.cjs` | The phone "📍 venue · times" line on Add order, taken out exactly once | 3038 identical |

## 5 · Checks run

**Route checks** (`ec2-routes.cjs` in the scratchpad): 85 passed, 0 failed. They run the real route on an in-memory Postgres, with the signed-in user stubbed.

| Area | What was checked |
|---|---|
| Who | Owner, manager and staff create. Token-only, token + the right PIN, and another truck's operator → 403 with nothing written. A wrong PIN → 401. Sign-in check failing → 503 retryable. |
| Validation | Missing name; missing start; missing end; end before start; end equal to start; date not today; a van of another truck; two vans with none chosen or an unknown one. Each → 400 with the right reason and words, and nothing written. Two vans with Van 2 chosen → stored on Van 2, slot capacity is Van 2's. No vans → van null. |
| Stored fields | Status open; `confirmed_at` = `opened_at` = now; source dashboard; auto_open false; auto_close from the truck (true, and false when the truck says so); today's date; trimmed name and town; the van; order-ready seed "seed"; no type. Deals seeded (b1 on, b2 off, the unavailable b3 skipped). D9: a new Places row is created and linked. A merged picked place stores its target. Another truck's place id is not linked. Exactly one `truck_events` insert. |
| Overlap | Approved overlap → 409 kind approved, naming it with its times, nothing written. Unapproved only → 409 kind unapproved. "Create anyway" creates and leaves the others alone. Back-to-back, finished-earlier and cancelled events do not ask. |
| `create_event_places` | 6 places at most; hidden and merged skipped; the order is favourite, then most recent, then name; last times only from traded (not cancelled or future) events; active vans; `can_create` true for a member, false for token-only; nothing written. |
| D11 | `update_event` with no id → 400 `event_id_required`, nothing written. |
| Manage unchanged | HEAD's `app/api/manage/route.ts` (bundled from `git show HEAD:`) against today's, on 5 inputs: typed new venue; picked merged place; "The Five Bells" matching an existing place; two vans with Van 2; a truck that auto-opens and does not auto-close. For each: same status and response keys, the same event row, and the same other writes in the same order (places, deals, capacity). The only difference is `opened_at`: absent before, an explicit `null` now, which is the same stored value. |

**Other checks:**

- **Rule / route / offline checks from events-overlap**, re-run against the changed route: eo2-unit 27/27, eo2-routes 46/46, eo2-drain (offline outbox) 7/7.
- **Other harnesses that read the changed files:** all pass.
  - event-pricing 139, reviews-weather-1 79, places-tab 98, private-events 204, weekly-post 251;
  - places-posts-gating 49, directions-link 23, languages-1 91, world-countries-1 178;
  - add-order-render, add-order-refresh, add-order-refresh-inputs, add-order-fit-message, cover-dot-own-window, dot-overlap-labels, slot-interval-grid-routing.
  - `capacity-one-source-1-live` needs a live demo token, so it was not run.
- **tsc:** clean.
- **ESLint:** every changed file has the same counts as HEAD; the three new files are clean.
- **split-messages `--check`:** matches.
- **Languages:** messages-parity 0 failed; translation-check structural 0 in all 48 languages.

## 6 · Screenshots — `docs/events-create-2/`

The screenshots are rendered from in-memory fixtures through the real components, with freshly compiled Tailwind.

- **Sizes:** laptop 1280×800, iPad 820×1180, phone 390×844, phone 320×568.
- **Languages:** en-GB and fr-FR.
- **134 files:**

| # | What it shows |
|---|---|
| 01 | The boxes: Orders "no event", "Approve an event to take orders", Add order, offline (disabled + reason), token-only (disabled + reason) |
| 01b | Add order with no event (the phone now shows the box) |
| 02 / 03 | The Change event list: 32–33 events over 12 dates, scrolled to the top and to the bottom. Nothing approved today → create button fixed at the top; approved today → fixed at the bottom above Done |
| 04–06 | The sheet empty; a place picked; a very long place name picked (wraps) |
| 07 / 07b | "Somewhere else" with the address open on a two-van truck, top of the form and scrolled to the fields |
| 08 | Field errors ("Add an event name", "Choose a van") |
| 09 | Keyboard open (visible height 780 iPad, 508 phone 390, 308 phone 320) — compact footer |
| 10 | Offline ("Connect to the internet to create an event.", button disabled) |
| 11 / 12 | Both overlap questions (the unapproved one with a very long name) |
| 13 | The toast, two lines |

Every screen is checked automatically:

- no raw key, "undefined" or NaN;
- no sideways scroll and no clipped text;
- the list card inside the screen, the list scrolling, Done and the create button visible and outside the scroll;
- the sheet inside the screen, with "Create and start" visible;
- the overlap question on screen.

Result: **0 problems.** I also looked at the key shots myself.

**Limit:** the shots are static renders. The keyboard shots model the keyboard as a shorter screen, which the height media query handles. The live iOS visual-viewport path (the same compact rule, driven from `window.visualViewport`) needs a real device; it is in the checklist. The dark event bar's new button is not in the shots, because the full dashboard page isn't rendered by this kit; it is in the checklist too.

## 7 · One failure from an earlier round

`scripts/time-dates-parity.cjs` fails 21 checks:

- 12 × "moved and no allowance names it": the new phone 📍 line on Add order;
- 9 × "C2 may move only at after0030": the approved-only default picks differently at some test moments.

**A clean copy of HEAD (via `git archive`) fails the same 21**, so these come from the committed events-overlap-2 work, not from this build. Re-pinning this harness's moment rules is outside this brief. I've left it as is and can do it as a follow-up.

## 8 · Click-through on localhost — test-truck (Pizza Kitchen)

**Before you start:** stop the dev server, run `rm -rf .next/dev`, then start it again. The new message keys otherwise show as raw keys. Sign in as a team member of test-truck.

1. **Nothing approved today.** Open the dashboard on Orders. The amber box shows "Select event" and **"Create event now"**. On a laptop or iPad the dark event bar also has the orange button.
2. Tap **Select event**. "+ Create event now" is at the **top**, fixed under the title, and the list scrolls beneath it. Close the list.
3. Tap **Create event now**. Check the sheet:
   - up to 6 places;
   - Event name / Starts / Ends visible;
   - Starts = now rounded down to the quarter hour.

   Tap a place: the name fills, and Ends becomes its usual end (or +3h).
4. Clear the name and tap **Create and start**: "Add an event name". Set Ends before Starts: "The end time must be after the start".
5. Choose **+ Somewhere else**, type a new venue such as "Click-through Green", open **Add town or postcode**, and fill them in.
6. **On an iPhone/iPad:** tap into the name. "Create and start" must stay above the keyboard, and the form must still scroll.
7. Tap **Create and start**. You should see:
   - the toast "Event created and started / Switch the kitchen screen to this event too.";
   - the event selected, with Add order ready on it;
   - in Select event, the event in today's group with ✓ Approved;
   - in Manage › Schedule › Places, a new place "Click-through Green".
8. **Overlap, approved:** with that event running, Create event now again with overlapping times. "Already trading at {it}?":
   - **Use {it}** selects it;
   - **Create anyway** makes a second one (cancel it afterwards, see below).
9. **Overlap, unapproved:** with only an unapproved event on today, create at overlapping times. "Approve {it} instead?":
   - **Approve {it}** runs the usual approve;
   - **Create new event** creates.
10. **Approved today:** in Select event, "+ Create event now" is now at the **bottom**, above Done.
11. **Offline:** turn the network off (devtools → Offline). Both buttons are disabled with "Connect to the internet to create an event."
12. **Not signed in:** open the dashboard link in a private window with the token only (PIN if set). The button is disabled with "Sign in as a team member to create an event."
13. **Manage unchanged:** in Manage › Schedule, add an event the usual way. It is created as before: approved, not started, no toast changes.
14. **Phone 320px** (devtools, iPhone SE): the boxes wrap cleanly, and the list and sheet fit with their buttons reachable.

**How to cancel the events you create:** on the dashboard, select the event → **Manage event ▾ → Cancel event**. Or in **Manage › Schedule**, open the event → **Cancel event**. Cancelled events drop out of the list and off the public page.

The new Places rows ("Click-through Green" etc.) can be hidden or merged from **Manage › Schedule › Places** if you don't want to keep them.
