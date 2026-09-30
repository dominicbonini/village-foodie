# The outreach sequence — one template per box, and no truck gets the same email twice

**30 September 2026 · commit `c61f9e6` · deployed and serving on production at 16:16:00Z**
**⏳ The migration is NOT applied. It is at the bottom of this report and in the chat reply.**

⚠️ **One garbled span, flagged rather than interpreted:** the standing rule reads *"Send no email,
apart from nothing — no sends at all."* I have read that as **no sends at all**, which is what the
rest of the sentence says and what every other rule in this workstream assumes. Nothing in this
build sends, and no harness opens a socket.

⚠️ **One tension between two of your instructions, resolved rather than blocked on:** the standing
rules say every migration goes in the chat reply as its own fenced block, and the closing
instruction says the chat reply is only a two-line summary. I have read the second as governing the
*prose* — the summary is two lines, and the migration block is the separate thing the standing rule
requires. Both appear in the chat reply, with the report filename last.

---

## 0 · The diagnosis, first

### 0a — how a template is chosen today, and why Pig-Casso's opened on Blank

| Mechanism | Where | What it does |
|---|---|---|
| `templateForStep(step, offerable)` | `lib/outreach-step.ts` | **(1)** filters the loaded templates for `servesKind === step.kind`, the right channel, and `servesLeadType` null-or-equal; sorts lead-type-specific first, then `sort_order`, then id, and takes the first. **(2)** If none match, falls back to `STEP_TEMPLATE[kind][channel]` — a **slug map written in code** — and returns null (`slug_absent`) if that slug is not loaded. |
| `effectiveLeadType(p)` | `lib/outreach-step.ts` | `lead_type_at_first_contact` when it is one of the four, else `leadTypeOf(p)` live. Called by exactly two places: `nextStep` and `contextFromProspect`. |
| `STEP_TEMPLATE` | `lib/outreach-step.ts` | `{first contact → general_email, chase 1/2/final → chaser_email}` ×2 channels. Lead type is **not** in it. |
| `suggestTemplateId(row)` | `lib/outreach-template-render.ts` | A separate heuristic over stage and `hu_ordering`, used only to **order the chips** in the composer — never to pre-select. |

**Why the Email tab opened on "Blank" for Pig-Casso's.** Nothing was broken. That prospect has
**inbound contacts**, so `nextStep` returns:

```ts
if (inbound > 0) return stop('replied', `Replied — ${inbound} inbound message…`)   // state: 'stopped', kind: null
```

and `templateForStep`'s first line refuses any state that is not `due` or `scheduled`:

```ts
if (!step.kind || (step.state !== 'due' && step.state !== 'scheduled')) return { slug: null, miss: 'no_step' }
```

🔴 **The screen was self-contradictory, and that is the real finding.** The amber banner said
"Follow up — 14 days overdue" because the banner comes from `nextAction`, a *different* derivation
that does cover follow-ups; the composer came from `nextStep`, which had stopped the ladder. One
line said there was a step and the box below it said there was not. **This build keeps that
behaviour and makes it say so**: the composer now prints *"No step to send: replied — 2 inbound
messages. Pick a template or write it."*

### 0b — where a sent email's logged kind comes from

| Path | Kind sent | Kind logged |
|---|---|---|
| Prospect page (inline composer) | `replyTo ? 'reply' : (selected?.servesKind ?? logFormKind)` | the route's `sendKind` — `reply` if it is a reply, else **whatever the client sent** |
| The older floating compose window | the same component; **it has no other caller** — `ComposeWindow` is mounted in exactly one place | same |
| Today's reply | navigates to the prospect page with the message id in the URL, then the same path | same |

🔴 **So the logged rung was decided by the WORDS chosen, not by the step.** Picking the template
tagged `2_chase_1` for a truck due its first contact logged a **chase-1 rung**, and `nextStep` would
thereafter offer chase 2 — a step of the ladder skipped for ever, silently. Item 3h fixes it: the
composer sends the step, and the **server re-derives it and overrules the client**.

### 0c — an email sent from Outlook

| Situation | What happens |
|---|---|
| Found in Sent by the poll, prospect **has replied** | logged as an outbound contact with `kind: 'reply'` — **not a rung** |
| Found in Sent by the poll, prospect has **not** replied | **not logged as a contact at all**; it exists only as an `outreach_messages` row |
| A system message retried by the poll | logged with `kind: null` — which makes `nextStep` return **`unknown`** (a blind row) |

