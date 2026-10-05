# The bold bug, the private preview, the pin, and a preview key

**5 October 2026 · branch `schedule-graphics` · nothing deployed, nothing sent, no SQL run**

This report covers three pieces of work, in the order they were done:

1. **The bold bug** — formatting a selection in the outreach composer and watching it come back. Found,
   explained, fixed, and pinned by a new real-browser harness in Chromium *and* WebKit.
2. **Part A** — "Make post" hidden on a private event; the Add/Edit preview card for a private event;
   and five Places follow-ups including a new migration, `20261016`.
3. **Part B** — Places and Social posts limited to one truck through a new feature key that is in
   **no plan at all**.

Part C — the merge into `main`, the full harness sweep as a release gate, migration ordering, the
Gusto list and the deploy steps — is deliberately not here.

---

## 1 · THE BOLD BUG

### 1.1 What was reported

> 1. Select all the text, press **B** → it all goes bold. (fine)
> 2. Select the text again, press **B** → it goes not-bold. (fine)
> 3. Click to deselect → **the text switches BACK TO BOLD on its own.** (the bug)

And, separately, from the previous build: *"when I click on the message body the 'b' button still turns
on and off."*

And one more observation, which is the one that found it: **"the I for italic button seems to work."**

### 1.2 What I looked for first, and why it was wrong

The brief's own suspicion — and mine — was that the editor's content was being re-set from a stale
copy: that `ComposeWindow`'s `onChange` decides whether an emission counts as "an edit" by comparing
**plain text**, that a mark-only change has identical plain text, and that `editedDoc` therefore never
updated, leaving the content effect to call `setContent` with the old document.

That reading is wrong, and the file says so: `onChange` stores the document **unconditionally** and only
the *"you have edited this message"* flag is conditional.

```tsx
onChange={d => {
  setEditedDoc(d)                                    // ← always
  if (docPlainText(d).trim() !== docPlainText(templateDoc).trim()) {
    setEdited(true); setLogged(false)                // ← only the FLAG is conditional
  }
}}
```

So I stopped reasoning about it and built the browser test the brief asked for.

### 1.3 What the browser showed

`scripts/outreach-bold-persists-render.cjs` mounts the **real `ComposeWindow`** (not the editor under a
toy parent — see §1.7) with every network call stubbed, and performs the three steps with real mouse and
keyboard events. Instrumented, Chromium printed this:

```
--- initial bold tags: 1
--- STEP 1
  EMIT boldmarks=5            ← everything went bold
    bold tags: 5
--- STEP 2
  EMIT boldmarks=0            ← the unbold applied…
  EMIT boldmarks=5            ← …and something immediately re-bolded it
    bold tags: 5
    bold tags after 1.2s: 5
--- STEP 3 click
  EMIT boldmarks=0            ← a click in the TEXT changed the document
    bold tags: 0
```

Two things there cannot be explained by a stale document:

* a **second** transaction at step 2, immediately after the unbold;
* a transaction at step 3, when the only input was a mouse click **inside the message body**.

Stack traces put both inside TipTap's `CommandManager.run` — a command chain, not a `setContent`. No
`SETCONTENT` was logged at all. So React was never involved.

Logging every `mousedown` alongside the B button's own handler gave the answer in one line:

```
MOUSEDOWN DIV "Hi George,I ru" 400,356
B CLICK #1 isTrusted=true detail=1      ← a click in the MESSAGE BODY ran the Bold button
```

### 1.4 The cause

`components/admin/ComposeWindow.tsx` wrapped the whole message field — **the toolbar included** — in a
`<label>`:

```tsx
<label className="block">
  <span className={LABEL}>Message — this is the email…</span>
  <RichEmailEditor … />        {/* ← the toolbar is INSIDE this component */}
</label>
```

A `<label>` forwards a click anywhere inside it to its **labeled control**: its first labelable
descendant. `<button>` is a labelable element. The first button inside that wrapper is **B**.

So every `mousedown` in the message body dispatched a real, trusted activation click to the Bold button,
which ran `toggleBold()` against the selection ProseMirror still held — **the whole document**, because
the click's default had not yet collapsed it.

That is the reported sequence exactly:

| step | what the operator did | what actually happened |
|---|---|---|
| 1 | Cmd+A, click **B** | mixed selection → all bold |
| 2 | Cmd+A, click **B** | all bold → all plain, **then the stray click from `selectAll`'s own click in the body re-bolded it** |
| 3 | click to deselect | the `<label>` fired **B** again against the still-whole selection → the text "went back to bold on its own" |

**And it explains why Italic worked.** A label activates exactly **one** control, and B is first in the
toolbar. Reordering the buttons would have moved the bug, not fixed it. The operator's observation that
I was the one who needed — "the I button seems to work" — was the decisive evidence.

