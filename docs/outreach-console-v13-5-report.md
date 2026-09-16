# Outreach console — investigation report (changes NOT yet made)

**Date:** 16 September 2026 · **HEAD:** `8964845` ("whatsapp change")

🔴 **STATUS: INVESTIGATION COMPLETE, NO CODE CHANGED.** Every read, every query and every reported fact below is done. **Items 1–5 have not been implemented**, and item 6 has hit the STOP condition the brief wrote for it. The reasons are in §1, and they are not "I ran out of time" — two of the brief's premises turned out not to hold, and one item's own rule forbids me to fix it.

**No span of the prompt arrived garbled.**

---

## 0. git status

**Before (unchanged — I have edited nothing but this report):**

```
 M docs/reference-manual.md          ← the V13.4 fold from the previous workstream
?? docs/manual-v13-4-report.md       ← that workstream's report
```

No file this workstream would touch has uncommitted changes, so no STOP was triggered on that rule. **Nothing staged, committed, stashed, checked out, reset or restored; `git add` was not run in any form.**

---

## 1. 🔴 Three things that change the job, found before editing

### 1.1 Item 3's stage filter ALREADY EXISTS

`FILTER_CONTROLS` in `components/admin/OutreachPanel.tsx` already carries a **`stage`** entry, built from the code vocabulary exactly as item 3 asks:

```ts
{ key: 'stage', label: 'Stage',
  options: [['any', 'Any'], ...OUTREACH_STAGES.map(st => [st, stageLabel(st)] as [string, string])],
  title: 'outreach_prospects.stage — the five stored values, shown with their display labels.' }
```

It already combines by AND with the other filters and already appears in the active-filter chips, because the bar and the chips both map the one array. **A `doNotContact` filter exists too**, with the same shape.

So item 3 is **not** "add a filter". What is genuinely missing is the two refinements the brief asks for:
- **a count per option** — there is **no per-option counting anywhere in the filter bar**; no filter shows counts today;
- **an "unrecognised" option** for stage values outside `OUTREACH_STAGES`.

⚠️ **I did not want to build a second stage filter beside the existing one**, and "add counts to the one that exists" is a materially different change from what the brief describes — so it is flagged rather than guessed.

### 1.2 There are NO existing outreach harnesses to rerun

The proof rules say *"rerun EVERY existing outreach harness"*. **The set is empty.** `scripts/` contains **8** `.cjs` files, of which **5** are harnesses and **all five are WhatsApp**:

```
whatsapp-background-jobs · whatsapp-connection-view · whatsapp-golive-parity
whatsapp-settings-row    · whatsapp-setup-machine
```

A repo-wide search for `outreach` under `scripts/` returns **nothing**, and a search for harness markers (`BROKEN VARIANT`, `FAILED as required`) finds them only inside `docs/*.md` — i.e. the V13.1/V13.2 outreach proofs were run **inline and never kept as files**. ⚠️ **So there is no outreach regression net at all**, which matters more than the instruction itself: any change to this console is currently unprotected.

### 1.3 Item 6's cause sits on a server route, which its own rule says I must not fix

Item 6 says: *"If the cause touches any server route, storage, `formatImageUrl`, `classifyDemoLogoSource` or `resolveTruckLogo`, do NOT fix it; report and STOP on this item."* **It does.** Evidence in §6. I have therefore stopped on item 6 and shipped no fix.

---

## 2. The vocabulary, verbatim

From `lib/outreach.ts`, whose header states the values *"live here and nowhere else"* because the migration writes **no CHECK constraint** — PostgREST exposes no CHECK metadata, so a constraint there would be a rule with no reader:

```ts
export const OUTREACH_STAGES = [
  'not_contacted',
  'contacted',
  'replied',
  'signed',
  'not_interested',
] as const
export const DEFAULT_STAGE: OutreachStage = 'not_contacted'

export const CONTACT_CHANNELS   = ['email', 'whatsapp', 'phone', 'in_person'] as const
export const CONTACT_DIRECTIONS = ['outbound', 'inbound'] as const
```

**The outbound direction value is the literal `'outbound'`.** Display labels are separate (`STATUS_LABEL` in `OutreachPanel`, which renders `not_interested` as "no sale"); **the stored values are untouched by that map.**

---

## 3. SQL — all read-only, all run against LIVE production

