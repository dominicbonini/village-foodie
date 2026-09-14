# Outreach tokens and the contact-name split — DIAGNOSIS ONLY

# 🔴 I STOPPED. NO CODE WAS WRITTEN.

**The gate in the brief tripped on the first command.** `components/admin/OutreachPanel.tsx` is
**MODIFIED** in the working tree — it carries the two mobile fixes (`docs/outreach-modal-mobile-report.md`
and `-2-report.md`, both untracked). The brief says:

> 🔴 If `OutreachPanel.tsx` or the modal's files are MODIFIED in the working tree when you start, STOP and
> report before touching them; do not merge, do not revert, do not work around.

So: **nothing was edited, no migration file was written, no template row was touched.** What follows is
the whole of Phase 0, plus the SQL, plus the designs for Phases 1–3 ready to execute the moment you
clear the gate. §Blocked sets out exactly what was blocked and what was not.

⚠️ **One finding should not wait for the gate**: §0a is a live defect that puts literal `{{truck name}}`
into a subject line sent to a real business, and **nothing in the codebase can see it happen.**

---

## 🔴 PREMISES — four things in the brief are wrong

1. **"What does it do with an unrecognised token — pass it through verbatim, blank it, or throw?"** None
   of those three, and the real answer changes the fix. **An unrecognised token of a VALID SHAPE is
   already safe** — it renders as `[[token]]`, which the "still to fill" list counts and the pre-send
   warning names. **A MALFORMED token is invisible to every guard.** The defect is not the vocabulary,
   it is the **shape** — see 0a for the compiled evidence.
2. **"If [`placeholder_defaults`] is already the fallback mechanism, the new tokens' fallbacks belong
   there."** It **is** read (so it is not vestigial), but it is the fallback mechanism for a **different
   tier**: `[[placeholder]]` fills, not `{{token}}` values. `{{token}}` fallbacks are written inline in
   the template as `{{token|fallback}}`. **So the new tokens' fallbacks do NOT belong in
   `placeholder_defaults`** — putting them there would have no effect at all.
3. **`/compare` is public, but it is HOST-GATED** — `if (!(await onHatchGrab())) notFound()`. It 404s on
   the Village Foodie domain. So `{{compare_link}}` must be built on the **HatchGrab** host specifically;
   an origin-derived URL would produce a 404 link if the console were ever served from the other brand.
   The brief's "host-derived" instruction needs that qualification.
4. **`retired_at` has no writer.** Searched alone across `lib app components scripts`: **zero** hits
   outside comments (positive control: `first_opened_at` appears 6× in `lib/demo-session.ts` alone). So
   the liveness predicate for `{{demo_link}}` must **not** include `retired_at is null` — it would be a
   no-op that implies a mechanism which does not exist.

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

