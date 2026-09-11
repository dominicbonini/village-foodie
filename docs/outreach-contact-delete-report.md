# Deleting a contact row — diagnosis and build report

Two files changed: **`app/api/admin/outreach/route.ts`** and **`components/admin/OutreachPanel.tsx`**.
No schema change, no migration, **no new route action**, nothing installed.

🔴 **No deletion was performed against the live database.** Every proof below is either an execution of the
shipped code against a stubbed network, or a real browser driving the real components. The Bonnefirebox row
is still there.

One instruction conflicted with another and I stopped and asked rather than choosing — see §3.

---

## 0. `git status` before any edit, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/admin/page.tsx
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/OutreachPanel.tsx
	modified:   docs/manual-update-report.md
	modified:   docs/reference-manual.md
	modified:   docs/scraper-reference-manual.md
	modified:   lib/outreach.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/api/admin/discovery-events/
	app/api/admin/outreach-templates/
	components/admin/ComposeWindow.tsx
	components/admin/ConfirmDeleteDialog.tsx
	components/admin/DiscoveryEventsPanel.tsx
	components/admin/EventRowCells.tsx
	components/admin/InlineField.tsx
	components/admin/ScheduleEventsPopup.tsx
	components/admin/TemplatesPanel.tsx
	docs/compose-single-pane-report.md
	docs/compose-window-stacking-report.md
	docs/discovery-events-delete-report.md
	docs/discovery-events-table-report.md
	docs/discovery-run-log-migration-report.md
	docs/outreach-compose-send-report.md
	docs/outreach-compose-window-report.md
	docs/outreach-delete-guard-report.md
	docs/outreach-filter-ux-report.md
	docs/outreach-history-table-report.md
	docs/outreach-inline-edit-report.md
	docs/outreach-intervals-report.md
	docs/outreach-kind-final-report.md
	docs/outreach-kind-vocabulary-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-delete-report.md
	docs/outreach-media-report.md
	docs/outreach-modal-density-report.md
	docs/outreach-modal-flow-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-schedule-popup-report.md
	docs/outreach-sequence-report.md
	docs/outreach-signature-removal-report.md
	docs/outreach-table-report.md
	docs/outreach-templates-report.md
	docs/outreach-templates-table-report.md
	docs/templates-layout-tweaks-report.md
	docs/templates-page-layout-report.md
	docs/truck-name-matching-report.md
	lib/outreach-filter.ts
	lib/outreach-template-render.ts
	lib/schedule-match.ts
	supabase/migrations/20260909_outreach_templates.sql
	supabase/migrations/20260910_outreach_contact_kinds.sql
