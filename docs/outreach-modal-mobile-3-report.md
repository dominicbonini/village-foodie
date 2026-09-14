# The outreach prospect modal on a phone — round three: only STAGE stays locked

**14 September 2026.** One file changed: `components/admin/OutreachPanel.tsx`. Route **R1** (render the
group twice) was taken; **R2 (sticky) was evaluated and rejected**, with the compiler used to settle the
part of it that was actually a cascade question. Nothing staged.

⚠️ **I CANNOT SEE A SCREEN.** Every layout figure below is derived from the class chain or from a real
Tailwind compile. Nothing was observed rendering.

🔴 **THE DESKTOP CLAIM IS WEAKER THAN IN ROUNDS ONE AND TWO, AND HERE IS EXACTLY HOW.** Those rounds could
say *every token that differs from HEAD is `max-sm:`-prefixed*. That is no longer true: the desktop DOM
now carries **one always-hidden subtree** and the meta strip's children sit inside a `display:contents`
wrapper. **What I can still prove** is in §V1; what I cannot is stated there too.

---

## 🔴 PREMISES

1. **My round-two claim that "no CSS-only route exists" was right, but one of its supporting reasons was
   not.** I wrote that moving the scroller to the panel was blocked. 🧪 Compiled: `.overflow-hidden` is
   emitted at line 172 and `.max-sm\:overflow-y-auto` at 200, so **the scroller move would have worked** —
   the longhand lands after the shorthand and wins for the y axis. R2 fails for two *other* reasons (§R2),
   and the honest version of the round-two sentence is "no CSS-only route exists that preserves the
   desktop shape", not "sticky cannot be made to work".
2. **The brief's R2 sketch has a defect it does not mention**: it asks for the header **and** the Stage
   strip to be `sticky top-0`. Two stacked sticky elements need the second's `top` to equal the first's
   rendered height — and below `sm` the header **wraps to a variable number of rows** (title on its own
   line, thumbnails, nav). There is no static value for that `top`. §R2.
3. Everything else in the brief checked out.

### The two git commands, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   components/admin/ComposeWindow.tsx
	modified:   components/admin/OutreachPanel.tsx
	modified:   components/admin/TemplatesPanel.tsx
	modified:   docs/onboarding-flow.md
	modified:   docs/reference-manual.md
	modified:   lib/outreach-template-render.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-modal-mobile-2-report.md
	docs/outreach-modal-mobile-report.md
	docs/outreach-token-guard-report.md
	docs/outreach-tokens-report.md

