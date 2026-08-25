# Upgrade-surface sweep — INWARD, from the markup to the predicate

**Date:** 25 August 2026
**READ-ONLY. Nothing was changed.** No file edited, no `next dev`, no SQL.
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

🔴 **EVERY FINDING IS READ-FROM-SOURCE AND THE BEHAVIOUR IS UNOBSERVED.** Nothing here was executed in
a browser or on a device. **This is a fresh read** — no report was used as a source; where an earlier
one is mentioned it is quoted and treated as a claim.

---

# HEADLINE — 🔴 THE SWEEP FOUND WHAT IT WAS LOOKING FOR

**One purchase-shaped surface has never been wired to the predicate and renders on iOS.**

> **`showVanBillingModal`** — `app/manage/[token]/page.tsx`, inside `SettingsTab`.
> *"Adding an additional truck costs **£29/month** and will be added to your next billing cycle."*
> with a primary button reading **"Add truck — £29/mo"**.
> 🔴 **ZERO `purchaseCtaAllowed()` calls inside it. Reachable on plan `'pro'`.**

It returns no hits in an outward sweep from the predicate **because it was never connected to it** —
exactly the shape this task was built to catch.

---

# §1 — STEP 1 & 2: THE SURFACES, AND THEIR GATE STATUS

## 1.1 🔴 **`showVanBillingModal` — UNGATED. IT RENDERS ON iOS.**

| | |
|---|---|
| **File / anchor** | `app/manage/[token]/page.tsx`, `SettingsTab`, `{showVanBillingModal && (` |
| **Gate** | 🔴 **NONE.** A comment-blanked scan of the whole block returns **0** occurrences of `purchaseCtaAllowed`. |

**Exact user-visible text:**
```
  Add another truck
  Your Pro plan includes 2 trucks. Adding an additional truck costs £29/month and will be
  added to your next billing cycle.
  ⚠️ Note: Billing adjustment is processed manually during early access. You will receive a
  confirmation email within 24 hours.
  [ Cancel ]   [ Add truck — £29/mo ]
```

**Trigger** — `SettingsTab`, in the add-van handler:
```ts
const included   = INCLUDED_VANS[truck.plan] ?? 1        // { starter:1, pro:2, max:999, trial:999 }
const addonPrice = VAN_ADDON_PRICE[truck.plan] ?? 0      // { starter:0, pro:29, max:49, trial:0 }
if (vans.length >= included) {
  if (addonPrice > 0)              setShowVanBillingModal(true)
  else if (truck.plan === 'starter') setShowVanUpgradeModal(true)
  else                              setAddingVan(true)
}
```

**Route/tab:** Manage → Settings, on pressing add-van.

**Which plans render it:**

| plan | `included` | `addonPrice` | reachable? |
|---|---|---|---|
| **`pro`** | 2 | **29** | 🔴 **YES — with 2 or more vans. This is the live exposure.** |
| `max` | 999 | 49 | Technically yes, needs **≥999 vans** — effectively unreachable |
| `starter` | 1 | 0 | No — falls to the *upgrade* modal instead |
| `trial` | 999 | 0 | No — `addonPrice` is 0, falls to `setAddingVan(true)` |
| **`demo` / `tester`** | **1** (via `?? 1`) | **0** (via `?? 0`) | **No** — neither key exists in either map, so it falls to `setAddingVan(true)` |

🔴 **PLAINLY: on an iPad running the native shell, a Pro operator with two vans who taps "add van" is
shown a price and a button that commits them to a monthly charge.** ⚠️ **No payment is taken in-app** —
the button calls `setAddingVan(true)` and the note says billing is handled manually — **but the surface
advertises a price and a billing commitment, which is the thing the predicate exists to suppress.**

⚠️ **`vanPx` IS NOT A GATE.** The price passes through `usePriceMask()`, which masks only when the
truck's `hide_pricing` is set. **It has nothing to do with platform.**

⚠️ **Unobserved.** Read from source; never rendered, never tapped.

## 1.2 `showVanUpgradeModal` — BODY UNGATED, CTA GATED, **UNREACHABLE except plan `'starter'`**

**File/anchor:** same file, `SettingsTab`, `{showVanUpgradeModal && (`.

```
  Upgrade to add more vans
  The Starter plan includes 1 van. Upgrade to Pro or Max to add additional vans.
  [ Cancel ]   [ View plans ]        ← only this is wrapped in purchaseCtaAllowed()
```

- **The heading and sentence are UNGATED** — on iOS they render, leaving a modal that says "Upgrade to
  Pro or Max" with only a Cancel button.
- **`View plans` is GATED** — `{purchaseCtaAllowed() && (` in the same file.
- ✅ **UNREACHABLE on every plan but `'starter'`**, per the branch quoted in 1.1
  (`else if (truck.plan === 'starter')`). **Not a demo/tester/max exposure.**

## 1.3 `FeatureGate` — 🔴 **PANEL UNGATED (renders on iOS), LINK GATED — AND THAT IS DELIBERATE**

