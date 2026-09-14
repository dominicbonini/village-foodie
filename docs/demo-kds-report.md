# Item 7 — the demo kitchen screen

**Built 14 September 2026.** Nothing staged, committed or reverted. Two files changed:
`app/dashboard/[token]/kds/page.tsx` and `app/dashboard/[token]/page.tsx`. `app/kds/[kds_token]/` is
untouched (§V4). The seeder, the capacity engine, the cron, `/api/events/manage`, `/manage`,
`/api/admin/create-truck`, the `??` fragment after `resolvePaidStep` and the `max-h-[85vh]` modal are
all unchanged.

⚠️ **I CANNOT RUN THE APP OR SEE A SCREEN.** Every layout statement below is a READ of the style chain
in source. Nothing here is "verified on a device"; where a claim can only be settled by looking at a
screen, it is marked as such and appears in the visual checklist at the end instead.

---

## 🔴 PREMISES — what was wrong, and what is true instead

1. 🔴 **The safe-area shape the brief told me to copy is the one that was REMOVED as a defect.** The
   brief says *"the manual records ONE safe-area inset for the whole banner stack, on a WRAPPER rather
   than per banner, and that a bare `env()` on the wrapper is the only form that leaves web
   byte-identical… Apply the same shape here."*
   READ, `docs/status-strip-fix-report.md` line 1: *"Double inset — fixed. **The wrapper no longer claims
   the strip.**"* and line 4: *"**Model chosen: (a).** The banners moved BELOW `AppHeader`. The wrapper's
   `paddingTop` is gone."* READ, the dashboard's own note: that wrapper *"was unconditional and painted
   nothing, so on a native iPad it reserved the status-bar strip and left it showing the app-shell's
   `bg-slate-50` — a white strip under white system glyphs — while `AppHeader`'s own inset added the SAME
   height again, putting the whole page at 2 × the inset"*, followed by **"DO NOT REINTRODUCE AN INSET ON
   THIS PAGE."**
   The "bare `env()` is the one form that leaves web byte-identical" sentence is that report's
   justification for **deleting** the wrapper's declaration without changing web — not a recommendation
   to add one. **So "the same shape" is: move the banner below the header and let exactly one element own
   the inset.** That is what I built. Adding a wrapper inset would have re-created the double-inset bug.
2. **The KDS's own comment gives a reason for the banner's position that has expired.** READ, the
   under-header stack: *"`OfflineBanner`, `WebOfflineBanner` and `DemoModeBanner` are NOT in here and
   deliberately so: they are shared components mounted ABOVE the header on both surfaces (**the dashboard
   mounts them in the same order**)"*. The dashboard no longer does — its whole stack, `DemoModeBanner`
   included, moved below `AppHeader`. The comment has been corrected in place.
3. 🔴 **The proven defect is not the only one, and the other is worse for most prospects.** On the WEB, a
   demo's "Kitchen screen" button did not open the demo KDS at all — it opened the van's standalone
   `/kds/<kds_token>`, which has **zero** demo handling. Native was already correct. Detail in §V-a; it
   is fixed, demo-gated.
4. **The safe-area problem is not demo-only, and the part that affects Gusto is NOT fixed here.** The
   degraded strip, `OfflineBanner` and `WebOfflineBanner` all sit above the header and **none carries a
   safe-area inset** (READ: no `env(` or `padding` for the inset in either component). So on a native
   iPad, whenever one of those is showing, *it* is the element under the status bar — on Pizzeria
   Gusto's screen, not only a demo's. Fixing that means moving banners Gusto sees, which cannot be
   byte-identical, so it is **reported, not built** (§Open items).
5. **§G's other conclusions re-verified and hold:** `MAX_GRID_VISIBLE` is gone, the sizing chain absorbs
   the banner, and G11 is still present but now provably latent. Each re-derived below.

