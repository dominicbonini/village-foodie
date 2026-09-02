# Manual correction report — two in-place corrections to §11

**File changed:** `docs/reference-manual.md` only. **+43 lines. One line removed.**
**Nothing else in the repository was touched. Nothing committed.**

---

## VERIFICATION

- **Executed:** a diff of the manual against a pre-task backup, plus a section-attribution script that
  maps every changed line to its owning `# ` heading. **That is execution of my check, not of the
  product.**
- **Not executed:** nothing was built, run, deployed or migrated. **The code facts cited in the new text
  are source reads**, carried over from `docs/offline-resilience-design-report.md`.
- **No typecheck is offered as verification of anything** — this is a documentation change.

**No span of the prompt arrived garbled. Neither correction required touching anything outside its
stated scope, so there was nothing to stop on.**

---

## Correction 1 — Stage B, corrected in place

### Which line, and how I identified it

⚠️ **Two lines in §11 could have been meant, and one of them was already right — so this needed
establishing rather than assuming.**

| Candidate | Verdict |
|---|---|
| **`### Stage B — Walk-up orders while offline (post-trial)`** + its bullet | 🔴 **This one.** A roadmap stage marked *post-trial*, i.e. pending. **The only line in §11 recording walk-up creation as not built.** |
| The *"Offline Phase 1 outbox (BUILT V8.7)"* block, ~14 lines below | ✅ **Already correct** — it says *"Wired: KDS + dashboard status actions + the walk-up CREATE (`AddOrderPanel`…)"*. **Left untouched.** |

🔴 **THE TWO SAT FOURTEEN LINES APART AND CONTRADICTED EACH OTHER.** One said walk-ups offline were a
future stage; the other said the create was wired. **That is the whole defect — the manual already held
the correct fact, and the stale line was still the one a reader met first**, because Stage B is under the
"Three-stage offline progression" heading where anyone scoping this work would look.

### What the line now says

**Corrected in place — the old heading was replaced, not annotated.** The original bullet is preserved
verbatim (it describes the design, which has not changed), and the correction is stated beneath it:

- ✅ **BUILT — the write path.** `AddOrderPanel` emits `gatedAction({ kind: 'create' })`;
  `lib/native/outbox.ts` accepts `'create'` as an `OutboxKind`; the device-prefixed provisional numbering
  exists (`provisional_id`, `deviceLetter()`, `nextSeq()`), durably stored one atomic key per op; replay
  is idempotent on the client-minted `order_key`.
- 🔴 **NOT BUILT — a cached MENU and STOCK snapshot to compose against.** `AddOrderPanel` builds from a
  live `/api/menu` fetch, so with the backend unreachable there is nothing to select from: **the order
  can be saved but not composed.** The local capacity/stock countdown depends on the same snapshot and is
  also absent.
- ⚠️ **The half that looks hardest — durable, conflict-aware, idempotent offline writes — is done. The
  half that is missing is a cached read.**

### The method lesson, recorded beside it

Added as a blockquote directly under the corrected bullets:

> ⚠️ **A MANUAL ENTRY DESCRIBING THE WORKING TREE IS NOT A STATEMENT ABOUT THE WORKING TREE LATER.**
> This line was accurate when written and went stale as the outbox was built around it.
> 🔴 **AND IT WENT STALE IN THE RARER DIRECTION: IT UNDERSTATED WHAT EXISTED.** An overstatement gets
> caught the moment someone relies on it and it is not there. **An understatement causes work to be
> COMMISSIONED TWICE** — it was nearly scoped as a fresh build in the offline-resilience design before a
> source read found `kind: 'create'` already wired. **Before scoping anything this manual calls "not
> built", grep for it.**

⚠️ **The "commissioned twice" claim is not hypothetical and I have named the actual instance** rather
than stating the risk abstractly — the design report's Stage-A/B plan was written on the assumption that
the create path needed building, and was corrected only when the source was read.

---

## Correction 2 — the read/write timeout asymmetry

**Added to §11 as its own entry**, immediately after the Phase-1 outbox block whose `orderGate` it
describes, before `## Trial scope (V6.6)`:

> `## 🔴 THE WRITE PATH HAS A TIMEOUT AND THE READ PATH HAD NONE — THE SHAPE OF THE 1 SEPTEMBER INCIDENT (V11.55)`
> — manual line **6770**.

