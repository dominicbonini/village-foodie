// @hatchgrab/net-printer — the JS surface of the local plugin. Two methods, both one socket, both closed
// on return. `bytesWritten` is the field that lets the transport choose 'failed' (0) from 'unknown' (>0).
export type NetPrinterErrorCode =
  | 'refused'      // connection refused (nothing listening)
  | 'timeout'      // connect or write timed out
  | 'unreachable'  // no route to host / network down
  | 'permission'   // iOS Local Network permission refused (heuristic — see the Swift source)
  | 'invalid'      // bad host/port
  | 'io'           // any other socket error
  | 'unsupported'  // web
export interface NetPrinterProbeOptions { host: string; port: number; connectTimeoutMs?: number; writeTimeoutMs?: number }
export interface NetPrinterProbeResult { ok: boolean; error?: string; errorCode?: NetPrinterErrorCode }
export interface NetPrinterSendOptions extends NetPrinterProbeOptions { base64: string }
export interface NetPrinterSendResult { ok: boolean; bytesWritten: number; error?: string; errorCode?: NetPrinterErrorCode }
export interface NetPrinterPlugin {
  /** Open, write ESC @ (0x1B 0x40), close. Proves the host accepts a TCP write; nothing more. */
  probe(options: NetPrinterProbeOptions): Promise<NetPrinterProbeResult>
  /** Open, write every byte, close. `bytesWritten` is exact on failure. */
  send(options: NetPrinterSendOptions): Promise<NetPrinterSendResult>
}
export declare const NetPrinter: NetPrinterPlugin