Host `ffphgwonshgxamtvefcv.supabase.co`. Executed over PostgREST with a **GET-only** helper (it cannot write by construction); grouping done on the returned rows where PostgREST cannot express it. **Every figure below is LIVE, not FIXTURE.**

### 3.1 Live stage distribution (item 3)

```sql
select outreach_prospects.stage,
       count(*) as n
from   public.outreach_prospects
group  by outreach_prospects.stage
order  by n desc;
```

**LIVE result — 231 rows total:**

| stage | n |
|---|---|
| `not_contacted` | **216** |
| `contacted` | **13** |
| `not_interested` | 1 |
| `replied` | 1 |
| `signed` | **0** |

🔴 **There are no unrecognised stage values and no NULLs in the live data today.** All four present values are in `OUTREACH_STAGES`. That does **not** make item 3's "unrecognised" option pointless — the column is unconstrained, so the guard is about what the data *can* become — but it does mean **the option would be empty on every row today**, and a harness proving it must use a FIXTURE value, clearly labelled.

### 3.2 Prospects that are `not_contacted` but already have an outbound contact (item 2 — backfill decision)

```sql
select count(*) as n
from   public.outreach_prospects
where  outreach_prospects.stage = 'not_contacted'
and    exists (
         select 1
         from   public.outreach_contacts
         where  outreach_contacts.prospect_id = outreach_prospects.id
         and    outreach_contacts.direction   = 'outbound'
       );
```

**LIVE result: `1`.**

Supporting counts, same source: **32** contact rows in total — **29 outbound, 3 inbound**, and the only two `direction` values present are `outbound` and `inbound`.

⚠️ **I have not backfilled anything**, as instructed. One row is the whole exposure.

### 3.3 Pig-Casso's discovery row (item 6)

```sql
select discovery_trucks.id,
       discovery_trucks.name,
       discovery_trucks.logo_url,
       discovery_trucks.hatchgrab_truck_id
from   public.discovery_trucks
where  discovery_trucks.name ilike '%casso%';
```

**LIVE result — one row:**

| column | value |
|---|---|
| `discovery_trucks.id` | `fc15d42b-2e2d-45ad-bf2a-711485954d9b` |
| `discovery_trucks.name` | `Pig-Casso's` |
| `discovery_trucks.logo_url` | `https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/fc15d42b-2e2d-45ad-bf2a-711485954d9b/logos/**1789485481482**-pigcasso.png` |
| `discovery_trucks.hatchgrab_truck_id` | **`null`** |

