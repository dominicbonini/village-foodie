# The outreach name split and four new template tokens — Phases 2 and 3

**14 September 2026.** Five files changed: `lib/outreach-template-render.ts`,
`app/api/admin/outreach/route.ts`, `components/admin/OutreachPanel.tsx`,
`components/admin/ComposeWindow.tsx`, `components/admin/TemplatesPanel.tsx`. No migration was written
(the columns already exist), no template row was touched, nothing was staged or committed.

⚠️ **I CANNOT SEE A SCREEN.** Every layout figure is derived from the class chain or from a real Tailwind
compile. Nothing was observed rendering.

---

# 🔴 PREMISE CORRECTIONS — FOUR, AND THE FIRST TWO CHANGE WHAT THE CODE DOES

**1 · Dominic did NOT commit the four prior workstreams.** The brief says *"Dominic was committing the
four prior workstreams; report what is committed and what is still modified."* **Nothing was committed.**
`HEAD` is still `3a95e9f demo`, exactly as it was at the start of the previous task, and all six files
are still in the working tree. `OutreachPanel.tsx` is therefore **still modified by the mobile work** —
the brief's contingency fired, so §Attribution lists precisely what was already in its diff, and
§V6 proves none of it was lost.

**2 · 🔴 `{{contact_name_prefixed}}` does NOT currently render "Hi George,". It renders "Hi George
Greaves,".** The brief asks me to prove it *still* does the former; that word is wrong, and the
difference is the point of the change. Today the token expands to the whole of `contact_name`, so the one
prospect with a surname is greeted with both names. After this change it expands to the **first name**,
which is what the brief plainly wants and what a greeting should be. 🧪 Proved both ways in §V1, with a
HEAD-vs-now diff in §V6. **This is a deliberate change of rendering in 5 active templates, not a
preservation** — it is the only such change in the task, and I would rather name it than let it pass as
"unchanged".

**3 · Phase 1 had SEVEN malformed cases, not eight.** The brief says *"the Phase 1 malformed-token guard
still refuses all 8 of its cases"*. `docs/outreach-token-guard-report.md` lists **7** malformed inputs and
**3** valid controls. My first run of this task's harness used eight near-equivalents rather than the
report's literal list; that was re-run against the exact table. §V5.

**4 · "Desktop modal unchanged" (verification 6) cannot be literally true, because the brief also
requires a new field.** *"The modal form gets two fields where there was one"* and *"Desktop modal
unchanged"* are in tension. I read verification 6 as **no regression** — rounds 1–3 intact, no layout
defect introduced — rather than a byte-identical desktop, because the first instruction is explicit and
the second sits in a sentence about preserving the mobile work. §V6 states the desktop delta in px so
you can judge that reading yourself. I did not treat this as a stop-and-ask: one reading makes the task
impossible and the other is the obvious intent.

**One more divergence, flagged rather than silently resolved** — the demo liveness predicate. §V3.

Everything else in the brief checked out, including all six VERIFIED-BY-DOMINIC facts as far as the code
can see them.

---

### The two git commands, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   components/admin/ComposeWindow.tsx
	modified:   components/admin/OutreachPanel.tsx
	modified:   components/admin/TemplatesPanel.tsx
	modified:   docs/onboarding-flow.md
	modified:   docs/reference-manual.md
	modified:   lib/outreach-template-render.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-modal-mobile-2-report.md
	docs/outreach-modal-mobile-3-report.md
	docs/outreach-modal-mobile-report.md
	docs/outreach-token-guard-report.md
	docs/outreach-tokens-report.md

