# An admin health check for the outreach mailbox

**Date** 28 September 2026 · **Diagnose-only.** Nothing is sent, no message is read, no flag is changed,
no migration was written and no SQL was run. This task touched no truck, no prospect, no
`outreach_templates` row and no `outreach_snippets` row.

**What it answers.** Can Vercel production log in to `dominic@hatchgrab.com` at Namecheap Private Email —
over SMTP on 465, over SMTP on 587, and over IMAP on 993 — and what folders does that mailbox have?

---

## Dependencies — exact-pinned, no `^` or `~`

| package | version | where |
|---|---|---|
| `nodemailer` | **10.0.12** | `dependencies` |
| `imapflow` | **2.1.2** | `dependencies` |
| `@types/nodemailer` | **8.0.2** | `devDependencies` |

Installed with `npm install --save-exact`; all three are recorded in `package.json` with a bare version
and no range character. **`imapflow` ships its own types** (`./dist/cjs/imap-flow.d.ts`), so no
`@types/imapflow` is needed or wanted.

**`serverExternalPackages` was NOT needed.** `next build` completed with exit 0 and no warning naming
either package, and the route is listed as `ƒ /api/admin/outreach/mail-health` (dynamic, server-rendered
on demand). `next.config.ts` is unchanged — it still lists only `@sparticuz/chromium` and
`puppeteer-core`.

## The admin gate

**`verifyAdmin`, from `lib/auth/admin.ts`** — the same helper `app/api/admin/outreach/route.ts` uses on
both its `GET` and its `POST`. The refusal is copied exactly, status included:

```ts
if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
```

🔴 **404, not 401, and that is deliberate.** Its neighbour answers 404 so the route does not confirm its
own existence to someone who cannot use it. A diagnostic that 401s where its neighbour 404s would tell an
unauthenticated caller there is something here.

---

## The files

| path | what it is |
|---|---|
| **`lib/outreach-mail-config.ts`** | the host and the three ports as exported constants, plus the per-check ceiling |
| **`app/api/admin/outreach/mail-health/route.ts`** | the route |

`OUTREACH_MAIL_HOST = 'mail.privateemail.com'` is a constant rather than an environment variable, as
specified: it is not a secret and it does not differ between a laptop, preview and production. The file
carries no credential and says so.

### Walk-through

1. **Gate.** `verifyAdmin(req)`; a non-admin gets `404 {"error":"Unauthorised"}` and nothing runs.
2. **Environment.** Reads `OUTREACH_MAIL_USER` and `OUTREACH_MAIL_PASSWORD`. If either is missing it
   returns `{ region, envPresent: { user, password } }` — **booleans only** — and attempts nothing.
3. **Three checks, in sequence**, each wrapped in `withTimeout(…, 10_000)` and each returning a verdict
   rather than throwing:
   - `checkSmtp(465, starttls: false)` — `secure: true`, implicit TLS. `transporter.verify()`, then `close()`.
   - `checkSmtp(587, starttls: true)` — `secure: false` with **`requireTLS: true`**, so a server that
     quietly declines STARTTLS is a *failure* here rather than a silent plaintext login.
   - `checkImap()` — `connect()` → `list()` → `status('INBOX', { messages: true })` → `logout()`.
4. **Response.**

```jsonc
{
  "region": "lhr1",                       // process.env.VERCEL_REGION ?? null
  "envPresent": { "user": true, "password": true },
  "smtp465": { "ok": true,  "ms": 812,  "error": null },
  "smtp587": { "ok": true,  "ms": 934,  "error": null },
  "imap":    { "ok": true,  "ms": 1104, "error": null,
               "inboxMessages": 0,
               "folders": [ { "path": "INBOX", "name": "INBOX", "specialUse": null, "flags": ["\\HasNoChildren"] } ] }
}
```

⚠️ **Why sequence, not parallel.** Three simultaneous logins from one IP is what a mail host's
brute-force heuristics are built to notice, and being allowed to log in is the whole point of the route.

⚠️ **`folders[].flags` is flattened with `Array.from`.** ImapFlow returns a `Set`, which serialises to
`{}` if handed straight to `NextResponse.json`.

### §35 — the `maxDuration` invariant

```ts
export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'
```

Three 10-second checks in sequence is a 30-second worst case. The platform default (~10–15s) would kill
the handler mid-check and report a timeout that says nothing about the mailbox — which is exactly the
`/api/demo` failure §35 records. `runtime = 'nodejs'` because both libraries open raw TLS sockets, which
Edge has no API for. `force-dynamic` because a cached health check answers about the wrong moment.

---

## Proof it cannot send

