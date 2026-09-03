# Onboarding beyond the break — READ-ONLY review

**No files changed, nothing deployed, no SQL, no migrations.** The only write is this report.

**GARBLED SPANS: none.**

**Assumption, as instructed:** the phone field exists and step 2 succeeds.

## 🔴 A CORRECTION TO MY OWN EARLIER REPORT, FIRST

`docs/signup-journey-review-report.md` quoted `app/setup/page.tsx:96` — *"The EVENT step (Step 6) isn't
built yet"* — and reported the event step as missing. **That comment is STALE and I repeated it without
checking.** The Schedule step exists, is wired into the wizard, and writes real events through
`upsert_event` (`app/manage/[token]/page.tsx:3346-3363`). **The wizard is considerably more built than my
last report implied.** The correction matters because it changes the answer to item 8.

---

## 1. Every step, end to end

**Two pages, then a seven-pill wizard inside Manage. Nine screens in total.**

| # | Screen | File | What it collects / does |
|---|---|---|---|
| 1 | Create account | `app/signup/page.tsx` | email, password, promo (opt), marketing (opt) |
| 2 | Name your truck | `app/setup/page.tsx` | truck name (+ phone, assumed) → `provisionTruck` writes `trucks` + `truck_vans`, sets `setup_step:'menu'` (`app/api/setup/route.ts:116`) |
| — | → `/manage/{token}?import=demo` | | `inSetup = setup_step != null && != 'done'` (`:2950`) |
| 3 | **Your details** ✓ | stepper prefix (`:3020`) | display-only, already green |
| 4 | **Menu** | `importStep` `offer`→`upload`→structure→`review` | photo/text import → categories, items, prices |
| 5 | **Extras** | `importStep 'extras'` | **conditional — only when `hasExtras`** (`:2959`) |
| 6 | **Allergens** | `importStep 'allergens'` | per-dish or card; items flagged *"allergens not set"* until done (`:3207`) |
| 7 | **Kitchen setup** | `importStep 'prep'` | `prep_secs`, `batch_size` per category — **this is the capacity model** |
| 8 | **Schedule** | `importStep 'schedule'` (`:5694`) | Route A/B: a schedule URL, scraped + verified → `upsert_event`. Route C: copy only |
| 9 | **Settings review** | `importStep 'settings'` (`:5851`) | *"Looks good →"* → `finishSetup()` → `setup_step:'done'` (`:5922-5923`) |
| — | **Terminal** | `importStep 'done'` (`:5930`) | 🎉 *"You're all set!"* + three walkthrough buttons |

**The step machine is `['identity','menu','event','done']`** (`app/api/setup/route.ts:131`). ⚠️ Note the
mismatch: the server's vocabulary says `event`, the UI's says `schedule`/`settings`. Only `menu` and
`done` are ever written.

---

## 2. 🔴 Required or skippable — and what skipping costs

| Step | Skippable? | What happens |
|---|---|---|
| 1. Account | **Required** | — |
| 2. Truck name | **Required** | no truck, no wizard |
| 4. **Menu** | 🔴 **Yes — "I'll do this later"** (`:5073`) | ⚠️ **It does NOT advance the wizard.** It calls `resetImportState()` + `stripImportParam()` and drops them into Manage with `setup_step` still `'menu'`. **`inSetup` stays true, so the setup chrome returns on every load.** They are not finished and not told so |
| 5. Extras | **Auto-skipped** when the menu has none | correct |
| 6. Allergens | **Yes** | items carry an *"allergens not set"* flag; a customer-visible quality gap, and legally the one you least want skipped |
| 7. Kitchen setup | **Yes** | no prep/batch figures → the slot engine has no capacity model to pace against |
| 8. **Schedule** | 🔴 **Yes — Route C, or zero events extracted** → `skipSchedule()` → straight to review (`:3348`) | 🔴 **The truck ends with NO EVENT. See §3 — this is the serious one** |
| 9. Review | **The only route to `'done'`** | `finishSetup()` is called from exactly one place (`:5922`) |

🔴 **So a truck can reach "You're all set!" with no menu skipped-around, no allergens and no event.** The
review screen is a confirmation, not a check — I found no branch in it that blocks completion on missing
state.

---

## 3. 🔴 THE MINIMUM TO TAKE A FIRST ORDER — and the gap that matters

