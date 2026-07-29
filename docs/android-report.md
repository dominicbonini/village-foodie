# Manual update — V9.3 · 2026-07-28

**TRANSIENT.** Overwritten every task. (Previous contents: the native-throw remediation implementation report.)

**DOCUMENTATION ONLY. No code changed.** One file edited: `docs/reference-manual.md` (4462 → **4508 lines**, +60/−6).
**Not run, per instruction:** gradle, builds, cap commands, dev servers, adb, installs, SQL. Nothing was run at all this task — no `tsc`, no lint, because no source changed.
**Read first, as instructed:** `docs/android.md` (1471 lines, structure + the V9.2 "Facts (verified, do not re-derive)" block + the new §6). The manual received the **distillation**, not a copy — §6 of `android.md` is ~118 lines; its manual footprint is ~10.

---

## ⚠️ FLAGGED — three garbled spans

Repaired in my reading only. Where a repair affected wording I actually wrote into the manual, I say so.

| # | Span as written | Read as | Effect |
|---|---|---|---|
| 1 | "ADD a VERIFICATION STATUS **bllainly** so nothing later reads as settled that isn't" | "a VERIFICATION STATUS **block, stated p**lainly so nothing later reads as settled that isn't" | I used *"Stated plainly so nothing later reads as settled that isn't"* as the block's lead-in — that phrase is yours, recovered. |
| 2 | "**outboxn** reconnect" | "**outbox drain o**n reconnect" | Written as **"Outbox drain on reconnect"** in the NEVER-RUN list. If you meant something narrower (e.g. outbox *replay* specifically), correct it. |
| 3 | "ignoring keepScreenOn;**hen** applies the pref" | "ignoring `keepScreenOn`; **`:253` t**hen applies the pref" | I supplied the line number `:253` from the file (the `[keepScreenOn]` effect). Verified by reading, not assumed. |

---

## Version used

**V9.3** — bumped from V9.2. Same calendar day (28 July 2026), which the manual already has precedent for (V9.2 itself is dated 28 July). A separate entry rather than an edit to V9.2 because this batch **withdraws a claim V9.2 made**, and folding a retraction into the entry that made it would erase the fact that it was ever believed.

Four version markers updated:

| Line | Was | Now |
|---|---|---|
| `1` | `HatchGrab Engineering Reference Manual · V9.2` | `… · V9.3` |
| `9` | `**Version 9.2**` | `**Version 9.3**` |
| `4463` | `# 36. Android app platform notes (V9.2)` | `# 36. Android app platform notes (V9.2, verification status V9.3)` |
| `4494` (footer) | `HatchGrab Engineering Reference Manual · V9.2` | `… · V9.3` |

§36's heading keeps `V9.2` for the section's origin and adds the V9.3 qualifier, so the section's provenance and the new block's date are both legible.

---

## Every section touched

### 1 · §35 — new invariant (`docs/reference-manual.md:4443-4447`)

Added at the **end** of §35, under its own dated lead-in:

> **The one below came from the 28 July native-throw remediation (V9.3).**

placed there deliberately: the existing V9.2 group is introduced at `:4427` with *"The seven below came from the July 2026 Android workstream (V9.2)"*, and inserting into that group would have made "seven" wrong. This keeps both counts accurate.

The invariant, as recorded — your text, plus the general form and the "what breaks if you harmonise them" consequence:

> **A catch that fails CLOSED and a database default that fails OPEN are both correct, and they are allowed to disagree.** … They point opposite ways because **they answer different questions**: the DB default is about **what the operator opted into** — absence there means "never configured" … The runtime catch is about **what we can PROVE at that moment** … **Do not "harmonise" them.** A future tidy that makes both fail the same way will break one of the two: fail-open everywhere fires unrequested alerts on any transient read failure; fail-closed everywhere silences every device that has never opened Settings. The general form: **a stored default encodes intent; a runtime fallback encodes certainty.**

**Both citations present as required:** `lib/native/notifications.ts:41-56` inline, and §16's subsection cited by name (*§16, Notification preferences*) — I verified that subsection exists at `:3155` (`## Notification preferences — device_notification_prefs (V9.2, APPLIED)`) and that its missing-row-reads-as-enabled convention is stated at `:3161`, so the cross-reference resolves.

⚠️ **No sweep status on this entry.** The standing rule at `:15` requires one for a *failure class*; this is a **design-rationale invariant** — it documents that two behaviours are correctly divergent, not a bug with victims to find. Flagging the judgement rather than inventing a sweep. If you'd rather it carried `SWEEP: CLOSED — 1 known pair`, say so.

### 2 · §36 — VERIFICATION STATUS block (`:4480-4507`)

New `## VERIFICATION STATUS (V9.3, 28 July 2026)` at the end of §36, with all five groups exactly as specified: **✅ VERIFIED ON DEVICE** (4 items) · **🔨 BUILT BUT NOT EXERCISED** (2) · **🚫 NEVER RUN ON ANY DEVICE, EITHER PLATFORM** (5) · **⚠️ CANNOT BE VERIFIED ON THE PHYSICAL TAB** · **⚠️ NOT REPRESENTATIVE**.

