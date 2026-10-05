# Event types — stage 2b: the modal, offline protection, and the "This event" card


> ⛔ **SUPERSEDED IN PART, 5 October 2026.** The "This event" card this report describes is **deleted**
> — it was never approved, and what it did was move five controls away from where operators knew them.
> Every one is back at `origin/main`'s position; see `docs/dashboard-cleanup-report.md` and the manual's
> §70.7. ⚠️ **Two screenshots this report links are gone with it**
> (`docs/screenshots/event-types/this-event-card-{before,after}.png`), because the harness that
> generated them no longer builds that fixture. The reasoning below is kept as the record of what was
> built and why it was reversed.

**Branch:** `event-types` (confirmed with `git branch --show-current` before every commit).
`main` and `schedule-graphics` untouched. **Nothing deployed.**
**No SQL was run.** One migration is written and reproduced below for you to run by hand.
**Village Spice / Pizza Kitchen only.** Pizzeria Gusto was not touched, read or used for any check.
No keys printed.

**Nothing in the brief arrived garbled.** Four places where the brief could not be followed literally
are recorded as findings with the reason — none of them is one instruction contradicting another, so I
have not stopped. They are flagged in §0.

---

## 0 · 🔴 FOUR THINGS I COULD NOT DO LITERALLY, AND WHY

1. **The Dashboard2 board shows a Prices row and a "Prices for this event" sheet.** The brief says
   *"Do NOT add a Prices row yet"*, so there is none. The board and the brief disagree; I followed the
   brief. (There is also no per-event price mechanism to drive one — `event_price_overrides` does not
   exist, per the investigation report.)
2. **"Writing `event_deals` … through the existing per-event deal action" was not possible.** The
   existing action is `update_event_deal` in `/api/manage`, and that route runs `resolveTruckAccess`,
   whose own note records that *"token-only access no longer resolves to 'owner'; resolveTruckAccess
   refuses it outright"*. The dashboard authenticates with token + PIN against `/api/dashboard/action`
   and has no session user, so a call to that handler would be refused. **The WRITE is reused verbatim**
   — the same upsert, the same columns, the same `overridden: true`, the same `onConflict` — in a new
   `set_event_deal` action on the route the dashboard can actually reach. §4.3.
3. **The auto-reject delay is NOT offered on a type.** The brief says to offer *"exactly the choices
   that control offers"*, and that control offers a delay. But the only thing that ACTS on the delay is
   a plpgsql function (`claim_order_for_auto_reject`, 20260819) which resolves it as
   `coalesce(e.offline_auto_reject_mins_override, v.offline_auto_reject_mins)` and cannot read a
   TypeScript resolver. A delay on a type would display and do nothing — the exact failure I changed
   the heartbeat monitor to avoid. **The column exists** (so the later stage needs no migration) and the
   resolver resolves it; only the type UI withholds it. The per-event delay still works, because the
   function does read the event override. The SQL to finish it is in §3.5, unrun. 🔴 **This is a
   decision I am asking you to confirm.**
4. **Collection times in the card hands over instead of editing.** §4.4.

Also worth knowing: **`offline_auto_reject_mins` and `offline_auto_reject_mins_override` have no
migration in this repository.** Only 20260819's function references them. They clearly exist in
production (the dashboard reads and writes them), but the DDL is not here — which is why I would not
add them to the dashboard's named `truck_events` select (§3.4).

---

## 1 · THE EVENT TYPES SCREEN IS NOW A MODAL (TypesModal board)

**It was a full-screen panel with `minmax(150px, 1fr)` columns, and the controls were in the LABEL
column.** So every type column narrowed as types were added, and a row read
`Buzzers [switch] | On | On | Off` — with the switch belonging to no column at all. That is the defect
this rewrite exists to fix.

| | Before | Now |
|---|---|---|
| Shape | full-screen panel | **centred modal, `max-w-[1000px]`, `max-h-[92vh]`** |
| Type column | `minmax(150px, 1fr)` — shrinks | **fixed `230px`** |
| Overflow | the grid in a scroller, panel full width | **the COLUMNS scroll; the dialog never grows** |
| Controls | in the label column | **in that type's own column, on the row its name is on** |
| Rename/move/delete | four links under every column | **a ⋯ menu on each type's header** |

