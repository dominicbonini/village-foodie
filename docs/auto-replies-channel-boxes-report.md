# Auto-replies: three channel boxes

**16 September 2026.** One file changed, layout and styling only. No SQL, no migration, no API change.
tsc clean; lint rule-for-rule identical to HEAD.

---

## 🔴 STOPPED AT STEP 3a — A HARNESS FAILS, AND IT IS NOT THIS CHANGE

`scripts/whatsapp-connection-view-harness.cjs` reports **4 FAILED**. Step 3a says stop and report, so
this is the first thing in the report and **I have not touched the harness**.

```
  🔴 setup control offered: ready / no values
  🔴 setup control offered: ready / both values
  🔴 setup control offered: ready / number only
  🔴 setup control offered: ready / name only
```

**It is pre-existing at HEAD.** Proved by running the identical harness in a clean detached worktree at
`a05ecc9`, with none of my edits present:

```
$ git worktree add -q --detach <tmp> HEAD && cd <tmp> && node scripts/whatsapp-connection-view-harness.cjs
🔴 4 FAILED
```

**The cause, named:** the harness asserts, at `scripts/whatsapp-connection-view-harness.cjs:43`,

```js
      t(`setup control offered: ${state} / ${tag}`, v.showSetupControl === true)
```

…for **every** state. The previous workstream (`b149f47 whatsapp fixes`) deliberately made that false for
a working connection — `lib/whatsapp/connection-view.ts:98`, `showSetupControl: !ready || reconnect` —
because a green "Connected" pill replaces the button. **The assertion is stale; the code is doing what
was asked.** The four failures are exactly the four `ready` cases and nothing else.

🔴 **My omission, recorded plainly: the settings-row workstream changed that behaviour and did not rerun
this harness.** The settings-row report claimed its own harness green and never checked this one.

**The fix is one line** — that assertion should read `v.showSetupControl === (state !== 'ready')`, or the
case should move into the newer `whatsapp-settings-row-harness.cjs`, which already asserts both
directions correctly (`🔴 ready: NO Set up button` and `revoked + offerReauthorise: the control IS shown`).
**I have not applied it.** Changing a failing assertion to match current behaviour is exactly the move
that should need your say-so, and doing it inside a layout workstream would bury it.

The other two harnesses pass in full (§3a).

---

## 1. WHAT I READ BEFORE EDITING

### 0. Tree state

```
$ git status --porcelain=v1   (empty — clean)
$ git rev-parse HEAD          a05ecc98b2cfe3294d56473b37cfbbbd72ca8698
$ git rev-parse origin/main   a05ecc98b2cfe3294d56473b37cfbbbd72ca8698
```

⚠️ `a05ecc9 whatsapp token refresh` landed since my last session and I did not write it, so every read
below is fresh rather than carried over.

### 1a. How the Settings tab is built

| Element | Pattern | Example |
|---|---|---|
| **Section card** | `<Card className="p-4 space-y-3">` | Auto-replies `:9995`, Your schedule `:10393` |
| **Section heading** | `<p className="text-base font-bold text-slate-800">` | "Auto-replies" `:10018` |
| **Sub-heading** | `<p className="text-sm font-bold text-slate-700">` | "Channels" |
| **Box within a section** | 🔴 `<div className="rounded-xl border border-slate-200 p-3">` | `:1200`, `:1241`, `:5431` |
| **Box title** | `<p className="text-sm font-bold text-slate-800">` | `:1201`, `:5432` |
| **Helper text** | `<p className="text-xs text-slate-500 mt-0.5">` | `:1202` |
| **Info note** | `rounded-xl border border-slate-200 bg-slate-50 p-3` | existing, one site |
| **Pill** | `Badge` from `components/manage/primitives` | `Badge({label, colour})`, `rounded-full text-[10px] font-bold px-2 py-0.5` |
| **Divider** | `border-t border-slate-100 pt-4 mt-1` | above Channels |

🟢 **There IS a consistent box-within-a-section pattern** — three existing uses, quoted above — so I
reused it rather than proposing one.

### 1b. Shared components

`components/manage/primitives` exports `Card`, `Badge`, `Btn`, `Input`, `Spinner`, `EmptyState`. **`Badge`
is reused** for the two Coming soon pills. ⚠️ **`Card` is deliberately NOT nested**: it carries
`bg-white shadow-sm rounded-2xl` and is the *section* container; nesting it inside itself stacks two
shadows and two radii. The boxes use the flat `rounded-xl border` pattern instead, which is what the
three existing examples do.

### 1c. Themes

**None.** 🧪 `dark:` appears **0** times in the page, there is no `tailwind.config.*`, and
`prefers-color-scheme` appears **0** times in `app/globals.css`. *Positive control:* `bg-white` appears
**139** times in the same file, so the searches work. Light-only; no theme work needed.

