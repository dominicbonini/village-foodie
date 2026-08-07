# KDS payment state — build report

**Date:** 7 August 2026
**Supersedes:** the read-only audit previously at this path (the finding is restated in "What was wrong").
**Provenance:** that audit — `ledgerRows` had never been passed to the KDS `OrderCard` in any commit.
**Files changed:** 2. `app/dashboard/[token]/kds/page.tsx`, `components/dashboard/OrderCard.tsx`.
**Not run, per the brief:** `next dev`, `next build`, `npx cap sync`. No SQL. No migration.

---

## Summary

| | |
|---|---|
| **Part 1 — pass `ledgerRows`** | Done. It was a prop. The data was already on the client. |
| **Part 2 — per-device toggle** | Done. Capacitor Preferences, `hg_kds_payments_${token}`, default OFF, visible only when the truck's paid step is on, no plan gate. |
| **Lifecycle half** | Done. OFF ⇒ Ready is terminal on this screen. ON ⇒ ticket clears at collected. |
| **`tsc --noEmit`** | Exit 0, before and after. |
| **ESLint** | 912 messages across 15 rules, **rule-for-rule identical** to baseline. |
| **Gusto (`show_paid_step = false`)** | Toggle not rendered. Card byte-identical. **One deliberate exception — see §7.** |

**Nothing in the prompt arrived garbled.** One small provenance discrepancy, flagged rather than
assumed: you dated the prior audit 6 August; the file's own header said 7 August (today). The finding
it records is the one I re-verified, so nothing turns on it.

---

## What was wrong (re-verified before editing, not taken on trust)

