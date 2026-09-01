# The wizard in a modal, where ordering happens, and the missing credentials

**WHICH OF THE THREE I PERFORMED: A TYPECHECK AND ONE EXECUTION.** No standalone parse — `npx tsc
--noEmit` subsumes it and **exits 0**. One harness renders the **real** component: **15/15**. The
committed checker ran over 24 strings: **23/24 pass, 1 known violation**. Five further checks in §5 are
labelled **PARSE**.

🔴 **Nothing was deployed, no migration was written, and no credential value was added, invented,
committed or printed.** The redirect, the layout, provisioning, the guards, the plan gate and the
limiters were not opened. Pizzeria Gusto is untouched.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

**One file modified: `components/dashboard/CustomDomainSetup.tsx`**, plus a corpus line in
`scripts/check-plain-english.mjs`.

---

## 1. THE MODAL

### The pattern followed — named, as asked

**`fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4`** with a
**`bg-white rounded-2xl w-full max-w-md shadow-2xl`** panel. That is the shape `app/manage/[token]/page.tsx`
already uses a dozen times — the import wizard (`:5777`), the van modals (`:4384`, `:4456`), the
subcategory editor (`:4541`), the item editor (`:4598`). The backdrop closes on
`e.target === e.currentTarget`, the same test those modals use, and the panel calls `stopPropagation` so
a click inside never closes it. **Nothing new was introduced.**

**Why a modal:** expanded in place, the setup pushed the whole Settings tab down and an operator halfway
through the record step could scroll away from it into unrelated controls. **The steps are a sequence
with an order; the tab is a list of independent settings.**

### EXECUTION

```
  closed: overlay present? no ✅    card present? yes ✅
  open  : overlay present? yes ✅

  PASS  closed: no overlay in the DOM
  PASS  closed: the Settings card still renders with its heading and button
  PASS  🔴 open: the overlay renders
  PASS  …with the same panel shape the file already uses
  PASS  🔴 the Settings card BEHIND it is unchanged
  PASS  the step moved inside the overlay
```

⚠️ **`open &&` came OFF each step's own guard**, because the overlay already carries it. Two conditions
for one question is how a step ends up rendering in the wrong place.

### 🔴 CLOSING MID-SETUP — IT HOLDS, EXCEPT IN ONE CASE, AND I AM SAYING SO PLAINLY

**It holds on the normal path.** `domain_provision` writes `custom_domain` and
`custom_domain_setup_state` **before** the record screen is ever shown, so the progress is on the row,
not in component state. On reopen the button seeds `step = 'idle'` when a domain exists, and the resume
effect re-reads `domain_status` and moves to `'record'`:

```ts
  useEffect(() => {
    if (!open || !props.customDomain || step !== 'idle') return
    …
        const d = await call('domain_status')
        if (cancelled || !d.address || !d.cname_target) return
        …
        setStep('record')
```

🔴 **BUT IF THAT FETCH CANNOT SUPPLY A `cname_target`, THE EARLY RETURN LEAVES `step` AT `'idle'` — AND
NO STEP MATCHES `'idle'`, SO THE MODAL OPENS COMPLETELY EMPTY.** Proved by rendering it:

```
  reopened and the resume fetch gave nothing → panel content: []
  PASS  🔴 THE GAP: with step stuck at idle the modal renders EMPTY
  PASS  …and the early return that causes it is one line
```

⚠️ **THIS IS NOT HYPOTHETICAL — IT IS EXACTLY THE STATE §3 DESCRIBES.** `domain_status` derives
`cname_target` from `getDomainConfig`, which needs the Vercel credentials. **With none set, every
reopen of a part-finished setup shows an empty white box.** Before the modal it was an empty expanded
area, which at least left the card's own text visible; in a modal it is a blank panel with a backdrop.

**The behaviour is pre-existing and one line; I did not change it, because the brief scoped me to
presentation and told me to say so if it does not hold.** It does not, in that case.

---

## 2. WHERE ORDERING HAPPENS

On the **first screen**, above the confirmation, inside the box that explains the shape:

> **Your schedule sits at your own address. When a customer taps Order, we take them to HatchGrab to
> pay — that part stays with us, so card details are always handled on our side.**

🔴 **PLACED BEFORE THE COMMIT, NOT AFTER.** It is the single thing an operator is most likely to assume
otherwise, because everything else on that screen is about *their* address. An operator who learns it
after telling customers "order on our website" has been misled by our silence — so it sits where it can
still change their mind, not in a footnote on the record screen.

⚠️ **The clause about card details is doing work.** It turns a limitation into the reason for the
limitation, which is the honest framing: the payment provider's frame stays on an address we control.

**Rendered, verbatim, and proved to precede the confirmation line:**

```
  PASS  🔴 the ordering line renders, verbatim
  PASS  …on the FIRST screen, before the confirmation
```

**The committed checker:** `23/24 pass, 1 known violation` — the pre-existing `QR: print or display`
line, unchanged. The new string passes.

---

## 3. REPORT ONLY — THE CREDENTIALS

### Every variable the provisioning path needs, quoted

`lib/custom-domain/vercel.ts:29-34`:

```ts
function config() {
  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  const teamId = process.env.VERCEL_TEAM_ID
  return { token, projectId, teamId }
}
```

Read by `addDomain` (`:64`), `getDomainConfig` (`:92`) and `call` (`:40`); the daily check re-reads all
three independently at `app/api/cron/custom-domain-check/route.ts:204-206`.

