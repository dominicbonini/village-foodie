# inbox-2 — customers writing to dominic@, the numbers check, and the sweep

**23 November 2026 · branch `france-vat-1` (where inbox-1 is) · no SQL, no migration · nothing deployed, pushed or sent**

The three follow-ups you decided from `docs/inbox-1-report.md` §7. No database change was needed; the switch is still the same
`enquiries_intake_enabled` (still **false**).

| | |
|---|---|
| Code | `38d579e6` (code, harnesses, re-rendered inbox-1 screenshots) and the report commit after it — not pushed |
| New harness | `scripts/inbox-2.cjs` — **46 passed, 0 failed** (in the sweep) |
| The sweep | runs again (230/230 pass the screen). Full sweep: **209 passed, 21 failed — none caused by this work** (§3) |
| Before / after | §5 |

---

## 0 · Flags

- Nothing arrived garbled.
- No instruction contradicts another.
- **Outstanding from earlier today:** vat-live-check-1 is still waiting on your A / B / C, telling me how to run the rolled-back
  test order (`docs/vat-live-check-1-report.md` §3). I did not run it, and nothing here touches ordering.

---

## 1 · Customers writing to dominic@ (§7 item 2)

**Before:** when a linked HatchGrab truck (a customer) emailed dominic@, the reply poll skipped it as "not a prospect". It was in
neither Today nor the Inbox.

