# Signature and opt-out footer removed from the code — report

Three files changed: **`lib/outreach-template-render.ts`**, **`components/admin/ComposeWindow.tsx`**,
**`components/admin/TemplatesPanel.tsx`**. No schema change, no migration, no route change, **no template
copy touched** — the two bodies ending in a bare `Dominic` are exactly as they were, for you to decide on.
Nothing installed; `package.json` and the lockfile untouched.

Nothing in the prompt arrived garbled and no instruction contradicted another.

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

no changes added to commit (use "git add" and/or "git commit -a")
```

---

## 1. 🔴 THE GUARD THAT HAS LEFT THE CODE, AND WHAT IS NOW UNPROTECTED

**`OPT_OUT_FOOTER` is gone from the codebase.** It was a mandatory line —

> *If you would rather not hear from me again, reply with "no thanks" and I will not contact you.*

— appended by `composeEmail` to every outgoing email, deliberately unreachable from any template body. The
reason it was built that way is recorded in the file it used to live in: *text inside an editable box is
text that eventually gets trimmed*. It was a compliance control, not a nicety: under PECR an objection must
be honourable, and that line was the channel by which an objection reached you.

**It is now entirely your responsibility, in a place this codebase cannot see, check, or prove.** Stated
without softening, here is exactly what is no longer protected:

1. **No email composed by this app is guaranteed to carry an opt-out line.** A template can be written,
   edited, previewed, copied and sent without one, and **no code path will notice or object**. There is no
   validator, no warning, no lint. The Templates page will happily save a body with no opt-out in it.
2. **The failure is silent and total.** If your Outlook signature is switched off, if you send from a
   different account, from the web client, from your phone, or if Outlook drops the signature on a
   `mailto:`-composed message — the email goes out with no opt-out line and **nothing anywhere reports
   it**. The old guard could not fail this way: it ran on every compose, in code, with no configuration.
3. **The stored history is no longer evidence.** The contact row logged on send used to contain the footer,
   because the logged text was `composeEmail(body)`. It is now the body alone. **If you ever need to show
   that a given email carried an opt-out, `outreach_contacts.message` will not show it** — the line lives
   only in a client-side signature that leaves no trace in this system.
4. **The two surfaces that used to advertise the guard no longer do.** The compose window's "Appended
   automatically" strip and the Templates page's "Every email also gets this appended" note are both
   removed, because both would now be describing behaviour that does not happen. Nothing on screen tells
   you an opt-out line is expected.

This is a real reduction in protection, made at your explicit instruction and for a sound reason — the
appended footer could not stay last once Outlook was also appending a signature. The trade is: correct
ordering and no duplication, at the cost of the app being unable to enforce or evidence the line at all.

The removal is also recorded in the code itself, at the top of `lib/outreach-template-render.ts`, so the
next person to read that file learns it from the source rather than from this document.

---

## 2. What was removed, and the census proving it is complete

Removed from `lib/outreach-template-render.ts`:

| Symbol | What it was |
|---|---|
| `OPT_OUT_FOOTER` | the mandatory opt-out line |
| `EMAIL_SIGNATURE` | the structured signature (name, `HatchGrab · Village Foodie`, email, site) |
| `signatureText()` | its plain-text rendering |
| `composeEmail()` | the function that appended both — **deleted, not stubbed** (see below) |
| `composeEmailHtml()` | the rich-text twin |
| `EMAIL_HTML_FONT`, `EMAIL_BODY_PT`, `EMAIL_FOOTER_PT` | 12pt/10pt/Calibri, only ever used by the HTML twin |
| `escHtml()`, `linesToHtml()` | its two private helpers |

`composeEmail` was **deleted rather than reduced to `body => body`**. A function whose name promises
composition and whose body performs none is worse than no function: the next reader assumes a guard is
running. Its two callers use the rendered body directly, and each carries a comment saying what used to
happen there.

Removed from the two components: the imports, the `composeEmail(...)` calls, the compose window's
"Appended automatically" preview strip, and the Templates page's "Every email also gets these appended"
note.

### The census — every reference, before and after

Searched across `lib/`, `components/`, `app/`, `supabase/` (`.ts`, `.tsx`, `.sql`), excluding
`node_modules`. "Live code" excludes comment lines.

| Identifier | before | after (total) | **after (live code)** |
|---|---|---|---|
| `OPT_OUT_FOOTER` | 8 | 1 | **0** |
| `EMAIL_SIGNATURE` | 7 | 0 | **0** |
| `signatureText` | 2 | 0 | **0** |
| `composeEmail` | 9 | 8 | **0** |
| `composeEmailHtml` | 4 | 1 | **0** |
| `EMAIL_HTML_FONT` / `EMAIL_BODY_PT` / `EMAIL_FOOTER_PT` | 3 | 0 | **0** |
| the literal sentence `no thanks` | 1 | **0** | **0** |
| `Dominic Bonini` | 1 | **0** | **0** |
| `HatchGrab · Village Foodie` | 1 | **0** | **0** |

**Zero live references remain.** The residual textual mentions are, in full:

* **`supabase/migrations/20260909_outreach_templates.sql:21`** — a comment in an **applied** migration
  saying the footer was appended by `composeEmail`. Left deliberately: an applied migration is a record of
  what was true when it ran, and editing it would falsify that record.
* **`lib/outreach-template-render.ts:12–13, 178–186`** and one comment each in `ComposeWindow.tsx:195` and
  `TemplatesPanel.tsx:7, 202` — the explanatory notes written by this task, which name the removed symbols
  in order to say they are gone and why.

One address survives in the outreach UI and is **not** a signature: `ComposeWindow.tsx:537`, the Send
button's tooltip — *"It will send from Outlook's DEFAULT account — set that to dominic@hatchgrab.com in
Outlook if it is not already."* That is guidance about which account sends, it is still true, and it is
displayed, never inserted into a message. (The 18 other `villagefoodie.co.uk` hits in the repo are
pre-existing app config — `lib/brand.ts`, `lib/email-config.ts`, sitemap, transactional email — nothing to
do with outreach.)

---

## 3. 🔴 The other three guards — each confirmed, two of them by execution

**(a) WhatsApp gating — HOLDS.** `templatesFor` executed against the **6 live templates**:

```
whatsapp_confirmed = true   → email, whatsapp, email, whatsapp, email, email     (6 offered)
whatsapp_confirmed = false  → email, email, email, email                          (4 offered)
whatsapp_confirmed = null   → email, email, email, email                          (4 offered)
→ every template offered to an unconfirmed prospect is channel 'email': true
```

Null and false behave identically, which is correct: neither is prior opt-in.

**(b) Visible unresolved placeholders — HOLDS.** `applyPlaceholderFills` executed:

```
no fills          → 'Rate is [[my rate]] and [[unknown thing]].'
whitespace fill   → 'Rate is [[my rate]] and [[unknown thing]].'   ← a blank value does NOT consume the marker
one real fill     → 'Rate is £15/mo and [[unknown thing]].'
unresolvedIn(…)   → ["unknown thing"]
```

Nothing is blanked and nothing is guessed; the compose window's "still unfilled" banner reads
`unresolvedIn`, which still reports correctly.

**(c) The mailto length refusal — HOLDS, unchanged.** `MAILTO_URL_CEILING = 2000` at
`ComposeWindow.tsx:211`, checked at `:238` before `window.location.href` is set, with the Copy fallback
offered in the message at `:242`. **The ceiling was not raised** — the real limit is the ~2,083-character
URL the Windows shell hands a protocol handler, and 2,000 stays the safe margin below it. (Structural: the
branch was read, not executed; §4 measures the lengths it is checking.)

---

## 4. Mailto lengths, re-measured — every email template now fits

Measured with the **shipped** render pipeline (`contextFromProspect` → `renderWithFills` with each
template's own `placeholder_defaults`) and the **shipped** URL construction (CRLF conversion,
`encodeURIComponent`, subject + body), rendered against **every one of the 231 live prospects**
(`content-range 0-230/231`), using each truck's real name, website, order URL and contact name, plus its
real next future event from `discovery_events` (`0-734/735` fetched) so the `?next_event:` conditional
line is **kept** rather than dropped.

The recipient address used is a 40-character stand-in. Re-derived: the **longest real** `contact_email` in
`discovery_trucks` is 36 characters (`info@streetnoodlesanddumplings.co.uk`, of 61 addresses on file), so
the measurement is 4 characters **conservative**, not optimistic.

| Template | longest of 231 | shortest | vs the 2,000 guard |
|---|---|---|---|
| Chaser — already contacted | **679** | 516 | ✅ fits, 1,321 spare |
| **Hatches Up — Customers** | **1,662** | 1,560 | ✅ fits, **338 spare** |
| Hatches Up - map only | **1,555** | 1,453 | ✅ fits, 445 spare |
| General approach — listed on Village Foodie | **967** | 643 | ✅ fits, 1,033 spare |

**Every one of the four can use the Email button, for every one of the 231 prospects. None is refused.**

That is a change: before this removal, "Hatches Up — Customers" was over the ceiling and the Email button
refused it. Measured on the same bodies and the same worst-case prospect, with and without the appended
signature + footer:

| Template | with sig + footer (before) | without (now) | saved |
|---|---|---|---|
| Chaser | 951 | 672 | 279 |
| **Hatches Up — Customers** | **1,927** | **1,648** | 279 |
| Hatches Up - map only | 1,820 | 1,541 | 279 |
| General approach | 1,246 | 967 | 279 |

⚠️ An earlier report quoted 2,082 for "Hatches Up — Customers". That figure was measured on the **raw**
template body with `{{tokens}}` unexpanded; this pass renders properly against a real prospect, which is
why the before-figure here is 1,927. Both say the same thing — that template was at or over the edge, and
it no longer is.

**Placeholders, filled.** Three of the four templates render with all placeholders resolved from context;
`placeholder_defaults` is `{}` on all six templates, so `[[my rate]]` and
`[[comparison to their current setup]]` stay as markers. A marker is only ~11–37 characters, so measuring
with markers **understates** a real send. Re-measured with each placeholder filled with realistic text of
increasing length (spaces included, since a space encodes as `%20`):

| fill per placeholder | Chaser | General approach |
|---|---|---|
| unfilled (marker) | 672 | 967 |
| 15 chars | 670 | 931 |
| 30 chars | 688 | 967 |
| 60 chars | 728 | 1,047 |
| 120 chars | 808 | 1,207 |
| **breaks the guard at** | **~1,015 chars each** | **~420 chars each** |

The two Hatches Up templates contain no placeholders at all, so their numbers are fixed. In short: you
would have to type a 420-character rate description before the guard trips on the worst case.

---

## 5. Copy — kept, and now plain text only

**Decision: the HTML/plain dual-clipboard write no longer earns its place, and I removed it. The reason:**

It existed to carry two things a plain-text paste cannot: the **bold signature name** and the **10pt
opt-out line**. Neither is in the message any more. What the HTML flavour would carry now is nothing but a
hard `font-family: Calibri, 'Segoe UI', Arial; font-size: 12pt` wrapper around your body — and that is not
neutral, it is actively harmful here: **the signature Outlook appends underneath is styled by Outlook**, so
a hard-styled body would arrive in a visibly different font from the signature below it. That is the same
family of problem as the ordering one you moved the signature to fix.

Plain text lets Outlook style the whole message — body and signature — as one. It also removes the
`ClipboardItem` / secure-context fallback, which was a real failure mode: where `ClipboardItem` is absent,
a rich write fails silently and looks exactly like a successful copy until you paste.

Copy still works, copies the body alone, and its tooltip now says so: *"Copies the message body. Your
Outlook signature supplies the sign-off, your details and the opt-out line."* The button label is `Copy`
again (it was `Copy formatted`, and before that `Copy + footer` — both now describe things it does not do).

---

## 6. What is proven how

**Compiler-confirmed** — `npx tsc --noEmit` → **0 errors** after the removal. This is what proves the
census is complete for the code paths: every deleted export was imported somewhere, and TypeScript failed
loudly on each until the call site was fixed (it caught all three `TemplatesPanel` imports on the pass
where I had only fixed the compose window).

**Executed against the shipped code** — the WhatsApp gate over the 6 live templates; the unresolved-marker
behaviour; and every length in §4, via the real `renderWithFills` and the real mailto construction.

**Measured / re-derived from the live database** — 6 templates (`0-5/6`), 231 prospects (`0-230/231`), 735
future `discovery_events` (`0-734/735`), 61 real contact addresses with a 36-character maximum; all counts
asserted against `content-range`.

**Structural (read, not executed)** — the census greps and their zero result; the mailto ceiling branch at
`ComposeWindow.tsx:211/238/242`; that `outreach_contacts.message` now receives the body alone because
`fullText` is now `finalBody` (`ComposeWindow.tsx:195`).

**Reasoned only** — that a hard-styled HTML body would clash with an Outlook-styled signature (§5); that
deleting `composeEmail` beats stubbing it; and every consequence listed in §1, which follows from the code
being absent rather than from an observation of your Outlook.

**Not run** — `npm run build`. `npx eslint` reports the same counts as before this task
(`lib/outreach-template-render.ts` 1, `ComposeWindow.tsx` 2, `TemplatesPanel.tsx` 3), all pre-existing
`no-explicit-any` / `set-state-in-effect` / `Function`-type patterns; none on a line this task wrote.
