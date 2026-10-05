# The dashboard clean-up: a card deleted, four controls put back, and prices that cannot be changed by accident

**5 October 2026 · `main`, local · nothing pushed, nothing deployed, no SQL run, no Gusto data touched**

Six pieces of work, in the order they were asked for:

1. `_pretest.cjs` **deleted**.
2. The **"This event" card removed**, and every control it took **restored to where `origin/main` has it**.
3. The **event type in the dark event bar**, with "Change event type…" and the private link in
   `Manage event ▾`, and the header's Order link / QR giving the **private** link.
4. **Per-event prices as a Price column in Menu & Stock**, on every plan, with the whole-event price
   rule removed.
5. The whole gate re-run: `tsc`, build, ESLint, the full sweep, and render measurements in both engines.
6. The release docs updated.

Plus the two follow-ups sent mid-build: **the price beside an item's name removed**, and **the Price
column made read-only until "✎ Edit prices"**; and **the private-event header** change.

---

## 1 · `_pretest.cjs` IS GONE

```
$ ls _pretest.cjs
ls: _pretest.cjs: No such file or directory
$ grep -rn "_pretest" app lib components scripts
(nothing)
```

It was **untracked**, sat in the **repository root**, and its first two lines built a Supabase client
with `SUPABASE_SERVICE_ROLE_KEY` and then `update()`d rows on `trucks` and `menu_items_db`.

⛔ **IT WAS OUTSIDE `scripts/`, SO THE HARNESS SCREEN NEVER SAW IT.** That screen exists because a stray
script once overwrote 132 `discovery_trucks` rows with the service role (V13.5), and it refuses any
listed file that builds a client. A file outside the directory is outside the screen.

The only remaining mentions are the historical records in `docs/release-prep-report.md` §3.3 and the
manual's V14.0 open items, which are now closed rather than deleted — the record of what was found is
worth keeping.

---

## 2 · THE "This event" CARD

### 2.1 What it was, and why it went

`components/dashboard/ThisEventCard.tsx` (586 lines) and `components/dashboard/EventPricesSheet.tsx`
(365 lines) are gone from the repository.

The card's own comment made the case against it: *"Five controls moved into it from separate cards —
the list Dominic approves before deploy… no control changed screens, only its position within one."*
Moving a control an operator reaches by muscle memory mid-service **is** the change, and it was never
agreed.

### 2.2 The proof: every per-event setting on `origin/main` is still reachable

`origin/main` is the baseline because it is **what is live**. Comparing against this branch's previous
tip would only prove the card was removed, not that what replaced it is what operators already use.

| Control | `origin/main` | Now | Same? |
|---|---|---|---|
| **Offline order protection** (switch) | `page.tsx:4552` — its own card, Settings tab | `page.tsx:4757` — its own card, same position | ✅ byte-for-byte |
| …its **two mode radios** | `page.tsx:4567` | `page.tsx:4772` | ✅ |
| …the **auto-reject delay**, nested in its mode | `page.tsx:4611` | `page.tsx:4814` | ✅ |
| …the **safety-critical ⚠️ instruction** | `page.tsx:4554` | `page.tsx:4759` | ✅ |
| **Do you take cash?** | `page.tsx:4842` — nested under "Separate paid step" | `page.tsx:5106` — same nesting | ✅ |
| **Order-ready step** | `page.tsx:4866` — its own card | `page.tsx:5128` — its own card | ✅ |
| **Remind me to add a buzzer** | `page.tsx:4886` — its own card, van-with-a-rack only | `page.tsx:5150` — same, same gate | ✅ |
| **Collection times** | `page.tsx:5018` — its own box | unchanged | ✅ never moved |
| **Stock and items sold** | Menu & Stock | unchanged | ✅ never moved |
| **Per-deal switches** | **Manage › Schedule**, `update_event_deal` | unchanged there | ✅ the dashboard copy was a duplicate |
| **Prices** | did not exist | a per-item **Price column in Menu & Stock** (§4) | new |
| **Event type** | did not exist on the dashboard | the **dark event bar** + `Manage event ▾` (§3) | new |
| **Private link** | did not exist on the dashboard | `Manage event ▾`, and the header's Order link / QR (§3) | new |
| "N settings changed" | card only | **gone** — the count has no home | — |
| "Reset to \<type\>" | card only | the **"Clear my changes and use \<type\> exactly"** checkbox inside the Change-event-type confirm | moved |