`git log --oneline -S"ledgerRows" -- 'app/dashboard/[token]/kds/page.tsx'` still returns **nothing** —
the prop had never appeared in the file, in any commit. `grep -c payments` on the same file returned
**0**. So `OrderCard` ran `getOrderBalance(order, undefined ?? [])` on every KDS card, which returns
`{paidMinor: 0, balanceMinor: <full total>, status: 'unpaid'}` unconditionally
([lib/payments/ledger.ts:114-141](lib/payments/ledger.ts#L114-L141)) — a fully-paid online order
included.

Latent only because `show_paid_step = false` gates the chip to `null` and pins the button to the
constant `"Paid & collected"`. One tap on the per-event override
([app/dashboard/[token]/page.tsx:1271](app/dashboard/[token]/page.tsx#L1271)) made it live: money
buttons on already-paid orders, and — because `Collected` only appears when `effectivePaid` is true —
**no way to clear anything from the board at all**.

---

## Part 1 — pass `ledgerRows`

### Established first, as asked: does the KDS already have the data?

**Yes. It was already on the client and simply discarded.** No query was added, and none was needed —
so the "stop before adding a query to a hot path" branch does not apply.

The chain, each link verified in the current tree:

1. The KDS fetches the same endpoint the dashboard does —
   [kds/page.tsx:209](app/dashboard/[token]/kds/page.tsx#L209),
   `fetch(\`/api/dashboard?${params}\`, …)`.
2. That response already carries the rows keyed by `order_key`: built at
   [app/api/dashboard/route.ts:199](app/api/dashboard/route.ts#L199), populated by **one** query at
   [:235-256](app/api/dashboard/route.ts#L235-L256) over the same active + done order set the KDS is
   rendering — **including the `van_id` filter**, so a van-scoped KDS receives exactly its own orders'
   rows — and returned at [:610](app/api/dashboard/route.ts#L610).
3. `fetchAll` read `data.truck`, `data.orders`, `data.categoryOrder`, `data.itemCategoryMap`,
   `data.catConfigs`, `data.vanShowCookingStep`, `data.vanBuzzerCount` — and dropped `data.payments`
   on the floor.

Cost of the fix: **one state hook, two assignments, one prop.** Nothing added to the 60s poll.

### The change

| Line | What |
|---|---|
| [kds/page.tsx:92](app/dashboard/[token]/kds/page.tsx#L92) | `const [payments, setPayments] = useState<Record<string, LedgerRow[]>>({})` |
| [:245](app/dashboard/[token]/kds/page.tsx#L245) | `if (data.payments !== undefined) setPayments(data.payments || {})` in `fetchAll` |
| [:723](app/dashboard/[token]/kds/page.tsx#L723) | the same line in `submitPin` — that response is the first board an operator sees after entering the PIN, and without it the first paint would resolve every order unpaid until the next poll |
| [:1309](app/dashboard/[token]/kds/page.tsx#L1309) | `ledgerRows={payments[order.order_key]}` |

The `!== undefined` guard mirrors the dashboard's
([page.tsx:710](app/dashboard/[token]/page.tsx#L710)) exactly: an older server that omits the field
leaves the previous map intact rather than blanking every card to unpaid, while an **empty** map — the
route's own logged failure path — still clears, because that is a genuine "no rows this poll" and must
not be masked by a stale copy.

### After Part 1, before Part 2

For a `show_paid_step`-false truck the KDS **resolves correctly and looks exactly as it did**: every
payment-derived element on the card is still gated to `null` or to the fixed `"Paid & collected"`
label by `!showPaidStep`, which Part 1 does not touch. The resolution is now right whether or not
anything displays it — which is the whole point of doing it first.

---

## Part 2 — the per-device setting

### Storage

`Preferences.get/set({ key: \`hg_kds_payments_${token}\` })`, values `'on'` / `'off'`, loaded once on
mount at [kds/page.tsx:311](app/dashboard/[token]/kds/page.tsx#L311) and written through at
[:319](app/dashboard/[token]/kds/page.tsx#L319).

- **Per DEVICE, not per truck and not per event.** Two iPads on one truck differ, which a `trucks`
  column cannot express and a per-event override expresses on the wrong axis entirely — it is a
  property of *where the device sits*, not of the pitch.
- **Capacitor Preferences, not localStorage** — as specified, and it is the better home even though the
  view/layout/sound prefs beside it use localStorage (they predate the native shell). Preferences
  persists to UserDefaults on iOS, which survives the hard navigations and cold-kills that can hand a
  WKWebView a fresh localStorage — the failure mode written out in
  [lib/native/preferencesStorage.ts](lib/native/preferencesStorage.ts). This toggle decides which
  orders *leave the board*, so losing it silently is worse than losing a list/grid preference. On web
  the plugin falls back to localStorage, so a browser KDS persists too.
- **No new dependency or SSR risk:** `@capacitor/preferences` is already statically imported by
  [lib/native/outbox.ts:17](lib/native/outbox.ts#L17) and
  [lib/native/orderGate.ts:12](lib/native/orderGate.ts#L12), both of which the KDS page already
  imports.
- **Token-keyed**, like every other KDS device pref, so two trucks on one iPad do not collide.

**On the async read.** `Preferences.get` cannot be read synchronously at first render, so this is an
effect rather than a lazy `useState` initialiser. Not a hazard: the whole board sits behind `loading`,
which does not clear until the `/api/dashboard` round-trip returns, and a native-storage read beats a
network fetch. Should it ever lose that race, the resolution is `showPaymentsPref !== true` — `null`
resolves to **hide**. Withholding money UI for a frame is recoverable; flashing a paid chip on a grill
screen is the thing the setting exists to prevent. A read failure lands on `false` = OFF = today's
behaviour.

### Visibility and gating

[kds/page.tsx:848-849](app/dashboard/[token]/kds/page.tsx#L848-L849):

```ts
const { showPaidStep } = resolvePaidStep(truck, activeEvent)
const hidePayments = showPaidStep && showPaymentsPref !== true
```

`showPaidStep` comes from the **shared resolver** over the same `(truck, event)` pair the card itself
uses — never inline — so this surface and `OrderCard` cannot disagree about whether the paid step is
split for this event. Both inputs were verified to reach the KDS correctly: `truck.show_paid_step` is
mapped explicitly at [app/api/dashboard/route.ts:589](app/api/dashboard/route.ts#L589) and
`takes_cash` rides the whole-row spread at [:564](app/api/dashboard/route.ts#L564); the KDS's
`activeEvent` comes from `/api/events/manage`, which selects `*`
([route.ts:26](app/api/events/manage/route.ts#L26)) and therefore carries
`show_paid_step_override` / `takes_cash_override`.

The button is rendered at [:1061](app/dashboard/[token]/kds/page.tsx#L1061) under
`{showPaidStep && activeView === 'window' && (…)}`:

- **Paid step off ⇒ not rendered.** There is no payment step to opt out of, so a toggle would offer a
  choice that changes nothing, on the screen where a control that does nothing is most expensive.
- **Window view only.** Cook view is unchanged by this setting in every combination (§(c)), so on the
  cook screen the button would visibly do nothing. `hidePayments` is still *computed* and still passed
  to cook cards, so switching back to Window applies the stored preference.
- **No plan gate.** None added; `can(…)` is not consulted.
- **Default OFF** — an unset key reads `null` → `value === 'on'` is `false`.

Placed beside the Sound toggle (both per-device) and away from Window/Cook (those pick a *layout*).
Same chip shape as Sound; the word is spelled out rather than icon-only because it moves tickets off
the board and an icon cannot carry that.

### The lifecycle half

**Board filter**, [kds/page.tsx:880](app/dashboard/[token]/kds/page.tsx#L880):

```ts
const windowOrders = hidePayments
  ? activeOrders.filter(o => o.status !== 'ready')
  : activeOrders
```

**Card**, `components/dashboard/OrderCard.tsx` — one new optional prop, `hidePayments = false`
([:99](components/dashboard/OrderCard.tsx#L99), documented at
[:183](components/dashboard/OrderCard.tsx#L183)), with exactly two effects:

1. [:308](components/dashboard/OrderCard.tsx#L308) —
   `const paidChipStatic = !showPaidStep || hidePayments ? null : …`. One null-gate keeps the chip, its
   tap target and the remove-payment modal on a single switch.
2. [:558](components/dashboard/OrderCard.tsx#L558) —
   `if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {`.

On (2): the cook button set is **reused, not duplicated**. A window device with payments off has
exactly the cook screen's job — advance the food, stop at Ready — so it gets exactly the cook screen's
controls. A fourth button vocabulary would give one operator two screens that behave nearly but not
quite alike, which is how a fast-tap surface gets someone paid twice. The condition names
`viewMode === 'window'` explicitly rather than testing `hidePayments` bare, so the prop is
*structurally* incapable of reaching solo — the dashboard's mode — whatever a future caller passes.

⚠️ **`hidePayments` touches no arithmetic.** `getOrderBalance` still runs over the real ledger rows and
still governs `balance`, `isPaid`, `effectivePaid`. It decides only what is *offered*. A device
preference must never be able to change what is true.

⚠️ **One consequence worth naming:** with `kds_mode` on (the cooking gate), the reused cook block
renders `Start cooking` **and** `Ready`, not `Ready` alone. That is the cook screen's exact behaviour
and keeps the two no-money screens identical, but it does mean a hatch iPad with payments off shows a
"Start cooking" button. Say the word and it becomes `Ready`-only for `viewMode === 'window'`.

---

## The three questions, established before building

### (a) With the toggle OFF, where does completion happen?

**On the dashboard, and on any other KDS device with the toggle on. This is true by design, not by
accident.**

The tap fires `'ready'`, not `'collected'`. `'ready'` is **not terminal** anywhere in the system:

- The dashboard's `confirmedOrders` bucket is
  `eventOrders.filter(o => ['confirmed','modified','cooking','ready'].includes(o.status))` —
  [app/dashboard/[token]/page.tsx:2219](app/dashboard/[token]/page.tsx#L2219). Verified in the current
  tree, not assumed. A ready order is on the dashboard.
- The dashboard renders it in solo mode, where
  [OrderCard.tsx:614-616](components/dashboard/OrderCard.tsx#L614-L616) gives `order.status === 'ready'`
  → `completionBtn()` → `Mark paid` → `Collected`. With `ledgerRows` supplied there, which it always
  has been.
- Another KDS with the toggle **on** keeps it in `windowOrders` and offers the same path.

The design guarantee is that the filter is a **local render-time predicate over a shared status**. It
writes nothing, stores nothing and reaches no other device. The only way for a ready order to be
invisible everywhere would be for every surface to filter it, and the dashboard — which has no such
toggle — never does.

### (b) Two devices differing: intended, and nothing breaks

**Intended consequence, confirmed.** Device A (payments off) clears the ticket at Ready; device B
(payments on) keeps it live and collects.

- **No shared state.** The preference lives in that device's own Preferences store under a
  device-local key. There is no column, no event override, no broadcast.
- **No action of A's hides it from B incorrectly.** A's only write is `action: 'ready'` — the same
  status transition the cook screen has always fired. B receives `status: 'ready'` on its next poll and
  shows it, because B's filter passes ready orders. B's `Collected` then advances the order and A never
  had it on screen to lose.
- **Not a new mechanism.** A Max-plan truck already runs exactly this split today: the cook screen
  drops ready orders while the window screen keeps them. This applies the established rule to a window
  device that has been told it is not the hatch.
- **The offline path holds too.** Ready tapped offline queues through `gatedAction`, the durable status
  overlay asserts `'ready'`, and `overlayedOrders` is computed **before** the view split
  ([:869-874](app/dashboard/[token]/kds/page.tsx#L869-L874)) — so the ticket leaves the board
  immediately, exactly as online, and the existing offline Undo restores it.

### (c) Which view modes — window only

**Window only. Cook view is untouched, and its price-hiding is untouched.**

Cook view is invariant under this toggle in all four combinations, structurally:

- Its board filter, `cookOrders`, is not a function of `hidePayments` — cook has always dropped ready
  orders.
- Its header ([OrderCard.tsx:652-677](components/dashboard/OrderCard.tsx#L652-L677)) renders no
  `paidChip` — there is nothing there for `hidePayments` to suppress.
- Its button branch was already taken; adding `|| (viewMode === 'window' && hidePayments)` to the
  same `if` cannot change which arm cook lands in.
- Price-hiding is the `viewMode === 'cook'` item branch at
  [:794-819](components/dashboard/OrderCard.tsx#L794-L819). **Not touched.** (The `showPrices` const at
  [:468](components/dashboard/OrderCard.tsx#L468) remains computed-but-unread, exactly as before — it
  is not load-bearing and I left it alone.)

`hidePayments` is still passed to cook cards. That is deliberate and harmless: one value, computed
once, and cook's rendering is provably identical either way.

---

## Verification — all four combinations walked

### 1. Truck paid step OFF (Gusto and every default truck)

`hidePayments = false && … = false`.

| | |
|---|---|
| Header toggle | `showPaidStep &&` ⇒ **not rendered** |
| Board | `windowOrders = activeOrders` — ready orders visible, unchanged |
| Chip | `!showPaidStep` ⇒ `null`, unchanged |
| Button block | `(viewMode === 'window' && false)` ⇒ old branch, unchanged |
| Completion | `completionBtn()` → `"Paid & collected"` → `'collected'` |
| **Collected reachable?** | **Yes**, one tap, as today |

### 2. Paid step ON, device toggle OFF

`hidePayments = true`.

| | |
|---|---|
| Board | ready orders filtered out |
| Chip | `null` — no PAID, no part-paid balance, no tap target, no remove-payment modal |
| `pending` | Confirm / Reject (that branch precedes the view split — unchanged) |
| `confirmed` / `modified` | `Ready` (plus `Start cooking` when `kds_mode`) |
| `cooking` | `🔥 Cooking…` + `Ready` |
| `ready` | filtered off the board |
| Money buttons | **none reachable** |
| **Collected reachable?** | **Yes — on the dashboard** (`confirmedOrders` includes `'ready'`) **and on any KDS with the toggle on.** Not stuck. |

### 3. Paid step ON, device toggle ON

`hidePayments = false`, and `ledgerRows` now supplied.

**Already-paid order** (the verify item): `getOrderBalance` → `status: 'paid'` → `isPaid` →
`effectivePaid: true` →

- chip renders **PAID**;
- `completionBtn()` hits `if (effectivePaid) return <Btn label="Collected" …>`
  ([OrderCard.tsx:241-243](components/dashboard/OrderCard.tsx#L241-L243)).

**✅ Confirmed: an already-paid order offers `Collected`, never `Mark paid` / `Cash` / `Card`.** This
is precisely what was impossible before Part 1 — `effectivePaid` was permanently `false`, so the card
offered a money button on an order that owed nothing.

**Unpaid order:** `Mark paid`, or `💷 Cash` / `💳 Card` when `takes_cash`. Tap → server records → the
next poll delivers the new row → `effectivePaid` becomes true → the button **relabels to `Collected`**
→ tap → order leaves the board. **Not stuck.** Before Part 1 this loop never terminated: the refetch
brought no rows, the card stayed unpaid, and `Collected` was unreachable forever.

**Part-paid order:** `status: 'part_paid'` → amber `£X / £Y due` chip and `Mark £Y.YY paid`, with
`balanceMinor` now real rather than the full total.

### 4. The same order on two devices set differently

Device A (off): ticket disappears at Ready. Device B (on): ticket stays, shows PAID or a pay button,
collects. Both read the same `orders` from the same endpoint; neither writes the preference anywhere
the other can see. **Collected is reachable on B, and on the dashboard.** Covered in full at §(b).

### Collected reachable in every combination

| Combination | Route to `collected` |
|---|---|
| Paid step off | `"Paid & collected"` on the KDS, one tap |
| Paid step on, device off | Dashboard (ready orders are in `confirmedOrders`), or another KDS with it on |
| Paid step on, device on | `Mark paid` → relabels to `Collected` on the next poll |
| Two devices differing | The payments-on device, or the dashboard |

**No combination strands an order on the board.** The one that previously did — paid step on, which
before this change was the *only* behaviour available — is fixed by Part 1.

### Gusto specifically — verified, not assumed

`show_paid_step` defaults to `false`
([migration:53](supabase/migrations/20260729_trucks_paid_step_settings.sql#L53)) and you confirm Gusto
is on the default. Traced line by line:

- `resolvePaidStep(truck, activeEvent)` → `undefined ?? false ?? false` → `showPaidStep: false`
- ⇒ `hidePayments = false && … = false`
- ⇒ header toggle `{showPaidStep && …}` → **not rendered**
- ⇒ `windowOrders = activeOrders` → board filter **unchanged**
- ⇒ `paidChipStatic`: `!showPaidStep` short-circuits **before** `hidePayments` is read → `null`, unchanged
- ⇒ button block: `(viewMode === 'window' && false)` → old branch, unchanged
- ⇒ `completionBtn()` returns at `if (!showPaidStep)` → `"Paid & collected"` → `'collected'`, unchanged

**Part 1 is invisible to them on the card, exactly as you expected**, because `ledgerRows` only feeds
`balance`, and every consumer of `balance` is behind the `showPaidStep` gate.

---

## §7 — The one deviation, flagged for your decision

**The "Done today" strip is the single thing on the KDS that a Gusto operator could see change.**

[kds/page.tsx:1341-1355](app/dashboard/[token]/kds/page.tsx#L1341-L1355). It previously printed the
**literal string `✓ paid`** for every collected order, derived from nothing at all — not the ledger,
not `payment_status`, not even `show_paid_step`. It was the one payment claim on this screen that
survived the paid-step gate, so it was the only one Gusto could see, and the prior audit flagged it.
Now that Part 1 supplies the rows, it is derived through the same resolver as everything else, and
suppressed entirely when `hidePayments` (a screen showing no prices and no pay buttons must not assert
in a footer that money changed hands).

**When it differs for Gusto:** only when the label was previously lying. A collected order has been
through `recordCollectionPayment` ([action/route.ts:403](app/api/dashboard/action/route.ts#L403)), so
in the normal case the derived value is `paid` and the strip still reads `✓ paid` — identical. It
diverges only on the **fail-open path**, where the ledger write failed, the server returned a
`paymentWarning` that no client reads, and the order is genuinely unsettled. There the strip now reads
`£X.XX due` instead of a false `✓ paid`.

I judged that strictly better and kept it — but it is the one place I went beyond the literal brief,
and it is your call. Reverting is one line: restore
`<span className="text-green-600">✓ paid</span>` at [:1352](app/dashboard/[token]/kds/page.tsx#L1352).

---

## Constraints — held

| Constraint | Status |
|---|---|
| Don't touch the dashboard's `OrderCard` behaviour | **Held.** The one new prop defaults `false`; the dashboard never passes it. `paidChipStatic` gains `\|\| false`; the button condition gains `\|\| (viewMode === 'window' && false)`. The dashboard renders solo, which the second condition names explicitly and cannot reach. |
| Don't change `show_paid_step`, its override, or server-side payment logic | **Held.** No file under `app/api/`, `lib/payments/`, or `supabase/migrations/` was touched. `resolvePaidStep` is *called*, never modified. |
| No plan gate | **Held.** `can(…)` is not consulted by any new line. |
| Don't touch the offline payment overlay, conflict signal, printing, commerce-policy, pricing, native shell | **Held.** `useOfflinePaymentOverlay` is still not imported by the KDS and no `pendingPayment` prop is passed — deliberately out of scope, and its own header explains why it must layer over a *correct* resolver, which is what Part 1 has now made possible. `conflict` / `useOutboxConflicts` untouched. No printing, pricing, commerce-policy or shell file changed. |
| No SQL, no migration, no `cap sync` / `dev` / `build` | **Held.** |

---

## Checks

```
$ npx tsc --noEmit ; echo $?
0                                    # identical before and after
```

ESLint compared **by rule**, not by count, before and after:

```
TOTAL 912
568 @typescript-eslint/no-explicit-any        15 react-hooks/refs
149 @typescript-eslint/no-unused-vars         15 @next/next/no-img-element
 44 react/no-unescaped-entities                8 @typescript-eslint/no-require-imports
 42 react-hooks/set-state-in-effect            8 (fatal)
 25 react-hooks/exhaustive-deps                8 react-hooks/purity
 17 @typescript-eslint/no-unused-expressions   4 react-hooks/preserve-manual-memoization
                                               4 react-hooks/immutability
                                               3 react-hooks/rules-of-hooks
                                               2 prefer-const

$ diff lint-before.txt lint-after.txt
LINT RULE PROFILE IDENTICAL TO BASELINE
```

Zero drift on every rule — including `react-hooks/set-state-in-effect`, which the new mount effect
does not trip because its `setState` lands in the promise callback rather than the effect body. The
per-file listing for `kds/page.tsx` confirms no message is anchored to any new line.

Not run per the brief: `next build`, `next dev`, `npx cap sync`. **The toggle's persistence across a
cold app-kill is the one behaviour that cannot be proven without a device build** — the code path is
the same `Preferences` API the outbox already relies on, but that is inference, not a test.

---

## What was not built, and why

- **The offline payment overlay on the KDS.** Out of scope by explicit constraint, and correctly so: it
  layers over `getOrderBalance`'s output and needed a correct resolver underneath first. Part 1 has now
  supplied that, so wiring it is a clean follow-up rather than a workaround.
- **`paymentWarning` surfacing.** The server returns it on both `collected` and `mark_paid`; no client
  in the repo reads it, dashboard included. Pre-existing, not caused by this work, and not a KDS-only
  gap — so it did not belong in this change. Worth its own pass.