| Requirement | Needed? | Does the wizard provide it? |
|---|---|---|
| `trucks` row, `active: true` | **Yes** | ✅ **created** — `provision-truck.ts:396`, `active: true` |
| A van row | Yes | ✅ created (`:502`) |
| **Menu items** | **Yes** — nothing to order otherwise | ✅ **prompts**, skippable |
| **An event for the date** | 🔴 **see below** | ⚠️ **prompts, skippable, and only via a scraped URL** |
| **`start_time` AND `end_time` on that event** | 🔴 **Yes** — `!ev.start_time \|\| !ev.end_time` → `orderingAvailable = false` (`app/api/menu/[truckId]/route.ts:254`) | ⚠️ the wizard sends `ev.start_time \|\| ''` from the scrape — **a scrape without times creates an event that blocks ordering** |
| Event **confirmed** | Yes — `unconfirmedEvent` → `orderingAvailable = false` (`:192`) | not surfaced in the wizard |
| Capacity (prep/batch) | For slot pacing | ⚠️ prompts, skippable |
| **Stripe / payment setup** | 🟢 **NO** — pay-at-hatch needs none | 🔴 **never mentioned in the wizard** |
| **QR code / the ordering link** | **Yes — how else does a customer arrive?** | 🔴 **never surfaced by the wizard** |
| Allergens | Not blocking | prompts, skippable |

### 🔴 The finding: no event does not stop the customer — it hides the order from the operator

Read, not executed, and the chain is short:

1. `orderingAvailable` starts **`true`** (`app/api/menu/[truckId]/route.ts:148`) and is only set false by an
   *unconfirmed* event or one *missing times*. **With no event at all, neither branch fires — it stays
   true.** The customer sees an orderable menu.
2. Submit falls back to today: `orderEventDate = eventDate ?? new Date()…` (`submit/route.ts:528`), looks
   for a matching event, finds none, and **does not refuse**.
3. `acquireEventLock` inserts into `booking_locks` on `(truck_id, event_date)` — **no event row required**
   (`lib/stock-guard.ts:44-52`).
4. The order is written with **`p_event_id: eventRow?.id ?? null`** (`submit/route.ts:1042`).
5. The operator dashboard resolves a `selectedEventId` and its own comment says: *"null, every
   selectedEventId branch below requires it non-null, **the orders block never ran**"*
   (`app/api/dashboard/route.ts:191`).

**So: skip the Schedule step, and you get a truck whose menu a customer can order from, whose order is
accepted and written — and which the operator's dashboard has no event to hang it on.**

⚠️ **I have READ this path, not run it.** I did not place an order against an eventless truck, and I am
not going to assert the operator sees nothing without doing so. **This is the single thing I would test
first**, because if it is right it is worse than the signup break: that one stops people, this one takes
a customer's money-less order and loses it.

---

## 4. What is built, part-built, and not

| | State |
|---|---|
| Menu import (photo/text → categories, items, prices, structure choice, review) | ✅ **built, substantial** |
| Extras / modifier groups | ✅ built, conditional |
| Allergens (per-dish and card) | ✅ built |
| Kitchen setup (prep/batch) | ✅ built |
| **Schedule** | ⚠️ **built, but ONE route works.** Routes A/B scrape a URL and write events. **Route C is copy plus a Continue that skips** (`:3369`: *"ROUTE C — no handler"*). **There is no manual "add one event" in the wizard** |
| Settings review + `finishSetup` | ✅ built, single caller |
| Terminal screen | ✅ built |
| **Payments / Stripe** | 🔴 **absent from the wizard entirely** |
| **Sharing the link / QR** | 🔴 **absent from the wizard entirely** |
| `app/setup/page.tsx:96` *"The EVENT step (Step 6) isn't built yet"* | 🔴 **STALE COMMENT — it is built.** It misled my own last report |
| Signup verification resend | 🔴 still absent (`app/setup/page.tsx:141-142`) |

---

## 5. What the operator sees at the end

**A real completion state, not a stop.** `importStep === 'done'` (`:5930`) renders **🎉 "You're all set!"**
with explanatory copy and **three walkthrough buttons**, and in setup mode it **does not auto-dismiss** —
exit is explicit (`:3231`).

⚠️ **But "all set" is not conditional on anything.** It is reached from the review screen regardless of
whether a menu, an event or allergens exist. **An operator who skipped Schedule is congratulated in the
same words as one who did everything.**

