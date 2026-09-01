# Per-provider record instructions

**WHICH OF THE THREE I PERFORMED: ALL THREE — a PARSE, a TYPECHECK, and an EXECUTION.**
- **Parse** — every provider record, label and line quoted here is read from a file on disk.
- **Typecheck** — `npx tsc --noEmit`, clean. `npx eslint`: no new rule violated.
- **Execution** — the **real component was transpiled and run** and the record screen rendered for
  **all four providers, a detected-without-steps provider and the undetected fallback**; the **real
  `instructionsEmail` was executed** for a provider with steps and one without; `recordRows` and
  `providerFieldRows` were run side by side; and the four DNS functions were sliced by brace-matching
  and compared byte for byte.
- 🔴 **AND THE STEPS THEMSELVES WERE FETCHED FROM EACH PROVIDER'S CURRENT HELP PAGE** — not written
  from memory. Sources in §2.

**NO DEPLOY. NO MIGRATION. NO SQL.** Pizzeria Gusto untouched.
**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**
🔴 **Fetching found four stale labels we ship today, and the Wix path in your brief was missing a
step — §2.**

---

## 1. ONE RECORD PER PROVIDER, ONE SOURCE

`lib/custom-domain/dns.ts` — the record that already held each provider's `label`, `dashboardUrl`,
`nsMatch` and `recordLabels` now also holds `steps`:

```ts
export type ProviderSteps = {
  fieldLabels: { type: string | null; name: string; value: string }
  steps: string[]
  helpUrl: string
  caveat: string | null
}
```

🔴 **`fieldLabels.type` IS NULLABLE, AND THAT IS THE ENTIRE REASON THIS TYPE EXISTS.** `null` means
render no type row. **Wix is `null`** — there is no type field on Wix, so a "Type: CNAME" row sends the
operator hunting for a box that does not exist, which is the bug you reported.

### 🔴 PROOF THAT NO PROVIDER'S STEPS ARE WRITTEN TWICE

All 25 step strings, 4 caveats and 4 help URLs were grepped for, whole, across `app/`, `components/`,
`lib/` and `scripts/`:

```
  ✅ EVERY ONE appears in lib/custom-domain/dns.ts AND NOWHERE ELSE in app/ components/ lib/
```

⚠️ **They also appear in `scripts/check-plain-english.mjs`**, and that is honest to state: those corpus
entries were **generated from the record** by a script, not authored a second time. It is a checker
corpus, not a second source — and it exists precisely so the corpus cannot drift from what ships.

**Both surfaces render from it.** The record screen reads `provider.steps`; the email takes the same
object, passed through by `app/api/manage/route.ts` in **three lines**:

```ts
steps: dns.provider?.steps ?? null,
```

**`lib/custom-domain/copy.ts` holds no provider knowledge at all** — the email is handed the record.

---

## 2. 🔴 FETCHED, NOT REMEMBERED — AND WHAT THAT FOUND

| Provider | Source URL read 28 August 2026 |
|---|---|
| **Wix** | `https://support.wix.com/en/article/adding-or-updating-cname-records-in-your-wix-account` |
| **GoDaddy** | `https://www.godaddy.com/help/add-a-cname-record-19236` |
| **Cloudflare** | `https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/` and `.../reference/dns-record-types/` for the field names |
| **123 Reg** | `https://www.123-reg.co.uk/support/domains/how-do-i-set-up-a-cname-record-on-my-domain-name/` |
| *(the Cloudflare caveat)* | `https://vercel.com/kb/guide/cloudflare-with-vercel` |

⚠️ **GoDaddy blocks automated fetching (403/503).** Their page content was read through search of that
same help article rather than a direct fetch. **Every label below is theirs; none was retrieved from
the page directly**, and that is a weaker source than the other three.

### 🔴 FOUR LABELS WE SHIP TODAY ARE STALE

| Provider | `recordLabels` today | Their current page says |
|---|---|---|
| **GoDaddy** | value: **`Points to`** | 🔴 **`Value`** |
| **123 Reg** | name: **`Hostname`**, value: **`Destination`** | 🔴 **`Name`**, **`Value`** |
| **Wix** | type: **`Type`** | 🔴 **there is no type field at all** |
| Cloudflare | `Type` / `Name` / `Target` | ✅ correct |

⚠️ **I DID NOT EDIT `recordLabels`.** Your brief requires the generic rows to be unchanged, and
`recordRows` is byte-identical by that requirement. **The verified labels live in `fieldLabels` and are
what the four-provider screen renders.** The two now disagree on purpose, and each record says so in a
comment. **Correcting `recordLabels` is a one-line change per provider once you want it.**

### ⚠️ AND YOUR BRIEF'S WIX PATH WAS MISSING A STEP

