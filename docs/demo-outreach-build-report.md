# Outreach "Create Demo" — build report (items 1–5, retention, readable URL, demo→trial link)

**Built 12 September 2026. Nothing is staged, nothing is committed, the migration is NOT applied.**
Items 6 (fresh event on open) and 7 (KDS) were not built. `/manage`, `/api/admin/create-truck`, the cron,
`lib/generateQRCode.ts` and every Gusto rendering path are untouched (proved in §V2).

Every factual claim is marked **READ** (read in source this session) or **INFERRED**.

---

## 🔴 PREMISES — what was wrong or only partly right

1. **"Expect three modified docs/ files and otherwise clean."** Almost: the opening tree also carried one
   untracked file, `docs/demo-outreach-review-report.md` (the review this task was briefed from). No code
   file was modified. Verbatim status is in §0.
2. **0b — "the review INFERRED a demo token reaches /manage".** READ this session: it does for a
   **signed-in** user (Dominic, any operator, the native app) and does **not** for an anonymous prospect —
   `proxy.ts` `isProtected` includes `pathname.startsWith('/manage')` with no demo exemption, so a browser
   with no `sb-*` cookie is redirected to `/login`. Detail in §0b.
3. **D2 "ONE MONTH"** is implemented as **30 days** (`RETENTION_OUTREACH_DAYS = 30`), the same shape as the
   24h and 14d tiers. Say if you want a calendar month.
4. **The 30-day claimed-but-abandoned sweep WILL reclaim a claimed outreach demo on day 30** — it keys on
   `created_at`, and an outreach demo's `expires_at` is created_at + 30d, so both predicates turn true
   together. Detail in §4. Not changed (the cron was out of scope); flagged.
5. **"Index whatever the outreach modal will query by."** The partial index on `discovery_truck_id` is
   in the migration, but **this build does not yet show a prospect's existing demo in the modal** — the
   modal only creates. The lookup the index serves is the obvious next piece; it is not built here.
6. **D7** (Settings already live in demo, no change needed) — **INFERRED from the read-only review**; the
   Settings tab was not re-read this session and nothing in this build touches it.
7. **"The scraper writes logo_url"** — INFERRED (not re-read). The outreach media upload also writes it —
   READ, `app/api/admin/outreach/route.ts` `publicUrl` → `discovery_trucks.update({[column]: publicUrl})`.
   The allowlist does not depend on either fact.

---

## 0 · Opening state, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   docs/manual-update-report.md
	modified:   docs/reference-manual.md
	modified:   docs/scraper-reference-manual.md

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/demo-outreach-review-report.md

