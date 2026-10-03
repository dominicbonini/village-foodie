# The places pane scrolls, the upload switch goes, Truck becomes Van, and Menu gets three pills

**3 October 2026 · branch `schedule-graphics` · commit `8cab840`**
**`git branch --show-current` → `schedule-graphics`.** `main` untouched at `deec9f5`.

🔴 **No migration was needed and none was written. No SQL was run.** Every change here is layout,
copy or navigation.

🔴 **The `truck_events` guarantees from `docs/schedule-places-report.md` §3 are untouched** and still
asserted every run: one insert names `truck_place_id`, **zero** updates, insert key set = `cebc78e`'s
plus that one key.

> Nothing in the prompt arrived garbled, and nothing in it contradicted anything else.

---

## 1 · The place list would not scroll — root cause

🔴 **`sm:max-h-[90vh]` is a MAX-height, and a max-height does not make a flex container's height
definite.**

The chain is: modal (`flex flex-col`, `sm:max-h-[90vh]`) → body (`flex-1 min-h-0`) → grid (`h-full`) →
pane (`md:h-full`, `md:overflow-hidden`) → `PlaceList` (`h-full`) → scroller (`flex-1 min-h-0
overflow-y-auto`).

With only a *max*-height the modal's height is **indefinite**, so the body's `flex-1` basis is
content-driven, so **`h-full` further down had nothing to resolve against and fell back to `auto`**.
The pane therefore sized to its own content, the body's `overflow-hidden` clipped whatever stuck out,
and the scroller was exactly as tall as its content — so there was nothing to scroll. Places below the
fold were unreachable, which is exactly what was reported.

**Measured before the fix**, 40 places at 1440×900:

```
modal 810 · pane 1881 · scroller 1760 · content 1760 · overflows false · last reachable false
```

The pane was **more than twice the height of the modal containing it**.

**The fix:** `md:h-[90vh]` on the shell **when the two-pane layout is showing**. ⚠️ Only there — the
edit form and the import modal keep `max-h` alone, so a short modal stays short rather than always
being 90vh tall. The phone is already definite (`h-dvh`) and deliberately scrolls its **body**: step 1
is the whole screen, so there is no form beside the list to keep still.

**Measured after:**

| viewport | modal | pane | scroller | content | overflows | last place reachable |
|---|---|---|---|---|---|---|
| 1440×900 | 810 | **653** | 532 | 1760 | ✅ | ✅ |
| 820×1180 | 1062 | **905** | 784 | 1760 | ✅ | ✅ |
| 390×844 | 844 | 1879 | 1760 | 1760 | — | ✅ *(body scrolls — intended)* |

Also asserted at ≥768: **"+ New place / Tidy up places" stays at the bottom of the pane** (not pushed
below it) and **the search box stays at the top**. Checked in Tidy up by the same lifted classes — it
uses the same `PlaceList`, whose `shrink-0` search and `shrink-0` footer bracket a `flex-1 min-h-0`
scroller.

🔴 **The broken variant reproduces it.** With `md:h-[90vh]` removed, the measurement reports
`modal 810 · pane 1881 · last reachable false` and the harness fails — so the assertion above is
proving something.

⚠️ **Two false starts, recorded because each would have passed on broken code.** The fixture first
hardcoded the shell's height classes, so after the fix landed it went on measuring the *old* shell and
the bug "still reproduced" on fixed code — everything the measurement depends on is now **lifted from
the source**. And `lastReachable` first checked only containment in the *pane*: with the pane 1881px
tall inside an 810px modal, the last row sat inside the pane while being clipped out of sight, and the
metric passed on the broken layout. It now requires containment in the **modal** too.

---

## 2 · The upload switch, and the button that survives

**Removed:** the `One event | Upload schedule` switch from the Add event header, and — with it — the
`addMode === 'upload'` branch **inside that modal**, which was a **second copy** of the upload flow
reachable only through the control that no longer exists.

🔴 **The surviving upload path, which is unchanged:**

