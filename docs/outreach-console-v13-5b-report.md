# Outreach console — round 2 build report

**Date:** 16 September 2026 · **HEAD:** `8964845` ("whatsapp change")
**Items 1, 2, 4, 5 implemented · label fixed · item 6 REPRODUCED, no fix shipped (reason in §8).**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0. git status

**Before:**
```
 M docs/reference-manual.md          ← allowed by the brief (V13.4 fold)
?? docs/manual-v13-4-report.md       ← allowed by the brief
?? docs/outreach-console-v13-5-report.md   ← round 1's report
```
No file this round needed was dirty, so no STOP. **Nothing staged, committed, stashed, reset or restored; `git add` was not run in any form.**

**After:**
```
 M app/api/admin/outreach/route.ts
 M components/admin/ComposeWindow.tsx
 M components/admin/OutreachPanel.tsx
 M docs/reference-manual.md          ← untouched by this round
 M lib/outreach-filter.ts
 M lib/outreach-step.ts
?? scripts/outreach-channel-for.cjs
?? scripts/outreach-dnc-pool.cjs
?? scripts/outreach-list-columns.cjs
?? scripts/outreach-log-once.cjs
?? scripts/outreach-logo-latch.cjs
?? scripts/outreach-stage-advance.cjs
```

---

## 1. R1 — `nextStep`, read end to end

### (a) Is `'contacted'` terminal? **NO.** Item 2 is safe.

```ts
/** Stages that end the sequence. 🔴 `replied` is here AND detected from contacts — either is enough. */
const TERMINAL_STAGES = new Set(['signed', 'not_interested', 'replied'])
…
if (p.stage && TERMINAL_STAGES.has(p.stage)) return stop('stage', `Stage is ${p.stage.replace(/_/g, ' ')}`)
```

`'contacted'` is **not** in that set. And the evidence is stronger than the set membership: the rung ladder is derived from **contact rows**, never from `stage` —

```ts
const outbound = contacts.filter(c => c.direction !== 'inbound')
…
const highestIdx = rungs.reduce((acc, k) => Math.max(acc, CONTACT_KINDS.indexOf(k)), -1)
```

So moving the stage to `contacted` **cannot change any prospect's next step**: the only thing `stage` does in `nextStep` is the terminal test above.

### (b) Is `do_not_contact` an exit? **YES — the first one.**

```ts
// ── 1. STOPS, in order of certainty ──
if (p.do_not_contact === true) return stop('do_not_contact', 'Do not contact')
```

⚠️ Note `=== true`, which is exactly the test item 5 specifies: null and false are **not** flagged.

---

## 2. R2 — `logNow`, and how a new contact reaches the UI

**`logNow` (`ComposeWindow`), as it was:**
```ts
const logNow = async () => {
  setPending(null)
  if (logging || !body.trim()) return
  if (refusal) { setSendError(refusal); return }
  setLogging(true)
  const ok = await onLog(fullText, selected?.channel ?? 'email', selected?.servesKind ?? null)
  setLogging(false)
  if (ok) setLogged(true)          // ← and nothing else: the window stayed open
}
```

🔴 **`logging` is React STATE**, so two clicks in one tick both read the pre-update value and both proceed. That is the recorded 0.755s double-log.

**🟢 ROUND 1 WAS WRONG ABOUT THE REFRESH, AND THIS CORRECTS IT.** Round 1 said "no `setProspects` path for logging". There is one, indirectly: `logContact` in `OutreachPanel` ends with

```ts
showToast('Logged', newId ? …undo… : undefined)
await load()          // ← re-reads the list route; load() does setProspects(data.prospects || [])
return true
```

So the list **and** the modal already refresh from the list route on a successful log. That changed item 1's design — see §3.

---

## 3. Item 1 — "Logged" logs and closes

**Changed in `ComposeWindow` · `logNow`, plus a new `logInFlight` ref beside `closeRef`.**

- **A synchronous ref gate, first:** `if (logInFlight.current) return`. Claimed with `logInFlight.current = true` **after** the pre-existing guards (`logging`/`body`, then `refusal`) so a refusal does not lock the button, and **released in a `finally`** so a thrown `onLog` cannot disable logging for the life of the window.
- **`onClose()` on success only.** The prospect modal underneath is untouched — `onClose` only clears `composeOpen`; `modalId` is a different state.
- **On failure the window stays open**, `logged` is not set, and the error is shown (`onLog` raises its own toast; `setSendError(null)` is cleared before the attempt).
- **The button was already `disabled={logging || logged || !body.trim()}`** — no change needed.

