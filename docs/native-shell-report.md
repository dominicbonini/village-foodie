# iPad display defects — third pass, with the scroll and per-tab evidence

**Date:** 5 August 2026. **Read-only.** Nothing changed. No `cap sync`, no `next dev`, no `next build`.
Supersedes both previous native-shell reports.

---

## 🔴 THE NEW EVIDENCE SETTLES IT, AND I AM RETRACTING BOTH EARLIER CONCLUSIONS

> *"The header is visible in the + Add order tab but disappears in Orders, Menu & Stock and Settings. The right-hand strip only goes blank when you scroll down — at the top of the page the side of the screen is correctly visible."*

**Both defects are SCROLL-DEPENDENT and TAB-DEPENDENT. A wrong WKWebView frame is neither.** A mis-sized native frame is constant: identical in every tab, identical at every scroll offset, wrong from the first paint. What you are describing changes with scroll position and changes between tabs of the *same* page in the *same* WebView.

**This is the web layer. The native shell is exonerated.**

| Report | Named cause | Status |
|---|---|---|
| 1st | `resizeWebView`'s `keyWindow.bounds` divergence | 🔴 **RETRACTED** — full-screen it yields a correct frame, and it is never called without a rotation |
| 2nd | My error view pinned to the WKWebView | 🔴 **RETRACTED** — it is a static full-bleed overlay. It cannot appear only after scrolling, and cannot differ between tabs |
| **3rd (this)** | **The app-shell scroll container in CSS** | see below |

---

## THE DIRECT CORRESPONDENCE — one line explains the tab split exactly

