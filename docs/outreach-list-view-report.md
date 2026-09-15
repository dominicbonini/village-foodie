# The outreach list view — information design review

**14 September 2026. READ-ONLY.** No code changed, no migration, no database query. The only file
written is this report. Options are laid out; nothing is chosen and nothing is built.

⚠️ **I CANNOT SEE A SCREEN.** Every layout statement below is a READ of a class chain or a declared
width, never an observation.

---

# 🔴 PREMISE CORRECTIONS — FIVE, AND THE FIRST ONE IS A BUG I INTRODUCED

## 1 · 🔴 THE TRUNCATION IS A DEFECT, NOT A DESIGN CHOICE — AND IT IS MINE

Dominic reports email, phone and dates truncating mid-value at full browser width. **That is not the
columns being too narrow for the content. It is one missing `<col>`.**

🔎 **READ:**
- `COLUMNS` has **13** entries: logo · photo · name · phone · whatsapp · email · hu_ordering · hu_map ·
  schedule · stage · last_contacted · next_action · **next_step**
- `<thead>` maps over `COLUMNS`, so **13 `<th>`** render. The `Row` body renders **13 `<td>`**.
- The `<colgroup>` contains **12 `<col>`**, summing to **1198px** — re-derived:
  `64 + 64 + 170 + 115 + 72 + 210 + 76 + 68 + 78 + 105 + 88 + 88 = 1198`
- The table is `<table className="table-fixed text-sm w-full" style={{ minWidth: '1198px' }}>`

🔴 **The file states the invariant I broke, in its own words:**
> *"THE SUM OF THESE EQUALS `minWidth` EXACTLY (1198px), AND THAT IS THE POINT. Every previous version
> had minWidth ABOVE the colgroup sum (1510 vs 1348, then 1638 vs 1476), and `table-fixed` distributes
> that surplus across every column — so each one rendered WIDER than its declared value and the table
> sprawled."*

**What that means now** (INFERRED from the fixed-table-layout rule plus the READ values — I have not
rendered it): under `table-fixed`, columns take their `<col>` width; **columns with no declared width
absorb the remaining space**. `w-full` makes the table as wide as its container (up to
`max-w-[1800px]`). So on a wide window the twelve declared columns stay pinned at exactly 115px (phone),
210px (email) and 88px (each date) **no matter how wide the browser is**, and every spare pixel — up to
roughly **600px** in an 1800px container — goes to the one undeclared column, `next_step`.

🔴 **So widening the window does not widen Email. It widens Next step.** That is precisely the symptom
reported, and it appeared the moment the queue task added a 13th column without adding a 13th `<col>`.

⚠️ **A second symptom of the same omission:** 🔎 the empty-state row is still
`<td colSpan={12}>` — it now under-spans the table by one column.

🔴 **THIS CHANGES THE QUESTION THE REVIEW WAS ASKED.** "Contact details do not belong in the list" is a
reasonable design position, but it is being argued from evidence produced by a one-line bug. **The list
should be seen with the `<col>` restored before the columns are judged.** I have not fixed it — this is
read-only — and §H1 carries it as the first option.

## 2 · The filter bar has **12** controls, not 10

🧪 Re-derived from `FILTER_CONTROLS`: `logo · photo · search · phone · whatsapp · email · huOrdering ·
huMap · schedule · stage · nextAction · doNotContact` = **12** (one text input, eleven selects). 🔎 None
is conditionally rendered — the bar is a plain `.map` with no guard — so all twelve are always on screen.

## 3 · Filters **are** persisted — in localStorage, not the URL

🔎 `FILTER_STORAGE_KEY = 'hg.outreach.filter.v1'`, read on mount (guarded for SSR) and written on every
change, with an unusable blob removed rather than re-read. 🧪 **No URL param anywhere in the panel** —
searched `searchParams`, `useSearchParams`, `history.replaceState` alone: zero hits. *Positive control
over the same repo:* 13 files use `useSearchParams` and 32 use `localStorage`, so the search finds both
where they exist. **Consequence: a filtered view cannot be linked or bookmarked, but it does survive a
reload.**

## 4 · Nothing new is committed — HEAD has not moved

