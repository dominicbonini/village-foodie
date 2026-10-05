# Private events — a built-in "Private" type, a private link + QR code, scraper marking, Pro access

**Branch `schedule-graphics` only.** No branch switch, no push, no merge, no deploy. No SQL was run by
me — `supabase/migrations/20261014_private_events.sql` was written and handed over, and **you applied
it mid-build** (§2's verification is quoted in §1.2 below). Nothing read or wrote any live trading
truck; the scraper was never run — its detection is tested against fixtures only. No card charge was
created.

**Pre-build tree: `0ce4c83`** ("Record the combine: the report, and three open items closed"). Pinned
by that SHA in `scripts/private-events.cjs`, never as `HEAD`.

---

## Written for

Dominic, as the operator of this build and the person who runs the SQL and the localhost tests.

---

# 0 · The prompt, read back

No span arrived garbled, and no instruction contradicted another. One thing the brief **required but
did not name** had to be added, and it is the only addition to the data model beyond the six columns
you specified — see §1.3.

---

# 1 · The data

## 1.1 What 20261014 adds

| | |
|---|---|
| `event_types.kind` | `text NOT NULL DEFAULT 'custom'`, CHECK in `('custom','private')` |
| `event_types.private_link_ordering` | `boolean NOT NULL DEFAULT true` |
| `truck_events.is_private` | `boolean NOT NULL DEFAULT false` — **the visibility source of truth** |
| `truck_events.private_name` | `text NULL`, CHECK trimmed and 1-80 |
| `truck_events.private_token` | `text NULL UNIQUE`, CHECK `[A-Za-z0-9_-]{22,64}` |
| `truck_events.private_link_ordering_override` | `boolean NULL` — three-state |
| `public.private_event_links` | **new table** — retired tokens only (§1.3) |

Plus two CHECKs worth naming: `truck_events_private_token_needs_private` (a token can only exist on a
private event) and the index `truck_events (truck_id, is_private, event_date)`, which is the shape every
public feed's question actually has.

⛔ **IT CHANGES NO EXISTING ROW, AND THERE IS NO BACKFILL ANYWHERE IN IT.** The harness asserts the
migration contains no `update` or `insert` on `truck_events` at all. Pizzeria Gusto's six "Private
Hire" rows are counted in §0 and §2 so you can see them before and after, and they are otherwise
untouched.

## 1.2 Your §2 verification, as returned

| what | n |
|---|---|
| private events | 0 |
| tokens issued | 0 |
| private-type rows (created lazily by the app) | 0 |
| retired link rows | 0 |
| rows mentioning "private" that are still `cancelled` | **6** |

That is exactly right: nothing was created, nothing moved, and Gusto's six rejected rows are intact.

## 1.3 The one thing the brief required but did not name

🔴 **`public.private_event_links` — and the brief cannot be built without it.** Decision 7 says the old
link must show *"This link no longer works — [Truck] has replaced it."* **Naming the truck means
resolving the old token after it has been replaced** — and if "Make a new link" simply overwrites
`truck_events.private_token`, the old value is gone and `/p/<old>` can only 404. A guest holding a
printed table card would get "not found", which is indistinguishable from a typo and tells them nothing
about what to do next.

So every retired token is recorded: the token (primary key, so a dead link is the cheapest possible
answer on a public rate-limited route), the truck, the event, when, and **why** — `replaced` or
`made_public`, which get different sentences. Append-only, service-role only, and it **never holds the
live token**: one source of truth for "the link" (the event row) and one for "links that used to work".

## 1.4 Why `is_private` is a column and not a join

A private event's type **is** Private (decision 2), so `event_type_id → event_types.kind = 'private'`
looks like enough. It is not, and must never be what a public surface reads:

- 🔴 **`event_type_id` is `ON DELETE SET NULL`.** Deleting a type must not delete a truck's events — so
  if visibility were read through the type, **deleting the Private type would turn every private event
  into a public one, with its venue, town and coordinates on the map**, silently, with no error
  anywhere. A visibility rule cannot live on a nullable foreign key.
- Reading it would cost a join on every public feed; a boolean is one column in a probe that already
  runs, which is what makes failing closed cheap.

The type is what the **operator** sees and configures; the boolean is what every public surface filters
on. `applyPrivacy` writes both together.

## 1.5 The partial index, and the 42P10 lesson applied rather than feared

`event_types_one_private_per_truck_uidx` is **partial** — `(truck_id) where kind = 'private'` — because
a plain `unique (truck_id, kind)` would forbid a truck having two *custom* types, which is the normal
case.

⛔ **AND NOTHING UPSERTS ONTO IT.** The Private row is created with **SELECT-then-INSERT and a 23505
retry**; there is no `onConflict` anywhere near `event_types`, the harness proves it for the whole
repository, and `scripts/event-pricing.cjs` §7b still guards every `onConflict` in `app/` and `lib/`.

⚠️ **The lesson of 20261013 is not "never use a partial unique index" — it is "never make one the target
of an upsert."** Used as a constraint that raises 23505, which the insert path handles as the expected
race, a partial index is exactly the right tool here. Saying so matters: the alternative reading would
have pushed me into a plain `unique (truck_id, kind)` that breaks the common case.

---

# 2 · The public surfaces — all eight of them

§70.2 named three. It is **eight**, and the two it missed are the ones that would have leaked in prose:

| Surface | file | Handling |
|---|---|---|
| VF listing + truck page + **the map** (one mapper) | `app/api/discovery/events/route.ts:266` | **drop** |
| the customer schedule the order page reads | `app/api/events/route.ts:118` | redact |
| the embed widget **and** `app/domain/page.tsx` | `app/api/embed/events/route.ts:92` | redact |
| the weekly poster | `app/api/weekly-post/route.ts` → `lib/weekly-post/week-data.ts:96` | redact |
| the single-event post | `app/api/weekly-post/route.ts` (`event_post`/`event_render`) | **refused** |
| the menu API's event auto-detect | `app/api/menu/[truckId]/route.ts:193` | **drop** |
| the WhatsApp reply's grounding | `lib/whatsapp/upcoming-events.ts` | redact |
| **…and each webhook's own copy of that query** | `app/api/webhooks/meta/whatsapp/route.ts`, `app/api/webhooks/whatsapp/route.ts` | redact |

🔴 **THE TWO WHATSAPP WEBHOOKS WERE THE DANGEROUS ONES.** Each carries its own copy of the
upcoming-events query (the shared helper's header records why they were never re-pointed), and the rows
ground a **language model** that then answers "where are you this week?" in prose. A venue reaching
that prompt would be published **in a sentence nobody wrote and nobody reviewed** — there is no field
to audit afterwards, only a message already sent. All three now go through `redactPrivateRows`, and the
row **survives** as "Private event" rather than being dropped, so the truck still reads as busy that
day instead of free.

⛔ **THE REGISTER IS DATA IN THE HARNESS, NOT PROSE.** `scripts/private-events.cjs` §1 holds the list;
a named surface that stops consulting the privacy read fails. A list in a report is a list somebody has
to remember.

## 2.1 Drop vs redact is a decision

- **Drop** on the map/discovery and the menu auto-detect. The map plots `latitude`/`longitude`, so a
  redacted row there would still be a row — in the listing, in "events near you", and needing a special
  case in every consumer of that payload. Absence needs no special case.
- **Redact** on the truck's own schedule. A customer should see that the truck is busy that evening —
  that is the whole reason an operator wants it listed. `orderLinkHg` is forced **false** for a private
  event, which is how "no Order button" is enforced on the embed without a second place to change.
- **Refuse** the single-event post. A one-event poster exists to be published; "Private event" over a
  background with an Order link is an advert for something nobody can come to. The **weekly** poster
  still lists it, because that poster's job is to show the week.

## 2.2 Fail closed — and this is the opposite of event pricing

🔴 Event pricing fails **open** because open means "charge the menu price", which is what this product
charged before that build (§70.9). **Privacy has no such luck: open means publishing a wedding's
address.** So every read in `lib/private-events/read.ts` fails **closed** —
`readPrivateEventIds` answers `true` for everything when it cannot read, **including ids it was never
given** — and the harness asserts the direction in both code and prose so nobody "fixes" it.

⚠️ **THAT MAKES THIS BUILD DEPLOY-COUPLED, UNLIKE EVENT PRICING, AND IT IS WORTH SAYING OUT LOUD.**
Before 20261014 was applied, every probe failed and every event read as private. You have applied it,
so this is now historical — but if this ever ships to an environment without the migration, the public
feeds go quiet rather than leaky. That is the safe direction and still a visible regression.

## 2.3 Two correctness details the brief flagged, and one it did not

- 🔴 **The dedup key is built on the REAL venue name, before any substitution** (`app/api/events/route.ts`).
  Substituting first gives every private event on one date the key `date|Private event|`, so the second
  is dropped as a duplicate — **a truck with two private bookings in an evening publishes one of them**.
  Asserted by order in the source, which is the only thing that decides it, with a variant that swaps
  the two statements.
- 🔴 **The menu auto-detect query is UNCHANGED**; a private pick is discarded *after* it. Adding
  `.eq('is_private', false)` to it would make a missing migration break the auto-detect for every
  truck. It does **not** fall through to the next public event: "the earliest" is this endpoint's
  contract, and silently serving a later day's menu would be worse than serving none.
- ⛔ **`notes` is redacted too, and the brief does not list it.** Decision 4 says "date and times only",
  and an operator's note on a private event — *"ring the bell at the side gate, ask for Sarah"* — is
  exactly the kind of thing that must not be published. The brief's list is of location *columns*; this
  is the same rule applied to the field that most often contains a location in prose.

## 2.4 The redaction is a whitelist

`redactPrivate` builds a **new** object from the fields allowed out. A function that *deleted* the five
location columns would be correct today and **wrong the first time a sixth is added to `truck_events`**
— the new column would publish by default, silently, and nothing would fail. A variant asserts it is a
built object and not a set of `delete`s.

---

# 3 · The link

- **`/p/<token>`** resolves the token **on the server**, before anything renders, and forwards to the
  normal ordering page as `?event_id=…&pt=<token>`. ⛔ Not a second ordering page: a private event's
  prices, slots, deals, stock and capacity all work because they are the same code.
- Four outcomes, four different pages: **ok** (forward), **ordering_off** ("order at the hatch" — the
  event is real, so "this link doesn't work" would be a lie), **replaced** (names the truck), and
  **unknown**. `unavailable` deliberately gets the same words as `unknown` — a guest cannot act on the
  difference, and telling them would tell anyone probing whether a token exists.
- **Token**: 24 random bytes → **32 base64url characters, 192 bits**, from `crypto.randomBytes`. Above
  the brief's 128-bit floor because the extra characters cost nothing (nobody types this) and being
  wrong costs a stranger ordering from a wedding. UNIQUE across the table, because it is resolved with
  no truck in hand. The table CHECKs its shape so a short one cannot be written by hand.
- **Registrations**, both asserted by the harness:
  - `/p/(.*)` → `X-Robots-Tag: noindex, noarchive, nosnippet` in `vercel.json`, plus the route's own
    `metadata.robots`;
  - **`/p` AND `/api/private-event`** in `proxy.ts`'s `isGeneralPublic`. Without the second, both would
    be **unmetered public database reads** keyed on a string anyone can vary — the exact regression the
    `/o/` note in that file records. A token is unguessable; the *endpoint* is not, so `/p/<junk>` can
    be hammered forever.
- **QR**: the existing `qrcode` dependency through `lib/generateQRCode.ts`'s `generateQRWithLogo` — the
  same function the customer QR modal and the Settings poster call, so the truck's logo lands in the
  middle of this code exactly as it does on their hatch poster. ⛔ **No new dependency was added.**
- **Table cards**: A6, four to an A4 sheet, printed from a self-contained new window (printing from the
  dashboard would print the dashboard). `@page { margin: 0 }` and a 2×2 grid of exact halves, because
  A6 is exactly a quarter of A4 — a browser's default margin shrinks all four and is the single most
  likely cause of a card that will not scan.

## 3.1 The order gate

`app/api/orders/submit/route.ts` admits an order against a private event **only** with the event's
current token:

- ⛔ **The token and the event id are matched in ONE query.** Checking the token and then separately
  trusting the posted id would let a guest at one wedding order against another — a token proves access
  to one event, not to the truck.
- 🔴 **Where it sits is load-bearing**: after the event is resolved (so there is an id to ask about) and
  **before `loadEventPriceBook`**, so a refused order never reaches the money path, the stock decrement
  or the slot booking. Asserted by source order, with a variant.
- ⛔ **Before the card fork**, so one check covers card and pay-at-hatch rather than two that could
  drift.
- ⛔ The refusal is a 403 with one sentence and no detail about whether the event exists or was ever
  private. The guest's own page never sees it — it holds a live token.
- ⛔ The token is **never stored on the order and never logged**. Asserted.

## 3.2 "Make a new link"

The old token stops working **immediately** — there is no grace period and there must not be one; the
reason an operator presses this is that the link got somewhere it should not have. The old one is
**retired, not forgotten**, so the printed cards say "replaced" rather than 404. The confirm names the
consequence that cannot be undone: *the cards already on the tables*.

⚠️ **An ordinary save KEEPS the token.** Re-rolling it whenever an unrelated field changed (a time, a
note) would silently break every printed card.

---

# 4 · Plans

| | |
|---|---|
| `event_types` (**Max**, unchanged) | making your own named presets; the PRICES rows |
| `private_events` (**Pro**, new) | the built-in Private type, the link/QR switch, the private link |

`private_events` went into `PRO_FEATURES`, which is exactly "Pro, Max and trial" — `MAX_FEATURES`
spreads it and `TRIAL_FEATURES` spreads that, so one entry grants pro/max/trial/tester/demo.

So a **Pro** truck sees the Event types tab with **Standard + Private only**: "+ New event type" and
the PRICES band carry a **Max** badge (a lock *plus the word*, because the Private column already
carries a lock meaning "built in") and are refused server-side. ⛔ A single key could not express that,
and gating the tab on `event_types` would have hidden a Pro feature behind a Max wall.

- `load` is open to **either** key — otherwise a Pro truck would reach a screen it is entitled to and be
  told to upgrade off its own feature.
- `privateEditable = canPrivate && !busy` is separate from `editable`, because `readOnly` is the *Max*
  gate: without it a Pro truck would see its own Private column drawn read-only.
- ⛔ **A downgrade unpublishes nothing.** An existing private event keeps `is_private` and its token:
  the link goes on working and the venue stays off the map; the screens go read-only. Taking a billing
  change as permission to re-publish a wedding would be the worst possible reading of it.
- ⛔ **Making an event PUBLIC is never gated.** A downgraded truck must always be able to do that, and
  it is the safe direction anyway. A variant asserts the gate is on the private direction only.
- ⚠️ **Switching a test truck's plan locally:** `trucks.plan` and `trucks.feature_overrides` are what
  `canAccess` reads, so Pro can be simulated by setting `plan = 'pro'` on **test-kitchen** — but that is
  a production row and a write, so **I have not done it and I am not asking you to.** The cheaper check
  is `feature_overrides`, which `canAccess` consults first; either way it is a database change on a
  real truck, so §7 step 11 says how to verify the Pro view **without** one.

---

# 5 · Marking

## 5.1 By hand

The tick is in Add/Edit event, in a purple panel **above the address fields** — ticking it is the
operator saying "the address below is not for the public", so they meet the question before they type
it rather than after. Ticking reveals **Event name**, with the brief's helper line word for word.
The helper under the tick states exactly what the public sees, because the whole decision rests on
believing it.

## 5.2 By scraper

`\bprivate\b`, case-insensitive, **whole word, and nothing else** — one pure function
(`lib/private-events/detect.ts`) shared by every path that asks. "Private Hire", "private event",
"PRIVATE PARTY" → private; "Privateer Brewery", "privately" → not.

⛔ **"wedding" is NOT a trigger, by decision.** A wedding fair is public trade a truck very much wants
on the map, and a scraper that hid it would be hiding trade. The cost of a miss is one tick in the
approval queue; the cost of a false positive is trade that silently never appears.

🔴 **THE SCRAPED INSERT SETS VISIBILITY AND NOT THE TOKEN**, and the split is deliberate:
- **Visibility** must be right from the instant the row exists. A scraped event is `unconfirmed`, and
  §15 says pending events are customer-invisible — but the discovery feed reads
  `status in ('confirmed','open')`, not "reviewed", so the margin is thinner than it sounds and a wrong
  default here is a leak waiting on one approval.
- **The type and the token** are decisions about service, and nobody has looked at the event yet.
  Issuing a working private link from a scraped guess would mean publishing an ordering page no
  operator approved. Both are written by `applyPrivacy` at **confirm**.

⚠️ **No name, ever, from a scrape.** "Private Hire" is a field on somebody's website, not the name of a
wedding, and putting it at the top of a guest's order page would publish scraped text as if the
operator had written it.

A private event with link ordering on **cannot be confirmed without times** — the guest's page shows a
closing time and the ordering window derives from them. The scraper never captures times for these
rows (your live facts say so), so that is the **normal** path for an approved private event, not an
edge case, and it gets its own sharper message.

---

# 6 · One writer, proved — and the matcher that got it wrong first

`is_private`, `event_type_id`-for-private, `private_name` and `private_token` are **four facts about
one state**, and every inconsistent combination is a defect with teeth:

| broken combination | what the operator or guest gets |
|---|---|
| `is_private` true, no token | a private event nobody can order from |
| a token, `is_private` false | a working private link to a public pitch |
| `is_private` true with a *custom* type | decision 2 broken; the grid shows the wrong column |
| `private_name` left after untick | a public event carrying a wedding's name |

So `lib/private-events/write.ts` is the only door, with **two sites allowlisted by name**:
`write.ts` itself, and the scraped insert — which **spreads `scrapedPrivacyFields()`** and names no
column itself, specifically so this proof stays exact.

⛔ **THE FIRST MATCHER REPORTED SIX WRITERS OF `is_private` AND FIVE WERE FALSE POSITIVES** — a
TypeScript interface field, the redaction whitelist (the *opposite* of a write), a key in the JSON a
feed publishes, a flag attached to an in-memory row for the poster, and the edit form's local state.
An allowlist padded out with those would have proved nothing. A write is now defined **structurally**:
a key inside the argument to `.insert(`/`.update(` in a chain whose nearest preceding `.from('…')`
names the table.

⚠️ **And the file is SPLIT on `.from('` rather than matched with a bounded lookahead.** The bounded
version — `.from\('truck_events'\)([\s\S]{0,1200}?)(?=\.from\('|$)` — did not merely truncate a long
chain: it **failed to match at all** and the engine skipped that chain entirely. The approval queue's
confirm is a long handler and was invisible to it, which is how variant V14 (a second writer of
`is_private` added there) reported "MUST BE CAUGHT BUT WAS NOT" against a check that looked fine.

---

# 7 · The defect this build found in its own work

🔴 **THREE EDIT BUTTONS EACH BUILT THE EVENT FORM'S INITIAL STATE INLINE.** That was survivable while
the form's fields never changed. It stopped being survivable the moment one of them was a privacy flag:

The save sends an **explicit** `is_private` — it has to, or unticking the box would be a no-op. So a
builder that omitted it seeded the form as "not private", and **an operator opening Edit on a wedding to
fix a typo in the time and pressing Save would have published its address** — silently, with no warning,
and no way to know. Three copies meant three chances to miss it.

There is now one `editFormFor(event)`, it carries `is_private` and `private_name`, and V15/V15b are the
variants that keep it that way.

⚠️ **"Duplicate" deliberately does NOT copy privacy or the name.** Copying `true` would silently make a
new public pitch private — the truck would wonder why their Saturday vanished from the map; copying the
name would put "Sarah & Tom's wedding" on an unrelated event. Both are stated as explicit `false`/`''`
rather than omitted, because an omitted `is_private` means "do not touch" on an edit and nothing on a
create, and a reader would have to know which branch they were in.

---

# 8 · What was run

| | |
|---|---|
| `scripts/private-events.cjs` (new, registered) | **✅ 176 passed · 24/24 variants caught** |
| `scripts/event-types.cjs` | **✅ 155 passed · 42/42 variants caught** |
| `scripts/event-pricing.cjs` | **✅ 104 passed · 14/14 variants caught** |
| `scripts/event-types-render.cjs` | **✅ 1506 measurements passed · 0 failed**, Chromium **and** WebKit, 1440/820/390, all 20 PNGs regenerated |
| `npx tsc --noEmit` | clean |
| `npx next build` | clean; `/p/[token]` and `/api/private-event` both build |
| ESLint, added lines | **no new error in any touched file** — the manage page back to its 366 baseline, the dashboard page to 83, every new file clean |
| `run-harnesses.cjs --dry-run` | all **89** listed files pass the source screen |

## 8.1 Byte-identity for a truck with no private events

Pinned to **`0ce4c83`** and asserted, not claimed:

- the pre-existing event `select` in `app/api/events/route.ts` and `app/api/embed/events/route.ts` is
  **byte-identical** — the privacy probe is a **separate** read, and for such a truck it returns an
  empty set, which removes nothing and redacts nothing;
- the menu auto-detect **query** is byte-identical (only a discard was added after it);
- 🔴 **`TYPE_COLS` in `lib/event-types/read.ts` is byte-identical and does NOT contain `kind`.** That
  select also feeds the **service** resolver — one missing column there would fail it and take
  collection times, the mark-ready step and offline protection down with it: a privacy migration
  breaking the hatch. `kind` comes from its own probed read (`readTypeKinds`), which fails **open**
  because it decides what the operator's grid *draws*, not what the public sees. Variant V11 catches
  `kind` creeping back into `TYPE_COLS`.
- `applyPrivacy` **writes nothing at all** for a public event that stays public — the branch every
  event in the table takes today.

## 8.2 Two render-harness slips, both mine

- A `.slice(0, typeCount)` left **dangling onto the next statement** threw `1.slice is not a function`
  before a single measurement ran. The line is now written out in full with that recorded above it.
- An assertion pinned the computed colour as `rgb(126, 34, 206)`. **Both engines serialise it as
  `lab(…)`** — Tailwind v4 emits oklch — so it failed **37 times** against a screen that was drawing the
  purple correctly. Pinning a serialisation is pinning the browser's string formatting, not a design
  fact. It now measures the built-in's heading as a **difference** from a custom type's, which is what
  a purged or renamed class actually breaks, in whatever colour space the engine reports.

## 8.3 Process

I ran one copy of each harness at a time. I started no process I did not stop by its recorded id, and
killed nothing by name or pattern.

---

# 9 · Test list — Pizza Kitchen only

⛔ **Never Pizzeria Gusto or any other live trading truck.** Card payments: pay-at-hatch only.
The migration is already applied, so these are ready to run.

**The grid**
1. Schedule › **Event types**. There is a **Private** column, **last**, with a 🔒 and purple text. Its
   ⋯ menu offers **only "Match Standard"** — no Rename, Move or Delete.
2. An **ORDERING** band above PRICES, with one row: *"Take orders by private link and QR code"*.
   Standard's cell reads **"Open to everyone"** (text, not a switch); every custom type's cell is blank;
   only **Private** has the switch, and it is **on**. Turn it off and on — it saves with no error.

**Making one private**
3. Schedule › Events › **Add event**. A purple **"Private event"** panel sits above the address fields.
   Tick it → an **Event name** field appears. Type `Sarah & Tom's wedding`, fill in a venue, a date and
   **both times**, save.
4. The Events list row shows a purple **🔒 Private** chip, the name under the venue, and a **Link & QR**
   button. ⚠️ The venue name is still shown — this is your own schedule.
5. Press **Link & QR**: a QR code with your logo in the middle, the link with **Copy**, **Download QR**
   and **Print table cards**. Print preview should show **four A6 cards on one A4 sheet**, edge to edge.

**What the public sees**
6. Open the truck's order page (`/trucks/pizza-kitchen/order`). The event appears as **"Private event"**
   with the date and times, **no venue, no town, no postcode**, and **no Order button**.
7. Check it is **absent** from the Village Foodie map and listing, and from `/embed/pizza-kitchen`
   it appears redacted with no Order CTA.
8. Weekly post › the poster lists it as **"Private event"** with its times and **no location line**.
   Try **Make post** on it from the Events list — it is **not offered**, and the route refuses.

**The link**
9. Open the private link in a browser (or scan the QR with a phone). You get the ordering page with a
   purple **PRIVATE EVENT** label and the event's name at the top. Place a **pay-at-hatch** order — it
   goes through.
10. Press **Make a new link**, confirm. The QR on screen changes immediately. Open the **old** link →
    *"This link no longer works — Pizza Kitchen has replaced it…"*. The **new** one still works.
    ⚠️ Also try ordering with the old link's URL still in the address bar — the order is **refused 403**.

**Pro view, without touching billing**
11. ⛔ **Do not change `trucks.plan` on a real truck to test this.** Instead: the two gates are separate
    keys, so the Pro view is `canPrivate && !canTypes`. The cheapest honest check is to read the
    `/api/event-types` `load` response in the browser's network tab and confirm it returns
    **`canPrivate: true, canTypes: true`** for test-kitchen (a trial truck gets both). If you want to
    *see* the Pro screen, tell me and I will write a one-line `feature_overrides` change for you to run
    and revert — I have not written one, because it is a write to a production row.

**Unticking**
12. Edit the private event, **untick** "Private event", save. The chip and the Link & QR button go; the
    venue, town and postcode reappear on the public schedule and on the map. Open the old link →
    *"…has made this event public."*
13. ⛔ **The regression test for §7:** make an event private again, then open **Edit**, change only the
    **end time**, and save. It must **still be private** — chip intact, link unchanged.

**The scraper**
14. Nothing to do. Its detection is tested on fixtures only (`scripts/private-events.cjs` §6), and
    Gusto's six existing rows are untouched. The first time a *new* "Private Hire" row arrives it will
    appear in the approval queue already marked private, with the time gate asking for times.

---

# 10 · Open, and named rather than hidden

- **The approval card's UI is server-ready but not drawn.** `events/action` accepts `is_private` and
  `private_name` on confirm, applies them through the one writer, and gives the private-specific time
  message — but the pending-event card in Manage does not yet render the Private badge, the untick or
  the name field. A scraped private event therefore arrives correctly hidden and is confirmed as
  private by default; the operator unticks it from **Edit event** instead. One block in the pending
  row; say the word and it goes in the next prompt.
- **`/api/slots` is not privacy-filtered, deliberately.** It is keyed by event id, publishes no
  location, and the guest's page needs it. Naming it so nobody reads its absence as an oversight.
- **The walk-up order path** (`dashboard/action`) is not token-gated: the caller is the operator's own
  dashboard token, and the operator *is* the truck.
- **`feature_overrides`-based Pro testing** is not wired into any harness, for the reason in §4.
