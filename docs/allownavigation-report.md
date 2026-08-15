# `allowNavigation` + the refund fee comment — 15 August 2026

**Two narrow edits, both applied.** `capacitor.config.ts` (+24 lines) and `lib/payments/refund.ts` (+13 lines, **all comment**).
**`npx cap sync` run once, in Part B only.** No `next dev`, no `next build`, no build, no archive, no upload, no deploy, no commit.

✅ **No span of the prompt arrived garbled. No instruction contradicted another, so there was nothing to stop for.**
✅ **Nothing outside scope was touched.** The only other modified path is `docs/reference-manual.md`, which is **last turn's V11.18 update, untouched today** (`git diff --numstat` still `412 8`).

**Headline, stated up front because it qualifies the whole task:**

> 🔴 **PART A FIXES ONE OF THE TWO EJECTIONS, NOT BOTH.** The manage → Orders-dashboard path is now safe. **The "Kitchen screen" path is NOT**, because `window.open` never reaches the policy `allowNavigation` guards — it reaches `createWebViewWith`, which opens Safari unconditionally. **Read A5 before treating N42 as closed.**

---

# PART A — `allowNavigation`

## A1. The `server`, `ios` and `android` blocks BEFORE the change

**READ, `capacitor.config.ts`, verbatim.** The preamble is quoted too, because A2's addition derives from it:

```ts
// ── Server base — PRODUCTION IS THE DEFAULT (never ships a localhost URL) ─────────────────────────────
// The shell opens at the native LANDING (/app), which checks the persistent session and routes to this
// device's remembered truck/van/screen (or /login). Cold-launch routing lives in /app/page.tsx.
//
// LOCAL SIMULATOR TESTING (temporary — to test UNDEPLOYED code against your dev server):
//     CAP_SERVER_URL=http://localhost:3000 npx cap sync ios      # bakes localhost + cleartext, then rebuild
// REVERT to production (do this before any real build/deploy — a plain sync restores it):
//     npx cap sync ios                                           # CAP_SERVER_URL unset → https://www.hatchgrab.com
// Because the DEFAULT is production, the source can never bake a localhost URL by accident; the only baked
// artifact is ios/App/App/capacitor.config.json, regenerated on every `cap sync`.
const CAP_SERVER_BASE = process.env.CAP_SERVER_URL || 'https://www.hatchgrab.com'
const IS_LOCAL_HTTP = CAP_SERVER_BASE.startsWith('http://')
```

```ts
  server: {
    url: `${CAP_SERVER_BASE}/app`,
    cleartext: IS_LOCAL_HTTP,   // http (localhost) needs cleartext; https production stays false
  },
  ios: {
    // 'never' = don't let the OS auto-inset the scroll view for safe areas; the WEB layer owns the inset
    // instead (viewport-fit=cover + env(safe-area-inset-top) padding on AppHeader), so the dark header
    // extends into the status-bar strip and no page content shows above it. ('always' double-insets against
    // the CSS env padding and let content bleed into the top inset once scroll was enabled.)
    contentInset: 'never',
    backgroundColor: '#1C1C1E',
    // MUST stay true. `false` (the original scaffold default) disables the WKWebView's scrollView, which
    // kills body/window scroll — so the natural-flow `min-h-screen` pages (Dashboard, Manage, Admin) can't
    // scroll and content below the fold is unreachable in the app (KDS is fine — it's a fixed flex-col with
    // its own inner min-h-0 + overflow-y-auto region). Web is unaffected either way (this is an iOS shell
    // setting). If this reintroduces rubber-band/overscroll on the fixed layouts, the alternative is a
    // per-page structural fix (cap those 3 pages to h-dvh flex-col + inner overflow-y-auto, mirroring KDS).
    scrollEnabled: true,
    // Marker appended to the WKWebView User-Agent so the server (proxy.ts) can tell native-app requests
    // from a normal browser on NAVIGATION requests (which carry no cookie and no Bearer). The proxy auth
    // guard defers to client-side native-session auth when it sees this; a real browser never has it, so
    // web is unaffected. Do NOT remove without updating proxy.ts's isNativeApp check.
    appendUserAgent: 'HatchGrabNativeApp',
  },
  android: {
    backgroundColor: '#1C1C1E',
    // MUST be byte-identical to ios.appendUserAgent above: proxy.ts's isNativeApp check substring-matches
    // this exact string to defer the cookie-blind auth guard for native navigations. Without it every
    // /dashboard and /manage navigation 307s to /login and the V8.7 login loop returns.
    // No contentInset / scrollEnabled here — both are WKWebView-specific with no Android counterpart.
    appendUserAgent: 'HatchGrabNativeApp',
  },
```

✅ **`server` held exactly two keys. No `allowNavigation` anywhere in the file — the hostname allow-list was empty, exactly as N40 says.**

## A2. Exactly what was added

**Two additions, nothing else. `server.url` is untouched, `ios` and `android` are untouched.**

**One — the derived host, next to the base it comes from:**