no changes added to commit (use "git add" and/or "git commit -a")
════
3a95e9f demo
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
9e83a5e migration changes
```

### Scope check — admin-only, confirmed

Everything in scope is reachable only from the admin outreach page and its send path:
`components/admin/OutreachPanel.tsx` (imported by `app/admin/page.tsx` alone; `app/admin/outreach/page.tsx`
is a server `redirect`), `components/admin/TemplatesPanel.tsx`, `components/admin/ComposeWindow.tsx`,
`app/api/admin/outreach/route.ts` and `app/api/admin/outreach-templates/route.ts` (both `verifyAdmin`),
and `lib/outreach-template-render.ts`. 🔴 **`lib/outreach-template-render.ts` has no other importer** —
checked, and it imports no client, no fetch and no route, so it cannot reach an operator or customer
surface. *Positive control on the same file set:* `discovery_truck_id` appears in **24** files, so the
search finds what is there.

---

# 0a · 🔴 THE `{{truck name}}` DEFECT — CONFIRMED, AND WORSE THAN DESCRIBED

**The renderer is `lib/outreach-template-render.ts`** (found by searching the token text and the brace
syntax, not a guessed function name). Substitution is `substitute()` → `resolvedValue()`, driven by:

```
RESOLVED_RE   = /\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g     ← the token must be [a-z_]+
UNRESOLVED_RE = /\[\[([^\]]+)\]\]/g                           ← scans [[…]] ONLY
SUSPECT_RE    = /(?<!\[)\[([^\[\]]{2,40})\](?!\])/g           ← scans single […] ONLY
```

🧪 **Driven with the real regexes** (what a null proof would look like: a test that only tries tokens
that work. Excluded by including the ones the file claims are safe, so the two behaviours are visible
side by side):

| input | resolver sees | `unresolvedIn` | mistype lint | outcome |
|---|---|---|---|---|
| `{{truck_name}}` | `truck_name` | — | — | resolves ✅ |
| `{{truk_name}}` | `truk_name` | — | — | unknown → emits `[[truk_name]]` → **warned** ✅ |
| `{{ first_name }}` | `first_name` | — | — | spaces *inside* are fine (`\s*`) ✅ |
| 🔴 **`{{truck name}}`** | **—** | **—** | **—** | **passes through verbatim, unseen by all three** |
| 🔴 `{{}}` | — | — | — | same |
| 🔴 `{{Truck_Name}}` | — | — | — | same (uppercase) |
| 🔴 `{{next-event}}` | — | — | — | same (hyphen) |
| 🔴 `{{name1}}` | — | — | — | same (digit) |
| 🔴 `{{a{{b}}}}` | `b` | — | — | partially consumed → leaves `{{a…}}` |

**So the class is: a `{{…}}` whose inner text does not match `[a-z_]+` is not a token at all.** The
resolver never matches it, `unresolvedIn` cannot see it (it scans `[[…]]`), and
`suspectedMistypedTokens` cannot see it (it scans single `[…]`). It is **prose** to every guard.

🔴 **And the file asserts the opposite.** Its own comment reads: *"A MISTYPED TOKEN MUST NOT REACH AN
EMAIL AS PROSE. An unknown `{{truk_name}}` is already safe: `substitute` cannot resolve it, so it emits
`[[truk_name]]`."* That is **true of the example and false of the class** — the example happens to be
well-formed. This is the same family as the `peakPerSlot` entry in §35.z: **a guarantee asserted in a
comment that the code does not provide**, and the reassuring example is what stopped anyone looking.

**Consequence for `chase-1`:** its subject contains `{{truck name}}` and it is `active: true`, so it is
offerable in the compose picker. Rendered, the subject goes out containing the literal characters
`{{truck name}}`, with no warning in the compose window and no entry in the "still to fill" list.

**Has it already been sent?** I cannot answer that from the code — the sent copy is stored in
`outreach_contacts.message`, which is data. 🔴 **SQL for you is in §SQL, query 2.** Note that the stored
row holds the **body**, and this defect is in the **subject**, so a clean result there is *not* proof
that no such email went out — see the query's own note.

**What the renderer should do instead** — Phase 1, below.

**🔴 THIS GATES THE TASK, AND THE BRIEF IS RIGHT THAT IT DOES.** Adding four tokens to a vocabulary whose
malformed-token behaviour is silent multiplies exactly this failure: `{{demo link}}`, `{{first name}}`
and `{{compare link}}` are the *most natural* mistypings of the four names being added, and every one of
them would sail through.

---

# 0b · The current vocabulary, exhaustively

🔴 **Data-driven from the code, not a hardcoded list** — and that part is already well built.
`resolvedTokenReference()` and `conditionReference()` read the `case 'x':` labels out of
`resolvedValue` and `conditionMet` via `Function.prototype.toString()`, *"so it is impossible for the
reference to omit a token that works."*

**Tier 1 — `{{token}}`, from `resolvedValue`:** `truck_name`, `contact_name`, `contact_name_prefixed`,
`website`, `order_url`, `next_event_day`, `next_event_date`, `next_event_venue`. **(8)**

**Tier 2 — `?condition:` whole-line drop, from `conditionMet`:** `next_event`, `no_next_event`,
`order_url`, `website`, `contact_name`. **(5)**

**Tier 3 — `[[placeholder]]`:** not a vocabulary; anything inside `[[…]]` is carried verbatim and listed
by `unresolvedIn` until filled.

**Shared between subject and body?** **Yes** — `renderTemplate` calls the same `substitute` on
`tpl.subject` and on every body line. ⚠️ But **tier 2 is body-only in practice**: `COND_LINE_RE` is
anchored `^`, and a subject is one line, so a `?cond:` subject would drop the entire subject.
**Shared between email and WhatsApp?** **Yes, identically.** `templatesFor` gates *which templates are
offered* by channel; it does not change rendering. There is one renderer.

---

# 0c · `placeholder_defaults` — read, but not what the brief assumed

**It is read.** `app/api/admin/outreach-templates/route.ts` selects it, and `EDITABLE` includes it;
its PATCH merges `body.defaults` into it with an `updated_at` per key. `MessageTemplate.defaults` carries
it, `defaultFillsOf()` flattens it, and `TemplatesPanel` imports that. **Not vestigial.**

🔴 **But it is the fallback mechanism for tier 3, not tier 1.** `defaultFillsOf` feeds
`applyPlaceholderFills`, which only touches `UNRESOLVED_RE` = `[[…]]`. A `{{first_name}}` default placed
in `placeholder_defaults` **would never be consulted** — `substitute` runs first and takes its fallback
from the template text (`{{token|fallback}}`) or emits `[[token]]`.

**So the new tokens' fallbacks belong in one of two places, and not in `placeholder_defaults`:**
- **inline** in the template text — `{{first_name|there}}` — which puts the wording in Dominic's hands
  where the rest of the copy lives; or
- **in `resolvedValue`**, the way `contact_name_prefixed` already does it, when the fallback has to carry
  punctuation the template author cannot see (a leading space, a comma).

Phase 3 recommends which, per token.

---

# 0d · Every reader and writer of `contact_name` — the true scope of the split

🧪 Searched alone across `lib app components scripts supabase`, excluding `contact_name_prefixed`.
*Positive control over the same set:* `discovery_truck_id` → 24 files.

| # | file | role | blocked? |
|---|---|---|---|
| 1 | `lib/outreach-template-render.ts` | **READER.** `ProspectLike.contact_name`; `contextFromProspect` → `contactName`; `resolvedValue` cases `contact_name` + `contact_name_prefixed`; `conditionMet` case `contact_name`; both description maps | clean |
| 2 | `app/api/admin/outreach/route.ts` | **READER + WRITER.** `columnExists('contact_name')` probe, the select list, the row mapping, and the PATCH writer (`if ('contact_name' in body) patch.contact_name = …`) | clean |
| 3 | `components/admin/TemplatesPanel.tsx` | **READER.** its local `Prospect` type + the preview context | clean |
| 4 | 🔴 `components/admin/OutreachPanel.tsx` | **READER + WRITER.** the `Prospect` type, `contactName` state, the prev/next re-seed, and the input's `onBlur` patch | **MODIFIED — BLOCKED** |

**No CSV or export path, no other API route, no other type.** Four files; one is blocked, and it is the
one that owns the form.

---

# 0e · How `{{demo_link}}` would resolve

🔴 **The lookup already exists and must be reused, not re-written.** `app/api/admin/outreach/route.ts`
already joins prospects to their demos for the modal's link chip (shipped in V13.1):

```
demo_sessions
  .select('truck_id, discovery_truck_id, public_ref, expires_at, created_at')
  .in('discovery_truck_id', ids)
  .order('created_at', { ascending: false })     ← newest first
  … skip when expires_at <= now …               ← liveness
  … first survivor wins; the rest increment liveCount
