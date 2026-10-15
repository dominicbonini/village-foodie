# Templates: the values box no longer covers the message (rich editor)

**Date:** 15 October 2026.

**Branch:** `main`, working tree, not committed.

**Database:** no SQL; no `outreach_templates` row changed.

**Garbled or contradictory instructions:** none.

**A commit landed while this was being built:** `89b3f29 "template update"` (yours, 12:27), holding all earlier uncommitted work. Only this task's three files are uncommitted now (§5).

---

## 1 · What was wrong

In Admin → Templates the "Values this message fills in" box was drawn on top of the message, about two-thirds of the way down the new email editor. It covered lines such as "Plans start at £29/month…".

**It was 11229e3's bug again, by the same mechanism: flex-shrink, not positioning.**
- The email editor's wrapper was `flex-1 min-h-[7rem] flex flex-col`. That shape is right for the WhatsApp **textarea**, which fills whatever box it is given.
- The rich editor is different: ProseMirror **grows with its text**.
- As a shrinkable flex item, the wrapper was squeezed to the height the column had left, while the editor inside kept its full height.
- The text therefore spilled out of the bottom of the wrapper. The values box, a later sibling and so painted on top, landed across it.
- Nothing was absolutely positioned. The box sat where an editor of 7rem–"what was left" would end, not where the text ended.

## 2 · The fix

One class, in `components/admin/TemplatesPanel.tsx`: the email editor's wrapper is **`shrink-0 flex flex-col`**.
- **The editor takes its own content's height.** It grows with the template; there is no inner maximum.
- **The values box follows it in normal document flow**, separated by the column's own `space-y-3` gap like every other block. Its content and its "Edit in Snippets" button are unchanged.
- **A long template scrolls the editor column** (its existing `overflow-y-auto`), not the page.
- **Save template stays pinned below the scroller**, below everything, on screen at every height. That is unchanged from 11229e3.

**The WhatsApp textarea was already right, so it is unchanged:** the `flex-1 min-h-[7rem]` label with a `flex-1 min-h-0` textarea. A textarea fills its box rather than growing, so for it the shrinkable shape is correct. The existing shell fixture measures it and still passes in both engines:
- 8 blocks in order;
- the message ends where the values box begins;
- the 112px floor holds at 1440×600;
- Save is on screen.

`TemplateBodyEditor` is now a named export, so the harness can mount the real component. Nothing else imports it.

## 3 · The harness: `scripts/outreach-templates-render.cjs` (the 11229e3 harness), extended

**A new section mounts the real editor.** The Templates tab's own `TemplateBodyEditor` (the real `RichEmailEditor` and the real markup round trip) is bundled with esbuild and mounted in the same admin-shell fixture:
- The template is 30 lines, with a 4-item bulleted list, a bold line and "Plans start at £29/month…", plus `{{signature}}` and `{{opt_out}}`.
- The wrapper's class and the values box's class are **lifted from the source**, so the fixture cannot describe a shape the panel does not have.

**Measured in Chromium and WebKit, at 1440×800 and 820×1180:**

| Size | Text lines | Editor ends | Values box starts | Text lines under the box |
|---|---:|---:|---:|---:|
| 1440×800 | 20 | 1069 | 1081 | **0** |
| 820×1180 | 41 | 1669 | 1681 | **0** |

The same numbers came out in both engines. Each size asserts:
- the long template is really there (≥ 20 lines, 4 bullets, the £29/month line);
- **the values box's top is at or below the editor's bottom edge**;
- **no editor text node's box intersects the values box.** This checks every line rectangle of every text node;
- Save is below the scroller and on screen;
- the page itself does not scroll; the editor column does.

**Broken variant (the control).** The same page with the old shrinkable wrapper (`flex-1 min-h-[7rem] flex flex-col`) must fail, and it does, in both engines:
- **1440×800:** the values box starts at 603 while the editor ends at 1069; 3 lines of text are under it.
- **820×1180:** it starts at 947 against 1669; 4 lines are under it.

All of the harness's existing measurements still pass unchanged: the sequence view, the three panes, the shell at 1440 and 2560, the 11229e3 control, and the 1440×600 short window. Result: "✅ both views measure correct".

## 4 · Checks

| Check | Result |
|---|---|
| `template-formatting` | ✅ 26 / 26, with two named re-pins in my own harness: the wrapper check now asserts `shrink-0 flex flex-col`; the "before formatting" baseline is pinned to `0914760` instead of HEAD |
| `outreach-templates-layout` | ✅ 127 / 127 |
| `outreach-templates-render` | ✅ both views, both engines, including the new section and its control |
| `outreach-editor-toolbar` | ✅ 48 / 48; with `HG_RENDER=1`, 104 / 104, of which 56 run in a real browser |
| `npx tsc --noEmit` | clean |
| `npm run build` | exit 0 |
| ESLint against HEAD | `TemplatesPanel.tsx` unchanged in every rule. The render harness has one more `no-require-imports` (it now loads esbuild), the pattern every CommonJS harness carries. |

**Why the baseline re-pin was needed.** The "same as before" check in `template-formatting` compared against `HEAD`. Once `89b3f29` committed the formatting itself, it was comparing the new parser with itself, and its control correctly failed. It is pinned to `0914760`, the last commit without template markup. This follows the repo's own rule: pin a commit, not HEAD.

Not run, as asked: the full sweep.

## 5 · Files

- `components/admin/TemplatesPanel.tsx`: the email editor's wrapper is `shrink-0 flex flex-col`, with a note recording why; `TemplateBodyEditor` is exported for the harness.
- `scripts/outreach-templates-render.cjs`: the real-editor section, its two sizes, and its control.
- `scripts/template-formatting.cjs`: the two named re-pins above.
