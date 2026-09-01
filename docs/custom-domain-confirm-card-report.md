# The card button and the confirm block

**WHICH OF THE THREE I PERFORMED: ALL THREE — a PARSE, a TYPECHECK, and an EXECUTION.**
- **Parse** — every label, handler and line quoted here is read from a file on disk.
- **Typecheck** — `npx tsc --noEmit`, clean. `npx eslint`: no new rule violated, and the
  `truckName is assigned but never used` warning is gone, because it is now used.
- **Execution** — the **real component was transpiled and run** at both the pre-edit and post-edit
  source and the card rendered in **all five states**; the mailto was decoded from the rendered
  attribute; and the card was **measured in a real browser at 320, 390 and 768px** against the app's
  own compiled stylesheet.

**NO DEPLOY. NO MIGRATION. NO SQL.** Pizzeria Gusto untouched.
**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

---

## 1. THE READ — WHAT THE CARD BUTTON IS AND DOES

**Before, in full:**

```tsx
{!open && (
  <Btn onClick={() => { setOpen(true); setResumeFailed(false); setStep(props.customDomain ? 'idle' : 'address') }}>
    {props.customDomain ? 'Continue' : 'Set up'}
  </Btn>
)}
```

**Two labels, one handler, and the handler branches on the same thing the label does:**

| `customDomain` | Label | Opens the modal at | Which then shows |
|---|---|---|---|
| null | `Set up` | step `address` | the address screen — the start of setup |
| set | `Continue` | step `idle` | the resume effect fetches `domain_status` → **the record screen**, or *"We could not load your setup."* |

🔴 **SO WHEN THE DOMAIN IS LIVE AND CONFIRMED, "Continue" OPENS THE RECORD SCREEN** — the field values
their web person typed in, the timing line, the email escape hatch and a `Close` button. **Nothing is
in progress and nothing continues.** The label describes a journey that finished.

### Does any state still need it? Yes — every one, including live.

| State | Still needs the button? | What it gives them |
|---|---|---|
| not set up | 🔴 **yes** — it is the only way in | the address screen |
| mid-setup / waiting | 🔴 **yes** | back to the record screen to re-copy or re-send |
| **live, unconfirmed** | 🔴 **yes** | the record values and the email hatch |
| **live, confirmed** | 🔴 **yes** | the same |

🔴 **REMOVING IT WOULD STRAND TWO THINGS, WHICH IS WHY I DID NOT.** Once setup is done this button is
**the only route** back to (a) the record's field values — an operator whose web person asks *"what was
that target again?"* has nowhere else to look — and (b) the *"Someone else looks after your web
address?"* email form, which lives on that same screen. **There is no other entry point to the modal
anywhere in the file.**

---

## 2. THE LABEL — `Continue` → `View setup`, live only

```tsx
{!props.customDomain ? 'Set up' : props.verifiedAt ? 'View setup' : 'Continue'}
```

**Chosen because of what the read shows it opens: the record screen — the setup's details.** Not
"View page" (it does not open their site — the new link in §3 does that), and not "Edit" (it changes
nothing).

✅ **THE HANDLER IS BYTE-IDENTICAL** — proven verbatim, and `Continue` survives untouched for
mid-setup and waiting, where something genuinely is in progress.

### ⚠️ IT COSTS ONE HEADING LINE AT 320px, MEASURED

The card's own comment warns that both labels are short on purpose. So I measured it in a browser
against the app's real stylesheet rather than guessing:

| Width | `Continue` | `View setup` |
|---|---|---|
| **320px** | button 94px, heading **3 lines** | button 108px, heading **4 lines** |
| 390px | button 94px, heading 2 lines | button 108px, heading **2 lines** |
| 768px | button 94px, heading 1 line | button 108px, heading **1 line** |

**The button never wraps and the page never overflows at any width.** The cost is one extra heading
line **at 320px only** — an iPhone SE — and nothing at 390px, the modern baseline. ⚠️ **If that one
line matters more than the clarity, `View` alone is 4 characters shorter and is a one-word change.**

---

## 3. THE ADDRESS IS NOW ON SCREEN AND CLICKABLE

🔴 **The first step said *"Open your address"* and the address appeared nowhere on the card.** It now
sits directly under the heading, at the top of the confirm block:

```tsx
{props.customDomain && (
  <a href={`https://${props.customDomain}`} target="_blank" rel="noopener noreferrer" …>
    {props.customDomain}
  </a>
)}
```

✅ **IT RESOLVES TO THE TRUCK'S OWN DOMAIN AND CAN RESOLVE TO NOTHING ELSE.** The href is built from
`props.customDomain` — the truck's own stored host, the same column the serving path matches on — with
no interpolation from anywhere else. Rendered:

```
  address link: https://events.thaikitchen.co.uk
```

⚠️ `https://` is added here because the column holds a bare host. New tab, because this card is what
they return to in order to press the confirm button beneath it.

---

## 4. THE CHECKLIST IS TWO STEPS

```
  1. Open your address and let the page load.
  2. Check the dates and times look right.
```

*"Check the events shown are yours."* is removed — an operator reading their own dates and venues has
already established whose events they are.

---

## 5. THE EMAIL HATCH CARRIES THE CONTEXT