Measured, not claimed: at 1440 with six types the grid is **1810px inside a 1000px dialog**, the
columns scroll, a type column measures **230px**, the label column **200px**, and the first control's
box starts at or after the label column's right edge.

### 1.1 "Same as Standard" is a real state, on both control kinds

- **Dropdowns** — it is the first option (`<option value="">Same as Standard</option>`, and
  `{ value: '', label: 'Same as Standard' }` first in the offline list).
- **Switches** — there is no third position, so: a **greyed switch** (`opacity-45`) labelled
  "Same as Standard". Tapping it sets an explicit On/Off. Once explicit, a small **"Same as Standard"
  link** beside the value returns it to NULL. 🔴 Without that link a switch would be a one-way door
  out of inheriting — the state every type starts in.

Standard's column is **read-only** and shows Standard's actual value, not a dash — "same as Standard"
is only useful if you can see what that is without looking across. **"Set per van"** where the vans
disagree, rather than picking one and presenting it as the truck's setup.

---

## 2 · NEW EVENT TYPE (NewType2 board)

A **Name** field and four **name chips** — Festival, Pub, Market, Private hire. A chip fills the name
field, which stays editable, and **does nothing else**. The line under them is the board's:

> Tap a name or type your own. It starts exactly like Standard. Change anything after.

**Every new type starts with every setting NULL, whichever chip was tapped.** The first build's chips
were *suggestions* carrying pre-filled values, and that was wrong twice:

1. **It guessed the truck's service for them.** "Festival" means long queues to one truck and a quiet
   afternoon to another. A type arriving with three settings already changed is a type they must UNDO
   before it is honest — and nothing on screen said which three.
2. **It made the chip matter.** Two trucks tapping the same word got different starting points.

`blankTypeValues()` is the only starting state, and `create` has no other source for one. Asserted,
including that `TYPE_SUGGESTIONS` is gone so nothing can still read values off a chip (**V15**).

---

## 3 · OFFLINE PROTECTION ON TYPES

### 3.1 How it is modelled today — read first, as asked

| Layer | Switch | Mode | Delay |
|---|---|---|---|
| Van | `truck_vans.auto_pause_on_offline` | `truck_vans.offline_protection_mode` (`20260818:29`) | `truck_vans.offline_auto_reject_mins` |
| Per event | `truck_events.offline_protection_override` (`20260602:2`) | `truck_events.offline_protection_mode_override` (`20260818:45`) | `truck_events.offline_auto_reject_mins_override` |
| Writer | `set_offline_protection` (`app/api/dashboard/action/route.ts:2582`) — all three, each *"optional and independent"* |

**The Settings › Kitchen control** (`app/manage/[token]/page.tsx:11496-11600`) offers: a **switch**;
then, only when it is on, a **mode** as two radios from `OFFLINE_PROTECTION_MODES`
(`Pause Online Ordering` / `Keep taking orders, confirm them yourself`); then, only for the second
mode, a **delay** from `OFFLINE_AUTO_REJECT_OPTIONS` (5/10/15/20/25/30, default 15), which has
**no "Off"** — *"without one an order can sit indefinitely while the customer is never told it was not
accepted"*.

### 3.2 What a type offers

**One dropdown** — the board's shape, and one row because a three-row offline section inside a 230px
column would dwarf every other setting:

`Same as Standard` · `Off` · `Pause Online Ordering` · `Keep taking orders, confirm them yourself`

The two mode entries are **mapped from `OFFLINE_PROTECTION_MODES`**, so this screen and Settings ›
Kitchen cannot word them differently. It writes **both** columns, so "Off" (`offline_protection: false`)
is never mistaken for "inherit" (`null`). The delay is withheld — §0.3.

### 3.3 One pure function, and every reader through it