🔴 **So the ladder does not learn the step from Outlook mail, and cannot.** The duplicate-step guard
therefore counts **both** sources — contact rows *and* message rows, joined on `contact_id` so an
app-sent email is not counted twice — but an Outlook email **carries no step**, and this build does
not invent one:

- a prior send **with** the same kind ⇒ **refusal**, naming the day and saying whether it was found
  in the Sent folder;
- a prior outbound message **with no kind**, since the last recorded rung ⇒ **a question**: *"An
  email went to this prospect 16 Sept 2026 (14 days ago) that is not recorded as a step — it was
  sent from Outlook. Send anyway?"*

Guessing which step an Outlook email was would either block a legitimate first contact or wave
through a second chase. ⚠️ This is the one place where "count it either way" cannot be done exactly
as written, and it is called out here rather than papered over.

### 0d — where the address lives, and who shares one

`discovery_trucks.contact_email`. `outreach_prospects` has no address of its own; it joins through
`discovery_truck_id`. **Not run** — for you:

```sql
-- Prospects whose truck shares an email address with another truck, case-insensitively.
select lower(trim(t.contact_email))                      as address,
       count(*)                                          as prospects,
       string_agg(t.name, ' | ' order by t.name)         as trucks
from public.outreach_prospects p
join public.discovery_trucks t on t.id = p.discovery_truck_id
where coalesce(trim(t.contact_email), '') <> ''
group by 1
having count(*) > 1
order by prospects desc, address;
```

### 0e — how `outreach_settings` stores values

`key text primary key, value jsonb not null, updated_at timestamptz`, RLS on, one `service_role`
policy, `anon`/`authenticated` revoked. It already holds `signature`, `opt_out` and
`mail_poll_state`. 🔴 **The four truck-type names fit it exactly and need no new table and no
migration**: one row, `lead_type_labels`, written by the rename and read with the code's own names
as the fallback. An unknown key in it is ignored on the way out, so the four **types** stay in code.

**Nothing in 0a–0e contradicts the plan.** Two things are narrower than the brief assumes and are
stated above: the Outlook email that carries no step (0c), and the fact that there is only one
compose client path, not three (0b).

---

## 1 · The table

`supabase/migrations/20260930_outreach_sequence_slots.sql` — the full text is at the bottom of this
report and in the chat reply. In summary:

- `outreach_sequence_slots(channel, step, lead_type, template_id, updated_at)`;
- 🔴 `unique (channel, step, lead_type)` — **two templates in one box is impossible**, not a
  precedence puzzle;
- `lead_type` is **not null** and carries `'any'` for the default column, so "no template" is the
  **absence of a row**;
- 🔴 **the channel rule is enforced in the database too** — via `foreign key (template_id, channel)
  references outreach_templates (id, channel)`, which needs a `unique (id, channel)` on
  `outreach_templates`. That constraint is the **only** thing this migration adds to that table, and
  it touches no row. The route checks the same rule first so the answer is a sentence rather than a
  constraint violation;
- RLS on, `service_role` only, `anon`/`authenticated` revoked;
- **five seed rows, by slug**, and nothing else; a slug that does not exist seeds nothing and is
  listed by the verification select;
- ends with `notify pgrst, 'reload schema';` and two verification selects.

### The grid as seeded

| | All trucks (default) | HU ordering | HU map only | On Village Foodie | Not listed |
|---|---|---|---|---|---|
| **First contact** | — | `hu_rate_email` | `hatches-up-map-only` | `general_email` | — |
| **Chase 1** | `chaser_email` | `chase-1` | ↳ chaser_email | ↳ chaser_email | ↳ chaser_email |
| **Chase 2** | — | — | — | — | — |
| **Final chase** | — | — | — | — | — |

⚠️ **Two rows are empty and one column of first contact is.** That is your data, not a bug: the five
rows are exactly the five you listed. The grid paints an empty box **red when trucks are due at it**
and prints the count, so "Chase 2 · 14 due · No template" is on screen rather than discovered when a
send does nothing.

### Every reader that changed

