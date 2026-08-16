# A sixth Max bullet — and the comparison table already agreed

Scope honoured: **one file edited, one line added.** No `next dev`, no `next build`, no `cap sync`, no
deploy, no commit, no package installed, no migration, no feature key, no gate, no type, no native
config.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

The pricing **CARD** and the feature comparison **TABLE** are reported **separately**. Every claim is
marked **READ** or **INFERRED**.

> ✅ `npx tsc --noEmit` exits 0.
> ✅ **The new line is pure ASCII — the non-ASCII census is byte-for-byte identical, not merely
> class-identical.** F2.

🔴 **THE ONE PREMISE CORRECTION, AND IT MAKES THE TASK SMALLER: the comparison table ALREADY HAS a
loyalty row, and it already says `max: 'coming_soon'`.** Part C's *"if it has NO loyalty row… STOP"*
branch does not apply. **The card and the table now agree without the table being touched.**

---

# PART A — WHAT IS THERE

## A1. The Max pricing card, in full — READ, before

**READ** — `app/landing/page.tsx:342-356`:

```tsx
            {/* Max */}
            <div className="plan">
              <div className="plan-name">{PLAN_META.max.name}</div>
              <div className="plan-who">{PLAN_DESCRIPTIONS.max}</div>
              <PlanPrice plan="max" />
              <div className="plan-fee">{PLAN_ALLOWANCES.max}<sup className="fee-star">*</sup></div>
              <ul>
                <li className="lead">Everything in Pro, plus</li>
                <li>Multi-device kitchen sync</li>
                <li>Multi-staff logins</li>
                <li>Kitchen ticket printing</li>
                <li>Event &amp; festival pricing <span className="soon-inline">Coming soon</span></li>
              </ul>
              <DemoCta className="btn btn-ghost">Try Free</DemoCta>
            </div>
```

⚠️ **A small correction to the brief's count: the card carries FIVE `<li>` elements, but the first is
`className="lead"` — *"Everything in Pro, plus"* — which is a heading, not a feature.** So there are
**four feature bullets**, one of which carries the badge. The new one makes **five features, six
`<li>`**.

## A2. The badge mechanism, exactly

**READ** — the markup is a plain `<span>` with one class:

```tsx
<span className="soon-inline">Coming soon</span>
```

**READ** — `app/landing/landing.css:249`, the entire rule:

```css
.hg-landing .soon-inline { display: inline-block; font-size: .68rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-faint); border: 1px solid var(--line); border-radius: 4px; padding: .05rem .3rem; margin-left: .2rem; white-space: nowrap; vertical-align: 1px; }
```

🔴 **THERE ARE TWO DISTINCT COMING-SOON MECHANISMS ON THIS PAGE AND THEY MUST NOT BE CONFUSED:**

| Class | Where | Renderer |
|---|---|---|
| **`.soon-inline`** | the pricing **CARDS** — a bordered uppercase pill beside a bullet | hand-written `<span>` |
| `.soon` | the comparison **TABLE** — italic grey text in a cell | `Cell()` at `page.tsx:81`: `if (value === 'coming_soon') return <span className="soon">Coming soon</span>` |

✅ **The new bullet uses `.soon-inline`, the card mechanism, copied as an exact string rather than
approximated.** ⚠️ Using `.soon` would have rendered italic grey text where a bordered pill belongs.

## A3. Loyalty / stamp-card keys — swept

**READ** — a case-insensitive sweep of `app/`, `components/` and `lib/` for `loyalty`, `stamp_card`,
`stamp card` and `stamp`, with `timestamp`-family matches excluded. **Every genuine hit:**

```
lib/plan-features.ts:171   // LOYALTY STAMP CARDS — Max only, coming soon
lib/plan-features.ts:172   // Schema: loyalty_cards(id, truck_id, customer_email, customer_phone, stamps_earned, stamps_redeemed, created_at, last_stamp_at)
lib/plan-features.ts:173   // Stamp rule V1: 1 per order (not per item — avoids redemption complexity)
lib/plan-features.ts:174   // Redemption: operator-side trigger on Add Order + customer-side prompt on online checkout
lib/plan-features.ts:175   // Stickiness note: once stamps are earned, operator churn drops to near zero
lib/plan-features.ts:176   // Walk-up flow: phone number lookup in Add Order panel → auto-increment
lib/plan-features.ts:177   // Online flow: email match on order submit → auto-increment
lib/plan-features.ts:178   // Do NOT build flexible stamp criteria until V1 is live and operators request it
lib/plan-features.ts:179   { name: 'Digital loyalty stamp cards', detail: '…', starter: false, pro: false, max: 'coming_soon' },
lib/plan-features.ts:257   // (Multi-user access, schedule generator, loyalty, event pricing) are marketing-only and skipped.
```

