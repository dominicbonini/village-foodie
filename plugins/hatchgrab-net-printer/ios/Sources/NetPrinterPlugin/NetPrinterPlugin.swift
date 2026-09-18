import Foundation
import Capacitor
import Network

// ── HatchGrab NetPrinter — raw TCP to a kitchen printer, Network.framework only ──────────────────────
// Two methods, one socket each, closed on return. No discovery (no NSBonjourServices), no background
// mode. `bytesWritten` is EXACT on failure: it is how the JS transport decides 'failed' (nothing left the
// device — clean reprint) from 'unknown' (something did — POSSIBLE DUPLICATE). Never guess it.
//
// ── iOS LOCAL NETWORK PERMISSION — HOW A REFUSAL IS DETECTED, AND HOW LITTLE THAT PROVES ────────────
// iOS has NO API to query the Local Network permission. The first connection to a local address shows
// the system prompt; a refusal — then or later in Settings — is only observable as a FAILED connection.
// In practice a denied local-network NWConnection goes to `.waiting(.posix(.ENETDOWN))` (50, "Network is
// down") or `.posix(.EHOSTUNREACH)` (65) and never reaches `.ready`. So: a `.waiting` with one of those
// two POSIX codes against a PRIVATE address is reported as errorCode "permission". It is a heuristic —
// a genuinely down network produces the same codes — and the operator copy says both things. On the
// FIRST-EVER attempt the prompt is on screen while the connection waits, so the connect timeout is the
// operator's answer time; a refusal within it reports "permission", running out reports "timeout".
@objc(NetPrinterPlugin)
public class NetPrinterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NetPrinterPlugin"
    public let jsName = "NetPrinter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "probe", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise)
    ]

    private static let escInit: [UInt8] = [0x1B, 0x40]

    @objc func probe(_ call: CAPPluginCall) {
        run(call, payload: Data(NetPrinterPlugin.escInit), reportBytes: false)
    }

    @objc func send(_ call: CAPPluginCall) {
        guard let b64 = call.getString("base64"), let data = Data(base64Encoded: b64) else {
            call.resolve(["ok": false, "bytesWritten": 0, "error": "bad payload", "errorCode": "invalid"]); return
        }
        run(call, payload: data, reportBytes: true)
    }

    private func isPrivate(_ host: String) -> Bool {
        let p = host.split(separator: ".").compactMap { Int($0) }
        guard p.count == 4 else { return host.hasSuffix(".local") }
        if p[0] == 10 { return true }
        if p[0] == 192 && p[1] == 168 { return true }
        if p[0] == 172 && (16...31).contains(p[1]) { return true }
        if p[0] == 169 && p[1] == 254 { return true }
        return false
    }

    private func run(_ call: CAPPluginCall, payload: Data, reportBytes: Bool) {
        guard let host = call.getString("host"), !host.isEmpty else {
            call.resolve(["ok": false, "bytesWritten": 0, "error": "host required", "errorCode": "invalid"]); return
        }
        let portInt = call.getInt("port") ?? 9100
        guard portInt > 0 && portInt < 65536, let port = NWEndpoint.Port(rawValue: UInt16(portInt)) else {
            call.resolve(["ok": false, "bytesWritten": 0, "error": "bad port", "errorCode": "invalid"]); return
        }
        let connectTimeout = Double(call.getInt("connectTimeoutMs") ?? 5000) / 1000.0
        let writeTimeout = Double(call.getInt("writeTimeoutMs") ?? 10000) / 1000.0

        let queue = DispatchQueue(label: "com.hatchgrab.netprinter")
        let params = NWParameters.tcp
        params.prohibitedInterfaceTypes = [.cellular]          // a kitchen printer is never on 4G
        let conn = NWConnection(host: NWEndpoint.Host(host), port: port, using: params)
        var finished = false
        var bytesWritten = 0
        let privateHost = isPrivate(host)

        func finish(_ ok: Bool, _ error: String?, _ code: String?) {
            queue.async {
                if finished { return }
                finished = true
                conn.cancel()
                var out: [String: Any] = ["ok": ok]
                if reportBytes { out["bytesWritten"] = bytesWritten }
                if let e = error { out["error"] = e }
                if let c = code { out["errorCode"] = c }
                call.resolve(out)
            }
        }
        func classify(_ err: NWError) -> String {
            switch err {
            case .posix(let code):
                switch code {
                case .ECONNREFUSED: return "refused"
                case .ETIMEDOUT: return "timeout"
                case .ENETDOWN, .EHOSTUNREACH, .ENETUNREACH:
                    return privateHost ? "permission" : "unreachable"
                default: return "io"
                }
            case .dns: return "unreachable"
            default: return "io"
            }
        }

        // Connect timeout — covers DNS, the TCP handshake and (first time) the Local Network prompt.
        queue.asyncAfter(deadline: .now() + connectTimeout) {
            if !finished && conn.state != .ready { finish(false, "connect timed out after \(Int(connectTimeout * 1000)) ms", "timeout") }
        }
        conn.stateUpdateHandler = { state in
            switch state {
            case .ready:
                // Write timeout — from the first byte until the send completes.
                queue.asyncAfter(deadline: .now() + writeTimeout) {
                    if !finished { finish(false, "write timed out after \(Int(writeTimeout * 1000)) ms with \(bytesWritten) bytes written", "timeout") }
                }
                conn.send(content: payload, completion: .contentProcessed { err in
                    if let e = err { finish(false, e.localizedDescription, classify(e)); return }
                    bytesWritten = payload.count
                    finish(true, nil, nil)
                })
            case .waiting(let err):
                // A denied Local Network permission parks the connection here with ENETDOWN/EHOSTUNREACH.
                let code = classify(err)
                if code == "permission" || code == "unreachable" { finish(false, err.localizedDescription, code) }
                // other waits (e.g. transient) run out via the connect timeout
            case .failed(let err):
                finish(false, err.localizedDescription, classify(err))
            case .cancelled:
                if !finished { finish(false, "cancelled", "io") }
            default:
                break
            }
        }
        conn.start(queue: queue)
    }
}
