# Input behaviour, modal dismiss, and two reads

**WHICH OF THE THREE I PERFORMED: ALL THREE — a PARSE, a TYPECHECK, and an EXECUTION.**
- **Parse** — every string and attribute quoted here is read from a file on disk.
- **Typecheck** — `npx tsc --noEmit`, clean. `npx eslint` on both touched components: no new findings.
- **Execution** — the **real `CustomDomainSetup` module was transpiled and run** in a `vm` with
  `useState` driven state-by-state and rendered through `react-dom/server`; **both reported bugs were
  reproduced before being fixed**, and the fixes re-rendered. The **real `Input` primitive** was run
  from both the pre-edit and post-edit source over five existing prop shapes and the output diffed.

**NO DEPLOY. NO MIGRATION. NO SQL.** Pizzeria Gusto's row was not read or written.
**Nothing in the prompt arrived garbled. One premise in it is factually wrong — §2. One instruction
resolved itself through its own escape clause rather than needing a STOP — §5.**

---

## 1. WEB-ADDRESS INPUTS — FOUR FOUND, FOUR FIXED

I searched the whole repository, not just the manage page: every `type="url"`, every placeholder shaped
like a web address, and every `<Input>` call site. **Four fields take a web address. You named three;
the fourth is the wizard's own.**

| # | Field | File | Was | Now |
|---|---|---|---|---|
| 1 | **The custom-domain wizard's domain box** | `components/dashboard/CustomDomainSetup.tsx:353` | `type="text"`, **nothing else** | `type="text"` + all four |
| 2 | **Truck details → Website** | `app/manage/[token]/page.tsx:9359` (`<Input>`) | **`type="text"`** (the default), nothing else | `type="text"` + all four |
| 3 | **Settings → "Where do you post your schedule?"** | `app/manage/[token]/page.tsx:9747` | `type="url"` only | `type="url"` + three |
| 4 | **Setup flow → the same question** | `app/manage/[token]/page.tsx:5664` | `type="url"` only | `type="url"` + three |

🔴 **THE TWO YOU ARE MOST LIKELY TO HAVE HIT ARE 1 AND 2, AND THE REASON IS THE SAME.** Both are
`type="text"`. iOS Safari suppresses autocorrect and autocapitalisation on `type="url"` and
`type="email"` of its own accord — **it does nothing for `type="text"`**, which is exactly where
`pizzeriagusto` becomes `Pizzeria Gusto`. Field 2 is `type="text"` only because the shared `<Input>`
defaults to it and the call site never passed a type.

### The attributes, and what each one is for

| Attribute | Why |
|---|---|
| `autoCapitalize="none"` | Stops the first letter being upper-cased. The HTML-spec value; iOS and the Android IME both honour it. **This is the half of the bug that produced the capital P.** |
| `autoCorrect="off"` | Non-standard, **WebKit only, and it is the half that matters most here** — it stops iOS substituting a dictionary word for an unrecognised one. Without it `pizzeriagusto` is offered as `Pizzeria Gusto` and accepted on the space or the next punctuation. |
| `spellCheck={false}` | The cross-browser one. Removes the red underline, and on several Android IMEs it is what stops the suggestion strip auto-replacing. Chrome, Firefox and both WebViews honour it. |
| `inputMode="url"` | Gives the on-screen keyboard its URL layout — a visible `.` and `/`, no space bar hogging the row — **without touching the element's type**, so validation and submission are untouched. This is the attribute that lets us fix the keyboard without fixing the type. |

**Coverage across the shells:** `autoCapitalize` + `spellCheck` are honoured by Chrome/Android WebView;
`autoCorrect` + `autoCapitalize` by Safari/iOS WKWebView; `spellCheck` by desktop browsers.
**No single attribute covers all four targets, which is why all four are set.**

### ⚠️ THE TYPES WERE NOT CHANGED, AND HERE IS WHERE IT WOULD HAVE BROKEN THINGS

You asked me to say so if a type change would alter validation or submission. **It would, on both
`type="text"` fields, and I left both alone:**

- 🔴 **The wizard's domain box must stay `text`.** It holds a **bare domain** — `yourtruck.com`, with no
  scheme, because `events.` is fixed text beside it. **That is invalid for `type="url"`**, which
  requires a scheme. Switching the type would mark every correct entry as invalid.