🔴 **`lib/features.ts` — NOT FOUND. There is no `loyalty_*` or `stamp_*` member of the `Feature`
union, and there is deliberately none.** **READ**, `plan-features.ts:257`, which names loyalty
explicitly as one of the rows with no gate: *"rows without a mapping (Multi-user access, schedule
generator, loyalty, event pricing) are marketing-only and skipped."*

### ✅ Do the manual and the code AGREE? YES, on all four points

**READ** — manual §4, four independent statements:

```
2314:  - **Loyalty stamp cards** added to pricing matrix as Max coming-soon. V1 spec frozen in code comments — do not build until instructed.
2640:  - **Max (£49/mo)** — … digital loyalty stamp cards (coming soon).
2778:  | **Digital loyalty stamp cards** | — | — | Coming soon |
2891:  ## Loyalty stamp cards (Max, coming soon) — V4
```

| Claim | Manual | Code | Agree? |
|---|---|---|---|
| Max only | §4:2640, :2891 | `starter: false, pro: false` | ✅ |
| Coming soon | §4:2314, :2778 | `max: 'coming_soon'` | ✅ |
| In the pricing matrix | §4:2314 *"added to pricing matrix"* | `FEATURE_SECTIONS` row `:179` | ✅ |
| V1 spec frozen in code comments | §4:2893 names `lib/plan-features.ts` | the eight comment lines `:171-178` | ✅ |

✅ **The manual's own matrix at :2778 renders `— | — | Coming soon`, which is exactly what `Cell()`
produces from `false / false / 'coming_soon'`. Nothing drifted.**

## A4. Does the comparison table have a loyalty row?

🔴 **YES. FOUND — and this is the finding that shrinks Part C.** **READ**, `lib/plan-features.ts:179`,
the last row of the last section:

```ts
      { name: 'Digital loyalty stamp cards', detail: 'Reward repeat customers with digital stamp cards — collected and redeemed automatically.', starter: false, pro: false, max: 'coming_soon' },
```

**READ** — its placement is deliberate, under a comment that groups it with its siblings:

```ts
      // Coming soon (kept at the bottom of the section)
      { name: 'Customer-facing display',   detail: '…', starter: false, pro: false, max: 'coming_soon'  },
      { name: 'Event & festival pricing', detail: '…', starter: false, pro: false, max: 'coming_soon'  },
```

## A5. ⚠️ The Starter card was NOT missed — it is changed and undeployed

**READ, the working tree, `app/landing/page.tsx:318`:**

```tsx
                <li>iPhone, iPad and Android kitchen app</li>
```

**READ, `git show HEAD:app/landing/page.tsx`, the committed version of the same block:**

```tsx
                <li>Sold-out toggle &amp; stock countdown</li>
                <li>QR code &amp; discovery map listing</li>
                <li>iPad and Android kitchen app</li>
```

✅ **STATED PLAINLY: the card was NOT missed. The change is present in the working tree and has simply
not been committed or deployed** — along with the matching `FEATURE_SECTIONS` row, footnote 3 and the
`ROW_FEATURE_MAP` key from the same task. 🔴 **Not fixed here, as instructed.** ⚠️ **It does mean the
deployed page currently shows the old wording, and will keep doing so until that work ships.**

---

# PART B — THE BULLET

## B1 / B2. Added, using A2's mechanism, immediately after the festival-pricing row

**READ, after** — `app/landing/page.tsx:348-356`:

```tsx
              <ul>
                <li className="lead">Everything in Pro, plus</li>
                <li>Multi-device kitchen sync</li>
                <li>Multi-staff logins</li>
                <li>Kitchen ticket printing</li>
                <li>Event &amp; festival pricing <span className="soon-inline">Coming soon</span></li>
                <li>Digital loyalty stamp cards <span className="soon-inline">Coming soon</span></li>
              </ul>
```