`HEAD` is still **`e8b59e5 outreach`**. The queue build, the freeze build and the prune fix are all still
in the working tree.

## 5 · The 76/155/104 figures are Dominic's and I have not re-derived them

The rules say to re-derive every number; these are database counts and this task queries nothing. They
are carried as his, attributed, and §SQL 1–3 re-derive them. 🔴 **Every number I *could* derive — the
column counts, the 1198px sum, the filter count, the predicate behaviour — is derived below.** Notably
🧪 **`channelFor` already computes exactly his contactability rule**, so 76 is not a new definition.

### The two git commands, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   .github/workflows/discovery_prune.yml
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/ComposeWindow.tsx
	modified:   components/admin/OutreachPanel.tsx
	modified:   components/admin/TemplatesPanel.tsx
	modified:   docs/scraper-reference-manual.md
	modified:   lib/outreach-template-render.ts
	modified:   scripts/prune-discovery-events.mjs

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-lead-type-freeze-report.md
	docs/outreach-queue-report.md
	docs/outreach-sequence-review-report.md
	lib/outreach-step.ts
	supabase/migrations/20260914_outreach_lead_type_freeze.sql

no changes added to commit (use "git add" and/or "git commit -a")
════
e8b59e5 outreach
3a95e9f demo
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
```

⚠️ `/usr/bin/git` is a license-blocked Xcode shim here (`exit 69`); these ran through
`/Applications/Xcode.app/Contents/Developer/usr/bin/git`. **`sudo xcodebuild -license` once.**

### Admin-only — confirmed, with one shared component flagged

`OutreachPanel` ← `app/admin/page.tsx` only. 🔴 **One shared dependency:** `components/admin/InlineField`
— the phone and email editors — is also imported by **`components/admin/EventRowCells.tsx`** and
**`components/admin/DiscoveryEventsPanel.tsx`**. All three are admin; **none is an operator or customer
surface**, so nothing here needs to stop. ⚠️ But `InlineField` carries the `truncate` class itself
(`w-full … truncate`), so **changing truncation there changes the Discovery Events panel too.**

---

# A · THE COLUMN INVENTORY

🔎 All READ. "In the modal?" distinguishes *shown* from *editable*, because they differ and the
difference decides what a column is for.

| # | Column | Renders | Source | Stored/derived | Truncates? | Sorts | Filters | In the modal? |
|---|---|---|---|---|---|---|---|---|
| 1 | **LOGO** | 40px thumb + drop target | `discovery_trucks.logo_url` | stored | n/a | ✅ present-first | ✅ has/missing | 🔴 **shown + DELETE only** — `ModalThumb`, no upload |
| 2 | **PHOTO** | as above | `photo_url` | stored | n/a | ✅ | ✅ | 🔴 same |
| 3 | **TRUCK** | name, a `<button>` that opens the modal | `discovery_trucks.name` | stored | ✅ `truncate`, 170px | ✅ | ✅ via `search` | title only |
| 4 | **PHONE** | inline-editable value | `discovery_trucks.phone` | stored | ✅ `InlineField` is `truncate`, 115px | ✅ | ✅ has/missing | ✅ **editable, + a Call link** |
| 5 | **WHATSAPP** | a checkbox | `outreach_prospects.whatsapp_confirmed` | stored | n/a | ✅ | ✅ tri-state | ✅ **editable (`WhatsAppBox`), + a wa.me link** |
| 6 | **EMAIL** | inline-editable value | `discovery_trucks.contact_email` | stored | ✅ 210px; the file's own note says the median address is 25 chars and *"~63% fit untruncated at rest"* | ✅ | ✅ has/missing | ✅ **editable, + a mailto link** |
| 7 | **HU ORDERING** | tri-state box | `outreach_prospects.hu_ordering` | stored | n/a | ✅ | ✅ | 🔴 **NO — the list is the ONLY editor** |
| 8 | **HU MAP** | tri-state box | `hu_map` | stored | n/a | ✅ | ✅ | 🔴 **NO — the list is the ONLY editor** |
| 9 | **SCHEDULE** | `Y (n)`, a button opening the schedule popup | **derived** `scheduleState`/`futureEventCount` | derived | ✅ 78px | ✅ | ✅ | ✅ as "Upcoming" in `ProspectMetaFacts` |
| 10 | **STAGE** | label, read-only | `outreach_prospects.stage` | stored | ✅ 105px | ✅ | ✅ | ✅ **editable** in the locked meta strip |
| 11 | **LAST CONTACTED** | date | **derived** — newest contact row | derived | ✅ 88px | ✅ | ❌ **no filter** | ✅ in `ProspectMetaFacts` |
| 12 | **NEXT ACTION** | date + red ⚠ when overdue | `next_action_at` | stored | ✅ 88px | ✅ | ✅ overdue/scheduled/none | ✅ **editable** in Detail |
| 13 | **NEXT STEP** | derived rung + state | **derived** `nextStep` | derived | ✅ (but see premise 1 — it is the column absorbing all surplus) | ✅ | ❌ **no filter** (the Due toggle instead) | 🔴 **NO — list only** |

## 🔴 THE CUT LIST — columns whose only current use is "I can see it"

**Strictly: three, and only three.** A column earns its place if it is the *only* editor, the *only*
trigger, or carries a value found nowhere else.

| Column | Why it is on the cut list |
|---|---|
| **PHONE** | The value is editable in the modal, the Call link is in the modal, and the **presence filter does not need the column** (§B). Its only list-exclusive job is *displaying a number you cannot dial from here* (§E). |
| **EMAIL** | Identical. 🧪 210px — the widest column on the row — for a value the file itself records as truncating on ~37% of rows at rest. |
| **LAST CONTACTED** | Shown in the modal, **has no filter at all**, and is a strictly weaker version of NEXT STEP / NEXT ACTION for deciding what to do. Its only use is glanceability. |

**Deliberately NOT on the cut list, and this is the finding that matters most:**

- 🔴 **HU ORDERING and HU MAP are the ONLY place those two flags can be set.** 🧪 `TriStateBox` appears
  4× in the file and **zero times inside `Detail`**. Cutting them removes the only editor for two fields
  that drive lead type 1 and 2 — and lead type is now frozen at first contact, so a flag set late is a
  framing set wrong.
- 🔴 **LOGO and PHOTO are the ONLY upload path.** 🧪 `MediaCell` appears 4× — the definition, one
  comment, and the two list cells. **None in the modal**, whose `ModalThumb` shows and deletes but does
  not upload.
- **WHATSAPP** is editable in both places, so it *is* cuttable — but it is a 72px checkbox, not a
  truncating value, and it is half of the contactability predicate (§C).

---

# B · THE FILTER BAR — 12 CONTROLS

| Control | Filters on | Column? |
|---|---|---|
| `search` | truck name (text) | 🔴 **no column** — already a filter without one |
| `logo` · `photo` | presence of the URL | ✅ |
| `phone` · `email` | **presence**, not the value | ✅ |
| `whatsapp` | `whatsapp_confirmed` tri-state | ✅ |
| `huOrdering` · `huMap` | tri-state | ✅ |
| `schedule` | derived schedule state | ✅ |
| `stage` | the five stored stages | ✅ |
| `nextAction` | any / overdue / scheduled / none | ✅ |
| `doNotContact` | tri-state | 🔴 **no column** — via `noColumn: true` |

🧪 **Re-derived cross-check:** columns with **no** filter = `name` (covered by `search`),
`last_contacted`, `next_step`. Filters with **no** column = `search`, `doNotContact`.

🔴 **EVERY FILTER WOULD SURVIVE ITS COLUMN'S REMOVAL, AND THE MECHANISM IS ALREADY BUILT.**
`FILTER_CONTROLS` is a **separate array** from `COLUMNS` with its own keys, and the `noColumn?: true`
flag exists and is in use on `doNotContact`. 🔎 The file says so: *"filters with no column (Do not
contact) sort to the END via `noColumn`."* **Dropping PHONE, EMAIL and WHATSAPP as columns costs their
filters nothing — one flag each.**

**Redundancy between controls:**
- `phone` and `whatsapp` overlap: 🔎 WhatsApp requires a phone (`channelFor` needs `waPhone`), so
  `whatsapp = yes` implies `phone = has`. **Not identical** — 🧪 the manual's figure is 30 confirmed
  against 71 phones, so `phone = has` is much the larger set.
- `logo` and `photo` are independent but always adjacent and rarely both interesting.
- `nextAction = overdue` and the **Due work** toggle overlap heavily but are **not** the same set — the
  toggle is step-aware and catches the 223 never-contacted rows that have no `next_action_at` at all
  (§D).
- ⚠️ **No filter exists for contactability, lead type, or step state.** Those are the three things the
  queue made important and the bar has not caught up.

---

# C · PRESENCE INDICATORS

## How the three channels are actually derived

| Channel | Real source | 🧪 |
|---|---|---|
| **EMAIL** | `discovery_trucks.contact_email` | value shown and edited in the list |
| **PHONE** | `discovery_trucks.phone` | value shown and edited in the list |
| **WHATSAPP** | 🔴 `whatsapp_confirmed === true` **AND** a `447…` number derived from **`discovery_trucks.phone`** via the shared `phoneWhatsApp` | — |

🔴 **`outreach_prospects.whatsapp_number` is not involved.** 🧪 Searched alone: **four occurrences in
code**, all plumbing — the route's select, the route's row map, the route's PATCH writer, and the
`Prospect` type. **Zero readers.** *Positive control over the same search:* `whatsapp_confirmed` →
**105 occurrences across 41 files**. Dominic's observation that it is empty on all 231 rows makes it dead
in code *and* data.

## 🔴 A SINGLE "CONTACTABLE" INDICATOR NEEDS NO NEW DERIVATION — IT ALREADY EXISTS

🔎 `channelFor` in `lib/outreach-step.ts`:
```
whatsapp_confirmed === true && waPhone  → 'whatsapp'
contact_email present                   → 'email'
otherwise                               → null
```
**That is exactly Dominic's rule**, and `null` is exactly his "not contactable". 🧪 His arithmetic — 61
email + 30 WhatsApp-with-phone − 15 overlap = **76** — is the count of rows where this returns non-null.
🧪 Proven by driving it: a row with no email and no confirmed WhatsApp returns `channel=null`, including
the "phone but not confirmed" case (his 17).

**What one indicator encodes:** *can I start a conversation at all* — one column, three states if
wanted (email · WhatsApp · none), and it is already computed for every row because the queue computes
`nextStep` for all 231.

**What is lost versus three columns:**
1. **Which** channel, unless the indicator shows it (a letter or icon costs nothing).
2. **The values themselves** — but §E shows nothing in the list can use them.
3. **Inline editing of phone and email.** 🔴 **This is the real cost.** The list is where a missing
   address gets typed in after being found on a website, and that is exactly the work Dominic wants to
   do on the 155. A presence tick is not a place to paste an address.
4. The `whatsapp_confirmed` tick as a one-click affordance while scanning.

**Can the existing filters drive it unchanged? Yes for the parts, no for the whole.** `email = has` and
`whatsapp = yes` exist and are unaffected by removing columns. 🔴 **But "contactable" is an OR across two
filters, and `matchesOutreachFilter` combines every clause with AND** — 🔎 the file says so. So
*"contactable"* and *"uncontactable"* are **not expressible in the current bar**; they need one new
clause, which the file's own doctrine prices at *"ONE entry in `EMPTY_OUTREACH_FILTER` and ONE clause in
`matchesOutreachFilter`"* — except that `channelFor` needs `waPhone`, which the pure row filter does not
have. ⚠️ **So it lands where the Due toggle landed: step-aware, alongside the pure filter rather than
inside it.**

---

# D · THE DUE-WORK VIEW

## What the control is

🔎 **A client-side boolean, not a tab and not a route.** `const [dueOnly, setDueOnly] = useState(false)`
and a `<button aria-pressed={dueOnly}>`. It narrows `computedVisible` after `matchesOutreachFilter` has
run. **No endpoint, no query param, no navigation, and — unlike the twelve filters — it is NOT persisted
to localStorage.**

## How the number is computed, re-derived from the predicate

🔎 `dueCounts` iterates **every** prospect's step and counts `state === 'due'` plus `state === 'unknown'`;
the button shows `due + unknown`. The narrowing uses `needsAttention`, which is the same test.

🧪 **Driven against the real module — what it excludes and what it does not:**

```
  no email, no phone (his 104)        channel=null      state=due       COUNTED
  phone but NOT confirmed (his 17)    channel=null      state=due       COUNTED
  order_url only                      channel=null      state=due       COUNTED
  has email (his 61)                  channel=email     state=due       COUNTED
  whatsapp confirmed + phone (his 30) channel=whatsapp  state=due       COUNTED
  ── CONTROL: what it DOES exclude ──
  do_not_contact                                        state=stopped   not counted
  converted (hatchgrab_truck_id)                        state=stopped   not counted
  stage not_interested                                  state=stopped   not counted
  replied (an inbound row)                              state=stopped   not counted
  scheduled (due in the future)                         state=scheduled not counted
  UNKNOWN (a legacy kind)                               state=unknown   COUNTED — by design
