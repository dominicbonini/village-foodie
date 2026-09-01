# The uncommitted batch — what it actually does

**Date:** 1 September 2026
**READ-ONLY.** No file changed, no build, no migration, nothing committed or deployed.
Every claim is marked **READ**, **INFERRED** or **UNKNOWN**.

⚠️ **ONE PREMISE CORRECTED AT THE OUTSET.** The brief names Pizzeria Gusto and Real Thai Food as the
trial trucks. **READ from production: there are six** — Apple Tester, Pizzeria Gusto, Real Thai Food,
Thai Kitchen, Tikka Tonic, Village Spice. Item 4 is answered against all six.

---

## Headline — the three things that matter

1. 🔴 **DEPLOYING THIS STARTS A DAILY CRON THAT WRITES TO THE `trucks` TABLE.** `vercel.json` now
   registers `/api/cron/custom-domain-check` at `0 7 * * *`. It selects every truck with a non-null
   `custom_domain`, writes timestamps to that row, and **can send an operator email**. **A Vercel
   rollback does not undo those writes.** §3.
2. 🔴 **A LIVE TRIAL TRUCK ALREADY CARRIES TEST DATA IN PRODUCTION.** Thai Kitchen has
   `custom_domain = 'events.testtruck.test'` (a host that exists only in a local hosts file) and
   `embed_enabled = true`. **It is the one row the new cron would select on day one.** §3.
3. 🔴 **THE CUSTOM-DOMAIN WIZARD IS VISIBLE TO ALL SIX TRIAL TRUCKS**, and pressing "Set up" cannot
   succeed — the Vercel credentials are unset. **The failure is graceful, but the feature is not
   completable.** §4.

---

## 1. The two commands, in full

`git status --porcelain=v1 -uall` → **191 paths**. `git diff --stat` → **68 files changed, 7,420
insertions(+), 359 deletions(-)**. Both are reproduced verbatim in **Appendix A**.

---

## 2. Every changed path, by workstream

**Nine workstreams are present.** I named them from the code and the report filenames, not from the
brief.

### A. Custom domains — the largest by far (≈60 paths)

An operator points `events.<their-domain>` at us and their schedule serves there with no Village Foodie
chrome.

| Path | What it does to the running product |
|---|---|
| `app/domain/page.tsx` *(new)* | Serves the schedule page on an operator's own host; renders a lapsed-plan fallback when the plan does not grant it. |
| `app/api/embed/events/route.ts` *(new)* | The one endpoint that page fetches; gated on `trucks.embed_enabled`. |
| `app/embed/[slug]/EmbedSchedule.tsx` *(new)* | The schedule list component the domain page renders. ⚠️ Sits in a route folder that **has no `page.tsx`** — see §8. |
| `components/embed/EmbedParts.tsx` *(new)* | Shell, truck identity (logo masthead) and the "Powered by HatchGrab" brand line. |
| `components/dashboard/CustomDomainSetup.tsx` *(new)* | The setup wizard in Manage → Settings. **Visible to trial trucks** — §4. |
| `lib/custom-domain/{apex,cadence,copy,dns,redirect-target,vercel}.ts` *(new)* | Apex/public-suffix guards, check cadence, all operator copy, DNS lookups, the five live-domain conditions, the Vercel domains API client. |
| `lib/custom-host.ts` *(new)* | The two-path allow-list for an unknown host; everything else is refused. |
| `app/api/cron/custom-domain-check/route.ts` *(new)* | 🔴 Daily job — resolves each domain, writes results, releases orphans, emails on go-live. **§3.** |
| `proxy.ts` | Default-deny for unknown hosts; rewrites `/` on a custom host to `/domain`; adds the `/o/` limiter bucket. |
| `app/api/manage/route.ts` | **+719 lines.** Adds eight operator actions: `domain_preflight`, `domain_provision`, `domain_status`, `domain_send_instructions`, `domain_confirm`, `domain_turn_off`, plus `save_embed_setup`. |
| `app/admin/page.tsx`, `app/api/admin/route.ts` | Admin visibility of domain state (eight new columns selected and rendered). |
| `lib/ratelimit.ts` | Two new buckets — `customHostRatelimit`, `embedRatelimit`, both 600/min. |
| `lib/features.ts`, `lib/plan-features.ts` | Adds the `embed_schedule` feature and the marketing row for it. **§4.** |
| `components/dashboard/types.ts` | Ten new optional `Truck` fields (types only). |
| `vercel.json` | `noindex` for `/o/` and `/embed/`; registers the cron. |
| 6 × `supabase/migrations/2026082[67]_*.sql` | Twelve new columns. **All applied — §7.** |

### B. The QR redirect split

