# Pre-submission housekeeping — launch screen, export compliance, residual native links

Date: 14 August 2026
**Edited: 2 files.** `ios/App/App/Info.plist` (+16 lines) · `app/dashboard/[token]/page.tsx` (+25/−1)
**Diagnosed only, not edited: the launch screen (Part A), as instructed.**
🔴 **ONE PART STOPPED AND NOT DONE: Part C2 — its premise does not match the code.**

No `next dev`, no `next build`, no `cap sync`, no deploy, no archive, no commit.
`plutil -lint: OK` · `tsc --noEmit`: **exit 0, zero output** · **0 NUL, 0 control bytes < 0x09.**

**No span of the prompt arrived garbled.** One instruction (C2) rests on a factual premise that the
code contradicts — handled under C2 below, by stopping rather than choosing.

---

# 🔴 READ FIRST — TWO THINGS

## 1. Part C2 IS NOT DONE. Its premise does not match the code.

C2 describes *"the legal footer's Contact link, **which points at `/`**"*. **It does not point at `/`.**

**READ**, `app/(legal)/layout.tsx:96`:
```tsx
<Link href="/contact" className="hover:text-slate-800 underline">Contact</Link>
```

🔴 **It points at `/contact`.** The links that point at `/` are **two levels down, in a different
file** — `app/contact/page.tsx:39` and `:42`. `docs/completeness-sweep-report.md`, which this task told
me to read first, says so at `:184` and `:191-194`:

> *"legal page → footer `Contact` → `/contact` → its own `<Link href="/">` ×2 → the Village Foodie map."*

**Applying the AppHeader mechanism to the element C2 names would not remove the trap** — it would leave
`app/contact/page.tsx` untouched and the `/` links exactly where they are — **and it would neuter a
working route to a support page**, producing a visible control that does nothing on the compliance
surface. That is the same defect class the 2.1 sweep just cleared.

**Fixing the actual trap means editing `app/contact/page.tsx`, which this task does not name.** Both
readings require me to choose, so **I stopped.** Options are set out in full under Part C2.

## 2. 🔴 THE LAUNCH SCREEN IS CAPACITOR'S LOGO ON WHITE. Nobody had looked.

Not HatchGrab's. Not blank. **The Ionic/Capacitor framework's own blue "X" mark, centred on a white
field** — the unmodified scaffold, byte-dated 12 May. Part A has the image and the evidence.
**Diagnosed only, not touched, as instructed.**

---

# PART A — THE LAUNCH SCREEN (DIAGNOSIS ONLY, NOTHING EDITED)

## A1. `ios/App/App/Base.lproj/LaunchScreen.storyboard` — quoted in full

```xml
<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="17132" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="01J-lp-oVM">
    <device id="retina4_7" orientation="portrait" appearance="light"/>
    <dependencies>
        <deployment identifier="iOS"/>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="17105"/>
        <capability name="System colors in document resources" minToolsVersion="11.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <!--View Controller-->
        <scene sceneID="EHf-IW-A2E">
            <objects>
                <viewController id="01J-lp-oVM" sceneMemberID="viewController">
                    <imageView key="view" userInteractionEnabled="NO" contentMode="scaleAspectFill" horizontalHuggingPriority="251" verticalHuggingPriority="251" image="Splash" id="snD-IY-ifK">
                        <rect key="frame" x="0.0" y="0.0" width="375" height="667"/>
                        <autoresizingMask key="autoresizingMask"/>
                        <color key="backgroundColor" systemColor="systemBackgroundColor"/>
                    </imageView>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="iYj-Kq-Ea1" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
            <point key="canvasLocation" x="53" y="375"/>
        </scene>
    </scenes>
    <resources>
        <image name="Splash" width="1366" height="1366"/>
        <systemColor name="systemBackgroundColor">
            <color white="1" alpha="1" colorSpace="custom" customColorSpace="genericGamma22GrayColorSpace"/>
        </systemColor>
    </resources>
</document>
```