### 1.5 The fix

The wrapper is a `<div>`. The accessible name is kept without the element:

* the rich editor already carries `aria-label="Message"` on its contenteditable;
* the WhatsApp textarea (the other branch of that wrapper) gets the same sentence as an explicit
  `aria-label`;
* the sentence itself is now **one constant**, `MESSAGE_LABEL(isEmailChannel)`, read by the visible
  `<span>` and by that `aria-label`, so the two cannot diverge.

`htmlFor`/`id` would **not** have helped: a label with a `for` still forwards the click, it just forwards
it somewhere else.

**⛔ The rule, written into the file: never put a toolbar inside a `<label>`.**

### 1.6 A second, older defect the browser found: there was no Undo

The brief required that *"nothing ever restores an earlier version except Undo (Cmd+Z), which must work
for mark changes"*. Pressing Cmd+Z in both engines did nothing at all.

**Cause:** this editor builds its extension list by hand — that is the point of the schema note at the
head of the file — and `StarterKit`, which normally brings history along, is deliberately not installed.
Nothing had ever loaded `prosemirror-history`. **Every Cmd+Z in the compose box has silently done nothing
since the editor shipped.**

Fixed with a local `History` extension built on `@tiptap/pm/history`, which already ships inside the
pinned `@tiptap/pm` meta-package — **no new dependency, no new version to keep in step**. It binds
`Mod-z`, `Shift-Mod-z` and `Mod-y`. A mark change is an `AddMarkStep`/`RemoveMarkStep`, which
`prosemirror-history` records like any other step, so bolding a selection is undoable the same way
typing is.

### 1.7 Why the existing harness was green through all of this

`scripts/outreach-editor-render.cjs` mounts `RichEmailEditor` under a **toy parent**
(`onChange={d => setDoc(d)}`) and never renders `ComposeWindow`. The `<label>` is in `ComposeWindow`, so
it was never in the page under test. It also never did Cmd+A on a document that already contained bold,
and never pressed B twice.

The new harness therefore mounts **the real window**, with `window.fetch` replaced before the component
mounts.

### 1.8 The new harness

| file | what it is |
|---|---|
| `scripts/outreach-bold-persists.cjs` | the entry point. Fast source invariants in every sweep; the browser work behind `HG_RENDER=1`. |
| `scripts/outreach-bold-persists-render.cjs` | the real browser: Chromium (Puppeteer) and WebKit (Playwright). |

```
$ node scripts/outreach-bold-persists.cjs
  ✓ 🔴 NO <label> ENCLOSES THE RICH EDITOR — a label forwards body clicks to the B button
  … 10 source invariants
  ✅ all 10 passed

$ HG_RENDER=1 node scripts/outreach-bold-persists.cjs
  ✅ all 78 passed (68 of them in a real browser)
```

What the browser half asserts, in **both** engines, with **one fresh page per behaviour**:

* **the operator's three steps, as written**, with the document asserted after each one — including the
  one that was the bug: *clicking to deselect leaves the text plain*;
* a **mixed** selection becomes all bold; an **all-bold** selection becomes all plain;
* the change survives a blur, a parent re-render, focusing another field in the window, toggling every
  tickbox in the window (now that the harness's stub returns a thread, **"Include previous email" is on
  screen to be toggled** — the earlier version asserted this against *zero* checkboxes and was green
  vacuously), and three seconds of nothing happening;
* **Cmd+Z undoes a mark-only change**;
* **B's highlight** reflects the selection: off in plain text, off for a mixed selection, on when the
  whole selection is bold, off when it is all plain;
* the same three steps for **Small** (whose mixed case is real, because the opt-out line ships small) and
  for **Italic**;
* **what is sent is what is on screen**, asserted in *both* directions — all-plain sends no bold, and
  all-bold sends bold. The negative alone would also pass if the send dropped every mark it was given.

**Nothing is sent.** `window.fetch` is replaced before the mount: the settings GET answers from a
literal, the mail-send GET answers with a thread, and the mail-send POST is **recorded and never leaves
the page**. The path exercised is "Send test to me", which the server binds to `OUTREACH_TEST_RECIPIENT`
even when it is not stubbed.

### 1.9 The variants — each puts the defect back, and both go red

A green harness over a fixed bug proves nothing on its own.

| variant | what it restores | result |
|---|---|---|
| **V1** | the wrapper goes back to a `<label>` | **both engines**: one click in the message body takes the bold tags from 1 → 5 |
| **V2** | the `History` extension is removed | **both engines**: after B there are 5 bold tags, and after Cmd+Z there are still 5 |