no changes added to commit (use "git add" and/or "git commit -a")
════
3a95e9f demo
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
9e83a5e migration changes
```

## Attribution — what was already in `OutreachPanel.tsx` before I touched it

🔴 **The file was MODIFIED by mobile rounds 1, 2 and 3 when this task started.** The brief says to
continue anyway and to list what was there. Captured before the first edit, as a class inventory of the
diff's **added** lines:

**44 `max-sm:` tokens added, 0 removed.** `max-sm:flex-wrap` ×5, `max-sm:min-w-0` ×4, `max-sm:gap-y-1`
×4, `max-sm:text-base` ×3, `max-sm:py-2` ×3, `max-sm:w-full` ×2, `max-sm:shrink-0` ×2, `max-sm:py-1.5`
×2, `max-sm:px-4` ×2, `max-sm:hidden` ×2, `max-sm:flex` ×2, and one each of `max-sm:w-auto`,
`max-sm:pr-0`, `max-sm:p-4`, `max-sm:p-2`, `max-sm:overflow-y-auto`, `max-sm:overflow-x-auto`,
`max-sm:order-first`, `max-sm:ml-0`, `max-sm:max-h-[calc(100dvh-1rem)]`, `max-sm:grid-cols-2`,
`max-sm:gap-y-2`, `max-sm:gap-x-4`, `max-sm:flex-col`. Plus `ProspectMetaFacts` (×3: one definition,
two call sites), the `contents max-sm:hidden` desktop wrapper and the `sm:hidden` phone copy.

**The other three workstreams, attributed by reading each file's own diff:** token guard →
`lib/outreach-template-render.ts`, `ComposeWindow.tsx`, `TemplatesPanel.tsx`; V13.1 manual →
`docs/reference-manual.md`, `docs/onboarding-flow.md`.

🔴 **THIS TASK BREAKS THE ONE-FILE-ONE-WORKSTREAM PROPERTY THAT HELD LAST ROUND.** The name split
necessarily touches the renderer, the route, the modal and both consumer components, so
`OutreachPanel.tsx` now carries mobile work **and** the split, and the three token-guard files now carry
the guard **and** the tokens. They can no longer be committed separately. That is inherent to the
change, not an accident — but it is worth knowing before you write the commit message.

## Admin-only — confirmed by symbol

`OutreachPanel` is imported by `app/admin/page.tsx` alone (`app/admin/outreach/page.tsx` is a server
`redirect`). `TemplatesPanel` and `ComposeWindow` are imported only from that tree. Both routes
(`/api/admin/outreach`, `/api/admin/outreach-templates`) are behind `verifyAdmin`.
`lib/outreach-template-render.ts` has **no importer outside those three components**, imports no client,
no fetch and no route, and the new `HATCHGRAB_BASE` reads one `NEXT_PUBLIC_` value. *Positive control on
the same file set:* `discovery_truck_id` resolves in **24** files, so the search finds what is there.
**Nothing here reaches an operator or customer surface.**

---

# PHASE 2 — THE NAME SPLIT

## The reader/writer list, RE-DERIVED (not transcribed from Phase 0)

🧪 `grep -rn 'contact_name'` across `lib app components scripts supabase`, minus `contact_name_prefixed`,
`contact_first_name` and `contact_last_name`. *Positive control over that same set:* `discovery_truck_id`
→ 24 files; `contact_first_name` → **4** files.

| # | file | role BEFORE | now |
|---|---|---|---|
| 1 | `lib/outreach-template-render.ts` | READER — `ProspectLike.contact_name`, `contextFromProspect`, `resolvedValue` ×2, `conditionMet` ×1 | reads `contact_first_name` / `contact_last_name`; `contactName` is **joined** from the two |
| 2 | `app/api/admin/outreach/route.ts` | READER **+ WRITER** — probe, select, row map, PATCH | probe + select + row map **kept** (readable for one release); 🔴 **the PATCH writer is DELETED** |
| 3 | `components/admin/TemplatesPanel.tsx` | READER — local `Prospect` type, preview context | `contact_name` **removed** from its type; two new fields + `demo` |
| 4 | `components/admin/OutreachPanel.tsx` | READER **+ WRITER** — type, state, re-seed, `onBlur` patch | two states, two re-seeds, two `onBlur` patches; type keeps `contact_name` as unread legacy |

**Phase 0's list was four files and it is still four files** — the modal has changed three times since,
but not in a way that moved the name.

**After the change, every surviving `contact_name` is one of:** a comment, the **token name**
`{{contact_name}}` (which now reads the joined value), the `?contact_name:` condition name, the route's
deliberate legacy select, a `@deprecated` type field, or a historical migration.
🧪 **Writers of `contact_name`: ZERO.** The search for `contact_name` intersected with
`patch.|update|insert|upsert` returns nothing.

🔴 **The writer was DELETED, not guarded.** Leaving `if ('contact_name' in body)` in the PATCH would keep
a live write path for a column the UI has stopped maintaining, so the joined name and the stored one
would diverge the first time anything posted the old key.

## `{{contact_name_prefixed}}` — the one most likely to break silently

**It now reads `ctx.contactFirstName`**, which `contextFromProspect` derives from
`outreach_prospects.contact_first_name`. Not `contact_name`. Not the joined value.

The **token name is deliberately unchanged**: it appears in **5 active templates** and renaming it would
turn every one of those greetings into a bare "Hi," with nothing on screen to say so — the exact silent
failure the brief warns about. The naming wart (a token called `contact_name_prefixed` that renders the
first name) is in the backlog.

**And the pattern is followed, not reinvented.** The separator lives *inside* the token — the value
carries its own leading space and expands to nothing when absent — so `Hi{{contact_name_prefixed}},`
degrades to `Hi,` with no space before the comma. Phase 3 adds **no second mechanism** for this: see
§"Is a `{{first_name_prefixed}}` the right shape?".

## The two form fields — which container, and the arithmetic

**Container: the SAME `grid grid-cols-2 gap-2` that held Contact name + Phone**, now with **three** cells
— First name | Last name on row one, Phone wrapping to row two.

🔴 **The obvious move, `grid-cols-3`, reproduces the round-two defect on the DESKTOP.** Derived, not
guessed: the panel is `max-w-6xl` (1152px), the body has `p-5` and `gap-5`, so the 45fr column is
`(1152 − 40 − 20) × 0.45 = 491px`, less `pr-1` = **487px**.

| layout | track width | phone cell needs | verdict |
|---|---|---|---|
| `grid-cols-3` | `(487 − 16)/3` = **157px** | input (~177px intrinsic) + 8px gap + ~42px "WA" tick ≈ **227px** | 🔴 **overflows by ~70px** |
| `grid-cols-2`, 3 cells | `(487 − 8)/2` = **239px** | same ~227px | ✅ fits — and it is the width Phone has **today**, unchanged |

The mechanism is round two's exactly: `grid-cols-N` emits `repeat(N, minmax(0, 1fr))` so the *track* min
is 0, but a grid **item**'s `min-width` computes to `auto` = min-content, and an `<input>`'s min-content
is roughly its default `size=20` box (~177px). The item refuses to shrink and overlaps its neighbour.

**Is `max-sm:min-w-0` needed? YES, and it was already needed before this task.** Below `sm` the body is a
flex **column**, so this column is the full panel width: at 390px that is `390 − 16 (overlay p-2) − 32
(panel max-sm:p-4)` = **342px**, giving tracks of `(342 − 8)/2` = **167px** — *below* the ~177px
intrinsic width. 🔴 **So there is a latent ~10px overflow in this row at 390px in the code as it stands
today**: round two fixed the LOG A CONTACT row and did not touch this one. All three cells now carry
`max-sm:min-w-0`, which is round two's remedy applied to a row round two missed.

⚠️ **167px per name field is tight.** At 16px text that is roughly 12 characters visible. It is usable and
it keeps the vertical compactness rounds 1–3 fought for, so I did not add `max-sm:grid-cols-1` — but that
is a one-class change if you find it cramped. **Checklist P3.**

🔴 **`contact_name` STAYS.** The column is not dropped, the route still selects it and still returns it,
`Prospect.contact_name` and `ProspectLike.contact_name` both remain in the types marked deprecated — so a
missed reader would be a **type error**, not a silent `undefined`. Dropping it is in the backlog.

---

# PHASE 3 — THE FOUR TOKENS

Added as `case` labels in `resolvedValue`, so 🔴 **the Templates-tab reference picks them up
automatically** — `resolvedTokenReference()` reads the case labels out of the function's own source.
**Nothing was built to surface them**; the only hand-written part is the description, and an undescribed
token still appears, marked undocumented. 🧪 The vocabulary is now **12 tokens** (was 8) and all four new
ones are documented — §V5.

| token | source | behaviour with data | behaviour without |
|---|---|---|---|
| `{{first_name}}` | `contact_first_name` | `George` | `[[first_name]]` — visible, counted, warned |
| `{{last_name}}` | `contact_last_name` | `Greaves` | `[[last_name]]` |
| `{{demo_link}}` | `demoLinkFor(p.demo)` | `https://www.hatchgrab.com/demo/<ref>` | 🔴 **REFUSES TO SEND** |
| `{{compare_link}}` | `HATCHGRAB_BASE + '/compare'` | always resolves | n/a |

