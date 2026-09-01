# The custom-domain wizard — cutting the copy

**WHICH OF THE THREE I PERFORMED: ALL THREE — a PARSE, a TYPECHECK, and an EXECUTION.**
- **Parse** — every string quoted here is read from a file on disk.
- **Typecheck** — `npx tsc --noEmit`, clean. `npx eslint` on all four touched files, delta below.
- **Execution** — the **real `CustomDomainSetup.tsx` module was transpiled and run** in a `vm` with
  `useState` driven state-by-state, and every screen rendered through `react-dom/server`. The **real
  `apex.ts` guard was executed** on refusing inputs. The **real `copy.ts` `recordRows()` was executed**
  to build the three rows. Both the old and the new component were rendered **from the same harness, on
  identical state**, so every before/after count below is measured, not estimated.

**NO DEPLOY. NO MIGRATION. NO SQL.** Pizzeria Gusto's row was not read or written.
**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

## THE HEADLINE

| | Before | After | |
|---|---|---|---|
| **Total across the wizard's screens** | **751 words** | **428 words** | **−43%** |
| The address screen | 116 | **42** | **−64%** — a third of what it was |
| The address screen, no website on file | 128 | **56** | −56% |
| After pre-flight, all warnings showing | 218 | **130** | −40% |
| The record screen | 74 | **67** | −9% — **see §4, it is nearly all protected text** |
| `idle` | **0 — an empty panel** | **12 / 19** | **it now renders** |

⚠️ **Counts are of the MODAL ONLY** — everything after the card's description — so old and new are
compared like for like. They include button labels and field placeholders, because an operator reads
those too.

---

## 1. THE ADDRESS SCREEN — 116 → 42 WORDS

### Before, rendered

```
You get a new web address for your schedule. It is your own address with a word in front.
Your website today
www.pizzeriagusto.co.uk
Your new schedule address
events.pizzeriagusto.co.uk
Your website does not change at all. It carries on exactly as it is, and you add a link to
the new address from it. We keep the schedule page up to date for you.
Your schedule sits at your own address. When a customer taps Order, we take them to
HatchGrab to pay — that part stays with us, so card details are always handled on our side.
We will set up events.pizzeriagusto.co.uk for you. Your website keeps working exactly as it
does now.
Continue    Not now
```

### After, rendered

```
Your schedule gets its own web address.
events.pizzeriagusto.co.uk
Your website does not change — you just add a link to the new address.
Tapping Order takes customers to HatchGrab to pay, so card details stay with us.
Check this address    Not now
```

**Four things, one button, in the order you named them.** What went:

| Cut | Words | Why |
|---|---|---|
| *"You get a new web address for your schedule. It is your own address with a word in front."* | 18 | The address below it says this. A description of a shape, above the shape. |
| The two-address block — *"Your website today"* / their domain / *"Your new schedule address"* | 8 | Their existing address was never in question and never needed a caption. |
| *"It carries on exactly as it is"* | 7 | The second of three statements of the same fact. |
| *"We keep the schedule page up to date for you."* | 9 | Not one of the four things the screen needs. **⚠️ A deliberate drop — say the word and it goes back.** |
| The whole confirmation line, *"We will set up … Your website keeps working exactly as it does now."* | 16 | The third statement of the same fact, and the address is already on screen. |
| *"Your schedule sits at your own address"* (opening the ordering box) | 7 | Fourth restatement, in the box that exists to say the opposite. |

### 🔴 PROOF: NO SCREEN STATES THE WEBSITE-IS-UNAFFECTED FACT MORE THAN ONCE