### What a user actually sees on cold launch

| | |
|---|---|
| **Colour** | 🔴 **WHITE.** `systemColor="systemBackgroundColor"`, resolved in the file itself as `white="1" alpha="1"` |
| **Image** | 🔴 **The Capacitor framework logo — a blue "X"/cross mark**, centred, small against the field |
| **Text** | **NONE.** No app name, no wordmark, no strapline |
| **Spinner** | **NONE.** The storyboard has a single `imageView` and nothing else |
| **Interaction** | `userInteractionEnabled="NO"` |

🔴 **IT IS THE UNMODIFIED CAPACITOR SCAFFOLD. Stated plainly, as asked.** The evidence is not just the
look of it:

- The storyboard's mtime is **12 May 21:38** — the project-generation timestamp. `Main.storyboard`
  beside it was edited 5 August; **this one never was.**
- `Splash.imageset` holds **three PNGs, all 2732×2732, all byte-identical** (`sha256` prefix
  `1b5002b74a5500e697298ced` for all three) — Capacitor's generator emits the same file at 1x/2x/3x.
- ⚠️ The storyboard declares `<image name="Splash" width="1366" height="1366"/>` while the actual PNGs
  are **2732×2732**. Cosmetically irrelevant with `scaleAspectFill`, but it is another untouched
  generator artefact.
- **I opened the PNG and looked at it.** It is a blue mark on white, matching Capacitor's brand, not
  HatchGrab's (`#16314F` navy + `#F5A623` amber) and not Village Foodie's.

⚠️ **THE COLOUR CONTRADICTS EVERY OTHER SURFACE.** `capacitor.config.ts` sets
`ios.backgroundColor: '#1C1C1E'`, and `HGBridgeViewController.viewDidLoad` sets the host view to the
same near-black **specifically so a slow first paint "never flashes white"** (its own comment). **The
launch screen then flashes white anyway, because it is a separate storyboard that nothing in that
reasoning touches.**

## A2. The `SplashScreen` config block — 🔴 **IT DOES NOTHING. CONFIRMED THREE WAYS.**

**READ**, `capacitor.config.ts`:
```ts
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#1C1C1E',
      showSpinner: false,
      launchAutoHide: true,
    },
```

| Check | Result |
|---|---|
| `@capacitor/splash-screen` in `package.json`? | 🔴 **NOT FOUND** — `grep -n "splash" package.json` returns nothing |
| Installed in `node_modules`? | 🔴 **NOT INSTALLED** — `node_modules/@capacitor/splash-screen` does not exist |
| In `packageClassList` in `ios/App/App/capacitor.config.json`? | 🔴 **NO.** The list has **8** entries and `SplashScreen` is not among them |
| A `SplashScreenPlugin` class anywhere in the linked packages? | 🔴 **NOT FOUND** |

⚠️ **The block IS in the baked `ios/App/App/capacitor.config.json`** (at `:20`, under `plugins`) —
`cap sync` copies the `plugins` map verbatim without checking that the plugins exist. **So it is present
in the shipped bundle and read by nothing.** `plugins` and `packageClassList` are independent, and only
the second one determines what is compiled in.

🔴 **ALL FOUR VALUES ARE INERT. `launchShowDuration: 1000` does not hold the launch screen for a second;
`launchAutoHide` hides nothing; `showSpinner: false` suppresses a spinner that was never going to
render; `backgroundColor: '#1C1C1E'` does not tint the white storyboard.**

⚠️ **AND THE INERTNESS CUTS THE HELPFUL WAY, WHICH IS WORTH KNOWING BEFORE ANYONE "FIXES" IT.** With no
plugin, **nothing holds the launch screen open** — iOS dismisses it as soon as the first frame is ready,
which here is `viewDidLoad`. **Installing `@capacitor/splash-screen` to style it would activate
`launchShowDuration: 1000` and make the Capacitor logo linger a full second longer than it does today.**
The config is not a latent improvement waiting to be switched on.