## Fallbacks — the 228-row path is the DEFAULT rendering, and it is handled

🔴 **The greeting is carried by `{{contact_name_prefixed}}`, which is the one token designed to vanish
cleanly.** 🧪 Rendered both ways, verbatim from the harness:

```
Hi{{contact_name_prefixed}},   name present → "Hi George,"      absent → "Hi,"
Hi{{contact_name_prefixed}}.   name present → "Hi George."      absent → "Hi."
Hi {{first_name}},             name absent  → "Hi [[first_name]],"
Hi {{first_name|there}},       name absent  → "Hi there,"
```

**Never `Hi ,` and never `Hi .`** — asserted with a regex over the rendered text, not by eye.

A **bare** `{{first_name}}` deliberately leaves a visible `[[first_name]]` rather than a blank, because
a blank in mid-sentence is the failure the whole tier exists to prevent. A template that wants a word
writes `{{first_name|there}}`; a template that wants silence writes `{{contact_name_prefixed}}`.

### Is a `{{first_name_prefixed}}` the right shape here? — **No.**

Phase 0 recommended one. **That recommendation is now redundant**, because
`{{contact_name_prefixed}}` *is* the first-name-prefixed token after premise 2. Adding a second name for
one behaviour would mean two tokens that must be kept in step, in a vocabulary derived from `case`
labels where nothing would flag them drifting apart — and it would leave the 5 active templates pointing
at the "old" one. One mechanism, one name.

## `{{demo_link}}` — the refusal

🔴 **I REUSED THE PHASE 1 REFUSAL MECHANISM AND ADDED A SECOND SIGNAL. Those are different things and
the brief asks me to say which.**

- **Reused: the refusal CHANNEL.** The same `sendError` state, the same three guarded exits
  (`doCopy`, `sendNow`, `logNow`), the same always-visible red line above the buttons. One new local,
  `refusal = malformedNotice ?? blockingNotice`, and the three exits now test that instead — so the two
  stops cannot diverge in how they behave.
- **New: the SIGNAL.** `malformedTokensIn` answers *"is this span shaped like a token?"*, keyed off the
  **delimiters** precisely so it could not inherit the resolver's blind spot. `{{demo_link}}` is
  perfectly well shaped — it is the **data** that is missing. Folding a data question into a syntax
  check would give the operator one message for two unrelated problems and would make the delimiter
  guard's one clear job muddier. So `blocking` is its own field on `RenderedTemplate` /
  `ComposedMessage`, alongside `malformed`.

**Three separate things stop a bad link from going out, and each closes a different hole:**

1. `MUST_RESOLVE = new Set(['demo_link'])`, and `substitute` **ignores any declared fallback** for a
   member. 🧪 `{{demo_link|https://hatchgrab.com}}` renders `[[demo_link]]` and still blocks — a template
   author cannot opt out.
