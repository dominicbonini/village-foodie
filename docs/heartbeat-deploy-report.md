# `heartbeat-monitor` — STALE BY TWO MONTHS, AND THE DEPLOY IS BLOCKED

🔴 **THE HEADLINE: THE DEPLOYED FUNCTION PREDATES THE OFFLINE-MODE BRANCH BY OVER TWO MONTHS, SO THE
"Keep taking orders, confirm them yourself" MODE IS CONFIGURED AND INERT RIGHT NOW.**
🔴 **AND THE DEPLOY FAILED — on a malformed `.env.local`, before anything was uploaded. I stopped, as
instructed. NOTHING WAS DEPLOYED AND NO SOURCE WAS CHANGED.**

**No SQL, no migration, no other deploy. No `git stash`, `checkout` or `restore`.**
**No span of the prompt arrived garbled.**

---

# 1 — COMMITTED AND CLEAN ✅

```
f9c6972 2026-08-18 14:41:21 +0100 offline updates
```
✅ **`git status --porcelain supabase/functions/` returns NOTHING — the whole functions directory is
clean.**
✅ **EXECUTED: `git show HEAD:supabase/functions/heartbeat-monitor/index.ts | grep -c
"no_auto_accept\|offline_no_autoaccept_until"` returns 8 — the offline-mode branch IS in `HEAD`.**

# 2 — 🔴 THE DEPLOYED VERSION IS STALE

`npx supabase functions list` (raw `updated_at`, epoch ms, converted):

| Function | Deployed | Source commit | Verdict |
|---|---|---|---|
| 🔴 **`heartbeat-monitor`** | **2026-06-15 11:22:17** (`1781518937828`, version 2) | **2026-08-18 14:41:21** | 🔴 **STALE BY 64 DAYS. The live body cannot know the mode exists — it only writes `online_paused_until`** |
| `auto-event-scheduler` | 2026-06-29 21:07:48 (`1782763668069`, version 2) | 2026-06-10 21:58:03 (`93b0f22 "close fixes"`) | ✅ deployed AFTER its commit — **not stale**, source clean |

🔴 **SO MODE B DOES NOTHING TODAY.** An operator selecting it gets a setting that reads as configured
and has no effect: the monitor still pauses ordering, because pausing is the only thing the live body
can do.

# 3 — 🔴 THE DEPLOY FAILED. FULL OUTPUT, VERBATIM.

```
$ npx supabase functions deploy heartbeat-monitor
{"_tag":"Error","error":{"code":"UnknownError","message":"failed to read config: Error: failed to parse environment file: /Users/dominicbonini/dev/village-foodie/.env.local (unexpected character \"\"\" in variable name near \"\"type\": \"service_account\",\")"}}
```

**THE CAUSE, LOCATED BUT NOT TOUCHED:** `.env.local` line 3 is
`GOOGLE_SHEETS_CREDENTIALS={"type":"service_account", …` — **a raw multi-line JSON value.** The CLI
parses `.env.local` before it does anything else, and its parser reads the JSON's own `"type"` on the
second line as a new variable name. **The file is fine for Next.js and invalid for the Supabase CLI.**

**A retry with `--env-file` was rejected — that flag does not exist on `deploy`:**
```
{"_tag":"Error","error":{"code":"UnrecognizedOption","message":"Unrecognized flag: --env-file in command supabase functions deploy"}}
```

🔴 **I STOPPED THERE. I did not edit `.env.local`** — it holds live credentials, it was not in scope,
and quoting a fix for a secrets file is not the same as making one.

**WHAT WOULD UNBLOCK IT — for you to choose, not for me to do:** put the JSON on ONE line (or single-quote
it) in `.env.local`; or move that variable out of `.env.local` for the duration of the deploy; or run
the deploy from a directory without that file (`supabase functions deploy heartbeat-monitor --workdir
…`). ⚠️ **The credential itself never needs to change — only how it is quoted.**

# 4 — 🔴 WHAT WOULD PROVE THE NEW BODY IS LIVE (NOT DONE — NOTHING WAS DEPLOYED)

**A successful deploy proves a bundle was uploaded. It does not prove behaviour.** Two checks that
would, in order of strength:

1. 🔴 **THE FUNCTION'S OWN LOG LINE.** The new body logs
   `event <id>: NO-AUTO-ACCEPT until <ts>` where the old one could only ever log `PAUSED until`.
   **Seeing `NO-AUTO-ACCEPT` in the function logs is proof the new code ran** — the string does not
   exist in the deployed version.
2. **THE COLUMN IT SELECTS.** The new body's van query names `offline_protection_mode` and its event
   query names `offline_no_autoaccept_until` / `offline_protection_mode_override`. **If those columns did
   not exist, PostgREST would answer 42703 and the run would log a stale-van query failure** — so a
   clean run after the migration is weak evidence, while the log line above is direct evidence.
3. **THE BEHAVIOUR ITSELF:** with mode B set on a live event, let the van go stale and confirm
   `truck_events.offline_no_autoaccept_until` is written and `online_paused_until` is NOT.

⚠️ **`updated_at` moving forward in `functions list` is necessary but not sufficient — it says a bundle
landed, not that this bundle behaves.**

# 5 — `auto-event-scheduler` (REPORT ONLY, NOT REDEPLOYED, NOT CHANGED)

✅ **Source clean; last commit `93b0f22 "close fixes"`, 2026-06-10 21:58:03.**
✅ **Deployed 2026-06-29 21:07:48 — AFTER its commit, so the live body matches the repo.**
🔴 **THEREFORE THE 18 AUGUST 502s ARE NOT A STALE-DEPLOY PROBLEM.** A 502 is the platform failing to get
a response out of the function at all — a boot or runtime failure, not one of its own error paths, which
return 500. **The deployed code being current makes an environment, resource or upstream cause more
likely than a code one.** ⚠️ **Untouched, as instructed.**

---

# INTEGRITY

```
 M app/dashboard/[token]/page.tsx
 M components/dashboard/CapacityBreachBanner.tsx
 M lib/capacity-breach.ts
 M lib/copy/offlineProtection.ts
?? docs/breach-attribution-report.md
?? docs/breach-dismiss-report.md
?? docs/breach-grouping-report.md
?? docs/heartbeat-deploy-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `?? docs/heartbeat-deploy-report.md` | 🔴 **THIS TASK — the only file written. NO SOURCE FILE WAS TOUCHED** |
| the four `M` files and the three other `?? docs/*.md` | ✅ **ALL pre-existing** — the breach attribution, dismissal, grouping and offline-copy tasks |
| `supabase/functions/` | ✅ **CLEAN — not in the list, and not modified by this task** |

Nothing was committed, staged, reverted, stashed or cleaned.