**Marked OBSERVED by source read**, as instructed. It carries a two-column table:

| | Write path (`lib/native/orderGate.ts`) | Read path (`/api/dashboard` fetch) |
|---|---|---|
| Deadline | ✅ `AbortSignal.timeout(5_000)` — `LIVE_TIMEOUT_MS`, applied in `post()` | 🔴 **NONE.** A bare `fetch` with only a headers object |
| On failure | Durable queue (Preferences), one atomic key per op | Nothing — the request simply waited |
| Conflict | 409 → flagged, never overwritten | n/a |

and states the consequence: **the app could still durably save work it could no longer display.** A
tapped *Ready* hit the 5-second ceiling, threw, and queued; the board it was tapped on had no ceiling and
waited on a read whose median was 148 seconds. **The operator's actions were safe; the operator's view
was not.**

It also records that **the asymmetry is the finding, not the timeout value** — every offline mechanism
keys on reachability, and the write path could form an opinion because it had a deadline while the read
path could not, because nothing ever came back to have an opinion about.

### 🔴 One addition beyond the literal instruction, flagged rather than slipped in

You described the read path in the past tense — *"carried no timeout at all"* — which is correct for the
incident. **But I added a 10-second abort to that read path in batch 1 an hour ago, and it is
uncommitted.** Recording only the past tense would have left the manual asserting a present state that
my own working tree contradicts.

So the entry ends with:

> ⚠️ **STATUS AT TIME OF WRITING: a 10-second abort on the dashboard and KDS reads exists in the WORKING
> TREE ONLY — uncommitted and undeployed. Until it ships, the read path in production is the untimed one
> described above.**

**This is one sentence inside the entry you asked for, not a separate edit.** ⚠️ **It will itself go
stale the moment batch 1 ships** — which is precisely the failure Correction 1 records, so it is written
to name its own expiry condition rather than to state a fact that quietly rots.

---

## Scope — what I changed and what I did not

| Check | Result |
|---|---|
| Files modified by this task | **`docs/reference-manual.md` only** |
| Sections touched | 🔴 **`11. Native app and offline architecture` — and nothing else.** Confirmed by mapping every changed line to its owning heading |
| Lines removed | **Exactly one:** `### Stage B — Walk-up orders while offline (post-trial)` — the in-place correction |
| Line count | 21,606 → **21,649** (+43) |
| Numbered sections | **45 → 45** |
| Version line | **Unchanged at V11.55** |
| Committed | **Nothing** |

### Deliberate omissions, stated so they are decisions rather than oversights

1. **I did not bump the version or add a changelog entry.** You said *change nothing else*. **The manual's
   convention would normally version a correction of this kind** — say the word and I will add a V11.56
   block, but I was not going to widen the diff unasked.
2. **I did not touch the Changelog line at 3393**, which carries the original *"AGREED DESIGN (not built)
   … (2) offline ORDER CREATION"* text. **It is a dated changelog entry**, and the manual's convention
   preserves those as written. ⚠️ **It therefore still understates what is built** — but correcting a
   dated entry would rewrite history, and you scoped this to §11.
3. **I did not touch the Stage A line** — *"New orders cannot be created while offline"*. It defines
   Stage A's scope rather than asserting current state, and it is not the line you named.
4. **I did not touch the V11.55 §11 subsection** about the read side being NOT BUILT. **It is about the
   read side and remains accurate.**

---

## What I could not establish

1. **Whether `AddOrderPanel` genuinely fails with no menu available.** I read that it builds from a live
   `/api/menu` fetch; **I did not run it with the fetch failing.** The "can be saved but not composed"
   claim is a source read, and the new text says *builds from a live fetch* rather than asserting an
   observed failure.
2. **Whether the outbox actually queued anything on 1 September.** The 5-second write timeout says it
   should have. **Unverified** — device inspection of Preferences would settle it. The new entry states
   the mechanism, not that it fired.
3. **Whether any other line in the manual understates what is built.** **I checked §11 only, because that
   is what you scoped.** 🔴 **The class this correction records — a stale "not built" causing duplicate
   commissioning — is not swept**, and by the manual's own standing rule a documented-but-unswept class
   is a landmine with a label on it. **That sweep is not done and I am not claiming it is.**