```ts
const CAP_SERVER_BASE = process.env.CAP_SERVER_URL || 'https://www.hatchgrab.com'
const IS_LOCAL_HTTP = CAP_SERVER_BASE.startsWith('http://')
// The ONE host the shell is already loading, derived from the line above so it can never drift from
// server.url. Production bakes 'www.hatchgrab.com'; a local sync bakes 'localhost'. See allowNavigation.
const CAP_SERVER_HOST = new URL(CAP_SERVER_BASE).hostname
```

**Two — the entry itself, last key in `server`:**

```ts
    // ── HARD NAVIGATIONS MUST STAY IN THE WEBVIEW ────────────────────────────────────────────────
    // WITHOUT THIS, EVERY TOP-LEVEL NAVIGATION TO A SIBLING PATH IS HANDED TO SAFARI. Capacitor's iOS
    // policy (WebViewDelegationHandler.decidePolicyFor) decides "is this our app?" with a STRING PREFIX
    // match on the full serverURL INCLUDING ITS PATH:
    //     navURL.absoluteString.starts(with: bridge.config.serverURL.absoluteString)
    // Because `url` above ends in /app, https://www.hatchgrab.com/dashboard/<token> does NOT start with
    // https://www.hatchgrab.com/app, so the bridge cancels the load and calls UIApplication.shared.open
    // — the operator lands in Safari, signed out, on the same origin. THE PATH IS WHAT DAMNS IT.
    // allowNavigation is checked BEFORE that prefix test and matches on HOSTNAME ONLY, so one entry
    // covers every path on this host. (Android never had the bug: Bridge.launchIntent compares host +
    // scheme, not the path. This entry is a no-op there, and is shared config rather than ios-only so the
    // two shells cannot diverge.)
    // ONE EXACT HOST, NO WILDCARD: CAPInstanceConfiguration.doesHost splits both sides on '.' and requires
    // an EQUAL SEGMENT COUNT, so 'www.hatchgrab.com' matches that host and nothing else — not the apex
    // hatchgrab.com, not any other subdomain, and no third-party host. Stripe, Tally and every external
    // link still leave for Safari exactly as before, which is what they should do.
    // NOTE: router.push was NEVER affected — a soft navigation creates no navigationAction and never
    // reaches this policy. That is why some controls worked and others did not.
    // DO NOT "FIX" THE PREFIX MATCH BY DROPPING /app FROM `url` ABOVE: /app is the cold-launch route, and
    // / is the Village Foodie consumer map — a different product with no way back.
    allowNavigation: [CAP_SERVER_HOST],
```

⚠️ **WHY DERIVED AND NOT A LITERAL, stated because it is a judgement call and the brief said "as tightly as the mechanism allows".** A literal `['www.hatchgrab.com']` bakes the same string today. **The derived form cannot admit a host the shell is not already loading** — the allow-list and `server.url` now come from one variable, so they cannot drift apart. **That drift is the entire root cause of this bug.** ✅ **The baked artefact is proof it resolves correctly: B4 shows the literal `"www.hatchgrab.com"` in the JSON.**

### 🔴 Exactly which hosts this admits — READ from the matcher, not assumed

**READ, `node_modules/@capacitor/ios/Capacitor/Capacitor/CAPInstanceConfiguration.swift:59-77`:**

```swift
    private func doesHost(_ host: String, match pattern: String) -> Bool {
        // bail early in the simple case
        if pattern == "*" {
            return true
        }
        // break apart the pieces
        var hostComponents = host.lowercased().split(separator: ".")
        var patternComponents = pattern.lowercased().split(separator: ".")
        guard hostComponents.count == patternComponents.count else {
            return false
        }
        // remove any wildcard segments
        for wildcard in patternComponents.enumerated().reversed().filter({ $0.element == "*" }) {
            hostComponents.remove(at: wildcard.offset)
            patternComponents.remove(at: wildcard.offset)
        }
        // match with what's left
        return hostComponents == patternComponents
    }
```

| Host | Admitted? | Why |
|---|---|---|
| `www.hatchgrab.com` | ✅ **YES** | exact segment match |
| `hatchgrab.com` (apex) | ❌ **NO** | 2 segments vs 3 — `guard` fails |
| `app.hatchgrab.com`, any other subdomain | ❌ **NO** | segment 1 differs |
| `WWW.HATCHGRAB.COM` | ✅ YES | both sides lowercased |
| `connect.stripe.com`, `tally.so`, **any third party** | ❌ **NO** | different host entirely |
| any host at all | ❌ NO | 🔴 **`*` is the only wildcard that would do that, and it is not used** |

✅ **The entry is one exact hostname. It admits every PATH on that one host — which is the point — and nothing else.** **External links behave exactly as they did yesterday: Stripe Connect onboarding, the Tally forms and calendar links all still leave for Safari, which is correct for them.**

## A3. iOS only, Android only, or both?

**BOTH shells read it — the key is `server.allowNavigation`, top-level, not under `ios` or `android`. That is intended. But it only CHANGES anything on iOS.**

**READ, both platforms:**

