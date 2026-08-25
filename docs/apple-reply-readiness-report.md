# Apple reply readiness — READ-ONLY DIAGNOSTIC

**Date:** 25 August 2026
**Nothing was changed.** No file edited, no migration, no SQL, no `next dev`. Nothing belonging to
pizzeria-gusto or tikka-tonic was touched or read for state.

**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

🔴 **EVERY FINDING BELOW IS READ-FROM-SOURCE AND UNOBSERVED.** Not one behaviour here was executed.
Where I cite a comment I say so and treat it as a claim, not as evidence.

---

# HEADLINE — THREE THINGS THAT AFFECT THE RECORDING

1. 🔴 **THE DELETE ACCOUNT CONTROL RENDERS ON WEB AND MAY BE ABSENT IN THE NATIVE SHELL.** The section
   self-suppresses when its own API call fails, and that call is **cookie-authenticated only** while the
   native app authenticates by Bearer. **§1.4 — this is the single most important item here.**
2. 🔴 **THE BILLING TAB IS SHOWN FOR THIS ACCOUNT AND RENDERS AN EMPTY CONTAINER.** `plan = 'demo'`
   matches none of its three branches and there is no fallback. **§2.**
3. 🔴 **A PUSH PERMISSION PROMPT CAN FIRE WITHOUT AN EXPLICIT USER ACTION**, on mount of the device
   config component. **§4.4 — it will appear in the recording.**

---

# §1 — FINDING 1: DOES THE DELETE ACCOUNT CONTROL RENDER FOR THIS ACCOUNT?

## 1.1 THE EXACT OWNERSHIP EXPRESSION

✅ **`app/api/manage/route.ts`, line 61:**

```ts
const isOperator = !!(sessionOperator && truck.operator_id && sessionOperator.id === truck.operator_id)
```

`sessionOperator` is resolved immediately above it:

```ts
const { data: { user } } = await supabaseAuth.auth.getUser()
const { data: sessionOperator } = await supabase
  .from('operators').select('id').eq('auth_user_id', user.id).maybeSingle()
```

## 1.2 WHAT IT RESOLVES THROUGH — 🔴 A COMBINATION, AND `truck_users` IS THE FALLBACK, NOT THE SOURCE

**Ownership is decided by the `operators` row (matched on `auth_user_id`) compared against
`trucks.operator_id`.** `truck_users.role` is consulted **only when that comparison fails**:

```ts
let userRole: 'owner' | 'manager' | 'staff' = 'owner'      // line 44 — INITIALISED to owner
...
if (!isOperator) {                                          // line 62
  const { data: truckUser } = await supabase
    .from('truck_users').select('role')
    .eq('auth_user_id', user.id).eq('truck_id', truck.id).single()
  if (truckUser?.role) userRole = truckUser.role
}
```

The route's own comment states the intent: *"Operator identity takes priority — if the calling user owns
this truck, they are always 'owner' regardless of any truck_users crew entry."*

## 1.3 THE OUTCOME FOR tester@hatchgrab.com — ✅ **IT RENDERS. NOT DISABLED, NOT ABSENT.**

Given `trucks.operator_id = 1e4308fc-…` populated and the operator row matching:

```
  isOperator = true  →  the truck_users branch is NEVER ENTERED
                     →  userRole stays at its initialised value 'owner'
```

🔴 **ZERO `truck_users` ROWS CANNOT PRODUCE A WRONG ANSWER HERE, BY TWO INDEPENDENT PATHS.** The
branch is skipped entirely; and even if it were entered, `.single()` on zero rows yields no data,
`truckUser?.role` is undefined, and `userRole` stays `'owner'`.

**The render gate** — `app/manage/[token]/page.tsx` line 10644:

```tsx
{userRole === 'owner' && <DeleteAccountSection truckName={truck?.name ?? ''} showToast={showToast} />}
```

**The client also defaults to owner twice over:** `useState<UserRole>('owner')` (line 194) and
`setUserRole(data.userRole || 'owner')` (line 301).

✅ **VERDICT: the control RENDERS for this account on the web.** The tab it lives in (Settings) is
owner+manager, and this narrows to owner.

## 1.4 🔴 THE TWO HANDLERS — NEITHER 403s ON THE MERITS, BUT ONE MAY 403 IN THE APP

Both handlers live in `app/api/account/request-deletion/route.ts` and share **one** resolver:

```ts
async function resolveOperator() {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!authUserId) return null
  const { data } = await supabase.from('operators')
    .select('id, email, name, deletion_requested_at, deletion_due_at')
    .eq('auth_user_id', authUserId).maybeSingle()
  return data ? { ...data, authUserId } : null
}
```

- **GET** — `if (!operator) return … { status: 403 }`. tester@hatchgrab.com **has** an operators row, so
  **200** with the summary. ✅ **Neither handler consults `truck_users` at all**, so zero rows is
  irrelevant to both.
- **POST** — same resolution; then `if (typeof body.confirm !== 'string' || body.confirm.trim().toUpperCase() !== 'DELETE')` → 400.
  ✅ **The component always sends `body: JSON.stringify({ confirm: 'DELETE' })`**, so that gate cannot
  fail from the UI. The typed-name gate is a **separate, client-only** check —
  `canConfirm = typed.trim() === confirmTarget.trim()`, where `confirmTarget` is the single truck's name
  from the API, falling back to the page's `truckName`. **The two gates do not conflict.**

### 🔴 THE RISK YOU ACTUALLY HAVE, AND IT IS A RECORDING RISK

```tsx
// DeleteAccountSection.tsx
fetch('/api/account/request-deletion')        // ← no Authorization header
  .catch(() => setLoadFailed(true))
...
if (loadFailed || !summary) return null        // ← renders NOTHING
```

🔴 **`createSupabaseServerClient()` IS COOKIE-ONLY.** Read in full: it builds a `createServerClient`
over `cookies()` from `next/headers` and has **no Bearer path whatsoever**. Meanwhile the Manage page's
own `api()` helper (line 503) authenticates on the **`dashboard_token` in the body**, not on a session —
which is why the rest of the page works in the app.

**So in the native shell:** the parent gate passes (`userRole` falls back to `'owner'` when `getUser()`
returns null), and then the child's own GET has no credential, 403s, sets `loadFailed`, and
**`return null` removes the entire Danger Zone.**

⚠️ **THE ONE THING I CANNOT SETTLE FROM SOURCE: whether the WKWebView carries the Supabase cookie.**
`proxy.ts` carries a comment asserting that native navigation requests carry *"no cookie AND no
Authorization header"* — **that is a comment, and you told me not to treat one as evidence.** If it is
accurate, the control is absent on device.

🔴 **THIS IS FILMABLE-OR-NOT AND IT IS THE WHOLE GUIDELINE 5.1.1(v) ANSWER. Open Manage → Settings on
the physical device and scroll to the bottom before you plan the recording.** If the Danger Zone is not
there, no reply to App Store Connect fixes it — it needs a code change and therefore a new build.

---

# §2 — FINDING 2: WHAT THE BILLING TAB RENDERS FOR plan = 'demo'

## 2.1 THE TAB IS SHOWN

`app/manage/[token]/page.tsx` line 543:

```ts
if (t.id === 'billing') return userRole === 'owner' && truck?.plan !== 'tester'
```

`'demo' !== 'tester'` and `userRole === 'owner'` → ✅ **the Billing tab is visible for this account.**

## 2.2 EVERY PLAN VALUE IT BRANCHES ON

✅ **Four, and only four:** `'trial'`, `'starter'`, `'pro'`, `'max'`.

## 2.3 🔴 THERE IS NO FALLBACK OR DEFAULT BRANCH

`BillingTab` (line 10666) has exactly **four top-level children** inside its wrapper:

```tsx
return (
  <div className="flex flex-col gap-6">
    {/* TRIAL: payment capture is urgent — show ABOVE the matrix */}
    {plan === 'trial' && ( … )}                          // L10903
    {/* STARTER: upgrade prompt + payment ready below */}
    {plan === 'starter' && ( … )}                        // L11033
    {/* PRO / MAX: already paying — minimal friction */}
    {(plan === 'pro' || plan === 'max') && ( … )}        // L11078
    {showUpgradeModal && purchaseCtaAllowed() && ( … )}   // L11113
  </div>
)
```

**No `else`, no ternary tail, no `default`.** The only other early return is `if (!truck) return null`
(L10676), which does not apply — the truck exists.

## 2.4 🔴 WHAT A 'demo' VIEWER SEES: **AN EMPTY CONTAINER**

All three plan conditions are false. `showUpgradeModal` initialises false. 🔴 **The tab renders
`<div className="flex flex-col gap-6">` with no children — a blank panel under a visible "Billing"
tab.** Not a partial tab. Not an error. Blank.