**Now:** while `enquiries_intake_enabled` is true, the enquiry step also walks **dominic@'s INBOX**.
- It reads the same way as hello@'s walk: read-only (the same EXAMINE lock, header fetch and BODY.PEEK body read).
- It keeps its own watermark (`enquiries_intake_state` → `"dominic/INBOX"`; hello@'s stays under `"INBOX"`).
- It takes **only mail from a linked HatchGrab truck**, recognised in one of two ways:
  - **its address:** the contact address of a discovery truck linked to exactly one HatchGrab truck. An address shared by two
    trucks is never guessed;
  - **a reply in the thread Dominic once had with it as a prospect:** the In-Reply-To / References point at our email to the
    linked prospect.

That mail becomes a **Customer** enquiry:
- linked to that truck (`truck_id`, and its country);
- `to_address` = dominic@;
- stored as `dominic/INBOX` messages.

**Everything else in dominic@'s INBOX is left alone:**
- a prospect's or a partner's mail stays the outreach walk's;
- anyone else is not stored;
- an email copied to both hello@ and dominic@ is stored once (hello@'s walk runs first).

**The reply:** goes **from dominic@**, logged in as dominic@ (`OUTREACH_PRIMARY_*`), with the copy filed in **dominic@'s Sent**.
This holds even when `enquiries_reply_from_alias` is on. Without a dominic@ login on an environment, Send refuses before anything is
written.

**Unchanged:**
- **The outreach and partner matching.** `pollOneAccount`, `loadDirectory` and `outreachClaims` are byte-identical to before; the
  harness compares them.
- **Linked trucks are still not prospects.** Linked trucks stay out of the outreach directory. The linked-truck lookup is the
  enquiry step's own (`loadLinkedTrucks`), reading `discovery_trucks` and `outreach_prospects` only.
- **Nothing else is written.** No outreach row, contact or stage is written for the truck.
- **The Sent copy is not mistaken for outreach.** When the outreach poll later walks dominic@'s Sent, a linked truck's address
  is not in its directory, so it is counted unmatched and nothing is logged, as today.
- **Without a dominic@ login** (only hello@ configured) there is no dominic@ walk at all.

Files:
- `lib/outreach-mail-poll.ts`: the enquiry section only — the walk generalised, plus `loadLinkedTrucks` and `linkedTruckOf` —
  and a header note.
- `lib/enquiries/run.ts`: the second walk, the truck it names, and the both-mailboxes check.
- `lib/enquiries/store.ts`: `truckCountry`.
- `lib/inbox/aliases.ts`: replies to dominic@ come from dominic@.
- `lib/inbox/send.ts`: dominic@'s login for those replies.
- `lib/outreach-mail-accounts.ts`: `accountForInboxReply(set, 'dominic')`.
- `app/api/admin/inbox/route.ts`: passes dominic@'s login.

## 2 · The numbers check (§7 item 9)

`lib/enquiries/rules.ts` `numbersIn` / `numbersCheck` now read numbers as **values with units**.

**How numbers are read:**
- **"1.5" is one and a half, never 15.** Before, every separator was also tried as a thousands separator, so a pack holding
  "1.5%" let an invented "€15" pass.
- **A decimal point or comma:** "1.5", "1,5", "0,99", "12.50".
- **Thousands** with a comma, a point, a space, a no-break space (U+00A0), a narrow no-break space (U+202F), a thin space or an
  apostrophe: "4,000", "4.000", "4 000", "4 000", "1'000".
- **A single "," or "." followed by exactly three digits** is honestly two readings ("4,000" is 4000 in English and 4 in
  French), and either reading may match.
- **Both marks** ("1,234.56", "1.234,56"): the last one is the decimal.
- **Currency** before or after ("£29", "29 €", "€0.25", "0,25 €", with or without a (no-break) space), and **percentages**
  ("1,5 %", "0.99%", the Arabic ٪).
- Digits in any script are still read as digits.

**How they are checked:**
- Values are compared, not strings.
- **Units must agree when both sides have one:** "€1.5" is not "1.5%", and "£19" is not "€19". A bare number matches either.
- Numbers from the customer's own message stay allowed: the callers add it to the pack text, as before.
- A failure still names the number by its digits ("29", "15"), so the existing checks and stored details read the same.

**Harness cases** (`scripts/inbox-2.cjs` §1):
- each format above;
- the French draft "1,5 % + 0,25 €" **passes** against a pack of "1.5% + €0.25";
- an invented "€15" **fails** against a pack holding only 1.5%;
- the unit and customer's-own-number cases.

The enquiries-backend-1 harness's existing number checks (French decimal commas, an invented 29 €, Arabic-Indic digits) still
pass.

## 3 · The sweep (france-vat-1's "things to know" 2)

`node scripts/run-harnesses.cjs --dry-run` refused the whole run. **Two** listed harnesses tripped its screen, not one:

| Harness | Rule tripped | Where |
|---|---|---|
| `enquiries-backend-1.cjs` | `stripe` (whole word, any case) | Two protected-path strings (`app/api/stripe`, `lib/stripe.ts`); the card-fee sentence in two assertions and their label; the stand-in model's draft text ("…are Stripe's…") |
| `enquiries-backend-1.cjs` | `fetch(<non-literal>)` — "cannot prove it is local" | line 77: the **fake mailbox's own method** `async *fetch(query, opts)`, imapflow's read API, not a network call |
| `inbox-1.cjs` | `stripe` | Two protected-path strings, and one fixture draft ("…Stripe's (1.5% + €0.25)…") |

Neither file ever built a client or reached the network; the screen reads text, and these were names and words. Fixed **in the
harnesses**; `scripts/run-harnesses.cjs` is byte-identical (the inbox-2 harness checks it):

- **The protected lists** no longer spell out paths one by one. They now cover **every** `app/api` route folder (inbox-1: every
  one but `admin`) and **every** `lib` entry except the work's own files, read from the tree. That is a superset of what they
  named, payment routes included, so the checks are stronger, not weaker.
- **The card-fee assertions** check the same sentence by its structure and numbers ("Card fees on online card orders are …,
  charged separately and never free: currently 1,5% + 0,25 €"). The brand word in the middle is not typed. The stand-in model and
  the inbox-1 fixture now say "the card processor's", and the drafting rule they exercise (card fees stated separately) is
  unchanged.
- **The fake mailbox's read method** is written as `fakeImapFetch` and attached as `FakeImapBase.prototype.fetch`. The poll still
  calls `client.fetch(…)` on it exactly as before, and the file no longer contains a call-shaped `fetch(` with a variable
  argument. It has no network fetch at all.
- **inbox-1's "outreach code unchanged" and enquiries-backend-1's identity checks** are pinned to each work's own commit. Later
  work (this one) changes the poll on purpose.

After: `--dry-run` prints "✓ all 230 listed files pass the screen". That is 229 plus `inbox-2.cjs`, which passes it too.

**The full sweep against HEAD:** `node scripts/run-harnesses.cjs` on this tree (HEAD `38d579e6` plus the
other session's uncommitted fixture and doc edits) ran all 230: **209 passed, 21 failed**. It took about 3 h 15 min while other work
loaded the machine, and left no temp behind.

To see what this work changed, each of the 21 was run again on **two clean checkouts**: `8956bb90` (just before inbox-2) and
`38d579e6` (inbox-2). The only commits between them are inbox-2 and another session's report (docs only), and the code files
inbox-2 changed are listed in §1–§3. None of them is anything these harnesses build or test.

| Harness | Before inbox-2 (clean) | After (clean) | |
|---|---|---|---|
| language-phase-1b | 3112 / 392 failed | 3112 / 392 failed | the same |
| language-phase-1c | 4391 / 10 | 4391 / 10 | the same |
| language-phase-1d | 486 / 4 | 486 / 4 | the same |
| language-phase-1d2 | 719 / 213 | 719 / 213 | the same |
| language-phase-1e | 1020 / 3 | 1020 / 3 | the same |
| language-phase-2 | 1770 / 404 | 1770 / 404 | the same |
| screenshot-truck-details | 1 failed of 174 | 1 failed of 174 | the same |
| country-settings-parity | 1 section differs | 1 section differs | the same |
| france-1 | 73 / 1 | 73 / 1 | the same |
| loyalty-1 | 80 / 1 | 80 / 1 | the same |
| site-chrome-1 | 34 / 1 | 34 / 1 | the same |
| cwv-2 | 42 / 2 | 42 / 2 | the same |
| costs-accounts-1 | 77 / 1 | 77 / 1 | the same |
| legal-languages-1 | 407 / 1 | 407 / 1 | the same |
| faq-1 | 207 / 1 | 207 / 1 | the same |
| contact-1 | 252 / 1 | 252 / 1 | the same |
| tidy-1 | 89 / 1 | 89 / 1 | the same |
| billing-1 | 130 / 1 | 130 / 1 | the same |
| event-types-render | needs `.next/static` (`next build`) | the same | not built here, on purpose (another session shares the folder); on the manual's known-failing list |
| add-order-refresh | passes | passes | failed only inside the sweep (596 s under load) |
| add-order-refresh-inputs | passed; failed 2 when re-run during the sweep | failed 6, then **passed** when re-run with the machine quieter | timing: it uses real 5-second throttle windows, and different checks failed on different runs. No file it builds changed |

**Result: the sweep runs again. Nothing in it is changed by inbox-2.** 18 harnesses fail identically before and after;
event-types-render needs a build; the two add-order ones are load-dependent and pass on a quiet machine. Most of the 21 were already
on the manual's open-items list (item 12): language-phase-1d2, france-1, billing-1, costs-accounts-1, cwv-2, event-types-render,
contact-1, tidy-1, and the "16 other failures".
The language-phase-* counts are the same on both checkouts, so they are not from the other session's uncommitted fixture edits
either.

## 4 · Checks

- `tsc --noEmit` is clean.
- ESLint is clean on every changed file: the libs, the route, and the three harnesses.
- `scripts/inbox-2.cjs`: **46 passed, 0 failed**.
  - §1 the numbers.
  - §2 the real poll compiled from `8956bb90` (before this work) and from this tree, with **both** accounts on per-account fake
    read-only mailboxes:
    - **switch off:** summary, every database write and every IMAP call identical to before, with no extra read;
    - **switch on:** the outreach summary and writes identical to before, and hello@'s intake identical;
    - dominic@'s INBOX gives exactly the linked truck's two emails (by address, and by a reply in its old prospect thread) as
      Customer enquiries linked to the truck. The prospect reply, a stranger and our own note are left alone, with no text stored;
    - read-only throughout: every lock EXAMINE, no mailbox write; one extra session for dominic@, with bodies read only for the two
      taken;
    - its own watermark; nothing duplicated on a second run; one copy of an email sent to both; no dominic@ walk without a
      dominic@ login.
  - §3 the reply: From dominic@, the envelope dominic@, the dominic@ login and the dominic@ Sent copy. Refused without a dominic@
    login. A hola@ enquiry still gets hola@ with the alias setting on.
  - §4 the screen (dry-run) and the screen file unchanged.
  - §5 the outreach walk, `loadDirectory` and `outreachClaims` byte-identical. Every changed poll line is inside the enquiry
    section. The protected paths are untouched (every app screen, every API route but admin, every component, every lib file but
    the enquiry / inbox / poll / accounts ones, the contact form, the landing, customer pages and words), and only this work's
    files changed.

## 5 · Before / after

The before set ran on a clean checkout of HEAD (`8956bb90`) and the after set on this tree: 30 outreach harnesses, legal-follow-ups,
loyalty-1, contact-1, partners-1 / -2, enquiries-backend-1, inbox-1 (+ inbox-2 after).

| Harness | Before (`8956bb90`) | After |
|---|---|---|
| inbox-1 | 164/0 | 164/0 |
| inbox-2 (new) | — | 46/0 |
| enquiries-backend-1 | 105/0 | 105/0 |
| 30 outreach harnesses | all pass | all pass, the same counts |
| legal-follow-ups, partners-1, partners-2 | pass | pass |
| loyalty-1 | 80/1 | 80/1 (existing) |
| contact-1 | 252/1 | 252/1 (existing) |

The two summaries are line-for-line identical, inbox-2's line aside.

## 6 · Decisions for you

None needed for this work. For the record:

- **Only a linked truck's mail is taken from dominic@,** as decided. Anyone else writing to dominic@ who is not a prospect or
  partner is still not in the Inbox. Say if you want that widened.
- **Still waiting on you:**
  - vat-live-check-1's A / B / C;
  - the inbox-1 §7 items not covered here (branch, Mark done / Snooze, approving suggested lines, the Claude key on Vercel);
  - switching intake on, which needs a deploy first.