```

🔴 **SO: "Due work (224)" EXCLUDES do-not-contact, converted, replied, terminal stages and
not-yet-due — AND INCLUDES EVERY UNCONTACTABLE PROSPECT.** Dominic's reading is exactly right, and the
mechanism is visible: `channelFor` returns `null`, `nextStep` records that null on the step, and then
**nothing consults it.** The channel is computed, carried, and never used as a gate.

⚠️ **I have not re-derived 224 itself** — it needs the live contact rows. What I can say from the
predicate: with 231 prospects of which 223 are `not_contacted`, every never-contacted row returns
`state='due', kind='1_first_contact', dueOn=null` regardless of whether anyone can be reached, so the
count is dominated by them. §SQL query 2 produces the exact figure and its breakdown.

⚠️ **One more thing the count folds together:** "due" and "unknown" are summed in the button but counted
separately in the code, and the amber *"⚠ n needs a look"* badge already renders the unknown half. **The
button's number is therefore two different kinds of work added together.**

## Options for an uncontactable bucket

| Option | What it costs | What it shows | Notes |
|---|---|---|---|
| **1 · A step-aware filter value** (`contactable: any / yes / no`) beside the Due toggle | One state field + one clause where the Due narrowing already lives. 🔴 **Cannot go in `matchesOutreachFilter`** — that function is pure over one row and has no `waPhone` | the 155, inside the existing table with every column and filter still available | Cheapest. Composes with the other 12 filters |
| **2 · A second count beside "Due work"** — e.g. *"Needs details (155)"* as a third toggle | Same as 1 plus a counter, mirroring the existing `dueCounts` shape exactly | same | 🟢 Matches what is already there: the amber unknown badge is this pattern |
| **3 · Exclude uncontactable from the due count** and surface them separately | 1 or 2, **plus** a change to `needsAttention` | Due work falls from ~224 to something near the 76 | 🔴 **A behaviour change to a shipped predicate** — and it makes them invisible unless option 1 or 2 also ships. Dominic explicitly does not want them hidden |
| **4 · A third view / tab** | A new panel and its own state | same rows, own layout | 🔴 **Over-engineering** for one user — it would re-render the same client-side array with a different default |

🔴 **THE LEAD IS THE URL COLUMNS, AND THE LIST DOES NOT CARRY THEM.** Dominic's route into the 155 is
*46 order URLs · 56 menu URLs · 34 websites · 17 unconfirmed phones*. 🧪 The route already returns
**`website`, `order_url` and `schedule_url`** on every row and the `Prospect` type carries all three —
but 🔎 **no column renders any of them, and no filter tests them.** *Positive control:* `order_url` does
render in the modal (the platform derivation) and in `contextFromProspect`, so the values are present and
used elsewhere. **An uncontactable bucket is only useful if it shows the thing to click**, and that is a
column the table does not have today. `menu_url` is a fourth field — ⚠️ **I have not confirmed it is
selected by the outreach route**; §SQL query 3 checks it.

---

# E · WHAT THE LIST IS FOR

🔎 **Every interactive affordance in a `Row`, enumerated — eight:**

| # | Affordance | What it does |
|---|---|---|
| 1 | Truck name `<button>` | **opens the modal** |
| 2 | Schedule `(n)` `<button>` | opens the schedule popup |
| 3 | Logo `MediaCell` | **drag-drop upload** — the only path |
| 4 | Photo `MediaCell` | **drag-drop upload** — the only path |
| 5 | Phone `InlineField` | edits `discovery_trucks.phone` |
| 6 | Email `InlineField` | edits `contact_email` |
| 7 | `WhatsAppBox` | sets `whatsapp_confirmed` |
| 8 | `TriStateBox` ×2 | sets `hu_ordering` / `hu_map` — **the only path** |

🔴 **THERE IS NO `<a href>` IN A ROW AT ALL.** 🧪 Searched the Row block: zero `href`, zero `mailto:`,
zero `tel:`, zero `wa.me`. *Positive control:* all three appear inside `Detail`, so the search finds them
where they exist.

**So: two affordances open something, six edit a field in place, and NOTHING contacts anyone.** Every
send, every call, every WhatsApp, every log, every compose is behind **"open the modal"**.

🔴 **That settles how much a row needs to carry.** A row is a **triage and data-entry surface**, not an
action surface. It needs enough to decide *which row to open* and enough to *fix a field without
opening*. A phone number you cannot dial and an address you cannot mail to serve the first purpose only
as a presence signal — which is Dominic's point, arrived at from the code rather than from taste.

---

# F · COMPARABLE PATTERNS, MAPPED TO THIS CODE

| Pattern | What this codebase already has | What it would need | At 1 user / 231 rows |
|---|---|---|---|
| **Lean default columns, detail in the record** | 🟢 The modal already carries everything except HU flags, media upload and Next step | Move the two `TriStateBox`es and a `MediaCell` into the modal **before** cutting those columns | ✅ **The right shape** — but the *order* matters: cut last, move first |
| **Presence icons rather than values** | 🟢 `channelFor` is the predicate; 🟢 `WhatsAppBox`/`TriStateBox` are the icon idiom; 🟢 `noColumn` lets the filters survive | One cell renderer | ✅ Cheap. 🔴 Costs inline editing of phone/email (§C) |
| **The due queue as the primary view** | 🟢 `dueOnly` + `dueCounts` exist and are client-side | Default `dueOnly` to true, and persist it — 🔴 note it is currently **not** in the localStorage blob the 12 filters use | ✅ One line, one storage key. ⚠️ It would open on a queue that includes ~148 unactionable rows until §D is settled |
| **Saved views / segments** | 🟢 One persisted filter blob (`hg.outreach.filter.v1`) | A named list of blobs + a picker | 🔴 **Over-engineering.** One operator, one workflow; the single persisted filter already covers "where I was" |
| **Server-side pagination / virtualisation** | — the whole list is client-side over rows already loaded | an endpoint, query params | 🔴 **Over-engineering at 231 rows.** 🔎 The file's own note: *"No endpoint, no query param, no refetch."* |
| **URL-addressable filters** | ❌ none — localStorage only | `useSearchParams` wiring | ⚠️ Genuinely useful only if views get shared; with one user, the persisted blob is the same benefit |

---

# G · MOBILE — THE LIST WAS NEVER REWORKED

🔴 **The modal was reworked three times for phones. The list has never been touched.**

🧪 **The search:** `max-sm:` and `sm:` alone, over the ~66,000-character list block (from the
`max-w-[1800px]` wrapper to the start of the modal). **Zero hits for either.**
🧪 **Positive control, same file:** `max-sm:` appears **53** times and `sm:hidden` **6** times overall —
all inside the modal. The search finds them where they exist.

**What it therefore does below 640px, READ from the class chain:**
- 🔎 `<div className="overflow-auto rounded-xl border … max-h-[calc(100vh-9rem)]">` wrapping
  `<table className="table-fixed w-full" style={{ minWidth: '1198px' }}>`
- **It scrolls horizontally.** A 1198px table inside a ~390px viewport — the whole thing is reachable by
  dragging sideways, and roughly **a third** of it is visible at a time. It does not wrap, does not
  stack, and does not overflow the page (the `overflow-auto` contains it).
- 🔎 The outer container is `max-w-[1800px] mx-auto` with **no horizontal padding**, so the table's
  border sits flush against both screen edges on a phone.
- ⚠️ The filter bar is 12 controls; 🔎 `FilterSelect` is `text-xs` — **under 16px, so iOS zooms on
  focus**, which is the defect the modal rounds fixed and the list never had fixed.
- ⚠️ `max-h-[calc(100vh-9rem)]` uses `vh`, not `dvh` — the modal was moved to `dvh` in round one because
  mobile browser chrome makes `vh` wrong.

**Reported only, as required. Nothing here was changed.**

---

# H · OPTIONS FOR DOMINIC

**H1 · 🔴 FIRST, AND BEFORE JUDGING ANY COLUMN: restore the 13th `<col>`.**
*Facts:* the colgroup declares 12 widths for 13 columns and the file's own comment says the sum must
equal `minWidth` exactly. Every spare pixel currently goes to Next step, which is why Email and the
dates truncate at any window width. *Cost:* one `<col>`, one `minWidth` number, and the `colSpan={12}`.
*It may resolve the complaint on its own* — or prove it was never about width.

**H2 · Which columns to cut.**
*Facts:* strictly three qualify as "I can see it" — **PHONE, EMAIL, LAST CONTACTED**. 🔴 **HU ORDERING,
HU MAP, LOGO and PHOTO do not**, because they are the only editor / only upload path; cutting them needs
the control moved into the modal first. *The question:* cut the three, or cut more and move the editors?

**H3 · What replaces PHONE / WHATSAPP / EMAIL.**
*Facts:* `channelFor` already computes contactability, so a presence column is display work only, and
`noColumn` already lets the three filters survive. 🔴 **The cost is inline editing** — the list is where
a found address gets typed in, which is exactly the work the 155 need. *The question:* a presence tick
that shows *which* channel and moves data entry into the modal, or keep EMAIL editable and replace only
PHONE and WHATSAPP?

**H4 · Does due work become the default view?**
*Facts:* it is a client-side boolean, not persisted, unlike the 12 filters. Defaulting it on is one line.
⚠️ **But today it opens on ~224 rows of which ~148 cannot be actioned**, so defaulting it before §H5
would make the first screen mostly noise. *The question:* settle the bucket first, then default?

**H5 · Where the uncontactable go.**
*Facts:* four options in §D, costed. 🔴 **All four are weakened by the same gap: the list renders no
`website`, `order_url` or `schedule_url`, though the route already returns all three.** The lead Dominic
wants to chase is not on screen anywhere. *The question:* a contactable filter, a second count, or a
"needs details" toggle — **and does a URL column ship with it?**

**H6 · Two things the review turned up that were not asked about.**
1. The **LAST CONTACTED** column has no filter, while **NEXT STEP** has none either — the two newest and
   most decision-relevant columns are the two you cannot narrow by.
2. 🔴 The list has **no mobile treatment at all** (§G), including a `text-xs` filter bar that will zoom
   on iOS. If the list is ever used on a phone, that is a separate piece of work.

---

# SQL — for Dominic to run; **nothing here was executed**

⚠️ Every column named is one already read this session. 🔴 **`discovery_trucks.menu_url` is the one
exception** — query 3 checks `information_schema` for it *before* query 4 uses it.

**1 · Re-derive the contactable 76 / uncontactable 155**, using the app's own predicate
(`contact_email` present, OR `whatsapp_confirmed` with a `447…` mobile):

```sql
select count(*)                                                             as prospects,
       count(*) filter (where coalesce(trim(t.contact_email), '') <> '')    as with_email,
       count(*) filter (where p.whatsapp_confirmed is true
                          and coalesce(trim(t.phone), '') <> '')            as wa_confirmed_with_phone,
       count(*) filter (where coalesce(trim(t.contact_email), '') <> ''
                          and p.whatsapp_confirmed is true
                          and coalesce(trim(t.phone), '') <> '')            as both,
       count(*) filter (where coalesce(trim(t.contact_email), '') = ''
                          and not (p.whatsapp_confirmed is true
                                   and coalesce(trim(t.phone), '') <> '')) as uncontactable
  from public.outreach_prospects p
  left join public.discovery_trucks t on t.id = p.discovery_truck_id;