| Path | What it does |
|---|---|
| `app/o/[slug]/page.tsx` *(new)* | The new short scan URL. Decides: custom domain if five conditions hold, else the ordering page. |
| `app/trucks/[slug]/order/layout.tsx` *(new)* | 🔴 **Now a pass-through.** It used to redirect every arrival at the ordering page to the operator's domain, which closed a cycle no customer could escape. **§5.** |
| `lib/custom-domain/redirect-target.ts` *(new)* | The five conditions, moved verbatim out of that layout. |
| `lib/generateQRCode.ts` | Poster geometry constants; branded/standard composite. |
| `app/manage/[token]/page.tsx` | The QR card now encodes `/o/<slug>`. |
| `app/dashboard/[token]/page.tsx` | The fullscreen QR encodes `/o/<slug>` too. |

### C. KDS token exchange

| Path | What it does |
|---|---|
| `app/kds/[kds_token]/page.tsx` | 🔴 **Was a redirect to `/dashboard/<dashboard_token>/kds`; now renders the KDS in place.** The dashboard token no longer appears in a kitchen device's URL bar. |
| `app/dashboard/[token]/kds/page.tsx` | `KdsPage` accepts `token`/`vanId`/`vanName` as **props** as well as from the route. |

### D. Session resilience (native + web)

| Path | What it does |
|---|---|
| `lib/auth/session-observer.ts` *(new)* | Distinguishes a deliberate sign-out from an involuntary `SIGNED_OUT`; an involuntary one no longer bounces the operator to `/login`. |
| `components/auth/SessionAlertBanner.tsx` *(new)* | ⚠️ **Mounted in the ROOT layout — every page.** Renders `null` unless the observer raises an alert. |
| `lib/native/signOut.ts` | Flags the sign-out as deliberate before calling it. |
| `app/layout.tsx` | Mounts the banner; branches favicons by host. |
| `proxy.ts` | A stale-but-real session no longer redirects to `/login`. |

### E. Native device binding — error surfacing

`lib/native/device.ts` changes `saveDeviceConfig`'s return from `DeviceConfig | null` to a discriminated
union; `app/api/native/bind-device/route.ts` adds a machine-readable `reason` to every failure;
`OperatorDeviceConfig.tsx` and `VanMenuChooser.tsx` render the message instead of failing silently.
✅ **All five call sites checked** — `lib/native/push.ts:145` uses `void`, ignores the return, and is
unmodified, so the union change cannot break it.

### F. WhatsApp reply cap

`lib/whatsapp/reply-cap.ts` *(new)* and `app/api/webhooks/meta/whatsapp/route.ts` add per-customer/24h,
per-truck/day and per-truck/month reply ceilings, logging each capped decision.

### G. Android build and signing

`android/app/build.gradle` (guarded release signing), `AndroidManifest.xml`, `MainActivity.java` (+292),
30 modified icon/splash PNGs, 5 new notification icons, `SIGNING.md`, `keystore.properties.example`,
`.gitignore` (ignores the keystore). `lib/native/notificationIcon.ts` + `lib/native/notifications.ts`
switch the notification icon from `ic_launcher` to `ic_stat_hatchgrab` and drop a `sound: 'beep.wav'`
that never existed.

### H. Brand/icon refresh

`public/{favicon.ico,apple-touch-icon.png,icons/icon-192.png,icons/icon-512.png,manifest.json}`,
`app/layout.tsx`. The declared icon was a truck-emoji data URI; icons now branch by host.

### I. Landing page and marketing copy

`app/landing/page.tsx`, `app/landing/landing.css` — real testimonial, owners' names, typography, seven
dash edits. `content/store-listing.md` *(new)*. `scripts/check-plain-english.mjs` *(new)*.
`components/manage/primitives.tsx` (autocapitalise/autocorrect off on address fields).
`app/providers.tsx` (PostHog suppressed on `/embed` and custom hosts).

### J. Documentation — 69 paths, zero product effect

`docs/reference-manual.md` (+4,526) and 68 new `docs/*.md` reports. **INFERRED: no runtime reads
`docs/`.**

---

## 3. 🔴 DATA WRITES — what a rollback will not undo

### Already written to production, before any deploy

| Row | Value | How it got there |
|---|---|---|
| **Thai Kitchen** | `custom_domain = 'events.testtruck.test'` | **READ from production.** A made-up host resolvable only via a local `/etc/hosts`. |
| **Thai Kitchen** | `embed_enabled = true` | **READ.** The only truck with the embed surface on. |

⚠️ **UNKNOWN — whether these were intended to persist.** They are consistent with local testing.
**They are live rows on a trial truck now.**

### Written on deploy, unattended

🔴 **`/api/cron/custom-domain-check`, registered at `0 7 * * *` in `vercel.json`.** **READ** — it
selects `.from('trucks').not('custom_domain','is',null)`, so **today it selects exactly one row: Thai
Kitchen.** Per run it writes:

- `custom_domain_last_checked_at`, `custom_domain_last_seen_value` — every run;
- `custom_domain_verified_at` — **once**, the first time the domain resolves correctly, **and sends an
  email to `contact_email`** (`liveEmail` → `sendConfirmationEmail`);
- after **`ORPHAN_DAYS = 14`** without going live: attempts `releaseDomain()`, then either **nulls
  `custom_domain`, `custom_domain_setup_state`, `custom_domain_setup_started_at`** on success, or writes
  a failure note and keeps the row as its own retry queue.

**INFERRED: with the Vercel credentials unset (§4), `releaseDomain()` returns `not_configured`, so the
failure branch runs and the row is written every day but not cleared.** `events.testtruck.test` will not
resolve publicly, so **INFERRED: no go-live email fires** — but that depends on a DNS lookup I did not
perform. **UNKNOWN.**

### Written by operator action

| Action | Writes |
|---|---|
| `domain_provision` | `custom_domain`, `custom_domain_setup_state`, `custom_domain_setup_started_at` |
| `domain_confirm` | `custom_domain_confirmed_at` |
| `domain_turn_off` | Clears **eight** columns in one statement |
| `save_embed_setup` | `embed_enabled`, `embed_plan_answer`, `website` |
| Meta WhatsApp webhook | **Two new `whatsapp_logs` inserts** on capped replies. ✅ Table exists (11 rows). |

### Column meanings changed

**None.** ✅ All twelve columns are **new**; no existing column's meaning changed, and **no backfill or
`UPDATE` over existing rows appears anywhere in the batch** (checked by grepping every added
`.update(`/`.insert(`/`.upsert(` in the diff).

⚠️ **One earlier false positive of mine, corrected:** `lib/audit/pseudonymise.ts:46` matched a write
grep but is `createHmac(...).update(...)` — a crypto call, not a database write.

---

## 4. 🔴 LIVE OPERATOR EXPOSURE — what a TRIAL truck sees

**READ:** `canAccess('trial','embed_schedule') === true`, executed against the real module. Six trucks
are `plan='trial'`.

| New surface | Where | Visible to trial? |
|---|---|---|
| **Custom-domain setup card + wizard** | Manage → Settings, above the QR card | 🔴 **YES** — `canAccess(plan,'embed_schedule',…)`, and the only other gate is `!isDemoIdentifier(token)` |
| **"Your schedule at your own website" — ticked ✓** | Landing table, Admin, **Manage → Billing** | 🔴 **YES.** Trial renders Max's value, so it shows a **tick** for a feature that has never served a page in production |
| **QR card now encodes `/o/<slug>`** | Manage → Settings | 🔴 YES — every plan |
| **Fullscreen QR encodes `/o/<slug>`** | Dashboard | 🔴 YES — every plan |
| **`SessionAlertBanner`** | **Root layout — every page** | 🔴 YES, on every surface including customer pages |
| **Device-bind error messages** | Native operator config, van chooser | YES on native |
| **KDS renders in place** | `/kds/<kds_token>` | 🔴 YES — every plan |
| **Address fields no longer autocapitalise** | Manage → Settings | YES |

### 🔴 What happens when a trial operator presses "Set up"

**READ:** `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` are **all absent** from
`.env.local`. `addDomain()` returns `not_configured`, which `app/api/manage/route.ts:46` maps to:

> *"Something is not set up on our side, so we could not add your address. Nothing has changed at your
> end. Try again shortly."*

✅ **The failure is graceful and honest, and nothing is written.** 🔴 **But the feature is presented to
six live operators as available and cannot be completed by any of them.**

⚠️ **UNKNOWN — whether those three variables are set in Vercel's production environment.** I read
`.env.local` only. If they *are* set in production, the wizard becomes fully live on deploy for all six
trial trucks, which is a materially different risk.

---

## 5. 🔴 ORDER PIPELINE AND MONEY

**Stripe, order creation, order state transitions, refunds and pricing logic are untouched.** I grepped
every changed `.ts`/`.tsx` for `stripe`, `paymentIntent` and `refund` in added or removed lines: **zero
hits.**

**But two changes sit directly on the path a customer takes to order:**

1. 🔴 **`app/trucks/[slug]/order/layout.tsx` — the ordering page no longer redirects.** It previously
   sent **every** arrival to the operator's domain when five conditions held, which returned a customer
   who tapped Order to the page they were already on. **This batch removes that**, so the ordering page
   serves for every arrival — including the post-payment `?confirm=` return that would otherwise never
   show a receipt. **This is a fix, and it is on the payment path.**
