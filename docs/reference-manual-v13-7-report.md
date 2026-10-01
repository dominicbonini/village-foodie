# Reference manual V13.6 → V13.7 — what was applied, and what the delta got wrong

**1 October 2026 · documentation only.** No code change, no SQL run, no database change, no
`outreach_templates` change, no email sent. `docs/reference-manual.md` is the only file edited:
**564 insertions, 2 deletions** — the two deletions are the two version lines.

The delta (`~/Downloads/reference-manual-v13.7-delta.md`) was applied as its "How to apply" section
says. **Nineteen corrections were made to its wording before writing**, listed in §2 and §3 below:
nine wrong commit hashes, one missing build, six [REPORTED] statements verified or rewritten against
the two reports, and three places where the code contradicts the delta.

---

## 1 · What was written, and where

| Step | Where | Result |
|---|---|---|
| Version, running header | line 1 | `· V13.6` → `· V13.7` |
| Version, front matter | line 9 | `**Version 13.6**` → `**Version 13.7**` |
| **Part A** — the changelog block | directly under `# Changelog`, above `## V13.6 — …` | line 29 |
| **Part B** — §60, §61, §62 | after §59, before `*End of manual. …*` | lines 26269 / 26387 / 26510 |
| **Part C** ×6 | §52.2, §57.1, §57.3, §57.4, §58.6 ×2 | lines 25346, 26013, 26041, 26064, 26166, 26201 |

Nothing else was touched and nothing was reflowed.

### The required greps

```
$ grep -nE "V13\.7|Version 13\.7" docs/reference-manual.md | head
1:HatchGrab Engineering Reference Manual · V13.7
9:**Version 13.7**
29:## V13.7 — 28–30 September 2026 — OUTREACH EMAIL MOVES INTO THE ADMIN: SENT FROM DOMINIC'S OWN MAILBOX, REPLIES PICKED UP OVER IMAP, A FULL-PAGE CRM FOR EACH PROSPECT, AND A ONE-TEMPLATE-PER-BOX SEQUENCE THAT REFUSES TO SEND THE SAME STEP TWICE
25346:🔴 **CORRECTED V13.7 — THE OPT-OUT FOOTER ROW OF THAT TABLE NO LONGER DESCRIBES THE CODE.** Nothing is
26013:**V13.7.** `templateForStep` no longer chooses a template — `chooseForStep` over `outreach_sequence_slots`
26041:**SUPERSEDED V13.7 — "Auto-logging on send is NOT built" above.** A system send logs its contact
26064:**V13.7.** The types can be **renamed**, but not added (`lead_type_labels` in `outreach_settings`).
26166:**SUPERSEDED V13.7.** `serves_kind` and `serves_lead_type` are read by nothing that chooses a template —
26201:**V13.7.** The Templates tab is now two views (§62.7). The list rail is **270px**, and the three panes'
26269:# 60. Outreach email — sending and receiving through our own mailbox (V13.7 — 28–30 September 2026)
```

```
$ grep -nE "^# 6[0-2]\." docs/reference-manual.md
26269:# 60. Outreach email — sending and receiving through our own mailbox (V13.7 — 28–30 September 2026)
26387:# 61. The outreach CRM — Today, the prospect page and the history (V13.7 — 29–30 September 2026)
26510:# 62. The sequence grid, the send-time guards and the Templates tab (V13.7 — 30 September 2026)
```

---

## 2 · The [REPORTED] statements, checked against the two reports

All six are resolved. **Five were verified and their tags removed; one was wrong and is rewritten.**