**Refresh approach chosen: re-read via `load()`. Why:** it already happens inside `logContact`, and the brief's stated preference matches the round-1 finding — a hand-built merged row would overwrite `logo_url`, which the **server derives** (§8). Nothing is merged by hand on this path.

---

## 4. Item 2 — the conditional stage advance

**Changed in `app/api/admin/outreach/route.ts` · action `log_contact`.**

```ts
const CONTACTED_STAGE: OutreachStage = 'contacted'
…
if (direction === 'outbound') {
  const { data: moved, error: sErr } = await supabase
    .from('outreach_prospects')
    .update({ stage: CONTACTED_STAGE, updated_at: new Date().toISOString() })
    .eq('id', prospect_id)
    .eq('stage', DEFAULT_STAGE)          // 🔴 the condition, in the QUERY
    .select('id, stage')
  …
}
return NextResponse.json({ ok: true, id: …, stage: resultStage, warning: stageWarning })
```

- **`DEFAULT_STAGE` is imported** from `lib/outreach.ts`. `CONTACTED_STAGE` is annotated `OutreachStage`, which is the real check: it becomes a compile error the day `'contacted'` leaves the vocabulary. ⚠️ I first wrote `OUTREACH_STAGES[1]` and claimed it was compile-checked — **it was not**; an index survives a reorder and silently writes a different stage. Corrected before any proof was run.
- **`.select()`** so the affected-row count is observable: in PostgREST an UPDATE matching nothing is **not** an error.
- **`updated_at`** set the same way `update_prospect` does (`new Date().toISOString()`).
- **Failure keeps the contact**: logged to the server console, returns `warning`, never throws. `logContact` shows it with `showToast(String(warning))`.
- ⚠️ **`stage: null` does not mean "now not_contacted"** — it means this call did not move it (already advanced, inbound, or the update failed). Documented at the return and at the client read.

**No backfill was performed.**

---

## 5. Item 4 — EMAIL and MOBILE ticks

**Changed in `OutreachPanel`** (`SortKey`, `COLUMNS`, the sort `case`s, the `<colgroup>`, the row cells) **and `lib/outreach-step.ts`** (the extraction).

- **`contact` removed** from `COLUMNS`, its `<col>` and its `<td>`. **`channelFor` is untouched** and still gates the queue.
- **Extracted `hasValue`** from `channelFor` — `!!(v ?? '').trim()` — and rewrote `channelFor` to call it. Identical results, proved over 343 FIXTURE inputs (§7).
- **EMAIL** ticks on `hasValue(p.contact_email)`; **MOBILE** on `hasValue(p.phone)`.
  - ⚠️ **`phone`, not `mobile`** — the modal's cell is annotated *"discovery_trucks.phone, READ-ONLY (not editable here, not `mobile`)"*, and the brief asks for the field the modal shows.
  - ⚠️ **`channelFor` has no standalone test on raw `phone`** — its WhatsApp half tests `waPhone`, already normalised by the caller. So the shared thing extracted is the *presence predicate*, applied to each field.
