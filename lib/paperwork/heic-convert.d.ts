// The one function of `heic-convert` used here (it ships no types). paperwork-1.
declare module 'heic-convert' {
  export default function convert(opts: { buffer: Buffer | ArrayBuffer | Uint8Array; format: 'JPEG' | 'PNG'; quality?: number }): Promise<ArrayBuffer | Buffer>
}
