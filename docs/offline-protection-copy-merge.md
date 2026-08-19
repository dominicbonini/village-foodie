# Offline protection copy — three lines merged into two

**Done, from the copy module only.** Both surfaces pick the change up automatically — **neither page was
edited except to delete the `<p>` that rendered the removed string.** No layout change, no logic change,
no write-path change.

🔴 **THE VERIFICATION READ CAME BACK CLEAN: a customer web order CANNOT reach `pending` without an email
address.** The new wording's promise holds. §Verification read.

---

# PHASE 1 · READ-ONLY

## 1 · The four strings, before

```ts
export const OFFLINE_MODE_NO_AUTO_ACCEPT_LABEL = 'Keep taking orders, confirm them yourself'
export const OFFLINE_MODE_NO_AUTO_ACCEPT_HELP =
  "Auto-accept is turned off, so customers can still order but nothing is confirmed automatically. You'll confirm each one when you're back online."

export const OFFLINE_AUTO_REJECT_LABEL = 'Auto-reject orders left waiting'
export const OFFLINE_AUTO_REJECT_HELP =
  "While you're offline, an order waiting longer than this is rejected for you and the customer is told your connection dropped. Off means every order waits for you."
```

## 2 · ✅ BOTH SURFACES READ ALL FOUR FROM THE MODULE. Nothing is inline.

**The label and description reach the pages through the shared array, not by name:**

```ts
  { value: 'no_auto_accept' as const, label: OFFLINE_MODE_NO_AUTO_ACCEPT_LABEL, help: OFFLINE_MODE_NO_AUTO_ACCEPT_HELP },
```

| Usage | Dashboard | Settings → Van |
|---|---|---|
| option label | `{m.label}` `:3951` | `{m.label}` `:9870` |
| option description | `{m.help}` `:3952` | `{m.help}` `:9871` |
| picker label | `{OFFLINE_AUTO_REJECT_LABEL}` `:3970`, and again as `aria-label` `:3973` | `:9890`, `aria-label` `:9893` |
| the deleted help line | `{OFFLINE_AUTO_REJECT_HELP}` `:3981` | `:9900` |

✅ **THE FIRST STOP CONDITION DOES NOT TRIP.** No surface spells any of the four out, so (a) and (b) are
one edit each in the module and reach both screens.

## 3 · The checkout's email validation

**READ — `app/api/orders/submit/route.ts`:**

```ts
    // ── Validate ──────────────────────────────────────────────────────────────
    if (!truckId || !customerName || !customerEmail || (!items?.length && !deals?.length)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
```

**And the shared format check — `lib/contact-validation.ts`:**

```ts
/** Plausible email (x@y.z) — permissive, not strict. Empty ⇒ false (callers gate "required" themselves). */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim())
}
```

---

# PHASE 2 · STOP CONDITIONS

| Condition | Result |
|---|---|
| A string is inline rather than in the module | ❌ **Not tripped** — all four come from the module |
| Deleting the help line leaves a dangling or empty element | ⚠️ **Not tripped, with one honest note below** |
| Instructions contradict | ❌ No |
| Garbled span | ❌ None |

⚠️ **THE NOTE: `<div className="pl-6">` NOW WRAPS A SINGLE CHILD.** It is not empty and not dangling — it
holds the label-plus-dropdown row and **is what produces the indentation you told me not to change.**
**Collapsing it would be a layout change, so I left it.** Say if you would rather it went.

---

# THE CHANGE

## a · The option description absorbs the third line

```ts
export const OFFLINE_MODE_NO_AUTO_ACCEPT_HELP =
  "Auto-accept is turned off, so customers can still order but nothing is confirmed automatically. You'll confirm each one when you're back online — and anything still waiting is rejected automatically, with the customer emailed to let them know."
```

⚠️ **THE EM DASH IS WRITTEN AS THE ESCAPE `—`, NOT AS A LITERAL CHARACTER.** That is deliberate: an
escape cannot be silently turned into a hyphen or an en dash by an editor, a paste or a transport, and the
census in §Phase 4 shows the runtime value is U+2014.

## b · The picker label reads into the dropdown

```ts
export const OFFLINE_AUTO_REJECT_LABEL = 'Reject orders waiting longer than'
```

**Executed, joined with the default option:**

```
"Reject orders waiting longer than 15 mins"
```

## c · The help line is deleted

**The export is gone from the module and the `<p>` that rendered it is gone from both pages.** The name
was also removed from both import lists.

## What was not touched

**The heading, the line under it, the orange warning, the "Decides what happens…" lead-in, the "Pause
Online Ordering" option and its description, the layout, the `pl-6` indentation, the six dropdown values,
the 15-minute default and every write path.** ✅ **None of them appears in the diff.**

---

# 🔴 THE VERIFICATION READ — can a `pending` customer order have no email?

## **NO. The copy is not over-promising.**

**Two independent facts settle it. READ.**

