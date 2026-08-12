# Registering the stale-authorization sweep

**Date:** 13 August 2026
**One file changed: `vercel.json`, four lines added. No `next dev`, no `next build`. Nothing committed, nothing deployed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

## 1. `vercel.json`, in full, BEFORE

```json
{
  "functions": {
    "app/api/manage/verify-schedule-url/route.ts": {
      "memory": 1024,
      "maxDuration": 60
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "X-Robots-Tag",
          "value": "noindex, noarchive, nosnippet"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        }
      ]
    },
    {
      "source": "/trucks/(.*)",
      "headers": [
        {
          "key": "X-Robots-Tag",
          "value": "noindex, noarchive"
        }
      ]
    }
  ],
  "crons": [
    {
      "path": "/api/cron/demo-cleanup",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/account-deletion-due",
      "schedule": "0 9 * * *"
    }
  ]
}
```

🔴 **A `crons` KEY ALREADY EXISTED, WITH TWO ENTRIES. So this is an ADD, not a create and not a replace.**

---

## 2. The change

```diff
 diff --git a/vercel.json b/vercel.json
@@ -37,6 +37,10 @@
     {
       "path": "/api/cron/account-deletion-due",
       "schedule": "0 9 * * *"
+    },
+    {
+      "path": "/api/cron/cancel-stale-authorizations",
+      "schedule": "*/10 * * * *"
     }
   ]
 }
```

✅ **Four added lines and one comma. Nothing else in the file is touched** — `functions` and `headers` are byte-identical, and neither existing cron entry is altered by a character.

**The `crons` array now reads:**

```json
  "crons": [
    { "path": "/api/cron/demo-cleanup",                  "schedule": "0 * * * *" },
    { "path": "/api/cron/account-deletion-due",          "schedule": "0 9 * * *" },
    { "path": "/api/cron/cancel-stale-authorizations",   "schedule": "*/10 * * * *" }
  ]
```

✅ **The file still parses as JSON** — verified, top-level keys `['functions', 'headers', 'crons']`.

⚠️ **`*/10 * * * *` is every ten minutes**, on the hour and at :10, :20, :30, :40, :50. **Vercel cron schedules run in UTC**, which for a ten-minute interval makes no difference — there is no BST/GMT hazard here the way there would be for a daily job.

**NON-ASCII CENSUS:** `vercel.json` — **before 0 / 0, after 0 / 0.** Pure ASCII in both states.

---

## 3. How the route authenticates

**Source: QUOTED.** `app/api/cron/cancel-stale-authorizations/route.ts:46-58`:

```ts
/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Admins may also trigger it by hand — the
 *  same gate app/api/cron/account-deletion-due uses. */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}

export async function GET(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
```

**And `account-deletion-due/route.ts:31-37`, for comparison:**

```ts
/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Admins may also trigger it by hand. */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}
```

✅ **BYTE-IDENTICAL BODIES.** The only textual difference is the doc comment's trailing clause. `demo-cleanup/route.ts:231-237` carries the same function again, also byte-identical.

**So the gate is:** the `Authorization` header equals `Bearer ${CRON_SECRET}` exactly, **or** `verifyAdmin(req)` resolves an operator with `is_admin` (cookie session, or a Supabase JWT bearer for the native app).

---

## 4. 🔴 WOULD VERCEL'S OWN CRON INVOCATION SATISFY THAT GATE?

✅ **YES — with two conditions, both of which hold.**

| What the gate needs | What Vercel Cron does |
|---|---|
| An HTTP **GET** to the path | ✅ Vercel Cron issues a **GET**, and the route exports `GET` |
| Header `Authorization: Bearer <CRON_SECRET>` | ✅ Vercel attaches exactly this header **when a `CRON_SECRET` environment variable is set on the project** |
| Exact string match on the secret | ✅ The comparison is `authz === \`Bearer ${secret}\``, matching what Vercel sends |