```

⚠️ `with_email + wa_confirmed_with_phone − both` should equal `prospects − uncontactable`. If it does
not, one of the figures in the brief is measuring something else.

**2 · 🔴 Re-derive "Due work (224)" and split it by contactability** — the number §D could not compute:

```sql
with ladder as (
  select oc.prospect_id,
         max(case oc.kind when '1_first_contact' then 1 when '2_chase_1' then 2
                          when '3_chase_2' then 3 when '4_final_chase' then 4 end) as top_rung,
         count(*) filter (where oc.direction = 'inbound')                          as replies,
         count(*) filter (
           where oc.direction is distinct from 'inbound'
             and (oc.kind is null
               or oc.kind not in ('1_first_contact','2_chase_1','3_chase_2','4_final_chase','reply'))
         ) as blind_rows
    from public.outreach_contacts oc
   group by oc.prospect_id
),
stepped as (
  select p.id,
         (coalesce(trim(t.contact_email), '') <> ''
          or (p.whatsapp_confirmed is true and coalesce(trim(t.phone), '') <> '')) as contactable,
         case
           when p.do_not_contact then 'stopped'
           when t.hatchgrab_truck_id is not null then 'stopped'
           when coalesce(l.replies, 0) > 0 then 'stopped'
           when p.stage in ('signed','not_interested','replied') then 'stopped'
           when coalesce(l.blind_rows, 0) > 0 then 'unknown'
           when coalesce(l.top_rung, 0) >= 4 then 'complete'
           when coalesce(l.top_rung, 0) = 0 then 'due'
           when p.next_action_at is null or p.next_action_at <= current_date then 'due'
           else 'scheduled'
         end as step_state
    from public.outreach_prospects p
    left join public.discovery_trucks t on t.id = p.discovery_truck_id
    left join ladder l on l.prospect_id = p.id
)
select step_state, contactable, count(*) as prospects
  from stepped
 group by step_state, contactable
 order by step_state, contactable desc;