✅ **Placed after "Event & festival pricing", so the two coming-soon items sit together at the bottom
of the card** — which also mirrors `FEATURE_SECTIONS`, where the comment `// Coming soon (kept at the
bottom of the section)` puts the same two rows adjacent in the same order.

## B3. Character-consistency with the row above it

**The two lines, aligned for comparison:**

```
                <li>Event &amp; festival pricing <span className="soon-inline">Coming soon</span></li>
                <li>Digital loyalty stamp cards <span className="soon-inline">Coming soon</span></li>
```

| Property | Row above | New row |
|---|---|---|
| Indentation | 16 spaces | ✅ 16 spaces |
| Tag structure | `<li>` text ` ` `<span>` `</li>` | ✅ identical |
| Badge class | `soon-inline` | ✅ `soon-inline` |
| Badge text | `Coming soon` | ✅ `Coming soon` |
| Entities | `&amp;` for the ampersand | ✅ **none needed** — the label has no `&` |
| Non-ASCII | none | ✅ **none** |

✅ **The label is taken verbatim from the table row's `name` — `Digital loyalty stamp cards` — so the
card and the table use the same words**, which is the one thing that let the Starter bullet drift last
time.

## B4. ✅ Nothing else changed

**READ** — the diff hunk for this task is one line, no deletion:

```diff
                 <li>Event &amp; festival pricing <span className="soon-inline">Coming soon</span></li>
+                <li>Digital loyalty stamp cards <span className="soon-inline">Coming soon</span></li>
               </ul>
```

**No other bullet, card or tier is in it.** Starter, Pro and the trial band are untouched by this task.

---

# PART C — THE COMPARISON TABLE

## C1. 🔴 It does NOT need a row — because it already has one

**The instruction's premise is that the table has none. It has one** (A4). **Stated plainly: no table
change is needed, and none was made.**

✅ **This is the better outcome, and specifically because of what C1 warns about: `FEATURE_SECTIONS` is
DRY and lands on the landing page, manage → billing AND admin at once.** A row added here would have
been three surfaces in one edit. **Zero surfaces moved.**

## C2. What the row shows per tier, and whether it agrees

**READ, the row as it stands:**

```ts
{ name: 'Digital loyalty stamp cards', detail: 'Reward repeat customers with digital stamp cards — collected and redeemed automatically.', starter: false, pro: false, max: 'coming_soon' },
```

| Tier | Stored value | Rendered by `Cell()` |
|---|---|---|
| Starter | `false` | `—` |
| Pro | `false` | `—` |
| **Max** | **`'coming_soon'`** | **`Coming soon`** (`page.tsx:81`) |
| Trial | via `trialFeatureValue` → `row.max` | `Coming soon` |

✅ **THE CARD AND THE TABLE AGREE, EXACTLY.** The Max card bullet says *Coming soon*; the Max column of
the table says *Coming soon*; both are on the same page. **The disagreement this codebase keeps
producing does not exist here** — and it does not exist because the table row was already correct, not
because anything was reconciled.

⚠️ **One cosmetic difference that is NOT a disagreement, recorded so it is not mistaken for one:** the
card renders a bordered uppercase pill (`.soon-inline`) and the table renders italic grey text
(`.soon`). **Same claim, two house treatments, by design** (A2).

## C3. What adding a table row WOULD have involved — reported, not done

Had the row been absent, the change would have touched:

**1. The row itself** in `FEATURE_SECTIONS`, landing on three renderers at once:

```
LANDING   app/landing/page.tsx:395 / :410   {row.name}…   and :425  {FOOTNOTES.map(f => (
BILLING   app/manage/[token]/page.tsx:10346 / :10395       and :10427
ADMIN     app/admin/page.tsx:789 / :809                    and :832
```

**2. The four string-keyed maps** that key on the row NAME:

| Map | File | Would need the new name? |
|---|---|---|
| `ROW_FEATURE_MAP` | `lib/plan-features.ts:248` | ⚠️ **No — deliberately.** `:257` records loyalty as *"marketing-only"*, i.e. no `Feature` key |
| `DETAIL_OVERRIDES` | `app/landing/page.tsx:73` | no — one key, `'Offline Order Protection'` |
| `trialFeatureValue` | `app/landing/page.tsx:50-51` | no — two comparisons, neither loyalty |
| `row.name ===` at render | `admin:813`, `billing:10402` | no — both `'Online ordering — Pay at Hatch'` |

