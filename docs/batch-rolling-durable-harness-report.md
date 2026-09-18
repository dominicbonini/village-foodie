# Batch rolling — the identity proof made durable

17 September 2026. **Test files only**: every edit is under `scripts/`; `lib/`, `app/`, `components/` and
`supabase/` are untouched by this task. No database reads or writes were made. Nothing staged, committed,
stashed, reset or restored. Companion to `docs/batch-rolling-fix-report.md`.

## 1. In one paragraph

`scripts/batch-rolling-identity.cjs` and the place-in-slot check in `scripts/batch-rolling-check.cjs` compared
the working tree against a frozen copy of the pre-fix tree in the session scratchpad, which does not survive
the session. The frozen copy still existed; its SHA-1 is exactly the `400779a9…` the fix report recorded (the
report never named the algorithm — it was `shasum`'s default SHA-1, not sha256; the file's sha256 is
`108f72a832df…`). From that verified baseline a **committed golden file** —
`scripts/fixtures/batch-rolling-golden.json`, 1.73 MB, 20,593 lines — now holds the baseline's outputs (or
their digests) for 20,554 aligned fixtures plus the misaligned "before" verdicts the check harness needs, and
`scripts/fixtures/batch-rolling-fix.patch` lets the baseline be rebuilt from the repo alone (`patch -R` on the
current file reproduces both recorded hashes). Both harnesses now depend on nothing outside the repo, FAIL
loudly if the golden is missing, corrupt or the wrong baseline (all three proven), and their broken variants
fail first. Every harness family is green with **true** exit codes, `tsc --noEmit` is clean. One regression
of mine surfaced on the way and is fixed and recorded below (§7).

## 2. `git status` before

HEAD `fc0fddc outreach`. 31 modified, 44 untracked — the collection-times work, the rolling fix and the
wired-printing build, all uncommitted as expected. Full listing (as printed):

```
 M android/app/capacitor.build.gradle   M android/capacitor.settings.gradle
 M app/api/dashboard/action/route.ts    M app/api/dashboard/route.ts        M app/api/events/route.ts
 M app/api/manage/route.ts              M app/api/menu/[truckId]/route.ts   M app/api/orders/submit/route.ts
 M app/api/slots/[truckId]/route.ts     M app/dashboard/[token]/page.tsx    M app/landing/page.tsx
 M app/manage/[token]/page.tsx          M app/trucks/[slug]/order/page.tsx  M components/dashboard/AddOrderPanel.tsx
 M components/printing/PrintingSettings.tsx  M content/store-listing.md    M ios/App/App/Info.plist
 M ios/App/CapApp-SPM/Package.swift     M lib/capacity-breach.ts            M lib/orders/place-in-slot.ts
 M lib/payments/promote-draft.ts        M lib/plan-features.ts              M lib/printing/bleTransport.ts
 M lib/printing/transport.ts            M lib/printing/usePrinting.ts       M lib/slot-availability.ts
 M lib/slot-display.ts                  M lib/slot-generation.ts            M lib/supabase.ts
 M package-lock.json                    M package.json
?? app/api/printing/  ?? docs/{batch-keep-together-investigation,batch-overlap-review,batch-rolling-fix,
   dashboard-order-and-batch-overlap,slot-interval-build,slot-interval-event-override,slot-interval-hardening,
   slot-interval-van-level,wired-printing-build,wired-printing-investigation}-report.md
?? lib/printing/{dashboardPin,netAddress,netTransport,networkGuard,testTicket}.ts  ?? lib/slot-interval.ts  ?? plugins/
?? scripts/_printing-mocks.cjs  ?? scripts/_slot-interval-compile.cjs  ?? scripts/batch-rolling-check.cjs
?? scripts/batch-rolling-identity.cjs  ?? scripts/dev-virtual-printer.cjs  ?? scripts/printing-{copy,dedupe,
   escpos-identity,failure-split,gating,network-guard,transport-contract}.cjs
?? scripts/slot-interval-{dots,engine-identity,event-override,generator,grid-routing,settings,van-list-tolerance,van-resolution}.cjs
?? supabase/migrations/2026091{6_collection,7_van_collection,8_event_collection}_intervals.sql
?? supabase/migrations/20260919_van_network_printer.sql
```

