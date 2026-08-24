# WhatsApp simulator — copy and placement revisions

**Date:** 20 August 2026
**Status:** built, **NOT deployed, NOT committed, `next dev` NOT run.** Joins the undeployed batch.
**Prompt integrity:** no span arrived garbled. No instruction contradicted another — **Task 1's stop
condition did not fire; case (b) applies.** One tension inside Task 4 needed a judgement call rather than
a stop, and it is reported in full at 4.c.

✅ **ONE FILE CHANGED: `app/manage/[token]/page.tsx`.** The route, the shared classifier, the timeout
parameter, the events helper and the WhatsApp auto-replies row were **not touched** — evidenced by
mtime, since three of them are new or already-modified files with no clean baseline to diff:

```
  22:58:49  lib/whatsapp-classifier.ts                 <- earlier build task
  23:00:18  lib/whatsapp/upcoming-events.ts            <- earlier build task
  23:02:17  app/api/manage/whatsapp-preview/route.ts   <- earlier build task
  23:08:24  docs/whatsapp-simulator-build-report.md    <- earlier build task
  23:20:32  app/manage/[token]/page.tsx                <- THIS task, the only file after the report
```

`git diff --stat lib/whatsapp-classifier.ts` is still **18 insertions / 3 deletions** — unchanged from the
build task, i.e. the timeout parameter and nothing else.

---

# TASK 1 — PLACEMENT

## 1.a The actual nesting — **a parent EXISTS, and it is outside the hide**

✅ **THE NATIVE HIDE WRAPS THE SUBSECTION, NOT THE SOCIAL AREA.** Read from the file:

```
  <Card>  "Online presence & social"        line 9056   <- the parent, OUTSIDE any hide
    {!isNativeApp() && (<>                  line 9107   <- the hide OPENS here
      "Auto-replies" subsection …
    </>)}                                   line 9190   <- the hide CLOSES here
  </Card>                                   line 9200
```

The parent card's own heading is on the line after it opens:

```tsx
      <Card className="p-4 space-y-3">
        <p className="text-base font-bold text-slate-800">Online presence &amp; social</p>
```

The Website field sits between the heading and the hide. **So the section is: heading — Website —
[native-hidden Auto-replies] — `</Card>`.** There is a position inside the parent and outside the hide
at either end of that wrapper.

## 1.b ✅ CASE (b) APPLIES. MOVED, AND THE HIDE WAS NOT TOUCHED.

The simulator now renders **immediately after `</>)}` and immediately before `</Card>`**:

```tsx
        </div>
        </>)}

        {/* ── 🔴 INSIDE "Online presence & social", OUTSIDE THE NATIVE HIDE. BOTH HALVES ARE DELIBERATE. ──
            … 🔴 DO NOT MOVE IT ABOVE THAT `</>)}` TO "tidy it up next to the WhatsApp row". That would put
            it inside the hide and silently remove it from every iPad build … */}
        <WhatsAppReplyPreview token={token} />
      </Card>
```

**It also stopped being a `<Card>`.** Nesting a card inside a card would have kept it reading as an
isolated box, which is the thing you asked to fix. It now uses the **same subsection shape as the
Auto-replies block above it** — `border-t border-slate-100 pt-4 mt-1` with a
`text-sm font-bold text-slate-700` heading — so it reads as the section's last block.

✅ **The `!isNativeApp()` wrapper is byte-unchanged.** Nothing was removed, narrowed or re-scoped.

## 1.c 🔴 HOW I ESTABLISHED IT STILL RENDERS NATIVELY — AND A FIRST CHECK THAT LIED

**The structural argument, which is the one that matters:** the simulator's JSX node is **not a
descendant of the conditional expression**. `{!isNativeApp() && (<> … </>)}` is a single expression whose
children are the Auto-replies subsection alone; a sibling that follows the closing `</>)}` is evaluated
unconditionally. **There is no value of `isNativeApp()` that can remove a node outside its own
conditional** — so the conjunction's behaviour is not merely favourable here, it is irrelevant.

For completeness, the conjunction itself (`lib/native/device.ts`):

```ts
export function isNativeApp(): boolean {
  return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()
}
```

⚠️ **A `typeof` guard first, so any absence of Capacitor yields `false`** — which is why the recorded
failure direction is *"shows the section on iPad"*, never *"hides a working control on the web"*. **That
property protects the Auto-replies subsection. The simulator does not depend on it at all.**

**Verified positionally, comments stripped:**

```
  simulator INSIDE the native-hide conditional : False   <- must be False
  simulator inside Card and AFTER hide closes  : True    <- must be True
```