2. `defaultFillsOf` **drops a must-resolve key**. `placeholder_defaults` is editable data; a stored
   `demo_link` default would otherwise fill the marker on load and lift the stop before anyone saw it.
   🧪 Verified, with a control proving the filter is not simply returning `{}`.
3. ComposeWindow's `tokens` list **offers no input field** for a must-resolve name — because a box
   invites a hand-typed bare domain, which is one of the three renderings this exists to prevent.

**It is a `Set`, not an `if (token === 'demo_link')`**, so the next such token is one line and inherits
all three enforcements rather than one of them.

**The message names the prospect**, as the brief requires:
> *"Between Buns Royston has no live demo link, so this template cannot be sent to them. Close this
> window and use "Create demo" on the prospect, then compose again — or pick a template that does not
> use {{demo_link}}."*

## `{{compare_link}}` — the host, and why

`HATCHGRAB_BASE = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? 'https://www.hatchgrab.com'`.

**Where the host comes from and why that is correct for an email:** `/compare` calls `notFound()` unless
`onHatchGrab()` — it 404s on the Village Foodie domain. So an **origin-derived** URL would produce a dead
link for anyone using this console on the other brand. And an email has **no origin at all** at the
moment it is clicked, so the link must be absolute regardless. 🧪 The identical expression already builds
`HATCHGRAB_LOGO_URL` in `lib/email-config.ts` — this is the established pattern, and the literal default
is the deployed production host, so a missing env var yields a *working* link rather than
`undefined/compare`. Searched alone: **no shared host helper exists** to reuse; `NEXT_PUBLIC_HATCHGRAB_URL`
is read inline in 20+ places.

🔴 **`chase-1` ALREADY CARRIES `hatchgrab.com/compare` AS PLAIN TEXT.** This token replaces something you
type by hand. **I did not edit any template row.** §SQL query 2 shows you the rows; the decision is yours.

---

# VERIFICATION

**The instruments, and what a green-but-meaningless result would look like for each.**

| harness | null result it could produce | how that was excluded |
|---|---|---|
| renderer harness (node, over the transpiled module) | passes because every path returns empty, or because the assertions never ran | **Four deliberately broken renderers, each run through the identical harness.** All four FAIL. Plus in-test controls that assert the two branches *differ*. |
| Tailwind compile | compiles nothing and reports every class absent — which happened twice in round one | a **negative control class** compiled alongside that must be ABSENT. 🧪 30/30 under test generated, control absent. |
| font-size audit | reports "UNCOVERED: NONE" because it found no controls, or truncated them | an **extractor control** asserting known fields are inside the scanned text, a **constant control**, and a **broken variant** that must report UNCOVERED. |
| absence searches | the pattern is wrong and matches nothing anywhere | a **positive control** over the identical file set. |

## V1 · `{{contact_name_prefixed}}` reads the NEW columns 🧪

```
   George  → "Hi George,"
   no name → "Hi,"
   ✓ named prospect renders "Hi George,"
   ✓ unnamed prospect renders a bare "Hi,"

   -- NULL-RESULT CONTROL: would this pass if BOTH paths returned empty? --
   ✓ the two paths differ, so a both-empty renderer cannot pass this test

   -- POSITIVE CONTROL: point it at the now-unwritten contact_name; it MUST fail --
   contact_name only → "Hi,"
   ✓ CONTROL PASSES: with only contact_name set the greeting is bare — the column is NOT read

   George → "George Greaves"
   ✓ {{contact_name}} joins first + last
```

The third block is the control the brief asked for: a prospect carrying **only** the legacy
`contact_name` — the shape of a row this code no longer writes — renders a bare greeting. **The column
is genuinely not read.**

🔴 **And the whole harness was pointed at four deliberately broken renderers:**

```
BROKEN: contact_name_prefixed reads the OLD contactName again  → exit 1 (FAILS as required)
   ✗ FAIL named prospect renders "Hi George,"
BROKEN: MUST_RESOLVE emptied                                    → exit 1 (FAILS as required)
   ✗ FAIL a prospect with no demo BLOCKS   ✗ FAIL the fallback is ignored and it still blocks
   ✗ FAIL defaultFillsOf drops the must-resolve key  ✗ FAIL renderWithFills still blocks after fills
BROKEN: compare_link from a request origin                      → exit 1 (FAILS as required)
   ✗ FAIL absolute URL on the HatchGrab host
BROKEN: expiry check dropped from the liveness predicate        → exit 1 (FAILS as required)
   ✗ FAIL every other variant blocks
```

## V2 · Each new token, data present AND absent, subject AND body, email AND WhatsApp 🧪

24 assertions, all passing: for every (prospect × token) the **subject and body substitute identically**
and **WhatsApp renders identically to email** — which is the real claim, since `renderTemplate` calls the
same `substitute` on `tpl.subject` and on every body line, and `templatesFor` gates *which* templates are
offered by channel without changing rendering.

```
prospect     token        body
George       first_name   B:George
George       last_name    B:Greaves
George       demo_link    B:[[demo_link]]                     blocking=demo_link
George       compare_link B:https://www.hatchgrab.com/compare
no name      first_name   B:[[first_name]]
no name      last_name    B:[[last_name]]
no name      demo_link    B:[[demo_link]]                     blocking=demo_link
no name      compare_link B:https://www.hatchgrab.com/compare
Between Buns demo_link    B:https://www.hatchgrab.com/demo/between-buns-royston-8c6a
```