**3. 🔴 And the guard would NOT have protected the rename.** **READ** — `lib/plan-features.ts:284`:

```ts
      const feature = ROW_FEATURE_MAP[row.name]
      if (!feature) continue
```

**A row with no map entry is skipped, so `findPlanParityViolations()` reports CLEAN.** ⚠️ **This was
proven by counterfactual in `docs/device-naming-report.md` C3**, which reverted only the map key in a
scratch copy and re-ran the real module: **0 violations**. ✅ **For a loyalty row it would report clean
for a second, legitimate reason too — the guard only inspects cells that are hard `true`, and
`'coming_soon'` is not one** (`plan-features.ts:164-166` states exactly that).

**Nothing above was done. It is recorded so the next person does not re-derive it.**

---

# PART D — GUIDELINE 2.1

## D1. ✅ The badge is descriptive text, never a control

**READ** — the markup is a `<span>` with no `onClick`, no `href`, no `role`, no `tabIndex`:

```tsx
<span className="soon-inline">Coming soon</span>
```

**READ** — a sweep for any interactive attribute on either badge class across `app/` and `components/`
returns **nothing**:

```
$ grep -rn "soon-inline" --include="*.tsx" app components | grep -iE "onclick|href|button|role="
(no output)
```

**READ** — the CSS is presentation only. No `cursor: pointer`, no `:hover`, no `:active`:

```css
.hg-landing .soon-inline { display: inline-block; font-size: .68rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-faint); border: 1px solid var(--line); border-radius: 4px; padding: .05rem .3rem; margin-left: .2rem; white-space: nowrap; vertical-align: 1px; }
```

✅ **Against the adopted rule — *"coming soon" against a FACT about a plan is fine; against a CONTROL
that cannot be operated is a defect"* — this is squarely the permitted side.** It sits inside a `<li>`
in a feature list, describing what the Max plan will include. **The only tappable thing in the card is
`<DemoCta className="btn btn-ghost">Try Free</DemoCta>`, which is unchanged and fully operable.**

✅ **The same holds for the table's `.soon`** — `Cell()` returns a bare `<span>`, and a cell in a
comparison table is a fact by construction.

## D2. ✅ `/landing` is not reachable inside the native shell

**READ** — `app/landing/layout.tsx:1-16`:

```ts
// redirected (server-side, before any HTML ships) to the public home `/` — which is NOT gated (see proxy.ts
// isPublic), so there is no redirect loop. Runs in the layout so app/landing/page.tsx content is untouched.
…
// Uses the app's canonical admin check (operators.is_admin) via lib/auth/admin — the same gate the admin
import { redirect } from 'next/navigation'
import { verifyAdmin } from '@/lib/auth/admin'
…
  if (process.env.NODE_ENV === 'production' && !(await verifyAdmin())) {
    redirect('/')
```

✅ **In production, a non-admin request to `/landing` is redirected server-side to `/` before any HTML
ships.** ⚠️ **INFERRED, and it is the part that matters for 2.1:** the shell's `server.url` is
`https://www.hatchgrab.com/app`, and the only account that holds `operators.is_admin` is
`dbonini82@gmail.com` (§37), so **no operator inside the native app can reach this page** — and an App
Review reviewer certainly cannot. **The badge is therefore not even present in the app's reachable
surface**, quite apart from being non-interactive.

⚠️ **The redirect is gated on `NODE_ENV === 'production'`, so `/landing` is open in development.** That
is the existing, deliberate behaviour and is not changed here.

---

# PART E — BOUNDARIES

## E1. `git diff --stat`

```
 app/landing/page.tsx | 6 +++++-
 1 file changed, 5 insertions(+), 1 deletion(-)
```

⚠️ **THAT DIFFSTAT IS CUMULATIVE AGAINST `HEAD`, NOT THIS TASK.** Four of the five insertions and the
one deletion are the **previous** task's uncommitted iPhone change in the same file. **READ** — every
added line in that file, with this task's contribution marked:

