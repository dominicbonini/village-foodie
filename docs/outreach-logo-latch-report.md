# Outreach console — round 3: the thumbnail latch and the upload hand-merge

**Date:** 16 September 2026 · **HEAD:** `8964845` ("whatsapp change") · **Admin page only.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0. git status, and the STEP 0 stop condition

### 🔴 The stop condition was met, I stopped, and you chose to build on it anyway

STEP 0 required round 2 to be committed. **It was not.** `git status` before editing:

```
Changes not staged for commit:
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/ComposeWindow.tsx
	modified:   components/admin/OutreachPanel.tsx
	modified:   docs/reference-manual.md
	modified:   lib/outreach-filter.ts
	modified:   lib/outreach-step.ts

Untracked files:
	docs/manual-v13-4-report.md
	docs/outreach-console-v13-5-report.md
	docs/outreach-console-v13-5b-report.md
	scripts/outreach-channel-for.cjs
	scripts/outreach-dnc-pool.cjs
	scripts/outreach-list-columns.cjs
	scripts/outreach-log-once.cjs
	scripts/outreach-logo-latch.cjs
	scripts/outreach-stage-advance.cjs
```

**Every one of the six named paths was still uncommitted**, and HEAD was `8964845` — the same commit round 2 began on. I verified round 2's work was intact (`logInFlight` ×4, `CONTACTED_STAGE` ×2, `pool`, `hasValue` ×5, six harness files) and asked. **You chose "Build on it anyway."**

⚠️ **THE CONSEQUENCE, RECORDED:** `components/admin/OutreachPanel.tsx` and `scripts/outreach-logo-latch.cjs` now carry **both rounds' changes**, and git cannot separate them. Unpicking round 3 from those two files means unpicking round 2 by hand. `git diff --stat` on the panel reports **242 insertions / 62 deletions across both rounds combined**.

**After (new this round marked ←):**
```
 M app/api/admin/outreach/route.ts        (round 2 only — untouched this round)
 M components/admin/ComposeWindow.tsx     (round 2 only — untouched this round)
 M components/admin/OutreachPanel.tsx     ← rounds 2 AND 3
 M docs/reference-manual.md               (V13.4 fold — untouched)
 M lib/outreach-filter.ts                 (round 2 only)
 M lib/outreach-step.ts                   (round 2 only)
?? scripts/outreach-logo-latch.cjs        ← rewritten this round
?? scripts/outreach-upload-refresh.cjs    ← NEW this round
   (+ the five other round-2 harnesses and three reports, untouched)
```

**Nothing staged, committed, stashed, reset or restored; `git add` was not run in any form.**

---

## 1. Importers of the two thumbs — the hard constraint

⚠️ **A correction to my round-2 report first: there is no component named `Thumb`.** I called the row thumb that; its real symbol is **`MediaCell`**.

| Symbol | Exported? | Every use |
|---|---|---|
| **`MediaCell`** | **No** — module-private | twice, both inside `Row` in `OutreachPanel.tsx` |
| **`ModalThumb`** | **No** — module-private | twice, both in the prospect modal in `OutreachPanel.tsx` |

A repo-wide search (no extension scoping, `docs/` excluded) finds **no other occurrence** of either. Neither is exported, so neither can reach any other file.

**And the file itself is admin-only:** `OutreachPanel` is imported by exactly two places — `app/admin/page.tsx` (as a tab) and `app/admin/outreach/page.tsx`. **No non-admin surface. ✅ No STOP.** Nothing Gusto or any customer sees is touched.

---

## 2. The upload route's url vs the list route's string — the fact round 2 left unstated

**Upload route** (`app/api/admin/outreach/route.ts`, the multipart branch):
```ts
const MEDIA_BUCKET = 'truck-media'
const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`
…
const { error: dbErr } = lt && lt.target.truckId
  ? await supabase.from('trucks').update({ logo_storage_path: path }).eq('id', lt.target.truckId)
  : await supabase.from('discovery_trucks').update({ [column]: publicUrl }).eq('id', truckId)
return NextResponse.json({ ok: true, column, url: publicUrl })
```

**List route**, for the same prospect afterwards:
```ts
const authoritativeLogo = logoTarget.truckId
  ? await resolveTruckLogo(supabase, logoTarget.truckId, logoTruckRow?.logo_storage_path ?? null)
  : (truck?.logo_url ?? null)
