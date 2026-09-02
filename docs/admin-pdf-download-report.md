# Downloading the plans-and-features PDF from Admin

**Built. Not deployed, not committed. No SQL, no migrations.**

**GARBLED SPANS: none.** No instruction contradicted another.

## 🔴 READ THIS FIRST — the one thing I could not verify

**I could not click the button as a signed-in admin.** Admin requires `operators.is_admin`, I have no
admin credentials, and creating one would need SQL, which is forbidden — and inventing one is not
something I will do. I made three attempts to render the component by stubbing the admin check in a
headless browser; **all three failed** (two hung the page, one crashed it with a client-side exception
caused by my own blanket API stub feeding the component wrong shapes). I stopped rather than keep
building a fake environment.

**So: the download button's success path is NOT verified at the UI level.** What that means concretely
is in §8, alongside everything that *was* measured — which is most of it, including the route, the gate,
the timing and the document itself. I would rather say this plainly than present a synthetic test as if
it were the real thing.

**What I did verify about the Admin page:** it still renders correctly for a real unauthenticated
visitor — *"Access denied"*, **zero client-side exceptions** — so the JSX change is sound at runtime,
not merely at compile time.

---

## 1. Where the control went

**In the `features` tab, above the table, outside the scrolling card.**

**What I found rather than assumed:** the plan matrix is not a standalone section — it is
`{adminTab === 'features' && (…)}` at `app/admin/page.tsx:844`, and the table sits directly inside
`<div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">` at `:845`. **There is no
heading above it** and no toolbar to hang a control on.

**Two placement decisions, both load-bearing:**

- **Above the table, in the `features` tab only.** This is the document form of the table immediately
  beneath it, so it belongs where the reader is already looking at that table. The other tabs are truck
  operations; a plans-and-features download has nothing to do with them, and a global toolbar button
  would be further from its subject, not closer.
- 🔴 **Outside the card, not inside it.** The card is `overflow-x-auto` because the matrix is wider than
  a phone. **A control placed inside would scroll sideways out of view with the table** — reachable only
  by swiping the table back to its start. It now sits in its own flex row above the card and stays put.

The row also carries a one-line explanation — *"The table below, as a PDF — generated fresh from the same
source each time."* — so the button says what it produces and that it is current.

---

## 2. 🔴 One generator, and Admin reaches it over HTTP

**Admin calls the existing route. It does not generate anything.**

```
fetch('/landing/features-pdf', { credentials: 'same-origin' })
```

**Confirmed there is exactly one generator** — `grep` for `page.pdf(` across `app/`, `lib/` and
`components/` returns **one file and one call**:

```
app/landing/features-pdf/route.ts:199    const pdf = await page.pdf({ … })
```

`buildHtml()` exists only in that file too. **Admin adds no second implementation of the table, the
styling, the price policy or the footnotes** — it adds a button that asks the route for the document.
Whatever the matrix says at the moment of the click is what arrives.

### 🔴 Why `fetch()` and not `<a href download>`

An anchor is simpler and wrong here, for three reasons:

1. **The route answers 404 when `verifyAdmin()` fails.** An anchor hands the browser that 404 body, and
   the browser either navigates away from Admin or **saves the JSON as a file** — a download that appears
   to succeed and is not a PDF. `fetch` lets the code check `res.ok` before writing anything to disk.
2. **Generation is not instant** (§4). An anchor offers no way to show progress.
3. **A disabled button cannot be pressed twice.** An anchor can.

There is also a `blob.size === 0` guard: a zero-byte body is not a PDF and is reported rather than saved.

---

## 3. The admin session, and what happens when it expires

**How the session travels:** `credentials: 'same-origin'` on the fetch. The route's gate is
`verifyAdmin()`, which reads the Supabase session cookie via `next/headers`; a same-origin fetch sends
that cookie automatically. **Without that option the request would be anonymous and would correctly
404** — so it is not decoration, and the code says so.

**Unauthenticated request still refused — measured, live, just now:**

```
GET http://…/landing/features-pdf   (no session)   →   HTTP 404
```

**404 rather than 403 remains deliberate:** it does not confirm the URL exists to someone guessing.

### 🔴 An expired session fails visibly — it cannot produce an empty or broken file

