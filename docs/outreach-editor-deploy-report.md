# Tab cannot build what the send refuses — and the step-logging fix ships with it

**1 October 2026 · follows [the toolbar build](outreach-editor-toolbar-report.md), which is unchanged**

One approved change, one thing to check, and a push. No span of the brief arrived garbled and no
instruction contradicted another.

---

## 1 · Tab no longer nests

🔴 **The complaint was exact and it was a design fault, not a bug.** `validateDoc` refuses a list nested
inside a list item — an inline-styled nested list is one of the least reliable things in Outlook — while
`ListKeymap` bound Tab/Shift-Tab to `sinkListItem`/`liftListItem`. So **the editor could build the one
shape the send would reject**, and the operator found out after writing the email.

A local extension swallows both keys inside a list item:

```ts
const NoListIndent = Extension.create({
  name: 'noListIndent',
  priority: 1000,
  addKeyboardShortcuts() {
    const swallowInsideList = () => this.editor.isActive('listItem')
    return { Tab: swallowInsideList, 'Shift-Tab': swallowInsideList }
  },
})
```

⚠️ **It returns `true`, meaning "handled", and that is the whole point.** Returning `false` would let
`ListKeymap` nest; letting the event reach the browser would **move focus out of the editor to the next
control**, losing the caret mid-sentence — worse than nesting. Handled-and-do-nothing is the only
behaviour that is neither.

⚠️ **Outside a list it returns `false` on purpose**, so Tab keeps moving focus out of the editor the way a
keyboard user expects.

🔴 **`priority: 1000`, above `ListKeymap`'s default of 100.** TipTap composes keymaps in priority order; at
equal priority the two would race on array position, which is not a contract.

🔴 **The send-time refusal is kept as a backstop.** A document arrives over HTTP, and the editor is not
the guard — something other than this editor could still post a nested list.

### How it is asserted

**Not** as "no `<ul>` inside an `<li>`" — that would pass if Tab did something else destructive. The
document is compared **byte for byte before and after**, and focus is checked to still be in the editor:

```
✓ Tab inside a list item leaves the document UNCHANGED
✓ …and no list is nested inside an item
✓ …and focus stays in the editor
✓ Shift-Tab leaves the document UNCHANGED too
✓ …and focus still stays in the editor
```

🔴 **Broken variant V1 removes `NoListIndent` and Tab nests again — reproduced in both engines**, so the
no-op is tested against a failure it can actually catch.

---

## 2 · What was live before this push: the step-logging fix was NOT deployed

> **Resolved by this push.** Everything below describes the state *before* `91ca45d`, which is what item 2
> of the brief asked me to establish. §4 confirms the fix is now on production.

| | |
|---|---|
| local branch | `main`, at `06b3c0e` |
| `origin/main` | `06b3c0e` — **identical**, `git rev-list --left-right --count` is `0 0` |
| the step-logging fix | 🔴 **entirely uncommitted.** `git log --all -S 'error: cErr'` on the send route returns **nothing**, and all six of its files are in the working tree |

So the fix for the Chase-1-logged-as-a-second-first-contact bug — the phantom `email_message_id` column
whose discarded error emptied the ladder — **has never been on main and has never deployed**. It goes out
in this same push, as instructed.

⚠️ **Which meant the bug was live in production until this push landed.** Every non-test send was
deriving its step from an empty contact list. That was the most urgent thing in this push, and it is a
larger change than item 1. It is now deployed — see §4.

Also riding along, all previously uncommitted: the editor toolbar build, the `/compare` follow-up's
harness registration, and the two reports.

---

## 3 · Verification — all green, on an idle machine