🔴 **AND A WARNING FOR WHOEVER AUDITS THIS NEXT.** My **first** run of that check reported a *second*
`{!isNativeApp() && (<>` at line 9195 and failed. There is no second wrapper — **line 9195 is my own
explanatory comment, which quotes the token in prose.** The check only became truthful once `{/* … */}`
blocks were blanked before scanning. **A grep for the wrapper token now returns a false positive by
construction, because the comment warning you not to move the block contains the string it warns about.**
Recorded because it will happen again to the next person.

---

# TASK 2 — HEADING

**Renamed:** `Try your WhatsApp auto-reply` → **`Try your auto-replies`**.

**Why not "Try your social media auto-replies":** the parent card is already titled *"Online presence &
social"* and the sibling subsection is titled *"Auto-replies"*. A subsection heading that re-states the
parent's scope reads as a repeat; **matching the sibling's own noun is the closest fit to the surrounding
style**, and the plural covers future channels without naming them.

## 2.a ⚠️ COPY CONSISTENCY AFTER THE RENAME — what I found, as asked

✅ **No body line in this block names WhatsApp.** The three descriptive lines, the chips, the loading
state, the IGNORE-bucket wording and the footnote are all channel-neutral, so nothing became inconsistent.

⚠️ **BUT TWO IDENTIFIERS STILL SAY WHATSAPP, AND THEY ARE NOT COPY:** the component
`WhatsAppReplyPreview` and the route `/api/manage/whatsapp-preview`. **Neither is visible to an
operator**, and the route is explicitly out of scope, so both were left. **Reported rather than changed.**

🔴 **THE SUBSTANTIVE POINT: ONLY WHATSAPP CAN ACTUALLY BE PREVIEWED.** `generateWhatsAppReply` and the
send path are WhatsApp-only; Messenger and Instagram are `coming_soon` in the matrix and their rows were
removed from the Auto-replies subsection on 14 August, so the section offers exactly one channel.
**The plural heading stays honest only because the body claims nothing about channels and there is no
channel picker implying a choice.** ⚠️ **If a body line is ever added that names or implies Messenger or
Instagram, the heading stops being forward-looking and starts being false.**

---

# TASK 3 — TEXT SIZE

**Changed:** the three lines below the heading, `text-xs text-slate-400` → **`text-sm text-slate-500`**.

## 3.a Which element I matched, and why

✅ **`text-sm text-slate-500` is what this Settings tab already uses for explanatory copy sitting under
a heading.** Three instances, all in `SettingsTab`, all the same shape — a heading followed by a
paragraph explaining it:

| Element | Copy |
|---|---|
| *"Remove {van}?"* modal body | *"This van will be removed from your account and will no longer appear on your dashboard…"* |
| *"Add another truck"* modal body | *"Your Pro plan includes 2 trucks. Adding an additional truck costs…"* |
| *"Upgrade to add more vans"* modal body | *"The Starter plan includes 1 van. Upgrade to Pro or Max to add additional vans."* |

**I rejected the more frequent candidate deliberately.** `text-xs text-slate-500 mt-0.5` is the tab's
most-used descriptive class (18 occurrences, e.g. the schedule-option descriptions) — **but it is still
`text-xs`, so matching it would not have satisfied "too small".** The modal bodies are the nearest
equivalent that is actually a step up.

## 3.b ✅ NOT A SHARED CLASS, SO NOTHING ELSE MOVED

These are **per-element Tailwind utility strings**, not a named caption class and not a component. There
is no `.caption` or shared `<Caption>` to change. **Raising the size here is scoped to this block by
construction** — the other users of `text-xs text-slate-400` in the tab were not edited and are
unaffected.

⚠️ **The AI footnote deliberately stays at `text-xs text-slate-400`**, so it reads as a footnote rather
than as a fourth body line. That is a distinction the size is carrying.

---

# TASK 4 — THE AI FOOTNOTE

## 4.a The exact landing string, and where it lives

**`lib/plan-features.ts`, in the exported `FOOTNOTES` array, entry `number: '4'`:**

> `'Auto-replies require a Business account on each platform. Replies are AI-generated and can occasionally be wrong — you can view every message and reply yourself at any time.'`

It carries a companion comment on the matrix rows it annotates: *"Both carry footnote 4 (business account
required + AI replies can be wrong)."*

✅ **It is ALREADY in a shared module and already exported** (`export const FOOTNOTES: { number: string; text: string }[]`),
so **no extraction is needed and none was done.**

## 4.b 🔴 THE VERIFICATION KILLED HALF OF IT

**Question:** does an operator surface exist where they can read past auto-replies?

🔴 **NO. NOTHING RENDERS THEM.** There are exactly **three** `whatsapp_logs` reads in the repository,
and neither of the display columns is selected by any of them:

| Read | Columns selected | What it is |
|---|---|---|
| `app/api/manage/route.ts` | `classification, possible_miss` | **counts** for the Reports tab |
| `app/api/webhooks/meta/whatsapp/route.ts` | `created_at` (filtered `response_sent IS NOT NULL`) | the once-per-day **greeting check** |
| the two webhook `insert`s | — | **writes** |

