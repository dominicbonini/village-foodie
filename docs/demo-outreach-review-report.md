# Outreach "Create Demo" and demo onboarding — READ-ONLY review

**Read-only.** No file was edited except this report. No migration, no new file, no database query or
write, no `next dev`/`next build`. Nothing was staged.

Every claim is marked **READ** (I read it in source this session) or **INFERRED**. Line numbers appear only
where re-read this session; symbols are the citation.

---

## 🔴 PREMISES THAT ARE WRONG, FIRST

1. **The tree is NOT clean.** `git status` at the start (verbatim below) shows three modified files —
   `docs/manual-update-report.md`, `docs/reference-manual.md`, `docs/scraper-reference-manual.md`. Those
   are the V13.0/V2.0 manual edits from the previous documentation task, uncommitted. **All code is
   committed** — no `app/`, `lib/`, `components/`, `scripts/` or `supabase/` file is modified — so
   "everything is committed and deployed" holds for code and fails for those three docs.
2. **Spec G2 (`MAX_GRID_VISIBLE = 8`) is stale.** READ: the only occurrence in code is a comment in
   `app/dashboard/[token]/kds/page.tsx` beginning *"THE GRID CAP IS GONE"*. The cap was removed;
   `docs/kds-grid-cap-removal.md` records it. The spec still lists it as open.
3. **Spec G3 ("return-visit re-provisioning issues a new identifier") is wrong.** READ:
   `provisionDemo` with `existingTruckId` sets `dashboardToken = existing.dashboard_token` — the **same**
   token is reused. The localStorage-namespace concern G3 raises does not arise on return.
4. **C9's premise ("demo mode hides the avatar dropdown on desktop") is wrong.** READ: the dashboard
   passes `showIdentity={!isDemo}` to `UserMenu`, which hides the **identity block** only; the menu still
   renders. See C9.
5. **`app/api/admin/provision-demo/route.ts` is overdue for deletion by its own header.** READ: *"⚠️
   TEMPORARY TEST SCAFFOLDING… DELETE (or repurpose) when the public upload endpoint lands."* The public
   endpoint (`/api/demo`) has landed. It is still `verifyAdmin`-gated, so it is not a hole — but it is
   dead scaffolding that still accepts uploads.