## V3 · `{{demo_link}}` resolves for exactly ONE prospect and refuses for the rest 🧪

🧪 **The one prospect that exercises the success path is `Between Buns Royston`
(`between-buns-royston-8c6a`, expires 2026-10-12) — your figure, not re-derived, and I do not generalise
from it.** George Greaves and Between Buns are **different rows**, so no single fixture exercises both
the name and the demo success path; the harness keeps them separate for that reason.

```
   Between Buns → "Look: https://www.hatchgrab.com/demo/between-buns-royston-8c6a"  blocking=[]
   George       → "Look: [[demo_link]]"                                             blocking=['demo_link']
```

**Each half of the liveness predicate, exercised alone:**

```
   no demo row at all             → "[[demo_link]]"                        blocking=1
   live but public_ref NULL       → "[[demo_link]]"                        blocking=1
   public_ref but expires_at NULL → "[[demo_link]]"                        blocking=1
   EXPIRED yesterday              → "[[demo_link]]"                        blocking=1
   live, ref present              → "https://www.hatchgrab.com/demo/x-3"   blocking=0
```

🔴 **`retired_at` DOES NOT APPEAR IN THE PREDICATE.** Premise: it has no writer anywhere in the repo, so
testing it would imply a retirement mechanism that does not exist.

⚠️ **A DIVERGENCE I FLAGGED — AND THE SCHEMA SETTLES IT.** The brief's predicate is
`public_ref is not null AND expires_at > now()`, and that is what I implemented. **The route's existing
filter is more permissive**: `if (expiresAt && new Date(expiresAt) <= Date.now()) continue` — a row with
`expires_at IS NULL` would be kept as live, so the modal's chip could show a link the token refuses.

🧪 **That case cannot arise.** `supabase/migrations/20260723_demo_sessions.sql` declares
`expires_at timestamptz not null` in the `create table`, and no later migration relaxes it (the four
`demo_sessions` ALTERs only `add column if not exists`). So the two predicates agree on every row and
the difference is theoretical. ⚠️ Migrations here are applied by hand, so §SQL query 1's `is_nullable`
row is still worth reading once to confirm the live database matches the file — but I am no longer
presenting this as an open question.

**Neither a declared fallback nor a stored default can lift the stop** 🧪:

```
   {{demo_link|https://hatchgrab.com}} → "[[demo_link]]"   blocking=['demo_link']
   defaultFillsOf({demo_link:…, rate:'5%'}) → {"rate":"5%"}
   ✓ defaultFillsOf drops the must-resolve key
   ✓ CONTROL: it still carries an ordinary key, so the filter is not just returning {}
   ✓ renderWithFills still blocks after fills are applied
```

## V4 · Every reader switched; `contact_name` no longer written 🧪

Search and file set in §"The reader/writer list". **Writers: ZERO.** *Positive control over the same
set:* `discovery_truck_id` → **24** files, `contact_first_name` → **4** files, so the search finds what
is there. Every surviving occurrence is a comment, a token/condition **name**, the route's deliberate
legacy select, a deprecated type field, or a historical migration — enumerated in full above.

## V5 · The Phase 1 guard still refuses its own cases; the new tokens are VALID 🧪

Against the **literal table** from `docs/outreach-token-guard-report.md` — 7 malformed rows and 3 valid
ones, because a guard that flagged everything would "pass" the 7 and fail the 3:

```
  "{{truck name}}"  → ["{{truck name}}"]      "{{ truck_name }}" → []  valid
  "{{Truck_Name}}"  → ["{{Truck_Name}}"]      "{{nope}}"         → []  valid
  "{{truck-name}}"  → ["{{truck-name}}"]      "{{truck_name}}"   → []  valid
  "{{truck2}}"      → ["{{truck2}}"]
  "{{}}"            → ["{{}}"]                ✓ all 7 still caught (7/7)
  "{{unclosed"      → ["{{"]                  ✓ CONTROL: the 3 valid cases are NOT flagged in the same run
  "{{a{{b}}}}"      → ["{{a{{b}}"]
```

**The four new tokens are recognised as valid, and their natural mistypings are still caught:**

```
  {{first_name}} {{last_name}} {{demo_link}} {{compare_link}} {{first_name|there}} {{ demo_link }}  → all valid
  {{first name}} {{demo link}} {{compare link}} {{firstName}} {{demo-link}}                         → all CAUGHT
```

That last row matters: those are exactly the mistypings Phase 0 predicted adding these four names would
invite, and the delimiter-keyed guard catches every one.

**The derived reference now carries 12 tokens, all four new ones documented:**

```
{{truck_name}} {{contact_name}} {{contact_name_prefixed}} {{first_name}} {{last_name}} {{demo_link}}
{{compare_link}} {{website}} {{order_url}} {{next_event_day}} {{next_event_date}} {{next_event_venue}}
```

## V6 · Existing templates still compose; the desktop and the mobile rounds

🔴 **I cannot read `outreach_templates` — it is data.** So "all 7 token-carrying templates still compose"
is proved the strongest way code allows: **HEAD's renderer and the new one, rendering one template that
exercises all 8 pre-existing tokens and all 5 conditions, on the same underlying prospect.** 🧪

