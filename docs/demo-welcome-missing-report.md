# The demo introduction did not appear — cause, and where "seen" now lives

**Date** 19 September 2026 · **Scope** localhost only, nothing deployed · **Trucks written to: none.**
Reads on the Between Buns Royston demo truck only; test-truck untouched; Pizzeria Gusto never called,
read or written.

**The cause, in one line.** Two faults with one symptom: the "seen" flag was keyed on the **dashboard
token**, which a rebuild keeps, and it was **read one render too early to be rescued** — `DemoWelcome`
read it in a `useState` initialiser during first paint, while the self-heal that clears a stale flag runs
in `DemoLoopComplete`'s effect, gated on the orders fetch. The flag was cleared *after* the welcome had
already decided not to open, and nothing re-read it. So the introduction appeared on the **next** load and
never on the one that repaired it.

**Your added requirement changed where the fix lives.** "Each time the demo link is opened, it should show
the intro popup. I especially don't want to check the demo and have the flag showing someone's seen it
when it was only me checking before sending." That rules out the option the brief offered of recording it
server-side on the demo session — a server-side stamp is precisely what would let your own check consume
the prospect's first open. **"Seen" now lives in `sessionStorage`, per viewer, per tab.**

**⚠️ One tension, flagged and reconciled rather than chosen silently.** The brief says "do not make it
reappear on every page load"; your addendum says "each time the demo link is opened, it should show". Those
are the same rule under one reading and opposite under another. `sessionStorage` satisfies both as stated:
it **survives a reload of the tab** (so it does not reappear on a page load) and **dies with the tab** (so
opening the link again shows it again). If you meant something stricter — the introduction on *every*
navigation, refresh included — that is a one-line change and I have said where.

---

## git status — before

**HEAD `d7addb7` "demo upgrade" · 0 staged · 0 modified · 0 untracked.** A clean tree; the previous
round's work is committed.

---

# ESTABLISH

## §1 · The render condition and every input

The panel is mounted by the dashboard:

```tsx
const isDemo = token.startsWith('demo-')
…
{isDemo && <DemoWelcome token={token} orderUrl={customerOrderUrl}
  isSample={demoSession?.extraction_source === 'template'}
  logoUrl={(demoBranded && truck && hasFeature(truck.plan,'branded_qr_code') && truck.qr_code_style === 'branded') ? (truck.logo || null) : null} />}
```

and decided its own visibility with, **before this fix**:

```ts
const storeKey = demoWelcomeKey(token)          // `hg_demo_welcome_${token}`
const [open, setOpen] = useState(() => {
  if (typeof window === 'undefined') return false
  try { return localStorage.getItem(storeKey) !== 'seen' } catch { return true }
})
…
if (!open) return null
```

| input | where it comes from | could it suppress the panel? |
|---|---|---|
| `isDemo` | `token.startsWith('demo-')` on the dashboard URL | no — Between Buns' token is `demo-8c95xz…` |
| `storeKey` | **the dashboard token**, via `demoWelcomeKey` | **yes — the token is stable across rebuilds** |
| the stored value | `localStorage`, this browser, **persists across visits** | **yes — a check of a previous build sets it for ever** |
| the self-heal | `resetDemoBoardFlags`, called from `DemoLoopComplete`'s effect when `boardWasReplaced` | intended to rescue it; **runs too late** (see §4) |
| the deferral | `DemoLoopComplete` returns early while the welcome is unseen | defers the *signup* panel, never the welcome |
| `orderUrl` · `isSample` · `logoUrl` | content only | no |

## §2 · What could suppress it, and how to tell

| | cause | how Dominic could tell |
|---|---|---|
| (a) | the code is not deployed, so he saw the old behaviour | it is not deployed — every round this week is localhost-only. **If he opened a production URL, this is the whole answer.** On localhost, check the dev server is serving this tree. |
| (b) | a flag set in his browser by a previous open, self-heal did not run | DevTools → Application → Local Storage → `hg_demo_welcome_demo-8c95xz…` present with value `seen` |
| (c) | the self-heal ran but keys on something unchanged by a rebuild | **the live cause, with (b).** The dashboard token is the key and a rebuild keeps it, so the stale flag and the new flag are the same key |
| (d) | it rendered and was dismissed or covered | it is `fixed inset-0 z-[80]` with a backdrop; nothing in the demo dashboard sits above it |
| (e) | it renders only on the demo link route | **ruled out** — see §3 |
| (f) | something else | the ordering fault in §4, which is why the self-heal built for exactly this did not save it |