Each patch throws if its anchor has drifted, because a patch that does not apply proves nothing and looks
like a pass.

### 1.10 Four driver bugs, recorded because three of them produced a confident false result

1. **`process is not defined`** — a `process.env.NEXT_PUBLIC_…` read survives the bundle and threw before
   the editor could mount. A blank page that looked like a product failure. Shimmed in the esbuild banner.
2. **The settings stub had the wrong shape.** `parseSignature` accepts `{ lines: [...] }` jsonb; I sent an
   HTML string. It parsed to `null`, `settingsLoaded` never turned true, and the box stayed empty — again
   indistinguishable from a mount failure.
3. **`crypto.randomUUID` is secure-context only**, and a page served by `setContent` on `about:blank` is
   not a secure context. Its absence threw inside `sendNow`, which caught it and displayed *"The
   connection dropped before the server answered"* — a stubbed send that read as a product bug.
4. **`sent()[0]` is not the send.** With a thread on screen the window first POSTs `action: 'quoted'` to
   fetch the quoted message, so the first recorded call carries no document. Reading it reported
   *"sent doc bold: false"* against a send whose payload I then printed and which carried bold on all
   five runs. The assertion now finds the entry with `action === 'send'`.
5. **V1 measured 1 → 1 and reported the bug as absent while it was plainly present.** With a *collapsed*
   caret `toggleBold` only sets `storedMarks` and the document does not move. The operator's step 3 is a
   click **while the whole message is selected**, and that is what the variant does now.

### 1.11 The source half, so the invariant is re-checked on a machine with no browser

* **no `<label>` encloses the editor** — asserted as *"the mount is not inside a label"*, not as *"the
  file contains no label"*: the Subject field's `<label>` is correct and must stay. Verified against the
  mutation: restoring the `<label>` makes the check report `enclosed = true`.
* one constant holds the message label, and the WhatsApp textarea carries it as `aria-label`;
* `onChange` stores the document **before** any "is this an edit" test — not the cause, but it *would* be
  one;
* a `History` extension is loaded, and it comes from the pinned `@tiptap/pm` rather than a new dependency;
* every toolbar button that acts on the selection still prevents the `mousedown` default (9 of them).
  **Unrelated to the label and still required**: without it Chromium collapses the selection on mousedown
  and B applies to nothing. Both fixes are needed; neither replaces the other.

---

## 2 · PART A

### 2.1 A.2 · "Make post" is gone from a private event

The Events list showed **Make post** on a private event (Community Centre, Wed 14 Oct) and
`/api/weekly-post` already refused it — so the operator was offered a control and handed a refusal.

**Absent, not disabled.** A private event has no post: the whole point is that the venue, the town and
the postcode never appear anywhere public, and a social graphic is the most public thing this app makes.
A disabled button would be promising one that will never exist, and the Private chip on the row already
says why.

```tsx
{!event.is_private && canPlacesPosts && (
  <button onClick={() => setPostEventId(event.id)} …>Make post</button>
)}
```

### 2.2 A.3 · The Add/Edit preview card for a private event

| | public event | **private event** |
|---|---|---|
| title | the venue name | 🔒 **Private event**, in purple |
| date and times | yes | **yes** |
| venue / town / postcode | yes | **not rendered at all** |
| van chip | yes | **yes** |
| line beneath | "Filled from *\<place\>*" (new events with a picked place) | **"How it shows on your schedule — no venue, town or postcode."** |

Three things worth saying about it:

**It is not `TruckListCard`, and that is the one place this feature departs from "render the public
component".** The public card for a private event shows the redacted row — "Private event", no town, no
postcode — in the ordinary black heading, because to a customer it is just an event with no address. The
*operator* needs something stronger: that the venue they have just typed is deliberately not going to
appear. The lock and the purple title say that; a faithful public card could not. The public branch is
untouched.

**The venue, town, postcode and address are not rendered at all** — not greyed, not struck through, not in
a `title` attribute. A private address that is on the screen "but hidden" is an address that leaks the
first time someone copies the DOM. The harness asserts the absence of all four strings from that branch.

**It reads the pill, not the database.** `is_private` is not written until Save, so the preview reflects
the **type currently selected** — the same expression `handleSaveEvent` sends as `is_private`, so the
preview and the write cannot disagree. It falls back to the saved value while the types are still
loading, so editing a private event never flashes its address.

```tsx
const previewIsPrivate = privateTypeId
  ? eventTypeId === privateTypeId
  : (editingEvent?.is_private === true)
```