Every rendered screen scanned for all five phrasings of it that existed
(*"Your website does not change"*, *"carries on exactly as it is"*, *"keeps working exactly as it does
now"*, *"Your schedule sits at your own address"*, *"does not change at all"*):

```
  ✅ 0×  CARD — closed, in Settings          ✅ 1×  ADDRESS — website on file
  ✅ 0×  CARD — closed, already live         ✅ 1×  ADDRESS — NO website on file
  ✅ 0×  RECORD — provider known             ✅ 1×  ADDRESS — after pre-flight, all warnings
  ✅ 0×  RECORD — no provider                ✅ 1×  ADDRESS — pre-flight, padlock blocked
  ✅ 0×  IDLE — resuming                     ✅ 0×  CONFIRM block
  ✅ 0×  IDLE — could not load
```

**Every hit is the same single sentence.** Before the cut, the has-website screen scored **3**.

### The no-website path — 128 → 56

The field stays; *"Your schedule will be at events.…"* goes, because the `events.` chip sits against
the box and assembles the address in front of them as they type. *"We do not have it on file."* goes
with it. ⚠️ **That second one was doing a job** — it explained why we are asking rather than knowing —
and it is the drop I am least sure of.

⚠️ **A bug the cut removed by accident.** My audit recorded that on this path the old example block
showed `www.yourtruck.com` and `events.yourtruck.com` — **the placeholder twice, the operator's own
address nowhere.** Deleting the block deleted that.

---

## 2. BUTTON LABELS

| Where | Before | After |
|---|---|---|
| Address, before the check | 🔴 `Continue` | **`Check this address`** |
| Address, mid-check | `Checking…` | `Checking…` — unchanged |
| Address, after the check | `Set up this address` | unchanged — it already named what happens |
| Record, the email | 🔴 `Send it` | **`Send these details`** |
| Record, the only button | 🔴 `Done` | **`Close`** |
| Resume failed | — | **`Close`** |

### 🔴 `Done`, the important one

It was the only button on the screen, it sat directly under an email form, and **pressing it verified
nothing** — the record may never have been added, and nothing is checked. The operator who added it and
the operator who did not pressed the same button and were both told they had finished.

**It now says `Close`, and that is the whole change.** No second button, no confirmation step, per the
brief — there is nothing here to confirm against anyway. The timing line directly above it already says
what happens next and that they need not wait on the page.

### `Continue` → `Check this address`

Nothing on that screen said a check would run. The operator found out only because the label turned
into `Checking…` **after they had already pressed it** — a label that can only be understood in the
past tense.

⚠️ **ONE `Continue` IS STILL THERE AND I LEFT IT.** The card's own button reads `Continue` when a
setup is part-finished. Your item 2 named the address screen's `Continue`, so that is the one I
changed. The card's is now less bad than it was — pressing it lands on *"Picking up where you left
off…"* instead of a blank panel — but it still does not name what happens. **One word if you want it.**

---

## 3. WHAT WAS SIMPLY WRONG

### (a) "schedule." as the example word — 🔴 THREE STRINGS, ALL THREE CORRECTED

| File | Was | Now |
|---|---|---|
| `lib/custom-domain/apex.ts` (apex refusal) | `for example schedule.${host}.` | `for example events.${host}.` |
| `lib/custom-domain/apex.ts` (too many parts) | `Something like schedule.` | `Something like events.` |
| `app/api/manage/route.ts` (the `www` refusal) | `Use a different word in front, like schedule.` | `…like events.` |

### (b) 🔴 THE CAA WARNING POINTED AT A MESSAGE THAT WAS NOT THERE

It said *"Send them the message below and mention it."* **There is no message below** — the email is on
the next screen. The collision warning right beside it already said *"on the next screen"*; this one
did not.

**It also had to be rewritten rather than patched**, because adding it to the checker's corpus (your
item 6) exposed that it broke the plain-English rule twice — *"domain"* and *"security certificates"*
are both banned words, and this string had never been fed to the checker:

> **Before:** Your domain has a rule that limits who can issue its security certificates, and we are not
> on the list. Setting this up will still work, but the padlock will not appear until whoever looks
> after your domain adds us. **Send them the message below and mention it.**
>
> **After:** Whoever looks after your web address has to let us set up the padlock — the little lock
> customers see beside it. This still works without it, but the padlock will not appear until they add
> us. **Mention it in the message on the next screen.**