2. 🔴 **The KDS moved from a redirect to an in-place render.** The kitchen screen is where orders are
   worked. ⚠️ **NOT OBSERVED on a device** — the component now receives its token as a prop inside a
   `Suspense` boundary, and I did not exercise it.

**Pricing:** `PLAN_MONTHLY_PENCE` and the plan matrix changed presentation only. **No plan can be
purchased in-app on any platform** (established in `docs/android-commerce-surface-report.md`).

---

## 6. NATIVE PATHS

⚠️ **The brief states the iOS app is now LIVE on the App Store. The reference manual still records "no
build has shipped"** (§36, §27). **I have taken the brief as authoritative and flagged the manual as
stale.** Both shells are **remote-URL** (`server.url = https://www.hatchgrab.com/app`), so **every web
change in this batch reaches installed devices the moment Vercel deploys — no store review, no update.**

| Change | Reaches devices how |
|---|---|
| `lib/auth/session-observer.ts` + `signOut.ts` + `proxy.ts` guard | 🔴 **Web deploy.** Changes when an operator is bounced to `/login` mid-service. |
| `SessionAlertBanner` in the root layout | 🔴 **Web deploy.** New UI on every screen in the app. |
| `lib/native/device.ts` union + error surfacing | Web deploy. |
| `app/providers.tsx` PostHog suppression | Web deploy. |
| `lib/native/notifications.ts` → `ic_stat_hatchgrab` | Web deploy **calls** it, but the **icon resource lives in the installed binary**. ⚠️ **UNKNOWN whether the shipped iOS build contains it — iOS ignores `smallIcon`, so INFERRED harmless there; on Android the drawables predate the existing `.aab` and are in it.** |
| `capacitor.config.ts`, `Info.plist`, `project.pbxproj`, `App.xcscheme`, all `android/**` | **Native only — require a rebuild and a store submission.** Not affected by a web deploy. |

🔴 **The asymmetry to hold onto: the web half of every native change ships instantly to live devices;
the native half does not ship at all until someone builds and submits.** Nothing in this batch appears
to depend on both halves landing together — but **I did not verify that exhaustively. UNKNOWN.**

---

## 7. MIGRATIONS

**Six files, all untracked. All twelve columns exist in production.**

**How I determined it: I queried the live database** (`select <column> limit 1` per column, service-role
key from `.env.local`) — not by trusting the manual, which does also claim they are applied.

```
embed_enabled ✅   embed_plan_answer ✅   embed_last_seen_at ✅   embed_last_referer ✅
custom_domain ✅   custom_domain_verified_at ✅   custom_domain_last_checked_at ✅
custom_domain_last_ok_at ✅   custom_domain_last_seen_value ✅   custom_domain_confirmed_at ✅
custom_domain_setup_state ✅   custom_domain_setup_started_at ✅
```

| Migration | Applied? |
|---|---|
| `20260826_trucks_embed_enabled.sql` | ✅ APPLIED |
| `20260826_trucks_embed_plan_answer.sql` | ✅ APPLIED |
| `20260826_trucks_embed_seen.sql` | ✅ APPLIED |
| `20260827_trucks_custom_domain.sql` | ✅ APPLIED |
| `20260827_trucks_custom_domain_monitor.sql` | ✅ APPLIED |
| `20260827_trucks_custom_domain_setup.sql` | ✅ APPLIED |

⚠️ **UNKNOWN — whether the `trucks_custom_domain_key` UNIQUE constraint was applied**, and whether these
were applied by running these files or by hand. I verified column existence, not constraints or
provenance. ⚠️ **All six are `ADD COLUMN IF NOT EXISTS`, so re-running them is safe; the `ADD
CONSTRAINT` in `20260827_trucks_custom_domain.sql` is NOT idempotent and would error on a second run.**

---

## 8. HALF-FINISHED WORK

1. 🔴 **Two columns with no reader and no writer.** `embed_last_seen_at` and `embed_last_referer` exist
   in production; a tree-wide grep of `app/` and `lib/` finds **zero references**. The migration comment
   describes a throttled conditional `UPDATE` that **does not exist in the code**. Dead schema.
2. 🔴 **`app/embed/[slug]/` contains only `EmbedSchedule.tsx` — there is no `page.tsx`.** The `/embed/`
   route was deleted; the component survives and is imported by `app/domain/page.tsx`. It works, but a
   component living in a route folder with no route is a trap for the next reader.
3. ⚠️ **`vercel.json` adds a `noindex` header for `/embed/(.*)`, which matches no route.** Dead rule,
   added in this batch.
4. 🔴 **The proxy matcher typo is still present** — `'/((?!_next_next/image|…'` at `proxy.ts:447`.
   The manual records this as **deliberately unfixed** (repairing it would make the whole framework path
   invisible to the proxy on every host). **It means eight path families never reach the deny list**, so
   our brand mark, the PWA manifest and other trucks' logos are served on an operator's domain.
   **Carried into this batch unchanged.**
