# Outreach table — filtering, merged schedule, stage read-only, name-as-control

**9 September 2026.** Two files changed: `components/admin/OutreachPanel.tsx` (+150/−43) and a new
`lib/outreach-filter.ts`. **No schema change, no migration, no data write of any kind.** Nothing staged,
committed or pushed; `git add` was not run in any form.

---

## 🔴 0. THREE THINGS IN THE BRIEF ARE CONTRADICTED BY THE CODE OR THE DATA

### 0.1 The file named does not hold the table

The brief says *"the exact row shape loaded by `app/admin/outreach/page.tsx`"*. 🔎 **That file is a 15-line
server-component redirect** (`redirect('/admin?tab=outreach')`). The console is
**`components/admin/OutreachPanel.tsx`**, mounted by `app/admin/page.tsx` when `adminTab === 'outreach'`.
The route was kept only so old bookmarks resolve. **All four changes were made in the panel.**

### 0.2 🔴 "Three rows are in that state right now" — re-derived, it is **103 of 231**

The brief justifies the merged column with *"three rows are in that state right now"*. **Re-derived from
the live tables using the route's own derivation** (`buildScheduleIndex` + `scheduleFor`, name **and**
aliases, `event_date >= today`, today = 2026-09-09):

| merged Schedule state | rows |
|---|---|
| **Y (n>0)** — schedule with events ahead | **50** |
| 🔴 **Y (0)** — schedule, nothing booked ahead | **103** |
| **N** — no events known at all | **78** |
| total | **231** ✅ |

**Independent cross-check** (so the split is not an artefact of a broken date comparison): 🧪 **700 of
4,300** events are dated on or after today, held by **52 distinct `truck_name` values**; past + future =
4,300 exactly, and the future set is a **proper subset** — if `>=` were broken the count would be 0 or
4,300, and it is neither.

⚠️ **Where the "3" probably came from:** 🧪 `stage = 'contacted'` is **exactly 3** rows (228 are
`not_contacted`). That is the only 3 I can find in this data.

🔴 **This makes requirement (2) more important, not less.** Nearly half the list — 103 trucks — is in the
state that a bare number would have rendered as "0", indistinguishable from the 78 that have no schedule
at all. **Every one of those 103 has been seen trading and has gone quiet**, which is a live prospecting
signal, not an absence.

### 0.3 The WhatsApp tick is **not** derived from the shared function

The brief asks whether it is hand-entered or derived. 🔎 **Both things exist and they are different
fields** — see §1.4. The tick writes `outreach_prospects.whatsapp_confirmed` **by hand**; the *derived*
value (`whatsappHint`, from the shared `phoneWhatsApp`) is **no longer rendered anywhere in the table**.

---

## 1. DIAGNOSIS

### 1.1 The exact row shape, and where each field comes from

Built in `GET` in `app/api/admin/outreach/route.ts`, in the `.map()` over `prospects`. **Three origins:**
the prospect row, the embedded `discovery_trucks` row (PostgREST embed `truck:discovery_trucks!…fkey`), and
values derived at read time.

| field | origin |
|---|---|
| `id`, `discovery_truck_id`, `stage`, `platform`, `hu_map`, `hu_ordering`, `whatsapp_number`, `whatsapp_confirmed`, `next_action_at`, `notes` | `outreach_prospects` columns, direct |
| `contact_name`, `do_not_contact`, `entity_type` | `outreach_prospects`, **behind a capability probe** — `columnExists()` runs a cheap `select` per column; a PostgREST undefined-column error means absent, and the field is forced to `null`. **Presence of the COLUMN, not of a value** |
| `name`, `logo_url`, `contact_email`, `phone`, `mobile`, `website`, `schedule_url`, `order_url`, `excluded` | the embedded `discovery_trucks` row (`name` falls back to `'(unknown truck)'`; `excluded` to `false`) |
| `whatsappHint` | **derived** — `phoneWhatsApp(truck.phone, truck.accepted_methods).hint`, the shared function the live call button uses |
| `futureEventCount`, `lastEventDate` | **derived** — `scheduleFor(schedIdx, truck.name, truck.aliases)` |
| `outboundCount` | **derived** — `contacts.filter(c => c.direction === 'outbound').length` |
| `lastContactedAt` | **derived** — `contacts[0].contacted_at`, relying on the query's `order('contacted_at', desc)` |
| `contacts` | `outreach_contacts` rows for this prospect, grouped in memory from one paged bulk read |

⚠️ **`mobile`, `platform`, `whatsapp_number`, `entity_type`, `outboundCount` and `logo_url` are loaded but
not rendered in the table.** They are available to filter on without any new fetch.

