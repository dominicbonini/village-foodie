# The Templates view, tightened to the approved mockup

**30 September 2026 · commits `307b1bd` and `c0ea398` · deployed and serving on production at 22:39:30Z**

Seven items from the brief, plus one raised mid-build: the preview was printing `{{signature}}`
and `{{opt_out}}` as those literal characters. Two of the eight were bugs with a wrong answer on
screen — item 4 (the page scrolled) and item 5 (the list and the editor disagreed) — and both are
diagnosed below before the fix is described. Nothing in the sequence, the guards, the send path or
`EMAIL_FRAME_SANDBOX` changed. No row was created, edited, seeded or deactivated; no SQL was run;
no email was sent.

---

## 1 · The gap under the admin header

**What it was.** `app/admin/page.tsx` wrapped every tab's body in `py-6`. For most tabs that is
right — they open with a heading or a card, and the air is what separates them from the chrome. The
Templates tab opens with the **Sequence | Templates** switcher, so 24px of padding landed under the
tab strip's own 24px, and the switcher floated in the middle of nothing.

**What it is now.** `pt-3 pb-6`, **on the templates branch only** — one branch's padding, not a
change to the shell. The switcher now sits **12px** under the tab strip, measured in both engines
at both sizes.

---

## 2 · One tab row, not two

"Templates" appeared **twice, two rows apart**: once in the view switcher and once in the second
row's `Templates | Snippets (2) | Signature`. The second row is gone. **Snippets** keeps its count
and **Signature** keeps its place — both as links at the foot of the left pane, where the other
libraries already were.

---

## 3 · Plain labels

| Gone | Kept |
|---|---|
| **1 Name it** and its paragraph ("This name is for you…") | **Template name**, with the slug small and grey beside it |
| **3 Write it** and its paragraph | **Subject**, **Message** |
| *(there was no 2 — it had been removed in v1, and the numbering had not noticed)* | |

One sentence of that prose was **not** tutorial and survives as a small grey line under the
**Message** label:

> `{{double braces}}` fill themselves in; `[[square brackets]]` are values you set once in Snippets,
> or are asked for per truck.

It is the only place the two bracket shapes are told apart. Without it, `[[truck name]]` gets typed
and never fills, and nothing on screen says why.

---

## 4 · The page scrolls in production Safari — diagnosis first

### Why the measurement said "the page does not scroll" and the real admin shell disagreed

The v1 build sized the three panes with **`height: calc(100vh - 12rem)`**. `12rem` is 192px, and it
was a **guess at the height of everything above the panes**. The v1 fixture was a bare page — the
panes, and nothing above them — so 192px was more than enough and the fixture measured a document
exactly as tall as the window. Both things were true at once:

- the fixture did not scroll, and
- the real page did, because the real page has an `AppHeader` (sticky, 51px), a tab strip (sticky,
  `top-[51px]`, 41px), the shell's own padding, and the switcher row. **That is 146px above the
  panes**, plus `pb-6` (24px) **below** them — 170px of chrome against a 192px allowance, so the
  panes were 22px too tall and the document overflowed the window by that much.

A fixture that leaves out the thing being subtracted cannot check a subtraction. That is the real
defect here: not the arithmetic, the fixture.

### The fix: measure, do not guess

`components/admin/TemplatesPanel.tsx` now measures the panes' **own top edge** and the padding
**below** them:

```tsx
const top = Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY))
const pad = Math.round(parseFloat(
  window.getComputedStyle(el.parentElement ?? el).paddingBottom || '0') || 0)
setPanesHeight(`calc(100vh - ${top + pad + BOTTOM_GUTTER_PX}px)`)
```

- Re-measured on `resize` **and** through a `ResizeObserver` on the parent, so anything that
  changes height above the panes (the unsaved-changes bar, the migration notice, a wrapped
  switcher) moves them rather than pushing the page taller.
- Scheduled through `requestAnimationFrame`, so a burst of resize events costs one measurement.
- `BOTTOM_GUTTER_PX = 4` is the only constant left, and it is *air*, not an estimate of anything.
- The **centre pane is a column** (`h-full flex flex-col`) with the Save row pinned by `mt-auto`,
  so Save is on screen whatever the message length. The **preview body** is the flex child that
  takes the remaining height and scrolls inside itself.

### The fixture now contains the admin shell

`scripts/outreach-templates-render.cjs` gained `shellFixture()`: a sticky 51px header, a sticky
41px tab strip, the shell's `max-w-[1800px] mx-auto px-4 pt-3 pb-6` wrapper, the switcher, and the
three panes — then it runs **the component's own rule** against that structure, with the pane
widths and `BOTTOM_GUTTER_PX` *lifted out of the source* so the fixture cannot drift from it.

> ⚠️ Two mistakes inside the fixture are written into the script, because both made it report the
> opposite of the truth. The measuring script first used `var top`, which at global scope **is
> `window.top` and is read-only** — the assignment failed silently, the height became
> `calc(100vh - [object Window]16px)`, the browser dropped the declaration, and the fixture
> reported the very failure it exists to catch. And the centre pane's filler was 900px, which does
> not overflow a 1400px window, so "each pane scrolls on its own" passed without anything scrolling.
> Renamed to `paneTop`; filler raised to 2400px.

