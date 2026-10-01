# The composer's editor: bold that sticks, a toolbar that tells the truth, and lists that survive Outlook

**1 October 2026 · `components/admin/RichEmailEditor.tsx`, `lib/outreach-doc.ts` · not deployed**

Only the composer's editor changed. The Templates editor is a `<textarea>` and is untouched — asserted
by the harness, not just claimed.

---

## 0 · 🔴 WHAT IS PROVEN AND WHAT IS REASONED

The brief asked for this plainly, so it is the first section.

| | |
|---|---|
| **PROVEN — the bold greeting is not the document's fault** | 🧪 Ran the real builder: `docFromTemplateText` emits a **plain** greeting, with `bold` on exactly one node — the signature line that stores `bold: true`. `paragraphsFromPlain` ([outreach-doc.ts:208](lib/outreach-doc.ts#L208)) applies no marks at all, and there is no `font-weight` in `P_STYLE`, so it was never a styling illusion either. |
| **PROVEN — the B button's active state was stale, and that is a real bug** | 🔎 `useEditor`'s **`shouldRerenderOnTransaction` defaults to `false`** in TipTap v3 — `node_modules/@tiptap/react/dist/index.d.ts:18-23` says `@default false`, and `index.js:457` returns no subscription when it is false or undefined. The toolbar read `editor.isActive('bold')` **during render**, so those values were whatever they were at the last render React happened to do. 🧪 **Reproduced in Chromium and WebKit**: bold a word, move the caret out of it with an arrow key, and B still reported `aria-pressed="true"` — because a caret move changes the selection, not the document, so nothing re-rendered. |
| **PROVEN — a toolbar button took the selection with it** | 🧪 Found while verifying, in Chromium: selecting a word and clicking **B** did nothing at all. `mousedown` on a `<button>` blurs the contenteditable and collapses the selection, so `chain().focus()` had nothing to act on. WebKit survives it; Chrome does not. ⚠️ **This predates today** — B and Small had the same flaw, so "clicking B does nothing" was already true in Chrome. |
| 🔴 **REASONED, NOT PROVEN — the content-reset loop** | The effect at `RichEmailEditor.tsx:188-192` re-set the document whenever `JSON.stringify(editor.getJSON()) !== JSON.stringify(value)`, which asks *"does the parent's copy match mine?"* when the question is *"did this come from me?"* Those differ on any semantically-identical round trip. **I could not reproduce a text revert with the old code.** A broken variant restoring it, driven in both engines with a parent re-render handing the same document back, left the bold intact every time. So the fix is a **hardening of a real logical gap, not a demonstrated cause.** |

🔴 **My best single explanation of what was reported** — offered as a hypothesis, not a finding: the
operator was watching the **B button**. It showed active before typing (a stale value), and after
pressing B it would light up and then go back to inactive on a later re-render while the text stayed
bold. That reads exactly as *"it changes, then it reverts a moment later"*. I could not stage the precise
sequence, so it stays a hypothesis — but the stale state it rests on is proven and fixed.

---

## 1 · The fixes

**The active states are subscribed, not read at render time.** `useEditorState` with a selector over the
seven booleans the toolbar needs, so a re-render happens when one of them changes and not on every
keystroke. 🔴 **Not `shouldRerenderOnTransaction: true`** — that flag works, and its own doc comment calls
it *"legacy behavior that will be removed in future versions"*, and it re-renders the whole editor on
every transaction to keep six booleans fresh.

**The content effect skips this editor's own echo.** A `lastEmitted` ref records the exact JSON sent up in
`onUpdate`; if the incoming `value` is that string it is our echo, **however the parent held it**. Only a
document that is neither our last emission nor what we already hold replaces the content — which is
"a template change or an explicit reset" and nothing else.

**A replaced document lands the caret at the start with no stored marks.** `setTextSelection(1)` and
`setStoredMarks(null)`. ⚠️ `setTextSelection`, not `focus()` — a template can be chosen while the subject
field has focus, and this must not steal the caret.

**Every toolbar button prevents the default on `mousedown`**, so focus stays in the editor and the
selection survives the click. Nine buttons; `onMouseDown`, not `onClick`, because the damage is done
before a click fires.

---

## 2 · The toolbar

`B · I · Size [Normal|Small|Large] | • List · 1. List · Link | Insert signature · Insert opt-out
| Attach file · Plans PDF`

The last two come from the parent through the existing `toolbarExtra` prop and are unchanged.

**The three sizes, and the px values:**

