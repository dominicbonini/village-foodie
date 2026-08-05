//
//  HGBridgeViewController.swift
//  HatchGrab
//
//  ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────────────────────────────
//  The shell is a REMOTE-URL WKWebView: everything the operator sees is fetched from
//  https://www.hatchgrab.com/app at launch. If that fetch fails, WKWebView renders NOTHING and does not
//  retry. Observed in the field: the app sat on a blank screen for over a day and only a full
//  kill-and-relaunch recovered it.
//
//  🔴 CAPACITOR ALREADY IMPLEMENTS THE THREE FAILURE CALLBACKS — THEY ARE JUST INERT HERE.
//  WebViewDelegationHandler.swift implements didFail (:133), didFailProvisionalNavigation (:149) and
//  webViewWebContentProcessDidTerminate (:158). The first two do this:
//
//      if let errorURL = bridge?.config.errorPathURL { webView.load(URLRequest(url: errorURL)) }
//      CAPLog.print("⚡️  WebView failed provisional navigation")
//
//  `errorPath` is NOT configured in capacitor.config.ts, so `errorPathURL` is nil and the entire body
//  reduces to a log line nobody reads on a device. THAT is the white screen — not a missing delegate.
//  ⚠️ Do not "fix" this by setting `errorPath`: that loads a bundled HTML page, and the web layer is
//  precisely what is unavailable when this fires. The error state has to be NATIVE.
//
//  ✅ webViewWebContentProcessDidTerminate is the exception — Capacitor already does the right thing
//  (`bridge?.reset(); webView.reload()`). We forward to it and add nothing but hiding our own error view.
//
//  ── WHY A FORWARDING PROXY AND NOT A SUBCLASSED HANDLER ────────────────────────────────────────────
//  The obvious approach is to subclass WebViewDelegationHandler and override the three methods. It does
//  not work: CAPBridgeViewController constructs `WebViewDelegationHandler()` in a PRIVATE method
//  (`prepareWebView`, :44) with no factory hook, and the handler's `bridge` property is
//  `public internal(set)` — so a subclass instance we construct ourselves would have a nil bridge and
//  would silently break script-message handling, navigation policy and the load lifecycle.
//  Instead we install a proxy that RETAINS Capacitor's real handler and forwards every selector it does
//  not implement, via `forwardingTarget(for:)` + `responds(to:)`. Capacitor's behaviour is unchanged;
//  we observe three events and add a native error view on top.
//
//  ⚠️ `responds(to:)` MUST be overridden alongside `forwardingTarget(for:)`. WKWebView asks
//  `responds(to:)` before sending an optional protocol method; without the override it gets `false` and
//  never sends the message, so `forwardingTarget(for:)` is never consulted and Capacitor's handler goes
//  deaf. Overriding one without the other is a silent, total break of the bridge.
//
import UIKit
import WebKit
import Network
import Capacitor

// MARK: - Navigation delegate proxy

/// Sits between WKWebView and Capacitor's own `WebViewDelegationHandler`. Everything it does not
/// implement is forwarded to Capacitor untouched; the three failure callbacks are observed and passed on.
final class HGNavigationDelegateProxy: NSObject, WKNavigationDelegate {

    /// Capacitor's real delegate. Held STRONGLY: `WKWebView.navigationDelegate` is weak, so once we take
    /// that slot nothing else retains Capacitor's handler and it would be deallocated mid-session.
    private let inner: WKNavigationDelegate
    private weak var owner: HGBridgeViewController?

    init(inner: WKNavigationDelegate, owner: HGBridgeViewController) {
        self.inner = inner
        self.owner = owner
        super.init()
    }

    // MARK: Forwarding — see the header note; both overrides are required, neither is optional.

    override func responds(to aSelector: Selector!) -> Bool {
        if super.responds(to: aSelector) { return true }
        return inner.responds(to: aSelector)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if inner.responds(to: aSelector) { return inner }
        return super.forwardingTarget(for: aSelector)
    }

    // MARK: The three we care about

    /// The load never started — DNS failure, no route, host unreachable. This is the observed case: a
    /// truck whose 4G has not come up by the time the app launches.
    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        inner.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
        owner?.handleLoadFailure(error)
    }

    /// The load started and then broke mid-flight.
    func webView(_ webView: WKWebView,
                 didFail navigation: WKNavigation!,
                 withError error: Error) {
        inner.webView?(webView, didFail: navigation, withError: error)
        owner?.handleLoadFailure(error)
    }

    /// A load completed — clear any error state and reset the backoff.
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        inner.webView?(webView, didFinish: navigation)
        owner?.handleLoadSuccess()
    }

    /// The content process died. ✅ Capacitor's handler already calls `bridge?.reset()` and
    /// `webView.reload()`, which is exactly the required behaviour — immediate, no user interaction. We
    /// forward to it rather than reloading a second time, and only clear our own error view.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        inner.webViewWebContentProcessDidTerminate?(webView)
        owner?.handleContentProcessTermination()
    }
}

// MARK: - Bridge view controller

/// Capacitor's bridge VC plus a native failure state. Installed via Main.storyboard's `customClass`.
class HGBridgeViewController: CAPBridgeViewController {

