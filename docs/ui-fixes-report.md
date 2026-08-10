# The legal links are back in the profile dropdown — one location, every role

**Date:** 10 August 2026
**Prompt integrity:** nothing arrived garbled, and **no instruction contradicted another** — nothing to stop and ask about.

**Three files changed:** `components/dashboard/UserMenu.tsx` (restored), `app/manage/[token]/page.tsx` (card removed), `lib/legal.ts` (surface list corrected).

---

## What was done

### 1. Restored to `UserMenu`, exactly as they were

**Recovered verbatim from git**, not retyped. `HEAD` already contained today's removal, so the original came from the commit before it (`32921c6`), and the markup is byte-identical to what that commit held:

```tsx
<hr className="border-slate-100" />
<Link href={PRIVACY_PATH} onClick={() => setOpen(false)}
  className="flex items-center gap-2 px-4 py-2.5 text-xs text-slate-500 hover:bg-slate-50">
  Privacy policy
</Link>
<Link href={TERMS_PATH} onClick={() => setOpen(false)}
  className="flex items-center gap-2 px-4 py-2.5 text-xs text-slate-500 hover:bg-slate-50">
  Terms
</Link>
```

The `lib/legal` import was restored with it. **No inline route strings** anywhere.

**The comment above it was rewritten rather than restored**, because the old one carried the KDS overstatement. It now records why this menu is the only surface every role reaches, that the KDS renders no menu, that the staff route is one extra tap via `← Dashboard`, and that the links are **not** peers of Manage and Sign out.

### 2. Removed from Manage → Settings

The Legal card is gone. In its place is a comment stating why nothing should be added back there — Settings is owner/manager only, so a copy there serves nobody the dropdown does not already serve, and two locations drift. The now-unused `lib/legal` import was removed with it.

### 3. `lib/legal.ts`'s surface list corrected

Item 4 is `Operator account menu — components/dashboard/UserMenu.tsx` again, and the entry now carries:

- 🔴 **the three real render sites, named**, with the grep that produces them;
- ⚠️ **an explicit retraction** of the "dashboard, KDS, manage, admin" claim, and *why the overstatement mattered*: *"it made moving the links out of this menu look cheap, because the KDS appeared to be covered either way. It never was."*;
- 🔴 **the role argument** — `staff` are redirected out of Manage and appear in no tab's `roles` array, so the dashboard menu is the only place all three roles meet;
- 🔴 **the KDS carries no link, deliberately**, and a staff member reaches these via the header's unconditional `← Dashboard`;
- ⚠️ the same-day move to Settings and why it must not be repeated;
- ⚠️ the quiet-block styling recorded as **load-bearing**, so nobody promotes them to action items.

---

## VERIFY

### The route to the privacy policy, per role

| Role | Surface | Route | Taps |
|---|---|---|---|
| **owner** | Dashboard | avatar → *Privacy policy* | **1** |
| **manager** | Dashboard | avatar → *Privacy policy* | **1** |
| **staff**, on the dashboard | Dashboard | avatar → *Privacy policy* | **1** |
| **staff**, mid-shift on the KDS | KDS → Dashboard | `← Dashboard` → avatar → *Privacy policy* | **2** |

**Every role reaches it by the same control, on the same surface.** The KDS is the only surface with no menu, and its back-link exists precisely because staff are auto-routed there — so the extra tap is on a control already in that header, not a dead end.

**Guideline 5.1.1(i) is satisfied for every role App Review could test with**, which was not true an hour ago: with the links in Manage → Settings, a staff account had no in-app route at all.

### The links render as a quiet block, not as action items ✅

```
UserMenu.tsx:260   <hr className="border-slate-100" />
UserMenu.tsx:264   … px-4 py-2.5 text-xs text-slate-500 hover:bg-slate-50   ← Privacy policy
UserMenu.tsx:271   … px-4 py-2.5 text-xs text-slate-500 hover:bg-slate-50   ← Terms
```

