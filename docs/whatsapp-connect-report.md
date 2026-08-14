# WhatsApp Auto-replies — hidden in the native app, untouched on the web

Date: 14 August 2026 · supersedes the STOP report of the same name
**EDITED: 1 file.** `app/manage/[token]/page.tsx` — **+23 insertions, 0 deletions.**
`tsc --noEmit`: exit 0 · **0 NUL, 0 control bytes < 0x09** · **176 → 176 codepoint classes, none gained
or lost.**

🔴 **NOTHING WAS REMOVED. No handler, column, type or gate was touched.**
No `next dev`, no `next build`, no `cap sync`, no deploy, no commit.
**No span of the prompt arrived garbled. No instruction contradicted another.**

---

# THE CHANGE

```diff
+import { isNativeApp } from '@/lib/native/device'   // native-only hide: Auto-replies (see SettingsTab)
```
```diff
+        {/* ── 🔴 HIDDEN IN THE NATIVE APP ONLY — NOT REMOVED (14 August 2026) ── … */}
+        {!isNativeApp() && (<>
         {/* Auto-replies subsection */}
         <div className="border-t border-slate-100 pt-4 mt-1">
           …heading, caption, space-y-3, the WhatsApp row…
         </div>
+        </>)}
       </Card>
```
**A wrap. `0 deletions` in `git diff --stat` is the proof.**

---

# PART A — THE STRUCTURE, CONFIRMED

## A1. The whole subsection, quoted (unchanged inside the wrap)

```tsx
        {/* Auto-replies subsection */}
        <div className="border-t border-slate-100 pt-4 mt-1">
          <p className="text-sm font-bold text-slate-700 mb-0.5">Auto-replies</p>
          <p className="text-xs text-slate-400 mb-3">Requires Business accounts on each platform.</p>

          <div className="space-y-3">
            {/* WhatsApp */}
            <div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600 w-20 flex-shrink-0">WhatsApp</label>
                {can('whatsapp_replies') ? (
                  <>
                    <input type="tel" value={whatsappSender} onChange={…} onBlur={saveWhatsappSender} … />
                    <button onClick={saveWhatsappSender} …>Connect</button>
                  </>
                ) : (
                  <>  …disabled input + <FeatureGate feature="whatsapp_replies" …/>…  </>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1.5 sm:pl-[5.5rem]">
                The WhatsApp Business number used to send automated replies to customers …
              </p>
            </div>
            {/* ── THE MESSENGER AND INSTAGRAM ROWS WERE REMOVED HERE — 14 August 2026 ── */}
          </div>
        </div>
      </Card>
```
**Five parts: the `border-t` divider · the "Auto-replies" heading · the caption · the `space-y-3`
wrapper · the WhatsApp row.**

## A2. ✅ CONFIRMED STILL TRUE — the WhatsApp row is the LAST child, so the WHOLE subsection was hidden

**The removal comment inside `space-y-3` says so in its own words, and I re-read it rather than trusting
the earlier report:**
> *"⚠️ NO EMPTY SHELL IS LEFT. The two `<div>`s went whole, so the `space-y-3` container now holds
> exactly one child and renders no residual gap."*

🔴 **So hiding the ROW alone would have orphaned four things: the divider, the heading, the caption and
an empty `space-y-3`.** ✅ **The wrap opens ABOVE `{/* Auto-replies subsection */}` and closes BELOW the
`border-t` div's `</div>`, so in the app all five disappear together and nothing is left behind** —
verified by reading lines 9064-9067 after the edit:
```
          </div>        <- space-y-3
        </div>          <- border-t
        </>)}           <- the wrap closes here
      </Card>
```

## A3. The existing helper — **no new predicate, and not the commerce one**

```ts
/** True inside the native iOS shell. */
export function isNativeApp(): boolean {
  return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()
}
```
✅ **`lib/native/device.ts`, imported — not reimplemented.** ⚠️ **It was NOT previously imported in
`app/manage/[token]/page.tsx`** (a count of `isNativeApp` returned **0** before this edit, matching
`docs/manage-navigation-report.md` D3), so one import line was added.

🔴 **`purchaseCtaAllowed()` was NOT used or extended.** That is the 3.1.1 commerce predicate; this is
neither commerce nor 2.1 completeness — it is "a feature we have not built self-serve onboarding for".
**§40 keeps them separate deliberately, and the code comment says so at the call site.**

---

# PART B — FIRST-PAINT SAFETY

## B1. 🔴 BEHIND THE LOADING EARLY-RETURN. **Verified by line, not assumed.**

