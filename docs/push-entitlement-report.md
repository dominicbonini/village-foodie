# iOS push entitlement — AUDIT AND BUILD

**Date:** 6 August 2026.
**Three iOS files changed (one modified, two new). No JavaScript or TypeScript touched.** No `cap sync` / `next dev` / `next build`. No garbled spans in the brief.

---

# PART 1 — ESTABLISHED

## §36 is accurate on all three counts. Confirmed, not taken on trust.

### 1. No `.entitlements` file anywhere under `ios/` — ✅ CONFIRMED

```
$ find ios -name "*.entitlements"
(no output)
```

`ios/App/App/` contained exactly: `AppDelegate.swift`, `Assets.xcassets`, `Base.lproj`, `HGBridgeViewController.swift`, `Info.plist`, `capacitor.config.json`, `config.xml`, `public`. **No entitlements file of any name.**

### 2. `CODE_SIGN_ENTITLEMENTS` in `project.pbxproj` — 🔴 **ABSENT FROM BOTH CONFIGURATIONS**

```
$ grep -n "CODE_SIGN_ENTITLEMENTS" ios/App/App.xcodeproj/project.pbxproj
(no match)
```

Both build configurations existed and were otherwise complete (`CODE_SIGN_STYLE = Automatic`, `DEVELOPMENT_TEAM = UD5438FTG9`, `PRODUCT_BUNDLE_IDENTIFIER = com.hatchgrab.app`) — there was simply no entitlements setting to point at a file that did not exist.

### 3. Push Notifications capability — 🔴 **NOT PRESENT**

```
$ grep -n "SystemCapabilities\|com.apple.Push\|aps-environment\|APS" …/project.pbxproj
(no match)
```

**How I determined it:** an enabled capability leaves two traces — a `SystemCapabilities` block under the target's `TargetAttributes` (older projects) and, invariably, an entitlements file carrying the capability's key. **Neither exists.** The capability has never been enabled in this project.

### 4. The JS push path — 🔴 **CORRECT, AND ITS FAILURE IS COMPLETELY SILENT**

`registerForPush()` ([lib/native/push.ts](lib/native/push.ts)) is called from **three sites**, all in `components/native/OperatorDeviceConfig.tsx` — `:43` (already-configured), `:49` (single-van auto-bind), `:69` (card save).

The sequence is careful and, as far as I can tell, right: listeners are attached **first and awaited** before `requestPermissions()` and `register()` — with a long comment explaining the Android bug where a token fired into an empty listener map and was dropped.

🔴 **What happens today when it fails:**

```ts
PushNotifications.addListener('registrationError', (err: unknown) => {
  console.warn('[push] registration error:', err)      // ← this is the entire failure path
})
```

**A `console.warn` inside a WKWebView.** Nothing reaches the operator, nothing reaches the server, nothing is written to `van_devices`. The row simply keeps `push_token = null` forever, and no surface anywhere distinguishes *"this device has not registered"* from *"this device has no orders"*. **That is why this has been able to fail for as long as it has without anyone noticing.**

⚠️ **The path is NOT broken for any reason other than the missing entitlement**, so per your instruction I changed no JS. Without `aps-environment`, iOS never calls back with a token — `registrationError` may not even fire, which is why even the `console.warn` may never have appeared.

### 5. Where the token lands — **identical on both platforms**

