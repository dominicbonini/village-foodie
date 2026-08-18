# The breach banner — why it re-appears, and why it names a slot with nothing in it

**File changed — ONE:** 🔴 `app/dashboard/[token]/page.tsx`.
**Also written:** `docs/breach-dismiss-report.md` (this file).
🔴 **NOTHING UNDER `app/api` WAS TOUCHED — Q4 establishes the signature is CLIENT-side, so no stop was
required. The detector's rule, the ceilings, the engine and the strip marker are untouched.**
**Nothing committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or `restore`.

**No span of either prompt arrived garbled.**

---

# STAGE 0 — THE COPY

## Z2 — 🔴 IT IS COMMITTED. NOT UNCOMMITTED, AND THEREFORE NOT THE EXPLANATION.

✅ **EXECUTED:** `git log -- components/dashboard/CapacityBreachBanner.tsx` → **`f9c6972 "offline
updates"`**, and `git status --porcelain` on that file returns **nothing — it is clean.** **The new copy
is in `HEAD`.** ⚠️ **Whether `f9c6972` has been DEPLOYED I cannot see from here — but Z1 settles it
another way.**

## Z1 / Z3 — 🔴 THE OBSERVED TEXT IS THE NEW CODE'S FALLBACK, WHICH PROVES IT IS DEPLOYED

```tsx
            const total = b.order_keys.reduce((t, k) => t + qtyOf(k), 0)
            const contributors = b.order_keys
              .map((k, idx) => ({ id: b.order_ids[idx], qty: qtyOf(k) }))
              .filter(c => c.id !== undefined && c.id !== null)
                  {total > 0 ? `${total} ${unitWord(b)} booked for ${b.collection_time}` : `${b.collection_time} over capacity`}
                  {total > 0 ? ' — over capacity' : ''}
```

🔴 **`16:50 over capacity` IS THE `total === 0` ARM, CHARACTER FOR CHARACTER.** **The OLD copy could not
produce it** — it read `${b.collection_time} — ${b.reason}${ids}`, i.e. **`16:50 — global ceiling`**,
always with the reason. **No reason in the observed text ⇒ the new code is what rendered it.**

**THE CONDITION THAT TAKES THE BRANCH: `total === 0`, which means `qtyOf` returned 0 for every key —
either `b.order_keys` is EMPTY, or no key matched an order in the `orders` array.**

## Z4 — 🔴 THE FIELD IS `collection_time`, AND IT IS A SLOT WITH NO ORDERS COLLECTING AT IT

**It is populated on every breach** — the detector sets it from the slot it is iterating:
```ts
  for (const s of times) {
    const slotMins = parseMins(s.collection_time)
    const w = back.pileByStart.get(slotMins) ?? back.byStart.get(slotMins - step) ?? null
```
```ts
    const grp = ordersBySlot.get(s.collection_time) ?? []
      order_keys: grp.map(o => o.order_key),
```

🔴 **SO IT IS A COLLECTION SLOT — AND THAT IS EXACTLY WHY IT LOOKS WRONG.** A breach is raised against
**every slot whose COOKING WINDOW is over**, and the load in that window comes from orders collecting at
OTHER slots. **Orders at 16:30 and 17:00 can put 16:50 and 16:55's windows over the ceiling while
`ordersBySlot.get('16:50')` is empty — so `order_keys` is `[]`, `total` is 0, and the banner names a
slot with nothing booked at it.** ⚠️ **THE OPERATOR IS RIGHT TO DISTRUST IT: the time is real, the
attribution is missing.**

⚠️ **AND MY PREVIOUS REPORT'S CLAIM WAS HALF TRUE:** `collection_time` IS a collection slot, not a raw
window — but **the orders responsible are not at it**, which is the distinction that matters to a
person reading the banner. **The contributor list can only ever name orders collecting AT that slot,
and the detector has no other list.**

## Z5 — AN ORDER NOT IN THE ARRAY RENDERS AS ZERO

`qtyOf` returns 0 when the key is absent, and a `#id` with `qty 0` renders as a bare `#4` with no
quantity. **An order that has advanced to `ready`/`collected` is excluded by the detector's own
`OCCUPYING_STATUSES` before it reaches `order_keys`, so it cannot appear — but an order outside the
dashboard's fetched window would.**

---

# STAGE 1 — WHY DISMISSAL DID NOT HOLD

## Q1 — THE SIGNATURE IS STABLE. IT IS NOT THE CAUSE.

```ts
export function breachSignature(breaches: CapacityBreach[]): string {
  return (breaches || [])
    .map(b => `${b.collection_time}:${b.over_total}:${b.over_cats.map(c => `${c.cat}${c.over}`).join(',')}`)
    .sort()
    .join('|')
}
```

| Field | Stable while the breach is unchanged? |
|---|---|
| `collection_time` | ✅ a slot string from the slot list |
| `over_total` | ✅ **`Math.round(overTotal)` in the detector — an INTEGER, not a float** |
| `over_cats[].cat` / `.over` | ✅ **also `Math.round`ed** |
| array order | ✅ 🔴 **`.sort()` — order-independent by construction, so Q5's concern cannot bite** |

## Q2 — 🔴 THE CAUSE: IT WAS COMPONENT STATE

```tsx
  const[breachDismissedSig,setBreachDismissedSig]=useState<string|null>(null)
```
🔴 **REACT STATE ONLY. NOT localStorage, NOT Preferences. A reload, a navigation, a cold launch or a tab
switch that remounts the page resurrects it — which is precisely "dismissed several times and it keeps
coming back".**