| | |
|---|---|
| **Button** | **"✨ Import schedule"** — `app/manage/[token]/page.tsx:8242`, in `ScheduleTab`'s header next to **+ Add event**, with the caption "photo, PDF or text" |
| **What it does** | `setShowImportModal(true)` |
| **Its modal** | `{showImportModal && (` — a **separate** modal, rendered *outside* the `isActive` gate |
| **What it contains** | the whole flow: the drag-and-drop `<input type="file" accept="image/*,.pdf">`, the "Or paste schedule text" box, `processUpload` → `/api/manage/process-schedule`, and `renderScheduleReview` |

**Nothing about the upload flow itself was changed**, and nothing was orphaned by the removal —
`uploadFile`, `uploadText`, `processUpload`, `scheduleDragProps`, `renderScheduleReview` and `addMode`
are all still used by that modal (checked: zero new unused-variable warnings).

🔴 **The modal now keeps one size.** Its width was
`extractedEvents.length > 0 ? 'md:max-w-[980px]' : showPicker ? …` — so an import left in `extractedEvents`
could widen the Add event modal. The `extractedEvents` term is gone: Add event is `md:max-w-[1040px]`,
full stop. ⚠️ `addMode === 'manual'` still guards the sticky footer, because a stale `'upload'` left
over from a previous import would otherwise hide it.

---

## 3 · Every label renamed

Copy only. **No column, option list, predicate or value changed.**

| file | was | now | why |
|---|---|---|---|
| `app/manage/[token]/page.tsx` (Add **and** edit event form — one shared form) | `Truck *` | **`Van *`** | writes `truck_events.van_id`; options come from `truck_vans` scoped to this truck |
| same | `Select a truck` | **`Select a van`** | the placeholder option of that same control |
| `components/manage/VanFilter.tsx` | `All trucks` (dropdown option) | **`All vans`** | every function in the file predicates on `van_id` |
| same | `All trucks` (`vanFilterLabel`) | **`All vans`** | ⚠️ reaches **exported CSVs** via Reports |
| same | `Unknown truck` | **`Unknown van`** | same function |
| same | `aria-label="Filter by truck"` | **`aria-label="Filter by van"`** | |
| `app/manage/[token]/page.tsx` | a comment reading `under "All trucks" ONLY` | `under "All vans" ONLY` | follows the rename |

🔴 **I checked what the filter actually filters before renaming it**, as the brief asked.
`matchesVanFilter(vanId, filter)` compares `van_id`; `VAN_FILTER_UNASSIGNED` means *an event with no
van*; the dropdown lists `vans`. It is a **van** filter that said "trucks" — on a multi-truck account
"All trucks" reads as "all my businesses", which is the opposite of what it does.

⚠️ **Not renamed, because these genuinely mean a truck:** `per truck / month` (billing), `Truck
details` (Settings), `Truck access` (Team), `Truck name` (setup/demo), and every admin-console column.
Asserted by the harness so a future sweep cannot take them with it.

⚠️ **The bulk-import column already said "Van"** (`page.tsx:7895`) — left as it was.

---

## 4 · Menu pills, and every old link redirected

**Removed:** the top-level **Deals** (`id: 'deals'`) and **Extras & Upsells** (`id: 'modifiers'`) tabs.
**Added:** pills inside Menu — **Items** (default) · **Extras & upsells** · **Deals** — in the same
treatment as Schedule's.

🔴 **Each pill renders the existing component, body unedited:** `MenuTab`, `ModifiersTab`, `DealsTab`,
with the same props and the same plan gating as before. The only change is which one is on screen.

### Every old route to those two tabs

| # | surface | before | now |
|---|---|---|---|
| 1 | `?tab=deals` | opened the Deals tab | **Menu with the Deals pill** (`LEGACY_TAB_TO_MENU_SECTION`) |
| 2 | `?tab=modifiers` | opened the Extras tab | **Menu with the Extras & upsells pill** |
| 3 | `lib/walkthrough.ts` → the `'build'` stop, `tabIds: ['deals', 'modifiers']` | highlighted both tabs | **`tabIds: ['menu']`**, copy changed to "Deals, upsells and customisations live under Menu" |
| 4 | `onSwitchTab(…)` | — | **none existed** for either tab (the only call is `onSwitchTab('settings')`) |
| 5 | `setActiveTab('…')` | — | **none existed** for either tab (only billing/menu/payments/schedule/settings) |