6. **The KDS demo banner sits under the iOS status bar on native.** READ: in `kds/page.tsx` the
   `<DemoModeBanner>` is rendered *above* the `<header>`, and only the header carries
   `paddingTop: max(0.625rem, env(safe-area-inset-top))`. The dashboard **moved its banner below
   `AppHeader` for exactly this reason** (READ: the note *"DemoModeBanner and KeepAwakePrompt MOVED DOWN
   with the banner stack… above AppHeader either one would have been the element under the iOS status
   bar"*). The KDS did not get that move.

### The two git commands, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   docs/manual-update-report.md
	modified:   docs/reference-manual.md
	modified:   docs/scraper-reference-manual.md

no changes added to commit (use "git add" and/or "git commit -a")
════
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
9e83a5e migration changes
69c4fdd migration changes
```

**Source of truth located:** `docs/onboarding-flow.md` is at that path (132,410 bytes, "HatchGrab —
Onboarding Flow Spec"). `docs/reference-manual.md` §9 is the KDS section; §33 is the linking-shadow model.

---

## PROOF DISCIPLINE — how the absence claims below were made

Every "nothing does X" claim gives the search, the file set (`app lib components scripts supabase
proxy.ts`, migrations excluded, **no extension scope**) and a positive control run over the same set.
Column names were searched **alone** (`hatchgrab_truck_id`, `expires_at`, `retired_at`), never with a
trailing colon or paren, so a wrapped call chain cannot slip past. Exit codes were taken from the
command itself, not from a pipe — one grep in this session initially reported `head`'s status and was
redone (`/api/setup`, C14). **What a null proof would look like:** a grep that matched nothing because
the pattern was wrong would print exactly what a true absence prints; the control is what rules that out.

---

# C1–C15 · THE PLANNING-CHAT CLAIMS

## C1 · Linking a demo through `discovery_trucks.hatchgrab_truck_id`

**Census of every reader and writer** — READ, `grep -rn "hatchgrab_truck_id"` over
`app lib components scripts proxy.ts`, 27 lines in 9 files (control: `discovery_truck_id`, 12 files).

| site | role | if the linked truck were `demo-…` |
|---|---|---|
| `app/api/admin/create-truck/route.ts` — the promote's `.update({hatchgrab_truck_id})…is('hatchgrab_truck_id', null).select('id')` | **the only writer in app code** | **(b) CONFIRMED.** A row already linked to the demo matches **zero rows** on `.is(null)`; the code treats 0 rows as failure and runs `deleteTruckCascade` on the just-created real truck — *"a FAILED LINK IS A FAILED CREATE"*. The later real promotion is refused and rolled back. |
| `app/admin/page.tsx` — `unifiedRows` `.filter(t => !t.hatchgrab_truck_id)` | reader | **(a) and (d) CONFIRMED.** A linked discovery row is folded out of `unifiedRows` entirely — it does not render, so no "Create account" button exists for it. |
| `app/api/inbound-schedule/route.ts` — bridge: `.not('hatchgrab_truck_id','is',null)` then `normName` containment on `name` | reader | **(c) CONFIRMED.** A scraped row whose truck name contains/is contained by the linked discovery name is bridged to `matched.hatchgrab_truck_id` — the **demo truck** — as an unconfirmed `truck_events` row, subject only to the `scraper_preference` gate. |
| `app/api/discovery/events/route.ts` — read-through `.in('hatchgrab_truck_id', opTruckIds)` | reader (**PUBLIC route**) | **(f) PARTLY — NOT exposed today, by one filter.** `opTruckIds` come from operator events whose truck passes `active && !excluded && truck[showCol]`. A demo truck is provisioned with `excluded: true` (READ: `HIDDEN_VISIBILITY` in `lib/provision-truck.ts`), so it is dropped **before** the read-through runs. The safety rests on that profile flag, not on the link. |
| `app/api/admin/outreach/route.ts` — reads it for the photo-delete 409 guard | reader | would treat the demo as "the live public fallback" and **refuse** photo deletion on that prospect |
| `app/api/admin/route.ts` — selects it for the admin list | reader | display only |
| `lib/delete-truck.ts` — comment: SET NULL | — | **(e) CONFIRMED by the DB fact you supplied** (`FK trucks ON DELETE SET NULL`) plus the cron's `deleteTruckCascade` → `trucks` delete. When the cleanup deletes the demo, Postgres nulls the column; **nothing in app code observes or logs it.** |
| `scripts/prune-discovery-events.mjs` — resolves the four linked trucks by it | reader | a demo link would make the prune treat that discovery row's events as protected |

**Net:** (a)(b)(c)(d)(e) CONFIRMED; (f) not exposed today but only because of `excluded: true`.
🔴 **The column carries a meaning — "this discovery row IS an operator truck's shadow" — that a demo
does not satisfy, and every reader acts on that meaning.**

## C2 · `resolveTruckLogo` has no `discovery_trucks` fallback — **CONFIRMED**
READ: `lib/truck-logo.ts` — `if (!logoStoragePath) return null`, then builds
`${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${logoStoragePath}`. The header
explains the fallback was removed *"so that clearing the logo is visible"*.

## C3 · Demo hides the truck name on every surface — **PARTLY, and mostly REFUTED**
READ: a demo is **stored** as `Demo Kitchen (xxxxxx)` (`lib/demo.ts` header; `provisionTruck`'s
`truckName = name || \`Demo Kitchen (${id.slice(…)})\``).
- Dashboard header: `truckName={isDemo ? null : …}` — **hidden**.
- Dashboard QR/share modal: `isDemo ? truck.name.replace(/\s*\([^)]*\)\s*$/, '') : …` — **shown**, suffix stripped ("Demo Kitchen").
- Customer order page (`app/trucks/[slug]/order/page.tsx`): `truckName = displayTruckName(truck?.name)` — **shown**, suffix stripped.
- KDS: INFERRED — not read for the name.

## C4 · "Your logo here" — keyed on **`isDemo`**, not on "no logo present" — **CONFIRMED**
READ, dashboard: `generateQRWithLogo(orderUrl, showBrandedQr ? truck.logo : null, 600, isDemo ? 'Your logo here' : null)`
with `showBrandedQr = hasFeature(truck.plan,'branded_qr_code') && truck.qr_code_style === 'branded'`.
READ, `lib/generateQRCode.ts`: `if (logo) {…} else if (placeholderText) {…}` — **a real logo wins over the
placeholder**. So for a demo: plan `demo` has the feature (`TRIAL_FEATURES`), but `qr_code_style`
defaults to `'standard'` (migration `20260529_qr_code_style.sql`) and `provisionTruck` never sets it →
`showBrandedQr` is false → logo argument is null → placeholder. **A demo with an uploaded logo still
shows "Your logo here" until `qr_code_style` is `'branded'`.** `DemoWelcome` hard-codes `null` for the
logo and always passes the placeholder.

## C5 · "Start a new service" — **CONFIRMED, all six parts**
READ, `lib/demo-restart.ts` `restartDemoService`: truck-wide; **orders deleted before events** (comment
cites `orders.event_id` SET NULL); `slot_capacity` and `production_slot_usage` cleared by truck;
`provisionDemoEvent(…, {now, replaceExisting:false})` then `seedDemoOrders(…, now)` then
`rebuildProductionSlotUsage`; *"THE MENU IS NOT TOUCHED"*. **Triple guard:** route rejects a non-`demo-`
token (403), route rejects a non-`demo-` **resolved truck id** (403), lib throws `DemoRestartError` on a
non-`demo-` id.

## C6 · `/api/demo/return` — **PARTLY**
READ: `GET` handler; resolves the truck by `dashboard_token`; calls `provisionDemo(supabase,
{existingTruckId})`, which calls `provisionDemoEvent` with `replaceExisting` **defaulting true** — that
branch deletes `truck_events` **by `(truck_id, event_date)`** and their orders, then upserts
`slot_capacity` from the van's `kitchen_capacity`. So **yes, a yesterday-dated event and its orders are
missed** (the restart module says so explicitly and is why it exists). **No new token:** the redirect
uses `result.dashboardToken`, which for `existingTruckId` is `existing.dashboard_token`. 🔴 **It is a
GET that writes** — see E.

## C7 · `/api/demo/save-email` rewrites `expires_at` to now + 14 days — **CONFIRMED, and it is not alone**
READ, `lib/demo-session.ts`: `saveDemoEmail` upserts `expires_at: now + RETENTION_WITH_EMAIL_DAYS*24h`.
**`touchDemoSession` does the same on every return visit** (24h or 14d by tier), called from
`provisionDemo`'s `existingTruckId` branch. **Both would shorten a one-month demo.**

## C8 · KDS demo mode — **PARTLY**
READ, `kds/page.tsx`: `isDemo = isDemoIdentifier(token)`; `<DemoModeBanner>` rendered when `isDemo`;
one-time intro keyed `hg_demo_kds_intro_${token}`; **"+30 min" is GONE** — replaced by a finish-time
picker whose opener sits inside the event menu, which is gated `(!isDemo || isPaused)`; "This device"
sheet is `isNativeApp() && !isDemo`. **Default layout in demo is `grid`** (`layoutOverride ?? (isDemo ?
'grid' : displayMode)`). ⚠️ The card mode is `'window' | 'cook'` (a separate tri-state `hg_kds_cardmode_`),
so "defaults to Window + Grid" is two different settings; grid is READ, window-default is INFERRED (null
= never chosen).

## C9 · How a demo visitor reaches the KDS — **REFUTED as stated**
READ: the dashboard has a **desktop utility strip** with a "Kitchen screen" button calling
`handleOpenKDS` — its comment: *"all three available in DEMO"*; and `UserMenu` carries the twin inside a
`sm:hidden` section (**mobile only**). `openKDS`: native → `router.push('/dashboard/<token>/kds')`;
web → `window.open('/kds/<kds_token>' or '/dashboard/<token>/kds', '_blank')`. **Desktop: the strip.
Phone: the avatar menu. iPad: the strip at ≥ 640px.** Demo hides the identity block, not the menu.

## C10 · `/api/manage` grants owner to any demo token with no session — **CONFIRMED**
READ, `resolveTruckAccess`: `if (isDemoIdentifier(truck.id)) return { ok:true, role:'owner', userId:null,
operatorId:null, via:'demo' }`. The only demo-blocked actions are the seven `domain_*` ones.

## C11 · `canSetup` is admin-aware — **CONFIRMED**
READ, `components/DemoGetStarted.tsx`: `canSetup = (process.env.NEXT_PUBLIC_SIGNUP_PUBLIC === 'true' ||
isAdmin) && !!token`. An admin sees the setup wizard while a prospect sees "Save my menu".

## C12 · Scheduler prior-day sweep closes demo events regardless of `auto_close` — **CONFIRMED**
READ, `supabase/functions/auto-event-scheduler/index.ts`: `if (e.event_date < today) return true` before
the `auto_close` check. **0** occurrences of `isDemo`/`demo-`/`DEMO_PREFIX` in that file (control:
`auto_close` matched). Demo events are provisioned with `auto_close: false`, so a **same-day** demo is
never closed by the scheduler; only a **prior-day** one is.

## C13 · `/api/demo` and `/api/admin/provision-demo` — **CONFIRMED**
READ: `/api/demo` — `demoRatelimit` 5/hour/IP (header comment; `lib/ratelimit.ts` owns the sizing),
`export const maxDuration = 300`, returns `redirectTo: /dashboard/<token>`. `/api/admin/provision-demo` —
**exists**, 130 lines, `verifyAdmin` required, accepts multipart `file` **or** JSON `text`, plus
`existingTruckId`; header marks it **TEMPORARY, DELETE when the public endpoint lands** (see premise 5).

## C14 · Self-serve signup creates an unlinked truck — **CONFIRMED**
READ: `/api/signup` writes `claimed_by_operator_id` on the demo session (comment: *"Marks which demo this
account came from"*); `/api/setup` — grep for `discovery_trucks|hatchgrab_truck_id` **exit 1, 0 lines**
(control: `create_truck` **2** in the same file). No path links the new truck to a discovery row.

## C15 · The Escape defect — **CONFIRMED**
READ: `ScheduleEventsPopup` and `ConfirmDeleteDialog` both do `window.addEventListener('keydown', onKey,
true)`. Two capture listeners on the **same node** fire in registration order; the dialog calls
`e.stopPropagation()`, which does not stop a sibling on that node — only `stopImmediatePropagation` would.
Escape closes the dialog **and** the popup beneath it.

---

# A · The outreach prospect modal

- **Component:** inline in `components/admin/OutreachPanel.tsx` — the "row-detail MODAL", opened by
  `setModalId`, rendered as `{modalProspect && <div className="fixed inset-0 bg-black/50 z-50 …">}`.
  READ: **not portaled**, **no backdrop `onClick`** (*"an OUTSIDE CLICK DOES NOT CLOSE it"*), **no focus
  trap, no scroll lock** — by stated convention with `RejectOrderModal` etc.
- **Escape:** READ — a **bubble-phase** `window.addEventListener('keydown', …)` calling `setModalId(null)`.
- **Its actions:** logging, delete, compose, schedule — all via `/api/admin/outreach` (POST), which
  `verifyAdmin`s. The prospect row it holds carries `website`, `schedule_url` (READ, the `safeHref`
  call sites) and a logo/photo thumbnail (READ: the *"ONE HEADER THUMBNAIL — three states"* block), so
  **`name` and `logo_url` are already in the modal's data**.
- **What a second modal on top collides with:**
  - **Stacking.** The prospect modal is `z-50`. The compose window uses an **inline `zIndex`**, and its
    comment records why: `z-[85]` was an arbitrary Tailwind value with **no generated rule**, so it
    painted **under** the parent (*"RAISING THE NUMBER WOULD HAVE MADE IT WORSE"*). The schedule popout
    uses `createPortal` + inline `zIndex: 90`. **Any new modal must use an inline z-index above 90, or
    a value already generated elsewhere.**
  - **Escape.** The prospect modal listens in the bubble phase; the popout and dialog use capture +
    `stopPropagation`. A new modal that listens in the bubble phase would close **together with** the
    prospect modal; one that uses capture + `stopPropagation` closes alone **unless** another capture
    listener on `window` is also registered, in which case C15 repeats.
  - **Focus.** Nothing traps focus; Tab walks out of the top modal into the one beneath.
- **`DemoModal` itself is a `fixed inset-0` portal-less modal** (READ, `DemoUpload.tsx`) with its own
  provider — see B.

# B · Upload and provisioning

- **`components/landing/DemoUpload.tsx`** exports `DemoModalProvider`, `DemoCta`, `DemoModal`. READ:
  `DemoCta` throws without the provider; on submit it builds a `FormData`, `fetch('/api/demo', {method:
  'POST', body: fd})`, and on `data.ok && data.redirectTo` calls **`window.location.assign(redirectTo)`** —
  a full navigation to `/dashboard/<token>`. It takes **no truck name, logo or discovery id**; failure
  offers `/api/demo/build-request`.
- **`components/menu/MenuUploadFields`** — READ: a controlled component `{file, onFile, text, onText,
  disabled, accent}`; **trivially reusable**.
- **Reuse from admin without forking:** `DemoModal` can be mounted anywhere under a `DemoModalProvider`,
  but (i) success **navigates the admin away** to the demo dashboard, (ii) it cannot pass name/logo/
  discovery id, and (iii) `/api/demo` is the **public, rate-limited** route — an admin call would count
  against 5/hour/IP and would not carry an admin identity. `/api/admin/provision-demo` accepts the same
  shape with `verifyAdmin` but is marked for deletion.
- **`provisionDemo(supabase, input)`** — READ, `ProvisionDemoInput`: `{ file?, text?, template?,
  existingTruckId?, now? }`. **No name, no logo, no discovery id.** It calls `provisionTruck(supabase,
  {kind:'demo', van:{name:'Van 1', kitchen_capacity: DEMO_VAN_CAPACITY}})`, then `createDemoSession`
  (24h) or `touchDemoSession`, commits the menu, `provisionDemoEvent`, `seedDemoOrders`.
- **`provisionTruck` demo profile** — READ, `lib/provision-truck.ts`: `identity:'random'`, `plan:'demo'`,
  `addOrderLayout:'scroll'`, `nameRequired:false`, **`truckOrderEmailEnabled:false`**, visibility =
  `HIDDEN_VISIBILITY` (`show_on_vf:false, show_on_hg:false, order_link_*:false, is_customer:false,
  excluded:true`). **`ProvisionTruckOptions` already accepts `name`, `contactEmail`, `contactPhone`,
  `cuisineType`** — a name *can* reach a demo truck through this layer; `provisionDemo` simply never
  passes one. **No logo option exists at any layer.**
- **Identity:** READ, `demoIdentity()` — `id`, `slug` and `dashboard_token` are **each** `demo-` +
  independent random; *"generated INDEPENDENTLY… leaking one must not hand over the others."*
  **`trucks.name` feeds none of them.** `assertReservedPrefix` returns early for `kind === 'demo'` and
  throws for an operator identity carrying the prefix; `proxy.ts` waives the `/dashboard` session gate
  for `demo-` tokens on exactly that invariant. **A demo named after a real truck cannot collide on
  slug or token.**

# C · Name and logo

**Name-hiding conditionals** (READ, dashboard): header `truckName={isDemo ? null : …}`; QR modal
strips the suffix; order page `displayTruckName`. The header is the only surface that *hides* it.

**Logo paths:**
- `trucks.logo_storage_path` is a **bucket path** (`resolveTruckLogo` prefixes
  `/storage/v1/object/public/truck-media/`); written by the operator upload (`get_upload_url` → PUT →
  `update_settings { logo_storage_path }`, READ in `DemoGetStarted`'s orchestration).
- `discovery_trucks.logo_url` is a **URL or a root-relative path**. Measured on 12 September (TRANSCRIBED
  from that session's sweep, not re-derived here): **154 populated — 109 `/logos/…` local paths, 45
  absolute URLs**. SQL to re-derive is in §SQL.
- **Copying an external `logo_url` server-side would be a new class.** READ: the only server-side
  `fetch(url)` of a variable URL in `app/api` + `lib` are Meta API calls (`lib/meta-whatsapp.ts`,
  `whatsapp-signup`); `lib/generateQRCode.ts`'s `loadImageViaBlobUrl` fetches the logo **in the browser**
  (`HTMLImageElement`, `URL.createObjectURL`). Grep for an SSRF/allow-list helper (`isSafeFetchUrl|ssrf|
  allowedHosts|isPrivateIp|blockPrivate|allowlist`) matched only **settings-field allowlists in comments**.
  **There is no existing guard to reuse.** A `/logos/…` value is our own static file, not a fetch at all.

**The QR** (READ): `generateQRWithLogo(url, logoUrl, size, placeholderText)` — callers: dashboard
fullscreen (`showBrandedQr ? truck.logo : null`), `DemoWelcome` (null logo + placeholder), and
`generateQRCodePNG` for the **manage-page poster** via `buildQr(style)`, where `logoUrl = style ===
'branded' && truck.logo_storage_path ? <storage url> : null`. **Gusto's path is the poster + the
dashboard fullscreen; both gate on `qr_code_style === 'branded'`.**

**Name as a MATCH KEY** (READ, sweep of `normName|createSlug|normalize…(x.name|truck_name)`):

| site | key | collision if a demo carried a real truck's name |
|---|---|---|
| `/api/discovery/events` — `createSlug(truck.name)` for the public `/trucks/[slug]` filter and `allTrucks.cleanKey` | operator truck name | the demo would produce the **same public slug** — but it is dropped first by `excluded: true` |
| `/api/inbound-schedule` bridge — `normName` containment against **linked** discovery names | discovery name | only bites if the demo is *linked* (C1c) |
| `lib/discovery-gate.ts` — `normName` containment against `discovery_trucks` | discovery name | resolves *discovery* rows, not `trucks`; no demo effect |
| scraper/import scripts — `normalizeName(t.name)` sets | discovery name | no `trucks` read |

# D · Dashboard Settings in demo (D1)

READ, `app/dashboard/[token]/page.tsx`:

| control | state in demo | endpoint → column |
|---|---|---|
| **Auto-accept** toggle | **LIVE** — `disabled={isOffline}` only | `/api/dashboard/action` `set_auto_accept` → `trucks.auto_accept` (no demo check in the handler) |
| **Kitchen capacity** / **capacity window** | **LIVE** | `/api/manage` `update_van_settings` → `truck_vans.kitchen_capacity`, `.capacity_window_mins` |
| Offline protection | forced **off**, disabled | — |
| Order-ready step | forced **off**, no-op | — |
| Printing, Notifications | **hidden** (`!isDemo`) | — |
| Custom domain (`demoBlockedActions`) | 403 | — |

**Does anything rewrite those?** READ: `provisionDemoEvent` **reads** `van.kitchen_capacity` to build
`slot_capacity` and does not write it; the restart calls it; `auto_accept` is untouched by restart,
return and re-provision. **Dominic's settings survive a restart** (the `slot_capacity` grid is rebuilt
*from* his capacity).

**isAdmin / canSetup branches** (READ): header `isAdmin={!isDemo && isAdmin}`, `showManageLink={!isDemo &&
…}`, `showSignOut={!isDemo}`; `DemoGetStarted isAdmin={isAdmin}` → `canSetup` → wizard vs save-only;
`UserMenu` renders its admin section on `isAdmin`. **KDS:** `<DemoGetStarted token={token} />` with **no
`isAdmin` and no `extractionSource`** → save-only unless `NEXT_PUBLIC_SIGNUP_PUBLIC`, and the `upload`
copy variant on a sample demo (spec G11 — **still present**, READ).

# E · Fresh event on open (item 6)

**The restart, end to end** (READ, `restartDemoService` + the dashboard handler): deletes `orders` (by
truck) → `truck_events` (by truck) → `slot_capacity` → `production_slot_usage`; preserves the menu;
returns `{event, ordersDeleted, eventsDeleted, seededOrders, warnings}`; the client clears
`hg_demo_seen_orders_${token}` and `hg_demo_loop_${token}` then **`window.location.reload()`**. **Trigger:
a button only** — the "This service has ended / Start a new service" card, shown when
`demoServiceEnded = isDemo && activeEvent && (status==='closed' || now > event_date+end_time)`.

**`demoEventWindow(now)`** (READ): start = now floored to :00/:30; end = start + 3h, clamped to `23:59`;
seeder target ≈ **1.057 orders per 5-min slot**, floor **4**, first collection `max(start+10, now+10)`:

| open at | window | orders (approx) |
|---|---|---|
| 17:00 | 17:00–20:00 | ~37 |
| 17:20 | 17:00–20:00 | ~34 (first slot 17:30) |
| 21:30 | 21:30–23:59 | ~30 |
| 23:40 | 23:30–**23:59** | **4** (the floor; 1–2 bookable slots) |

**Where a load-time hook could sit:** the client already computes `demoServiceEnded` once the event
loads; a "restart on load if ended" would go beside `startNewService`, gated on a per-token localStorage
flag so it fires **once per page load and never on the 60-second `setInterval` poll** (READ:
`fallbackInterval = setInterval(fetchAllRef.current, 60000)`).

🔴 **GET side effects today** (READ):
- `GET /api/dashboard` — **no** `update/upsert/insert/delete` in the route (grep; the only demo mention is
  a comment). Reads only.
- `GET /dashboard/<token>` — the page is `'use client'` with no server wrapper in that directory; a bot
  fetch renders the shell and **triggers nothing**.
- `GET /api/dashboard/…/kds` — same page family; INFERRED no write.
- 🔴 **`GET /api/demo/return?t=…` RE-PROVISIONS.** It is a `GET` (READ) that calls `provisionDemo` →
  `touchDemoSession` (moves `expires_at`) → `provisionDemoEvent(replaceExisting)` (deletes today's event
  and orders, reseeds). **This is the link in the 14-day email. A mail scanner that fetches it consumes
  the fresh service before the prospect clicks.** Any "first open" trigger built as a GET has this exposure.

**Judging "stale":** `truck_events.status` (`open`/`closed`), `event_date`, `start_time`, `end_time`,
`opened_at` exist (READ, `provisionDemoEvent`). **Seeded vs visitor-placed can be told apart
structurally:** every seeded order has **`customer_email: null`** (READ, `seed-demo-orders.ts` — *"never
populate this"*), while `/api/orders/submit` **requires** `customerEmail` (READ, its 400 guard).
`DemoLoopComplete` uses a **browser-local** baseline of order keys, not that column.

# F · Retention (D2)

**`/api/cron/demo-cleanup`** — READ in full:

| sweep | predicate |
|---|---|
| 1 · expiry | `demo_sessions.expires_at < now()` **AND `claimed_by_operator_id IS NULL`**, batch 200 |
| 1b · claimed-but-abandoned | claimed **AND** `expires_at < now()` **AND** `created_at < now − 30 days` |
| 2 · orphan | every `trucks.id LIKE 'demo-%'`; skip if its session `created_at` is within **2 h**; delete unless **`hasMenu && hasEvent`** (active `menu_items_db` count > 0 AND any `truck_events` row) |

Every delete goes through `sweep()`, which **re-asserts the `demo-` prefix** and calls
`deleteTruckCascade` (READ: NO_ACTION tables first, `orders` the guaranteed blocker, then `trucks`).
Auth: `Bearer $CRON_SECRET` or `verifyAdmin`. It logs every run to `demo_cleanup_log`.

**Every writer of `demo_sessions.expires_at`** (READ, searched alone; control `claimed_by_operator_id`, 4
files) — all three live in `lib/demo-session.ts`:

| writer | writes | called from |
|---|---|---|
| `createDemoSession` | `now + 24h` | `provisionDemo`, first provision (`/api/demo`, `/api/admin/provision-demo`) |
| `touchDemoSession` | `now + 24h`, or `+14d` if an email is stored | `provisionDemo` with `existingTruckId` (`/api/demo/return`) |
| `saveDemoEmail` | `now + 14d` | `/api/demo/save-email` |

**`retired_at` has no writer.** READ: the only two occurrences in code are comments in the cron saying so
(control: `email_sent_at`, 1 file).

**What one-month retention would require:** a fourth tier written at provision time (or a flag the cron
reads); **and both `touchDemoSession` and `saveDemoEmail` must be taught not to shorten it**, because
each unconditionally rewrites `expires_at` from `now`. The orphan sweep is unaffected once the demo has
a menu and an event. The 30-day claimed sweep keys on `created_at`, not `expires_at`, and would reclaim a
claimed outreach demo on day 30.

# G · Kitchen screen (item 7)

**Routes** (READ): `/dashboard/[token]/kds` (the in-app KDS, demo-capable) and `/kds/[kds_token]` (the
van's standalone screen — *"left exactly as it was"*). Demo resolution: `isDemoIdentifier(token)`.
`DemoModeBanner` renders in `kds/page.tsx` **above the hand-rolled `<header>`**.

**The sizing chain** (READ):

```
kds/layout.tsx   <div class="w-screen h-dvh overflow-hidden">
kds/page.tsx     <div class="w-full h-full flex flex-col bg-slate-50 overflow-hidden">
                   [amber degraded strip]           shrink-0
                   <OfflineBanner/> <WebOfflineBanner/>
                   {isDemo && <DemoModeBanner/>}    w-full … shrink-0  (in-flow, natural height, min-h-[1.75rem])
                   <header style={{paddingTop: max(0.625rem, env(safe-area-inset-top))}}>
                   …
                   <div class="flex flex-1 min-h-0">          ← the board absorbs the remainder
                     <div class="flex flex-col flex-1 min-w-0 overflow-y-auto">
```

**The banner's height is subtracted by the flex column, not by a `calc`** — the same mechanism the
dashboard uses. The only fixed viewport unit inside is a modal's `max-h-[85vh]` (not `dvh`; on mobile
Safari 85vh can exceed the visible area). The `h-dvh` full-screen states are the loading/error screens.
**Nothing is pushed off-screen by the banner in list or grid mode**, because the board is the flexible
child — but 🔴 **the banner is the element under the iOS status bar on native**, because it sits above
the header that carries the inset (premise 6). The dashboard solved the same problem by moving its banner
below `AppHeader`. `MAX_GRID_VISIBLE`: **gone**. G11: **present**.

**Visual checklist for Safari Responsive Design Mode** (Develop → Enter Responsive Design Mode,
⌥⌘R), at iPhone 390×844 and iPad 1024×1366, on `/dashboard/<demo-token>/kds`:
1. Top edge: does "DEMO MODE" sit flush at the top with the header below it, and is nothing clipped?
2. Grid mode: is the last visible row of cards fully inside the viewport, and does the board scroll to
   the final card?
3. List mode: same; the footer/step switches stay visible.
4. Open the one-time intro: is its close button reachable at 390px?
5. Open a card's modal: does its `max-h-[85vh]` box leave the top and bottom edges visible?
6. Rotate the iPad: the banner's action button (`DemoGetStarted`) does not overlap the header's controls.
7. (Native only, not RDM) — does the banner sit under the status bar?

# H · Customer-facing risk of a BRANDED demo

- **Order page banner:** READ — `{isDemo && <DemoModeBanner … className="sticky top-[60px] z-40" action={<DemoGetStarted slug={slug}/>}/>}`. **Yes, a demo banner shows.**
- **Order page name:** `displayTruckName(truck.name)` — a branded demo would show the real truck's name
  under a DEMO MODE strip.
- **Confirmation email:** READ, `/api/orders/submit` — `isDemoTruck = isDemoIdentifier(truck.id)`; a demo
  is **exempted from the `excluded` gate** (*"ordering on it IS the demo"*) and 🔴 **"DEMO: NEVER
  EMAIL"** — no customer confirmation is sent for a demo order. `/api/dashboard/action` likewise
  suppresses status emails for demo trucks (READ). `truck_order_email_enabled` is false on the profile.
- **QR poster/download:** only reachable through the manage page's `buildQr`, which renders `truck.name`
  and the branded logo with **no demo marking** (READ: `buildQr` inputs are `orderUrl`, `logo_storage_path`,
  `truck.name`). Whether a demo token reaches `/manage`: the page redirects `staff` to the dashboard and
  gates only `CustomDomainSetup` on `!isDemoIdentifier(token)`; `resolveTruckAccess` grants a demo
  `owner`. **INFERRED: reachable; not walked.**
- **The risk, plainly:** a real customer scanning a branded demo's QR sees the real name, a DEMO MODE
  strip, can place an order (it saves and books a slot), and **gets no email** — the order lands on a
  board nobody is running.

# I · The banner CTA

READ, `DemoGetStarted`: `canSetup = (NEXT_PUBLIC_SIGNUP_PUBLIC === 'true' || isAdmin) && !!token`;
variant = `!canSetup ? 'saveOnly' : extractionSource === 'template' ? 'sample' : 'upload'`.

| `NEXT_PUBLIC_SIGNUP_PUBLIC` | viewer | what the banner does |
|---|---|---|
| unset / not `'true'` | prospect | **"Save my menu"** → `/api/demo/save-email` (14-day tier, return-link email). No signup. |
| unset / not `'true'` | admin | **wizard** — signup in-modal; `/api/signup` re-checks the session server-side (the comment cites `SIGNUP_PUBLIC` unset + admin) |
| `'true'` | anyone | **wizard** → `/api/signup { demo:<token> }` → `/api/setup create_truck` → `/manage/<token>?import=demo` |
| any | customer order page (slug, no token) | save-only — `canSetup` needs a token |

**On an outreach demo:** with signup closed the prospect is offered only "Save my menu"; with it open,
self-serve signup runs and **creates a truck linked to nothing** (C14) — a duplicate of the discovery row
the demo was built from, exactly the double-listing the promote's link exists to prevent.

# J · Gusto impact map

Every file a build would touch that is also on a live operator or customer path, and the gate:

| item | file(s) on a live path | gate that keeps Gusto byte-identical |
|---|---|---|
| 1–3 button/modal/link | `OutreachPanel.tsx` (admin only) · `lib/provision-demo.ts` (demo only by `kind:'demo'`) · **`lib/provision-truck.ts`** — shared with `/api/setup` | any new option must be **opt-in and absent from the operator call**; the profile object is the gate |
| 3 the link column | new column on `demo_sessions` or `outreach_prospects` | no live path reads either table for an operator |
| 4 name/logo | `provisionTruck` (name already accepted) · `lib/generateQRCode.ts` (shared with the poster) · dashboard QR call | `isDemoIdentifier(token)` on the dashboard; **`generateQRWithLogo` must not change its `logo ? … : placeholder` order** |
| 5 settings | `/api/dashboard/action`, `/api/manage` | already live for demos; **no change needed** |
| 6 fresh event | dashboard page (`demoServiceEnded`, `startNewService`) · `/api/demo/restart` | `isDemo` on the client, triple guard on the server; **must not touch the 60s poll shared with Gusto** |
| 7 KDS | `kds/page.tsx` (shared) · `kds/layout.tsx` (shared) | `isDemo` around the banner move; **a layout change to `h-dvh`/`flex-col` is NOT gateable** — it is the same box Gusto's iPad renders |
| retention (D2) | `lib/demo-session.ts` · cron | demo tables only |

🔴 **Cannot be gated:** the KDS layout box and `generateQRWithLogo`'s internals. Everything else has a
predicate.

# K · Open decisions — as questions

1. **Where does the discovery link live?** `demo_sessions.discovery_truck_id` — one row per demo, cascades
   away with the truck, invisible to every `hatchgrab_truck_id` reader in C1, and the outreach modal
   would need a lookup by `discovery_truck_id` to find "this prospect's demo". `outreach_prospects.<col>`
   — one demo per prospect, survives the demo's deletion as a dangling id (the FK to `trucks` would
   cascade-null it only if declared), and the modal already holds the row. Either way: **not
   `hatchgrab_truck_id`** — every reader of it acts on "this IS an operator truck".
2. **What counts as "stale" for item 6?** `status === 'closed'`, `now > end_time`, or `event_date <
   today`? The scheduler closes prior-day events nightly; same-day ones stay open (`auto_close: false`).
   And should a restart on open **preserve the prospect's own orders** (the ones with a `customer_email`)
   — today the restart deletes everything.
3. **What carries across at promotion?** The menu (the existing claim path re-commits the stored
   extraction). Dominic's dashboard settings (`auto_accept`, `kitchen_capacity`, `capacity_window_mins`)
   live on the demo truck and its van and are **not** copied by anything read here — do they follow?
4. **The banner CTA on an outreach demo:** leave `DemoGetStarted` as is (save-only when signup is closed),
   hide it, or point it at "talk to Dominic"? With signup open it produces an unlinked duplicate.
5. **The branded-demo customer risk:** accept it, mark the poster, or keep outreach demos on the
   `Demo Kitchen` name until promotion?
6. **`/api/demo/return` as a GET:** leave it (the email link must be clickable) and make item 6's
   trigger client-side, or move re-provisioning behind a POST the page issues after load?
7. **Retention:** a fourth tier on `expires_at`, and do `touchDemoSession` and `saveDemoEmail` respect it?
8. **`/api/admin/provision-demo`:** delete it (its header says so), or repurpose it as the admin entry
   that *can* carry a name and discovery id?

---

# SQL — for Dominic to run; nothing here was executed

**Logo sources, our storage versus external** (re-derives the transcribed 109/45):

```sql
select
  case
    when dt.logo_url is null or btrim(dt.logo_url) = ''            then 'empty'
    when dt.logo_url like '/logos/%'                               then 'own static /logos/'
    when dt.logo_url ilike '%/storage/v1/object/public/truck-media/%' then 'own supabase storage'
    when dt.logo_url ~* '^https?://'                               then 'external host'
    else 'other'
  end                                        as logo_source,
  count(*)                                   as rows
from public.discovery_trucks dt
group by 1
order by rows desc;
```

**The live demo session's tier, and whether anything already shortened it:**

```sql
select ds.truck_id,
       ds.created_at,
       ds.expires_at,
       ds.expires_at - ds.created_at        as retention,
       ds.email is not null                 as has_email,
       ds.email_sent_at,
       ds.claimed_by_operator_id is not null as claimed
from public.demo_sessions ds
order by ds.created_at desc;
```

**Which discovery rows a branded demo would name-collide with on the public slug** (uses only columns
in the facts you supplied):

```sql
select lower(regexp_replace(dt.name, '[^a-zA-Z0-9]+', '-', 'g')) as public_slug,
       count(*)                                                    as discovery_rows,
       string_agg(dt.name, ' | ' order by dt.name)                as names
from public.discovery_trucks dt
group by 1
having count(*) > 1
order by discovery_rows desc;
```

---

## Closing `git status` — identical to the opening one apart from this report

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
	modified:   docs/manual-update-report.md
	modified:   docs/reference-manual.md
	modified:   docs/scraper-reference-manual.md

Untracked files:
	docs/demo-outreach-review-report.md
```
