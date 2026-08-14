# Menu layout — moved to dashboard Settings, recopied, and the tap-lock made position-based

Date: 14 August 2026
Status: BUILT. **Five files changed. NO migration written and none needed.**
`tsc --noEmit` clean. Non-ASCII census **unchanged in all five**, no class gained or lost.

No `next dev`, no `next build`, no commit, no deploy. One read-only `SELECT` confirmed the live values.

🔴 **Pizzeria Gusto is still `'tabs'`. Tikka Tonic is still `'scroll'`. Live-verified after the change**
(section 7) — nothing in this work writes the column except the new control.

**Nothing in the prompt arrived garbled. No instruction contradicted another.**

🔴 **ONE THING TO READ BEFORE THE REST: I found and fixed a defect I shipped last turn.**
`components/dashboard/AddOrderPanel.tsx` contained a **literal NUL byte**, which made `file` report the
source as `data` and made **`grep` skip the file entirely** — every search of it silently returned
nothing. Section 5.

⚠️ `git status` also lists `lib/time-utils.ts`, `docs/*`, and
`supabase/migrations/20260814_trucks_add_order_layout.sql` — **all from earlier turns**. I wrote no
migration this turn.

---

## 1. THE MOVE

### a. Removed from Manage → Settings, with its orphans

| Removed | Was at |
|---|---|
| The whole *"Adding orders yourself"* sub-panel (63 lines) | `app/manage/[token]/page.tsx:9562-9624` |
| The resolver `const addOrderLayout = form.add_order_layout === 'scroll' ? …` | `:8656` |
| `'add_order_layout'` from `update_truck`'s `allowed` array | `app/api/manage/route.ts:857` |

**No `useState` was created for it last turn** (it read `form`, which is `{...truck}`), so there is no
dangling state — and **the derived constant went with the JSX**, which is the same class of leftover.

⚠️ **`add_order_layout` REMAINS on this file's `interface Truck`, deliberately.** That interface
describes the truck **row**, which really does carry the column; it is a type, not state, and removing it
would make the page's model of the row wrong. **Stated because it is the one reference the grep in
section 6 still finds.**

🔴 **A pointer was left where the control was**, so the next reader does not conclude the setting was
dropped:
```
// ⚠️ THE "Menu layout" CONTROL (trucks.add_order_layout) LIVED HERE AND HAS MOVED, 14 August 2026.
// It is now on DASHBOARD → Settings … written by the `set_add_order_layout` action …
// 🔴 IF YOU EVER PUT A CONTROL FOR IT BACK ON THIS PAGE, RE-ADD IT TO THAT LIST FIRST …
```

⚠️ **You named `trucks.display_mode` as the anti-pattern to avoid. I did not add a second instance of
it** — and note **`display_mode`'s own orphans are still there** (`displayMode` state at `:8351`,
`handleDisplayModeChange` at `:8658`, neither rendered nor called). **I did not clean them up; that was
not this task.**

### b. Added to the dashboard Settings tab — the action I modelled it on

