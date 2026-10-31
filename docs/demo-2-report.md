# demo-2 — the new demo (31 October 2026)

What changed: the landing demo now asks for an email first. The visitor then orders from their own menu as a customer, watches that order arrive on the kitchen screen with a guided walkthrough, and is offered "Start free". There are no seeded orders. Uploaded menus are kept in a private bucket, and Admin can see them until the demo expires. Admin › Demos shows simple funnel counts.

Nothing is deployed, pushed or committed. No database change was run: the migration below is **NOT RUN**. No Vercel variable was changed.

---

## STEP 0a — Is self-serve signup live? **No.**

| What | Evidence |
|---|---|
| The server gate `SIGNUP_PUBLIC` is not `'true'` in Production | `POST https://www.hatchgrab.com/api/signup` → **HTTP 403** `{"ok":false,"error":"Sign-up isn’t open yet.","code":"signup_closed"}`. The probe used an address that already has an account (checked first, query 1 below), so it could not have created anything even if signup had been open. |
| The client flag `NEXT_PUBLIC_SIGNUP_PUBLIC` was not `'true'` when Production was built | The live order-page chunk (`/trucks/demo-xqgxma7hexysse3qwx0714vxc7/order` → `chunk_ce5580d3a23d98ee.js`) contains `("true"===t.default.env.NEXT_PUBLIC_SIGNUP_PUBLIC‖y)&&!!e`. When the variable is set at build time, Next inlines the literal string. Seeing the unresolved `env.NEXT_PUBLIC_SIGNUP_PUBLIC` means it was **unset at build**, so `canSetup` is false for every non-admin visitor and the demo offers "Save my menu". |

**What Dominic must change (in this order):**

1. **The signup email sender first.** `lib/email-signup.ts` sends from `EMAIL_FROM_ADDRESS || hello@hatchgrab.com`. With the variable unset, Brevo rejects `hello@hatchgrab.com` as unverified, and `/api/signup` still answers `{ok:true}`. The operator sees success but never gets the activation link. The manual's V11.14 and open-item 17 say neither signup flag may flip until this is fixed. Either set `EMAIL_FROM_ADDRESS` (Production, and Preview if you test there) to a Brevo-verified sender, such as `hello@villagefoodie.co.uk` (the address the other transactional mail already uses), or verify `hatchgrab.com` in Brevo.
2. **Vercel › Settings › Environment Variables, Production** (and Preview if you want to test there first):
   - `SIGNUP_PUBLIC` = `true`: the real gate, read at request time by `/api/signup`.
   - `NEXT_PUBLIC_SIGNUP_PUBLIC` = `true`: decides which button the demo shows. It is **baked in at build time**.
3. **Redeploy.** This is required, because a `NEXT_PUBLIC_*` change does nothing until a new build. Use "Redeploy" on the latest Production deployment, and untick "use existing build cache" to be safe.
4. Check: on a demo, "Start free for 3 months, keep my menu" should show instead of "Save my menu". `POST /api/signup` with a new address should no longer return 403.

**Any other reason it is still off:** the manual says Dominic wants it on (open-item 17). The only recorded blocker is the sender above. Onboarding-spec **G11** rides on the same flag and is still present: the KDS mounts `DemoGetStarted` without `isAdmin` or `extractionSource`. It is latent while the flag is off and should be closed in the same change (docs/demo-kds-report.md). demo-2 removes the outreach path's dashboard link, so a prospect no longer lands on the KDS from `/demo/<ref>`, which shrinks G11's reach. It does not fix G11.

## STEP 0b — Every problem stopping a demo visitor from becoming a customer