```

---

## 1. Diagnosis — `delete_contact` as it stood

**What it does** (`app/api/admin/outreach/route.ts:415`): reads `contact_id`, returns 400 if absent, then
`supabase.from('outreach_contacts').delete().eq('id', contact_id)`, throws on a driver error, answers
`{ ok: true }`.

**Its gate**: the entire `POST` handler is behind `if (!(await verifyAdmin(req)))` at `:244`, which answers
**404, not 401** — an unauthenticated caller is told the route does not exist. One gate, no per-action
exceptions.

**Is it reachable from the UI?** ⚠️ **Almost, but not for your case, so this is not a control you missed.**
`deleteContact` (`OutreachPanel.tsx:573`) had exactly **one** caller: the **Undo** on the "Logged" toast,
raised at the moment of logging and torn down after **6 seconds** (`:363`). There is no per-row control, no
menu, nothing in the modal. Once that toast expires the action is unreachable from any surface. The
Bonnefirebox row was logged earlier today, so the Undo is long gone.

**And it had a real defect.** PostgREST returns **no error** when a delete matches zero rows — the statement
ran, it simply affected nothing — so the action answered `{ ok: true }` for an id that does not exist and the
UI said "Contact removed" about a row still in the table. That is precisely the failure mode this brief
names, and it was live.

### What is derived from the contact log, and what is not

| Value | Where | Derived from contacts? | What happens on delete |
|---|---|---|---|
| `lastContactedAt` — status strip + table column | route `:178`, `contacts[0].contacted_at` | **yes** | must be recomputed |
| `outboundCount` | route `:177` | **yes** | must be recomputed |
| history table, double-log guard | read `p.contacts` | **yes** | follow automatically |
| `stage` | route `:200`, straight from the stored column | **no** | **unchanged.** 🧪 Bonnefirebox is `not_contacted` even with a contact logged — logging never writes stage |
| `next_action_at` | stored column, written by `persistFollowUpAfterLog` on log | **no** | was left orphaned — now handled, see §4 |
| overdue flag, `last_contacted` sort | read `next_action_at` / `lastContactedAt` | indirectly | follow whatever those become |

### Live data, re-derived

`outreach_contacts` is now **14 rows** (`content-range 0-13/14`) — it was 10 when I last measured; four were
logged today. The row you want gone:

| | |
|---|---|
| contact id | `8bc106f9-30f0-4aba-98ef-0b8dca878ef9` |
| prospect | Bonnefirebox, `5237fcde-e144-47d4-8452-984f4d7c8119` |
| stored | 2026-09-10 · outbound · `1_first_contact` · email |
| prospect `stage` | `not_contacted` |
| prospect `next_action_at` | **2026-09-13** — exactly +3 from the contact, i.e. the date that log wrote |

---

## 2. What was built

**One route change, and it is not a new action.** `delete_contact` now runs
`.delete().eq('id', …).select('id')` and answers `{ ok: true, deleted: 1 }`, or **404** with
*"That contact no longer exists — it may already have been deleted."* when it removed nothing. Same action
name, same single statement, same gate; what changed is that the answer says how many rows it actually
removed.

**One delete path, two callers.** `deleteContact(contactId, prospectId?, sigKey?)` is the same function the
toast's Undo already used. Called with a `prospectId` it splices locally; called without one it keeps the
old refetch behaviour. No second fetch, no second action.

**It rejects on failure.** `ConfirmDeleteDialog` catches, shows the server's own sentence in place and stays
open. A version that swallowed the error would close the dialog and remove the row from the screen while the
database still held it — identical to success until you reload.

**The control lives in the contact popout, not on the table row** — your choice when I raised the conflict
(§3). Click a row → the popout that already shows date, direction, stage, channel and the body → **Delete
this contact** in its footer.

**The confirmation is REUSED, not rebuilt.** It is `components/admin/ConfirmDeleteDialog.tsx`, the same
component behind the media and event deletes. It already provides Cancel-focused-on-open, Escape,
backdrop-cancel, a busy lock and the in-place error, and its own header records why a second one would be a
mistake. Only the `title`, `confirmLabel` and `children` differ.

Two details that needed care, both from lessons already recorded in this repo:

* **The dialog renders inside the popout's panel**, not beside it. The panel stops click propagation, so a
  click on the dialog's backdrop cancels the *dialog* without also reaching the popout's backdrop and
  closing the window underneath. Its `z-[70]` resolves inside the popout's `zIndex: 90` stacking context, so
  it paints above both the popout and the modal. (`z-[70]` has 7 users in the repo, so the rule certainly
  exists — the `z-[85]` failure cannot repeat here.)
* **Escape is guarded, not fought over.** Both listeners sit on `window` in the **capture** phase, and two
  capture listeners on the same target both fire — `stopPropagation` does not stop a sibling on the same
  node. The popout now ignores Escape while `confirming` is true, so one press closes the dialog only.
  Guarding in my own component leaves the shared dialog untouched for the media and event callers.

**Is the deletion reversible? No.** There is no undo, no soft delete, no `deleted_at` column — the row is
gone from `outreach_contacts` and nothing in this system retains a copy. The dialog says so in bold: *"This
cannot be undone. There is no recovery."*

---

## 3. The conflict I stopped on

Item (1) asked for a delete control **in the contact history table**; the constraints forbade touching **the
history table's layout or columns**. The last column is 46px and holds "View" — measured, and there is no
room for a second affordance without widening it, which moves a column position the previous task settled.
I presented three placements with their costs and you chose **in the contact popout**, which changes nothing
about the table: same five columns, same 104/86/132/auto/46 widths, same one line per contact.

---

## 4. The follow-up date — the mid-task addition

You asked that deleting a contact also clear "contacted on" and revert the follow-up date. Both are done,
and one of them needs a caveat stated up front:

**"Last contacted" is exact.** It is recomputed from the rows that remain, taking the maximum
`contacted_at` explicitly rather than trusting `contacts[0]` — the server's array happens to be newest-first
and putting that assumption in a second place is how two implementations drift.

**"The previous follow-up date" is derived, not remembered — there is no history of `next_action_at`.** The
column holds one value and nothing anywhere records what it held before. So the revert is computed: the date
the **newest remaining outbound contact** implies, or `null` when none remains.

🔴 **And it only fires when the stored date is the one that contact wrote.** If `next_action_at` does not
equal the date the deleted contact implies, it was set by hand or by a quick-set button afterwards, and
overwriting a date you chose would be a second bug wearing the first one's clothes. In that case it is left
exactly as it is — and the dialog says so.

**On the `stale` convention:** the brief said update or mark stale, following the Schedule count's
precedent (`staleCountIds`, `OutreachPanel.tsx:349`). I **updated**, which is the first of the two permitted
options, because both derived values are pure functions of the contact list and the exact new values are
computable on the client. `stale` is the right convention for a value that cannot be recomputed without the
server — which is exactly why the Schedule count uses it and this does not. No second convention was
invented.

**`stage` is not touched.** It is not derived from contacts, and 🧪 Bonnefirebox proves logging never sets
it — the prospect is `not_contacted` with a contact logged. The dialog says the stage is not changed.

---

## 5. Proofs

### 5.1 The shipped `deleteContact` / `deleteContactRow`, executed

Both were extracted from the **compiled** component by brace-matching and run against a recording `fetch`.
Prospect and contact values are the live Bonnefirebox ones from §1.

| case | request sent? | threw? | contacts left | lastContactedAt | outboundCount | `next_action_at` | refetch? |
|---|---|---|---|---|---|---|---|
| **A** real case, server deletes 1 | ✅ 1 | no | none | **null** | **0** | 2026-09-13 → **patched null** | **no** |
| **B** server deletes 0 → 404 | ✅ 1 | **yes** — server's sentence | **row still there** | unchanged | 1 | **not touched** | no |
| **C** 200 but `deleted: 0` | ✅ 1 | **yes** — "Delete failed (200)." | **row still there** | unchanged | 1 | **not touched** | no |
| **D** an older contact remains | ✅ 1 | no | `older` | 2026-09-03 | 1 | 2026-09-13 → **2026-09-10** (+7 from the 3 Sep Chase 1) | no |
| **E** date hand-set (2026-10-01) | ✅ 1 | no | none | null | 0 | **not touched** | no |
| **F** no date stored | ✅ 1 | no | none | null | 0 | not touched | no |

The request captured in every case, verbatim:
`POST /api/admin/outreach {"action":"delete_contact","contact_id":"8bc106f9-30f0-4aba-98ef-0b8dca878ef9"}`

**This is the "removed locally but never reached the database" test.** Rows B and C show a delete that did
not happen: the request *was* sent, the response said nothing was removed, the function **threw**, and
**nothing was spliced out of state**. Row C is the harder half — a `200 OK` that deleted zero rows, which is
precisely what the route used to return.

**The double-log guard forgets it too.** `writtenRef` remembers what this session wrote so a second
identical log is refused. After a successful delete the key is gone (`double-log keys: []`); after a failed
one it survives — so you can immediately re-log a contact you deleted, and cannot accidentally re-log one
that is still there.

### 5.2 The dialog and the popout, in a real browser

The shipped `HistoryTable`, `ContactPopout` and `ConfirmDeleteDialog`, compiled from source and mounted with
real React 19 in headless Chrome, driven with real clicks and real key presses, with `fetch` replaced by a
recorder:

| step | rows | popout | dialog | requests | |
|---|---|---|---|---|---|
| start | 2 | – | – | 0 | |
| click row → Delete this contact | 2 | open | **open** | **0** | opening a dialog deletes nothing |
| | | | | | names **10 Sept 2026 / Outbound / First contact / Email**: ✅ says "cannot be undone": ✅ focus on **Cancel**: ✅ |
| **Escape** | 2 | **still open** | **closed** | 0 | Escape closed only the dialog |
| reopen → **Cancel** | 2 | still open | closed | **0** | cancel writes nothing |
| confirm, server returns **404 / deleted 0** | **2 — row stays** | open | **stays open** | 1 | error in place: *"That contact no longer exists…"* |
| confirm again, server returns **deleted 1** | **1 — row gone** | closed | closed | 2 | no refetch |

Both requests were `POST /api/admin/outreach` carrying the Bonnefirebox `contact_id`. A dialog that never
opened, or one that opened and could not be cancelled, would have shown here.

---

## 6. What is proven how

**Compiler-confirmed** — `npx tsc --noEmit` → **0 errors**. It also caught the prop chain at each step
(Detail → HistoryTable → ContactPopout), so no caller was left behind.

**Executed against the shipped code** — every row of §5.1 (the compiled `deleteContact` and
`deleteContactRow`), and every row of §5.2 (the compiled components in a real browser).

**Measured / re-derived from the live database** — 14 contact rows (`0-13/14`), the Bonnefirebox contact id,
its prospect id, `stage = not_contacted`, `next_action_at = 2026-09-13`; all count-asserted.

**Structural (read, not executed)** — that `verifyAdmin` gates the whole `POST` and answers 404; that
`.select('id')` after a delete returns the deleted rows under the service role, so `deleted` reflects
reality — **this is the one link in the chain I could not execute**, because it needs the real route against
the real database, and running it would have deleted your row.

**Reasoned only** — that the dialog's `z-[70]` inside the popout's `zIndex: 90` context paints above the
modal (the stacking rules are certain, the composite was not rendered in a browser with a real modal behind
it); and the choice to update rather than mark stale.

**Not run** — `npm run build`, and any real deletion. `npx eslint` is unchanged from before this task:
`OutreachPanel.tsx` 13 errors, `route.ts` 9 (all `no-explicit-any` / `set-state-in-effect`), none on a line
this task wrote.

---

## 7. What to do next

Open Bonnefirebox, click the **10 Sept 2026 · Outbound · First contact · Email** row, and press **Delete
this contact**. Expect: the row leaves the table, "Last contacted" empties, and the follow-up date
**2026-09-13** clears — because it is exactly the date that contact wrote. The stage stays `not_contacted`,
which is what it already was.