### The two git commands, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/api/admin/outreach/route.ts
	modified:   app/api/admin/provision-demo/route.ts
	modified:   app/api/dashboard/route.ts
	modified:   app/api/demo/restart/route.ts
	modified:   app/api/demo/save-email/route.ts
	modified:   app/api/setup/route.ts
	modified:   app/dashboard/[token]/page.tsx
	modified:   components/admin/OutreachPanel.tsx
	modified:   components/dashboard/DemoWelcome.tsx
	modified:   docs/manual-update-report.md
	modified:   docs/reference-manual.md
	modified:   docs/scraper-reference-manual.md
	modified:   lib/demo-restart.ts
	modified:   lib/demo-session.ts
	modified:   lib/provision-demo.ts
	modified:   lib/seed-demo-orders.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/demo/
	components/admin/CreateDemoModal.tsx
	docs/demo-first-open-report.md
	docs/demo-outreach-build-report.md
	docs/demo-outreach-review-report.md
	docs/demo-restart-report.md
	docs/demo-seeder-capacity-report.md
	lib/demo-logo.ts
	lib/self-serve-discovery-link.ts
	supabase/migrations/20260912_demo_sessions_outreach.sql
	supabase/migrations/20260914_demo_sessions_first_opened_at.sql

no changes added to commit (use "git add" and/or "git commit -a")
════
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
9e83a5e migration changes
69c4fdd migration changes
```

---

# WHAT CHANGED — three edits, each with its gating predicate

| # | change | file | predicate that keeps Gusto identical |
|---|---|---|---|
| 1 | `DemoModeBanner` moved from **above** the `<header>` to **directly below** it | `kds/page.tsx` | `{isDemo && …}` — renders `false` (nothing) for an operator **at either position** |
| 2 | a demo never opens the van's standalone `/kds/<kds_token>` | `page.tsx` (`openKDS`) | `!isDemo && van?.kds_token` — for `isDemo === false` this **is** `van?.kds_token`, the same expression |
| 3 | the KDS re-points at the current event when its held one has been deleted | `kds/page.tsx` | `if (!isDemo) return` as the effect's **first line** |

## The safe-area fix, stated precisely

READ: this screen's **only** `env(safe-area-inset-top)` is the `<header>`'s
`paddingTop: max(0.625rem, env(safe-area-inset-top))`. Re-derived across the whole repo (searched alone,
no extension scope): **exactly two executable occurrences** — that one and `AppHeader.tsx:45`'s bare
`env(...)`. (Positive control on the same sweep: `className` appears in 109 files, so the search finds
what is there.)

On native the WebView extends under the status bar (`viewport-fit=cover` + `contentInset:'never'` —
`lib/native/statusBar.ts`), so the **first element in this flex column** is what the clock and battery
sit on. Mounted above the header, `DemoModeBanner` was that element on a demo. Below the header it is
inside the region the header's inset has already cleared. **No inset was added anywhere.**

**What I could NOT establish:** that it now *looks* right on an iPad. `env(safe-area-inset-top)` has no
value outside a real iOS WebView, so the rendered offset cannot be computed from source. Checklist N1.

---

# V-a to V-f

## V-a · Reachability — and the defect it exposed

READ, `openKDS(van)` in the dashboard:
- **Native** — `router.push('/dashboard/<token>/kds?…')`. Always the in-app KDS. Already correct.
- **Web** — `window.open(van?.kds_token ? '/kds/<kds_token>' : '/dashboard/<token>/kds…', '_blank')`.

READ, `handleOpenKDS`: `vans.length === 0` → open with none; **`vans.length === 1` → `openKDS(vans[0])`**;
else the event's van; else the picker. A demo truck has exactly one van (`provisionDemo` passes
`van: { name: 'Van 1', … }`), so it always takes the second branch.

READ, `provisionTruck`'s van insert: *"kds_token omitted deliberately — DB default
`encode(gen_random_bytes(24),'hex')`."* **Every van has a `kds_token`, including a demo's.** READ,
`/api/manage` `get_vans` selects `kds_token`, and the dashboard's `vans` state carries it.

⇒ **On the web, "Kitchen screen" on a demo opened `/kds/<kds_token>`.** And that page has **no demo
handling at all**: a search for `isDemo|isDemoIdentifier|DemoModeBanner|DemoGetStarted|demo-` in
`app/kds/[kds_token]/page.tsx` returns **nothing (grep exit 1)**; positive control over the same file,
`kds_token` appears **9** times, so the search was looking in the right place. No DEMO MODE strip, no
signup CTA, no one-time intro — on desktop, where most prospects open a link.

**Fixed** by change 2. Entry points covered: the desktop utility strip's "Kitchen screen" button, the
`UserMenu`'s `sm:hidden` phone item (`onOpenKDS={handleOpenKDS}`), and the multi-van picker — all three
funnel through `openKDS`, so one guard covers every route in.

**So, for real:** desktop → a new tab on `/dashboard/<token>/kds`; phone → the avatar menu's item, same
URL, new tab; iPad web → the strip at ≥640px, same URL; iPad native → `router.push`, same URL, in place.

## V-b · The one-time intro

READ: `showKdsIntro` initialises from `localStorage.getItem('hg_demo_kds_intro_' + token) !== 'seen'`
and is gated `isDemoIdentifier(token)`, so it fires once per browser per demo. It renders
`fixed inset-0 z-[70]` with **three** dismissals: the full-width **"Got it"** button
(`w-full … py-3 rounded-xl`), a backdrop click (`onClick={dismissKdsIntro}` on the overlay), and Android
back (registered at `[isDemo && showKdsIntro, …]`).

**Reachable at 390px — by style-chain READ, not observation.** Overlay `p-4` (16px a side) → card
`w-full max-w-md` resolves to 358px → card `p-6` (24px a side) → the button is 310px wide and `py-3`
(≈44px tall). Checklist W4 asks Dominic to confirm on screen.

**Does the restart clear it?** READ: `startNewService` removes exactly `hg_demo_seen_orders_<token>` and
`hg_demo_loop_<token>`. The repo has seven `hg_demo_*` keys (`autorestart_`, `email_`, `kds_intro_`,
`loop_`, `saved_`, `seen_orders_`, `welcome_`); the intro key is **not** among the two cleared.
**That is correct and should stay.** The two that are cleared are *board state* — `DemoLoopComplete`'s
baseline is a list of order keys that the restart has just deleted, so leaving it would fire the
"you caused an order" prompt instantly on the new board. The intro is *orientation* ("this is the
kitchen screen"), which a restart does not invalidate; re-showing it would re-explain something the
visitor has read. The dashboard's `hg_demo_welcome_` is left alone for the same reason.

## V-c · Layout defaults — both settled, both now READ

- **Grid:** `activeLayout = layoutOverride ?? (isDemo ? 'grid' : displayMode)`, with
  `displayMode = truck?.display_mode ?? 'list'`. A demo defaults to **grid** by an explicit `isDemo`
  term. Overridable, and `layoutOverride` persists to `hg_kds_layout_<token>`.
- **Window:** `boardMode = handoverOn ? 'window' : 'cook'` and
  `handoverOn = handoverPref ?? !showPaidStep`. There is **no `isDemo` term**. It resolves to `'window'`
  for a demo by a different route: `resolvePaidStep` gives
  `event?.show_paid_step_override ?? truck?.show_paid_step ?? false`, `provisionDemoEvent` writes no
  override, and `provisionTruck`'s **demo profile sets `showPaidStep: false`** (the operator profile sets
  `true`). So `handoverOn = null ?? !false = true` → **window**.
  ⚠️ Worth knowing: it follows from the *provisioning profile*, not a demo gate. A device that has stored
  a `hg_kds_handover_` preference overrides it, and a demo whose `show_paid_step` were ever flipped would
  land on the cook view. The in-code comment claiming "DEMO defaults to Window + Grid" is true today for
  two different reasons, only one of which mentions demo.

## V-d · What an open KDS does when a restart rebuilds the board — and the fix

READ: `activeEvent = selectedEventId ? events.find(e => e.id === selectedEventId) ?? null : null` — a
**held** value with no fallback chain, and the comment explains why in operator terms: a status- or
time-keyed fallback *"would silently move to the next event and take a cook's unserved orders off the
screen. Nobody is watching this display."* That rule is right and is untouched.

But the seed effect is `if (seededRef.current) return` with `seededRef` *"set BEFORE anything else and
never cleared"*. So when T1/T2 (`restartDemoService`) delete the event **truck-wide** and create a
replacement:

1. the KDS's held `selectedEventId` names a row that no longer exists;
2. the next poll's `events` no longer contains it → `activeEvent` becomes **null**;
3. the seed effect returns on its first line and never re-points;
4. the only picker is `onChangeEvent` inside the event menu, whose mount requires `activeEvent` (null)
   **and** which is only passed when `events.length > 1` (a demo has one).

⇒ **It stranded**: empty board, no picker, recovery only by manual reload. Reachable in practice, because
on web `openKDS` opens the KDS in a **second tab** — the prospect returns to the dashboard tab, it
reloads, T1 fires, and the KDS tab is holding a deleted id.

**Fixed** by change 3: a separate, `isDemo`-gated effect that re-points **only when the held id is absent
from the list the server just served**. It cannot take orders off a cook's screen — the event is gone, so
there are none under it — and it is a no-op while the held event exists. §V3 executes it.

## V-e · The capacity strip — confirmed absent

READ: searching `CapacityBreach|capacity|slot_capacity|Capacity` in the KDS returns **one** hit, and it
is prose in a comment at line 1254 about re-booking capacity on a modify. **No capacity component is
mounted.** Positive control: `CapacityBreachBanner` appears **twice** in the dashboard (import + use).
⇒ **A demo KDS shows no capacity state at all** — no breach banner, no traffic lights, no day-load strip.
The capacity story the demo exists to tell lives entirely on the dashboard. Not a defect, but worth
knowing before pointing a prospect at the kitchen screen to see it.

## V-f · `max-h-[85vh]` — reported, not changed

READ: one card modal in the KDS uses `max-h-[85vh]`, not `dvh`. On mobile Safari `vh` is the *largest*
viewport, so with the URL bar showing, 85vh can exceed what is visible. Pre-existing, shared with Gusto,
**explicitly out of scope** — listed here so it is on the record, and in the checklist as W5 so Dominic
can see whether it actually bites.

## §G's other claims, re-derived

- **`MAX_GRID_VISIBLE` — GONE holds.** One occurrence repo-wide, and it is a comment: *"🔴 THE GRID CAP
  IS GONE. It was `MAX_GRID_VISIBLE = activeLayout === 'grid' ? 8 : 6`…"*. Positive control over the same
  file: `activeLayout` appears 9 times as live code.
- **The sizing chain — unchanged and still absorbs the banner.** `kds/layout.tsx` is `w-screen h-dvh
  overflow-hidden`; the page root is `w-full h-full flex flex-col … overflow-hidden`; the board is
  `flex flex-1 min-h-0`. Every bar above it is `shrink-0`. So the banner's height is taken out of the
  board's share by the flex column — there is no `calc` to get wrong, and moving the banner from one side
  of the header to the other does not change the arithmetic at all (both are `shrink-0` children of the
  same column). **§G's "nothing is pushed off-screen" conclusion holds, so no layout was changed.**
  This is a READ of the class chain; whether a card is clipped at a given size is checklist W1–W3.
- **G11 — present, and provably latent.** READ: the KDS renders `<DemoGetStarted token={token} />` with
  **no** `isAdmin` and **no** `extractionSource`, and the KDS reads no demo-session block at all (grep
  exit 1 for `data.demo|demoSession|extraction_source`; control: the dashboard has 6 `demoSession`
  references). `canSetup = (NEXT_PUBLIC_SIGNUP_PUBLIC === 'true' || isAdmin) && !!token` and
  `variant = !canSetup ? 'saveOnly' : extractionSource === 'template' ? 'sample' : 'upload'`. So today the
  KDS banner shows **`saveOnly`**, the same as the dashboard shows a prospect. If
  `NEXT_PUBLIC_SIGNUP_PUBLIC` were flipped, the KDS would show the **`upload`** copy even for a sample
  demo — calling a template menu "your menu", which §11 of the spec forbids. The manual (V11.14) records
  that flag as blocked from flipping until the signup sender is fixed, so the bad copy is currently
  unreachable. **Not fixed**: the brief says fix only what is proven broken, and closing it means wiring
  a demo-session read and an `/api/auth/me` call into the kitchen screen for a variant nobody can see.
  It should be closed in the same change that flips the flag.
- **C9 — settled in V-a.** The demo hides the identity block (`showIdentity={!isDemo}`), not the menu; the
  desktop strip's button and the `sm:hidden` menu item both reach the KDS.

---

# VERIFICATION

**The instruments, and what each would look like if it proved nothing.**

- **`tsc --noEmit -p .` — exit 0** after every edit.
- **An EXECUTABLE-DIFF instrument.** It strips JSX comments, block comments, `//` lines (only when the
  trimmed line *starts* with `//`, so a URL in a string is never mangled) and blank lines, then diffs
  HEAD against the working tree. *Null result:* a differ so coarse it reports nothing whatever you
  change. **Control:** pointed at a variant of the same file with one unrelated token altered
  (`display_mode ?? 'list'` → `'grid'`), it reports exactly that line. It has teeth.
