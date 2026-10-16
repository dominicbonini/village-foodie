# Reference manual V15.9 — the outreach changes of 15 October 2026

**Date:** 15 October 2026.

**File:** `docs/reference-manual.md`, V15.8 → **V15.9**. Not committed.

**SQL:** none.

**Sources:**
- `docs/outreach-screenshot-match-report.md`
- `docs/template-formatting-report.md`
- `docs/template-values-box-report.md`
- `docs/outreach-instant-send-report.md`

I also checked the code and ran four read-only database checks, listed below.

---

## What changed in the manual

**Version.** The header (line 1) and the front matter (line 9) both read V15.9, as the standing rule requires; checked with grep. §49's title reads "current at V15.9".

**Changelog V15.9.** Six bullets and a where-to table.

**NEW §78 — Outreach: instant Send, refusals, template formatting and the screenshot match:**
- **78.1** A phone number alone never decides which prospect a screenshot fills. Covers the incident, the rule, old → new confirmation, where the code lives, and the data fix (observed as run).
- **78.2** Formatting in email templates: the markers, why tags rather than markdown, "marks never cross a line", the live preview, and the `<div>`-not-`<label>` rule.
- **78.3** `{{plans_pdf}}`: a send-time token, the line dropped from the email, compose attaching the PDF once, the refusal when typed mid-sentence.
- **78.4** The values box below the message. 11229e3's overlap, a second time, and the rule: *a block that grows with its content must not shrink*.
- **78.5** Instant Send with Undo: the five-second hold, the key per press, a closed tab sends nothing, the answer on SMTP accept, the Sent copy and contact log after it, the measured timings, and one consequence worth knowing.
- **78.6** A refused send is recorded and flagged: status `refused`, never `failed` (Retry skips the guards). Refused rows are excluded from every guard input. Today, the history, "Send anyway" / Dismiss, the toast.
- **78.7** The re-pinned harnesses, each restated.
- **78.8** Open items.

**§49 deploy posture** — a new, dated V15.9 block above the V15.8 one:
- `origin/main` = `accbb61`, and a push to `main` deploys (§63.1). The Vercel build result was **not** checked.
- The migration is applied (observed).
- The V15.8 post-deploy steps are **not verified**. They are stated as unknown, not as done.

**Pointers in the older sections**, each marked SUPERSEDED or STALE with the date, never silently rewritten:
- §58.1: the `plans_pdf` token and template formatting.
- §60.3:
  - the key is now per press;
  - statuses gain `refused`;
  - the Sent copy runs after the answer.
- §60.4: a template can attach the plans PDF.
- §61.1: Today's "Emails needing a look" lists `refused` sends.
- §62.4: a blocked send is now recorded.
- §62.7: the Templates view's rich editor and live preview.

**Two statements in the manual were already false before today, and are corrected:**
- **§62.4** said "Send anyway" writes a `Sent anyway:` note before sending. **Since 1 October** the waved guards are stored on the sent message's `guard_override`. The route's own comments, and `lib/outreach-events.ts`, record the change.
- **§60.3** described the editor's schema as bold/small and `https`-only links. **Since 1 October** it also carries italic, large and lists, and links may be http, https or mailto (`ALLOWED_MARKS`, `ALLOWED_NODES`, `LINK_RE` in `lib/outreach-doc.ts`).

**Standing rules — the secrets rule gains a second precedent (15 October).** A "names only" check over `.env.local` printed a continuation line of a multi-line value: the Firebase `client_email`. No key was printed, but it is the same class, from the same reasoning. The rule now says how to check one name safely.

---

## Facts checked for this update (read-only)

| Fact | How | Result |
|---|---|---|
| What is pushed | `git status -sb`, `git log origin/main -1` | local `main` = `origin/main` = `accbb61` |
| The refused migration | `select refusal from outreach_messages limit 1` | the column exists → **applied** |
| Refused rows | `select status … where status = 'refused'` | one row |
| The Tacoman / Smash and Grab data fix | read both trucks and Tacoman's history | Tacoman's Instagram empty, correction note present, Smash and Grab filled → **run** |

The two harnesses that read the manual were run, and neither is affected: `compare-no-system` passes 54/54; `check-plain-english` checks operator copy and reports its one long-standing violation.

---

## Not in this update, and recorded as open (§78.8, §49)

1. **Language Phases 1a/1b have no manual entry**; §77 still describes Phase 0. They were not part of "the outreach changes".
2. **`outreach-schema-census`** sets the `refusal` column aside as "proposed". Now that the migration is applied, it should move into the harness's live column list. This is a one-line harness edit, not made here.
3. **A shared email** can mislead the screenshot match the way the shared phone did.
4. **The full localhost timing table** needs `OUTREACH_PRIMARY_USER` and `OUTREACH_TEST_RECIPIENT` in `.env.local`.
5. **One unexplained browser-harness failure:** `outreach-editor-toolbar` with `HG_RENDER=1` failed a check once and then passed twice.
6. **The Zaket Potato venue investigation** (`docs/zaket-potato-venues-report.md`) belongs to the scraper manual, not this one, and is not applied.