### 1d. The order before this change

`border-t` divider → **"Channels"** sub-heading → **"Requires Business accounts on each platform."** →
**"Auto-replies answer up to 3 messages…"** → `<div className="space-y-3">` → one flat WhatsApp `<div>`
(label + status + facts + limit + billing, all in one `flex flex-wrap` row) → the disconnect confirm,
notice panel and expiring-soon banner → two bare Instagram/Messenger rows behind
`isRowComingSoon(MESSENGER_INSTAGRAM_ROW)`.

### 1e. Narrow widths

The tab uses Tailwind's `sm:` breakpoint (640px) — `sm:w-28` ×11, `sm:hidden` ×10, `sm:col-span-2` ×7 —
and relies heavily on `flex-wrap` + `min-w-0` rather than explicit media queries. The new boxes follow
that: `flex flex-wrap items-start justify-between` for the header and `min-w-0` on the select.

---

## 2. THE CHANGES

**2a.** The flat Channels block is now three boxes in the page's own box pattern, in order WhatsApp,
Instagram, Messenger, inside `<div className="space-y-3">`. The **"Channels" sub-heading is kept** —
`text-sm font-bold text-slate-700` is the page's sub-heading pattern and it is used that way here.

**2b.** The WhatsApp box, in the required order: header line (title left, status right) → helper text →
connected number and business name → the 3-message line → the monthly limit group → the billing note in
the page's info-note style. The disconnect confirmation, the success/error notice panel and the
expiring-soon banner all sit **inside** this box.

⚠️ **One ordering deviation, stated:** the Set up pop-up instruction is rendered by
`WhatsAppSetupControl`, which sits in the header's status group, so the instruction appears immediately
under the header rather than after the connected number. **In the state that matters this is identical**
— when nothing is connected there are no facts to come first. It differs only for
`onboarding_incomplete` / `revoked`, where facts and the instruction can both show. Splitting the
component to move the instruction would split its reducer state across two mounts, which is worse than
the ordering. Say the word and I will pass the instruction out as a prop instead.

**For the else branch** (no preview, including Gusto): title, helper text, and the same disabled input
with the same stored value. **Content unchanged; only the container and spacing moved.**

**2c.** Instagram and Messenger boxes with `Badge label="Coming soon" colour="slate"` and the two new
helper lines, verbatim.

**2d.** "Requires Business accounts on each platform." is **removed** — 🧪 0 occurrences (§3c).

**2e.** One-off styles aligned to the page: the Connected pill was a bespoke
`text-xs px-2 py-1 rounded-lg bg-emerald-50 …`; it is now the `Badge` shape
(`text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700`). The limit select lost its
`ml-2` in favour of a wrapping `flex gap-2`, and gained an `id`/`htmlFor` pair.

**2f.** Narrow widths: the header is `flex flex-wrap items-start justify-between gap-2`, so the status
group **wraps below the title** instead of squashing it; the select row is `flex flex-wrap` with
`min-w-0` on the select; the disabled input is `w-full min-w-0 truncate`.

**2g.** UK English; no new copy beyond 2b's helper line and 2c's two.

---

## 3. PROOFS

### 3a. The three harnesses

| Harness | Result |
|---|---|
| `scripts/whatsapp-settings-row-harness.cjs` | ✅ **all 75 passed** |
| `scripts/whatsapp-connection-view-harness.cjs` | 🔴 **4 FAILED** — pre-existing at HEAD, see the top of this report |
| `scripts/whatsapp-setup-machine-harness.cjs` | ✅ **all 30 passed** |

### 3b. No decision logic moved

Every visibility test in the new markup, and the field it reads:

| Condition in the markup | Source |
|---|---|
| `whatsAppSetupVisible && can('whatsapp_replies')` | existing predicates, unchanged |
| `view.showConnectedLabel` | `whatsAppRowView` |
| `view.showSetupControl` → `showButton` | `whatsAppRowView` |
| `view.showPopupInstruction` → `showInstruction` | `whatsAppRowView` |
| `view.showDisconnect` | `whatsAppRowView` |
| `view.facts.length > 0 \|\| view.showBareConnected` | `whatsAppRowView` |
| `view.showMonthlyLimit` | `whatsAppRowView` |
| `view.showAboveAllowanceNote` | `whatsAppRowView` |
| `whatsappUsage &&` | data presence, not a decision |
| `disconnectOpen` / `disconnectBusy` / `setupNotice` | existing component state |
| `whatsappConnection?.expiringSoon` | `WhatsAppConnectionView`, unchanged |
| `isRowComingSoon(MESSENGER_INSTAGRAM_ROW)` | ⚠️ **existing predicate, retained verbatim** |