## A3. The cold-launch sequence, start to finish

**All five stages READ from source. The durations are INFERRED and explicitly not measured.**

| # | Stage | What is on screen | Ends when |
|---|---|---|---|
| 1 | **Native launch screen** — `Info.plist` `UILaunchStoryboardName = LaunchScreen` | 🔴 **White + the Capacitor logo** | the app's first frame is ready (no plugin holds it) |
| 2 | **`Main.storyboard` → `HGBridgeViewController`** | **Near-black `#1C1C1E`** — `viewDidLoad` sets `view.backgroundColor = HGLoadErrorView.backgroundColour` (`0x1C/0x1C/0x1E`) | the WKWebView paints |
| 3 | **WKWebView loads `https://www.hatchgrab.com/app`** | still near-black behind an empty web view | 🔴 **a network round trip to production completes** |
| 4 | **`/app` renders** (`app/app/page.tsx`) | **`bg-slate-900` with a pulsing `Loading…`** | its `useEffect` finishes routing |
| 5 | **Destination page's own loading gate** — e.g. dashboard `:2395` | **`bg-slate-50` with `Loading dashboard...`** | the dashboard fetch resolves |

**Stage 4 is not instant, and this is the part worth knowing.** `app/app/page.tsx` does, in order:
`isNativeApp()` → `configureStatusBar()` → `hasNativeSession()` → `getNativeAccessToken()` →
`fetch('/api/native/my-trucks?device_id=…')` → `router.replace(...)`. 🔴 **That is a SECOND network
round trip, sequential with the first**, before the operator sees anything resembling their dashboard.
Stage 5 is a third.

### How long is the user looking at something that is not the app?

🔴 **INFERRED, AND I CANNOT MEASURE IT — nothing here was run on a device or a simulator.** What is
structural rather than inferred: **three sequential network-dependent stages** (webview load →
`my-trucks` → dashboard fetch), each on a food-truck's connection, which §11 already treats as
unreliable enough to justify an entire offline outbox. **On a good connection this is a second or two.
On a bad one there is no upper bound**, and the only feedback in stages 3-5 is two different
"Loading" texts on two different backgrounds.

⚠️ **FOUR DISTINCT BACKGROUND COLOURS BEFORE THE APP APPEARS: white → `#1C1C1E` → `slate-900` →
`slate-50`.** The first transition is the jarring one, and it is the one the native code went out of its
way to avoid everywhere else.

## A4. Not fixed. Reported.

**The remedy is a design decision, not a code one, and I have made none of it.** For the record, so the
decision is made against the facts:

- Replacing the splash art is **an asset swap plus a storyboard tint** — no plugin required, and no code.
- 🔴 **Installing `@capacitor/splash-screen` is the option that makes it WORSE by default** (A2), and it
  would add a thirteenth Capacitor dependency days after all twelve were pinned.
- ⚠️ **Apple has no guideline requiring a branded launch screen**, so this is not a rejection risk.
  **It is a first-impression and a credibility one** — the first thing a reviewer sees is another
  company's logo — and 4.0 (Design) is a judgement call a reviewer is entitled to make.

---

# PART B — `Info.plist` EXPORT COMPLIANCE

## B1. The crypto audit — 🔴 **NO CUSTOM CRYPTOGRAPHY. The key was set only after this passed.**

### The app's own native source — **ZERO hits, all eleven symbols**

**READ**, across `AppDelegate.swift`, `HGBridgeViewController.swift`, `CapApp-SPM/Package.swift` and
`CapApp-SPM.swift`:

| Symbol | Hits |
|---|---|
| `CommonCrypto` · `CryptoKit` · `SecKey` · `SecItem` · `Security` | **0** |
| `CCCrypt` · `CC_SHA` · `kSecAttr` | **0** |
| `openssl` · `OpenSSL` · `libcrypto` | **0** |