| Reader | Before | After |
|---|---|---|
| `ProspectWorkspace` composer pre-selection | `templateForStep(step, offerable).slug` | **`chooseForStep({slots, templates, step})`** |
| `TemplatesPanel` match count | probed `templateForStep` with a sentinel slug | asks `chooseTemplate` which box a due prospect resolves to |
| `TemplatesPanel` editor | two dropdowns that **wrote** `serves_kind` / `serves_lead_type` | **read-only "Used in"**, derived from the grid; the old tags shown underneath, greyed, labelled "no longer used to choose" |
| Send route logged kind | `body.kind` from the browser | the server's own `nextStep(...).kind` |
| `templateForStep` | the one pre-selection rule | **called by nothing.** Left in `lib/outreach-step.ts` with its harness coverage; `STEP_TEMPLATE` likewise |
| `suggestTemplateId` | ordered the chips | **unchanged** — it never pre-selected and still does not |
| `serves_kind` / `serves_lead_type` | chose templates | **read by nothing**; still displayed, still writable only by the editor's own Save |

⚠️ **I chose "read-only Used in" over deleting the two fields**, because those tags are your own marks
on rows you tagged by hand and deleting the controls would have deleted the evidence with them.

---

## 2 · The Templates tab

**"Templates — who gets which"** now sits **above** the template list, because the list is a library
of words and this is the decision.

- **Email / WhatsApp toggle**; rows are the four steps, columns are **All trucks (default)** and the
  four types **under your own names**.
- Each box is a dropdown of that channel's templates plus **"Same as default"** (type columns) or
  **"No template"** (default column). It **saves on change**, shows a small **saved**, and offers
  **Undo** naming the box.
- A box using the default shows **↳ <the inherited template's name>** — not just "same as default",
  because a column that makes you look up another row to answer the question you are looking at is
  not an answer.
- **Red**: an empty box with trucks due at it (**"↳ Nothing yet"** / **"No template"**), a box
  pointing at a **retired** template (**"retired — nothing will be sent"**), or one of the **wrong
  channel**.
- Every box carries **"n due"** — contactable prospects at that step with that type, from **the real
  `nextStep` and `effectiveLeadType`**, not a copy.
- **Truck types panel**: the four types, how each is decided (in the words of `leadTypeOf`), a live
  count, and **Rename**. A renamed label is used on the grid, the prospect page's contact card, the
  composer's suggestion line and the prospect list's step tooltip.
- **Changed type since first email**: every prospect whose recorded type differs from today's, with
  **Open**. On the prospect page such a truck shows *"Recorded as X at first contact, now Y. The
  sequence follows the first one."* with **Use current type** — 🔴 the only thing in the codebase that
  rewrites a frozen lead type, on a click, and it writes a note into the history.

---

## 3 · The send-time guards

🔴 **All of them are in the server**, in `app/api/admin/outreach/mail-send/route.ts`, after the
existing refusals and before anything is built. The composer may show the same answers early; the
decision is the route's, so a second tab, an older client or a repeated fetch hits the same wall.
The step is **re-derived** with `nextStep` from the prospect's own rows — never trusted from the
request.

| | Guard | Behaviour |
|---|---|---|
| **a** | each step goes once | **Refuses**, naming the day and whether it was found in Sent. Counts contact rows **and** message rows. An unattributable Outlook email **asks** instead (0c). |
| **b** | not before it is due | **Asks**: *"Last email was 1 day ago. Chase 2 isn't due until 9 Oct 2026. Send it now?"* |
| **c** | one click, one email | **Already existed and is kept**: `outreach_messages.idempotency_key` is `unique`, the composer keys every message by its exact content (subject + document + step + attachment paths + reply target), the server claims it **before** building anything and a repeat **returns the first result**. Send is disabled while a send is in flight. **No migration was needed.** |
| **d** | shared address | **Asks**, case-insensitively, naming the other prospect and when it was emailed, within **14 days**. |
| **e** | after the final chase | **Asks**. |
| **f** | replies | a, b and e do not apply; **c does**; the shared-address warning still does. **"Send test to me" bypasses every guard and counts towards nothing.** |
| **g** | the button | **"Send · Chase 1"**, or **"Send reply"**, from one function. |
| **h** | the logged kind | the **step**, from the server's own derivation, not the template's tag. |

A blocked send **writes nothing and sends nothing**: the route answers with the sentences and the
ids. **"Send anyway"** re-submits the identical message with `override: [ids]`, and the server writes
a line into the prospect's history — `Sent anyway: [already_sent] …` — **before** it sends, so a
failed send still leaves the evidence that a guard was waved through.

⚠️ **The override note is a `note` event, not a new event kind.** `outreach_events.kind` carries
`check (kind in ('stage_change','note'))`, and a third value would be a migration for a row whose
whole job is to be read by a human. It is written with a fixed prefix so it is greppable.

