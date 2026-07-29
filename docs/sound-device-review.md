# Sound settings → per-device, with seed-on-first-load — BUILD REPORT

**Date:** 30 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main`
**Status: ✅ PARTS 2 AND 3 BUILT. PART 1 NEEDED NO WORK — and that is a correction to my own earlier review.**
`tsc --noEmit` clean; **11/11** seed cases pass, plus 18/18 ledger and 11/11 paid-step regressions.
**No migration needed or written. `next dev` / `next build` NOT run.**
**Files changed:** `lib/sound-prefs.ts` *(new)*, `app/dashboard/[token]/page.tsx`,
`app/dashboard/[token]/kds/page.tsx`, `app/manage/[token]/page.tsx`.

> This file replaces the previous diagnosis. That content is not preserved anywhere.

**Prompt integrity:** no span read as garbled or truncated.

---

## 🔴 PART 1 — MY EARLIER REVIEW WAS WRONG. SOUND IS ALREADY REACHABLE EVERYWHERE.

The brief's premise — *"a phone operator on the KDS cannot reach sound at all"* — came from my Q6
finding, and **that finding was wrong on two counts**:

1. **I attributed `hidden sm:flex` to "both header toggles".** It applies to the **dashboard** header only
   ([page.tsx:1992](app/dashboard/[token]/page.tsx#L1992) sound, [:2007](app/dashboard/[token]/page.tsx#L2007)
   screen). **The KDS has its own sound button with no responsive gate at all**
   ([kds/page.tsx:809-817](app/dashboard/[token]/kds/page.tsx#L809)) — I walked every ancestor up to the
   page root and the only match was `overflow-hidden` on the layout wrapper, which is not a display gate.
2. **I read "the KDS never passes `onToggleSound`" as a gap.** The KDS does not render `UserMenu` at all —
   it has a direct header button instead. The missing prop is *correct*, not a defect.

### The reachability matrix — measured from the actual class strings

| Surface | Phone (<640px) | Desktop / tablet (≥640px) | Mechanism |
|---|---|---|---|
| **Dashboard** | ✅ | ✅ | `sm:hidden` row in UserMenu ([UserMenu.tsx:139](components/dashboard/UserMenu.tsx#L139)) **+** `hidden sm:flex` header button ([page.tsx:1992](app/dashboard/[token]/page.tsx#L1992)) — a **complementary pair**, exact coverage, no gap and no overlap |
| **KDS** | ✅ | ✅ | one header button, **no responsive gate** ([kds/page.tsx:812](app/dashboard/[token]/kds/page.tsx#L812)) |

The UserMenu trigger itself is ungated, and its wrapper is `sm:hidden` **only in demo mode**
([page.tsx:2024](app/dashboard/[token]/page.tsx#L2024)); for a live operator it is always present.
The UserMenu sound row requires `showScreenToggle && onToggleSound` — the dashboard passes both
([:2030](app/dashboard/[token]/page.tsx#L2030), [:2038](app/dashboard/[token]/page.tsx#L2038)).

**All four cells pass, so there is no STOP and part 2 was safe to proceed to.**

⚠️ **I changed nothing for part 1.** Wiring `onToggleSound` into the KDS would have added a second,
redundant control beside a working one — changing UI on a false premise, which is exactly what the V9.5
standing rule forbids. **If you still want the KDS control inside a dropdown rather than in the header,
say so and I'll do it as a deliberate design change, not as a fix.**

---

## PART 2 — SEED-ON-FIRST-LOAD

### The key shape

```
hg_soundcfg_${token}
```

Following `hg_keepawake_${token}` — per-token, so two trucks on one iPad cannot collide.

**ONE key per device, shared by the dashboard and the KDS.** "Which sounds fire" is one concept in one
place, per the V9.0 decision. ⚠️ The **master mute** keys are unchanged and stay **per-surface**
(`hg_sound_${token}`, `hg_kds_sound_${token}`) — muting is physical to the screen you are standing at,
which is a different question from policy. I did not merge them.

### `lib/sound-prefs.ts` — one module, four functions

| Function | Role |
|---|---|
| `readSoundConfig(token)` | stored config, or `null` if never seeded |
| `writeSoundConfig(token, cfg)` | persists; **returns `false` and logs on failure** |
| `seedSoundConfig(token, truckCfg)` | seeds once from the column and persists |
| `effectiveSoundConfig(stored, truckCfg)` | `stored ?? truckCfg ?? DEFAULT` — one resolution point |

### The seed rule, and why it waits

Both surfaces run the identical effect
([page.tsx:308-315](app/dashboard/[token]/page.tsx#L308), [kds/page.tsx:248-255](app/dashboard/[token]/kds/page.tsx#L248)):

```ts
if (storedSoundCfg !== null) return
if (truck?.sound_config === undefined) return   // payload not in yet — wait, do NOT default
setStoredSoundCfg(seedSoundConfig(token, truck.sound_config))
```

🔴 **That second guard is the whole requirement.** `truck` arrives asynchronously from `/api/dashboard`,
so there is a window where no column value is known. Seeding from `DEFAULT_SOUND_CONFIG` in that window
is precisely the silent reset this pass exists to prevent. And `effectiveSoundConfig` falls back to the
**truck value** — not the default — during it, so even the pre-seed frames use Gusto's real settings.

State is read via a **lazy `useState` initializer, SSR-guarded** — not a `useEffect` — per the
`keep_screen_on` lesson at [reference-manual.md:156](docs/reference-manual.md#L156). For a banner a
`useEffect` costs a one-frame flash; for sound the equivalent artefact would be **audible**.

### ⚠️ The write failure is surfaced, not swallowed

`keep_screen_on` wrapped this exact write in `try{…}catch{}`, which is why "I turned it off and it came
back" was possible. Here:

- `writeSoundConfig` **returns a boolean** and `console.error`s with the key name and the consequence
  ([sound-prefs.ts:74](lib/sound-prefs.ts#L74)).
- `seedSoundConfig` logs a **distinct** message naming the specific failure mode — "it will re-seed on
  every load until the write succeeds" ([:94](lib/sound-prefs.ts#L94)).
- A failed *read* also logs ([:57](lib/sound-prefs.ts#L57)).
- **And the operator is told**: the dashboard raises a toast
  ([page.tsx:1086](app/dashboard/[token]/page.tsx#L1086)) — *"Sound saved for now, but this device could
  not store it — it will reset on reload"*. The setting still applies for the session; what the toast
  conveys is that it will not survive, which is the fact the silent catch hid.

### 🔴 Proof by reading + harness that Gusto's exact config survives

The harness uses **Gusto's literal column value**, `JSON.parse('{"order_due":true,"new_orders":"all"}')`:

```
PASS  1  key shape follows hg_keepawake_${token}            → "hg_soundcfg_gusto-token"
PASS  2  fresh device has NOTHING stored                    → null
PASS  3  pre-seed window uses the TRUCK value, not default  → {"new_orders":"all","order_due":true}
PASS  4  🔴 SEED = Gusto's exact config                     → {"new_orders":"all","order_due":true}
PASS  5  and it PERSISTED to localStorage                   → {"new_orders":"all","order_due":true}
PASS  6  raw stored JSON round-trips 1:1 with the column    → {"new_orders":"all","order_due":true}
PASS  7  after seeding, the store beats a changed column    → {"new_orders":"all","order_due":true}
PASS  8  device diverges without touching the truck value   → {"new_orders":"all","order_due":false}
PASS  9  a SECOND fresh device still seeds Gusto's config    → {"new_orders":"all","order_due":true}
PASS 10  truck value MISSING → default (only then)          → {"new_orders":"needs_confirming",...}
PASS 11  unusable stored value → treated as absent, re-seeds → null
```

**Shape maps 1:1** (case 6): the column is `{new_orders, order_due}` and localStorage holds the same two
keys with the same types — no transformation, no renaming. Key order differs in the raw JSON (the column
reads `order_due` first) but that is immaterial to `JSON.parse`.

Case 11 matters for a different reason: a hand-edited or legacy stored value is **coerced or discarded**,
so a malformed entry re-seeds rather than silently disabling sound.

### One thing the brief did not specify, and how I resolved it

The **dashboard's own Sounds panel** previously wrote `trucks.sound_config`. If it kept doing that, the
per-device config would be **unchangeable** — the exact "stranded" failure part 1 was about. So
`saveSoundConfig` now writes **localStorage only** ([page.tsx:1080-1087](app/dashboard/[token]/page.tsx#L1080)),
with no network call and therefore no optimistic/revert dance.

⚠️ **Consequence: `set_sound_config` is now unused.** It is **retained** as part 3 instructs, but it is
dead code until the retirement pass. Flagging rather than quietly deleting it.

---

## PART 3 — `trucks.sound_config` RETAINED

Verified still in place:

| Item | Present |
|---|---|
| `trucks.sound_config` in the projection | ✅ [dashboard/route.ts:509](app/api/dashboard/route.ts#L509) |
| `set_sound_config` action | ✅ (now unused — see above) |
| `'sound_config'` on the `update_settings` allowlist | ✅ [manage/route.ts:803](app/api/manage/route.ts#L803) |
| Both Settings panels | ✅ dashboard + Manage |

**No migration.** Nothing about the column changed.

### The reworded Manage copy

> **Sounds**
> Sets the starting point for new devices. Each device then controls its own sound from its own screen —
> changing this won't affect devices already in use.

Three facts in two sentences: it is a **starting point**, control lives **on each device**, and — the part
that stops a support call — editing it **won't change devices already running**. I kept "starting point"
over "seed" and "default" because it reads as plain English rather than jargon, and because "default"
would imply it still applies to existing devices.

### The retirement comment

At the Manage panel ([manage/page.tsx:7728-7737](app/manage/[token]/page.tsx#L7728)):

> ⚠️ V9.5 — THIS PANEL NOW WRITES A SEED, NOT A LIVE SETTING. Sound config became PER-DEVICE
> (localStorage, `lib/sound-prefs.ts`). A device seeds from `trucks.sound_config` the first time it loads
> and is authoritative from then on, so editing here changes nothing for any device that has already
> loaded. The copy says so.
> 🔴 DO NOT RETIRE `trucks.sound_config` / `set_sound_config` / this panel / the `update_settings`
> allowlist entry YET. This column is the seed source. Retirement requires that EVERY device has loaded at
> least once since the V9.5 deploy — a device that has not would seed from nothing and silently get the
> hardcoded default instead of the truck's real settings. Later release.

The same precondition is recorded in `lib/sound-prefs.ts`'s header, so it is visible from the seed site
too.

---

## What I could NOT verify

- 🔴 **The seed has never run.** No `next dev`, so the effect ordering, the `truck?.sound_config ===
  undefined` guard, and the actual localStorage write are **proven by reading and by a harness against a
  stand-in store, not against a browser.** The harness exercises `lib/sound-prefs.ts` for real; it does
  **not** exercise React's mount order. **The one check I would want before trusting this on Gusto's
  hardware: load the dashboard once, then confirm `hg_soundcfg_<token>` in localStorage reads
  `{"new_orders":"all","order_due":true}`.**
- **Nothing was rendered.** The reworded Manage copy and the failure toast are unobserved.
- **The write-failure path has not been triggered** — I did not fill localStorage or run in a blocked-storage
  mode, so the toast and the three `console.error` messages are untested.
- ⚠️ **Whether one shared config key across dashboard and KDS is right** is a judgement. It follows "one
  concept, one place" from V9.0, but it means a device cannot have different *policy* on its KDS and its
  dashboard, only different *mute*. If that is wrong, splitting is a one-line key change.
- **Part 1's matrix is derived from class strings, not from a resized browser.** The complementary
  `sm:hidden` / `hidden sm:flex` pair is unambiguous in the source, but I have not seen it at a
  breakpoint boundary.
- **`set_sound_config` is now dead code**, retained deliberately. tsc does not flag it and nothing tests
  that it is unreachable.
- **No `next build`.**