### The acceptance, on the real structure, in two engines

| | Chromium | WebKit |
|---|---|---|
| 1440×800 — document vs window | **800 = 800** | **800 = 800** |
| 1440×800 — Save button | on screen, 715–755 | on screen, 715–755 |
| 1440×800 — preview footer | ends 759 | ends 759 |
| 2560×1400 — document vs window | **1400 = 1400** | **1400 = 1400** |
| 2560×1400 — Save button | on screen, 1315–1355 | on screen, 1315–1355 |
| 2560×1400 — preview footer | ends 1359 | ends 1359 |
| panes' measured top / height | 146 / 626 and 146 / 1226 | identical |
| switcher below the tab strip | 12px | 12px |
| each pane scrolls on its own | left list, centre, preview body | same |

**The prospect page still scrolls.** `scripts/outreach-workspace-render.cjs`, same two engines:
body `visible`, html `visible`, the document is taller than the window, and it scrolls to the last
row of History (`scrollY 1324`). The Templates change is scoped to the templates branch of the
admin page and to `TemplatesPanel`; nothing it touches is on the prospect route.

---

## 5 · "Used in" — the chips, and the bug behind them

### The bug: which one was wrong

The list said **"Used in 1 box"** for *Hatches Up - map only*. The editor, for the same template,
said **"Not in the sequence — pick it by hand in the composer."**

```
list:    <ListRow usedIn={usedIn(r.id ?? '')} …/>          ← the row's own id
editor:  const usedIn = usedIn(draft.id ?? '')             ← draft has no id
```

`draft` is seeded by the effect on `[selected]` with the **editable fields only** — label, slug,
channel, subject, body, tags. **`id` is not one of them and never was.** So the editor was asking
`usedIn('')` — "which boxes hold the template whose id is the empty string" — which is `[]` for
every template that has ever existed.

**The list was right. The editor was wrong, and not only for that template: for every template on
the tab, always.** It was noticed on *Hatches Up - map only* because that is a template that is in
a box; on the ones that are not, the wrong answer and the right answer are the same sentence.

### The fix, and the check that keeps them honest

```tsx
const selectedId = selected?.id ?? null
const usedInChips = selectedId ? usedIn(selectedId) : []
```

One function, one id, both readers. The three prose lines are gone — *"Not in the sequence — pick
it by hand"*, *"The sequence sends this to **n** trucks due now"*, and *"Older tags on this row, no
longer used to choose…"* — replaced by a single row of chips, rendered **only** when the template
is in a box (`{usedInChips.length > 0 && …}`). Each chip opens the Sequence view with that box
outlined.

The harness now asserts, in one check, that the list calls `usedIn(r.id ?? '')`, that the editor
calls `usedIn(selectedId)`, and that **`usedIn(draft.id` appears nowhere in the file**. Variant
**V9** puts the old call back and the check catches it.

> Also removed with the prose: the `match` derivation that produced the "sends this to n trucks"
> count. It walked all 231 prospects with a `chooseTemplate` call each, **per render of the
> editor**, to compute a number nothing rendered any more.

---

## 6 · The preview fills the pane

The right pane is a column: **search / picker / simulate** pinned at the top, the body as the flex
child (`flex-1 min-h-0`, scrolling inside, `max-height: 340px` removed), and the
**Unresolved / Dropped / Signature** line at the bottom. Measured above: the footer is on screen at
both sizes in both engines, with the body scrolling inside the pane rather than the page.

---

## 7 · The two buttons are dark

**+ New template** and **Save template** are `bg-slate-900 … hover:bg-slate-800 …
focus:ring-slate-400`. `bg-orange-600` appears **nowhere** in the tab — orange is Send and the Next
banner, and a colour that means "this sends an email" should not also mean "this saves a draft".

---

## 8 · The preview showed `{{signature}}` and `{{opt_out}}` — raised mid-build

### Diagnosis

`renderWithFills` returns **both tokens verbatim, on purpose**. They are filled from
`outreach_settings`, not from the prospect, so they are **deferred, not unresolved** —
`lib/outreach-template-render.ts` says so in the two `case` labels, and `unresolvedIn` deliberately
never lists them, precisely so they are not reported as "still to fill".

The compose window then makes **one more call**, `docFromTemplateText`, and that is where the two
tokens become the signature lines and the opt-out sentence in the box the operator edits.

The preview stopped at the first call. So it showed a message nobody ever sends, and hid the two
lines most worth reading before sending: the sign-off and the PECR opt-out sentence.

### The fix

```tsx
const full = tpl.channel === 'email' && sendSettings
  ? docPlainText(docFromTemplateText(m.body, sendSettings))
  : m.body
```

- **The composer's own call, not a second expansion.** A preview drawn by a second implementation
  would agree on the day it was written and drift afterwards — and be believed while it drifted.
- **Email only, and only once the settings arrive.** WhatsApp has no document and no signature; a
  settings read that has not answered falls back to the body as rendered rather than showing an
  empty signature.
