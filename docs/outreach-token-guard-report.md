# Phase 1 — a malformed token can no longer be sent

**14 September 2026.** Three files changed: `lib/outreach-template-render.ts`,
`components/admin/ComposeWindow.tsx`, `components/admin/TemplatesPanel.tsx`. 🔴
**`components/admin/OutreachPanel.tsx` is NOT among them** — the gate held (§V4). Phases 2 and 3 were not
started. No `outreach_templates` row was touched. No token was added, renamed or removed. Nothing staged.

---

## 🔴 PREMISES

1. **Everything in the brief checked out**, including the narrowed gate: `OutreachPanel.tsx` is the only
   **source** file the mobile task has modified, and Phase 1 needs none of it.
2. **One correction to my own Phase 0 report.** It described the nested case `{{a{{b}}}}` alongside the
   others as "passes through verbatim". 🧪 It does not: the pre-fix renderer **half-consumes** it into
   `{{a[[b]]}}` — the inner `{{b}}` matches the token pattern, resolves to nothing, and becomes `[[b]]`,
   which *does* raise an outstanding-placeholder warning. It still leaves literal `{{a` and `}}` in the
   message, so it is still a defect, but by a different mechanism than the other six. **The harness caught
   this, not me** — my first control asserted "pre-fix passes all seven through verbatim" and it failed on
   exactly that case. The corrected claim is in §V1.
3. ⚠️ **One consequence of this change you should know before it ships:** a template containing a
   malformed token can no longer be sent, copied **or logged**. `chase-1` is fixed, but if any *other*
   active template carries one, composing from it will now refuse. §SQL query 1 finds them — **worth
   running before this deploys.**

### The two git commands, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   components/admin/OutreachPanel.tsx
	modified:   docs/onboarding-flow.md
	modified:   docs/reference-manual.md

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-modal-mobile-2-report.md
	docs/outreach-modal-mobile-report.md
	docs/outreach-tokens-report.md