| | |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npx next build` | **compiled successfully** |
| `node scripts/outreach-editor-toolbar.cjs` | **47 passed** (gate closed) |
| `HG_RENDER=1 node scripts/outreach-editor-toolbar.cjs` | **103 passed, 56 of them in a real browser** |
| `node scripts/outreach-step-logging.cjs` | **27 passed** |
| `node scripts/run-harnesses.cjs` | **78 run · 78 passed · 0 failed**, on an idle machine |
| eslint, the changed files | **0 problems** |

### 🔴 The HG_RENDER=1 gate did not actually run anything, and now it does

The previous build put the browser checks behind the gate by **printing a pointer to the report**. That is
not a check — it is documentation wearing a conditional, and `HG_RENDER=1` and no flag produced the same
work. The driver is now `scripts/outreach-editor-render.cjs`, in the repo and in the
`needs_a_browser` excluded group beside `outreach-templates-render.cjs`, and the harness **requires and
runs it**:

- **24 behavioural checks per engine** (Chromium and WebKit): template loads with a plain greeting and B
  inactive · typing is plain · bold applies and survives 5 seconds, typing elsewhere, blur/refocus and a
  parent re-render · lists · **Tab and Shift-Tab leave the document unchanged** · B follows the caret on a
  selection-only move · ⌘B and ⌘I.
- **4 layout measurements**: the toolbar is **8 buttons on 1 row, bar 40px**, nothing clipped, no sideways
  page scroll — at 1728px (16" MBP) and 2560px (27"), in both engines.
- **4 variant reproductions**: V1 (Tab nests without `NoListIndent`) and V2 (the B button goes stale
  without the `useEditorState` subscription), each in both engines.

⚠️ **And the summary line was under-reporting.** It printed "all 47 passed" while silently excluding every
browser assertion it had just run. It now reads **"all 103 passed (56 of them in a real browser)"** — a
number that under-reports what was checked is its own small lie.

---

## 4 · Deploy, and what I could and could not verify

Committed `91ca45d` and pushed `06b3c0e..91ca45d`. Local `main` and `origin/main` are the same commit and
the tree is clean.

### ✅ The deploy has landed — proved by bytes, not by a page

The admin UI is behind authentication, so I verified the deploy through the public static bundle instead.
Production serves the chunks my local build of `91ca45d` produced, **byte for byte**:

| chunk | local md5 | production md5 | contains |
| --- | --- | --- | --- |
| `d8af0325aa8b535a.js` | `aecda720467f075dc206c50fee6a7df3` | `aecda720467f075dc206c50fee6a7df3` | `noListIndent`, `Shift-Tab` |
| `2b4e63991d1528e8.js` | `10e1580506a4865b5d82bbb0b529dc6c` | `10e1580506a4865b5d82bbb0b529dc6c` | the offset-label builder |
| `e7013dc0b2ccab34.js` | `a5a50d63e1da187efd21c2c7da3381de` | `a5a50d63e1da187efd21c2c7da3381de` | the offset-label builder |

⚠️ **The control matters.** The two label chunks are coincidentally the same size (57,837 B), which on its
own looks exactly like a server handing back one fallback body for any chunk path. They have *different*
md5s, each matching its own local file, and a hash that cannot exist
(`/_next/static/chunks/0000000000000000.js`) returns **404**, not a body. So the match is real content, not
a catch-all.

In the served bundle: the builder is minified to `` `${o} days after ${s[a].toLowerCase()}` ``, the string
`day 0` is present, and so are all four `STEP_LABELS` — `First contact`, `Chase 1`, `Chase 2`,
**`Final chase`** (the fourth rung is *Final chase*, not "Chase 3"; its heading is the brief's
`14 days after chase 2`).

**What this proves and what it does not.** It proves the new code — both the Tab no-op and the step-logging
commit — is the code production is now running. It does **not** prove the headers *render*: the words and
the function that assembles them are shipped, but I never saw the assembled output.

### 🔴 What still needs your eyes

`https://www.hatchgrab.com/admin` answers HTTP 200 and returns a 15,810-byte client-rendered shell with no
sequence markup in it, and I have no admin session here. **The Sequence headers and the composer toolbar
need checking by hand.** What to look for:

1. **Templates → Sequence**, the four column headings: **`day 0`** · **`3 days after first contact`** ·
   **`7 days after chase 1`** · **`14 days after chase 2`**.
2. **A prospect's composer**: the toolbar reads **B · I · Size ▾ · • List · 1. List · Link · Insert
   signature · Insert opt-out · Attach file · Plans PDF**, on one row.
3. **Inside a bulleted list, press Tab** — nothing happens, and the caret stays in the box.
4. **Select a word and press B in Chrome** — it bolds. (Before this work, that click did nothing in
   Chrome.)
---

## 5 · Kept unchanged

One send path · one contact writer (`logOutreachContact`) · one follow-up writer (`applyFollowUp`) · one
`nextStep` per page · every sequence guard · `EMAIL_FRAME_SANDBOX = 'allow-same-origin'` with
`allow-scripts` still in `FORBIDDEN_SANDBOX_TOKENS` · no `outreach_templates` row created, edited, seeded
or deactivated · `do_not_contact` never set automatically · the Templates `<textarea>` untouched.
**All pinned by the harness.**

**No email was sent and no SQL was run.**