🔴 **Item 3 was not cosmetic, and it is the finding of this item.** `Walkthrough` resolves its stops
once at open and **filters out any stop whose `tabIds` match nothing in the live DOM**:

```ts
stops.filter(s => measure(s.tabIds) !== null)
```

Leaving the old ids there would have **silently dropped that step from the tour** — no error, one fewer
stop, and a new operator never told the deals and extras screens exist.

### Badges and counts

⚠️ **Neither retired tab had one.** The tab bar's only special cases are `schedule`
(`pendingApprovalCount`), `payments` (`stripeActionRequired`) and `menu` (`allergensUnverified`, the
`(!)`). **So nothing had to move**, and Menu's own allergens badge is unchanged. Asserted, so a badge
added to Deals later cannot vanish quietly.

### The URL

`?section=extras` / `?section=deals`; **Items writes no param**, so the existing `/manage/<token>` link
opens exactly where it always did. `replaceState`, never `pushState` — the same rule Schedule follows.

🔴 **One `?section=` param serves both tabs, and the values cannot collide:** Schedule's are
`events|weekly`, Menu's are `items|extras|deals`, and each validator recognises only its own. A bare
`?section=deals` also selects Menu (and `?section=weekly` selects Schedule), or it would set a section
on a tab that has none. ⚠️ **A tab with no sections clears the param**, so a `?section=` left over from
Schedule cannot follow the operator onto Reports.

**Phone:** the pills scroll sideways inside their row; the page never does — measured, with a
six-pill control at 320px where the row genuinely overflows.

---

## 5 · Harness results

**`node scripts/run-harnesses.cjs` → 82 run · 82 passed · 0 failed.** `tsc --noEmit` clean.
**ESLint: nothing added** — the one hit inside my diff range (`react-hooks/set-state-in-effect` on the
`?tab=` mount effect) is pre-existing: 8 instances at `cf44818`, 8 now, and my edit only moved that
line.

### `scripts/schedule-graphics-places.cjs` — ✅ **171 checks, 33 broken variants**

New this build: the definite-height class and the `min-h-0` chain · the search/footer `shrink-0`
bracketing · the switch and the duplicate branch gone · **the surviving import button and that it still
carries the whole flow** · one modal size · the Van labels **and** that the filter's logic is untouched
· that truck-meaning labels were *not* renamed · the two tabs gone from `allTabs` · three pills ·
each pill rendering the existing component · both legacy `?tab=` keys mapped · **the walkthrough stop
surviving** · no badge lost · one `?section=` for two tabs · no internal link still targeting the
retired tabs.

### `scripts/schedule-places-render.cjs` — ✅ both engines, identical

| measurement | result |
|---|---|
| 40 places at 1440 / 820 / 390 | last place reachable; footer still on screen; pane footer stays at the bottom |
| **broken variant** (`md:h-[90vh]` removed) | **fails as required** — pane 1881 inside modal 810 |
| menu pills at 1440 / 820 / 390 | one row, row ≤ viewport, no horizontal page scroll |
| **menu pills control** — six pills at 320px | content 700 in a 296 row, **page still does not scroll** |
| breakpoint | 767 one column · 768 two panes (unchanged) |

⚠️ **Five of my own assertions were wrong before they were right**, and each reason is in the file:
the tab-order check still expected **nine** tabs; the "Upload schedule path" check looked for a label
that had just been deleted; `{ id: 'deals',` matches the new **pill** as well as the old tab, so the
retired-tab check had to be scoped to the `allTabs` array; `h-[90vh]` is a **substring of
`max-h-[90vh]`**, which appears 16 times across this file's unrelated modals; and `md:h-[90vh]`
matched **twice** because the comment explaining the fix names the class too. Plus one crash: `rects`
assumed the modal's elements existed and threw on the menu-pill fixture — every modal metric is
guarded now.