🔴 **AND IT IS A CHECK, NOT A TABLE.** `scripts/event-types.cjs` now reads the restored lines **out of
`origin/main`** and asserts both files contain each one:

```js
const liveDash = execFileSync('git', ['show', `${LIVE_REF}:app/dashboard/[token]/page.tsx`], …)
for (const [what, line] of RESTORED) {
  t(`✅ RESTORED · ${what}`, liveDash.includes(line) && dashPage.includes(line))
}
```

⛔ **AN EXACT-STRING COMPARISON AGAINST THE LIVE FILE, NOT A REGEX OF MY OWN WRITING.** The brief asks
for "same position, wording and look as live today", and the only way to assert "same wording" without
re-typing it is to take it from the file that has it. A paraphrase would pass a rewrite. Fourteen lines
are checked that way.

### 2.3 No control is in two places

Counted on `codeOf(...)`, so the tombstone comments that explain the restoration — which quote the
control names — can neither satisfy nor break it:

```
⛔ exactly ONE copy of "Do you take cash?" on the dashboard (1)
⛔ exactly ONE copy of "Remind me to add a buzzer" on the dashboard (1)
⛔ exactly ONE copy of "Order-ready step{demoLockChip}" on the dashboard (1)
⛔ exactly ONE copy of "{OFFLINE_PROTECTION_PURPOSE}" on the dashboard (1)
⛔ exactly ONE copy of "<p className="text-sm fo" on the dashboard (1)
```

### 2.4 The behaviour underneath is unchanged — the half worth keeping

Each control still resolves *the event's own hand change ?? the event type ?? the van/truck default*,
still writes a per-event `truck_events` column, and **the writers were never touched** — only the JSX
moved, twice. Asserted directly:

```js
t('🔴 every per-event writer is still here, and still writes truck_events only', …
  && /resolveOfflineWithType\(/.test(page)
  && /resolvePaidStep\(truck,activeEvent,eventType,vanTakesCash\)/.test(page))
```

### 2.5 The per-deal switches were a duplicate

`origin/main` lets an operator switch a deal on or off for one event in **Manage › Schedule, on the
event itself**, through `update_event_deal`. The card's `set_event_deal` was — by its own comment —
*"THE SAME UPSERT, column for column"*, and existed only because `/api/manage` refuses token+PIN auth.

So three dashboard actions are deleted: `set_event_deal`, `reset_event_deals`, `get_event_deals`.
⚠️ **`event_deals` rows the card already wrote are left exactly as they are** and keep working: the
customer menu reads them and Manage can still change or clear them. No migration.

### 2.6 `DemoLockChip` has a consumer again

It lost both when the offline and order-ready cards moved into the card. They are back, so the "newly
unreachable" note in `docs/event-types-stage2b-report.md` no longer applies.

---

## 3 · THE EVENT TYPE, AND THE PRIVATE EVENT, IN THE HEADER

### 3.1 The label beside Live / Not started

* **Standard shows nothing.** A label reading "Standard" on every bar, on every tab, would be a word
  carrying no information in the one strip where space is scarce.
* **A custom type** shows its colour dot and its name — from `colourFor(index in the truck's list)`,
  the **same derivation** the Event types grid and the Add event pill row use, so one type is one
  colour on every screen.
* **A private event shows nothing here** — see §3.2.

### 3.2 A private event's title is its NAME, not its venue

> `🔒 Test Private Event — Private event · 11:00–14:00`

* "Private event" is purple; the lock is in the title.
* **No name set** ⇒ `🔒 Private event · 11:00–14:00`.
* The date line underneath is unchanged.
* ⛔ **THE VENUE AND THE TOWN ARE NOT RENDERED AT ALL** in that arm — not greyed, not in a `title`
  attribute. Asserted as the absence of `venue_name`, `fmtVenue` and `town` from the private branch.
