# Why trial features show as locked, and what the locked state costs

**Date:** 5 August 2026. **Read-only.** Nothing changed, no SQL run, no migration.
No garbled spans.

---

## L1. 🔴 WHY THEY ARE LOCKED — **A STALE BUILD. THE CODE IS CORRECT.**

**The deployed build does not contain this session's `canAccess` change.** Everything else in the chain
checks out; the gates are right, the arguments are right, the columns are there, and the feature keys
are in the trial set. Preview is simply running the old function.

### (e) The answer, stated plainly

**A stale build.** Not a gate branching on the plan value, not a missing column, not a wrong feature key.

```
$ git status --porcelain lib/features.ts
 M lib/features.ts                    ← MODIFIED, UNCOMMITTED

$ git log --oneline -1
888fc8a onboarding fixes              ← what preview is built from
```

And the committed version — the one actually running:

```ts
// git show HEAD:lib/features.ts
if (plan === 'trial') {
  if (!trialExpiresAt) return false        // ← village-spice hits this
  if (new Date(trialExpiresAt) <= new Date()) return false
  return PLAN_FEATURES.trial.has(feature)
}
```

`village-spice` is `plan = 'trial'` with `trial_expires_at = NULL`, so the deployed code returns
**`false` for every feature**. That is the exact state the manual (V11 §27) records: *an expired trial —
or one with a NULL expiry — has LESS access than Starter.* The Y2 change was written to fix precisely
this and has not been deployed.

> 🔴 **THE SYMPTOM IS BROADER THAN REPORTED.** WhatsApp and branded QR are the two gates that render a
> visible lock, so they are what got noticed. On the deployed build **every** gated feature is off for
> that truck: pre-ordering (the whole Pre-orders card is hidden, not locked), advanced reporting (Reports
> silently falls back to event-mode), ticket printing (`PrintingSettings` returns `null`), and the KDS
> cook screen. Most of them fail **invisibly** — which is why only two were reported.

⚠️ Related, and worth knowing: `lib/provision-truck.ts` is **also uncommitted**, so the deployed
provisioning still writes `plan: 'demo'`. `village-spice` is therefore on `'trial'` because it was
changed **by hand**, not by the deployed code. That is consistent with what Dominic is seeing — and it
means the truck is currently in the one state the deployed build handles worst.

### (a) The two gates