**The complete import surface of the binary's own code:**
```
AppDelegate.swift            : import UIKit, import Capacitor
HGBridgeViewController.swift : import UIKit, import WebKit, import Network, import Capacitor
```
**No `Security`, no `CryptoKit`, no `CommonCrypto`.** ⚠️ `@aparajita/capacitor-biometric-auth` imports
`LocalAuthentication`, not `Security` — **Face ID is a biometric prompt, not a cryptographic operation.**

### The eight linked plugin packages — **ONE hit, and it is not encryption**

**READ**, `node_modules/@capacitor/ios/Capacitor/Capacitor/AppUUID.swift:1-15`:
```swift
import CommonCrypto
import Foundation

extension Data {
    public var sha256: String {
        var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        self.withUnsafeBytes { bytes in
            _ = CC_SHA256(bytes.baseAddress, CC_LONG(self.count), &digest)
        }
        return hexString(digest.makeIterator())
    }
}
```

🔴 **THIS IS A ONE-WAY HASH, NOT A CIPHER. SHA-256 IS NOT ENCRYPTION** — nothing is encrypted, nothing
can be decrypted, and there is no key. It hashes an install identifier (`CapacitorAppUUID`). **And
`CommonCrypto` is Apple's own system library**, not a bundled third-party implementation, which is the
distinction the export question actually turns on. **Reported rather than buried, because a reader
grepping later will find `import CommonCrypto` and reasonably wonder.**

**No `SecKeyCreate`, no `CCCrypt`, no `SecRandomCopyBytes`, no `import Security` anywhere across the
eight packages.**

### 🔴 The PBKDF2 backup PIN — **JAVASCRIPT, NOT SWIFT. Established, as instructed.**

**READ**, `lib/native/appLock.ts:32-34`:
```ts
async function pbkdf2(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin) as BufferSource, 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 100_000, hash: 'SHA-256' }, key, 256)
```
and its own comment at `:25-26`:
> *"Stored HASHED in native Preferences via Web-Crypto PBKDF2-SHA256 (100k iterations, random 16-byte salt): a webview has no bcrypt, PBKDF2 is the Web-Crypto-native KDF…"*

✅ **`crypto.subtle` is the WebView's Web Crypto API. This is TypeScript in `lib/native/*`, which §11
records as compiling into the WEB BUNDLE despite the folder name** — it is served from
`https://www.hatchgrab.com` and is **not in the binary.** Per B1's own scoping (*"only native code is in
scope for this declaration"*), **it is out of scope.**

⚠️ **AND IT WOULD BE EXEMPT ANYWAY, ON THREE INDEPENDENT GROUNDS** — recorded so the App Store Connect
questionnaire gets the same answer this key does:
1. It is **not in the binary** (above).
2. It is a **key-derivation hash, used solely to verify an unlock PIN** — authentication-only is an
   explicit exemption.
3. It runs on **the OS's own Web Crypto implementation**, not a bundled algorithm.

✅ **Transport is HTTPS only** — `capacitor.config.ts` sets `cleartext: IS_LOCAL_HTTP`, which is `false`
for the production `https://` base, and the shipped `ios/App/App/capacitor.config.json` carries
`"cleartext": false`. **Standard exemption.**

**CONCLUSION: no custom cryptography found, so I did not stop. `ITSAppUsesNonExemptEncryption = false`
is set.**

⚠️ **IT IS A DECLARATION, NOT A DEFAULT.** It must agree with what you answer in App Store Connect, and
**the audit must be re-run if a plugin is added or upgraded** — the reasoning above is a statement about
today's twelve packages, not a property of the app.

## B2. Before and after

**BEFORE** (`ios/App/App/Info.plist`, quoted around the insertion point):
```xml
	<key>CFBundleVersion</key>
	<string>$(CURRENT_PROJECT_VERSION)</string>
	<key>NSFaceIDUsageDescription</key>
	<string>Unlock HatchGrab with Face ID.</string>
```