The blocked variant went the same way, 20 → 19 words:

> **Before:** Your domain currently blocks all security certificates. Whoever looks after it will need
> to change that before this can work.
>
> **After:** Your web address currently blocks the padlock completely. Whoever looks after it has to
> allow it before this can work.

⚠️ **THIS IS MORE THAN YOU ASKED FOR ON THESE TWO STRINGS.** You asked me to fix "below". Item 6 made
the rule violation visible, and the honest options were to rewrite or to file a `KNOWN` entry — and
`KNOWN` is documented as being for *"copy the current brief may not touch"*, which is not true here.
**I rewrote. Tell me if you would rather have had the exact old words with only "below" corrected.**

### (c) 🔴 TWO ERRORS PRINTED ENVIRONMENT-VARIABLE NAMES TO AN OPERATOR

`VERCEL_PROJECT_ID is not set` (reason `not_configured`) and `VERCEL_API_TOKEN is not set` (thrown
inside `call()`, caught, returned as reason `error`) were **forwarded verbatim and rendered in red,
under "Setting up…", on an operator's screen.**

**The branch is on `reason`, and the message is ours.** At the `addDomain` call site in
`app/api/manage/route.ts`:

```ts
console.error('[domain_provision] addDomain failed:', added.reason, added.status, added.message)
return NextResponse.json({ ok: false, reason: added.reason, message: PROVISION_FAILED[added.reason] }, { status: 200 })
```

```ts
const PROVISION_FAILED: Record<'taken' | 'not_configured' | 'refused' | 'error', string> = {
  not_configured: 'Something is not set up on our side, so we could not add your address. Nothing has changed at your end. Try again shortly.',
  taken: 'That address is already in use somewhere else.',
  refused: 'We were not allowed to add that address.',
  error: 'We could not add that address just now. Nothing has changed at your end. Try again shortly.',
}
```

🔴 **WHY A MAP AND NOT TWO PATCHED STRINGS.** You named `not_configured`, which covers
`VERCEL_PROJECT_ID`. **`VERCEL_API_TOKEN` does not come back as `not_configured`** — it is thrown
inside `call()`, caught by `addDomain`'s own `catch`, and returned as reason `'error'` with the
exception's message. Branching only on `not_configured` would have left the second one leaking, and
your verification asks me to prove **no** error string contains "VERCEL". Mapping every reason makes it
**safe by construction**: nothing the hosting API or a thrown error puts in `message` can reach the
screen through that return. **`lib/custom-domain/vercel.ts` is byte-identical** — I did not reclassify
the reason there, which would have been a change to provisioning.

⚠️ *"Nothing has changed at your end"* is on the two that are our fault, deliberately. An operator who
has just watched a setup fail will otherwise go looking at their own web address for damage that is not
there.

### 🔴 PROOF: NO ERROR STRING CONTAINS "VERCEL" OR OFFERS "schedule."

Every error an operator can be shown, **produced by executing the real modules** — `checkSubdomain` run
on five refusing inputs, both server guards evaluated as template literals, and the four
`PROVISION_FAILED` values read from the map:

```
  ✅  Type the address you would like to use.
  ✅  That does not look like a web address.
  ✅  yourtruck.com is your whole website address. … for example events.yourtruck.com.
  ✅  www.yourtruck.com is usually where your existing website already lives. … like events.
  ✅  www.yourtruck.com is your whole website address. … Put a word in front of it instead.
  ✅  Something is not set up on our side, so we could not add your address. Nothing has changed at your end. Try again shortly.
  ✅  That address is already in use somewhere else.
  ✅  We were not allowed to add that address.
  ✅  We could not add that address just now. Nothing has changed at your end. Try again shortly.

  strings containing "VERCEL"    : 0
  strings offering "schedule."   : 0
```

**And the one remaining leak path was closed by inspection, not assumption:** `getDomainConfig` can
also return `VERCEL_API_TOKEN is not set`, and **all four of its call sites take `cfg.ok ?
cfg.recommendedCNAME : null`** — the message is never read, let alone forwarded.