5. ⚠️ **`content/store-listing.md` has no screenshots or feature graphic to accompany it** — the Play
   listing cannot be completed from this batch (see `docs/android-submission-diagnosis-report.md`).
6. ⚠️ **The "Your schedule at your own website" row is ticked** while no domain has served a page in
   production, and a second gate the matrix cannot see (`embed_enabled`, default false) decides what an
   operator actually gets.
7. ✅ **Checked and NOT broken:** every `saveDeviceConfig` caller is updated or immune; `whatsapp_logs`
   exists; every new `lib/custom-domain/*` import resolves.

---

## 9. Ordered list — deploy, decide, hold

### ✅ Safe to deploy

1. **Documentation** (69 paths) — no runtime reads `docs/`.
2. **Brand/icon refresh** — favicons, manifest, apple-touch-icon.
3. **Landing page copy and typography** — the page is admin-gated and `noindex`; no public exposure.
4. **`components/manage/primitives.tsx`** — autocapitalise/autocorrect off on address fields.
5. **WhatsApp reply cap** — reduces outbound volume and cost; its only writes are log rows.
6. **Native device-bind error surfacing** — replaces silent failure with a message. Low risk, real gain.
7. **Session resilience** — stops involuntary sign-outs bouncing a kitchen tablet to `/login`.
   ⚠️ Ships instantly to live iOS devices; the banner is new UI on every page.
8. **`app/providers.tsx`** PostHog suppression on embed/custom hosts.

### ⚠️ Needs a decision from you first

9. 🔴 **The cron registration in `vercel.json`.** Deploying it starts a daily unattended write to
   `trucks`. **Decide whether to ship the cron at all before the feature is live** — removing the
   `crons` entry ships the endpoint without scheduling it.
10. 🔴 **Thai Kitchen's `custom_domain` and `embed_enabled` values.** They are test data on a live trial
    truck and are exactly what the cron would act on. **Decide whether to clear them first.**
11. 🔴 **The custom-domain wizard being visible to six trial operators** while provisioning cannot
    complete. Options: ship it (they see a graceful failure), gate it behind an override, or hold.
    ⚠️ **First establish whether the three `VERCEL_*` variables are set in production** — that changes
    the answer completely.
12. **The KDS in-place render.** A behaviour change on a live kitchen surface, **not observed on a
    device**. Worth one real load before it ships.
13. **The ticked plan row.** It advertises as included a feature no truck can use.

### 🔴 Should not ship yet

14. **Nothing in this batch is unsafe to deploy *as code*** — but the **custom-domain feature as a
    whole** should not be presented to operators until the Vercel credentials are set and one domain has
    served a page. The code can ship dark; the **wizard's visibility** is the part to hold.
15. **`content/store-listing.md`** — not a deploy artefact, and the listing it belongs to has no
    screenshots or feature graphic.
16. **The `/embed/(.*)` header rule and the two dead columns** — harmless, but they should be removed
    rather than shipped as permanent debris.

⚠️ **The proxy matcher typo (§8.4) is pre-existing, not introduced here, and is already open in §27. It
ships with this batch either way.**

---

## 10. What I could not establish

1. **UNKNOWN — what is currently deployed at hatchgrab.com.** Everything above is tree-vs-`HEAD`; the
   last commit is `1d85241` (25 August) and nothing has been committed since.
2. **UNKNOWN — whether `VERCEL_API_TOKEN` / `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` are set in
   production.** This is the single biggest unknown in the report (§4).
3. **UNKNOWN — whether `events.testtruck.test` resolves publicly.** Decides whether the cron's go-live
   email could fire.
4. **UNKNOWN — whether the `UNIQUE (custom_domain)` constraint is applied**, and how the migrations were
   applied.
5. **UNKNOWN — whether the shipped iOS binary contains `ic_stat_hatchgrab`.** INFERRED harmless (iOS
   ignores `smallIcon`).
6. **NOT OBSERVED — nothing was run.** No page loaded, no build, no device. This is a static reading of
   the diff plus **read-only queries against the production database**.
7. **I did not read every line of the 7,420-line diff.** The large files (`app/manage` +652,
   `/api/manage` +719, `MainActivity.java` +292) were characterised from their added action names,
   imports and write calls — **INFERRED at the level of what each workstream does, not line by line.**

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** Two premises in the
brief are corrected against production rather than assumed: there are **six** trial trucks, not two; and
the reference manual's "no Android build has shipped / no store listing exists" is stale against the
brief's statement that iOS is live.

---

## Appendix A — verbatim command output

<details><summary><code>git status --porcelain=v1 -uall</code> — 191 paths</summary>

