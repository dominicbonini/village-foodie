# Hiding the van name on a one-van truck — 🔴 STAGE 1 ONLY. I STOPPED. NO SOURCE FILE WAS CHANGED.

**Files written — ONE, and it is this report:** `docs/van-name-visibility-report.md`.
🔴 **NO SOURCE FILE WAS EDITED. Stage 2 was not started.**
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `log` and `diff` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any migration, any schema change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

# 🔴 WHY I STOPPED — Q2's OWN CONDITION FIRED

**The dashboard already knows how many ACTIVE vans the truck has. The KDS does not, and cannot without
either a new query or a change to an API response — both of which you forbade in the same breath as
asking, with "STOP AND REPORT" as the instruction if that was the answer.** Stage 2 runs *"only if
Stage 1 is clean"*, and Stage 1 is not clean.

⚠️ **I ALSO DID NOT DO THE DASHBOARD HALF ON ITS OWN.** It is one expression and I can do it in a
minute — but shipping it alone makes the two surfaces disagree about the same truck at the same moment,
which is the exact class of divergence this work has been removing. **§6 gives you three ways forward;
say which and I will build it.**

---

# Q1 — WHERE EACH SURFACE COMPOSES THE STRING

## KDS — `app/dashboard/[token]/kds/page.tsx:1770-1777`

```tsx
        <div className="flex items-center gap-2 min-w-0 shrink sm:shrink-0">
          <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <span className="font-medium text-slate-900 flex min-w-0">
            <span className="truncate shrink-[999] min-w-0">{truck.name}</span>
            {vanName ? <span className="truncate shrink min-w-0">{`\u00A0— ${vanName}`}</span> : null}
          </span>
        </div>
```

🔴 **TWO SPANS, AND THE SEPARATOR LIVES INSIDE THE SECOND ONE** — `\u00A0— ` : a no-break space, an em
dash, a normal space, then the name. **The NBSP is load-bearing**: both spans are flex items, and a
flex item's own leading white-space is stripped, which is what produced `Test Kitchen— Van1`.

**Its source (`:88`):** `const vanName = searchParams.get('van_name') ?? ''` — 🔴 **the URL, not the API.**

## Dashboard — `app/dashboard/[token]/page.tsx:2840`

```tsx
        truckName={isDemo ? null : (truck?.name ? (vanName ? `${truck.name} — ${vanName}` : truck.name) : null)}
```

🔴 **ONE TEMPLATE STRING, ONE TEXT NODE, NO SPANS AND NO NBSP** — a plain space, em dash, plain space.
It is passed to `components/shared/AppHeader.tsx`, which renders it twice:

```tsx
                  alt={truckName || ''}                                            {/* :119 — the logo's alt text */}
                <p className="font-black text-sm text-white leading-none truncate">{truckName}</p>   {/* :126 */}
```

**Its source (`:192`):** `const vanName=searchParams.get('van_name')??''` — 🔴 **also the URL.**

⚠️ **NEITHER HEADER READS THE VAN NAME FROM THE SERVER. Both read the query string** written by whoever
opened the link.

---

# Q2 — 🔴 DOES EITHER SURFACE KNOW THE VAN COUNT?

## Dashboard — ✅ YES

```tsx
  const[vans,setVans]=useState<{id:string;name:string;auto_pause_on_offline:boolean;kds_token?:string|null}[]>([])   // :549
```
```tsx
    fetch('/api/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'get_vans'})})   // :1169
      .then(...).then(d=>{ setVans(d.vans||[]) })
```

**And the server side of that call (`app/api/manage/route.ts:964`):**

```ts
  if (action === 'get_vans') {
    const { data, error } = await supabase
      .from('truck_vans')
      .select('id, truck_id, name, kds_token, active, auto_pause_on_offline, …')
      .eq('truck_id', truck.id)
      .eq('active', true)
```

✅ **`vans.length` IS ALREADY IN STATE, ALREADY FILTERED TO ACTIVE, AND ALREADY USED FOR EXACTLY THIS
KIND OF DECISION** — `if(vans.length===1){openKDS(vans[0]);return}` at `:1311`. **No new query, no API
change, nothing to add.**

## KDS — 🔴 NO

**Everything the KDS holds about vans:**

| What it has | Where | Does it give a count? |
|---|---|---|
| `vanId` / `vanName` from the URL | `:87-88` | ❌ one van's id and name — the one it was opened for |
| `/api/dashboard`'s response | `:544-584`, `:1292-1300` | ❌ **`activeVanName`, `vanShowCookingStep`, `vanBuzzerCount`, `vanPausedUntil`, `vanOnlinePausedUntil` — all SINGULAR, all about the selected event's van. No list, no count** |
| a `truck_vans` read | `:1001` | ⚠️ **exists but is not it** — it runs inside the screen-off handler, on demand, selecting `name, auto_pause_on_offline` for the warning modal, and never reaches mount-time state |
| `vansWithAutoPause` | `:206` | ❌ names for that warning only, empty until the handler runs |