---

## 4. THE RECORD SCREEN — 74 → 67, AND WHY IT IS NOT HALF

The three rows, their hints and their copy buttons stay, and the timing line stays. **That is 51 of the
67 words**, and the brief protects all of it. What was left to cut was 23 words, and 16 of them went:

| | Before | After |
|---|---|---|
| Instruction | *"Go to Cloudflare"* + *"Add this, and save."* (7, two blocks) | **"Add this at Cloudflare, and save."** (6, one) |
| Instruction, no provider | *"Go to whoever looks after your domain"* + *"Add this, and save."* (11) | **"Add this where your web address is looked after, and save."** (10) |
| Email offer | *"Someone else looks after your domain? We will send them this, with the reason."* (14) | **"Someone else looks after your web address?"** (7) |

The email sentence lost its second half because **the button now names the payload** — `Send these
details` — so saying it twice was the same fault the address screen had.

**Rendered after:**

```
Add this at Cloudflare, and save.
Open Cloudflare
TYPE   Choose this from the list.              CNAME                  Copy
NAME   Just this word, not the whole address.  events                 Copy
VALUE  Copy this exactly.                      cname.vercel-dns.com   Copy
It usually starts working within an hour, though it can take longer. You do not need to keep
this page open.
Someone else looks after your web address?   [their email address]  Send these details
Close
```

**The rows are byte-identical, and they come from a byte-identical file.** `lib/custom-domain/copy.ts`
compares equal with `cmp -s`; the executed `recordRows()` output renders all six protected values —
`Choose this from the list.` / `Just this word, not the whole address.` / `Copy this exactly.` /
`CNAME` / `events` / `cname.vercel-dns.com`. `TIMING_LINE` is unchanged, from the same file.

---

## 5. 🔴 THE EMPTY MODAL — `idle` NOW RENDERS

`setStep('idle')` is what the open button seeds whenever a domain is already stored. **No branch matched
`'idle'`**, so when the resume fetch did not produce a record the operator got a white panel over a
black backdrop: **no text, no button, nothing to press but the backdrop.** It is reachable today —
`cname_target` needs hosting credentials that are not set, so `if (!d.address || !d.cname_target)`
fires on **every** resume.

**Three changes:**
1. A `resumeFailed` state. The `catch` used to swallow the failure entirely (`/* resume is best-effort */`).
2. The early return — the one that actually fires today — now sets it too, not just the `catch`.
3. Reopening from the card clears it, so a retry is a retry.

### PROOF: BOTH CASES RENDER

Rendered from the real module, with the modal's own body isolated:

```
  ✅  IDLE — resuming      : 'Picking up where you left off…'
  ✅  IDLE — could not load: 'We could not load your setup. Nothing has changed. Try again shortly. Close'
```

⚠️ **TWO STATES BECAUSE THEY ARE DIFFERENT PROMISES.** Before the fetch settles we are still working,
so it says so and offers nothing to press. After it fails, waiting will not help — so it says so, says
nothing has changed, and gives them a way out.

---

## 6. THE PLAIN-ENGLISH CHECKER — CORPUS 24 → 47 STRINGS, 46/47 PASS

```
  46/47 pass, 1 known violation(s)
```

The one is the **pre-existing** `QR: print or display` entry, untouched and unrelated.

**Added — every string this workstream changed or created:** the address heading, the
website-unaffected line, the ordering line, the no-website help, all four address-screen button labels,
both padlock warnings, the collision warning, the provider line, both record instructions, the email
offer, `Send these details`, `Close`, all three resume strings, the three corrected guard messages, and
all four `PROVISION_FAILED` values.

**Added though unchanged, because they are on screens I rewrote and they pass:** `TIMING_LINE` (which
your brief singles out as staying), the three record-row hints, and `Copy`.

**Removed, because no screen shows them any more:** `first screen, line 1`, `first screen, label a`,
`first screen, label b`, `confirm line`, `no-website assembled`.

