# hatches-up-1 — Hatches Up from its own site (26 Nov 2026)

**This finishes compare-square-1 step 4**, using the URL Dominic sent: https://hatchesup.co.uk/vendors/. It follows the same rules:

- its own site only, one request at a time;
- competitor and comparison tables only;
- no push, no deploy, no workflow change;
- no page or UI change.

## 1 · Summary

- **Hatches Up is now shown in GB:** Ordea · What The Truck · **Hatches Up** · Square.
  - **Eventifood leaves GB's page.** It is class A too, but the four slots are taken: three class A tools plus Square in the 4th slot.
- **Countries live: still 96.** None dropped, none added; only GB's line-up changed.
- **Stored now:**
  - website `https://hatchesup.co.uk`;
  - check_urls: /vendors/ and /pricing/;
  - its plan, from /pricing/: **"Unlock orders & payments"**, £0 a month, card processing 4.5% + 20p online, included in the price;
  - 13 answers, each quoted from its own pages.
- **Checks:** all 9 comparison harnesses pass and tsc reports 0 errors.

## 2 · What its own pages say (read once each)

| Page | What it says |
|---|---|
| /vendors/ | «Free to join. No monthly fee, no set-up costs, no tie-ins.» FAQ: «You only pay card processing when you take payments: 1.5% + 10p in person, and 4.5% + 20p for online orders.» |
| /pricing/ | Two tiers. **"Street Food Discovery"** «£0»: the discovery app, map and webpage, with no ordering. **"Unlock orders & payments"**: «Accept in-person PoS and online pre-orders and payments.», with **no figure shown**. Card processing fees: 1.5% + 10p in person and 4.5% + 20p online. «No minimum term or monthly payment, and no set-up costs.» |
| Countries | None named. «Trusted by street food vendors across the UK»; every town listed is in the UK. |
| Not stated | VAT, the payment processor, any per-order commission, and order-ready notifications. |

**Price as stored.** The ordering tier shows no figure. I stored it as **£0 a month**, based on these lines:

- the FAQ's «You only pay card processing when you take payments»;
- «No minimum term or monthly payment».

The card rate is stored as the bundled card fee (`card_mode` bundled, 450 bps + 20p, the online rate). The in-person rate is in the plan's note. VAT is `unknown`.

## 3 · What changed

**Import:** data/hatches-up-1/competitors.json, built and validated by docs/hatches-up-1/build.cjs, registered fifteenth in lib/data-import/importer.ts.

- The dry run was rolled back with the tables unchanged. Then the real import:
  - plans +1;
  - answers +13 (the 13 bare "unknown" ones superseded);
  - feature checks +13;
  - website filled in.
- The plan is a8235235, "Unlock orders & payments", GB, sourced from /pricing/.

**Answers stored** (every country; it sells only in GB):

| Answer | Value | Quote |
|---|---|---|
| preorder | yes | «Accept online orders in advance & get money in the bank before service even starts.» (also: «Capacity management with collection slots») |
| capacity | yes | «Capacity management with collection slots» |
| payattruck | yes | «… or let customers order ahead and pay when they collect.» |
| schedule | yes | «Multi-pitch & location calendar» |
| discovery | yes | «Inclusion in the discovery app & map» |
| private | partial | «Private & public event management» (requests to book the truck not stated) |
| stock | partial | «Stock management» (how it works not described) |
| reports | yes | «Financial reporting» (and «Data analytics») |
| domain | partial | «Customisable webpage with logo & photos» (a hatchesup.app page; own web address not stated) |
| monthly | yes | «Free to join. No monthly fee, no set-up costs, no tie-ins.» |
| setup | no | «No minimum term or monthly payment, and no set-up costs.» |
| term | no | «No minimum term or monthly payment, and no set-up costs.» |
| cardfee | yes | the FAQ line above (included; 1.5% + 10p in person, 4.5% + 20p online) |

Left as they were (still "unknown"):