```

🔴 **`due` + `unknown` summed across both `contactable` values is the button's number.** The
`contactable = false` half of those two rows is the work the queue is offering that cannot be done.
⚠️ This approximates the app's due/scheduled split with `next_action_at` because SQL cannot call
`followUpDateFor`; the app counts from the contact's own date. Treat it as within a day or two, not exact.

**3 · Does `discovery_trucks.menu_url` exist?** 🔴 Run this BEFORE query 4 — I have not read that column:

```sql
select c.column_name, c.data_type, c.is_nullable
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.table_name = 'discovery_trucks'
   and c.column_name in ('website', 'order_url', 'schedule_url', 'menu_url', 'phone', 'contact_email')
 order by c.column_name;
```

**4 · The lead into the 155 — what a "needs details" view would actually show.** ⚠️ Drop the `menu_url`
line if query 3 returns no such column:

```sql
select t.name,
       p.stage,
       nullif(trim(t.phone), '')        as phone_unconfirmed,
       nullif(trim(t.order_url), '')    as order_url,
       nullif(trim(t.menu_url), '')     as menu_url,
       nullif(trim(t.website), '')      as website,
       nullif(trim(t.schedule_url), '') as schedule_url
  from public.outreach_prospects p
  left join public.discovery_trucks t on t.id = p.discovery_truck_id
 where coalesce(trim(t.contact_email), '') = ''
   and not (p.whatsapp_confirmed is true and coalesce(trim(t.phone), '') <> '')
   and coalesce(p.do_not_contact, false) = false
 order by (nullif(trim(t.order_url), '') is null),
          (nullif(trim(t.website), '') is null),
          t.name;
```

⚠️ Sorted so the rows with a URL to click come first. **The count of rows here with every URL column
null is the true "no route in at all" figure** — the brief's "at least 104" — and it is the only group
for which there is genuinely nothing to do.