The handler checks `res.ok` **before** touching the blob. On a non-OK response nothing is written to
disk, no filename is chosen, and no anchor is clicked. The operator gets a toast, via Admin's existing
`showToast()`:

| Case | What the operator sees |
|---|---|
| **404** (expired session, or not an admin) | *"Could not generate the PDF — your admin session may have expired. Reload and sign in again."* |
| Any other non-OK (500, 502…) | *"Could not generate the PDF (500). Try again in a moment."* |
| Network failure / offline | *"Could not reach the server. Check your connection and try again."* |
| 200 but a zero-byte body | *"The PDF came back empty. Try again in a moment."* |

⚠️ **The route cannot distinguish "expired session" from "not an admin"** — both are `verifyAdmin()`
returning false, and it answers 404 for both by design. From the Admin page the overwhelmingly likely
cause is an expired session, so that is what the message names, while staying hedged ("may have").

In every failure path `finally { setPdfBusy(false) }` restores the button, so a failure never leaves it
stuck on "Generating PDF…".

---

## 4. What the operator sees while it generates — with measured timings

**MEASURED**, running the route's own `launchBrowser()` + `buildHtml()` + `page.pdf()`, three runs:

| Run | Chromium launch | Build + render HTML | Produce PDF | **Total** |
|---|---|---|---|---|
| 1 (cold) | 1,758 ms | 182 ms | 128 ms | **2,068 ms** |
| 2 (warm) | 519 ms | 79 ms | 116 ms | **714 ms** |
| 3 (warm) | 505 ms | 76 ms | 116 ms | **697 ms** |

**Launching Chromium is ~85% of the cost.** Building the document is fast.

⚠️ **These are LOCAL figures and the ceiling is higher in production.** On Vercel the route uses
`@sparticuz/chromium` in a serverless function, whose cold start is larger than a local Chrome launch and
which I **cannot measure from here**. The route carries `maxDuration = 60` for that reason. **Budget
several seconds, not one.**

**What the control shows:** the label changes to **"Generating PDF…"**, the button is `disabled`, and it
carries `aria-busy="true"` for screen readers. **The label changing is the point** — a spinner alone, or
an unchanged button, is what makes someone press again.

### 🔴 What a double press does: nothing

Two guards, deliberately belt-and-braces:

1. `disabled={pdfBusy}` — the browser will not dispatch a click on a disabled button at all.
2. `if (pdfBusy) return` as the first line of the handler — so a programmatic call, or any path that
   bypasses the attribute, is still a no-op.

**So a second press cannot start a second Chromium launch.** ⚠️ This is verified by reading the code, not
by clicking — see the limitation at the top and §8.

---

## 5. The filename

**`hatchgrab-plans-and-features-YYYY-MM-DD.pdf`** — e.g. `hatchgrab-plans-and-features-2026-09-02.pdf`.

🔴 **Defined in the route, in one place**, and Admin reads it back off the `Content-Disposition` header
rather than composing its own — the same one-definition rule as the document's contents. The client's
fallback exists only for an unreadable header and is deliberately the same shape.

**Why the date is in it, and why ISO order:**

- **Without a date**, a second download lands as `…features (1).pdf` and a folder of them cannot be told
  apart. The table changes whenever the matrix does, so *"which one is current?"* is a real question and
  the filename should answer it.
- **`YYYY-MM-DD` sorts correctly** in a file listing; `02-09-2026` does not.
- The same date is printed inside the document, under the title, so the file is self-describing even
  after someone renames it.

⚠️ **It is the generation date, not a version.** Two downloads on the same day collide by name even if
the matrix changed between them — acceptable, because the matrix does not change hourly, and the
alternative (a hash or a time) makes the name unreadable.

---

## 6. Should Admin choose the price mode at download time? — recommendation, not a decision

**RECOMMENDATION: no. Keep `'always-real'` fixed, and do not add a picker.**

**Why:**

- **The mask exists to protect unpublished prices from operators**, on surfaces an operator loads for
  themselves (Billing, FeatureGate). **This document has no such audience** — the route is admin-only, so
  the only person who can generate one already knows the prices.
- **Every admin download is a deliberate send.** A masked PDF does not do the job you described, which is
  why you changed the mode in the first place.
- 🔴 **A picker adds a decision to every download, and therefore a way to send the wrong document.**
  Two visually similar PDFs with the same filename, differing only in whether the prices are real, is a
  bad thing to have in an outbox. The failure is silent and lands with a customer.