⚠️ **On iOS the modal is doubly suppressed** — `purchaseCtaAllowed()` is false there — but that is moot,
since `showUpgradeModal` is false anyway and nothing renders a control to set it.

⚠️ **Reported only. No branch was added.**

---

# §3 — FINDING 3: THE COMMERCE GATES, RE-COUNTED

## 3.1 EVERY OCCURRENCE, CLASSIFIED — 18 TOTAL

| Class | Count | Where |
|---|---|---|
| **Definition** | 1 | `lib/commerce-policy.ts:39` — `export function purchaseCtaAllowed(): boolean` |
| **Imports** | 2 | `app/manage/[token]/page.tsx:16`, `components/FeatureGate.tsx:4` |
| **Comments** | 4 | manage page L738 (inside a JSX block comment), plus `components/shared/BrandHomeLink.tsx:14`, `components/shared/AppHeader.tsx:84`, and the manage page's L9283 — the last three all the same warning: *"isNativeApp, NOT purchaseCtaAllowed. That is the 3.1.1 COMMERCE predicate"* |
| **CALL SITES** | **11** | below |

⚠️ **A naive grep returns 12 call sites.** Manage-page **L738 is prose inside `{/* … */}`** — the
comment that explains the guard on L743. **Counting it is the exact trap this repo has hit before**, so
every count here was taken with JSX comments blanked first.

## 3.2 ✅ **ELEVEN. THE RECORDED COUNT STILL HOLDS — TEN + ONE.**

Anchored on the enclosing component, not on line numbers:

| # | File | Enclosing | Anchor expression |
|---|---|---|---|
| 1 | manage page | `ManagePage` | `if (truck?.plan === 'trial' && purchaseCtaAllowed()) setActiveTab('billing')` |
| 2 | manage page | `ManagePage` | `if (!purchaseCtaAllowed()) return` (trial-reminder trigger effect) |
| 3 | manage page | `ManagePage` | `{showTrialReminder && truck && purchaseCtaAllowed() && (` |
| 4 | manage page | `SettingsTab` | `{purchaseCtaAllowed() && (` |
| 5 | manage page | `BillingTab` | `? (purchaseCtaAllowed()` |
| 6 | manage page | `BillingTab` | `{purchaseCtaAllowed() && (` |
| 7 | manage page | `BillingTab` | `{truck.trial_expires_at && purchaseCtaAllowed() && (` |
| 8 | manage page | `BillingTab` | `{purchaseCtaAllowed() && (` |
| 9 | manage page | `BillingTab` | `{purchaseCtaAllowed() && (` — near the string `Current plan` |
| 10 | manage page | `BillingTab` | `{showUpgradeModal && purchaseCtaAllowed() && (` |
| 11 | `components/FeatureGate.tsx` | `FeatureGate` | `{purchaseCtaAllowed() && (` |

✅ **NOTHING WAS ADDED AND NOTHING WAS LOST.** Ten in `app/manage/[token]/page.tsx`, one in
`components/FeatureGate.tsx`, exactly as recorded.

## 3.3 ✅ THE PRICING REFACTOR DID NOT DROP A GATE