**Before:** *"Something not right? Email hello@hatchgrab.com and tell us what you are seeing — it helps
to say what address you opened and what appeared."* — plain text, asking them to type back three facts
we already hold.

**After**, with `hello@hatchgrab.com` a `mailto:` link. Decoded from the rendered attribute:

```
  mailto:hello@hatchgrab.com
    ?subject=Problem with events.thaikitchen.co.uk
    &body=Thai Kitchen ⏎ events.thaikitchen.co.uk ⏎ Live since 26 August 2026 ⏎ ⏎ What I am seeing: ⏎
```

**The sentence lost its second half** because the mailto now carries what it was asking for, and the
cursor lands under *"What I am seeing:"*.

### 🔴 THE DATE IS WHEN IT WENT LIVE, NOT TODAY — TWO REASONS

1. **Today's date is already on the email** the moment it is sent. The go-live date is the fact only we
   hold.
2. ⚠️ **`new Date()` in a render is a hydration mismatch waiting to happen** — server and client can
   disagree across midnight. Reading `props.verifiedAt` is the safe choice as well as the useful one.
   **That defect was avoided rather than fixed; had I used today's date it would have shipped.**

Every part is `encodeURIComponent`'d — a truck name containing `&` would otherwise truncate the body.

---

## 6. EVERY STATE, RENDERED — BEFORE AND AFTER

| State | Before | After |
|---|---|---|
| **not set up** | `… on your own website.` **Set up** | **identical** |
| **mid-setup** | `… on your own website.` **Continue** | **identical** |
| **waiting** | `… on your own website.` **Continue** | **identical** |
| **live, confirmed** | `… Live` **Continue** | `… Live` **View setup** |

**live, UNCONFIRMED — before:**
```
Live  Continue
Have a look, then tell us it is right
 1. Open your address and let the page load.
 2. Check the events shown are yours.
 3. Check the dates and times look right.
This changes nothing on your page. It just tells us a person has looked.
Yes, it looks right
Something not right? Email hello@hatchgrab.com and tell us what you are seeing — it helps to say
what address you opened and what appeared.
```

**live, UNCONFIRMED — after:**
```
Live  View setup
Have a look, then tell us it is right
events.thaikitchen.co.uk                    ← new, a link to https://events.thaikitchen.co.uk
 1. Open your address and let the page load.
 2. Check the dates and times look right.
This changes nothing on your page. It just tells us a person has looked.
Yes, it looks right
Something not right? Email hello@hatchgrab.com and tell us what you are seeing.
                           └── now a mailto with the name, address and go-live date pre-filled
```

⚠️ **The address link and the mailto appear only while the block does** — `verifiedAt && !confirmed`.
Once confirmed the block goes, as it always did, and the card is the heading, the `Live` badge and
`View setup`.

---

## 7. WHAT IS UNCHANGED

| | |
|---|---|
| 🔴 **The confirm button's handler** | ✅ **BYTE-IDENTICAL**, all 326 characters — `domain_confirm` called once, `CONFIRM_COPY.button` unchanged |
| 🔴 **The route to the wizard, in every state** | ✅ **BYTE-IDENTICAL handler**, same `{!open && (` condition — no state lost its way in |
| The `Live` badge | ✅ **BYTE-IDENTICAL** |
| `CONFIRM_COPY.heading`, `.button`, `.gatesNothing` | ✅ unchanged |
| `app/manage/[token]/page.tsx` — the rest of the Settings tab | ✅ **not opened** |
| `components/manage/primitives.tsx` | ✅ **not opened** |
| `lib/custom-domain/dns.ts`, `apex.ts`, `app/api/manage/route.ts` | ✅ **not opened** |

**Two files changed:** `lib/custom-domain/copy.ts` (42 lines) and
`components/dashboard/CustomDomainSetup.tsx` (45).

**Plain-English checker: `96/97 pass`**, the one being the pre-existing `QR: print or display`.
🔴 **The confirm block had NEVER been in the corpus** — the checker only knows what it is fed, and
nobody had fed it these. **Eight strings added**, generated from `CONFIRM_COPY` so they cannot drift
from what ships, plus the new `View setup` label. All pass.

---

## 8. WHAT REMAINS UNOBSERVED

1. 🔴 **NO LINK WAS CLICKED.** The `https://` link and the `mailto:` were read out of the rendered
   markup and decoded — **neither was followed.** Whether the operator's mail client honours a
   multi-line `body` is client-dependent and unobserved; most do, some collapse the newlines.
2. ⚠️ **The card was measured in a browser but with hand-built markup**, not on the live Settings tab.
   The stylesheet was the app's real compiled one; the surrounding page was not.
3. ⚠️ **`props.customDomain` is assumed to be a bare host** because the serving path matches on it that
   way. If a scheme were ever written into that column the link would become `https://https://…`.
   **Nothing writes one today** — `domain_provision` stores `verdict.host` — but nothing enforces it
   here either.
4. ⚠️ **The confirm block is only reachable with `verifiedAt` set**, which needs a live domain. **The
   states above were rendered from props, not reached by a real setup.**
5. **The 320px heading now runs to four lines.** §2 — measured, and a shorter label is available.