1. **Signup is closed** (0a). Every visitor got "Save my menu", which collects an email and keeps the demo for 14 days but creates no account. Fixed by Dominic's steps above. demo-2 handles both states (STEP 3).
2. **The signup email is not delivered** (0a step 1). The account is created and `/api/signup` reports success, but the activation link never leaves. Verification **gates nothing** (`email_confirm:true`; the operator is signed in at once), so this is not a hard stop: the operator can carry on in the wizard. But they get no welcome or activation mail and no record of their login address. Fix: the sender.
3. **The wizard has only been exercised on localhost with fixtures.** `DemoGetStarted`'s in-modal wizard (account → details → `/api/setup create_truck`) and the `/setup` fallback have harness coverage only. No real account has been created through them on Production, because the path has never been open there. This needs a real end-to-end run on Production after the flip, with a throwaway address on a throwaway demo (not a live trading truck).
4. **The `?import=demo` carry-over needs a claimed demo.** After the truck is created, the wizard goes to `/manage/<token>?import=demo`. The import wizard pre-loads the demo's stored extraction **only for a demo this account claimed** (`demo_sessions.claimed_by_operator_id`). Before demo-2, the claim was keyed on the demo's **dashboard token**. The new walkthrough never holds the token (the brief forbids it in public URLs), so without a change the claim, and with it the menu carry-over, would silently not happen. **Fixed:** `/api/signup` now also claims by the demo's **slug**, and a slug claim only takes a demo nobody has claimed yet (a slug is more public than a token).
5. **The claim must happen before the sweep.** The cleanup sweep deletes an expired, unclaimed demo, along with its extraction and now its stored menu. A visitor who builds a demo and signs up 25 hours later finds the menu gone unless they used Save my menu (14 days). This is expected and matches the privacy text. The demo email now gives them the link and the deletion date.
6. **The trial starts at truck creation.** `provisionTruck` writes `trial_expires_at` (the plan's `trial_months` after the provisioning day, end of day in the truck's zone) when `create_truck` runs. It does not wait for verification or a go-live. There is nothing to fix, but "Start free for 3 months" is literally true only from that moment. The button reads its month count from the plan catalogue (`trialMonthsOf(signupDefaultPlan(...))`), not a literal.
7. **The order page's demo path asked for the visitor's email.** The demo order form required an email, and `/api/orders/submit` refused an order without one. This was a dead end for a prospect who just wants to see their menu work, and it sent a real confirmation email to whatever they typed. **Fixed:** a demo order needs no email (keyed on the `demo-` identifier and confirmed on the truck row), the name defaults to "Alex", a payment panel replaces the card step, and no email is sent.
8. **The demo was full of fake orders.** Each build and each restart seeded 36–80 orders, so the visitor's own order was buried on the kitchen screen. **Fixed:** no seeding on a build, on T1/T2 or on "Start a new service".
9. **The outreach link exposed the dashboard token.** `/demo/<ref>` redirected to `/dashboard/<token>`, putting the credential in the address bar, history and any shared link. **Fixed:** it now redirects to `/try/<slug>`.

---

## Files changed