**READ, `app/manage/[token]/page.tsx` (pre-edit line numbers):**
```
:165   export default function ManagePage({ params }: { params: Promise<{ token: string }> }) {
:200     const [loading, setLoading] = useState(true)
:508     if (loading) return (
:508-512   …<Spinner /><p …>Loading management console...</p>…
:718     {activeTab === 'settings'  && <SettingsTab  userRole={userRole} truck={truck} … />}
:8325  function SettingsTab({ userRole, truck, token, api, … }) {
```

🔴 **THE CHAIN IS DECISIVE: `loading` starts `true`; `ManagePage` early-returns a spinner at `:508`;
`<SettingsTab>` is rendered at `:718`, BELOW that return; and the Auto-replies subsection lives inside
`SettingsTab`, which begins at `:8325`.**

✅ **So this markup appears in NO server output and on NO first client frame.** It is the same property
§40 records as what makes direct predicate evaluation safe on this page, and the same one that made the
direct call safe in `AppHeader`.

## B2. ✅ DIRECT CALL, NO `mounted` TWO-PASS. **The B2 stop condition did not fire.**

`{!isNativeApp() && (…)}` is evaluated inline. **No second mechanism was added** — §35's N8 already
records three answers to "am I native", and this adds a **consumer**, not a fourth mechanism.

⚠️ **RECORDED AS A DEPENDENCY, because it is not local:** this is safe **because** `ManagePage` keeps its
`loading` early-return. 🔴 **If that early-return is ever removed, this becomes a hydration mismatch** —
the same warning `AppHeader` carries.

---

# PART C — THE HIDE

## C1. ✅ The entire subsection, nothing orphaned

Quoted in A2. **In the app: no divider, no heading, no caption, no empty wrapper, no row.** The
preceding Website field and the following `</Card>` close up as if the subsection were not there.

## C2. ✅ WEB IS BYTE-IDENTICAL — **by construction, not by inspection**

**Before:** the subsection renders unconditionally.
**After:** it renders when `!isNativeApp()`.

🔴 **`isNativeApp()` is `typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()`, and
`Capacitor.isNativePlatform()` returns `false` in every browser** — so `!isNativeApp()` is `true` on the
web, always, and the same JSX renders. **The subsection's markup was not edited by a single character:
`git diff --stat` reports `23 insertions(+)` and `0 deletions`, which is only possible if nothing inside
was changed.**

## C3. ✅ Not one of the named things was touched — **counted after the edit**

| Symbol | Occurrences after |
|---|---|
| `saveWhatsappSender` | **6** |
| `onBlur={saveWhatsappSender}` | **1** |
| `whatsapp_sender: whatsappSender` | **2** — the `api('update_truck')` call and `onTruckUpdate` |
| `togglePhoneIsWhatsapp` | **2** |
| `This number is on WhatsApp` | **3** |
| `preferred_contact_method` | **5** |

✅ **`lib/features.ts`, `lib/plan-features.ts`, `lib/supabase.ts` and `supabase/` are absent from
`git status` — no gate, no type, no column, no migration.** The `can('whatsapp_replies')` gate inside
the row is untouched and still decides which half of the row renders **on the web**.

## C4. ✅ `trucks.whatsapp` — the CUSTOMER-facing number — is NOT part of this subsection and was not touched

It lives in **Contact Details**, synced from the Phone field by the "This number is on WhatsApp" tick
(`togglePhoneIsWhatsapp`), hundreds of lines above the wrap and outside it. 🔴 **Two different fields:
`whatsapp` is the number a customer messages; `whatsapp_sender` is the Business API sender.** **Gusto has
both set, and the app still shows and edits the customer-facing one exactly as before.**

## C5. 🔴 FAILURE DIRECTION — **it fails toward SHOWING, which is the mild direction**

```ts
  return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()
```

| Wrong answer | Consequence | Severity |
|---|---|---|
| Returns **false in the app** | the section shows on the iPad | ⚠️ **MILD** — a reviewer sees a feature we have not finished onboarding for |
| Returns **true on the web** | 🔴 Gusto loses a working control | **SERIOUS** |

✅ **Only the first is reachable, and I am confident for three reasons:** the function is a
**conjunction** whose first clause is a `typeof` guard, so any absence of Capacitor yields `false`;
`Capacitor.isNativePlatform()` is documented and implemented to return `false` outside a native runtime;
and **the web bundle never loads a native runtime for it to be true in.** 🔴 **There is no path on which
a browser can be told it is native**, so the serious direction is not merely unlikely — it is not
reachable by this predicate.

---

# PART D — BOUNDARIES

## D1. `git diff --stat`

```
 app/manage/[token]/page.tsx | 23 +++++++++++++++++++++++
 1 file changed, 23 insertions(+)
```
🔴 **ONE FILE. TWENTY-THREE INSERTIONS. ZERO DELETIONS.** ✅ And `git status` shows no change to
`lib/features.ts`, `lib/plan-features.ts`, `lib/supabase.ts` or `supabase/`.