* The separate "🔒 Private event" label beside Live / Not started is **gone**: the title says it, and
  two locks on one bar is the same fact twice. `Live / Not started` and `Manage event ▾` are untouched.
* The name comes from `privateDisplayName` — the **one** formatter the Events list also uses, so a
  blank name degrades to the generic label in one place rather than three.

**Measured** (both engines, both read-only and after the change):

| width | title | truncated | `Manage event ▾` |
|---|---|---|---|
| 1440 | 839px | no | 113px, right edge 1216 of 1232 |
| 820 | 635px | **yes** (long name) | 113px, right edge 804 |
| 390 | 205px | yes | 113px, right edge 374 |

🔴 **`Manage event ▾` IS FULLY ON THE BAR AT EVERY WIDTH IN BOTH ENGINES**, with a 70-character private
name. `min-w-0` on the flexible title column plus `flex-shrink-0` on the status and the button is what
makes a long name truncate instead of pushing the button off — the brief's own requirement, and the
class of thing only a browser answers.

### 3.3 `Manage event ▾` gains two rows

* **"Change event type…"** — passed only when `eventTypeList.length > 0`, and that list is **already
  plan-filtered by the route**: Max gets Standard + Private + its own types, Pro gets Standard +
  Private, a truck with neither key gets an empty list and therefore no row. **One expression, no plan
  test on this screen.**
* **"🔒 Private link & QR code"** — passed only for a private event, opening the same panel the Events
  list opens.

Both are **optional props** on the shared `EventActionsModal`, so the KDS — its other caller — renders
unchanged.

The confirm keeps all three sentences and the escape:

> • New orders use Festival's service settings.
> • Orders already placed keep their prices.
> • Your changes for this event stay.
> ☐ Clear my changes and use Festival exactly

⛔ **And switching into or out of Private adds its own sentence, above the service bullets**, from
`lib/private-events/copy.ts`. Both directions are visible to customers on the next request — into
Private drops the event off the map, out of it publishes the address and kills the link — and neither
has a draft state to undo in, which is why neither can be a toast.

### 3.4 🔴 A REAL LEAK, CLOSED: Order link and QR on a private event

Both header buttons read `customerOrderUrl`, which was `/o/<slug>` — the truck's **public order page**.
On a private event that page does not take orders for it (the event is redacted and dropped from every
public feed), so an operator copying the link or showing the QR at a wedding was handing guests an
address that cannot order, and handing them the truck's public page instead of the one-event link the
whole feature exists to produce.

```ts
const customerOrderUrl = eventIsPrivate ? privateOrderUrl : publicOrderUrl
```

⛔ **AND IT DOES NOT FALL BACK.** If the token cannot be read, `privateOrderUrl` is `null` and both
handlers show their existing "Order URL not available" message. Falling back to the public link is how
a private event's guests end up on a public page, and the harness asserts the absence of
`privateOrderUrl ?? publicOrderUrl` explicitly.

### 3.5 One derivation of "is this event private"

`eventIsPrivate`, read by the header title, the Order link / QR address, the `Manage event ▾` private
row and the type picker's two privacy confirms. ⚠️ From `truck_events.is_private` — the visibility
source of truth — never from the type row, because an event can be private while its type is still
being read.

A second expression for this was in the file for an hour during this build. The harness now counts the
occurrences of `?.is_private===true` in the page's code and requires **exactly one**.

---

## 4 · PER-EVENT PRICES

### 4.1 The precedence is PER ITEM now

```
the event's own price FOR THAT ITEM  ??  the type's price (typed ?? rule)  ??  the menu price
```

⛔ **THE WHOLE-EVENT `price_own` RULE IS GONE FROM EVERY READER.** The old rule was "the event's own
prices REPLACE the type's whole" — one switch on the event, with its own rule and its own typed set,
and the type not consulted at all once it was on. Two things were wrong with it:

1. it made a per-event price change **all-or-nothing**. An operator who wanted £1 more on one pizza had
   to adopt a whole second rule for the event and then keep it in step by hand;
2. 🔴 **it was a second rule engine in a place nobody would look.** An event on "own prices" silently
   stopped following its type, so editing the Festival type changed every festival **except** the one
   somebody had nudged — with nothing on either screen to say why.

`resolvePricing` is replaced by `resolveEventPricing(eventTyped, type, typeTyped)` and
`priceAtEvent(menuPence, itemId, p)`. ⚠️ **`resolveEventPricing` TAKES NO EVENT ROW AT ALL**, which is
what makes "the event's rule columns are unread" a property of the signature rather than a promise in a
comment — and the harness asserts `resolveEventPricing.length === 3` and
`typeof resolvePricing === 'undefined'`.

### 4.2 Where the server follows it

| Path | How |
|---|---|
| the customer menu (`/api/menu/[truckId]`) | `priceAtEvent` per item; the map is filled only where `basis !== null` |
| submit (`/api/orders/submit`) | `loadEventPriceBook` → `priceAtEvent` per item |
| walk-up Add order + an edit's new lines (`/api/dashboard/action`) | the same book |
| the dashboard's Price column | `event_item_prices` read → `priceAtEvent`, **server-side** |

🔴 **`EventPriceBook.basis` BECAME `basisByName`.** It was one value for the whole order, because the
old rule resolved one setup per event. Under the per-item rule an event can charge its own price for one
dish and the type's rule for another, so a single basis would **label one of them wrongly on a stored
order line**. The two maps share their keys by construction, and every stamping site now requires both
— so a line is stamped with `menu_price` + `price_basis` together, or with neither.

**Placed orders never change**: the price is locked into `orders.items[].unit_price` and nothing here
touches the orders table.

**Byte-identity still holds.** For a truck with no types and no event prices, `loadEventPriceBook`
returns `loadPriceBook`'s own object by reference with empty maps — asserted as identity, not
deep-equality — and `stampEditedLines` returns the submitted array itself.

### 4.3 The column: read-only until "✎ Edit prices"

> *(the follow-up asked for mid-build — the first version had an always-open input)*

⛔ **AN ALWAYS-EDITABLE PRICE BOX WAS THE DEFECT.** Prices change rarely and are the one value on that
card a customer is charged, yet they sat in the same always-editable box as a stock number an operator
edits twenty times a service. **The easiest thing to change by accident was the only thing with a till
consequence.**

**Normal state** — plain text, right-aligned, with £:

* a `<p>`, **not a disabled input**. There is nothing to tab into and nothing to change by accident.
  Measured: `0 input(s)` in the column, `2 price cell(s)`, both `tagName === 'P'`.
* right-aligned to **one** edge, measured as a single distinct `right` value across the column.
* a price this event has changed is **blue**, with a line under the item naming what it departs from:
  **"menu £12.00 · this event"**, or **"Festival £12.00 · this event"** when the TYPE is the fallback.
  🔴 The server sends that fallback figure, computed by the same function with the event's typed set
  emptied — deriving it from `item.price` would label an event price that departs from a Festival rule
  as departing from the menu, which is a different and false claim.

**Edit mode:**

* the cells become inputs; a changed one is a blue outlined box with an **×** back to the type/menu
  price. ⛔ Clearing is a **delete**, not a £0 — £0 is a real instruction ("free tonight").
* a blue note under the header: *"Editing prices for this event only. Item limits and availability are
  locked until you save."* — and **they really are**: measured `limits live 0, switches live 0` in edit
  mode against `2, 2` in the normal state. All four controls (both limit boxes, both Available
  switches).
* a live event adds *"Live: new orders use the new prices."*
* the header's one button becomes **Cancel** + **Save prices**.

🔴 **NOTHING SAVES UNTIL SAVE.** Edits go to a client-side `pricePending` map; the harness asserts
there is **no `fetch(` anywhere in the edit arm**. **Cancel and Escape make no request at all.** Save
sends **one** `save_event_item_prices` with only the items that actually moved — press-and-leave, or
typing the same number, is dropped **before** the request, so "saves nothing" is true of the network
and not merely of the database.

