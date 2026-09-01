# One button, Yes and No, the description, the notification

**WHICH OF THE THREE I PERFORMED: ALL THREE — a PARSE, a TYPECHECK, and an EXECUTION.**
- **Parse** — every handler, string and condition quoted here is read from a file on disk.
- **Typecheck** — `npx tsc --noEmit`, clean.
- **Execution** — the **real component was transpiled and run** and the card rendered in **six states**
  including both answers; the description's address was compared against the **wizard's own `address`**
  across six shapes of `trucks.website`; the Yes handler and the whole wizard were diffed byte for
  byte; and the No handler was extracted from the source and read in full.

**NO DEPLOY. NO MIGRATION. NO SQL.** Pizzeria Gusto untouched.
🔴 **I DID NOT STOP ON ITEM 2, AND §2 IS WHERE I JUSTIFY THAT — read it before accepting.**

⚠️ **ONE THING TO FLAG, AS ASKED: your prompt ends with a stray trailing backslash** after *"as the
LAST SENTENCE of your reply."* Nothing was lost that I can see — the instruction is complete — but I
am naming it rather than assuming.

⚠️ **AND MOST OF THIS BRIEF WAS ALREADY BUILT.** Items 2, 3 and 4 were delivered in the previous
workstream and are unchanged; I verified each against the current source rather than assuming, and the
proofs below are fresh. **Item 1 is the only new work.** Nothing was re-done for the sake of it.

---

## 1. THE DESCRIPTION — ONE SENTENCE

**Before:** *"We create a page at `events.testtruck.test` showing where you're trading next. **Your own
website stays exactly as it is.**"*

**After:** *"We create a page at `events.testtruck.test` showing your schedule."*

**The address resolves exactly as it did** — `props.customDomain` first, then
`` `events.${fixedDomain}` `` derived from `trucks.website`, then the placeholder. **`cardAddress` is
unchanged**, and `domainFromWebsite` call sites are `3 → 3` (two calls plus one mention in a comment),
so **no second normalisation was added.**

**Proven against the wizard, executed on six shapes of website:**

```
  trucks.website                         card says                  wizard's `address`
  https://www.thaikitchen.co.uk          events.thaikitchen.co.uk   events.thaikitchen.co.uk   ✅
  https://thaikitchen.co.uk/menu         events.thaikitchen.co.uk   events.thaikitchen.co.uk   ✅
  www.thaikitchen.co.uk                  events.thaikitchen.co.uk   events.thaikitchen.co.uk   ✅
  http://shop.thaikitchen.co.uk/x?y=1    events.thaikitchen.co.uk   events.thaikitchen.co.uk   ✅
  thaikitchen.co.uk                      events.thaikitchen.co.uk   events.thaikitchen.co.uk   ✅
  https://www.bbc.co.uk                  events.bbc.co.uk           events.bbc.co.uk           ✅
```

### 🔴 AS ASKED: NOTHING ON THE CARD NOW SAYS THEIR WEBSITE IS UNAFFECTED

Scanned across **all six rendered card states**, for every phrasing of it this feature has ever used:

```
  ✅ absent  "stays exactly as it is"      ✅ absent  "keeps working exactly"
  ✅ absent  "does not change"             ✅ absent  "website is not affected"
  ✅ absent  "carries on exactly"
  ✅ NONE — the card no longer states it in any state
```

**The wizard still does, once**, on the address screen — verified by rendering it:

> *"Your website does not change — you just add a link to the new address."*

🔴 **SO THE REASSURANCE SURVIVES ONE SCREEN FURTHER IN, AND AN OPERATOR WHO READS ONLY THE CARD NO
LONGER GETS IT.** That is the trade, and it is the whole of it: they meet the reassurance only after
pressing `Set up`. **Recorded in the code where the sentence used to be, and in the checker's corpus, so
its absence reads as a decision rather than an oversight.**

---

## 2. 🔴 HIDING THE CARD BUTTON — WHAT IS REACHABLE, AND WHY I PROCEEDED