---

## 6. 🔴 The two paths, side by side

| | `/signup` → `/setup` | Demo modal (`DemoGetStarted.tsx`) |
|---|---|---|
| Truck name | ✅ | ✅ |
| **Contact phone** | 🔴 **not collected** (the break) | ✅ collected (`:234`) |
| **WhatsApp preference** | 🔴 no | ✅ `phone_is_whatsapp` (`:235`) |
| **First / last name** | 🔴 **never collected** — `/api/signup:55-56` always gets null | ✅ collected |
| **Cuisine type** | 🔴 no | ✅ → also sets `truck_emoji` via `emojiForCuisine` |
| A pre-extracted menu | 🔴 no — `?import=demo` finds nothing, wizard shows a blank upload | ✅ the demo's stored extraction |
| Reaches the same wizard | yes | yes |

**The demo path produces a materially more complete truck**, and the gap is not one field:

- **`preferred_contact_method`** is derived from phone + tick (`provision-truck.ts:410`) — **null** on the
  `/setup` path, so the truck has no stated way to be contacted.
- **`whatsapp`** is set from the phone — **empty**.
- **`truck_emoji`** is set from cuisine — **absent**, so the truck shows the default.
- **`first_name`** is null, so the welcome and verification emails cannot personalise.
- **The menu step starts empty** rather than pre-filled.

**Roughly: the demo path lands a truck ready to be finished; `/setup` lands a named shell.**

---

## 7. What an operator must do that no step asks for

1. 🔴 **Connect Stripe, if they want card payments.** Nothing in the wizard mentions it. Pay-at-hatch works
   without — so this is not a blocker, but a Pro/Max operator who signed up *for* online payments finishes
   onboarding without ever being told the step exists.
2. 🔴 **Find and share their ordering link or QR code.** The wizard never shows it. **A truck can complete
   setup with a menu and an event and still have no customer able to reach it.**
3. 🔴 **Add an event by hand if they have no schedule URL.** The wizard's only working route is a scrape.
   Route C explicitly says "later" and offers nothing.
4. ⚠️ **Set event times** if the scrape returned none — otherwise `ordering_available` is false and the
   customer sees a "time not set" banner instead of a menu.
5. ⚠️ **Confirm the event.** An unconfirmed event blocks ordering (`:192`) and the wizard does not raise it.
6. ⚠️ **Verify allergens**, or every item stays flagged.

**Answer to your framing: yes — the wizard can finish and the truck still cannot trade.** Items 2, 3 and
4 are each sufficient on their own.

---

## 8. My honest read

**It is a substantially built wizard with a broken entrance and no completion check. Worth fixing, and
the fix is bigger than the phone field.**

**What is genuinely there:** menu import from a photograph, structure disambiguation, an allergen flow
with two modes, a capacity model, a schedule scraper with verification, a review screen and a real
terminal state — with careful reasoning in the comments about resume, idempotency and not stranding the
operator. **This is not a stub. Someone built it properly and it is close.**

**What is actually wrong is narrower than "it needs real work", and sharper:**

1. 🔴 **The entrance is broken** — one missing field, one file. Half a day.
2. 🔴 **Every step after "name your truck" is skippable, and nothing checks the result.** The wizard
   congratulates an operator whose truck cannot take an order. That is not a missing feature, it is a
   missing *assertion* — the review screen already exists and is the natural place for it.
3. 🔴 **The eventless-order path (§3)** is the one that could cost a real customer a real order. **Test it
   before anything else.**
4. ⚠️ **Two things the platform needs are absent rather than skippable** — the ordering link and, for paid
   plans, Stripe. Absent is worse than skippable: a skipped step was at least offered.

**So: not "nearly working" in the sense of one bug, and not "partially built" in the sense of needing to
be written. It is a complete wizard that never validates its own output, reached through a door that does
not open.** I would fix the door, then make the review screen refuse to say "You're all set!" when the
truck cannot trade — and I would answer §3 with a real order before either.

⚠️ **What I did not do:** I ran nothing. No order was placed, no wizard completed, no database queried.
Every statement above is read from source, and the two claims I would least like to be wrong about — the
eventless order and the dashboard's blindness to it — are marked as such.

**Nothing was changed. Nothing deployed.**
