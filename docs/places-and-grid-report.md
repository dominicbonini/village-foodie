# Places tab, Social posts, plan wording, the Event types grid clean-up, and one event-type control

**Branch `schedule-graphics` only.** No branch switch, no push, no merge, no deploy. I ran no SQL —
`supabase/migrations/20261015_places_tab.sql` was written and handed over, and **you applied it
mid-build** (21 places untouched, no pins, no pictures). Nothing read or wrote any live trading truck;
the scraper was never run. No card charge was created. One copy of each harness at a time; nothing
killed by name or pattern.

**Pre-build tree: `0ce4c83`.** Pinned by SHA in the harnesses, never as `HEAD`.

---

## Written for

Dominic, as the operator of this build and the person who runs the SQL and the localhost tests.

---

# 0 · The prompt, read back

Nothing arrived garbled. One instruction needed a decision rather than a choice — whether the **pin may
be Private** — and you confirmed it may (Option 1). Everything else was internally consistent.

One instruction in §3 could not be implemented as written and is named rather than faked: see §3.3.

---

# 1 · The tabs, and the old links

**Events · Event types · Places · Social posts**, in that order.

⛔ **"Weekly post" became "Social posts" and the section id did NOT change with it.** The id is what
`?section=` carries, and `?section=weekly` is in operators' bookmarks, in the setup wizard's links and
in four `onSectionChange('weekly')` calls inside `page.tsx`. Renaming the id to match the label would
have broken every one of them to change a word.

⚠️ **`?section=places` now lands on Places** rather than falling through to Events — which is what it
meant when it was written, before the pill was removed on 3 October.

`scripts/places-tab.cjs` §1 asserts the order, that every id the validator accepts is a pill and every
pill is accepted, and that **every `onSectionChange(…)` names a real section** — so a renamed id cannot
leave a dead caller behind.

---

# 2 · Social posts

| | was | is |
|---|---|---|
| toggle | "Week (7 days)" · "Single event", opening on Week | **"Single event" · "Weekly"**, opening on **Single event** |
| weekly heading | **twice** — a page `<h2>` and the card heading | once, the card's, in the event card's style |
| event copy | "HatchGrab adds those **three** for each event" | "…adds **those** for each event" |
| per-place pointer | — | **"A different picture for one place? Add it in Places."** → `?section=places` |

🔴 **Single event is the default because it is the common job** — one post per pitch, every week, where
the weekly poster is made once and rarely touched. ⚠️ **"Week (7 days)" lost its parenthetical:** it
explained a format nobody was confused about and made the two options read as different *kinds* of
thing rather than two choices of one kind.

⛔ **The duplicate heading was a real duplicate.** `SetupScreen`'s card rendered "Set up your weekly
post" directly under a `text-lg font-black` page heading saying the same words. The outer one is gone;
the card's now matches "Set up your event post" exactly. The editing screens carry no heading at all,
as they already did.

---

# 3 · The Places tab

## 3.1 No second implementation — that is the design

The tab is a **composition** of the existing pieces: `usePlaces` (load + seed + optimistic favourite),
`PlaceList` (search, FAVOURITES/ALL PLACES, the star), `PlaceDetail` (the five fields). "Tidy up
places" in Add event is untouched and still mounted, calling the same components and the same `sg_*`
actions.

`scripts/places-tab.cjs` §4 asserts the tab **defines no list, no detail and no loader of its own**,
and that `TidyUpPlaces` still exists and is still mounted. ⚠️ **So the tab seeds** — `sg_places` seeds
before it answers, and opening the tab is now the deliberate act that needs the list.

## 3.2 The pin, and the read order that is the whole feature

`truck_places.usual_event_type_id`: **NULL is "Automatic"**, which is the existing rule — the newest
event at this place supplies the type (§70.3). A type id pins it.

🔴 **`usual_for_venue` reads `pin ?? the existing rule`, in that order.** The other way round, the pin
would be unreachable for any place that has ever had an event — which is every place a truck actually
trades at — and the control would save and then change nothing.

⛔ **THE HARNESS CAUGHT EXACTLY THAT.** The column, the migration, the payload and the save action were
all built before this read was wired. My first version of the check was `/usual_event_type_id/.test(route)`
— "the column name appears somewhere" — and it **passed**. Asserting the **order** failed, correctly,
and that is what found the gap.

