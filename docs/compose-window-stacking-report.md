# The compose window painted behind the prospect modal

---

# 0. 🔴 THE HEADLINE — IT WAS NOT A STACKING CONTEXT

The brief's hypothesis was that an ancestor established a stacking context and trapped the window. **It
did not.** I measured the ancestor chain in a real browser with the real component: between the compose
window and `<body>` there is **nothing** — its parent *is* `<body>`, and neither `body` nor `html` creates
a context (all `position: static`, `z-index: auto`, `transform: none`, `filter: none`, `opacity: 1`,
`backdrop-filter: none`, `isolation: auto`, `will-change: auto`, `contain: none`).

🔴 **The cause was that `z-index: 85` was never applied at all.**

`z-[85]` is an **arbitrary Tailwind utility used by exactly ONE file in the repository** —
`components/admin/ComposeWindow.tsx`, created in the previous task and still untracked. Tailwind v4
generates `.z-\[85\]` only once its JIT has scanned that file. Until it had, the element resolved to
**`z-index: auto`** — and a `position: fixed` element with `auto` paints at the same level as `0`, i.e.
**underneath the modal's `z-50`**.

Everything *else* the window uses — `fixed`, `inset-0`, `flex`, `items-center`, `justify-center`, `p-4`,
`max-w-4xl`, `max-h-[calc(100vh-2rem)]` — is used by **pre-existing tracked files**, so those rules were
already in the stylesheet. **The window was therefore laid out correctly, full-viewport and centred, and
only mis-painted** — which is exactly what you described: rendering, laid out, buttons visible below the
modal, painting underneath.

This is the inertness lesson for the third time: **the property was present in the markup and the rule was
absent from the stylesheet.**

## 0.1 Why raising the number would have been the wrong lever — and would not have worked

`z-[9999]` is *another brand-new arbitrary value with the same dependency on a scan having happened*. It
would have been just as absent, resolved to `auto` just the same, and painted underneath just the same.
Your instruction not to raise the number was correct, and the diagnosis explains why.

---

# 1. `git status`, verbatim, before any edit

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/admin/page.tsx
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/OutreachPanel.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/api/admin/discovery-events/
	components/admin/ComposeWindow.tsx
	components/admin/ConfirmDeleteDialog.tsx
	components/admin/DiscoveryEventsPanel.tsx
	components/admin/EventRowCells.tsx
	components/admin/InlineField.tsx
	components/admin/ScheduleEventsPopup.tsx
	docs/discovery-events-delete-report.md
	docs/discovery-events-table-report.md
	docs/discovery-run-log-migration-report.md
	docs/outreach-compose-window-report.md
	docs/outreach-delete-guard-report.md
	docs/outreach-filter-ux-report.md
	docs/outreach-inline-edit-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-delete-report.md
	docs/outreach-media-report.md
	docs/outreach-modal-density-report.md
	docs/outreach-modal-flow-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-schedule-popup-report.md
	docs/outreach-table-report.md
	docs/outreach-templates-report.md
	docs/truck-name-matching-report.md
	lib/outreach-filter.ts
	lib/outreach-templates.ts
	lib/schedule-match.ts
