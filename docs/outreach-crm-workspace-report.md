# The prospect view becomes a full-page CRM workspace

**30 September 2026 · commit `f246d74` · deployed and serving on production at 11:15:43Z**

The prospect was a 1152px modal holding its identity, six editable fields, the demo tools, an email
history and an always-open logging form, all at equal weight. Dominic's word for it was "cramped".
It is now a page at `/admin/outreach/p/[prospectId]`, arranged **scan first, act second, edit third**,
and built to be worked through in a queue.

**Layout and interaction only.** Every rule, refusal and guard is the one that was already there — the
send path's refusals, the single contact writer, `nextStep` as the only derivation, the needs-attention
predicate, the sandboxed iframe, attachments by storage path, the linked-truck refusal, and
`do_not_contact` still only ever moving on a click. Sending stays manual.

---

## 1 · What the page looks like

> ⚠️ **Described, not screenshotted.** I have no admin session, so what follows is the structure the
> code renders, not a picture of it. Every element named is in `ProspectWorkspace.tsx` or
> `ProspectTimeline.tsx` and every claim is asserted by the harness.

### With nothing open (the resting state)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ 🚫 Do not contact — outreach is blocked for this truck                    [Undo]     │  ← only when set
├──────────────────────────────────────────────────────────────────────────────────────┤
│ [← Back]  Buffalo Joe's  (contacted ▾)  Website ↗  Schedule ↗    ‹  3 of 12  ›  [⋯]  │
│ NEXT   Stephen replied 15 Sept — waiting for you                        [Reply →]    │
├───────────────────────────┬──────────────────────────────────────────────────────────┤
│ CONTACT            ✎ Edit │ [Email] [Log call] [Log WhatsApp] [Note]                 │
│ Stephen Clarke            │                                                          │
│ stephen@buffalojoes.test  │ All · Conversation · Notes & changes   [search] Expand all│
│ ☎ 07700 900123  WhatsApp↗ │ ┌──────────────────────────────────────────────────────┐ │
│ LEAD  Hatches Up — map    │ │↙ 15 Sept  Re: Taking orders online · How do I… Waiting│ │
│ LAST CONTACTED 12 Sept    │ │↗ 12 Sept  Taking orders online · Hello — I run…       │ │
│ SCHEDULE 3 upcoming       │ │☎ 10 Sept  chase 1 · rang, no answer                   │ │
│                           │ │· 10 Sept  Stage not contacted → contacted · First…    │ │
│ PINNED NOTES              │ │✎ 9 Sept   Wants a call after 3pm                      │ │
│ [only answers after 3pm]  │ └──────────────────────────────────────────────────────┘ │
│ FILES (2)                 │                                                          │
│ plans-2026-09-12.pdf  ⬇   │                                                          │
│ their-menu.pdf  listed    │                                                          │
│ DEMO   /demo/abc  Rebuild │                                                          │
└───────────────────────────┴──────────────────────────────────────────────────────────┘
```

Nothing is open. The right column is four buttons and the history; the left is text, not inputs.

### With the composer open (Reply)

The composer expands **between the action bar and the timeline**, pushing the history down rather than
covering it:

```
│ [Email] [Log call] [Log WhatsApp] [Note]                                             │
│ ┌──────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Compose — Buffalo Joe's                                             [Close]      │ │
│ │ Template [— none —▾]   To stephen@buffalojoes.test   Subject Re: Taking orders…  │ │
│ │ ┌──────────────────────────────────────────────────────────────────────────────┐ │ │
│ │ │ B  small        (the WYSIWYG editor — what you see is what is sent)          │ │ │
│ │ └──────────────────────────────────────────────────────────────────────────────┘ │ │
│ │ [Attach file] [Plans PDF]   2 files · 1.4 MB of 10.0 MB                          │ │
│ │ Replies to "Taking orders online" (15 Sept) · to stephen@… [Hide]                │ │
│ │ ┌── the earlier conversation, expanded, in a sandboxed iframe ─────────────────┐ │ │
│ │ └──────────────────────────────────────────────────────────────────────────────┘ │ │
│ │                          [Copy] [Send test to me] [Send] [Log as outbound…]      │ │
│ └──────────────────────────────────────────────────────────────────────────────────┘ │
│ All · Conversation · Notes & changes …                                               │
```

It is the **same `ComposeWindow`** — same template picker, same editor, same guards, same attachments,
same Plans PDF, same expanded conversation. The new `inline` prop drops the backdrop and the portal;
nothing else differs.

### Narrow screens

The two columns stack as **header → actions + timeline → details**, so the work is first and the
reference below it (`max-lg:flex-col` with the right column at `order-1`).

---

## 2 · Where every old control went

| Old place (the modal) | New place |
|---|---|
| Header: logo + photo thumbnails | **⋯ menu**, with their delete (and the named live-truck confirmation) |
| Header: truck name, Website ↗, Schedule ↗ | **Header line 1**, unchanged |
| Header: ← → and "3 / 12" | **Header line 1**: ‹ › and "3 of 12", walking the queue the page was opened from |
| Header: ✕ Close | **← Back**, which restores the list's tab, filters and scroll |
| Status strip: Stage `<select>` | **Header line 1**, a compact pill — same route, so stage events are still recorded |
| Status strip: Upcoming / last event | **Contact card**, "Schedule: N upcoming · last …" |
| Status strip: Last contacted | **Contact card** |
| Status strip: Demo link / Rebuild / Create demo | **Left column, bottom** — behaviour unchanged, weight reduced |
| Status strip: 🚫 Do not contact tickbox | **⋯ menu** — plus a **red banner across the page** when it is on |
| Left column: Email field + "Email" button | **Contact card** (read-only text). 🔴 The button is gone: the way to send is the Email action, which logs what it sends |
| Left column: First/Last name, Phone, WA tick, Lead type | **Contact card behind ✎ Edit**, same fields, same routes, same validation |
| Left column: "Call" link | **Contact card**: the number itself is the `tel:` link |
| Left column: Contact history table | **Timeline** (merged, one line per item) |
| Left column: Emails list | **Timeline** |
| Left column: Notes | **Pinned notes**, under the contact card |
| Right column: "Compose from template…" button | **[Email]** in the action bar |
| Right column: Contacted on / Channel / Direction / Kind + body + Log | **[Log call] / [Log WhatsApp]** (five controls) and **Log other…** for the full form |
| Right column: Follow up on + Tomorrow/+3/+1 week/Clear | Inside the composer and the quick-log forms, where the date is actually decided |
| Compose window (floating, over the modal) | **Inline**, above the timeline |
| Timeline row: Open button | Gone — **the row is the control** |
| Timeline row: Sent / Reply / imported / from Outlook | Gone from the row; shown in the **expanded** row's details line |
| — | **New**: Files card, filter chips, search, Expand all, the Next line, the "Done. Next" bar, Snoozed on Today, shortcuts |

---

## 3 · The Next line

[`nextAction`](../lib/outreach-workspace.ts#L67) — pure, first match wins:

| # | When | Line | Button |
|---|---|---|---|
| 1 | A reply passes the shared **needs-attention** predicate | `Stephen replied 15 Sept — waiting for you` | `Reply →` (that message) |
| 2 | `step.state === 'due'` **and** `channelFor(p) !== null` | `Chase 1 due 18 Sept · 12 days overdue` | `Send Chase 1 →` |
| 3 | `next_action_at <= today` | `Follow up due 16 Sept · 14 days overdue` | `Follow up →` |
| 4 | otherwise | `No next step` + the stop reason where there is one | — |

🔴 **The order is the design.** Somebody waiting on an answer outranks a chase this app decided was
due, which outranks a date Dominic wrote down for himself. Showing all three would be the modal's
problem again: everything at equal weight and nothing decided.

🔴 **It derives nothing.** The harness censuses `lib/outreach-workspace.ts` for `nextStep(`,
`followUpDateFor(` and `CONTACT_KINDS` and requires all three to be absent — *and shows the same
census failing on a version that has them*. The page calls `nextStep` **exactly once**
([`ProspectWorkspace.tsx:248`](../components/admin/ProspectWorkspace.tsx#L248) feeds the line from it),
and contactability comes from `channelFor`, never `step.channel` (§57.2).

⚠️ **The stop reason is shown**: `Sequence finished`, `Replied`, `Do not contact`. "No next step" on
its own reads as a bug.

---

## 4 · Working through a queue

| Rule | Where |
|---|---|
| The list records what was on screen when a row was opened | [`OutreachPanel.tsx:445`](../components/admin/OutreachPanel.tsx#L445) — `saveQueue` + `saveReturn` |
| Each Today section is **its own** queue, with its own label | `repliesQueue` / `chasersQueue` / `followUpsQueue` / `problemsQueue` |
| ‹ ›, J/K and "3 of 12" | [`queuePosition`](../lib/outreach-queue.ts#L86) and [`neighbours`](../lib/outreach-queue.ts#L93) |
| The queue does **not** wrap | `neighbours` returns null at each end |
| "Done. Next" appears only after a resolving action | `RESOLVING = {mark_handled, snooze}` plus a send and a log — [`:551`](../components/admin/ProspectWorkspace.tsx#L551) |
| It **never navigates by itself** | no effect calls `goTo`; Enter and the button do, and nothing else — asserted by census |
| End of queue | "That's everything in Replies waiting." |
| Back restores tab + scroll | [`readReturn`](../lib/outreach-queue.ts#L75), applied once after the rows paint |

🔴 **Why sessionStorage and not a query string.** A list of 231 ids does not belong in a URL, and the
queue is per-tab working state rather than an address: a link pasted to a colleague should open that
prospect, not claim a queue they never built. ⚠️ It is **validated, not trusted** — a malformed value
reads as "no queue" rather than crashing the page it was meant to help.

🔴 **Nothing navigates automatically, and that is Close's own rule.** The pattern works because the
result of what you just did stays on screen until you choose to move. A page that jumped would hide
the confirmation, and a mis-click would be unrecoverable.

**Snoozed** now has a collapsed section on Today, soonest-return first, with Unsnooze (the same
`needs_reply` action the timeline offers). 🔴 **Listed, never counted**: the tab's number is work
waiting *now*, and a snoozed reply is by definition not — but "put off until Tuesday" and "lost" look
identical if nothing lists them.

---

## 5 · The timeline row

One line: **icon · date · subject or kind · one line of text · badges**.

🔴 **Badges only where something needs doing or went wrong**: `Waiting` (amber), `Bounced`, `Failed`,
`May have been sent`, `Auto-reply`, and `test` while tests are shown. **No Sent / Reply / imported /
from Outlook.** Every row carrying a status word is how the badges that matter stopped being read;
direction is already in the icon and the tint, and provenance is in the expansion.

Clicking anywhere on a row expands it in place — the stored body in the existing `sandbox=""` iframe,
a details line (sent/received · imported/from Outlook · no copy in Sent · attachments), and the row's
actions: Reply, Retry, Save to Sent, log it, Mark done, Snooze, Mark as needing reply, and Delete for
a contact row. **Notes and stage changes are single lines that do not expand** — there is nothing
behind them.

Controls above it: **All · Conversation · Notes & changes** (remembered per browser), a **search** over
the subject and the stored text, **Expand all**, and the existing **Show test sends (n)**.

---

## 6 · Shortcuts

| Keys | Does |
|---|---|
| `J` / `K` | Next / previous prospect in this queue |
| `E` | Email |
| `R` | Reply to the waiting message |
| `N` | Note |
| `C` | Log call |
| `Enter` | Go to the next item in the queue (only while "Done. Next" is showing) |
| `Esc` | Close the composer, or collapse the expanded row |
| `?` | Show this list |

🔴 **Ignored while typing**, and the predicate checks `isContentEditable` as well as the tag name —
the email body is a ProseMirror surface, so a tag test alone would let every letter fire inside it.
Each shortcut is in the tooltip of the button it duplicates.

⚠️ **One listener, registered once**, reading the latest handlers through a ref: two of them branch on
a `window.confirm` and cannot be memoised, and re-registering a window listener on every keystroke
elsewhere on the page would be the cost of pretending otherwise.

---

## 7 · The harness

`scripts/outreach-workspace.cjs` — **NEW**, registered (64 harnesses), **136 checks**, no network, no
mailbox, no database.

### Broken variants — shown FAILING first

```
✓ FAILED as required  V1 a chase is suggested while somebody is waiting for an answer
✓ FAILED as required  V2 the follow-up date is named while a chase is overdue
✓ FAILED as required  V3 a prospect with no way to reach them is told to send a chase
✓ FAILED as required  V4 an ordinary sent email carries a badge
✓ FAILED as required  V5 a note shows under Conversation
✓ FAILED as required  V6 a shortcut fires inside the email editor, which is a contenteditable div
✓ FAILED as required  V7 the end of the queue wraps round to the start
✓ FAILED as required  V8 a malformed stored queue is handed back as though it were real
✓ FAILED as required  V9 a snoozed reply is counted as work waiting now
```

### What it proves

```
── THE NEXT LINE: ONE THING, IN ONE ORDER ───────────────────────────────────────────────
  ✓ 🔴 a waiting reply comes first      ✓ …named, dated, and in words
  ✓ …already handled / snoozed / a test / an out-of-office is not "waiting"
  ✓ 🔴 …and a linked HatchGrab truck is never queued at all
  ✓ 🔴 stopped (sequence_complete) says so: "Sequence finished"   ✓ (replied) ✓ (do_not_contact)

── IT DERIVES NOTHING OF ITS OWN ────────────────────────────────────────────────────────
  ✓ 🔴 lib/outreach-workspace.ts computes no step of its own…
  ✓ ⚠️ …and the same census FAILS on a version that does, so it is testing the rule
  ✓ 🔴 the page calls `nextStep` EXACTLY ONCE
  ✓ 🔴 …and the card shows the STEP's lead type, so it cannot disagree with the email that gets sent

── THE ROW SAYS ONLY WHAT NEEDS SAYING ──────────────────────────────────────────────────
  ✓ 🔴 an ordinary sent email carries NO badge — not "Sent", not "from Outlook"
  ✓ 🔴 an unanswered reply says Waiting, and only that
  ✓ 🔴 the row no longer renders MAIL_STATUS_LABEL / imported / from Outlook
  ✓ ⚠️ …but the provenance is still SHOWN — in the expanded row, where it is wanted
  ✓ 🔴 there is no Open button: the row itself is the control

── FILTERS AND SEARCH ───────────────────────────────────────────────────────────────────
  ✓ 🔴 Conversation is emails, calls and WhatsApp — what was SAID
  ✓ 🔴 Notes & changes is what was RECORDED
  ✓ 🔴 search matches the subject…  ✓ …and the stored text  ✓ …case-insensitively

── THE QUEUE, AND THE WAY BACK ──────────────────────────────────────────────────────────
  ✓ 🔴 "2 of 3", one-based, as a person counts
  ✓ 🔴 the first has no previous…  ✓ …and the last has no next: the queue does not wrap
  ✓ 🔴 a corrupted value reads as no queue
  ✓ 🔴 Back restores the tab AND the scroll position

── WORKING THROUGH A QUEUE ──────────────────────────────────────────────────────────────
  ✓ 🔴 only a resolving action arms the "Done. Next" bar
  ✓ 🔴 …and NOTHING navigates on its own: there is no effect that calls it
  ✓ ⚠️ at the end of the queue it says which queue is finished

── SNOOZED IS LISTED, NEVER COUNTED ─────────────────────────────────────────────────────
  ✓ 🔴 soonest to return first   ✓ 🔴 …and NOT counted as work waiting now
  ✓ 🔴 …and Unsnooze is the SAME action the timeline offers

── SHORTCUTS ────────────────────────────────────────────────────────────────────────────
  ✓ 🔴 ignored in an <input> / <textarea> / <select>
  ✓ 🔴 …and a contenteditable div, which is what the email editor IS

── WHAT THE PAGE KEEPS ──────────────────────────────────────────────────────────────────
  ✓ 🔴 the page / timeline / shared module never inject HTML into the admin page
  ✓ every log goes through `log_contact`…  ✓ …and the page never touches the table itself
  ✓ 🔴 do_not_contact moves only on a click, and clears to null rather than false
  ✓ 🔴 the composer is the SAME component, rendered inline — not a second one

── THE OLD MODAL IS GONE ────────────────────────────────────────────────────────────────
  ✓ 🔴 `modalProspect` / `function Detail(` / `ProspectMetaFacts` / `setModalId` / `gotoNext` are gone
  ✓ ⚠️ …and the file says where it went, rather than leaving a hole
```

### Seven stale anchors, restated rather than re-pointed

Moving the prospect view broke seven censuses in five existing harnesses. Each is restated **in place**,
with the reason, against the file that now owns the rule:

| Harness | What it anchored on | Now |
|---|---|---|
| `outreach-mail-poll.cjs` | `ContactPopout` / `EmailBody` in the panel | the same components in `outreach-shared.tsx` |
| `outreach-mail-poll.cjs` | the modal's `<Timeline>` + nonce refresh | the page's single `reloadAll()` |
| `outreach-crm-today.cjs` | the modal's timeline, notes, toggles | `ProspectTimeline.tsx` / `ProspectWorkspace.tsx` |
| `outreach-reply-attach.cjs` | Reply wiring and the Download link | the timeline, the page and the shared module |
| `outreach-logo-latch.cjs` | `useThumbLatch` in the panel | the shared module — and "one implementation" is now a fact about the pair |
| `outreach-log-once.cjs` | `logContact … await load()` in the panel | `action: 'log_contact'` + `reloadAll()` on the page |
| `outreach-upload-refresh.cjs` | the optimistic media clear | 🔴 **a real behavioural change**, stated below |

🔴 **One behaviour did change, and it is not hidden.** Deleting a logo used to clear the slot
optimistically, justified in a comment by the cost of re-reading 231 rows. The page holds **one** row,
so it re-reads and the slot shows what the column actually says. The harness now asserts that, plus
that the server's file note still reaches a person.

---

## 8 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | `✓ Compiled successfully in 5.2s` |
| eslint — `ProspectWorkspace.tsx`, `ProspectTimeline.tsx`, the route, `outreach-workspace.ts`, `outreach-queue.ts` | **clean, 0 problems** |
| eslint — `outreach-shared.tsx` (new) | 2, **both moved verbatim with the code** (see below) |
| eslint — `OutreachPanel.tsx` | **13 → 6** |
| eslint — `ComposeWindow.tsx` | 3 → 3, unchanged |
| eslint — `lib/outreach-today.ts`, `today/route.ts` | 0 → 0 |
| `node scripts/outreach-workspace.cjs` | **136 checks, all passed** |
| `node scripts/run-harnesses.cjs` (run alone) | **64 run · 64 passed · 0 failed** |
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` ✅ |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` ✅ |

⚠️ **`outreach-shared.tsx`'s two findings are not new.** They are `ContactPopout`'s `setMounted(true)`
and `useThumbLatch`'s `setBroken(false)` — two of the panel's original thirteen, which travelled with
the components. Panel + shared is **8**, down from 13; nothing was introduced.

No email was sent. No SQL was run — none is needed. No template or snippet row was touched, no live
trading truck was involved, and nothing about Brevo changed.

---

## 9 · SQL

**None.** Every column and table this uses was applied with CRM parts 1 and 2.

---

## 10 · Commit and deploy evidence

**Commit `f246d74`** — *"The prospect view becomes a full-page CRM workspace"*, on `main`, pushed to
`origin/main` (`a47b913..f246d74`). Seventeen files: seven new (two libs, three components, the route,
the harness), ten changed.

**Deployed and serving on production, confirmed 2026-09-30T11:15:43Z.**

```
fingerprint at push:  4d84b4a42ac5da580f3e0fce38dc7da3
11:14:01Z poll 1:     4d84b4a42ac5da580f3e0fce38dc7da3
11:14:21Z poll 2:     4d84b4a42ac5da580f3e0fce38dc7da3
11:14:41Z poll 3:     4d84b4a42ac5da580f3e0fce38dc7da3
11:15:02Z poll 4:     4d84b4a42ac5da580f3e0fce38dc7da3
11:15:22Z poll 5:     4d84b4a42ac5da580f3e0fce38dc7da3
11:15:43Z poll 6:     b3f60449c247a4115309164a704912bb     ← DEPLOY LANDED
```

| Request | Status | Body |
|---|---|---|
| `GET /admin/outreach/p/a5beca7f-…` | 200 | the page shell, rendering "Loading…" — **the new route exists** |
| `GET /admin/outreach/p/does-not-exist-check-xyz` | 200 | the same shell (it resolves the id client-side, then says so) |
| `GET /admin/outreach` | 200 | still redirects to `/admin?tab=outreach` — old links keep working |

⚠️ **The 200 is the evidence**: before this commit `/admin/outreach/p/…` did not exist and returned the
app's 404. The shell holds no authority — `verifyAdmin` refuses the API and the page then says
"/api/admin/outreach refused this session", which is the documented pattern for every admin surface.

---

## 11 · Test script — ZZ Test Prospect (Dominic) only

`a5beca7f-3edb-4fa1-abc1-6b00e75d1e46`. Nothing below touches another prospect.

1. **Open it from Today.** Reply from Hotmail first if nothing is waiting, then press *Check for
   replies now*. Click the truck's name under **Replies waiting**.
   → The page opens. The header reads `‹ 1 of 1 ›`, and **Next** says *"… replied <date> — waiting for
   you"* with a **[Reply →]** button.
2. **Press Reply →** (or press `R`).
   → The composer opens **inline, above the timeline**, in reply mode: To is the Hotmail address, the
   subject is `Re: …`, and the earlier conversation is expanded below the editor.
3. **Send test to me.** → Check Hotmail: the history is quoted under the signature.
4. **Close the composer, expand the waiting reply in the timeline, press Mark done.**
   → The **Waiting** badge goes, and a green **"Done."** bar appears. It does **not** navigate. With
   one item in the queue it reads *"That's everything in Replies waiting."*
5. **Press Mark as needing reply, then Snooze → In 3 days.**
   → Back on Today: the row leaves **Replies waiting** and appears under **Snoozed (1)** with
   *"back <date>"* and an **Unsnooze** button.
6. **Log call**: the form opens with today's date, `outbound`, and the kind derived from the step.
   Type a line and press **Log**.
   → The call appears in the timeline; any earlier waiting reply is marked handled automatically
   (part 1's rule, untouched).
7. **Note**: type and press **Add note** → it appears as the newest line, with a ✎ icon.
8. **Filters and search**: press **Notes & changes** — the emails and the call disappear, the note and
   the stage changes remain. Type `sign` in the search box — only rows whose subject or stored text
   contain it remain. Reload the page: the chip you chose is still selected.
9. **`J` / `K` and ‹ ›** step through the queue; the counter moves with them. At the end, the arrow
   disables rather than wrapping. Press `?` for the shortcut list.
10. **Press ← Back.** → The list returns on the **same tab**, with the same filters, scrolled to where
    it was.
11. **✎ Edit** on the contact card: change the phone number, press **Save** → the card returns to
    read-only showing the new value. **Cancel** on a second attempt discards.
12. **⋯ → Do not contact.** → A red banner appears across the top of the page. Press **Undo** in the
    banner → it goes, and the flag is cleared to null.

⚠️ **Watch for one thing in step 6**: the kind defaults from `nextStep`, not from whatever a dropdown
was last left at. §57.3 records what the old behaviour cost — a chaser logged as a first contact drove
the queue wrong for weeks.

---

## 12 · What was deliberately not done

- **The list and Today are otherwise untouched.** Their rows navigate instead of opening a modal, and
  Today gained the Snoozed section; nothing else about either changed.
- **No optimistic merge on the page.** It holds one prospect, so every write re-reads. The list keeps
  its optimistic patching, because re-reading 231 rows on every tick would be absurd.
- **The portalled compose window is kept, with no caller.** `inline` is a branch, not a replacement:
  the component's contract is "a compose window", and a future caller that wants one over something
  should get the version that was proven.
- **`ProspectMetaFacts` and `HistoryTable` are deleted, not hidden.** Leaving a dead copy of the
  prospect view beside its replacement is how two implementations of one screen begin.