**The honest case against my recommendation**, so you can weigh it: there is one real scenario a picker
would serve — sending a **features-only** sheet to someone before commercial terms are agreed. That is
`'omit'`, and it is genuinely a *different document*, not a masked version of this one. **If you want
that, the better shape is a second explicitly-labelled control** ("Download features only, no prices"),
not a mode dropdown on this one — the label then travels with the intent.

⚠️ Note that `'follow-flag'` specifically is now near-useless for this button: it would mean an admin's
download silently changes content the day an environment variable flips. **If a picker is ever added, the
choice should be between real and omitted — not "follow the flag".**

**Not decided. `PRICE_MODE` remains `'always-real'`, one word, in the route.**

---

## 7. Should anything else be downloadable this way? — reporting only, nothing built

**RECOMMENDATION: keep it a one-off for now.** The mechanism generalises easily; the maintenance does
not. Every new document is a new HTML template, a new price policy question and a new thing that goes
stale silently when its source moves.

**What I considered, and where each lands:**

| Candidate | Verdict |
|---|---|
| **The cost comparison** (`/landing/cost`) | The closest fit — same gate family, same shared constants, same "send it to an operator" use. ⚠️ But it is **interactive**: the whole page is an operator entering their own figures, and a PDF of it is either blank or somebody's specific numbers. It would need a "for these inputs" design first. **Not a straight port.** |
| **A per-truck plan summary** | Different data (a truck, not the matrix), different audience, and a different gate — it would carry one operator's details. A genuinely new piece of work, not this one repeated. |
| **The footnotes / small print alone** | ❌ No. They are meaningless apart from the table and **dangerous alone** — footnote 1 is the only place the walk-up card detail lives. |
| **The pricing cards** | ❌ Already inside this PDF's header and fee rows. A second document saying the same thing is the drift problem in another costume. |

**Nothing beyond the features PDF was built.**

---

## 8. MEASURED — and what was not

### Verified for real

| Check | Result |
|---|---|
| **Exactly one generator** | ✅ `page.pdf(` appears in **one file, once**: `app/landing/features-pdf/route.ts:199` |
| **Anonymous request refused** | ✅ live `GET /landing/features-pdf` → **HTTP 404** |
| **Generation time** | ✅ **2,068 ms cold / ~700 ms warm**, three runs (§4) |
| **The document is deterministic** | ✅ all three runs produced **exactly 165,236 bytes** — the same document every time |
| **Admin still renders** | ✅ real unauthenticated load shows "Access denied" with **zero client-side exceptions** |
| **Filename** | ✅ route emits `hatchgrab-plans-and-features-<date>.pdf` |
| **PDF contents** | ✅ opened both pages (in the previous task, unchanged since): 2 pages, A4, real prices, `Starter — Pay at Hatch`, header repeating on page 2, all five footnotes |

### 🔴 NOT verified — stated plainly

**Clicking the button as a signed-in admin.** Therefore **unverified by execution**: that the button
renders in the features tab as intended, that the busy label appears, that the double-press guard holds
in a browser, that the blob download fires, and that the saved file is byte-identical to the route's
output.

**All of that is verified by reading the code only, which is exactly what I am told not to treat as
verification.** The byte-identity claim is partly covered from the other end — the generator is
deterministic (165,236 bytes, three runs) and Admin copies the response body without touching it — but
**the browser leg is untested.**

**What would close it:** one signed-in admin clicking it once. If you open Admin → Features and press
**Download PDF**, you will know in about three seconds. **Please do that before this deploys** — and tell
me if the button does not appear, if the label does not change, or if the saved file is not a dated PDF.

---

## Files changed

```
app/admin/page.tsx                  +83 — pdfBusy state, downloadFeaturesPdf(), and the control row
                                    above the features table (no other tab touched)
app/landing/features-pdf/route.ts   Content-Disposition now carries the date; one definition of the name
```

**Untouched, per item 8:** the three protected strings, `lib/pricing.ts` (the price mask set),
`app/landing/layout.tsx` (the landing admin gate) and `lib/features.ts` (the feature gate) — confirmed by
`git diff`. `lib/plan-features.ts` shows a diff from the **earlier** case fix in the previous task, not
from this one.

**Nothing deployed. Nothing committed.**