- **iOS** — `CAPInstanceDescriptor.swift:87`: `if let allowNav = config[keyPath: "server.allowNavigation"] as? [String] { allowedNavigationHostnames = allowNav }`, consumed at `WebViewDelegationHandler.swift:96`.
- **Android** — `CapConfig.java:259`: `allowNavigation = JSONUtils.getArray(configJSON, "server.allowNavigation", null);`, consumed via `Bridge.setAllowedOriginRules()`.

🔴 **ANDROID NEVER HAD THE BUG. READ, `Bridge.java:407-411`:**

```java
        Uri appUri = Uri.parse(appUrl);
        if (
            !(appUri.getHost().equals(url.getHost()) && url.getScheme().equals(appUri.getScheme())) &&
            !appAllowNavigationMask.matches(url.getHost())
        ) {
```

**Android compares HOST and SCHEME. iOS compares the whole absolute string INCLUDING THE PATH.** So `https://www.hatchgrab.com/dashboard/<token>` was already an internal navigation on Android and was already an "outside source" on iOS. **The entry is a genuine fix on iOS and a no-op on Android.**

✅ **Kept as shared config deliberately.** Both shells load the same remote URL; putting it under `ios` only would create a second place where the two platforms' navigation policy could diverge — §36 already records the `appendUserAgent` pair as something that must stay byte-identical across the two blocks.

## A4. ⚠️ CONSEQUENCE — hard navigations to hatchgrab.com now stay in the WebView, `/` and `/landing` included

**Stated plainly: after this change, if a HARD navigation to `https://www.hatchgrab.com/` or `/landing` ever fires inside the shell, the WebView will follow it instead of handing it to Safari — and the operator lands on the Village Foodie consumer map, inside the app, with no back button.**

**I searched for every way that could happen. READ, across `app/` and `components/`:**

| Mechanism searched | Hits on `/` or `/landing` |
|---|---|
| raw `<a href="/">` / `<a href="/landing">` | 🔴 **NONE** |
| `href="/"` on its own line (multi-line anchors) | **NONE** (`app/(legal)/layout.tsx:84` is `href="/landing"` but it is a `BrandHomeLink`, gated) |
| `window.location.href = …` assignments | **NONE** — the five that exist go to `/login`, `/dashboard/<token>` and the customer order page |
| `window.open(…)` | **NONE** to `/` or `/landing` |

**✅ Every remaining reference to `/` or `/landing` is a Next `<Link>` or a `BrandHomeLink`, and a `<Link>` is a SOFT navigation — it never creates a `navigationAction`, so `allowNavigation` changes nothing about it. Those already stayed in the WebView before this change.**

### The two sites N9 records as unfixed — current state, NOT fixed here

**1. `app/dashboard/[token]/page.tsx` access-denied view — 🔴 THE MANUAL IS STALE. IT IS ALREADY GATED.** It has moved from `:2396` to **`:2447`**, and reads (READ, verbatim, the relevant fragment):

```tsx
{isNativeApp()?<span className="mt-4 inline-block text-orange-600 text-sm hover:underline">← {_brand}</span>:<Link href="/" className="mt-4 inline-block text-orange-600 text-sm hover:underline">← {_brand}</Link>}
```

with a comment above it at `:2424` dated 14 August: *"NON-NAVIGATING INSIDE THE NATIVE SHELL (2.1 completeness) — SAME MECHANISM AS components/shared/AppHeader.tsx:86-115"*. ✅ **In the app it renders a non-navigating `<span>`. §27 Part 8 and N9's "still unfixed" should be corrected.** *(Not corrected here — this task is not a manual update.)*

**2. The legal footer's Contact chain — STILL UNGATED, and harmless under this change.** `app/(legal)/layout.tsx:104` links `/contact`; `app/contact/page.tsx:52` then carries:

```tsx
          <Link href="/" className="text-xs font-bold bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors border border-slate-700">
            ← Back
          </Link>
```

🔴 **That "← Back" button goes to the Village Foodie map and is NOT gated** — the wordmark above it at `:49` is a `BrandHomeLink` and is. ⚠️ **But it is a `<Link>`, so it is a soft navigation: it already landed on the map INSIDE the WebView before today, and `allowNavigation` does not change its behaviour by one byte.** **Reported, not fixed, as instructed.**

## A5. 🔴 Does this make N42 HARMLESS, or merely less visible? — HONEST ANSWER: NEITHER, CLEANLY. IT FIXES ONE PATH OF TWO.

**N42 records two ejections from one suspected cause. They do not have the same fate.**

### Path 2 — manage → "Orders dashboard": ✅ NOW HARMLESS

`app/manage/[token]/page.tsx:563` is `<AppLink href={`/dashboard/${token}`} …>` with **no `target`**. If `isNativeApp()` reads false, `AppLink` (READ, `components/native/AppLink.tsx:31-37`) does not intercept, and the plain `<a>` performs a same-tab hard navigation. **That navigation now matches `allowNavigation` at `WebViewDelegationHandler.swift:96` and is allowed before the prefix test is ever reached.** ✅ **It stays in the WebView regardless of what `isNativeApp()` returns — defence in depth, exactly as N40 predicted.**