**Phone width**, measured: at 390 the button is full width under the title (`358px` of `358px`); from
`sm` up it sits at the top right (`104px` of `1408px`).

| | 1440 | 820 | 390 |
|---|---|---|---|
| read-only | card 1408×237 · 0 inputs · limits 2, switches 2 | 788×237 | 358×300 |
| editing | card 1408×305 · 2 inputs · limits 0, switches 0 | 788×305 | 358×384 |

Identical in Chromium and WebKit.

### 4.4 Every plan

`event_item_prices` (read) and `save_event_item_prices` (write) are a **third** exempt set on
`/api/event-types`, beside `READ_ACTIONS` and `PRIVATE_ACTIONS`:

```ts
const ALL_PLAN_ACTIONS = new Set(['event_item_prices', 'save_event_item_prices'])
```

⛔ **THEY TOUCH NO `event_types` ROW.** The read returns computed prices; the write touches
`event_item_prices` keyed on `event_id`. A Starter truck using them cannot reach any part of the Max
feature, which is what makes the exemption safe rather than a hole. **Event-type price RULES stay Max.**
All three sets are asserted exhaustively, so a fourth member arriving in any of them fails.

### 4.5 The price beside the item name is gone

> *(the other follow-up)*

It lived there when the card had no price column. With one, the row carried **two** figures for one dish
and the more prominent one was the MENU price — not what a customer at this event pays. The name line
is the name alone; the column shows what they pay; the blue line shows the menu (or type) figure only
where this event has changed it.

### 4.6 The item id, for the dashboard only

`event_item_prices` is keyed on `menu_items_db.id`, not the name — two dishes may share a name and a
price written against the wrong one is money. So the menu API emits the id:

```ts
...(isDashboard ? { id: i.id } : {}),
```

⛔ **`isDashboard` ONLY, AND THE CUSTOMER RESPONSE IS BYTE-IDENTICAL.** A conditional spread of `{}`
adds no key at all, which matters because this is the most-requested endpoint in the product and its
shape is a contract with three clients.

### 4.7 ⚠️ FOR YOU TO RUN: how many events have `price_own = true`?

**Read-only. I have not run it.**

```sql
-- READ-ONLY. Expect 0. These are events that were put on the OLD whole-event price rule.
select count(*) as events_with_own_price_rule
  from public.truck_events
 where price_own is true;

-- If that is not 0, this names them (no customer data, no addresses):
select e.id, e.event_date, e.status, e.truck_id,
       e.price_mode, e.price_amount, e.price_rounding,
       (select count(*) from public.event_item_prices p where p.event_id = e.id) as typed_prices
  from public.truck_events e
 where e.price_own is true
 order by e.event_date desc
 limit 50;
```

**What happens to such an event under the new rule:** its **rule stops being applied** — the four
columns are read by nothing — so items it was uplifting fall back to the type's price, or the menu's.
Any **typed rows** it has keep working and now apply **per item**, which is the new vocabulary. Nothing
is deleted and no migration is needed. ⚠️ If the count is not 0, the affected events' prices change at
deploy, and that is worth knowing before you push rather than after.

---

## 5 · WHAT WAS RUN