- **perorder:** the importer's rule needs a "no" to be quoted saying it isn't charged, and no line on either page says so.
- **ahead** (ordering for a later day): not stated.
- **walk-up, the till and ticket printing:** left out on purpose. Nothing about tills goes in the features.

**Migration 20261146** (supabase/migrations/20261146_hatches_up_1.sql). It was pre-flighted with `compare-db-proofs --preflight` (rolled back; every count and checksum the same after), committed (7013ff6a), then applied. It:

- set check_urls to /vendors/ and /pricing/;
- pointed the GB entry 5a839fb0 at the new plan a8235235;
- superseded the old "Online ordering" plan eec3fac5 (from the manual, no source). It is kept as history.

**Why a migration and not only the importer:** the importer neither changes an entry's plan nor sets check_urls on a stored competitor.

**Publish:**

- The dry run gave 96 live, the same 96 as before, none dropped. GB was the only change, so the stop rule didn't trigger.
- Then the real publish: publish_events +2, and the site was refreshed (200).

## 4 · Checks

**Verified after the publish:**

- GB shows Ordea · What The Truck · Hatches Up · Square.
- Hatches Up's GB entry, its plan and all 13 answers are marked (`auto_verified_at`).
- Eventifood's GB entry isn't marked.
- The old plan is superseded.

**Harnesses:**

| Harness | Pass / fail |
|---|---|
| compare-square-1 | 27 / 0 |
| compare-fix-1 | 65 / 0 |
| compare-fix-2 | 79 / 0 |
| compare-autopublish-1 | 75 / 0 |
| compare-suits-1 | 72 / 0 |
| checker-prep-1 | 18 / 0 |
| competitor-check-1 | 227 / 0 |
| competitor-wtt-1 | 42 / 0 |
| competitor-features-2 | 79 / 0 |

`tsc` reports 0 errors.

Every SQL statement is in docs/hatches-up-1/sql.txt.

**Commits** (on france-vat-1, not pushed):

- 9a4e4380: the data file and build script, registered in the importer;
- 7013ff6a: migration 20261146;
- this report and sql.txt.

## 5 · What needs you

1. **Eventifood is no longer shown in GB.** Hatches Up ranks above it inside class A, so with Square in the 4th slot Eventifood is fifth. That is the rule as written. If you'd rather keep Eventifood, hide Ordea, What The Truck or Hatches Up in Admin, or change the Square rule (compare-square-1 report §5 point 2).
2. **Hatches Up's ordering tier shows no figure.** It's stored as £0 based on «You only pay card processing…» and «No minimum term or monthly payment». Say if you'd rather mark it unclear until a figure appears. In that case it would leave GB's page and Eventifood would come back.
3. **VAT and the payment processor aren't stated.** VAT is stored as `unknown`, and the cardfee answer says the processor isn't named.

## Flags

- Nothing arrived garbled, and no instruction contradicted another.
- The general pre-flight's word guard refuses the word "orders", and that word appears in Hatches Up's own quotes. So the quotes went through the importer's data file, and the migration carries none of them.

## Undo (only if Dominic asks)

```sql
begin;
update public.comparison_entries set primary_plan_id = 'eec3fac5-8dfd-54a6-9b5b-473a9fdeea67'
 where id = '5a839fb0-eca9-41d6-aabf-986b9b6c1000' and primary_plan_id = 'a8235235-b166-5552-9d0c-e757f6ba7f3e';
update public.competitor_plans set superseded_at = null where id = 'eec3fac5-8dfd-54a6-9b5b-473a9fdeea67';
update public.competitor_plans set superseded_at = now() where id = 'a8235235-b166-5552-9d0c-e757f6ba7f3e' and superseded_at is null;
update public.competitors set check_urls = '{}', website = null where id = 'fbbf6c37-2dd0-5f11-9e68-a0be5d563629';
commit;
-- then re-run the publish (scripts/comparison-publish/main.ts). The 13 answers stay; supersede them only if asked.
```