## 3. How the baseline was recovered, and the sha check

- The scratchpad copy **still existed**: `scratchpad/frozen-before/lib/slot-availability.ts` (a full copy of
  `lib/` as it stood before the fix; 187 files). Hashes of that file:
  `sha1 400779a9f67fa1bc5ef95628237459ed8bacd0f3` · `sha256 108f72a832df067c2b3fbf6ca9dff80c059a203bd8e66882d0f4be44e1d8de64`
  · `git blob 08a657e7…`. The report recorded "sha `400779a9…`" — **the SHA-1 matches exactly**. The brief
  asked for a sha256 comparison; the report holds no sha256, so there is nothing for it to mismatch. I did not
  stop: the file is demonstrably the recorded one. Both hashes are now recorded together, in the golden header
  and in the generator's hard-coded gate.
- `frozen-before/lib/orders/place-in-slot.ts` is byte-identical to the current file (the fix never touched it).
- **The reverse-apply path was exercised too**, so tomorrow needs no scratchpad: `git diff --no-index` from the
  frozen file to the current one is saved as `scripts/fixtures/batch-rolling-fix.patch` (127 lines; hunks
  touch only `CookInterval` (`cat?`), `categoryLoadOver`, `projectBackwardOccupancy` (`prepByCat`, the `cat`
  tag, the rolling tone loop) and `fitOrderBackward` (the rolling combined load)). `patch -R -p1` applied to a
  copy of the current `lib/slot-availability.ts` reproduces `sha256 108f72a8…` and `sha1 400779a9…` — verified.

## 4. The golden file

`scripts/fixtures/batch-rolling-golden.json` — **1,816,194 bytes (1.73 MB), 20,593 lines**, sha256 `8bdae817…`.
Generated by `scripts/_batch-rolling-golden-generate.cjs` (underscore = helper, so the `batch-*.cjs` sweep
glob skips it; it refuses to run unless `BATCH_FROZEN_ROOT` points at a baseline whose file hashes to both
recorded values, and unless `BATCH_GUSTO_INPUTS` names the five live-input files).