no changes added to commit (use "git add" and/or "git commit -a")
════
3a95e9f demo
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
9e83a5e migration changes
```

### 🔴 WHAT YOU ARE ABOUT TO COMMIT TOGETHER — four workstreams in one tree

Attributed by reading each file's own diff, not by memory:

| workstream | files | evidence |
|---|---|---|
| **Token guard** (Phase 1) | `lib/outreach-template-render.ts`, `components/admin/ComposeWindow.tsx`, `components/admin/TemplatesPanel.tsx` | `malformed` appears 9 / 14 / 7 times in their diffs |
| **Modal mobile, rounds 1–3** | `components/admin/OutreachPanel.tsx` | `max-sm:` appears 21 times in its diff; `malformed` **0** times — the two workstreams do not overlap in any file |
| **V13.1 manual** | `docs/reference-manual.md`, `docs/onboarding-flow.md` | `V13.1` appears 18 times in the manual diff |
| **Reports** | the four untracked `docs/*.md` | new files |

**No file carries two workstreams.** That is the useful property: each can be committed on its own.

### Admin-only — re-confirmed

`OutreachPanel` is imported by `app/admin/page.tsx` alone (`app/admin/outreach/page.tsx` is a server
`redirect`). The new `ProspectMetaFacts` is a **module-local** function in that file, which exports only
its default. `DemoLinkChip` and `DoNotContactToggle` are likewise local. Nothing shared with an operator
or customer surface was opened.

---

# THE TWO ROUTES

## R2 — sticky. Evaluated, and rejected on two grounds, neither of them the cascade

**The chain, READ:** `panel` is `overflow-hidden` and is a `flex flex-col`; `header` and `meta` are
`flex-shrink-0` siblings; the **body** is the scroller (`max-sm:overflow-y-auto`, round one).
`position: sticky` needs a scrolling **ancestor**, not a scrolling sibling — so as the tree stands today,
nothing in the header or meta strip can stick to anything.

**The mechanical part works.** 🧪 Compiled: `.overflow-hidden` (172) → `.max-sm\:overflow-y-auto` (200),
so moving the scroller to the panel below `sm` is available, and `.max-sm\:sticky`, `.max-sm\:top-0` and
`.max-sm\:bg-white` all generate. Premise 1 corrects my round-two claim here.

**It still fails, for two reasons:**

1. 🔴 **It changes the desktop shape, which the brief forbids.** For the Stage strip to stay while the
   rest scrolls, they must be **separate, non-nested siblings** of the scrolling panel. On desktop
   (panel not scrolling, nothing sticky) that renders as **two stacked strips**, where today there is
   *"one meta strip, one row"*. Nesting them back into one wrapper defeats it: a sticky element is
   confined to its own containing block, so Stage would stick only while its short wrapper was on
   screen — which is to say, not at all.
2. 🔴 **Two stacked sticky elements need a known offset** (premise 2). The header wraps to a variable
   height on a phone, so `top: <header height>` has no static value. A single sticky wrapper around
   header + Stage would solve that — but it is another added `div`, i.e. the same weakening R1 carries,
   *plus* the desktop-shape problem above.

Also incidental but real: moving the scroller to the panel means the body must **stop** being one below
`sm`, or there are nested scrollers; and it would re-open the round-one `max-sm:flex` override for
re-verification. More moving parts for a worse outcome.

## R1 — chosen. Render the group twice, one definition

**The objection the brief asked me to test, tested rather than assumed:**

| hazard | finding |
|---|---|
| duplicate `id` / broken `htmlFor` | 🧪 **There is no `id=` or `htmlFor=` anywhere in `OutreachPanel.tsx`** — searched alone, grep exit 1. *Positive control over the same search:* `components/DemoGetStarted.tsx` and `app/setup/page.tsx` do use `htmlFor`, so the search finds it when present. Every label here uses **implicit** association (the input is a child of the label), which cannot collide. |
| the bound checkbox disagreeing between copies | READ, `DoNotContactToggle`: **no `useState`, no `useEffect`, no ref.** `on = p.do_not_contact === true` — a pure function of props. Both copies read the same prop, so they agree **by construction**, and both call the same `onPatch`. |
| `DemoLinkChip`'s state doubling | READ: it holds only `copied`, set by its own `onClick`. Two instances hold two independent flags; the hidden one is never set, because a `display:none` element **cannot be clicked or focused**. Its copy action is `navigator.clipboard.writeText` — a global API with no instance identity. |
| double handler fire | Nothing in the group registers a document/window listener or an effect. The only handlers are element-level `onClick`/`onChange`, and a `display:none` element receives neither. |
| drift between the copies | 🔴 **Avoided by extraction, not by discipline.** The group is now ONE component, `ProspectMetaFacts`, rendered at two call sites. `components/DemoModeBanner.tsx` records the alternative: *"three separate copies that had ALREADY drifted — same strip, three different sentences."* |

### How it is wired

```
meta strip (flex-shrink-0 — LOCKED)
  ├ Stage label + select                    ← stays, locked
  └ <div className="contents max-sm:hidden">← desktop copy
        <ProspectMetaFacts … />

body (flex-1 min-h-0; grid at sm+, flex-col + overflow-y-auto below)
  ├ <div className="sm:hidden …">           ← phone copy, FIRST child → scrolls away
  │     <ProspectMetaFacts … />
  └ <Detail … />                            ← the two real columns
```

Two mechanisms carry it, and both were compiled rather than assumed:

- 🔴 **`display: contents` on the desktop wrapper.** It generates **no box**, so its children participate
  in the meta strip's flex row exactly as they did when written there directly — the desktop row is
  *unchanged*, not merely similar. 🧪 `.contents` is emitted at **165** and `.max-sm\:hidden` at **192**,
  so below 40rem the `hidden` wins and the whole group disappears.
- 🔴 **`display: none` is not a grid item.** The phone copy is the body's first child, and on desktop the
  body is a two-column grid. An element with `display:none` **generates no box and is therefore not a
  grid item**, so the 45fr/55fr track assignment of the two real columns is untouched. Below `sm` the
  body is a flex column (the round-one `max-sm:flex` override), so it is simply the first stacked block.

**DOM order is the reading order** — prospect facts, then contact details, then the log form. **No
`order-*` anywhere**, as required.

**Nothing any control DOES was changed.** Same component, same props, same handlers: Copy still copies,
Do-not-contact still writes `do_not_contact` through the same `onPatch`, the thumbnails and their `✕`
were not touched at all. `Create demo` now has **one** definition instead of one inline copy.

---

# VERIFICATION

**Instruments.** A **real Tailwind compile** through the repo's own `@tailwindcss/postcss` for every
cascade claim. *Null result:* a compile that silently fails and reports everything absent — which
happened twice in round one. **Excluded** by compiling a negative control class alongside that must be
**absent**; if everything is absent, so is the signal. 🧪 This round: **27 tokens, all generated, control
absent.**

## 1 · Desktop — what I can prove, and what I cannot

**Still proved:**
- 🧪 **The desktop CSS cascade is untouched by the new classes.** `max-sm:*` compiles to
  `@media (width < 40rem)` and cannot match at ≥ 640px. The one non-`max-sm` addition, `sm:hidden`,
  compiles to `@media (width >= 40rem){display:none}` — it *only* hides, and it is on a node that did not
  exist before.
- 🧪 **The desktop meta row is structurally unchanged**, because `display: contents` makes the new wrapper
  generate no box. Its children are the same elements, in the same order, in the same flex row.
- 🧪 **The desktop body grid is unchanged**, because the added phone copy is `display:none` at ≥ 640px and
  a `display:none` element is not a grid item.
- 🧪 The round-one override still wins: `.flex` (168) / `.grid` (171) → `.max-sm\:flex` (187).
- tsc clean; **lint rule-for-rule identical to HEAD**.

🔴 **NO LONGER PROVED, AND I WILL NOT CLAIM IT:**
- The desktop **DOM is not byte-identical**. It now contains (a) a `display:contents` wrapper around the
  four meta items and (b) an entire **always-hidden** `ProspectMetaFacts` subtree inside the body —
  including a second `DemoLinkChip` and a second `DoNotContactToggle`, both mounted and both invisible.
- The **rendered output** should be identical, and every mechanism above says why — but "should be, by
  construction" is weaker than "is, because nothing changed", which is what rounds one and two could say.
  **Checklist R5/R6 is where that gets confirmed by eye.**
- ⚠️ `display: contents` has a history of removing elements from the accessibility tree in older
  browsers. The wrapper here is a **semantically empty `div`** and its children carry all the semantics,
  so modern Safari/Chrome/Firefox handle it correctly — but it is a dependency this modal did not have
  before, and it is on the desktop path.

## 2 · The duplicate-state objection — answered above, in full

No ids anywhere (with a positive control), no state in the toggle, per-instance state in the chip that
the hidden copy can never change, no effects or listeners. **R1 is safe; R2 was not needed to avoid it.**

## 3 · R2's sticky chain — reported, not built

Settled in §R2: the cascade works, the desktop shape and the variable-height offset do not.

## 4 · The locked fraction, re-derived at 390 × 844

| | px |
|---|---|
| **HEADER** `py-2` 16 · h3 28 · gap 4 · thumbs 44 · gap 4 · nav 34 | **130** |
| **META** `py-1.5` 12 · Stage label+select 38 | **50** |
| **LOCKED** | **180 of 844 = 21.3%** |

The meta strip was **122px** (Stage 38 + Last contacted 16 + demo 24 + DNC 20 + three 4px gaps + 12px
padding) and is now **50px** — from roughly four wrapped rows to one.

**Round 1: 284px (33.6%) → round 2: 252px (29.9%) → now: 180px (21.3%).** This round removes **72px**.

⚠️ Derived from the class chain and Tailwind's line-heights; the header's wrap points depend on text
widths I cannot measure, so ±20px is the honest band on the header figure. The meta figure is firm — it
is one row with one control.

## 5 · Every control still present and reachable

`Stage` stays in the locked strip. `Upcoming`, `Last contacted`, `DemoLinkChip` / `Create demo`, and
`DoNotContactToggle` are all inside `ProspectMetaFacts` — **one definition, three references in the file**
(the definition plus the two call sites), so both copies are the same markup by construction. `Create
demo` now appears **once** in the file rather than inline.

## 6 · Input font sizes still ≥ 16px

**13 controls in the modal covered — 11 text controls at 16px, 2 checkboxes (no text, cannot trigger
zoom). Uncovered: NONE.**

🔴 **How this run avoided v1's defect.** The first version of this audit joined a tag's wrapped attributes
by scanning for `>` and **stopped at the `>` inside `onChange={e => …}`**, so a control whose `className`
sat on the next line read as "no text class". This version strips `=>` before looking for the tag end (and
strips comments first, which v1 also got wrong). Demonstrated inline each run: on
`<select value={x} onChange={e => go(e)}`, v1 sees a `>` and stops; v2 sees none and keeps joining.
`ProspectMetaFacts` was added to the audit's component set so its subtree is covered.

## 7 · tsc and lint

`tsc --noEmit -p .` exit **0**. ESLint on the changed file: **rule-for-rule identical to HEAD** — the
extraction added no new finding.

---

# Open items — unchanged, still not built

1. **Sub-44px touch targets** — Call, WhatsApp, Copy, prev/next/Close, the checkboxes, the `✕` badges.
2. **The thumbnails stay 44px.** Round two's reasoning stands: the `✕` badge is a fixed 16px, so a
   smaller thumb makes accidental media deletion likelier.
3. **C15** — two capture-phase `keydown` listeners on `window` between `ScheduleEventsPopup` and
   `ConfirmDeleteDialog`.
4. **`FilterSelect`** above the table is still `text-xs` → iOS zooms on focus there.
5. **Landscape safe areas** — no `env(safe-area-inset-*)` handling in this modal.

---

# CHECKLIST

### Safari RDM (⌥⌘R) — iPhone 390 × 844 and 430 × 932
- **R1.** Open a prospect. The grey strip under the title now shows **STAGE only**.
- **R2.** 🔴 Scroll the body. **UPCOMING, LAST CONTACTED, the `/demo/…` link + Copy + "expires", and Do
  not contact** are at the top of the scrolling area and **scroll away**. STAGE stays put.
- **R3.** Change STAGE while scrolled down — it is still reachable without scrolling back up.
- **R4.** Tap **Copy** on the demo link, then paste. It must still copy the right URL. Tick **Do not
  contact** and confirm it saves (reopen the row).
- **R5.** 🔴 Drag the width past **640px**. The strip must snap back to **one row**: Stage · Upcoming ·
  Last contacted · demo link + Copy + expires · Do not contact — and the duplicate at the top of the
  body must vanish.
- **R6.** 🔴 Desktop 1280 × 800, side by side with a screenshot from before if you have one: the meta row
  and the 45/55 body must look exactly as they did. **This is the check that covers what I could no
  longer prove structurally.**
- **R7.** Round-two checks still hold: LOG A CONTACT is two-per-row with no overlap, the title is on its
  own line, history scrolls sideways to reach Channel.

### Only the real phone can answer
- **P1.** Tap into any text field — the page must not zoom.
- **P2.** With the keyboard up, can you still reach **Log contact** at the bottom?
- **P3.** Does the taller scrolling area feel right — is one screen of chrome now roughly a fifth rather
  than a third?
- **P4.** Tap **Copy** on the real device; the clipboard API can behave differently there than in RDM.
