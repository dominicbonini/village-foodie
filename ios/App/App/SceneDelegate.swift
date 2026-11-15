//
//  SceneDelegate.swift
//  HatchGrab
//
//  ── WHY THIS FILE EXISTS (ios-uiscene-1, 15 November 2026, docs/ios-uiscene-1-report.md) ──────────────
//  Apps built with the Xcode 27 SDK must use the UIScene life cycle: a build without it fails to launch on
//  iOS 26.5 / 27 with "UIScene life cycle is required for app". This is Capacitor 8.5+'s documented
//  adoption (https://capacitorjs.com/docs/updating/8-5): Info.plist's UIApplicationSceneManifest names this
//  class, AppDelegate's configurationForConnecting returns it, and every scene callback is forwarded to
//  Capacitor's SceneDelegateProxy, which posts the same notifications the App plugin already observes
//  (.capacitorOpenURL / .capacitorOpenUniversalLink) and fills App.getLaunchUrl().
//
//  ── THE ONE DIFFERENCE FROM CAPACITOR'S TEMPLATE ──────────────────────────────────────────────────────
//  The template builds a plain `CAPBridgeViewController()` in code. This app's bridge is
//  HGBridgeViewController (the native "couldn't load" screen with automatic retry — see that file), named in
//  Main.storyboard. The scene manifest keeps `UISceneStoryboardFile = Main`, so UIKit builds the window and
//  the storyboard's HGBridgeViewController and hands the window to `window` before this method runs. We
//  keep that window: ONE bridge, from the same place as before. Only if no storyboard window exists (a
//  storyboard renamed or removed by mistake) do we build an HGBridgeViewController in code — never a plain
//  CAPBridgeViewController, which would silently drop the error screen.
//
//  What still lives in AppDelegate: APNs registration (didRegister / didFailToRegister — app-wide, not
//  per-scene) and configurationForConnecting. iOS no longer calls AppDelegate's open-URL / continue-activity
//  or foreground / background methods once a scene manifest exists; this file receives them instead.
//
import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        if window == nil {
            // Fallback only: Main.storyboard normally provides the window and HGBridgeViewController.
            let window = UIWindow(windowScene: windowScene)
            window.rootViewController = HGBridgeViewController()
            self.window = window
            window.makeKeyAndVisible()
        }

        // Cold-start URL / universal link: Capacitor delivers it once the plugins are loaded.
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    // A URL opened while the app is running (warm start) — forwarded to Capacitor's App plugin path.
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    // A universal link / Handoff activity while running — forwarded likewise.
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