You gave: *Domains → Domain Actions → Manage DNS Records → + Add Record in CNAME (Aliases) → Host Name
→ Value → Save → Save Changes.* **Their page has a `"Got it"` pop-up between "+ Add Record" and "Host
Name"** — the step most easily missed, because it is a modal that must be dismissed before the fields
appear. It is in the record. **Everything else in your path verified exactly.**

---

## 3. WHAT AN OPERATOR READS — ALL SIX CASES, RENDERED

### ✅ Wix — no type row

```
Add this at Wix        Open Wix
 1. Open "Domains", then click the "Domain Actions" icon beside your web address.
 2. Choose "Manage DNS Records".
 3. In the "CNAME (Aliases)" section, click "+ Add Record", then click "Got it".
 4. Put the first value below in "Host Name".
 5. Put the second value below in "Value".
 6. Click "Save", then click "Save Changes" in the pop-up.

 Host Name   Just this word, not the whole address.   events                 [Copy]
 Value       Copy this exactly.                       cname.vercel-dns.com   [Copy]

 ⚠️ If your web address only points at Wix rather than being held there, Wix cannot make this
    change — whoever holds it has to.
 Wix's own guide to this
```

### ✅ GoDaddy

```
Add this at GoDaddy    Open GoDaddy
 1. Open your "Domain Portfolio" and choose your web address.
 2. On "Domain Settings", select "DNS".
 3. Select "Add New Record", then pick "CNAME" from the "Type" menu.
 4. Put the first value below in "Name".
 5. Put the second value below in "Value".
 6. Leave "TTL" as it is and select "Save".

 Name    Just this word, not the whole address.   events                 [Copy]
 Value   Copy this exactly.                       cname.vercel-dns.com   [Copy]

 ⚠️ If you added more than one at once, the button says "Save All Records".
 GoDaddy's own guide to this
```

### ✅ Cloudflare — the caveat is the point

```
Add this at Cloudflare    Open Cloudflare
 1. Open your web address, then "DNS" and "Records".
 2. Select "Add record", then pick "CNAME" as the "Type".
 3. Put the first value below in "Name".
 4. Put the second value below in "Target".
 5. Set "Proxy status" to "DNS only" — the cloud beside it must be grey, not orange.
 6. Leave "TTL" as "Auto" and select "Save".

 Name     Just this word, not the whole address.   events                 [Copy]
 Target   Copy this exactly.                       cname.vercel-dns.com   [Copy]

 ⚠️ If the cloud stays orange the padlock will never appear, and nothing will say why.
 Cloudflare's own guide to this
```

🔴 **Cloudflare defaults new records to PROXIED.** Proxied, Cloudflare terminates the connection itself
and our certificate never issues — Vercel's own guidance. **It fails silently**, which is the shape of
failure this whole feature keeps running into.

### ✅ 123 Reg — the one where "copy this exactly" is wrong

```
Add this at 123 Reg    Open 123 Reg
 1. Sign in to your "123 Reg Control Panel".
 2. Beside "Domains", select "Manage All", then choose your web address.
 3. Select "DNS", then "Add New Record".
 4. Pick "CNAME" from the "Type" list.
 5. Put the first value below in "Name".
 6. Put the second value below in "Value", and add a full stop to the end of it.
 7. Leave "TTL" as "Default" and click "Save".

 Name    Just this word, not the whole address.   events                 [Copy]
 Value   Copy this exactly.                       cname.vercel-dns.com   [Copy]

 ⚠️ 123 Reg needs a full stop at the end of the second value or it will not work.
 123 Reg's own guide to this
```

🔴 **THEIR PAGE, VERBATIM: *"Be sure to add a full stop to the end … or your CNAME record will not work
correctly."*** ⚠️ **This is the one provider where the row's own hint — "Copy this exactly" — is not
enough**, so the step and the caveat both say it. The hint is unchanged because the values are
unchanged; the correction sits beside it.

### ↩︎ Squarespace Domains — detected, no verified steps → the fallback, unchanged

```
Add this at Squarespace Domains, and save.    Open Squarespace Domains
 Type   Choose this from the list.               CNAME                  [Copy]
 Host   Just this word, not the whole address.   events                 [Copy]
 Data   Copy this exactly.                       cname.vercel-dns.com   [Copy]
```

### ↩︎ Not detected → the fallback, unchanged

```
Add this where your web address is looked after, and save.
 Type    Choose this from the list.               CNAME                  [Copy]
 Name    Just this word, not the whole address.   events                 [Copy]
 Value   Copy this exactly.                       cname.vercel-dns.com   [Copy]
```

**Five of the nine providers keep the fallback**: Squarespace Domains, IONOS, Namecheap, Google Domains
or Squarespace, Vercel — **plus everyone undetected.**

---

## 4. 🔴 THE COPIED VALUES ARE UNCHANGED