- **Read-only.** The same `GET /api/admin/outreach/settings` and the same two parsers the compose
  window uses. The one POST to that route is still the Signature screen's Save.
- The **"Footer appended above"** chip had not been true since the signature stopped being appended
  automatically (29 September). It now says **"Signature and opt-out from Settings"**.

---

## 9 · The harness

`scripts/outreach-templates-layout.cjs` — **83 checks, 13 broken variants, all failing as
required.** New in v2: V8 (the second tab row returns), V9 (`usedIn(draft.id)` again), V10 (an
orange Save), V12 (the preview stops at `m.body`), V13 (`{{signature}}` stops being placed at all).
V7 was re-anchored to the measured height, because the constant it used to break no longer exists.

The signature checks run the **compiled `lib/outreach-doc.ts`**, not a regex over the panel: the
signature lines appear, the opt-out sentence appears, neither token is left standing, the blank
line inside the signature survives, an unset opt-out row expands to **nothing** rather than to its
token, and the resolver still defers both.

### Two stale checks, restated in place with their reasons — not silently re-pointed

| The v1 check | Why it went stale | What it says now |
|---|---|---|
| `…full height below the switcher, and each pane scrolls on its own`, pinning `height: 'calc(100vh - 12rem)'` | **That constant is the bug of item 4.** A check that pins it would require the defect. Its second half counted two panes carrying one class string; v2 gave two of the three panes a different shape for good reasons, so counting one string would now pass on **one** scrolling pane out of three | pins the **measured** height on the panes' own style, and names **each of the three panes at the shape it actually has**. The measurement itself is checked in the v2 block, which owns it |
| `…and the older tags are still SHOWN, read-only` | Item 5 **deleted** that line — it was one of the three prose lines the chips replace, describing tags that stopped deciding anything when the sequence grid took over. Requiring it *and* forbidding it would be a contradiction | the requirement is **inverted**: the older-tags line went with the rest of the prose. The v2 block checks the same absence from the other side, with the two lines that went with it |

A third check — the braces hint — **failed for real** and was a genuine gap: the hint had been
deleted with the "Write it" paragraph and not put back. It is item 3's explicit requirement, and
§3 above is where it now lives.

---

## 10 · Verification

| | |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | compiled successfully, 96 static pages |
| `node scripts/outreach-templates-layout.cjs` | **83 passed**, 13 variants failing as required |
| `node scripts/outreach-templates-render.cjs` | **both views measure correct** — Chromium + WebKit |
| `node scripts/outreach-workspace-render.cjs` | the layout measures correct — the prospect page still scrolls |
| `node scripts/run-harnesses.cjs` | **73 run · 73 passed · 0 failed** |
| goldens | `batch-rolling-golden.json` `8bdae817748ad334…`, `batch-reservation-golden-on.json` `e3f0a88099fd797c…` — **unchanged** |
| eslint, changed files vs a worktree of HEAD | **13 errors / 2 warnings, both trees** — identical. Two warnings appeared mid-build (`kindLabel` and `match` left unused by the deleted prose) and were fixed by deleting the dead code, not by silencing them |
| deploy | production serves `/_next/static/chunks/33aa84943363e635.js` **byte-identical** to the local build of `c0ea398` (sha256 `1608ba41ad0c6a91…`): it contains "Signature and opt-out from Settings" and no "Older tags on this row" |

**Nothing was written.** No `outreach_templates` row was created, edited, seeded or deactivated —
the only writer is still the editor's own Save, and the harness re-proves it by walking `app`,
`lib` and `components` for any other `.insert/.update/.delete/.upsert` on that table. No SQL was
run, no email was sent, no database change was made, and every sequence guard and
`EMAIL_FRAME_SANDBOX` is untouched.

---

## 11 · What to test

1. **The gap.** Open **Templates**. The switcher sits just under the tab strip, in both views.
2. **One tab row.** There is no second row. **Snippets (2)** and **Signature** are at the foot of
   the left pane, and the count is right.
3. **The labels.** Template name (slug beside it), Subject, Message — and the small grey braces
   line under the Message label.
4. **The scroll, in Safari on the 16″ MBP and on the 27″ monitor.** The page itself does not
   scroll in either view. **Save** is visible without scrolling, with a long message in the box.
   Drag the message box taller by its resize handle and the page still does not scroll.
5. **The panes.** The template list scrolls on its own; the message box scrolls on its own; the
   preview scrolls on its own with the picker fixed at the top and the Dropped/Signature line at
   the bottom.
6. **The bug from item 5.** Select **Hatches Up - map only**. The chips in the editor and the
   "Used in 1 box" on its row now say the same thing. Click the chip — it opens the Sequence view
   with that box outlined. Select a template that is in no box: **no chips row at all**.
7. **The preview.** Pick **ZZ Test Prospect** and read to the bottom: the signature lines and the
   opt-out sentence are there as text, not as `{{signature}}` / `{{opt_out}}`, and they match the
   Signature screen. Switch to a **WhatsApp** template — no signature, as before.
8. **The buttons.** **+ New template** and **Save template** are dark. Nothing on the tab is orange.
9. **The prospect page.** Open any prospect and scroll to the bottom of History — it still scrolls.