```diff
+                {/* ⚠️ HAND-WRITTEN, NOT RENDERED FROM FEATURE_SECTIONS. This bullet is a literal twin of the      <- previous task
+                    matrix row in lib/plan-features.ts and nothing checks the two against each other, so it       <- previous task
+                    must be changed in the SAME commit or the same page shows two different claims. */}           <- previous task
+                <li>iPhone, iPad and Android kitchen app</li>                                                     <- previous task
+                <li>Digital loyalty stamp cards <span className="soon-inline">Coming soon</span></li>             <- THIS TASK
```

🔴 **THIS TASK ADDED EXACTLY ONE LINE AND DELETED NONE.**

✅ **Boundary greps on the file's diff — every one zero except two comment matches from the previous
task:**

```
  plan-features          1   <- the previous task's comment text "lib/plan-features.ts"
  features.ts            1   <- the same comment line
  supabase/migrations    0
  ipad_kds               0
  capacitor              0
  package.json           0
  coming_soon            0   <- the table's stored value was never touched
```

✅ **No gate, no feature key, no migration, no type and no native config changed.**

## E2. What a visitor to the pricing page sees differently

**One new bullet, and nothing else.** The Max card gains a sixth `<li>` reading **"Digital loyalty
stamp cards"** with a bordered uppercase **COMING SOON** pill, directly beneath *"Event & festival
pricing"*, which carries the identical pill. ✅ **The comparison table lower down is unchanged and
already showed `— | — | Coming soon` for the same feature**, so a visitor scanning both now finds them
saying the same thing — which was already true of the table and is now also true of the card. ⚠️ The
card grows by one line, which on a three-across grid makes the Max column one row taller than Pro; **the
cards are `flex` with `margin-top: auto` on the button** (`landing.css:250`), so the CTAs stay aligned.

## E3. ✅ manage → billing and admin are unchanged

**READ** — both render from `lib/plan-features.ts`, which **this task did not touch**:

```
$ git diff -- lib/plan-features.ts | grep -ci "loyalty\|stamp"
0
```

⚠️ **`lib/plan-features.ts` DOES appear as modified in `git status` — that is the PREVIOUS task's
iPhone work**, and its diff contains not one loyalty or stamp character. ✅ **`app/admin/page.tsx`
returns nothing from `git status --porcelain` at all — completely untouched.**

**INFERRED, and it follows structurally rather than by inspection: because the table row already
existed and was not edited, billing and admin render today exactly what they rendered yesterday.**

---

# PART F — INTEGRITY

## F1. Non-ASCII census BEFORE

```
app/landing/page.tsx   19 classes   35,192 bytes
    U+2500:93 U+2014:56 U+2019:22 U+2192:12 U+26A0:12 U+FE0F:12 U+00A3:11 U+1F534:6 U+00D7:6
    U+201C:3 U+2713:2 U+2248:2 U+201D:2 U+2605:2 U+2728:2 U+2265:1 U+2026:1 U+00B7:1 U+00A9:1
```

⚠️ **This file carries U+2019 ×22 and U+201C/U+201D — typographic quotes are its house style**, so a
hand-typed curly apostrophe in a copy edit here is invisible in review. **The label chosen has no
apostrophe.**

## F2. Census AFTER — identical, and stronger than "no class gained"

| File | Classes | Gained | Lost | Any count changed? |
|---|---|---|---|---|
| `app/landing/page.tsx` | **19 → 19** | **none** | **none** | 🔴 **NONE — not one codepoint count moved** |

```
classes 19 -> 19 | GAINED=none | LOST=none
count changes: NONE
bytes: 35,192 -> 35,294  (+102, the new line)
```

✅ **THE NEW LINE IS PURE ASCII.** Every previous task in this series had to explain which counts rose
and why; here there is nothing to explain, because the added 102 bytes contain no character above
U+007F. ✅ **No typographic apostrophe, no en dash, no em dash, no curly quote** — the label is
`Digital loyalty stamp cards`, the badge is `Coming soon`, and the markup is `<li>`, `<span>` and a
class name.

## F3. 🔴 Carrier-aware variation-selector check

**`app/landing/page.tsx`:**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 | 0 | — | absent |
| U+1F534 LARGE RED CIRCLE | 11 | 0 | 11 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 0 | 0 | 0 |
| U+26A0 WARNING SIGN | **12** | **12** | **0** |

