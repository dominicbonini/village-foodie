# world-countries-1 — progress

*Started 31 October 2026. Updated after every stage. If the run restarts, read this first and carry on from the first
unfinished stage; never redo finished work.*

Scratch folder: `/private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/ca22c535-d1ad-44a9-b881-1d15addf2739/scratchpad/`
(`tr/<locale>/` translation parts; `build-before.log`).

Chat format decided by Dominic (31 Oct): the two-line summary, then every NOT RUN SQL block in fenced blocks, then the report
filename as the last sentence.

## Read-only SQL (31 Oct)
- country_settings: 36 rows, all enabled; none of BR MX JP SG HK MY TH AE exist.
- CHECKs: currency = 14 codes; allergen_set ∈ uk14 us9 anz ca; address_format = 36 keys.
- Triggers: country_settings_require_plan_prices; plans_keep_enabled_countries_priced (plans, plan_prices).

## Design decisions (mine, explained in the report)
- Unlimited-only = `plan_prices.offered = false` on payg/pro rows (rows kept with the research prices) — the switch-on
  triggers stay as they are (every public plan still has a row).
- `country_settings.platform_fee_allowed` (false for BR MX MY SG TH); CHECK `not (platform_fee_enabled and not platform_fee_allowed)`.
- `plan_prices.is_trial_end` (at most one per country; none = the plans table's expiry fallback, Pay as you go); Unlimited's row for the five.
- Allergen sets: `jp` (CAA 8 mandatory + 20 recommended), `br` (ANVISA RDC 26/2015 + lactose), `codex` (MX SG HK MY TH AE).

## Stages

| Stage | Status | Notes |
|---|---|---|
| 0 · tagline | done | hero + footer + CSS + 23 locale files + back files; share card re-rendered; harnesses re-pinned (messages-parity, plans-data-model, marketing-country-parity on 1 Nov) |
| 1 · currencies, prices, plans | code done | registry +8; plan_prices.offered/is_trial_end; platform_fee_allowed; PricingSection/PDF/llms single plan; Admin/Billing/trial popup; JPY toMinor/fromMinor + client ×100 sites |
| 2 · country settings | code done | address formats (WORLD_ROWS), allergen sets jp/br/codex, guard words, segments, SQL 20261054/55, glossary tables |
| new en keys → 22 languages | done | 35 keys merged, 0 structural |
| 3.1 es-MX | done | 415 overrides over es-ES (6 parts + consistency 67); 0 structural; registered |
| 3.2 pt-BR | done | 5,133 keys (10 parts + consistency 130); 0 structural, 0 banned; registered as a base |
| 3.3 ms-MY | done | full base; 0 structural; registered |
| 3.4 en-SG | done | 5-key sparse override of en-GB (keeps en-GB's "hatch" sentences, as en-IE/AU/NZ) |
| 3.5 ja-JP | done | full base; 0 structural; registered |
| 3.6 zh-HK | done | full base; 0 structural; registered |
| 3.7 th-TH | done | full base; 0 structural; registered |
| 3.8 ar-AE | done | 5,133 keys (10 parts + consistency 58); 0 structural; registered; RTL shared-component conversion → Dominic |
| 4 · proof, report | done (1 Nov) | world-countries-1.cjs 177/177; identity 439/439; screens 43/43; tsc 0; build ✓; lint ≤ HEAD; sweep 169/172 (3 fail at HEAD too); report written |

## Proof so far (1 November)
- scripts/world-countries-1.cjs: 116/116 (es-MX, pt-BR built).
- scripts/world-countries-1-identity.cjs vs a HEAD worktree capture (scratch/identity-head.json.gz): 439/439, 146 views of 37 live countries.
- Sweep (scripts/run-harnesses.cjs) running under heavy agent load: add-order-refresh-inputs failed after 3,583 s — load, re-run alone.
- Briefs + splits ready for ja-JP, zh-HK, th-TH, ar-AE (scratch/tr/<locale>/STYLE.md, TERMS.md).
- RTL: ~430 physical-direction classes across shared components → ask Dominic before converting (his instruction).