**AFTER:**
```xml
	<key>CFBundleVersion</key>
	<string>$(CURRENT_PROJECT_VERSION)</string>
	<!-- Export compliance. Without this key App Store Connect asks the encryption question on EVERY
	     upload instead of answering it once, and a wrong answer in a hurry is a compliance statement.
	     AUDITED 14 August 2026 before setting it, and the audit is what makes false defensible:
	       - the app's own Swift (AppDelegate, HGBridgeViewController, CapApp-SPM) has ZERO hits for
	         CommonCrypto, CryptoKit, SecKey, SecItem, Security or any bundled crypto library;
	       - across the eight linked plugin packages the ONLY hit is Capacitor's own AppUUID.swift,
	         which calls CC_SHA256 (Apple's CommonCrypto) to hash an install identifier. A one-way
	         HASH IS NOT ENCRYPTION, and it is Apple's system library, not a bundled implementation;
	       - transport is HTTPS only, which is the standard exemption.
	     The PBKDF2-SHA256 backup PIN is JAVASCRIPT (lib/native/appLock.ts, crypto.subtle) running in
	     the WebView from the remotely-loaded bundle - not native code, not in this binary - and it is
	     authentication-only, which is separately exempt.
	     Full evidence: docs/presubmission-housekeeping-report.md. Re-run the audit if a plugin is
	     added: this key is a declaration, not a default. -->
	<key>ITSAppUsesNonExemptEncryption</key>
	<false/>
	<key>NSFaceIDUsageDescription</key>
	<string>Unlock HatchGrab with Face ID.</string>
```

✅ **Tab-indented to match the surrounding keys**, and placed after `CFBundleVersion` so the rough
alphabetical order of the file is preserved. **Parsed back**, the key reads
`"ITSAppUsesNonExemptEncryption": false` — a real boolean, not the string `"false"`, which is the
mistake this key attracts.

## B3. ✅ Nothing else touched

**`UIRequiredDeviceCapabilities` (`armv7`), `UIBackgroundModes` (absent), `UISupportedInterfaceOrientations`,
`NSFaceIDUsageDescription`, `UILaunchStoryboardName`, `UIMainStoryboardFile` and every `CFBundle*` key
are byte-identical.** The diff is **+16 lines, 0 deletions** — a comment block and one key/value pair.
The three open questions recorded in §36 are still open and still untouched.

---

# PART C — THE RESIDUAL NATIVE LINKS

## C1. ✅ DONE — `app/dashboard/[token]/page.tsx`, the access-denied view (OPERATOR-SIDE)

### AppHeader's mechanism, read first and matched

**READ**, `components/shared/AppHeader.tsx:86-115` — the pattern is a ternary on `isNativeApp()` whose
native branch is a **non-navigating wrapper carrying the identical className and identical children**:
```tsx
          {isNativeApp() ? (
            <span className="shrink-0 z-10">
              <img src={HATCHGRAB_WORDMARK_WHITE_SVG} alt="HatchGrab" width={140} height={31}
                className="object-contain w-[112px] md:w-[140px] h-auto" />
            </span>
          ) : (
          <Link href="/" className="shrink-0 z-10">
            …identical <img>…
          </Link>
          )}
```
**No `mounted` flag** — safe because every renderer gates the component behind a `loading` early-return
whose state starts `true`.

### BEFORE — quoted in full (the file is minified-style, so this is the whole line)

```tsx
  if(error){const _brand=typeof window!=='undefined'&&window.location.hostname.includes('hatchgrab')?'HatchGrab':'Village Foodie';return<div className="min-h-screen bg-slate-50 flex items-center justify-center px-4"><div className="text-center"><p className="text-slate-900 font-bold text-lg mb-2">Access denied</p><p className="text-slate-500 text-sm">{error}</p><Link href="/" className="mt-4 inline-block text-orange-600 text-sm hover:underline">← {_brand}</Link></div></div>}
```

### AFTER — the only substantive change is the ternary

