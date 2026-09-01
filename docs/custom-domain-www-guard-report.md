# The `www` refusal, server-side — and the brand link

**WHICH OF THE THREE I PERFORMED: A TYPECHECK AND ONE EXECUTION.** No standalone parse — `npx tsc
--noEmit` subsumes it and **exits 0**. One harness runs the **real** `domain_provision` handler with the
**real** apex module and counts every outbound call, and renders the **real** `PoweredBy`: **30/30**.
Four further checks in §4 are labelled **PARSE**.

🔴 **Nothing was deployed, no migration was written, and no domain was touched at the hosting side** —
every outbound call is intercepted and counted inside the `vm`. Pizzeria Gusto is untouched.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

**Two files modified.** `app/api/manage/route.ts` (**one insert, 0 deletions**) and
`components/embed/EmbedParts.tsx`.

---

## 1. WAS `www` REFUSED SERVER-SIDE? — NO. IT IS NOW.

### What the provisioning path did, quoted

`app/api/manage/route.ts`, `domain_provision` — **exactly three guards stood between the request and
the hosting call**:

```ts
1056|   if (action === 'domain_provision') {
1057|     if (!canAccess(truck.plan, 'embed_schedule', truck.feature_overrides ?? {}, truck.trial_expires_at)) {
1058|       return NextResponse.json({ error: 'Not available on this plan' }, { status: 403 })
1062|     const verdict = checkSubdomain(typeof body.address === 'string' ? body.address : '')
1063|     if (!verdict.ok) { … 400 … }
1071|     const soa = await checkApexViaSoa(verdict.host)
1072|     if (soa.state === 'apex') { … 400 … }
1079|     const added = await addDomain(verdict.host)        ← the hosting call
```

**None of them refuses `www`.** `checkSubdomain`'s refusal reasons are `empty`, `not_a_domain`,
`unparseable`, `apex` and `too_deep` (`lib/custom-domain/apex.ts:46-83`) — there is no `www` branch, and
`grep -c www lib/custom-domain/apex.ts` finds none.

### 🔴 PROVED BEFORE CHANGING ANYTHING — the real guard, executed

```
  www.theirdomain.com       {"ok":true,"host":"www.theirdomain.com","registrable":"theirdomain.com","subdomain":"www"}
  WWW.theirdomain.com       {"ok":true,"host":"www.theirdomain.com","registrable":"theirdomain.com","subdomain":"www"}
  Www.TheirDomain.co.uk     {"ok":true,"host":"www.theirdomain.co.uk","registrable":"theirdomain.co.uk","subdomain":"www"}
  theirdomain.com           {"ok":false,"reason":"apex",…}
```

**Both guards pass it, and both are working correctly.** `www.theirdomain.com` genuinely *is* a
subdomain: the suffix-list guard parses it as `www` of `theirdomain.com`, and the SOA guard finds no SOA
at that name. 🔴 **www is simply not the thing either one looks for** — which is why it needed its own
line rather than a widening of one of theirs.

### The guard added

Placed immediately after `checkSubdomain` — **beside the existing apex guard, before the SOA lookup and
well before the hosting call**:

```ts
    if ((verdict.subdomain ?? '').split('.')[0] === 'www') {
      return NextResponse.json({
        ok: false, reason: 'www',
        message: `${verdict.host} is usually where your existing website already lives. If you point that at us, your website is replaced by this page. Use a different word in front, like schedule.`,
      }, { status: 400 })
    }
```

⚠️ **THE CLIENT ALREADY REFUSES IT AND THAT IS NOT ENOUGH.** A UI check is a courtesy; this is the last
line before a side effect that takes over a website, and the client can be bypassed by anything able to
POST — which on this route is any authenticated operator with a role on this truck.

⚠️ **THE FIRST LABEL, NOT THE WHOLE SUBDOMAIN.** `checkSubdomain` has already lower-cased the host, so
case is handled without a second `toLowerCase()`. Testing the leading label catches
`www.theirdomain.com` **and** `www.shop.theirdomain.com`, while deliberately **not** refusing
`shop.www-cafe.com`, where "www" is part of a name rather than the conventional web prefix. All four
cases are in the harness.

### EXECUTION — it bites, with no hosting call

Posted straight at the route; the client is not involved.

```
  www.theirdomain.com          → 400 reason=www
      hosting calls: addDomain=0 getConfig=0   SOA lookups=0   db writes=0
  WWW.TheirDomain.com          → 400 reason=www     (same, all zero)
  Www.theirdomain.co.uk        → 400 reason=www     (same, all zero)
  www.shop.theirdomain.com     → 400 reason=www     (same, all zero)

  the message an operator sees:
      "www.theirdomain.com is usually where your existing website already lives. If you point that at
       us, your website is replaced by this page. Use a different word in front, like schedule."
```

🔴 **Zero `addDomain`, zero `getDomainConfig`, zero row writes — and zero SOA lookups**, because the
guard sits ahead of that DNS call too, so a refusal costs nothing outbound at all.

### And a normal prefix still provisions

```
  schedule.theirdomain.com     → 200 ok=true  addDomain=1  embed_enabled=true
  whatson.theirdomain.co.uk    → 200 ok=true  addDomain=1  embed_enabled=true
  shop.www-cafe.com            → 200 ok=true  addDomain=1  embed_enabled=true
```