⚠️ **The pin may be Private**, as you confirmed. It is not silent: Add event opens the purple panel with
the full explanation before anything is saved, and the automatic rule already behaves this way (a place
whose last event was private pre-selects Private). The pin only makes it deliberate.

⚠️ **A foreign type id resolves to NULL rather than erroring.** The database cannot enforce the tenant
scope — a composite FK would need `event_types (id, truck_id)` unique, which it is not declared as — so
the route validates it, and `20261015`'s own comment says so out loud rather than leaving the missing
constraint to look like an oversight.

## 3.3 ⚠️ One thing in §3 could not be built as written

The brief says the Usual event type select offers **"Automatic (…), then Standard, Private and the
truck's types"**. Automatic and Standard cannot both be stored:

- there is **one column**, and `NULL` already means **Automatic**;
- "pinned to Standard" means *"always Standard here, whatever happened last time"* — a different
  instruction from *"follow the history"*, and there is no value left to express it.

**What I built:** the option is in the list, and choosing it **clears the pin** — i.e. it is Automatic.
The row's helper line says which behaviour is active, and `scripts/places-tab.cjs` asserts the mapping
so it cannot drift silently. ⛔ **I did not invent a second column for it.** That is a schema decision,
and it is yours; if you want "pinned to Standard" as a distinct state, say so and it is one nullable
boolean (`usual_type_is_standard`) or a sentinel — I would recommend the boolean, because a sentinel
uuid in an FK column is the kind of thing that outlives the person who chose it.

## 3.4 Pictures — two kinds, and the pane says which

| | |
|---|---|
| **The post picture** | `truck_places.event_bg_path` + width/height + `event_layout`. ONE per place, with text positions on it. Replace and Text positions **link to the existing flow** in Social posts › Single event |
| **Extra pictures** | `place_pictures` (new). As many as they like, for the truck's own use |

⛔ **AN EXTRA PICTURE CAN NEVER REACH A POSTER, AND THAT IS WHY IT IS A SEPARATE TABLE.** A second row
in the place's own picture column could not express "this one is not for a poster", and the renderer
would have to learn a flag it has no business knowing. `scripts/places-tab.cjs` §3 searches
`lib/weekly-post`, the weekly-post route and **both** post components for the table name and fails if
any of them reads it — because a parking map behind Friday's dates is a valid image and nothing would
fail on its own.

🔴 **AND THE PANE SAYS IT IN WORDS** — *"For your reference only… These are never used on a post."* The
code proof only catches the mistake after somebody has made it; the sentence stops it being made.

**The upload is three steps, in the safe order:** a signed URL whose **path is built server-side and
starts with the truck id** (a signed upload URL is authority over exactly the path it names); a direct
PUT to storage, so a 10MB file never passes through a route handler; then a save that **re-reads the
real bytes from storage** rather than trusting the browser's number. 10MB is capped in the handler and
in the table's CHECK. The save also re-checks the path belongs to this truck **and this place**.

⚠️ **Remove deletes the storage object BEFORE the row.** The other order leaves a row pointing at
nothing — a broken thumbnail the operator cannot remove. A failure between the two leaves a wasted
file, which is recoverable. Asserted by source order.

## 3.5 Events here

Next upcoming and recent past, each past one with its order count, grouped through `placeForEvent` so a
**merged** place's events land on its target. ⚠️ **Private events are shown, with a chip** — this is the
truck's own screen, and the redaction is a property of the public feeds (§73), not of the data.

---

# 4 · The Event types grid

Everything in the brief landed. The table is in §70.13 of the manual; the three findings worth your
attention are below.

## 4.1 The faded rule was worse than you saw

You reported the rule above a category heading as "looks broken". It was — and more so than visible: I
had given the **label cell** `border-slate-300` while its **value cells** kept `border-slate-100`, so
it drew a dark stub that stopped at the first divider. Both sides now have **no horizontal rule at
all**; the vertical dividers still run through unbroken, which is asserted directly (`catValueDivided`).

## 4.2 Rows grow; nothing needed to