```
 M .gitignore
 M android/app/build.gradle
 M android/app/src/main/AndroidManifest.xml
 M android/app/src/main/java/com/hatchgrab/app/MainActivity.java
 M android/app/src/main/res/drawable-land-hdpi/splash.png
 M android/app/src/main/res/drawable-land-mdpi/splash.png
 M android/app/src/main/res/drawable-land-xhdpi/splash.png
 M android/app/src/main/res/drawable-land-xxhdpi/splash.png
 M android/app/src/main/res/drawable-land-xxxhdpi/splash.png
 M android/app/src/main/res/drawable-port-hdpi/splash.png
 M android/app/src/main/res/drawable-port-mdpi/splash.png
 M android/app/src/main/res/drawable-port-xhdpi/splash.png
 M android/app/src/main/res/drawable-port-xxhdpi/splash.png
 M android/app/src/main/res/drawable-port-xxxhdpi/splash.png
 M android/app/src/main/res/drawable/splash.png
 M android/app/src/main/res/mipmap-hdpi/ic_launcher.png
 M android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png
 M android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
 M android/app/src/main/res/mipmap-mdpi/ic_launcher.png
 M android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png
 M android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
 M android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
 M android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png
 M android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
 M android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
 M android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png
 M android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
 M android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
 M android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png
 M android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png
 M app/admin/page.tsx
 M app/api/admin/route.ts
 M app/api/manage/route.ts
 M app/api/native/bind-device/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/kds/[kds_token]/page.tsx
 M app/landing/landing.css
 M app/landing/page.tsx
 M app/layout.tsx
 M app/manage/[token]/page.tsx
 M app/providers.tsx
 M capacitor.config.ts
 M components/TruckListCard.tsx
 M components/dashboard/types.ts
 M components/manage/primitives.tsx
 M components/native/OperatorDeviceConfig.tsx
 M components/native/VanMenuChooser.tsx
 M docs/reference-manual.md
 M ios/App/App.xcodeproj/project.pbxproj
 M ios/App/App/Info.plist
 M lib/features.ts
 M lib/generateQRCode.ts
 M lib/native/device.ts
 M lib/native/notifications.ts
 M lib/native/signOut.ts
 M lib/plan-features.ts
 M lib/ratelimit.ts
 M package-lock.json
 M package.json
 M proxy.ts
 M public/apple-touch-icon.png
 M public/favicon.ico
 M public/icons/icon-192.png
 M public/icons/icon-512.png
 M public/manifest.json
 M vercel.json
?? android/SIGNING.md
?? android/app/src/main/res/drawable-hdpi/ic_stat_hatchgrab.png
?? android/app/src/main/res/drawable-mdpi/ic_stat_hatchgrab.png
?? android/app/src/main/res/drawable-xhdpi/ic_stat_hatchgrab.png
?? android/app/src/main/res/drawable-xxhdpi/ic_stat_hatchgrab.png
?? android/app/src/main/res/drawable-xxxhdpi/ic_stat_hatchgrab.png
?? android/keystore.properties.example
?? app/api/cron/custom-domain-check/route.ts
?? app/api/embed/events/route.ts
?? app/domain/page.tsx
?? app/embed/[slug]/EmbedSchedule.tsx
?? app/o/[slug]/page.tsx
?? app/trucks/[slug]/order/layout.tsx
?? components/auth/SessionAlertBanner.tsx
?? components/dashboard/CustomDomainSetup.tsx
?? components/embed/EmbedParts.tsx
?? content/store-listing.md
?? docs/android-ble-permissions-report.md
?? docs/android-bottom-inset-report.md
?? docs/android-capability-audit-report.md
?? docs/android-commerce-surface-report.md
?? docs/android-edge-to-edge-report.md
?? docs/android-icons-report.md
?? docs/android-inventory-report.md
?? docs/android-notification-fixes-report.md
?? docs/android-signing-report.md
?? docs/android-submission-diagnosis-report.md
?? docs/android-tester-truck-plan-report.md
?? docs/bind-device-error-surfacing-report.md
?? docs/bind-device-truck-guard-report.md
?? docs/build-inventory-report.md
?? docs/camera-usage-description-report.md
?? docs/cap-filter-parse-check-report.md
?? docs/cross-truck-van-binding-report.md
?? docs/custom-domain-actions-audit.md
?? docs/custom-domain-address-field-report.md
?? docs/custom-domain-audit-fix-report.md
?? docs/custom-domain-card-copy-report.md
?? docs/custom-domain-centre-report.md
?? docs/custom-domain-confirm-card-report.md
?? docs/custom-domain-copy-audit.md
?? docs/custom-domain-copy-cut-report.md
?? docs/custom-domain-corrections-report.md
?? docs/custom-domain-fixed-prefix-report.md
?? docs/custom-domain-identity-report.md
?? docs/custom-domain-input-fixes-report.md
?? docs/custom-domain-investigation.md
?? docs/custom-domain-labels-report.md
?? docs/custom-domain-modal-report.md
?? docs/custom-domain-monitoring-report.md
?? docs/custom-domain-one-press-report.md
?? docs/custom-domain-provider-steps-report.md
?? docs/custom-domain-provisioning-report.md
?? docs/custom-domain-security-report.md
?? docs/custom-domain-serving-report.md
?? docs/custom-domain-turn-off-copy-report.md
?? docs/custom-domain-turn-off-report.md
?? docs/custom-domain-two-buttons-report.md
?? docs/custom-domain-wizard-copy-report.md
?? docs/custom-domain-www-guard-report.md
?? docs/custom-host-static-assets-report.md
?? docs/deny-by-default-report.md
?? docs/domain-fallback-label-report.md
?? docs/domain-fallback-link-report.md
?? docs/embed-removal-final-report.md
?? docs/embed-removal-qr-report.md
?? docs/favicon-report.md
?? docs/kds-token-exchange-report.md
?? docs/landing-alt-comment-report.md
?? docs/landing-dash-audit-report.md
?? docs/landing-dash-edit-report.md
?? docs/landing-dash-l293-report.md
?? docs/landing-logo-alt-report.md
?? docs/landing-testimonial-italic-report.md
?? docs/landing-testimonial-report.md
?? docs/landing-testimonial-style-report.md
?? docs/menu-copy-plan-report.md
?? docs/menu-copy-sql-report.md
?? docs/operator-auth-investigation-report.md
?? docs/plan-features-row-report.md
?? docs/pre-reply-tree-check-report.md
?? docs/qr-redirect-fix-report.md
?? docs/qr-redirect-split-report.md
?? docs/qr-redirect-trace-report.md
?? docs/qr-settings-layout-report.md
?? docs/qr-settings-preview-report.md
?? docs/rls-access-audit-report.md
?? docs/schedule-page-trace-report.md
?? docs/session-resilience-report.md
?? docs/template-create-proof-report.md
?? docs/tester-truck-provisioning-report.md
?? docs/token-exposure-investigation-report.md
?? docs/truck-profile-not-found-report.md
?? docs/uncommitted-batch-inventory-report.md
?? docs/website-embed-build-report.md
?? docs/website-embed-corrections-report.md
?? docs/website-embed-detection-report.md
?? docs/website-embed-links-report.md
?? docs/website-embed-read-report.md
?? docs/website-embed-report.md
?? docs/website-embed-wizard-report.md
?? docs/whatsapp-reply-cap-report.md
?? docs/whatsapp-reply-cap-v2-report.md
?? docs/wizard-move-report.md
?? docs/wizard-placement-report.md
?? ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme
?? lib/audit/pseudonymise.ts
?? lib/auth/session-observer.ts
?? lib/custom-domain/apex.ts
?? lib/custom-domain/cadence.ts
?? lib/custom-domain/copy.ts
?? lib/custom-domain/dns.ts
?? lib/custom-domain/redirect-target.ts
?? lib/custom-domain/vercel.ts
?? lib/custom-host.ts
?? lib/native/notificationIcon.ts
?? lib/whatsapp/reply-cap.ts
?? scripts/check-plain-english.mjs
?? supabase/migrations/20260826_trucks_embed_enabled.sql
?? supabase/migrations/20260826_trucks_embed_plan_answer.sql
?? supabase/migrations/20260826_trucks_embed_seen.sql
?? supabase/migrations/20260827_trucks_custom_domain.sql
?? supabase/migrations/20260827_trucks_custom_domain_monitor.sql
?? supabase/migrations/20260827_trucks_custom_domain_setup.sql
```
</details>