| | | |
|---|---|---|
| **Normal** | 12pt | **no mark at all** — `P_STYLE` already says 12pt on the line, so an explicit size here would put a redundant span on every line of every email |
| **Small** | 10pt = **13.333333px** | unchanged; the value the captured Outlook mail actually carried |
| **Large** | 14pt = **18.666667px** | one step up, not a heading. A 24pt line in a business email reads as shouting. Expressed in px for the same reason `SMALL_STYLE` is |

⚠️ **Small and Large are mutually exclusive** — two values of one property. Setting one clears the other
in the same chain, and `validateDoc` refuses a node carrying both, so the refusal is a backstop nobody
meets.

**Lists** come from `@tiptap/extension-list` — the maintained v3 form, one package exporting
`BulletList`, `OrderedList`, `ListItem` and `ListKeymap` (the v2-era per-node packages are not what v3
ships). `ListKeymap` carries the behaviour: Enter makes the next item, Enter on an empty item leaves the
list, Tab/Shift-Tab nest and unnest.

**Link** wraps the selection, asks for a URL, and validates against **`LINK_RE` imported from the schema
module** — so the editor refuses exactly what the send would refuse. An empty answer removes the link,
which is the only way to unlink, so it is the same control rather than a second button nobody finds.
⚠️ It uses `window.prompt`. A proper modal is the better control and is also another thing to measure in
two engines at two widths; the brief asked for a URL to be *asked for*, and this asks. **Recorded rather
than dressed up.**

**Keyboard shortcuts** come with the official extensions. 🧪 Verified ⌘B and ⌘I in both engines.

---

## 3 · What is sent

🔴 **`LINK_RE` was widened from https-only to https, http and mailto**, by instruction. Still refused:
`javascript:`, `data:`, `vbscript:`, `file:`, protocol-relative `//host`, and anything containing a quote
or an angle bracket. Anchored at **both** ends — unanchored it would accept
`javascript:alert(1)#https://x`. 🧪 14 cases asserted, 5 allowed and 9 refused.

### One sample email, as sent

Input: a greeting, a bold run, a bullet list with a two-line item, a numbered list, an https link, a
mailto link, a Large line, a Small line, and italic+bold.

**HTML** — inline styles only, no `class` anywhere, no `<style>` block:

```html
<div style="font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);">Hi George,</div>
<div style="…12pt…">Three things we do, <b>all free to start</b></div>
<ul style="margin: 0; padding-left: 24px;">
  <li style="font-family: Aptos…; font-size: 12pt; color: rgb(0, 0, 0); margin: 0 0 4px;">Online ordering</li>
  <li style="…12pt… margin: 0 0 4px;">Pre-orders<br>and queue-skippers</li>
</ul>
<ol style="margin: 0; padding-left: 24px;">
  <li style="…12pt… margin: 0 0 4px;">Upload a menu</li>
  <li style="…12pt… margin: 0 0 4px;">Go live</li>
</ol>
<div style="…12pt…">See <a href="https://villagefoodie.co.uk">villagefoodie.co.uk</a> or <a href="mailto:dominic@hatchgrab.com">email me</a></div>
<div style="font-family: Aptos…; font-size: 18.666667px; color: rgb(0, 0, 0);">Big news</div>
<div style="font-family: Aptos…; font-size: 13.333333px; color: rgb(0, 0, 0);">Small print</div>
<div style="…12pt…"><i>mixed </i><i><b>italic+bold</b></i></div>
```

🔴 **`padding-left`, not `margin-left`** — Outlook puts the bullet glyph inside the padding box, so
margin-only indentation clips the markers at the left edge. 🔴 **`margin: 0` on the list, spacing on the
item** — default list margins differ between Gmail, Apple Mail and Outlook, so the rhythm is set once,
per item. ⚠️ **A two-line item joins with `<br>`, not a block element** — a block inside an `<li>` pushes
the bullet onto its own line in Outlook. ⚠️ `<b>` and `<i>`, not `<strong>`/`<em>`: longer history in
Outlook's Word renderer.

**Plain text:**

```
Hi George,

Three things we do, all free to start
• Online ordering
• Pre-orders
  and queue-skippers
1. Upload a menu
2. Go live
See villagefoodie.co.uk (https://villagefoodie.co.uk) or email me (dominic@hatchgrab.com)
Big news
Small print
mixed italic+bold
```

⚠️ A wrapped item's later lines are indented by the marker's width, so it reads as one item. ⚠️ The
`mailto:` scheme is stripped — the address is the useful part and is what a reader would copy. 🧪 And
there is no `<` or `>` anywhere in the plain part, asserted.