**It was (b) + (c), compounded by the ordering in §4.** The distinguishing observation is that the
introduction *would* have appeared on a second reload, because by then the self-heal had cleared the flag.

## §3 · Which URL — both, and that was never the problem

`app/demo/[ref]/route.ts` resolves `demo_sessions.public_ref` → the truck's `dashboard_token` and

```ts
return NextResponse.redirect(new URL(`/dashboard/${truck.dashboard_token}`, req.url))
```

It is a **307 and nothing else**, with no writes at all — its own header records that, and the harness
asserts both facts from the source. So the prospect link and the dashboard URL land on the **same page**
and mount the **same component**; the welcome renders on both, before and after this fix. The rebuild's
modal offers both links: "Send them this link" (`/demo/<ref>`, the one a prospect uses) and "Dashboard"
(`/dashboard/<token>`). Either shows the introduction.

## §4 · The dashboard token does not change on a rebuild — and the rescue ran too late

`provisionDemo`'s `existingTruckId` path reuses the truck row, so `slug` and `dashboard_token` are
unchanged. The key is therefore identical across builds.

The self-heal was written for exactly this, but the ordering defeats it:

| when | what happens |
|---|---|
| first paint | `DemoWelcome`'s `useState` initialiser reads `localStorage` → `'seen'` → `open = false` |
| effects | `DemoLoopComplete`'s effect is gated on `loaded` — it waits for the orders fetch |
| fetch returns | `boardWasReplaced(baseline, keys)` is true → `resetDemoBoardFlags` clears the flag |
| after that | **nothing re-reads it.** A `useState` initialiser runs once; `setOpen` is only ever called to close |

So the repair landed a full network round trip after the decision it was meant to change.

## §5 · The demo's stored state, read-only

```sql
SELECT demo_sessions.truck_id, demo_sessions.public_ref, demo_sessions.first_opened_at,
       demo_sessions.created_at, demo_sessions.expires_at, demo_sessions.retired_at
  FROM demo_sessions WHERE demo_sessions.truck_id = 'demo-8c95xz1twsn1xfhx3a4nkjv7j3';
```

| field | value |
|---|---|
| `public_ref` | `between-buns-royston-8c6a` |
| **`first_opened_at`** | **null** |
| `created_at` | 2026-09-12T19:00:48Z |
| `expires_at` | 2026-10-12T19:00:48Z |
| `retired_at` | null |

**Nothing server-side says this demo has been opened.** The suppression was entirely in Dominic's browser —
which is exactly why a server-side "seen" stamp would have been the wrong fix, and why his worry about
consuming the prospect's first open is well founded.

```sql
SELECT trucks.id, trucks.logo_storage_path, trucks.qr_code_style, trucks.plan
  FROM trucks WHERE trucks.id = 'demo-8c95xz1twsn1xfhx3a4nkjv7j3';
```
→ `logo_storage_path` **present**, `qr_code_style: 'branded'`, plan `demo`. That also confirms last round's
Item 1 diagnosis from the live row: the demo is branded and the warning was the liar.

## §6 · Both paths, reproduced against the real components

Driven in `scripts/demo-welcome-open.cjs`, which mounts the real `DemoWelcome` and `DemoLoopComplete` with
stand-in stores:

- **No flag** → the introduction renders. (Never in doubt; this is the case that always worked.)
- **A flag from a previous build, pre-fix code** → **nothing renders.** That is the broken variant V1, and
  it is Dominic's screen: *"V1 the flag in localStorage: a new tab on a rebuilt demo shows NO introduction"*.

---

# THE FIX

**`lib/demo-board-build.ts`** — the welcome's state moves store and gains a subscription:

| symbol | what it does |
|---|---|
| `demoWelcomeSeen(token)` | reads **`sessionStorage`**; a blocked store, a private window or the server all answer `false`, which shows the introduction — the safe direction |
| `markDemoWelcomeSeen(token)` | the dismissal, for this tab, across reloads |
| `clearDemoWelcomeSeen(token)` | forgets it **and notifies** |
| `subscribeDemoWelcome(fn)` | a tiny listener set, so a clear re-opens the panel in the same render pass |
| `resetDemoBoardFlags` | unchanged in purpose; the **baseline stays in `localStorage`** (it must survive a tab close, or the signup prompt would fire on the seeded board every visit), the welcome's flag is cleared through `clearDemoWelcomeSeen` |