⚠️ **`domain_preflight` still does NOT refuse `www`**, and I did not change it — this brief scoped the
guard to before the hosting call. Preflight makes a read-only lookup with no side effect, so an operator
who bypasses the client sees the checks run and is then refused at provision. **Recorded, not fixed.**

---

## 2. THE BRAND LINK

### (a) The href — read, not assumed

`grep NEXT_PUBLIC_HATCHGRAB_URL` shows the whole codebase resolving through that variable, and
`.env.local:19` sets it to **`https://www.hatchgrab.com`**. The page that renders this component,
`app/domain/page.tsx:36`, uses exactly this shape:

```ts
const HATCHGRAB_URL = process.env.NEXT_PUBLIC_HATCHGRAB_URL || 'https://www.hatchgrab.com'
```

**Mirrored, so the two cannot disagree about where we live:**

```tsx
href={process.env.NEXT_PUBLIC_HATCHGRAB_URL || 'https://www.hatchgrab.com'}
```

Was `https://hatchgrab.com` — the apex, which §43 records as 307-redirecting to `www`, so every click
from an operator's page carried a needless hop.

### (b) `target` and `rel` removed

Both gone. **On a page served from the operator's own domain, a new tab leaves our site sitting behind
theirs, which reads as an advertisement rather than an attribution** — we are a credit here, not a
destination competing for the visit. A plain link is also the form the visitor controls: anyone wanting
a new tab can middle-click.

⚠️ **`rel="noopener noreferrer"` goes WITH the target, and removing it is not a loosening.** `noopener`
exists to stop a new tab reaching back through `window.opener`; a same-tab navigation has no opener to
protect, so keeping it would be cargo. And `noreferrer` would additionally strip the referrer — hiding
from our own analytics that the click came from an operator's domain, which is the one thing about this
link worth knowing.

### EXECUTION — the rendered link

```html
<p class="mt-4 text-center text-[11px] text-slate-400"><a href="https://www.hatchgrab.com" class="font-medium transition-colors hover:text-slate-600">Powered by HatchGrab</a></p>
```

```
  PASS  🔴 href is the www address        PASS  🔴 no target attribute
  PASS  🔴 no rel attribute               PASS  the text is unchanged
  PASS  the classes are unchanged         PASS  falls back to www when the variable is unset
```

---

## 3. VERIFICATION SUMMARY

```
  npx tsc --noEmit                exit 0
  wwwguard.cjs (real handler, real apex module, real component)   30/30 PASS
```

Every requirement:

1. ✅ **A `www` prefix is refused server-side with no hosting call made** — four spellings, all zero
   outbound.
2. ✅ **A normal prefix still provisions** — three addresses, `addDomain` called once each.
3. ✅ **The brand link renders with the correct href, no target and no rel.**
4. ✅ **The wizard, address field, apex guards, provisioning and record screen otherwise unchanged** —
   §4.

---

## 4. SCOPE PROOFS (PARSE)

**4.1 The apex guards themselves are byte-identical.** `checkSubdomain`, `parentOf`,
`suggestFromWebsite` and `domainFromWebsite` all extracted and compared: **IDENTICAL**.
`lib/custom-domain/apex.ts` was not opened for writing this workstream — its mtime predates it. 🔴 **The
new refusal is a separate line in the route, not a change to a guard.**

**4.2 `app/api/manage/route.ts` — one contiguous insert, ZERO deletions.**

```
  route.ts: 1938 -> 1963 lines, 1 changed region(s)
    insert  old[1066:1066] -> new[1066:1091]   the www guard
  unchanged lines identical: True (1938 lines)
  deletions: 0
```

Every other action on that route — including `domain_preflight`, `domain_status`, `domain_confirm`,
`domain_send_instructions` and the rest of `domain_provision` — is untouched.

**4.3 `components/embed/EmbedParts.tsx` — two regions, both inside `PoweredBy`.** `Shell`,
`TruckIdentity` and `truckLogoUrl` are each present once before and after and were not modified.

**4.4 The wizard and its address field were not opened.**
`components/dashboard/CustomDomainSetup.tsx` mtime predates this workstream — the first screen, the
split field, the prefix rules and the record screen are exactly as the previous report left them.

---

## 5. WHAT REMAINS UNVERIFIED

1. 🔴 **NOTHING WAS RENDERED IN A BROWSER AND NO REQUEST LEFT THE PROCESS.** The refusal is proved
   against the real handler with intercepted transport; **no real Vercel API call was attempted, so
   "no hosting call was made" is proved by counting calls to a stub**, not by observing the provider.
2. **The `www` harm itself is reasoned, not measured.** That pointing `www` at us would replace an
   operator's homepage follows from what `www` conventionally serves; **no operator's DNS was inspected
   and no truck's `www` was tested.** A truck whose website answers only on the apex would lose nothing
   — the guard refuses them anyway, which is the conservative direction.
3. ⚠️ **`domain_preflight` remains unguarded** against `www` (§1). Out of scope, recorded.
4. **The brand link was rendered, not clicked.** That the apex 307-redirects to `www` is taken from §43
   of the manual, **not re-observed** — no request was made to either address.
5. **`next build` was not run.** `tsc --noEmit` is a typecheck, not a build.
6. **Six migrations remain unapplied**, and this work needed none.