### 1.2 What SCHEDULE and UPCOMING derived from — cited by symbol

- **`buildScheduleIndex()`** pages `discovery_events` (`truck_name, event_date`) 1,000 at a time and builds
  `norm(truck_name) → { futureCount, lastEventDate }`. `futureCount` increments when
  `e.event_date >= todayYMD`; `lastEventDate` is the **max over all dates, past or future**.
- **`scheduleFor()`** unions the truck's `name` with every entry of `aliases`, sums `futureCount` across
  those keys and takes the max `lastEventDate`.
- 🔎 **`SCHEDULE` cell** was `const hasSchedule = p.futureEventCount > 0 || !!p.lastEventDate` → `'Y'`/`'N'`.
  **Y = at least one event known, past OR future.**
- 🔎 **`UPCOMING` cell** was `p.futureEventCount` — events dated today or later, **only**.

🔴 **Matched on NAME, not the foreign key**, deliberately: the route's own note records that
`discovery_events.discovery_truck_id` is populated on a minority of future events, so an FK join reports
"no schedule" for trucks that visibly have one.

### 1.3 Every site that writes `stage`

| # | site | after this change |
|---|---|---|
| 1 | **table** `<select value={p.stage} onChange={… onPatch(p.id, { stage: e.target.value })}>` in `Row` | 🔴 **REMOVED** (requirement 3) |
| 2 | **modal** `<select value={modalProspect.stage} onChange={… patchProspect(modalProspect.id, { stage: … })}>` | ✅ **UNTOUCHED** |
| 3 | **server** `update_prospect` in `app/api/admin/outreach/route.ts` — `if ('stage' in body)`, validated by `isStage`, else HTTP 400 | ✅ **UNTOUCHED** |

✅ **CONFIRMED: no stage write path was removed from the modal.** 🧪 After the edit,
`grep -n "{ stage:" components/admin/OutreachPanel.tsx` returns **exactly one line — the modal's**. The
five stored values (`OUTREACH_STAGES`) and their display labels (`STATUS_LABEL` / `stageLabel`) are
unchanged; the table renders `stageLabel(p.stage)` as text using the same map the select used.

### 1.4 The WhatsApp tick: hand-entered, and the derived value sits elsewhere

**Two different things, and only one is written:**

- 🔴 **`WhatsAppBox` → `whatsapp_confirmed` — HAND-ENTERED.** Its `onChange` sends
  `{ whatsapp_confirmed: e.target.checked ? true : null }`. **Not derived from anything.** The route writes
  `body.whatsapp_confirmed === true ? true : null` — **true or NULL, never false.**
- **`whatsappHint` — DERIVED, read-only**, from the shared `phoneWhatsApp` in `lib/whatsapp-hint.ts`, the
  same function behind the live customer call button. It is on every row object and is **rendered nowhere**.
- ⚠️ The panel *imports* `phoneWhatsApp`, but only to build a `wa.me` link, and calls it as
  `phoneWhatsApp(p.phone, null)` — **`accepted_methods` deliberately passed as null**, so that call cannot
  produce a hint at all.

⚠️ **The manual records why the two are no longer distinguishable:** the scraped hint was taken as
confirmation for the 30 rows that had it in a one-off backfill, so those are no longer separable from
personally verified ones. 🧪 `whatsapp_confirmed` today: **30 true, 201 null, 0 false.**

---

## 2. SEPARABILITY — and a change in the tree since the brief was written

🔴 **`git status` at START, verbatim:**

```
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
```

⚠️ **The brief asks whether these hunks are separable from pending work in `scripts/run-scraper.js` and
`app/admin/page.tsx`. There is none — the tree was clean.** Those two files, and the rest of the four
uncommitted workstreams, were committed as **`6e1259b "scraper updates"`** on top of `9e83a5e`. 🧪
`git status --short scripts/run-scraper.js app/admin/page.tsx` returns nothing, and `git log -1` for both
paths is `6e1259b`.

**`git status --short` at END:**

```
 M components/admin/OutreachPanel.tsx
?? lib/outreach-filter.ts
```

✅ **Separable, trivially: one modified file and one new file, touching nothing else.** 🧪
`git diff --cached --stat` is empty — the index was never touched. 🧪 `git status --short` over
`app/manage`, `app/order`, `app/trucks`, `app/o`, `components/dashboard`, `lib/schedule-extract.ts`,
`app/api/manage` and `app/api/inbound-schedule` returns **nothing**: **no customer-facing or
operator-facing surface was touched**, so nothing here can reach Pizzeria Gusto.

---

## 3. THE FOUR CHANGES

### (1) Filtering — one pure function, in its own module