**Sum of per-base paired = 12 = total U+FE0F = 12.** ✅ **Balances exactly.**

✅ **AND THE DELTA AGAINST THE FILE'S OWN HISTORY IS ZERO** — measured against `git show HEAD:`:

```
  bare warning signs: HEAD=0 -> now=0 (delta +0)
```

⚠️ **U+1F534 and U+2500 take no selector** — reporting them as unpaired would be the false positive
this method exists to prevent.

## F4. Byte scan

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). **Never
grep.**

```
  app/landing/page.tsx                 35294 bytes offending=0 CR=0
  lib/plan-features.ts                 24100 bytes offending=0 CR=0   (read, not edited)
  app/landing/landing.css              31072 bytes offending=0 CR=0   (read, not edited)
```

✅ **Zero offending bytes, zero CR.**

## F5. Byte scan of this report

Separate pass, run after writing: **25,211 bytes, offending = 0** — no NUL, no control byte below
0x09, no CRLF, no lone CR. Its own carrier-aware check:

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 37 | 0 | 37 |
| U+1F534 LARGE RED CIRCLE | 11 | 0 | 11 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 0 | 0 | 0 |
| U+26A0 WARNING SIGN | 15 | 15 | **0** |

**Every warning sign is paired; ZERO are bare.** **Sum of per-base paired = the total U+FE0F count** - no orphan, no double-count.

## F6. `git status` and `git diff --stat`

```
M app/api/orders/submit/route.ts
 M app/api/webhooks/instagram/route.ts
 M app/api/webhooks/messenger/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/landing/page.tsx
 M app/manage/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/native/OperatorDeviceConfig.tsx
 M docs/device-naming-report.md
 M docs/reference-manual.md
 M lib/plan-features.ts
?? components/shared/EventCancelModal.tsx
?? docs/android-audit-report.md
?? docs/android-back-handler-report.md
?? docs/android-parity-report.md
?? docs/event-cancel-holds-report.md
?? docs/event-cancel-refunds-report.md
?? docs/fcm-sender-report.md
?? docs/loyalty-pricing-report.md
?? docs/overlay-audit-report.md
?? docs/overlay-fixes-report.md
?? docs/whatsapp-onboarding-report.md
?? docs/whatsapp-routing-report.md
?? docs/whatsapp-signature-report.md
?? lib/fcm.ts
?? lib/meta/
?? lib/native/backHandler.ts
?? supabase/migrations/20260816_trucks_phone_number_id.sql
```

```
app/api/orders/submit/route.ts             |  66 ++-
 app/api/webhooks/instagram/route.ts        |  48 +-
 app/api/webhooks/messenger/route.ts        |  48 +-
 app/api/webhooks/meta/whatsapp/route.ts    | 173 ++++++-
 app/dashboard/[token]/kds/page.tsx         |  70 ++-
 app/dashboard/[token]/page.tsx             | 117 ++++-
 app/landing/page.tsx                       |   6 +-
 app/manage/[token]/page.tsx                |  75 +--
 components/dashboard/AddOrderPanel.tsx     |  22 +
 components/native/OperatorDeviceConfig.tsx |  13 +-
 docs/device-naming-report.md               | 765 ++++++++++++++++-------------
 docs/reference-manual.md                   | 519 ++++++++++++++++++-
 lib/plan-features.ts                       |  16 +-
 13 files changed, 1473 insertions(+), 465 deletions(-)
```

🔴 **THIS TASK'S ENTRIES ARE TWO:** the single added `<li>` inside `app/landing/page.tsx`, and
`docs/loyalty-pricing-report.md` (new, untracked).

**Everything else is prior turns' work, uncommitted as instructed and untouched here** — including the
rest of `app/landing/page.tsx`'s diff (E1), `lib/plan-features.ts`,
`components/native/OperatorDeviceConfig.tsx`, `app/api/orders/submit/route.ts`, the three Meta webhook
routes, the two dashboard pages, `app/manage/[token]/page.tsx`,
`components/dashboard/AddOrderPanel.tsx`, `docs/reference-manual.md`, and the untracked `lib/fcm.ts`,
`lib/meta/`, `lib/native/backHandler.ts`, `components/shared/EventCancelModal.tsx`, the `20260816`
migration and the ten other reports.