🔴 **THE THREE ROW VALUES ARE DELIBERATELY NOT IN THE CORPUS, AND THE REASON IS IN THE FILE.** `CNAME`
is a banned word **and** it is the thing the operator types into a box — the provider's vocabulary, not
a word we are explaining with. The component's own header already draws that line. Adding it would ask
the checker to police a value. **This is stated, not silent.**

⚠️ **One stale placeholder corrected while I was in there:** the `QR: domain live` corpus entry used
`schedule.yourtruck.com` as its example. **The live line renders `truck.custom_domain`, so this was
never operator-facing copy** — only a corpus placeholder documenting a word in front we no longer use.

---

## 7. WHAT IS BYTE-IDENTICAL

| | |
|---|---|
| `lib/custom-domain/copy.ts` — `recordRows`, `TIMING_LINE`, `CONFIRM_COPY` | ✅ **`cmp -s` equal** |
| `lib/custom-domain/vercel.ts` — the whole hosting client | ✅ **`cmp -s` equal** |
| `lib/custom-domain/dns.ts`, `lib/ratelimit.ts`, `lib/features.ts` | ✅ **not opened** |
| The `patch` object `domain_provision` writes (1,657 chars) | ✅ **byte-identical** |
| The `update` + the success response (1,101 chars) | ✅ **byte-identical** |
| The SOA apex guard block | ✅ **byte-identical** |
| `embed_enabled: true`, `custom_domain_setup_state`, the action allow-lists | ✅ unchanged, counts equal |
| The plan gate, both rate limiters, every `checkSubdomain` call site | ✅ unchanged, counts equal |
| The modal pattern — overlay, backdrop test, `stopPropagation` | ✅ untouched |

**`domain_provision` from its opening brace to the `addDomain` call differs by exactly one string** —
the `schedule.` → `events.` fix you asked for:

```
-  … Use a different word in front, like schedule.`,
+  … Use a different word in front, like events.`,
```

**`lib/custom-domain/apex.ts` differs by exactly two lines**, both example words. The guard logic —
`psl`, the apex test, the label-depth test — is untouched.

### ESLint delta

Identical before and after **except one line**:

```
-   6 react-hooks/static-components  CustomDomainSetup.tsx
+   7 react-hooks/static-components  CustomDomainSetup.tsx
```

⚠️ **That is one more use of the SAME pre-existing violation, not a new one.** `Btn` is declared inside
the component (it always has been) and every button in the file trips the rule; the resume-failed
`Close` button makes seven. **Not using `Btn` for it would have made it the only button in the file
styled differently.** The real fix is hoisting `Btn` out of render — a refactor, outside "wizard copy,
button labels, and the two step bugs". **Flagged, not done.**

---

## 8. WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING WAS LOADED IN A BROWSER.** Every screen above came from `react-dom/server` with
   `useState` driven by hand, in the declared order. **The state machine itself was not exercised** — I
   asserted what each state renders, not that a real click sequence reaches it. In particular the
   `idle` → `record` transition and the `resumeFailed` reset on reopen are **wired and typechecked, not
   observed**.
2. ⚠️ **Word counts include button labels and placeholders** and treat a rendered address
   (`events.pizzeriagusto.co.uk`) as one word. A different counting rule moves every number a little;
   the before and after use the same rule and the same harness.
3. **`suggestFromWebsite(website, word = 'schedule')` still defaults to `schedule`** —
   `app/api/manage/route.ts:1052` returns it as `suggestion`. **It is not an error string and the
   wizard never reads it**, so it was outside your item 4a; but it is the last `schedule` left in this
   feature and it will mislead whoever picks it up next.
4. **The card's `Continue` still does not name what happens.** §2.
5. **`Not now` and `Set up this address` were not re-examined** — both already name what they do.
6. ⚠️ **The `'email'` step is still declared in the `Step` type and still never set.** My audit found
   it; nothing in this brief covered it, and removing a type member is not copy.