- 🔴 **The Website field must stay `text`.** Its own `onBlur` comment says an unrecognisable string is
  *"LEFT AS TYPED and still saved"* — it is free text an operator may fill however they like.
  `type="url"` would attach constraint validation to a field deliberately kept permissive.
- **The two `type="url"` fields keep their type.** They already carry constraint validation that the
  Verify button and the blur-save rely on.

### The `Input` primitive — three opt-in props, proven inert

`components/manage/primitives.tsx` gained `autoCapitalize`, `autoCorrect` and `spellCheck`, all
optional. **All three default to `undefined`, and React omits an attribute whose value is `undefined`.**
Executed from both the pre-edit and post-edit source over five existing prop shapes:

```
  ✅ byte-identical: <Input label="Truck name">     ✅ byte-identical: <Input label="Deal name">
  ✅ byte-identical: <Input label="Price">          ✅ byte-identical: <Input label="Postcode">
  ✅ byte-identical: <Input label="Email">
  ✅ all 5 existing prop shapes render byte-identically
```

### ⚠️ ADJACENT, FOUND, NOT CHANGED

- **`Email` (`app/manage/[token]/page.tsx:9404`)** — `type="email"`, so iOS already suppresses both.
  **Android's IME still capitalises it.** Not a web address, so outside your scope; **one line if you
  want it.**
- **`Phone`, `Postcode`, `Full address`, `Area`** — same family, same one-line fix, all outside scope.
- 🔴 **Before this change, exactly two `spellCheck` attributes existed in the entire codebase**
  (`app/admin/page.tsx:1850`, `components/manage/DeleteAccountSection.tsx:304`) and **not one
  `autoCapitalize` or `autoCorrect` anywhere.** This is a codebase-wide gap, not four bad fields.

### Rendered, from the executed module

```html
<input type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck="false"
       placeholder="yourtruck.com" aria-label="Your own web address" … />
```
```
  ✅ type="text"   ✅ inputmode="url"   ✅ autocapitalize="none"   ✅ autocorrect="off"   ✅ spellcheck="false"
```

---

## 2. THE MODAL NO LONGER CLOSES ON A BACKDROP CLICK

**Removed:** `onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}` from the backdrop,
and with it the `onClick={e => e.stopPropagation()}` on the panel — which existed **only** to defend
against that handler and is dead weight without it.

**Escape.** There is **no key handler anywhere in this component**, so Escape already did nothing to the
wizard. 🔴 **But a property that holds because nobody wrote the opposite is not a property.** The manage
page's own children already register Escape listeners on `document` and `window`
(`DeleteAccountSection.tsx:134`, `Walkthrough.tsx:83`), and the next one added would dismiss a
half-finished setup with no change in this file. **So the swallow is now explicit, and it is in the
CAPTURE phase** — capture listeners on `document` run before bubble listeners on `document`, which is
where the existing ones are, so it reaches the event first. **Registered only while the wizard is open.**

```
   ✅ NO backdrop-close test anywhere in the overlay
   ✅ NO onClick on the backdrop or the panel
   rendered backdrop markup: <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
   ✅ Escape swallowed  ·  capture phase: ✅  ·  removed on close: ✅
```

**Only three controls close it now** — `Not now`, and the two `Close` buttons (resume-failed, record) —
and all three go through one `closeWizard()`. Proven: **`setOpen(false)` call sites outside
`closeWizard` = 0.**

### 🔴 THE PREMISE IN YOUR BRIEF IS WRONG, AND IT CHANGES THE RETROFIT DECISION

You wrote *"this makes it inconsistent with the other modals in that file, which all close on backdrop
click."* **They do not.** Every `fixed inset-0` overlay in `app/manage/[token]/page.tsx`, counted:

| Dismiss behaviour | Count |
|---|---|
| **No backdrop click handler at all — cannot be dismissed that way** | **22** |
| Backdrop-only close (the `e.target === e.currentTarget` test) | 4 |
| An `onClick` with **no** target test — dismisses on any click the panel does not stop | 5 |
| **Total overlays** | **31** |

**So 22 of 31 already behave the way you have just asked the wizard to behave.** This change makes it
consistent with the majority; **the 9 that dismiss are the outliers**, and 5 of those do it through a
looser pattern than the 4 you were thinking of. **The retrofit question is the opposite way round from
the way it was posed.**

**And not one of them was touched:**
```
  before: {'target': 4, 'onclick': 5, 'none': 22}  total 31
  after : {'target': 4, 'onclick': 5, 'none': 22}  total 31
  ✅ IDENTICAL — not one other modal changed
```