no changes added to commit (use "git add" and/or "git commit -a")
════
3a95e9f demo
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
9e83a5e migration changes
```

### Admin-only — confirmed by symbol

`lib/outreach-template-render.ts` has exactly **four** referencing files: itself, `TemplatesPanel`,
`ComposeWindow` and `OutreachPanel` — all under `components/admin/`, all reachable only from
`app/admin/page.tsx`. 🔴 And the module **imports nothing at all** — no client, no fetch, no route — so it
cannot reach an operator or customer surface even transitively. That is a property of the file, checked,
not a promise in a comment. *Positive control on the same search method:* `useState` appears in 41 files
under `components/`, so the search finds what is there.

---

# WHAT THE GUARD KEYS OFF, AND WHY IT CANNOT INHERIT THE BLIND SPOT

The brief's lesson is the design constraint, so it is stated first.

**The old blind spot.** Three guards, one test written three times:

| guard | scans for |
|---|---|
| `substitute` → `RESOLVED_RE` | `\{\{\s*([a-z_]+)\s*(\|…)?\}\}` |
| `unresolvedIn` → `UNRESOLVED_RE` | `\[\[…\]\]` |
| `suspectedMistypedTokens` → `SUSPECT_RE` | a single `[…]` |

A `{{…}}` whose contents are not `[a-z_]+` matches **none** of them: the resolver never sees it,
`unresolvedIn` is looking at square brackets, and the lint is looking at *single* square brackets. Three
independent-looking checks, blind to the same input.

**The new guard keys off the DELIMITERS.**

```
const BRACE_SPAN_RE       = /\{\{([\s\S]*?)\}\}/g          ← any {{…}} pair; contents irrelevant
const WELL_FORMED_INNER_RE= /^\s*[a-z_]+\s*(?:\|[^}]*)?$/  ← “would RESOLVED_RE have consumed it?”
```

`BRACE_SPAN_RE` shares **no character class** with `RESOLVED_RE`: it captures `[\s\S]*?` — letters,
spaces, capitals, digits, punctuation, or nothing. **A span `RESOLVED_RE` cannot see is precisely a span
this one can.** The well-formedness test is then applied *to what was found*, rather than being the thing
that does the finding. That inversion is the whole point, and §V1's control demonstrates it: a guard
keyed off the token pattern misses 6 of the 7 cases outright.

Two details that matter:
- **Non-greedy `*?`**, so `{{a{{b}}}}` reports the **outer** span `{{a{{b}}` rather than matching to the
  last `}}` and naming a plausible-looking inner token.
- **An unclosed `{{` forms no pair**, so pair-scanning alone cannot find it. Every complete span is
  removed first; a surviving `{{` in the remainder is an unclosed one.

---

# WHERE IT RUNS — the chokepoint, and the proof it is the only way out

🔴 **There is no server-side send for outreach.** A message leaves the browser by exactly three routes,
all in `ComposeWindow`, and **all three are now guarded**:

| # | exit | symbol | carries | guarded before |
|---|---|---|---|---|
| 1 | the OS mail client | `sendNow` → `window.location.href = mailtoUrl` | **subject + body** | the address check and the length check |
| 2 | the clipboard | `doCopy` → `navigator.clipboard.writeText(fullText)` | body | 🔴 **it had NO check of any kind** |
| 3 | the contact log | `logNow` → `onLog(fullText, channel)` | body → `outreach_contacts` | the existing placeholder confirm |

**Exit 2 was the unguarded one, and it is the one that matters most for WhatsApp:** a WhatsApp template
has no subject and no mailto, so **Copy is the only way out** for it. It previously carried not even the
`[[placeholder]]` warning the other two had.

**Proof that these are the only exits.** `renderTemplate` / `renderWithFills` have exactly two consumers:
`ComposeWindow` and `TemplatesPanel`. `TemplatesPanel` is a **preview** — it has no clipboard, mailto or
log path. So every rendered message that can reach a prospect passes through one of the three above.
*What a null proof would look like:* asserting "these are the only exits" from the function names.
*Excluded by:* searching each symbol alone across `lib app components scripts` (positive control: 41 files
use `useState`), and by reading all three call sites.

**Not only at preview.** The check is computed from `applyFills(subject)` and `applyFills(body)` — the
**live text on screen after hand edits and after placeholder values are applied** — mirroring how
`outstanding` is derived. So it catches a malformed token the operator **types into the textarea**, and
one that arrives inside a **placeholder value** (§V1 proves both).

## Refuse, not warn — and why that differs from the existing behaviour

`outstanding` (`[[placeholder]]`) uses **warn-then-allow**: a left-in placeholder may be deliberate, so
the operator is told and decides. The new check **refuses outright** on all three exits.

**A malformed `{{…}}` is never deliberate.** There is nothing for the operator to weigh — it is a typo
that would arrive at a food business as literal braces. So there is no "send anyway", and the notice is
rendered **whether or not a button has been pressed**, naming the offending span verbatim (braces
included) so it can be found in the text.

**Already covered vs extended**, as the brief asks:

| case | before | now |
|---|---|---|
| well-formed **unknown** token, e.g. `{{nope}}` | ✅ already covered — resolves to nothing, emits `[[nope]]`, counted by `unresolvedIn`, named in the pre-send warning | unchanged, and deliberately **not** double-reported |
| **malformed** token, subject | ❌ invisible | 🔴 refused |
| **malformed** token, body | ❌ invisible | 🔴 refused |
| email path | ❌ | refused at `sendNow` **and** at `doCopy` |
| WhatsApp path | ❌ — and Copy is its only exit | refused at `doCopy` |
| template editor | ❌ | shown as an error while writing |

## The comment that asserted the opposite

It read: *"An unknown `{{truk_name}}` is already safe: `substitute` cannot resolve it, so it emits
`[[truk_name]]`."* **True of that example, false of the class** — and the reassuring example is what
stopped anyone looking. Corrected in place: it now sets out both cases, names the three-guards-one-blind-
spot failure, and states why `malformedTokensIn` keys off the delimiters. Same family as §35.z — a
guarantee asserted in a comment that the code did not provide.

---

# VERIFICATION

## V1 · Every required input, driven through the real renderer

*Null result:* a guard that flags everything — then "all refused" proves nothing. **Excluded by asserting
the valid cases are NOT flagged in the same run.**

```
  input              new guard                 unresolved([[…]])   pre-fix OUTPUT (subject)
  ------------------------------------------------------------------------------------------
  {{truck name}}     ["{{truck name}}"]       []                  "{{truck name}}"
  {{Truck_Name}}     ["{{Truck_Name}}"]       []                  "{{Truck_Name}}"
  {{truck-name}}     ["{{truck-name}}"]       []                  "{{truck-name}}"
  {{truck2}}         ["{{truck2}}"]           []                  "{{truck2}}"
  {{}}               ["{{}}"]                 []                  "{{}}"
  {{unclosed         ["{{"]                   []                  "{{unclosed"
  {{a{{b}}}}         ["{{a{{b}}"]             ["b"]               "{{a[[b]]}}"
  {{ truck_name }}   []                       []                  "Azahar"
  {{nope}}           []                       ["nope"]            "[[nope]]"
  {{truck_name}}     []                       []                  "Azahar"
```

- **All 7 malformed cases flagged.** The two valid ones (`{{ truck_name }}` — inner spaces are legal —
  and `{{truck_name}}`) are **not** flagged. `{{nope}}` is left to the existing `[[…]]` mechanism.
- **🔴 The control, stated per case rather than as one blanket claim** (premise 2): the pre-fix renderer
  left braces in the subject for **all seven** — six emitted **verbatim with zero warnings**, and the
  nested one half-consumed into `{{a[[b]]}}`.
- **🔴 The design control:** a guard keyed off the **token pattern** instead of the delimiters sees
  **nothing** in 6 of the 7, and in the nested case sees only the inner `{{b}}`, which looks legitimate.
  That is the blind spot reproduced on demand — and it is why the delimiter keying is not a stylistic
  choice.
- Caught in the **subject alone** and in the **body alone**.
- Caught when typed into a **placeholder value** (re-derived after the fills, not carried from the render).

## V2 + V3 · Existing templates and valid tokens render byte-identically

**27 renders** compared pre-fix against post-fix — 3 template shapes (email with subject, WhatsApp
without, plain no-token) × 3 contexts (all fields present, all absent, partial) × with and without
placeholder fills. **`subject`, `body`, `unresolved` and `droppedConditions` are byte-identical in every
one.**

*Null result:* a corpus with no tokens, which would pass trivially. **Excluded** by asserting the corpus
exercises **all 8 resolved tokens and all 5 conditions** (read out of `resolvedTokenReference()` /
`conditionReference()`, so the list cannot go stale) and that the full context renders real values
("Azahar", "The Green", "Friday"). *Control:* changing one character of one token makes the comparison
**fail**.

**Structurally, why it must be identical:** `substitute`, `resolvedValue`, `conditionMet` and
`renderTemplate`'s line logic are **untouched**. The only change to the render path is an **additive
field** on the returned object. A render cannot differ because nothing that produces one changed.

⚠️ **What I could NOT do:** run the **actual 7 active templates**, because they live in the database and
I do not query it. The structural argument above covers them — but if any of them contains a malformed
token it will now be refused, which is the point and also an operational change. **§SQL query 1 lists
them; please run it before deploying.**

## V4 · The gate held

`git diff --numstat`:

```
21  21  components/admin/OutreachPanel.tsx     ← the parallel mobile task, byte-for-byte as I found it
41   1  components/admin/ComposeWindow.tsx     ← this task
17   1  components/admin/TemplatesPanel.tsx    ← this task
87   8  lib/outreach-template-render.ts        ← this task
```

🔴 **`OutreachPanel.tsx` is 21/21 — identical to its figure at the start of this task.** A diffstat of
zero would have been the wrong thing to claim: the file *is* modified, by someone else's work, and the
proof that I did not touch it is that the number did not move.

## V5 · tsc and lint

`tsc --noEmit -p .` exit **0**. ESLint over the three changed files: **rule-for-rule identical to HEAD.**

---

# Open items

1. **Phases 2 and 3 remain held** — the name-split columns exist and are backfilled but **no code reads
   them**, exactly as you left it.
2. **A malformed token typed directly into the modal's own "Log a contact" box** is not covered — that is
   free text, not a template render, and the box lives in the blocked file.
3. The `[[…]]` tier and `placeholder_defaults` are untouched, per scope.
4. `suspectedMistypedTokens` (the single-bracket lint) still runs only in the **template editor**, not in
   the compose window. Left as it was — it is a hint, not a guarantee, and widening it was not asked for.

---

# SQL — for Dominic to run; **nothing here was executed**

**1 · 🔴 RUN THIS BEFORE DEPLOYING.** Any active template carrying a token the renderer cannot read will
now refuse to compose. Expect **zero rows** now that `chase-1` is corrected:

```sql
select t.slug,
       t.label,
       t.channel,
       t.active,
       t.subject,
       t.body
  from public.outreach_templates t
 where t.subject ~ '\{\{[^}]*\}\}'
    or t.body    ~ '\{\{[^}]*\}\}'
 order by t.active desc, t.slug;
```

⚠️ That deliberately lists **every** `{{…}}`, valid or not, because Postgres regex and the renderer's
JavaScript regex are different engines and I will not claim they agree on the edge cases. Read the rows:
anything that is not lower-case-with-underscores is what the guard will now refuse.

**2 · The same question, narrowed to what is almost certainly wrong** — a token containing anything other
than lower-case letters and underscores:

```sql
select t.slug,
       t.active,
       coalesce(t.subject, '') as subject,
       t.body
  from public.outreach_templates t
 where t.subject ~ '\{\{\s*[^a-z_|}][^}]*\}\}'
    or t.body    ~ '\{\{\s*[^a-z_|}][^}]*\}\}'
 order by t.slug;
```

**3 · Confirm the vocabulary a template may use** — this is the list the code derives, reproduced so you
can compare it against what the templates actually reference. **8 tokens and 5 conditions**, and the
Templates tab shows them live:

```sql
-- No query needed: the reference is DERIVED FROM THE CODE and rendered on the Templates tab.
-- Tokens:     truck_name · contact_name · contact_name_prefixed · website · order_url
--             next_event_day · next_event_date · next_event_venue
-- Conditions: next_event · no_next_event · order_url · website · contact_name
select t.slug, t.label, t.channel, t.active, t.sort_order
  from public.outreach_templates t
 order by t.active desc, t.sort_order nulls last, t.slug;
```

**4 · Has a malformed token ever reached a logged message?** (From the earlier report, still unanswered —
and note the limit: `outreach_contacts.message` stores the **body**, and the `chase-1` defect was in the
**subject**, which is not logged, so a clean result is not proof.)

```sql
select oc.id,
       oc.prospect_id,
       oc.contacted_at,
       oc.channel,
       oc.direction,
       substring(oc.message from 1 for 200) as message_start
  from public.outreach_contacts oc
 where oc.message like '%{{%'
 order by oc.contacted_at desc;
```

## Closing `git status`, verbatim (nothing staged)

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
	docs/outreach-modal-mobile-report.md
	docs/outreach-token-guard-report.md
	docs/outreach-tokens-report.md

no changes added to commit (use "git add" and/or "git commit -a")
```