You asked me to look specifically. **`BillingTab` still carries six of the eleven** (#5–#10) — the
highest concentration in the file, and the component the pricing refactor touched most. The refactor
changed where *price strings* come from (`PLAN_META` / `PLAN_PRICES`, now derived from
`PLAN_MONTHLY_PENCE`); **it did not touch the surrounding `purchaseCtaAllowed()` conditions.**

## 3.4 ✅ THE LOADING EARLY-RETURN HOLDS

```
  const [loading, setLoading] = useState(true)        ← initial value TRUE
  if (loading) return ( …spinner… )                   ← line 514
  first RENDER-SITE gate                              ← line 743
```

✅ **514 < 743 — the early return precedes every piece of gated markup**, so no upgrade control can
paint for a frame before the plan is known. ⚠️ Gates #1 and #2 sit **inside effects**, not markup, so
they are not subject to this property and do not need to be.

⚠️ **Unobserved.** This is a source ordering argument, not a rendering observation.

---

# §4 — FINDING 4: PERMISSION PROMPTS THE BINARY CAN RAISE

## 4.1 EVERY USAGE-DESCRIPTION KEY IN `ios/App/App/Info.plist` — ✅ **EXACTLY TWO, QUOTED VERBATIM**

```
NSFaceIDUsageDescription
   "Unlock HatchGrab with Face ID."

NSBluetoothAlwaysUsageDescription
   "HatchGrab uses Bluetooth to connect to your kitchen receipt printer so order tickets can be
    printed automatically. It is not used for anything else."
```

**The complete key list**, for completeness: `CAPACITOR_DEBUG, CFBundleDevelopmentRegion,
CFBundleDisplayName, CFBundleExecutable, CFBundleIdentifier, CFBundleInfoDictionaryVersion,
CFBundleName, CFBundlePackageType, CFBundleShortVersionString, CFBundleVersion,
ITSAppUsesNonExemptEncryption, NSFaceIDUsageDescription, NSBluetoothAlwaysUsageDescription,
LSRequiresIPhoneOS, UILaunchStoryboardName, UIMainStoryboardFile, UIRequiredDeviceCapabilities,
UISupportedInterfaceOrientations, UISupportedInterfaceOrientations~ipad,
UIViewControllerBasedStatusBarAppearance`.

## 4.2 THE CODE PATH BEHIND EACH

**`NSFaceIDUsageDescription`** — reached. `lib/native/appLock.ts:79` calls
`BiometricAuth.authenticate({…})` from `@aparajita/capacitor-biometric-auth`, driven by
`components/native/AppLockGate.tsx`.
✅ **BUT THE GATE IS OFF BY DEFAULT:**

```ts
export function isAppLockEnabled(): boolean {
  return localStorage.getItem(APP_LOCK_KEY) === 'on'   // default OFF
}
```

and `AppLockGate` computes `const enabled = isNativeApp() && isAppLockEnabled()`.
🔴 **So no Face ID prompt appears unless App Lock has been switched on for that device.** On a clean
install for the recording, it will not fire.

**`NSBluetoothAlwaysUsageDescription`** — reached. `lib/printing/bleTransport.ts:122`
`BleClient.initialize({ androidNeverForLocation: true })` and `scan()`, called from
`components/printing/PrintingSettings.tsx:122` (`await t.scan()`) and `app/dashboard/[token]/kds`'s own
`scan()`. ✅ **Behind an explicit user action** — opening printing settings and pressing scan.
⚠️ **The web transport is a null object** (`lib/printing/transport.ts:102 — `async scan() { return [] }`),
so the prompt is native-only.
⚠️ **This truck CAN reach it.** `ticket_printing` is a Max feature and `plan = 'demo'` resolves to
`TRIAL_FEATURES`, which is the full Max set. **"Max-only, so the demo cannot see it" is false here.**

## 4.3 🔴 A CAPABILITY WITH NO USAGE DESCRIPTION: **PUSH NOTIFICATIONS**

`aps-environment` is declared in **both** `App.entitlements` and `AppRelease.entitlements`. There is no
`NS…UsageDescription` for push — **iOS does not define one**, so this is not a 5.1.1 defect; it is
listed because you asked for capabilities requested without a purpose string, and this is the one.

✅ **`UIBackgroundModes` IS ABSENT** from the plist. No `remote-notification` background mode is
declared.

## 4.4 🔴 WHEN PUSH REGISTRATION FIRES — **ON MOUNT, NOT BEHIND AN EXPLICIT ACTION**

`lib/native/push.ts` exports `registerForPush`, which runs:

```ts
const perm = await PushNotifications.requestPermissions()    // ← the system prompt
await PushNotifications.register()
```

Its **only** importer is `components/native/OperatorDeviceConfig.tsx`, which calls it from three places:

```
  L92   useEffect(() => { void runSetup() }, [runSetup])        ← ON MOUNT
  L67   if (device && device.van_id) { void registerForPush(…) }  ← inside runSetup
  L73   if (saved) void registerForPush(…)
  L101  if (saved) { void registerForPush(…) }                   ← after saving a van
```

🔴 **So the prompt is raised on mount of the device-config component whenever the device is already
bound to a van — not on an explicit user action.** L73/L101 additionally fire straight after van setup.

🔴 **PLAN FOR A PUSH PROMPT APPEARING EARLY IN THE RECORDING.** It is the only prompt likely to appear
on a clean run; Face ID will not (4.2) and Bluetooth will not unless you open printing settings.

## 4.5 IS ANY PURPOSE STRING TOO THIN FOR 5.1.1?

⚠️ **`NSFaceIDUsageDescription` = "Unlock HatchGrab with Face ID." is the thin one.** It states the
mechanism and the action but gives **no reason** — it does not say what is being protected or why. The
Bluetooth string, by contrast, names the device, the purpose and an explicit negative scope, and is
comfortably above the bar. ⚠️ **Whether the Face ID string is *too* thin is a judgement, not a fact I
can read out of the repo** — but it is the one I would strengthen before a resubmission, and it is a
plist change, therefore a new build.

---

# §5 — FINDING 5: THE KDS ON THIS TRUCK

**Configuration given:** `kds_mode = false`, `crew_mode = 'solo'`, `display_mode = 'list'`, one active
van with a `kds_token`.

## 5.1 TWO SURFACES EXIST, AND ONLY ONE STAYS INSIDE THE SHELL

| Surface | Route | Auth |
|---|---|---|
| **In-app KDS** | `/dashboard/[token]/kds` | the `dashboard_token` |
| **Standalone van KDS** | `/kds/[kds_token]` | the `kds_token` (`app/kds/[kds_token]/page.tsx:19`) |

`app/dashboard/[token]/page.tsx`'s `openKDS()` branches, and its own comment states the rule:

> *"NATIVE: soft-route to the in-app KDS (/dashboard/[token]/kds — dashboard_token based, authenticates
> natively; van preserved via query) so it stays in the webview — window.open('_blank') escapes to
> Safari / no-ops in WKWebView. WEB: unchanged — new tab (van's standalone /kds/[kds_token], …)"*

✅ **ANSWER: yes, the operator can reach the KDS without leaving the native shell** — the native branch
soft-routes to the in-app KDS. ⚠️ **That is read from the branch and from its comment; I have not run
it**, and the comment is a claim, not evidence.

## 5.2 WHAT THIS CONFIGURATION RENDERS

```ts
const kdsMode = truck?.kds_mode ?? false          // → false
const displayMode = truck?.display_mode ?? 'list' // → 'list'
const isDemo = isDemoIdentifier(token)
const activeLayout = layoutOverride ?? (isDemo ? 'grid' : displayMode)
```

✅ **`kds_mode = false`** means the order cards render in their ordinary (non-KDS) presentation — it is
passed down as `kdsMode={truck?.kds_mode ?? false}` to every `OrderCard` on the dashboard.
✅ **`display_mode = 'list'`** → `activeLayout = 'list'` **unless** `isDemo` is true.
✅ **`crew_mode = 'solo'`** is surfaced by `/api/dashboard` (`crew_mode: truck.crew_mode ?? 'solo'`) and
is the default, so no crew-specific behaviour is engaged.
✅ **The cook/making screen is no longer gated on `can('cook_screen')`** — the file states at L1618:
*"`can('cook_screen')` NO LONGER GATES ANYTHING HERE"*, de-coupled at Stage 1.

## 5.3 🔴 ONE THING I CANNOT SETTLE, AND IT CHANGES WHAT YOU FILM

```ts
export function isDemoIdentifier(identifier?: string | null): boolean {
  return typeof identifier === 'string' && identifier.startsWith(DEMO_PREFIX)   // 'demo-'
}
```

`isDemo` is computed from **the `dashboard_token`**, which you have not given me and which I will not
query. 🔴 **The truck ID `test-truck-3-2` does not start with `demo-`, but the ID is not what is
tested here.**

- **If the token starts with `demo-`** → `activeLayout = 'grid'`, and the truck also gets the demo
  restart/return surfaces and the `proxy.ts` session-gate waiver.
- **If it does not** → `activeLayout = 'list'` as configured, and `/dashboard/[token]/kds` is
  **session-protected** by `proxy.ts` like any operator route.

⚠️ **Check the token's prefix before recording.** The two cases look different on screen.

---

# §6 — FINDING 6: DEMO/TEST EXCLUSION FROM FEE AND REVENUE CALCULATIONS

## 6.1 THE HELPER AND ITS PREDICATE, QUOTED EXACTLY

`lib/demo.ts`:

```ts
export const DEMO_PREFIX = 'demo-'

export function isDemoIdentifier(identifier?: string | null): boolean {
  return typeof identifier === 'string' && identifier.startsWith(DEMO_PREFIX)
}
```

✅ **It is scoped on a `demo-` STRING PREFIX** over an id, slug or dashboard_token — **not** on the
plan value, **not** on the `excluded` column, and **not** on anything else. The module's own header
lists the four things callers pass it: the dashboard_token in `proxy.ts`, the token route param, the
slug route param, and `truck.id`.

⚠️ **It has no notion of "test" at all.** There is no `test-` arm and no second predicate beside it.

## 6.2 🔴 IS `test-truck-3-2` INSIDE OR OUTSIDE? — **OUTSIDE.**

`'test-truck-3-2'.startsWith('demo-')` is **false**. 🔴 **The truck is OUTSIDE the exclusion on every
call site that passes its id.** Whether it is outside on token-based call sites depends on the token
(§5.3), which I have not read.

## 6.3 🔴 THE PREMISE NEEDS CORRECTING: THERE IS NO FEE OR REVENUE CALCULATION TO EXCLUDE IT FROM

You asked me to find *"the shared helper that excludes demo and test trucks from fee, threshold and
revenue calculations"*. 🔴 **`isDemoIdentifier` is not that helper, because no such calculation
exists in this build.**

A repo-wide search for consumers of `CARD_FEES`, `PLATFORM_FEE_OVER_ALLOWANCE` and
`PLAN_ONLINE_ALLOWANCE` returns **display surfaces only**:

```
  app/landing/cost/CostComparison.tsx    the cost-comparison calculator
  app/landing/page.tsx                   marketing copy
  components/manage/PaymentsTab.tsx      the rate labels
  lib/features.ts / lib/plan-features.ts the definitions themselves
```

🔴 **`lib/payments/` reads none of them.** `lib/payments/online.ts:18` states it in the code:
*"This build charges NO platform fee — but every row it writes carries the channel and the …"*, and
`lib/payments/ledger.ts:693` refers to the 0.99%/allowance figures as something §37 *depends on*, not
something it computes.

**So there is no fee, threshold or revenue computation from which any truck is being included or
excluded.** The correctness question you were reaching for **cannot be wrong yet** — but it is
pre-loaded to be wrong the moment billing is wired, because the only exclusion predicate available
keys on a `demo-` prefix that this truck does not carry.

## 6.4 EVERY CALL SITE OF THE HELPER, AND WHAT IT ACTUALLY GUARDS

| File | Line | What it gates |
|---|---|---|
| `lib/demo-restart.ts` | 64 | refuses restart for a non-demo truck |
| `lib/demo-session.ts` | 70 | refuses session extension for a non-demo truck |
| `lib/email.ts` | 600 | suppresses email for a demo truck |
| `lib/payments/promote-draft.ts` | 434 | `const isDemoTruck = …` → **suppresses the customer confirmation email**, `if (!isDemoTruck && draft.customer_email)` |
| `app/dashboard/[token]/kds/page.tsx` | 69, 76 | demo layout default + demo-only behaviour |
| `app/api/demo/restart/route.ts` | 38, 52 | demo lifecycle |
| `app/api/demo/return/route.ts` | 35, 41 | demo lifecycle |
| `app/api/demo/save-email/route.ts` | 47 | demo lifecycle |

🔴 **NOTE THE ONE INSIDE `lib/payments/`.** It is in the payments module and it looks like a money
guard; **it is an email guard.** It gates the confirmation email, nothing financial.

**Calculations that do NOT apply it:** all of them, because none exists (6.3). ⚠️ **Reported only, as
you asked. Not part of the App Store work.**

---

# §7 — WHAT I DID NOT DO, AND WHAT REMAINS UNOBSERVED

✅ **No file was changed.** No migration, no SQL, no `next dev`, nothing touching pizzeria-gusto or
tikka-tonic.

🔴 **NOT ONE BEHAVIOUR IN THIS REPORT HAS BEEN EXECUTED.** Everything is read from source. Specifically
unobserved and worth settling on the device before you record:

1. 🔴 **Whether the Danger Zone renders in the native app** (§1.4) — the one finding that could force a
   new build rather than a reply.
2. 🔴 **Whether the Billing tab is visibly blank** (§2.4) — read from the branch structure, never seen.
3. 🔴 **Whether the push prompt fires, and when** (§4.4).
4. 🔴 **The `dashboard_token`'s prefix** (§5.3, §6.2) — it decides the KDS layout and the session gate,
   and I did not query it.
5. ⚠️ **Whether the WKWebView carries a Supabase cookie.** The `proxy.ts` comment says it does not; I
   have treated that as a claim, not as evidence, per your instruction.
6. ⚠️ **Whether the Face ID purpose string survives review** (§4.5) — a judgement, not a repo fact.