**File/anchor:** `components/FeatureGate.tsx`, `export function FeatureGate`.
**Render sites:** exactly one — `app/manage/[token]/page.tsx:9601`, `<FeatureGate`.

```
  This feature requires the Max plan            ← or the `upgradeMessage` prop
  Max · £49/mo · High-volume operations & festivals
                                                [ Upgrade → ]   ← gated
```

**Gate:** `{purchaseCtaAllowed() && (` wrapping the `<a href="?tab=billing">Upgrade →</a>` only.

✅ **The panel body renders on iOS by design**, and the file argues why:

> *"🔴 iOS (App Store 3.1.1/3.1.3): the CTA goes, the EXPLANATION stays. The panel above still names the
> feature and the plan that carries it, which is information about what the plans include and is
> permitted; the link is a call to action pointing at a purchase surface and is not."*

⚠️ **That is a quoted claim, not a verified one.** I record the split; I do not certify the legal reading.

**Renders for:** any plan where `canAccess(...)` is false for the named feature. ✅ **For `demo`,
`tester`, `trial` and `max` it does not render at all** — all four resolve to the full Max feature set,
so `canAccess` returns true and the component returns its children.

## 1.4 THE BILLING-TAB SURFACES — ALL GATED

All in `BillingTab`, `app/manage/[token]/page.tsx`:

| Surface | Text | Gate |
|---|---|---|
| Trial block | *"Choose a plan before your trial ends"*, *"Upgrade to Max — …"* | ✅ `purchaseCtaAllowed()` at four sites inside `billingCard` |
| Starter block | *"Upgrade your plan"* | ✅ `{purchaseCtaAllowed() && (` |
| Upgrade-interest modal | *"Upgrade to …"* | ✅ `{showUpgradeModal && purchaseCtaAllowed() && (` |
| Pro/Max block | *"Current plan / Max / £49/mo per truck · renews automatically"* + `▼ Compare all plans` | ✅ **Status text, not a CTA.** The toggle reveals `matrixContent`, which a scan shows contains **no `<a>`, `<button>` or `href` at all — it is a table.** Its CTAs come from `billingCard`, which is gated. |

## 1.5 THE TRIAL REMINDER POPUP — ✅ **GATED TWICE**

`app/manage/[token]/page.tsx`, `{showTrialReminder && truck && purchaseCtaAllowed() && (`.
Text: *"Choose your plan before then — …"*, *"Upgrade here →"*.
✅ **The trigger effect returns early too** (`if (!purchaseCtaAllowed()) return`), so `showTrialReminder`
can never become true on iOS. **Two independent guards.**
✅ Also gated: the auto-switch `if (truck?.plan === 'trial' && purchaseCtaAllowed()) setActiveTab('billing')`.

## 1.6 NOT SURFACES — CHECKED AND CLEARED

| Candidate | Finding |
|---|---|
| `components/printing/PrintingSettings.tsx` | ✅ **`if (!canPrint) return null`** — renders **nothing** when locked. No nudge, no price, no CTA. |
| `app/dashboard/[token]/kds/page.tsx` | "Unlock" is a **PIN** button; `installAudioUnlock` is audio. No upgrade markup. |
| `DealsModal`, `AddOrderPanel`, `OrderCard` | Zero upgrade-shaped strings. |
| `app/api/manage/route.ts` | *"requires the Pro plan"* is an **API error string**, not markup. Reaches the client only as a rejected action's message. |
| `lib/native/appLock.ts` | *"Unlock HatchGrab"* is the **biometric prompt**. |

---

# §2 — 🔴 THE DASHBOARD PAGE: THE CLAIM IS **CONFIRMED**

> The brief: *"It is an operator-facing settings surface and is recorded as containing zero calls to
> purchaseCtaAllowed. Confirm or refute that."*

✅ **CONFIRMED — `grep -c purchaseCtaAllowed app/dashboard/[token]/page.tsx` returns `0`.**

✅ **AND IT CONTAINS NO UPGRADE-SHAPED SURFACE OF ITS OWN.** The language sweep returned 20 hits in
that file; **every one is a false positive**:

```
  subscribe() / subscribeWakeState      Supabase realtime + the wake-state hook
  installAudioUnlock / primeAudio       the audio unlock, not a plan unlock
  "Unlock"  (L2779)                     the PIN entry button
  canAccess(... 'ticket_printing' ...)  a capability check with no markup attached
```

**Its only plan-aware child is `PrintingSettings`** (`{!isDemo && truck && <PrintingSettings plan=… />}`),
which **returns `null` when the feature is locked** (1.6). ✅ **So zero calls is correct AND harmless
here — there is nothing on this route that needs gating.**

---

# §3 — STEP 3: THE THREE PLAN BRANCHES

## 3.1 IS THE BILLING **TAB** HIDDEN?

```ts
if (t.id === 'billing') return userRole === 'owner' && truck?.plan !== 'tester'
```

| plan | Billing tab |
|---|---|
| **`tester`** | 🔴 **HIDDEN — the only plan the filter excludes by name.** |
| **`max`** | ✅ **SHOWN** |
| **`demo`** | ✅ **SHOWN** |