**Re-confirmed against the current source: that button is the only `setOpen(true)` in the file**, so it
is the only route into the modal, and therefore the only route to the record's field values and to the
"Someone else looks after your web address?" email form.

**The window is `props.verifiedAt && !confirmed && !saidNo`** — live, and not yet answered.

| In that window | |
|---|---|
| Their live page | ✅ **yes** — step 1 is a link |
| Either answer | ✅ **yes** |
| The problem email, pre-filled | ✅ **yes**, one click on "No" |
| 🔴 **The record's field values** | 🔴 **NO** |
| 🔴 **The record screen's email form** | 🔴 **NO** |

### Why this is not stranding

🔴 **NOTHING BECOMES UNREACHABLE — IT BECOMES ONE FREE CLICK AWAY, AND YOUR OWN SPEC PROVIDES THE
EXIT.** The button returns after **either** answer: `confirmed` after Yes, `saidNo` after No. **And "No"
costs nothing** (§3), so an operator who wants the record values presses No, gets the button back, and
can still press Yes.

```tsx
{!open && !(props.verifiedAt && !confirmed && !saidNo) && (
```

⚠️ **THE RESIDUE, STATED PLAINLY: nothing on the card tells them "No" is free or that the button comes
back.** An operator who does not realise that will not think to press it. **If that trade is not one
you want, leaving the card button visible is a one-line revert.**

---

## 3. TWO BUTTONS — AND THE HANDLERS, PROVEN

```
Have a look, then tell us it is right
 1. Open events.testtruck.test                    ← a link
 2. Check the dates and times look right.
[ Yes, it looks right ]  [ No, there's a problem ]

…and after "No", revealed beneath them:
Tell us what you are seeing and we will look at it.      [ Email us ]
```

### Yes is byte-identical

```
  ✅ BYTE-IDENTICAL  the Yes handler (326 chars)   —  domain_confirm calls: 1 → 1
```

### No records nothing — read from the source, not asserted

```
  the entire No handler: () => setSaidNo(true)
  ✅ one screen flag. No await, no call(), no fetch, no server value touched.
  saidNo ever sent? ✅ never — it reaches no request, body or action
```

### No is reversible

**State 5 renders both buttons**, `Yes` enabled with its untouched handler. `confirmed` is not modified
by `No`, so pressing `Yes` afterwards runs the same byte-identical code. **There is nothing to undo
because nothing happened.**

✅ **The mailto is unchanged** — truck name, address, **go-live date**, not today's. Today's date is
already on the email when it is sent, and `new Date()` in a render is a hydration mismatch.

✅ **"This changes nothing on your page" was NOT re-added** — `0` occurrences in the component and `0`
in `copy.ts`.

⚠️ **Both buttons are the same orange**, on your instruction from the previous workstream — the two
`class` attributes are character-for-character identical. **Nothing now signals which answer is
expected**, and two identical primaries side by side is a pattern used nowhere else here.

---

## 4. ALL SIX STATES, RENDERED

| # | State | Card button | In the block |
|---|---|---|---|
| 1 | not set up | **`Set up`** | — |
| 2 | mid-setup | **`Continue`** | — |
| 3 | waiting | **`Continue`** | — |
| 4 | **live, UNANSWERED** | 🔵 **ABSENT** | `Yes, it looks right` · `No, there's a problem` |
| 5 | **live, after "No"** | **`View setup`** | both buttons **+ the email control** |
| 6 | **live, after "Yes"** | **`View setup`** | — (block gone) |

```
1  Add your schedule to your website   We create a page at events.yourtruck.com showing your
   schedule.                                                                          [Set up]

2  …We create a page at events.testtruck.test showing your schedule.                [Continue]

3  …We create a page at events.testtruck.test showing your schedule.                [Continue]

4  …We create a page at events.testtruck.test showing your schedule.          [Live]
   Have a look, then tell us it is right
    1. Open events.testtruck.test
    2. Check the dates and times look right.
   [Yes, it looks right]  [No, there's a problem]

5  …the same, plus:  [Live] [View setup]
   Tell us what you are seeing and we will look at it.   [Email us]

6  …We create a page at events.testtruck.test showing your schedule.  [Live] [View setup]
```