"Private event" comes from `PRIVATE_PUBLIC_LABEL` — the constant the public surfaces substitute — so the
operator's preview and a customer's card are one string. The line beneath is a new constant,
`PRIVATE_PREVIEW_NOTE`, in `lib/private-events/copy.ts` with the other words.

### 2.3 A.4a · "Pinned to Standard" becomes a real state — migration `20261016`

**The defect.** `20261015` added `truck_places.usual_event_type_id`, where `NULL` means "Automatic". The
control offered a third choice, **Standard**, and had nowhere to put it: Standard *is* the absence of a
type, so saving it wrote `NULL`, which the next read showed back as **Automatic**. The operator pinned
Standard, the control snapped to Automatic, and nothing said why. `PlacesTab`'s own comment admitted it:
*"Standard is not storable as a pin and is not offered as one."*

**The two states are genuinely different and both are wanted.**

* **Automatic** — "work it out from what I did here last time". The answer **changes** as the truck trades.
* **Standard** — "always plain Standard here, whatever I did last time". A **fixed** answer.

One nullable uuid cannot hold both, because the uuid for Standard does not exist: `event_types` has no
Standard row — Standard is the truck's own settings (§70.2). **A magic uuid was the other option and it
was refused**: a reserved id would be a value the FK must not check, which means dropping the FK, which
means the column stops being a reference to anything.

**The resolution order, enforced in both routes:**

```
usual_type_is_standard ? Standard : (usual_event_type_id ?? the automatic rule)
```

The write path is what keeps the two columns in step, and it writes **both, in one statement, every
time**:

| the operator picks | `usual_event_type_id` | `usual_type_is_standard` |
|---|---|---|
| Automatic | `NULL` | `false` |
| Standard | `NULL` | **`true`** |
| a type | **`<id>`** | `false` |

Writing only the column that changed is how `(true, <uuid>)` gets created — switch a place from Standard
to Private and the boolean would still say Standard, which the resolution order then obeys. One statement
cannot be half done, and the order above is the belt to that braces.

`'standard'` is a **literal on the wire**, never a reserved uuid.

### 2.4 A.4b · "Automatic (…)" names the type it actually resolves to

It used to read **"Automatic (Standard — last used here)"** for every place, always. The component took an
`automaticName` prop whose only caller was:

```tsx
const automaticNameFor = useCallback((): string => 'Standard', [])
```

A hardcoded word. For a wedding venue whose last three bookings were Private that parenthetical was simply
false — on the screen whose job is to say what will happen.

**The route resolves it now, with the same function the Add event pre-selection uses.** The automatic rule
(§70.3 — "the newest event at this place supplies the type") has been lifted out of the middle of
`usualTypeForPlace` into `readPlaceTypeHistory`, which resolves it for **every place in one pair of
reads** and returns a map. `usualTypeForPlace` calls it; `sg_places` calls it. **One definition, so the
label and the behaviour cannot drift.**

Two details that matter:

* **a key present with a `null` value** means "history found, and it says Standard"; an **absent** key
  means "no history at this place at all". Callers use `has`, not `get` — `by: 'place'` depends on the
  difference, and that is what the form reports to the operator.
* **a failed read means no label, not a wrong one.** `usual_automatic_type_name` comes back `null` and the
  option reads plain *"Automatic (what you used last time)"* rather than guessing "Standard". A wrong
  parenthetical is worse than none, because it is the thing the operator is deciding against.

The names are resolved **server-side** from one more cheap read. The client *could* have mapped ids to
names from the list it already holds — but that list excludes the Private type on a truck without the
key, and the label would then silently say Standard.

The word "Standard" itself is now one constant, `STANDARD_TYPE_NAME`, because it had been written out as a
literal in four places.

### 2.5 A.4c · The dead dashboard control is deleted

`EventTypeDashboardControl` and its exported `OwnSettings` interface — 130 lines of a dropdown and a
confirm for switching a live event's type — **had no caller**. The "This event" card took that job over;
the standalone control stayed exported, compiled into every bundle importing the module, and reachable by
nobody.

Dead code that still compiles is worse than dead code that does not: it keeps answering *"yes, that
exists"* to anyone searching for how a live event's type is changed. `OwnSettings` went with it — it was
this component's prop type and nothing else; the dashboard page declares the same four booleans inline,
which is the shape `/api/dashboard` actually returns.

**The "no native select" assertion is widened back to the whole file.** It had been *scoped* to
`EventTypeSelect` precisely because this component carried one `<option value="">Standard</option>`, and
the scope was recorded at the time as a tolerated exception rather than a weakening. The exception now has
nothing to cover:

```js
t('⛔ …and there is NO native dropdown anywhere in the event-types module', …)
t('⛔ `EventTypeDashboardControl` and its `OwnSettings` prop type are deleted, not re-exported', …)
```