Executed — `recordRows` rows 2 and 3 against `providerFieldRows`, for each of the four:

```
  PROVIDER      GENERIC rows 2+3 (today)                PROVIDER rows
  Wix           ["events","cname.vercel-dns.com"]       ["events","cname.vercel-dns.com"]   ✅
  GoDaddy       ["events","cname.vercel-dns.com"]       ["events","cname.vercel-dns.com"]   ✅
  Cloudflare    ["events","cname.vercel-dns.com"]       ["events","cname.vercel-dns.com"]   ✅
  123 Reg       ["events","cname.vercel-dns.com"]       ["events","cname.vercel-dns.com"]   ✅

  hints identical on both: true
  type row emitted for: Cloudflare → Type   GoDaddy → Type   123 Reg → Type   Wix → NO TYPE ROW
```

**Same name, same target, same hints. Only the label differs, and `recordRows` itself was not
touched.**

---

## 5. THE EMAIL RENDERS FROM THE SAME RECORD

```
We are putting Thai Kitchen's live schedule on events.thaikitchen.co.uk, and it needs one record
adding to our domain at Wix.

At Wix:
  1. Open "Domains", then click the "Domain Actions" icon beside your web address.
  … 6 steps …
  Host Name: events
  Value: cname.vercel-dns.com

Their own guide: https://support.wix.com/en/article/adding-or-updating-cname-records-in-your-wix-account
If your web address only points at Wix rather than being held there, Wix cannot make this change …
```

⚠️ **TWO THINGS I HAD TO FIX AFTER RENDERING IT, WHICH IS WHY RENDERING IT MATTERED.** The first draft
put the values **above** the steps while the steps said *"the first value below"*, and it still showed a
**Type row for Wix**, contradicting its own step 3. Both were only visible in the output. The email now
takes the screen's shape: steps, then the values they refer to, with no type row.

**With no verified steps the email is unchanged**, proven two ways: `steps: null` and the argument
omitted entirely produce **identical text**, and all three generic rows are still present.

---

## 6. WHAT IS UNCHANGED

| | |
|---|---|
| `checkCaa`, `detectDnsProvider`, `checkApexViaSoa`, `resolveCname` | ✅ **BYTE-IDENTICAL**, sliced by brace-matching |
| Every provider's `id`, `label`, `dashboardUrl`, `nsMatch`, `recordLabels` | ✅ **BYTE-IDENTICAL** |
| `recordRows()` | ✅ **not touched** — the fallback renders from it exactly as before |
| `lib/custom-domain/apex.ts` — both apex guards | ✅ **not opened** |
| `lib/custom-domain/vercel.ts`, `lib/ratelimit.ts` | ✅ **not opened** |
| The plan gate, both limiters, the `www` guards, `PROVISION_FAILED` | ✅ counts equal |
| The `patch` object `domain_provision` writes | ✅ **BYTE-IDENTICAL** |
| The whole `domain_provision` handler head (3,300 chars) | ✅ **BYTE-IDENTICAL** |
| `app/api/manage/route.ts` | **3 changed lines — the one pass-through** |

**Plain-English checker: `89/90 pass`**, the one being the pre-existing `QR: print or display`.
**37 new strings added, all generated from the record.** ⚠️ Every quoted fragment is the **provider's
own button label**, stripped by the §35 exclusion — that is the rule, not a loophole. **One caveat was
reworded before it passed**: GoDaddy's said *"more than one record at once"*, and `record` is a banned
word in **our** prose; the quoted `"Save All Records"` is theirs and stays.

---

## 7. WHAT REMAINS UNOBSERVED

1. 🔴 **NOBODY HAS FOLLOWED THESE STEPS ON A REAL DASHBOARD.** They are transcribed from each
   provider's current help page — **which is a better source than memory and still not an
   observation.** A help page can lag its own product. **The first operator through each provider is
   the test**, and that is why every provider ends with a link to their own guide.
2. ⚠️ **GoDaddy's page was not fetched directly** — 403/503 to automated requests. Its labels came
   through search of that article. **Weaker than the other three.**
3. ⚠️ **Cloudflare's `create-dns-records` page does not name the CNAME fields**; `Name` and `Target`
   came from their record-types reference. Two pages, one record.
4. 🔴 **The Cloudflare proxy caveat is the highest-value line here and is unverified in practice** —
   nobody has watched a proxied record fail to issue a certificate on our side.
5. ⚠️ **`recordLabels` is knowingly stale for GoDaddy and 123 Reg** and still feeds the email's row
   labels for providers without steps. §2.
6. ⚠️ **The five providers without steps are unchanged and unverified** — the same standing debt, now
   narrowed from nine to five.
7. **Nothing was rendered in a browser.** The screens above came from `react-dom/server`.