### Path 1 — "Kitchen screen": 🔴 STILL EJECTS. `allowNavigation` DOES NOT TOUCH IT.

**READ, `app/dashboard/[token]/page.tsx:1181-1187`:**

```tsx
  const openKDS=(van?:{id?:string;name?:string;kds_token?:string|null})=>{
    if(isNativeApp()){
      const q=van?.id?`?van_id=${encodeURIComponent(van.id)}${van.name?`&van_name=${encodeURIComponent(van.name)}`:''}`:''
      router.push(`/dashboard/${token}/kds${q}`)
      return
    }
    window.open(van?.kds_token?`/kds/${van.kds_token}`:`/dashboard/${token}/kds`,'_blank')
  }
```

**A false reading takes the `window.open(…, '_blank')` branch. READ, `WebViewDelegationHandler.swift:328-333`:**

```swift
    open func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
        return nil
    }
```

🔴 **THERE IS NO HOST CHECK IN THAT METHOD AT ALL.** `allowNavigation` making `decidePolicyFor` return `.allow` merely lets WebKit proceed to ask for a new window — **and the new-window handler opens Safari unconditionally, for any URL, including our own.** ⚠️ **INFERRED, not device-observed:** that the `.allow` decision leads to `createWebViewWith` rather than to an in-place load; the two methods' contracts and the `return nil` make this the expected WebKit sequence, but I have not watched it happen.

**The same applies to every `AppLink` carrying `target="_blank"` — `app/dashboard/[token]/kds/page.tsx:1176` and three sites in `app/admin/page.tsx`.**

### Verdict

> 🔴 **`allowNavigation` IS NOT A FIX FOR N42. IT IS A FIX FOR THE PREFIX-MATCH BUG, WHICH IS A DIFFERENT FAULT THAT N42's SYMPTOM RODE ON.**
> **The underlying fault — `isNativeApp()` possibly reading false in the shell — is untouched.** Every other consequence of a false reading remains live: the KDS `window.open`, the target=`_blank` anchors, and anything else that branches on it (the WhatsApp hide, the `AppLock` gate, the offline banners).
> ⚠️ **"Less visible" is the more honest half of the answer for path 1, and it is worse than less visible — it is unchanged.** **N42 stays open.**

---

# PART B — SYNC, AND THE MANIFEST

## B1. Recorded BEFORE the sync

**READ. The four hand-authored `PrivacyInfo.xcprivacy` lines in `ios/App/App.xcodeproj/project.pbxproj`, verbatim, with their line numbers:**

```
17:		HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */; };
32:		HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };
80:				HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */,
155:				HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */,
```

**The `PBXResourcesBuildPhase`, in full — 7 entries:**

```
		504EC3021FED79650016851F /* Resources */ = {
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				504EC3121FED79650016851F /* LaunchScreen.storyboard in Resources */,
				50B271D11FEDC1A000F3C39B /* public in Resources */,
				504EC30F1FED79650016851F /* Assets.xcassets in Resources */,
				HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */,
				50379B232058CBB4000EE86E /* capacitor.config.json in Resources */,
				504EC30D1FED79650016851F /* Main.storyboard in Resources */,
				2FAD9763203C412B000D30F8 /* config.xml in Resources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
```

```
sha256  37ab01848404c6eefba8144706e6b0df9ba35d2d84ee5d042e3f9793748a2d30   (16,075 bytes)
```

✅ **Matches N20's recorded `37ab0184…` exactly.** **A byte-identical backup was taken to the scratchpad before syncing.**

## B2. `npx cap sync` — full output

```
✔ Copying web assets from out to android/app/src/main/assets/public in 2.27ms
✔ Creating capacitor.config.json in android/app/src/main/assets in 542.13μs
✔ copy android in 12.57ms
✔ Updating Android plugins in 2.80ms
[info] Found 8 Capacitor plugins for android:
       @aparajita/capacitor-biometric-auth@10.0.0
       @capacitor-community/keep-awake@8.0.1
       @capacitor/app@8.1.0
       @capacitor/local-notifications@8.2.0
       @capacitor/network@8.0.1
       @capacitor/preferences@8.0.1
       @capacitor/push-notifications@8.1.1
       @capacitor/status-bar@8.0.2
✔ update android in 42.08ms
✔ Copying web assets from out to ios/App/App/public in 1.03ms
✔ Creating capacitor.config.json in ios/App/App in 170.42μs
✔ copy ios in 29.36ms
✔ Updating iOS plugins in 2.73ms
[info] All Capacitor plugins have a Package.swift file and will be included in Package.swift
[info] Writing Package.swift
[info] Found 8 Capacitor plugins for ios:
       @aparajita/capacitor-biometric-auth@10.0.0
       @capacitor-community/keep-awake@8.0.1
       @capacitor/app@8.1.0
       @capacitor/local-notifications@8.2.0
       @capacitor/network@8.0.1
       @capacitor/preferences@8.0.1
       @capacitor/push-notifications@8.1.1
       @capacitor/status-bar@8.0.2
✔ update ios in 19.91ms
✔ copy web in 6.45ms
✔ update web in 6.78ms
[info] Sync finished in 0.169s
```