---

## 6 · Localhost test list — Village Spice only

🔴 **Localhost uses the PRODUCTION database.** Real rows. **Pizzeria Gusto must not be touched.**

```bash
cd ~/dev/village-foodie
git checkout schedule-graphics && git status      # expect: clean, on schedule-graphics
npm run dev
```

**`http://localhost:3000/login`** first, then `http://localhost:3000/manage/<Village Spice token>`.

1. 🔴 **The scroll fix.** Schedule → **+ Add event**. The left pane lists your places; **scroll inside
   it** — the last place is reachable, the search box stays at the top, and **+ New place / Tidy up
   places** stays at the bottom of the pane. The form on the right does not move.
2. **Cancel and Add event stay on screen** throughout.
3. **Tidy up places** → the same list scrolls there too; **← Back to add event** returns.
4. 🔴 **The upload switch is gone** — the header is just **Add event** and the **×**. Escape still
   closes it.
5. 🔴 **The import button still works.** Close the modal; press **✨ Import schedule** (next to + Add
   event). Its own modal opens with the drop zone and the "Or paste schedule text" box — exactly as
   before. Paste a line of schedule text and check the review screen appears. *(No need to save.)*
6. **The Add event modal is one size** — open it, close it, open the import modal, close it, open Add
   event again: same width every time.
7. 🔴 **"Van", not "Truck".** With **two or more vans** on Village Spice, Add event shows a **Van**
   field with **"Select a van"**. *(With one van the field is hidden, as before.)*
8. **The van filter** on Schedule/Reports reads **"All vans"**. Export a report with a van selected and
   check the filename and the header text say van, not truck.
9. 🔴 **Menu pills.** The tab bar has **no Deals and no Extras & Upsells**. Open **Menu**: pills
   **Items · Extras & upsells · Deals**. Each shows the same screen it always did.
10. **Switch to Deals, reload the page** — it comes back on Deals (`?section=deals`). Press **Back**
    once: you leave the page, you do not walk back through the pills.
11. 🔴 **Old links.** Visit `…/manage/<token>?tab=deals` → **Menu, Deals pill**. Then
    `…?tab=modifiers` → **Menu, Extras & upsells pill**.
12. **The tour still has its step.** Settings → re-run the walkthrough (or the "Show me around"
    strip): the **"Deals and Extras & upsells"** stop is still there, now highlighting **Menu**.
13. **Menu's allergens badge** — if any item has unverified allergens, Menu still shows **(!)**.
14. 📱 **On a phone:** the Menu pills scroll sideways, the page does not. Add event is still the
    two-step sheet.
15. `node scripts/schedule-graphics-places.cjs` → **171 passed**; `node scripts/run-harnesses.cjs` →
    **82/82**.

---

## 7 · Noticed, not changed

- **`?tab=` accepts only the seven surviving ids plus the two legacy keys.** An unknown `?tab=` value
  silently falls through to Menu, as it always has — no "unknown tab" feedback. Pre-existing.
- **The walkthrough's silent-drop behaviour is still there.** It is the right default (a tour must not
  point at a tab a given role cannot see), but it means *any* future tab removal can quietly shorten
  the tour. There is now one harness check pinning this stop; the mechanism itself is unguarded.
- **`vanFilterLabel` reaches exported CSVs**, so files exported before and after this build describe
  the same filter with different words. Nothing can be done about files already on disk.
- **`addMode` can now only ever be `'manual'` in the Add event modal**, so the `addMode === 'manual'`
  guards there are effectively always true. Kept rather than removed because `addMode` is still shared
  with the import modal's flow; collapsing it is a separate tidy-up.
- **The Menu pills do not carry counts.** Neither old tab did either, but Deals or Extras would be
  natural homes for one (e.g. "Deals (3)") if you want it later.
- **`scripts/_outreach-schema-census.cjs` is still named far more narrowly than its contents** —
  unchanged from the last two reports.
- **The phone Add event sheet remains tall** (nine fields plus the picker); the fixed footer is what
  makes that workable.