**`lib/outreach-filter.ts`** exports `matchesOutreachFilter(row, filterState) → boolean`, plus
`EMPTY_OUTREACH_FILTER`, `isFilterActive`, `hasSchedule` and `scheduleState`. **Client-side over
`prospects`, which is already loaded** — the panel's `visible` memo is now
`prospects.filter(p => matchesOutreachFilter(p, filter))`. **No new endpoint, no query params, no refetch;
the memo's dependencies are `[prospects, sort, filter]`.**

🔴 **Filtering writes nothing.** Every control calls `setF`, which is `setFilter(f => ({…f, [k]: v}))` —
React state only. Nothing in `lib/outreach-filter.ts` mutates its input or calls anything.

**Shipped filters, all combining with AND:** HU ordering, HU map, WhatsApp tick, do-not-contact, email,
phone, stage, schedule state, plus the pre-existing name search folded in as one more clause.

**🔴 The three-state controls.** `hu_map`, `hu_ordering`, `whatsapp_confirmed` and `do_not_contact` are
**all** written as true-or-NULL and never false, so **all four are `<select>`s with Any / Yes / Not
checked** — never checkboxes. ⚠️ **A documented fourth state:** `'unknown'` matches **NULL only**. A
`false` row matches neither `'yes'` nor `'unknown'` and is reachable only via `'any'`. That is deliberate —
folding `false` into `'unknown'` would re-create the exact conflation the columns exist to prevent — and
it is commented in the module.

⚠️ **Email and phone are deliberately different** and labelled Any / Has / None: absence of an address is a
fact we hold, not an unknown.

**The count line** reads `n of N trucks` whenever `isFilterActive(filter)`, and `N trucks` otherwise.

### (2) Schedule and Upcoming, merged

One column. Rendered `Y (n)` or `N`, **never a bare number**:

- **`N`** — grey, bold, **no number at all**.
- **`Y (0)`** — the `Y` dark and bold (we *do* hold a schedule), the `(0)` in **amber** — a live signal.
- **`Y (n>0)`** — dark `Y`, count in normal weight.

🔴 **`Y (0)` and `N` share no visual property**: different glyphs, different colours, and only one carries
a parenthesised count.

**How N sorts against Y (0) — the total order is `N = 0 < Y (0) = 1 < Y (1) = 2 < …`**, implemented as
`hasSchedule(p) ? p.futureEventCount + 1 : 0`. Ascending reads: no schedule first, then schedules that have
gone quiet, then by how much is booked. ⚠️ **The `+1` is the whole point** — the previous `upcoming` column
returned `futureEventCount`, which was **0 for both N and Y (0)**, the collapse this change undoes. The
value is never null, so this column never sorts to the bottom as "no value".

### (3) Stage select removed from the table, kept visible

The table cell is now read-only text: `{stageLabel(p.stage)}`, with a title of
`Stage: <label> — edit in the truck's panel`. **The column stays.** The modal's select is untouched
(§1.3). **No stored value or display label changed.**

### (4) Open column removed; the truck name is the control

The trailing `<th>` and the `<td>` holding the Open button are gone, the colgroup's `82px` actions column
with them. The name is now:

```jsx
<button onClick={() => onOpen(p.id)} title={…} className="text-left … focus:ring-2 …">{p.name}</button>
```

✅ **The same `onOpen(p.id)` handler the Open link used** — 🧪 `grep -n "onOpen(p.id)"` returns exactly one
call site. ✅ **A real `<button>`**: in the tab order, focusable, activates on **Enter and Space** natively,
with a visible `focus:ring-2`. **Not a click handler on a div.** ⚠️ The 🚫 DNC chip stays *outside* the
button, so the accessible name is the truck name and not "🚫 DNC Pizza Mondo".

---

## 4. PROOFS — each with its failure mode stated first

### 4.1 🔴 What a worthless proof would look like here

**A filter that returns every row is indistinguishable from a filter that never ran**, and an empty result
is indistinguishable from a predicate that throws and is swallowed. So every proof below reports the
**exact count against the total**, and **flags any filter returning all or none**.

### 4.2 The unit fixture — 10 assertions, and a mutation test proving it can fail

Ran against the **compiled** `lib/outreach-filter.ts` (built with `tsc`; the only edit to the emitted JS
was rewriting the `@/lib/outreach` alias Node cannot resolve — a type-only import).

An 11-row fixture including **all four states** of a nullable boolean. **10 passed, 0 failed.** The load-bearing ones:

- `huOrdering: 'yes'` → `HU-yes` **only**.
- `huOrdering: 'unknown'` → 9 rows, and **`HU-false` is absent from both lists**.
- `schedule: 'stale'` → `Sched-stale` **only**; `schedule: 'none'` → 9 rows **not including `Sched-stale`**.
- An impossible AND (`stage=signed` + `doNotContact=yes`) → **(none)**, proving the predicate is applied.

🔴 **THE MUTATION TEST — can this fixture fail?** I re-implemented `triMatch` the wrong way, as a two-state
checkbox would (`'unknown'` → `v !== true`), and ran the same fixture:

```
real   'unknown': HU-null, Email+Phone, EmailBlank, Wa-yes, DNC, Signed, Sched-ahead, Sched-stale, Sched-none
mutant 'unknown': HU-null, HU-false, Email+Phone, …
```

**They differ — `HU-false` leaks in.** The fixture catches the exact bug the three-state requirement
exists to prevent, so its passing is evidence rather than decoration.

### 4.3 The real predicate over the real 231 rows

Rows rebuilt from the live tables using the route's own derivation, then passed through the **compiled
predicate**. Pagination asserted against `count=exact` headers: `discovery_events` **4,300 fetched =
4,300 header ✅**, `outreach_prospects` **231 = 231 ✅**.

| filter | rows | verdict |
|---|---|---|
| *(no filter)* | 231 of 231 | = total ✅ |
| huOrdering = yes / unknown | **19** / **212** | proper subsets |
| huMap = yes / unknown | **121** / **110** | proper subsets |
| whatsapp = yes / unknown | **30** / **201** | proper subsets |
| doNotContact = yes / unknown | **0** / **231** | 🔴 **flagged — see below** |
| email = yes / no | **55** / **176** | proper subsets |
| phone = yes / no | **69** / **162** | proper subsets |
| stage = contacted / not_contacted | **3** / **228** | proper subsets |
| schedule = upcoming / stale / none | **50** / **103** / **78** | proper subsets, sum = 231 ✅ |
| AND: huMap=yes + email=yes | **13** | narrower than either alone (121, 55) ✅ |
| AND: huOrdering=yes + schedule=stale | **5** | narrower than either alone (19, 103) ✅ |

🔴 **`doNotContact = unknown` returns all 231 — my own "indistinguishable from no filter" flag fired.**
**It is not a broken predicate: `do_not_contact` is NULL on all 231 rows.** 🧪 Corroborated two ways — the
`yes` position returns **0**, and a direct census of the column is `{"null": 231}`. The manual already
records this field as *"not populated"*. **The filter is correct and the data makes that position vacuous
today**; it stops being vacuous the moment one truck is flagged. ⚠️ **Reported rather than quietly
presented as a pass.**

**Partition check** — for each tri-state column, `yes + unknown + false-rows` must equal 231. 🧪 All four
partition exactly, with **0 false rows** in every case. This is what proves `'unknown'` is matching NULL
and not silently absorbing anything else.

### 4.4 Build

🧪 `npx next build` → **exit 0**, `/admin` and `/admin/outreach` both in the route table, no errors.
🧪 `npx tsc --noEmit` → **exit 0, 0 errors**.

### 4.5 🔴 What I could NOT prove, and did not

**The component was never mounted or rendered.** There is no `jsdom`, no test runner and no `esbuild` in
this repo, and installing one would modify `package.json` and the lockfile — files you stage by hand.
**I did not install anything, so there is no browser render, no intercepted-network run, and no click of
any control.**

**Therefore, stated plainly:** the filter *logic* is proven against real data; **the filter bar, the merged
cell's appearance, the name button's focus behaviour and the read-only stage cell are UNVERIFIED — reasoned
from the source and confirmed only by the compiler.** ⚠️ **No write and no read was verified through an
admin session; none is obtainable here** (manual V12.2, "NO ADMIN SURFACE CAN BE VERIFIED BEFORE THE
OPERATOR SEES IT"). The 231-row proof in §4.3 is a **direct service-role read of the tables replicating the
route's derivation — it is not the route, and not the page.**

---

## 5. THINGS I DID NOT TOUCH

- **Item 5 (logo/photo upload)** — not started, as instructed.
- **The modal** — apart from nothing: it is byte-unchanged.
- **`app/api/admin/outreach/route.ts`** — unchanged. No new endpoint, no new query parameter.
- **`discovery_trucks.excluded`** — still not surfaced on this page.
- **The default priority sort**, the contact log, `next_action_at`, and every write path other than the
  table's stage select.
- ⚠️ **`whatsappHint`** is still computed by the route and still rendered nowhere. **Left alone** — removing
  it is a separate decision, and it is the one field that could distinguish a scraped hint from a personal
  confirmation if the backfill is ever unpicked.
