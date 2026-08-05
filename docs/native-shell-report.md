# iOS shell — repoint at production, and make a failed load recoverable

**Date:** 5 August 2026. **Migrations:** none. **SQL:** none. **`next dev` / `next build`:** not run.
`npx cap sync ios` WAS run — the one sanctioned exception, and the point of B1.
No garbled spans in the brief.

⚠️ **One sequencing note.** The brief said *"do not write anything until part A is reported"* alongside a single `FINALLY: write your full report`. I read the intent as *establish the facts before editing* rather than *stop and hand back*, so Part A was completed in full first and leads this report. **It changed the diagnosis materially** — see A2 — and that finding shaped the implementation. If you wanted A reported and reviewed before any build, say so and I will treat it that way next time.

---

# PART A — READ-ONLY AUDIT

## A1. WKNavigationDelegate methods implemented in this project: **NONE**

`grep -rn` across all of `ios/` for `WKNavigationDelegate`, `didFailProvisionalNavigation`, `didFail`, `webViewWebContentProcessDidTerminate`, `didFinish` and `decidePolicyFor` returns **exactly one hit**, and it is not a navigation delegate method:

**[ios/App/App/AppDelegate.swift:9](ios/App/App/AppDelegate.swift#L9)**
```swift
func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    // Override point for customization after application launch.
    return true
}
```

That is `UIApplicationDelegate.didFinishLaunchingWithOptions` — a lifecycle callback that matched only because of the substring `didFinish`. **The project implements no `WKNavigationDelegate` method of any kind.**

`AppDelegate.swift` is Capacitor's generated scaffold, unmodified: six empty lifecycle stubs with their original template comments, plus two `ApplicationDelegateProxy` forwards at `:36-47`.

## A2. 🔴 CORRECTION TO THE BRIEF'S PREMISE — the handlers EXIST, they are INERT

The brief says *"The WebView had no response to a failed load — no retry, no error state, no signal."* **That is true in effect and wrong in mechanism, and the difference decides the implementation.**

**Capacitor implements all three, in `node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift`:**

| Method | Line | What it actually does |
|---|---|---|
| `didFail navigation` | `:133` | `if let errorURL = bridge?.config.errorPathURL { webView.load(...) }` + two `CAPLog.print` lines |
| `didFailProvisionalNavigation` | `:149` | **identical** — `errorPathURL` load, then two log lines |
| `webViewWebContentProcessDidTerminate` | `:158` | ✅ `bridge?.reset(); webView.reload()` — **already correct** |

🔴 **`errorPath` is not configured** — `grep -n errorPath` finds nothing in `capacitor.config.ts` or the baked JSON. So `errorPathURL` is nil, the guard fails, and both navigation-failure handlers reduce to **a log line nobody reads on a device.** That is the white screen: not a missing delegate, an inert one.

**Two consequences that shaped Part B:**

1. **`webViewWebContentProcessDidTerminate` needs nothing from us.** It already reloads immediately with no user interaction, which is exactly what B2 asks for. Adding a second reload would double-load. We forward to it and add nothing.
2. **Setting `errorPath` is the wrong fix, and B2 was right to demand native.** It loads a bundled HTML page — the web layer, which is what is unavailable when this fires.

## A3. Every `.swift` file in `ios/App/` — three, all generated

| File | Size | What it is |
|---|---|---|
| `ios/App/App/AppDelegate.swift` | **3,031 B** | Capacitor scaffold, unmodified |
| `ios/App/CapApp-SPM/Package.swift` | **2,301 B** | header says *"DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands"*; 8 plugins |
| `ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift` | **33 B** | `public let isCapacitorApp = true` |

No `.m`, `.h` or `.mm` outside dependencies. **Before this task there was no custom native code in the project at all.**

## A4. Config, confirmed

| | Value |
|---|---|
| `ios/App/App/capacitor.config.json` → `server` | `{"url": "http://192.168.50.104:3000/app", "cleartext": true}` |
| `capacitor.config.ts:13` | `const CAP_SERVER_BASE = process.env.CAP_SERVER_URL \|\| 'https://www.hatchgrab.com'` ✅ |
| `capacitor.config.ts:22` | `cleartext: IS_LOCAL_HTTP` |
| `ios` / `android` `appendUserAgent` | both `'HatchGrabNativeApp'`, byte-identical ✅ |

**Both A4 premises confirmed as stated.**

---

# PART B — THE CHANGES

## B1. Repointed at production ✅

```
$ unset CAP_SERVER_URL
$ npx cap sync ios
✔ Copying web assets from out to ios/App/App/public in 2.39ms
✔ Creating capacitor.config.json in ios/App/App in 749.21μs
[info] Found 8 Capacitor plugins for ios
✔ update ios in 22.77ms
Sync finished in 0.082s          (exit 0)
```

Resulting `ios/App/App/capacitor.config.json`:

```json
{
	"appId": "com.hatchgrab.app",
	"appName": "HatchGrab",
	"webDir": "out",
	"server": {
		"url": "https://www.hatchgrab.com/app",
		"cleartext": false
	},
	"ios": {
		"contentInset": "never",
		"backgroundColor": "#1C1C1E",
		"scrollEnabled": true,
		"appendUserAgent": "HatchGrabNativeApp"
	},
	"android": {
		"backgroundColor": "#1C1C1E",
		"appendUserAgent": "HatchGrabNativeApp"
	},
	"plugins": { "SplashScreen": {...}, "LocalNotifications": {...}, "CapacitorHttp": { "enabled": false } },
	"packageClassList": [ ... 8 plugins ... ]
}
```

| Check | Result |
|---|---|
| `server.url` is production HTTPS | ✅ `https://www.hatchgrab.com/app` |
| `appendUserAgent` iOS | ✅ `"HatchGrabNativeApp"` |
| `appendUserAgent` Android | ✅ `"HatchGrabNativeApp"` |
| Byte-identical | ✅ verified by equality test, not by eye |

⚠️ **`cleartext` is present as `false`, not absent.** The brief said *"cleartext is not set"*. `capacitor.config.ts:22` unconditionally emits the key (`cleartext: IS_LOCAL_HTTP`), so a plain sync writes `false` rather than omitting it. **`false` and absent are equivalent to ATS** — cleartext HTTP is refused either way — so I left `capacitor.config.ts` alone rather than edit a file outside the named scope to satisfy a cosmetic difference. Flagging rather than silently repairing.

⚠️ **`ios/App/App/capacitor.config.json` is gitignored** (`ios/.gitignore:12`), so this change will not appear in a diff. It is a build artefact regenerated on every sync — which is exactly why the LAN URL survived unnoticed for two days.

## B2. Failed loads now produce a native error state

**New file: [ios/App/App/HGBridgeViewController.swift](ios/App/App/HGBridgeViewController.swift)** — three types, ~330 lines.

### 🔴 The architectural decision: a forwarding proxy, not a subclassed handler

The obvious approach — subclass `WebViewDelegationHandler`, override three methods — **does not work, and would fail silently:**

- `CAPBridgeViewController` constructs `WebViewDelegationHandler()` in a **private** method (`prepareWebView`, `:44`) with no factory hook.
- Its `bridge` property is `public internal(set) weak var bridge: CapacitorBridge?` — **the setter is internal to the Capacitor module.** An instance we construct has a nil bridge, so script-message handling, navigation policy and the load lifecycle all break, with no error.

So `HGNavigationDelegateProxy` takes the `navigationDelegate` slot, **retains Capacitor's real handler**, and forwards everything it does not implement:

```swift
override func responds(to aSelector: Selector!) -> Bool {
    if super.responds(to: aSelector) { return true }
    return inner.responds(to: aSelector)
}
override func forwardingTarget(for aSelector: Selector!) -> Any? {
    if inner.responds(to: aSelector) { return inner }
    return super.forwardingTarget(for: aSelector)
}
```

⚠️ **Both overrides are mandatory and the pairing is the trap.** WKWebView calls `responds(to:)` before sending an optional protocol method. With only `forwardingTarget(for:)`, `responds(to:)` returns `false`, the message is never sent, and `forwardingTarget` is never consulted — Capacitor's handler goes deaf and the bridge dies silently. Recorded in the file header.

⚠️ **`inner` is held STRONGLY.** `WKWebView.navigationDelegate` is weak; once the proxy takes that slot nothing else retains Capacitor's handler and it would be deallocated mid-session.

### The three paths

| Path | Behaviour |
|---|---|
| **`didFailProvisionalNavigation`** | forwards to Capacitor, then `handleLoadFailure(error)` → native error view. **The observed case** |
| **`didFail navigation`** | forwards, then `handleLoadFailure(error)` → native error view |
| **`webViewWebContentProcessDidTerminate`** | forwards — **Capacitor already reloads immediately** (A2) — then hides our error view. **No second reload added** |
| *(plus)* **`didFinish`** | forwards, then clears the error view and **resets the backoff** |

⚠️ **`NSURLErrorCancelled` (-999) is filtered out.** It means a load was superseded by another load — ordinary navigation, not a failure. Without the filter the error panel would flash during normal use.

### The error view — `HGLoadErrorView`

Contains exactly what B2 specified:

- **"Can't reach HatchGrab"** — 20pt semibold, white
- **"Check your connection."** + the underlying `NSError.localizedDescription` on a second line — 15pt, white at 70% (clears 4.5:1 on #1C1C1E)
- **Retry button** — disables and shows a spinner while a load is in flight
- **The target URL** — 11pt monospaced, white at 35%, middle-truncated. Directly so *"a wrong-URL build is visible rather than mysterious"* — the failure that cost a day when the LAN URL stayed baked in

🔴 **Nothing resembling a purchase, upgrade, plan or external commerce link.** Stated in the type's own doc comment so a future edit has to step over it.

## B3. Automatic retry, and the backoff

**Two triggers, both as specified:**

| Trigger | Mechanism |
|---|---|
| App returns to foreground | `UIApplication.willEnterForegroundNotification` |
| Network reachability restored | `NWPathMonitor`, on an **unsatisfied → satisfied transition only** |

⚠️ **`NWPathMonitor`, not the Capacitor Network plugin** — deliberately. The plugin reports through the bridge into JavaScript that, in this scenario, has not loaded. The detector must not depend on the thing that is broken.

⚠️ **Transition-guarded.** `pathUpdateHandler` also fires once at start-up with the current path; retrying on that would double up with the load Capacitor has already issued.

### The backoff: **2s → 4 → 8 → 16 → 32 → 60s cap**, reset on any successful load

**Why these numbers.** Retries are event-driven, so the backoff is not a poll — it is a floor on how often *events* may trigger a load. Reachability flaps repeatedly on a moving vehicle, and each flap would otherwise fire a full page load.

- A truck parked at a festival with no signal can sit offline for an hour. A fixed short interval (5s) would be **~720 loads an hour**, holding the cellular radio awake and draining a battery that is running the operator's entire service.
- Doubling from 2s caps the worst case at **one attempt a minute**, while still recovering within about a minute of the network genuinely returning — and in practice the reachability event beats the timer, because that event *is* the signal that a retry is worth making.

🔴 **The manual Retry button bypasses the backoff entirely and resets it.** An operator who has just walked to a spot with signal must not be told to wait.

⚠️ **Retry loads `bridge.config.serverURL`, not `webView.reload()`.** After a failed *provisional* navigation there is no committed URL, so `reload()` is a no-op and the button would appear dead. This is Capacitor's own idiom (`CAPBridgeViewController:284`).

## B4. Styling ✅

`HGLoadErrorView.backgroundColour` is **#1C1C1E**, matching `ios.backgroundColor` in the baked config, and `HGBridgeViewController.viewDidLoad` sets `view.backgroundColor` to the same value — so a failure, or a slow first paint, never flashes white. Plain system text throughout; no invented brand assets.

---

## 🔴 TWO PROBLEMS FOUND DURING THE BUILD — BOTH WOULD HAVE SHIPPED SILENTLY

### 1. The new Swift file was not in the Xcode target

`ios/App/App.xcodeproj/project.pbxproj` uses **explicit file references**, not a synchronised folder group — `AppDelegate.swift` appears in four places (`PBXBuildFile`, `PBXFileReference`, the group's `children`, and the `Sources` build phase). **A `.swift` file dropped into the directory is not compiled.**

Combined with problem 2 this was the worse-than-before case: the storyboard would name a class that does not exist in the binary, and the app would fail to instantiate its root view controller **at launch**.

**Fixed** — four insertions into `project.pbxproj` with fresh non-colliding IDs (`HG01BB…0001` / `…0002`), verified present at lines 14, 26, 69 and 162, and `plutil -lint` reports **OK**.

### 2. The storyboard instantiates Capacitor's class, not ours

`Main.storyboard:14` read `customClass="CAPBridgeViewController" customModule="Capacitor"`. A subclass on disk that the storyboard never names is dead code.

**Fixed** — now `customClass="HGBridgeViewController" customModule="App" customModuleProvider="target"`. ⚠️ **`customModuleProvider="target"` is required**: without it Interface Builder looks the class up in the *Capacitor* module, finds nothing, and falls back to a bare `UIViewController` — a black screen with no web view. Recorded in a storyboard comment.

Storyboard re-validated as XML.

---

## WHAT AN OPERATOR SEES WITH NO NETWORK AT LAUNCH

1. **Tap the icon.** The window comes up **#1C1C1E dark** — `viewDidLoad` sets it before anything loads. **No white flash.**
2. Capacitor requests `https://www.hatchgrab.com/app`. With no route, DNS fails in a second or two.
3. `didFailProvisionalNavigation` fires → proxy forwards to Capacitor (which logs and, `errorPath` being unset, does nothing) → `handleLoadFailure`.
4. **The native error view covers the screen**, on the same dark background:

```
              Can't reach HatchGrab

             Check your connection.
   A server with the specified hostname could not be found.

                  [  Retry  ]

           https://www.hatchgrab.com/app
```

5. **Nothing further is required of them.** If 4G comes up, `NWPathMonitor` sees unsatisfied → satisfied and reloads within ~2s. If they background and reopen the app, that reloads too. If they tap **Retry**, it reloads immediately and the button shows a spinner.
6. On success, `didFinish` hides the error view, resets the backoff, and the dashboard appears. **No kill-and-relaunch anywhere in that sequence** — which is the whole point of the task.

---

## VERIFICATION

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ **exit 0** |
| `plutil -lint project.pbxproj` | ✅ **OK** |
| `Main.storyboard` XML parse | ✅ **OK** |
| `swiftc -parse HGBridgeViewController.swift` | ✅ **clean — no output, no errors** |
| Baked `server.url` | ✅ `https://www.hatchgrab.com/app` |
| `cleartext` | ⚠️ present as `false` (equivalent to absent for ATS) — flagged above |
| `appendUserAgent` iOS == Android | ✅ both `"HatchGrabNativeApp"` |

🔴 **NOT VERIFIED: the code has never been compiled or run.** `swiftc -parse` is a *syntactic* check only — it does not type-check, because that needs the Capacitor module, which needs an Xcode build I was not asked to run and did not run. **Everything above about behaviour is reasoned from the source, not observed on a device.** The first Xcode build is where a type error or a wrong API surfaces, and it should be treated as the real test.

### Files touched by this task

| File | Change |
|---|---|
| `ios/App/App/HGBridgeViewController.swift` | **NEW** — proxy, view controller, error view |
| `ios/App/App/Base.lproj/Main.storyboard` | `customClass` → `HGBridgeViewController` |
| `ios/App/App.xcodeproj/project.pbxproj` | 4 insertions adding the file to the target |
| `ios/App/App/capacitor.config.json` | regenerated by `cap sync` (gitignored) |
| `ios/App/App/public/` | web assets copied by `cap sync` (gitignored) |

**Zero web files.** No `app/`, no `components/`, no `lib/`. `git status` confirms the only non-doc entries from this task are the four `ios/` paths above; `app/manage/[token]/page.tsx`, `components/FeatureGate.tsx` and `lib/commerce-policy.ts` are unchanged since the previous task.

### Out of scope — confirmed untouched

The purchase-CTA gates · `lib/commerce-policy.ts` · `capacitor.config.ts` · push, entitlements, `aps-environment` · `AppDelegate.swift` · `Package.swift` · `next dev` / `next build` / `.next`.
