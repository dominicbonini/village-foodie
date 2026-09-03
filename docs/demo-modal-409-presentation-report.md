# The demo modal's 409 — presentation, not copy

**GARBLED SPANS: none.**

One file changed: `components/DemoGetStarted.tsx`.
**Nothing committed, nothing deployed. No SQL, no migrations, no credentials.**
🟢 **The copy is untouched. The `Sign in` destination is untouched.** `/setup`, `/signup` and every
redirect are untouched — item 6.

---

## 1. What changed

A single discriminator was added inside the progress-list map (`:919`):

```ts
const recognised = row.key === 'account' && st === 'error' && existing
```

⚠️ **Scoped to the account row, not to `existing` alone.** `existing` is component-level state; keying
on it by itself would restyle whichever row happened to be in error. Today only the account row can be
— the 409 returns before the truck step — but that is a property of `runSetup`'s ordering, not of the
JSX, and this file should not depend on it.

⚠️ **`st === 'error'` stays in the test.** A recognised account is still a stopped chain and nothing may
proceed. This decides only how it *looks*, never whether it happened.

### Every failure signal, before and after

| Signal | Before | After |
|---|---|---|
| **Icon glyph** | `✕` | a circled **i** |
| **Icon colour** | `text-red-600` | `text-slate-500` |
| 🔴 **`aria-label`** | **`"failed"`** | **`"you already have an account"`** |
| **Row label colour** | `text-red-600 font-semibold` | `text-slate-900 font-semibold` |
| **Message colour** | `text-red-600` | `text-slate-600` |
| **`Sign in` link colour** | inherited **red** | `text-orange-600` (the modal's action colour) |

Six signals, all of which said "failure"; the screen-reader label said it most literally of all.

The row label stays **slate-900 semibold** rather than dropping to muted grey: this is still the row
that stopped, so it keeps its prominence. It simply stops being alarming.

The link moves to orange because inheriting red made the one useful control on screen look like part of
the warning. Orange is this file's action colour throughout (`bg-orange-600`, `accent-orange-600`,
`focus:ring-orange-400`), so it now reads as the next step — which is what it is.

### 🔴 The icon is an SVG, and that was not the first attempt

I first used the character **`ℹ` (U+2139)** with `className="text-slate-500"`. **It rendered as a blue
rounded emoji tile** — a coloured app-icon sitting beside two monochrome glyphs — because U+2139 has
*emoji presentation* by default and a colour emoji ignores CSS `color`.

⚠️ **`getComputedStyle` reported `slate-500` the whole time.** The class was right and the pixels were
blue. I only caught it by looking at the rendered screenshot. It is the same trap as measuring a box
instead of the ink, and it is recorded in the code comment so the character is not reinstated.

It is now an inline `<svg>` with `fill="currentColor"`, 14×14 to sit optically level with the 16px
`✓`/`✕` text glyphs. Genuinely monochrome, genuinely slate, and it will inherit any future colour change.

---

## 2. The second site — yes, it carried the same defect