| | |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run build` | ✓ Compiled successfully |
| ESLint | `app/`+`lib/`+`components/`: **778 errors, down one** from 779. `scripts/`: 518, unchanged. No new rule class |
| **Full sweep** | **93 run · 93 passed · 0 failed**, in five chunks with `--list=`, one at a time |
| `event-types-render.cjs` | **1,948 measurements**, 0 failed — Chromium **and** WebKit at 1440/820/390 |
| `event-pricing.cjs` | 110 passed · **15 variants, 15 failed as required** |
| `event-types.cjs` | 185 passed · 42 variants, 42 as required |
| `private-events.cjs` | 206 passed · 24 variants, 24 caught |
| `places-posts-gating.cjs` · `places-tab.cjs` · `weekly-post.cjs` · `schedule-graphics-places.cjs` | 44 · 61 · 207 · 257 |
| `HG_ENGINES=webkit outreach-bold-persists.cjs` | **44 passed (34 in a real browser)** — see the gap below |

### 5.1 ⚠️ ONE HONEST GAP: Chromium hangs on the two outreach browser harnesses

`ProtocolError: Runtime.callFunctionOn timed out`, thrown from the first `ElementHandle` call.

🔴 **IT FAILS AT `HEAD` TOO** — I stashed and re-ran — on the tree where `outreach-bold-persists`
passed **78 assertions an hour earlier**, and neither `ComposeWindow` nor `RichEmailEditor` is touched
by this build. So it is this machine's `chromium_headless_shell`, not a regression. The same local fault
is already recorded in `scripts/event-types-render.cjs`, which carries a `protocolTimeout` for it — and
that harness's 1,948 Chromium measurements passed, because it only *evaluates probes* and never clicks
an element handle.

Two things were added rather than waved through:

* `protocolTimeout: 30000` on both outreach harnesses, so a dead CDP call fails in 30 seconds instead
  of 180. ⛔ **Not a fix for a slow page**: every wait in those files is its own `waitForFunction` with
  its own timeout, so a genuinely stuck page still fails with a sentence naming what it waited for.
* **`HG_ENGINES=webkit|chromium`**, defaulting to both. ⛔ **Not a way to skip an engine that
  disagrees** — it exists so one sick browser does not mean *no* browser evidence, and the run says
  which engines it used. WebKit passes all 44.

Their source halves pass: 10 and 48.

### 5.2 Five failure classes — all in the harnesses, none in the product

1. 🔴 **A MUTATION VARIANT WHOSE ANCHOR HAD DRIFTED REPORTED ✓.** `buildVariant` returned `null` on an
   absent anchor and every caller scored `!V` as "detected" — so V8 and V9 in `event-pricing.cjs`
   passed while **mutating nothing**, because removing the whole-event rule took their anchors with it.
   **It throws now.** This is the third time this class has been met in this repository and the first
   time the mechanism, rather than the individual variant, was fixed.
2. ⛔ **RE-AIMED CHECKS, NOT DELETED ONES.** A dozen assertions read the deleted card by path and threw
   ENOENT — the honest failure. The temptation each time was to delete the assertion; every claim had a
   new subject, so each was re-aimed and the trail is written into the file. The confirm's three
   sentences have now been asserted in **three** different files.
3. ⚠️ **AN EXACT COUNT FIRED CORRECTLY, TWICE.** `schedule-graphics-places.cjs` pins how many
   `truck_events` write payloads its AST reader cannot resolve: 3 → 4 → 3, the last because
   `save_event_pricing`'s `.update(patch)` was deleted. A `>=` would have hidden both moves.
4. ⚠️ **A TRUNCATED REPORT IS NOT THE LINE.** The lost-line guard prints `l.slice(0, 100)`. I anchored
   a pattern on the printed text and matched nothing — twice: once on the truncation point, once on a
   trailing space that `trim()` had already removed.
5. ⚠️ **A SLICE WHOSE END ANCHOR HAD BEEN RENAMED** ran to the end of the file, so an "exactly one
   fetch" count was taken over the whole 6,000-line component and passed for the wrong reason. It is
   bounded by a string that is now asserted present.

### 5.3 What the line-level guards had to be told

`event-types.cjs`'s "EVERY LINE THAT LEFT THE DASHBOARD PAGE IS AN ENUMERATED MOVE" reported seven
losses across this build, every one deliberate. Each is now an entry with a **companion check** that
fails if its replacement is not present:

| Lost line | Replacement, asserted |
|---|---|
| `const customerOrderUrl = truck?.slug ? scanUrl(…)` | `publicOrderUrl` + the private-aware `customerOrderUrl`, **and** the absence of `privateOrderUrl ?? publicOrderUrl` |
| the item-name line carrying `£{item.price}` | the name alone, **and** the Price column header present |
| four controls that gained a `disabled` | the "limits and availability are LOCKED in edit mode" assertion, which checks all four |

---

## 6 · LOCALHOST TESTS — Pizza Kitchen only

`npm run dev`, then Pizza Kitchen's dashboard.

1. **The card is gone.** Dashboard → Settings. There is no "This event" card at the top.
2. **The four controls are where they are on the live site.** Down that tab: *Offline order protection*
   (its own card; switch it on and the two modes appear, with the delay under "Keep taking orders"),
   *Separate paid step* with **"Do you take cash?" nested under it**, *Order-ready step*, *Remind me to
   add a buzzer*, *Collection times*. Toggle each and confirm the toast names this event.
3. **No per-deal switches on the dashboard.** They are in Manage › Schedule, on the event.
4. **The header label.** With the event on **Standard**: nothing after "Live". Assign a **custom type**
   (step 5): a colour dot and its name appear. 
5. **Change event type.** `Manage event ▾` → **"Change event type…"** → pick Festival → the confirm
   lists the three sentences and the "Clear my changes and use Festival exactly" box → Switch.
6. **A private event's header.** Open a private event. The title reads **"🔒 \<its name\> — Private
   event · 11:00–14:00"** in purple, with **no venue and no town**, and there is **no second lock**
   beside "Live". Clear the name in Manage and reopen: **"🔒 Private event · 11:00–14:00"**.
7. **Order link / QR on a private event.** Press **Order link** — it copies `/p/<token>`, **not**
   `/o/pizza-kitchen`. Press **QR code** — the code scans to the same private link. Then
   `Manage event ▾` → **"🔒 Private link & QR code"** opens the panel.
8. **Prices are read-only.** Menu & Stock. Every price is plain **"£13.00"**, right-aligned. Tap one:
   nothing happens — there is no box.
9. **Edit prices.** Press **"✎ Edit prices"**. The cells become boxes, the blue note appears, and the
   **item-limit boxes and Available switches go grey and stop responding**. Change one price. Press
   **Cancel** → everything is as it was, and the price did not change.
10. **Save prices.** Edit again, change one price, press **Save prices**. That item shows blue with
    **"menu £12.00 · this event"** under it. Press **✎** again and the **×** → it goes back to the
    menu price.
11. **The customer sees it.** Open `/trucks/pizza-kitchen/order` for that event: the edited item is at
    the new price, as **one figure**. Open a **different** event's order page: the old price.
12. **A pay-at-hatch order at the event price.** Dashboard → **+ Add order** → add the edited item →
    the line is at the event price → take the order → the order card and the receipt show that figure.
13. **Escape is Cancel.** In edit mode, focus a price, press **Escape** — the editor closes and nothing
    is saved.
14. **Phone width.** At 390px, "✎ Edit prices" is a full-width row under "Items — this event"; in edit
    mode Cancel and Save fill that row.

---

## 7 · WHAT I DID NOT DO

* **Nothing pushed, nothing deployed.** `main` is local; `schedule-graphics` is fast-forwarded to match.
* **No SQL run**, and none written — this build needed no migration.
* **No Gusto data read or written**, and no other live trading truck touched.
* **No real card charge, no real outreach email.** The bold harness stubs `window.fetch` before the
  component mounts and *records* the send.
* **No process killed by name** — every background task was stopped by the id the tool returned.

## 8 · OPEN ITEMS

| Item | State |
|---|---|
| **Deploy** | yours — `git push origin main`, then the live checks in the manual's §74.6 |
| ⚠️ **`price_own = true` in production** | one read-only query, §4.7. If the count is not 0, those events' prices change at deploy |
| Chromium hangs on the two outreach browser harnesses on this machine | WebKit covers them; `protocolTimeout` added. Worth `npx puppeteer browsers install chrome` before the next build |
| `truck_events.price_own / price_mode / price_amount / price_rounding` | in the database, read by nothing. A drop migration when something else needs one |
| From V14.0 | the four pre-`20261007` migrations are outside the stated applied range; the schema census covers 14 of the 66 tables the code reads |
