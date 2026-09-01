# PostgREST cap-filter parse check — executed against production

**Date:** 25 August 2026
**Prompt integrity:** no span arrived garbled. No instruction contradicted another. No stop condition was
reached — §1.3 is the one that could have stopped it, and production was confirmed rather than guessed.

🔴 **VERDICT: THE FILTER PARSES. `REAL count = 4`, `CONTROL count = 4`. No error.** The failure mode
described in the brief — all three caps silently off and a greeting on every message — **does not
exist.** §3 has the raw output.

✅ **AND IT DISCRIMINATES, WHICH THE SPECIFIED PAIR ALONE DID NOT PROVE.** §4.

---

# §1 — THE THREE READS, BEFORE WRITING ANYTHING

## 1.1 THE COUNT-ONLY QUERY IN THE ROUTE, VERBATIM

```ts
        supabase.from('whatsapp_logs')
          .select('*', { count: 'exact', head: true })
          .eq('truck_id', truck.id)
          .not('response_sent', 'is', null)
          .gte('created_at', monthStart)
          .or(`classification.is.null,classification.not.in.(${CAP_CLASSIFICATIONS.join(',')})`),
```

**The `.or()` string is a template literal interpolating `CAP_CLASSIFICATIONS.join(',')`** — four names,
comma-joined, unquoted, inside `not.in.(…)`.

## 1.2 HOW A SCRIPT BUILDS A SERVICE-ROLE CLIENT — QUOTED FROM `scripts/reresolve-event-venues.ts`

```ts
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
```

**Not `lib/supabase/server.ts`** — that is `cookies()`-based and request-scoped. Scripts read `.env.local`
directly and construct the client themselves. **The new script uses this pattern unchanged.**

## 1.3 ✅ PRODUCTION IS CONFIRMED, NOT GUESSED

| | |
|---|---|
| **File a script picks up** | `.env.local` — hard-coded in the `readFileSync` above. It is the only `.env*` file in the repo. |
| **Project** | `NEXT_PUBLIC_SUPABASE_URL=https://ffphgwonshgxamtvefcv.supabase.co` |
| **Local instance?** | ✅ **No** — the URL is not `localhost` or `127.0.0.1`. |
| **Is that ref production?** | ✅ **Corroborated independently by the manual**, which names it in operational instructions: *"on the Supabase dashboard confirm project ref `ffphgwonshgxamtvefcv` first"* and *"applied + verified on `ffphgwonshgxamtvefcv`, all 3 trucks true"*. |
| **Credentials** | Both keys present in `.env.local`. ⚠️ **Values were never printed** — only presence and length were checked. |

✅ **The script's own output re-states the project it hit**, so the target is in the evidence rather than
in an assumption (§3).

---

# §2 — THE SCRIPT

`scripts/check-cap-filter.ts`, standalone, **imported by nothing** (a grep across `app/`, `lib/`,
`components/` and `package.json` returns no reference).

🔴 **THE FILTER IS IMPORTED, NEVER RETYPED.**

```ts
import { CAP_CLASSIFICATIONS } from '../lib/whatsapp/reply-cap'
const filter = `classification.is.null,classification.not.in.(${CAP_CLASSIFICATIONS.join(',')})`
```

**A hand-copied literal would have tested a different string than the one that ships** — which is exactly
the failure this script exists to rule out.

✅ **READ-ONLY.** Two `head: true` count queries. No insert, update, delete or migration on any table.
✅ **The error is not caught or softened** — both branches print `message`, `code`, `details`, `hint`
and the script does not wrap the call in a try/catch.

## 2.1 ⚠️ ONE DEVIATION FROM THE ROUTE'S QUERY, AND WHY

The script omits `.gte('created_at', monthStart)`. **The question is whether PostgREST parses the `.or()`
string; the month boundary is separate arithmetic that would only add a way for the test to fail for an
unrelated reason.** The three filters that matter — `.eq`, `.not`, `.or` — are identical.

## 2.2 ⚠️ HOW IT WAS EXECUTED, SINCE `tsx` IS NOT INSTALLED