**`:1103-1114` (the brief's `:1057`) had the same problem in a milder form, and the same fix is applied.**

| | |
|---|---|
| Did it carry a `✕`? | **No** |
| Did it carry `aria-label="failed"`? | **No** |
| Did it carry the failure colour? | 🔴 **Yes** — the whole block was `text-sm text-red-600`, **including the `Sign in` link**, so a recognised account read as a red warning with its one useful control camouflaged inside it |

Now: `text-slate-600` when `existing`, `text-red-600` otherwise; the link is explicitly `text-orange-600`.
**`existing` is the discriminator at both sites, so the two cannot drift.**

### ⚠️ But it is not currently reachable for the 409, and I am not going to imply I fixed a live bug

`inProgress` is derived at `:666` as:

```ts
const inProgress = stages.account !== 'pending'
```

The 409 sets `stages.account = 'error'`, so `inProgress` becomes **true** and the view switches to the
**progress list** (site 1). Site 2 renders only while `stages.account === 'pending'` — i.e. before
`runSetup` has ever run — and the step transitions clear `error` on the way in (`:1110`, `:1135`).

**So site 2's `existing` branch is defensive today.** I applied it because the brief asked and because
the styling was genuinely wrong, not because I observed it on screen. 🔴 **This is read from the state
machine, not executed** — unlike site 1, which I drove and photographed.

---

## 3. 🔴 Every other state with the same failure styling

Sweeping every `text-red`, `border-red`, `✕` and `stages.* = 'error'` in the file:

### Genuine failures — correctly styled, unchanged

| Site | Message | Genuine? |
|---|---|---|
| `:348` | `Couldn't save that — try again.` | ✅ the save failed |
| `:359` | `Couldn't reach us just now — try again.` | ✅ network |
| `:482` (non-409) | 403 signup gate / validation | ✅ |
| `:491` | `Couldn't reach us just now — try again.` | ✅ network |
| `:546` | `Your account's ready, but we couldn't create your truck.` | ✅ the truck was **not** created |
| `:552` | `…couldn't reach us to create your truck.` | ✅ same |
| Field errors — first/last name, truck, cuisine, phone, email, password, terms (`:806`–`:1050`) | red border + red hint | ✅ all real validation failures |

### 🔴 Two others are recognitions dressed as errors — named, NOT changed

**A. `:355` — a success rendered in red.**

```ts
if (data.emailSent === false) setError(data.warning ?? 'Saved — but we couldn’t email the link just now.')
```

This branch runs **only when `data.ok === true`** — the email address *was* saved. It is a
success-with-a-caveat, and it is pushed through the same `error` channel, surfacing at `:1134` as
`text-sm text-red-600`. **The word "Saved" appears in red text.** Same class of defect as the 409:
the sentence says one thing, the colour says another.

**B. `:560` — a completed step marked as failed, and this one is worse.**

```ts
if (!dashboardToken) {
  setStages(s => ({ ...s, truck: 'error' }))
  setError('Your truck is set up, but we couldn’t open it just now. Try again.')
}
```

`create_truck` returned **ok**. **The truck exists.** Yet the row "Setting up your truck" is flipped to
`'error'` and draws a red ✕ labelled `"failed"` — directly contradicting its own message, which says the
truck *is* set up. Only the hand-off failed.

⚠️ Both are left exactly as they are, as instructed. **B is the one I would fix next**: telling an
operator a step failed when it succeeded risks them retrying and creating a second truck, and the
idempotence guard (`api/setup/route.ts:79-84`) is the only thing standing between that and a duplicate.

---

## 4. Genuine errors still look like errors — verified, not assumed

I re-ran the same harness with `/api/signup` returning **500** (`existing` absent) instead of 409:

```json
{ "iconGlyph": "✕", "iconAria": "failed",
  "iconColour": "oklch(0.577 0.245 27.325)",     // red-600
  "rowLabel": "Creating your account",
  "rowLabelColour": "oklch(0.577 0.245 27.325)", // red-600
  "message": "Could not create the account.",
  "messageColour": "oklch(0.577 0.245 27.325)",  // red-600
  "link": null }
```

🟢 **Byte-for-byte the old behaviour: red ✕, `aria-label="failed"`, red label, red message, no link.**

### How the two are distinguishable

| | Recognition (409) | Genuine failure |
|---|---|---|
| Icon | circled **i** | **✕** |
| Icon colour | slate-500 | red-600 |
| `aria-label` | `you already have an account` | `failed` |
| Label colour | slate-900 | red-600 |
| Message colour | slate-600 | red-600 |
| Action link | **`Sign in`**, orange | none |

🟢 **The distinction is not flattened — it is sharper than before.** Previously both states rendered
*identically* and only the sentence differed. Now they differ on six signals plus the presence of an
action, and **the only way into the recognition treatment is `existing === true`**, which only
`/api/signup`'s 409 sets. Every other error path is untouched code.

---

## 5. What a person sees now, rendered

Verified by driving the **real component** — see the note below — and reading the screenshot.

> **Hang tight — setting everything up.**
>
> ⓘ  **Creating your account**
>   There's already an account with that email — sign in instead. <u>**Sign in**</u>
>
> ○  Setting up your truck
> ○  Loading your menu
>
> **[ Try again ]**

**At a glance:** a calm, monochrome list. A small grey circled **i** sits where the other rows show grey
rings — it belongs to the same family of marks, so nothing jumps out as broken. The row title is black
and bold, so the eye lands on it first: *this is the row that stopped*. Beneath it, a grey sentence in
ordinary body text explaining why, ending in the **one coloured thing in the block** — an orange
underlined **Sign in**. The two rows below stay pale grey and untouched.

**Nothing is red. Nothing is crossed out.** The only colour is the action, so the eye is pulled to what
to do next rather than to a warning. It reads as *"ah — I already have one"*, not *"something went
wrong"*. A screen reader now announces "you already have an account" where it used to say "failed".

⚠️ **One thing I did not change and you may want to:** the row label still reads **"Creating your
account"**, which is a slightly odd heading for a recognition. It is copy, and item 6 said not to touch
it.

### How this was verified — and what I did not do

The modal only mounts on a demo dashboard, which needs a real demo truck, and this dev server points at
a **hosted Supabase project**. So rather than provision one, I copied the source tree to a temp
directory, symlinked `node_modules`, ran `next dev --webpack -p 3200` against placeholder env, and added
a scratch route there that mounts the **real `components/DemoGetStarted`**. I then drove the whole
wizard — landing → truck → details — and stubbed `/api/signup` with the exact 409 body the server
sends.

🟢 **The component under test is the real one, and the repo never contained the scratch route.** The
temp tree and its server have been removed; `git status` shows one modified file.
🟢 **Nothing was written anywhere** — every API call in the harness was stubbed, no account was created,
no demo truck provisioned.

---

## 6. Constraints

| | |
|---|---|
| Copy changed | 🟢 **none** — the 409 sentence is byte-identical |
| `Sign in` destination | 🟢 **`/login`, unchanged** |
| `/setup`, `/signup`, any redirect | 🟢 untouched |
| Genuine error styling | 🟢 unchanged, verified at 500 |
| Other recognition-shaped states (§3) | 🟢 **named, not changed** |
| Files changed | `components/DemoGetStarted.tsx` only |

**Nothing committed. Nothing deployed.**

---

## Awaiting your decision

1. **`:560`** — "Your truck is set up, but we couldn't open it just now" draws a red ✕ over a step that
   **succeeded**. The riskiest of the three, because it invites a retry.
2. **`:355`** — "Saved — but we couldn't email the link just now" renders the word *Saved* in red.
3. **The row label** — "Creating your account" over a recognition. Copy, so untouched.