| Variable | Required by | In `.env.local`? |
|---|---|---|
| `VERCEL_API_TOKEN` | every call — `call()` throws without it | 🔴 **NOT SET** |
| `VERCEL_PROJECT_ID` | `addDomain`, `getDomainConfig` | 🔴 **NOT SET** |
| `VERCEL_TEAM_ID` | optional — only appends `?teamId=` | 🔴 **NOT SET** |

⚠️ **Checked by name only. No value was read, printed or written**, and none is in this report.

### 🔴 WHAT THE OPERATOR CURRENTLY SEES — the actual string, traced end to end

```
lib/custom-domain/vercel.ts:66
    if (!projectId) return { ok: false, reason: 'not_configured', status: 0, message: 'VERCEL_PROJECT_ID is not set' }
          ↓
app/api/manage/route.ts:1108
    return NextResponse.json({ ok: false, reason: added.reason, message: added.message }, { status: 200 })
          ↓
components/dashboard/CustomDomainSetup.tsx:152
    if (!d.ok) { setError(d.message || 'That address could not be set up.'); return }
          ↓
    <p className="mt-3 text-sm text-red-600">{error}</p>
```

🔴 **THE OPERATOR SEES `VERCEL_PROJECT_ID is not set`, IN RED, ON THEIR SETTINGS SCREEN.**

⚠️ **AND THE TOKEN CASE IS WORSE.** With no `VERCEL_API_TOKEN`, `call()` **throws**
(`vercel.ts:42`), caught at `:78-79`, which returns `message: e.message` — so they see
**`VERCEL_API_TOKEN is not set`** the same way. **Both names leak, and one of them is the name of a
secret**, which tells anyone reading the screen exactly which credential to go looking for.

⚠️ **The fallback in the component never fires**, because `message` is always populated. The safe
default is there and unreachable.

### 🔴 WHAT SHOULD BE SHOWN INSTEAD — proposed, not built

**The distinction that matters: this is OUR failure, not theirs.** Nothing the operator typed caused it,
nothing they can type fixes it, and the current message invites them to try — or to send it to their web
person, who will be equally baffled.

Proposed wording, in the register the rest of this wizard uses:

> **We could not set that up just now. Nothing has changed at your end. This is a problem on our side —
> please try again shortly, and get in touch if it keeps happening.**

Three properties, each deliberate:
1. **"Nothing has changed at your end"** — stops them hunting at their domain provider for a change that
   was never made.
2. **"a problem on our side"** — names the owner without naming the cause. An operator does not need to
   know which variable; they need to know it is not theirs.
3. **"if it keeps happening"** — gives them a next step that is not "retry forever".

**Implementation shape, for whoever picks this up:** `reason: 'not_configured'` already distinguishes
this from `'taken'`, `'refused'` and `'error'` at the API boundary — **the client can branch on the
reason it already receives and never render `message` for that one.** The raw string stays useful in
`console.error` and the server log, which is where a variable name belongs. **I did not build it.**

---

## 4. VERIFICATION SUMMARY

```
  npx tsc --noEmit                                exit 0
  modal.cjs  (real component, rendered)           15/15 PASS
  scripts/check-plain-english.mjs                 23/24 pass, 1 known violation
```

⚠️ **One assertion in the harness was wrong and I corrected it rather than let it pass.** I first
asserted that reopening renders the record screen; it does not under server rendering, because that
screen is additionally gated on `rows`, which the resume **fetch** fills. Correcting it is what surfaced
the empty-modal gap in §1.

---

## 5. SCOPE PROOFS (PARSE)

**5.1 `provision()`, `runPreflight()`, the plan gate and the resume effect are IDENTICAL**, extracted
and compared against the pre-change file.

**5.2 Ignoring indentation, the component has SIX changed regions and 430 unchanged lines**, and every
region is accounted for: the overlay helper, the wrapper open, two `open &&` removals from step guards,
the ordering line, and the wrapper close. **The record screen's markup is inside the "unchanged"
430** — only its indentation and its guard changed.

**5.3 Nothing outside the component was opened.** By mtime, all predating this workstream:
`lib/custom-domain/apex.ts`, `app/api/manage/route.ts`, `lib/ratelimit.ts`, `lib/custom-domain/dns.ts`,
`lib/custom-domain/vercel.ts`, `app/trucks/[slug]/order/layout.tsx`.

**5.4 The redirect and the layout were not touched** — explicitly out of scope and confirmed by mtime.

**5.5 No credential was added or committed.** `.env.local` was read for variable **names** only.

---

## 6. WHAT REMAINS UNVERIFIED

1. 🔴 **NOTHING WAS RENDERED IN A BROWSER.** `renderToStaticMarkup` gives markup, not behaviour: **the
   backdrop click, the `stopPropagation`, the scroll inside `max-h-[85vh]` and the modal's appearance at
   any width are all UNOBSERVED.**
2. **The open state was forced by wrapping `useState`**, not by clicking the button.
3. 🔴 **THE RESUME PATH WAS NOT EXERCISED END TO END.** No `domain_status` call was made; §1's gap is
   proved by rendering the stuck state, and the *cause* is read from the effect's early return.
4. **§3's error string is traced through three files, not reproduced** — no provisioning attempt was
   made, because that needs the credentials this section is about.
5. **The proposed wording in §3 was not implemented and not checked** by the plain-English checker; it
   is a proposal, not shipped copy.
6. **`next build` was not run.** `tsc --noEmit` is a typecheck, not a build.