**[app/dashboard/[token]/page.tsx:2505](app/dashboard/[token]/page.tsx#L2505):**

```tsx
<main className={`w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto flex-1 min-h-0 ${
  activeTab==='add' ? 'overflow-hidden px-4' : 'overflow-y-auto px-4 py-4 pb-20'
}`}>
```

| Tab | `<main>` | Your report |
|---|---|---|
| **+ Add order** (`'add'`) | **`overflow-hidden`** — does not scroll | ✅ **header visible** |
| **Orders** (`'orders'`) | `overflow-y-auto` — scrolls | 🔴 header disappears |
| **Menu & Stock** (`'stock'`) | `overflow-y-auto` — scrolls | 🔴 header disappears |
| **Settings** (`'settings'`) | `overflow-y-auto` — scrolls | 🔴 header disappears |

🔴 **The one tab that works is the one tab whose `<main>` does not scroll.** That is not a coincidence available to any native-frame explanation, and it is a four-for-four match against what you observed. The Manage page has the same shell with **no** `overflow-hidden` branch ([manage:562](app/manage/[token]/page.tsx#L562)), which is why its Settings tab shows it too.

**Both defects therefore have one locus: what happens when `<main>` scrolls inside this shell, in the WKWebView.**

## THE SHELL, AND WHERE THE WHITE COMES FROM

**[dashboard:2262](app/dashboard/[token]/page.tsx#L2262)** and **[manage:511](app/manage/[token]/page.tsx#L511)** are byte-identical:

```tsx
<div className="bg-slate-50 h-dvh flex flex-col overflow-hidden">
```

- **`bg-slate-50` is `#f8fafc`** — for practical purposes **white**. 🔴 **Any strip where the dark header is not painted shows this**, and `StatusBar.setStyle({ style: Style.Dark })` ([statusBar.ts:50](lib/native/statusBar.ts#L50)) correctly paints *light* status-bar text over it. **That is the white band with light text, exactly as reported** — the status-bar style is working; it is the header that is not there.
- **`h-dvh` + `overflow-hidden`** on the root, with the header and tab bar as `shrink-0` siblings and `<main>` as `flex-1 min-h-0`.

**[AppHeader.tsx:21-25](components/shared/AppHeader.tsx#L21):**

```tsx
<header
  className="bg-slate-900 sticky top-0 z-50 shadow-md"
  style={{ paddingTop: 'env(safe-area-inset-top)' }}
>
```

⚠️ **`position: sticky` here is vestigial and misleading.** The header is a flex child of a non-scrolling `overflow-hidden` container — **there is no scrollport for it to stick to**. It stays put because the shell does not scroll, not because it is sticky. But `sticky` + `z-50` **does** create a stacking context and promotes it to its own compositing layer, which is a live participant in how WebKit tiles and repaints the neighbouring scroller.

## WHAT BEST EXPLAINS BOTH, NOW

**The layout viewport is larger than the region WebKit is actually painting, and the divergence only becomes visible once the composited scroller in `<main>` starts scrolling.**

That is your original hypothesis — frame versus painted surface — **but arising at the CSS/compositing level, not from a native frame assignment.** It fits every fact:

| Fact | Fit |
|---|---|
| Right strip blank **only after scrolling** | ✅ A composited scrolling layer paints in tiles. A tile grid narrower than the element leaves an unpainted band at the right edge that appears as soon as the layer scrolls, with a clean vertical edge at a fixed x, cutting elements mid-flow |
| Same x on every card | ✅ A tile/layer boundary is a fixed geometric edge, not a per-element one |
| Correct at the top of the page | ✅ Before any scroll the initial paint covers the visible rect |
| Header fine in `add`, gone in the other three | ✅ `overflow-hidden` creates no scrolling layer at all |
| White band with light status-bar text | ✅ `bg-slate-50` shell showing where the dark header is not painted |

**The ingredients that make this shell unusual in a WKWebView**, all present together: `h-dvh` (a dynamic-viewport unit) on an `overflow-hidden` root, `viewport-fit: cover` ([app/layout.tsx:71](app/layout.tsx#L71)), `contentInsetAdjustmentBehavior = .never` ([CAPBridgeViewController:302](node_modules/@capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift#L302)), `env(safe-area-inset-top)` padding on a `sticky`/`z-50` composited header, and a `flex-1 min-h-0` scroller beneath it. **`dvh` and the safe area both resolve against the visual viewport; the composited scroller is sized from the layout viewport.** Where those disagree by the safe-area amount, you get exactly a fixed-width unpainted band and a header that is not where the shell thinks it is.

⚠️ **I cannot prove the WebKit internals from this repo**, and I am not going to assert them. What I *can* state with confidence is the locus and the discriminator, both of which are now evidenced rather than inferred.

## ANSWERS TO THE SEVEN QUESTIONS (short, since the locus has moved)

1. **`resizeWebView` traced** — [StatusBar.swift:126-149](node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBar.swift#L126). Full-screen iPad: `statusBarHeight` 24, `safeAreaTop` 24 → `origin.y = 24-24 = 0`, `height -= 0`. **Correct frame.** (20/20 on a home-button iPad; a stale `safeAreaTop` of 0 also gives 0.) **Not the cause.**
2. **Triggers** — `handleViewWillTransition` ([:38](node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBar.swift#L38)), `hide` ([:70](node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBar.swift#L70)), `show` ([:82](node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBar.swift#L82)), `setOverlaysWebView` ([:123](node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBar.swift#L123)). Our code calls only `setOverlaysWebView(true)` and `setStyle`. 🔴 **`isOverlayingWebview` defaults to `true` ([:7](node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBar.swift#L7)), so the overlay call early-returns and `resizeWebView` is never reached without a rotation.** (`statusBar.ts:21-22` calls that overlay call *"LOAD-BEARING ON iOS"* — **it is inert on 8.0.2.** Flagged, not fixed.)
3. **The 100 ms timer** — fires from `viewWillTransition`, *before* the transition; an animated rotation is ~0.3 s, so it lands mid-flight. 🔴 **Nothing re-validates**: no second sample, no `viewDidLayoutSubviews` anywhere in Capacitor iOS (grep: zero hits), no bounds observer. A frame computed from mid-transition values is final until the next transition. **Fragile in principle — meets your standard for a fix — but not this bug.**
4. **The error view** — added to `view`, which **is** the WKWebView ([CAPBridgeViewController:45](node_modules/@capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift#L45)); four edge constraints ([:209-214](ios/App/App/HGBridgeViewController.swift#L209)); `hideErrorView` sets `isHidden = true` only ([:218-220](ios/App/App/HGBridgeViewController.swift#L218)), so **it stays in the hierarchy with active constraints**. ⚠️ Unsupported (WKWebView's subview tree is private) and worth removing on its own merits — **but a static full-bleed overlay cannot produce a scroll-dependent, tab-dependent artefact.** 🔴 **Excluded as the cause.**
5. **Anything else touching frame/insets** — grepped every installed plugin. **Only `@capacitor/status-bar`** (lines 133, 134, 139, 149, 153). ✅ **`@capacitor/keyboard` is NOT installed** — absent from `node_modules` and `package.json`. The other seven plugins touch no layout.
6. **`contentInset: 'never'`** — sets `contentInsetAdjustmentBehavior = .never`, so the **web layer** owns the safe-area inset via `env()`. It does not feed `resizeWebView`'s arithmetic (`safeAreaInsets` is a different property), but both claim the same top strip, so they are latent competitors. 🔴 **Now materially relevant**: `.never` plus `viewport-fit: cover` is precisely the configuration in which the visual and layout viewports can diverge by the safe-area amount — the mismatch this bug is made of.
7. **Version — `@capacitor/status-bar` 8.0.2.** `package.json:24` declares `^8.0.2`; `package-lock.json` pins `8.0.2`. 🔴 **I cannot say whether 8.0.3 differs** — it is not installed and fetching it is a write this read-only pass forbids. ⚠️ `^8.0.2` would accept 8.0.3 on a fresh install, so a clean checkout could differ from this machine. Worth `npm view @capacitor/status-bar versions` outside a read-only pass.

---

## THE DISCRIMINATING TESTS — all web-side now, none needs a code change

1. 🔴 **Safari Web Inspector on a scrolling tab, scrolled down.** Read `document.documentElement.clientWidth`, `window.innerWidth`, `window.visualViewport.width` and `document.querySelector('main').clientWidth`. **If `visualViewport.width` is less than `innerWidth`/`clientWidth`, the divergence is confirmed and its size should equal the blank strip.** This is the decisive measurement.
2. **Toggle `overflow-y-auto` → `overflow-hidden` on `<main>` in the Inspector** while on the Orders tab. If the header returns and the strip fills, the scroll container is confirmed as the trigger — matching the `add`-tab behaviour.
3. **Set the shell root's `h-dvh` to `h-full` or a pixel height in the Inspector.** If both defects clear, the dynamic-viewport unit is implicated.
4. **Remove `paddingTop: env(safe-area-inset-top)` from the header in the Inspector.** If the white band closes up, the safe-area path owns the top defect.
5. **Compare against Safari on the same URL at the same scroll offset** — `https://www.hatchgrab.com/dashboard/<token>`. Safari has no `viewport-fit: cover` safe-area inset and no `contentInset: 'never'`, so if the strip is absent there it isolates the webview configuration rather than the CSS alone.

## WHAT I GOT WRONG, AND WHY

Both earlier reports reasoned from the native side because that is where the build changed, and I did not have the two facts that discriminate: **scroll-dependence** and **the per-tab split**. Either one alone rules out a static native frame; together they point at one line of CSS. ⚠️ **I should have asked for them before naming a cause the first time** — "is it constant, or does it change with scroll?" is a one-line question that would have redirected the first pass. Recording that rather than quietly moving on.

**Still true and still worth fixing on their own merits, independent of this bug:** `resizeWebView`'s snapshot-on-a-timer sizing (§1, §3), the inert `setOverlaysWebView` call whose comment claims it is load-bearing (§2), and my error view attached to the WKWebView (§4).

### Not determined

- **The exact WebKit compositing behaviour.** Named as the class of fault, with the measurement that would confirm it; not asserted as mechanism.
- **Whether the deployed web build differs from your working tree.** The same build moved the app from the LAN dev server to production, so the WebView is running different code than before regardless. `HEAD` is now `29c3e06`.
- **Nothing was run on a device.** Everything here is read from source.