| # | The delta said | The report says | Written as |
|---|---|---|---|
| 1 | Builds table: *v4 fixes [REPORTED] — see its report* | v4-fixes report, line 3: **commit `21d0cae`**, deployed 17:29:12Z | The hash, and the six fixes named in the row |
| 2 | Builds table: *Polish [REPORTED] — `67f7c6e`* | polish report, line 3: `67f7c6e`, deployed 19:02:02Z ✓ | Hash kept, tag removed, the row names the seven fixes |
| 3 | §61.3 *"A call is labelled **Call** even when it is stored as `reply`"* | polish §7 ✓, and gives the mechanism: `oneClickKind` logs `reply` **on purpose** (it is not a rung, so a call back must not advance the ladder); `contactRowLabel` relabels Call / WhatsApp / Text and keeps the rung wording for email; **display only, the stored kind is unchanged** | Verified, tag removed, the mechanism and the "display only" line added |
| 4 | §61.3 *"a second rule pairs when exactly one email's text **starts with the same words**"* | v4-fixes §4 ✓, with the specifics: both sides normalised (case, whitespace runs, line breaks, smart quotes), **greeting lines skipped on both sides**, the first **60** meaningful characters, pair **only when exactly one** matches, an already-paired email never claimed twice | Verified, tag removed, the specifics added |
| 5 | §61.3 *"nothing is deleted or rewritten, and **no 'logged by hand' marker is shown**"* | 🔴 **The reports disagree with each other in sequence, and the delta flattens it.** v4-fixes §6 **kept** a marker — *"Also logged by hand · 18 Sep"* always on the panel, and the row marker retained. Polish §3 then **removed** it from both, at Dominic's instruction. What survives is **"Note logged with this email ▸"**, closed, only when the hand note says something the email does not (`handTextIsRedundant`, with "I cannot tell" resolving to **false**) | Rewritten: the end state is right, but the manual now records that the marker existed until the polish build and names what replaced it |
| 6 | §61.4 *"One follow-up writer, `applyFollowUp`."* | polish §1 ✓ — still the one writer, now with an optional explicit date and a **nullable kind** (a date on its own contacts nobody, so it must not freeze the lead type), two callers. It also records three faults the delta omits: **a chip used to write nothing**; the chips were seeded from the *suggestion*, so "None" rendered over a real date; and the banner hid a future date | Verified, tag removed, and the three faults and their fixes written in |

### What the delta omitted entirely

- **The scroll-lock failure class.** The v4-fixes report's headline diagnosis — a modal's
  `document.body.style.overflow = 'hidden'` inherited by a composer that the prospect page mounts
  inline and permanently, so **no prospect page could be scrolled in any browser** — appears nowhere
  in the delta, although it is the most reusable lesson in either report (including the trap that
  `window.scrollTo` moves a locked page in both engines, so the obvious probe passes against the bug).
  It is written in as **failure class 8** of the changelog and as a bullet in §61.2. This is an
  addition rather than a correction, and it is called out here for that reason.
- **The demo-link `link` mark.** Polish §6 added a `link` mark to the editor's document schema with
  an href allow-list (`LINK_RE`, `https` only; `javascript:`, `data:`, `http:` and protocol-relative
  `//` refused, **not stripped**). §60.3's schema sentence listed only paragraph / text / hardBreak
  and bold / small, which is now wrong. Corrected.

---

## 3 · Commit hashes, filenames, paths and symbols

### 🔴 Nine hashes in the builds table were wrong, in one systematic way

Every build in this period is followed in `git log` by a *"Record the … report"* commit. The delta's
two-hash rows pair **the previous build's report commit** with the build — so the first hash in each
pair belongs to the row above it.

| Delta row | Delta gave | `f7eb674` etc. actually is | Written as |
|---|---|---|---|
| Build 1 — sending | `f7eb674`, `7beed77` | `f7eb674` = *Record … the mail-diagnostics report* | `7beed77` |
| Five production defects | `275cf06`, `b462d2e` | `275cf06` = *Record … the mail-send report* | `b462d2e` |
| Signature / opt-out tokens | `78921b9`, `fbaf1a9` | `78921b9` = *Record … the mail-send fix report* | `fbaf1a9` |
| WYSIWYG editor | `c8675f6`, `fc3fd69` | `c8675f6` = *Record … the signature report* | `fc3fd69` |
| Build 2 — reply pickup | `bc7ab41`, `0cd29a4` | `bc7ab41` = *Record … the editor report* | `0cd29a4` |
| Two mailboxes | `3a92f80`, `223a502` | `3a92f80` = *Record … the replies report* | `223a502` |
| The first look | `24f9c10`, `617144c` | `24f9c10` = *Record … the two-mailboxes report* | `617144c` |
| HTML-only replies | `7aa0a4c`, `3f19cc0` | `7aa0a4c` = *Record … the poll baseline report* | `3f19cc0` |
| v4 fixes | *"see its report"* | the build is `21d0cae` | `21d0cae` |