Two assertions in `scripts/event-types.cjs` had to move with it: one named the file the confirm's four
sentences lived in (re-aimed at `components/dashboard/ThisEventCard.tsx`, which renders it now — leaving
it aimed at the old file would have made the deletion look like a regression, and re-aiming it at nothing
would have made it vacuous), and one named the mount expression that changed (§3.2).

### 2.6 A.4d · The type list loads when the Add event modal opens

**Reported:** opening Add event shows the pill row as "Standard" alone for a moment before the truck's own
types appear, so the first thing the operator sees is a row that is missing Private.

**The cause was the trigger, not the speed.** The read fired on `isActive` only — when the *Schedule tab*
became active, which is usually earlier and is sometimes never:

* a deep link lands on `?tab=schedule` and the modal is opened from the header in the same breath, before
  the first fetch has come back;
* the fetch **failed once** (the `catch` degrades to Standard-only on purpose) and nothing retried it, so
  **every** modal for the rest of the session showed one pill;
* the native app mounts the tab without the browser's warm cache.

```tsx
const typesWanted = isActive || editingEvent !== null
```

`isActive` is deliberately kept as a trigger too: the pending approval cards carry the same pill row and
they are on the Events list, not in a modal. `editingEvent` itself is **not** a dependency, only whether
one *exists* — keying on the object would re-fetch on every keystroke in the form. The degradation is
unchanged, and is now simply retried the next time a form opens.

### 2.7 A.4e · `sendLabelSuffix` is gone

It was kept for one build as an accepted-but-unrendered prop, which is the worst state for a prop to be
in: the page still computed a string, passed it, and a reader had to find a comment to learn it went
nowhere. The prop, its type, its call site and the expression that built it are all removed.

The harness assertion is now made **across both files**, and on `codeOf(…)` rather than the raw source —
both files still *explain* the removal in a comment, and a raw search found the explanation and reported
the prop as present. That is the failure mode this repository has now met five times: prose satisfying an
assertion about code.

---

## 3 · PART B · PLACES AND SOCIAL POSTS, FOR ONE TRUCK

### 3.1 The key is in no plan at all

`places_posts_preview` is a `Feature` in `lib/features.ts` and is **absent from `PRO_FEATURES`,
`MAX_FEATURES`, `TRIAL_FEATURES` and every `PLAN_FEATURES` set**. `canAccess` therefore reaches its final
line and returns `false` for every plan, on every tier — including `trial`, `tester` and `demo`. The only
way to hold it is `trucks.feature_overrides`, which `canAccess` consults **first**.

```ts
export function canAccess(plan, feature, featureOverrides = {}, trialExpiresAt = null) {
  if (feature in featureOverrides) return featureOverrides[feature] === true   // ← line 184
  …
  return PLAN_FEATURES[plan]?.has(feature) ?? false                            // ← false, always
}
```

**Why a `Feature` and not a second bespoke override key.** `batch_reservations` and
`whatsapp_setup_preview` each grew their own resolver because they are not entitlements. This **is** one —
it gates a tab, a pill, a button and seven route actions — so it belongs in the one function that answers
"may this truck do this", and it reaches that function already able to say no.

It is **not** the same key as `schedule_graphics`. That one gates the weekly post's *rendering* on Pro and
Max; this one decides whether the Places and Social posts **surfaces exist for a truck at all** while they
are being built. A truck can hold `schedule_graphics` from its plan and still not see these two tabs.

No marketing row, and that is not an oversight: `findPlanParityViolations()` iterates matrix rows and
`continue`s on a row with no `ROW_FEATURE_MAP` entry, so a `Feature` with no row cannot produce a
violation. `schedule_graphics` and `embed_schedule` set that precedent.

### 3.2 The screen

**The pills are filtered, not disabled.** A pill that opens a refusal is worse than no pill, because
nothing on the screen can say when it will work and no plan sells it.

```tsx
const visibleSections = canPlacesPosts
  ? SCHEDULE_SECTIONS
  : SCHEDULE_SECTIONS.filter(sec => sec.id !== 'places' && sec.id !== 'weekly')
```

**An old `?section=places` or `?section=weekly` bookmark lands on Events — in the same render.** The page
reads `?section=` at mount, before the truck row has arrived, so it cannot know the answer there. It is
known in the Schedule tab, where the truck is, and it is a **derivation**, not a correction applied
afterwards: a `useEffect` that set the section would render the gated pane for one frame, and on a slow
truck row for longer.

```tsx
const shownSection: ScheduleSection =
  (!canPlacesPosts && (section === 'places' || section === 'weekly')) ? 'events' : section
```