```
   truck_name=<Greaves Kitchen>              =        COND_next_event kept       =
   contact_name=<George Greaves>             =        COND_order_url kept        =
   contact_name_prefixed=< George Greaves>   🔴 NOW: < George>
   website=<https://gk.example>              =        COND_website kept          =
   order_url=<https://gk.example/order>      =        COND_contact_name kept     =
   next_event_day=<Friday>                   =
   next_event_date=<18 September>            =        droppedConditions HEAD ["no_next_event"] = NOW
   next_event_venue=<The Green>              =        unresolved        HEAD []  = NOW
```

**Exactly one line differs across 8 tokens and 5 conditions, and it is premise 2.** *Control:* both
renderers produced real substituted text, so this is not two empty outputs agreeing.

**Mobile rounds 1–3 are intact.** The `max-sm:` inventory, diffed against the pre-task baseline:

```
< 4 max-sm:min-w-0        > 8 max-sm:min-w-0        (+3 real classes, +1 mention in a new comment)
                          > 1 max-sm:p-4)           (a mention in a new comment)
```

**Those are the only two differences and both are ADDITIONS. Nothing was removed — 0 `max-sm:` classes
deleted.** In particular `max-sm:flex-wrap` (5) and `max-sm:gap-y-1` (4) are unchanged, which is the
precise check that matters: the block I rewrote contained both on the phone/WA chip and both were
carried over. `ProspectMetaFacts` ×3, the `contents max-sm:hidden` wrapper, the `sm:hidden` phone copy,
`max-sm:grid-cols-2`, `max-sm:overflow-y-auto` and `max-sm:max-h-[calc(100dvh-1rem)]` all still present.

**🔴 THE DESKTOP DELTA, STATED IN PIXELS RATHER THAN CLAIMED TO BE ZERO** (premise 4). The left column
gains **one row**: label (`text-[10px]` ≈ 12px + `mb-0.5` 2px) + input (`text-sm`/20px line-height +
`py-1.5` 12px + 2px border = 34px) = **≈ 48px**, plus the grid's `gap-2` = **≈ 56px taller**. Below `sm`
the input is 42px (`max-sm:text-base`, `max-sm:py-2`), so **≈ 64px**. ⚠️ The label's line-height is
inherited rather than set by `text-[10px]`, so treat those as ±4px. **Nothing else on the desktop
changes**: Phone keeps its exact 239px track, the 45/55 body split is untouched, and every other class
added is `max-sm:`-prefixed.

### 🧪 THE COMPILE — 30/30 generated, negative control ABSENT

```
  contents           line  792      max-sm:hidden          line 4383
  flex               line  795      max-sm:flex            line 4378
  grid               line  798      max-sm:grid-cols-2     line 4428
  min-w-0            line 1263      max-sm:min-w-0         line 4413
  grid-cols-2        line 1433      sm:hidden              line 4574
  overflow-hidden    line 1683      max-sm:overflow-y-auto line 4463
  zzz-negative-control-class   ABSENT
  ✅ the compile really ran and really discriminates.
  @media (width < 40rem)  /  @media (width >= 40rem)   ← exact complements
```

- **The round-one override still wins:** `.flex` (795) / `.grid` (798) → `.max-sm\:flex` (4378).
- **The desktop copy really disappears below 40rem:** `.contents` (792) → `.max-sm\:hidden` (4383).
- **The phone copy really disappears above it:** `.sm\:hidden` (4574) inside `@media (width >= 40rem)`.
- **`max-sm:min-w-0` (4413) has nothing to fight:** `min-width: auto` on a grid item is the *initial
  computed value*, not a class, so the rule applies unopposed below 40rem.

⚠️ **AND A CORRECTION TO MY OWN ROUND-THREE WORK.** That round's code comment cited `.contents` at "line
163" and `.max-sm\:hidden` at "195"; the report said 165 and 192. **Both were artifacts of that run's
probe file, not facts about the build** — absolute line numbers move with whichever classes the project
happens to use, as this run's 792/4383 shows. The comment in `OutreachPanel.tsx` now cites the
**invariant** (base utilities first, `@media` variants after, equal specificity so order decides), which
is what was actually being relied on.

### 🧪 Input font sizes — 14 controls, UNCOVERED: NONE

**12 text controls all at 16px below the breakpoint; 2 checkboxes, which carry no text and cannot
trigger the zoom.** The count is 14 where round three's was 13 — the name split added one.

🔴 **How this run avoided the `>`-inside-`=>` truncation, demonstrated rather than asserted.** The
instrument prints its own self-test each run:

```
-- INSTRUMENT SELF-TEST on `<select value={x} onChange={e => go(e)}\n  className="text-base">` --
   v1 stopped at index 31 → '<select value={x} onChange={e =>'   (className NEVER SEEN)
   v2 stopped at index 63 → '<select value={x} onChange={e => go(e)}\n  className="text-base">'
   ✓ v1 truncates, v2 does not
```

v1 scanned for the `>` that ends a tag and hit the one inside the arrow function, so a `className` on the
next line was never read. v2 strips every `=>` first, strips comments first, and balances `{}` so a `>`
inside any expression cannot end the tag.

