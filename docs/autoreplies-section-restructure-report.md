# Auto-replies section — restructure

**Date:** 20 August 2026
**Status:** built, **NOT deployed, NOT committed, `next dev` NOT run.** Joins the undeployed batch.
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

✅ **ONE FILE CHANGED: `app/manage/[token]/page.tsx`.** `lib/plan-features.ts` (09:42),
`app/api/manage/route.ts` (13:49), the classifier (22:58), the events helper (23:00) and the preview
route (23:02) all predate the previous task's report (23:23); `page.tsx` (23:37) is the only file
touched after it.

---

# TASK 0 — DIAGNOSIS: `trucks.website` IS READ, AND RENDERED TO CUSTOMERS

## 0.a 🔴 YOUR BELIEF IS WRONG, AND I AM SAYING SO BEFORE ANYTHING ELSE

**`trucks.website` is not collected-and-never-displayed. It has consumers, and they are customer-facing.**

**The chain, each link read from source:**

**1. It is explicitly selected.** `app/api/discovery/events/route.ts`, the operator-events branch, joins
the truck row and names the column:

```
      .from('truck_events')
      .select(`
        …
        trucks!truck_id (
          id, name, cuisine_type, logo_storage_path, cover_image_path, contact_phone,
          website,
          phone_is_whatsapp, slug, active, excluded, …
```

**2. It is mapped, and it OUTRANKS the discovery copy:**

```ts
            websiteUrl: truck?.website || linked.website || null,
```

🔴 **The operator's own value takes precedence** over the linked `discovery_trucks` row. It is not a
fallback — it is the primary source.

**3. It is rendered on two customer surfaces:**

| Surface | What it does |
|---|---|
| `app/trucks/[slug]/TruckClient.tsx` | the truck profile page — `truckInfo.websiteUrl &&` gates a link built with `hrefFromStoredUrl(...)` and labelled with `getDisplayWebsite(...)` |
| `components/EventListCard.tsx` | the event listing card — `primaryEvent.websiteUrl ?` renders an `<a href=…>` titled *"Visit {truckName}'s website or page"* |

## 0.b ⚠️ THREE DIFFERENT `website` COLUMNS, AND ONLY ONE IS THIS FIELD

The same discovery route also reads `discovery_trucks.website` (the scraped shadow row) and
`venues.website`. **Those are different columns on different tables** and are NOT what the Settings
field writes. A grep for `website` returns all three; only the `trucks!truck_id ( … website … )` join is
the operator's field. **Recorded because conflating them is exactly how someone concludes this field is
dead — or that it is alive when it is not.**

## 0.c 🔴 AND THE ANSWER WAS ALREADY WRITTEN AT THE FIELD

The field's own `onBlur` comment — present before this task and carried through unchanged — says it
outright:

> *"normalised on save … because this value **is RENDERED AS AN href on two customer-facing pages**.
> Both of those already carry their own `startsWith('http') ? … : 'https://' + …` patch — the same fix,
> written twice, at the display end."*

⚠️ **So the repository already knew, in the exact place the question would be asked.** The finding here
is corroboration, not discovery.

## 0.d Where it is NOT used

Checked and absent: `lib/email.ts` (no customer or truck email renders it), the admin console, any CSV
export, the operator dashboard, and the customer order page. **The two renderers above are the whole
list.**

✅ **Moved anyway, as instructed** — it is an identity fact, not a messaging one. §16's
`website` vs `schedule_url` distinction is untouched, no column was removed, and no migration written.

---

# TASK 1 — THE CARD BECOMES "Auto-replies"

**Heading:** `Online presence & social` → **`Auto-replies`**.

**The inner subsection heading was absorbed**, not duplicated — the `<p>Auto-replies</p>` inside the
native hide is gone, and the card title carries the word once.

✅ **Its caption survived and still reads correctly.** *"Requires Business accounts on each platform."*
now sits directly above the Connect row it describes, inside the hide, where its subject is the row
rather than the card.

🔴 **Not "Socials", and the comment at the site says why:** Messenger and Instagram are `coming_soon`
with their rows already removed, and WhatsApp is messaging rather than social media — a "Socials" card
containing one messaging channel names a category the product does not have.

---

# TASK 2 — THE WEBSITE FIELD MOVED

**To `Truck details`**, the card holding `Truck name`, description, cuisine and the menu icon. Placed
after the cuisine picker and before the menu icon, so the text identity fields sit together and the
visual control stays last.

**Shape:** converted from the inline `w-24 label + flex-1 input` row to the shared **`<Input>`
primitive**, matching `Truck name` in the same card exactly.

## 2.a 🔴 PROOF THE SAVE PATH IS INTACT — five checks, not an inspection

| Assertion | Result |
|---|---|
| `saveFormField` body byte-unchanged | ✅ **true** — `const res = await api('update_settings', { ...form, ...overrides })` / `if (res?.truck) onTruckUpdate(res.truck)` |
| the `website` key is unchanged | ✅ **exactly one input in the file writes `website`** |
| the `normaliseUrl` branch is preserved | ✅ **`const val = normaliseUrl(form.website)` and `saveFormField({ website: val })` both present** |
| the old inline row is gone | ✅ **`w-24 flex-shrink-0">Website<` no longer occurs** |
| `'website'` still in the server allow-list | ✅ **present in `app/api/manage/route.ts`, which was not touched (mtime 13:49)** |

✅ **THE §20 REVERT BUG CANNOT RECUR HERE, AND NOT BY LUCK.** That bug was a handler writing to the
server without refreshing in-memory state. `saveFormField` already closes it structurally: it reads the
UPDATED ROW back out of `update_settings` and pushes it up via `onTruckUpdate(res.truck)`, with the
reason in its own comment — *"push it up so the parent `truck` is authoritative-fresh and a remount
doesn't revert the field to the stale original value."* **The move changed neither the handler nor the
key, so the field inherits that unchanged.**

⚠️ **ONE LINE LEGITIMATELY DIFFERS, AND IT IS NOT A BEHAVIOUR CHANGE.** `onChange` went from
`e => setForm(p => ({...p, website: e.target.value}))` to `v => setForm(p => ({...p, website: v}))`,
because `<Input>` calls `onChange(e.target.value)` internally and hands the callback the **string**.
Same value, same key, same setter.

---

# TASK 3 — ORDER, AND THE iPad STRUCTURE

**Simulator first, Connect second.** The reason is in a comment at the ordering site, including the
expiry condition you asked for:

> *"🔴 THIS ORDER IS FOR TODAY ONLY. Once Embedded Signup exists, Connect becomes the PRIMARY action and
> the demo becomes supporting — at which point swapping these two is correct and expected. Do not reverse
> it before then, and do not treat the current order as an aesthetic preference: it is a statement about
> which control currently does something."*

## 3.a Positional verification, JSX comments blanked

```
    <Card>                          9120
    title "Auto-replies"            9121      <- OUTSIDE the hide
    <WhatsAppReplyPreview/>         9157      <- OUTSIDE the hide
    {!isNativeApp() && (<>          9159      <- hide OPENS
      border-t divider              9165
      caption "Requires Business…"  9166
      WhatsApp Connect row          9172
    </>)}                           9251      <- hide CLOSES
    </Card>                         9252

    title AND simulator are ABOVE the hide (outside it) : True
    order is title -> simulator -> hide                 : True
    divider, caption and Connect row are ALL inside     : True
    exactly one hide open/close in this card            : True
```

## 3.b 🔴 THE iPad-RENDERED STRUCTURE, STATED EXPLICITLY

With everything between the wrapper's open and close removed:

```
    <Card className="p-4 space-y-3">
      Auto-replies                        <- the card title
      [ the preview block ]               <- heading, two lines, chips, input, result, footnote
    </Card>
```

✅ **A titled card containing the simulator. Nothing else.**

- **Not an empty card** — the simulator is outside the wrapper and always renders.
- **Not an orphaned heading** — the title has a child.
- **No stray divider** — 🔴 **this is the part that needed designing.** The `border-t` lives **inside**
  the wrapper, on the Connect subsection, not on the simulator. So when Connect disappears the rule goes
  with it. **The simulator therefore carries NO top border**, which is also correct on the web, where it
  is the first block under the title and a rule there would read as a divider beneath a heading.

**That is the V11.18 lesson applied in the opposite direction:** that entry was about hiding a row and
orphaning its heading, divider and wrapper. Here the heading is deliberately outside the wrapper and the
divider deliberately inside it.

## 3.c ✅ THE WRAPPER ITSELF IS BYTE-UNCHANGED

```
  WITH JSX COMMENTS BLANKED:
    hide OPEN   before=1  after=1   identical: True
    hide CLOSE  before=1  after=1   identical: True
    wrapper OPEN line before: ['        {!isNativeApp() && (<>']
    wrapper OPEN line after : ['        {!isNativeApp() && (<>']
    => byte-identical wrapper line: True
```

⚠️ **THE TRAP FIRED AGAIN, EXACTLY AS YOU WARNED.** The RAW count of the open token went **2 → 1**,
which reads as "the wrapper was deleted". It was not: the second occurrence was my own placement comment
from the previous task, which quoted the token in prose and which this task removed. **Only the
comment-blanked comparison is truthful.** Reported because the raw number is alarming and wrong.

---

# TASK 4 — COPY

| | |
|---|---|
| **Heading** | `See what a customer gets back` |
| **Line 1** | `Ask anything a customer might ask. Nothing is sent — this is just a preview.` |
| **Line 2** | `Built from your live menu and schedule, so set those up first.` |

**Both applied verbatim.** ✅ **Line 2 is secondary BY WEIGHT, NOT BY SIZE:** `text-sm text-slate-400`
against line 1's `text-sm text-slate-500`. **Both stay at the `text-sm` set on 20 August** — the
comment at the site says so explicitly, so a later "tidy-up" cannot quietly revert them to `text-xs`.

**Also removed: the root `border-t`** (3.b).

---

# TASK 5 — ONE MERGED FOOTNOTE

**Deleted:** *"The wording varies slightly each time, exactly as it would for a customer."*
**Footnote is now:** `Replies are AI-generated and vary slightly each time, and can occasionally be wrong.`

✅ **The divergence is noted in the comment, as instructed**, along with the standing prohibitions:

> *"🔴 IT NOW DIVERGES FURTHER, AND THAT IS ACCEPTED (decision, 20 August 2026) … So this string is no
> longer a substring of FOOTNOTES '4'. It is DELIBERATELY a plain literal: do not import that entry, do
> not slice it, and do not edit plan-features.ts to match — the shared string still carries the
> unverified viewing claim. Grep this sentence to find it; nothing links the two automatically."*

✅ **`lib/plan-features.ts` was not opened for edit** (mtime 09:42, hours before this session's work).

---

# TASK 6 — THE CONNECT BUTTON

## 6.a The comment whose premise changed

**Replaced.** The 10 August comment argued for a label that did not promise a connection, on the premise
that no connection was coming. **The new comment records the decision and the reason:** the control
becomes the Embedded Signup launcher, so *"the label is what it will shortly mean and is deliberately NOT
being relabelled to 'Save' in the interim. Renaming it now would mean renaming it back."*

✅ **I kept the half of the old comment that is still binding**, because the decision did not overturn
it:

> *"🔴 DO NOT ADD A connected/disconnected INDICATOR until the flow exists — that would be a label
> asserting a state nobody checked (§35). A forward-looking VERB is a product decision; a fabricated
> STATE is a lie."*

## 6.b The silent no-op

```ts
    if (whatsappSender === lastSavedSender.current) {
      showToast('WhatsApp number saved')
      return
    }
```

✅ **The early return is KEPT** — re-sending an identical value would be a pointless write, and the
guard's whole point is that it is already saved. **Only the silence is fixed.**

✅ **What it writes, which column, and the allow-list are untouched:** `api('update_truck', { data: { whatsapp_sender: whatsappSender } })`,
`onTruckUpdate({ whatsapp_sender: whatsappSender })` and the success/error toasts are all byte-identical.

---

# §7 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| `trucks.website` consumers | select → mapper → two renderers, read from source | 🔴 **HAS consumers** |
| Card structure and order | positional scan, JSX comments blanked | ✅ **title → simulator → hide** |
| Title and simulator outside the hide | same scan | ✅ **both above the wrapper** |
| Divider/caption/row inside the hide | same scan | ✅ **all three** |
| Wrapper byte-unchanged | comment-blanked line compare | ✅ **identical** |
| Website save path | 5 assertions (2.a) | ✅ **all pass** |
| Connect writes unchanged | handler diff by inspection of each line | ✅ **only the guard branch added** |
| Syntax | TypeScript parser, `parseDiagnostics` | ✅ **clean** — a parse check, **not** a typecheck |
| Character census | NUL / control / carrier-aware selectors | ✅ **0 NUL; bare-glyph set identical to HEAD** |

## ⚠️ ONE ERROR I MADE AND CAUGHT

My first Task 4 edit placed the explanatory JSX comment **in the `return (` position**, above the root
element — which is invalid: a return may have one root, and `{/* … */}` there is a second child. **The
parse check failed with four diagnostics** (*"')' expected"*, *"JSX expressions must have one parent
element"*). Fixed by demoting it to a `//` comment above the `return`. **Recorded because it is the case
for running the parse: nothing else I did would have caught it, and it would have failed the build.**

---

# §8 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** `next dev` was not run, per scope. **The restructured card has
   never been displayed, and the iPad structure in 3.b is derived positionally, not seen.** It is the
   strongest form available without running it; it is not the same as looking at an iPad.
2. 🔴 **THE MOVED WEBSITE FIELD HAS NEVER BEEN SAVED.** The handler is proven intact by the five checks
   in 2.a — **no value has been typed into it and round-tripped.** The `<Input>` conversion is the part
   I would want seen first.
3. ⚠️ **The Connect toast on the unchanged path has never fired.** It is one branch, but it is new
   behaviour on a live control.
4. ⚠️ **The card's visual balance is unjudged.** It now leads with a preview block and ends with a
   single input row; whether the demo dominates the section is a judgement nobody has made.
5. ⚠️ **No typecheck was run**, only a parse.

## 🔴 ONE THING WAITING ON YOU

**`trucks.website` has consumers, so the premise behind moving it "because nothing reads it" does not
hold** — the move still stands on the identity-versus-messaging reasoning, which is why I made it. But
if the intention was to begin retiring the field, **that is now a different decision**, and two customer
surfaces would lose a link.