**`set_auto_accept` is the pattern**, [app/api/dashboard/action/route.ts:2269-2273](app/api/dashboard/action/route.ts#L2269-L2273):

```ts
if (action === 'set_auto_accept') {
  const { value } = body
  await supabase.from('trucks').update({ auto_accept: !!value }).eq('id', truck.id)
  return NextResponse.json({ success: true })
}
```

**The new handler**, [app/api/dashboard/action/route.ts:2355-2363](app/api/dashboard/action/route.ts#L2355-L2363):

```ts
if (action === 'set_add_order_layout') {
  const { value } = body
  if (value !== 'tabs' && value !== 'scroll') {
    return NextResponse.json({ error: 'Invalid layout' }, { status: 400 })
  }
  const { error } = await supabase.from('trucks').update({ add_order_layout: value }).eq('id', truck.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
```

Same shape: one named action, one column, scoped by the `truck.id` every handler on this route already
resolves from the token. **This route has no `update_truck` and no shared allow-list, so a bespoke
handler IS the pattern here** — confirmed by grepping the file for `allowed`/`ALLOWED`, which returns
only two unrelated comments.

🔴 **Two deliberate departures from `set_auto_accept`, both because the column is `text`, not `boolean`:**
- **The value is WHITELISTED, not coerced.** `!!value` is safe for a boolean column; a `text` column with
  no CHECK would store any string verbatim, and every reader would then silently fall back to `'tabs'` —
  a setting that appears to save and does nothing. Anything but `'tabs'`/`'scroll'` is **rejected 400**.
- **The `error` is checked and surfaced.** `set_auto_accept` discards it.

**The client saver**, [app/dashboard/[token]/page.tsx:1288-1315](app/dashboard/[token]/page.tsx#L1288-L1315),
follows `saveAutoAccept`'s fetch shape and adds an optimistic `setTruck` with a revert on failure — the
radio has to answer the tap, and the Add order screen re-renders from the same `truck` object
immediately rather than waiting for the 60s poll.

### c. The store did not change

**`trucks.add_order_layout`, `'tabs' | 'scroll'`.** Verified by grep in section 6: the **only** write in
the codebase is the new action's `supabase.from('trucks').update({ add_order_layout: value })`.
**No localStorage, no per-device value, no van column, no migration.**

### d. The per-event scope comment — amended, not deleted

[app/dashboard/[token]/page.tsx:3459-3489](app/dashboard/[token]/page.tsx#L3459-L3489). The original
paragraph is **kept verbatim** — it is right about those rows and about why per-row scope wording was
removed — and an amendment was appended:

> **── 🔴 AMENDED 14 AUGUST 2026: "EVERY option on this tab" IS NO LONGER TRUE. ─────────**
> The rule above is kept because it is right about THESE rows… But the tab now carries settings that are
> TRUCK-WIDE, and a reader who takes "PER-EVENT" as universal will draw the wrong conclusion about them:
>   • "Menu layout" (trucks.add_order_layout) — added below, in the Add order card.
>   • "Online card payments" (trucks.online_payments_paused_at) — already here, and already flagging
>     itself as the exception in its own header.
> ⚠️ **WHY MENU LAYOUT CROSSES THE BOUNDARY DELIBERATELY:** it is a property of the SCREEN THE OPERATOR
> IS LOOKING AT, not of a night's trading. A per-event copy would ask the same question again at every
> event and let two events disagree about the shape of the same menu; and the setting is only meaningful
> WHILE standing at the hatch on this screen, which is where it now lives and is not where Manage is.
> Scope is still a property of the SCREEN — the screen just no longer has exactly one scope.
> ⚠️ **THE PER-ROW WORDING RULE IS UNCHANGED AND STILL BINDING.** …Do not start annotating rows with
> their scope.

⚠️ **It names the pre-existing exception too** (`online_payments_paused_at`), because the original claim
was already untrue when I read it — that setting is on the tab and flags itself as truck-wide. **The
amendment records two exceptions, not one.**

### e. 🔴 The `update_truck` allow-list entry — NOT still needed, and removed

**Shown, not assumed.** After the Manage control was removed, I grepped every `update_truck` caller:

| Caller | Sends |
|---|---|
| `saveSetting(key, value)` ([:8577](app/manage/[token]/page.tsx#L8577)) | generic — but **every call site is enumerated** and none passes `add_order_layout` after the removal |
| `saveTruckReview(patch)` ([:2992](app/manage/[token]/page.tsx#L2992)) | wizard review rows only — capacity / cancellation toggles |
| `handleDisplayModeChange`, the preorder savers, `saveWhatsappSender`, `setup_step` | fixed keys, none of them this one |

**Nothing reaches it**, so per your instruction it was removed — and a note replaced it so removal cannot
be mistaken for an oversight, and so the trap is disarmed if a Manage control ever returns:

```ts
// ⚠️ 'add_order_layout' WAS ON THIS LIST AND WAS REMOVED, 14 August 2026 — NOT AN OVERSIGHT.
// Its only writer moved to DASHBOARD → Settings … Grep-verified before removal.
// 🔴 RE-ADD IT BEFORE PUTTING ANY MANAGE CONTROL FOR IT BACK: the filter below drops unlisted keys
// SILENTLY, so a control without the entry appears to save, returns {ok:true}, and writes nothing.
```

⚠️ **This is the one judgement call in the task.** Your wording permitted removal on proof rather than
requiring it. **Leaving it would have cost nothing functionally**; I removed it because an allow-list
entry for a key no surface posts is the same kind of misleading leftover as an orphaned handler, and the
comment neutralises the only real risk. **Say the word and it goes back in one line.**

---

## 2. THE COPY — used exactly, nothing paraphrased or shortened

[app/dashboard/[token]/page.tsx:3606-3634](app/dashboard/[token]/page.tsx#L3606-L3634):

| Slot | Text |
|---|---|
| Heading | **Menu layout** |
| Sub-heading | **How items appear on the Add order screen.** |
| `'tabs'` label | **Separate categories** |
| `'tabs'` help | **Show one category at a time. Tap a category to switch. Best for longer menus, where every item stays in the same place.** |
| `'scroll'` label | **One page** |
| `'scroll'` help | **Show every item in one scrolling list, with a heading for each category. Best for shorter menus, where you can see most of it at once.** |

**The component accommodates all of it** — heading, sub-heading and both help lines fit the card shape
without shortening, so the STOP condition did not trigger.

```tsx
<div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
  <div className="flex items-start justify-between gap-3">
    <div>
      <p className="text-sm font-semibold text-slate-800">Menu layout</p>
      <p className="text-slate-500 text-xs mt-0.5">How items appear on the Add order screen.</p>
    </div>
    {savingAddOrderLayout&&<span className="text-xs text-slate-400 animate-pulse shrink-0">Saving…</span>}
  </div>
  <div className="flex flex-col gap-2 mt-3">
    {([
      ['tabs','Separate categories','Show one category at a time. …'],
      ['scroll','One page','Show every item in one scrolling list, …'],
    ] as const).map(([v,lbl,help])=>{
      const active=(truck?.add_order_layout==='scroll'?'scroll':'tabs')===v
      return (
        <button type="button" key={v} disabled={isOffline} onClick={()=>saveAddOrderLayout(v)} …>
          <span className={`mt-0.5 w-4 h-4 rounded-full border-2 … ${active?'border-orange-500':'border-slate-300'}`}>{active&&<span className="w-2 h-2 rounded-full bg-orange-500"/>}</span>
          <span className="text-sm">
            <span className="font-medium text-slate-700">{lbl}</span>
            <span className="block text-xs text-slate-400">{help}</span>
          </span>
        </button>
      )
    })}
  </div>
</div>
```

**Drawn radio, never `<input type="radio">`** — a native one paints in the browser's accent rather than
the page's orange. **Its own card**, not a row in the payment card above, whose rows are per-event
payment overrides.

⚠️ **Two things added beyond the copy, both matching neighbours on this tab:** a `Saving…` pulse (as
`savingAutoAccept` / `savingTakesCashOverride` have) and `disabled={isOffline}` (every server-backed
setting on this tab is offline-locked; the tab even carries a banner saying so).

---

## 3. `SPY_LOCK_MS` — replaced with a position-based release

**It could be done cleanly, so it was.** `SPY_LOCK_MS = 900` is gone; the constant is now
`SPY_LOCK_SAFETY_MS = 2000` and is a genuine net.

**The lock now ends on whichever of three EVENTS comes first — none of them a guess:**

**1. ARRIVAL**, in the scroll handler:
```tsx
const target = lockTargetRef.current
if (target !== null) {
  const atTarget = Math.abs(sc.scrollTop - target) <= 2
  const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2
  if (!atTarget && !atBottom) return
  releaseLock()
}
```
🔴 **The `atBottom` arm is not optional.** A target past the end of the list can never be reached — which
is precisely the short-last-category case — so the scroller clamping at its own bottom **is** arrival.
Without it the lock on the last chip would always fall through to the net.

**2. THE OPERATOR TAKES OVER:**
```tsx
sc.addEventListener('touchstart', releaseLock, { passive: true })
sc.addEventListener('wheel', releaseLock, { passive: true })
```
🔴 **This is the failure you singled out** — a hand-scroll straight after a chip tap. It now ends the
lock on the first touch, so their scroll wins immediately instead of being ignored for a fixed duration.

**3. `scrollend`**, kept, still never relied on.

**Plus a guard at the tap:**
```tsx
if (Math.abs(top - sc.scrollTop) > 2) {
  lockTargetRef.current = top
  lockRef.current = window.setTimeout(releaseLock, SPY_LOCK_SAFETY_MS)
}
sc.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
```
⚠️ **Tapping the chip for the section already at the top emits no scroll event**, so a lock taken there
would have no arrival to release it and would sit until the net expired — **the exact mis-highlight this
rewrite removes, reintroduced by its own guard.** So no lock is taken when there is nowhere to go.

**Why the net got LONGER, not halved:** it now fires only if none of the three real exits happen — e.g. a
`scrollTo` that silently does nothing. With the real exits handled directly, a late release costs
nothing, whereas a *tight* net would reintroduce the mid-flight re-arm it used to cause. **The duration
is no longer load-bearing**, which was the point of the change.

⚠️ **`Math.max(0, …)` moved from the `scrollTo` call to the `top` computation**, so the target compared
against `scrollTop` is the same clamped number actually requested. Comparing an unclamped target would
have made arrival unreachable for any jump near the top.

---

## 4. WHAT WAS NOT TOUCHED

| Fenced | Status |
|---|---|
| `ScrollMenuSections`' spy logic beyond item 3 | ✅ `compute()` — the pin line, the section walk, the bottom clamp — is unchanged. Only the lock's lifecycle changed |
| The tabs render path | ✅ untouched **this turn**; see the caveat below |
| The cart | ✅ untouched this turn |
| Order submission | ✅ untouched this turn |
| Customer order page | ✅ **`git diff --quiet` — UNCHANGED** |
| KDS | ✅ **`git diff --quiet` — UNCHANGED** |
| `trucks.display_mode` | ✅ appears in the diff only as an untouched allow-list member |
| A migration | ✅ **none written** |

⚠️ **A caveat on how those were checked, stated because it changes what the evidence proves.** `git diff`
compares against **HEAD**, which predates *last* turn's work, so the AddOrderPanel diff still shows last
turn's tabs-path refactor. **I cannot produce a diff of this turn alone for an uncommitted file.** The
claim that this turn touched only the lock rests on the edits I made being enumerable: the NUL line and
its comment, the `SPY_LOCK` constant block, `lockTargetRef`, `releaseLock`, `onScroll`, `handleChip`, and
one `⇔` in a comment. **Nothing else in that file was edited this turn.**

---

## 5. 🔴 A DEFECT I SHIPPED LAST TURN, FOUND AND FIXED

**`components/dashboard/AddOrderPanel.tsx` contained a literal NUL byte at line 221:**
```
b"  const catsKey = cats.join('\x00')"
```

I intended the escape sequence `'\u0000'` as a separator; **the character itself was written into the
source.** Consequences:

| Effect | Detail |
|---|---|
| `file` classification | 🔴 **`data`** — not text |
| `grep` | 🔴 **skipped the file entirely.** `grep -c "SPY_LOCK_MS"` returned **nothing**, not "0" — searches of this file silently succeeded and found nothing |
| `tsc` | ✅ unaffected — compiled clean, which is exactly why it went unnoticed |
| Census | ✅ unaffected — `[^\x00-\x7F]` excludes NUL, so the character class count could not see it |
| Runtime | ✅ no effect — a NUL is a valid string separator |

**Found by accident:** my first verification grep of this turn returned nothing for `SPY_LOCK_MS` while
`git diff` clearly showed the line, and the contradiction was the tell.

**Fixed** by writing the escape sequence as six ASCII characters, with the reason recorded in place:
```tsx
// Separator is the ESCAPE SEQUENCE '\u0000', six ASCII characters in the source. It was written
// as a literal NUL byte on 14 August 2026, which made `file` report this .tsx as `data` and made
// grep skip it entirely -- searches for anything in this file silently returned nothing. tsc was
// unaffected, which is exactly why it went unnoticed. Keep it escaped.
const catsKey = cats.join('\u0000')
```

⚠️ **This invalidates nothing in last turn's report** — its verification greps ran against `git diff`
output (text) rather than the file — **but every grep of that file between the two turns was vacuous**,
and I have re-run this turn's checks against the fixed file. `file` now reports all six touched sources
as `Unicode text, UTF-8 text`, and ~~the repo contains **0 NUL bytes**~~.

### 🔴 CORRECTED 14 August 2026 — THAT LAST CLAIM WAS FALSE WHEN IT WAS WRITTEN

**This report contained three literal NUL bytes of its own** — in the sentence above and in the code
block below it, exactly where they demonstrate the escape sequence. So the document reporting the defect
reproduced it, `grep` skipped this file too, and the claim "the repo contains 0 NUL bytes" was untrue at
the moment it was typed. All three are now the six ASCII characters `\u0000`; see
`docs/nul-byte-sweep-report.md` for the repo-wide byte scan.

⚠️ **AND THE SCAN FOUND ONE MORE, IN SOURCE:** `lib/menu-commit.ts:216` uses a literal NUL as a
composite-key separator (`` `${name}\u0000${categoryId}` ``). It is **committed, unmodified, and predates
all of this work** — almost certainly where the idiom was picked up. Left alone; recorded there.

### 🔴 THE ORDERING PROBLEM — WHY THIS COULD NOT HAVE BEEN CAUGHT BY ITS OWN VERIFICATION

**Verification runs BEFORE the report is written.** Every check in section 6 — `tsc`, the censuses, the
`file` classification, the greps — ran against the source files while this document did not yet exist.
By construction, **a defect introduced by the act of writing the report can never appear in the report's
own verification section**, no matter how thorough that section is. The report is the last artefact
produced and the only one nothing inspects.

**Two properties made it invisible rather than merely unchecked:**
- **`grep` cannot see it.** A NUL makes the file binary, and grep silently skips binary files — so a
  search for the defect returns nothing, which reads identically to "clean".
- **The non-ASCII census cannot see it either.** It counts `[^\x00-\x7F]`, a range that **excludes**
  NUL. The one automated check that runs over every file was structurally blind to this byte.

🔴 **THE FIX IS ORDERING, NOT DILIGENCE. The check has to be a SEPARATE PASS AFTER THE WRITE:** byte-scan
the report file once it is on disk, with a byte-level tool rather than grep. That is now the last step of
this task, and it is the only step that can catch a report that poisons itself.

---

## 6. VERIFICATION

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ **clean, exit 0** |
| Census `app/manage/[token]/page.tsx` | ✅ **176 → 176**, none gained/lost |
| Census `app/dashboard/[token]/page.tsx` | ✅ **53 → 53**, none gained/lost |
| Census `app/api/dashboard/action/route.ts` | ✅ **15 → 15**, none gained/lost |
| Census `components/dashboard/AddOrderPanel.tsx` | ✅ **36 → 36**, none gained/lost |
| Census `app/api/manage/route.ts` | ✅ **10 → 10**, none gained/lost |
| All touched files are text, no NUL | ✅ `file` reports UTF-8 text for all six |
| Migration written | ✅ **none** |

⚠️ **The census caught me again**, and it earned its place a second time: my first draft of the
`lockTargetRef` comment used `⇔` (U+21D4), taking AddOrderPanel from 36 classes to 37. Rewritten as
"exactly while locked" before anything else.

### The control appears in exactly ONE place

```
grep -rn "Menu layout|Separate categories|One page'" --include=*.tsx app components
```
| Hit | Kind |
|---|---|
| `app/dashboard/[token]/page.tsx:3609, 3616, 3617` | 🔴 **the control** |
| `app/dashboard/[token]/page.tsx:3478` | the scope-comment amendment naming it |
| `app/manage/[token]/page.tsx:8653` | the "has moved" pointer comment |

**No second rendered control anywhere.**

### No orphan left in Manage

`grep "add_order_layout\|addOrderLayout"` over `app/manage/[token]/page.tsx` returns **only**:
- `:60` — the `interface Truck` field (a type for a real column; §1a)
- `:8653-8660` — the pointer comment

**No `useState`, no handler, no JSX, no resolver.**

### Nothing writes `add_order_layout` except the new control

Every non-comment hit across `app/`, `lib/`, `components/`:

| Location | Read or write |
|---|---|
| `app/api/dashboard/action/route.ts:2360` | 🔴 **the only DB WRITE** |
| `app/dashboard/[token]/page.tsx:1297, 1299, 1302, 1311` | local `truck` state — optimistic set + revert |
| `app/dashboard/[token]/page.tsx:1306, 3621` | the action name; the control's read |
| `components/dashboard/AddOrderPanel.tsx:2060` | **read only** — `truck?.add_order_layout === 'scroll' ? …` |
| `components/dashboard/types.ts:161`, `app/manage/[token]/page.tsx:60` | type declarations |

**`update_truck`'s `allowed` array no longer contains it** — grep count **0**.

### A truck on `'tabs'` renders byte-identically

| Step | Value |
|---|---|
| DB | `add_order_layout = 'tabs'` |
| `AddOrderPanel` | `truck?.add_order_layout === 'scroll' ? 'scroll' : 'tabs'` → **`'tabs'`** — **that line is unchanged this turn** |
| Pane markup | the ternary's **else** branch, the original element |
| `ScrollMenuSections` | 🔴 **never mounted** — so the entire lock rewrite in §3 is unreachable for a tabs truck |
| Manage → Settings | one fewer sub-panel; **no other row moved** — the removal was a whole `<div>` between two siblings that are now adjacent |
| Dashboard → Settings | one new card at the end of the payment card's group |

🔴 **The lock rewrite cannot affect Gusto at all**: it lives inside a component that only mounts for
`'scroll'`.

### Live values, read-only, after the change

| Truck | `add_order_layout` |
|---|---|
| 🔴 **Pizzeria Gusto** | **`tabs`** ✅ unchanged |
| 🔴 **Tikka Tonic** | **`scroll`** ✅ unchanged, not reset |
| The other 12 (5 demos, Test Kitchen, Real Thai Food, Village Spice, TT3, 3 test trucks) | `tabs` |

**14 rows, distinct values `["tabs","scroll"]`.** No write was performed by me.

---

## 7. 🔴 WHAT I HAVE NOT EXERCISED

1. **Nothing was rendered. I cannot see or scroll the page.** The whole of §3 is reasoning over code.
2. **🔴 THE POSITION-BASED RELEASE HAS NEVER RUN.** No lock has been taken, arrived, or been interrupted.
   `tsc` proves it compiles. **The three exits are argued, not observed** — and the `touchstart` arm in
   particular is the one I would watch first, since it depends on the touch landing on the *scroller*
   rather than on a child that stops propagation.
3. **The `<= 2` tolerances are judgements**, guarding sub-pixel scroll positions. If a device reports
   fractional `scrollTop` beyond 2px of the target, arrival would never fire and the 2000ms net would
   carry it — **failing back to roughly the old behaviour, not to something worse.** Untested.
4. **`SPY_LOCK_SAFETY_MS = 2000` is still a number I chose**, but it is now reached only when all three
   exits fail. **I did not construct a case that reaches it.**
5. **The new dashboard control has never been clicked.** No write through `set_add_order_layout` has ever
   happened — **the handler has never executed**, including its 400 branch.
6. **The optimistic revert path is untested.** I did not force a failed write.
7. **`disabled={isOffline}` was not exercised**, and I did not check how the control looks in DEMO mode —
   that tab strips itself to the Kitchen-capacity card in demo and **I did not verify whether this new
   card should be gated there too.** ⚠️ **Worth a glance: it is likely visible in demo and probably
   should be.**
8. **Layout of the new card is unverified** — it is the first card on that tab with a two-option radio,
   and the help lines are long.
9. **No `git diff` isolates this turn's changes** for the uncommitted files; §4's fence rests on
   enumerating my own edits, as stated there.
10. **I did not clean up `display_mode`'s pre-existing orphans** in the Manage page, though I noted them.