---

## 3. THE ORDERING LINE IS REMOVED

Deleted: *"Tapping Order takes customers to HatchGrab to pay, so card details stay with us."* Nothing
else on that screen changed. Verified absent by rendering **every** screen:

```
   ✅ absent  address        ✅ absent  record
   ✅ absent  address + pre  ✅ absent  idle
```

🔴 **AS ASKED, ON THE RECORD: THAT EXPECTATION IS NOW STATED NOWHERE IN THE FLOW.** Not on the address
screen, not on the record screen, not in the instructions email, not in the go-live email, not in the
confirm block, not in the manage-page banner. **An operator who tells customers "order on our website"
is misled by our silence** — which is the reason the line was written in the first place, and it is
recorded both in the code where the line used to be and in the checker's corpus, so its absence cannot
be mistaken for the rule being satisfied.

---

## 4. READ, THEN FIXED — THE STALE PROVIDER LINE

### The read

**Where the data comes from.** `runPreflight()` calls `domain_preflight`, which returns a provider
identified from the domain's **nameservers**. The response is stored **twice**: `setPre(d)` and
`setProvider(d.provider ?? null)`. The line renders inside `{pre && …}` → `{provider && …}`, so it needs
both.

🔴 **WHAT HOLDS IT BETWEEN OPENS: NOTHING CLOSES. `open` IS ONLY A BOOLEAN, AND THIS COMPONENT NEVER
UNMOUNTS.** It renders the **card** on the Settings tab, which is always mounted; the modal is a branch
inside it. So every `useState` — `pre`, `provider`, `error`, `typedDomain` — survives a close, exactly
as if the wizard were still open.

**Why it survives.** `Not now` was `onClick={() => setOpen(false)}`. **It cleared nothing.** Deleting the
text only clears `typedDomain`; `pre` and `provider` are untouched, so the reopened screen shows a
provider derived from an address that is no longer in the box.

🔴 **AND IT WAS WORSE THAN REPORTED. THE STALE `pre` ALSO ARMED THE WRONG BUTTON.** `pre` being non-null
is what flips the label to `Set up this address` — **and that branch had no `!address.trim()` guard**,
only the pre-flight branch did. So the reopened screen offered an **enabled** button that would POST an
**empty address**. Reproduced by execution before the fix.

### The fix

One `closeWizard()`, used by all three dismiss controls, clearing everything derived from an address:
`pre`, `provider`, `error`, `provisionFailed`, `resumeFailed`. ⚠️ **`rows` and `emailSent` are
deliberately NOT cleared** — they belong to the record step, only reachable once a domain has actually
been provisioned, and the resume effect re-reads them. **And `!address.trim()` is now on the provision
branch too.**

```
   closeWizard clears: ✅Pre ✅Provider ✅Error ✅ProvisionFailed ✅ResumeFailed
   every dismiss control routes through it: setOpen(false) call sites outside closeWizard = 0
   AFTER closeWizard → reopen (pre=null, provider=null):
     ✅ no provider line
     ✅ button is back to "Check this address"
     ✅ with an EMPTY address the provision button is disabled
```

---

## 5. READ, THEN FIXED — 🔴 IT IS A PROVISIONING FAILURE, NOT A STEP

### The read — and it is the case your own brief anticipated

**It is not a screen and not a step.** Pressing `Set up this address` calls `provision()` →
`domain_provision`. The server runs the plan gate, the subdomain guard, the `www` refusal and the SOA
check, then calls the hosting API — which returns `not_configured`, **because none of the three hosting
credentials is set** (confirmed: `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` all absent).
The route returns HTTP **200** with `{ok:false}`, the client calls `setError(…)` and returns.

🔴 **SO THE STEP NEVER CHANGES, AND THE SCREEN RE-RENDERS ALMOST IDENTICALLY.** Reproduced by execution:

```
Something is not set up on our side, so we could not add your address. Nothing has changed at your
end. Try again shortly. │ Your schedule gets its own web address. What is your web address? … Your
web address is looked after by Cloudflare. We will show you where to go. │ Set up this address │ Not now
```

**The message IS rendered** — but as one small red line at the very **top** of a panel that is
`max-h-[85vh] overflow-y-auto`, while the button that caused it is at the **bottom**. On a phone the two
are not on screen together. Everything else is unchanged, and the button still reads `Set up this
address`. **That is why it reads as a dead end whose only option is to press the same button again.**

