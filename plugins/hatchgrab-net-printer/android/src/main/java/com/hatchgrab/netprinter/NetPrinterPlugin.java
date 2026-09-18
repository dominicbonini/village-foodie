package com.hatchgrab.netprinter;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.InetSocketAddress;
import java.net.NoRouteToHostException;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;

/**
 * HatchGrab NetPrinter — raw TCP to a kitchen printer with java.net.Socket, on a background thread.
 * One socket per call, always closed. {@code bytesWritten} is EXACT on failure: the JS transport reads it
 * to choose 'failed' (0 — nothing left the device) from 'unknown' (>0 — POSSIBLE DUPLICATE). No new
 * permissions: INTERNET and ACCESS_NETWORK_STATE are already in the merged manifest.
 */
@CapacitorPlugin(name = "NetPrinter")
public class NetPrinterPlugin extends Plugin {
    private static final byte[] ESC_INIT = new byte[] { 0x1B, 0x40 };
    private static final int CHUNK = 4096;

    @PluginMethod
    public void probe(PluginCall call) { run(call, ESC_INIT, false); }

    @PluginMethod
    public void send(PluginCall call) {
        String b64 = call.getString("base64");
        if (b64 == null) { resolve(call, false, 0, "bad payload", "invalid", true); return; }
        byte[] data;
        try { data = Base64.decode(b64, Base64.DEFAULT); }
        catch (IllegalArgumentException e) { resolve(call, false, 0, "bad payload", "invalid", true); return; }
        run(call, data, true);
    }

    private void resolve(PluginCall call, boolean ok, int bytesWritten, String error, String code, boolean reportBytes) {
        JSObject out = new JSObject();
        out.put("ok", ok);
        if (reportBytes) out.put("bytesWritten", bytesWritten);
        if (error != null) out.put("error", error);
        if (code != null) out.put("errorCode", code);
        call.resolve(out);
    }

    private void run(PluginCall call, byte[] payload, boolean reportBytes) {
        String host = call.getString("host");
        Integer port = call.getInt("port", 9100);
        Integer connectTimeoutMs = call.getInt("connectTimeoutMs", 5000);
        Integer writeTimeoutMs = call.getInt("writeTimeoutMs", 10000);
        if (host == null || host.isEmpty()) { resolve(call, false, 0, "host required", "invalid", reportBytes); return; }
        if (port == null || port <= 0 || port > 65535) { resolve(call, false, 0, "bad port", "invalid", reportBytes); return; }
        final int fPort = port, fConnect = connectTimeoutMs, fWrite = writeTimeoutMs;
        new Thread(() -> {
            int written = 0;
            Socket socket = new Socket();
            try {
                socket.connect(new InetSocketAddress(host, fPort), fConnect);
                socket.setSoTimeout(fWrite);
                OutputStream os = socket.getOutputStream();
                for (int off = 0; off < payload.length; off += CHUNK) {
                    int len = Math.min(CHUNK, payload.length - off);
                    os.write(payload, off, len);
                    os.flush();
                    written += len;
                }
                resolve(call, true, written, null, null, reportBytes);
            } catch (ConnectException e) {
                resolve(call, false, written, e.getMessage(), "refused", reportBytes);
            } catch (SocketTimeoutException e) {
                resolve(call, false, written, e.getMessage(), "timeout", reportBytes);
            } catch (NoRouteToHostException | UnknownHostException e) {
                resolve(call, false, written, e.getMessage(), "unreachable", reportBytes);
            } catch (Exception e) {
                resolve(call, false, written, e.getMessage(), "io", reportBytes);
            } finally {
                try { socket.close(); } catch (Exception ignored) {}
            }
        }, "hg-net-printer").start();
    }
}