---

## 4 · The composer

- Pre-selects the grid's answer and says so: **"Suggested · HU map only · Chase 1"**, plus
  **"— from the default column"** when it came from there.
- Nothing in the box ⇒ **"No template for Not listed · First contact — pick one or write it."**
- A **retired** or **wrong-channel** box says which, rather than reading as empty.
- Unknown type, no channel, or a stopped/unreadable step each get their own sentence.
- Every other template is still **one click away** on the chips. This is an explanation, not a
  restriction.

⚠️ **Until the migration is applied** the composer pre-selects **nothing** and says: *"The sequence
grid is not set up yet — apply 20260930_outreach_sequence_slots.sql. Nothing is pre-selected until
then."* I deliberately did **not** fall back to `templateForStep` in that window: keeping the old
mechanism alive as a fallback is how three mechanisms came to exist in the first place.

---

## 5 · The harness

`scripts/outreach-sequence.cjs` — **NEW**, registered (69 harnesses), **63 checks**, **8 broken
variants**, no network, no mailbox, no database.

```
✓ FAILED as required  V1 🔴 a second chase 1 is allowed through
✓ FAILED as required  V2 🔴 an Outlook-sent email is not counted at all
✓ FAILED as required  V3 🔴 a TEST send counts as a real one
✓ FAILED as required  V4 🔴 a retired template in a box is sent anyway
✓ FAILED as required  V5 🔴 an empty own column falls through to the default even when the box is broken
✓ FAILED as required  V6 the early-chaser question is skipped
✓ FAILED as required  V7 the shared-address check is case-sensitive again
✓ FAILED as required  V8 🔴 a delete of a template row appears in the route
…
✅ all 63 passed
```

It covers: the choice rule (own column beats default, default beats nothing, wrong channel and
inactive are never picked, an unknown/stopped step picks nothing, a scheduled step still has one);
the frozen type beating the live one (through `effectiveLeadType`, which `nextStep` already uses);
the unique constraint and the composite FK **in the migration text**; every guard in §3 with its
sentence; **one click one email**; and a repo-wide census proving that **only the templates editor
writes `outreach_templates`, only insert and update, and nothing deletes**.

⚠️ Every guard read uses `?.message ?? ''`: a broken variant makes them return null, and a harness
that **throws** where it should **fail** teaches whoever hits it to weaken the check. This family has
recorded that once already.

### Stale checks, restated in place with their reasons

| File | Check | Why |
|---|---|---|
| `outreach-workspace.cjs` | "the composer still pre-selects through `templateForStep`" | one rule still — it is `chooseForStep` now |
| `outreach-workspace-v2.cjs` | "…with `templateForStep` still the one rule" | same |
| `outreach-mail-send.cjs` | "the route touches `outreach_contacts` exactly once" | **twice** now, and both are reads: the guards read the ladder. Restated as "every reference is a select" rather than re-pointed at a number that only goes up |

---

## 6 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | `✓ Compiled successfully in 5.0s` |
| eslint — all ten changed/new files | **identical to HEAD** (`SequenceGrid` and `outreach-sequence.ts` are 0/0) |
| `node scripts/outreach-sequence.cjs` | **63 checks, all passed**, 8 variants caught |
| `node scripts/run-harnesses.cjs` | **69 run · 69 passed · 0 failed** |
| goldens | `8bdae817…` and `e3f0a880…` ✅ unchanged |

No email sent. No SQL run. No `outreach_templates` row created, edited, seeded or deactivated. No
live trading truck involved. One send path, one contact writer, one follow-up writer, one `nextStep`
per page, `EMAIL_FRAME_SANDBOX` unchanged, and the four lead types still `LEAD_TYPES` in code.

**Commit `c61f9e6`**, pushed to `origin/main`. Fingerprint `0b14e384…` at push →
`8eb25157…` at **16:16:00Z**; `GET /admin/outreach/p/a5beca7f-…` → **200**.

---

## 7 · What to test — ZZ Test Prospect (Dominic) only

**Run the migration first**, then reload the Templates tab.

1. **The grid.** Every box that should hold a template does; Chase 2 and Final chase are empty and
   red where trucks are due. Change a box, see **saved**, press **Undo**, see it go back.
2. **Rename a type** — say "HU map only" → "Map only". Check it changes on the grid, on ZZ Test
   Prospect's contact card, in the composer's suggestion line and in the list's step tooltip.