✅ **Eight plugins found on both platforms, the same eight as before. No plugin added, none removed** — so §36's *"if a plugin is added or upgraded, RE-RUN THE AUDIT"* is not triggered.

## B3. Re-checked after the sync — ALL THREE SURVIVED

```
sha256  37ab01848404c6eefba8144706e6b0df9ba35d2d84ee5d042e3f9793748a2d30   ← IDENTICAL
diff <pre-sync backup> <post-sync file>  →  no output.  BYTE-IDENTICAL.
```

| Check | Before | After | |
|---|---|---|---|
| `PBXBuildFile` line (`…0006`) | line 17 | **line 17, same text** | ✅ |
| `PBXFileReference` line (`…0005`) | line 32 | **line 32, same text** | ✅ |
| App `PBXGroup` entry | line 80 | **line 80** | ✅ |
| `PBXResourcesBuildPhase` entry | line 155 | **line 155** | ✅ |
| Resources entry count | 7 | **7** | ✅ |
| sha256 | `37ab0184…` | **`37ab0184…`** | ✅ |

✅ **Nothing changed, so there was nothing to re-add and nothing to stop for.** ⚠️ **ONE OBSERVATION, NOT A GUARANTEE — §36's own words.** This sync added and removed no plugin; the standing instruction to re-check after *every* sync stands.

## B4. The baked configs

**`ios/App/App/capacitor.config.json` — READ, verbatim head:**

```json
{
	"appId": "com.hatchgrab.app",
	"appName": "HatchGrab",
	"webDir": "out",
	"server": {
		"url": "https://www.hatchgrab.com/app",
		"cleartext": false,
		"allowNavigation": [
			"www.hatchgrab.com"
		]
	},
```

✅ **`allowNavigation` present, one entry, the exact production host — the derived expression resolved as intended.**
✅ 🔴 **`server.url` is UNCHANGED: `https://www.hatchgrab.com/app`. Production, and the `/app` path is still there.** The cold-launch route is intact and the map is not the landing surface.
✅ **`android/app/src/main/assets/capacitor.config.json` carries the identical `server` block** — the two shells cannot disagree.

⚠️ **Both baked files are GITIGNORED** (`ios/.gitignore:12`, `android/.gitignore:99`), so they do not appear in `git status`. **Their content is verified above rather than by diff.**

## B5. The manifest

```
-rw-r--r--@ 1 dominicbonini staff 4763 Aug 14 18:25 ios/App/App/PrivacyInfo.xcprivacy
$ plutil -lint ios/App/App/PrivacyInfo.xcprivacy
ios/App/App/PrivacyInfo.xcprivacy: OK
```

✅ **Present, 4,763 bytes, unchanged mtime, and it lints.** ⚠️ **§36's caveat still applies: a manifest that lints is not a manifest that passes App Store validation.**

## B6. Not done, deliberately

🔴 **No `xcodebuild`. No archive. No upload. No `next build`. No deploy. No commit.**

---

# PART C — THE REFUND FEE COMMENT

## C1. The call, quoted in full BEFORE the change

**READ, `lib/payments/refund.ts:173-190`:**

```ts
  let refund: Stripe.Refund
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: refundable.paymentIntentId,
        amount: args.amountMinor,
        reason: stripeReasonFor(args.reason),
        // ⚠️ OUR REASON TRAVELS TOO, so a human in the Stripe Dashboard sees what the operator chose
        // rather than the three-value approximation. The audit row below is the durable record.
        metadata: {
          order_key: args.orderKey,
          truck_id: args.truckId,
          hatchgrab_reason: args.reason,
          ...(args.note ? { hatchgrab_note: args.note.slice(0, 400) } : {}),
        },
      },
      { stripeAccount: account, idempotencyKey },
    )
  } catch (err) {
```

🔴 **No `refund_application_fee`, and no `application_fee_amount` on the charge side either — so the call is CORRECT today.**

## C2. The comment added — immediately above the call, inside the `try`

```ts
    // ── 🔴 THE DAY A PLATFORM FEE EXISTS, THIS CALL SILENTLY SHORTCHANGES THE TRUCK ─────────────────
    // CORRECT TODAY, AND ONLY BECAUSE THERE IS NO FEE. `application_fee_amount` is never sent anywhere in
    // this build — authorize.ts and capture.ts both record "absence, never zero", and the commercial model
    // is 0% on every tier. With no fee on the charge there is nothing for a refund to give back.
    // ⚠️ THE TRAP IS STRIPE'S DEFAULT, NOT OUR CODE. On a DIRECT charge, `refunds.create` WITHOUT an
    // explicit `refund_application_fee: true` leaves the application fee WITH THE PLATFORM. So the moment
    // a fee is introduced, this unchanged call refunds the customer in full out of the CONNECTED ACCOUNT
    // while HatchGrab keeps its cut — the truck absorbs the platform's fee on every refund it issues.
    // 🔴 IT FAILS SILENTLY AND IN THE TRUCK'S DISFAVOUR. No error, no refused status, no audit anomaly:
    // the refund succeeds, the customer is made whole, and the shortfall is invisible until someone
    // reconciles a payout by hand. This file's other guards all fail LOUD; this one would not.
    // 🔴 SET `refund_application_fee` IN THE SAME COMMIT THAT INTRODUCES THE FEE — not afterwards, and not
    // as a follow-up ticket. If a fee is ever added and this line is still unchanged, that is the bug.
```