**The stored body and the Sent-folder copy are the same document**: both are produced from the validated
`EmailDoc` by `docToHtml`/`docToText` on the one send path, which this change does not touch.

### What the schema still refuses

A heading, an image, a table, a mark outside the five, Small-and-Large together, and 🔴 **a list nested
inside a list item** — Tab indents in the editor, so that is reachable, and an inline-styled nested list
is one of the least reliable things in Outlook. The refusal names the fix ("unindent that item"). An
**empty** list is dropped rather than refused: TipTap can leave one behind as the caret exits, and it has
nothing to render.

---

## 4 · Dependencies added — stated, as asked

| | |
|---|---|
| `@tiptap/extension-list@3.31.3` | the maintained v3 list package (BulletList, OrderedList, ListItem, ListKeymap; TaskList/TaskItem/ListKit are **not** imported) |
| `@tiptap/extension-italic@3.31.3` | 🔴 **the official one, not a local mark, and the reason is `parseHTML`**: pasted italic arrives as `<i>`, `<em>` *or* `font-style: italic`, and the package handles all three plus the keymap. A local mark would have been ~12 lines and handled one |
| `esbuild@0.28.2` — **devDependency** | ⚠️ **A new test-only dependency, flagged because you asked to be told.** There was no bundler in `node_modules/.bin` at all, and the browser checks need the component bundled. Nothing in the app imports it |

All `@tiptap/*` pins are exactly `3.31.3`. **No StarterKit.** `Small`, `Large` and `Link` stay local —
their px values are ours, mirroring the captured Outlook mail, and no package knows them.

The file's header comment is rewritten to record that **lists and italic are now deliberately IN**
(1 October 2026), the full list of loaded extensions, and that everything not named is still absent.

---

## 5 · Verification

### The editor in a real browser — 22 checks, Chromium and WebKit, all passing

| | |
|---|---|
| after a template loads | greeting **not bold** · **B inactive** · the signature line still bold |
| typing on a fresh caret | text appears, **no bold mark** |
| bold a word | applies immediately · **still bold after 5 seconds** · after typing elsewhere · after blur and refocus · **after a parent re-render** |
| the active states | **B active in bold text, inactive after a selection-only move out of it** · • List active in a list, inactive after leaving |
| lists | Enter makes an item · Tab nests · Shift-Tab unnests · Enter on an empty item leaves the list |
| shortcuts | ⌘B and ⌘I both fire (⌘ in WebKit; the driver reports the modifier it used) |

🔴 **The broken variant reproduces the stale active state in 2/2 engines** — bold a word, move the caret
out, and the old code still reports `aria-pressed="true"`. The reset-loop variant is kept in the file and
**reports honestly that it does not reproduce** (§0).

### The toolbar's layout — nothing clipped, one row at both widths

Measured in the composer's own column width (56% of the viewport — the three-pane share), with the real
Tailwind bundle:

| | 16" MBP (1728px) | 27" monitor (2560px) |
|---|---|---|
| Chromium | column 934px · **8 buttons, 1 row**, bar 40px | column 1400px · **1 row**, 40px |
| WebKit | column 934px · **8 buttons, 1 row**, bar 40px | column 1400px · **1 row**, 40px |

Nothing clipped, and the page never scrolls sideways, in either engine at either width.

> ⚠️ **MY ROW METRIC WAS NOISY AND SAID "2 rows" FOR A 40px BAR.** It counted distinct rounded `top`
> values, and sub-pixel differences between engines split one row into two. It clusters within 4px now.

### The rest