```

`git add -A` / `git add .` were not run; nothing was staged. Nothing arrived garbled; no instruction
contradicted another.

---

# 2. DIAGNOSIS, IN THE ORDER ASKED

## 2.1 (a) Does the compose window actually reach `<body>` at runtime?

**Yes — and I did not take the portal call as proof.** A `createPortal(…, document.body)` in source only
proves intent; whether it ran is a runtime fact.

So I ran it. Because no DOM library is installed (`jsdom`, `happy-dom`, `linkedom`, `@testing-library` all
absent) and I may not install one, I loaded **React 19.2.3's own CJS builds** (`react`,
`react-jsx-runtime`, `scheduler`, `react-dom`, `react-dom/client`) into a headless Chrome page through a
small `require` shim, transpiled **the real `ComposeWindow.tsx` and `lib/outreach-templates.ts`** with the
repository's own TypeScript compiler, and mounted the real component inside a real prospect-modal
structure with the real compiled `globals.css`.

Measured:

```
composeParentIsBody : true
composeParentTag    : body
composeInsideModal  : false
```

**The portal runs and the node is a direct child of `<body>`.**

## 2.2 (b) Every ancestor between the compose window and `<body>`, and what each could do

There are exactly **two**, and neither creates a stacking context. Measured, not read:

| ancestor | position | z-index | transform | filter | opacity | backdrop-filter | isolation | will-change | contain |
|---|---|---|---|---|---|---|---|---|---|
| `body` | static | auto | none | none | 1 | none | auto | auto | none |
| `html` | static | auto | none | none | 1 | none | auto | auto | none |

I checked the non-obvious creators specifically, because they are the ones that bite: no `backdrop-blur`,
no `opacity` below 1, no `will-change`, no `contain`, no `isolation`. The `filter` hits an initial grep
found across `app/admin/page.tsx` and `OutreachPanel.tsx` were **JavaScript `.filter(` calls, not CSS** —
noted so the next reader does not chase them.

For completeness, the **modal's** chain was also walked, since if it sat in a context outranking 85 the
symptom would look identical: `html → body → CSPostHogProvider (no DOM) → div.min-h-screen.bg-slate-50 →
div.text-slate-900` (OutreachPanel's root) `→ div.fixed.inset-0.z-50`. **None of the intermediates is
positioned or carries any context-creating property.** `AppHeader` *is* `sticky z-50`, but the outreach
tab is its **sibling**, not its descendant — verified by offset comparison in the source.

## 2.3 (c) Which one was trapping it

🔴 **None.** There is no trap. The value simply was not applied. §3 proves this both ways.

---

# 3. 🔴 THE PROOF — REPRODUCED, THEN FIXED, IN A REAL BROWSER

"The z-index is now higher" is not evidence, and "it should work" is not either. So the mechanism was
demonstrated by **deleting one rule**.

I compiled the project's real `app/globals.css` from the project root (so Tailwind's automatic source
detection scanned the real repo) and produced two stylesheets, **identical except that one has the single
rule `.z-\[85\] { z-index: 85 }` removed** — simulating a stylesheet built before `ComposeWindow.tsx`
existed. Same component, same DOM, same page chrome (`AppHeader` `sticky z-50`, tab bar `sticky z-40`,
the `max-w-[1800px]` wrapper, the modal at `z-50`).

| stylesheet | component | computed `z-index` | `elementFromPoint` at the compose centre | verdict |
|---|---|---|---|---|
| fresh (rule present) | **before** fix | `85` | the compose window | correct |
| **stale (rule removed)** | **before** fix | **`auto`** | **`modal-grid`** | 🔴 **BUG REPRODUCED** |
| **stale (rule removed)** | **after** fix | **`85`** | the compose window | ✅ **FIXED** |
| fresh (rule present) | after fix | `85` | the compose window | ✅ unchanged |

In the reproduced-bug row the window still measured `position: fixed` with rect `top 0, bottom 900` —
**full-viewport, laid out, painting underneath.** That is your observation, reproduced from first
principles.

*Failure mode this rules out:* a fix that is really a coincidence. The only variable between the bug row
and the fixed row is the delivery of the z-index; the stylesheet is byte-identical.

---

# 4. THE FIX

Two lines, in two files. **The values are unchanged — 85 and 80.**

```diff
-    <div className="fixed inset-0 z-[85] bg-black/50 flex items-center justify-center p-4"
+    <div style={{ zIndex: 85 }}
+      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
```

**Why this specific change breaks the trap:** an inline style is not a stylesheet rule, so **no scan can
fail to emit it**. The dependency on Tailwind having noticed a new file is removed entirely, rather than
being made less likely. That is the mechanism the diagnosis identified — *"the rule may be absent"* — and
this is the only change that addresses it rather than gambling on a different arbitrary value.

The same hardening was applied to `ScheduleEventsPopup` **at its existing value of 80**, because it has the
identical latent fault: 🧪 `z-[80]` currently resolves **only because two unrelated pre-existing files
(`components/native/AppLockGate.tsx`, `components/dashboard/DemoWelcome.tsx`, both tracked and unmodified)
happen to use it**. That is luck, not design — if either stopped, the popup would silently drop to
`z-index: auto` and paint under the page in exactly the same way.

**`ConfirmDeleteDialog` (`z-[70]`) and the toast (`z-[60]`) were deliberately left as classes.** 🧪 Each
has 4 users, all pre-existing and tracked, so the rules are reliably in the stylesheet; changing them would
be churn without a mechanism behind it.

---

# 5. THE RESULTING LAYER ORDER

| layer | z-index | delivery | can the rule go missing? |
|---|---|---|---|
| prospect modal | **50** | `z-50` class | no — core Tailwind utility, always emitted |
| toast | **60** | `z-[60]` class | no — 4 users, all pre-existing |
| media-delete / event-delete dialog | **70** | `z-[70]` class | no — 4 users, all pre-existing |
| schedule popup | **80** | **inline style** | **no — not a stylesheet rule** |
| compose window | **85** | **inline style** | **no — not a stylesheet rule** |

## 5.1 Pairs that can be open at once

| pair | order | correct? |
|---|---|---|
| prospect modal + **compose window** | 50 < 85 | ✅ compose on top |
| prospect modal + media-delete dialog | 50 < 70 | ✅ dialog on top |
| Events tab + event-delete dialog | page < 70 | ✅ dialog on top |
| **schedule popup + event-delete dialog** | dialog is rendered **inside** the popup's subtree, so its `z-70` competes **within** the popup's own stacking context (the popup has a z-index, so it creates one) and paints above the popup's panel | ✅ dialog on top |
| **compose window + toast** | 85 > 60 | ⚠️ **the toast is hidden behind the compose window** — see below |

⚠️ **The toast consequence, stated rather than glossed.** The outreach toast is `fixed bottom-4 … z-[60]`
and is **not** portalled, so it paints under the compose window's full-viewport backdrop. Logging from the
compose window therefore produces a toast you will not see. **It is not silent feedback-free**, because the
compose window's own log button changes to **"Logged ✓"** and disables — that was built deliberately last
task. I have not moved the toast, because that is a behaviour change outside a rendering-fix brief; say the
word and it portals to `<body>` above 85.

---

# 6. ESCAPE ORDERING — CONFIRMED FROM SOURCE

Every `keydown` registration in the admin surfaces, read directly:

| layer | line | phase |
|---|---|---|
| prospect modal | `OutreachPanel.tsx:383` | `addEventListener('keydown', onKey)` — **bubble** |
| compose window | `ComposeWindow.tsx:62` | `addEventListener('keydown', onKey, true)` — **capture** |
| schedule popup | `ScheduleEventsPopup.tsx:98` | **capture** |
| confirm dialog | `ConfirmDeleteDialog.tsx:46` | **capture** |

**Compose window before prospect modal: ✅ correct, and unaffected by the fix.** Both listen on `window`,
so the capture phase at `window` runs before the bubble phase at `window` regardless of registration order,
and the compose handler calls `stopPropagation()` before the event can reach the modal's listener.

🔴 **The DOM position is irrelevant to this**, which is the important part of your question: because both
listeners are attached to `window` and not to their own nodes, moving the compose window between `<body>`
and the modal subtree would not change Escape ordering at all. The fix changed no listener and no DOM
position, so the ordering is exactly as it was.

## 6.1 ⚠️ A DEFECT FOUND WHILE CHECKING THIS — NOT INTRODUCED HERE, NOT FIXED HERE

**Schedule popup + event-delete dialog both register `capture: true` on `window`.** Two capture listeners
on the *same* target fire in **registration order**, and `stopPropagation()` does **not** stop other
listeners on the same node — that needs `stopImmediatePropagation()`. The popup mounts first, so on Escape
**both** handlers run: the dialog cancels *and the popup closes underneath it*. Escape should have closed
only the dialog.

This is pre-existing, from the delete-control task, and is **not** what you asked me to fix, so I have left
it. The one-line fix is `stopImmediatePropagation()` in `ConfirmDeleteDialog`, and it would need checking
against the media-delete pair, where the outer listener is bubble-phase and the current behaviour is
correct.

---

# 7. EVIDENCE CLASS

- ✅ **Measured in a real browser, with the real component:** the portal reaching `<body>`; the full
  ancestor chain and all seven context-creating properties; computed `position`/`z-index`; and
  `elementFromPoint` before and after the fix against both stylesheets. React 19.2.3's own CJS builds and
  the repository's own TypeScript compiler were used — not a transcription of the component.
- ✅ **Executed against the real stylesheet:** `app/globals.css` compiled from the project root with
  Tailwind 4.3.1's automatic source detection; the presence of `.z-\[85\]`, `.z-\[80\]`, `.z-\[70\]`,
  `.z-\[60\]`, `.fixed` confirmed by reading the emitted rules.
- ✅ **Structural, extracted from source:** the file-by-file census of which files use each z-value and
  which are tracked vs untracked; every `keydown` registration and its phase; the modal's ancestor chain.
- ✅ **Compiler-confirmed:** `tsc --noEmit` → **exit 0, 0 errors**. The whole diff is two lines in two
  files; no route, no write path, no template, no window content changed.
- 🔴 **NOT OBSERVED IN YOUR BROWSER, AND I SAY SO PLAINLY.** No admin session is obtainable here, so I have
  not seen the fix work in the running app. What I have is a reproduction of the fault and of its removal
  in a headless render of the real component — which is stronger than reasoning from source, and still not
  the same as you clicking the button. **A stacking fix reasoned from source is exactly the kind that looks
  right and paints wrong; this one was measured, but measured in a harness.**
- ⚠️ **One honest gap in the causal story.** I proved the *mechanism* (absent rule → `z-index: auto` →
  paints under `z-50`) and that it reproduces your symptom precisely. I could **not** inspect the CSS your
  dev server was actually serving at the moment you clicked, so I cannot prove that stylesheet lacked the
  rule — only that it is the one explanation consistent with every measurement, and that the fix makes the
  question moot.

## Two of my own errors, recorded

1. An early `grep` for `.z-\[85\]` reported **0 rules** and I nearly filed that as the finding — it was a
   shell-escaping mistake (the CSS contains a literal backslash). Re-checked with a fixed-string search:
   the rule was present in a fresh build.
2. A second grep enumerating z-index usage silently dropped **every bracketed value**, because `\b` cannot
   match between `]` and `"`. Both are the same class of fault as the bug itself — a check that reports
   green while proving nothing — and both were caught before acting on them.