✅ **All four required facts are present:** no fee today · Stripe's default leaves the fee with the platform on a direct-charge refund · `refund_application_fee` must be set the moment a fee is introduced · **the failure is SILENT and costs the TRUCK.**
✅ **Style matched to the file:** `// ── HEADER ────` box rule, `🔴` for the consequence, `⚠️` for the caveat, the same 110-column wrap and the same "state the trap, then the rule" shape as the idempotency-key block above it.

## C3. 🔴 PROOF NOTHING EXECUTABLE CHANGED — `git diff lib/payments/refund.ts`, in full

```diff
diff --git a/lib/payments/refund.ts b/lib/payments/refund.ts
index 36a0e8d..e300a57 100644
--- a/lib/payments/refund.ts
+++ b/lib/payments/refund.ts
@@ -172,6 +172,19 @@ export async function refundOrder(
 
   let refund: Stripe.Refund
   try {
+    // ── 🔴 THE DAY A PLATFORM FEE EXISTS, THIS CALL SILENTLY SHORTCHANGES THE TRUCK ─────────────────
+    // CORRECT TODAY, AND ONLY BECAUSE THERE IS NO FEE. `application_fee_amount` is never sent anywhere in
+    // this build — authorize.ts and capture.ts both record "absence, never zero", and the commercial model
+    // is 0% on every tier. With no fee on the charge there is nothing for a refund to give back.
+    // ⚠️ THE TRAP IS STRIPE'S DEFAULT, NOT OUR CODE. On a DIRECT charge, `refunds.create` WITHOUT an
+    // explicit `refund_application_fee: true` leaves the application fee WITH THE PLATFORM. So the moment
+    // a fee is introduced, this unchanged call refunds the customer in full out of the CONNECTED ACCOUNT
+    // while HatchGrab keeps its cut — the truck absorbs the platform's fee on every refund it issues.
+    // 🔴 IT FAILS SILENTLY AND IN THE TRUCK'S DISFAVOUR. No error, no refused status, no audit anomaly:
+    // the refund succeeds, the customer is made whole, and the shortfall is invisible until someone
+    // reconciles a payout by hand. This file's other guards all fail LOUD; this one would not.
+    // 🔴 SET `refund_application_fee` IN THE SAME COMMIT THAT INTRODUCES THE FEE — not afterwards, and not
+    // as a follow-up ticket. If a fee is ever added and this line is still unchanged, that is the bug.
     refund = await stripe.refunds.create(
       {
         payment_intent: refundable.paymentIntentId,
```

🔴 **THIRTEEN ADDED LINES. EVERY ONE BEGINS WITH `//`. ZERO DELETIONS. ZERO MODIFIED LINES.** The only context lines shown are unchanged. **`stripe.refunds.create`'s arguments, the idempotency key, `stripeAccount`, the catch block and the audit row are all untouched.**

## C4. `tsc`

```
$ npx tsc --noEmit ; echo "tsc exit=$?"
tsc exit=0
```

✅ **Clean, no output.** ⚠️ **AND THAT PROVES ALMOST NOTHING HERE, WHICH IS WORTH SAYING PLAINLY:** a comment cannot fail a type check, so `tsc exit=0` confirms only that the file still parses and that I did not accidentally break the block above or below. **C3's diff is the real proof, not this.** 🔴 **Neither proves the refund path still behaves correctly — nothing was run against Stripe, and nothing should be.**

---

# PART D — INTEGRITY

## D1 / D2. Non-ASCII census, before and after, every difference explained

### `capacitor.config.ts` — 4,307 → 6,599 bytes (+2,292), 74 → 98 lines (+24)

| Codepoint | Name | Before | After | Δ | Explanation |
|---|---|---|---|---|---|
| U+2014 | EM DASH | 7 | 11 | **+4** | four em dashes in the new comment prose |
| U+2192 | RIGHTWARDS ARROW | 1 | 1 | 0 | untouched (the existing `CAP_SERVER_URL unset →` line) |
| U+2500 | BOX DRAWINGS LIGHT HORIZONTAL | 31 | 81 | **+50** | one new `// ── … ────` box rule, matching the file's two existing ones |

🔴 **DISTINCT CLASSES: 3 → 3. GAINED: NONE. LOST: NONE.**
⚠️ **U+26A0 = 0 and U+FE0F = 0 — before and after.** 🔴 **THIS FILE HAS NEVER HELD A WARNING GLYPH OR AN EMOJI MARKER, so the new comment is written with ASCII emphasis only** (`WITHOUT THIS…`, `NOTE:`, `DO NOT`). **Using this repo's usual 🔴/⚠️ markers here would have added three classes to a file that has never had one.**