`message_in` and `response_sent` are **written and never selected for display anywhere.** The greeting
check touches `response_sent` only as an `IS NOT NULL` existence filter — **it never reads the text.**

✅ **So the footnote in the preview repeats ONLY the verified clause**, verbatim from the shared string:

```tsx
      <p className="text-xs text-slate-400">Replies are AI-generated and can occasionally be wrong.</p>
```

🔴 **AND THE CONSEQUENCE IS BIGGER THAN THIS BLOCK: THE LANDING PAGE IS MAKING THAT CLAIM TO THE PUBLIC
RIGHT NOW.** *"you can view every message and reply yourself at any time"* is on the live pricing matrix
with no product behind either half — there is no message viewer, and the "reply yourself" half depends
on coexistence, which is unbuilt. **Reported for your decision, not changed: it is landing copy and
outside this scope.**

## 4.c ⚠️ WHY I DID NOT IMPORT THE SHARED STRING — a judgement call, flagged rather than buried

Your instruction said **import it rather than copy it** if it is already shared. It is shared. **But
importing it whole would repeat the unverified half**, which the same task forbids. The two instructions
meet on this string.

**I did not treat that as a contradiction to stop on, because there is a reading that satisfies both:**
take the wording from the landing string without taking the claim. So the verified clause is used
**verbatim** — not reworded, not invented — as a short literal.

**The alternative I rejected:** import `FOOTNOTES`, find `number === '4'`, and render a substring of its
text. 🔴 **Slicing shared copy by substring is a silent-breakage pattern** — the day someone rewords
footnote 4, the slice either yields the wrong sentence or nothing, with no error. **A four-word literal
that a grep will find is safer than a fragile reference to a string that must not be quoted in full.**

⚠️ **The honest cost: this is now a second copy of that clause**, and if the landing wording changes the
two can drift. **If you would rather it were shared, the clean fix is to split footnote 4 into its
verified and unverified halves in `lib/plan-features.ts` and export the verified one — that is a small
change to a shared module and I did not make it without telling you.**

## 4.d ✅ NOT THE DEFERRED CUSTOMER DISCLAIMER

Recorded in the code comment and here, because the two are one word apart and easy to merge by accident.
§20 defers an AI/auto-reply disclaimer **in the message a CUSTOMER receives**, pending Meta's
business-messaging disclosure rules. **This line is shown to the OPERATOR, inside a preview, and nothing
in this task changes a single byte of what a customer receives.** The send path was not touched.

---

# §5 — VERIFICATION

**`tsc` was not run and nothing here is offered as tsc-clean.**

| Check | Method | Result |
|---|---|---|
| Placement: not inside the hide | positional scan with JSX comments blanked | ✅ **inside Card, after `</>)}`, before `</Card>`** |
| Native hide unmodified | the wrapper's open/close lines | ✅ **unchanged** |
| Only one render site | whole-file count of `<WhatsAppReplyPreview` | ✅ **1** |
| `Card` still needed elsewhere | `<Card` occurrences | ✅ **27** — the import is not orphaned |
| Syntax | TypeScript parser, `parseDiagnostics` | ✅ **clean** — a parse check, **not** a typecheck |
| Out-of-scope files untouched | mtimes + `git diff --stat` on the classifier | ✅ **only `page.tsx` changed after the build report** |
| Character census | NUL / control / carrier-aware selectors | ✅ **0 NUL; bare-glyph set identical to HEAD** |

---

# §6 — WHAT REMAINS UNOBSERVED

1. 🔴 **STILL NOTHING HAS BEEN RENDERED.** `next dev` was not run, per scope. **The moved block has
   never been displayed in a browser, and the native app has never been built with it.** The placement
   argument is structural — a node outside a conditional — and structural is the strongest form
   available without running it, **but it is not the same as seeing it on an iPad.**
2. ⚠️ **The new size has not been seen against its neighbours.** `text-sm` on three consecutive lines
   inside a subsection is a heavier block than the `text-xs` it replaced; whether it now overpowers the
   *"Auto-replies"* subsection above it is a visual judgement **nobody has made yet.**
3. ⚠️ **The subsection shape is unverified against a narrow screen.** The chip row wraps with
   `flex-wrap`, but the input-plus-button row at subsection width on a phone has not been looked at.
4. ⚠️ **No typecheck was run**, only a parse.
5. ⚠️ **The footnote's clause is now duplicated** between `lib/plan-features.ts` and this block (4.c).
   Nothing enforces that they stay in step.

## 🔴 TWO THINGS WAITING ON YOU

- **The landing page's unbacked claim** (4.b): *"you can view every message and reply yourself at any
  time"* is public copy with no product behind it.
- **Whether to split footnote 4** so the verified clause can be shared rather than duplicated (4.c).
