# partners-2: partner import and verification, codes that apply a deal, commission, sending in local working hours

16 November 2026. Not deployed. **Nothing was sent**: no email, no test email. No `outreach_templates` row was created, edited, seeded or deactivated. No `.env` file was opened. Nothing was tested against Pizzeria Gusto or Le Roi du Churrasco.

## 0. Brief check, and two decisions for you

- **Garbled spans: none.** "gulftobayfta+1" is the `+1` plus-alias of the same Gmail address; it was dropped as a duplicate.
- **Started after admin-speed-1 committed** (`5be09e44`).
- **Messages:** touched only while `git status` showed no other session's changes in `messages/`. Committed straight away in their own commits (`f5640f13`, then `2f3299b5`). The languages-world-3 session was told about the keys, including the correction.
- **Your commit `9cc5edea` "free trial"** contained this workstream's code, screenshots and the first draft of this report. It also added `docs/partners-2/gemini-partner-list-2.md` and `docs/partners-2/claude-leads-2026-11-16.csv`. ⚠️ Those two new lists were **not** imported: they arrived after the brief. Say if they should go through the same verification and import.

### 🔴 Decision 1: how a percentage-off code reaches the paid plan (§3.3)

The brief says a percent-off code applies through "the existing plan price override with an end date, computed from the country's plan price". The existing override (`lib/plans.ts truckPlanPrice`) only applies **while the truck is on the plan it was given**. A new signup is given the **Free trial** (3 months), then falls back to Pay as you go, or moves to Pro or Unlimited. So an override set at signup would never reach a paid month. That isn't a choice I should make for you.

Today an **extra-months** code works end to end. A **percent-off** code is validated, shown, recorded with its deal, and attributes the truck, but **no price override is written yet**.

The options:
- **A (my recommendation).** Apply the discount when the truck moves onto a paid plan. At that moment (trial end with a chosen plan, or any plan change), set `plan_price_override_minor` to that plan's price in the truck's country less the percentage, for N months from that day. This is the existing mechanism, at the right moment. It needs a small hook where the plan changes. Billing is off, so it changes nothing for anyone today.
- **B.** Apply it at signup against the trial plan. Simple, but the discount would run out unused during the free months.
- **C.** Keep percent-off codes as recorded-only, and set the override by hand in Admin when such a truck upgrades. The code card shows which trucks used it.

### Decision 2: templates (§5)

The English drafts are below. Say "templates approved", with any edits. I'll then translate them into each partner's language, with back-translations, and only then create the rows.

### Choices I made, for you to check

- **The daily cap.** It counts truck and partner sends together, but it only limits the new **automatic** partner sends. It never blocks your manual truck sends. Truck outreach had a cap of 30, which was removed deliberately on 29 September; re-imposing one would reverse that.
- **The US "metro FTA" network is one company.** Verification showed that fta.team and its 17 live city sites are commercial booking sites run by one New York operator, not member-run associations. Emailing 18 of its sites in one campaign would read as spam. So the **hub** (fta.team) is the one auto-send contact. Each city site is imported as a network member: verified, `not_now`, `auto_send` off. Switch any of them on in the drawer if you want.
- **Site-published addresses.** For 13 organisations the site publishes a different address from the one on the list (e.g. Phoenix → help@foodtrucksphoenix.com). I kept the listed addresses and put the site's address in each row's verification note, so you choose. They're listed in §2.3.
- **US emails carry a postal address.** It's the registered office from `lib/company.ts` / the manual: HatchGrab Ltd, Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom. It's stored as the `postal_address` setting and added only to US partner emails. ⚠️ The outreach footer that carried this address was added on 19 October and removed on 20 October, so this is the only place it appears again.
- **No contact names.** None of the 110 organisations has one, so templates can greet with a fallback: `{{contact_name|there}}`, set per language by the translator.
- **Public holidays are not applied.** The repo has no holiday source, as the brief allows.

## 1. Reuse: what's reused and what's new