```tsx
  if(error){const _brand=…;return<div …><div className="text-center"><p …>Access denied</p><p …>{error}</p>{isNativeApp()?<span className="mt-4 inline-block text-orange-600 text-sm hover:underline">← {_brand}</span>:<Link href="/" className="mt-4 inline-block text-orange-600 text-sm hover:underline">← {_brand}</Link>}</div></div>}
```

| Check | Result |
|---|---|
| Same mechanism as AppHeader? | ✅ **Yes — `isNativeApp()` ternary, `<span>` for the native branch, className byte-identical between branches, children byte-identical** |
| A second approach invented? | ✅ **No.** No `mounted`, no new predicate, no repoint |
| Web behaviour | ✅ **BYTE-IDENTICAL.** `isNativeApp()` is `Capacitor.isNativePlatform()`, **false in every browser**, so a browser renders the `<Link>` branch — the same element, same `href`, same classes |
| New import needed? | ✅ **No** — `isNativeApp` was already imported at `:52` and is already called at `:192`, `:850`, `:1153` |
| Hydration | ✅ **Safe, and verified rather than assumed:** `:2395` is `if(loading)return…` with `loading` starting `useState(true)` at `:265`, **so this block never appears in server output nor on the first client frame** |
| Gate / route / data path changed? | ✅ **NONE.** No condition, no fetch, no permission, no navigation target on web |

⚠️ **NOT repointed at `/app`.** AppHeader declined the same substitution and recorded why — *"that is
the cold-launch route and it is unverified; a link that lands somewhere unproven is not an improvement
on a link that lands somewhere wrong."* **Matching it exactly means declining it here too.**

### 🔴 KNOWN RESIDUAL — REPORTED, NOT DECIDED

**Matching AppHeader exactly means keeping the children identical, so the native branch still renders
`← HatchGrab` in orange with link styling. It reads as a control and does nothing** — which by the 2.1
rule (*a control a user can see and cannot operate is a defect*) is itself a defect.

✅ **It is still strictly better than what it replaces.** Before: tapping stranded an operator in the
**Village Foodie consumer map** with no back button, needing a force-quit. After: tapping does nothing
and they stay on the error screen. **A dead control is a smaller defect than a trap.**

⚠️ **The alternative — render nothing at all in the app — is a one-line change and is your call, not
mine.** It removes the dead control at the cost of leaving the error screen with no affordance
whatsoever. **I did not choose between them**, because C1 said to match AppHeader exactly.

⚠️ **The label already disagreed with the destination before this change**: `_brand` computes
*"HatchGrab"* from the hostname while the `href` went to Village Foodie. **The label is computed; the
`href` was not.** That mismatch is now moot in the app and unchanged on the web.

### ⚠️ CUSTOMER-SIDE — REPORTED SEPARATELY, NOT GENERALISED, NOT TOUCHED

**The customer order page has its own, different header with its own `<Link href="/">` —
`app/trucks/[slug]/order/page.tsx:4071`.** 🔴 **It is NOT the same component and was NOT changed.**
It does not need to be: **customers are never in the native shell** — they order in a browser, where a
link to the discovery map is correct behaviour with a working back button. **A fact about the operator
header is not a fact about the customer header.**

## C2. 🔴 STOPPED — NOT DONE. The instruction's premise is contradicted by the code.

**The file, quoted before changing it — and it was not changed.** `app/(legal)/layout.tsx:93-98`:
```tsx
          <Link href={PRIVACY_PATH} className="hover:text-slate-800 underline">Privacy</Link>
          <Link href={TERMS_PATH} className="hover:text-slate-800 underline">Terms</Link>
          <Link href="/contact" className="hover:text-slate-800 underline">Contact</Link>
          <span className="text-slate-400">HatchGrab</span>
```

🔴 **`href="/contact"`. Not `href="/"`.** C2 states the link *"points at `/`"*; **it does not.**

**Where the `/` links actually are — READ, `app/contact/page.tsx`:**
```tsx
39:          <Link href="/" className="text-xl font-bold flex items-center gap-2 hover:opacity-80 transition-opacity">
42:          <Link href="/" className="text-xs font-bold bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors border border-slate-700">
```