**`DemoWelcome`** — subscribed, not snapshotted once:

```ts
const seen = useSyncExternalStore(
  subscribeDemoWelcome,
  () => demoWelcomeSeen(token),
  () => true,          // server snapshot: nothing flashes during hydration
)
const [dismissed, setDismissed] = useState(false)
const open = !seen && !dismissed
```

`dismiss()` calls `markDemoWelcomeSeen(token)` **and** sets local state, so a browser that refuses
`sessionStorage` still closes on the tap instead of re-rendering straight back open.

**`DemoLoopComplete`** — its deferral now reads through the shared `demoWelcomeSeen` rather than reaching
into a storage key of its own.

## Where "seen" lives, and why

**`sessionStorage`, per dashboard token, per browser tab.** Not `localStorage`, because a check before
sending must leave nothing behind. Not `demo_sessions`, because a server-side stamp is shared by everyone
who opens the link — Dominic's check would spend the prospect's first open, the exact thing he asked not
to happen. The resulting behaviour:

| action | introduction? |
|---|---|
| open the link in a new tab or window | **yes** |
| dismiss it | closes |
| reload that tab | no — it is not on every page load |
| close the tab, open the link again | **yes** |
| rebuild the demo, in a tab that is already open | **yes** — the self-heal clears and notifies, and the panel re-opens immediately |
| a prospect opens it, on their own machine | **yes** — nothing Dominic did can reach their browser |

---

# PROOF

## `scripts/demo-welcome-open.cjs` — new, listed (the suite is now 57)

**Failure mode:** a demo that opens without introducing itself, or that congratulates a visitor for orders
they did not place.

**Both broken variants ran FIRST and FAILED as required:**

```
  ✓ FAILED as required  V1 the flag in localStorage: a new tab on a rebuilt demo shows NO introduction
  ✓ FAILED as required  V2 deferral and self-heal removed: the signup prompt is on screen (true) over an unread introduction (true)
```

**The real tree:**

```
── OPENING THE LINK ─────────────────────────────────────────────────────────────────────
  ✓ a browser with no flag opens on the introduction
  ✓ …and the signup prompt is not on screen
  ✓ dismissing closes it
  ✓ reloading that tab does NOT show it again — it is not on every page load
  ✓ opening the demo link again in a new tab DOES show it again
  ✓ and nothing durable was written — a check before sending leaves no "someone has seen it" behind

── A STALE FLAG FROM A PREVIOUS BUILD ───────────────────────────────────────────────────
  ✓ a localStorage flag left by the OLD build no longer suppresses the introduction
  ✓ …and the rebuilt board does not fire the signup prompt

── A REBUILD DETECTED MID-SESSION ───────────────────────────────────────────────────────
  ✓ the introduction is dismissed for this session
  ✓ a rebuild detected in the SAME session re-opens the introduction immediately
  ✓ …and still no signup prompt — those orders are not theirs

── THE SIGNUP PROMPT STILL WAITS FOR AN ORDER THEY PLACED ───────────────────────────────
  ✓ after the introduction, the seeded board alone shows no prompt
  ✓ an order ADDED to the board they already knew DOES fire it — the moment it is for

── BOTH URLs REACH THE SAME PANEL ───────────────────────────────────────────────────────
  ✓ the prospect link /demo/<ref> resolves to /dashboard/<token> and redirects — one page, one panel
  ✓ …and writes nothing, so opening the link to check it consumes nothing

✅ the demo introduces itself whenever the link is opened, and only the visitor's own order is congratulated
```

## `scripts/demo-seed-parameters.cjs` — its ITEM 2 block updated

That block asserted the welcome flag was cleared from `localStorage`. It now asserts the two flags live in
**different stores on purpose** — the baseline durable, the welcome session-scoped — and that a dismissal
writes nothing durable:

```
  ✓ a replaced board CLEARS the welcome flag, so the rebuilt demo introduces itself again
  ✓ and re-baselines on the seeded orders, so they are never mistaken for the visitor's own
  ✓ and the shared reader agrees the introduction is due
  ✓ a dismissal is recorded for the SESSION only — nothing durable says anyone has seen it
```

---

# VERIFICATION — true exit codes

| command | exit |
|---|---|
| `node scripts/demo-welcome-open.cjs` | **0** (17 assertions; V1–V2 failed first) |
| `node scripts/demo-seed-parameters.cjs` | **0** |
| `node scripts/run-harnesses.cjs` | **0** — 57 run · 57 passed · 0 failed |
| `npx tsc --noEmit` | **0** |
| `npx next build` | **0** |

**Goldens — unchanged, byte for byte. No generator was run.**

| golden | sha256 |
|---|---|
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` |

## eslint, per rule, against a clean HEAD worktree (`d7addb7`)

| rule | HEAD | working tree | delta |
|---|---|---|---|
| `@typescript-eslint/no-require-imports` (error) | 4 | 4 | 0 |

**Zero delta.** `lib/demo-board-build.ts`, `DemoWelcome` and `DemoLoopComplete` lint clean on both sides;
the new harness reports 8 `no-require-imports`, the house pattern for `.cjs` harnesses.

---

# LOCALHOST CHECK for Dominic

1. `npm run dev`. Open **`/demo/between-buns-royston-8c6a`** in a **new tab**. *Expect:* the full-screen
   introduction — "Here's your menu", the line about the orders being examples, the two things to try, and
   the QR with the truck's logo on it.
2. Dismiss it, then **reload the tab**. *Expect:* it stays dismissed. That is the "not on every page load"
   half.
3. **Close the tab and open the link again.** *Expect:* the introduction is back. Nothing was left behind.
4. **Clearing the flag by hand in Safari**, if you want to force it inside the same tab: Develop →
   Show Web Inspector → **Storage** → **Session Storage** → the localhost origin → delete
   `hg_demo_welcome_demo-8c95xz1twsn1xfhx3a4nkjv7j3`. (If Develop is not in the menu bar: Safari →
   Settings → Advanced → "Show features for web developers".) A private window works too, and needs no
   clearing at all.
5. **The old flag is harmless but you can tidy it.** The same inspector, under **Local Storage**, may still
   hold `hg_demo_welcome_demo-8c95xz…` from before this fix. Nothing reads it any more; delete it if you
   like. Leave `hg_demo_seen_orders_demo-8c95xz…` alone — that is the baseline that stops the signup prompt
   firing on the seeded board.
6. **The signup prompt still works.** Scan the QR or tap the customer link, place an order, and watch it
   land: "That's exactly how a real order lands" appears then, and only then.

---

# Anything I could not establish

- **I did not open the demo in a browser.** The reproduction and the proof are the real components mounted
  on the mini-DOM with stand-in stores, which is where the fault lived — a `useState` initialiser, a
  storage key and an effect ordering. What a headless browser would add is the visual, not the logic, and
  the dashboard page itself is behind an operator session on the non-demo routes.
- **I did not read Dominic's browser storage**, so (b) is inferred rather than observed: it is the only
  state that can produce what he saw given `first_opened_at` is null and the code is not deployed. Step 4
  above is how he can confirm it in one look, and the fix makes the answer moot either way.
- **I did not rebuild the demo.** Creating or rebuilding needs an admin session, which returns 401 here.
  No demo was written to.

---

# git status — after

**0 staged · 5 modified · 1 untracked.**

```
 M components/dashboard/DemoLoopComplete.tsx   reads the shared demoWelcomeSeen instead of a key of its own
 M components/dashboard/DemoWelcome.tsx        useSyncExternalStore, so a cleared flag re-opens it at once
 M lib/demo-board-build.ts                     the seen-state moves to sessionStorage and gains a subscription
 M scripts/demo-seed-parameters.cjs            its ITEM 2 block follows the flag to its new store
 M scripts/harnesses.json                      + demo-welcome-open.cjs (57)
?? scripts/demo-welcome-open.cjs               the new harness
```

Plus `docs/demo-welcome-missing-report.md`, this report.

Nothing was staged, committed, stashed, reset or restored. The temporary HEAD worktree used for the lint
delta was removed. **No truck row and no demo was written to by this task.**