| Setting | Line | Expression |
|---|---|---|
| WhatsApp auto-replies | [app/manage/[token]/page.tsx:8527](app/manage/[token]/page.tsx#L8527) | `{can('whatsapp_replies') ? ( …input… ) : ( …disabled input + <FeatureGate feature="whatsapp_replies" …/> )}` |
| Branded QR code | [app/manage/[token]/page.tsx:8768](app/manage/[token]/page.tsx#L8768) | `{can('branded_qr_code') ? ( …selectable option… ) : ( …opacity-50 div + <FeatureGate feature="branded_qr_code" …/> )}` |

### (b) ✅ Both call `canAccess`. Neither compares a plan literal.

[app/manage/[token]/page.tsx:8145](app/manage/[token]/page.tsx#L8145):

```ts
const can = (feature: Feature) => canAccess(
  truck.plan,
  feature,
  truck.feature_overrides ?? {},
  truck.trial_expires_at ?? null
)
```

**All four arguments, correctly sourced.** This is not the BillingTab fault
(`docs/billing-tab-report.md`), where the render branched on `plan === 'trial' | 'starter' | 'pro' |
'max'` string literals and `'demo'` matched none. Nothing in Settings does that.

### (c) ✅ The truck object carries all three columns

`/api/manage`'s `getTruck` is `.from('trucks').select('*')`
([app/api/manage/route.ts:24-31](app/api/manage/route.ts#L24-L31)) and the GET returns
`{ ...truck, logo }` ([:167](app/api/manage/route.ts#L167)) — **the whole row, not a hand-picked
subset**. So `plan`, `feature_overrides` and `trial_expires_at` all reach `SettingsTab` populated.

The hypothesis in L1(c) — a projection omitting one of them, making `canAccess` evaluate against
`undefined` — **does not apply here.** (It would be a live risk on the dashboard, which *does* use a
named-column projection; `/api/dashboard/route.ts:583` explicitly includes `trial_expires_at`.)

### (d) What `canAccess` returns — deployed vs. this session's code

Feature keys, exactly as they appear in `lib/features.ts`: **`'whatsapp_replies'`** (line 29 of the
`Feature` union, line 50 of `PRO_FEATURES`) and **`'branded_qr_code'`** (line 23, line 48).

Both are in `PRO_FEATURES`; `MAX_FEATURES = [...PRO_FEATURES, …]`; `TRIAL_FEATURES = [...MAX_FEATURES]`;
`PLAN_FEATURES.trial = new Set(TRIAL_FEATURES)`. **So both are members of the trial set.**

| `plan = 'trial'`, `trial_expires_at = null` | Deployed (`HEAD`) | This session's code |
|---|---|---|
| `canAccess(…, 'whatsapp_replies', {}, null)` | **`false`** — hits `if (!trialExpiresAt) return false` | **`true`** — NULL means not-started, grants the trial set |
| `canAccess(…, 'branded_qr_code', {}, null)` | **`false`** — same line | **`true`** |

**Deploying the uncommitted change resolves the report as observed.** No further fix is needed for L1.

---

## L2. THE FULL INVENTORY OF GATED CONTROLS

Every place the operator UI restricts something by plan. **Nine gates across five surfaces** — and only
two of them render the lock UI Dominic described.

| # | Surface | file:line | Feature key | Gate expression | What it renders when locked |
|---|---|---|---|---|---|
| 1 | Settings → Auto-replies | [page.tsx:8527](app/manage/[token]/page.tsx#L8527) | `whatsapp_replies` | `can('whatsapp_replies') ? … : …` | **disabled input** + `<FeatureGate>` panel |
| 2 | Settings → QR code style | [page.tsx:8768](app/manage/[token]/page.tsx#L8768) | `branded_qr_code` | `can('branded_qr_code') ? … : …` | **`opacity-50 cursor-not-allowed` row** + `<FeatureGate>` panel |
| 3 | Settings → Pre-orders card | [page.tsx:8006](app/manage/[token]/page.tsx#L8006) | `advance_preordering` | `{preorderCan && (…)}` | 🔴 **NOTHING — the entire card is hidden.** No lock, no explanation, no upgrade route |
| 4 | Menu tab → per-item pre-order toggle | [page.tsx:1715](app/manage/[token]/page.tsx#L1715) | `advance_preordering` | `{preorderCan && (…)}` | 🔴 **NOTHING — hidden** |
| 5 | Settings → QR default (setup only) | [page.tsx:7996](app/manage/[token]/page.tsx#L7996) | `branded_qr_code` | `canBrand && …` in a `useState` initialiser | nothing — only suppresses a *default*, no UI |
| 6 | Reports tab | [page.tsx:10101](app/manage/[token]/page.tsx#L10101) | `advanced_reporting` | `hasAdvanced ? 'date' : 'event'` | 🔴 **NOTHING — silently starts in event mode.** The operator is never told a mode exists |
| 7 | Dashboard → Printing settings | [PrintingSettings.tsx:53](components/printing/PrintingSettings.tsx#L53) | `ticket_printing` | `if (!canPrint) return null` | 🔴 **NOTHING — the whole card returns `null`** |
| 8 | KDS → cook screen | [kds/page.tsx:741](app/dashboard/[token]/kds/page.tsx#L741), [:879](app/dashboard/[token]/kds/page.tsx#L879) | `cook_screen` | `can('cook_screen') ? … :`, `{can('cook_screen') && (…)}` | 🔴 **NOTHING — the view and its toggle are absent** |
| 9 | Settings → extra vans | [page.tsx](app/manage/[token]/page.tsx) `showVanUpgradeModal` | *(van count, not a `Feature`)* | van-limit check | a **modal**, "Upgrade to add more vans" |

**Schedule, Deals, Extras & Upsells and Team have NO plan gates at all** — consistent with the manual's
record that `meal_deals` and `upsells` are declared in `lib/features.ts` and enforced nowhere.

> 🔴 **The answer to "how many surfaces would a UI change touch": two render a lock today, five render
> nothing at all.** A consistent locked treatment is therefore not a restyling job — it is a decision to
> **start showing five features that are currently invisible**. That is a product change, not a CSS one,
> and it is the larger half of the work.

---

## L3. WHAT THE LOCKED STATE RENDERS TODAY

### (c) ✅ ONE shared component — `components/FeatureGate.tsx`

Not hand-rolled. **Two call sites**, both in Settings ([:8552](app/manage/[token]/page.tsx#L8552),
[:8797](app/manage/[token]/page.tsx#L8797)). A change to the panel itself is **one edit**.

⚠️ But the *surrounding* treatment is hand-rolled at each site: the WhatsApp gate renders a `disabled`
input beside the panel, the QR gate renders an `opacity-50 cursor-not-allowed` div. Those two are
separate copies of "show the control, dead".

### (a) Where each line comes from

```jsx
<div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-4">
  <div>
    <div className="text-sm font-medium text-slate-700">
      {upgradeMessage ?? `This feature requires the ${meta.name} plan`}
    </div>
    <div className="text-xs text-slate-400 mt-0.5">
      {meta.name} · {maskPrice(meta.price)} · {meta.description}
    </div>
  </div>
  <a href="/pricing" className="text-xs font-medium text-teal-600 …">Upgrade →</a>
</div>
```

| Line as observed | Source |
|---|---|
| "This feature requires the Pro plan" | **literal template** in `FeatureGate`, with `meta.name` from `PLAN_META[requiredPlan(feature)]`. `requiredPlan` ([lib/features.ts:161](lib/features.ts#L161)) returns the first tier whose set contains the feature |
| "Pro · TBC · Busy trucks scaling pre-orders" | **all three from `PLAN_META.pro`** — `.name`, `maskPrice(.price)`, `.description` |
| "Upgrade →" → `/pricing` | **literal**, both the label and the href |

⚠️ Note the observed href was `https://www.hatchgrab.com/pricing`; the code renders a **relative**
`/pricing`, which resolves to the same place on that host.

### (b) 🔴 "TBC" is deliberate, not an unset price

`PLAN_META.pro.price` is a real string. `TBC` is produced by `maskPrice`
([lib/pricing.ts](lib/pricing.ts)):

```ts
export const PRICING_PUBLISHED = process.env.NEXT_PUBLIC_PRICING_PUBLISHED === 'true'
const NON_SECRET_PRICE = new Set(['Free', 'Free trial', 'Lifetime', '0%', 'Pay at Hatch'])
export function maskPrice(val: string): string {
  return (PRICING_PUBLISHED || NON_SECRET_PRICE.has(val)) ? val : 'TBC'
}
```

It is the **pre-launch pricing gate** — *"so test trucks don't see/share real pricing before launch.
Flips on at launch via env, no code change."* So the operator is not seeing a placeholder for missing
data; they are seeing a value deliberately withheld until `NEXT_PUBLIC_PRICING_PUBLISHED=true`.

⚠️ **The consequence is still real**: the panel currently reads *"Pro · TBC"* and sends them to a
`/pricing` page that masks the same numbers. **The upgrade route ends in "TBC" too.** Worth deciding
whether a locked feature should advertise a plan whose price cannot yet be shown.

### (d) Is the control disabled, hidden, or interactive?

| Site | Control |
|---|---|
| WhatsApp | **Visible but `disabled`** — the input renders with `disabled`, `bg-slate-50 text-slate-400 cursor-not-allowed`, and its Save button is replaced by the panel |
| Branded QR | **Visible but inert** — the whole row is a `div` (not a `button`) with `opacity-50 cursor-not-allowed`; the radio dot is a static `span` |
| The other five | **Hidden entirely** — nothing to disable |

---

## L4. WHAT A LIGHTER TREATMENT WOULD TAKE

### (a) ✅ A tooltip component ALREADY EXISTS — `components/ui/Tooltip.tsx`

No library needed. `<Tooltip content="…" position="top|bottom|left|right">{children}</Tooltip>`; with no
children it renders its own small circular **`?`** affordance.

> 🔴 **AND IT IS CURRENTLY DEAD CODE.** It is imported into
> [app/manage/[token]/page.tsx:24](app/manage/[token]/page.tsx#L24) and **never rendered** — eslint
> reports `'Tooltip' is defined but never used` on that line, and it is one of the 293 errors in the
> file's standing baseline. So the pattern exists, is written, and has never been used.

### (b) 🔴 What it does on tap — **it works, with two caveats**

```tsx
onMouseEnter={() => setVisible(true)}
onMouseLeave={() => setVisible(false)}
onTouchStart={() => setVisible(v => !v)}
```

**`onTouchStart` toggles it**, so a tap opens it and a second tap closes it. It was written with touch in
mind. Two things to check before relying on it on an iPad:

1. **There is no dismiss-on-outside-tap and no Escape handler.** Once open, the only way to close it is
   to tap the same trigger again. Every other overlay in this codebase (the walkthrough, the modals)
   closes on outside-tap; this one does not.
2. **`onTouchStart` and `onMouseEnter` both fire on many touch browsers** (a tap synthesises mouse
   events). The `mouseenter` sets `visible = true` and the `touchstart` toggles it — order and
   double-firing are untested here, and could produce a tooltip that opens and immediately closes. **It
   has never been rendered, so this has never been exercised.**

The alternatives already in the codebase, for comparison: a **state-driven inline info panel** with a
"Got it" button (`showAutoPauseInfo`, [page.tsx:9255](app/manage/[token]/page.tsx#L9255)) — unambiguously
tap-safe and already used in Settings; `<details>/<summary>` (three sites) — native, tap-safe, no JS; and
17 native `title=` attributes in the manage page, which **do nothing on touch at all**.

### (c) The smallest change for one consistent locked treatment

**Two edits, in this order — and the second is the larger one.**

**Edit 1 — the treatment (small, one file).** Replace `FeatureGate`'s panel body with a lock glyph
wrapped in the existing `Tooltip`, keeping the same props and the same `canAccess` call so both current
call sites are unchanged:

- content: the same two lines it composes today, from `PLAN_META[requiredPlan(feature)]`;
- one upgrade route, kept as the single `/pricing` link;
- ⚠️ **fix the Tooltip's dismiss behaviour first** (outside-tap + Escape), because two Settings rows are
  a small enough surface to notice a sticky tooltip and a nine-site rollout is not.

That alone changes both existing sites at once, because they share the component.

**Edit 2 — the coverage (the real work).** The five hidden gates (#3, #4, #6, #7, #8) currently render
*nothing*. Making the treatment "consistent" means each of them has to grow a locked state where there
is none — five separate edits in four files, each needing a decision about *what* to show: a disabled
version of the control, or a lock where the control would have been.

> 🔴 **These are not the same size of job, and they should not be scoped as one.** Edit 1 is a
> refactor. Edit 2 changes what five features look like to every operator on Starter — including
> deciding whether an operator should see a feature they cannot use at all. **Reported only; nothing
> built.**

---

## SUMMARY

| Question | Answer |
|---|---|
| Why are WhatsApp and branded QR locked? | **A stale build.** The deployed `canAccess` still returns `false` for a trial with a NULL expiry; this session's fix is uncommitted |
| Do the gates use `canAccess`? | **Yes**, both, with all four arguments correctly sourced. Not the BillingTab plan-literal fault |
| Is a column missing? | **No.** `/api/manage` returns `select('*')` |
| Is it only those two? | **No** — every gated feature is off for that truck; the other five fail invisibly |
| How many gated surfaces? | **Nine.** Two render a lock, five render nothing, one is a modal, one is a silent default |
| Is the lock UI shared? | **Yes** — `FeatureGate`, two call sites. The disabled-control styling around it is not |
| Where does "TBC" come from? | `maskPrice` — the deliberate pre-launch pricing gate, not an unset price |
| Is there a tooltip to reuse? | **Yes, `components/ui/Tooltip.tsx`** — with `onTouchStart` support, currently **imported but never rendered**, and with no outside-tap dismiss |
