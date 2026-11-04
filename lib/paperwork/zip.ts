// lib/paperwork/zip.ts — "Download all": a ZIP made on the fly (paperwork-1, 4 November 2026). PURE (no node APIs).
// STORED, not deflated: the files are PDFs and photos, already compressed, so deflating would cost time and save nothing,
// and a stored ZIP needs no library. Each file is fetched, its CRC-32 computed, and its local header and bytes streamed out;
// the central directory follows. Names are UTF-8 (general-purpose flag bit 11). No ZIP64: 20 MB files, a handful per link.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((Math.max(1980, d.getUTCFullYear()) - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  }
}
const le = (n: number, bytes: number) => { const a = new Uint8Array(bytes); for (let i = 0; i < bytes; i++) a[i] = (n >>> (8 * i)) & 0xff; return a }
const concat = (parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }

/** One file in the archive: its name and a function that fetches its bytes (null = skip it). */
export interface ZipEntry { name: string; bytes: () => Promise<Uint8Array | null> }

/** Unique names: "a.pdf", "a (2).pdf". */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return names.map(n => {
    const k = n.toLowerCase(), count = (seen.get(k) ?? 0) + 1
    seen.set(k, count)
    if (count === 1) return n
    const dot = n.lastIndexOf('.')
    return dot > 0 ? `${n.slice(0, dot)} (${count})${n.slice(dot)}` : `${n} (${count})`
  })
}

/** The archive as a stream of bytes. */
export function zipStream(entries: readonly ZipEntry[], now: Date = new Date()): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  const { time, date } = dosTime(now)
  const central: Uint8Array[] = []
  let offset = 0, i = 0, count = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (i < entries.length) {
        const e = entries[i++]
        const bytes = await e.bytes()
        if (!bytes) continue
        const name = enc.encode(e.name)
        const crc = crc32(bytes)
        const local = concat([le(0x04034b50, 4), le(20, 2), le(0x0800, 2), le(0, 2), le(time, 2), le(date, 2), le(crc, 4), le(bytes.length, 4), le(bytes.length, 4), le(name.length, 2), le(0, 2), name])
        central.push(concat([le(0x02014b50, 4), le(20, 2), le(20, 2), le(0x0800, 2), le(0, 2), le(time, 2), le(date, 2), le(crc, 4), le(bytes.length, 4), le(bytes.length, 4), le(name.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(offset, 4), name]))
        controller.enqueue(local)
        controller.enqueue(bytes)
        offset += local.length + bytes.length
        count++
        return
      }
      const dir = concat(central)
      controller.enqueue(dir)
      controller.enqueue(concat([le(0x06054b50, 4), le(0, 2), le(0, 2), le(count, 2), le(count, 2), le(dir.length, 4), le(offset, 4), le(0, 2)]))
      controller.close()
    },
  })
}