- **A gate harness** that extracts the two shipped expressions **out of the source files by marker** and
  executes them. *Null result:* retyping the expressions and testing my own retyping. *Excluded:* a
  failed extraction throws, and the harness prints what it extracted.

### 1 · Gusto's KDS renders byte-identically — proved by structure, not assertion

**The whole executable diff of the KDS is 8 lines:**

```
+useEffect(() => {
+if (!isDemo) return
+if (!events.length) return
+if (selectedEventId && events.some(e => e.id === selectedEventId)) return
+setSelectedEventId(pickDefaultEventByTime(events)?.id ?? null)
+}, [isDemo, events, selectedEventId])
-{isDemo && <DemoModeBanner action={<DemoGetStarted token={token} />} />}
+{isDemo && <DemoModeBanner action={<DemoGetStarted token={token} />} />}
```

1458 → 1464 executable lines. Everything else that changed is comment. So:
- **Change 1** is a `-`/`+` pair of the **identical string**, whose guard is `isDemo &&`. For an operator
  `isDemo` is `isDemoIdentifier(token)` = false, so the expression evaluates to `false` and React renders
  nothing — **at the old position and at the new one**. A node that does not exist cannot move. That is a
  structural proof: it does not depend on the predicate merely *existing*, but on the fact that the only
  changed token is the node's position in a list where the node is absent.