🔴 **YOUR BRIEF SAID: "If what is actually happening is a provisioning failure rendering as a dead end,
SAY SO and fix the failure presentation rather than the step order." THAT IS EXACTLY THE CASE, SO I
FIXED THE PRESENTATION AND DID NOT TOUCH THE STEP ORDER.** The instruction resolved through its own
escape clause; there was nothing to stop and ask about.

### The fix — the failure is a state, not a line of red text

A `provisionFailed` flag (set only by `provision()`, cleared by every fresh attempt and by
`closeWizard`) — because `error` is shared with the apex guard, the copy button and the email send, and
cannot tell the screen which of them failed. When it is set:

- a **bordered red block beside the button that caused it**, headed *"We could not set that address
  up."*, carrying the reason;
- the button **renames itself to `Try again`**, so pressing it again is a named retry rather than an
  apparently-fresh attempt at an unchanged action;
- the top-of-modal red line is **suppressed**, so the message appears exactly once.

⚠️ **NO NEW STEP AND NO NEW SCREEN**, and none would be honest: nothing was written on failure, so there
is no state to advance into.

```
   SUCCESS → record step: ✅ rows + copy buttons + timing + email
   FAILURE → same step, but presented as a state:
     ✅ a heading naming the outcome
     ✅ the reason, beside the button
     ✅ the button renamed to "Try again"
     ✅ the message appears exactly once (top line suppressed)
```

🔴 **AND THE UNDERLYING FAILURE IS NOT FIXED, BECAUSE IT CANNOT BE FROM HERE.** Until the hosting
credentials are set, **every** press of that button fails. What changed is that the operator is now told
so clearly, once, where they are looking. **Setting those credentials is the actual fix and it is not a
code change.**

---

## 6. WHAT IS UNCHANGED

| | |
|---|---|
| `app/api/manage/route.ts` — provisioning, both guards, the plan gate, both rate limiters | ✅ **`cmp -s` BYTE-IDENTICAL** |
| `lib/custom-domain/*` (`vercel`, `copy`, `apex`, `dns`), `lib/ratelimit.ts`, `lib/features.ts` | ✅ **not opened** |
| The other 30 overlays in the manage page | ✅ **dismiss behaviour identical, counted before and after** |
| Every other `<Input>` call site | ✅ **byte-identical, proven by execution** |
| The record step's rows, hints, copy buttons and timing line | ✅ untouched |
| `scripts/check-plain-english.mjs` | **47/48 pass**, 1 pre-existing `KNOWN` |

**Files changed: four.** `components/dashboard/CustomDomainSetup.tsx`,
`app/manage/[token]/page.tsx`, `components/manage/primitives.tsx`, `scripts/check-plain-english.mjs`.

**ESLint:** no new rule violated. The only delta is one more use of the **pre-existing** `Btn`-declared-
in-render pattern (`react-hooks/static-components`), which every button in that file already trips.

---

## 7. WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING WAS OPENED IN A BROWSER, AND FOR THIS WORKSTREAM THAT MATTERS MORE THAN USUAL.** The
   entire point of §1 is **how an operating system's keyboard behaves**, and **that cannot be observed
   from markup.** I have proven the five attributes are on the element. **I have NOT proven iOS stops
   correcting, or that the Android IME stops capitalising** — those are facts about a phone. **This
   needs one physical device each; it is a two-minute test and it is the only one that closes §1.**
2. 🔴 **THE BACKDROP CLICK AND THE ESCAPE KEY WERE NOT PRESSED.** I proved the handler is gone from the
   markup and that the capture listener is registered and removed. **A real click and a real keypress
   were not performed.**
3. ⚠️ **The Escape swallow is defensive against a listener that does not exist yet.** Today Escape does
   nothing to this wizard either way. If a future listener registers in the capture phase *before* this
   one, ordering decides it — capture order is registration order among capture listeners on the same
   node.
4. ⚠️ **`inputMode="url"` on a field that holds a bare domain shows a keyboard with a `/` key** the
   operator should not need. It is the closest standard mode; `inputMode="text"` would lose the visible
   dot, which is worth more.
5. 🔴 **The removed ordering line has no home yet**, and until it does the expectation is unstated. §3.
6. **The four adjacent fields in §1** (email, phone, postcode, address) still autocapitalise on Android.