    private var errorView: HGLoadErrorView?
    private var proxy: HGNavigationDelegateProxy?

    // MARK: Automatic-retry backoff
    //
    // Automatic retries are TRIGGERED BY EVENTS (foreground, reachability restored), not by a timer. The
    // backoff exists to stop those events stampeding: reachability on a moving vehicle flaps repeatedly,
    // and each flap would otherwise fire a full page load.
    //
    // 🔴 WHY THESE NUMBERS. A truck parked at a festival with no signal can sit offline for an hour. A
    // fixed short interval (say 5s) would be ~720 loads an hour, holding the cellular radio awake and
    // draining a battery that is running the operator's whole service. Doubling from 2s and capping at
    // 60s bounds the worst case to one attempt a minute, while still recovering within ~a minute of the
    // network genuinely returning — and the reachability event usually beats the timer to it anyway.
    // ⚠️ The MANUAL Retry button deliberately bypasses this entirely and resets it. An operator who has
    // just walked to a spot with signal should not be told to wait.
    private static let backoffSchedule: [TimeInterval] = [2, 4, 8, 16, 32, 60]
    private var backoffIndex = 0
    private var lastAutomaticAttempt: Date?

    private var pathMonitor: NWPathMonitor?
    private var wasUnsatisfied = false

    // MARK: Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()

        // The view sits behind the WKWebView; matching the configured WebView background means a failure
        // (or a slow first paint) never flashes white. See HGLoadErrorView for the same colour.
        view.backgroundColor = HGLoadErrorView.backgroundColour

        installNavigationProxy()
        startObservingForeground()
        startObservingReachability()
    }

    deinit {
        pathMonitor?.cancel()
        NotificationCenter.default.removeObserver(self)
    }

    /// Takes the `navigationDelegate` slot, retaining whatever Capacitor put there.
    /// ⚠️ Must run AFTER `super.viewDidLoad()`, which is where Capacitor creates the web view and assigns
    /// its own handler. Running before would find `webView` nil and silently do nothing.
    private func installNavigationProxy() {
        guard let webView = self.webView,
              let capacitorDelegate = webView.navigationDelegate else {
            // No web view or no delegate means Capacitor's own setup did not complete. Adding a proxy on
            // top of a broken bridge would hide that, so leave it alone and let it fail loudly.
            CAPLog.print("⚡️  HatchGrab: could not install navigation proxy (no webView/delegate)")
            return
        }
        let proxy = HGNavigationDelegateProxy(inner: capacitorDelegate, owner: self)
        self.proxy = proxy                       // we own it; the webView's reference is weak
        webView.navigationDelegate = proxy
    }

    // MARK: Failure handling

    /// The URL the shell is configured to load. Rendered small on the error view so a wrong-URL build is
    /// visible on the device rather than mysterious — the exact failure that cost a day of debugging when
    /// a LAN dev-server URL stayed baked into the app.
    private var targetURL: URL? { bridge?.config.serverURL }

    func handleLoadFailure(_ error: Error) {
        // -999 is NSURLErrorCancelled: a load superseded by another load, which is normal navigation and
        // not a failure. Showing an error panel for it would flash a panic screen during ordinary use.
        if (error as NSError).code == NSURLErrorCancelled { return }
        showErrorView(message: error.localizedDescription)
    }

    func handleLoadSuccess() {
        backoffIndex = 0
        lastAutomaticAttempt = nil
        hideErrorView()
    }

    func handleContentProcessTermination() {
        // Capacitor's handler has already issued the reload. Nothing to show.
        hideErrorView()
    }

    private func showErrorView(message: String) {
        if let existing = errorView {
            existing.setDetail(message)
            existing.isHidden = false
            view.bringSubviewToFront(existing)
            return
        }
        let errorView = HGLoadErrorView(targetURL: targetURL?.absoluteString ?? "")
        errorView.setDetail(message)
        errorView.onRetry = { [weak self] in self?.retryNow() }
        errorView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(errorView)
        NSLayoutConstraint.activate([
            errorView.topAnchor.constraint(equalTo: view.topAnchor),
            errorView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            errorView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            errorView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        self.errorView = errorView
    }

    private func hideErrorView() {
        errorView?.isHidden = true
    }

    // MARK: Retry

    /// Manual retry — immediate, and resets the backoff. Never rate-limited.
    private func retryNow() {
        backoffIndex = 0
        lastAutomaticAttempt = nil
        errorView?.setRetrying(true)
        loadServerURL()
    }

    /// Event-driven retry, rate-limited by the backoff above.
    private func retryAutomatically(reason: String) {
        guard errorView != nil, errorView?.isHidden == false else { return }   // nothing is broken
        let interval = Self.backoffSchedule[min(backoffIndex, Self.backoffSchedule.count - 1)]
        if let last = lastAutomaticAttempt, Date().timeIntervalSince(last) < interval {
            return                                                              // too soon — let it ride
        }
        lastAutomaticAttempt = Date()
        backoffIndex = min(backoffIndex + 1, Self.backoffSchedule.count - 1)
        CAPLog.print("⚡️  HatchGrab: automatic reload (\(reason))")
        errorView?.setRetrying(true)
        loadServerURL()
    }

    /// Reloads the configured server URL. ⚠️ NOT `webView.reload()` — after a failed PROVISIONAL
    /// navigation the web view has no committed URL to reload, so `reload()` is a no-op and the retry
    /// button would appear to do nothing. This is the same idiom Capacitor itself uses when the server
    /// base path changes (CAPBridgeViewController:284).
    private func loadServerURL() {
        guard let webView = self.webView, let url = targetURL else { return }
        webView.load(URLRequest(url: url))
    }

    // MARK: Triggers

    private func startObservingForeground() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appWillEnterForeground),
            name: UIApplication.willEnterForegroundNotification,
            object: nil
        )
    }

    @objc private func appWillEnterForeground() {
        retryAutomatically(reason: "foreground")
    }

    /// NWPathMonitor rather than the Capacitor Network plugin: this must work when the WEB LAYER IS DEAD,
    /// and the plugin reports through the bridge into JS that has not loaded.
    private func startObservingReachability() {
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }
            DispatchQueue.main.async {
                if path.status == .satisfied {
                    // Only retry on a genuine unsatisfied → satisfied TRANSITION. The handler also fires
                    // once at start-up with the current path; retrying on that would double up with the
                    // load Capacitor has already issued.
                    if self.wasUnsatisfied {
                        self.wasUnsatisfied = false
                        self.retryAutomatically(reason: "network restored")
                    }
                } else {
                    self.wasUnsatisfied = true
                }
            }
        }
        monitor.start(queue: DispatchQueue(label: "com.hatchgrab.reachability"))
        pathMonitor = monitor
    }
}