The table now carries **one commit per build**, with a line above it saying the report commit is the
next one on that date. Every other hash in the delta exists and is the build it is said to be
(`23b1b12`, `080059b`, `510a332`, `10d78dc`, `3ad9958`, `f246d74`, `3b36b6d`, `7bef71f`, `303a260`,
`569594a`, `c61f9e6`, `e796e07`, `67f7c6e`, `e42cfef`, `6ab8d18`, `307b1bd`, `c0ea398`).

### One build was missing

`101346b` — *"A note in the history is one line, with a control that says there is more"* — is in the
window and is the build §61.3's note claim actually describes. Added to the table, and §61.3 now
records the **More / Less** chevron that appears only when there is more (`noteHasMore`).

### Everything else checked out

- **Migrations:** all eight filenames exist in `supabase/migrations/`, spelled exactly as the delta
  gives them. `20260930_outreach_sequence_slots.sql` does carry
  `outreach_templates_id_channel_key unique (id, channel)` and
  `outreach_sequence_slots_box_key unique (channel, step, lead_type)`, and it seeds exactly the five
  rows the delta's table lists, with those five slugs.
- **Paths:** `lib/outreach-mail-config.ts`, `lib/outreach-mail-accounts.ts`, `lib/plans-pdf.ts`,
  `app/api/cron/outreach-replies`, `app/api/admin/outreach/mail-send/route.ts`,
  `app/admin/outreach/p/…`, `scripts/outreach-workspace-render.cjs`,
  `scripts/outreach-templates-render.cjs`, `scripts/outreach-crm-today.cjs` — all present.
- **Env vars:** `OUTREACH_PRIMARY_USER`, `OUTREACH_PRIMARY_PASSWORD`, `OUTREACH_MAIL_USER`,
  `OUTREACH_MAIL_PASSWORD`, `OUTREACH_TEST_RECIPIENT`, `CRON_SECRET` — all read where the delta says.
- **Symbols:** `runReplyPoll`, `chooseForStep`, `nextStep`, `loggedKindFor`, `logOutreachContact`,
  `applyFollowUp`, `docFromTemplateText`, `gridTemplateFor`, `rowLabel`, `meaningfulPreview`,
  `effectiveLeadType`, `leadTypeOf`, `stepOffsetLabel`, `resolvedTokenReference`,
  `conditionReference`, `GrowingTextarea` — all exist. The five guards are
  `guardAlreadySent` / `guardUnattributed` / `guardNotDue` / `guardSharedAddress` /
  `guardAfterFinal`, run by `evaluateGuards`; their names are now in the §62.4 table.
- **Numbers:** `COL_LEFT_PX` 380 · `COL_LEFT_WIDE_PX` 420 · `COL_RIGHT_PX` 280 ·
  `COL_RIGHT_WIDE_PX` 320 · `WIDE_AT_PX` 1920 · `THREE_COL_AT_PX` 1024 · `TWO_COL_AT_PX` 768;
  `COMPOSE_DEFAULT_LINES` 12, `COMPOSE_MIN_LINES` 6, `COMPOSE_MAX_FRACTION` 0.8;
  `READING_PANEL_FRACTION` 0.55 with `READING_PANEL_MAX_PX` 960; `SHARED_ADDRESS_DAYS` 14;
  `MAX_ATTACHMENT_BYTES` 10 MB; TipTap `3.31.3`; ports 465 / 587 / 993;
  `POLL_SINCE` = `hello` 2026-09-29T17:26:00Z, `dominic` 2026-09-29T00:00:00+01:00. All correct.
- **Keys:** `hg.outreach.composeHeight.v1` ✓, `hg.outreach.templatesView.v1` ✓ (`TEMPLATES_VIEW_KEY`).
- **Today's four sections** are named exactly as the delta gives them in `OutreachPanel`.

### 🔴 Three places where the code contradicts the delta — the code wins