// resolveTruckLogo: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${logoStoragePath}`
```

**For a prospect with a live demo and no real truck** (`resolveLogoTarget` returns `kind: 'demo'` with the demo's `truckId`, so `lt.target.truckId` is set): the route writes `trucks.logo_storage_path = path` and returns `url = ${SUPABASE_URL}/storage/v1/object/public/truck-media/${path}`. The list route then resolves that same `path` through the same template.

### 🔴 Conclusion: the two strings are EQUAL today. This change fixes no wrong value.

`MEDIA_BUCKET` **is** `'truck-media'`, so the templates are identical and the path is the one just written. The hand-merge was therefore **not** producing a wrong `logo_url`, and round 2's ranking of it as the second candidate was right to rank it below the latch.

**What it removes is a SECOND BUILDER of a server-derived string**, and two real divergences are already latent in it:
1. ⚠️ **The env vars differ.** The route falls back `NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL`; `resolveTruckLogo` reads **only** `NEXT_PUBLIC_SUPABASE_URL`. If the public var were unset while the server one was set, the upload would return a working URL and the list would return `undefined/storage/…`.
2. ⚠️ **For a LINKED prospect the shapes differ at the source.** The route writes a bucket **path** to `trucks.logo_storage_path` while returning a **URL** — so the client was merging a value built to a different rule than the one the row is stored under.

---

## 3. Change 1 — the latch clears on a refresh

**One shared piece, not two copies** — a new hook **`useThumbLatch`** in `OutreachPanel.tsx`, used by **both** `MediaCell` and `ModalThumb`. I chose a hook over duplicating the effect because the round-2 defect existed **in two places at once**: two copies of a rule is how they drift, and the harness now asserts there is exactly **one** `useState(false)` latch in the file.

```ts
function useThumbLatch(input: { value, src, refreshNonce, kind, name }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => { setBroken(false) }, [value, refreshNonce])   // 🔴 the nonce is the fix
  const onError = useCallback(() => {
    setBroken(true)
    console.warn(`[outreach-thumb] ${kind} failed to load for ${name} — src=${src ?? ''} at ${new Date().toISOString()}`)
  }, [kind, name, src])
  return { broken, onError }
}
```

- **`refreshNonce`** is new panel state, bumped by **`load()` only on a successful read** — after `setProspects`, and after every early return for 401 / 404 / non-ok / thrown fetch. 🔴 **That is what stops this becoming a retry loop:** a failed refresh is not fresh data and does not justify a fresh attempt.
- **Threaded as a prop** to `Row` (which passes it to both `MediaCell`s) and to both `ModalThumb`s. ⚠️ A prop rather than context **because `Row` is `memo`-wrapped** — a context read would not re-render a memoised row when the nonce changed.
- **The deliberate behaviour is kept:** after a real failure the ⚠ marker still shows, never an empty slot; a value that fails again after a refresh latches again; at most one fresh attempt per refresh.
- **One `console.warn` per `onError`**, carrying the `[outreach-thumb]` prefix, the kind, the prospect name, the exact `src` and an ISO timestamp — so the **original** transient failure can finally be seen in Safari's console. Nothing else is logged on this path.
- **🔴 No cache-buster.** The `src` is untouched; no query parameter was added. Asserted by the harness.

---

## 4. Change 2 — the upload path re-reads

**`uploadMedia`** in `OutreachPanel.tsx`. The success path was:
```ts
setProspects(ps => ps.map(x => x.id === prospectId ? { ...x, [data.column]: data.url } as Prospect : x))
```
It is now `await load()`, with `[load]` in the dependency array. Applies to **both logo and photo** — it is one callback taking `kind`. Response validation (`!data?.url || !data?.column`) and the `!res.ok` throw are unchanged; failures still throw rather than silently reloading. ⚠️ `load()` also bumps the nonce, so a retried upload after a failed load shows the new image rather than a stale ⚠.

### The delete-path decision: **leave it optimistic**, and the reason is measured

`deleteMedia` still does `{ ...x, [kind === 'logo' ? 'logo_url' : 'photo_url']: null }`. **There is no case where a reload would return a non-null logo for a row just cleared:**

- **Demo-backed or linked prospect** — the delete route clears `trucks.logo_storage_path`; the list route computes `logoTarget.truckId ? resolveTruckLogo(…, null) : …`, and `resolveTruckLogo` returns **null** for a null path. 🔴 **It adds NO fallback to `discovery_trucks.logo_url`** — its own comment says *"an operator who cleared their logo sees it cleared here too, which is the whole point of Option A."* This is the case the brief asked about, and it resolves to null.
- **Unlinked prospect** — the discovery column itself is cleared, so `truck?.logo_url ?? null` is null.
- **Photo** — always `discovery_trucks.photo_url`, cleared, so null.

The optimistic null therefore already agrees with the server. Keeping it also keeps the delete feeling instant from a confirm dialog. **The reasoning is written at the call site**, not only here, and the harness asserts that it is.

**The server routes are unchanged.** `formatImageUrl`, `classifyDemoLogoSource`, `resolveLogoTarget`, `resolveTruckLogo`, the upload route and storage were not touched, and no fallback was added to `resolveTruckLogo`.

---

## 5. Harnesses

| Harness | Failure mode | Broken variant → result | Real result |
|---|---|---|---|
| **`outreach-logo-latch`** (rewritten) | the logo is still hidden after `load()` returns the same URL (round-2 defect back); **or** the ⚠ stops appearing after a real failure, turning a broken value into an inviting empty slot | **V1 = the round-2 latch, reset on `value` only** → **FAILED as required**, caught on *"after load() with the IDENTICAL url — VISIBLE AGAIN"* | ✅ **18 passed** |
| **`outreach-upload-refresh`** (new) | the client holds a `logo_url` it built itself rather than the one the list route derived — invisible today, because the strings match | **V1 = the round-2 spread, restored** → **FAILED as required** on all three of: calls `load()`, no longer spreads, `[load]` in deps | ✅ **9 passed** |

**`outreach-logo-latch` now asserts**, in order: a transient failure shows ⚠ (never an empty slot) and logs once → `load()` with the identical URL makes it visible again → a re-render **without** a refresh does **not** clear it (no retry loop) → a refresh gives one fresh attempt → a value that fails again latches again → two failures over three refreshes. Plus nine source assertions, including that **both** thumbs read the nonce through the one shared hook, that `load()` bumps it only after a successful read, and that **no cache-buster** was added.

### 🔴 A harness defect I introduced and fixed

`outreach-upload-refresh` **reported the real, correct source as broken** on its first run. Its "no longer spreads" check searched raw text, and the fix's own comment **quotes the line it replaced**. A harness that cannot tell executable code from a comment about code fails on correct source — which teaches whoever hits it to weaken the check. It now strips comments before every executable assertion, while the two "the reason is written down" assertions deliberately read the **raw** slice. Recorded at the function rather than quietly corrected.

---

## 6. Verification

| Check | Result |
|---|---|
| `scripts/outreach-*.cjs` (7) | ✅ all pass — 343-input characterisation, 26, 18, 15, **18**, 25, **9** |
| `scripts/whatsapp-*.cjs` (5) | ✅ 48 / 87 / 37 / 131 / 30 |
| `npx tsc --noEmit` | ✅ clean |
| `npx next build` | ✅ **SUCCESS** — compiled in 5.2s, 95/95 static pages |
| eslint, `OutreachPanel.tsx` vs a clean HEAD worktree | **13 errors / 0 warnings at HEAD, 13 / 0 now — delta 0 on every rule** (`no-explicit-any` 5, `set-state-in-effect` 7, `immutability` 1 — all pre-existing) |

**No SQL was run this round.** Every figure in §2 is a code-read or a FIXTURE comparison, labelled as such; the LIVE values it refers to (Pig-Casso's row, the demo truck's `logo_storage_path`) were read in round 2 and are unchanged here.

---

## 7. Manual sections made stale by this round (NOT edited)

| Section | Why |
|---|---|
| **§52.1** | "Outreach table — media columns (logo/photo thumbnails with upload)" — the thumbnails now clear their error latch on a refresh and log one `[outreach-thumb]` line per failure. |
| **§52** (media cells) | Any description of the thumb's three states should record that state 3 (⚠) now clears on a successful `load()`, not only on a changed value, and that the two thumbs share one `useThumbLatch`. |
| **§55 / Option A** | The upload path no longer hand-merges the route's `url`; the client never holds a `logo_url` the server did not derive. The delete path deliberately still clears optimistically, and why. |
| **new** | The console's regression net is now **seven** `scripts/outreach-*.cjs` harnesses (round 2 added six; this round rewrote one and added `outreach-upload-refresh`). |
| **⚠️ correction** | My round-2 report named the row thumb `Thumb`. Its real symbol is **`MediaCell`**. Any manual text copied from that report should be corrected. |

---

## 8. What I could not establish

- **Why the first load failed.** The latch explains the persistence and the refresh-recovery; it does not explain the original transient failure. That is exactly what the new `[outreach-thumb]` warning is for — **it needs a real occurrence in Safari's console to identify**, and I have not observed one.
- **That the fix resolves the reported symptom in the browser.** It is proved against a model of the thumb's state machine plus source assertions, and `next build` succeeds. **No one has watched a logo disappear and come back without a reload.**
- **The `NEXT_PUBLIC_SUPABASE_URL` divergence in §2 is reasoned, not observed** — I did not test with that variable unset.
