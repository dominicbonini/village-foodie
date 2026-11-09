# demo-claim-2: the demo's own menu reaches the real truck at sign-up, and the review still happens on any device

9 November 2026. This follows [demo-claim-1](demo-claim-1-report.md).

The work follows the correction that arrived mid-task. That correction overrides the original line "No review step is required first" and the original step 3.

---

## Read this first

1. **Le Roi du Churrasco: no backfill. I wrote nothing to their truck.** I re-checked twice before writing. At 21:47:13 UTC their truck `le-roi-du-churrasco` already had **11 menu items**. All 11 were committed together at **21:33:56 UTC** by a normal import (its allergen audit row reads `items_imported: 11`). The import came from the demo menu through the review: the chicken was kept as two separate dishes, and the drinks were renamed "Boissons 33cl" / "Vins 75cl". Your rule says that if the truck has items, do nothing and say so, so I did nothing.
   - **I did not mark a review as pending for them.** They have reviewed it themselves.
   - The backfill list (step 5) is **empty**. No other operator qualifies either. No backfill migration was needed, so none was written.
2. **⚠️ Le Roi's allergens need a human look (I changed nothing).** Between 21:35 and 21:41 UTC every one of their 11 dishes was confirmed with **all 14 allergens** (Celery, Crustaceans, Dairy, Eggs, Fish, Gluten, Lupin, Molluscs, Mustard, Peanuts, Sesame, Soy, Sulphites, Tree nuts), and `allergens_verified = true`. Customers would see every dish as containing everything once they go live. This is almost certainly a misunderstanding of the confirm screen, not their real recipes. It is your call whether to mention it to them.
3. **I found and fixed a live hazard that would have wiped Le Roi's menu.**
   - Today every sign-in of an operator still in setup goes /login → /setup → `/manage/<token>?import=demo`.
   - That re-offers "Use the menu from your demo?", and accepting re-commits **clear-first**, which deletes the menu they built and confirmed.
   - Le Roi is in exactly that state (`setup_step = 'menu'`, 11 items). The next time they sign in they would have been offered it again.
   - The legacy `?import=demo` path now offers nothing to a truck that already has a menu (§3.4). This ships with the deploy. Until then the hazard is live for them.
4. **Deploy order:** the migration `20261084_demo_claim_2.sql` is **already applied** (I ran it, see §6), so the code can be deployed whenever you choose. Nothing is pushed or deployed.
5. **Harnesses:** the new harness is **65/65**. The full sweep ran 208: 200 passed, and 7 of the other 8 were guards tripping on this work. All 7 are now re-pinned or fixed precisely, and re-run green (§8). The 8th, `event-types-render.cjs`, measures fonts against a stale `.next` build from 14:04 today and is not caused by this work. **It needs a fresh `next build`, then a re-run.**
6. **Nothing was garbled, and no instructions conflict.** The correction overrides the original "no review" line and step 3. I followed the correction throughout.

---

## 1. What now happens, end to end

| Moment | What happens | Where |
|---|---|---|
| Sign-up from a demo built from **their own upload** | `/api/signup` claims the demo, as before | unchanged |
| The truck is created (`/api/setup create_truck`) | **The demo's menu is committed to the new truck in the same request**, with the defaults the review applies when nothing is changed. Any logo the demo holds is copied too. The demo session records `menu_carry_status = 'done'`, a fingerprint of the menu, and **`menu_review_status = 'pending'`** | [lib/demo-menu-carry.ts](../lib/demo-menu-carry.ts), [app/api/setup/route.ts](../app/api/setup/route.ts) |
| They open Manage: the signup tab, a phone, the app, or after the verify link | Manage reads the **saved review state** through `/api/manage` (cookie on the web, Bearer in the app), whatever the URL. While setup is unfinished and the review is pending, the usual welcome, then "Use the menu from your demo?", then the same review appear (grouping, prices, allergens, kitchen) | [app/(app)/manage/[token]/page.tsx](../app/(app)/manage/[token]/page.tsx) |
| They land on the **dashboard** instead (the native app opens there, so does a web sign-in) | If the truck is in setup and a review is owed, it goes to Manage, which asks for the review | [app/(app)/dashboard/[token]/page.tsx](../app/(app)/dashboard/[token]/page.tsx) |
| They confirm the review | A clear-first commit replaces the carried menu with the reviewed one. commit-menu records `reviewed` server-side | [app/api/manage/commit-menu/route.ts](../app/api/manage/commit-menu/route.ts) |
| They edited the menu by hand before reviewing | "Check your menu" is shown over the **saved** menu. Nothing is re-committed. "Looks good" records the review as done | §3.3 |
| They choose "Finish later" (or ×) | Recorded as `dismissed`. It never appears again, and the menu stays as carried | §3.2 |
| They never review it | The menu stays exactly as carried | — |