`ROW_H` is a **minimum** now — every body cell sets `minHeight`, the grid's rows are `auto`. Measured,
both engines, 1440 and 820:

| row kind | height |
|---|---|
| section band | 28px |
| **ORDERING / link & QR row** | **36px** |
| setting rows, sub-rows, price rows | 36px |
| ITEM PRICES band | 28px |
| category heading | 22px |
| item rows | 28px |

So the answer to the concern is: **nothing needed to grow.** At 260px with `leading-tight` (17.5px),
"Take orders by private link and QR code" fits inside 36px either way — two lines would be 35px, which
is why that line-height was chosen. Nothing is clipped and nothing ellipsises at any width in either
engine. Item names sit **12px** in from their category heading, measured as a left-edge difference.

⚠️ **390 is absent from that table, and not because I skipped it.** Below `md` the columns scroller is
`hidden` and the phone picker is shown, so every grid row measures 0. My first run of the new pass
failed 13 times at 390 against a screen that was correct; the pass is gated to `w >= 768`, the same
gate the existing grid assertions use.

## 4.3 The no-op typed price was worse than "doesn't change"

🔴 The line was `if (toPence(next) !== toPence(typed ?? NaN)) onType(next)`. On an untyped cell `typed`
is null, so the comparison was against **NaN** — unequal to everything. **Pressing a price and clicking
away always stored a typed price identical to the calculated one.** A blue box the operator never asked
for, on a cell they only looked at, with the × the only way back.

✅ The comparison is now against the **rule-only** price — `applyPriceRule`, not `priceForItem`, which
honours the typed value and would have compared a number with itself. Both of your cases fall out of
one rule: press-and-leave creates nothing; typing the rule's own number **clears** an existing typed
price. Escape still abandons. No data fix, as instructed.

---

# 5 · One event-type control — and the bug it closes

## 5.1 The bug had teeth

🔴 **Add event had TWO controls for one fact**, and the save read **the tick**. Choosing **Private** from
the dropdown produced a **public event carrying the Private type** — silently, with the address on the
map and the venue on every feed, while the screen said "Private" throughout.

✅ **One control owns it.** A pill row — Standard · 🔒 Private · the truck's types in the grid's order —
**straight after Date, before Venue**, exactly one selected, with `is_private` read off the **same
value** the type is. They cannot disagree.

⛔ **The position is load-bearing.** Selecting Private is the operator saying "the address I am about to
type is not for the public", so they meet the question *before* typing it. That was the tick's own
reasoning and it transfers.

⚠️ **The field is now drawn even for a truck with no custom types.** It used to return null when the
list was empty — right when the only options were Standard and the truck's own. Private is always a
choice, and hiding it was the far side of this very bug: the tick existed *because* the dropdown could
not express Private.

## 5.2 The §7 regression, and the fourth builder

`docs/private-events-report.md` §7 recorded three Edit buttons building the form inline, fixed with one
`editFormFor`. **A fourth was missed, and it was the dangerous one:** `openForFix` — the path a
**scraped private event** takes, because the bridge never gives such an event times, so "Approve"
always lands there. With `is_private` absent from the form, pressing Save **published the address**.

🔴 **And the pill needed the same treatment from the other side.** A scraped private event has
`is_private: true` and `event_type_id: null` — the type is deliberately not issued until confirm. Seeding
the pill from `event_type_id` alone would have selected **Standard**, and because the save derives
privacy from the pill, approving would have made it public. `seedTypePill` reads `is_private` first.

Both are asserted, and the §7 variants (V15/V15b) still pass.

## 5.3 The rest of §5

- **The approval card** uses the same `<EventTypeSelect>`, with Private pre-selected for a scraped
  private event and the missing-times prompt when Private is chosen with no times. The confirm sends
  what the pill shows, through `applyPrivacy` — the one writer.
- **The dashboard card** has Private in its list and **confirms in both directions**, with sentences
  about the map and the link rather than about columns. ⚠️ They appear **only on a crossing** — Market →
  Festival says nothing about privacy — and the crossing is decided from `is_private`, never from the
  current type's kind.
- **The panel's two sentences are one block, then the name field**, as you asked on 5 October.
- **The form's last three native selects** (start/end hour and minute, Van) are the shared `Select`.
  ⛔ WebKit renders a native `<select>` at 23px whatever its padding says (§65), so on an iPad these
  were half the height of every field around them.