1. **`suggestTemplateId` is not dead.** The delta lists it with `templateForStep` and `STEP_TEMPLATE`
   as superseded. It is **still called**: `components/admin/ProspectWorkspace.tsx:882` passes
   `suggestTemplateId(p)` to the picker as `suggestedId`, which orders the list and labels an option.
   It has never pre-selected. Written as a separate bullet saying so.
2. **`serves_kind` / `serves_lead_type` are not "read by nothing".** They are read by
   `app/api/admin/outreach-templates/route.ts` (`TAG_COLS`, the `EDITABLE` allow-list and its
   validators) and round-tripped by the editor's Save (`TemplatesPanel.tsx:589–612`), so a stored
   value survives an edit. What is true is that **nothing that chooses a template reads them**.
   Corrected in §62.1, in the open-items row and in the §58.6 correction.
3. **They are no longer "still shown, greyed".** The read-only tag line *"Older tags on this row, no
   longer used to choose…"* was removed by the Templates-view build (`307b1bd`). The manual now says
   the editor stopped displaying them on 30 September.

Also tightened, same reason: the open-items row said *"`templateForStep` and `STEP_TEMPLATE` have no
caller"*. `templateForStep` has none; `STEP_TEMPLATE` is read by `templateForStep` (at
`lib/outreach-step.ts:417`) and by nothing else. Written that way.

---

## 4 · The Part C anchors

| Correction | "Find:" | Found | Placed |
|---|---|---|---|
| §52, opt-out footer | the **Opt-out footer** row of the guards table — `OPT_OUT_FOOTER` + `composeEmail` | **Yes**, line 25162, a row of the guards table in §52.2 | At the **end of §52.2**, after the existing V13.2 correction — see the note below |
| §57.1, key symbols | *(no Find given)* | §57.1 is *"The step is DERIVED, and nothing stores it"* and does carry a **`Key symbols:`** line | End of §57.1 |
| §57.3 | `Auto-logging on send is **NOT built**` | **Yes**, line 25854 | End of §57.3, quoting the superseded sentence so the link is explicit |
| §57.4 | *(no Find given)* | §57.4 is *"Lead type, and why it is frozen"* ✓ | End of §57.4 |
| §58.6, `serves_kind` | `**\`serves_kind\` NOW DRIVES THE LOGGED \`kind\`.**` | **Yes**, line 25977 | Directly after that paragraph, as instructed |
| §58.6, Templates tab width | *(no Find; names the bullet)* | The bullet exists under *"Two corrections recorded here"*, ending *"…a fixed 240px track at every viewport width"* | End of §58.6 |

**All six anchors matched.** One placement decision: the §52 item says *"Append after the table"*
while the delta's general rule 4 says *"add the paragraph at the end of that subsection"*. Both are
satisfied by the end of §52.2, and placing it there keeps the table joined to its own summary
sentence (*"A template controls its words and its `channel`. It controls none of the above."*),
which a block inserted between them would have orphaned. The correction names the table row it
corrects in its first line, so it is unambiguous wherever it sits.

---

## 5 · Two things to flag

1. **Two "(V13.6)" tags remain in the body**, at lines 25878 and 25937 in §55 — *"What a demo gets
   (V13.6)"* and *"Demo flags are BROWSER state, not session state (V13.6)"*. The delta's grep note
   says only historical **changelog headings** may still say 13.6. These are not headings; they are
   in-body records of **which version established a fact**, which is exactly what this manual keeps.
   Rewriting them would falsify the history, and the brief says to change nothing else, so they were
   left. The changelog heading at line 195 is the one the delta expected.
2. **One build lands outside the delta's window.** `11229e3` (1 October) rebuilt the Templates
   editor as a single flex column after the "values box drawn across the message" overlap, and moved
   Save outside the scroller. It is **not** recorded: V13.7 is dated 28–30 September, and nothing
   §62.7 says is made untrue by it (the panes' height is still measured, and Save is still always
   visible — now for a second reason). It belongs in the next delta.

---

## 6 · Rules observed

Documentation only. One file changed. No code was edited, no SQL was run, no database was touched,
no `outreach_templates` row was created, edited, seeded or deactivated, and no email was sent. Every
claim above was checked against `git log`, `supabase/migrations/`, the source, and the two reports
named in the brief.