**Why I stopped instead of choosing:**

| Reading | What it would do | Why I did not take it |
|---|---|---|
| **(a) Neuter the footer's `Contact` link** — the element C2 names | 🔴 **Does not remove the trap** — `app/contact/page.tsx:39,:42` are untouched and still point at `/` | It also **destroys a working route to a support page**, leaving a visible control that does nothing **on the compliance surface**. That is the 2.1 defect class the sweep just cleared, introduced deliberately |
| **(b) Fix `app/contact/page.tsx:39,:42`** — where the `/` links are | ✅ Actually removes the trap | 🔴 **A different file, not named anywhere in this task.** Editing it is outside the stated scope |
| **(c) Both** | — | Combines the objection to (a) with the scope breach of (b) |

⚠️ **C3 anticipated a stop for a different reason** (*"if the Contact link turns out to be in a server
component with no existing native check"*). **That is not the situation.** `app/(legal)/layout.tsx` is
already `'use client'` with `mounted` at `:52` and `inApp = mounted && isNativeApp()` at `:54`, and the
logo at `:75` already uses it. **Reusing `inApp` would have been trivial — the blocker is not the
mechanism, it is that the named element is not the one with the defect.**

**What a decision needs to cover, stated so you can answer it in one line:** whether `/contact` should
be **reachable in the app at all** (it is the only support route from the legal pages), and if it
should, whether **its own two `<Link href="/">` should be made non-navigating in native** — which is the
same mechanism, applied one file further down.

---

# PART D — INTEGRITY

## D1 / D2. Non-ASCII census, before and after, per file

### `ios/App/App/Info.plist`

| | Bytes | Lines | Distinct non-ASCII |
|---|---|---|---|
| **BEFORE** | 1,761 | 53 | **0** (pure ASCII) |
| **AFTER** | 3,063 | 69 | **0** (pure ASCII) |

**GAINED classes: NONE. LOST classes: NONE. No codepoint count changed at all.**
**Explained:** +1,302 bytes / +16 lines are the comment block and the key/value pair, **written
deliberately ASCII-only** — the comment uses the words *"not native code"* and a plain hyphen rather
than an em dash, so a pure-ASCII file stays pure ASCII. **A plist is exactly the file where a stray
smart quote would be least visible.**

### `app/dashboard/[token]/page.tsx`

| | Bytes | Lines | Distinct non-ASCII |
|---|---|---|---|
| **BEFORE** | 364,164 | 4,754 | **53** |
| **AFTER** | 366,542 | 4,777 | **53** |

**GAINED classes: NONE. LOST classes: NONE.**

**Every changed count explained:**

| Codepoint | Before → After | Why |
|---|---|---|
| `U+2014` — | 470 → 476 **(+6)** | six em dashes in the new comment block, matching the file's existing comment style |
| `U+26A0` ⚠ | 48 → 53 **(+5)** | five warning markers in the comment |
| `U+FE0F` | 46 → 51 **(+5)** | ✅ **the variation selector moves in lockstep with U+26A0 — the ⚠️ pairs are balanced, none half-written** |
| `U+1F534` 🔴 | 59 → 62 **(+3)** | three red markers in the comment |
| `U+2190` ← | **1 → 2 (+1)** | 🔴 **the one that matters: the back arrow now appears TWICE because the label is duplicated across the two ternary branches.** Expected, and it is the arithmetic proof that the children really are identical in both branches |

⚠️ **Every codepoint used was already present in this file.** No class was introduced — the check that
caught a `§` in `AppHeader.tsx` earlier today.

## D3. Byte scan — byte-level tool, never grep

Grep goes silent on a NUL-bearing file and the silence is indistinguishable from "no matches".

| File | NUL (0x00) | Ctrl < 0x09 | Other C0 (0x0B-0x1F, 0x7F) | Bytes |
|---|---|---|---|---|
| `ios/App/App/Info.plist` | **0** | **0** | **0** | 3,063 |
| `app/dashboard/[token]/page.tsx` | **0** | **0** | **0** | 366,542 |

**No file was created this task, so these two are the complete set.**

## D4. This report — separate post-write pass

*(Run after the file was on disk; result stated in the session output.)*

## D5. `git status` and `git diff --stat`

```
$ git status --porcelain
 M app/(legal)/layout.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/shared/AppHeader.tsx
 M docs/reference-manual.md
 M ios/App/App.xcodeproj/project.pbxproj
 M ios/App/App/Info.plist
 M lib/plan-features.ts
 M package.json
?? docs/appstore-completeness-report.md
?? docs/appstore-report.md
?? docs/completeness-sweep-report.md
?? docs/dependency-pin-report.md
?? docs/privacy-manifest-report.md
?? ios/App/App/PrivacyInfo.xcprivacy

$ git diff --stat ios/App/App/Info.plist "app/dashboard/[token]/page.tsx"
 app/dashboard/[token]/page.tsx | 25 ++++++++++++++++++++++++-
 ios/App/App/Info.plist         | 16 ++++++++++++++++
 2 files changed, 40 insertions(+), 1 deletion(-)
```

🔴 **THIS TASK'S CHANGES ARE EXACTLY THOSE TWO FILES.** The other seven modified files and the six
untracked ones are earlier tasks', unchanged here. **`app/(legal)/layout.tsx` appears in the list
because of the EARLIER task — this task did not touch it, which is the point of C2.**

**The single deletion is the old `<Link>` line, replaced by the ternary line.**

## D6. ✅ `Info.plist` is still a valid plist — PROVED, not eyeballed

```
$ plutil -lint ios/App/App/Info.plist
ios/App/App/Info.plist: OK
```
**And parsed back**, which lint alone does not prove:
```json
"ITSAppUsesNonExemptEncryption": false,
"UIRequiredDeviceCapabilities": ["armv7"],
"NSFaceIDUsageDescription": "Unlock HatchGrab with Face ID.",
"UILaunchStoryboardName": "LaunchScreen",
"UIMainStoryboardFile": "Main"
```
✅ **A real boolean `false`, not the string `"false"`** — and every pre-existing key still present with
its original value.

## D7. ✅ `tsc --noEmit`: **EXIT 0, ZERO OUTPUT**

```
$ npx tsc --noEmit
tsc EXIT CODE: 0
output lines: 0
```

🔴 **TSC-CLEAN IS NOT VERIFICATION. IT MEANS IT COMPILES AND NOTHING MORE.** Stated explicitly because
it is the easiest thing in this report to over-read:

- It does **not** prove the native branch ever renders — **it has never been executed**, on any device
  or simulator.
- It does **not** prove the web branch is unchanged at runtime; that is an argument from
  `isNativeApp()` being false in browsers, **not a measurement**.
- It does **not** see the `Info.plist` at all.
- The same compiler was clean over a file containing a literal NUL byte earlier today.

---

# WHAT I HAVE NOT DONE

1. **Nothing was rendered.** No browser, no simulator, no iPad, no iPhone, no build, no archive. **Every
   claim about appearance is read from markup and classes** — except the launch-screen artwork, which I
   opened and looked at directly.
2. **Part C2 is not done** and is the only instruction in this task that was not carried out. See C2.
3. **The launch screen was not touched**, as instructed — and A2 is a warning that the obvious remedy
   makes it worse by default.
4. **I did not measure the cold-launch duration.** A3's timings are INFERRED from the structure; the
   three sequential network stages are READ.
5. **I did not audit the web bundle for `getUserMedia` or geolocation** — §36 already records that gap,
   and it is a different task.
6. **`ITSAppUsesNonExemptEncryption` is set but not exercised.** ⚠️ **The first proof that it removes
   the per-upload prompt is an upload, and none has happened.**
7. **I did not touch `UIRequiredDeviceCapabilities`, `UIBackgroundModes`, or any other plist key**, per
   B3.