---

# 6 · Plan wording — one row became two

`'Event & festival pricing' · Max · coming_soon` was **one row for two products on two tiers**, and a
single row could not say that: Pro would have had to be `false` (hiding a feature a Pro truck pays for)
or `true` (promising Max's pricing to Pro).

| Row | Tier | Key |
|---|---|---|
| **Private events** — "Add private events that don't show on the map, with their own private ordering link and QR code." | Pro and above | `private_events` |
| **Custom event types & pricing** — "Create your own event types, with custom prices and settings for events and festivals." | Max | `event_types` |

🔴 **Both are hard `true` now, which ADDS two checks rather than removing them.**
`findPlanParityViolations()` inspects cells that are hard `true` and fails when `canAccess` disagrees; a
`'coming_soon'` cell is explicitly exempt. Both pass, because I added the two `ROW_FEATURE_MAP` entries
— **without them the guard would `continue` past the rows and the table could promise Pro a Max feature
with nothing failing.** The parity harness passes (37 checks).

**Every place changed:**
1. `lib/plan-features.ts` — the two rows, and the two `ROW_FEATURE_MAP` entries.
2. `app/landing/page.tsx`, **Max card** — the bullet, now "Custom event types & pricing", **un-badged**.
3. `app/landing/page.tsx`, **Pro card** — a new bullet, "Private events with their own ordering link".

⚠️ **No price and no plan logic changed.** The pricing-card bullets are hand-written twins of the matrix
rows and nothing checks them against each other — the file's own warning — so leaving a "Coming soon"
badge on one would have contradicted a `true` cell in the table on the same page. ⚠️ **Billing shows the
same `FEATURE_SECTIONS` table**, so it picked both rows up with no separate edit; there is no third
hand-written list.

---

# 7 · What was run

| | |
|---|---|
| `scripts/places-tab.cjs` (**new**, registered) | ✅ **53 passed** |
| `scripts/private-events.cjs` | ✅ **201 passed · 24/24 variants caught** |
| `scripts/event-types.cjs` | ✅ **156 passed · 42/42 variants caught** |
| `scripts/event-types-render.cjs` | ✅ **1790 measurements · 0 failed**, Chromium **and** WebKit, 1440/820/390 |
| `scripts/schedule-graphics-places.cjs` | ✅ **257 passed** |
| `scripts/weekly-post.cjs` | ✅ **207 passed** |
| `scripts/event-pricing.cjs` | ✅ **104 passed · 14/14 variants caught** |
| `scripts/whatsapp-golive-parity-harness.cjs` | ✅ **37 passed** (the plan-parity guard) |
| `npx tsc --noEmit`, `npx next build` | clean |
| ESLint, added lines | **no new error anywhere**; the manage page back to its **283** baseline, the dashboard page to **83**, every new file clean |
| `run-harnesses.cjs --dry-run` | all **90** listed files pass the source screen |

## 7.1 Four more "a check that cannot fail is not checking"

🔴 **`showItems: true` HAD NEVER BEEN PASSED to the render harness.** No category row and no item row
had ever been drawn — so the `price-item` and `category` height assertions, which are written guarded
(`!rowHeights['price-item'] || …`), had been **passing vacuously since they were written**, and the four
new ones for the category heading and the item indent would have done the same. There is now a
dedicated items-open pass that asserts the rows are **present** before measuring them. That is how the
22px/28px figures in §4.2 became real numbers rather than absent ones.

🔴 **V17 had silently stopped mutating** — the second occurrence of this failure mode here (V29 was the
first). It replaced a literal containing `title={r.label}`, and the hover title went when labels started
wrapping. `String.replace` of an absent needle returns the string unchanged, so the variant mutated
nothing and reported "MUST FAIL BUT PASSED" against correct code. It now **finds** its insertion point
and **throws** if it is absent.

⚠️ **A count of occurrences is not a claim.** "`justify-center` appears ≥ 7 times" went red because
removing the USED BY row took two centred cells with it — a row deletion turning a *centring* check
red. It asserts the property now.

⚠️ **Prose decided whether four assertions matched.** A bounded `[\s\S]{0,300}` could not bridge an
explanatory comment longer than 300 characters; three others matched their own notes quoting the old
string (`Week (7 days)`, `Set up your weekly post`, `<select>`). `codeOf` is the rule for **every**
source-text claim, and this build re-learned it four times in one day.

## 7.2 Two failures that were not this build's

`scripts/schedule-graphics-places.cjs` had not run since the per-van cash work **two prompts earlier**
— §72.2's rule is to run only the harnesses a build touches — so two of its failures came from that
build, not this one:

- a new Settings sub-label, **"Following your truck setting."** (the per-van cash row's helper). Allowed
  by name, with the reason; the `removed` list is empty, which is the half of that check proving no
  existing wording moved.
- the shared **`Toggle`** signature and track gaining `compact`. Both `movedEdits` entries updated —
  and both **caught** the change, which is what that mechanism is for.

⚠️ I confirmed neither was mine by stashing this build's page edits and re-running. **The rule trades
latency for time, and this is the latency** — worth knowing before the deploy sweep.

## 7.3 One narrowing I made to a guard, stated plainly

`NO LINE OF THE PAGE WAS LOST` now ignores lines that are **only JSX punctuation** (`>`, `)}`, `/>`…).
Converting a multi-line `<select … >` to a self-closing `<Select … />` leaves no line holding the
opening tag's bracket, so three bare `>` lines "disappeared" — and the only way to list them in
`movedEdits` would have been three entries whose `was` is one character, matching hundreds of places.
⛔ **It is a character-class narrowing, not a length one:** anything containing a letter, a digit or a
quote still counts, so a deleted `</div>` is still a deleted line. The 189 lines that check was built
after were a confirmation modal, two billing modals, an emoji picker and a card — not one of them
punctuation. Every other deliberate edit got its own `movedEdits` entry: **22 of them**, each carrying
its new form, so a later deletion starts failing rather than going quiet.

## 7.4 One dead component, reported rather than tolerated

`EventTypeDashboardControl` (in `components/manage/EventTypes.tsx`) is exported and **mounted nowhere** —
the "This event" card replaced it, and `scripts/event-types.cjs` asserts the dashboard does not render
it. It still contains a native `<select>`, which is why my "no native dropdown left" assertion is scoped
to `EventTypeSelect` rather than to the file. ⛔ **I did not weaken the check to accommodate it and I did
not delete it:** it is the only remaining way back if the card ever has to be rolled back. Your call.

---

# 8 · The SQL

In `supabase/migrations/20261015_places_tab.sql`, and in the chat message with this report as three
fenced blocks. **You have already run all three** — §2 returned 21 places untouched, 0 pins, 0 pictures.

---

# 9 · Test list — Pizza Kitchen only

⛔ **Never Pizzeria Gusto or any other live trading truck.** Pay-at-hatch orders only.

**The tabs**
1. Schedule shows four pills: **Events · Event types · Places · Social posts**.
2. Open an old link `…/manage/<token>?section=weekly` — it lands on **Social posts**. Then
   `?section=places` — it lands on **Places** (it used to fall through to Events).

**Social posts**
3. The toggle reads **Single event · Weekly**, with **Single event** selected. Switch to Weekly: the
   heading **"Set up your weekly post" appears once**, at the same size as "Set up your event post".
4. On the event side, the hint reads "…adds **those** for each event", and under it
   **"A different picture for one place? Add it in Places."** — press Places; it opens the tab.

**Places**
5. The left pane lists your 21 places with a thumbnail, name, town and Next/Last. Search by name, area
   and postcode. Star one — it moves to FAVOURITES with no reload.
6. **+ Add place** → type a name → Add. It appears and is selected.
7. Right pane: the name, **"used N times"**, the five fields (Name on posts, Address full width), and
   **Usual event type**. The first option reads **"Automatic (Standard — last used here)"**.
8. Pin **Market**. Then Add event, pick that place → **Market is pre-selected**. Set the pin back to
   **Automatic** → Add event follows your history again. ⛔ *This is the one the harness caught: before
   the fix, the pin saved and changed nothing.*
9. **Pictures for this place:** the Event post picture row links to Social posts. Under **Your own
   pictures**, add a PNG — it appears with its size; **Download** it; **Remove** it (it confirms).
   ⛔ Then check Social posts › Single event for that place: your picture is **not** offered as a poster
   background.
10. **Events here** lists the next upcoming and recent past, with order counts. A private event shows
    with a purple 🔒 chip and its real venue — this is your own screen.
11. **Hide** a place → it leaves the list and the footer reads "1 hidden place · Show". Press Show,
    select it, **Restore**.
12. Add event → **Tidy up places** still works, and edits made there show on the tab (same actions).

**The grid**
13. Event types: **Private is the column straight after Standard**, on every truck. Its ⋯ menu offers
    only "Match Standard". Move left/right on a custom type never moves Private.
14. Row labels are **regular weight** and **wrap** — "Take orders by private link and QR code" is fully
    readable with **no "…"** anywhere. Category headings (PIZZA, DRINKS) are **near-black and bold with
    no line above them**, and item names are **indented** under them.
15. ITEM PRICES: the pill reads **"Show prices" / "Hide prices"**, with no count, and the
    "Press a price…" hint is gone.
16. Price change: the options are **+ £ · + % · − £ · − % · Set each price myself**. Choose a £/% one →
    Amount and Rounding appear. Choose **Set each price myself** → they go, and **the item prices open
    by themselves**.
17. ⛔ **The no-op test:** press an item's price in a type column and click away **without typing**. No
    blue box appears. Then type the exact calculated price → still no blue box (and an existing one is
    cleared). Press one, type something else, press **Escape** → nothing saved.
18. With a rule on, each type-column price shows **"(+£1.30)"** after it, in pounds, smaller and
    lighter — nothing where the price is unchanged, and **nothing in the Standard column**.
19. Nothing on the grid is faded. Rounding showing "None" looks like any other value.
20. There is **no USED BY row**. Delete a custom type → the confirm reads
    **"N upcoming events use <Type>. They'll go back to Standard."** (or "No upcoming events use …").

**One event-type control**
21. Add event: after **Date** and before **Venue**, a pill row — **Standard · 🔒 Private · your types**.
    Exactly one is selected, and the usual type for the chosen place is pre-selected with
    "<Type> is usual for this place." under it. ⛔ **There is no separate "Private event" tick.**
22. Press **Private** → the purple panel opens directly below with the two sentences **together** and
    the Event name field under them. Press **Standard** → it closes.
23. Save as Private → the row gets the chip and **Link & QR**. ⛔ **Now press Edit, change only the end
    time, and Save** — it must **still be private**. *(This is the regression in §5.2.)*
24. The hour, minute and **Van** boxes are now full height — check on an iPad or Safari; they used to
    render at 23px.
25. Dashboard › This event: switch the type to **Private** → the confirm says the address and the map
    are hidden. Switch **away** → it says the address will show and the link will stop working. A
    Market → Festival switch shows **neither** sentence.

**Plans**
26. The landing page's **Pro** card lists "Private events with their own ordering link"; the **Max** card
    lists "Custom event types & pricing". Neither is badged "Coming soon", and the comparison table
    lower down shows **Private events** as Pro + Max and **Custom event types & pricing** as Max only.

---

# 10 · Open, and named rather than hidden

- **"Pinned to Standard" is not a distinct state** — §3.3. One nullable boolean would give it one; your
  decision.
- **The "Automatic (…)" label always names "Standard"** as the current resolution. `sg_places` does not
  return the last event's TYPE, so the label states the honest fallback rather than guessing. ⛔ It is a
  **label only** — the pre-selection is resolved server-side (`pin ?? the rule`), so a wrong label is a
  parenthetical that reads oddly, never an event with the wrong type. One more field on `sg_places`
  would make it exact.
- **`EventTypeDashboardControl` is dead code** — §7.4.
- **The approval card's Private badge** is the pill row itself; the pending card does not also draw a
  separate chip. The server accepts and applies everything §5 asks for.
- **The type list in Add event loads when the Schedule tab becomes active.** If an operator opens the
  modal before it arrives, the pill row shows Standard alone for a moment. Moving it to the modal's own
  open would be one effect; it has not bitten in testing but it is the kind of thing that bites once.