no changes added to commit (use "git add" and/or "git commit -a")
════
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
9e83a5e migration changes
69c4fdd migration changes
```

## 0a · BRANDED QR — the two surfaces agree; the manual's constraint is stale

READ, `lib/truck-logo.ts` `resolveTruckLogo`: `if (!logoStoragePath) return null`, else
`${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${logoStoragePath}`. Its header records
that the discovery fallback was removed *"so that clearing the logo is visible"*.
READ, `/api/dashboard`: `truckLogo = await resolveTruckLogo(supabase, truck.id, truck.logo_storage_path)` →
`truck.logo`. READ, dashboard `handleShowQR`: `generateQRWithLogo(orderUrl, showBrandedQr ? truck.logo : null,
600, isDemo ? 'Your logo here' : null)` with `showBrandedQr = hasFeature(truck.plan,'branded_qr_code') &&
truck.qr_code_style === 'branded'`.
READ, Manage `buildQr(style)`: `logoUrl: style === 'branded' && truck.logo_storage_path ?
\`${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${truck.logo_storage_path}\` : null`.

**Same row → the same string, or null on both.** The V11.14 constraint (*"do not auto-select branded until
these agree"*) describes a divergence — resolved-with-fallback vs raw path — that no longer exists.
Gates: dashboard `hasFeature` (plan `demo` → `PLAN_FEATURES.demo = TRIAL_FEATURES`, READ `lib/features.ts`),
Manage `can()` = `canAccess` (non-trial plans fall through to the same set). **Phase 3 sets `branded`,
and only after a logo has actually landed** (§3).

## 0b · /manage and a demo token

READ, `app/api/manage/route.ts` `resolveTruckAccess`: `if (isDemoIdentifier(truck.id)) return { ok:true,
role:'owner', userId:null, operatorId:null, via:'demo' }` — the API grants owner with no session.
READ, `app/manage/[token]/page.tsx`: the only redirect is `if (userRole === 'staff') router.replace(...)`;
the only `isDemoIdentifier` gate is on `CustomDomainSetup`; `openQrView('branded')` gates on
`can('branded_qr_code')`; `buildQr` renders `truck.name` + the logo — no demo marking.
READ, `proxy.ts`: `isProtected = (startsWith('/dashboard') && !isDemoDashboard(pathname)) ||
startsWith('/manage')`; with `!user && !isNativeApp && !hasStaleButRealSession` → 307 to `/login`.
**Verdict: a demo token reaches the printable poster for any signed-in browser or the native app; an
anonymous prospect is stopped at the edge.** `/api/manage?token=demo-…` itself answers without a session
(the proxy lists `/api` as public) but returns JSON, not a poster. Not changed.

## 0c · trucks.name as a MATCH KEY

Sweep (READ): `normName|normalizeName|createSlug(|normalize(.*name|.name.toLowerCase()` over
`app lib components scripts supabase/functions proxy.ts`, no extension scope (54 lines). The
`trucks.name`-keyed sites and why a demo carrying a real name cannot collide:

| site | what it keys on | protection |
|---|---|---|
| `/api/discovery/events` `createSlug(truck.name)` (operator branch) | public truck slug | operator trucks filtered `if (truck.excluded) return false` / `!t.excluded && t[showCol]` (READ) — a demo is `excluded: true` from `HIDDEN_VISIBILITY` (READ `lib/provision-truck.ts`). **Still holds.** |
| `lib/provision-truck.ts` `operatorIdentity()` `createSlug(slugOverride \|\| name)` | operator id/slug | only for `profile.identity === 'readable'`; a demo takes `demoIdentity()` (three independent `demo-` randoms). **Name never reaches a demo's identity.** |
| `/api/setup` `safeSlug(name)` | operator slug | operator path only |
| `/api/inbound-schedule` `normName` containment | discovery names WITH `hatchgrab_truck_id` | a demo is never written there (D1) |
| `app/trucks/[slug]/page.tsx` `createSlug(rawName)` | a CSV, not `trucks` | n/a |
| `lib/discovery-gate.ts`, scrapers | discovery names | no `trucks` read |

**New key introduced by this build:** `demo_sessions.public_ref` = `createSlug(trucks.name)` for outreach
demos. It is read by exactly one place (`app/demo/[ref]/route.ts`), joined only to `demo_sessions`, never
to `trucks.slug` — `/demo/pizzeria-gusto` and `/trucks/pizzeria-gusto` are different tables and different
routes.

## 0d · Promote vs self-serve — the whole diff

**Admin promote is TWO routes.** READ, `app/api/admin/create-truck/route.ts` POST:
1. `provisionTruck({ kind, name, slug, plan, visibility, contactEmail, cuisineType, van: { name?, kitchen_capacity: null } })`
2. if `discoveryTruckId`: `discovery_trucks.update({ hatchgrab_truck_id: result.truck.id, updated_at })
   .eq('id', discoveryTruckId).is('hatchgrab_truck_id', null).select('id')` — zero rows or error ⇒
   `deleteTruckCascade(result.truck.id)` ⇒ 409 `link_failed` (500 + `orphanTruckId` if the rollback fails).
3. Response with the token. **Nothing else** — no logo copy, no visibility change, no operator, no email.

READ, `app/api/admin/create-operator/route.ts`: auth user + `operators` row (temp password) →
`trucks.update({ operator_id })` → **`discovery_trucks.update({ excluded: true }).ilike('name', shadowName)`**
(best-effort, "GRADUATION HOOK") → welcome email.

**Self-serve.** READ, `/api/signup`: auth user + `operators` row (own password) →
`demo_sessions.update({ claimed_by_operator_id }).eq('truck_id', demoTruck.id)` → verification row + email.
READ, `/api/setup create_truck`: `provisionTruck({ kind:'operator', name, slug: safeSlug(name), contactEmail,
contactPhone, phoneIsWhatsapp, visibility:'hidden', van:{ kitchen_capacity:null } })` →
`trucks.update({ operator_id, setup_step:'menu' })`.

| promote does | self-serve did | gap? |
|---|---|---|
| `hatchgrab_truck_id` link, `.is(null)` guarded | nothing | **gap (a)** — closed in §6 |
| shadow `excluded: true` (by name) | nothing | **gap (b)** — closed in §6, by id |
| `plan` from the admin | profile default `trial` | not a gap — spec v7.1 |
| `cuisineType` at create | wizard's `update_settings` afterwards | not a gap |
| compensating `deleteTruckCascade` | — | **deliberately NOT mirrored** (§6) |
| operator via create-operator, temp password | signup, own password | not a gap |

**Correction to the brief's framing:** the link *is* the only missing write on the create-truck route, but the
promote's second route adds the shadow exclusion — so **two** things, not one, and both are built.

---

# 1 · Migration — `supabase/migrations/20260912_demo_sessions_outreach.sql` — 🔴 NOT APPLIED

One file, additive, `if not exists` throughout. Columns beyond the two you named were checked against the
verified fact list (none of `discovery_link_*` / `discovery_linked_at` exist today — they are new by
construction; the file's VERIFY block reads `information_schema.columns` to confirm after applying).

| column | type | why |
|---|---|---|
| `discovery_truck_id` | uuid NULL, FK `discovery_trucks(id)` ON DELETE SET NULL | the demo→prospect link (D1). NULL for every anonymous demo. |
| `public_ref` | text NULL, UNIQUE (`demo_sessions_public_ref_key`) | `/demo/<ref>`. Lookup key only. |
| `discovery_link_status` | text NULL | `linked \| conflict \| failed` — the self-serve outcome (§6) |
| `discovery_link_truck_id` | text NULL | the real truck the link pointed (or tried to point) at |
| `discovery_link_note` | text NULL | reason on conflict/failure |
| `discovery_linked_at` | timestamptz NULL | when attempted |

Index: `demo_sessions_discovery_truck` partial on `discovery_truck_id` (the future "this prospect's demo"
lookup). `public_ref` is served by its UNIQUE index. `claimed_by_operator_id` is already indexed
(`demo_sessions_claimed`, READ in `20260723_demo_sessions_phase4.sql`).

**Deploy coupling:** the outreach session write is STRICT (§2), so "Create Demo" fails with a clear error
until this runs; the anonymous path never sends these columns and is unaffected. The SQL is repeated in
the chat reply.

# 2 · Provisioning carries name, logo and discovery id

**`lib/provision-demo.ts`** (READ, edited). `ProvisionDemoInput` gains `name`, `logoUrl`, `discoveryTruckId`
(all optional; absent on the landing path). `ProvisionDemoResult` gains `publicRef` and `logoStoragePath`.
- `provisionTruck` is called with `...(input.name && input.name.trim() ? { name } : {})` — the key is
  **absent**, not null, on the anonymous path, so `provisionTruck`'s `Demo Kitchen (xxxxxx)` default applies
  exactly as before (§V1 proves the options object is byte-identical).
- Session: anonymous → `createDemoSession` as before; outreach → `createDemoSession(…, { discoveryTruckId,
  publicRefBase: truckName })` where `truckName` is what `provisionTruck` actually wrote, so the URL matches
  the header. A `DemoSessionError` becomes `ProvisionDemoError` carrying the truck id — at that point the
  truck has no menu and no event, so the orphan sweep reclaims it.
- Branding (outreach, first run only): `copyDemoLogo` → if a path landed, `trucks.update({ qr_code_style:
  'branded' })`. Refusals and copy failures go to `warnings` and the demo continues without a logo.
- `lib/provision-truck.ts` **unchanged** — `ProvisionTruckOptions.name` already existed (READ).

**`lib/demo-logo.ts`** (new). `classifyDemoLogoSource(logoUrl, origins)` is PURE:
1. normalise through the shared `formatImageUrl(raw, 'logos')` (READ `lib/image-utils.ts`: bare name →
   `/logos/<name>`), so this file cannot disagree with the outreach thumbnail about a value;
2. `/logos/<basename>` only — `path.posix.basename(rest) === rest` and `/^[A-Za-z0-9_-]+\.(png|jpe?g|webp|gif|svg)$/i`
   → `static`; read from `public/logos`, uploaded to `truck-media` at `<truck.id>/<ts>-<file>` (the operator
   upload's own shape, READ `/api/manage get_upload_url`);
3. `<origin>/storage/v1/object/public/truck-media/<path>` where origin ∈ {`NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_URL`} (both, because the outreach upload writes with one and `resolveTruckLogo` reads with
   the other — READ) → `storage`; the object path is written **directly**, no fetch, no bytes moved;
4. everything else → `refused` with a reason. **There is no fetch in this file.**
⚠️ Consequence of (3), stated: the demo *points at* the discovery row's object. Deleting that logo through
the outreach media delete leaves the demo's logo dangling. Disposable demo; accepted; noted here.

**`lib/demo-session.ts`** (READ, edited). `RETENTION_OUTREACH_DAYS = 30`. `createDemoSession` gains
`opts`: with `discoveryTruckId` it writes `{ truck_id, expires_at: now+30d, discovery_truck_id,
public_ref }`, retrying a `23505` whose message names `public_ref` with `publicRefCandidate(base, attempt)`
(`createSlug(base)` then `-<4 Crockford chars>`, up to 6 attempts), and **throws** on any other error.
Without `discoveryTruckId` it writes exactly what it wrote before and swallows errors exactly as before.
`trucks.id / slug / dashboard_token` are not touched anywhere in this build (`demoIdentity()` unchanged, READ).

# 3 · Branding on the surfaces

- **`/api/dashboard`** demo block (READ, edited) now also returns `discovery_truck_id` and `public_ref`
  (same `select('*')` posture: an unapplied migration reads as null). Still under `isDemoIdentifier(truck.id)`;
  for an operator truck the `demo` key stays absent.
- **Dashboard** (READ, edited): `demoBranded = isDemo && !!demoSession?.discovery_truck_id`. Header
  `truckName={(isDemo && !demoBranded) ? null : …}` — identical to `isDemo ? null : …` whenever
  `demoBranded` is false. The QR/share modal's name line uses the same predicate. `DemoWelcome` receives
  `logoUrl` under **the same predicate as `handleShowQR`** (`demoBranded && hasFeature(plan,'branded_qr_code')
  && qr_code_style === 'branded' ? truck.logo : null`); `handleShowQR` itself is unchanged — once
  `qr_code_style` is `branded` and `truck.logo` resolves, it already passes the logo, and
  `generateQRWithLogo`'s own `if (logo) … else if (placeholderText)` order (untouched) makes the logo win.
- **`DemoWelcome`** (READ, edited): optional `logoUrl` prop, default null → `generateQRWithLogo(orderUrl,
  logoUrl, 320, 'Your logo here')` — with null, the call is byte-identical to before.
- **`lib/generateQRCode.ts`: not modified** (git porcelain, §V2). Signature and precedence untouched.
- The header logo needed no change: `truckLogoUrl={truck?.logo || null}` was already there (READ).

# 4 · Monotonic retention (D2)

READ, edited — `later(stored, candidate)` in `lib/demo-session.ts` is the one place the rule lives:
- `touchDemoSession`: selects `email, expires_at`; writes `later(stored, now + tier)`.
- `saveDemoEmail`: selects `expires_at`; writes `later(stored, now + 14d)` and **returns the stored value**,
  which `/api/demo/save-email` states in the email. That route's hard-coded "(14 days)" is now
  `daysLeft` computed from the returned date (READ, edited) — the promise and the data cannot drift.
Harness §V6 drives both against a 30-day session and shows the value unchanged, with an extension control
and a deliberately-broken variant that the harness rejects.

**The cron's three sweeps, re-read (READ, `app/api/cron/demo-cleanup/route.ts`; NOT changed):**

| sweep | predicate | effect on an outreach demo |
|---|---|---|
| 1 expiry | `expires_at < now() AND claimed_by_operator_id IS NULL`, batch 200 | untouched for 30 days; deleted on the first hourly run after |
| 1b claimed-but-abandoned | `claimed IS NOT NULL AND expires_at < now() AND created_at < now − 30d` | 🔴 **reclaims a CLAIMED outreach demo on day 30.** Its `expires_at` is `created_at + 30d`, so both predicates become true together. Today's 14-day tier has the same day-30 reclaim (keyed on `created_at`), so this is not new behaviour — but for a 30-day demo it means *no* grace beyond expiry. By day 30 the operator's wizard has long since re-committed the extraction; the risk is only a prospect who claims on day 29 and stalls. |
| 2 orphan | every `demo-%` truck; skip if session `created_at` within 2h; delete unless `hasMenu && hasEvent` | an outreach demo whose strict session write failed has **no session row** → `createdAt` undefined → not skipped → no menu → swept on the next run. Correct: `provisionDemo` already returned the error. |

# 5 · The admin entry point

**`app/api/admin/provision-demo/route.ts`** (rewritten in place; `verifyAdmin` kept; header replaced).
Accepts, multipart or JSON: `file` / `text` / `template` (the same sample id `/api/demo` takes) /
`existingTruckId` / **`discoveryTruckId`** / `name` (display override only). **With `discoveryTruckId` the
route reads `discovery_trucks(id, name, logo_url)` itself** — the client cannot supply a logo source. Adds
`maxDuration = 300` (same ceiling as `/api/demo`, same reason). Response adds `publicRef`,
`discoveryTruckId`, `truck.logo_storage_path`, `urls.public`. Everything the old scaffolding returned is kept.

**`app/demo/[ref]/route.ts`** (new). GET: shape-check `^[a-z0-9-]{1,80}$` → `demo_sessions.public_ref` →
`trucks.dashboard_token` (both id and token re-asserted `demo-`) → 307 `/dashboard/<token>`. Unknown →
`/landing#try?demo=expired` (the bounce `/api/demo/return` uses). **No writes** — unlike `/api/demo/return`,
a scanner fetching it consumes nothing. `proxy.ts`: `/demo` is neither protected nor public and falls through
to `return supabaseResponse` (READ); the matcher does not exclude it.

**`components/admin/CreateDemoModal.tsx`** (new) and **`OutreachPanel.tsx`** (READ, edited): a "Create demo"
button in the prospect modal's status strip (beside `DoNotContactToggle`) opens the new modal for
`modalProspect` (`discovery_truck_id`, `name`, `logo_url` were already on `Prospect`, READ). It reuses
`MenuUploadFields` (accent `app`) plus a "Use the sample pizza menu" button; posts `FormData` to
`/api/admin/provision-demo` with `nativeAuthHeader()`; on success **stays put** and shows
`<origin>/demo/<ref>` and the dashboard URL, each with Copy (dashboard also "Open ↗"). `DemoModal` was not
reused (its `window.location.assign`).

**The modal-on-modal trap — what was chosen and why:**
- *Stacking:* `createPortal` to `document.body` (the popout's rule) with **inline `zIndex: 95`**, above the
  popout's 90, compose's 85, the prospect modal's `z-50`. No arbitrary Tailwind value.
- *Escape:* the new modal registers a **bubble-phase** `window` keydown that closes itself (ignored while a
  build is in flight). The prospect modal's existing bubble-phase listener is **gated**:
  `if (e.key === 'Escape' && !createDemoOpenRef.current) setModalId(null)`. Both fire; one acts. **No
  capture listener was added**, so the C15 shape (two capture listeners on one node, `stopPropagation`
  stopping nothing) cannot arise. The open flag is `createDemoForId === modalId` — keyed by prospect, so a
  change of prospect drops the child with no reset effect; the ref mirrors it at commit (`useEffect`), which
  is why registration order is irrelevant within one keydown (the ref still reads true until React commits).
- *How the "closes ALONE" claim was verified:* §V-Escape — a real `EventTarget` with the two listeners:
  Escape #1 leaves `modalId` set and clears the child; Escape #2 clears `modalId`. The C15 pattern was run
  first as the broken control and both listeners fired.

# 6 · Self-serve conversion links the discovery row (D8)

**`lib/self-serve-discovery-link.ts`** (new) — `linkDiscoveryRowForSelfServe(supabase, operatorId,
newTruckId)`, called from `/api/setup create_truck` **after** `trucks.update({ operator_id, setup_step })`
(READ, edited). The chain: `/api/signup` sets `claimed_by_operator_id` (unchanged) → `create_truck` finds the
operator's newest claimed session **with `discovery_truck_id IS NOT NULL`** → link.

| case | what the code does |
|---|---|
| **linked** | `discovery_trucks.update({ hatchgrab_truck_id: newTruckId, updated_at }).eq('id', X).is('hatchgrab_truck_id', null).select('id')` returns 1 row → then `update({ excluded: true }).eq('id', X)` (gap (b), by id — narrower than the promote's `ilike` name) → session row records `status:'linked'`. |
| **conflict** | the update matches **zero rows** (already linked, or the row is gone). **Not overwritten. Not silent:** `console.error('[setup] DISCOVERY_LINK_CONFLICT …')` + session row `status:'conflict'`, `discovery_link_truck_id = newTruckId`, `note = 'discovery row already linked to another truck, or no longer exists — not overwritten'`. No `excluded` write. |
| **failed** | PostgREST error → `status:'failed'`, note = the message, `DISCOVERY_LINK_FAILED` logged. |
| **anonymous / no demo** | the session read returns nothing → `null`; **no write, no log line**; response identical to before (the `discoveryLink` key is spread only when non-null). |
| **anything throws** | caught → `null`, `DISCOVERY_LINK_THREW` logged. |

🔴 **The truck is never deleted.** The module imports no delete helper and issues no `.delete()`; the
outcome is recorded on `demo_sessions.discovery_link_*` (that is "where you recorded it") and returned to
the client as `discoveryLink` (additive). `/api/admin/create-truck` is untouched.

---

# V · Verification — each with what a green-but-meaningless result would look like, and the control

**Instruments.** (i) `tsc --noEmit -p .` — exit 0 after every phase. *Meaningless if:* the project excluded
the edited files. *Control:* a one-line `lib/__tsc_control.ts` with `const bad: number = 'x'` made tsc exit
**2** naming that file; removed. (ii) A Node harness (`node --import` loader mapping `@/` to the repo and
transpiling `.ts` through the repo's own `typescript`, no install) drives the real `lib/` modules against a
recording Supabase stub. *Meaningless if:* the stub answered "yes" to everything. *Control:* a copy of
`demo-session.ts` with `later()` replaced by `return candidate` was run through the same monotonic test —
**AssertionError, exit 1**. (iii) ESLint on every changed file: the only findings attributable to this build
are `CreateDemoModal.tsx:63` (`setMounted(true)` in an effect — the identical mount guard the contact popout
and `ScheduleEventsPopup` use, also flagged on HEAD) and `:129` (`<img>`, admin thumbnail). The
`OutreachPanel` count is 14 on HEAD and 14 now (one new finding was removed by deriving the child-modal
state from the prospect id instead of an effect).

1. **Unbranded landing demo byte-identical.** Options object: `{kind:'demo', ...(spread), van}` with no name
   evaluates to exactly `{"kind":"demo","van":{"name":"Van 1","kitchen_capacity":null}}` (the HEAD literal).
   Anonymous `createDemoSession` upsert payload is exactly `{ truck_id, expires_at: now+24h }` with
   `{ onConflict:'truck_id' }` — no new keys. Header predicate with `demoBranded=false` equals the HEAD
   expression for both `isDemo` values. `DemoWelcome` with the default `logoUrl=null` issues the HEAD call.
   *Meaningless if:* compared new code to itself — excluded by asserting against literals taken from HEAD.
2. **Gusto unchanged — the predicate.** `isDemo = token.startsWith('demo-')` on the dashboard; every new
   client expression is under `isDemo`/`demoBranded`; the server block is under `isDemoIdentifier(truck.id)`;
   `saveDemoEmail` refuses a non-demo id; `touchDemoSession` is reached only via `/api/demo/return` (asserts
   `demo-`); `/api/setup create_truck` is never called by an operator who has a truck. And by `git status
   --porcelain`: `lib/generateQRCode.ts`, `app/manage/[token]/page.tsx`, `app/api/manage/route.ts`,
   `app/api/dashboard/action/route.ts`, `lib/provision-truck.ts`, `lib/truck-logo.ts`, the KDS page,
   `create-truck` and the cron are **clean**. *Meaningless if:* the list omitted a shared file — the list is
   the review's Gusto impact map (§J) plus the cron.
3. **Branded logo resolves to a real object.** Static: `/logos/antoburgers.jpg` (55,232 bytes on disk) →
   the stub received an upload of **55,232 bytes** to `truck-media/demo-t/<ts>-antoburgers.jpg` with
   `image/jpeg`, and `logo_storage_path` was written with that exact path; `resolveTruckLogo(path)` builds the
   public URL for it. Storage: an own-bucket URL → `objectPath`, and `resolveTruckLogo(null, id, objectPath)`
   **=== the original URL** (round trip), no upload issued. *Control:* a missing static file → error, zero
   uploads, zero writes. (The bucket itself was not queried — no DB access in this task; a curl for the
   demo's resolved URL is the live check.)
4. **External logo refused.** Eleven values refused, including `https://evil.example.com/logo.png`, a
   host-suffix spoof (`abcd1234.supabase.co.evil.com`), `http://` on our host, another bucket, traversal in
   both branches, and a `data:` URL. `copyDemoLogo(external)` → null with **zero** DB and storage calls.
5. **public_ref collision.** Stub returns `23505 … "demo_sessions_public_ref_key"` once → second upsert
   carries `pizzeria-gusto-<4 chars>`; result matches. *Control:* a `23505` on a different constraint throws
   on the first attempt — no blind retry.
6. **expires_at cannot be shortened.** Stored `+30d`: `touchDemoSession` (no email → would write +24h)
   writes **+30d**; with email (would write +14d) writes **+30d**; `saveDemoEmail` writes **+30d** and
   *returns* +30d. *Controls:* stored +1h → touch writes +24h; stored +2d → save writes +14d; the broken
   variant fails.
7. **Self-serve.** Branded: `update({hatchgrab_truck_id})…is(null)…select('id')` → 1 row → `excluded:true`
   → session `linked`. Anonymous: one read filtered `discovery_truck_id IS NOT NULL`, returns null, **zero**
   writes, **zero** log lines.
8. **A link failure leaves the truck alive.** Conflict, failure and a thrown error all return without any
   `.delete()` on the stub (a detector that provably sees a delete when one is issued); grep for
   `deleteTruckCascade|\.delete()` in `app/api/setup/route.ts` + `lib/self-serve-discovery-link.ts` matches
   only two comment lines (control: `create-truck` has 2 code hits).

**Escape.** Node `EventTarget`: C15 reproduced (listener 1 `stopPropagation` → listener 2 still fires); the
gate: Escape #1 closes the child only, Escape #2 the parent; order-independent when the ref flips at commit.

**`hatchgrab_truck_id` census re-derived:** 27 lines in 8 files — `app/admin/page.tsx app/api/admin/create-truck/route.ts app/api/admin/outreach/route.ts app/api/admin/provision-demo/route.ts app/api/admin/route.ts app/api/discovery/events/route.ts app/api/inbound-schedule/route.ts app/api/setup/route.ts lib/delete-truck.ts lib/provision-demo.ts lib/self-serve-discovery-link.ts scripts/prune-discovery-events.mjs `— the review said 9; the
sweep here includes `supabase/functions` and excludes `node_modules`. No new writer was added by this build
except the self-serve link in `lib/self-serve-discovery-link.ts`, which writes a **real** truck id only.

---

# Files touched

Modified: `app/api/admin/provision-demo/route.ts`, `app/api/dashboard/route.ts`, `app/api/demo/save-email/route.ts`,
`app/api/setup/route.ts`, `app/dashboard/[token]/page.tsx`, `components/admin/OutreachPanel.tsx`,
`components/dashboard/DemoWelcome.tsx`, `lib/demo-session.ts`, `lib/provision-demo.ts`.
New: `app/demo/[ref]/route.ts`, `components/admin/CreateDemoModal.tsx`, `lib/demo-logo.ts`,
`lib/self-serve-discovery-link.ts`, `supabase/migrations/20260912_demo_sessions_outreach.sql`.
Not touched: everything in the out-of-scope list; `package.json` and the lockfile.

# Open items (not built, flagged)

- The prospect modal does not yet show an existing demo for the prospect (the index for it exists).
- Item 6 (fresh event on first open) and item 7 (KDS banner/sizing) — untouched, per the brief.
- The manual's V11.14 branded constraint and §35 backlog line are stale and should be retired in the next
  manual update; `docs/onboarding-flow.md` §7 should gain the 30-day tier and the monotonic rule.
- Day-30 reclaim of a claimed outreach demo (§4) — decide whether 1b should add a grace beyond `expires_at`.

# SQL for Dominic — none of it was run

**Apply the migration**, then verify:

```sql
select c.column_name, c.data_type, c.is_nullable
  from information_schema.columns c
 where c.table_schema = 'public' and c.table_name = 'demo_sessions'
   and c.column_name in ('discovery_truck_id','public_ref','discovery_link_status',
                         'discovery_link_truck_id','discovery_link_note','discovery_linked_at')
 order by c.column_name;
```

```sql
select tc.constraint_name, tc.constraint_type
  from information_schema.table_constraints tc
 where tc.table_schema = 'public' and tc.table_name = 'demo_sessions'
   and tc.constraint_name in ('demo_sessions_public_ref_key','demo_sessions_discovery_truck_id_fkey');
```

**After the first outreach demo is built** — the session, its tier and its link:

```sql
select ds.truck_id, ds.public_ref, ds.discovery_truck_id, dt.name as discovery_name,
       ds.created_at, ds.expires_at, ds.expires_at - ds.created_at as retention,
       t.name as truck_name, t.logo_storage_path, t.qr_code_style
  from public.demo_sessions ds
  join public.trucks t on t.id = ds.truck_id
  left join public.discovery_trucks dt on dt.id = ds.discovery_truck_id
 where ds.discovery_truck_id is not null
 order by ds.created_at desc;
```

**Reconciliation** — self-serve conversions whose discovery link did not land:

```sql
select ds.truck_id as demo_truck_id, ds.discovery_truck_id, dt.name as discovery_name,
       dt.hatchgrab_truck_id as currently_linked_to, ds.discovery_link_truck_id as attempted_truck_id,
       ds.discovery_link_status, ds.discovery_link_note, ds.discovery_linked_at
  from public.demo_sessions ds
  left join public.discovery_trucks dt on dt.id = ds.discovery_truck_id
 where ds.discovery_link_status in ('conflict','failed')
 order by ds.discovery_linked_at desc;
```

**Invariant check** — no demo may ever sit in `hatchgrab_truck_id` (expect zero rows):

```sql
select dt.id, dt.name, dt.hatchgrab_truck_id
  from public.discovery_trucks dt
 where dt.hatchgrab_truck_id like 'demo-%';
```

## Closing `git status`, verbatim (nothing staged)

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/api/admin/provision-demo/route.ts
	modified:   app/api/dashboard/route.ts
	modified:   app/api/demo/save-email/route.ts
	modified:   app/api/setup/route.ts
	modified:   app/dashboard/[token]/page.tsx
	modified:   components/admin/OutreachPanel.tsx
	modified:   components/dashboard/DemoWelcome.tsx
	modified:   docs/manual-update-report.md
	modified:   docs/reference-manual.md
	modified:   docs/scraper-reference-manual.md
	modified:   lib/demo-session.ts
	modified:   lib/provision-demo.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/demo/
	components/admin/CreateDemoModal.tsx
	docs/demo-outreach-build-report.md
	docs/demo-outreach-review-report.md
	lib/demo-logo.ts
	lib/self-serve-discovery-link.ts
	supabase/migrations/20260912_demo_sessions_outreach.sql

no changes added to commit (use "git add" and/or "git commit -a")
```