| | Reused, not copied | New |
|---|---|---|
| **Sending** | The mailbox account, the From name, `buildMessage`, `sendRow`, `fileCopyAndRecord`, `runAfter`, attachments and the idempotency key. Partners-1's send path moved **unchanged** into `lib/partner-send.ts`; Admin's partner compose and the scheduled sender both call it, so every refusal applies to both. | `requireOptOut` for the scheduled sender: the opt-out line is required, as in truck outreach. |
| **Sequence** | The truck ladder: `CONTACT_KINDS` and `FOLLOW_UP_DAYS` (first contact → +3 → +7 → +14), from `lib/outreach.ts`. | `partner_orgs.sequence_step` / `sequence_stopped`; `lib/partner-programme.ts nextStep`. |
| **Replies and bounces** | The reply poller (`outreach-replies` cron), `recordPartnerIncoming` / `recordPartnerBounce`. | Those two now call `stopSequence`: a reply or a bounce stops the partner's sequence and cancels anything queued. A truck's ladder still doesn't stop on a bounce; that's unchanged. |
| **Suppression and opt-out** | The do-not-contact list (prospects' `do_not_contact`), and the reply-based opt-out sentence in `outreach_settings`. | `partner_orgs.do_not_contact`. An opt-out joins the **same** list (`doNotContactAddresses`, now shared), so it holds for hand-written emails too. |
| **Templates** | `outreach_templates` rows, and `docFromTemplateText` for `{{signature}}` and `{{opt_out}}`. | A slug convention, `partner-<assoc\|dir>-<step>-<lang>`, so no schema change. `lib/partner-template.ts` for the merge fields. |
| **Timeline and compose** | PartnersTab's existing detail, compose window, outbox and email reading panel, shown in the drawer. | The programme box, code cards and ledger above them. |
| **Import** | partners-1's `planBulkAdd` dedupe and `validatePartnerPatch`. | The CSV import UI. Imported rows are "? unverified". |
| **Scheduling** | — (truck outreach has no scheduler, by design) | `lib/partner-send-schedule.ts`, `outreach_send_queue`, `/api/cron/partner-sends` (every 5 minutes, at most one email per run), approval mode. |

## 2. Import and verification

### 2.1 Method

- **Parsing:** `docs/partners-2/gemini-partner-list.md` gives **110 organisations** with **131 addresses**.
- **Verification:** three research agents checked every organisation on the web:
  - the site loads and is this organisation;
  - the **exact** address appears on the site or its contact page (Cloudflare-obfuscated addresses were decoded);
  - `dig MX` for the domain.
- **Evidence:** committed in `docs/partners-2/verification.json`.
- **The import:** `scripts/partners-2-import.cjs` (committed) applies the rules and writes migration `20261105_partners_2_import.sql`, run via `db-migrate.cjs --approved-by-dominic`. Its first statement was shown in chat; all 110 are the same shape. It inserts only, and only where the same name and country, or the same email, isn't already present.
- **Language:** from the country. Belgium: Flanders gets nl, otherwise fr. Switzerland: de unless the region says otherwise. Canada: Québec gets fr. It's editable in the drawer.
- **Time zone:** from the US state or region, else the country's. Also editable.
- **Primary and alternates:** the best verified listed address is the primary; the other live listed addresses are alternates. Dropped addresses are never stored as an address, only named in the note.

### 2.2 Counts

| | Organisations | Addresses |
|---|---|---|
| ✓ verified | **45** | 50 |
| ? unverified | **30** | 41 |
| ✗ dropped | **35** | 40 |

- **Types:** association 57, collective 13, directory 31, media 3, software platform 6.
- **Countries:** US 70, GB 9, FR 6, AU 4, CA 4, BE 3, CH 2, DE 2, NL 2, ES 2, IT 2, NZ 2, IE 1, SE 1.
- **Who can be sent automatically:** only ✓ rows, and only in an allowed country.
  - **25 organisations qualify today.** DE and CA are manual-only; software platforms, network members and dropped rows never auto-send.
- **The obvious errors, as briefed:**
  - **"streetfoodemouvement.fr":** the typo domain has no mail servers. Street Food en Mouvement prints it on its own contact page. Dropped; "idf@" on the real domain is likely but unpublished.
  - **"info@fdoamin.com":** junk with no DNS. Dropped.
  - **hello@buoyevents.co.uk:** real, but it's Buoy Events (Bristol), not British Street Food or the Scottish awards. Dropped for both.
  - **gulftobayfta+1:** a duplicate alias. Dropped.
- **Software platforms** (Street Food Finder, Roaming Hunger, Food Truck Club, StreetFoodApp, FoodtruckBooking.nl, Moblz): type `software_platform`, status `not_now`, never auto-sent. The table shows them as "Manual only".
- **Section 4, the "US Metro FTA Network":** treated as suspect and checked one by one.
  - 18 verified: the hub and 17 cities, with the address on the site and MX present.
  - **7 dropped:** San Diego is an unrelated business; Las Vegas, Boston, Orange County, Tampa and Nashville don't exist; Philadelphia is parked.
  - The network's real sites for 4 of those (ftasd.org, ftalv.org, ftabos.org, phifta.org) are in the notes only, not imported.

### 2.3 Dropped organisations, with the reason

| # | Organisation | Country | Why dropped |
|---|---|---|---|
| 1 | Scottish Street Food Awards / Bute Yard | GB | The only address belongs to another organisation (Buoy Events, Bristol). SSFA is run by Richard Johnson / Food Mutiny with The Pitt |
| 2 | The Food Truck Company UK | GB | No real website or organisation found |
| 3 | Irish Food Truck Association / Street Food Ireland | IE | Domain not registered/resolving; org not found |
| 4 | Street Food En Mouvement – Île-de-France | FR | Only address is on a dead typo domain. idf@streetfoodenmouvement.fr is the likely intended address but is not published anywhere I saw (unconfirmed) |
| 5 | Streetfood Verband Schweiz | CH | Site parked; org not found |
| 6 | Foodtrucks Deutschland (Craft Guild) | DE | No MX on the domain |
| 7 | Foodtruck-Vereniging Nederland | NL | Domain not resolving; org not found |
| 8 | Street Food Madrid / Asociación | ES | Domain dead; association looks inactive since about 2015 |
| 9 | Streetfood Italia (Associazione) | IT | Domain dead |
| 10 | Food Truck Italia Network | IT | Org not found |
| 11 | Svenska Foodtruck Förbundet | SE | Domain not resolving; org not found |
| 12 | Dayton Food Truck Association | US | No MX; no association address published |
| 13 | Northeast Ohio Food Truck Association (NEOFTA) | US | Org real but address undeliverable |
| 14 | RDU Mobile Food Association (RDUMFA) | US | Domain not this org's; org could not be found |
| 15 | Queen City Mobile Food Truck Association (QCMFTA) | US | No MX, no site, org not found |
| 16 | DMV Food Truck Association (DMVFTA) | US | Org's old domain lapsed, no mail |
| 17 | Maryland Mobile Food Vendors Association (MMFVA) | US | Email domain does not exist |
| 18 | Philly Mobile Food Association (PMFA) | US | Email domain does not exist; org appears dormant |
| 19 | Western Pennsylvania Food Truck Alliance | US | Org could not be found anywhere |
| 20 | Greater Lehigh Valley Food Truck Alliance | US | Listed address is on a non-existent domain; possible alternative glvmfa@gmail.com (press release 2016, unverified) |
| 21 | Boston Food Truck Alliance (BFTA) | US | Email domain does not exist |
| 22 | North Texas Food Truck Association (NTXFTA) | US | Email domain does not exist; org appears defunct |
| 23 | Houston Area Food Truck Association (HAFTA) | US | Domain parked/for sale, no mail; org not found |
| 24 | Midessa Mobile Food Vendor Association | US | Domain and org not found; likely invented |
| 25 | FTA network — San Diego (SDFTA) | US | not the San Diego FTA; the network's real San Diego site is ftasd.org, which shows info@ftasd.org (MX ok) |
| 26 | FTA network — Orange County (OCFTA) | US | domain does not exist; the fta.team network lists no Orange County site |
| 27 | FTA network — Tampa (TPAFTA) | US | domain does not exist; the fta.team network lists no Tampa site |
| 28 | FTA network — Las Vegas (LVFTA) | US | domain does not exist; the network's real Las Vegas site is ftalv.org, which shows info@ftalv.org (MX ok) |
| 29 | FTA network — Nashville (BNAFTA) | US | domain does not exist; the fta.team network lists no Nashville site |
| 30 | FTA network — Boston (BOSFTA) | US | domain does not exist; the network's real Boston site is ftabos.org, which shows info@ftabos.org (MX ok) |
| 31 | FTA network — Philadelphia (PHLFTA) | US | parked domain with no MX; the network's real Philadelphia site is phifta.org, which shows info@phifta.org (MX ok) |
| 32 | Auckland Food Truck Collective | NZ | No mail, no site |
| 33 | Association des Camions de Rue de Montréal (ACRM) | CA | Email domain does not exist |
| 34 | Ontario Food Trucks / Toronto Food Truck Directory | CA | One domain dead, the other is an unrelated business |
| 35 | FoodTruckr | US | Domain cannot receive mail (no MX); even the published support@ is undeliverable |

**Site-published addresses, not on the list** (in each row's note; switch the primary if you want):
- Phoenix FTA: help@foodtrucksphoenix.com
- Street Vendor Project: svp@urbanjustice.org
- Welcome to Thornbury: info@welcometothornbury.com
- Food Truck Carnivale: info@eventpeople.com.au
- Greater Vancouver: hello@greatervanfoodtruckfest.com
- YYC: hello@calgaryfoodtrucks.com
- Mobile Cuisine: us@mobile-cuisine.com
- Food Truck Empire: support@foodtruckempire.com
- StreetFoodApp: info@streetfoodapp.com
- the 4 FTA network replacements above
- **From chunk A's notes:** KERB (hq@kerbfood.com), COFTA (contact@centralohiofoodtrucks.org), British Street Food (info@britishstreetfood.co.uk)

**Worth knowing:**
- **Foodtruck Verband Schweiz** is verified, but its December 2024 news says it's closing and reinventing itself.
- **Street Food Collective** (Herefordshire) looks like one caterer.
- **Street Food Convention's** domain redirects to the fair company AFAG.

## 3. Codes and deals

### 3.1 Data (migration `20261104_partners_2.sql`, shown in chat)

- **`partner_codes`:**
  - code (unique, case-insensitive), partner;
  - `deal_type` (`extra_trial_months` | `percent_off`), `deal_value`, `deal_months`;
  - `valid_until`, `max_uses`, `active`;
  - `pct_year1`, `pct_year2`, `basis = 'plan_fees'`.

  Nothing is hardcoded.
- **`partner_code_redemptions`:** one per operator. It records the deal as it stood and what was applied.
- **`trucks.referred_partner_code_id`:** set once at signup. A **database trigger refuses any later change** (`trucks_referred_code_immutable`, confirmed live). The admin truck row shows it as **🤝 CODE**, next to the existing 🎟 signup code.
- **No codes were created.** The code card, table and queue screenshots use **sample** codes (NCASS26, SFEM20, AMFVG) in the browser only. Create real ones under Codes.

### 3.2 Signup (the only customer-facing change)

- **One field, two places.** `components/PartnerCodeField.tsx` is shared by `/signup` and the demo's "Start free, keep my menu" step. It's the existing code field, now "Partner or promo code (optional)" with **Apply**.
  - Apply asks `/api/signup/code`, which is public, read-only, and metered at 60/min in the proxy, like the other public token reads.
  - It shows "✓ Code applied: 2 extra months free (NCASS)", "That code isn't valid." or "That code has expired."
  - Editing the code clears the answer.
- **Never blocking.** Signup works with an empty, invalid or expired code. The server checks the code again (`recordRedemption`) and records a redemption only for a live partner code. Any code is still kept on `operators.signup_promo_code`, as before.
- **Applying the deal.** `/api/setup create_truck` calls `applyPartnerDeal` after `provisionTruck` and the operator link. That covers the demo path too.
  - **Extra months:** the trial end moves on by N calendar months at 23:59:59 in the truck's zone. That's Admin's own "Extend trial" rule (`extendTrialEnd`).
  - **Percent off:** see Decision 1.
  - **Attribution:** set once.
  - **Safety:** it never fails the truck's creation.
- **Words.** In en-GB and all 48 language bases:
  - **Signup keys:** `auth.signup.partnerCodeLabel` ("Partner or promo code (optional)"), `codeApply`, `codeApplied`, `codeInvalid`, `codeExpired`, `dealExtraMonths` (plural) and `dealPercentOff` (plural).
  - **Demo keys:** the same seven texts as `demoGetStarted.partnerCode*` / `partnerDeal*`. The demo also renders on the customer order page and the kitchen screen, which mustn't load the whole `auth` namespace for seven strings (`messages-split` checks each page's namespaces). So the field takes its words from its caller.
  - **No existing key reworded:** `auth.signup.codeLabel` was first reworded (`f5640f13`), then restored (`2f3299b5`), because the language-phase proofs require any reworded English key to be named. A new key does the job.
  - Back-translations are in `docs/i18n/back/`. translation-check is structural 0 in every base, and messages-split passes 206/206.
  - **Native check suggested:** az, kk, mn, ka, ne, uz and hy.
  - **Choices the translator made**, also worth a native look: de "Einlösen" and hu "Beváltás" (Redeem) for Apply; "discount code" for promo in cs, sk, da, nb, sv, nl, et, fi, is and lt; es "colaborador" for partner; he "קוד הטבה".
- **iOS (App Store 3.1.1 / 3.1.3).** Checked against `lib/commerce-policy.ts purchaseCtaAllowed()`. The field takes no payment, shows no price and has no link or instruction to buy: the same reasoning as the existing trial lines in `lib/settings-copy.ts`. **No gate is needed and none was added.** The screenshot `signup-app-valid-390-en-GB.png` is taken with the app's user agent.

### 3.3 Percent off: see Decision 1.

## 4. Commission ledger

- **What it reads:** `lib/partner-commission.ts` takes the plan fees referred trucks actually paid, meaning `billing_charges.plan_minor` on charges whose `billing_invoices` row is `paid`.
- **How it counts:** `pct_year1` for payments in the truck's first 12 months from its signup, `pct_year2` in months 13–24, nothing after. It's grouped by month and currency.
- **Billing is off,** so everything is £0 until it's on.
- **Mark paid:** month, currency, amount, date and reference, stored in `partner_commission_payments`.
- **The ledger:** owed, paid and outstanding per month, shown in the partner drawer. The code card shows its trucks and what's owed this month.

## 5. Template drafts (English) — for your approval; nothing created

Merge fields: `{{contact_name|there}}`, `{{org}}`, `{{code}}`, `{{deal}}`, `{{commission}}`. Every email ends with the signature and the same opt-out line as truck outreach ("If you would rather not hear from me again, reply with "no thanks"…"); US emails also get the postal address. The commission renders like "20% of plan fees in year 1 and 10% in year 2".

### (a) Associations and collectives

**First contact.** Subject: *A member offer from HatchGrab for {{org}}*
> Hi {{contact_name|there}},
>
> I run HatchGrab, an app for food trucks and street food traders: customers pre-order and pick a collection time, and the kitchen gets orders it can actually make.
>
> I'd like to give {{org}}'s members a simple offer: with the code {{code}} they get {{deal}} when they sign up. For {{org}}, there's {{commission}} for each member who moves on to a paid plan. There's nothing to run on your side beyond sharing the code.
>
> Everything it does is on one page: https://www.hatchgrab.com/features
>
> Would that be useful for your members? A one-line reply is plenty.
>
> {{signature}}
> {{opt_out}}

**Chase 1 (+3 days).** Subject: *Re: A member offer from HatchGrab for {{org}}*
> Hi {{contact_name|there}}, just checking this reached the right person. The offer stands: code {{code}} gives {{org}} members {{deal}}, and {{org}} receives {{commission}}. Happy to send a short paragraph you could drop into a newsletter.

**Chase 2 (+7 days).** Subject: *Re: A member offer from HatchGrab for {{org}}*
> Hi {{contact_name|there}}, one more nudge and then I'll leave it. If a members' page or newsletter suits you better than an email, I can write the copy with the code {{code}} for you to use as it is.

**Final (+14 days).** Subject: *Re: A member offer from HatchGrab for {{org}}*
> Hi {{contact_name|there}}, I won't chase again. If it's ever useful, code {{code}} ({{deal}}) stays open for {{org}} members. Just reply and I'll set it up. Thanks for your time.

### (b) Directories and media

**First contact.** Subject: *An offer for {{org}} readers*
> Hi {{contact_name|there}},
>
> I run HatchGrab, pre-orders and collection times for food trucks. If you list or write about tools for vendors, I'd like to offer your readers a code: {{code}} gives them {{deal}}, and {{org}} earns {{commission}} on each one who moves to a paid plan.
>
> A one-page summary: https://www.hatchgrab.com/features
>
> Would you be open to including it? I'm happy to answer questions or send screenshots.
>
> {{signature}}
> {{opt_out}}

**Chase 1 (+3 days).** Subject: *Re: An offer for {{org}} readers*
> Hi {{contact_name|there}}, just checking this landed. The code {{code}} ({{deal}} for your readers, {{commission}} for {{org}}) is ready whenever suits you.

**Chase 2 (+7 days).** Subject: *Re: An offer for {{org}} readers*
> Hi {{contact_name|there}}, if a short write-up or a few screenshots would make it easier to cover, I can send them over. No pressure either way.

**Final (+14 days).** Subject: *Re: An offer for {{org}} readers*
> Hi {{contact_name|there}}, last note from me. The code {{code}} stays open if you ever want it. Thanks for reading.

**After "templates approved":** the templates are translated into fr, nl, de, es, it and sv (the imported partners' languages besides English), with English back-translations here. Then the rows are created as `partner-assoc-<step>-<lang>` and `partner-dir-<step>-<lang>`. Not before.

## 6. Sending in local working hours

- **The schedule** (`lib/partner-send-schedule.ts`, pure):
  - the recipient's own zone, **Tue–Thu 09:30–11:30**, never at a weekend, DST-correct;
  - **one daily cap of 25** across all outreach (truck and partner sends counted on the London day);
  - sends spaced **randomly 3–8 minutes** apart;
  - a send that doesn't fit moves to the recipient's next window.
- **Settings:** stored as data in `outreach_settings.send_schedule`: approval mode, cap, window, spacing.
- **Country rules** (`outreach_country_rules`, editable): **allowed** for GB, IE, FR, BE, NL, ES, IT, SE, CH, US, AU and NZ; **manual_only** for DE (UWG) and CA (CASL). A country with no row is manual_only. Manual-only rows are never queued and show **"You send"**.
- **The queue:**
  - "Save today's plan" writes `outreach_send_queue`.
  - **Approval mode is ON by default.** The queue lists each email (recipient, language, local time, rendered email, or why it can't render) and **"Approve today's sends"** releases them. The approval-mode checkbox turns it off later.
- **The sender** (`/api/cron/partner-sends`, every 5 minutes, at most one email per run) sends only when all of these hold:
  - the row is approved (while approval mode is on);
  - the partner is still eligible;
  - the cap isn't reached and the last send was at least 3 minutes ago;
  - the time is inside the partner's window;
  - **a template exists** (none does yet);
  - the partner has an active code;
  - the opt-out line is present.
- **Dry run:** `?dry_run=1&now=<ISO>` (admin) decides everything against that clock and stops before the mailbox.
- **Stopping:** a reply, a bounce or an opt-out stops the sequence. The drawer has **Stop sequence** and **Opted out** (opted out also sets do-not-contact).
- **Nothing is sent now.** No template exists, approval mode is on, and nothing is approved, so even after a deploy the sender does nothing until you approve templates and a day's queue.

## 7. Proof

- **Screenshots** (`docs/partners-2/`):
  - **Admin:**
    - `partners-table-laptop.png` (1280) and `partners-table-desktop.png` (1680);
    - `partner-detail.png` (NCASS: verification, code card, ledger, the partners-1 detail);
    - `code-card.png` and `codes-panel.png`;
    - `send-queue.png`.
  - **Signup**, for valid, invalid and expired codes: `signup-{valid,invalid,expired}-{390,desktop}-{en-GB,fr-FR}.png`, plus `signup-valid-percent-390-en-GB.png` and `signup-app-valid-390-en-GB.png` (the app's user agent).
  - **How they were taken:** with `scripts/partners-2-screens.cjs`. The admin data is the real imported organisations, plus labelled **sample** codes, queue and ledger, answered in the browser, so no login and no database writes. The demo step uses the same component; it wasn't screenshotted.
- **The harness** (`scripts/partners-2.cjs`, swept): **55 checks**. It bundles the real modules, uses a fake database and a dry-run clock, and sends nothing. It covers:
  - **code validation:** case and spaces, unknown, inactive, used up, expired, the last day inclusive;
  - **deal application** in a sandboxed **TEST truck signup:** the redemption is recorded, the trial is extended by 2 months across a DST change, the truck is attributed, applying twice does nothing, a percent-off code is recorded and pending, and expired or unknown codes aren't recorded;
  - **attribution immutability:** in the code, and in the migration's trigger condition;
  - **scheduler times:** London, New York and Sydney around their DST changes, weekend roll-over, 3/8-minute spacing, never past the window;
  - **the cap:** 24 already sent leaves 1; 25 holds;
  - **eligibility:** manual-only never queued and "You send"; unverified, dropped, software platform, opted out, stopped and replied never automatic;
  - **the ladder:** +3/+7/+14;
  - **the template slug**;
  - **the queue:** planned, then approved;
  - **stopping:** on reply, on bounce and on opt-out, and the shared suppression list;
  - **the sender's safety gates** and the dry run;
  - **the US postal line** and merge-field fallbacks.
- **Re-pins**, each naming exactly partners-2's change; everything else is still compared byte for byte:
  - `partners-1.cjs`: its checks now read the moved send path, with every condition the same.
  - `scripts/_named-partners-2.cjs`: an exact undo of partners-2's edits to `proxy.ts`, the signup route, the signup page, the demo and the admin truck row. It gives back the pre-partners-2 files byte for byte. It's wired into `_moved-paths.cjs changedSince` (which `loyalty-1` and `cwv-2` use) and `cwv-2`'s chains.
  - The same file holds the code field's **structural proof**, wired into `_lp2-named.cjs` for the 1c signup views and the demo wizard's details and press views: with the new field swapped for the old one, each view is byte-identical, and the input keeps its id, max 40, placeholder and typed value.
  - `migration-function-grants`: the new trigger function is revoked from public, anon and authenticated. Migration `20261106_partners_2_revoke.sql` was applied, and the line was added to `20261104` so that file is the complete definition.
- **Also:** the typecheck is clean. Lint is clean on the new files. The 4 errors on the signup page (`<a href="/login">`) were already there before this work.
- **The full sweep:** **226 run, 221 passed, 5 failed.** The 5 are the known missing translated legal files (paperwork-1, legal-languages-1, world-countries-3, contact-1, tidy-1). `partners-2` is 55/55. The temp report: nothing left behind.
  - An earlier sweep (212 / 14) found 9 more; each was fixed or re-pinned as listed above.

## 8. Commits (this workstream's files only)

- `f188bb2b`: migration `20261104_partners_2`.
- `0718a044`: the import and its evidence.
- `f5640f13` and `2f3299b5`: the signup words, in their own commits.
- `9cc5edea`: **your** "free trial" commit, which carried the code, screenshots and harnesses.
- `20261106` (the revoke).
- `0f01ca0e`: the field's words from the caller, and the re-pins.
- `28f0002b`.
- The manual section and this report's final version.

## Undo (only if Dominic asks)

- **The data:** `delete from public.partner_orgs where source = 'gemini-2026-11-16';`. Then drop the new tables, columns and trigger in reverse order of `20261104_partners_2.sql`. Nothing else references them yet, since no code has been created or redeemed.
- **The code:** `git revert` the partners-2 commits.