Lead-in added to make the block's purpose explicit:

> The distinction that matters is between *built*, *reasoned*, and *observed*. Most of the Android work is the first two. Anything not listed under VERIFIED has **not been seen working**, however confident the code comments sound.

**One deletion, flagged.** §36 already ended with a *"Verification asymmetry, worth knowing before trusting a device result"* paragraph (V9.2) saying the same two things as the block's last two bullets — the Tab masking the inset bug, and OEM background-killing. I **folded it into the block and removed the standalone paragraph**, rather than leaving §36 stating it twice. No content lost; the block is strictly more specific (it names the Lenovo/Android 14 device). The block's lead-in records the supersession in-line so the change is self-documenting:

> (This supersedes the standalone verification-asymmetry paragraph that stood here in V9.2 — same content, folded in below so §36 states it once.)

Two small factual additions I made from files already in the repo, not from your text: the Tab identified as **Lenovo, Android 14** (from `docs/android.md:1314`), and the FCM token line kept to your exact figures (142 chars, `platform='android'`), which match `docs/android.md`'s verified-facts block.

### 3 · §27 — two backlog items (`docs/reference-manual.md`, end of `## Android / native (V9.2)`)

Appended after the `DemoGetStarted` item. Both written in the section's established style (bold lede, mechanism, then the consequence).

**Item 1 — status-bar patch drift.** Records 8.0.2 installed / 8.0.3 latest, the `^8.0.2` range meaning a fresh `npm install` takes it **silently**, and why that file specifically matters (three verified no-ops + the unresolved null-window question, with `StatusBar.java:42`, `:102` cited). Marks the changelog question **UNDETERMINED** with the reason — no changelog in `node_modules`. Added one contrast not in your text: **`keep-awake` is already on latest (8.0.1)**, so nobody re-checks it.

**Item 2 — the KDS unconditional acquire.** Records `:245` acquiring regardless of `keepScreenOn`, `:253` then applying the pref, the acquire-then-release on mount with the pref OFF, and names it as **lying-toggle family** — citing `lib/native/keepAwake.ts:8-13`, the comment block that exists specifically to publish actual rather than intended state. Added the one-line fix direction (gate `:245` on the pref, as the dashboard already does).

### 4 · Changelog — `## V9.3 — 28 July 2026` (`:19-31`)

Written in the existing style: a **Delta over V9.2** paragraph naming the theme, then bolded-lede bullets, ending with a **Status:** sentence. Theme recorded as *"a finding that survived contact with its own evidence, and a mechanism that did not"* — the invariant strengthened, the severity ratings withdrawn.

Five bullets: the new §35 invariant · the native-throw entry's correction (with `Bridge.java:114` `private final` and the `configChanges` list as the evidence, both unknowns still flagged, and the deliberate non-building of `guardedInvoke`) · the sweep recount (**sixteen**, 1/15, 12/4) · **the real fix was a deletion** (the `allowSleep()` cleanup, with the intended navigation delta) · and §16's closed `POST_NOTIFICATIONS` question.

**Status line kept honest and unchanged in substance:** no Android build shipped, no store listing, and the full order-flow click-through still unrun on either platform since V6.3.

---

## What I did NOT do

- **No code changed.** `git status` shows modifications to `app/`, `lib/` and `components/` files — those are the **two prior tasks** (native-throw remediation; the over-capacity build), not this one. This task's only edit is `docs/reference-manual.md`.
- **`docs/android.md` was read, not written.** It already carries §6 from the previous task; nothing needed adding, and the instruction was to read it first, not update it.
- **No sweep performed** for the new §35 invariant — see the flag in §1 above.
- **Nothing executed.** No `tsc` (no source changed, so it would be a no-op against this task), no lint, none of the prohibited commands.

## What I could not verify

1. **Rendered output.** I verified the text I inserted and the section boundaries by line number (`# Changelog` `:17`, `## V9.3` `:19`, `# 16.` `:2821`, `# 27.` `:3621`, `# 35.` `:4409`, `# 36.` `:4463`, `## VERIFICATION STATUS` `:4480`, footer `:4494`), but I did not render the 4,508-line document to see how the new blocks sit visually.
2. **The four VERIFIED-ON-DEVICE claims are yours, recorded as given.** I did not re-verify them — no device, and doing so would need the prohibited commands. They are consistent with `docs/android.md`'s verified-facts block (the 142-char token, `platform='android'`), which is the only corroboration available offline.
3. **The `^8.0.2` → 8.0.3 claim** rests on the `npm view` output from the previous task, not re-run here.
4. **Whether "outbox drain on reconnect" is the phrase you wanted** (garble 2) — flagged above rather than guessed silently.
