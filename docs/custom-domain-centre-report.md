# Centring the truck identity

**WHICH OF THE THREE I PERFORMED: ALL THREE — a PARSE, a TYPECHECK, and an EXECUTION.**
- **Parse** — every caller, class string and line quoted here is read from a file on disk.
- **Typecheck** — `npx tsc --noEmit`, clean. `npx eslint components/embed/EmbedParts.tsx`, no findings.
- **Execution** — the **real `EmbedParts` module was transpiled and run** at both the pre-edit and
  post-edit source and every export rendered through `react-dom/server`; and the **live page was loaded
  in a real browser** (Puppeteer, 390 × 844) and the identity block **measured geometrically** in both
  branches.

**NO DEPLOY. NO MIGRATION. NO SQL.** Pizzeria Gusto untouched.
**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

---

## 1. THE READ — ONE CALLER, AND I PROCEEDED

🔴 **`app/domain/page.tsx` IS THE ONLY CALLER OF `TruckIdentity`. THERE IS NO OTHER.** Grepped for the
symbol and for every importer of the module across `app/`, `components/` and `lib/`:

```
  app/domain/page.tsx:8    import { Shell, TruckIdentity, PoweredBy, truckLogoUrl } from '@/components/embed/EmbedParts'
  app/domain/page.tsx:159  <TruckIdentity name={truck.name} logoPath={truck.logo_storage_path} />
  app/domain/page.tsx:175  <TruckIdentity name={truck.name} logoPath={truck.logo_storage_path} />
  lib/custom-host.ts:82    …(components/embed/EmbedParts.tsx)…          ← a COMMENT, not an import
```

**The file's own header already says so**, and it is correct: *"the chrome of the CUSTOM-DOMAIN page
(app/domain/page.tsx), which is their only caller now that the iframe route is gone."* The second
caller — `/embed/[slug]` — was **deleted in V11.49** with the iframe removal.

⚠️ **IT IS RENDERED TWICE, AND BOTH ARE THE PAGE YOU ASKED ABOUT.** Line 175 is the normal render;
**line 159 is the lapsed-plan fallback** — the truck's name, one link onward, the brand line, shown when
`canAccess(plan, 'embed_schedule', …)` is false. Both are the custom-domain page, so both are in scope
and both are now centred. **Nothing outside that page renders this component.**

---

## 2. THE CHANGE — ONE CLASS

```diff
- <div className="mb-3 flex items-center gap-3">
+ <div className="mb-3 flex items-center justify-center gap-3">
```

**That is the entire code change.** The other 11 added lines are the explanation, in the docblock above
the component.

🔴 **ONE CLASS COVERS BOTH BRANCHES, BECAUSE THE LOGO AND THE NAME SHARE ONE FLEX ROW.** The `<img>` is
conditional; the row is not. Centring the row centres the `[logo][name]` pair when there is an upload
and the bare `<h1>` when `logo_storage_path` is null — **there was never a second place to change.**

⚠️ **WHAT I DID NOT ADD, AND WHY.** No `text-center` on the `<h1>`. The flex row already centres the
name as a whole; `text-center` would only change where a **wrapped** name's second line sits, and
beside a logo a wrapped name reads better ranged left under itself than centred under the logo. **That
is a judgement, and it is reversible in one word** if you would rather long names centre their own
wrap.

---

## 3. BOTH BRANCHES, RENDERED

**Executed at both the pre-edit and post-edit source.**

### With a logo

```html
BEFORE  <div class="mb-3 flex items-center gap-3">
AFTER   <div class="mb-3 flex items-center justify-center gap-3">
          <img src="…/truck-media/test-kitchen/logo.png" alt="Thai Kitchen" width="44" height="44"
               class="h-11 w-11 shrink-0 rounded-full border border-slate-200 bg-white object-contain"/>
          <h1 class="text-base font-bold leading-tight text-slate-900 sm:text-lg">Thai Kitchen</h1>
        </div>
```

### Name as text (`logo_storage_path` null)

```html
BEFORE  <div class="mb-3 flex items-center gap-3">
AFTER   <div class="mb-3 flex items-center justify-center gap-3">
          <h1 class="text-base font-bold leading-tight text-slate-900 sm:text-lg">Thai Kitchen</h1>
        </div>
```

**The diff, per branch, measured:**

| Branch | Length before → after | What differs |
|---|---|---|
| with a logo | 480 → 495 | **+15 chars — `justify-center ` and nothing else** |
| name as text | 137 → 152 | **+15 chars — `justify-center ` and nothing else** |

**The `<img>` element is character-for-character unchanged in both** — same `width`, `height`, `h-11
w-11`, `object-contain`, `shrink-0`, `rounded-full`, `border`.