```

- **Selection rule when several:** newest by `created_at`. Correct, and already what the modal shows.
- **Liveness:** `expires_at > now()`, **and nothing else.** The row's existence is itself a liveness
  signal (`demo_sessions.truck_id → trucks` is `ON DELETE CASCADE`). 🔴 **Do not add `retired_at is
  null`** — premise 4.
- **Rendered URL:** `https://<host>/demo/<public_ref>` — absolute, because it goes in an email.
- **Host:** `process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? 'https://www.hatchgrab.com'`, the established
  pattern in `lib/email-config.ts` and `lib/custom-domain/copy.ts`. **Not hardcoded, not origin-derived.**
- ⚠️ `public_ref` can be **null** on a live session (the modal already renders `demo · no link` for that
  case), so "has a live demo" and "has a link" are two different tests. The token needs both.

🔴 **Only 1 of 231 prospects can exercise the success path** (your figure, not re-derived). So the
refusal path is the one that runs 230 times out of 231 — it is the main path, not the edge.

---

# 0f · `/compare`

**Real route:** `app/compare/page.tsx` + `CostComparison.tsx`. **Public** — the gate
`if (!PRICING_PUBLISHED && !(await verifyAdmin())) redirect('/contact')` was **removed on 3 September**
("THE PAGE IS PUBLIC"), because the landing page links to it and *"a gated page behind a public link is a
broken promise."* No auth check remains.

