> ⛔ **SUPERSEDED — faq-1c was reverted outside the FAQ by faq-1c-undo (2 November 2026, docs/faq-1c-undo-report.md).** Dominic stopped
> faq-1c part-way: its brief was wrong, and Pay at Hatch stays exactly as it was, on every plan. Everything below outside the FAQ
> rows was put back (code, messages, plans data, Gusto's override, the comparison row). Kept as the record of what ran.

# faq-1c — Pay at Hatch becomes trial-only, and the FAQ notes

*2 November 2026. On `main`, committed (`142ea9ab` plus this report), not pushed, not deployed. **The migration was run by me**
with `scripts/db-migrate.cjs --approved-by-dominic`, on your explicit approval in the brief, and verified read-only (§3).*

## 0 · Summary

- **Your decision is live:**
  - Pay at Hatch is allowed only on the free trial: `plans.pay_at_hatch_allowed` is false on Pay as you go, Pro and
    Unlimited, and true on the trial. Demo and tester are unchanged.
  - Pizzeria Gusto keeps it through a truck override, whatever its plan.
  - Walk-up orders are untouched; they never pass this switch.
- **Every public promise now says it:**
  - the pricing banner (and the plans PDF, which reads the same message), in en-GB and all 28 languages;
  - the comparison pages' "pay at the truck" row ("partial — during the free trial"), their FAQ answer and their
    payment-methods note;
  - the dashboard's card-payments help and toast;
  - a new line in Manage › Payments, in all 28 languages.
- **The FAQ rows** you asked for are updated (English only). All six read correctly in all 44 countries. Your notes are
  ticked done.
- **Proof:** `scripts/faq-1c.cjs` **45 / 45**. translation-check: 3 structural in every locale (the three English-only
  `faq.phrases.*` keys only, as expected). Full sweep: §7.

## 1 · Diagnosis (read-only, before any change)

**Plans** (live, before): every plan had `pay_at_hatch_allowed = true` — payg, pro, unlimited, trial (the free trial;
internal), demo, tester.

**Overrides:**
- Per-truck overrides are `trucks.feature_overrides` (jsonb, `{ "<feature>": true|false }`).
- An override **beats** the plan. `lib/features.ts featureBlock` checks the truck's override first and returns "allowed"
  for `true` before the plan's switch is asked. The plan's flag only enters through that switch
  (`lib/plans.ts planAllowsFeature`).
- Every reader goes through this one order: the menu (`payAtHatchOn`), the order submit (`payAtHatchOn`), and Manage ›
  Payments (`features.block`). Nothing reads the plan flag on its own. So an override **can** switch Pay at Hatch on; no
  stop needed.
- `trucks` has no note column for overrides. `plan_price_override_note` belongs to the promo price, and you asked me not to
  touch the rest of Gusto's row. So the note "Dominic, 2 Nov 2026: keeps Pay at Hatch on until he decides otherwise" is in
  the migration's header and this report.

**Trucks that lose Pay at Hatch now** (effective plan Pay as you go, Pro or Unlimited, with no override):

| Truck | Plan (effective) | Test truck? | Upcoming events | Orders, last 30 days |
|---|---|---|---|---|
| Real Thai Food (`real-thai-food`) | trial → **payg** (its trial ended 30 Sep 2026) | `is_customer = true`, but the manual (§81.1) says it is not a customer | 0 | **0** |

That's the only one. No truck with real orders in the last 30 days loses it, so no stop was needed.

**Pizzeria Gusto** (trial until 31 Dec 2026; 2 upcoming events; 182 orders in 30 days) keeps it, now by override as well
as by its trial.

**Who loses it on 31 December 2026,** when their trials end (effective plan → Pay as you go): Pizza Kitchen (`test-kitchen`),
Pizza Kitchen US (`test-kitchen-us`), Tikka Tonic, and App Tester. All are test or non-customer trucks
(`is_customer = false`). Village Spice is on a trial with no end date. The demo trucks (plan `demo`) keep it.

**What a customer sees** when Pay at Hatch is off and the truck has no Stripe account with charges enabled (described, not
changed):
- `/api/menu` sets `ordering_available: false`: there is nothing a customer could pay with (`!payAtHatchOffered &&
  !cardPaymentsReady`, `app/api/menu/[truckId]/route.ts`).
- The order page then shows its "unconfirmed event" state: a 🕐, **"Orders not open yet"**, and **"{truck} hasn't confirmed
  this event yet. Check back closer to the date or follow them on social media for updates."**
- ⚠️ For this case that wording is misleading. The event is confirmed; the truck simply can't take payment. Worth its own
  message later.
- The same happens to a trial-ended truck that pauses its card payments from the dashboard (§4.4).

**Legal text** (the brief said stop and ask before editing it):
- The Terms mention Pay at Hatch once, at `content/legal/terms-and-conditions.md` §4: "**We charge no fee on Pay at Hatch
  orders or on walk-up orders.**"
- It stays true: Pay at Hatch orders still exist (on the trial and on Gusto), and they carry no fee.
- So no legal text was edited. Tell me if you want the Terms to say Pay at Hatch is the trial's only.
- Privacy and the Country-specific terms don't mention it.

## 2 · The migration — `supabase/migrations/20261057_faq_1c.sql` (run 2 Nov 2026)

One transaction, in which every step checks it touched exactly the rows it expected and raises otherwise:
1. `plans.pay_at_hatch_allowed = false` for payg, pro and unlimited. It must switch exactly 3; the trial must still be true.
2. `trucks.feature_overrides || {"online_ordering_pay_at_hatch": true}` for `pizzeria-gusto` only (exactly 1 row). No
   other column.
3. `comparison_features` `payattruck`: `hatchgrab_source` from `plan:online_ordering_pay_at_hatch` (which would now read "No"
   on every public plan) to `fixed:partial:note`. The note is `comparison.features.payattruck.ours`, "During the free trial".
   `data/comparison-features/features.json` says the same, so a fresh database matches.
4. The FAQ rows (§5). Each update applies only if the row's text is still exactly what I read live before writing the file.
   It then raises "is not as read live" otherwise, so it could never overwrite an Admin edit made in between. Statuses are
   never written. `note_done = true` is set on every "CHECK (Cursor): " note and on …0002, …0007, …0010 and …0015; no note's
   text is written.

**Run:**
```
$ npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261057_faq_1c.sql --approved-by-dominic
db-migrate: supabase/migrations/20261057_faq_1c.sql · sha256 56bf4fc73ec314fc · committed at 142ea9ab
db-migrate: supabase/migrations/20261057_faq_1c.sql applied — one transaction, no error
```

## 3 · Read-only verification (after the run)

| Check | Live |
|---|---|
| plans | `payg=false, pro=false, unlimited=false, trial=true, demo=true, tester=true` |
| every other plans column | md5 `00a2d882…` — **identical** to before the run |
| Gusto's overrides | `{"online_ordering_pay_at_hatch": true}` |
| every other column of Gusto's row | md5 `fb953514…` — **identical** to before the run |
| any other truck with a Pay at Hatch override | 0 |
| `payattruck` source | `fixed:partial:note` |
| every other comparison feature | md5 `7851f887…` — **identical** to before the run |
| FAQ | 25 rows, all still **published** |
| rows written | …0002, …0003, …0006, …0007, …0010, …0015 (`updated_by = 'faq-1c'`) |
| CHECK notes done | 8 / 8 (…0022's CHECK note was already gone; you deleted that question in Admin) |
| your notes done | …0002, …0007, …0010, …0015 = true |
| the six rows' text | md5 `1c2f8896ea04e29ca6ea0544bee1e62d` = **the same texts the harness checked in all 44 countries** |

## 4 · Every public promise, and what changed

**Patterns searched** in every message file and in `app/`, `components/` and `lib/`: `pay (when|as) they collect`,
`pay on collection`, `pay when collecting`, `pay at the (truck|hatch)`, `pay at hatch`, `{brand}`,
`without (connecting )?(a |any )?card processor`, `card processor at all`, `no card (processor|reader) (needed|required)`,
`order ahead and pay`, `pay later`, `pay in person`, `without stripe`, `no stripe`; plus the readers of the switch
(`payAtHatchAllowed`, `pay_at_hatch_allowed`, `payAtHatchOn`, `PAY_AT_HATCH_FEATURE`, `online_ordering_pay_at_hatch`).

1. **The pricing banner** (`pricing.banner.body` and `.bodyOnly`; also the plans PDF, which renders the same messages):
   - the first sentence, "With {brand}, customers order ahead and pay when they collect, so you can take online orders
     without connecting a card processor at all.", is now **"During your free trial, customers can order ahead and pay when
     they collect, so you can start before connecting card payments. After your trial, pre-orders are paid online by
     card."** The rest of each message (the second sentence, the trial end, no card, no contract) is unchanged;
   - en-US and en-AU keep their "pick up"; es-MX keeps its own message, with the same new sentence;
   - all 28 bases are done, each with its back-translation;
   - `{brand}` was only in that sentence, so no banner names it now (the code still passes it, harmlessly).
2. **The pricing cards:**
   - the first card's "Online ordering" bullet was keyed to the Pay at Hatch switch, so it would have vanished;
   - online ordering is still on every plan, through online card payments, so the bullet is now keyed to `online_payments`
     (`lib/feature-table.ts`). The cards and the PDF are unchanged.
3. **The /features table** has no Pay at Hatch row (it was removed on 20 October at your request), so no row shows three
   crosses. Nothing to change.
4. **The dashboard's card-payments switch:**
   - `dashboard.settings.cardsHelp` and `dashboard.toast.cardPayments` said that with cards off "customers pay at the
     hatch". With Pay at Hatch off on the plan, pausing cards actually stops online ordering (the menu has nothing to pay
     with).
   - Both now take `{pah}` (`features.can(PAY_AT_HATCH_FEATURE)`). Where it's on, the words are exactly as before. Where
     it's off: "Turn this off during a card problem and online ordering stops until you turn it back on — your plan doesn't
     include paying at the hatch. Walk-up orders carry on as normal." and "Card payments off — online ordering is paused
     until you turn them back on".
   - en-US ("window") and en-SG ("truck") keep their own words; all 28 bases are done.
5. **Manage › Payments:**
   - the PlanPrompt slot would have suggested upgrading to a plan, and no public plan has Pay at Hatch now;
   - in that slot, when the plan blocks it: **"{brand} is part of your free trial. Customers now pay for pre-orders online by
     card — connect Stripe below."** ({brand} is "Pay at Hatch" in en-GB and "Pay at the truck" elsewhere, as everywhere.)
     All 28 languages; no other UI.
6. **The comparison pages** (their words exist in en-GB and de-DE only, as today):
   - the "pay at the truck" row is now "partial" with the note "During the free trial" / "Während der kostenlosen Testphase";
   - `comparison.faq.paymentsA` now reads "Customers pay online by card, Apple Pay or Google Pay. During a truck's free trial
     they can also pay at the truck. …";
   - `comparison.features.paymethods.ours` (a hidden row) now reads "… ; pay at the truck during the free trial".
7. **/compare and /llms.txt:** they make no Pay at Hatch claim (checked). `/llms.txt` is byte-identical (harness §5).
8. **Left as they are, on purpose:**
   - the customer-facing words (the order page's "Pay at the truck" choice, emails, the status page) only appear when Pay at
     Hatch is actually offered;
   - `demoWalk.paymentPanel` describes the demo, where a new truck's trial does offer it.
9. **`MARKETING_COPY_UPDATED`** is already 2026-11-02 (copy-truth-1 moved it to today), so it stays. The landing differs from
   HEAD in the banner sentence only.

## 5 · The FAQ — final wording of the six rows (English only)

- **…0002 — What do I pay on each order?**
  - Answer: Nothing on walk-up orders, and nothing at all on {unlimited.name}. On online card orders, {payg.name} charges {payg.fee}, and {pro.name} charges {pro.fee} once you pass {pro.included} in a month. Online card payments also carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.
  - Single plan: Nothing. {unlimited.name} has no HatchGrab fee on any order. Online card payments carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.
- **…0003 — Is there a free trial, and what happens when it ends?**
  - Answer: Yes. Your first {trial.months} months are free with every feature unlocked, and you don’t need a card to start. When the trial ends you move to {trialEnd.name} ({trialEnd.price} a month). If you’d like a different plan, email us and we’ll switch you. Connect online card payments before your trial ends, because after it pre-orders are paid online.
  - Single plan: Yes. Your first {trial.months} months are free with every feature unlocked, and you don’t need a card to start. When your trial ends, {trialEnd.name} is {trialEnd.price} a month. We’ll be in touch before then to set up payment. Connect online card payments before your trial ends, because after it pre-orders are paid online.
- **…0006 — How long does it take to set up?**
  - Answer: Upload a photo of your menu and see it working in under 60 seconds. When you’re ready, sign up to start your {trial.months}-month free trial, check your menu, add where and when you’re trading, and connect Stripe so customers can pay online. We then switch your ordering page on.
- **…0007 — Do I need an iPad, card reader or special equipment?**
  - Answer: No. HatchGrab runs in the web browser on any phone, tablet or laptop. We recommend a tablet for the best experience, but it works on a phone too. You don’t need a card reader: pre-orders are paid online, and for walk-up orders you keep using the card machine you already have. {apps.sentence}
- **…0010 — Can customers pay at the truck instead of online?** (question unchanged)
  - Answer: During your free trial, yes: with {payAtTruck}, customers order ahead and pay when they collect, so you can try ordering before connecting card payments. After your trial, pre-orders are paid online by card into your own Stripe account. Walk-up orders are paid at the window as usual.
- **…0015 — How do customers know their order is ready?**
  - Answer: Customers choose their collection time when they order, so they know when to come. They also get an email confirming their order. If you switch on the order-ready step, they’re emailed again when you mark the order ready. You can also use your own buzzers, and HatchGrab records each order’s buzzer number, or call out the name on the ticket. (63 words.)

**Changes from your text:**
- …0015: "Customers get an email…" became "They also get an email…", so two sentences in a row don't start with "Customers". The
  rest is as it was.
- Apostrophes are typographic (’), as in every row.
- Everything else is word for word.

**One wording to check:** …0007's "pre-orders are paid online" is the after-trial rule. During a trial, customers can still
pay at the truck (…0010 says so). Say if you want …0007 to say "after your trial".

## 6 · Harness — `scripts/faq-1c.cjs`: 45 / 45 (registered)

1. **The pin:** replaying every migration in order, the trial has Pay at Hatch and Pay as you go, Pro and Unlimited don't
   (20261057 is the last write for each), with demo and tester as they were. 🔴 If a later migration turns it back on for a
   plan, this fails on purpose, so the banner and FAQ …0010 change in the same commit.
2. **Who has it:** Pizzeria Gusto resolves ON during its trial, after it (on Pay as you go), and on every public plan. A
   test truck on Pay as you go resolves OFF, blocked by the plan with no plan to upgrade to. A trial truck is ON, and a
   trial-ended one is OFF. Manage › Payments shows the new line in that slot (no PlanPrompt), in all 28 languages.
3. **The banner:** none of the 32 old first sentences remains (en-GB, en-US, en-AU, es-MX and the 28 bases, pinned from
   `069b5b05` in `scripts/fixtures/faq-1c-old-banner.json`). The new en-GB sentence is there with the rest unchanged, en-US
   says "pick up", and every base renders. The first card's bullet follows online payments. The comparison row is
   `fixed:partial:note` in both the file and the migration.
4. **The FAQ:** the six rows, rebuilt from 20261056 + 20261057, read correctly in all 44 countries, with no digit, sign or
   plan name outside a live value. …0015 is 80 words or fewer. Every write is guarded and no status is written.
5. **The landing page** for GB, US, BR and JP, rendered with Pay at Hatch off on every public plan, is identical to a HEAD
   capture (`scripts/fixtures/faq-1c-head.json`, made by the same script at `069b5b05`) apart from the banner sentence. The
   first card still says "Online ordering", and `/llms.txt` is byte-identical.

**translation-check:** 3 structural in all 35 locales (28 bases and 7 regional variants): `faq.phrases.appsSentence`,
`faq.phrases.appsOffline` and `faq.phrases.webOffline`, English-only by your faq-1 decision. **Expected.** None of the
changed keys is structural. Two glossary flags ("pre-order" in Malay and Hong Kong Chinese) were fixed before the commit,
to the glossary's "pra-pesanan" and "預先落單". The other flags on these keys are words that are native in their language
(Romanian "normal", Swedish "tills").

**The message record:** `scripts/fixtures/faq-1c-messages.json`, a seventh sibling of the plan-stage records, read by
`scripts/_lp2-frozen.cjs stageA()` after copy-truth-1, so the language-phase guards see these rewordings as named.

## 7 · Full sweep

*(below)*