`registration` listener → `saveDeviceConfig(token, { push_token: t.value })` ([device.ts:61](lib/native/device.ts#L61)) → `POST /api/native/bind-device` → `van_devices.push_token`, keyed on `device_id`.

✅ **The iOS path does NOT differ from Android's.** One listener, one helper, one endpoint, one column; `platform` is sent alongside from `Capacitor.getPlatform()`.

⚠️ **The asymmetry is downstream, at send time.** [orders/submit:1105](app/api/orders/submit/route.ts#L1105) selects devices with `.or('platform.eq.ios,platform.is.null')` — **an APNs-only allowlist**. Android tokens are deliberately excluded because the sender POSTs to Apple. So Android registers and stores a token that nothing currently sends to.

### 6. `APNS_*` environment variables — **exactly five**

| Variable | Used for |
|---|---|
| `APNS_KEY_ID` | The `.p8` key's Key ID (10 chars) |
| `APNS_TEAM_ID` | Apple Developer Team ID (10 chars — this project signs with `UD5438FTG9`) |
| `APNS_BUNDLE_ID` | APNs topic. Must equal `com.hatchgrab.app` |
| `APNS_KEY` | The `.p8` private key contents. ⚠️ `lib/apns.ts:18` does `.replace(/\\n/g, '\n')`, so literal `\n` sequences are accepted |
| 🔴 `APNS_ENV` | **Selects the host.** `'production'` → `api.push.apple.com`; anything else → `api.sandbox.push.apple.com` ([apns.ts:20-22](lib/apns.ts#L20)) |

✅ With none set, `lib/apns.ts` is a **safe no-op** — it logs and returns, so shipping the trigger cannot break order placement.

---

# PART 2 — THE CHANGE

## 🔴 Which value each configuration carries — and why I used TWO files

| Configuration | File | `aps-environment` | Used by |
|---|---|---|---|
| **Debug** | `App/App.entitlements` | `development` | Builds run from Xcode onto a device → **sandbox** APNs |
| **Release** | `App/AppRelease.entitlements` | `production` | 🔴 **TestFlight AND the App Store** → **production** APNs |

**Xcode's default when you tick the capability is ONE file containing `development`, referenced by both configurations. I deliberately did not do that**, because it is the single most common cause of "push works in Xcode, silently never arrives in TestFlight."

### 🔴 What happens if a TestFlight build carries the wrong one

**TestFlight is a Release build signed with a distribution profile.** If it carried `aps-environment: development`:

1. The device registers against **sandbox** APNs and receives a **sandbox** token.
2. That token is stored in `van_devices.push_token` exactly as normal. **Nothing looks wrong.**
3. The server sends to `api.push.apple.com` (because `APNS_ENV=production`) and Apple returns **`BadDeviceToken`**.
4. 🔴 **And it gets worse than a silent no-delivery.** [orders/submit:1112](app/api/orders/submit/route.ts#L1112):
   ```ts
   if (res.invalidTokens.length) {
     await supabase.from('van_devices').update({ push_token: null }).in('push_token', res.invalidTokens)
   }
   ```
   **The invalid-token cleanup NULLs the row.** So the first order after install doesn't just fail to notify — it **wipes the stored token**, and the device stays dark until something re-registers it. The failure erases its own evidence.

**The mismatch is symmetrical:** a Debug build with `production` would obtain a production token that the sandbox host rejects the same way.

⚠️ **THE ENTITLEMENT AND `APNS_ENV` MUST AGREE, AND THERE IS ONLY ONE `APNS_ENV` PER DEPLOYMENT.** Set `APNS_ENV=production` on the Vercel **Production** environment, to match TestFlight/App Store builds. A consequence worth knowing in advance: **a Debug build's sandbox token will then be rejected by production Vercel** — that is expected, not a bug. Test push against a Preview/dev deployment with `APNS_ENV` unset, or against a TestFlight build.

⚠️ A Release build signed with a *development* profile will now **fail to sign** rather than silently mis-register, because a development profile does not grant `aps-environment: production`. **A build error is the better failure mode** and is part of why two files is worth the extra file.

## ⚠️ Does an entitlements file need the explicit-reference treatment? — **PARTLY, and getting it wrong the other way would be a bug**

The `.swift` precedent needs **four** entries: `PBXFileReference`, `PBXBuildFile`, group membership, and a **Sources build-phase** entry. An entitlements file is different:

| Entry | Needed? | Why |
|---|---|---|
| 🔴 **`CODE_SIGN_ENTITLEMENTS` build setting** | ✅ **REQUIRED — this is the functional part.** `codesign` reads it | Without it the file is inert no matter how it is referenced |
| `PBXFileReference` | ⚪ Optional — **added** | Navigator visibility only. Without it the file works but is invisible in Xcode, which is how it gets deleted by accident |
| Group membership | ⚪ Optional — **added** | Same reason |
| 🔴 **`PBXBuildFile` / build phase** | ❌ **MUST NOT BE ADDED** | An entitlements file is **read by codesign, not compiled or copied**. A Resources entry would **embed it in the shipped bundle** — wrong, and a minor information leak |

**Verified after the edit:**

```
✅ no PBXBuildFile / build-phase entry
Debug    -> App/App.entitlements          (bundle com.hatchgrab.app)
Release  -> App/AppRelease.entitlements   (bundle com.hatchgrab.app)
$ plutil -lint ios/App/App.xcodeproj/project.pbxproj
  OK
$ plutil -lint App.entitlements AppRelease.entitlements
  OK   OK
```

✅ **No JS push path changed**, as instructed — part 1 found it correct.

---

# PART 3 — WHAT YOU MUST DO OUTSIDE THE REPO, IN ORDER

### A. Apple Developer portal — https://developer.apple.com/account

1. **Certificates, Identifiers & Profiles → Identifiers.** Select **`com.hatchgrab.app`**. If it does not exist, create an App ID with that exact bundle id.
2. On that identifier, tick **Push Notifications** under Capabilities. **Save.**
3. **Keys → ➕.** Name it e.g. `HatchGrab APNs`. Tick **Apple Push Notifications service (APNs)**. **Continue → Register.**
4. 🔴 **Download the `.p8` file. You can only download it ONCE.** Store it somewhere permanent.
5. Note the **Key ID** shown on that page (10 characters) → this is `APNS_KEY_ID`.
6. Note your **Team ID** (top right of the portal, 10 characters) → `APNS_TEAM_ID`. This project already signs with **`UD5438FTG9`**; confirm it matches.

### B. Xcode

7. Open `ios/App/App.xcworkspace` (**the workspace, not the project** — CocoaPods).
8. Select the **App** target → **Signing & Capabilities**.
9. Click **+ Capability** → **Push Notifications**.
   ⚠️ It should attach to the entitlements files this build already created rather than making a third one. **If Xcode creates a new file or rewrites `CODE_SIGN_ENTITLEMENTS`, undo and tell me** — that would silently revert the Debug/Release split.
10. Confirm the tab shows **no signing errors** for both Debug and Release (use the scheme's configuration switcher). An error here now is the good outcome — it means the entitlement is real and being checked.

### C. Vercel — Project → Settings → Environment Variables

Set all five on **Production** (and, if you want a sandbox test target, the same five on Preview with `APNS_ENV` omitted or set to `development`):

| Name | Value |
|---|---|
| `APNS_KEY_ID` | The Key ID from step 5 |
| `APNS_TEAM_ID` | `UD5438FTG9` (confirm at step 6) |
| `APNS_BUNDLE_ID` | `com.hatchgrab.app` |
| `APNS_KEY` | The **entire** contents of the `.p8`, including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`. Real newlines or literal `\n` both work |
| 🔴 `APNS_ENV` | **`production`** on Production — it must match the Release entitlement |

11. **Redeploy** after setting them. Vercel environment variables are read at build/run time; existing deployments will not pick them up.

### D. Then

12. Archive → distribute to **TestFlight**. Install on a real iPad. 🔴 **A simulator cannot obtain a real APNs token** — device only.

---

# VERIFY

## What happens on first launch after this ships

1. The operator opens the app and reaches device setup (`OperatorDeviceConfig`).
2. Once the device is bound to a van, `registerForPush()` runs.
3. **iOS shows the system prompt: _"HatchGrab Would Like to Send You Notifications"_ — Allow / Don't Allow.**
4. **If they tap Don't Allow:** `perm.receive !== 'granted'` → the function **returns silently**. No token, no error, no retry. `push_token` stays null. ⚠️ Nothing in the app tells them push is off or offers a way back — they would have to change it in iOS Settings.
5. **If they tap Allow:** `PushNotifications.register()` → iOS contacts APNs → the `registration` listener fires with the token → `saveDeviceConfig` → `POST /api/native/bind-device` → **`van_devices.push_token` for this `device_id`**.
6. From then on, a new pending order triggers `sendOrderPendingPush` to that token, provided `van_devices.notify_enabled` is true and the van's `order_pending` preference is enabled.

## How you will know it worked

- 🔴 **The direct check:** `select device_id, platform, push_token from van_devices where push_token is not null;` — a populated `push_token` on an `ios` row **is** the proof. It has never happened before, so any non-null value is new information.
- The notification arrives on the iPad when a customer places an order.

## How you will know it failed

| Symptom | Meaning |
|---|---|
| **No iOS permission prompt at all** | The device never reached `registerForPush` — a device-binding problem, not push |
| **Prompt appears, `push_token` stays null** | Registration failed. ⚠️ **The only trace is a `console.warn` in the WebView** — attach Safari Web Inspector to see it |
| 🔴 **`push_token` populates, then becomes null again after the first order** | **The entitlement/`APNS_ENV` mismatch.** Apple returned `BadDeviceToken` and the cleanup NULLed the row. **This is the exact failure the two-file split exists to prevent** |
| **Token stays, no notification arrives** | Look at `van_devices.notify_enabled` and the van's `order_pending` row in `van_notification_prefs` |

⚠️ **Nothing here can be verified from this machine.** It needs the portal steps, a signed build and a physical device.

## 🔴 GUSTO — verified, not assumed

**Zero effect. Three independent reasons:**

1. **Only three files changed, all under `ios/`** — two new `.entitlements` and `project.pbxproj`. `git status --porcelain ios/` confirms; **no `.ts`, `.tsx` or SQL was touched by this task.**
2. **None of it ships to the web.** Entitlements are consumed by `codesign` when building an iOS binary. They are not bundled, served or imported.
3. **They are on the web**, so they never run the native shell, never reach `registerForPush`, and have no `van_devices` row with a `platform` of `ios`.

✅ Their order path is unchanged — `orders/submit`'s push block was **read** for this audit and **not edited**.

## Build

```
$ npx tsc --noEmit
TSC EXIT: 0
```

**Lint baselines: not applicable and not disturbed** — this task changed no JavaScript or TypeScript, so there is no file whose lint output could move. `tsc` was run to confirm the tree is still clean, not because these files affect it.

`plutil -lint` passes on both new entitlements files **and** on the edited `project.pbxproj` — the last is the one that matters, since a malformed pbxproj would make the project unopenable.

### Files changed

`ios/App/App/App.entitlements` **(new)** · `ios/App/App/AppRelease.entitlements` **(new)** · `ios/App/App.xcodeproj/project.pbxproj`

### ⚠️ Still true after this change

- 🔴 **This does not make push work.** It removes the blocker. Steps A–D in Part 3 are all still required, and none can be done from this repo.
- 🔴 **Push failure remains entirely silent on the device** — one `console.warn`. If you want to know that a device failed to register rather than inferring it from a null column, that is a separate build.
- ⚠️ **A denied permission prompt is a dead end in the UI** — no explanation, no re-prompt, no deep link to iOS Settings.
- ⚠️ **Android registers a token that nothing sends to** — the sender allowlist is `platform.eq.ios,platform.is.null`.
- ⚠️ **A backup of `project.pbxproj` was taken before editing** (in the session scratchpad) in case Xcode's capability step rewrites it.
