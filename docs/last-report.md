# Last report — Loop-complete card drops its explicit `label`, so one screen has one label

**Date:** 2026-07-28 · **File touched:** `components/dashboard/DemoLoopComplete.tsx` **only**
**Verification:** `npx tsc --noEmit` → **clean, zero errors.** No `next dev`, no `next build`, no SQL.
**Diff: 1 file, +8/−2** — one prop removed, one comment added.

This report **overwrites** the previous one (the copy-object centralisation), per the rolling convention.

**Prompt integrity:** no garbles. The prompt arrived intact.

---

# 1. THE CHANGE

`components/dashboard/DemoLoopComplete.tsx:219–224`:

```jsx
        <DemoGetStarted
          token={token}
          isAdmin={isAdmin}
          extractionSource={extractionSource}
          className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-black px-5 py-2.5 rounded-xl shadow-sm"
        />
```

`label="Save my menu"` is gone. `triggerLabel = label ?? copy.bannerButton`
(`DemoGetStarted.tsx:312`) now falls through to the variant, exactly as it does on the banner.

The reasoning is written at the call site (`:212–218`) so the prop isn't reinstated as a "fix" later,
including the line that separates the two concerns:

> `className` is still passed — that is presentation (a full-size button rather than the banner's pill),
> which legitimately differs per surface; the WORDS do not.

---

# 2. ✅ NOTHING ELSE PASSES AN EXPLICIT `label`

```
$ grep -rn "<DemoGetStarted" -A 6 --include="*.tsx" . | grep -v node_modules | grep "label"
(no output)
```

All four call sites, confirmed individually:

| Call site | Props passed | Label source |
| --- | --- | --- |
| `app/dashboard/[token]/page.tsx:1819` (banner) | `token`, `isAdmin`, `extractionSource` | variant |
| `components/dashboard/DemoLoopComplete.tsx:219` (card) | `token`, `isAdmin`, `extractionSource`, `className` | **variant — this diff** |
| `app/dashboard/[token]/kds/page.tsx:731` (KDS banner) | `token` | variant (defaults to `upload`) |
| `app/trucks/[slug]/order/page.tsx:2602` (order page) | `slug` | variant (`saveOnly` — `canSetup` is false) |

**Zero explicit labels remain.** Every surface now reads the same object.

---

# 3. WHAT CHANGES ON SCREEN — two strings, one of them the point

| Demo type | Card button before | Card button after |
| --- | --- | --- |
| **Sample** (`extraction_source = 'template'`) | "Save my menu" | **"Set up my truck →"** ✅ the fix — it now matches the banner above it |
| **Upload** (`'upload'` or absent) | "Save my menu" | **"Save my menu →"** ⚠️ gains the arrow |

**⚠️ The upload case gains a `→` that wasn't there.** `DEMO_COPY.upload.bannerButton` is
`'Save my menu →'` — the arrowed form, because it was written for the banner. The card's explicit prop
was the plain form, and dropping the prop necessarily adopts the arrow.

That is a real if small visible change on the common path, and I'm flagging it rather than letting you
find it. **Three ways to read it, and I did the one you asked for:**

- **As shipped** — one string per variant, arrow included. Consistent with the banner, which is the
  property this diff is buying.
- If you want the card plain, that needs a second key (`cardButton`) alongside `bannerButton` in each
  variant — which reintroduces exactly the per-surface split the object exists to remove, for an arrow.
- If you want the arrow gone everywhere, it is three characters in `DEMO_COPY`.

Nothing else changed: the card's heading, the `SIGNUP_OFFER` lines, "Not yet", the snooze, the modal it
opens, and every other surface are untouched.

---

# 4. ⚠️ The `label` prop is now unused — flagged, not removed

No caller passes it. It survives as an escape hatch with a ~20-line doc comment
(`DemoGetStarted.tsx:125–144`) arguing "WHY SAVE MY MENU" — reasoning that now **also** lives in
`DEMO_COPY`'s header, in more detail and next to the strings it describes.

**Two copies of the same argument in one file is the drift risk this whole exercise is about**, one
level up: someone updates the rationale in one place and not the other.

**I have not touched it** — you scoped this to the call site, and removing a prop is a signature change.
**The tidy is: delete the `label` prop and its comment, keep `copy.bannerButton`.** Say the word.

---

# 5. Files changed

| File | Change |
| --- | --- |
| `components/dashboard/DemoLoopComplete.tsx` | +8/−2 at `:212–224`. `label` prop removed; comment recording why. |
| `docs/last-report.md` | This file, overwritten. |

---

# 6. NOT TOUCHED

`DemoGetStarted`'s signature, `DEMO_COPY`, `DEMO_COPY_SHARED`, the variant derivation · the welcome popup ·
the KDS and order-page call sites · `provisionDemo` · `commitMenu` · seeding · the event provisioner.

---

## 7. What I could not do / did not do

- **Could not run `next dev` or `next build`** — instructed not to. `tsc --noEmit` is clean. Two things to
  look at:
  1. **A sample demo with the loop-complete card showing** — the card button and the banner above it
     should now read the same words ("Set up my truck →"). That is the whole diff.
  2. **An upload demo** — the card button now carries the arrow (§3). Worth a glance in the card's
     layout, since it is a wider button than the banner pill.
- **Did not remove the now-unused `label` prop** — §4, with the reason and the one-line tidy.
- **Did not add a `cardButton` key** to keep the card's plain wording — §3 explains why that would
  reintroduce the split.
- **Did not commit anything.** This joins the session's unstaged work, the untracked
  `20260728_demo_sessions_extraction_source.sql`, and the staged deletion of `lib/demo-event-refresh.ts`.