| | |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npx next build` | **compiled successfully** |
| `node scripts/outreach-editor-toolbar.cjs` | **45 passed** (browser part behind `HG_RENDER=1`) |
| `node scripts/outreach-crm-polish.cjs` | **94 passed** (was failing on two stale link checks) |
| `node scripts/outreach-mail-send.cjs` | **all passed** (was crashing on a stale expectation) |
| `node scripts/run-harnesses.cjs` | **78 run · 78 passed · 0 failed** |
| `--dry-run` screen | all 78 pass |
| eslint, the two changed files | **0 problems** |

> ⚠️ **I SPENT LONGER DEBUGGING MY TEST DRIVER THAN THE EDITOR, AND THREE OF ITS BUGS ARE WORTH
> RECORDING, because each one produced a confident false failure:**
> **①** a hand-built `document.createRange()` selection is **not** a ProseMirror selection — the editor
> keeps its own, so everything after it acted on a caret the editor did not believe in. Five assertions
> failed in Chromium while WebKit passed them. **The editor was never at fault.**
> **②** unpaced `keyboard.press` in a loop raced ProseMirror: a three-key selection came back as `"ed"`,
> and four assertions then failed about marks that were never applied because nothing was selected.
> **③** a plain click lands the caret **mid-document**, so "• List" swallowed the signature line, the new
> empty item sat in the middle of the list, and Enter split it instead of leaving it — the button reported
> active and **was right**. I was about to call that a product bug.
> Each was found by instrumenting rather than by adjusting the assertion until it passed.

### Six stale checks in three other harnesses, restated in place

🔴 **The full sweep found all six; none of the harnesses I thought to run did.** Two were drifted anchors
from refactoring `validateDoc`, and four were real expectations that the sanctioned widening inverted.

| Harness · check | Why it went stale | What it says now |
|---|---|---|
| `outreach-crm-polish` · **V5** variant, patching `if (!LINK_RE.test(href)) {` | the paragraph logic moved into `validateParagraph` when lists arrived, so the line is one level shallower — **10 spaces, not 12** | same mutation, re-anchored; the rule it proves is unchanged |
| `outreach-crm-polish` · *"`http://example.com` is REFUSED"* | 🔴 **http is allowed now**, by instruction | http and mailto are asserted **allowed**; the dangerous schemes stay in the refusal list, which gained `vbscript:`, `file:` and `javascript:…#https://ok` |
| `outreach-crm-polish` · *"the refusal names the link"* | the sentence changed with the policy — it said *"is not an https link"* | pins *"is not a web or email link"* |
| `outreach-mail-send` · **V10** / **V14** variants | both anchored lines moved — one into `validateParagraph`, one into the new `inlineHtml` | re-anchored, same mutations |
| `outreach-mail-send` · *"a link mark is REFUSED"* | 🔴 **it did not just go stale, it CRASHED the harness** — `link.error` is undefined on a document that now validates. A stale expectation that throws is at least loud | a scheme outside the allow-list is refused and named; http/https asserted allowed |
| `outreach-mail-send` · *"a list is refused"* and *"even a harmless-looking italic is refused — the mark list is two long"* | lists and italic are both in the schema now | a **table** stands for the refused node, a **highlight** for the refused mark ("five long, on purpose"), and an empty list is asserted **dropped** rather than refused |

### Kept unchanged

One send path · one contact writer (`logOutreachContact`) · one follow-up writer (`applyFollowUp`) · one
`nextStep` per page · every sequence guard · `EMAIL_FRAME_SANDBOX = 'allow-same-origin'` with
`allow-scripts` still in `FORBIDDEN_SANDBOX_TOKENS` · no `outreach_templates` row created, edited, seeded
or deactivated · the Templates `<textarea>` untouched. **All pinned by the harness.**

**No email was sent, no SQL was run, and nothing is deployed.**

---

## 6 · 🔴 The UI steps I could not run — do these by hand

I have no authenticated admin session here, so none of the live checks below were performed. Everything
above is fixtures and a bundled browser run of the real component.

**ZZ Test Prospect (Dominic), `a5beca7f-3edb-4fa1-abc1-6b00e75d1e46`, "Send test to me" only.**

1. **Every active template, read only — do not press Save on any template.** Open the composer and step
   through each template in the picker. At each one: **the greeting is not bold**, and **B is not
   highlighted** before you touch anything. *(This is the one I most want confirmed on real template
   data — my proof covers the builder and a representative template, not all of them.)*
2. **Bold sticks.** Select a word, press **B**. Wait five seconds. Type somewhere else. Switch browser
   tabs and come back. **The word is still bold and nothing has reverted.**
3. **B follows the caret.** With the caret inside that bold word, B is highlighted; press → a few times
   to leave the word and **B goes unhighlighted without the text changing**.
4. **In Chrome as well as Safari:** select a word and click **B**. It should bold. *(This is the
   mousedown fix; before it, that click did nothing in Chrome.)*
5. **Build the sample.** A bulleted list (Enter between items, Tab to indent one, Shift-Tab back,
   Enter twice to leave), a numbered list, a **Link** on a couple of words (try `https://`, and try
   `javascript:alert(1)` — the second must be refused with a sentence), one **Small** run and one
   **Large** run.
6. **Send it with "Send test to me"**, then open the test email: the lists have their markers and
   indents, the link is clickable, Small and Large are visibly 10pt and 14pt, and the plain-text part
   (view source, or a text-only client) shows `• `, `1. ` and `text (url)`.
7. **The Size menu's label** reads Normal / Small / Large to match wherever the caret is.
8. ⚠️ **If a nested list refuses the send**, that is deliberate — unindent the item. §3 says why.

**Not deployed. It is ready.**