🔴 **THIS RUN FOUND TWO MORE DEFECTS IN THE INSTRUMENT, AND I AM REPORTING THEM BECAUSE BOTH PRODUCED
CLEAN-LOOKING ANSWERS.**
- **Region extraction balanced braces from `function Name(`** and returned as soon as the *destructured
  props* closed — `function Detail({ p, … })` closes a brace before the body opens. It reported **1**
  control instead of 14 and still printed "UNCOVERED: NONE". Fixed by splitting the module on column-0
  `function` keywords, and now guarded by an **extractor control** asserting known fields are inside the
  scanned text.
- **10 of the 14 controls write `className={fieldCls}`** — a shared constant, not a literal — so a
  scanner reading only literal class strings reported all ten as unclassed. Fixed by inlining every
  `const …Cls = '…'` before scanning, guarded by a **constant control**.

**Negative control on the audit:** stripping `max-sm:text-base` from the Stage select (2 changed lines)
makes it report `UNCOVERED (1) … effective<sm=xs`, **exit 1**. The audit detects the regression.

## V7 · tsc and lint

`tsc --noEmit -p .` → **exit 0**.

**ESLint over all five changed files, rule-for-rule against HEAD:**

```
  15 @typescript-eslint/no-explicit-any        15 @typescript-eslint/no-explicit-any
  11 react-hooks/set-state-in-effect           11 react-hooks/set-state-in-effect
   1 react-hooks/immutability                   1 react-hooks/immutability
   1 react-hooks/exhaustive-deps                1 react-hooks/exhaustive-deps
   1 @typescript-eslint/no-unused-vars          1 @typescript-eslint/no-unused-vars
   1 @typescript-eslint/no-unsafe-function-type 1 @typescript-eslint/no-unsafe-function-type
  → IDENTICAL
```

**No new findings.** Baseline taken by stashing the five files, linting, and popping — the working tree
was confirmed restored afterwards.

---

# Backlog

1. 🔴 **Drop `outreach_prospects.contact_name`** — one release after this one. The column is now
   write-frozen: it keeps whatever it held while the split columns move, so it will go stale by design.
2. **`{{contact_name_prefixed}}` renders the FIRST name** — the name no longer describes the behaviour.
   Renaming it means editing 5 active templates in the same change or every greeting silently blanks.
3. ~~`demo_sessions.expires_at` nullability~~ — **closed**: the DDL declares it `not null`, so the route
   and this token cannot disagree. §V3.
4. **`chase-1` carries `hatchgrab.com/compare` as plain text** — `{{compare_link}}` now replaces it.
   §SQL 2. **Your edit to make, not mine.**
5. 167px name fields at 390px — `max-sm:grid-cols-1` if you find them cramped.
6. Standing, still not built: sub-44px touch targets (Call, WhatsApp, Copy, header buttons, checkboxes,
   the 16px `✕` badges), `FilterSelect` at `text-xs` (iOS zooms), C15's two capture-phase `keydown`
   listeners, landscape safe areas in this modal.

---

# SQL — for Dominic to run; **nothing here was executed**