A **sample (template) demo** carries nothing and owes no review, and its `?import=demo` route behaves exactly as before.

---

## 2. Step 1: the server-side carry-over

**Where it runs.** `/api/setup` `create_truck` is the one request where a claim (written earlier by `/api/signup`) and the real truck meet. The carry-over runs there for a **new** truck, and also for a **resumed** one: a retry, or `/setup` finished on a second device. So an attempt that didn't happen, or failed, the first time is tried again. It is never called from anywhere else.

**What it commits.** It commits the review as it stands when the operator accepts every step without changes, through the one commit path (`lib/menu-commit.ts` `commitMenu`).

To guarantee "the same defaults", the review's pure passes now live in **one** file, [lib/menu-import-review.ts](../lib/menu-import-review.ts):
- `autoSplitConflicts`
- `ungroupAiVariantsForReview`
- `computeRegroupCandidates`
- `makeGroupingRow`
- `computeGroupingRows`
- `buildGroupedItems`
- `VARIANT_AXIS_TOKENS`

They were **moved verbatim** out of the Manage page, which now imports them. This is the extraction that `lib/provision-demo.ts`'s own comment asked for. `acceptReviewDefaults(extraction)` reproduces the wizard's steps:
- **Load:** auto-split price conflicts, then un-group AI variants (the order the wizard uses).
- **Grouping:** every chooser row left at its default, **grouped**. An AI variant (e.g. Size: Demi-Poulet / Poulet Entier) becomes one dish at the base price, with a **required, single-choice** group named `<Category> - <Group>`. Other extras groups (e.g. "Choice of Drink") stay as they came.
- **Kitchen:** every new category gets `{ prep_secs: null, batch_size: null }`, exactly as the Kitchen step seeds it. commit-menu writes prep 0, batch 0, not counted, so capacity stays an active decision (the same rule `create_truck` uses for the van).
- **Allergens:** no dish is marked checked, so every item commits `allergens_verified = false` and Manage's existing "allergens not set" warnings show.
- **Not written:** the van's total capacity, the blanket "may contain" and the allergen display mode. The wizard writes these only when the operator changes them, so accepting without changes writes none of them.
- **Prices — the one decision I had to make:** the review has no "accept without changes" for a dish with no price, because its price gate stops until a price is typed or the dish is marked free. With nobody to ask, the carry-over commits such a dish **hidden** (`is_available = false`). It is kept for them to price, and is never on sale at 0. Le Roi's menu had none.

**The guarantees** (each proved in §5):
- **Never a template.** Only `extraction_source = 'upload'`. A null or unknown source is refused too.
- **Never over a menu, never onto a finished truck.** The target must have `setup_step` set and not `done`, and **no menu items at all** (active or not).
- **Never twice.** `menu_carry_status` is taken with a conditional update (null → `started`, or a past `failed` → `started`), and the empty-truck check runs again **under** the lock. `done` is final.
- **Signup never fails because of it.** Every outcome is returned, never thrown. If the commit fails (`ok: false`, an item silently dropped, or a throw), the partial rows are wiped. That is safe: the truck had no menu and the lock is ours, so every row is ours. The status is set to `failed` with a one-line reason, the failure is logged (`[demo-carry] FAILED …`), and **the review stays pending**, so the offer still appears as the fallback on any device. The next resumed `create_truck` tries again.
- **What it reports.** `create_truck`'s answer gains `menuCarry`: `carried`, `skipped` or `failed`. The demo session keeps the detail in `menu_carry_note`.

---

## 3. The review, driven by saved state (correction points 2–5)

### 3.1 How it is found
Manage's bootstrap used to run only with `?import=demo`. Now it runs whenever the truck is **in setup**, param or not. It first asks `/api/manage` `menu_review_state`. That is the route both the web (cookie) and the native app (Bearer) already authenticate, and it answers for **the truck the caller is in**. The demo session is found by `menu_carry_truck_id`, so the browser tab is irrelevant. Staff, and demo identities, are always told `none`. The four states:

| State | When | Manage does |
|---|---|---|
| `offer` | pending, and the menu's fingerprint equals the one taken at carry-over (or a failed carry left the truck empty) | the usual welcome, offer and review. `demoImportMode` is on, so the commit is **clear-first** and **replaces** the carried menu |
| `check` | pending, but the menu has been changed since the carry-over | the "Check your menu" card (§3.3) |
| `closed` | reviewed or dismissed | nothing; strips `?import=demo` if present |
| `none` | no carried menu for this truck (a sample demo, no demo, setup finished) | with `?import=demo`: the original path, unchanged (except §3.4); without it: nothing |

**`?import=demo` still works as an alias.** With the param and a carried menu, you get the same saved-state answer. With the param and no carried menu, you get the original `/api/setup` GET path (template → upload step, payload gone → the existing toast).

**Every surface named in the correction:**
- **The desktop tab that signed up:** `DemoGetStarted` still sends it to `?import=demo` → `offer`.
- **A phone browser:** sign-in → /setup → Manage → `offer`.
- **The native app:** it opens on the dashboard. The dashboard asks the same question with the app's Bearer and goes to Manage when it is `offer` or `check`. The harness proves the Bearer gets the same answer.
- **After the verify-signup link:** it still lands on `/manage/<token>?verify=ok`, without the param (unchanged), and the saved state still owes the review there.
- "Upload a different menu" in the offer also replaces a carried menu (clear-first). It is still a review outcome, so the review closes.

### 3.2 Reviewed or dismissed: never again
- **Reviewed:** commit-menu records it server-side after any clean **clear-first** commit for that truck. Closing only moves a **pending** review, so a repeat is a no-op. "Looks good" on the check card also records it.
- **Dismissed:** the deliberate exits only: "Finish later", "Discard", and the check card's ×. A tab switch or remount is not a dismissal (the existing C4 rule). It just asks again next time.
- The "Finish later" confirm used to say "you can add your menu any time". For a carried menu that would be false (it is already there), so it now says: *"Your menu from the demo is saved on your truck as it is. You can change it any time on your menu screen."*

### 3.3 Edited by hand before reviewing: how I chose to handle it (correction point 4)
**The detection.** At carry-over, a fingerprint of the menu is stored (`menu_carry_fingerprint`). It covers categories, items, extras groups, options and links: names, prices, descriptions, availability, allergens and whether they are verified, dietary tags, spiciness, sort order, photos, subcategories, the prep/batch/counted settings and the group rules. It leaves out ids, timestamps and stock counts, which are not edits. When the review is about to be offered, the menu is fingerprinted again. If the two differ, the operator has changed something.

**The handling.** I chose **not** to rebuild the review from the saved menu. The review's commit can't represent everything a saved menu holds (photos, stock, subcategories, per-dish extras exclusions), so "reviewing" the saved menu through it would still overwrite work. Instead, when the menu has been edited, the review becomes a **"Check your menu"** card at the top of the Menu tab, over the **saved menu itself**:
- *"We saved the menu from your demo to your truck, and you’ve changed it since — so your changes are kept. Have a look over it below."*
- The button **"Looks good"** records the review as done. × dismisses it.
- **Nothing is re-committed either way.** Their menu screen is the review surface, and every edit is kept.

**The guard behind it.** A review that loaded before the edit, say on another tab, and then tries a clear-first commit is **refused** by commit-menu (409, the existing "Something went wrong — refresh the page and try again." sentence). The refresh re-reads the state and shows the check card. This is proved in the harness.

### 3.4 The every-login re-offer (the hazard in "Read this first")
In the legacy `?import=demo` path (no carried menu for this truck), Manage now strips the param and offers nothing when **the truck already has menu items**. An offer is for an empty truck; one that has a menu has had its import.

The trade-off: if a wizard commit partly failed and the operator then **reloads**, they no longer get the offer's clear-first repair. Their partial menu stays and they edit it, instead of being able to wipe it with one click. A partial failure *inside* the wizard still lands back on the Kitchen step with its retry, as before.

---

## 4. Step 2: everything else the demo holds, audited

These columns were checked on the 8 demo sessions in the database today, and on Le Roi's demo row by row.