The URL is tidied afterwards, through the parent's setter, so a refresh agrees. Every pane switches on
`shownSection`; the harness counts the remaining raw `section === '` uses and requires exactly the two in
the derivation itself, because one pane left on `section` would render a gated pane for good.

### 3.3 The routes

**`/api/weekly-post`** has one `gated(truck)` at the top of `POST`, so the weekly post's render and save
**and** the single-event post's `event_post` / `event_render` are all behind it. The preview key is checked
**before** `schedule_graphics`, and the order is not cosmetic: *"The weekly post is on Pro and Max"* told
to a Max truck that simply does not hold the preview key is a lie, and it sends them to billing. The
refusal says **"Social posts are not switched on for this truck."** — *not switched on*, never *upgrade*,
because no plan sells this yet and an upgrade prompt would be an offer nobody could accept.

**`/api/manage`** gates six actions, in one check, before any of them run. **The split is the point:**

| | actions | why |
|---|---|---|
| **GATED** | `sg_place_pictures`, `sg_place_picture_url`, `sg_place_picture_save`, `sg_place_picture_remove`, `sg_place_events`, `sg_place_usual_type` | they exist only inside the Places tab |
| **UNGATED** | `sg_places`, `sg_upsert_place`, `sg_merge_place` | the Add event modal's place picker and "Tidy up places" both call them |

`sg_places` and `sg_upsert_place` are **not** the Places tab's private API. `app/manage/[token]/page.tsx`
mounts `usePlaces` when the Add event modal opens, and every truck on this branch already has those
controls. Gating either one would switch off a shipped control to hide a preview tab — the exact mistake
the *"no plan gate on Places"* note in that route was written to prevent.

**The usual-type *read* is not gated.** It arrives with the `sg_places` rows and is what pre-selects a type
in the Add event modal. `usual_for_venue` — the pre-selection itself — carries no preview gate at all, and
the harness asserts that the key does not appear in that route.

**Not gated, by instruction and by assertion:** Add event's places list, Tidy up places, the usual-type
pre-selection, event types, private events, pricing.

### 3.4 Proven with the key and without it

`scripts/places-posts-gating.cjs` — 40 assertions, no network, no database, no browser:

```
── 1 · the key is in NO plan — only trucks.feature_overrides can grant it ──────
  ✓ 🔴 it is a `Feature`, so it goes through the ONE function that answers "may this truck do this"
  ✓ ⛔ …and it appears exactly ONCE in lib/features.ts — the union member, no plan set (1)
  ✓ ⛔ …so neither PRO_FEATURES, MAX_FEATURES, TRIAL_FEATURES nor any PLAN_FEATURES set names it
  ✓ 🔴 `canAccess` consults feature_overrides BEFORE any plan, which is what makes the grant work
── 2 · the pills and panes are gated, and an old ?section= link lands on Events ──
  ✓ 🔴 the pill row is FILTERED — Places and Social posts are absent without the key
  ✓ 🔴 `shownSection` is DERIVED, so a gated section renders Events in the same render
  ✓ ⛔ nothing past the derivation still switches on the RAW section (2 use(s), the derivation itself)
── 3 · "Make post" is absent on a private event, and absent without the key ─────
  ✓ 🔴 the button is gated on BOTH: not private, AND the truck holds the key
── 4 · the routes refuse without the key — and refuse with the right sentence ───
  ✓ ⛔ …before `schedule_graphics`, so a Max truck is not told to upgrade
  ✓ ⛔ `sg_places` is NOT gated — the Add event picker and Tidy up places call it
  ✓ ⛔ `usual_for_venue` — the Add event pre-selection — has NO preview gate
── 5 · the Add/Edit preview shows a private event as a private event ────────────
  ✓ ⛔ …and it renders NO venue, town, postcode or address — not even greyed out

✅ all 40 passed
```

**With the key (Pizza Kitchen, `test-kitchen`)** — `canAccess` hits line 184, finds
`places_posts_preview: true`, returns true: both pills render, both panes render, "Make post" renders on a
non-private event, and all six gated `sg_*` actions and `/api/weekly-post` answer.

**Without the key (Village Spice, and every other truck on every plan)** — `canAccess` reaches the final
line and returns false: `visibleSections` is Events and Event types only, `shownSection` forces a stale
`?section=` link to Events, "Make post" is absent from every row, the six `sg_*` actions return
`403 "The Places tab is not switched on for this truck."`, and `/api/weekly-post` returns
`403 "Social posts are not switched on for this truck."` for every one of its thirteen actions.

**The truck's own shipped controls are identical in both cases**: the Add event place picker, Tidy up
places, the usual-type pre-selection, event types, private events and pricing all read `sg_places` /
`sg_upsert_place` / `usual_for_venue`, none of which is gated.