🔴 **It is HOST-gated, though:** `if (!(await onHatchGrab())) notFound()` — it 404s on Village Foodie,
because *"someone there is looking for a food truck, not for operator plan pricing."* **So
`{{compare_link}}` must be built on the HatchGrab host, not on the request origin.**

`noindex, nofollow` is deliberate and, as the brief says, governs crawlers rather than linking —
emailing it is fine.

---

# THE DESIGNS — ready to execute when the gate clears

## Phase 1 — malformed tokens must not reach a prospect

**Recommendation: refuse to compose, and name the offending sequence.** Not a silent blank (the brief
rules it out, rightly — *"Ordering costs for "* is worse than a visible marker), and not a render-time
error string, because the same renderer feeds the Templates **preview**, where a loud inline marker is
exactly what the author needs to see while writing.

Concretely, one new exported function beside `suspectedMistypedTokens`, and no change to `substitute`:

- `malformedTokensIn(text)` → every `{{…}}` sequence whose inner text is **not** `[a-z_]+(\|…)?`.
  Implementation shape: scan with a permissive `/\{\{([^}]*)\}\}/g` and report any capture the strict
  `RESOLVED_RE` would not consume. **It reads text and changes no rendering** — the same posture the
  existing lint takes.
- The **compose window** blocks Send/Copy while the list is non-empty and names the sequence.
- The **Templates preview** shows them the way it already shows `unresolved`.

That keeps one renderer, adds one pure function, and leaves every existing render byte-identical
(verification 5 becomes: `substitute` is untouched, so it cannot change).

🔴 **`chase-1` is DATA, not code — SQL in §SQL, query 3. I did not and will not edit a template row.**

## Phase 2 — the name split

**Migration NOT written**, because the split's form fields live in the blocked file and half a split is
worse than none. The DDL, backfill and verification are in §SQL (queries 4–6) so nothing is lost.
Design, for when it runs:

- `contact_first_name text`, `contact_last_name text`, both nullable, `add column if not exists`.
- Backfill: split on the first whitespace run; one word → first name only. 🧪 **3 rows** should change.
- 🔴 `contact_name` **stays and stays readable for one release.** Switch the four 0d readers to the new
  columns, stop writing it, leave the column. **Dropping it is a LATER, SEPARATE change** — backlog item
  below.
- ⚠️ **The modal collision, answered:** the form row that holds Contact name was just fixed for 390px in
  the parallel task — it is the left column's `<label className="block">` stack. Adding a second field
  there is safe *in principle* (that column is a single-column flex stack below `sm`, so a new field
  adds a row rather than narrowing one) — **but I did not do it, because the file is modified and the
  brief forbids working around that.** It is a two-field row on desktop and two stacked rows on mobile;
  it needs the same `max-sm:` treatment the rest of that column got.

## Phase 3 — the four tokens

| token | source | fallback, and where it lives |
|---|---|---|
| `{{first_name}}` | `contact_first_name` | 🔴 **the 228-row path.** Recommend a **`contact_name_prefixed`-style sibling** in `resolvedValue` — `{{first_name_prefixed}}` — because the fallback must delete a space as well as a word. `Hi{{first_name_prefixed}},` → **"Hi Madhur,"** with a name, **"Hi,"** without. A bare `{{first_name|there}}` gives "Hi there," which is a different, chattier register — your call, and it is a template edit, not a code change. |
| `{{last_name}}` | `contact_last_name` | inline `{{last_name|}}` where used; no prefixed variant — it never opens a sentence. |
| `{{demo_link}}` | 0e's chain | 🔴 **no fallback. REFUSE.** When there is no live demo *or* no `public_ref`, the compose must not send and must name the prospect and say "no live demo". Never an empty string, a bare domain, or a dead `/demo/`. |
| `{{compare_link}}` | `NEXT_PUBLIC_HATCHGRAB_URL + '/compare'` | always resolves; no fallback needed. |