| Section | What | Count | Stored as |
|---|---|---|---|
| `header` | generator, `generatedAt 2026-09-17T09:11:06Z`, baseline file + description + **sha256 + sha1**, the three seeds and the LCG, counts, the personal-data statement | — | — |
| `grids` | every collection-time grid the fixtures use (from the baseline's `generateCollectionTimes`), keyed `start-end-interval`, so a later change to the generator cannot silently move the fixtures | 40 | full |
| `s31` | the §31 worked examples | 8 | inputs + **full output** + digest |
| `gustoShaped` | seed **7**, batch 2 / prep 5 / kc 2 / 5-minute grid | 300 | inputs + digest; first 3 with full output |
| `sweep1515` | seed **20260917**, batch 8 / prep 15 / kc null / 15-minute grid / 4 event starts; states accepted through the **baseline's** `earliestBackwardFitSlot` walk | 20,000 | inputs (`[start, "HH:MM=n,…", order, digest]`) + digest; first 3 full |
| `aligned240` | seed **99**, prep 5/10/15 on a grid of 1–3× the prep, two categories, kc null or 4–9 | 240 | inputs + digest; first 3 full |
| `gustoLive` | the six real Gusto events with their `production_slot_usage` rows, categories and van, **copied as static fixture data from the fix report's read-only results** | 6 | inputs (all five source rowsets) + full output + digest |
| `checkFixtures` | the baseline's verdicts on the **misaligned** fixtures `batch-rolling-check.cjs` uses as "before": V1 overlap, the V2 18:05 window, kc 8, 10/10, the 20/20 multi-batch case, batch-4/prep-10 @18:35, and the 15/15, 30/30 and 20/20 fit sweeps (480 + 480 + 270 = 1,230 rows) | 1,236 | full `fit` objects |

**Outputs vs digests — a deviation, stated.** The brief asked for the baseline's *outputs* for every aligned
fixture. One full snapshot is 3.6–8.7 KB; all 20,540 seeded cases in full would be ~90 MB, which is not a
file to commit. Every seeded case therefore stores its **inputs in full** and the first 24 hex characters
(96 bits) of the sha256 of its canonical snapshot; the §31 examples, the six Gusto events, the check fixtures
and three worked examples per family store the full output as well, and the harness proves for those examples
that `sha256(stored output) == stored digest == sha256(current snapshot)`, so the digest is demonstrably the
output's. A digest changes on any byte, so the proof is as strong; what is lost is only the ability to *read*
a differing case's old output out of the file — the harness names the first differing index instead.

**The snapshot is one shared definition** — `scripts/_batch-rolling-snapshot.cjs` (`snapshot`, `digest`,
`decodeCase`, the LCG, the grid key) — used by the generator and the harness, so they cannot drift.

**Personal data: none.** The live inputs are event ids and the van id (UUIDs), event dates and times, per-slot
`units_by_cat` totals, five category rows (`name`, `prep_secs`, `batch_size`, `counts_toward_capacity`), the
van's capacity settings and its name "Van1". No customer, order, contact or operator field exists in any of
the five rowsets; the generator refuses any column whose name looks personal.

## 5. Each harness: failure mode → broken variant → real result

### `scripts/batch-rolling-identity.cjs` (rewritten)
- **Failure mode:** the working tree's `projectBackwardOccupancy` / `fitOrderBackward` / `earliestBackwardFitSlot`
  / `buildSlotIndicators` / `detectCapacityBreaches` producing, on any aligned fixture, a snapshot whose digest
  differs from the golden — the rolling sum no longer equalling the same-start sum where the two must be equal.
- **Depends on:** the repo only — the golden file, `lib/`, the repo's `tsc` and `node_modules` (types). The
  broken variant is compiled from a copy of `lib/` in a directory the harness itself creates and removes.
- **Golden missing / unreadable / wrong:** proven to FAIL, never skip — renamed away → `🔴 golden file missing
  or unreadable … ENOENT`, exit 1; truncated JSON → `🔴 … Unexpected token`, exit 1; header with a wrong
  baseline sha → `🔴 golden file is not the pre-fix baseline golden`, exit 1. The golden was restored and its
  sha256 verified unchanged.
- **Broken variant (run first):** `categoryLoadOver`'s overlap test made closed on the left
  (`fromMins <= iv.endMins`), compiled from a patched copy of the working tree, on §31's 3-pizzas example →
  **FAILED as required** (digest differs from the golden while the real engine's matches).
- **Real result:** `✅ 29 ✓, 0 🔴` — §31 8/8; Gusto-shaped 300 (seed 7): 0 differ; 15/15 sweep 20,000 (seed
  20260917): 0 differ; aligned 240 (seed 99): 0 differ; nine full examples digest-consistent; Gusto live
  fixture facts (Pizza 300 s / 2, kc 2, window 5, interval 5) and all six events identical.

### `scripts/batch-rolling-check.cjs` (baseline source replaced; place-in-slot check replaced)
- **Failure mode:** A=8 @18:15 and B=8 @18:20 both accepted on a 5-minute grid with a 15-minute cook; or
  DISPLAY ≠ PICKER; or touching windows refused; or the off-list branch altered so an unrecognised time is no
  longer confirmed unchecked.
- **"Before" now** = the baseline's verdicts recorded in `checkFixtures`; no compile of anything outside the repo.
- **Broken variants (run first):** V1 the baseline's recorded same-start verdict (`fits=true`, "Burgers 8/8" —
  16 on an 8 grill) → FAILED as required; V2 the baseline's 18:05 window label "8/8" vs the picker's "17/8" →
  FAILED as required; V3 closed-interval overlap counts 8 where the helper counts 0 → FAILED as required;
  **V4 (new)** the branch altered to `booked: false` in a copy → the verbatim check fails **and** the fixture
  returns `{"finalSlot":"18:20","booked":false}` → FAILED as required.
- **Real result:** `✅ 31 ✓, 0 🔴`. The durable off-list assertion: the branch
  `if (!startEntry) { return { finalSlot: startSlot, booked: true } }` is present **verbatim**; `placeOrderInSlotLocked`,
  compiled from a copy of `lib/` whose `lib/supabase.ts` is a stub that records every table read and returns no
  rows, confirms a **fixture** off-grid **18:20** on a 15-minute grid (18:00–21:00) as
  `{"finalSlot":"18:20","booked":true}` having read only `[collection_times]` — no `production_slot_usage` read,
  so no capacity check ran; the on-grid control **18:15** goes past the branch (reads `collection_times,
  production_slot_usage, orders, truck_events, menu_items_db, menu_categories`). The recorded sweeps: 15/15 480,
  30/30 480, 20/20 single-batch 270 — 0 differ; the 20/20 multi-batch case before `fits=true`, after `false`.

### `scripts/slot-interval-engine-identity.cjs` (comment only)
- Already durable: it compiles HEAD from a `git worktree` (in-repo) and the working tree, needs nothing from the
  scratchpad. Its delegation comment now points at the committed golden and its real counts (300 / 20,000 / 240
  / 6) instead of "a 100,000-state sweep". Result unchanged: `✅ engine byte-identical on all 10 cases; §31
  facts hold` (V1 cadence-from-interval FAILED as required; the seven symbols and `pileByStart` byte-identical
  to HEAD).

### `scripts/whatsapp-golive-parity-harness.cjs` (needle derived) — see §7

## 6. Other scratchpad / temp / frozen references in `scripts/`

Searched every file under `scripts/` (no extension filter) for `scratchpad`, `claude-501`, `frozen-before`,
`BATCH_FROZEN_ROOT`, `mkdtemp`, `tmpdir`, `/tmp`, `frozen`:

- **Scratchpad path hard-coded:** only the two batch harnesses had it — **removed**. The only remaining
  mentions of `BATCH_FROZEN_ROOT` / `BATCH_GUSTO_INPUTS` are in the one-time generator, which requires them
  explicitly and refuses otherwise.
- **Self-created temp directories (durable):** `_slot-interval-compile.cjs` (tsc output), the two batch
  harnesses (patched copies for broken variants, removed after), `audit-go-live.mjs`, `outreach-channel-for.cjs`,
  `slot-interval-generator.cjs`, five `whatsapp-*` harnesses, `printing-escpos-identity.cjs`,
  `printing-failure-split.cjs` — each makes its own `mkdtemp` and depends on nothing pre-existing there.
  `dev-virtual-printer.cjs` defaults its output to a temp dir it creates; `import-hatchesup-schedule.js` writes
  a debug HTML to `/tmp` (an output, not an input).
- **"Frozen" oracles embedded verbatim in the file (durable):** `outreach-channel-for.cjs` (the pre-extraction
  body), `slot-interval-generator.cjs` (HEAD's generator and the old minute list) — copies inside the harness,
  not external files. `geo-validate.js` uses the word about upsert semantics, not a fixture.
- **Git-based baselines (durable):** `slot-interval-engine-identity.cjs`, `printing-escpos-identity.cjs`,
  `printing-gating.cjs` use `git worktree` / `git show HEAD:` — in-repo.

## 7. A regression found on the way, fixed, and a correction to an earlier report

While sweeping every family with **true** exit codes, `scripts/whatsapp-golive-parity-harness.cjs` exited 1:
`🔴 F1: THE MUTATION DID NOT APPLY`. Its F1 variant appended a bogus footnote after a **literal** copy of
footnote 5's text — `"…a compatible thermal printer (neither supplied)…"` — and the wired-printing build
changed that sentence to "Bluetooth or wired printer" in `lib/plan-features.ts`. The harness had therefore
been failing since that edit. **`docs/wired-printing-build-report.md` §3 says "all pre-existing harnesses
rerun and green … 5 `whatsapp-*`"; that was wrong for this one file.** The sweep loop that produced that claim
printed `$?` inside a string after a `$(basename …)` substitution, which in zsh reports the substitution's
status, not node's — every "exit 0" from that loop shape was unreliable; the ✅/🔴 lines were real, and this
harness's last line happened to be a "✓ FAILED as required" I misread. This task's sweeps record `rc=$?` on
its own line. I have not edited the wired-printing report (outside this brief's file scope); this paragraph
is the correction.

**Fix (test file only):** F1 now derives its needle from the compiled `lib/plan-features.js` in its own build
directory by the sentence's stable prefix (`text: 'Kitchen ticket printing requires the HatchGrab kitchen app
and a compatible …` through the closing `},`) and fails loudly if the footnote is absent. Result:
`✅ all 37 passed` — V1–V3 and F1–F3 all FAILED as required first.

A second, unrelated flake was fixed in `scripts/printing-failure-split.cjs`: its "printer dies mid-stream"
case sent ~1 MB, which under machine load fitted entirely into the loopback buffers before the virtual
printer's RST arrived, so the sender saw success. The stream is now ~8 MB (cannot fit; must stall on the RST);
proven green alone and with `tsc` running alongside.

## 8. The full sweep, true exit codes

`rc=0` for all 29: `batch-rolling-check`, `batch-rolling-identity`, 8 `slot-interval-*`, 7 `outreach-*`,
5 `whatsapp-*`, 7 `printing-*`. `npx tsc --noEmit` → rc 0. (`_batch-rolling-golden-generate.cjs` is a helper,
not a harness; without its env vars it exits 1 by design and the `batch-*.cjs` glob no longer matches it.)

## 9. `git status` after

Same 31 tracked modifications as before **plus** `M scripts/whatsapp-golive-parity-harness.cjs`; the same
untracked set **plus** these new files — **stage the golden and the patch with the fix**:

```
?? scripts/_batch-rolling-golden-generate.cjs     (helper: regenerates the golden from a verified baseline)
?? scripts/_batch-rolling-snapshot.cjs            (helper: the shared snapshot/digest/decode definition)
?? scripts/fixtures/batch-rolling-golden.json     (1.73 MB — the committed baseline outputs)
?? scripts/fixtures/batch-rolling-fix.patch       (the rolling fix as a diff; `patch -R` rebuilds the baseline)
```
`scripts/batch-rolling-identity.cjs` and `scripts/batch-rolling-check.cjs` were already untracked and are
rewritten in place. Nothing under `lib/`, `app/`, `components/` or `supabase/` changed in this task
(`git status` shows the same entries there as before; none of their content was touched).

## 10. Could not establish

- Whether a *different* machine's `tsc` emits `lib/plan-features.js` with the same indentation the F1 needle
  now matches by pattern (`^ *text: …`); the pattern tolerates any indentation, so this is a risk only if tsc
  changed quoting.
- The 20,000-state sample is a sample: the original run covered 100,000; the golden holds 20,000 (the brief's
  minimum) to keep the file at 1.7 MB. The seed and LCG are recorded, so a larger golden can be regenerated
  from the baseline (via the patch) at any time.
- Whether the frozen scratchpad copy will still exist tomorrow — it need not: the patch path reproduces the
  baseline's hashes from the repo alone, and the harnesses never read it.