⚠️ **`isRowComingSoon` is not one of the two predicates the brief named**, so I am flagging it rather
than letting it pass silently. It is the condition those two rows **already** carried; keeping it is what
makes this a no-behaviour-change edit. If that matrix row ever stops being `coming_soon`, both boxes
disappear exactly as the rows do today.

*What this proof would look like if it proved nothing:* listing the conditions I wrote and asserting they
look fine — circular. Ruled out by taking the list from the **file** (every `{…&&` and ternary in the
replaced region) and mapping each to a declared field of `WhatsAppRowView`, so a condition computed
inline would have no field to point at and would stand out in the table.

### 3c. Copy strings

| String | Count |
|---|---|
| `Requires a WhatsApp Business account.` | **2** — live branch `:10160` and else branch `:10258`, mutually exclusive; exactly one renders |
| `Auto-replies to Instagram direct messages. Will require an Instagram professional account.` | 1 |
| `Auto-replies to Facebook Messenger. Will require a Facebook Page.` | 1 |
| `Auto-replies answer up to {DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H} messages…` | 1 |
| `Auto-replies pause when you reach your limit.` | 1 |
| `Meta charges for WhatsApp replies, not HatchGrab.` | 1 |
| `Each reply HatchGrab sends for you is billed by Meta…` | 1 |
| `Above {formatLimit(META_FREE_REPLIES_PER_MONTH)}, Meta charges for each extra reply…` | 1 |
| `Disconnect WhatsApp?` | 1 |
| 🔴 `Requires Business accounts on each platform.` | **0** |
| `Monthly reply limit` | **2** — the `<label>` and a pre-existing **toast** at `:9383`; different roles |

Multi-line strings were matched against a whitespace-collapsed copy of the file. *Positive control:*
`See Meta` returns **1** in the same run, so a zero is a real absence and not a broken search.

### 3d. TypeScript and lint

- **tsc clean.**
- **Lint**, the one changed file, same eslint and config, HEAD in a detached worktree: **283 errors /
  75 warnings on both sides, every rule count identical.**

### 3e. What I cannot prove, and your visual checklist

**Cannot prove:** anything about appearance — that the boxes look right, that the pill sits where you
expect, that nothing overflows, that the spacing reads as three peers rather than one block with
stragglers. Tailwind classes are not a rendering.

| # | Who / width | Expect |
|---|---|---|
| 1 | **Test truck, connected — desktop** | Three boxes. WhatsApp: title left, green **Connected** pill + **Disconnect** right, helper text under the title, number and business name, the 3-message line, the limit select + usage + pause line, billing note in a grey box at the bottom. **No Set up button.** |
| 2 | **Test truck, connected — narrow** (Safari → Develop → Enter Responsive Design Mode, ~375px) | The pill and Disconnect **wrap onto their own line below "WhatsApp"** — the title must not be squashed or truncated. The select must not cause a horizontal scrollbar. |
| 3 | **Test truck, after Disconnect — desktop** | WhatsApp box shows title, helper text, **Set up** button, and the pop-up instruction. **No** limit select, **no** usage line, **no** Disconnect. The billing note **stays**. |
| 4 | **Test truck, after Disconnect — narrow** | Set up wraps below the title; the instruction reads as a full-width paragraph. |
| 5 | **Set the limit to 2,000** | The amber above-allowance note appears **inside** the limit group, not floating at box level. |
| 6 | **Gusto (else branch) — desktop** | WhatsApp box: title, helper text, the **disabled** number box showing `07380736226`. Nothing else. Instagram and Messenger boxes below with Coming soon pills. |
| 7 | **Gusto — narrow** | The disabled input is full width and truncates rather than overflowing. |
| 8 | **All three, both widths** | The three boxes have identical border, radius, padding and title styling; "Requires Business accounts on each platform." appears **nowhere**. |

---

## 4. FINISH

```
$ git status --porcelain=v1
 M app/manage/[token]/page.tsx

$ git diff --stat
 app/manage/[token]/page.tsx | 384 ++++++++++++++++++++------------------------
 1 file changed, 173 insertions(+), 211 deletions(-)
```

| File | Reason |
|---|---|
| `app/manage/[token]/page.tsx` | the flat Channels block becomes three boxes in the page's own box pattern; section-level helper line removed; the 3-message line moved into the WhatsApp box; pill and select aligned to the page's patterns; header wraps at narrow widths |

**Not changed:** every `lib/whatsapp/*` module, `lib/whatsapp-live.ts`, the manage API, the webhook, the
`!isNativeApp()` wrapper, and all approved copy wording. **No SQL appears in this report.**

🔴 **Outstanding for you:** the stale assertion at the top of this report. I have not touched it.