- **Change 3** is six added lines whose **first** line is `if (!isDemo) return`.

**And this task's whole executable change to the dashboard is ONE line** (isolated by reconstructing a
pre-task copy with my single edit reverted and diffing that against the working file):

```
-window.open(van?.kds_token?`/kds/${van.kds_token}`:`/dashboard/${token}/kds${ev?`?${ev}`:''}`,'_blank')
+window.open(!isDemo&&van?.kds_token?`/kds/${van.kds_token}`:`/dashboard/${token}/kds${ev?`?${ev}`:''}`,'_blank')
```

**Executed, not asserted.** The shipped expression was extracted from the file and evaluated against
every shape of input — van `undefined`/`null`/`{}`/no-token/`null` token/empty token/real token × three
event-scope strings, **21 combinations** — and for `isDemo === false` it returns the **same URL as the
old expression every time**. *Control:* the same sweep run against a wrong guard (`isDemo &&` instead of
`!isDemo &&`) diverges on 3 combinations, so the sweep can detect a divergence.
For change 3, the extracted effect body sets **nothing** across all 6 (events × selection) operator
states. *Control:* delete `if (!isDemo) return` and the same harness shows an operator board being
re-pointed.

### 2 · The banner now sits below the safe-area inset — what I can and cannot say

**Established from source:** the demo banner is now emitted *after* `</header>`, and the header is the
only element in the column carrying `env(safe-area-inset-top)` (two executable occurrences repo-wide, the
other in `AppHeader`). The render order of the column is now, top to bottom: degraded strip →
`OfflineBanner` → `WebOfflineBanner` → `AppLockGate` → **`<header>` (the inset)** → **DEMO MODE** →
alert stack → board. On a demo with no alert showing, the header is first and owns the strip.