**Surfacing the vocabulary:** a reference **already exists** — `resolvedTokenReference()` /
`conditionReference()`, derived from the code, already rendered by `TemplatesPanel`. **Extend it, build
nothing.** Adding a `case` to `resolvedValue` adds the token to the reference automatically; the only
manual step is a line in `TOKEN_DESCRIPTIONS`, and an undescribed token still appears, marked
undocumented. That is the smallest thing that works, and it is already there.

🔴 **`{{demo_link}}`'s refusal cannot be expressed in `resolvedValue`**, which returns `string | null` and
whose `null` means "use the fallback or emit `[[token]]`". The refusal has to be a **pre-send check** in
the compose window, alongside Phase 1's malformed-token check — which is another reason Phase 1 comes
first: it builds the channel that Phase 3 needs.

---

# BLOCKED vs NOT BLOCKED

| work | file | state |
|---|---|---|
| Phase 1 renderer fix | `lib/outreach-template-render.ts` | clean — **could** proceed |
| Phase 1 UI wiring | `ComposeWindow.tsx`, `TemplatesPanel.tsx` | clean — **could** proceed |
| Phase 2 migration | new file | clean — **could** proceed |
| Phase 2 readers ×3 | render lib, outreach route, TemplatesPanel | clean — **could** proceed |
| 🔴 Phase 2 form fields | `OutreachPanel.tsx` | **BLOCKED** |
| 🔴 Phase 2 reader/writer | `OutreachPanel.tsx` | **BLOCKED** |
| Phase 3 tokens | `lib/outreach-template-render.ts` | clean, but depends on Phase 2's columns |

**Why I stopped on all of it rather than shipping the unblocked half:** the name split is one change
across four files, and the blocked file is the only one that **writes** the name. Shipping columns, a
backfill and two tokens that nothing can populate is the "half-finished, reads as done" shape the manual's
standing rule names. And `{{first_name}}` would render its fallback on **231 of 231** rows instead of 228,
which looks like it works. Phase 1 alone could ship; I held it so the ordering the brief asks for
(Phase 1 → 2 → 3, as separate changes) survives contact with the parallel task.

**Say the word and I will run it in that order** — or, if you would rather, Phase 1 alone right now,
since it is a genuine live defect and touches no blocked file.

---

# Backlog additions

1. 🔴 **Malformed `{{…}}` tokens are invisible to every guard** (§0a) — the class, not just `chase-1`.
2. **`chase-1`'s subject** — data fix, SQL below.
3. **Drop `outreach_prospects.contact_name`** — a LATER, SEPARATE change, one release after the split.
4. **The renderer's comment asserts a guarantee it does not provide** — correct it with the Phase 1 fix.
5. **`{{compare_link}}` must use the HatchGrab host** — an origin-derived link 404s on Village Foodie.

---

# SQL — for Dominic to run; **nothing here was executed**

**1 · Confirm every column these queries name** (`contact_first_name` / `contact_last_name` should come
back with **no rows** — they do not exist yet, which is the point):

```sql
select c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default
  from information_schema.columns c
 where c.table_schema = 'public'
   and (c.table_name, c.column_name) in (
     ('outreach_prospects','contact_name'), ('outreach_prospects','contact_first_name'),
     ('outreach_prospects','contact_last_name'), ('outreach_prospects','discovery_truck_id'),
     ('outreach_templates','slug'), ('outreach_templates','subject'),
     ('outreach_templates','body'), ('outreach_templates','active'),
     ('outreach_templates','placeholder_defaults'),
     ('outreach_contacts','message'), ('outreach_contacts','contacted_at'),
     ('demo_sessions','public_ref'), ('demo_sessions','discovery_truck_id'),
     ('demo_sessions','expires_at'), ('demo_sessions','retired_at'))
 order by c.table_name, c.column_name;
```

**2 · 🔴 Has a malformed token already been SENT?** Every logged message still containing brace or
bracket markers:

```sql
select oc.id,
       oc.prospect_id,
       oc.contacted_at,
       oc.channel,
       oc.direction,
       substring(oc.message from 1 for 160) as message_start
  from public.outreach_contacts oc
 where oc.message like '%{{%'
    or oc.message like '%[[%'
 order by oc.contacted_at desc;
```

⚠️ **A clean result is NOT proof that no such email went out.** `outreach_contacts.message` stores the
**body**; `chase-1`'s defect is in the **subject**, which is not logged. Treat this as "did a malformed
token ever reach a body", and treat the subject as unknowable from the data.

**3 · 🔴 The `chase-1` data fix — yours to run; I did not touch any template row.** Look first:

```sql
select t.slug, t.label, t.channel, t.active, t.subject
  from public.outreach_templates t
 where t.subject like '%{{%' or t.body like '%{{%'
 order by t.slug;
```

Then, once you have confirmed it is the only one, the correction:

```sql
update public.outreach_templates
   set subject = replace(subject, '{{truck name}}', '{{truck_name}}'),
       updated_at = now()
 where slug = 'chase-1'
   and subject like '%{{truck name}}%';
```

**4 · The name-split migration** (the file is NOT written — see §Blocked):

```sql
alter table public.outreach_prospects add column if not exists contact_first_name text;
alter table public.outreach_prospects add column if not exists contact_last_name  text;

comment on column public.outreach_prospects.contact_first_name is
  'Given name of the named contact. Split from contact_name (V13.1+). contact_name is kept readable for one release and is no longer written.';
comment on column public.outreach_prospects.contact_last_name is
  'Family name of the named contact, null when only one word was recorded.';

notify pgrst, 'reload schema';
```

**5 · The backfill — 🧪 should report exactly 3 rows.** Look before you leap:

```sql
select p.id,
       p.contact_name,
       split_part(btrim(p.contact_name), ' ', 1)                                    as would_be_first,
       nullif(btrim(substring(btrim(p.contact_name) from position(' ' in btrim(p.contact_name)) + 1)), '') as would_be_last
  from public.outreach_prospects p
 where nullif(btrim(p.contact_name), '') is not null
 order by p.contact_name;
```

Then the write:

```sql
update public.outreach_prospects p
   set contact_first_name = split_part(btrim(p.contact_name), ' ', 1),
       contact_last_name  = nullif(btrim(substring(btrim(p.contact_name)
                              from position(' ' in btrim(p.contact_name)) + 1)), ''),
       updated_at = now()
 where nullif(btrim(p.contact_name), '') is not null;
```

**6 · Verify the backfill** — expect 3 populated, one of them with a last name:

```sql
select count(*)                                              as prospects,
       count(p.contact_name)                                 as had_contact_name,
       count(p.contact_first_name)                           as have_first,
       count(p.contact_last_name)                            as have_last
  from public.outreach_prospects p;
```

**7 · Which prospect can exercise `{{demo_link}}`'s success path** (your figure says exactly one — this
names it, and shows the ones that would REFUSE):

```sql
select p.id                                   as prospect_id,
       dt.name                                as truck_name,
       ds.public_ref,
       ds.expires_at,
       (ds.public_ref is not null
        and ds.expires_at > now())            as demo_link_would_resolve
  from public.outreach_prospects p
  join public.discovery_trucks dt on dt.id = p.discovery_truck_id
  left join lateral (
       select s.public_ref, s.expires_at
         from public.demo_sessions s
        where s.discovery_truck_id = p.discovery_truck_id
          and s.expires_at > now()
        order by s.created_at desc
        limit 1
  ) ds on true
 order by demo_link_would_resolve desc nulls last, dt.name;
```

## Closing `git status`, verbatim — unchanged from the opening apart from this report

⚠️ **Read the diffstat carefully.** `git diff --stat` still shows
`components/admin/OutreachPanel.tsx | 42 +++---  1 file changed, 21 insertions(+), 21 deletions(-)` —
that is the **parallel mobile task's** change, present before this task started and untouched by it. The
proof that this task wrote no code is that the figure is **identical to the opening state** (21/21), and
that the only new path in `git status` is this report. A diffstat of zero would have been the wrong thing
to claim, and claiming it would have been the kind of green-that-proves-nothing this report is about.

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
```