✅ **Absent in state 4 only. Present in all five others, including after Yes and after No.**

---

## 5. THE NOTIFICATION

**Before:** `**events.testtruck.test** is live. Have a look at it, then tell us it is right in your
dashboard settings.`

**After:**

```
  href   : addressUrl(truck.custom_domain)      target: _blank
  text   : truck.custom_domain
  after  : Have a look at it, then tell us it is right in Settings.
```

🔴 **BUILT THE SAME WAY, BECAUSE THERE IS NOW ONLY ONE WAY.** Both the banner and the confirm block's
step 1 call one exported helper — `addressUrl(host) => \`https://${host}\`` — so they cannot disagree
about how a stored bare host becomes a link. **Two callers, one helper**, and no other `https://${…}`
anywhere is built from a stored custom domain.

⚠️ **`dashboard settings` survives once in that file, inside the comment recording what it used to
say.** Not rendered.

⚠️ **AND THERE IS STILL A SECOND, UNRENDERED COPY OF THIS LINE.** `notificationCopy()` in `copy.ts`
returns `ready.body: 'Have a look at it, then tell us it is right in your settings.'` and **nothing
renders it** — the banner is written inline. 🔴 **The two already disagreed** (one "your settings", one
"your dashboard settings"), which is exactly how the wrong one went unnoticed. **Flagged again, not
changed: outside this brief.**

---

## 6. WHAT IS UNCHANGED

| | |
|---|---|
| 🔴 **THE ENTIRE WIZARD** — every step, `{open && overlay(` to end of file | ✅ **BYTE-IDENTICAL, 22,043 chars** |
| The `overlay` helper | ✅ **BYTE-IDENTICAL** |
| The Yes handler | ✅ **BYTE-IDENTICAL** |
| The card button's handler and all three labels | ✅ **BYTE-IDENTICAL** |
| The heading, the `Live` badge, `cardAddress`, the mailto | ✅ **BYTE-IDENTICAL** |
| `app/api/manage/route.ts` — provisioning, the guards, the plan gate, both limiters | ✅ **not opened** |
| `lib/custom-domain/apex.ts`, `dns.ts`, `vercel.ts`, `copy.ts`, `lib/ratelimit.ts` | ✅ **not opened this workstream** |
| `app/manage/[token]/page.tsx` | ✅ **not opened this workstream** (the banner landed in the previous one) |

**This workstream changed two files:** `components/dashboard/CustomDomainSetup.tsx` — **one rendered
line** plus its comment — and `scripts/check-plain-english.mjs`.

**Plain-English checker: `99/100 pass`**, the one being the pre-existing `QR: print or display`. Both
`card description` entries updated (placeholder form and real form, because the address is
interpolated), with a comment recording that the removed sentence's absence is a decision.

---

## 7. WHAT REMAINS UNOBSERVED

1. 🔴 **NO BUTTON WAS PRESSED IN A BROWSER.** Every state was rendered by driving `useState` directly.
   **The transitions were not walked** — that "No" actually restores the card button is proven from the
   render condition and a rendered state, not from a click.
2. 🔴 **NEITHER LINK WAS FOLLOWED**, and the address link is `https://` with no port — right for a real
   domain, **useless against your local test host on `:3000` over http.** Use
   `http://events.testtruck.test:3000/` for that.
3. ⚠️ **The banner was not rendered** — `/manage/x` returns 307 without a real token, so it was verified
   by reading the JSX and its resulting href expression.
4. ⚠️ **The §2 residue is a judgement, not a measurement.** Nobody has watched an operator hit that
   window and want the record values.
5. ⚠️ **`saidNo` is session state.** A reload returns them to state 4 with the button hidden again —
   consistent, since they still have not answered, but "No" is not remembered.
6. ⚠️ **The card is now one short line.** Whether it reads as too thin next to the cards around it is a
   layout question I have not looked at, and the previous measurement (6 lines at 390px) no longer
   applies.
7. ⚠️ **`notificationCopy()` remains a dead second copy of the banner's text.** §5.