- **Glyphs, not inputs:** `✓` / a muted `—`, with `aria-label`s. Every other tick in this table is an editor, so a checkbox — even disabled — would read as a control.
- **Widths:** email `76px`, mobile `82px` (replacing contact's `150px`).
- **Counts: COLUMNS = 13, `<col>` = 13, header cells = 13.** The headers are rendered by `COLUMNS.map`, so the header count *is* the COLUMNS count by construction — asserted in the harness rather than assumed.
- **Removed as orphaned:** `contactTitle`, `contactChannel`, `lead` (all existed only for that cell) and the `LEAD_LABELS` import. ⚠️ I first claimed `contactChannel` and `lead` were still used; lint proved otherwise and the comment was corrected.

### SQL — blank-value check (LIVE)

```sql
select count(*) filter (where discovery_trucks.contact_email is not null and btrim(discovery_trucks.contact_email) = '') as blank_email,
       count(*) filter (where discovery_trucks.phone is not null and btrim(discovery_trucks.phone) = '') as blank_phone
from   public.discovery_trucks;
```

**LIVE result: `blank_email = 0`, `blank_phone = 0`** (over 231 rows). Context, also LIVE: 61 non-empty emails, 71 non-empty phones; 170 null emails, 160 null phones. **No rows to report, and the test was not changed.**

---

## 6. Item 5 — do-not-contact hidden by default

**The removed filter's options, verbatim:**
```ts
{ key: 'doNotContact', label: 'Do not contact', noColumn: true,
  options: [['any', 'Any'], ['yes', 'Yes'], ['unknown', 'No']],
  title: 'outreach_prospects.do_not_contact — a flag you set. Yes = flagged do-not-contact. No = not
          flagged (stored as NULL; nothing ever writes false). No table column; shows as the 🚫 DNC
          chip on the Truck cell.' }
```
It defaulted to `'any'` — **flagged prospects were shown unless the operator opted out**. Also removed: its predicate `if (!triMatch(row.do_not_contact, f.doNotContact)) return false`, its key from the filter type and defaults, and its clause in `isFilterActive` (`lib/outreach-filter.ts`).

**The replacement is one `pool`, and that is the design:**
```ts
const [showDoNotContact, setShowDoNotContact] = useState(false)   // unticked every load, not persisted
const pool = useMemo(() => (showDoNotContact ? prospects : prospects.filter(p => p.do_not_contact !== true)), …)
const hiddenDnc = useMemo(() => (showDoNotContact ? 0 : prospects.filter(p => p.do_not_contact === true).length), …)
```

🔴 **Filtering in four places would be four copies of one rule.** `pool` is the single point, and everything derives from it.

### Every count site found, and what each now reads

| Site | Before | After |
|---|---|---|
| `steps` map | `for (const p of prospects)` | **`pool`** (+ dep) |
| `channels` map | `for (const p of prospects)` | **`pool`** (+ dep) |
| `computedVisible` | `const rows = prospects` | **`pool`** (+ dep) |
| `All (N)` | `prospects.length` | **`pool.length`** |
| `{visible.length} of {N} trucks` | `prospects.length` | **`pool.length`** |
| `Due work (N)` — `dueCounts.total` | iterates `steps` | excluded **via `steps`** |
| `Needs details (N)` — `dueCounts.leads` | iterates `steps` | excluded **via `steps`** |
| `⚠ N needs a look` — `dueCounts.unknown` | iterates `steps` | excluded **via `steps`** |
| modal `{modalIndex+1} / {visible.length}` | derived from `visible` | correct for free |

🔴 **A dependency bug I introduced and fixed:** `computedVisible` read `pool` but still listed `prospects` in its dep array, so the tickbox would not have recomputed the list. Caught by `react-hooks/exhaustive-deps`, fixed to `[pool, sort, filter, listView, steps, channels]`.

- **The tickbox** sits in the filter bar and is deliberately **not** in `FILTER_CONTROLS`: everything there is a per-row predicate ANDed inside `matchesOutreachFilter`, whereas this chooses the **pool** those predicates run over — which is what lets it narrow the counts, not just the rows. It is also deliberately a checkbox where the bar's stated rule is "every control is a `<select>`" — that rule protects three-valued nullable columns; this is a two-position choice about my own view and writes nothing.
- **The note** `{hiddenDnc} hidden — do not contact` renders only while something is hidden.
- **Flagged rows already carry a visible marker** (`{p.do_not_contact === true && …}` on the Truck cell, the 🚫 DNC chip) — unchanged, so "visibly marked when shown" was already satisfied.
- **`prospects` itself is never filtered**, so a prospect flagged while its modal is open keeps rendering — **the modal stays open**.
- **prev/next**: bound to `visible`, which derives from `pool`, so navigation steps through the visible list only and skips hidden rows automatically. ⚠️ **If a prospect is flagged while its modal is open**, it leaves `pool` on the next render, so `modalIndex` becomes `-1`; the header shows "filtered out" and **both prev and next are disabled** (`canPrev`/`canNext` both require `modalIndex >= 0`). The operator closes the modal and continues. That is existing behaviour for any row filtered out under an open modal, not new.
- **The modal control writes** `do_not_contact: e.target.checked ? true : null` via `patchProspect`, which updates state in place — so the list reflects it without a refresh.

---

## 7. Harnesses — all kept as files

All six are `scripts/outreach-*.cjs`, following the five `scripts/whatsapp-*.cjs`: they compile TypeScript with the repo's own `tsc` into a temp dir (a temp `tsconfig` supplies `baseUrl`/`paths` for `@/lib/...`), and a `Module._resolveFilename` hook maps `@/` to the compiled tree because tsc leaves the alias in the emitted `require()` calls. Source-reading harnesses read the file directly.

| Harness | Failure mode | Broken variant → result | Real result |
|---|---|---|---|
| `outreach-channel-for` | `channelFor` returns a different channel after the extraction — the queue's gate silently changed | V1 drops `.trim()`, V2 loose `whatsapp_confirmed`, V3 precedence flipped → **all 3 FAILED as required** | ✅ identical across **343** FIXTURE inputs; `hasValue` correct on 8 cases |
| `outreach-log-once` | two contacts for one message | V1 React-state-only → **FAILED as required, on the double-press assertion** | ✅ 15 passed |
| `outreach-stage-advance` | a hand-set stage overwritten, or inbound advancing it | V1 unconditional, V2 fires on inbound, V3 no `.select()`, V4 reports the log failed → **all 4 FAILED as required** | ✅ 25 passed |
| `outreach-list-columns` | `<col>` ≠ header count (the V13.2 defect); a tick disagreeing with the queue | V1 missing `<col>`, V3 truthiness instead of `hasValue` → **both FAILED as required** | ✅ 18 passed |
| `outreach-dnc-pool` | a flagged prospect hidden from rows but still counted | V1 pool never filtered, V3 silent suppression → **both FAILED as required** | ✅ 26 passed |
| `outreach-logo-latch` | fails to reproduce | control (a thumb that also resets on refresh) **recovers**, so the latch is the mechanism | ✅ **REPRODUCED** |

### 🔴 Two harness defects I found and fixed, recorded because they are the failure this brief names

1. **`outreach-log-once`'s broken variant initially PASSED the assertion that mattered.** It set `state.logging = true` **synchronously**, which blocks the second call — so it was caught only on incidental differences. That is a green proof proving nothing. The variant now defers the write to a microtask, faithfully modelling `setState`, and **fails on the double-press assertion itself**.
2. **`outreach-dnc-pool` asserted `Due work` = 2; the correct figure is 3.** The unflagged fixture holds 2 due + 1 unknown. **My arithmetic was wrong, not the code** — recorded at the line, because a test corrected to match the code is exactly the move that needs justifying in writing.

### What the harnesses do NOT prove, stated plainly

- **`outreach-log-once` and `outreach-logo-latch` model component state**, because this repo has no test renderer. Each pairs the model with **source assertions** pinning that the real function has that structure; a model alone would be theatre.
- **`outreach-dnc-pool` cannot separate `!== true` from `!p.do_not_contact`** — they agree on every value the column can hold. `!== true` is pinned by a source check because it matches `nextStep`'s own stop, not because a fixture caught the alternative.

---

## 8. Item 6 — REPRODUCED, and why no fix shipped

### 6.1 Both files exist

```
…/logos/1789485481482-pigcasso.png  →  HTTP 200
…/logos/1789489057229-pigcasso.png  →  HTTP 200
```
**Neither is missing.** This rules out storage as the cause.

### 6.2 The exact string the route produces

`resolveTruckLogo` is:
```ts
return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${logoStoragePath}`
```
Pig-Casso has **no** `hatchgrab_truck_id` and **one live demo**, so `resolveLogoTarget` picks the demo truck, whose `logo_storage_path` is `fc15d42b…/logos/1789489057229-pigcasso.png`. The route therefore returns, and both thumbs render `src` from:

```
https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/fc15d42b-2e2d-45ad-bf2a-711485954d9b/logos/1789489057229-pigcasso.png
```

⚠️ **Not** the `1789485481482` file held in `discovery_trucks.logo_url`. The two sources hold different objects; the demo's is newer.

### 6.3 🔴 The cause — an error latch that never retries

Both `Thumb` (row) and `ModalThumb` do exactly this:
```ts
const [broken, setBroken] = useState(false)
useEffect(() => { setBroken(false) }, [value])     // resets ONLY when `value` CHANGES
<img src={src} onError={() => setBroken(true)} />
```
**The hidden state is latched on the value, not on the attempt.** One transient load failure sets `broken`; every later re-render with the same `logo_url` keeps it, because the reset effect's dependency never changes. `load()` re-reads the route, which for an unchanged row returns an **identical string** — so refreshing the data does **not** clear the latch. Only a **remount** does, which is what a page refresh performs. **That is the reported symptom exactly.**

### 6.4 `load()` callers

On mount (`useEffect`), after a failed `patchProspect` save, after a contact delete, **after every successful `logContact`**, and from the Create Demo path. **No polling and no focus refetch.** The upload path does **not** call `load()` — it spreads `data.url` from the upload route over `logo_url`, which is the second candidate; it is ranked below the latch because it requires an upload, while the reported symptom follows ordinary actions.

### 6.5 The reproduction, and the decision

`scripts/outreach-logo-latch.cjs` reproduces it deterministically: mount → visible; one transient failure → hidden; `load()` with the identical URL → **still hidden**; second `load()` → **still hidden**; remount → **visible again**. Its control — a thumb that also resets on a data refresh — **recovers**, which is what attributes the symptom to the latch rather than to anything else.

🔴 **NO FIX IS SHIPPED, AND THIS IS A JUDGEMENT I AM FLAGGING RATHER THAN TAKING.** The brief says fix it if it reproduces and is client-side, and it is both. I have not, because **the latch is deliberate**: the source states that a broken value must not render as "an inviting empty slot", and the ⚠ marker is *"reachable only after a real load failure"*. Making it retry weakens a guard that was designed on purpose, and the right fix (reset `broken` when the row is refreshed, e.g. a refresh nonce in the dependency) changes when that guard clears for **every** prospect, not just Pig-Casso. The candidate fix is written and proven viable by the harness's control. **Say the word and I will ship it.**

⚠️ **Also not established:** I have not observed the original transient failure, so I cannot say *why* the first load failed. The latch explains the persistence and the refresh-recovery; it does not explain the first failure.

---

## 9. Label fix

`ComposeWindow`:

| | |
|---|---|
| **Before** | `Message — exactly what will be sent (the footer is added below)` |
| **After** | `Message — exactly what will be sent. No opt-out line is added here: it must be in your Outlook signature.` |

**Every other claim that a footer is appended — repo-wide search, excluding `docs/`: none.** `OPT_OUT_FOOTER` appears in **no** code file; the only occurrence outside `docs/` is the comment in `lib/outreach-template-render.ts` recording its removal. Within `docs/` the stale claims are `docs/outreach-templates-report.md`, `docs/outreach-templates-table-report.md` and `docs/reference-manual.md` §52.2 (§10). **No template content and no send behaviour changed.**

---

## 10. Manual sections this round makes stale (NOT edited)

| Section | Why |
|---|---|
| **§52.2** | Lists "Opt-out footer — `OPT_OUT_FOOTER` + `composeEmail` — concatenated after the body" as a live guard. **It does not exist.** §53.8 item 8 is the correct record. |
| **§52.1** | "Prospect modal … compose entry point" — the compose window now closes on a successful log. |
| **§57.2** | Describes the contactable gate; `channelFor` now calls the extracted `hasValue` (results identical, proved). |
| **§52 / list columns** | The CONTACT column is gone, replaced by EMAIL and MOBILE ticks; the table is 13 columns. |
| **§52 (filter bar)** | The `doNotContact` tri-state filter is gone, replaced by a "Show do not contact" tickbox that narrows the pool. The bar's "every control is a `<select>`" rule now has one deliberate exception. |
| **new** | `log_contact` now advances `not_contacted → contacted` on an outbound contact, and returns `stage` and `warning`. |
| **new** | The console now has a regression net: six `scripts/outreach-*.cjs` harnesses. Round 1 found there were none. |

---

## 11. Verification

| Check | Result |
|---|---|
| `scripts/outreach-*.cjs` (6) | ✅ all pass; every broken variant failed first |
| `scripts/whatsapp-*harness*.cjs` (5) | ✅ 48 / 87 / 37 / 131 / 30 — all pass |
| `npx tsc --noEmit` | ✅ clean |
| `npx next build` | ✅ **SUCCESS** — compiled in 4.7s, 95/95 static pages |
| eslint vs a clean HEAD worktree (5 changed files) | **24 errors / 1 warning at HEAD, 24 / 1 now — delta 0 on every rule.** All pre-existing (`no-explicit-any` ×14, `set-state-in-effect` ×9, `immutability` ×1, `exhaustive-deps` ×1). |

**Nothing Gusto or any customer sees is touched.** Every change is in the admin console, its route action, or two admin-only lib modules; `channelFor`'s results are unchanged, and `formatImageUrl`, `classifyDemoLogoSource`, `resolveLogoTarget`, `resolveTruckLogo`, the upload route and storage were not modified. No migration. No `outreach_templates` row created, edited, seeded or deactivated.
