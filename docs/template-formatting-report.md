# Templates: bold, italic and the rest, plus a template that attaches the plans PDF

**Date:** 15 October 2026.

**Branch:** `main`, not committed. This work sits beside the uncommitted Phase 1b and screenshot-match work in the same tree; `scripts/harnesses.json` carries changes from all three.

**Database:** no SQL, no migration.
- **No `outreach_templates` row was changed.** A template gains formatting only when you save it from the editor.
- The data was read once, to prove the change against the 9 live templates.

---

## 1 · What you get

### Email templates: the compose window's own editor
Admin → Templates now writes an **email** template in the same editor and toolbar as the prospect's Email tab:
- **B**, *I*, Size (Small, Normal, Large), bulleted list, numbered list, Link.
- **Insert signature** and **Insert opt-out.** In a template these put the `{{signature}}` / `{{opt_out}}` token on a line of its own; the compose window fills the token when the template is used, exactly as before.
- **Insert token ▾** and **Insert condition ▾** work as before and insert at the editor's cursor. A condition always goes on a line of its own.

**WhatsApp templates keep the plain text box.** A WhatsApp message is sent as typed. If a template switched from Email to WhatsApp still carries formatting, a line under the box says WhatsApp would show the tags.

### The plans PDF
A template can now attach the plans-and-features PDF:
- **The editor toolbar** has a **Plans PDF** button, where compose has its own. It shows "Plans PDF ✓" once the template has it.
- **Insert token ▾** lists **`{{plans_pdf}}`** with a description. It is hidden for WhatsApp templates.

Either way, `{{plans_pdf}}` lands on a line of its own.

**What happens when the template is used:**
- In the compose window, choosing the template attaches the PDF straight away. This also happens when the window opens with the template already chosen from the queue.
- It uses the code behind compose's own Plans PDF button, so it is the same freshly generated document.
- It **never attaches twice.** It is skipped while one is generating and when a copy is already attached. If you remove the chip, it stays removed.
- The `{{plans_pdf}}` line itself is **not** in the email.
- If someone types `{{plans_pdf}}` mid-sentence in the compose box, Send refuses and says to use the Plans PDF button. Otherwise those characters would be emailed.

### The preview shows the formatting, live (your follow-up)
The preview pane now draws the email as it will arrive: bold, italic, sizes, lists and links.
- It is built from the **unsaved draft**, so every change shows as you make it.
- It uses the send's own `docToHtml`, so the preview and the sent email cannot disagree.
- An email template that asks for the PDF shows a chip: "📎 The plans PDF is attached when this template is used".

---

## 2 · How it is stored, and why

A template stays **text**:
- the resolver substitutes `{{tokens}}` in it;
- it drops `?condition:` lines from it, line by line;
- WhatsApp sends it as it is.

Formatting is therefore stored as small markers in that text. They become formatting where the compose window already expands the signature (`docFromTemplateText`, `lib/outreach-doc.ts`):

| Formatting | Stored as |
|---|---|
| bold, italic | `<b>…</b>`, `<i>…</i>` |
| sizes | `<small>…</small>`, `<large>…</large>` |
| link | `<a href="https://…">…</a>`. It is a link only if the address passes the send's own `LINK_RE`; anything else stays as text. |
| lists | a line starting `• ` (bulleted) or `1. ` (numbered), the same markers the email's plain-text part uses |

**Why not markdown (`**bold**`, `_italic_`):**
- `_` appears in every token name (`{{truck_name}}`).
- `*` pairs are ambiguous where bold meets italic.
- One live template already uses `- ` lines as plain text.