🔴 **THE ROUTE EXPECTS NO HEADER VERCEL DOES NOT SEND.** It reads exactly one header, `authorization`. It does **not** check `x-vercel-signature`, `x-vercel-cron`, `user-agent` or any other marker — so there is nothing here for Vercel to fail to supply. **The answer to the question as asked is: it works, and I am not assuming it — the two existing crons run through the identical function.**

⚠️ **THE ONE CONDITION THAT IS NOT IN THIS REPOSITORY:** `CRON_SECRET` must be set as a Vercel **project** environment variable, in the environment being deployed. It is present in `.env.local` (which is local only). ✅ **Strong circumstantial evidence it is set in production: `demo-cleanup` and `account-deletion-due` already depend on it and are already scheduled.** But I cannot read Vercel's project settings from here — **not established** that the variable exists in the deployed environment, only that two shipped jobs already assume it.

⚠️ **AND NOTE HOW IT FAILS IF IT IS NOT SET.** With `CRON_SECRET` unset, `secret` is `undefined`, the first branch is skipped, and `verifyAdmin(req)` runs — which finds no cookie and no JWT, and returns `false`. **So the route 401s.** It fails closed, which is right, but it fails **silently from the job's point of view**: the sweep would simply never cancel anything. That is precisely the recorded failure mode the route's own header warns about:

> `// ⚠️ THE RECORDED FAILURE MODE APPLIES: "when the Vault service_role_key was deleted, every scheduled`
> `// invocation 401'd and nothing surfaced it." A job that never runs cannot report that it never ran.`

⚠️ **A second-order effect worth naming, because it is new with this job:** this sweep is now load-bearing for **erasure** as well as for money — `purge_order_drafts()` refuses to delete a draft whose authorisation is uncancelled. So a 401'ing sweep means holds are never released **and** customer PII accumulates past its expiry.

---

## 5. Does the plan support a 10-minute schedule?

🔴 **NOT ESTABLISHED.**

There is no `.vercel/project.json`, no plan indicator anywhere in the repository, and nothing in the environment that names the account tier. I cannot read Vercel's billing state from here and will not guess it.

**What the repository does show, as circumstantial evidence only:**

- ⚠️ **`demo-cleanup` is already scheduled `0 * * * *` — hourly.** Vercel's Hobby tier permits cron jobs **once per day** and no more frequently, so an hourly job is not a Hobby schedule. Either the project is on a paid tier, or that job has never been running at the cadence its entry claims.
- ⚠️ **This entry makes three cron jobs.** Hobby is limited to **two**. On Hobby, adding a third is a deployment-time error, not a silent no-op.

**INFERRED from those two facts:** the project is most likely on Pro or above, where cron frequency is unrestricted and `*/10 * * * *` is accepted. **But that is an inference from a config file, not a fact I can verify**, and the brief asked me to say so rather than assume. **Not established.**

⚠️ **If it turns out to be Hobby, this entry fails at deploy** — loudly, which is the good direction, and the fallback is a longer schedule plus accepting that a hold sits uncancelled for longer. Stripe holds an uncaptured intent for around seven days, so even a daily sweep would release every hold well inside that window; what a slower cadence costs is how long a customer sees a pending authorisation on their banking app.

---

## What was NOT touched

| Constraint | Held? |
|---|---|
| Existing `crons` entries | ✅ **Neither altered by a character** |
| `functions`, `headers` | ✅ **Byte-identical** |
| The route itself | ✅ **Not opened for editing — quoted only** |
| Anything else | ✅ **One file, four added lines, one comma** |

## Not established

- **The Vercel plan**, and therefore whether `*/10 * * * *` is accepted. §5.
- **Whether `CRON_SECRET` is set on the deployed project.** Two shipped crons already assume it; I cannot read the project's environment variables. §4.
- **Whether `demo-cleanup` is genuinely running hourly today.** Its schedule says so; if the plan did not permit it, that entry would be evidence of a job that has never run at its stated cadence.
