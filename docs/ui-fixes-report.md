# READ-ONLY AUDIT — where can legal links live so every role reaches them the same way?

**Date:** 10 August 2026
**Nothing was changed.** No file was edited; this is an audit of the code as it stands.

**Answer up front:** there **is** one surface all three roles reach, and it is **the profile dropdown on the dashboard**. It was the right answer, and the evidence is below. The one honest caveat is the KDS, which renders no dropdown at all — a staff member mid-shift reaches it in **one extra tap**, via a back-link that already exists for exactly that reason.

---

## 1. THE ROLE MAP

**The roles** — [app/manage/[token]/page.tsx:69](../app/manage/[token]/page.tsx#L69):

```ts
type UserRole = 'owner' | 'manager' | 'staff'
```

### Manage — staff are ejected from the route entirely

[app/manage/[token]/page.tsx:423-426](../app/manage/[token]/page.tsx#L423-L426):

```tsx
// Staff have no business on the manage page — send them to the dashboard
useEffect(() => {
  if (userRole === 'staff') router.replace(`/dashboard/${token}`)
}, [userRole, token, router])
```

This is a **redirect, not a hidden tab** — a staff user cannot reach *any* part of Manage, including Settings.

### Manage — every tab is owner/manager at best

[app/manage/[token]/page.tsx:490-503](../app/manage/[token]/page.tsx#L490-L503):

```tsx
const allTabs: { id: Tab; label: string; icon: string; roles: UserRole[] }[] = [
  { id: 'menu',      …, roles: ['owner', 'manager'] },
  { id: 'schedule',  …, roles: ['owner', 'manager'] },
  { id: 'deals',     …, roles: ['owner', 'manager'] },
  { id: 'modifiers', …, roles: ['owner', 'manager'] },
  { id: 'reports',   …, roles: ['owner', 'manager'] },
  { id: 'team',      …, roles: ['owner', 'manager'] },
  { id: 'settings',  …, roles: ['owner', 'manager'] },
  { id: 'billing',   …, roles: ['owner'] },
]
const tabs = allTabs.filter(t => {
  if (t.id === 'billing') return userRole === 'owner' && truck?.plan !== 'tester'
  return t.roles.includes(userRole)
})
```

**`staff` appears in no `roles` array anywhere in that list.** So the current Legal card, which sits in the Settings tab, is owner/manager only — and unreachable for staff twice over (redirect *and* tab filter).

### Dashboard — no role gate at all

`grep` for a redirect in [app/dashboard/[token]/page.tsx](../app/dashboard/[token]/page.tsx) returns only a `history.replaceState` URL rewrite (:868-873) and the KDS push (:1111). **There is no role redirect and no role block.** The only role expression in the entire file is one prop:

[app/dashboard/[token]/page.tsx:2507](../app/dashboard/[token]/page.tsx#L2507):
```tsx
showManageLink={!isDemo&&(userRole==='owner'||userRole==='manager')}
```

Its tabs are ungated too — [:91](../app/dashboard/[token]/page.tsx#L91) `const TAB_VALUES = ['orders','add','stock','settings'] as const`, resolved at [:268](../app/dashboard/[token]/page.tsx#L268) with no role test, and the Settings panel renders at [:3164](../app/dashboard/[token]/page.tsx#L3164) on `activeTab==='settings'` alone.

### KDS — no role gate, and an unconditional way back

[app/dashboard/[token]/kds/page.tsx:1002-1011](../app/dashboard/[token]/kds/page.tsx#L1002-L1011) — and the comment is the single most useful sentence in this audit:

```tsx
{/* Back to the orders dashboard — staff are auto-routed to KDS on login and otherwise have no
    way back to place orders. Unconditional (all roles): /dashboard/[token] has no staff block,
    so this can't loop. Label collapses to just ← on narrow widths to avoid crowding. */}
<AppLink href={`/dashboard/${token}`} …>
```

**The codebase already establishes, in its own words, that staff live on the KDS and that the dashboard is unconditionally reachable from it.**

### Admin — orthogonal, not a fourth role

[app/admin/page.tsx:3](../app/admin/page.tsx#L3): *"Protected by Supabase session: `operators.is_admin = true` required"*. Not one of the three roles.

### Summary

| Surface | owner | manager | staff | Gate |
|---|---|---|---|---|
| `/dashboard/[token]` | ✅ | ✅ | ✅ | none |
| `/dashboard/[token]/kds` | ✅ | ✅ | ✅ | none |
| `/manage/[token]` | ✅ | ✅ | 🔴 **redirected out** | page.tsx:425 |
| Manage → Settings | ✅ | ✅ | 🔴 **no** | tabs array :497 |
| Manage → Billing | ✅ | ❌ | ❌ | :498 + :501 |
| `/admin` | `is_admin` only | | | admin/page.tsx:3 |

---

## 2. THE COMMON SURFACES — exhaustive

**Exactly two surfaces are reachable by all three roles:**

1. **`/dashboard/[token]` — the operator dashboard** (orders, + Add order, stock, settings tabs)
2. **`/dashboard/[token]/kds` — the KDS / order screen**

Nothing else. Manage is owner/manager; Billing is owner; admin is `is_admin`. **A single consistent location must live on one of those two, or on chrome common to both.**

---

## 3. THE PROFILE DROPDOWN

**Component:** [components/dashboard/UserMenu.tsx](../components/dashboard/UserMenu.tsx)

**Render sites — exactly three**, repo-wide (`grep -rn "<UserMenu"`):

| Surface | Line |
|---|---|
| Dashboard | [app/dashboard/[token]/page.tsx:2500](../app/dashboard/[token]/page.tsx#L2500) |
| Manage | [app/manage/[token]/page.tsx:530](../app/manage/[token]/page.tsx#L530) |
| Admin | [app/admin/page.tsx:655](../app/admin/page.tsx#L655) |

### ✅ CONFIRMED — the KDS does NOT render UserMenu

It never appears in that file. What the KDS has instead is a **"This device" sheet** — [kds/page.tsx:1115-1125](../app/dashboard/[token]/kds/page.tsx#L1115-L1125) and [:1518-1530](../app/dashboard/[token]/kds/page.tsx#L1518-L1530) — which is **native-only and demo-gated** (`isNativeApp() && !isDemo`) and carries device config, not account items or links.

### Which roles see the dropdown

**On the dashboard: all three.** The only wrapper is a demo/breakpoint concern, not a role one — [app/dashboard/[token]/page.tsx:2499](../app/dashboard/[token]/page.tsx#L2499):

```tsx
<span className={isDemo ? 'sm:hidden' : undefined}>
```

Individual *items* are gated (`showManageLink`, `isAdmin`, `showSignOut`); **the menu itself is not.** So a staff user on the dashboard sees the avatar and can open it.

### 🔴 A staff member who lives on the KDS

**They cannot reach the dropdown without leaving the KDS** — there is none to reach. **But leaving is one tap**, on the unconditional `← Dashboard` link at [kds/page.tsx:1005-1011](../app/dashboard/[token]/kds/page.tsx#L1005-L1011), which exists precisely because staff default to that screen. So the true cost for a staff member mid-shift is **one extra tap, on a control already in the KDS header**, not a dead end.

---

## 4. WHAT THE DROPDOWN CONTAINS NOW, AND WHETHER LEGAL CAN SIT APART

**Structure, top to bottom** ([UserMenu.tsx:111-257](../components/dashboard/UserMenu.tsx#L111-L257)):

| # | Item | Line | Gate | Type scale |
|---|---|---|---|---|
| 1 | Identity block (name + email) | :116-122 | `showIdentity` | `text-sm` / `text-xs text-slate-400`, wrapper `border-b border-slate-100` |
| 2 | Screen on / off | :128-138 | `showScreenToggle`, `sm:hidden` | `text-sm text-slate-700`, `border-b` |
| 3 | Sound on / off | :140-148 | `showScreenToggle && onToggleSound` | `text-sm text-slate-700` |
| 4 | Order link · QR · Kitchen | :150-180 | `showOrderUtilities` | `text-sm text-slate-700` |
| 5 | Van chooser | :187 | self-guards on native | — |
| 6 | **This device** | :189-199 | **native only, NOT role-gated** | `text-sm text-slate-700` |
| 7 | Manage | :202-210 | `showManageLink` | `text-sm text-slate-700` |
| 8 | Dashboard | :213-220 | `showDashboardLink`, `sm:hidden` | `text-sm text-slate-700` |
| 9 | Admin | :222-229 | `isAdmin` | `text-sm text-slate-700` |
| 10 | *(where the legal links were)* | :231 | — | — |
| 11 | `<hr>` + **Sign out** | :249-257 | `showSignOut` | `text-sm text-red-600` |

### 🔴 YES — and the component already did exactly that

**The removed links were never peers of Manage and Sign out.** Recovered from `git show HEAD:components/dashboard/UserMenu.tsx`:

```tsx
<hr className="border-slate-100" />
<Link href={PRIVACY_PATH} … className="flex items-center gap-2 px-4 py-2.5 text-xs text-slate-500 hover:bg-slate-50">
```

- **Below a divider** — `<hr className="border-slate-100" />`, the same separator the component uses before Sign out.
- **Smaller** — `text-xs` against the actions' `text-sm`.
- **Quieter** — `text-slate-500` against the actions' `text-slate-700`.

**The component supports two separation mechanisms already in use:** `<hr className="border-slate-100" />` (:251) and `border-b border-slate-100` on a wrapper (:116, :131). Nothing new would need building.

**And there is a direct precedent for an unconditional item aimed at exactly this user** — [UserMenu.tsx:189-191](../components/dashboard/UserMenu.tsx#L189-L191):

> *"This device (native app only) — per-device/user config, **NOT role-gated** and NOT sm:hidden **so a staff member who can't reach Manage can still configure their own device on the iPad.**"*

That is the same argument, already accepted in this component, for a different item.

---

## 5. THE ALTERNATIVES, AND WHAT EACH COSTS VISUALLY

Taking as given that **an order screen cannot carry a footer**:

| Option | Surface | Visual cost | Footer objection? |
|---|---|---|---|
| **A. Profile dropdown** (restore, quiet, below a divider) | Dashboard | **Zero on the screen itself.** Two `text-xs` rows inside a menu that is closed by default, below a divider, beneath Sign out's neighbours | ✅ **Avoided entirely** — nothing renders on the order screen |
| **B. Legal card on the dashboard's Settings tab** | Dashboard → Settings | One more card at the foot of a tab that is already a scrolling list of cards | ✅ Avoided — Settings is not the order screen |
| **C. Link in the KDS header** | KDS | 🔴 A legal link in the **order screen's own chrome**, beside Payments / This device / Extra wait | ❌ **This is the objection** |
| **D. Footer on dashboard or KDS** | Both | A persistent band under a live order board | ❌ **Explicitly ruled out** |
| **E. Status quo — Manage → Settings only** | Manage | None | ✅ but 🔴 **staff cannot reach it at all** (§1) |

**A and B both avoid the footer problem.** C and D do not.

**A vs B.** B is reachable by all three roles today — the dashboard's Settings tab has no role gate — so it is a genuine second answer. But it is a **different location from where an operator last saw these links**, it puts a legal card among operational settings (sounds, notifications, payment controls), and it takes **three taps** (tab bar → Settings → scroll). **A is one tap from anywhere on the dashboard, is where the links already lived, and needs no new markup** — the exact classes are recoverable from git.

---

## 6. RECOMMENDATION

### 🔴 Restore the two links to the profile dropdown (`UserMenu`), as a quiet block below a divider.

**It is the only single location that every role reaches by the same route**, and the operator's original objection is answerable without moving them anywhere else: **they were never styled as peers of Manage and Sign out** — they were `text-xs text-slate-500` below an `<hr>`, and they can be restored exactly like that.

**The route for each role:**

| Role | Route |
|---|---|
| **owner** | any dashboard tab → avatar → *Privacy policy* / *Terms* — **1 tap** |
| **manager** | identical — **1 tap** |
| **staff** | identical **when on the dashboard — 1 tap**. From the KDS: `← Dashboard` ([kds:1005](../app/dashboard/[token]/kds/page.tsx#L1005)) then avatar — **2 taps** |

**What it costs:**

1. **It puts something back in the menu you asked to clear** — but two `text-xs` rows in a divider-separated block, not two more action items. The menu's action list is unchanged.
2. 🔴 **It does not render on the KDS.** No option does, short of putting a legal link on the order screen. A staff member mid-shift takes one extra tap on a control that is already there for them.
3. **Manage → Settings' Legal card becomes redundant** and can be removed or kept. **Keeping it costs nothing and buys redundancy** — owners and managers would then have two routes, which is what the placement list originally valued.

### Is there a single surface that serves all three *including the KDS*? **No.**

The KDS renders no account chrome for web users at all (its only sheet is `isNativeApp() && !isDemo`), so the only way to put a link on the KDS is to put it in the order screen's header — which is the thing you ruled out.

**The minimum set that covers every role on every surface, if the KDS must be included:** UserMenu (dashboard, manage, admin) **+** one link in the KDS header. **I do not recommend the second**, because 5.1.1(i) asks for reachable *within the app*, and one tap from the KDS to a surface that carries it satisfies that.

---

## ⚠️ Is `lib/legal.ts`'s comment accurate today?

**Now yes — because I corrected it in the previous task. Before that, no.** Both errors are worth recording:

| Claim | Status |
|---|---|
| *"UserMenu is the only chrome present on every operator surface in the native shell (**dashboard, KDS**, manage, admin)"* — the pre-10-August text | 🔴 **WAS WRONG about the KDS.** UserMenu has only ever rendered on three surfaces. The KDS never carried these links. **This overstatement is what made the move look cheaper than it was**, because it implied the KDS was already covered. |
| Item 4 now reads *"Manage → Settings … currently the app's ONLY in-app route"* | ✅ **Accurate as of now** — and 🔴 **it does not yet record that staff cannot reach it.** If the links stay where they are, that sentence needs the role qualification adding. |
| Items 1, 2, 3, 5 (landing footer, signup, demo modal, legal-page cross-links) | ✅ **All verified present**: `app/landing/page.tsx` (3 refs), `app/signup/page.tsx` (3), `components/DemoGetStarted.tsx` (4), `app/(legal)/layout.tsx` (3) |
| `components/dashboard/UserMenu.tsx` | **0 refs** — correctly reflects the move |

⚠️ **The file calls itself *"the specification; the code is downstream of it"*, so if the links return to UserMenu, that list must be updated in the same change** — and this time the KDS should be named as **not** covered, so the next reader does not inherit the same overstatement.

---

**Nothing was changed. This is an audit only.**
