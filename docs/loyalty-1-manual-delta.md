# loyalty-1 — reference manual delta (5 November 2026)

For whoever next applies a delta to `docs/reference-manual.md`. **loyalty-1 did not edit the manual** (a parallel session owns it). Three
pieces below: the replacement section, the backlog line, and a changelog entry. The full detail is in `docs/loyalty-1-report.md`.

---

## 1 · Replace the whole "Loyalty stamp cards" section

**Find:** the section that starts `## Loyalty stamp cards (~~Max,~~ coming soon) — V4` (in "4.", just after the `is_test` rule) and runs to
the line before `## Branded QR code (~~Pro+~~) — V4`.

**Replace it with:**

```markdown
## Loyalty stamp cards — built, switched off (loyalty-1, 5 Nov 2026) — UI, checkout redemption, emails and launch decisions (backfill, plans, privacy wording) still to design

⛔ **Corrected loyalty-1 (5 Nov 2026):** the backend is built and **switched off**. There is no customer, Manage or Admin screen, no
email, and redemption is not connected to checkout or prices. On the pricing and features pages loyalty is still a **coming soon** row
on **every** plan (`lib/feature-table.ts`; no feature key, no `plan_features` row). ~~Schema is loyalty_cards(id, truck_id,
customer_email, customer_phone, stamps_earned, stamps_redeemed, created_at, last_stamp_at).~~ The V4 schema was never built. What exists
is below. Report: `docs/loyalty-1-report.md`.

- **V1 rule (unchanged):** one stamp per order, on every plan. No flexible stamp rules until V1 is live and operators ask for them.
- **Two switches, both off:**
  - global: `platform_switches.loyalty_enabled` (false);
  - per truck: `truck_loyalty_settings.enabled` (false; no rows exist yet).
- **Tables (migration `20261073_loyalty_1.sql`):**
  - **Security on every table:** RLS on, no policies, nothing granted to anon or authenticated (service role only).
  - **The customer:** stored only as `customer_key`, the salted email hash from reviews-weather-1. That is sha256 of the truck id and
    the trimmed, lower-cased email (`lib/reviews/model.ts` `emailHash`), so a customer has one key per truck across reviews and
    loyalty. The email address itself is never stored.
  - `truck_loyalty_settings`:
    - `truck_id` is the primary key, referencing trucks;
    - `enabled`, `enabled_at`;
    - `stamps_required`: 2–20, default 8;
    - `reward_type`: `free_item` or `amount_off`;
    - `reward_menu_item_id` or `reward_amount_minor`, depending on the type (a CHECK enforces this);
    - `reward_label`: the truck's own words, up to 80 characters;
    - `reward_expires_days`;
    - `updated_at`, `updated_by`.
    - A truck can switch loyalty on only once a reward is set.
  - `loyalty_cards`:
    - one row per (truck, customer_key);
    - `stamps` (current, never below 0) and `lifetime_stamps`;
    - `created_at`, `last_stamp_at`.
  - `loyalty_stamps`:
    - an append-only ledger;
    - `order_key` is UNIQUE and references orders, so there is one stamp per order;
    - `stamped_at` is the time the order was collected;
    - `reversed_at` and `reversed_reason` (`cancelled` or `refunded`).
  - `loyalty_rewards`:
    - `earned_at` and `earned_from_stamp_id` (unique);
    - `stamps_used`, so that a reversal can restore the card exactly;
    - `expires_at`;
    - `redeemed_at` and `redeemed_order_key` (unique: one reward per order);
    - `voided_at` and `voided_reason`.
- **Atomic functions:** `loyalty_apply_stamp`, `loyalty_reverse_stamp` and `loyalty_redeem_reward`.
  - Each locks the card row, and each can be called twice safely.
  - They are security invoker, and only the service role can execute them.
  - The migration ran them once against the live schema in a self-check that was rolled back.
- **When a stamp is earned:** all of these must hold:
  - the order is `collected`, with a customer email (online orders, or walk-ups where one was given);
  - its total is above zero;
  - the truck's loyalty is on, and the order was collected **after** `enabled_at`;
  - it is not a demo truck (`demo-…`), and not a test-mode payment (`order_payments.livemode = false`);
  - it has not already been fully refunded.
- **At the threshold:** when stamps reach `stamps_required`, the card earns one reward and loses that many stamps. Extra stamps carry
  over. Expiry counts from the moment the reward is earned.
- **Reversal:** a stamped order that is later cancelled or rejected, or **fully** refunded, loses its stamp. A partial refund keeps it.
  - **If that stamp completed a reward that is still unredeemed:** the reward is voided, and the card goes back to what it would be
    without that stamp.
  - **Otherwise:** the card loses one stamp, never going below zero. A reward that was already redeemed stands.
- **The job:** `app/api/cron/loyalty-stamps` runs every 10 minutes (it is in `vercel.json` crons).
  - While the global switch is off, it reads that one row and returns `{ enabled: false }` before reading any order.
  - It only **reads** orders and `order_payments`. Stamps come from the last 7 days, and reversals are re-checked over 90 days.
  - Nothing in order placement, the dashboard action route, status changes, payments or customer pages calls loyalty.
- **Written but not wired:**
  - **Server functions** (`lib/loyalty/service.ts`):
    - `getLoyaltyCard(truckId, email)`;
    - `redeemReward(rewardId, orderKey)`, which never changes an order's price;
    - `readSettings` and `writeSettings`, validated.
  - **The backfill** `backfillTruckLoyalty` (`lib/loyalty/run.ts`) stamps past orders. It is a dry run by default and has never been
    run.
- **Privacy:**
  - **The daily 12-month retention job** (`lib/order-retention.ts` → `lib/loyalty/retention.ts`) deletes:
    - stamps older than 12 months;
    - rewards redeemed, voided or expired more than 12 months ago;
    - cards with no stamp for 12 months, together with their stamps and rewards.
  - **Account deletion** deletes the trucks' cards and settings. **The hard delete** cascades from `trucks(id)`.
  - The privacy policy does **not** mention loyalty yet. The wording is a launch decision (the report lists what it needs to say).
- **Still to design:**
  - the customer card UI, the Manage settings screen and the Admin view;
  - redeeming a reward at checkout, and pricing it;
  - emails;
  - the launch decisions: whether past orders count (the backfill), plans and the "coming soon" row, and the privacy wording.
```