### `lib/payments/refund.ts` — 14,856 → 16,259 bytes (+1,403), 269 → 282 lines (+13)

| Codepoint | Name | Before | After | Δ | Explanation |
|---|---|---|---|---|---|
| U+00A3 | POUND SIGN | 1 | 1 | 0 | untouched (the "Only £X is left to refund" string) |
| U+2014 | EM DASH | 8 | 11 | **+3** | three em dashes in the new comment |
| U+2500 | BOX DRAWINGS LIGHT HORIZONTAL | 220 | 239 | **+19** | one new box rule, 19 characters long, sized to the file's existing rules |
| U+26A0 | WARNING SIGN | 8 | 9 | **+1** | the one `⚠️ THE TRAP IS STRIPE'S DEFAULT` line |
| U+FE0F | VARIATION SELECTOR-16 | 8 | 9 | **+1** | its invisible pair |
| U+1F534 | LARGE RED CIRCLE | 16 | 19 | **+3** | three 🔴 lines: the header, the silent-failure clause, the instruction |

🔴 **DISTINCT CLASSES: 6 → 6. GAINED: NONE. LOST: NONE.**

> ## ⚠️ THE PAIR CHECK, STATED EXPLICITLY
> **`refund.ts`: U+26A0 = 9, U+FE0F = 9 — PAIRED.** Both rose by exactly one, together.
> **`capacitor.config.ts`: U+26A0 = 0, U+FE0F = 0 — PAIRED (trivially).**
> 🔴 **An unpaired variation selector is invisible in every editor and every diff. Equal counts is the only way to see it, and this is what that check looks like when it passes.**

## D3. Byte scan — byte-level, never `grep`. Includes the files `cap sync` wrote.

| File | Bytes | NUL | Control bytes < 0x09 / 0x0B / 0x0C / 0x0E–0x1F |
|---|---|---|---|
| `capacitor.config.ts` *(edited)* | 6,599 | **0** | **none** |
| `lib/payments/refund.ts` *(edited)* | 16,259 | **0** | **none** |
| `ios/App/App/capacitor.config.json` *(regenerated by `cap sync`)* | 982 | **0** | **none** |
| `android/app/src/main/assets/capacitor.config.json` *(regenerated)* | 770 | **0** | **none** |
| `ios/App/App.xcodeproj/project.pbxproj` *(sync could have touched it)* | 16,075 | **0** | **none** |
| `ios/App/App/PrivacyInfo.xcprivacy` | 4,763 | **0** | **none** |

✅ **Clean throughout.** 🔴 **The two baked JSONs are scanned because a tool wrote them, not me — that is exactly the case the rule exists for.** ✅ **Both are pure ASCII (0 non-ASCII classes).**

## D4. Byte scan of this report — separate pass, AFTER writing

```
docs/allownavigation-report.md   38,811 bytes
  NUL (0x00)                                     : 0
  control bytes < 0x09, plus 0x0B 0x0C 0x0E-0x1F : none
  distinct non-ASCII classes                     : 17
  U+26A0 = 21, U+FE0F = 21                       : PAIRED
```

✅ **Clean.** Byte-level, never `grep`, run as its own pass after the file was written.

## D5. `git status` and `git diff --stat`, pasted

```
$ git status --porcelain
 M capacitor.config.ts
 M docs/reference-manual.md
 M lib/payments/refund.ts
?? docs/manual-audit-report.md
?? docs/manual-update-v11-18-report.md
```

```
$ git diff --stat
 capacitor.config.ts      |  24 +++
 docs/reference-manual.md | 420 ++++++++++++++++++++++++++++++++++++++++++++++-
 lib/payments/refund.ts   |  13 ++
 3 files changed, 449 insertions(+), 8 deletions(-)
```

⚠️ **`docs/reference-manual.md` and the two untracked reports are PRIOR TURNS' work, not this task.** `git diff --numstat` on the manual still reads `412 8`, unchanged. **This task's footprint is exactly `capacitor.config.ts` (+24) and `lib/payments/refund.ts` (+13), plus this report.**
🔴 **Nothing is committed.**

---

# PART E — DEVICE VERIFICATION PLAN

> ## ⚠️ READ THESE TWO BEFORE STARTING
> **0a. A REBUILD AND REINSTALL ARE REQUIRED FIRST.** `allowNavigation` lives in the **compiled bundle** (`ios/App/App/capacitor.config.json`), not on the server. **Nothing below will behave differently until Xcode builds and installs a fresh copy.** Relaunching the app already on the iPad tests the OLD config and will reproduce the old ejection — that is not a failure of this change.
> **0b. THE SHELL LOADS PRODUCTION** (`https://www.hatchgrab.com/app`). **No uncommitted web change is visible on the device** — the refund comment (Part C) cannot be seen there at all, and the access-denied and Contact findings in A4 reflect deployed code. **You are testing the native config only.**
> **0c.** Before test 5, note §36's standing warning: check `van_devices.push_token` **before** placing any test order, because a `BadDeviceToken` erases its own evidence.

