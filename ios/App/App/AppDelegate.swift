import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - APNs registration
    //
    // THE BRIDGE BETWEEN iOS AND @capacitor/push-notifications. Without these two methods the plugin
    // never learns the device token, and NOTHING reports that.
    //
    // WHAT WAS BROKEN, AND FOR HOW LONG. `van_devices.push_token` was NULL on every iOS row since the
    // app was first installed. The JS side was correct throughout: listeners attached AND awaited
    // before requestPermissions() and register() (lib/native/push.ts), the endpoint allow-lists
    // push_token (app/api/native/bind-device), and both entitlements carry aps-environment. The break
    // was here. PushNotifications.register() calls UIApplication.shared.registerForRemoteNotifications(),
    // iOS negotiates with APNs, and APNs hands the token to
    // application(_:didRegisterForRemoteNotificationsWithDeviceToken:) on THIS delegate. That method did
    // not exist, so the default no-op ran and the token was discarded inside the app process.
    //
    // WHY IT WAS INVISIBLE. The plugin observes NotificationCenter, and the ONLY thing in the whole tree
    // that posts these two notifications is the plugin's own README - i.e. this install step. Capacitor
    // core merely DECLARES the names (CAPNotifications.swift). With nothing posting them, the plugin's
    // `registration` event never fired AND NEITHER DID `registrationError`, so the one console.warn that
    // would have reported a fault could never print. The absence of an error was the symptom.
    // Diagnosis and evidence: docs/push-registration-report.md.
    //
    // Signatures and notification names are copied VERBATIM from the plugin's documented install step
    // (node_modules/@capacitor/push-notifications/README.md) - not written from memory. Do not rename
    // the parameters: these are UIApplicationDelegate methods matched by selector, and a changed
    // external label makes them silently stop being called, which reproduces this exact bug.
    //
    // Android does not use this path at all (FCM), which is why Android worked and iOS never has.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    // BOTH METHODS, DELIBERATELY. The failure path matters as much as the success path: the plugin's
    // observer turns this post into a `registrationError` event, which is what surfaces "no
    // aps-environment", a denied permission at the system level, or an APNs network failure. Omitting it
    // leaves a registration failure completely silent - the condition that hid the defect above.
    // The plugin's observer reads `notification.object as? Error` and returns early if it is not one, so
    // the error MUST be passed as the object.
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