## 3.2 WHAT `BillingTab` RENDERS

`BillingTab`'s wrapper has **four** top-level children and **no fallback branch**:

```tsx
return (
  <div className="flex flex-col gap-6">
    {plan === 'trial' && ( … )}
    {plan === 'starter' && ( … )}
    {(plan === 'pro' || plan === 'max') && ( … )}
    {showUpgradeModal && purchaseCtaAllowed() && ( … )}
  </div>
)
```

| plan | What renders |
|---|---|
| **`tester`** | ✅ **Nothing — the tab is not reachable** (3.1). Were it reachable, all three branches are false and it would be an empty container. |
| **`max`** | ✅ **The pro/max block:** *"Current plan / Max / £49/mo per truck · renews automatically"*, a `▼ Compare all plans` toggle over a CTA-free table, `footnotesContent`, and `billingCard` — **whose CTAs are gated.** |
| **`demo`** | 🔴 **AN EMPTY CONTAINER.** `'demo'` matches none of the three, and `showUpgradeModal` initialises `false`. A visible "Billing" tab that renders a blank panel. |

🔴 **THE MOVE MATTERS FOR THE OTHER SURFACES TOO.** Moving the demo truck off `'demo'`:
- **→ `tester`**: Billing tab disappears. Van modals still unreachable (`?? 1` / `?? 0`).
- **→ `max`**: Billing tab fills in. **The van billing modal becomes theoretically reachable but needs
  ≥999 vans**, so still effectively not.
- 🔴 **→ `pro` (not asked about, but it is the one to avoid): the ungated van billing modal at §1.1
  becomes reachable with two vans.**

---

# §4 — STEP 4: HYDRATION

## 4.1 EVERY SURFACE IS CLIENT-RENDERED BEHIND A LOADING EARLY-RETURN

✅ **A scan of every file containing upgrade copy found NO server component among them.**

```
  app/manage/[token]/page.tsx    L1  'use client'
  components/FeatureGate.tsx     L1  'use client'
  const [loading, setLoading] = useState(true)      L206   ← initial value TRUE
  if (loading) return ( …spinner… )                 L514
```

✅ **All surfaces in §1 live inside `SettingsTab` or `BillingTab`, both rendered after L514.** The
early return precedes every one of them.

## 4.2 🔴 WHY THAT EARLY RETURN IS LOAD-BEARING RATHER THAN INCIDENTAL

```ts
export function purchaseCtaAllowed(): boolean {
  if (typeof Capacitor === 'undefined') return true      // ← "server render, plain web build"
  if (!Capacitor.isNativePlatform()) return true
  return Capacitor.getPlatform() !== 'ios'
}
```

🔴 **THE PREDICATE FAILS *OPEN* ON THE SERVER — BY DESIGN, AND THE FILE SAYS SO:** *"Every uncertain
path (no Capacitor, web build, server render) falls through to true without being tested for."*

**So during SSR every gated CTA evaluates to `true` and WOULD be in the server HTML.** 🔴 **The only
thing preventing a one-frame flash on iOS is that `loading` starts `true`, so the server renders the
spinner and never reaches the gated markup at all.**

⚠️ **THAT MAKES `useState(true)` A COMPLIANCE PROPERTY, NOT A UX ONE.** Anything that ever renders a
gated CTA **outside** that early return — a new route, a server component, a modal hoisted above it —
would flash the CTA for a frame on iOS regardless of the predicate. ⚠️ **Unobserved: I have not
recorded a frame; this is read from the initial state and the return's position.**

---

# §5 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING IN THIS REPORT WAS RUN.** No device, no browser, no recording.
2. 🔴 **THE §1.1 EXPOSURE HAS NOT BEEN REPRODUCED.** I have not put a Pro truck with two vans in front
   of the add-van button on an iPad. **The branch is unambiguous in source; the rendering is not
   observed.** ⚠️ **It is also the only finding here with a review consequence, so it is the one worth
   reproducing before submission.**
3. ⚠️ **Whether the ungated *explanatory* text in §1.2 and §1.3 is acceptable under 3.1.1 is a legal
   reading, not a repo fact.** The file argues it is; I recorded the argument and did not endorse it.
4. ⚠️ **The sweep is bounded by the terms I searched.** I ran identifiers *and* language — upgrade,
   unlock, plan, plans, subscribe, subscription, trial, "get more", "go pro", "choose a plan", "view
   plans", price strings and `£` followed by a digit — over every `.ts`/`.tsx` outside `node_modules`,
   with JSX comments blanked first so quoted tokens could not inflate a count. **A surface that promotes
   a plan change without using any of those words would not appear here.**
5. ⚠️ **I did not read `.swift`, native storyboards, or any push-notification payload copy.** An
   upgrade prompt delivered as a notification would be outside this sweep.
6. ⚠️ **`billingCard`'s gates were counted by the whole-file comment-blanked scan, not by reading every
   line of it** — the count is 11 across the file, ten in the manage page, and five of those anchor
   inside `billingCard`.