**New**
- `supabase/migrations/20261052_demo_2.sql`: **NOT RUN** (below).
- `lib/demo-events.ts`: the ten steps, `recordDemoEvent` (refuses a non-demo id, never throws; callers await it), `demoFunnel` (distinct demos per step).
- `lib/demo-menu-files.ts`: the private bucket `demo-menus`: save under `<truck_id>/`, list, delete (returns the count), and a 60-second signed link.
- `lib/demo-link-email.ts`: the "here is your demo" email (Brevo, the verified `HATCHGRAB_SENDER`, in the demo's language, with `/try/<slug>` and the deletion date; never the token).
- `app/api/demo/walkthrough/route.ts`: the walkthrough's API, keyed by **slug**. GET returns only the orders whose keys this browser holds. POST supports `open` (restart an ended service, empty; count `menu_viewed`; return the source, trial months and truck name), `start_cooking`, `ready` (no email) and `event` (`signup_started` only).
- `app/try/[slug]/layout.tsx`, `app/try/[slug]/page.tsx`: the walkthrough page (noindex).
- `components/demo/DemoWalkthrough.tsx`: phone and laptop layouts (below).
- `app/api/admin/demos/route.ts`: Admin › Demos data (admin only, 404 otherwise): rows, funnel and a signed file link.
- `components/admin/DemosTab.tsx`: the tab: date and source filters, ten funnel tiles, a table (cards on a phone), and view/download per menu file.
- `lib/i18n/catalog/demoWalk.ts`, `lib/i18n/catalog/demoLinkEmail.ts`, `messages/ns/<locale>/demoWalk.json`, `messages/ns/<locale>/demoLinkEmail.json`: generated by `scripts/split-messages.cjs`.
- `scripts/demo-2.cjs` (registered), `scripts/demo-2-screens.cjs` (in `needs_a_browser`), `scripts/_demo2-named.cjs` (shared module).

**Changed**
- `app/api/demo/route.ts`: email required and format-checked **before** the 5-an-hour limit; stores the email and tips choice; files the menu; counts the steps; emails the link after the build; answers `/try/<slug>`. The token is no longer in the response.
- `app/api/admin/provision-demo/route.ts`: outreach builds file the menu and count as `outreach`. No email asked.
- `app/demo/[ref]/route.ts`: `/demo/<ref>` → `/try/<slug>`.
- `app/api/orders/submit/route.ts`: a demo order needs no email; counts `order_placed`.
- `app/trucks/[slug]/order/page.tsx`: the demo path: banner sentence, step label, no email field, "Alex", the payment panel, and handing the order key to the kitchen.
- `app/api/signup/route.ts`: claims by token **or** slug; counts `signup_done`.
- `app/api/cron/demo-cleanup/route.ts`: deletes stored files with each demo; logs `files_deleted`.
- `app/api/admin/delete-truck/route.ts`: deleting a demo deletes its files.
- `app/admin/page.tsx`: the 🧪 Demos tab.
- `app/dashboard/[token]/page.tsx`: DemoWelcome and DemoLoopComplete unmounted; the restart clears the retired browser flags.
- `components/DemoGetStarted.tsx`: `setupLabel`, `prefillEmail`, `onOpen`; claims by slug when there is no token.
- `components/DemoModeBanner.tsx`: one component, now with an optional `message`. With a message, the sentence and its button are laid out as a row, so the text never runs under the button. Without one it is exactly as before.
- `components/landing/DemoUpload.tsx`: the email step.
- `lib/demo-board-build.ts`: **rewritten**. The old welcome/loop browser flags are replaced by this tab's order keys and email (sessionStorage), plus `forgetRetiredDemoFlags`.
- `lib/demo-session.ts`: `isDemoEmail`, `recordDemoVisitorEmail`.
- `lib/provision-demo.ts`, `lib/demo-restart.ts`: no seeding. `lib/seed-demo-orders.ts` is kept but marked "no longer called".
- `lib/i18n/namespaces.ts`: `demoWalk` on the order page; a new `walkthrough` surface.
- `messages/en-GB.json` plus all 22 base locales (53 new keys: `demoWalk`, `demoLinkEmail`, `demoUpload.{emailLabel,emailNote,marketing,emailInvalid}`, `demo.walkBanner`), and `docs/i18n/back/<locale>.json` back-translations.

**Retired (git rm):** `components/dashboard/DemoWelcome.tsx`, `components/dashboard/DemoLoopComplete.tsx`, `scripts/demo-welcome-open.cjs`.

**Harnesses re-pinned for the intended changes:** `scripts/language-phase-1a/1b/1c/1d2/2.cjs` (through `scripts/_demo2-named.cjs`, which lists each changed view with its reason; a listed view is skipped only if it actually changed, and retired views must be absent), `scripts/_lp1b-components.cjs`, `scripts/_lp1c-demo.cjs`, `scripts/_lp1c-api.cjs`, `scripts/_messages-parity-1e.cjs` (the new words named as new wording), `scripts/event-types.cjs`, `scripts/demo-reset-for-sending.cjs` (plus a no-seeded-orders check), `scripts/demo-seed-parameters.cjs`, `scripts/harnesses.json`. `scripts/competitor-check-1.cjs` had a helper renamed `x.fetch()` → `x.fetchPage()`, because the sweep's screen refuses `fetch(<non-literal>)`. There was no behaviour change.

`docs/reference-manual.md` is modified from the earlier manual-v16-8 task in this session, not by demo-2.

---

## How the new flow works

**Landing (email first).** "Your email" is required, after the menu fields and before "See sample menu". Below it is the line "We'll email you a link to your demo and may contact you about setting up HatchGrab.", with a link to the privacy policy, and an optional, unticked "Send me occasional tips and news from HatchGrab". Build and the sample button stay disabled until the email looks valid. The server checks the format again **before** the rate limit, so a typo never uses one of the five hourly builds. The email, the time and the tips choice (with its time) are stored on `demo_sessions`. The link is emailed once the build succeeds. **Outreach demos skip all of this.**

**Step 1 — the order page** (`/trucks/<slug>/order`, demo only). It shows the banner "Demo · this is your menu, the way your customers will see it. Nothing is charged and no emails are sent." and the label "Step 1 of 3 · Order like one of your customers". There is no email field. The name is optional and defaults to "Alex". A payment panel replaces the card step. Nothing is charged and no email is sent.

**Phone (< 1024 px).** `/try/<slug>` opens the menu. After ordering, the visitor lands on `/try/<slug>?view=kitchen`: the kitchen screen with a speech bubble ("Step 2 of 3", "Your order just arrived"), their order card with Start cooking → Ready, then a bottom sheet with "Start free for 3 months, keep my menu" and "Try another order".

**Laptop (≥ 1024 px).** The page shows a three-step bar, the phone (the real order page in a phone frame) on the left and the kitchen on the right. When they press Ready, the phone shows "Your order is ready — collect it at the truck", and a band appears with "Start free, keep my menu" / "Order again".

**The token stays private.** The walkthrough works by **slug** (already public on the order page). The kitchen view shows **only the orders this browser placed**: the order page stores each new order's key in sessionStorage, and the API returns only those keys on that demo truck. The dashboard token is never in a `/try` URL, an email, an event or the walkthrough's code (checked by the harness).

**Start free.** It opens the existing signup wizard (`DemoGetStarted`) with the email from this browser pre-filled. Signing up claims the demo by slug, so `?import=demo` carries the menu over. **If signup is off**, the same button is the existing Save-my-menu path with its own label (never "Start free"), so it works today and changes on its own once the flags flip and the site is rebuilt.

**Restarts.** Opening `/try/<slug>` on an ended service (T1/T2) starts a new, **empty** service. "Start a new service" also seeds nothing.

**DemoWelcome / DemoLoopComplete** are retired. The walkthrough replaces them. **DemoModeBanner** is still one component. The old browser flags in `lib/demo-board-build.ts` are replaced cleanly, and old flags are cleared on restart. The build wait (the modal's progress screen) is unchanged.

**Admin › Demos.** Columns: created, landing/outreach, email, tips tick, country, truck name (when one was extracted; the placeholder "Demo Kitchen (…)" is hidden), items found, menu file (view/download through a 60-second signed link), visitor ordered, finished walkthrough, started signup, signed up, expires. Filters: date from/to and source. Above the table are ten funnel tiles.

---

## Design decisions worth knowing

- **`visitor_email` is separate from `email`.** `email` already means "keep my demo for 14 days" (Save my menu). Giving an address to receive the link must not extend the demo by itself, because the privacy text promises 24 hours unless they ask to keep it.
- **A slug claim takes only an unclaimed demo**, because a slug is more public than a token. A token claim behaves as before.
- **Events are awaited.** On Vercel, work left running after the response can be frozen, so each count is written before the route answers. A failed count is logged once and never fails the request.
- **The walkthrough uses polling (3 s) plus a postMessage from the framed order page**, not Realtime. Realtime on `orders` would need the anon read policy and a truck-wide subscription, and that would show the kitchen every order on the truck, not only the visitor's.
- **The seeder is kept but unused** (`lib/seed-demo-orders.ts`), so it can be restored with one line if you ever want a busy board again.
- **The mockup "Demo walkthrough mockup" is not in the repo.** The screens follow the brief's words: banner, step labels, bubble, sheet, three-step bar, ready line and band. Please compare the screenshots against the approved mockup.
- **No marketing emails are sent by this change.** The tips tick is stored with its time, nothing more.

---

## NOT RUN SQL (run in this order)

### 1 · `supabase/migrations/20261052_demo_2.sql`

```sql
begin;

alter table public.demo_sessions
  add column if not exists visitor_email      text,
  add column if not exists email_given_at     timestamptz,
  add column if not exists marketing_opt_in   boolean not null default false,
  add column if not exists marketing_opt_in_at timestamptz;
alter table public.demo_sessions drop constraint if exists demo_sessions_visitor_email_chk;
alter table public.demo_sessions add constraint demo_sessions_visitor_email_chk
  check (visitor_email is null or (length(visitor_email) <= 320 and visitor_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'));

alter table public.demo_cleanup_log add column if not exists files_deleted integer not null default 0;

create table if not exists public.demo_events (
  id       bigserial primary key,
  demo_id  text,
  source   text check (source is null or source in ('landing', 'outreach')),
  event    text not null check (event in ('build_started', 'build_ok', 'build_failed', 'sample_used', 'menu_viewed',
                                          'order_placed', 'cooking_started', 'ready_pressed', 'signup_started', 'signup_done')),
  at       timestamptz not null default now()
);
create index if not exists demo_events_at_idx       on public.demo_events (at desc);
create index if not exists demo_events_event_at_idx on public.demo_events (event, at desc);
create index if not exists demo_events_demo_idx     on public.demo_events (demo_id);
alter table public.demo_events enable row level security;
revoke all on public.demo_events from anon, authenticated;
revoke all on sequence public.demo_events_id_seq from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('demo-menus', 'demo-menus', false, 10485760, array['image/*', 'application/pdf', 'text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

commit;
```

### 2 · Checks after running it (read-only)

```sql
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'demo_sessions'
   and column_name in ('visitor_email', 'email_given_at', 'marketing_opt_in', 'marketing_opt_in_at');
```
```sql
select id, public, file_size_limit from storage.buckets where id = 'demo-menus';
```
```sql
select count(*) from public.demo_events;
```

Until this is run, everything is tolerant. The demo builds, the link is still emailed, and the email, stored menus and counts are simply not written. Admin › Demos says the counts are not available yet.

Note: `demo_sessions` (which will now hold the visitor's email) has RLS on with **no policies**, so anon and authenticated clients read nothing, even though the table grant allows SELECT (query 6 below). That is the same protection as the existing `email` column. No change was proposed there.

---

## Privacy policy — DRAFT (not applied)

Proposed addition to `/privacy`, under what we collect:

> **If you try the HatchGrab demo**
>
> When you build a demo from the HatchGrab website, we ask for your email address. We use it to send you a link to your demo, and we may contact you about setting up HatchGrab. If you tick "Send me occasional tips and news from HatchGrab", we may also send you occasional tips and news; you can unsubscribe at any time, and not ticking it does not affect your demo.
>
> We also keep the menu file you upload (a photo, PDF or pasted text) and the menu we read from it. We send the file to our AI provider so it can read the dishes and prices, and we keep the file so we can check how well that worked and help you if you go on to set up HatchGrab. The file is stored privately; only HatchGrab staff can open it.
>
> We delete your demo email, the menu file and the demo itself when the demo expires: **24 hours** after you build it, or **14 days** if you ask us to keep it ("Save my menu"). If you sign up, your demo menu moves into your account, and your account's privacy terms apply from then on.
>
> We keep anonymous counts of how far demos get (for example, "a demo was built", "an order was placed"). These counts contain no email address and cannot be used to identify you.
>
> Demos we prepare for a food truck we have contacted are kept for up to 30 days and do not ask for an email.

To confirm before applying: the 30-day outreach period (from the existing outreach demo expiry), the name of the AI provider if the policy lists processors, and the lawful basis wording (legitimate interest for the follow-up contact; consent for tips and news).

---

## Harness and sweep results

- **`npx tsc --noEmit -p .`**: clean (exit 0), after the last code change.
- **`node scripts/demo-2.cjs`** (new, registered): **59 passed, 0 failed**. Sections:
  1. email first: required on the landing demo, checked before the rate limit, stored, link emailed; outreach asks for none;
  2. no seeded orders on a build, on "Start a new service", or on T1/T2;
  3. the visitor's order reaches the kitchen view, and **only** theirs;
  3b. the order page: no email, "Alex", the payment panel;
  4. the token is never in a URL, an email or an event;
  5. the sweep deletes stored files, logs `files_deleted`, and the events survive;
  6. all ten events written server-side, plus the funnel;
  7. Start free prefills the email and claims the demo;
  8. signup off falls back to Save my menu.
- **`node scripts/demo-2-screens.cjs`** (needs the dev server; fixture data only, every /api answered locally, everything external aborted): **34 passed, 0 failed** in WebKit and Chromium at 390 and 1512. Also checks no sideways scroll, no page errors, the banner sentence never running under its button, the band on screen without scrolling, and times without seconds.
- **Demo and language harnesses re-run after the last change:**

  | Harness | Result |
  |---|---|
  | demo-reset-for-sending | 25/0 |
  | demo-seed-parameters | pass |
  | event-types | 192/0 |
  | language-phase-1a | 1048/0 |
  | language-phase-1b | 3504/0 |
  | language-phase-1c | 4402/0 |
  | language-phase-1d2 | 562/0 (20 demo views named) |
  | language-phase-2 | 1821/0 |
  | messages-parity | 436777/0 |
  | ui-literals | clean |
  | languages-1, france-1, country-picker-1 | pass |
  | competitor-check-1 | 227/0 |

- **Translations:** the 53 new keys are translated into all 22 base locales, with back-translations in `docs/i18n/back/`. `translation-check` reports structural 0 everywhere. There are no German ß characters in the new words (de-CH writes "ss").
- **Full sweep, once** (`node scripts/run-harnesses.cjs`, 170 harnesses): **167 passed, 3 failed. All 3 fail identically on a clean worktree of HEAD (c7242ad8) without demo-2:**
  - `schedule-graphics-places`: 1 check;
  - `canada-1`: 1 check;
  - `europe-languages-1`: 1 check, the existing de-CH "ß" finding.

  `add-order-refresh`, which flaked under load on an earlier run, passed.
- **Bugs found by the screenshots and fixed before the final run:**
  - the banner sentence ran under its "Save my menu" button at 390px (DemoModeBanner now lays a sentence and its button out as a row);
  - the kitchen card showed "04:59:00" (it now uses `formatTime`, so "05:00");
  - the laptop band sat below the fold (it is now sticky at the bottom of the window).
- **Housekeeping:**
  - the clean-HEAD worktree used for the baseline was removed. `git worktree prune` also dropped nine already-deleted temp worktree records left by other harnesses;
  - the one dev server was started for the screenshots and stopped afterwards.

## Screenshots (fixture data)

Fixture data only. `docs/demo-2/<engine>-<shot>-<width>.png`, for WebKit and Chromium at 390 and 1512, 20 files:

- **upload-modal**: the upload modal with the email field, the privacy line and the tips box
  - `docs/demo-2/webkit-upload-modal-390.png` · `docs/demo-2/webkit-upload-modal-1512.png`
  - `docs/demo-2/chromium-upload-modal-390.png` · `docs/demo-2/chromium-upload-modal-1512.png`
- **step1-menu**: step 1: phone = the real order page with the banner and step label; laptop = the three-step bar, the phone frame and the empty kitchen
  - `docs/demo-2/webkit-step1-menu-390.png` · `docs/demo-2/webkit-step1-menu-1512.png`
  - `docs/demo-2/chromium-step1-menu-390.png` · `docs/demo-2/chromium-step1-menu-1512.png`
- **kitchen**: the visitor's order on the kitchen screen (phone: with the speech bubble)
  - `docs/demo-2/webkit-kitchen-390.png` · `docs/demo-2/webkit-kitchen-1512.png`
  - `docs/demo-2/chromium-kitchen-390.png` · `docs/demo-2/chromium-kitchen-1512.png`
- **final**: after Ready: phone = the bottom sheet; laptop = "Your order is ready" on the phone and the Start free / Order again band
  - `docs/demo-2/webkit-final-390.png` · `docs/demo-2/webkit-final-1512.png`
  - `docs/demo-2/chromium-final-390.png` · `docs/demo-2/chromium-final-1512.png`
- **admin-demos**: Admin › Demos: funnel tiles plus the table (cards on a phone)
  - `docs/demo-2/webkit-admin-demos-390.png` · `docs/demo-2/webkit-admin-demos-1512.png`
  - `docs/demo-2/chromium-admin-demos-390.png` · `docs/demo-2/chromium-admin-demos-1512.png`

The sheet and band read "Start free…" because the local dev server runs with the client signup flag on. I inferred that from the rendered button; no .env file was opened. Production shows the Save-my-menu label in the same place until the flags flip and the site is rebuilt (proved in demo-2.cjs §8). The order page's own banner button keeps its existing "Save my menu" label in both states. I did not change it, because the brief only gives that banner's sentence. Say if you want it to read "Start free" too once signup is on. Admin › Demos is the real component, bundled and fed a fixture answer, because the real tab needs an admin session.

---

## Dominic's steps

1. Run `supabase/migrations/20261052_demo_2.sql` (above), then the three checks.
2. Fix the signup sender (`EMAIL_FROM_ADDRESS` to a Brevo-verified address, or verify `hatchgrab.com` in Brevo).
3. Set `SIGNUP_PUBLIC=true` and `NEXT_PUBLIC_SIGNUP_PUBLIC=true` in Vercel Production (and Preview if you test there).
4. Redeploy without the build cache. The client flag only takes effect in a new build.
5. Approve or edit the privacy-policy draft and publish it **before** the deploy that asks for the email.
6. Compare the screenshots with the approved walkthrough mockup.
7. Test on Production with a throwaway address, on your own demo (not a trading truck): build from the landing page with an email → receive the link → order → Start cooking → Ready → Start free → finish the wizard → check that the menu carried over (`?import=demo`). Check Admin › Demos shows the row, the file and the counts.
8. Close G11 in the same change as the flag flip (docs/demo-kds-report.md).

---

## Every read-only query run

```sql
-- 1 · before the signup probe: does the probe address already have an account? (so the probe could not create one) → 1
select count(*) as existing_accounts_with_probe_email from auth.users where email = 'dominic@hatchgrab.com';
```
```sql
-- 2 · a demo slug for fetching the live order-page chunks (the NEXT_PUBLIC_SIGNUP_PUBLIC inlining check) → demo-xqgxma7hexysse3qwx0714vxc7
select slug from public.trucks where id like 'demo-%' order by created_at desc limit 1;
```
```sql
-- 3 · orders columns (customer_email is nullable → a demo order without an email fits)
select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'orders' order by ordinal_position;
```
```sql
-- 4 · orders check constraints (none on customer_email)
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.orders'::regclass and contype = 'c' order by conname;
```
```sql
-- 5 · existing storage buckets (outreach-attachments, post-designs, post-fonts private; truck-media public; no demo-menus yet)
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id;
```
```sql
-- 6 · RLS on the demo tables (all RLS on, 0 policies; demo_sessions / demo_cleanup_log carry an anon SELECT grant that RLS blocks)
select c.relname as table_name, c.relrowsecurity as rls_on, (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies, has_table_privilege('anon', c.oid, 'select') as anon_select from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('demo_sessions', 'demo_cleanup_log', 'data_imports') order by 1;
```
```sql
-- 7 · does place_order_atomic pass customer_email straight through (no NOT NULL coercion)? → yes, as given
select position('customer_email' in pg_get_functiondef(p.oid)) > 0 as mentions_email, substring(pg_get_functiondef(p.oid) from position('customer_email' in pg_get_functiondef(p.oid)) - 60 for 140) as around from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'place_order_atomic';
```

Other read-only probes (curl, no data changed):

- `POST https://www.hatchgrab.com/api/signup` with an existing address and a dummy password → 403 `signup_closed`.
- `GET https://www.hatchgrab.com/trucks/demo-xqgxma7hexysse3qwx0714vxc7/order` and its 23 static chunks → the unresolved `NEXT_PUBLIC_SIGNUP_PUBLIC` in `chunk_ce5580d3a23d98ee.js`.

---

## Undo (only if Dominic asks)

The migration, reversed. The bucket must be empty before it can be removed.

```sql
begin;
drop table if exists public.demo_events;
alter table public.demo_cleanup_log drop column if exists files_deleted;
alter table public.demo_sessions drop constraint if exists demo_sessions_visitor_email_chk;
alter table public.demo_sessions
  drop column if exists marketing_opt_in_at,
  drop column if exists marketing_opt_in,
  drop column if exists email_given_at,
  drop column if exists visitor_email;
delete from storage.objects where bucket_id = 'demo-menus';
delete from storage.buckets where id = 'demo-menus';
commit;
```

The code: `git checkout -- <files>` for the changed files, delete the new files listed above, and `git checkout HEAD -- components/dashboard/DemoWelcome.tsx components/dashboard/DemoLoopComplete.tsx scripts/demo-welcome-open.cjs`.