3. **Flip ZZ Test Prospect's HU flags** (Edit on the contact card): with `hu_ordering` ticked the
   composer should suggest the HU-ordering template for its step; untick it and tick `hu_map` and the
   suggestion should follow. With neither, it falls to the On-VF or Not-listed box.
4. **Empty box.** Clear the box its step lands in: the composer should pre-select nothing and say
   *"No template for … — pick one or write it."* The chips still offer everything.
5. **Retire a template that is in a box** (Active off): that box goes red, and the composer says the
   template has been retired rather than quietly sending the default.
6. **Send chase 1 twice.** The second press should be **refused**, naming the day the first went.
   Press **Send it twice anyway** and check the history gets a line beginning `Sent anyway:`.
7. **Double-click Send.** One email. The second press returns the first result — check there is one
   row in the history and one copy in Sent.
8. **Send a chaser early.** With a follow-up date in the future, Send should ask: *"Last email was N
   days ago. Chase 2 isn't due until …"*. Confirm, and it goes.
9. **Shared address.** Point another prospect's truck at the same `contact_email`, email that one,
   then send from ZZ Test Prospect within 14 days: it should ask and **name the other truck**.
10. **A reply** to an inbound message should ask **none** of 6, 8 or "after the final chase", and the
    button should read **Send reply**.
11. **"Send test to me"** should bypass everything and log nothing.
12. **The type-changed notice.** With `lead_type_at_first_contact` set and today's data disagreeing,
    the contact card shows *"Recorded as X at first contact, now Y"* with **Use current type**; click
    it and check the history records it and the suggestion changes.

---

## 8 · The migration, in full

```sql
-- 20260930_outreach_sequence_slots.sql
begin;

-- The channel rule needs a composite key to point at. `id` is already the primary key, so this adds
-- no new uniqueness and cannot fail on existing data; it exists only to be referenced.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'outreach_templates_id_channel_key'
      and conrelid = 'public.outreach_templates'::regclass
  ) then
    alter table public.outreach_templates
      add constraint outreach_templates_id_channel_key unique (id, channel);
  end if;
end $$;

create table if not exists public.outreach_sequence_slots (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null check (channel in ('email', 'whatsapp')),
  step        text not null check (step in ('1_first_contact', '2_chase_1', '3_chase_2', '4_final_chase')),
  lead_type   text not null check (lead_type in ('any', 'hu_ordering', 'hu_map', 'on_vf', 'not_listed')),
  template_id uuid not null,
  updated_at  timestamptz not null default now(),
  constraint outreach_sequence_slots_box_key unique (channel, step, lead_type),
  constraint outreach_sequence_slots_template_fk
    foreign key (template_id, channel) references public.outreach_templates (id, channel) on delete cascade
);

create index if not exists outreach_sequence_slots_channel_step_idx
  on public.outreach_sequence_slots (channel, step);

alter table public.outreach_sequence_slots enable row level security;

drop policy if exists "service_role only" on public.outreach_sequence_slots;
create policy "service_role only" on public.outreach_sequence_slots
  for all to service_role using (true) with check (true);

revoke all on public.outreach_sequence_slots from anon, authenticated, public;

comment on table public.outreach_sequence_slots is
  'One template per (channel, step, lead type). lead_type = ''any'' is the default column. Server routes only.';

insert into public.outreach_sequence_slots (channel, step, lead_type, template_id)
select 'email', v.step, v.lead_type, t.id
from (values
  ('1_first_contact', 'hu_ordering', 'hu_rate_email'),
  ('1_first_contact', 'hu_map',      'hatches-up-map-only'),
  ('1_first_contact', 'on_vf',       'general_email'),
  ('2_chase_1',       'any',         'chaser_email'),
  ('2_chase_1',       'hu_ordering', 'chase-1')
) as v(step, lead_type, slug)
join public.outreach_templates t on t.slug = v.slug and t.channel = 'email'
on conflict (channel, step, lead_type) do nothing;

commit;

notify pgrst, 'reload schema';

select s.channel, s.step, s.lead_type, t.slug, t.label, t.active
from public.outreach_sequence_slots s
join public.outreach_templates t on t.id = s.template_id
order by s.channel, s.step, (s.lead_type = 'any') desc, s.lead_type;

select v.slug as missing
from (values ('hu_rate_email'), ('hatches-up-map-only'), ('general_email'), ('chaser_email'), ('chase-1')) as v(slug)
where not exists (select 1 from public.outreach_templates t where t.slug = v.slug and t.channel = 'email');
```