**Safety rules:**
- **Marks never cross a line.** Each stored line opens and closes its own tags, so a `?condition:` line the resolver drops can never leave bold switched on.
- A literal `<b>` you type is stored as `&lt;b>`.
- A paragraph that merely starts like a list item is stored with a `\` in front, so it stays text.

**What changes when an existing template is first saved from the new editor:** the stored text is tidied, and the email does not change.
- Windows line endings become plain newlines (4 templates).
- One triple blank line becomes a double one (2 templates).

Three or more newlines already built the same email as two.

---

## 3 · Proof

**All 9 live templates (read-only): byte-identical.** I built every template with HEAD's `docFromTemplateText` and with the new one. All 9 give byte-identical documents and byte-identical HTML. Taking each one through the editor and back also builds the same email.

**New harness: `scripts/template-formatting.cjs` — 26 checks, all pass, registered.** Fixtures only. Every rule is checked on the real code **and** on a broken variant that must fail it:

| Check | Broken variant |
|---|---|
| plain templates build the same email as HEAD (document and HTML) | a "- " line treated as a bullet |
| editor round trip builds the same email, formatting included | a literal `<b>` not escaped |
| bold, italic, sizes, links and lists reach the HTML | `<b>` ignored |
| a mark never crosses a line | tags closed only at the end of a paragraph |
| a bad href stays text and the document still validates | any href accepted |
| a `{{plans_pdf}}` line is not in the email; the template is read as asking for the PDF | the line kept |
| `{{plans_pdf}}` mid-sentence is refused at send | not refused |

It also checks:
- the resolver keeps `{{plans_pdf}}` and lists it in the token menu;
- a formatted condition line is kept or dropped whole;
- the PDF is recognised by its filename;
- the editor sits in a `<div>`, never a `<label>`. A label was the cause of the 5 October bold bug;
- the preview is drawn from the unsaved draft by `docToHtml`;
- compose's attach is wired and never attaches twice.

**Existing harnesses, all pass** (17 in total, plus four browser checks):
- `outreach-templates-layout` (127)
- `outreach-editor-toolbar` (48; with `HG_RENDER=1`, 104, of which 56 run in Chromium and WebKit)
- `outreach-send-visible` (39), `outreach-bold-persists` (10), `outreach-crm-polish` (94), `outreach-sequence` (69), `outreach-reply-any-notes` (54), `outreach-workspace-v4` (71), `outreach-workspace-v4-fixes` (48), `outreach-log-once` (15)
- `outreach-mail-send`, `outreach-reply-attach`, `outreach-workspace`, `-v2`, `-v3`, `ui-literals`
- **Browser:** `outreach-bold-persists-render`, `outreach-editor-render`, `outreach-templates-render`, `outreach-workspace-render`, each in Chromium and WebKit.

**One named re-pin, in `outreach-editor-toolbar`.** Its "what may not change" check read "the Templates editor is still a textarea — only the composer changed". That was a fence around the toolbar build, not a manual rule; the manual says nothing about it. It now asserts the new shape: this editor for email, stored as text; the textarea for WhatsApp.

**Two other existing checks still pass with nothing in them changed.** Each failed at first because my code had changed the exact line it looks for. I put those lines back as they were and built around them:
- the opt-out button's call (`outreach-send-visible`);
- the token menu's `tokens={tokenRef}`, the preview's `full`, and `conditionNotes(draft.body …)` (`outreach-templates-layout`).

**Build and lint:**
- **`npx tsc --noEmit`:** clean.
- **`npm run build`:** exit 0.
- **ESLint:** no rule count grew in the six source files. The new `.cjs` harness has the `require()` finding every CommonJS harness has.
- **`run-harnesses --dry-run`:** 120 files pass the screen.
- **Full sweep:** not run.

---

## 4 · Try it (localhost; use only ZZ Test Prospect (Dominic))

⚠️ **Localhost reads and writes the live database.** So:
- edit a **new** test template, not a live one;
- send only to **ZZ Test Prospect (Dominic)**, or use **Send test**.

1. **Templates → + New email template.** Type a line, select a word and press **B**. The preview on the right turns it bold as you type.
   - Try *I*, Size → Small, a bulleted list and a Link. Each shows in the preview straight away.
2. **Insert signature** and **Insert opt-out** add `{{signature}}` / `{{opt_out}}` lines. The preview shows your real signature and opt-out there.
3. **Plans PDF** on the toolbar adds `{{plans_pdf}}` on its own line, and the button turns to "Plans PDF ✓".
   - The preview shows "📎 The plans PDF is attached when this template is used".
   - **Insert token ▾** also lists `{{plans_pdf}}`.
4. **Save**, switch to another template and back. The formatting is still there.
5. Open **ZZ Test Prospect (Dominic)** → Email and choose the template.
   - The formatting is in the compose box.
   - The **hatchgrab-plans-and-features-….pdf** chip appears by itself.
   - Choosing it again does not add a second copy.
   - The `{{plans_pdf}}` line is not in the message.
   - **Send test** goes to your own address only. Check that the bold, list and link arrive.
6. Switch the test template's channel to **WhatsApp**. The plain box returns, `{{plans_pdf}}` is no longer offered, and a line warns that the formatting tags would show. Switch back, or delete the test template.

---

## 5 · For the manual (corrected by your decision, not done here)

**§58.1 (template vocabularies) should gain two things:**
1. `{{plans_pdf}}`, a send-time token like `{{signature}}`. On a line of its own, it attaches the plans PDF in the compose window; the line is not sent; email only.
2. The formatting markers in §2 above, stored in the template text, with the rule that marks never cross a line.

---

## 6 · Files

**Changed:**
- `lib/outreach-doc.ts`: the markup parser and serialiser; `docFromTemplateMarkup`, `templateMarkupFromDoc`, `PLANS_LINE_RE` and `templateWantsPlansPdf`; the `{{plans_pdf}}` send refusal. Plain text goes through the existing path unchanged.
- `lib/outreach-template-render.ts`: `plans_pdf` as a send-time token with its description; condition notes quote lines without markup.
- `lib/outreach-attachments.ts`: `isPlansPdfFilename`.
- `components/admin/RichEmailEditor.tsx`:
  - `insertText` on the editor handle;
  - `templateTokens`, so Insert signature / opt-out put the tokens;
  - `note`, the toolbar's right-hand sentence.
- `components/admin/TemplatesPanel.tsx`:
  - the email editor (in a `<div>`) with the Plans PDF button;
  - the formatted live preview and the 📎 chip;
  - the WhatsApp warning;
  - `{{plans_pdf}}` hidden for WhatsApp and kept out of the subject.
- `components/admin/ComposeWindow.tsx`: attaches the plans PDF when a template asks, never twice.
- `scripts/outreach-editor-toolbar.cjs`: the named re-pin.
- `scripts/harnesses.json`: registers the new harness.

**New:** `scripts/template-formatting.cjs`.