**Also stale (same fact, a short pointer):** in "Resolved this session (V6.6)", the line
`- **loyalty_cards (planned)** — V4 spec frozen. Do not build until instructed.` → replace with:

```markdown
- **loyalty_cards** — ⛔ *Corrected loyalty-1 (5 Nov 2026): built to a new schema, switched off; see "Loyalty stamp cards" (§4).*
```

---

## 2 · The backlog line

**Find (in the backlog list):**

```markdown
- Loyalty stamp cards V1 build (Max only) — when instructed. ⛔ *Corrected V16.2 — there is no Max tier: a trial has every feature, and only WhatsApp auto-replies, social media posts, Messenger & Instagram (coming soon) and custom event types are off on Pay as you go (§81.1).*
```

**Replace with:**

```markdown
- Loyalty stamp cards V1 — ~~build (Max only) — when instructed~~ ⛔ *Corrected loyalty-1 (5 Nov 2026): the backend is built and switched off (`docs/loyalty-1-report.md`). Still to design: the customer card, the Manage settings screen and the Admin view; redemption at checkout and its pricing; emails; and the launch decisions (whether past orders count, plans and the "coming soon" row, the privacy-policy wording). There is no Max tier (V16.2).*
```

(The separate `- Loyalty redemption UX.` line further down is still accurate and can stay.)

---

## 3 · Changelog entry (one line)

```markdown
- **Loyalty stamp cards, backend only, switched off (loyalty-1, 5 Nov):** migration 20261073 (4 tables, RLS on with no policies, 3 atomic functions, global switch false); a 10-minute cron that does nothing while the switch is off; server functions and a backfill not wired or run; loyalty added to the 12-month retention job and account deletion; no UI, email, checkout, plan or privacy-text change (`docs/loyalty-1-report.md`).
```