`resolveOfflineWithType(event, type, van)` in `lib/event-types/resolve.ts` returns
`{ enabled, mode, autoRejectMins }`, each `event ?? type ?? van`.

🔴 **Three independent chains, not one** — the shape the feature already has: `set_offline_protection`
treats the mode and the delay as *"optional and independent"*, so an event may override the switch and
inherit the mode. Resolving them as a unit would invent combinations no screen can produce.

⚠️ The mode is resolved **even when the switch is off**. `truck_vans`'s comment says the mode is
"ignored entirely when the switch is OFF" — ignored by the *monitor*, which is about who acts on it.
The screens show the stored mode so that switching protection back on does not silently change what it
will do.

⚠️ The delay's last link is **`null`, not a default**. A van nobody touched stores NULL and nothing
auto-rejects for it; inventing 15 would start rejecting orders for every truck that never asked
(**V14**).

**Every reader, with file:line:**

| # | Reader | File:line | Before → after |
|---|---|---|---|
| 1 | Dashboard client, the switch | `app/dashboard/[token]/page.tsx:~543` | `eventOfflineOverride!==null?…:vanAutoPause` → `resolvedOffline.enabled` |
| 2 | Dashboard client, the mode | same block | `eventOfflineModeOverride??vanOfflineMode` → `resolvedOffline.mode` |
| 3 | Dashboard client, the delay | same block | `eventAutoRejectOverride??vanAutoRejectMins` → `resolvedOffline.autoRejectMins` |
| 4 | **Menu API — the customer pause gate** | `app/api/menu/[truckId]/route.ts:~277` | the inline `!== null ? :` → `resolveOfflineWithType(...).enabled`, with a probed `readEventType` |
| 5 | **heartbeat-monitor — the thing that ACTS** | `supabase/functions/heartbeat-monitor/index.ts:~96,~113` | the type now sits between event and van, via an `event_types!event_type_id` embed |

🔴 **The monitor had to change, and its chain is a second copy by necessity.** It is a Deno edge
function and cannot import `lib/` — which is why the mode chain was *already* duplicated there before
event types existed. A monitor that ignored the type would pause a festival the truck had told it not
to; the type would be a setting that displays and does nothing. The resolver is the **owner** of the
order, and `scripts/event-types.cjs` asserts the monitor's two expressions still match it, so the
copies cannot drift silently.

