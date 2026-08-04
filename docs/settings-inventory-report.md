# Settings inventory — for the end-of-wizard review screen and walkthrough

**Date:** 4 August 2026. **Read-only** — nothing changed, no SQL run, no migration written.

Two premises to correct before the inventory, both material to what you can put on the screen:

* **W2a — the buzzer PROMPT is not on the Settings tab and cannot be.** It is per-event. Detail in W2a.
* **W1d — "plan-gated" is mostly aspirational.** `lib/features.ts` declares `auto_accept`, `meal_deals`,
  `upsells`, `offline_protection` and `online_ordering_pay_at_hatch` as features, but **none of those
  five is enforced anywhere in `app/` or `components/`**. Only three gates actually fire on Settings:
  `advance_preordering`, `branded_qr_code`, `whatsapp_replies`. So a Starter truck can switch
  auto-accept on today. Reported per row rather than repeated.

No garbled spans in the prompt.

---

## W1. THE COMPLETE SETTINGS INVENTORY

Grouped by the ten `<Card>` sections the tab already uses, in render order. `SettingsTab` is
[app/manage/[token]/page.tsx:7319-8988](app/manage/[token]/page.tsx#L7319-L8988).

**Legend.** (b) = what `PROVISION_PROFILES.operator` / `provisionTruck` writes. **Grasp** = column (e).
**Silent** = column (f): can getting it wrong change what a customer sees, or whether orders can be
placed, without the operator noticing?

### 1. Logo — [:7724](app/manage/[token]/page.tsx#L7724)

| Label | Column | (b) Provisioning | (c) DB default | (d) Plan-gated | Grasp | Silent |
|---|---|---|---|---|---|---|
| Upload logo | `trucks.logo_storage_path` | **nothing** | nullable, none | no | HIGH | NO |

### 2. Truck details — [:7744](app/manage/[token]/page.tsx#L7744)

| Label | Column | (b) Provisioning | (c) DB default | (d) | Grasp | Silent |
|---|---|---|---|---|---|---|
| Truck name * | `trucks.name` | **explicit** (`opts.name`) | — | no | HIGH | NO |
| Description | `trucks.description` | **nothing** | nullable | no | HIGH | NO |
| Cuisine type * | `trucks.cuisine_type` | **explicit** (`opts.cuisineType ?? null`) — `/api/setup` passes none, so **null**; the demo modal writes it afterwards via `update_settings` | nullable | no | HIGH | NO |
| Menu icon (Change emoji) | `trucks.truck_emoji` | **nothing** | unknown (code falls back `'🍕'`) | no | HIGH | NO |

### 3. Contact Details — [:7771](app/manage/[token]/page.tsx#L7771)

| Label | Column | (b) Provisioning | (c) DB default | (d) | Grasp | Silent |
|---|---|---|---|---|---|---|
| Email * | `trucks.contact_email` | **explicit** (`opts.contactEmail`; `/api/setup` passes `operator.email`) | nullable | no | HIGH | **YES** — new-order alerts go here, and it is printed on the customer's confirmation when "Email" is the preferred method |
| Phone * | `trucks.contact_phone` | **not by `provisionTruck`** — `/api/setup` writes it post-provision (slice I) | nullable | no | HIGH | **YES** — reaches customers in every transactional email and on the public discovery feed |
| This number is on WhatsApp | `trucks.phone_is_whatsapp` (+ derived `trucks.whatsapp`) | **nothing** | unknown | no | MEDIUM | NO |
| Preferred method | `trucks.preferred_contact_method` | **nothing** | nullable | no | MEDIUM | **YES** — this is what the customer is told to use on their confirmation email |
| Allow customers to cancel orders | `trucks.allow_customer_cancellation` | **nothing** | **true** (migration comment) | no | MEDIUM | **YES** — decides whether a customer can cancel at all |
| …up to *N* before their pickup time | `trucks.cancellation_cutoff_mins` | **nothing** | unknown (code falls back `30`) | no | MEDIUM | **YES** — see W2c |

### 4. Online presence & social — [:7848](app/manage/[token]/page.tsx#L7848)

| Label | Column | (b) | (c) | (d) | Grasp | Silent |
|---|---|---|---|---|---|---|
| Website | `trucks.website` | **nothing** | nullable | no | HIGH | NO |
| Auto-replies → WhatsApp | `trucks.whatsapp_sender` | **nothing** | nullable | **YES — `whatsapp_replies`** (Pro/Max; disabled input + `FeatureGate` off-plan) | LOW | NO |
| Auto-replies → Messenger | *none* | — | — | hard-disabled, "Coming soon" | — | — |
| Auto-replies → Instagram | *none* | — | — | hard-disabled, "Coming soon" | — | — |

⚠️ `social_instagram` and `social_facebook` are on `update_settings`' allowlist but **have no UI on this
tab**. Nothing on Settings can set them.

### 5. Your schedule — [:7954](app/manage/[token]/page.tsx#L7954)

| Label | Column | (b) | (c) | (d) | Grasp | Silent |
|---|---|---|---|---|---|---|
| "I'll add events myself" / "Find my events automatically" | `trucks.scraper_preference` | **nothing** | **`'manual'`**, CHECK `('auto','manual','both')` | no | MEDIUM | NO |
| Where do you post your schedule? (+ Verify) | `trucks.schedule_url` | **nothing** | nullable | no | MEDIUM | NO |

### 6. Import exclusions — [:8043](app/manage/[token]/page.tsx#L8043) — **conditional**

Renders only when `settingsExclusionList.length > 0`. Rows in an `excluded_terms` table, not a truck
column; the only action is Remove. Not provisioned, not gated. **Grasp LOW · Silent NO.** A brand-new
truck will never see this section.

### 7. Order QR code — [:8072](app/manage/[token]/page.tsx#L8072)

| Label | Column | (b) | (c) | (d) | Grasp | Silent |
|---|---|---|---|---|---|---|
| Order link (display + Copy) | derived from `trucks.slug` | read-only | — | no | HIGH | NO |
| QR code style → Standard | `trucks.qr_code_style` | **nothing** | **`'standard'`, NOT NULL** | no | HIGH | NO |
| QR code style → Branded | same column | — | — | **YES — `branded_qr_code`** (Pro/Max) | HIGH | NO |
| Generate / Download PNG / Regenerate | none (client-side) | — | — | — | HIGH | NO |

### 8. Order settings — [:8188](app/manage/[token]/page.tsx#L8188)

Sub-panel **"Accepting orders"**:

| Label | Column | (b) | (c) | (d) | Grasp | Silent |
|---|---|---|---|---|---|---|
| Auto-accept orders | `trucks.auto_accept` | **explicit `false`** | — | declared `auto_accept` (Pro) but **not enforced** — see W2b | MEDIUM | **YES** |
| Review orders with notes before accepting *(child; only when auto-accept is on)* | `trucks.notes_require_review` | **nothing** | unknown (code reads `?? true`) | no | MEDIUM | **YES** — decides whether an allergy note stops an order for a human |

Loose row:

| Email order notifications | `trucks.truck_order_email_enabled` | **explicit `true`** | `true` | no | HIGH | **YES** — off means no new-order email arrives at all |

Sub-panel **"Taking payment"**:

| Separate paid step | `trucks.show_paid_step` | **nothing** | unknown (code reads `=== true`, so a null default reads OFF) | no | MEDIUM | NO — operator-facing button layout |
| Do you take cash? *(child; disabled unless the paid step is on)* | `trucks.takes_cash` | **nothing** | unknown (`=== true`) | no | MEDIUM | NO |

Sub-panel **"Opening and closing"**:

| Open for orders automatically | `trucks.default_auto_open` | **explicit `true`** (hardcoded, not profile-driven) | — | no | MEDIUM | **YES** — decides whether an event ever opens for online orders |
| Close for orders automatically | `trucks.default_auto_close` | **explicit `true`** (hardcoded) | — | no | MEDIUM | **YES** |

### 9. Pre-orders — [:8366](app/manage/[token]/page.tsx#L8366) — **whole card hidden off-plan**

Gate: `canAccess(plan, 'advance_preordering', …)` at [:7364](app/manage/[token]/page.tsx#L7364). A
Starter truck never sees this section at all.

| Label | Column | (b) | (c) | Grasp | Silent |
|---|---|---|---|---|---|
| Pre-orders master toggle | `trucks.preorders_enabled` | **explicit `false`** | `not null default true` (a backfill default — provisioning overrides it deliberately) | MEDIUM | **YES** |
| When pre-orders open | `trucks.preorder_open_rule` | **nothing** | **`'on_confirm'`, NOT NULL** | LOW | **YES** |
| Deadline type / value | `trucks.preorder_deadline_type`, `preorder_deadline_value` | **nothing** | nullable, none | LOW | **YES** |
| If the deadline has passed | `trucks.preorder_past_action` | **nothing** | nullable, none | LOW | **YES** |
| Choose pre-order items | `menu_items_db.preorder_enabled` (per item) | n/a | — | LOW | **YES** |

### 10. Your trucks — [:8517](app/manage/[token]/page.tsx#L8517) — **per van**

| Label | Column | (b) | (c) | (d) | Grasp | Silent |
|---|---|---|---|---|---|---|
| Van name (Rename / Delete) | `truck_vans.name` | **explicit** (`'Van 1'` default) | NOT NULL, no default | Delete hidden when only one van | HIGH | NO |
| + Add truck | new `truck_vans` row | — | — | **YES** — van-limit upgrade modal | HIGH | NO |
| Offline order protection | `truck_vans.auto_pause_on_offline` | **nothing** | **`not null default false`** | declared `offline_protection` (Pro) but **not enforced** | MEDIUM | **YES** — when on, online orders pause if the kitchen device drops |
| Order-ready step | `truck_vans.order_ready_enabled` | **nothing** | unknown | no | MEDIUM | **YES** — decides whether customers get a "ready" notification |
| Do you hand out buzzers for collection? | `truck_vans.buzzer_count` | **explicit `null`** (slice G added `buzzerCount` to the profile; operator = null) | nullable, none | no | HIGH | NO |
| How many buzzers do you have? *(child; only when the toggle is on)* | same column, 1–30 | — | — | no | HIGH | NO |
| Kitchen capacity → per-category **Prep** | `menu_categories.prep_secs` | set from the import wizard's `categoryPrep`, else `0` | — | no | LOW | **YES** |
| Kitchen capacity → per-category **Items** (batch) | `menu_categories.batch_size` | as above, else `0` | — | no | LOW | **YES** |
| Kitchen capacity → **Counts to total capacity** | `menu_categories.counts_toward_capacity` | derived at commit (`prep>0 → true`) | `not null default false` | no | LOW | **YES** |
| **Total capacity** (∞ = no limit) | `truck_vans.kitchen_capacity` | **explicit `null`** — `/api/setup` passes `van: { kitchen_capacity: null }` *deliberately* ("must be an active decision, not an inherited guess") | nullable | no | LOW | **YES — the single most consequential setting on the page.** It governs quoted collection times and slot availability |
| Capacity window (every N minutes) | `truck_vans.capacity_window_mins` | **nothing — omitted deliberately** | **`NOT NULL DEFAULT 5`** | no | LOW | **YES** |

### ⚠️ Dead state in this tab

`crewMode`, `kdsMode` and `displayMode` are initialised from the truck at
[:7338-7340](app/manage/[token]/page.tsx#L7338-L7340) but **render no control anywhere in the tab**.
`show_cooking_step` is likewise kept dormant with its toggle removed. Do not put these on a review
screen — they are not settings the operator can currently reach here.

### The DB defaults I could not determine from the repo

Several of these columns predate the `supabase/migrations/` convention, so the repo does not record
their defaults and I have only reported what the **code** assumes. Run this to get the truth:

```sql
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'trucks' and column_name in (
      'truck_emoji','phone_is_whatsapp','preferred_contact_method','allow_customer_cancellation',
      'cancellation_cutoff_mins','notes_require_review','truck_order_email_enabled',
      'show_paid_step','takes_cash','default_auto_open','default_auto_close'))
    or (table_name = 'truck_vans' and column_name in ('order_ready_enabled','buzzer_count'))
  )
order by table_name, column_name;
```

---

## W2. THE THREE YOU ALREADY WANT

### (a) Buzzers — 🔴 the prompt is NOT reachable from Settings, and does not belong on a settings screen

| | Pool | Prompt |
|---|---|---|
| Column | `truck_vans.buzzer_count` `smallint null` | `truck_events.buzzer_prompt` `boolean null` |
| Scope | **per van** | **per event** |
| On Settings? | **Yes** — "Do you hand out buzzers for collection?" + a 1–30 count, [:8654-8692](app/manage/[token]/page.tsx#L8654-L8692) | **No. There is no control for it anywhere in Manage.** |
| Written by | `update_van_settings` (Manage) | `set_buzzer_prompt_override` ([app/api/dashboard/action/route.ts:1568](app/api/dashboard/action/route.ts#L1568)) — **dashboard only**, `.eq('id', eventId)` |

**What a new operator truck has today:** `buzzer_count = null` (the operator profile writes null
explicitly — slice G changed only the *demo* profile), and no events, so no `buzzer_prompt` row exists.
Net: **buzzers are entirely off and the feature is hidden.**

**Resolution**, [lib/buzzer.ts:83-90](lib/buzzer.ts#L83-L90):

```
buzzer_count == null → { buzzerCount: null, buzzerPrompt: false }
else                 → { buzzerCount,       buzzerPrompt: event.buzzer_prompt ?? true }
```

**🔴 So the prompt is not per-truck and there is no truck-level column to expose.** Putting it on a
settings screen would mean either inventing a truck default (a schema change) or writing to whichever
event happens to be active — which is exactly what the dashboard already does, and what the migration
comment forbids Manage from doing. A per-event override that "expires by itself" when the next event
starts has no honest representation on a page describing permanent defaults.

**What you *can* put on the review screen** is the pool toggle alone — one question, HIGH grasp, no
silent consequence, and turning it on makes the dashboard's per-event prompt reachable. That is the
whole of the buzzer story that belongs there.

### (b) Auto-accept

| | |
|---|---|
| Column | `trucks.auto_accept` |
| Provisioning | **explicit `false`** — *"an operator decides this deliberately"* |
| What it does | Incoming **web** orders are confirmed immediately instead of waiting for the operator. Two carve-outs it states inline: slot-capacity limits still apply (a full slot is never auto-confirmed), and with `notes_require_review` on, an order carrying a customer note (e.g. an allergy) still waits. |
| Plan-gated? | **Declared but not enforced.** `'auto_accept'` is in `PRO_FEATURES` and absent from `starter`, but `grep` finds **no `canAccess`/`can()` call for it anywhere in `app/` or `components/`** — its only appearance outside `lib/features.ts` is the `update_settings` allowlist. **A Starter truck can turn it on today.** |
| Silent? | **YES** — turning it on changes what happens to every incoming order, with no customer-visible cue to the operator. |

### (c) Customer cancellation window

| | |
|---|---|
| Columns | `trucks.allow_customer_cancellation` (toggle) + `trucks.cancellation_cutoff_mins` (15 / 30 / 60 / 120) |
| Provisioning | **neither is written.** Both inherit DB defaults. |
| Defaults | `allow_customer_cancellation` — **`true`** per the migration comment. `cancellation_cutoff_mins` — not recorded in the repo; the client falls back to **30**. |
| What it does | Whether a customer may cancel their own order, and how close to their pickup time they may still do it. |
| Plan-gated? | **No.** |
| Silent? | **YES** on both — the operator never sees a cancellation they did not receive, and the cutoff silently decides whether the "cancel" affordance appears on the customer's order. |

⚠️ Note for the review screen: these two are **on by default and nobody has ever chosen them.** They
are among the strongest candidates in the whole inventory.

---

## W3. WHAT PROVISIONING ACTUALLY SETS

### `PROVISION_PROFILES.operator`, verbatim ([lib/provision-truck.ts:110-127](lib/provision-truck.ts#L110-L127))

```ts
operator: {
  identity: 'readable',
  plan: 'demo',                 // pre-trial "setup mode" — NOT 'trial'. canAccess() returns false for
                                // EVERY feature when plan==='trial' && trial_expires_at is null.
  nameRequired: true,
  truckOrderEmailEnabled: true,
  allergenDisplayMode: null,    // operator chooses in the wizard
  autoAccept: false,            // an operator decides this deliberately
  // OFF at creation. Pre-orders are a decision about how they trade, and a truck with no menu and no
  // event cannot take one — showing the deadline section already switched on before there is anything
  // to pre-order presents a configured feature as a fait accompli. Settings is where it goes on.
  preordersEnabled: false,
  // 🔴 UNCHANGED BY G3 — null, exactly as before. A real operator decides whether their van carries
  // buzzers at all, in Manage → van settings. Provisioning must not answer that for them.
  buzzerCount: null,
},
```

### Every column the truck insert writes ([:303-333](lib/provision-truck.ts#L303-L333))

`id`, `slug`, `name`, `dashboard_token`, `dashboard_pin` (null), `sheet_id` (`''` — a legacy NOT NULL
landmine), `active` (true), `plan` (`'demo'`), `trial_expires_at` (null), `operator_id` (null),
`contact_email`, `cuisine_type`, `truck_order_email_enabled` (true), `auto_accept` (false),
`allergen_display_mode` (null), `preorders_enabled` (false), `default_auto_open` (true),
`default_auto_close` (true), plus `HIDDEN_VISIBILITY`: `show_on_vf` false, `show_on_hg` false,
`order_link_vf` false, `order_link_hg` false, `is_customer` false, `excluded` true.

### Every column the van insert writes ([:347-383](lib/provision-truck.ts#L347-L383))

`truck_id`, `name` (`'Van 1'`), `active` (true), `kitchen_capacity` (**explicit null** for an operator
signup — `/api/setup` passes it), `buzzer_count` (null), and `capacity_window_mins` **only if the caller
passes it** (`/api/setup` does not). `kds_token` omitted deliberately (DB default).

Written **outside** `provisionTruck`, by `/api/setup` immediately afterwards: `operator_id`,
`setup_step = 'menu'`, `contact_phone`.

### 🔴 THE INTERESTING LIST — Settings-tab columns nobody has ever chosen

Every one of these is on the Settings tab, is **never written at provision time**, and therefore sits at
whatever the database decided. This is your candidate pool.

| Column | Inherits | Silent? |
|---|---|---|
| `trucks.allow_customer_cancellation` | **true** | **YES** |
| `trucks.cancellation_cutoff_mins` | unknown (code assumes 30) | **YES** |
| `trucks.notes_require_review` | unknown (code assumes true) | **YES** |
| `trucks.preferred_contact_method` | null → "Not specified" | **YES** |
| `trucks.show_paid_step` | unknown → reads OFF | NO |
| `trucks.takes_cash` | unknown → reads OFF | NO |
| `trucks.preorder_open_rule` | `'on_confirm'` | **YES** |
| `trucks.preorder_deadline_type` / `_value` / `_past_action` | null | **YES** |
| `trucks.scraper_preference` | `'manual'` | NO |
| `trucks.schedule_url` | null | NO |
| `trucks.qr_code_style` | `'standard'` | NO |
| `trucks.truck_emoji` | unknown (client shows 🍕) | NO |
| `trucks.phone_is_whatsapp` / `whatsapp` | unknown / null | NO |
| `trucks.website`, `description`, `logo_storage_path` | null | NO |
| `trucks.whatsapp_sender` | null | NO |
| `truck_vans.auto_pause_on_offline` | **false** | **YES** |
| `truck_vans.order_ready_enabled` | unknown | **YES** |
| `truck_vans.capacity_window_mins` | **5** | **YES** |

**Eleven of these are marked Silent.** If the review screen exists to catch anything, this is the list
it should be drawn from — and the four I would put in front of a fifteen-minute-old operator, on the
basis of Silent=YES combined with a grasp of MEDIUM or better, are:

1. **Total capacity** (`truck_vans.kitchen_capacity`) — explicitly left blank, and the one that decides
   whether quoted collection times are honest.
2. **Allow customer cancellation + window** — on by default, never chosen, entirely customer-facing.
3. **Auto-accept** — off by default, and the operator's first "why is nothing happening?" moment.
4. **Order-ready step** (`truck_vans.order_ready_enabled`) — decides whether customers are told their
   food is ready.

---

## W4. DEALS, UPSELLS AND EXTRAS

| Thing | Tab | What it does, in one line | Plan-gated? | Empty-state-blocked for a new truck? |
|---|---|---|---|---|
| **Deals** | `Deals` 🎁 ([:5434](app/manage/[token]/page.tsx#L5434)) | Bundle several menu slots into one fixed price ("any pizza + drink + dip for £12"). | Declared `meal_deals` — **in every plan including Starter**, and **not enforced anywhere**. | Not blocked, but **effectively so**: every slot is a category dropdown, so with no categories there is nothing to build a deal from. Empty state: 🎁 "No deals yet". |
| **Upsells** | `Extras & Upsells` ⚡, section 1 ([:5397](app/manage/[token]/page.tsx#L5397)) | "Customers who order from category X get offered category Y" — a suggestion rule at checkout. | Declared `upsells` — **in every plan**, and **`grep` finds zero enforcement sites**. | Same: a rule is category → category, so it needs at least two categories. Empty state: "No upsell rules yet." |
| **Custom Extras** (modifier groups + options) | `Extras & Upsells` ⚡, section 2 ([:5405](app/manage/[token]/page.tsx#L5405)) | Per-item choices and add-ons — sizes, toppings, sides — with optional surcharges, attached to menu items. | **No gate at all**, declared or otherwise. | Needs items to attach groups to; the import wizard's Extras step already creates these for a menu that has variants. |

**For the walkthrough copy:** none of the three is locked for a new truck, and all three depend on the
menu existing first. The honest ordering is menu → categories → deals/upsells, which is the order the
setup wizard already puts them in.

---

## W5. WHERE A "SHOW ME AROUND" ENTRY POINT COULD LIVE

**There is nowhere natural, and I would say that plainly rather than pick the least-bad slot.**

What exists on Manage, exhaustively:

* **`AppHeader`** — Village Foodie logo, truck name/logo, the subtitle "Management console", an
  "← Orders dashboard" link (desktop only), and `UserMenu`.
* **`UserMenu`** ([components/dashboard/UserMenu.tsx](components/dashboard/UserMenu.tsx)) — an *account
  and device* menu: identity block, Screen on/off, Sound on/off, Order link, QR code, Kitchen screen,
  van chooser (native), "📱 This device" (native), ⚙️ Manage, ← Orders dashboard (mobile), 🔐 Admin
  (admins), Sign out. **No help, no support, no about, no divider it would sit under.**
* **The tab bar** — eight tabs, all destinations.
* **No footer.** The app-shell is `header → tabs → <main>` with nothing below; `grep` for `<footer>`
  returns nothing on the page.
* **No help centre, no support link, no tour, no coach marks** anywhere in the file. The only support
  affordance in the whole of Manage is `SUPPORT_EMAIL`
  ([:8987](app/manage/[token]/page.tsx#L8987)), used for a single `mailto:` upgrade link inside
  `BillingTab`.

The three places a re-open link *could* go, with the honest objection to each:

1. **`UserMenu`** — closest fit, since it is already the miscellaneous menu. But it is currently
   strictly *account and device*, and it is **shared with the dashboard and the KDS**, so anything added
   appears on all three unless gated.
2. **A new Settings card** — cheap and self-contained, but a walkthrough is not a setting, and it would
   sit at the bottom of the longest page in the product where nobody scrolls.
3. **A new "Help" tab** — a ninth tab for one link, on a bar that already scrolls horizontally on a
   phone.

If the walkthrough is worth re-opening, the missing thing is a help surface, not a slot in an existing
one. Worth deciding that deliberately rather than by picking (1).

---

## W6. THE TAB BAR AS IT STANDS NOW

Slice H changed nothing here — no tab is conditional on `inSetup`, and the wizard renders as a `z-50`
overlay *above* the bar rather than altering it.

Defined at [app/manage/[token]/page.tsx:396-409](app/manage/[token]/page.tsx#L396-L409). In render
order, what an **owner** on a non-tester plan sees:

| # | id | Label | Icon |
|---|---|---|---|
| 1 | `menu` | **Menu** | `truck.truck_emoji` or 🍕 — **the icon is the operator's own emoji, not a fixed glyph** |
| 2 | `schedule` | **Schedule** | 📅 |
| 3 | `deals` | **Deals** | 🎁 |
| 4 | `modifiers` | **Extras & Upsells** | ⚡ |
| 5 | `reports` | **Reports** | 📊 |
| 6 | `team` | **Team** | 👥 |
| 7 | `settings` | **Settings** | 🔧 |
| 8 | `billing` | **Billing** | 💳 |

**Conditionals, all of them:**

* **Billing** renders only when `userRole === 'owner'` **and** `truck.plan !== 'tester'`. Everything else
  requires `roles.includes(userRole)` where every tab lists `['owner','manager']` — so a **manager sees
  tabs 1–7**, and any role that is neither owner nor manager sees **none**.
* **Label decoration, not extra tabs** — two tabs change their own label in place:
  * `schedule` → `Schedule (8)` in orange when `pendingApprovalCount > 0`;
  * `menu` → `Menu (!)` in orange when `allergensUnverified`.
  Coach marks anchoring to these must not assume a static string.
* The row is `overflow-x-auto`, so on a phone the later tabs (Team, Settings, Billing) are
  **off-screen until scrolled**. A coach mark pointing at Settings will need to scroll it into view.