// MARK: - The native error view

/// Plain text on the configured WebView background. No brand assets, no imagery, and — deliberately —
/// 🔴 NOTHING resembling a purchase, upgrade, plan or external commerce link. This view can appear on a
/// device under App Review, and App Store guideline 3.1.3 forbids steering to an external purchase
/// mechanism outside the US storefront. It says what is wrong and offers to try again. Nothing else.
final class HGLoadErrorView: UIView {

    /// Matches `ios.backgroundColor` in capacitor.config.json (#1C1C1E), so a failure never flashes white.
    static let backgroundColour = UIColor(red: 0x1C / 255.0,
                                          green: 0x1C / 255.0,
                                          blue: 0x1E / 255.0,
                                          alpha: 1.0)

    var onRetry: (() -> Void)?

    private let titleLabel = UILabel()
    private let detailLabel = UILabel()
    private let urlLabel = UILabel()
    private let retryButton = UIButton(type: .system)
    private let spinner = UIActivityIndicatorView(style: .medium)

    init(targetURL: String) {
        super.init(frame: .zero)
        backgroundColor = Self.backgroundColour

        titleLabel.text = "Can't reach HatchGrab"
        titleLabel.font = .systemFont(ofSize: 20, weight: .semibold)
        titleLabel.textColor = .white
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0

        detailLabel.text = "Check your connection."
        detailLabel.font = .systemFont(ofSize: 15, weight: .regular)
        // 70% white on #1C1C1E clears the 4.5:1 AA floor comfortably; the URL below is deliberately
        // quieter still, because it is diagnostic information rather than something to read.
        detailLabel.textColor = UIColor.white.withAlphaComponent(0.7)
        detailLabel.textAlignment = .center
        detailLabel.numberOfLines = 0

        urlLabel.text = targetURL
        urlLabel.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        urlLabel.textColor = UIColor.white.withAlphaComponent(0.35)
        urlLabel.textAlignment = .center
        urlLabel.numberOfLines = 2
        urlLabel.lineBreakMode = .byTruncatingMiddle

        retryButton.setTitle("Retry", for: .normal)
        retryButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        retryButton.setTitleColor(.white, for: .normal)
        retryButton.backgroundColor = UIColor.white.withAlphaComponent(0.14)
        retryButton.layer.cornerRadius = 12
        retryButton.contentEdgeInsets = UIEdgeInsets(top: 12, left: 28, bottom: 12, right: 28)
        retryButton.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)

        spinner.color = UIColor.white.withAlphaComponent(0.7)
        spinner.hidesWhenStopped = true

        let stack = UIStackView(arrangedSubviews: [titleLabel, detailLabel, retryButton, spinner, urlLabel])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 12
        stack.setCustomSpacing(24, after: detailLabel)
        stack.setCustomSpacing(20, after: spinner)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -32)
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    /// The underlying NSError description, shown beneath the headline so a support call has something
    /// concrete in it. Falls back to the generic line when there is nothing useful to say.
    func setDetail(_ message: String) {
        setRetrying(false)
        detailLabel.text = message.isEmpty
            ? "Check your connection."
            : "Check your connection.\n\(message)"
    }

    func setRetrying(_ retrying: Bool) {
        retryButton.isEnabled = !retrying
        retryButton.alpha = retrying ? 0.5 : 1.0
        if retrying { spinner.startAnimating() } else { spinner.stopAnimating() }
    }

    @objc private func retryTapped() {
        setRetrying(true)
        onRetry?()
    }
}