`transporter.verify()` is the only nodemailer call that talks to the server. **`sendMail` appears nowhere
in either file except in the comments that say so** — verified by grep across both:

```
app/api/admin/outreach/mail-health/route.ts:9 ://   • IT CANNOT SEND. `transporter.verify()` is the only nodemailer call in this file; `sendMail` appears
app/api/admin/outreach/mail-health/route.ts:96: * 🔴 There is no `sendMail` call in this function, this file, or anywhere added by this task.
```

Every nodemailer call in the file:

```
102:    transporter = nodemailer.createTransport({
123:      await withTimeout(`smtp${port}`, OUTREACH_MAIL_CHECK_TIMEOUT_MS, () => transporter!.verify())
130:    try { transporter?.close() } catch { … }
```

`verify()` opens the connection, says EHLO, authenticates and hangs up — **the SMTP conversation stops
before `MAIL FROM`**, so there is no envelope and nothing to send. The transport also carries
`disableFileAccess: true` and `disableUrlAccess: true`, so it cannot read an attachment off disk or fetch
one over the network even if this file were later extended.

## Proof it cannot read a message or move a flag

Every imapflow call that touches the server:

```
161:      await client.connect()
162:      const listed = await client.list()
164:      const status = await client.status('INBOX', { messages: true })
185:    try { await client.logout() } catch { … }
```

`list()` enumerates folders; `status()` asks the server for a count. **Neither opens a mailbox.** A grep
for `mailboxOpen`, `fetch(`, `fetchOne`, `fetchAll`, `search(`, `download`, `messageFlags`, `append(`,
`move(`, `copy(`, `delete(` and `expunge` returns **nothing outside the comments** that name them. No
message is fetched, so **no `\Seen` flag can move** — the failure mode that would make a diagnostic
destructive.

## The credential-redaction check

**No path can echo the password.** Four things together:

1. **The response carries booleans, never values.** `envPresent` is `{ user: !!user, password: !!password }`.
   The rest of the body is `region`, `ok`, `ms`, `error`, `inboxMessages` and the folder list.
2. **Every error goes through `sanitise`**, which reads **only** `code`, `responseCode` and `message`, and
   caps the message at 200 characters. It never reads `authData`, `data` or `response` — the three fields
   where a mail library can surface the AUTH line — and the cap stops a server echoing a long line that
   smuggles one out inside a `message`.
3. **Neither library logs.** `logger: false` on both, plus `debug: false` on nodemailer and
   `emitLogs: false` on imapflow. ImapFlow's default logger writes the protocol dialogue — **including the
   AUTH line** — to stdout; that single option is the most important line in the file for keeping the
   password out of the platform log.
4. **The file contains no `console.*` at all.** A `console.error(err)` anywhere here would print the whole
   error object to the platform log, which is the same disclosure by a different door.

**The username is not logged or returned either.** A mailbox address is the half of a credential pair that
identifies the person; `envPresent.user` is a boolean. The only place `user` and `pass` go is
`auth: { user, pass }` on the two clients — greps for both variables are in the walk-through above and
show no other destination.

---

## Verification

| command | result |
|---|---|
| `npx tsc --noEmit` | **exit 0**, no output |
| `npx next build` | **exit 0**; route listed as `ƒ /api/admin/outreach/mail-health`; no warning naming nodemailer or imapflow, so no `serverExternalPackages` change |
| `npx eslint` on both new files | **clean** — 0 errors, 0 warnings |
| `node scripts/run-harnesses.cjs` | **exit 0** — 58 run · 58 passed · 0 failed |

Both goldens untouched; no generator was run.

## Commit and deploy

- **Commit:** `<hash>` — see the chat summary; the files are `package.json`, `package-lock.json`,
  `lib/outreach-mail-config.ts`, `app/api/admin/outreach/mail-health/route.ts` and this report. Nothing
  else was staged.
- **Deploy:** confirmed Ready — see the chat summary for how.

## The URL to open

While signed in as admin in Safari:

```
https://hatchgrab.com/api/admin/outreach/mail-health
```

It returns JSON. A non-admin — or a signed-out browser — gets `404 {"error":"Unauthorised"}`, which is the
same refusal the outreach list route gives.

---

## Anything I could not establish

- **Whether the mailbox actually accepts the login.** That is what the route is for, and only Dominic can
  run it: it needs a production admin session and the two Production-only environment variables, neither
  of which exists on this machine. Locally the route returns
  `{ region: null, envPresent: { user: false, password: false } }` — the missing-env branch — which is the
  correct answer here and confirms the gate and the early return work.
- **No UI was built**, as specified. `OutreachPanel`, the compose window, the templates and the contact
  log are untouched.
