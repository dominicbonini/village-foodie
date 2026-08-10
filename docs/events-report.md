# Van selection is now enforced at event confirmation

**Date:** 10 August 2026
**Prompt integrity:** nothing arrived garbled, and **no instruction contradicted another**. Your closing line — *"If there is only one van then all events should be automatically assigned to that"* — settles the ⚠️ question you raised, and it turns out the server **already does exactly that**; see §2.

---

## 1. ESTABLISHED — every field enforced at confirmation, and where

| Field | Client (Manage) | Server (`/api/events/action`) | What the operator sees |
|---|---|---|---|
| **start_time / end_time** | `handleConfirmEvent` pre-flight — toast, then routes to **Edit & Approve** with the fields flagged | ✅ `hasValidEventTimes` → **400** *"Add a start and end time before this event can go live."* | `⚠ Time needed` chip on the card, Approve **disabled** with `title="Set a time first"`, and on the edit form `border-red-400 bg-red-50` + `text-xs text-red-500` |
| **venue_name / event_date** | `formErrors` on the edit form (save-time) | — | Same red-highlight treatment |
| 🔴 **van_id** | **NOTHING — this was the defect** | **NOTHING beyond the sole-van auto-assign** | Nothing. Confirm succeeded silently. |
| auto_open / auto_close | sent from truck defaults | ✅ 400 if not booleans | (never operator-visible) |

**The time gate is enforced in BOTH places.** The server one is the rule; the client one exists so the operator gets a flagged field instead of a rejected request. That is the pattern this fix copies.

🔴 **Van was enforced in neither.** The client had no check at all, and the server's only van logic was the sole-van auto-assign — which returns `null` for a multi-van truck and then **wrote that null and confirmed**.

⚠️ **A client-only check would not have been enough**, exactly as you said: the confirm branch is reachable by anything posting to `/api/events/action`, so the rule belongs on the server. It is now in both.

---

## 2. THE RULE I IMPLEMENTED — mandatory only when there is a choice

**"Mandatory when there is a choice; auto-assigned when there is not."** Your reading was right, and it is already half-built:

- 🔴 **The server ALREADY auto-assigns a sole active van on confirm** — `getSoleActiveVanId(supabase, truck.id)`, commented *"FIX 3 (single-van auto-assign)"*. It returns the id only when `data.length === 1`, i.e. `null` for both zero vans and two-or-more.
- **The edit modal already gates its van selector on `vans.length > 1`** — a one-van truck is never shown the field, so demanding a choice from it would demand something the product does not offer.
- **`get_vans` filters `.eq('active', true)`**, and the new server count filters the same way, so **client and server cannot disagree about whether a choice exists.**

**So the rule is:** `> 1 active van` → van is mandatory. `exactly 1` → auto-assigned, operator never asked. `0` → falls through deliberately (nothing to choose; blocking would strand a truck that has not set a van up yet — the same posture the time gate takes toward drafts).

---

## 3. 🔴 WHY IT MATTERS — and §14's account is out of date

**Checked in code, not assumed from the manual — and the manual is wrong on the mechanism.**

⚠️ **§14 says `slot_capacity` rows are written from the van's `kitchen_capacity` at confirmation. That is no longer how it works.** Grep the confirm branch for `slot_capacity` or `kitchen_capacity`: **nothing**. Confirmation writes no capacity rows at all.