**Established for web:** `env(safe-area-inset-top)` resolves to `0px` in every desktop and mobile
browser, so the header's padding is the `max()` floor (`0.625rem`) before and after; the only web change
is the bar's own position, from above the header to below it — which is what Dominic asked for ("show
the demo header the way the dashboard does").

🔴 **NOT established, and it cannot be from source:** that the bar is visually clear of the iOS status
bar on a real iPad. `env()` has no value outside an iOS WebView. Checklist **N1**.

🔴 **Also true, and NOT fixed:** when the degraded strip or an offline banner is showing, *that* bar is
now the first element and is still under the status bar — on Gusto's screen too. See Open items.

### 3 · V-a to V-e — answered above with symbol evidence

Each carries its search, its file set and (where it is an absence claim) a positive control over the same
set: V-a the `/kds/[kds_token]` demo-reference search (exit 1) against `kds_token` × 9; V-e the capacity
search (1 comment hit) against `CapacityBreachBanner` × 2 on the dashboard; G11 the demo-session search
(exit 1) against `demoSession` × 6 on the dashboard; `MAX_GRID_VISIBLE` (1 comment hit) against
`activeLayout` × 9.

### 4 · `/kds/[kds_token]` unchanged

`git status --porcelain -- app/kds/` → **no output**. `git diff --stat -- app/kds/` → **empty**.
*Control:* the same two commands run against the files this task did change report
`M app/dashboard/[token]/kds/page.tsx`, `M app/dashboard/[token]/page.tsx` and a
`76 +++---` diffstat, so the commands do report changes when there are any.

