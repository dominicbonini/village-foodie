# manual-update: the reference manual brought up to date (V16.21)

*13 November 2026.*
- *Only `docs/reference-manual.md` and this report changed.*
- *No code, database or other file changed; one read-only query (§3).*

## Summary

`docs/reference-manual.md` is now **V16.21**:
- **The header and front matter agree.** A grep shows "· V16.21" on line 1 and "**Version 16.21**" on line 9, and no "16.20" header or version line is left.
- **What it adds:**
  - **order-page-1:** the three-line event box, formules as the first menu tab shown like dishes, the full-width menu on phones with the tabs pinned under the header, and "Change event" opening `/trucks/<slug>/order` instead of the "Truck not found" page.
  - **Offline order protection:** the V16.20 entry, written before the deploy, now records the live deploy.
  - **world-countries-5:** the switch-on's state, confirmed.
  - **The backlog item you asked for.**

## 0 · Flags

- **No span of the prompt arrived garbled. No instructions contradict each other.**
- **Since the manual's last update (`e499b335`, V16.20) there is one commit:** `80328fa5` order-page-1.
- **The world-countries-5 work is already in V16.19.** That covers Mexico's store flags off (20261097, run), Google Play countries prepared but not applied, and the switch-on run on 12 Nov 18:12 UTC. Nothing world-countries-5 was committed after V16.19, so V16.21 only confirms the live state (§3).

## 1 · What changed in the manual

**A new changelog entry, V16.21 (13 Nov 2026):**
- **order-page-1:**
  - the stacked event box (notes kept);
  - "Change event" → `/trucks/<slug>/order`, with the cause of "Truck not found";
  - formules as the first tab, with the existing word and no emoji, dish-like rows, and the cards above the menu removed;
  - one list for the chips, sections and scroll tracking;
  - the full-width menu on phones;
  - the proof and its scripts.
- **Offline protection is live:**
  - `heartbeat-monitor` version 6 deployed on 13 Nov at **07:16:42 UTC** (OBSERVED: the deployed source carries the start-time gate; verify_jwt unchanged);
  - LE ROI DU CHURRASCO's early pause cleared at 07:17 UTC when their device reconnected, with nothing written by hand;
  - **how to deploy edge functions:** the Supabase command-line tool reads `.env.local` and stops on its multi-line value, so deploy from a clean folder holding only the committed function, and never open the env file;
  - the costs-accounts-1 re-pin for the monitor.
- **world-countries-5:** the switch-on is confirmed run (§3).
- **The backlog pointer.**

**Corrections in place**, in the manual's ⛔ style. The old text is kept and the marker says what is true now:

| Where | Correction |
|---|---|
| V16.20 changelog | "NEEDS DEPLOY" is struck through: **deployed 13 Nov ~07:16 UTC (version 6)** |
| LIVE-REDEFINITION (V7.0) | the V16.20 correction now notes it is live since 13 Nov |
| The OFFLINE-PROTECTION future-event gap bullet | an open event is protected only from its scheduled start (or from opening, if later) |
| TruckListCard RULE (V7.6) | adds the sixth opt-in pair, `stacked` + `footerAction` |
| The order page's event display RULE (V7.6) | now uses `stacked`, not `compact` + `cornerAction` |
| "Change event" RULE (V6.5) | now goes to `/trucks/<slug>/order`; `/trucks/[slug]` is the discovery profile ("Truck not found") |
| "The customer menu on phones" (V11.13) | full width on phones (`-mx-4`, `border-y`, `px-4`), the tabs mirroring it; unchanged from `sm:` |

**Backlog (§27):** a new "Open as of V16.21" list. It says: **no test truck has formules — add formules to the App Tester truck (`app-tester`) so formules can be tested live.** Until then they are proven only on fixture renders.

## 2 · Version check

```
$ grep -nE "V16\.21|Version 16\.21" docs/reference-manual.md | head -3
1:HatchGrab Engineering Reference Manual · V16.21
9:**Version 16.21**
53:## V16.21 — 13 November 2026 — **THE ORDER PAGE: A THREE-LINE EVENT BOX, …; OFFLINE PROTECTION DEPLOYED**
```

## 3 · SQL (read only)

```sql
select count(*) filter (where enabled) as enabled_countries,
       bool_or(enabled) filter (where country_code = 'MX') as mx_enabled,
       count(*) filter (where enabled and ios_app_available and android_app_available) as enabled_with_both_store_flags,
       bool_or(ios_app_available or android_app_available) filter (where country_code = 'MX') as mx_any_store_flag
from country_settings;
-- → 210 enabled · MX not enabled · 210 with both store flags · MX no store flag
```

The deploy time comes from the deployed function's `updated_at` (1794554202510 ms = 2026-11-13T07:16:42Z), read earlier this session.

## 4 · Files

- `docs/reference-manual.md` (V16.21)
- `docs/manual-update-order-page-report.md` (this report)