---

## 4 · THE SQL

Both blocks are in the chat message that accompanies this report, each in three parts: a **read-only
preview**, the **change**, and a **read-only verification**. Neither has been run.

* **`supabase/migrations/20261016_place_usual_standard.sql`** — one column,
  `truck_places.usual_type_is_standard boolean NOT NULL DEFAULT false`, plus a partial index on the true
  rows. **It changes no existing row**: `false` is exactly the state every place is already in. §0 proves
  that before anything is altered and §2 proves it afterwards, including that the nonsense pair
  `(true, <uuid>)` does not exist.
* **The feature-override grant** — one `UPDATE` to `public.trucks` where `id = 'test-kitchen'`, merging
  `{"places_posts_preview": true}` into `feature_overrides` with `||`. **Nothing is removed**: `coalesce`
  handles a NULL column and `||` adds the key beside whatever is already there. The verification counts
  the trucks holding the key and the trucks *other than* `test-kitchen` holding it — expect 1 and 0.

**`20261016` must be applied after `20261015`.** §0 checks for `20261015`'s column and says to stop if it
is absent, because the resolution order reads both.

**Both routes survive `20261016` being absent.** The pin read names the new column and, on a `42703` /
`PGRST204`, **retries naming only `20261015`'s column** — a truck on `20261015` must not lose the pins it
has already set because a newer column it does not have yet failed the statement. Without that retry, this
code shipping ahead of the migration would have made every existing pin read as Automatic.

---

## 5 · WHAT CHANGED

| file | what |
|---|---|
| `components/admin/ComposeWindow.tsx` | the `<label>` → `<div>`; `MESSAGE_LABEL`; the textarea's `aria-label`; `sendLabelSuffix` removed |
| `components/admin/RichEmailEditor.tsx` | the local `History` extension, from `@tiptap/pm/history` |
| `components/admin/ProspectWorkspace.tsx` | the `sendLabelSuffix` call site removed |
| `lib/features.ts` | `places_posts_preview`, in the union and in no plan set |
| `lib/event-types/read.ts` | `readPlaceTypeHistory` extracted; `STANDARD_TYPE_NAME` |
| `lib/private-events/copy.ts` | `PRIVATE_PREVIEW_NOTE` |
| `app/manage/[token]/page.tsx` | `canPlacesPosts`; `visibleSections`; `shownSection`; "Make post" gated; the private preview card; `typesWanted` |
| `app/api/manage/route.ts` | `PLACES_TAB_ONLY`; the Standard pin write; `usual_type_is_standard` and `usual_automatic_type_*` in `sg_places` |
| `app/api/weekly-post/route.ts` | the preview key in `gated`, checked first |
| `app/api/event-types/route.ts` | the Standard pin read, before the id, before the rule |
| `components/manage/PlacesTab.tsx` | Standard as a real state; the real "Automatic (…)" label; `automaticNameFor` deleted |
| `components/manage/SchedulePlaces.tsx` | three new fields on `Place` |
| `components/manage/EventTypes.tsx` | `EventTypeDashboardControl` and `OwnSettings` deleted |
| `supabase/migrations/20261016_place_usual_standard.sql` | **new** |
| `scripts/outreach-bold-persists.cjs` | **new** · `scripts/outreach-bold-persists-render.cjs` **new** |
| `scripts/places-posts-gating.cjs` | **new** |
| `scripts/harnesses.json` | the three new harnesses registered |
| `scripts/places-tab.cjs`, `event-types.cjs`, `private-events.cjs`, `schedule-graphics-places.cjs`, `outreach-send-visible.cjs`, `screenshot-truck-details.cjs` | assertions re-aimed, each with the reason written in |

**`tsc --noEmit`: clean. `npm run build`: ✓ Compiled successfully. ESLint: 306 errors / 91 warnings
across the thirteen touched files — byte for byte the HEAD baseline, measured by stashing and
re-running.**

**The full sweep: `93 run · 93 passed · 0 failed`.** Four harnesses were red when the sweep was first
run and all four were red for the same kind of reason — a guard pinned to a floating HEAD or taken over
raw source text. Three of the four were already failing before this build started (§5.1). All are
re-aimed, with the reason written into each one.

### 5.1 Harness assertions that had to move, and what each one caught

Every one of these went red for a correct screen, which is the point of writing them down.

* **`scripts/schedule-graphics-places.cjs` W35** — the variant's anchor was indentation-dependent, and the
  `TruckListCard` mount gained two spaces when it moved inside the private/public ternary. `changed()`
  throws on an absent anchor, which is how it was caught rather than silently passing.