### Lint — one new finding, declared

`react-hooks/set-state-in-effect` goes from **3 → 4** in `kds/page.tsx`: my new effect calls
`setSelectedEventId`. The adjacent, pre-existing seed effect does exactly the same thing and is one of
the three. The lint-clean alternative was to widen the existing seed effect or to re-point inside
`fetchAll` — both of which would edit code on the **operator** path and cost the byte-identical
guarantee above. I took the guarantee and the extra finding. Every other rule is identical to HEAD.

---

# Open items — reported, not built

1. 🔴 **The degraded strip, `OfflineBanner` and `WebOfflineBanner` are above the KDS header and carry no
   safe-area inset** (READ: neither component contains `env(` or any inset padding). On a native iPad,
   whenever one shows, it is the element under the status bar — **on Pizzeria Gusto's kitchen screen**.
   The dashboard fixed the same class by moving its whole stack below `AppHeader`. Doing that here moves
   bars Gusto sees, so the byte-identical claim would have to become a "position-only, props identical"
   claim of the kind `docs/status-strip-fix-report.md` made. It is the right next change and it deserves
   its own task.
2. **G11** — the KDS's `DemoGetStarted` gets neither `isAdmin` nor `extractionSource`. Latent while
   `NEXT_PUBLIC_SIGNUP_PUBLIC` is unset; close it in the change that flips the flag.
3. **`max-h-[85vh]`** on the KDS card modal (V-f), out of scope by instruction.
4. **Window-vs-cook is not demo-gated** (V-c) — it follows from the demo profile's `show_paid_step:
   false`. If that ever changes, the demo silently lands on the cook view.

---

# 🔴 VISUAL CHECKLIST — Dominic, please walk this

Safari on the Mac: **Develop → Enter Responsive Design Mode (⌥⌘R)**, then open
`/dashboard/<demo-token>/kds`. Revised against what I read this session; §G's draft is superseded.

### Web — iPhone 390 × 844
- **W1.** The **DEMO MODE** bar is now **below** the white header, not above it. The header (← Dashboard,
  chips) is the topmost thing on the page.
- **W2.** Grid is selected by default and the cards are a wall, not a list. Scroll to the bottom: the
  **last row of cards is fully visible** and nothing is cut off by the page edge.
- **W3.** Switch to **List**. Same question: the last ticket is reachable and the footer controls are not
  pushed off the bottom.
- **W4.** Reload with a fresh browser profile (or clear site data) so the one-time intro fires. The
  **"Got it"** button is fully on screen and tappable; tapping the dark backdrop also closes it.
- **W5.** Open a card's modal. Does its box leave the top and bottom edges visible, or does it run off?
  *(This is the `max-h-[85vh]` item — I did not change it; I want to know if it actually bites.)*
- **W6.** Rotate to landscape: the DEMO MODE label stays centred and its right-hand button does not
  collide with anything in the header above.

### Web — iPad 1024 × 1366
- **W7.** Same as W1–W3. At this width the header's chips should be on one line; if they wrap to a second
  line, the board below should shrink rather than the second line being clipped.
- **W8.** From the **demo dashboard**, click **"Kitchen screen"** in the dark strip. 🔴 **It must open
  `/dashboard/<demo-token>/kds` — a URL containing `demo-`. If you land on `/kds/<long-hex>` the fix did
  not take.** That URL is the change in §V-a.
- **W9.** With the KDS open in that tab, go back to the dashboard tab and reload it so the board restarts.
  Return to the KDS tab and wait about a minute. **It should pick up the new service by itself** rather
  than sitting empty. *(That is change 3; before it, it stranded.)*

### Native only — the iPad build. **I could not establish any of these from source.**
- **N1.** 🔴 **The headline check.** On a demo, is the **DEMO MODE** bar clear of the clock and battery,
  with the white header sitting directly under the status bar? *(Only a real iOS WebView gives
  `env(safe-area-inset-top)` a value.)*
- **N2.** On **Pizzeria Gusto's** KDS, confirm nothing moved: header still under the status bar, same
  chips, same board.
- **N3.** Put the iPad in aeroplane mode on Gusto's KDS so the offline banner shows. 🔴 **I expect that
  red bar to be under the status bar** — that is Open item 1, and I want to know whether it looks as bad
  as I think before scheduling the fix.
- **N4.** On a demo in the native app, tap **Kitchen screen** — it should navigate in place (no new tab)
  and land on the in-app KDS with the DEMO MODE bar showing.
- **N5.** Start a call or screen recording so the status bar grows taller, and confirm the header follows
  it rather than being overlapped.

---

# SQL — for Dominic to run; **nothing here was executed**

**First, confirm the columns these queries name:**

```sql
select c.table_name, c.column_name, c.data_type, c.is_nullable
  from information_schema.columns c
 where c.table_schema = 'public'
   and (c.table_name, c.column_name) in (
     ('truck_vans','kds_token'), ('truck_vans','display_layout'), ('truck_vans','split_screen'),
     ('truck_vans','show_cooking_step'), ('truck_vans','kitchen_capacity'),
     ('trucks','display_mode'), ('trucks','show_paid_step'), ('trucks','kds_mode'),
     ('truck_events','show_paid_step_override'),
     ('demo_sessions','discovery_truck_id'), ('demo_sessions','public_ref'),
     ('demo_sessions','first_opened_at'))
 order by c.table_name, c.column_name;
