# Order settings grouping — Manage → Settings (PRESENTATION ONLY)

**Date:** 30 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main`
**Status: ✅ BUILT.** `tsc --noEmit` clean.
**One file changed this pass: `app/manage/[token]/page.tsx`.**
**No migration. No column change. No save-path change. The `update_truck` allowlist was NOT edited.**

> This file replaces the previous report. That content is not preserved anywhere.

**Prompt integrity:** no span read as garbled or truncated.

---

## Answering item 2's conditional first

**The auto open/close settings ARE in this Settings tab** — `default_auto_open` and `default_auto_close`
rendered as two loose rows at `app/manage/[token]/page.tsx:7807-7827` (pre-change), immediately after the
payment rows. So nothing had to move between tabs; they were grouped in place.

---

## 1. THE SUB-CARD HEADINGS

| Group | Heading | Sub-label |
|---|---|---|
| `show_paid_step` + `takes_cash` | **Taking payment** | "When you take the money, and how it reaches you." |
| `default_auto_open` + `default_auto_close` | **Opening and closing** | "When your events start and stop taking online orders." |

**"Taking payment"** — your suggestion, adopted. It covers both members honestly: one is *when*, the
other is *how*, and neither is subordinate to the other.

**"Opening and closing"** — chosen over alternatives like "Online ordering window" because the two rows
already say "Open for orders automatically" / "Close for orders automatically"; a heading echoing that
vocabulary reads as a grouping rather than as a new concept.

Each sub-label exists because the Sounds card has one and the two would otherwise look like a different
species of panel.

## Both match the existing Sounds treatment exactly

```
outer:   pt-3 border-t border-slate-100
panel:   bg-slate-50 border border-slate-200 rounded-xl p-3 divide-y divide-slate-200/70
heading: pb-3  ·  text-sm font-bold text-slate-800  +  text-xs text-slate-500 mt-0.5
rows:    flex items-center justify-between gap-3 py-3
```

Copied from the Sounds panel at [:7734-7737](app/manage/[token]/page.tsx#L7734) and the auto-accept group
at [:7698](app/manage/[token]/page.tsx#L7698). There are now **four** panels using that class string —
auto-accept, Sounds, Taking payment, Opening and closing — so the tab reads as one language.

## ⚠️ Siblings inside a group, NOT nested — and recorded as such

Both payment rows are direct children of the panel with **identical** markup and indentation. Neither
carries a `pl-4` indent, neither is conditional on the other, and there is no `{showPaidStep && …}`
wrapper. The comment at the block states why, so the nesting is not reintroduced:

> They answer different questions — "WHEN do we take money" (`show_paid_step`, which the dashboard can
> override per event) and "HOW does it arrive" (`takes_cash`, truck-level, no override). The cash split
> was briefly rendered as a CHILD of the paid step; that implied a dependency which does not exist.

---

## 2. EVERY LINE CHANGED

One contiguous region replaced: **`app/manage/[token]/page.tsx:7776-7827` → 7776-7845**.

| Change | Nature |
|---|---|
| Wrapped the two payment rows in `pt-3 border-t` + `bg-slate-50 … divide-y` panel, with a heading block | presentation |
| Wrapped the two auto open/close rows the same way, with a heading block | presentation |
| Each row's class `flex items-center justify-between py-3 border-t border-slate-100` → `flex items-center justify-between gap-3 py-3` | presentation — the outer-card row divider is replaced by the panel's own `divide-y`, matching Sounds |
| Row markup re-indented by 4 spaces (now inside two more `<div>`s) | whitespace |
| Comment above the payment block extended to record the siblings-not-nested decision | comment |
| New comment above the auto open/close block | comment |

**No line of `<Toggle>` logic, no `on=` expression, no `onToggle` body, and no `saveSetting` call was
altered.**

## 3. CONFIRMATION: NO BEHAVIOUR OR SAVE PATH MOVED

**The four handlers, whitespace-normalised, before vs after:**

| Setting | Result |
|---|---|
| `default_auto_open` | **byte-identical** (indentation aside) ✅ |
| `default_auto_close` | **byte-identical** (indentation aside) ✅ |
| `show_paid_step` | unchanged from the previous pass ✅ |
| `takes_cash` | unchanged from the previous pass ✅ |

⚠️ **One thing that looks alarming in a naive diff and is not.** A `git diff` against `HEAD` reports
`show_paid_step` and `takes_cash` as *added* lines, with HEAD having zero. That is because those two
controls were created in the **previous** (uncommitted) pass and are not in `HEAD` yet — not because this
pass touched them. The same applies to the `update_truck` allowlist: its diff vs `HEAD`
(`…'setup_step', 'show_paid_step', 'takes_cash']`) is entirely the previous pass's addition.

**The allowlist did not need editing and was not edited this pass** — regrouping the rendered rows
changes no key name, so `update_truck`'s filter is unaffected. If a heading or a wrapper had *renamed* a
key, the save would have silently vanished; nothing here does.

**Everything you asked me to leave alone is untouched:** "Auto-accept orders" + "Review orders with
notes" (still their own group at [:7698](app/manage/[token]/page.tsx#L7698)), "Sounds"
([:7734](app/manage/[token]/page.tsx#L7734)), and "Email order notifications" (still a loose row at
[:7767](app/manage/[token]/page.tsx#L7767), deliberately not grouped).

---

## 4. What I could NOT verify

- 🔴 **Nothing was rendered.** No `next dev` per constraint. The two new panels, their spacing against
  the existing Sounds and auto-accept panels, and whether four stacked grey sub-panels in one card reads
  as organised or as busy are **all unobserved**. Grouping is a visual judgement and this is the one
  change where the code tells you least — **worth a look before you trust the layout.**
- **No toggle has been operated.** The handlers are proven textually identical, not exercised; I have not
  watched a value save and re-load through the regrouped markup.
- **The `divide-y divide-slate-200/70` divider behaviour with exactly three children** (heading + two
  rows) is assumed to match Sounds, which has four. Structurally the same, visually unconfirmed.
- **`tsc` proves the JSX is well-formed, not that it looks right** — as ever, necessary and not
  sufficient.
- **No `next build`.**