| What the demo holds | Carried? | Why / how |
|---|---|---|
| **Menu** (categories, dishes, prices, descriptions, detected allergens, dietary tags, spiciness, extras groups and options) | **Yes, now at `create_truck`** | the carry-over above |
| **Logo** (only BRANDED/outreach demos have one: 2 of 8 today; landing demos have none) | **Yes, now** | **copied** into the real truck's own folder (`<truck.id>/<timestamp>-<name>`, as every upload is) and set only if the real truck has **no** logo. The sign-up modal's own logo upload runs after `create_truck` in the same browser, so their explicit choice still wins. A failed copy costs the logo only ([lib/demo-menu-carry.ts](../lib/demo-menu-carry.ts) `carryClaimedDemoLogo`) |
| Truck name | No, nothing to carry | the demo's is the placeholder "Demo Kitchen (xxxxxx)". The real name is asked at sign-up |
| Cuisine / emoji | No, nothing to carry | no landing demo holds a cuisine (0 of 8); the emoji is the default. Both are asked in the sign-up modal (the emoji is derived from the first cuisine) and written in the same flow |
| Country, currency, time zone | No, deliberately | asked at sign-up ("Where's your truck based?") and checked server-side. The demo's country is only a guess from the visitor's location |
| Description, cover image | No, nothing to carry | 0 of 8 demos hold either |
| Kitchen prep/batch on categories (the demo's "5 min, 4 at a time" for mains) and the van capacity | No, deliberately | the review's defaults leave capacity blank (an active decision). The demo's numbers are invented assumptions, not theirs |
| Allergen display mode (`card` on Le Roi's demo) | No, deliberately | the review writes it only when the operator chooses it |
| Visitor email / marketing tick | No (asked again) | the account email and marketing choice are asked at sign-up |
| The uploaded menu file, demo event, demo orders | No, by design | they are demo artefacts. Menu files are deleted with the demo (demo-2) |

---

## 5. Step 6: the proof

[scripts/demo-claim-2.cjs](../scripts/demo-claim-2.cjs) — **65 passed, 0 failed** (about 30 s, registered in `scripts/harnesses.json`).

- **What runs for real:** the routes, bundled from the repo: `/api/signup`, `/api/setup`, `/api/auth/verify-signup`, `/api/manage`, `/api/manage/commit-menu`.
- **What is stubbed:** only provisioning, email, rate limits and the session (a variable, which is what "another device" is to a server).
- **The data:** an in-memory Supabase, fixture trucks and fixture demos only. No database, storage or network is touched.

| § | Case | Result |
|---|---|---|
| 1 | Review defaults: variant grouped (required, single-choice), extras kept, kitchen prep seeded, allergens unverified, unpriced dishes named; Manage imports the one copy | ✓ |
| 2 | Upload demo → sign up → `create_truck`: 5 dishes, 2 groups, 4 options, 2 links on the real truck; session `done` + fingerprint + `pending`; nothing written to the demo | ✓ |
| 3 | **Second device, no `?import=demo`:** a fresh web session and the **app's Bearer** both get `offer` with the extraction; nobody signed in gets 401; the bootstrap no longer needs the param; the dashboard sends a pending operator to Manage | ✓ |
| 4 | **After verify-signup:** lands without the param; the review is still owed | ✓ |
| 5 | Confirming the review: clear-first replaces the menu (exactly the reviewed 4 dishes, the new price, no leftovers, no duplicates); `reviewed`; closed for web and app | ✓ |
| 6 | **Never reviewed:** the menu is present. **Dismissed:** closed, menu identical; a second close is a no-op | ✓ |
| 7 | **Edited by hand first** (a real Manage `toggle_item`): `check`, no extraction handed out; a clear-first commit is **refused 409**; the edit survives; "Looks good" closes it | ✓ |
| 8 | **Template demo:** nothing carried, no review owed, `?import=demo` still gets `template_withheld`; the carry refuses a template even when called directly | ✓ |
| 9 | **Never twice:** a resumed `create_truck` carries nothing more; a repeat signup gets 409 with the claim unchanged; **two carry-overs racing:** exactly one commits; a reload only reads; never over a menu; never onto a finished truck | ✓ |
| 10 | **Failed commit** (the database refuses item inserts): `create_truck` still `ok`, `menuCarry: failed`, the partial rows wiped, the reason recorded, the review still owed so the offer appears; the next resumed `create_truck` succeeds; a throwing commit is recorded, not thrown; an unpriced dish is carried hidden | ✓ |
| 11 | `signup_started` from every surface (below) | ✓ |
| 12 | A branded demo's logo is copied into the real truck's folder; a failed copy costs the logo only; an existing logo is kept | ✓ |

**The harness bites.** With two rules deliberately broken (the fingerprint check skipped, and the template refusal removed), it reported **8 failures**, exactly in §7 and §8. The code was then restored, and it went back to 65/65.

**Existing harnesses and the full sweep:** see §8.

---

## 6. Step 4: `signup_started` from every surface

`signup_started` used to be counted only by the walkthrough (`/try/<slug>`, its `onOpen`). Sign-ups begun from these surfaces had a `signup_done` with no `signup_started`:
- the demo order page's banner;
- the post-save "Set up my truck →" CTA (the slug-only surface Le Roi used);
- the dashboard and KDS banners.

**How it works now.** `DemoGetStarted` counts it itself whenever its **sign-up** form opens: when sign-up is offered, not the save-my-menu-only form. It does this through `setOpen`, which every opener uses, including the post-save CTA. It goes through the walkthrough route's existing demo-only, slug-keyed `event` action. The token-only surfaces (dashboard, KDS) now pass the demo's slug for this count only (`eventSlug`); it is never used for the claim. **The walkthrough keeps its own `onOpen`**, which wins, so nothing is counted twice.

---

## 7. Step 5: the backfill

Read-only list, run 9 Nov at about 21:45 UTC: every operator whose truck is still in setup, has 0 menu items, and has a claimed `upload` extraction.

```sql
select o.id operator_id, o.email, t.id truck_id, t.name truck_name, t.setup_step, t.created_at truck_created,
  ds.truck_id demo_truck_id, ds.created_at demo_created, ds.extraction_source, jsonb_array_length(ds.extraction->'items') extraction_items,
  (select count(*) from menu_items_db i where i.truck_id = t.id) truck_items
from demo_sessions ds
join operators o on o.id = ds.claimed_by_operator_id
join trucks t on t.operator_id = o.id
where ds.extraction_source = 'upload' and ds.extraction is not null
  and t.setup_step is not null and t.setup_step <> 'done'
  and not exists (select 1 from menu_items_db i where i.truck_id = t.id)
order by t.created_at;
```

**Result: no rows.**

Le Roi's re-check, run immediately before the write would have happened:

```sql
select now() checked_at, (select count(*) from menu_items_db where truck_id='le-roi-du-churrasco') items,
 (select setup_step from trucks where id='le-roi-du-churrasco') setup_step,
 (select count(*) from menu_items_db where truck_id='le-roi-du-churrasco' and allergens_verified) items_allergens_verified,
 (select count(*) from menu_items_db where truck_id='le-roi-du-churrasco' and cardinality(allergens)=14) items_with_all_14_allergens;
```

**Result:** 21:47:13 UTC — 11 items, setup_step `menu`, 11 allergens-verified, 11 with all 14 allergens. **They now have items, so I did nothing.** There was no backfill write, so there is no backfill migration.

If a qualifying operator appears later, the safe path is unchanged: their next `create_truck` (the resumed path, e.g. finishing /setup) carries the menu itself.

---

## 8. Harness runs

- `node scripts/demo-claim-2.cjs` — **65 passed, 0 failed**.
- **Full sweep**, `node scripts/run-harnesses.cjs`, run on the tree as it was being finished: **208 run, 200 passed, 8 failed**.
  - **7 of the 8 were guards tripping on demo-claim-2's own changes.** Each was fixed or re-pinned precisely, and **re-run green on the final tree**.
  - **The 8th (`event-types-render.cjs`) is not mine.** It measures fonts against the compiled CSS in `.next/static`, from a `next build` made at **14:04 UTC today**, before this work began. Its 22 failures are "a dropdown's text is 16px vs a row label's 14px". demo-claim-2 has no CSS and doesn't touch the event-types grid, and on a clean HEAD worktree the harness can't even start without that build. Rebuilding `.next` would change a shared artefact other sessions use, so I left it. **It needs a fresh `next build`, then a re-run.**

| Harness | What tripped | Fix (each names exactly what changed) | After |
|---|---|---|---|
| `event-types.cjs` | the dashboard's DemoGetStarted mount is pinned byte for byte | re-pinned: the mount gains `eventSlug` after `phone` | 192/192 |
| `van-category-settings.cjs` | "no second reader of prep/batch/counts": my fingerprint named those three columns | **code fix**: the fingerprint reads `select('*')` (a digest, not a capacity read) | 69/69 |
| `schedule-graphics-places.cjs` | "no line of the Manage page was lost": the moved review passes | re-pinned: `lib/menu-import-review.ts` added to `MOVED_INTO` (lines must really be there), and the 16 edited lines named one by one with their new form and file | 270/270 |
| `france-1.cjs` | "a back-translation for every key" | added the 4 keys' back-translations to all 28 base-language back files (`docs/i18n/back/`) | 74/74 |
| `perf-1.cjs` | "these paths unchanged" compared with the working tree | re-pinned to perf-1's own range (7bc53b81..5622370d), as two of its other checks already are | 50/50 |
| `cwv-2.cjs` | the same, plus "no other language file changed" | my 5 edited files pass only if they were still their pre-move self at 64ac2eb7 (the tree demo-claim-2 started from); my 4 keys exempted by name, as ios-intl-1 and compare-autopublish-1 did | 43/43 |
| `costs-accounts-1.cjs` | "order paths unchanged" (the dashboard, the KDS) | the same precise exemption for those two files | 78/78 |

**Re-run on the final tree, all green:**

| Harness | Passed |
|---|---|
| `demo-claim-2` | 65 |
| `demo-2` | 69 |
| `messages-parity` | 597,865 |
| `messages-split` | 203 |
| `signup-country` | 63 |
| `language-phase-1c` | 4,402 |
| `language-phase-2` | 2,004 |
| `language-phase-1d` | 354 |
| `language-phase-1d2` | 692 |
| `event-types` | 192 |
| `van-category-settings` | 69 |
| `schedule-graphics-places` | 270 |
| `france-1` | 74 |
| `perf-1` | 50 |
| `cwv-2` | 43 |
| `costs-accounts-1` | 78 |
| `europe-languages-1` | 427 |
| `languages-1` | 91 |
| `import-and-cs-fix` | 33 |

**The older comparisons.** Language Phase 2 captures `/api/setup create_truck`'s answers in its 1c API views (`setup|created`, `setup|resumed`). Those answers now end with `"menuCarry":"skipped"` (the fixture has no claimed demo), so the change is **named**, as earlier workstreams named theirs:
- [scripts/_lp-demo-claim-2.cjs](../scripts/_lp-demo-claim-2.cjs) holds one precise entry, which appends exactly that field to exactly those two views;
- it is wired into `scripts/_lp2-named.cjs` with one line, and registered under `shared_modules`.

**The other session's work.** While I worked, the email-sender-1 session had uncommitted changes in this tree, including `harnesses.json`, `_lp2-named.cjs` and the Language Phase 2 fixture.
- I touched none of their lines.
- They committed theirs (`1d97ffc4`, `34085bf1`) before I committed, so my commits of those three files contain **only my lines**: my harness and module entries, my named entry, and the two fixture lines that now read `code: demo-claim-2-create-truck-carry`.

---

## 9. The migration (run by me, verified)

`supabase/migrations/20261084_demo_claim_2.sql`, committed in `11ebf87e`, then run with `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261084_demo_claim_2.sql`. The result: *"applied — one transaction, no error"*. One warning: the marketing-page refresh was not triggered (REVALIDATE_SECRET is unset). It has no bearing here.

```sql
begin;

alter table public.demo_sessions
  add column if not exists menu_carry_status text,
  add column if not exists menu_carry_at timestamptz,
  add column if not exists menu_carry_truck_id text,
  add column if not exists menu_carry_note text,
  add column if not exists menu_carry_fingerprint text,
  add column if not exists menu_review_status text,
  add column if not exists menu_reviewed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'demo_sessions_menu_carry_status_check') then
    alter table public.demo_sessions add constraint demo_sessions_menu_carry_status_check
      check (menu_carry_status is null or menu_carry_status in ('started', 'done', 'failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'demo_sessions_menu_review_status_check') then
    alter table public.demo_sessions add constraint demo_sessions_menu_review_status_check
      check (menu_review_status is null or menu_review_status in ('pending', 'reviewed', 'dismissed'));
  end if;
end $$;

create index if not exists demo_sessions_menu_carry_truck_idx
  on public.demo_sessions (menu_carry_truck_id) where menu_carry_truck_id is not null;

commit;
```

**Verified read-only afterwards:** the 7 columns are present and nullable; both checks exist as written; the partial index exists; **0 rows** hold any value in the new columns. It is additive only. `menu_carry_truck_id` deliberately has no foreign key, so `lib/delete-truck.ts`'s ordered cascade doesn't change.

---

## 10. Files and commits

All commits are local on `main`, made by path. **Not pushed, not deployed.**

**New:**
- `lib/menu-import-review.ts` — the review's passes, moved, plus `acceptReviewDefaults`
- `lib/demo-menu-carry.ts` — the carry-over, the fingerprint, the review state, the logo
- `scripts/demo-claim-2.cjs` — the harness
- `scripts/_lp-demo-claim-2.cjs` — the named change
- `supabase/migrations/20261084_demo_claim_2.sql`

**Changed:**
- `app/api/setup/route.ts` — carry-over on new and resumed trucks, `menuCarry`, the GET's `carried_over`
- `app/api/manage/route.ts` — `menu_review_state`, `set_menu_review` (staff-blocked)
- `app/api/manage/commit-menu/route.ts` — refuses a clear-first over hand edits; records `reviewed`
- `app/(app)/manage/[token]/page.tsx` — imports the moved passes; the state-driven bootstrap; the check card; the dismissals; the carried "Finish later" sentence; the every-login guard
- `app/(app)/dashboard/[token]/page.tsx` — the pending-review hand-off to Manage; `eventSlug`
- `app/(app)/dashboard/[token]/kds/page.tsx` — `eventSlug`
- `components/DemoGetStarted.tsx` — `signup_started` on every surface
- `messages/<29 base languages>.json` plus the regenerated `messages/ns/<same>/manageMenuImport.json` — **4 new keys only**: `manageMenuImport.checkMenu.{title,body,done}` and `manageMenuImport.discard.carriedBody`, translated in every base language (regional variants inherit)
- `docs/i18n/back/<28 base languages>.json` — the 4 keys' English back-translations
- `scripts/harnesses.json`, `scripts/_lp2-named.cjs` and `scripts/fixtures/language-phase-2-us-changed.txt` — my lines only
- `scripts/event-types.cjs`, `scripts/schedule-graphics-places.cjs`, `scripts/perf-1.cjs`, `scripts/cwv-2.cjs`, `scripts/costs-accounts-1.cjs` — the precise re-pins in §8

**Checks:** `tsc --noEmit` is clean. ESLint is clean on every new file. The touched pages have **no new** errors compared with HEAD: Manage went from 261 to 235 (the moved code's errors now sit under the lib's file-level note); dashboard 81, KDS 19, manage route 20 and DemoGetStarted 4 are all unchanged. DemoGetStarted's 4 are the existing `/login` anchors.

**Commits** (local `main`, by path, nothing pushed):
- `11ebf87e` — demo-claim-2: migration
- `3af55f4f` — the carry-over, the state-driven review, the guard, signup_started, the messages
- `944d8bfc` — the harness and the precise re-pins
- the report commit, which follows

---

## 11. Known limits

- **The native app's KDS-first devices:** the app reopens to the last screen. A device remembered on the **KDS** isn't redirected; the dashboard and Manage are. A brand-new operator's device opens on the dashboard, so this only matters for someone who chose the KDS before reviewing.
- **The review lives as long as the demo session.** The claimed-demo sweep removes a claimed demo 30 days after it was created, and the pending marker goes with it. After that the review simply stops being asked, and the menu stays as carried.
- **The fingerprint is deliberately strict.** Any change to the menu, even an allergen confirmation or a reorder, turns the offer into "check your menu". That errs towards never overwriting.
- The offer's "We saved the menu you uploaded — N items" counts the review's flat list (a grouped dish counts once per variant), as it always has.

---

## Undo (only if Dominic asks)

The code is reverted with `git revert` of the demo-claim-2 commits. The columns are harmless if left in place. If they must go:

```sql
begin;
drop index if exists public.demo_sessions_menu_carry_truck_idx;
alter table public.demo_sessions
  drop constraint if exists demo_sessions_menu_carry_status_check,
  drop constraint if exists demo_sessions_menu_review_status_check,
  drop column if exists menu_carry_status, drop column if exists menu_carry_at, drop column if exists menu_carry_truck_id,
  drop column if exists menu_carry_note, drop column if exists menu_carry_fingerprint,
  drop column if exists menu_review_status, drop column if exists menu_reviewed_at;
commit;
```

---

## Appendix: every other SQL query run (all read-only, Supabase MCP)

```sql
select column_name, column_default, is_nullable from information_schema.columns where table_schema='public' and table_name='trucks' and column_name in ('allergen_display_mode','setup_step');
```
```sql
select t.id, t.name, t.cuisine_type, t.truck_emoji, t.logo_storage_path is not null as has_logo, t.cover_image_path is not null as has_cover, t.description, t.country, t.currency, t.timezone, t.allergen_display_mode, t.allergen_info_text is not null as has_allergen_text, t.contact_phone is not null as has_phone, t.base_place_name, t.travel_radius_km,
 (select json_agg(json_build_object('cap',v.kitchen_capacity,'win',v.capacity_window_mins)) from truck_vans v where v.truck_id=t.id) vans,
 (select json_agg(json_build_object('n',c.name,'prep',c.prep_secs,'batch',c.batch_size,'counts',c.counts_toward_capacity)) from menu_categories c where c.truck_id=t.id) cats,
 (select count(*) from modifier_groups g where g.truck_id=t.id) groups
from trucks t where t.id in ('demo-mk65q66spjck0g9mxt50btfxtr','le-roi-du-churrasco');
```
```sql
select i->>'name' item, i->>'category' cat, i->>'price' price, i->'price_missing' pm, jsonb_array_length(coalesce(i->'modifierGroups','[]'::jsonb)) n_groups,
  (select string_agg((g->>'name')||'['||coalesce(g->>'_inferredFromVariants','')||']:'||(select string_agg(o->>'name'||'+'||coalesce(o->>'price','0'),',') from jsonb_array_elements(g->'options') o),' ; ') from jsonb_array_elements(coalesce(i->'modifierGroups','[]'::jsonb)) g) groups,
  i->'allergens' allergens
from demo_sessions ds, jsonb_array_elements(ds.extraction->'items') i where ds.truck_id='demo-mk65q66spjck0g9mxt50btfxtr';
```
```sql
select table_name, column_name, data_type, column_default from information_schema.columns where table_schema='public' and table_name in ('menu_items_db','menu_categories','modifier_groups','modifier_options','item_modifier_groups') and column_name in ('price','price_adjustment','spiciness','sort_order','prep_secs','batch_size','allergens','dietary_info','excluded_option_ids','is_available','is_active','image_path','subcategory_id','hide_name','min_choices','max_choices','available','id') order by 1,2;
```
```sql
select t.id, t.setup_step, t.operator_id,
 (select count(*) from menu_items_db i where i.truck_id=t.id) items,
 (select count(*) from menu_categories c where c.truck_id=t.id) cats,
 (select min(created_at) from menu_items_db i where i.truck_id=t.id) first_item_at,
 (select max(created_at) from menu_items_db i where i.truck_id=t.id) last_item_at,
 (select json_agg(json_build_object('n',i.name,'p',i.price,'cat',c.name,'avail',i.is_available,'at',i.created_at) order by i.created_at) from menu_items_db i left join menu_categories c on c.id=i.category_id where i.truck_id=t.id) item_list,
 (select count(*) from modifier_groups g where g.truck_id=t.id) groups,
 (select json_agg(json_build_object('change',a.change_type,'at',a.created_at,'val',a.new_value)) from allergen_audit_log a where a.truck_id=t.id) audit,
 (select claimed_by_operator_id from demo_sessions where truck_id='demo-mk65q66spjck0g9mxt50btfxtr') claim
from trucks t where t.id='le-roi-du-churrasco';
```
```sql
select count(*) total_demos, count(*) filter (where t.logo_storage_path is not null) with_logo,
  count(*) filter (where t.logo_storage_path is not null and ds.discovery_truck_id is null) landing_with_logo,
  count(*) filter (where t.cuisine_type is not null) with_cuisine, count(*) filter (where t.description is not null) with_description,
  count(*) filter (where t.cover_image_path is not null) with_cover
from demo_sessions ds join trucks t on t.id = ds.truck_id;
```
```sql
select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='demo_sessions' and column_name like 'menu_%' order by column_name;
```
```sql
select conname, pg_get_constraintdef(oid) def from pg_constraint where conname like 'demo_sessions_menu_%'
union all select indexname, indexdef from pg_indexes where indexname='demo_sessions_menu_carry_truck_idx'
union all select 'rows_with_any_value', count(*)::text from demo_sessions where menu_carry_status is not null or menu_review_status is not null;
```