**What actually happens** — [app/api/slots/[truckId]/route.ts:236-248](../app/api/slots/[truckId]/route.ts#L236-L248), and its own comment says it:

> *"kitchen_capacity comes from the event's van (truck_vans), computed **live** — the slot_capacity batch cache is **no longer consulted** for the decision."*

```ts
let kitchenCapacity: number | null = null
if (todayEvent?.van_id) {
  const { data: van } = await supabase.from('truck_vans')
    .select('kitchen_capacity, capacity_window_mins').eq('id', todayEvent.van_id).single()
  kitchenCapacity = van?.kitchen_capacity ?? null
}
```

**No van ⇒ `kitchenCapacity` stays `null`.** And `null` is not "zero" or "unknown" downstream — [lib/slot-availability.ts:188, :797, :868](../lib/slot-availability.ts#L188) treat it as **`UNLIMITED` / `Infinity`**.

### 🔴 So the consequence is worse than a blank field, and different from what §14 implies

**A confirmed van-less event takes orders with NO CAPACITY ENFORCEMENT AT ALL** — every slot, all day. Not "capacity setup was skipped once at confirm", but "capacity is unenforced on every read".

✅ **The one piece of good news, and it follows from the same mechanism: it SELF-HEALS.** Because capacity is computed live rather than baked at confirm, **assigning a van to an already-confirmed event starts enforcing capacity immediately** — no re-confirm, no backfill, no repair job. That is the answer to "what is the consequence for an event already confirmed without one": **open it, pick the van, done.**

---

## 4. Events already confirmed without a van — **9, all on one truck**

```
confirmed/open events: 17 | WITH NO VAN: 9
by truck: {"test-truck": 9}

  test-truck 2026-08-10 Old School Community Centre   (open)        ← LIVE TODAY
  test-truck 2026-08-13 Suffolk Distillery             (confirmed)
  test-truck 2026-08-14 Five Bells                     (confirmed)
  test-truck 2026-08-15 Old Goat Brewery               (confirmed)
  test-truck 2026-08-16 Nethergate Brewery & Distillery(confirmed)
  test-truck 2026-08-17 The Bell                       (confirmed)
  test-truck 2026-08-21 The White Horse                (confirmed)
  test-truck 2026-08-24 Old School Community Centre    (confirmed)
  test-truck 2026-08-31 Nethergate Brewery & Distillery(confirmed)
```

**All nine are dated today or later, and one is `open` right now** — that event is currently accepting orders with capacity unenforced. **All nine are on `test-kitchen` (id `test-truck`), the only truck with more than one active van** — which is exactly the population the defect could reach. **No customer truck is affected.**

**Van counts, all twelve trucks:**

| Truck | Active vans |
|---|---|
| 🔴 **test-kitchen** | **2** (Van1, Van2) |
| **pizzeria-gusto** | **1** (Van1) |
| real-thai-food, village-spice, test-truck-2/-3/-3-2, tt3, 4 × demo | **1** each |

**Fixing the nine is nine trips through Edit → pick a van → Save.** Nothing else, because of the self-healing property above.

---

## 5. What was built

**Two files, and the inline-error plumbing already existed.**

### Server — `app/api/events/action/route.ts`, the `confirm` branch

The sole-van auto-assign is untouched and runs first. If the event still has no van, the active vans are **counted** (because `getSoleActiveVanId` cannot distinguish zero from many), and more than one is a **400**:

```
Choose which truck is working this event before it can go live.
```

Zero vans falls through deliberately, with the reasoning recorded at the site.

### Client — `app/manage/[token]/page.tsx`, `handleConfirmEvent`

A second pre-flight gate **immediately after the time gate, in the same shape**: toast, then route to **Edit & Approve** with the field flagged.

```
toast:  Choose which truck is working this event before approving.
field:  Choose which truck is working this event
```

⚠️ **The two gates now share one `openForFix` helper** rather than repeating the twelve-field `setEditingEvent(...)` call — the second copy would have drifted from the first the next time a field was added to the event form.

### 🔴 The inline treatment is the existing one, not a new one

**The edit modal already had a van selector wired to `formErrors.van_id`, with the identical treatment the time fields use** — nothing set it on the confirm path. So this reuses, verbatim:

| | Van field (existing) | Time fields (existing) |
|---|---|---|
| Input highlight | `border-red-400 bg-red-50` | `border-red-400 bg-red-50` |
| Message | `<p className="text-xs text-red-500 mt-1">` | `<p className="text-xs text-red-500 mt-1">` |
| Clears on edit | `if (formErrors.van_id) setFormErrors(...)` | same |
| Rendered when | `vans.length > 1` | always |

**Nothing new was invented** — the wording follows the time gate's "do X before approving" shape.

---

## VERIFY — walked

| Case | Before | After |
|---|---|---|
| **Detected event, no van, TWO-van truck** (test-kitchen) | 🔴 Approve **succeeded**; event confirmed with `van_id: null` and capacity unenforced | **Blocked.** Toast, then Edit & Approve opens with the **Truck** field red and *"Choose which truck is working this event"*. Picking a van and saving confirms normally. Server also refuses a direct POST. |
| **Detected event, no van, ONE-van truck** (Gusto and the other ten) | Server auto-assigned the sole van | **Identical.** The client gate does not fire (`vans.length > 1` is false), the selector is not rendered, and the server auto-assign is unchanged. |
| **Event with a van already assigned** | Confirmed | **Identical.** Both gates test `!ev.van_id`; an assigned van short-circuits before either. |
| **Zero active vans** | Confirmed | **Still confirms**, deliberately — nothing to choose. |

### No other confirmation behaviour changed ✅

- **§15 holds: manual events still auto-confirm with no popup.** They are created by `upsert_event` in `app/api/manage/route.ts` with `const eventStatus = 'confirmed'` and their **own** sole-van auto-assign at `:683` — a completely separate path this change never touches. Only `/api/events/action`'s `confirm` branch was edited, and that is reached only by approving a **scraped/unconfirmed** event.
- The conflict-acknowledge flow, the reject/undo flow, the `⚠ Time needed` chip and the disabled-Approve `title` are all unchanged.
- The time gate is byte-identical in behaviour — it was only refactored to share `openForFix` with the new gate.

### 🔴 GUSTO — nothing changes

**They have exactly ONE active van (`Van1`).** So:

- the van selector is not rendered for them (it never was — `vans.length > 1`);
- the new client gate never fires;
- the server's sole-van auto-assign already assigned `Van1` on every confirm and still does;
- **zero of their events lack a van** (all nine van-less events are test-truck's).

**Exactly what you expected: nothing.**

### tsc and lint

```
$ npx tsc --noEmit
TSC EXIT CODE: 0

$ npx eslint .   (rule|severity, whole repo)
  vs the immediately-previous task : IDENTICAL
```

**No rule introduced, no count changed.**

### Read-only script

One query script was written to establish the van counts and the van-less events; it made no writes and was **deleted immediately, confirmed** (`ls` returns "No such file or directory"). Nothing under `lib/payments/` was touched.

---

## Logged, out of scope as instructed

⚠️ **Making required fields visible on the event card WITHOUT opening it**, so an operator can see at a glance what is missing. Today the card shows a `⚠ Time needed` chip for time only — **there is no equivalent for the van**, so a van-less event on a multi-van truck looks complete until Approve is pressed. **The chip pattern already exists and would extend naturally** (`⚠ Truck needed`, same amber treatment, rendered on `!event.van_id && vans.length > 1`). Not built, at your instruction.

## Also worth your attention

1. 🔴 **The nine existing van-less events on test-kitchen** — one is `open` today with capacity unenforced. Nine Edit → pick van → Save, and capacity resumes immediately.
2. ⚠️ **The manual's §14 is out of date** on how capacity is provisioned: confirmation writes no `slot_capacity` rows, and capacity resolves live from `truck_events.van_id` at read time. Worth correcting on the next manual pass — the practical difference is that the failure is continuous rather than one-off, and that it self-heals.
