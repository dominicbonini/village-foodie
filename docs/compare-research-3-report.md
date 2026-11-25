# compare-research-3 — interim (wave 2 running)

**25 Nov 2026 · branch `france-vat-1` · not pushed**

**Status:** this file is overwritten when the work finishes.
- Decisions a–g are applied.
- Wave 1 is researched, imported and published: **48 countries live (44 before)**.
- Wave 2 is being researched by 3 agents; each commits after every country, in `docs/compare-research-3/agent-N/`.

**If the session is cut off, to resume:**
1. `node docs/compare-research-3/build.cjs`.
2. Commit.
3. Run the import dry run, then the import (`scripts/data-import/main.ts`).
4. Run the publish dry run, then the publish (`scripts/comparison-publish/main.ts`).

**So far:**
- **(a)** `ALSO_ACCEPTED_CURRENCY` now has PA USD, KW KWD, BH BHD, OM OMR and JO JOD (`5a0519df`). The deployed page shows a competitor's price
  in its plan's own currency, so no deploy is needed. **KW and PA went live.**
- **(b)–(e)** Migration `20261131` (`626a6769`) was pre-flighted rolled back, then applied. It marked these plans unclear:
  - Yabie Express SE;
  - Poster's 3 UA prices (billed yearly or monthly can't be stated exactly);
  - Klikit Core SG, MY and TH.
  
  It also set OlaClick's check pages. **EC went live. UA dropped to one short. SE stays live** (WEIQ · Vitrina).
- **(g)** GI is live (Order Tiger · Ordea from GB) and LI is live (Yoveletta · Rent-a-Shop from CH). MT stays one short (FoxiFood; nothing
  else shows it sells in Malta).