against the action items, unchanged:

```
UserMenu.tsx:130, :142, :153, :162 …   text-sm text-slate-700
UserMenu.tsx:283                        text-sm text-red-600      ← Sign out
```

**Below a divider, one type step smaller, one shade lighter.** They sit between the Admin link and Sign out's own `<hr>`, so the action list reads unbroken above them.

### The Manage Settings Legal card is gone, and nothing else on that tab moved ✅

- `grep PRIVACY_PATH|TERMS_PATH app/manage/[token]/page.tsx` → **0 refs** (was 3).
- The tab's other content is untouched and in the same order: **"New to HatchGrab?" is still the first card** (moved to the top earlier today, :8429), the danger zone is **still last** and still owner-gated (:9876), and every settings group between them is unchanged.
- The only edit below the danger zone is the replacement comment.

### 🔴 How I checked `lib/legal.ts` against reality — grepped, not asserted

Every claim in the list was re-run against the tree:

```
$ grep -rn "<UserMenu" --include="*.tsx" .
    app/admin/page.tsx:655
    app/dashboard/[token]/page.tsx:2500
    app/manage/[token]/page.tsx:532
    (+ one hit inside UserMenu.tsx's own comment, which quotes this grep)
```

**Three render sites. The KDS is absent** — which is the correction. And each listed placement was counted:

| Placement | File | `PRIVACY_PATH`/`TERMS_PATH` refs |
|---|---|---|
| 1. Landing footer | `app/landing/page.tsx` | 3 ✅ |
| 2. Signup form | `app/signup/page.tsx` | 3 ✅ |
| 3. Demo → signup modal | `components/DemoGetStarted.tsx` | 4 ✅ (two call sites) |
| 4. **Operator account menu** | `components/dashboard/UserMenu.tsx` | **3 ✅** (import + two hrefs) |
| 5. Legal pages cross-link | `app/(legal)/layout.tsx` | 3 ✅ |
| — Manage (delisted) | `app/manage/[token]/page.tsx` | **0 ✅** |

**The list now matches the code exactly**, and the line references in it are written as `~2500` / `~530` so a shifted line does not make the entry read as stale.

### 🔴 GUSTO — they have staff, so this matters to them specifically

| Who | Before this change | After |
|---|---|---|
| **Their owner** (Dominic) | Reached the policy via Manage → Settings → Legal — **3 taps** (tab bar → Settings → scroll) | Avatar → *Privacy policy* — **1 tap**, from any dashboard tab. The Manage card is gone; nothing else on that tab moved. |
| **Their staff** | 🔴 **No route at all.** Redirected out of Manage, and the dropdown links had been removed | ✅ **Avatar → *Privacy policy* — 1 tap** on the dashboard, 2 from the KDS via `← Dashboard` |

**Nothing else changes for either.** No order screen, no payment control, no setting, no behaviour — the dropdown gains two quiet rows below a divider, and Manage → Settings loses one card.

### tsc and lint

```
$ npx tsc --noEmit
TSC EXIT: 0

$ npx eslint .   (rule|severity, whole repo)
  vs the immediately-previous task : IDENTICAL
  vs this morning's pre-work baseline:
    3c3   568 → 566  @typescript-eslint/no-explicit-any   (carried from an earlier task)
    15c15  44 → 32   react/no-unescaped-entities          (carried from earlier tasks)
```

**No rule introduced and no count increased by this task.** Both imports were moved rather than orphaned, so no `no-unused-vars` finding appeared at either end.

---

## The net position

**One location. `components/dashboard/UserMenu.tsx`, on the dashboard, ungated.**

- Owner, manager and staff all reach it by the same control.
- The KDS deliberately carries no link — an order screen cannot carry a footer, and the back-link makes it one extra tap.
- The specification (`lib/legal.ts`) now describes the code accurately, including what it does **not** cover, so the next person to consider moving these can see the real cost rather than the overstated one.