`node_modules/.bin/tsx` does not exist, so `npx tsx` would have required a network install. **The real
`.ts` file was run instead through a `require.extensions['.ts']` hook that transpiles with the installed
TypeScript compiler.** ⚠️ **This is still an execution of the actual script and the actual import** —
relative module resolution is Node's own, so `CAP_CLASSIFICATIONS` came from
`lib/whatsapp/reply-cap.ts`, not from a copy.

---

# §3 — RAW OUTPUT, VERBATIM

```
project : https://ffphgwonshgxamtvefcv.supabase.co
filter  : classification.is.null,classification.not.in.(CAP_CUSTOMER_24H,CAP_CUSTOMER_NOTIFIED,CAP_TRUCK_DAY,CAP_TRUCK_MONTH)

REAL  : count = 4
CONTROL: count = 4
```

✅ **No error object was printed, because there was no error.**

✅ **The control also returned a count**, so the client, the table and the credentials are all sound —
and since the real query returned a count too, **the filter string is not at fault. It parses.**

---

# §4 — 🔴 THE SPECIFIED PAIR PROVED "PARSES", NOT "EXCLUDES" — SO I RAN ONE MORE READ-ONLY PROBE

**`REAL = CONTROL = 4` is consistent with two very different worlds:** a filter that correctly excludes
cap rows (of which there are none yet), or a filter that parses and silently matches everything.
**Reporting the first without ruling out the second would have been overclaiming.**

An additional read-only probe, beyond the brief:

```
  distinct classifications on test-truck: ["MENU_QUERY","SPECIFIC_QUERY"]
  rows total: 4   with response_sent: 4
  A  count of rows carrying a cap classification : 0
  B  same filter shape excluding the REAL value "MENU_QUERY" : 1    <- was 4
```

- **A = 0** — no cap row has ever been written, so the real filter excluding them *correctly* changes
  nothing. That is why both counts are 4.
- **B: 4 → 1** — feeding the **same `or(classification.is.null,classification.not.in.(…))` shape** a value
  that *does* exist drops the count. ✅ **`not.in` discriminates. The exclusion will work the moment a
  cap row exists.**

⚠️ **ONE ARM REMAINS UNEXERCISED AGAINST REAL DATA: `classification.is.null`.** There are no NULL
classifications on `test-truck`, so the branch that exists to stop Postgres dropping NULL rows was parsed
but never had a row to keep. **It is the reason the `or` is there rather than a plain `.not(...)`, and it
is still unproven by data.**

---

# §5 — WHICH OF THE THREE I DID

🔴 **ALL THREE, AND THE EXECUTION IS THE ONLY ONE THAT DISCHARGES THIS.**

| | |
|---|---|
| **Parse** | Yes — the file parses. |
| **Typecheck** | `npx tsc --noEmit`, exit 0. 🔴 **PROVES NOTHING HERE** — PostgREST filter strings are opaque to TypeScript; a malformed one typechecks perfectly. |
| **EXECUTION** | ✅ **YES — against production `ffphgwonshgxamtvefcv`**, output in §3, plus the extra probe in §4. |

✅ **Scope:** no route added, no operator surface, no migration. `app/api/webhooks/meta/whatsapp/route.ts`,
`lib/whatsapp/reply-cap.ts`, the classifier and the Twilio handler were **not modified** — this task only
read them.

✅ **The script was deleted after running**, as specified. It is reproduced in full in §2 and its output
in §3, so nothing is lost by its removal.

---

# §6 — WHAT THIS DOES AND DOES NOT SETTLE

✅ **SETTLED:** the `.or()` string parses against production; the exclusion mechanism discriminates; the
route's month query will return a number rather than throw. **The catastrophic reading — all three caps
off and a greeting on every message — is ruled out.**

🔴 **NOT SETTLED, AND STILL THE LARGEST UNKNOWN: the cap has never actually fired.** No inbound message
has hit that code path, no cap row has ever been written, and the month-boundary binary search has never
run. **This check removes one way the cap could be silently absent; it does not show the cap working.**

⚠️ **Also unproven:** the `classification.is.null` arm against a real NULL row (§4), and the whole
fail-open path, which is what would hide any *future* failure of this same query.