## Q3 — THE GUARD AND THE HANDLER

```tsx
  if (sig === dismissedSig) return null
```
```tsx
  onDismiss={setBreachDismissedSig}   // before
```
**Strict equality against a value that starts `null`, so an absent signature falls through to SHOWING —
the safe direction, and the one taken on every reload.**

## Q4 — CLIENT-SIDE. ✅ **NO API CHANGE WAS NEEDED AND NONE WAS MADE.**
`breachSignature` lives in the component; the server sends `capacityBreaches` and never a signature.

## Q6 — TWO ADJACENT WINDOWS ARE TWO ENTRIES, LEGITIMATELY
**One breach per SLOT, and 16:50 and 16:55 are two slots whose windows are both over — commonly because
of the same orders. The count is stable while the load is.**

---

# STAGE 2 — THE FIX

```tsx
  const storedBreachAck=typeof window==='undefined'||!selectedEventId?null:(()=>{try{return localStorage.getItem(`hg_breach_ack_${selectedEventId}`)}catch{return null}})()
  const effectiveBreachDismissedSig=breachDismissedSig??storedBreachAck
```
```tsx
  const dismissBreaches=useCallback((sig:string)=>{
    setBreachDismissedSig(sig)
    if(typeof window!=='undefined'&&selectedEventId){
      try{localStorage.setItem(`hg_breach_ack_${selectedEventId}`,sig)}catch{}
    }
  },[selectedEventId])
```

| Requirement | How |
|---|---|
| Stable under recomputation | ✅ **the signature is UNCHANGED** — every field is a slot string or a rounded integer, and the list is `.sort()`ed (Q1) |
| Survives a reload | ✅ **`hg_breach_ack_<eventId>` — THE OFFLINE-PAUSE NOTICE'S PATTERN, COPIED**: same per-device localStorage, same keyed-on-the-event shape as `hg_offline_pause_ack_<eventId>` |
| A worse breach re-fires | ✅ 🔴 **the stored value is the SIGNATURE, not a boolean.** `17:00:10…` and `17:00:15…` are different strings, so a bigger overage no longer matches |
| A new slot re-fires | ✅ a new entry changes the joined string |
| Per event | ✅ keyed on `selectedEventId`; switching event cannot carry a dismissal across |
| 🔴 **The strip marker is unaffected** | ✅ **EXECUTED — `DayLoadStrip` reads `breachedSlots`, built from `capacityBreaches` alone. It never sees `dismissedSig` and cannot be silenced by a dismissal** |

⚠️ **NO EFFECT AND NO `setState` IN AN EFFECT:** the stored value is derived during render, which also
kept the file's lint count at its baseline (a first attempt used an effect and raised
`react-hooks/set-state-in-effect`).

---

# ⚠️ PIZZERIA GUSTO — `kitchen_capacity = 2`

**Before:** dismiss, reload, banner back — and with a ceiling of 2 they meet it often. **After:** a
dismissal holds for that event on that device until the breach genuinely worsens. 🔴 **BUT THE COPY
PROBLEM IN STAGE 0 IS UNFIXED AND IS THE ONE THAT TEACHES THEM TO IGNORE IT** — a banner naming 16:50
when nothing collects at 16:50 reads as wrong even when it is right. **That needs the detector to
attribute the WINDOW's load to the orders that actually feed it, which is a change to
`lib/capacity-breach.ts`'s grouping — on this task's DO-NOT list, so it is reported, not made.**

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint`: 82 errors / 26 warnings = 108, this session's baseline.**

| Claim | Method |
|---|---|
| Identical signature across two polls with unchanged data | ✅ **SOURCE READ** — every field is a string or a rounded integer, and the list is sorted. 🔴 **Not observed across two live polls** |
| A dismissal survives a reload | ✅ **SOURCE READ** — read from localStorage during render. **Not exercised in a browser** |
| A worse breach re-fires | ✅ **SOURCE READ** — the signature carries `over_total` |
| A new slot re-fires | ✅ **SOURCE READ** — a new entry changes the string |
| The strip marker still shows | ✅ **EXECUTED** — `DayLoadStrip` has no `dismissedSig` prop at all |

🔴 **NOT PROVED: anything rendered. And Stage 0's finding is a DIAGNOSIS, not a fix — the banner will
still name a slot with no orders at it until the attribution changes.**

---

# INTEGRITY

```
app/dashboard/[token]/page.tsx   403,405 → 405,491 bytes · classes 53 → 53
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0 · added vs HEAD: NONE
```

## This report — a SEPARATE pass, run AFTER writing

```
docs/breach-dismiss-report.md   bytes 10,380
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 20 | 0 | 20 |
| U+26A0 (warning sign — TEXT presentation) | 6 | 6 | 0 |
| U+2705 (check mark button) | 18 | 0 | 18 |

U+26A0 is the only TEXT-presentation base and every occurrence is PAIRED with U+FE0F.

## Working tree

```
 M app/dashboard/[token]/page.tsx
 M docs/reference-manual.md
?? docs/breach-dismiss-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M app/dashboard/[token]/page.tsx` | 🔴 **THIS TASK — the only source file written** |
| 🔴 `?? docs/breach-dismiss-report.md` | 🔴 **THIS TASK** — this file |
| everything else | ✅ pre-existing. ⚠️ **The tree is short because you committed again mid-session (`f9c6972 "offline updates"`), which is also what put the new banner copy into `HEAD`** |

No `git stash`, `git checkout` or `git restore` was run at any point.