---

## 4. 🔴 MEASURED IN A REAL BROWSER — IT IS ACTUALLY CENTRED

Live page at 390 × 844. The identity row and its container, in pixels:

```
── WITH A LOGO ────────────────────────────────────────────────────────────
  classes   : mb-3 flex items-center justify-center gap-3
  container : left 12   right 378   width 366
  children  : IMG 119→163 (44×44)    H1 175→271 (97×20)
  gap L / R : 107 / 107   → ✅ CENTRED
  logo      : natural 1000×1000, rendered 44×44   (h-11 w-11 = 44px — unchanged)
  mb / gap  : 12px / 12px

── NAME AS TEXT (the <img> removed — exactly what logoPath:null renders) ──
  children  : H1 147→243 (97×20)
  gap L / R : 135 / 135   → ✅ CENTRED
  mb / gap  : 12px / 12px   (identical to branch 1 ✅)
```

**Left and right gaps are equal to the pixel in both branches.** The logo still renders **44 × 44** —
`h-11 w-11` — from a 1000 × 1000 source, `object-contain`, so **the size and aspect ratio are
untouched**. `margin-bottom: 12px` (`mb-3`) and `column-gap: 12px` (`gap-3`) are **identical before and
after and identical between branches**, so the spacing around the block did not move.

⚠️ **Branch 2 was produced by removing the `<img>` from the live DOM**, which yields exactly the markup
the `logoPath: null` path renders (proven character-for-character in §3). **The truck currently has a
logo, so the null branch was not served by the server during this measurement.**

---

## 5. EVERYTHING ELSE IS BYTE-IDENTICAL

**Executed — every other export rendered from both sources and compared:**

| | |
|---|---|
| `Shell` — the page frame, its padding and widths | ✅ **BYTE-IDENTICAL** — `<main class="min-h-screen bg-white px-3 py-4 sm:px-4"><div class="mx-auto flex w-full max-w-2xl flex-col">` |
| `PoweredBy` — the brand line | ✅ **BYTE-IDENTICAL** — `<p class="mt-4 text-center text-[11px] text-slate-400">…Powered by HatchGrab</a></p>` |
| `truckLogoUrl` | ✅ **IDENTICAL** for both a path and null |
| **The schedule list and the event cards** | ✅ **`app/embed/[slug]/EmbedSchedule.tsx` WAS NOT OPENED** |
| `app/domain/page.tsx` | ✅ **NOT OPENED** |

**Only one file was edited.** File mtimes bear it out: `EmbedSchedule.tsx` 12:59, `domain/page.tsx`
11:00, `EmbedParts.tsx` **20:46**.

⚠️ **The schedule list and event cards are not in this file at all.** They are rendered by
`<EmbedSchedule>`, a separate client component; `EmbedParts` supplies only the frame, the identity and
the brand line. **They could not have changed.**

---

## 6. WHAT REMAINS UNOBSERVED

1. ⚠️ **ONE VIEWPORT ONLY — 390 × 844.** The measurement is at phone width. At `sm:` and above the
   `<h1>` grows (`sm:text-lg`) and `Shell` changes padding (`sm:px-4`), and **the centring was not
   re-measured there.** `justify-center` is viewport-independent, so this is a low risk, but it is an
   argument rather than an observation.
2. ⚠️ **A LONG NAME HAS NOT BEEN SEEN.** "Thai Kitchen" is 97px wide in a 366px container and does not
   wrap. **How a name that wraps sits beside a centred logo is unobserved** — and it is exactly the case
   the `text-center` decision in §2 turns on.
3. ⚠️ **THE LAPSED-PLAN BRANCH (line 159) WAS NOT RENDERED.** It uses the same component with the same
   props, so it centres identically by construction — but the truck is in plan, so that branch did not
   serve during this test.
4. 🔴 **The test truck's `logo_storage_path` is `tikka-tonic/1786658935576-tikkatonic.jpg`** — Thai
   Kitchen's row is pointing at **Tikka Tonic's** uploaded file. Harmless (it is a read of a public
   storage path, and Tikka Tonic's own row is untouched), but **it will want clearing with the rest of
   the test fixture**, alongside `custom_domain`, `custom_domain_verified_at` and `embed_enabled`.
5. ⚠️ **A stale comment sits four lines above what I changed and I left it.** The docblock still reads
   *"THE SCHEDULE PAGE'S PIECES, SHARED BY TWO ROUTES"* and describes `/embed/<slug>` in the present
   tense; that route was deleted in V11.49. The file's own header already corrects it. **Out of scope
   for an alignment change — flagged, not edited.**