## D2. What changes for each operator, on each platform

| | **WEB** | **APP (iPad)** |
|---|---|---|
| **Pizzeria Gusto** | ✅ **Nothing changes** — the Auto-replies section, the sender field and the Connect button are exactly as they were, and their populated `whatsapp_sender` is still editable | ⚠️ the Auto-replies section is no longer shown; **their saved sender is untouched and their WhatsApp keeps working** |
| **Tikka Tonic** | ✅ **Nothing changes** — the section renders as before, gated by `can('whatsapp_replies')` on their plan | ⚠️ the section is no longer shown; they had no sender set, so nothing is lost |

## D3. ✅ No customer-facing surface is affected

The edit is inside `SettingsTab` on the operator-only manage page. **No customer route renders it, and
`trucks.whatsapp` — the field customers actually reach — is outside the wrap (C4).** **No data changed,
so nothing a customer sees could change even in principle.**

---

# PART E — INTEGRITY

## E1 / E2. Non-ASCII census — `app/manage/[token]/page.tsx`

| | Bytes | Lines | Distinct non-ASCII |
|---|---|---|---|
| **BEFORE** | 782,991 | 12,060 | **176** |
| **AFTER** | **785,054** (+2,063) | **12,083** (+23) | **176** |

**GAINED: NONE. LOST: NONE.**

| Codepoint | Before → After | Why |
|---|---|---|
| `─` | 3728 → 3752 **(+24)** | the comment block's box rule, in this file's house style |
| `—` | 809 → 814 **(+5)** | five em dashes in the comment |
| `⚠` | 96 → 99 **(+3)** | three warning markers |
| `FE0F` | 105 → 108 **(+3)** | ✅ **lockstep with `⚠` — no half-written `⚠️`** |
| `🔴` | 102 → 105 **(+3)** | three red markers |
| `→` | 238 → 239 **(+1)** | the `saveWhatsappSender → api('update_truck')` arrow in the comment |

⚠️ **Every codepoint was already among this file's 176 classes. No class introduced** — the check that
caught a violation twice today.

## E3. Byte scan — byte-level tool, never grep

| File | NUL (0x00) | Ctrl < 0x09 | Other C0 |
|---|---|---|---|
| `app/manage/[token]/page.tsx` | **0** | **0** | **0** |

## E4. This report — separate post-write pass

*(Run after the file was on disk; result stated in the session output.)*

## E5. `git status` and `git diff --stat`

**`git diff --stat` for this task is quoted at D1.**
```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx                      <- THIS TASK
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M components/dashboard/PaymentActionsModal.tsx
 M components/native/OfflineBanner.tsx
 M docs/reference-manual.md
 M ios/App/App/Assets.xcassets/Splash.imageset/*.png  ×3
?? docs/… (report files)
```
**Everything else is earlier tasks'. Nothing committed.**

## E6. ✅ `tsc --noEmit`: **EXIT 0, ZERO OUTPUT** — and here it earned part of its keep

**What it DID check, and it mattered:** the wrap adds a JSX fragment across ~80 lines, and **an
unbalanced `<>` … `</>` or a stray `)}` would have failed to parse.** It compiled, so the fragment is
balanced and `isNativeApp` resolves.

🔴 **WHAT IT CANNOT CHECK:** that the wrap encloses the RIGHT `</div>` — **a fragment closing one line
early would also compile and would silently leave the divider behind on iPad.** I verified that by
reading lines 9064-9067 (A2), not by trusting the compiler. **Nor can it tell you the section actually
disappears on a device: nothing was rendered.**

---

# WHAT REMAINS

1. ⚠️ **Nothing was rendered.** **Device check: open Manage → Settings in the app — PASS = no
   "Auto-replies" heading, no divider, no gap between Website and the next card. On the web, PASS = the
   section is exactly as before.**
2. ⚠️ **The hide depends on `ManagePage` keeping its `loading` early-return** (B2). **Recorded in the
   code comment as well as here.**
3. 🔴 **The "Connect" label still says Connect while the behaviour is Save**, and the handler still
   returns silently when the value is unchanged — **both recorded in the previous version of this report
   and both still true on the web.** **Out of scope here; this task changed visibility only.**
4. ⚠️ **Gusto's sender is stored in UK national format (`07380736226`) while the field's own placeholder
   is E.164 (`+447700900000`)** — possibly saved-but-unusable by the Meta API. **Unverified, unchanged,
   and still worth checking.**
5. **No self-serve WhatsApp onboarding was built, and none is proposed.** When it is, the wrap is one
   line to remove.