**1 · The columns this build names, and the one nullability question that matters** (§V3's divergence):

```sql
select c.table_name, c.column_name, c.data_type, c.is_nullable
  from information_schema.columns c
 where c.table_schema = 'public'
   and (c.table_name, c.column_name) in (
     ('outreach_prospects','contact_name'),
     ('outreach_prospects','contact_first_name'),
     ('outreach_prospects','contact_last_name'),
     ('outreach_prospects','discovery_truck_id'),
     ('demo_sessions','public_ref'), ('demo_sessions','discovery_truck_id'),
     ('demo_sessions','expires_at'), ('demo_sessions','retired_at'),
     ('outreach_templates','slug'), ('outreach_templates','subject'),
     ('outreach_templates','body'), ('outreach_templates','active'))
 order by c.table_name, c.column_name;
```

🔴 **CORRECTION — I NAMED A COLUMN I HAD NOT READ.** The first version of the follow-up query below
selected `ds.id`. **`demo_sessions` has no `id` column**, and it failed with `42703`. That was my own
standing rule broken: query the schema before naming a column not read this session. The table is keyed
`truck_id text primary key references trucks(id) on delete cascade` — 🧪 read from
`supabase/migrations/20260723_demo_sessions.sql`, and corroborated by every access in the repo being
`.eq('truck_id', …).maybeSingle()` with `upsert` targeting the same key. There is no surrogate id.

⚠️ **And the same file ALREADY ANSWERS the §V3 divergence, so the follow-up is a formality:**

```
  expires_at    timestamptz not null,
```

🧪 **`expires_at` is declared NOT NULL in the create table.** So the null case cannot arise, the route's
null-tolerant filter and this token's `expires_at > now()` agree on every row, and there is nothing to
reconcile. Query 1's `is_nullable` row confirms that the live database matches the migration — worth
checking only because migrations here are applied by hand. If it somehow comes back `'YES'`, this finds
the affected rows (expected: none):

```sql
select ds.truck_id, ds.discovery_truck_id, ds.public_ref, ds.expires_at, ds.created_at
  from public.demo_sessions ds
 where ds.expires_at is null
   and ds.public_ref is not null
 order by ds.created_at desc;
```

**2 · 🔴 Which templates carry a hand-typed compare link, and which carry which tokens.** Read-only —
**I did not and will not edit a template row.** `chase-1` is the one you know about; this shows whether
there are others:

```sql
select t.slug, t.label, t.channel, t.active,
       (t.subject like '%compare%' or t.body like '%compare%') as mentions_compare,
       (t.subject like '%{{contact_name_prefixed}}%'
        or t.body like '%{{contact_name_prefixed}}%')          as uses_name_prefixed,
       (t.subject like '%{{contact_name}}%'
        or t.body like '%{{contact_name}}%')                   as uses_contact_name,
       t.subject
  from public.outreach_templates t
 order by t.active desc, t.slug;
```

⚠️ `uses_contact_name` is computed with `like`, so a row using only `{{contact_name_prefixed}}` matches
**both** name columns — the prefixed token contains the plain one as a substring. Read
`uses_contact_name` as "mentions the string", not "uses the bare token".

**3 · The name split's current state, so the 5 greeting templates can be sanity-checked.**
🧪 Expect 231 rows, 3 with a first name, 1 with a last:

```sql
select count(*)                                                        as prospects,
       count(*) filter (where coalesce(trim(p.contact_first_name),'') <> '') as with_first,
       count(*) filter (where coalesce(trim(p.contact_last_name),'')  <> '') as with_last,
       count(*) filter (where coalesce(trim(p.contact_name),'')       <> '') as with_legacy_name
  from public.outreach_prospects p;
```

**4 · 🔴 THE DRIFT WATCH, for the release before `contact_name` is dropped.** This code stops writing
`contact_name`, so from now on it can only fall behind. Any row here is one where the frozen column no
longer matches the live ones — expected and harmless while the column is unread, but it is what you want
to look at before dropping it:

```sql
select p.id,
       p.contact_name                                       as frozen_legacy,
       trim(both ' ' from concat_ws(' ', p.contact_first_name, p.contact_last_name)) as live_joined
  from public.outreach_prospects p
 where coalesce(trim(p.contact_name), '') <> ''
   and coalesce(trim(p.contact_name), '')
       is distinct from trim(both ' ' from concat_ws(' ', p.contact_first_name, p.contact_last_name))
 order by p.id;
```

---

# CHECKLIST

### Templates tab
- **T1.** The token reference must now list **12** tokens, including `{{first_name}}`, `{{last_name}}`,
  `{{demo_link}}` and `{{compare_link}}`, each with a description (none marked undocumented).
- **T2.** Click-to-insert each of the four at the caret — it should behave like the existing eight.
- **T3.** Pick a template, set the preview prospect to **anything except Between Buns Royston**, and add
  `{{demo_link}}` to the body. A red **"Cannot be sent to <name>"** line must appear.
- **T4.** Switch the preview prospect to **Between Buns Royston**. The red line must vanish and the
  preview must show `https://www.hatchgrab.com/demo/between-buns-royston-8c6a`.
- **T5.** Type `{{demo link}}` (a space). The **amber-free, red "Unreadable token"** line must appear —
  that is the Phase 1 guard, unchanged.

### The prospect modal — desktop 1280 × 800
- **D1.** Open any prospect. The left column now shows **First name | Last name** on one row and
  **Phone + WA** on the next. Phone must be the same width it was.
- **D2.** Type into First name, click away, reopen the prospect. It must have saved. Same for Last name.
- **D3.** 🔴 Open **George Greaves**' prospect: First name `George`, Last name `Greaves`.
- **D4.** Compose to George with a template using `Hi{{contact_name_prefixed}},`. **It must now read
  "Hi George," and NOT "Hi George Greaves,"** — this is the deliberate change in premise 2.
- **D5.** Compose to any prospect with no name. The greeting must be a bare **"Hi,"** — no stray space.
- **D6.** Compose with `{{demo_link}}` to a prospect with no demo: **Copy, Send and Log must all
  refuse**, and the red line must name the prospect. Try all three buttons.
- **D7.** Same, to **Between Buns Royston**: all three must work and the link must be the full
  `https://…/demo/…`.
- **D8.** 🔴 Paste `{{demo_link}}` into the body by hand, then delete it. The refusal must clear.
- **D9.** The rest of the modal — the 45/55 split, the meta strip, history — must look as it did.

### Safari RDM — iPhone 390 × 844 and 430 × 932
- **R1.** 🔴 First name and Last name must sit **side by side without overlapping**, and Phone on its own
  row below. This is the `max-sm:min-w-0` fix — at 167px tracks it is the thing that stops the ~10px
  overflow.
- **R2.** Tap into First name: **the page must not zoom** (16px).
- **R3.** Rounds 1–3 must still hold: only **STAGE** locked in the grey strip; Upcoming, Last contacted,
  the demo chip and Do-not-contact scrolling away at the top of the body; LOG A CONTACT two-per-row with
  no overlap; history scrolling sideways.
- **R4.** Drag past **640px** — the meta strip must snap back to one row and the duplicate must vanish.

### Only the real phone can answer
- **P1.** Tap each of the 12 text controls — none may zoom.
- **P2.** With the keyboard up, is **Log contact** still reachable?
- **P3.** 🔴 **Are 167px name fields wide enough in practice?** If not, `max-sm:grid-cols-1` on that grid
  stacks them full-width — one class, desktop-safe.
- **P4.** Copy a real demo link on the device and paste it somewhere.