<details><summary><code>git diff --stat</code></summary>

```
 .gitignore                                         |    9 +
 android/app/build.gradle                           |   41 +
 android/app/src/main/AndroidManifest.xml           |   58 +-
 .../main/java/com/hatchgrab/app/MainActivity.java  |  292 +-
 .../app/src/main/res/drawable-land-hdpi/splash.png |  Bin 7705 -> 4235 bytes
 .../app/src/main/res/drawable-land-mdpi/splash.png |  Bin 4040 -> 2414 bytes
 .../src/main/res/drawable-land-xhdpi/splash.png    |  Bin 9251 -> 8079 bytes
 .../src/main/res/drawable-land-xxhdpi/splash.png   |  Bin 13984 -> 11981 bytes
 .../src/main/res/drawable-land-xxxhdpi/splash.png  |  Bin 17683 -> 17516 bytes
 .../app/src/main/res/drawable-port-hdpi/splash.png |  Bin 7934 -> 4561 bytes
 .../app/src/main/res/drawable-port-mdpi/splash.png |  Bin 4096 -> 2598 bytes
 .../src/main/res/drawable-port-xhdpi/splash.png    |  Bin 9875 -> 8479 bytes
 .../src/main/res/drawable-port-xxhdpi/splash.png   |  Bin 13346 -> 12269 bytes
 .../src/main/res/drawable-port-xxxhdpi/splash.png  |  Bin 17489 -> 18567 bytes
 android/app/src/main/res/drawable/splash.png       |  Bin 4040 -> 2414 bytes
 .../app/src/main/res/mipmap-hdpi/ic_launcher.png   |  Bin 2786 -> 839 bytes
 .../res/mipmap-hdpi/ic_launcher_foreground.png     |  Bin 3450 -> 1405 bytes
 .../src/main/res/mipmap-hdpi/ic_launcher_round.png |  Bin 4341 -> 839 bytes
 .../app/src/main/res/mipmap-mdpi/ic_launcher.png   |  Bin 1869 -> 543 bytes
 .../res/mipmap-mdpi/ic_launcher_foreground.png     |  Bin 2110 -> 946 bytes
 .../src/main/res/mipmap-mdpi/ic_launcher_round.png |  Bin 2725 -> 543 bytes
 .../app/src/main/res/mipmap-xhdpi/ic_launcher.png  |  Bin 3981 -> 1082 bytes
 .../res/mipmap-xhdpi/ic_launcher_foreground.png    |  Bin 5036 -> 1904 bytes
 .../main/res/mipmap-xhdpi/ic_launcher_round.png    |  Bin 6593 -> 1082 bytes
 .../app/src/main/res/mipmap-xxhdpi/ic_launcher.png |  Bin 6644 -> 1633 bytes
 .../res/mipmap-xxhdpi/ic_launcher_foreground.png   |  Bin 9793 -> 3063 bytes
 .../main/res/mipmap-xxhdpi/ic_launcher_round.png   |  Bin 10455 -> 1633 bytes
 .../src/main/res/mipmap-xxxhdpi/ic_launcher.png    |  Bin 9441 -> 2155 bytes
 .../res/mipmap-xxxhdpi/ic_launcher_foreground.png  |  Bin 15529 -> 4291 bytes
 .../main/res/mipmap-xxxhdpi/ic_launcher_round.png  |  Bin 15916 -> 2155 bytes
 app/admin/page.tsx                                 |  102 +-
 app/api/admin/route.ts                             |    2 +-
 app/api/manage/route.ts                            |  719 +++-
 app/api/native/bind-device/route.ts                |   55 +-
 app/api/webhooks/meta/whatsapp/route.ts            |  194 +-
 app/dashboard/[token]/kds/page.tsx                 |   34 +-
 app/dashboard/[token]/page.tsx                     |   31 +-
 app/kds/[kds_token]/page.tsx                       |   45 +-
 app/landing/landing.css                            |   63 +-
 app/landing/page.tsx                               |   61 +-
 app/layout.tsx                                     |   43 +-
 app/manage/[token]/page.tsx                        |  652 ++-
 app/providers.tsx                                  |   69 +-
 capacitor.config.ts                                |   24 +-
 components/TruckListCard.tsx                       |  103 +-
 components/dashboard/types.ts                      |   16 +
 components/manage/primitives.tsx                   |   11 +-
 components/native/OperatorDeviceConfig.tsx         |   53 +-
 components/native/VanMenuChooser.tsx               |   16 +-
 docs/reference-manual.md                           | 4526 +++++++++++++++++++-
 ios/App/App.xcodeproj/project.pbxproj              |    5 +-
 ios/App/App/Info.plist                             |    2 +
 lib/features.ts                                    |   12 +
 lib/generateQRCode.ts                              |   83 +-
 lib/native/device.ts                               |   64 +-
 lib/native/notifications.ts                        |   22 +-
 lib/native/signOut.ts                              |    9 +
 lib/plan-features.ts                               |   45 +-
 lib/ratelimit.ts                                   |  125 +
 package-lock.json                                  |   22 +-
 package.json                                       |    2 +
 proxy.ts                                           |  130 +-
 public/apple-touch-icon.png                        |  Bin 2066 -> 3161 bytes
 public/favicon.ico                                 |  Bin 1719 -> 1860 bytes
 public/icons/icon-192.png                          |  Bin 2337 -> 3367 bytes
 public/icons/icon-512.png                          |  Bin 7141 -> 10352 bytes
 public/manifest.json                               |   17 +-
 vercel.json                                        |   22 +
 68 files changed, 7420 insertions(+), 359 deletions(-)
```
</details>