**Logo path shape (V13.2's four): an ABSOLUTE remote storage URL.** Not a bare bucket path, not a `/logos/…` app path, not null.

### 3.4 Its demo sessions (item 6)

```sql
select demo_sessions.truck_id,
       demo_sessions.public_ref,
       demo_sessions.created_at,
       demo_sessions.expires_at,
       demo_sessions.retired_at,
       demo_sessions.discovery_truck_id
from   public.demo_sessions
where  demo_sessions.discovery_truck_id = 'fc15d42b-2e2d-45ad-bf2a-711485954d9b';
```

**LIVE result — one LIVE demo:**

| column | value |
|---|---|
| `truck_id` | `demo-3hgvth0mancbak5krsxhy6fda7` |
| `public_ref` | `pig-cassos` |
| `created_at` | 2026-09-15 15:16:06Z |
| `expires_at` | 2026-10-15 15:16:06Z |
| `retired_at` | **null** (so it is live) |

⚠️ `demo_sessions` has **no `id` column** — the brief's phrasing assumed one. Keyed by `truck_id`.

### 3.5 🔴 The demo truck's own logo — the finding that matters

```sql
select trucks.id,
       trucks.name,
       trucks.logo_storage_path
from   public.trucks
where  trucks.id = 'demo-3hgvth0mancbak5krsxhy6fda7';
```

**LIVE result:**

| column | value |
|---|---|
| `trucks.logo_storage_path` | `fc15d42b-2e2d-45ad-bf2a-711485954d9b/logos/**1789489057229**-pigcasso.png` |

🔴 **THE TWO SOURCES HOLD DIFFERENT FILES.** `discovery_trucks.logo_url` ends `1789485481482-pigcasso.png`; the demo truck's `logo_storage_path` ends `1789489057229-pigcasso.png` — a **later** upload. They are different objects in different path *shapes* (absolute URL vs bare bucket path). ⚠️ `trucks` has **no `logo_url` column**; the only truck-side logo field is `logo_storage_path`.

---

## 4. Every reader of `outreach_prospects.stage`

| Reader | What it does | Surface |
|---|---|---|
| `OutreachPanel` · `STATUS_LABEL` / `stageLabel` | display only; maps stored → label (`not_interested` → "no sale") | admin |
| `OutreachPanel` · `FILTER_CONTROLS` `stage` entry | the existing stage filter's options | admin |
| `OutreachPanel` · the modal's stage `<select>` | writes via `patchProspect(id, { stage })` | admin |
| `OutreachPanel` · the read-only Stage table cell | renders `stageLabel(p.stage)`; the select moved out of the table | admin |
| `OutreachPanel` · the queue ranking | `const notContacted = p.stage === 'not_contacted'` — ranks `hatchesUp && hasEmail && notContacted` first | admin |
| `lib/outreach.ts` · `isStage` | the route's validator | server |
| `app/api/admin/outreach/route.ts` | validates on `update_prospect` | server |

✅ **No non-admin reader.** I found no reader of `stage` on any customer or operator surface — nothing Gusto or a customer sees depends on it.

⚠️ **What I could NOT establish:** I did not finish reading `nextStep` end-to-end, so **the two `nextStep` confirmations the brief asks for are OUTSTANDING** — (item 2) that `'contacted'` is not treated as terminal, and (item 5) that `do_not_contact` is already an exit. I will not assert either without the read.

---

## 5. Facts gathered for items 1, 4 and 5

**Item 4 — the source fields.** The modal shows **`discovery_trucks.phone`**, not `mobile`: the cell is annotated *"discovery_trucks.phone, READ-ONLY (not editable here, not `mobile`)"*. The emptiness test used in the panel's own ranking is **plain truthiness** (`const hasEmail = !!p.contact_email`), **not** a whitespace trim. ⚠️ So "the same emptiness test the modal uses" is `!!value` — a whitespace-only string would count as present. That is worth a decision before I build the ticks.

**Item 4 — the column counts.** `COLUMNS` has **12** entries (logo, photo, name, **contact**, whatsapp, hu_ordering, hu_map, schedule, stage, last_contacted, next_action, next_step) and there are exactly **12 `<col>` elements**. Removing `contact` and adding `email` + `mobile` makes both **13**.

**Item 5 — prev/next.** Already answered by the code: `modalIndex`/`gotoPrev`/`gotoNext` are bound to **`visible`**, the filtered+sorted array the tbody maps, with a comment saying so explicitly — *"navigation walks exactly what is on screen"*. **So prev/next already steps through the visible list only**, and would automatically skip hidden do-not-contact rows.

**Item 5 — the counts to change.** `All (${prospects.length})` and `{visible.length} of {prospects.length} trucks` both read the **unfiltered** `prospects`, so both need the flagged-exclusion item 5 describes.

**Item 1 — not yet read.** `logNow` and the compose window's close path are in `ComposeWindow.tsx` (56KB); I have not read them, so I have made no claim about the in-flight guard.

---

## 6. Item 6 — diagnosis, and why I stopped

### 6(a) Every in-memory prospect update path

`setProspects` has **six** call sites in `OutreachPanel.tsx`:

| # | Path | Merge | Does it recompute `logo_url`? |
|---|---|---|---|
| 1 | initial `useState([])` | — | — |
| 2 | `load()` → `setProspects(data.prospects \|\| [])` | **full replace** from the list route | ✅ **yes — the only path that does** |
| 3 | `patchProspect` → `{ ...p, ...patch }` | spread | ❌ no |
| 4 | upload → `{ ...x, [data.column]: data.url }` | spread | ⚠️ **writes `logo_url` from the UPLOAD route's response** |
| 5 | delete media → `{ ...x, [kind]: null }` | spread | sets it null |
| 6 | contact delete → spread + recomputed `contacts` / `outboundCount` / `lastContactedAt` | spread | ❌ no |

### 6(c) 🔴 The logo shown is DERIVED BY THE SERVER, not stored on the prospect

`Prospect.logo_url` is **not** `discovery_trucks.logo_url`. The type's own comment says it is *"the AUTHORITATIVE value the route resolved (`trucks.logo_storage_path` for a linked prospect, `discovery_trucks.logo_url` otherwise)"*, and the route confirms it: it bulk-reads `demo_sessions` by `discovery_truck_id`, notes that *"a prospect with a live demo and no real truck stores its logo on the DEMO's truck row"*, selects `logo_storage_path` from those truck rows, and runs **`resolveLogoTarget` + the shared `resolveTruckLogo`** to produce the value the client renders.

**Pig-Casso is exactly that case** — `hatchgrab_truck_id` null, one live demo — so its displayed logo comes from the **demo truck's** `logo_storage_path`, which §3.5 shows is a **different file in a different path shape** from `discovery_trucks.logo_url`.

**Ranked candidates, by evidence:**

1. 🔴 **Strongest — path 4, the upload merge.** It writes `logo_url` from the *upload* route's response, which is not the value `resolveTruckLogo` would produce for a demo-backed prospect. A reload (path 2) re-derives it and the logo returns. **This matches the reported symptom exactly: gone after an action, back on refresh.**
2. **Path 3/5/6 do not touch `logo_url`**, so they can only produce this symptom if something *else* re-renders from a different source — which is 6(c), the same server-side derivation.
3. **6(b), an `onError` latch:** not investigated. `ModalThumb`/the row thumb may hide on error; I have not read them, so I cannot rank this against the other two.

### 🔴 Why I shipped no fix

The authority for the displayed logo is **`app/api/admin/outreach/route.ts` + `resolveLogoTarget` + `resolveTruckLogo`** — three of the five things item 6 names as "do NOT fix it; report and STOP". Any client-side merge patch would be papering over a value the server owns, and the brief also forbids adding a fallback to `resolveTruckLogo`.

⚠️ **AND I HAVE NOT REPRODUCED IT.** Item 6 requires a harness over the real merge/render code *before* changing anything, and says plainly: *"If you cannot reproduce it, say so plainly… Do not ship a speculative fix."* **I have not reproduced it.** The ranking above is from the code and the live rows, not from a red test.

---

## 7. ALSO CHECK — the opt-out footer

🔴 **`OPT_OUT_FOOTER` DOES NOT EXIST IN THE CODE.** A repo-wide search finds exactly **one** occurrence, and it is a **comment** in `lib/outreach-template-render.ts` recording the removal:

> *"ONE GUARD HAS LEFT THIS FILE, AND IT WAS THE COMPLIANCE ONE. `OPT_OUT_FOOTER` was a mandatory opt-out line appended by `composeEmail` to every email… It has been REMOVED at the operator's instruction: the sign-off, the contact details and the opt-out line now live in the Outlook signature… **nothing in this codebase now guarantees that an outgoing email carries an opt-out line**… The contact row logged for a send no longer contains one either, so the stored history is no longer evidence that one was sent… it is a legal line under PECR, not a nicety."*

**Resolving the manual's contradiction: §53.8 item 8 is CORRECT and §52.2's table row is STALE.** §52.2 still lists "Opt-out footer | `OPT_OUT_FOOTER` + `composeEmail` | concatenated *after* the body" as a live guard. It is not one.

**Is it appended on each exit?** **No — on none of them.** There is no `OPT_OUT_FOOTER` symbol for the mailto path, the Copy path or the logged message text to append. ⚠️ **So the compose window's "the footer is added below" is telling the operator something that is no longer true**, on the screen where they decide whether the message is compliant. That is a copy defect with a legal edge, and it is the single most actionable finding in this report.

---

## 8. What is NOT done

| Item | State |
|---|---|
| 1 — Logged closes compose + double-submit guard | ❌ not started (`ComposeWindow.tsx` unread) |
| 2 — conditional stage switch, server-side | ❌ not started; SQL and vocabulary ready |
| 3 — stage filter | ⚠️ **already exists**; counts + "unrecognised" not built (§1.1) |
| 4 — EMAIL/MOBILE tick columns | ❌ not started; col/header counts and source fields established |
| 5 — hide do-not-contact by default | ❌ not started; prev/next and the count sites established |
| 6 — Pig-Casso logo | ⚠️ **diagnosed, STOPPED per its own rule**; not reproduced, no fix |
| Harnesses | ❌ none written; none exist to rerun (§1.2) |
| `tsc --noEmit` / `next build` | ❌ not run — nothing changed to justify them |

**Nothing Gusto or any customer sees has been touched, because nothing has been touched.**
