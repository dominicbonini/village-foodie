# Signup fix — follow-up: two fixes and one investigation

**Date:** 3 August 2026 · Follows the slices A/B work. **Zero migrations, no SQL.**
No `next dev`, no `next build`.

**Typecheck — exact command and result:**
```
npx tsc --noEmit -p tsconfig.json   →   TSC EXIT=0   (no output)
```

**Lint:** `app/setup/page.tsx` clean. `app/manage/[token]/page.tsx` identical to its pre-change baseline:
```
manage BASELINE: ✖ 372 problems (295 errors, 77 warnings)
manage AFTER:    ✖ 372 problems (295 errors, 77 warnings)
```

**No mojibake or garbled spans** were found in any file read or edited.

---

## FIX 1 — ✅ ALREADY CORRECT. No change made.

**The query already carries the ORDER BY.** Here it is verbatim, untouched, as it stands in
[app/api/auth/verify-signup/route.ts:56-63](app/api/auth/verify-signup/route.ts#L56-L63):

```ts
const { data: trucks } = await supabase
  .from('trucks')
  .select('dashboard_token, setup_step')
  .eq('operator_id', row.operator_id)
  .order('created_at', { ascending: true })

const truck = (trucks ?? []).find(t => t.setup_step && t.setup_step !== 'done') ?? (trucks ?? [])[0] ?? null
```

`.order('created_at', { ascending: true })` was written in with the A1 implementation — the slices report
described the fallback as *"the **oldest**"*, which is only true with an ORDER BY, so it went in at the
time. **I have not added anything and have not touched the file.** Reporting it as already-satisfied
rather than performing a no-op edit and calling it a fix.

**The sibling query has it too.** [app/api/setup/route.ts:137-141](app/api/setup/route.ts#L137-L141), the
`?check=truck` branch that A3 added, uses the identical pattern including the ORDER BY — so both places
that resolve "the operator's truck" are deterministic and agree with each other.

⚠️ Worth noting the ordering does double duty: `.find(…)` also returns the **first** match, so without the
ORDER BY a multi-truck operator with two in-setup trucks would have been non-deterministic on *both*
branches, not just the fallback. Both are covered.

---

## FIX 2 — copy no longer promises a resend that does not exist

**Four strings changed, two per surface.** `verify=ok` is untouched on both.

| Surface | Status | Before | After |
|---|---|---|---|
| `/setup` | `expired` | "That confirmation link has expired. We'll send you a fresh one before you go live." | "That confirmation link has expired. **Get in touch and we'll sort it** before you go live." |
| `/setup` | `invalid` | "That confirmation link didn't work. We'll send you a fresh one before you go live." | "That confirmation link didn't work. **Get in touch and we'll sort it** before you go live." |
| Manage toast | `expired` | (same as above) | (same as above) |
| Manage toast | `invalid` | (same as above) | (same as above) |

Both sites carry a comment recording *why*, so the promise cannot be reinstated by someone who does not
know the table distinction:

> ⚠️ NO RESEND IS PROMISED, because there is no resend path for SIGNUP verification.
> `/api/auth/resend-verification` reads `operator_email_changes` — the email-CHANGE table, a different
> one. Saying "we'll send you a fresh one" named a mechanism that does not exist.

Files: [app/setup/page.tsx](app/setup/page.tsx) (banners), [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) (toasts).
No other copy touched.

### How Gusto and RTF are unaffected — fixes 1 and 2

| Fix | Why they cannot reach it |
|---|---|
| **1** | No change was made. Even had one been, `/api/auth/verify-signup` requires a row in `operator_email_verifications`, which only `/api/signup` creates. Neither operator came through that route. |
| **2 (`/setup`)** | `/setup` is not on any path either uses; both reach Manage directly by token. |
| **2 (Manage toast)** | The effect early-returns when `?verify=` is absent — every page load for them. No toast, no `replaceState`, no state change. Nothing can produce that param for an operator with no verification row. |

Both have `setup_step` NULL, so `inSetup` is false; neither fix reads it, and neither touches the commit
path. The manage page linting at exactly its baseline is the mechanical check that nothing else in that
9,000-line file moved.

---

## INVESTIGATION 3 — read-only. Nothing changed.

### 🔴 Headline: the loss is NOT reachable by clicking a tab. My B3 framing was incomplete.

B3 established that the wizard state lives in `MenuTab` and that `MenuTab` unmounts on tab switch. Both
are true. What I did **not** check at the time — and should have — is whether a tab switch is *possible*
while the wizard is open. **It is not.**

### (a) What renders, and can the tabs be clicked?

The wizard is a **full-viewport overlay at `z-50`**. All three steps that hold work:

```tsx
{importStep === 'upload' && (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">      // :4008-4009

{importStep === 'review' && importResult && (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">      // :4043-4044

{(importStep === 'prep' || importStep === 'saving') && importResult && (() => {
  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">      // :4358-4361
```

The tab bar is **`z-40`**:

```tsx
<div className="bg-slate-900 border-b border-slate-700 shrink-0 z-40">                        // :435
```

**`z-50` > `z-40`, `inset-0` is the whole viewport, and there is no transformed ancestor** on the path —
the app shell root is `<div className="bg-slate-50 h-dvh flex flex-col overflow-hidden">` with no
`transform`, `filter` or `will-change`, so both sit in the same stacking context and the overlay wins.

**Plainly: while the import wizard is open, the tab bar is painted over and its clicks are swallowed by
the backdrop. The tabs cannot be clicked.**

### (b) Other routes out that unmount MenuTab without committing

| Candidate | Present? |
|---|---|
| Backdrop click | ❌ None of the three overlay `<div>`s has an `onClick`. |
| Escape handler | ❌ The only two `onKeyDown` in the file ([:3696](app/manage/[token]/page.tsx#L3696), [:3714](app/manage/[token]/page.tsx#L3714)) are the subcategory rename input, unrelated. No global key handler. |
| ✕ / discard from `review` | ❌ `resetImportState()` has two callers: post-commit ([:2696](app/manage/[token]/page.tsx#L2696)) and the `inSetup` "Go to my dashboard →" button on the **`done`** step ([:4665](app/manage/[token]/page.tsx#L4665)). Neither is reachable from `review`. |
| Back button | ⚠️ Yes, but it stays inside the wizard: `reviewStep > 1 ? setReviewStep(reviewStep - 1) : setImportStep('upload')` ([:4188](app/manage/[token]/page.tsx#L4188)). |
| **Cancel on the `upload` step** | ⚠️ **This is the one real exit.** [:4020](app/manage/[token]/page.tsx#L4020): `onClick={() => { setImportStep('idle'); setImportFile(null); setImportText('') }}` — it returns to `idle`, **dismissing the overlay**, and notably does **not** clear `importResult`. |
| Browser back | ⚠️ The wizard is not a route, so Back leaves `/manage` entirely — losing the work, but that is navigating away from the page, not a silent in-page loss. |

**So the sequence that loses work is two deliberate steps, not one accident:** Back out of `review` to
`upload`, then press **Cancel**. Only then is the tab bar clickable again, and only then does switching
tabs unmount `MenuTab`. An operator who does that has already signalled they are abandoning the import.

### (c) Is any of it lifted, persisted or restored? — **No. An unmount is total loss.**

Every piece is `useState` **inside** `MenuTab` (which begins at [:1532](app/manage/[token]/page.tsx#L1532)):

| State | Line |
|---|---|
| `importStep` | [:1659](app/manage/[token]/page.tsx#L1659) |
| `demoImportMode` | [:1663](app/manage/[token]/page.tsx#L1663) |
| `reviewStep` | [:1667](app/manage/[token]/page.tsx#L1667) |
| `groupingChoice` | [:1720](app/manage/[token]/page.tsx#L1720) |
| `importKitchenCapacity` | [:1725](app/manage/[token]/page.tsx#L1725) |
| `categoryPrep` | [:1733](app/manage/[token]/page.tsx#L1733) |
| `importResult` | [:1735](app/manage/[token]/page.tsx#L1735) |

**No `localStorage` or `sessionStorage` anywhere near the import.** The four `localStorage` hits in the
file are the trial-reminder daily dismiss ([:322](app/manage/[token]/page.tsx#L322), [:326](app/manage/[token]/page.tsx#L326))
and two comments explicitly stating that view filters are deliberately *not* persisted. Nothing is lifted
to the parent, nothing is written to the DB before commit — [:4391](app/manage/[token]/page.tsx#L4391)
records *"all edits are in-memory (setCategoryPrep, NO RPC) — committed"* at the end.

**One partial recovery exists, and only for the demo path:** the `?import=demo` bootstrap re-fires on
remount and restores `importResult` from the server extraction. That is the re-entry path B3 protected —
and this investigation shows it is also the recovery from an accidental **Cancel**, which strengthens the
case for not stripping the param.

### (d) Who is affected — shared vs setup-only

**The wizard state is SHARED. A normal operator import uses exactly the same state.**

| State | Scope |
|---|---|
| `importStep`, `importResult`, `reviewStep`, `groupingChoice`, `categoryPrep`, `importKitchenCapacity`, `importFile`, `importText`, `importDoneSkipped` | **Shared** — identical for Gusto, RTF and a setup import |
| `demoImportMode` | **Setup/demo only** — set solely by the `?import=demo` bootstrap ([:2214](app/manage/[token]/page.tsx#L2214)); its only effect is `clearFirst` on commit |
| `importStep === 'schedule'`, the `done`-step "Go to my dashboard →" | **Setup only** — both gated on `inSetup` ([:4481](app/manage/[token]/page.tsx#L4481), [:4664](app/manage/[token]/page.tsx#L4664)) |

So Gusto re-importing a menu has the **same** protection (the `z-50` overlay) and the **same** exposure
after a Cancel — with one difference that matters: **they have no `?import=demo` recovery.** A setup
operator who cancels and switches tabs gets their extraction back on return; Gusto would have to
re-upload the file. Their exposure is therefore *worse*, not better — but it requires the same two
deliberate steps.

### (e) Size of the problem for a 37-item import

Decisions held in memory, from the code:

| Decision | Count for 37 items | Site |
|---|---|---|
| Include/exclude per item (`_skip`) | **37** | [:4107](app/manage/[token]/page.tsx#L4107) |
| Price correction / "this one's free" (`price`, `_free`) | up to **37** — only unresolved ones need touching, but any can be edited | [:4129](app/manage/[token]/page.tsx#L4129), [:4135](app/manage/[token]/page.tsx#L4135), [:4145](app/manage/[token]/page.tsx#L4145) |
| Grouped-vs-separate (`groupingChoice`) | **1 per groupable row** — `computeGroupingRows(importResult.items)` ([:2201](app/manage/[token]/page.tsx#L2201)); count is menu-shaped, not fixed |
| Allergen display mode (`pendingDisplayMode`) | **1** | [:4349](app/manage/[token]/page.tsx#L4349) |
| Per-item allergen confirmation (`_allergensChecked` → `allergens_verified`) | up to **37** | [:4256](app/manage/[token]/page.tsx#L4256) |
| Prep secs / batch size / counts-toward per category | **3 × category count** | [:4410-4420](app/manage/[token]/page.tsx#L4410-L4420) |
| Kitchen capacity + window | **2** | `importKitchenCapacity` [:1725](app/manage/[token]/page.tsx#L1725) |
| Manually added rows | unbounded | [:4162](app/manage/[token]/page.tsx#L4162) |

**Order of magnitude: for 37 items across, say, 6 categories, roughly 37 + 37 + 37 + 18 + 3 ≈ 130+
individual decisions**, of which the allergen confirmations are the ones with real-world consequences —
they set `allergens_verified`, which gates whether a dish is visible to customers in per-dish mode.

**⚠️ But the realistic exposure is much smaller than that number suggests**, because the loss needs Back →
Cancel → tab switch. The honest framing: **high value at risk, low probability of reaching it, and no
confirmation on the one step (Cancel) that exposes it.** `Cancel` on the `upload` step discards a
fully-reviewed import with no "are you sure", and it does not even clear `importResult` — so the state is
retained but unreachable, which is the odd half-state in the middle.

**Not fixed, as instructed.** If it is worth addressing, the cheapest correct move is a confirm on that
one Cancel when `importResult` is non-null — not persistence, and not lifting state.

---

## Files touched

| File | Reason |
|---|---|
| [app/setup/page.tsx](app/setup/page.tsx) | Fix 2 — `expired` and `invalid` banner copy no longer promises a resend |
| [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) | Fix 2 — same two strings in the `?verify=` toast |

**Not touched:** `app/api/auth/verify-signup/route.ts` (Fix 1 already correct), and nothing at all for
Investigation 3.

⚠️ `git status` also shows earlier tasks' files as modified. **Those are not part of this change.**