🔴 **SO THE KDS HAS NO VAN COUNT AT ANY POINT IN ITS LIFECYCLE.** To get one it needs **exactly one of**:

1. **A new client query** — `supabaseBrowser.from('truck_vans').select('id').eq('truck_id', …).eq('active', true)` at mount. ⚠️ The KDS already does an anon `truck_vans` SELECT at `:1001`, so RLS evidently permits the read — **but this is a new query, which you forbade.**
2. **A field on an existing response** — `activeVanCount` beside `activeVanName` in `/api/dashboard` (the route already reads `truck_vans`, though only for the selected event's van, so it would still be a second query server-side). **This is an API-response change, which you forbade, and `app/api` is on the DO-NOT list.**
3. 🔴 **A THIRD OPTION THAT NEEDS NEITHER — see §6.1. The dashboard, which KNOWS the count, is what builds the KDS URL.**

---

# Q3 — "ONLY ONE VAN", DEFINED FROM THE DATA

🔴 **THE ONLY COUNT AVAILABLE ANYWHERE IS "ONE ACTIVE VAN", NOT "ONE ROW IN `truck_vans`".** `get_vans`
filters `.eq('active', true)` before returning, so `vans.length` cannot see an inactive row.

| Your case | What the rule does |
|---|---|
| 1 van | count 1 → **name hidden** ✅ |
| 2 active vans | count 2 → **unchanged** ✅ |
| 2 vans, one INACTIVE | count 1 → **name hidden** ✅ **exactly as you specified** |
| that second van REACTIVATED | count 2 → **name shown again** ⚠️ **but not instantly — see below** |

⚠️ **"THE MOMENT THE SECOND IS REACTIVATED" IS NOT ACHIEVABLE AND I WILL NOT PRETEND OTHERWISE.**
`get_vans` is fetched at mount (`:1169`) and re-fetched only on specific paths (e.g. `:1830`), and
🔴 **`truck_vans` IS DELIBERATELY NOT IN THE SUPABASE REALTIME PUBLICATION** — there is a 30-line
comment at `:1120` explaining that adding it would make every 15-second heartbeat UPDATE fan out to
every connected dashboard. **So the van name reappears on the next fetch of that list — in practice the
next dashboard load — and no sooner. That is a property of the existing data plumbing, not of this
change.**

---

# Q4 — EVERY SITE THAT RENDERS A VAN NAME

| # | Site | Source of the name | In scope? |
|---|---|---|---|
| 1 | **KDS header**, `kds/page.tsx:1775` | URL `van_name` | 🔴 **yes** |
| 2 | **Dashboard header**, `page.tsx:2840` → `AppHeader:126` | URL `van_name` | 🔴 **yes** |
| 3 | ⚠️ **The header LOGO's `alt` text**, `AppHeader:119` — `alt={truckName \|\| ''}` | the same string | 🔴 **YES, AND IT IS EASY TO MISS.** Hiding the visible copy without this leaves the van in the accessible name of the logo |
| 4 | Dashboard capacity card, `page.tsx:4144` — `🚐 {activeVanName}` | 🔴 **the API's `activeVanName`, not the URL** | ⚠️ **arguably not** — it names which van's capacity is being edited, beside a control that changes it. Different question |
| 5 | `ThisDeviceSettings`, `OperatorDeviceConfig.tsx:211,230` — *"You're viewing: truck — van"* | its own `/api/native` config | ⚠️ **no** — it tells you which van THIS DEVICE is bound to, which is the one place the name is the point |
| 6 | KDS screen-off warning, `kds/page.tsx:206,1003` | its own `truck_vans` read | ⚠️ no — names the vans that will auto-pause |
| 7 | Manage → Team, `manage/[token]/page.tsx:11938` | `member.van_names` | ⚠️ no — a permissions list |
| 8 | ⚠️ **The two URL BUILDERS that put the name there**: `page.tsx:1278` and `app/kds/[kds_token]/page.tsx:33` | — | ⚠️ **not a render, but see §6.1** |

🔴 **SO THE TRUE SCOPE OF "HIDE IT" IS THREE SITES, NOT TWO: the KDS header, the dashboard header, and
the logo's `alt`** — the third being a consequence of the second, since both read one string.

---

# Q5 — WHAT RENDERS WHILE THE COUNT IS UNKNOWN

| Surface | Unknown window | What it would render |
|---|---|---|
| **Dashboard** | mount → the `get_vans` response lands (one round trip) | ✅ **`vans` starts `[]`, so `vans.length === 1` is FALSE and the van SHOWS.** The rule you asked for — *show, then remove once* — falls out of the existing initial state with no extra flag |
| **KDS** | 🔴 **permanently** | 🔴 **the van, always. The count never arrives, so the change would be a NO-OP on this surface** |

⚠️ **AND THE `[]` CASE IS DOUBLE-VALUED ON THE DASHBOARD** — it means both "not loaded yet" and "this
truck has no active vans". Both want the same behaviour here (show whatever the URL gave us), so the
ambiguity is harmless, **but a future `vans.length === 0` rule would inherit it.**

---

# 6 — THE THREE WAYS FORWARD

## 6.1 ⭐ THE ONE THAT NEEDS NO QUERY AND NO API CHANGE — pass the count in the URL

**The dashboard BUILDS the KDS link (`page.tsx:1278`) and already knows the count at that moment.**
Adding `&vans=2` (or omitting it for one) makes the KDS's rule `searchParams.get('vans')`, with absent
meaning UNKNOWN and unknown meaning SHOW — exactly the direction you specified.

| ✅ For | 🔴 Against |
|---|---|
| No query, no API change, no schema change | 🔴 **The KDS is opened by other routes too** — `app/kds/[kds_token]/page.tsx:33`, a saved link, the native default-screen path. Those carry no `vans`, so those opens show the van name |
| Both surfaces stay in step when opened normally | ⚠️ The URL becomes a third place a display rule lives |
| ~6 lines across two files | ⚠️ A stale bookmarked link carries a stale count until reopened |

## 6.2 The clean one — one field on `/api/dashboard`

`activeVanCount` beside `activeVanName`. **Correct on every entry path, no URL involvement, one number.**
🔴 **It changes an API response and touches `app/api`, both of which you forbade, so it is the
"different conversation" you named — not something I will start unasked.**

## 6.3 Dashboard only, KDS unchanged

**One expression at `:2840`. Ten seconds.** 🔴 **And it makes the dashboard and the KDS describe the same
truck differently at the same moment**, which is why I did not do it on my own initiative.

---

# 🔴 IF AND WHEN STAGE 2 RUNS — THE TWO THINGS THAT MUST NOT BREAK

1. 🔴 **THE SPAN TO REMOVE ON THE KDS IS THE WHOLE `{vanName ? <span …>{`\u00A0— ${vanName}`}</span> : null}`
   TERNARY ARM — the NBSP goes with it, because the NBSP is INSIDE it.** The escape must survive
   untouched in the multi-van branch: deleting the separator and keeping the span, or moving the
   separator into the truck span, reintroduces `Test Kitchen— Van1` the moment the name is truncated.
   **The multi-van case must still render `Test Kitchen — Van1` with a space either side of the dash.**
2. ⚠️ **The dashboard needs no NBSP and must not gain one** — its string is one text node, where a plain
   space renders normally. Copying the KDS's fix there would be cargo-culting a fix for a bug that
   surface does not have.

---

# 🔴 PIZZERIA GUSTO — WHAT THEIR HEADER RENDERS, AND THEIR VAN COUNT

**BEFORE (today) and AFTER (today) — IDENTICAL, BECAUSE NOTHING WAS CHANGED.**

```tsx
        truckName={isDemo ? null : (truck?.name ? (vanName ? `${truck.name} — ${vanName}` : truck.name) : null)}
```

- **If their KDS link carries `van_name`:** `Pizzeria Gusto — <van>`.
- **If it does not:** `Pizzeria Gusto`. ⚠️ **The dashboard is usually opened WITHOUT `van_name`** — that
  parameter is written by the KDS link builder — **so their dashboard header very likely already reads
  the truck name alone, and this change would alter nothing there.**

🔴 **THEIR VAN COUNT CANNOT BE CONFIRMED FROM THE CODE, AND I WILL NOT GUESS IT.** It lives in
`truck_vans`, and reading it means a query — **you run the queries, not me.** The one-line check, for
you to run if you want it: `select count(*) from truck_vans where truck_id = … and active = true;`

---

# VERIFICATION

🔴 **NOTHING WAS BUILT, SO THERE IS NOTHING TO VERIFY BY EXECUTION EXCEPT THAT NOTHING CHANGED.**

| Required claim | Status |
|---|---|
| A one-van truck shows no van name on either surface | 🔴 **NOT IMPLEMENTED — stopped at Stage 1** |
| A multi-van truck unchanged | 🔴 **NOT IMPLEMENTED** (everything is unchanged) |
| The van reappears on reactivation | ⚠️ **ANSWERED, NOT BUILT** — Q3: yes on the next `get_vans` fetch, **not instantly**, because `truck_vans` is deliberately outside realtime |
| No other site still renders the van | ⚠️ **ANSWERED, NOT BUILT** — Q4 lists eight sites and names the three that would be in scope, including the logo's `alt` |
| What renders while unknown | ⚠️ **ANSWERED** — Q5: dashboard shows the van for one round trip; **the KDS would show it forever** |
| The dashboard's header before and after | ✅ **EXECUTED — byte-for-byte identical: `app/dashboard/[token]/page.tsx` is 390,931 bytes, the same figure recorded at the end of the last five tasks, and its mtime predates this session's last write** |
| `sm:` and above otherwise unchanged | ✅ **EXECUTED — no source file was written at all** |

---

# INTEGRITY

🔴 **NO SOURCE FILE WAS WRITTEN, SO THERE IS NO BEFORE/AFTER TO REPORT — ONLY A CONFIRMATION THAT BOTH
CANDIDATE FILES ARE UNTOUCHED.** Both were scanned anyway, with the two characters you singled out
counted specifically:

```
app/dashboard/[token]/kds/page.tsx    226,010 bytes · 3,030 lines · 33 non-ASCII classes
   NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
   🔴 U+00A0 LITERAL NO-BREAK SPACE: 0        (the fix is the ASCII escape `\u00A0`, 3 occurrences)
   🔴 U+2014 EM DASH: 410

app/dashboard/[token]/page.tsx        390,931 bytes · 5,029 lines · 53 non-ASCII classes
   NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
   🔴 U+00A0 LITERAL NO-BREAK SPACE: 0        (and it must stay 0 — that surface has one text node)
   🔴 U+2014 EM DASH: 509
```

⚠️ **THE NBSP IS NOT IN THE KDS FILE'S BYTES AT ALL, AND THAT IS DELIBERATE** — it is written as the
ASCII escape `\u00A0` so it is visible to the next reader and adds no character class. **A future edit
that "tidies" it into a literal would change the census and hide the character.**

## This report — a SEPARATE pass, run AFTER writing

```
docs/van-name-visibility-report.md   bytes 18,060
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
U+00A0 literal no-break space: 0   (every mention is written as the ASCII escape)
U+2014 em dash: 82
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 38 | 0 | 38 |
| U+26A0 (warning sign — TEXT presentation) | 22 | 22 | 0 |
| U+2705 (check mark button) | 14 | 0 | 14 |
| U+2B50 (star) | 1 | 0 | 1 |
| U+1F690 (minibus) | 1 | 0 | 1 |

U+26A0 is the only base here with TEXT presentation used as an emoji, and every occurrence is
PAIRED with U+FE0F. The rest have emoji presentation by default, so bare is correct for them.

## Working tree

```
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/landing/landing.css
 M app/landing/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M components/dashboard/UserMenu.tsx
 M components/shared/EventActionsModal.tsx
 M docs/privacy-manifest-report.md
 M docs/reference-manual.md
 M lib/plan-features.ts
?? components/shared/ExtraWaitModal.tsx
?? docs/add-order-overflow-fix-report.md
?? docs/add-order-overflow-report.md
?? docs/event-actions-rename-report.md
?? docs/kds-copy-apply-report.md
?? docs/kds-phone-controls-final-report.md
?? docs/kds-phone-expand-final-report.md
?? docs/kds-phone-expand-report.md
?? docs/kds-phone-width-fix-report.md
?? docs/kds-screen-on-header-report.md
?? docs/kds-sound-chips-report.md
?? docs/kds-view-panel-report.md
?? docs/landing-features-move-report.md
?? docs/offline-protection-kds-fix-report.md
?? docs/offline-protection-kds-report.md
?? docs/plan-feature-order-domain-report.md
?? docs/screen-sound-alignment-report.md
?? docs/screen-sound-fix-report.md
?? docs/splice-verification-report.md
?? docs/van-name-visibility-report.md
?? lib/native/useHeartbeat.ts
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `?? docs/van-name-visibility-report.md` | 🔴 **THIS TASK — the ONLY entry this task created, and the only file it wrote** |
| `M app/dashboard/[token]/kds/page.tsx` | ✅ **pre-existing — the six previous KDS tasks. NOT touched by this one** |
| `M app/dashboard/[token]/page.tsx` | ✅ **pre-existing. NOT touched by this one** |
| `M components/shared/EventActionsModal.tsx`, `?? components/shared/ExtraWaitModal.tsx`, and every `?? docs/kds-*.md` | ✅ pre-existing — earlier tasks this session |
| `M app/landing/*`, `M lib/plan-features.ts`, `?? docs/landing-features-move-report.md` | ✅ pre-existing — the landing tasks |
| everything else | ✅ pre-existing |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