**Readers deliberately not changed:** the plpgsql `claim_order_for_auto_reject` (§0.3 — it is the
delay's only consumer and cannot read the resolver).

### 3.4 An untyped event is byte-identical — proved, not asserted

`scripts/event-types.cjs` §1d-ii compiles **the pre-build tree** and compares. The baseline is the
three inline expressions **read from its source**, so the comparison is against what actually ran:

```
✓ the before tree really did resolve all three offline values inline (the premise of 1d-ii)
✓ OFFLINE PROTECTION is byte-identical across 252 inputs — switch, mode and delay
✓ an out-of-vocabulary mode and an out-of-range delay are coerced, not passed through
```

Two cases are *allowed* to differ and are named rather than hidden: the before tree did not validate
the mode or the delay, and the resolver does. That is deliberate hardening, and the second assertion
holds it to a direction.

⚠️ **I did not add the three offline override columns to `app/api/dashboard/route.ts`'s named
`truck_events` select.** That file's own comment records what one absent column does there — PostgREST
answers 42703, the statement fails, and the operator's board goes blank — and
`offline_auto_reject_mins_override` has no migration in this repo. The client already reads all three
in its own separate (safely failing) query, so the card computes the "THIS EVENT" flag there with the
same `offlineIsHandChange`.

### 3.5 The migration

`supabase/migrations/20261010_event_types_offline.sql` — additive, idempotent. **NOT RUN.** SQL and
verification selects in §8.

**Three columns, because the control has three choices**, each mirroring the per-event override it
resolves against. Not one `jsonb`: the three are read by three chain links, the mode's CHECK is worth
having, and the columns they shadow are three separate columns.

**To finish the delay later** (not run, not in the migration — it replaces a function that rejects
customers' orders, which should be its own build):

```sql
-- NOT RUN, NOT PART OF 20261010. The two coalesces in claim_order_for_auto_reject would become
-- three-way, with a left join to event_types:
--   left join event_types t on t.id = e.event_type_id
--   ... coalesce(e.offline_auto_reject_mins_override, t.offline_auto_reject_mins, v.offline_auto_reject_mins)
```

---

## 4 · THE DASHBOARD "This event" CARD (Dashboard2 board)

`components/dashboard/ThisEventCard.tsx`, mounted from **one line** in
`app/dashboard/[token]/page.tsx`.

### 4.1 🔴 EVERY DASHBOARD CONTROL THAT MOVED OR IS NEW — the list for your approval

**This screen is used live by Pizzeria Gusto. Nothing here is deployed.**

Screenshots (renders of fixtures built from the real class strings — *not* captures of a running
dashboard, which would need a database and a live truck):

- `docs/screenshots/event-types/this-event-card-before.png` — the five controls as separate cards
- `docs/screenshots/event-types/this-event-card-after.png` — the one card
- `docs/screenshots/event-types/event-types-modal.png`
- `docs/screenshots/event-types/new-event-type.png`

| Control | Before | After | Writes | Lost? |
|---|---|---|---|---|
| **Offline protection** (switch + 2 radio modes + delay) | first card in Kitchen tab | **card row: one dropdown (Off / the two modes), the ⚠️ instruction beneath it, the delay indented under it** | `offline_protection_override`, `_mode_override`, `_mins_override` | nothing — the ⚠️ instruction, the mode labels and the demo rule all travelled |
| **Remind me to add a buzzer** | its own card | **card row, switch** | `truck_events.buzzer_prompt` | nothing. Still hidden when the van has no rack |
| **Order-ready step** | its own card | **card row, "“Mark ready” step", switch** | `order_ready_override` | nothing |
| **Do you take cash?** | a child row inside the "Separate paid step" card | **card row, switch** | `takes_cash_override` | nothing. 🔴 **The paid step itself stays** — a type does not set it, and its migration forbids seeding it |
| **Customer Collection Times** | its own box | **card row showing the value + "Change", which scrolls to that box (§4.4)** | unchanged | nothing — the box keeps the pair and "Use my usual setting" |
| **Event type ▾** | the stage-1 standalone control | **card row (only when the truck has types)** | `event_type_id` | — |
| **Stock and items sold** | *new row* | links to the **existing Stock tab** | `event_item_stock` / `event_category_stock` | — |
| **Deals** (one switch per deal) | *new* | **card rows** | `event_deals`, `overridden = true` | — |
| **"N settings changed… / Reset to <type>"** | *new* | card footer | clears only what the card controls | — |
| **"Saving…"** | per-row, on three controls | **once in the card header** | — | the per-row position; the affordance is kept |

**Newly unreachable:** `components/dashboard/DemoLockChip.tsx` now has **no consumer at all** — its
only two were the offline and order-ready cards. The file is left in place (deleting it is a decision
about the demo's visual language, not about this move).

### 4.2 Everything in the card is for THIS EVENT only

The card's header carries the table of row → action → column, and the harness asserts the file names
no truck-wide table (`from('trucks')`, `truck_vans`). Every row goes through a **per-event action that
already existed**, except the two deal actions (§4.3).

### 4.3 Deals

`set_event_deal` performs the same upsert `update_event_deal` does — `{ event_id, bundle_id, active,
overridden: true }` on `onConflict: 'event_id,bundle_id'` — on the route the dashboard can reach
(§0.2). Both ids are proved to belong to this truck first, because `event_deals` carries no `truck_id`
of its own. `get_event_deals` reports a deal with **no row** as the bundle's own
`apply_to_new_events`, because that is the fallback the customer menu applies — reporting `false`
would show a deal as off that customers can actually use.

**Reset** *deletes* the `overridden = true` rows rather than writing `overridden: false` with a copied
value: a row that stops tracking the bundle default is a snapshot, and no row at all is what "use the
default" means.

### 4.4 Collection times hands over — the one row that does not edit in place

The Kitchen tab's box offers **three** things: the customer grid, an operator-only override behind a
tickbox, and **"Use my usual setting"** — the only route back to following the van. One card row cannot
express that, and a row offering only the customer half would be a second editor for a PAIR whose own
comments insist it is *"BOTH COLUMNS, ONE CALL, EVERY TIME"*. Two editors disagreeing about the
operator grid is precisely what those comments exist to prevent.

So the row **shows the value in force and hands over**, exactly as the MENU row hands over to the stock
screen. Nothing is duplicated and nothing is lost. The box gained `id="collection-times-box"` as the
anchor.

### 4.5 Where it mounts, and why

**At the top of the dashboard's Settings ("Kitchen") tab** — the screen every one of the five moved
controls already lived on. So no control changed screens, only its position within one, which is the
lowest-risk reading of "move it into the card rather than duplicating it". The board sketches it on a
main screen; putting a tall settings card above the orders an operator is working through would be
worse.

---

## 5 · THE CHECKS

### `scripts/event-types.cjs` — 106 checks, 19 broken variants, all 19 fail as required

New sections: **1d-ii** (the offline before/after matrix), **5b** (the modal, the controls-in-column
rule, the card, the deals, and the dashboard-page line diff).

| | What it breaks | Caught by |
|---|---|---|
| V11 | a type's offline switch ignored — offered and does nothing | 1d-ii / 2 |
| V12 | a type's offline switch overrules a hand change on this event | 2 |
| V13 | a van with no stored mode stops meaning "pause" — **every untyped event changes** | 1d-ii |
| V14 | the auto-reject delay gains a default — orders start being rejected for trucks that never set one | 1d-ii |
| V15 | the chips carry pre-filled values again | 3 |
| V16 | one offline change counts as two settings | 3 |
| V17 | a control goes back into the label column | 5b |
| V18 | a per-event deal written without `overridden` | 5b |
| V19 | the type columns shrink as types are added | 5b |

V17–V19 mutate a **copy in memory** and re-run the predicate, because a component and a route handler
cannot be rendered or called here — a text check is worth no more than its ability to notice the
regression it describes.

### 🔴 The line-level multiset diff — and what "zero lines lost" means here

- **`app/manage/[token]/page.tsx`: 0 lines lost.**
- **`app/dashboard/[token]/page.tsx`: 92 lines left the file BY DESIGN** — five controls moved out of
  it. So the guard is not "zero lines left" but **"every line that left is one of the enumerated
  moves"**, with an allowlist naming each; any other loss fails. That is the property that matters —
  it is how 189 lines once went silently. Asserted mechanically in §5b, currently **0 unexplained**.

### Measurements — Chromium and WebKit, 1440 / 820 / 390, including six types

```
modal 1440×900  dialog 1000×820 · grid 1810px in 1000px
modal  820×1180 dialog  788×... · grid 1810px in  772px
modal  390×844  (phone column; the columns are hidden)
newtype 390×844 popup 358px · chips 88px (two rows) · note clipped: false
card   390×844  358×858 · select 40px · warning clipped: false
```

No horizontal page scroll anywhere. The dialog is at most 1000px **and does not grow with the types**.
The columns scroll inside it — asserted by *trying* to scroll, not by comparing widths, because a plain
overflowing block reports the same widths and cannot be scrolled. The control's box starts at or after
the label column's right edge, which is the geometry of "in its own column".

### 🔴 A real defect the measurement found

**At 390px the card scrolled sideways and the offline select hung off the edge.** A `<select>` sizes
itself to its **widest option**, and that row's widest is "Keep taking orders, confirm them yourself" —
320px inside a 358px card, with `shrink-0` stopping it from giving way. Changed to `min-w-0
max-w-[58%]`; the browser truncates the shown label and the full text is still in the open list. **A
grep could not have found this.**

### Checks of mine that were wrong before they were right

1. **Three checks matched my own comments** — `minmax(150px, 1fr)`, `truck_vans` and a `truck_id` count
   all appear in notes that *explain* the code. A check that forbids writing down why is a worse check;
   they read `codeOf()` now.
2. **The §1 baseline's meaning moved with the build.** At stage 1, HEAD was the pre-event-types tree;
   HEAD is now stage 1. Three assertions were written against the old premise. They now assert the real
   one ("the before tree has the resolver, without the offline one") and compare **resolver against
   resolver** across the matrix — stronger, not weaker.
3. **The price path's allowed difference is now none.** `paid-step.ts` was stage 1's one permitted
   change and landed in HEAD; this build must leave the whole path alone, and does.
4. **My dedup of a fixture helper ate four closing braces.** I replaced four block-scoped copies of
   `typeWith` with one at module scope — and the removal loop consumed each section's `}` with it,
   leaving three sections closing after their first line. Caught immediately by `node -c`, repaired,
   and the helper now genuinely exists once (which is what its comment claims).
5. **A comment of mine was factually wrong.** I wrote that `DemoLockChip` was "still imported by its
   other consumers". It has none. Corrected to say so.
6. **The call site of the new 3-argument baseline wrapper kept two arguments**, so `vanDefault` arrived
   `undefined` and the mark-ready comparison failed on correct code.

### Existing harnesses run (not the full sweep, as instructed)

| Harness | Result |
|---|---|
| `event-types.cjs` | ✅ 106 · 19/19 variants fail as required |
| `event-types-render.cjs` | ✅ both engines, three widths, six types |
| `slot-interval-event-override` / `-grid-routing` / `-settings` / `-van-resolution` / `-van-list-tolerance` | ✅ |
| `collection-times-hint`, `printing-network-guard`, `printing-gating` | ✅ |
| `batch-reservation-switch`, `batch-reservation-edit-lock` | ✅ |
| `customer-path-identity` | ✅ *(the customer path is unchanged; the menu API's offline gate resolves to the same value for every untyped event)* |
| `screenshot-truck-details` | ✅ 173 |

### The rest

- `npx tsc --noEmit` — clean.
- `npm run build` — compiled successfully.
- **ESLint on added lines** — **0 errors, 0 warnings** across `lib/event-types/`,
  `components/manage/EventTypes.tsx`, `components/dashboard/ThisEventCard.tsx`,
  `app/api/event-types/route.ts` and the heartbeat monitor. The dashboard page's unused-symbol set is
  back to HEAD's exactly (the four orphaned by the move were resolved: two by keeping the "Saving…"
  affordance in the card, two by deletion).

---

## 6 · WHAT TO TEST ON LOCALHOST

Run the migration first. Use **Village Spice** or **Pizza Kitchen**.

1. **Open the modal.** Schedule → **Event types**. It is a centred dialog about 1000px wide, not a
   full-screen page. Standard is the first column, read-only, with "default" beside it.
2. **Create a type from a chip.** **+ New event type** → tap **Festival** → the name field fills →
   **Create**. Every setting in the new column reads **grey "Same as Standard"**. 🔴 Nothing is
   pre-filled — that is the §2 change.
3. **Create one by typing.** **+ New event type**, type `School fete`, Create. Same: all grey.
4. **The controls are in their own columns.** Each row (Buzzers, Take cash, "Mark ready" step,
   Collection times, Offline protection) has its control **under its type's heading**, aligned with the
   row's name. Nothing sits in the label column.
5. **A switch's three states.** On Festival's **Buzzers**: it starts greyed, labelled "Same as
   Standard". Tap it → it becomes an explicit **On** with a small **"Same as Standard"** link beside
   it. Tap the link → back to greyed. Reload to confirm each state persisted.
6. **Offline protection on a type.** Set Festival's dropdown to **Keep taking orders, confirm them
   yourself**. Set School fete's to **Off**. Leave Market's as Same as Standard.
7. **The ⋯ menu.** On a type's header: **Rename**, **Move left**, **Move right**, **Delete**. Move
   Festival right, then left. Rename School fete to `Fete`.
8. **Six types and sideways scroll.** Add types until there are six. The dialog **does not get wider**;
   the columns scroll sideways inside it, the label column stays put, and **Done/✕ stays reachable**.
9. **Delete.** ⋯ → Delete on `Fete` → the confirm names how many upcoming events go back to Standard.
10. **On a phone (390px).** The modal shows **one column with a type picker at the top**. The new-type
    popup's four chips wrap onto two rows and stay inside it.
11. **Make test events.** Manage → Schedule → **+ Add event** (no truck has upcoming events). Make one
    for **tomorrow** at `Bures Music Festival`, 10:00–22:00, **assign a van**, type **Festival**. Make
    a second for the day after at `The Five Bells`, 17:00–20:00, type **Standard**.
12. **The card.** Open the dashboard → **Kitchen** tab. The **"This event"** card is at the top with
    *"Changes here are for this event only"*. Rows: Event type · MENU (Stock and items sold) · DEALS ·
    SERVICE (Buzzers, Take cash, "Mark ready" step, Collection times, Offline protection) · the footer.
    🔴 **No Prices row.**
13. **Offline protection resolves from the type.** On the Festival event the Offline protection row
    should read **Keep taking orders, confirm them yourself** — from the type, with no hand change. The
    ⚠️ instruction is beneath it and the **Reject orders waiting longer than** picker is indented under
    it.
14. **A hand change wins and is tagged.** Change that row to **Off**. It gets a **THIS EVENT** tag and
    the footer counts it. Switch the event's type to Standard and back to Festival — the confirm says
    your change stays, and it does.
15. **Deals.** The DEALS section lists each available deal with a switch. Toggle one off → **THIS
    EVENT** tag. Check the customer order page for that event no longer offers it. Toggle it back.
16. **"Reset to Festival".** With two or three hand changes, press it. The tagged rows return to the
    type's values, your deal overrides go back to the bundle defaults, and ⚠️ your **paid step**,
    **extra wait** and **pause** for that event are **untouched**.
17. **Stock hands over.** MENU → **Change** switches to the **Stock** tab for the same event.
18. **Collection times hands over.** SERVICE → Collection times → **Change** scrolls to the existing
    Customer Collection Times box further down the tab, which still has the operator tickbox and **Use
    my usual setting**.
19. **The five moved controls are gone from their old places.** Scroll the Kitchen tab: there is no
    separate Offline Order Protection card, no "Remind me to add a buzzer" card, no "Order-ready step"
    card, and no "Do you take cash?" row inside the Separate paid step card — but **Separate paid step
    itself is still there**.
20. **A truck with no types still gets the card.** On the Five Bells event (Standard), the card shows
    with **no Event type row** and every other row working.
21. **The monitor acts on the type.** On the Festival event (type = keep taking orders), let the
    dashboard go offline for ~30s. Orders should keep being accepted but arrive **pending** rather than
    the event being paused. 🔴 This is the end-to-end proof that the type reaches the thing that acts.
22. **An untyped event is unchanged.** On the Five Bells event, every service setting behaves exactly as
    before this build.

---

## 7 · WHAT I DID NOT DO

- **No SQL was run.** The migration is yours.
- **Not deployed, not pushed to main, nothing merged or rebased.** `schedule-graphics` untouched.
- **No full sweep** — you asked to be consulted first. Everything that compiles a changed file was run.
- **No Prices row and no per-event prices** (§0.1).
- **No auto-reject delay on a type** (§0.3) — the column exists and the resolver resolves it; the UI
  withholds it until the plpgsql function can read it.
- **`claim_order_for_auto_reject` was not changed.** It rejects customers' orders; that belongs in its
  own build.
- **`DemoLockChip.tsx` was not deleted** though it is now unreachable.

---

## 8 · THE MIGRATION AND ITS VERIFICATION SELECTS

```sql
set lock_timeout = '3s';

begin;

alter table public.event_types
  add column if not exists offline_protection boolean;

comment on column public.event_types.offline_protection is
  'Does offline order protection apply at events of this type? NULL = same as Standard (the van''s truck_vans.auto_pause_on_offline), which is how every type reads before 20261010. true/false are explicit instructions for this type. Resolved by resolveOfflineWithType() in lib/event-types/resolve.ts as `truck_events.offline_protection_override ?? this ?? truck_vans.auto_pause_on_offline`. ⚠️ A hand change on one event always wins.';

alter table public.event_types
  add column if not exists offline_protection_mode text;

alter table public.event_types
  drop constraint if exists event_types_offline_protection_mode_check;

alter table public.event_types
  add constraint event_types_offline_protection_mode_check
  check (offline_protection_mode is null
         or offline_protection_mode in ('pause', 'no_auto_accept'));

comment on column public.event_types.offline_protection_mode is
  'What offline protection DOES at events of this type, when the switch resolves on. NULL = same as Standard (truck_vans.offline_protection_mode). ''pause'' = customers cannot order; ''no_auto_accept'' = customers can still order but nothing auto-confirms. The same two values and the same CHECK as truck_vans.offline_protection_mode and truck_events.offline_protection_mode_override, so all three resolve through one chain. ⚠️ IGNORED WHEN THE SWITCH RESOLVES OFF, exactly as the van column is.';

alter table public.event_types
  add column if not exists offline_auto_reject_mins integer;

alter table public.event_types
  drop constraint if exists event_types_offline_auto_reject_mins_check;

alter table public.event_types
  add constraint event_types_offline_auto_reject_mins_check
  check (offline_auto_reject_mins is null
         or (offline_auto_reject_mins >= 5 and offline_auto_reject_mins <= 30));

comment on column public.event_types.offline_auto_reject_mins is
  'How long an unconfirmed order may wait at events of this type before it is auto-rejected, in minutes, when the mode resolves to ''no_auto_accept''. NULL = same as Standard (truck_vans.offline_auto_reject_mins). Range 5-30, the same bounds truck_vans.offline_auto_reject_mins carries and the same range set_offline_protection validates; the picker''s six values are a UI affordance, not a constraint. ⚠️ IGNORED unless the resolved mode is ''no_auto_accept''.';

commit;

notify pgrst, 'reload schema';
```

The three columns exist, are nullable, and have the right types:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'event_types'
  and column_name in ('offline_protection', 'offline_protection_mode', 'offline_auto_reject_mins')
order by ordinal_position;
```

Both CHECK constraints landed:

```sql
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.event_types'::regclass
  and conname in ('event_types_offline_protection_mode_check',
                  'event_types_offline_auto_reject_mins_check');
```

Nothing changed for any existing type — all three must read NULL immediately after the migration:

```sql
select count(*) as types,
       count(offline_protection) as switch_set,
       count(offline_protection_mode) as mode_set,
       count(offline_auto_reject_mins) as delay_set
from public.event_types;
```

The column comments landed:

```sql
select a.attname, col_description(a.attrelid, a.attnum) as comment
from pg_attribute a
where a.attrelid = 'public.event_types'::regclass
  and a.attname in ('offline_protection', 'offline_protection_mode', 'offline_auto_reject_mins');
```

The vocabulary matches the van's, so all three layers resolve through one chain:

```sql
select 'event_types' as tbl, pg_get_constraintdef(oid) as definition
from pg_constraint where conname = 'event_types_offline_protection_mode_check'
union all
select 'truck_vans', pg_get_constraintdef(oid)
from pg_constraint where conname = 'truck_vans_offline_protection_mode_check'
union all
select 'truck_events', pg_get_constraintdef(oid)
from pg_constraint where conname = 'truck_events_offline_protection_mode_override_check';
```

PostgREST is serving them (this must return a row, not PGRST204):

```sql
select offline_protection, offline_protection_mode, offline_auto_reject_mins
from public.event_types limit 1;
```

⚠️ **Worth checking while you are in there** — these two columns are read and written by the app but
have **no DDL in this repository** (§0). This confirms what production actually has:

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and column_name in ('offline_auto_reject_mins', 'offline_auto_reject_mins_override')
order by table_name;
```