```

**§V-a — every demo van DOES have a `kds_token`** (that is what sent a web prospect to the standalone
screen). Expect a row per demo van with `has_kds_token = true`:

```sql
select v.truck_id,
       v.name,
       v.active,
       v.kds_token is not null as has_kds_token,
       length(v.kds_token)     as token_len
  from public.truck_vans v
 where v.truck_id like 'demo-%'
 order by v.truck_id, v.name;
```

**§V-c — the demo profile's `show_paid_step` is what puts the KDS on the Window view.** Expect
`show_paid_step = false` on every demo truck; a `true` would silently move the demo to the cook view:

```sql
select t.id,
       t.name,
       t.show_paid_step,
       t.display_mode,
       t.kds_mode
  from public.trucks t
 where t.id like 'demo-%'
 order by t.id;
```

**And the per-event override, which wins over the truck value** (expect no rows — `provisionDemoEvent`
writes none):

```sql
select te.truck_id, te.id as event_id, te.event_date, te.show_paid_step_override
  from public.truck_events te
 where te.truck_id like 'demo-%'
   and te.show_paid_step_override is not null
 order by te.event_date desc;
```

**§V-d — which demos currently have exactly one event** (the condition under which the KDS's event picker
is unreachable, so the new re-seed is the only recovery):

```sql
select te.truck_id,
       count(*)                                        as events,
       count(*) filter (where te.status = 'open')      as open_events,
       min(te.event_date)                              as first_date,
       max(te.event_date)                              as last_date
  from public.truck_events te
 where te.truck_id like 'demo-%'
   and te.status <> 'cancelled'
 group by te.truck_id
 order by te.truck_id;
```

## Closing `git status`, verbatim (nothing staged)

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/api/admin/outreach/route.ts
	modified:   app/api/admin/provision-demo/route.ts
	modified:   app/api/dashboard/route.ts
	modified:   app/api/demo/restart/route.ts
	modified:   app/api/demo/save-email/route.ts
	modified:   app/api/setup/route.ts
	modified:   app/dashboard/[token]/kds/page.tsx
	modified:   app/dashboard/[token]/page.tsx
	modified:   components/admin/OutreachPanel.tsx
	modified:   components/dashboard/DemoWelcome.tsx
	modified:   docs/manual-update-report.md
	modified:   docs/reference-manual.md
	modified:   docs/scraper-reference-manual.md
	modified:   lib/demo-restart.ts
	modified:   lib/demo-session.ts
	modified:   lib/provision-demo.ts
	modified:   lib/seed-demo-orders.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/demo/
	components/admin/CreateDemoModal.tsx
	docs/demo-first-open-report.md
	docs/demo-kds-report.md
	docs/demo-outreach-build-report.md
	docs/demo-outreach-review-report.md
	docs/demo-restart-report.md
	docs/demo-seeder-capacity-report.md
	lib/demo-logo.ts
	lib/self-serve-discovery-link.ts
	supabase/migrations/20260912_demo_sessions_outreach.sql
	supabase/migrations/20260914_demo_sessions_first_opened_at.sql

no changes added to commit (use "git add" and/or "git commit -a")
```