**1 · The server refuses the order outright.** `!customerEmail` is in the same guard as `!truckId` and
`!customerName`, and it returns **400 before anything is created**. ⚠️ **AND IT IS AHEAD OF THE CARD
FORK:** the validation is at **line 200**; `if (payByCard === true)` is at **line 724**. **So a card order
cannot be drafted without an email either — the draft that `promote-draft` later turns into a `pending`
order carries the address the same check demanded.**

**2 · Only two paths can create a `pending` order at all** — `orders/submit` (the guard above) and
`promote-draft` (fed by a draft from that same route, past that same guard). **Established previously and
not re-derived.**

⚠️ **THE ONE ORDER TYPE THAT CAN LACK AN EMAIL IS THE OPERATOR'S WALK-UP** — `customer_email: manualEmail
|| null`, an optional field. 🔴 **BUT A MANUAL ORDER IS CREATED `status: 'confirmed'` AS A LITERAL, so it
can never be `pending` and the sweep's `status = 'pending'` predicate excludes it.** **Established
previously; the promise is safe from that direction too.**

⚠️ **THE RESIDUAL, STATED HONESTLY AND NOT FIXED:** the guard is a presence check, not a deliverability
one. `isValidEmail` is described in its own doc as *"permissive, not strict"*, and it is applied on the
**customer page**, not in that server guard — a value like `a@b.c` passes both. **So an order can carry an
address that bounces**, and `rejectOrder`'s `if (order.customer_email)` would still fire and Brevo would
still accept it. **"Emailed to let them know" is true of what the system does; it is not a delivery
guarantee**, and no copy in this product claims one. ⚠️ **CANNOT DETERMINE a real bounce rate;**
`select count(*) from orders where customer_email is null and status = 'pending';` would confirm the
population is empty, and Brevo's dashboard is the only place bounces are visible.

🔴 **I CHANGED NOTHING IN THE EMAIL LOGIC OR THE CHECKOUT VALIDATION, as instructed.**

---

# PHASE 3 · VERIFICATION

⚠️ **NOTHING WAS RENDERED.** No page opened, no request made. **Visual claims are READ-FROM-SOURCE and
unobserved.** `tsc --noEmit` passes and is **not** verification; `next dev` / `next build` were not run.

## The four strings as they now stand — executed from the module, not retyped

```
  OFFLINE_MODE_NO_AUTO_ACCEPT_LABEL
    "Keep taking orders, confirm them yourself"
  OFFLINE_MODE_NO_AUTO_ACCEPT_HELP
    "Auto-accept is turned off, so customers can still order but nothing is confirmed automatically. You'll confirm each one when you're back online — and anything still waiting is rejected automatically, with the customer emailed to let them know."
  OFFLINE_AUTO_REJECT_LABEL
    "Reject orders waiting longer than"
  OFFLINE_AUTO_REJECT_HELP
    DELETED — the export no longer exists

  dash codepoints in the option description: U+2014
  reads as one sentence: "Reject orders waiting longer than 15 mins"
```

✅ **The em dash is U+2014 at runtime** — checked by matching the whole dash block `[‐-―]` and printing
every codepoint found. **One dash, and it is the right one.**

## No reference to the deleted line survives

```
$ grep -rn "Off means every order waits\|OFFLINE_AUTO_REJECT_HELP" app lib components supabase
(no output)
```

## Nothing in this feature still offers "Off"

```
$ grep -rn "Off'" lib/copy/offlineProtection.ts ; grep -rn "OFF_LABEL" app lib
(no output)
```

## Executable diff and line counts

| File | Before | After | − | + |
|---|---|---|---|---|
| `lib/copy/offlineProtection.ts` | 38 | 36 | 4 | 2 |
| `app/dashboard/[token]/page.tsx` | 3201 | 3200 | 2 | 1 |
| `app/manage/[token]/page.tsx` | 8503 | 8502 | 2 | 1 |

**The whole change, in code terms:** two constants rewritten, one deleted, one `<p>` removed per surface,
and one name dropped from each import list. **Nothing else.**

## Marking

| Claim | Status |
|---|---|
| All four strings live in the module; both surfaces read them | ✅ **READ** — every usage quoted with its line |
| The four strings as they now stand | ✅ **EXECUTED** — imported and printed |
| The em dash is U+2014 | ✅ **EXECUTED** — codepoint printed |
| The deleted line has no surviving reference; no "Off" remains | ✅ **EXECUTED** — greps, both empty |
| A `pending` customer order always has an email | ✅ **READ** — the guard, its line number, and the fork's line number |
| A manual order can lack one but is never `pending` | ✅ **READ** — established previously, re-confirmed |
| The address is deliverable | ⚠️ **CANNOT DETERMINE.** Presence is checked, delivery is not |
| **How any of it looks** | ⚠️ **READ-FROM-SOURCE and UNOBSERVED** |

**Surfaces, kept apart:** the **dashboard** card and **Settings → Van** each had one `<p>` and one import
name removed, and were read separately; they share only the copy module. The verification read is the
**customer submit** path and the **operator manual** path, each read on its own.

**No instruction contradicted another, and no span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** every write —
never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. **Files: the three source files
and this report.** The result, the non-ASCII census of characters introduced, the em-dash check and the
carrier-aware variation-selector figures per emoji-presentation base are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