* **the preview-pane check** was bounded by `pane + 1400` characters; the block is 4381 characters now. I
  changed it to 4200, realised that was the same mistake with a bigger number, and **bounded it by the
  pane's own closing comment** instead — a real boundary in the file.
* **"ONE hook owns the list"** counted `api('sg_places')`; the hook calls it through `apiRef.current` since
  the spinner fix, so the count is taken on the **action name** rather than on one spelling of the call.
* **"NO LINE OF THE PAGE WAS LOST"** reported seven losses, all deliberate. Each is now a `movedEdits`
  entry carrying its **new** form and the file it is in — so "I edited this line on purpose" is a claim
  with a test attached, and a later revert or rename starts failing.
* **`scripts/screenshot-truck-details.cjs`** had a single-string allowlist for the one tolerated change to
  `/api/inbound-schedule`; private events (20261014) added a second. It is a **list** now, and the loop
  below it fails if a tolerated line is no longer in the file — the excuse expires if the line goes. This
  one was failing before this build started.
* **`scripts/batch-reservation-switch.cjs`** asserted `batch_reservations` is not in the `Feature` union,
  over a slice taken as `indexOf('export type Feature =') + 2000` — a **character count**, because the
  intended end marker (`export type Plan`) sits at index 0, *above* the union, so the `> 0` test was
  always false and the fallback was always taken. `places_posts_preview`'s note explains why it is a
  `Feature` and not a second bespoke override key, and in doing so **names `batch_reservations`** — so the
  assertion found the word in a comment and reported the key as a plan feature. Bounded by
  `const PRO_FEATURES` now, and stripped of comments.
* **`scripts/van-category-settings.cjs`** asserted that the set of files naming `truck_vans.same_as_first_van`
  is closed. `grep -rl` found seven; three of them name it only in a **comment**, each saying the same
  correct thing — that the switch reads and writes the existing column and adds no new one. Now taken on
  `codeOnly(…)`, and it additionally asserts that every file on the allowlist really does name it in code,
  so a deleted writer cannot leave an entry that excuses nothing.
* **`scripts/capacity-move-identity.cjs`** asserted the two copy-field unions were **equal**, against a
  floating HEAD — and `takes_cash` became a per-van setting (20261012), which `VAN_COPY_FIELDS`' own note
  says *must* be added there "or the switch silently stops meaning same". The correct change made the
  check fail. The claim was never "the list is frozen" but "the split moved fields, it did not lose them",
  so it now asserts that nothing in the BEFORE union is missing from the AFTER union, with deliberate
  additions on a named list whose entries expire if the field goes.
* **`scripts/outreach-schema-census.cjs`** pins the declared column count for `truck_places` — 19, now
  **20** with `usual_type_is_standard`. The pin is deliberate: it is what makes the dropped-column
  assertion mean *"the declared set is exactly right"* rather than *"it contains these five"*. A pinned
  count nobody has to update is a count nobody is checking.
* **`scripts/places-tab.cjs`** asserted the Automatic label as `Automatic (${automaticName} — last used
  here)`. It passed while `automaticName`'s only caller returned the literal `'Standard'` — the assertion
  was green while the screen told a wedding venue that Automatic meant Standard. It now asserts that the
  name comes from the **row**, that the route puts it there with the same function the pre-selection uses,
  and that a missing name degrades to a label promising nothing.

---

## 6 · WHAT IS NOT DONE, AND WHAT I WOULD WATCH

* **`20261016` is not applied, and the grant is not run.** Until the migration is applied, the Places
  control's Standard option saves and reads back as Automatic (the old behaviour) and the route returns
  the named refusal; until the grant is run, **no truck** can see Places or Social posts, including
  `test-kitchen`.
* **Part C is untouched** — the merge into `main`, the sweep as a release gate, migration ordering, the
  Gusto list, the deploy steps.
* **The Places tab's own `sg_places` read cannot be gated**, and that is deliberate — the Add event picker
  and Tidy up places share it. So a truck without the key still *seeds* its places row set when it opens
  the Add event modal. That was already true before this build; it is recorded here because "the Places
  tab's own reads" in the brief could be read as including it, and it cannot be done without switching off
  a shipped control.
* **The private preview card is the one place the preview is not the public component.** If `TruckListCard`
  is restyled, the public branch follows it and the private branch does not. That is the deliberate trade
  (§2.2) and it is worth re-reading if the card changes.
* **Undo now reaches back across a template change.** `newGroupDelay` is left at the default and nothing
  sets `addToHistory: false`, so an operator can in principle undo past choosing a template. That is what
  every editor does with a paste, and it is better than silently losing the keystroke before it — but it
  is a behaviour nobody has seen yet.