**1. Build and install**
- Open `ios/App/App.xcworkspace` in Xcode, build to the iPad, launch.
- **PASS:** the app opens on the HatchGrab launch screen and lands on its remembered surface.
- **FAILURE:** a signing or build error — **stop and report it; do not proceed**, because every test below assumes the new config shipped.

**2. Manage → "Orders dashboard" — 🔴 THE PRIMARY TEST**
- Go to `/manage`, tap the header's **Orders dashboard** control.
- **PASS:** the dashboard opens **inside the app**. The HatchGrab header stays, there is no Safari chrome, no address bar, no "Open in Safari" transition.
- **FAILURE:** Safari opens, or an address bar appears. 🔴 **If it fails, the new config did not ship** — re-check that the build is fresh, then read `ios/App/App/capacitor.config.json` inside the built `App.app`.
- ⚠️ **This test only proves something if `isNativeApp()` happens to read false.** If it reads true, `AppLink` soft-navigates and you have tested nothing about `allowNavigation`. **A pass here is consistent with both.**

**3. Dashboard → "Kitchen screen" — 🔴 EXPECT NO IMPROVEMENT, AND SAY SO IF IT IMPROVES**
- From the dashboard, tap **Kitchen screen** (pick a van if prompted).
- **PASS (expected):** the KDS opens **inside the app** — this is the `router.push` branch, which was never broken.
- **FAILURE:** Safari opens. 🔴 **Per A5 this is still POSSIBLE and `allowNavigation` does not prevent it** — the `window.open('_blank')` branch reaches `createWebViewWith`, which opens Safari unconditionally. **If you see it, that is N42 reproducing, and it is the first reproduction: record the exact sequence, whether it was the first launch after install, and whether the iPad was in Split View.**

**4. The brand logo, both places**
- **4a. On the dashboard/manage header:** tap the HatchGrab wordmark, top left.
  - **PASS:** **nothing happens.** It is identity, not a control (`BrandHomeLink`, `kind="branding"`).
  - **FAILURE:** any navigation at all. 🔴 **Landing on the Village Foodie map is the serious failure** — it means the shell believes it is a browser, which is N42 with a second symptom.
- **4b. On the legal pages** (`/privacy` from Settings, or the in-app legal link): tap the wordmark in the dark header.
  - **PASS:** nothing happens.
  - **FAILURE:** `/landing` opens (the marketing page with its "Coming soon" copy). ⚠️ **If it opens IN the app rather than in Safari, that is `allowNavigation` working as designed on a link that should have been gated — report it as an A4 gap, not as a config fault.**

**5. The Contact chain — the known-ungated control (A4, site 2)**
- From a legal page footer tap **Contact**, then tap **← Back** at the top right.
- **EXPECTED (unchanged by this work):** the Village Foodie map opens **inside the app**, with no way back. **This is a soft `<Link>` and behaved identically before today.**
- **Record what you see and move on. Do not treat it as a regression** — it is the open item A4 documents.

**6. External links still leave — the security half of the test**
- Anywhere an external link exists (a Stripe onboarding link from Payments, or a schedule/calendar link).
- **PASS:** it opens in **Safari**, as before.
- **FAILURE:** it opens inside the WebView. 🔴 **That would mean the allow-list is broader than intended — stop and report; do not continue testing.**

**7. Sanity: cold launch still lands correctly**
- Force-quit and relaunch.
- **PASS:** the app opens on `/app` and routes to the remembered truck/van/screen (or `/login`).
- **FAILURE:** the app opens on the Village Foodie consumer map. 🔴 **That would mean `/app` was lost from `server.url`. It was not (B4), but this is the one-tap check that proves it on the device.**

---

# PROVENANCE

**READ** — `capacitor.config.ts` in full before and after · `lib/payments/refund.ts:164-195` · `WebViewDelegationHandler.swift:67-119` and `:328-333` · `CAPInstanceConfiguration.swift:37-45, 59-77` · `CAPInstanceDescriptor.swift:87` · `CapConfig.java:259` · `Bridge.java:236-255, 389-411` · `BridgeWebViewClient.java:27-30` · `AppLink.tsx` in full · `app/dashboard/[token]/page.tsx:1176-1187` and `:2423-2447` · `app/contact/page.tsx:36-55` · `app/(legal)/layout.tsx:60-113` · both `project.pbxproj` states and both baked JSONs · the full `cap sync` output · `plutil -lint` · both censuses · all six byte scans · `git status`, `git diff`, `git diff --stat`, `git check-ignore`.

**INFERRED** — that a `.allow` decision on a `window.open` proceeds to `createWebViewWith` (A5); that no plugin change means §36's re-audit is not triggered; that the 47-site link sweep in A4 is exhaustive for the four mechanisms searched — **a hard navigation constructed at runtime from a variable would not have matched those patterns.**

**NOT VERIFIED — and it is the whole point of Part E** — 🔴 **nothing here has run on a device.** The fix is reasoned from Capacitor's own source and proven only as far as *the correct value is in the baked config*. **A5's claim that path 2 is fixed is an inference about a code path that has never been observed to fire.**
