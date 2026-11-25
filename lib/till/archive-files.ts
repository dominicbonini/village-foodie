// lib/till/archive-files.ts — 🔴 till-pack-5 (25 November 2026, docs/till-pack-5-6-report.md): THE ARCHIVE'S FILES, ITS MANIFEST, ITS ZIP.
//
// PURE (no database, no clock, no network; node:crypto for sha256 and fflate for the zip). lib/till/archive.ts reads the rows and calls
// this; scripts/till-pack-5-6.cjs builds archives from fixtures with the same code; scripts/till-verify.cjs --archive checks one offline.
//
// WHAT AN ARCHIVE IS (BOI-TVA-DECLA-30-10-30 § 220–§ 250): a ZIP of open files for ONE truck and ONE period —
//   chain.jsonl              EVERY chain entry from seq 1 to the head the archive covers (all kinds), exactly the till_chain columns —
//                            so the chain verifies from its first entry, offline;
//   orders.csv / order_lines.csv / order_vat.csv / order_versions.jsonl
//                            every sealed ORDER VERSION whose trading day is in the period: its fields, its lines with their VAT rate and
//                            excluding-VAT total, its VAT per rate, its plus/minus delta, its till_id and the identity entry it names;
//   payments.csv / payments.jsonl   every sealed PAYMENT of the period: charges, refunds and reversals (with the payment each reverses);
//   deletions.jsonl          every observed deletion of the period;
//   closes.csv / closes.jsonl / close_signatures.csv   the period's closes with all their figures, and their signatures;
//   archives.csv             the truck's earlier archives, their manifest hashes, chain entries and signatures;
//   device_fingerprints.csv  the offline devices' evidence for the period's orders; entry_actors.csv  the role behind each correction;
//   verify_events.jsonl      the till_verify results chained after each close;
//   public_key.txt           the signing public key and its id; SHA256SUMS.txt  every file's sha256 (sha256sum -c);
//   README-FR.txt / README-EN.txt   what each file holds and how to verify it;
//   manifest.json            every file above with its sha256 and size, the period, the truck's accounting year, the software and its
//                            version, the chain head covered, and EACH DAY'S CHAIN HEAD (Q14);
//   manifest.sig.json        (when the key is set) the Ed25519 signature of manifest.json's sha256 — not listed in the manifest it signs.
// NO PERSONAL DATA: the sealed forms carry no customer name, email, phone, note or address (till-pack-1b), and nothing else here does. The
// identity entries' legal details (the business's legal name, registration, VAT number, registered address) are the one exception (Q9).
import { createHash } from 'node:crypto'
import { zipSync } from 'fflate'

export interface ChainRow {
  truck_id: string; seq: number; kind: string; ref: string; version: number | null
  payload: string; payload_hash: string; prev_hash: string; hash: string; software_version: string; created_at: string
}
export interface CloseRow {
  period_type: string; period_start: string; period_end: string; seq: number; hash: string; totals: Record<string, unknown>
  gt_incl_minor: number; gt_excl_minor: number; gt_abs_minor: number; gt_period_minor: number; chain_head_seq: number; chain_head_hash: string
  software_version: string; signing_at_commit: string; time_zone: string; currency: string | null; created_at: string
}
export interface SignatureRow { seq: number; key_id: string; signature: string; signed_at: string }
export interface ArchiveRow {
  id: string; reason: string; period_start: string; period_end: string; manifest_sha256: string; zip_sha256: string; seq: number; hash: string
  chain_head_seq: number; chain_head_hash: string; software_version: string; created_at: string
}
export interface ArchiveSignatureRow { archive_id: string; key_id: string; signature: string; signed_at: string }
export interface DeviceRow { order_key: string; device_id: string; fingerprint: string; device_created_at: string; recorded_at: string }
export interface ActorRow { seq: number; role: string; action: string; recorded_at: string }

export interface ArchiveInput {
  truckId: string
  reason: 'year' | 'on_demand' | 'final'
  from: string
  to: string
  timeZone: string
  currency: string | null
  accountingYear: { start: string; end: string }
  software: { name: string; version: string }
  databaseSoftwareVersion: string
  /** ISO instant — the manifest's date and every zip entry's time (so the same inputs give the same bytes). */
  generatedAt: string
  /** seq 1 … head, in order. */
  chain: readonly ChainRow[]
  closes: readonly CloseRow[]
  closeSignatures: readonly SignatureRow[]
  archives: readonly ArchiveRow[]
  archiveSignatures: readonly ArchiveSignatureRow[]
  devices: readonly DeviceRow[]
  actors: readonly ActorRow[]
  publicKey: { key: string; keyId: string } | null
}

export const ARCHIVE_FORMAT = 'hatchgrab-till-archive'
export const ARCHIVE_FORMAT_VERSION = 1
export const sha256Hex = (b: Uint8Array | string) => createHash('sha256').update(typeof b === 'string' ? Buffer.from(b, 'utf8') : b).digest('hex')
const u8 = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'))

/** Local calendar date of an instant in a zone ("YYYY-MM-DD"). */
export function localDate(iso: string, timeZone: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
  const g = (t: string) => p.find(x => x.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')}`
}

// ── CSV: UTF-8 with a BOM, CRLF, RFC 4180 quoting — opens straight in a spreadsheet ────────────────────────────────────────────────────
const cell = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function csv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return '﻿' + [header.join(','), ...rows.map(r => r.map(cell).join(','))].join('\r\n') + '\r\n'
}
const jsonl = (rows: readonly unknown[]) => rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')

interface Envelope { kind: string; ref: string; version: number | null; reason: string | null; trading_day: string | null; recorded_at: string; identity: { seq: number; hash: string } | null; delta: unknown; data: Record<string, unknown>; software_version: string }
const env = (r: ChainRow): Envelope => JSON.parse(r.payload) as Envelope
const inPeriod = (d: string | null | undefined, from: string, to: string) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to

/** 🔴 THE FILES (everything but the manifest and its signature). */
export function archiveFiles(a: ArchiveInput): { files: Record<string, string>; counts: Record<string, number>; dayHeads: { day: string; seq: number; hash: string }[]; identity: Record<string, unknown> | null } {
  const head = a.chain[a.chain.length - 1]
  const entries = a.chain.map(r => ({ r, e: env(r) }))
  const ofKind = (k: string) => entries.filter(x => x.r.kind === k && inPeriod(x.e.trading_day, a.from, a.to))
  const orders = ofKind('order'), payments = ofKind('payment'), deletions = ofKind('deletion')
  const verifies = entries.filter(x => x.r.kind === 'event' && x.r.ref === 'verify' && inPeriod(x.e.trading_day, a.from, a.to))
  const identities = entries.filter(x => x.r.kind === 'identity')
  const identity = identities.length ? (identities[identities.length - 1].e.data ?? null) : null

  const files: Record<string, string> = {}
  files['chain.jsonl'] = jsonl(a.chain.map(r => ({ truck_id: r.truck_id, seq: Number(r.seq), kind: r.kind, ref: r.ref, version: r.version, payload: r.payload,
    payload_hash: r.payload_hash, prev_hash: r.prev_hash, hash: r.hash, software_version: r.software_version })))

  const O = (x: { r: ChainRow; e: Envelope }) => x.e.data as Record<string, unknown>
  files['orders.csv'] = csv(
    ['seq', 'order_key', 'version', 'reason', 'trading_day', 'recorded_at', 'receipt_no', 'placed_at', 'collected_at', 'fiscal_state', 'source', 'order_type',
      'till_id', 'van_id', 'event_id', 'currency', 'total_minor', 'food_minor', 'tax_minor', 'tax_inclusive', 'tip_minor', 'service_fee_minor', 'card_surcharge_minor',
      'discount_code', 'discount_amt', 'vat_regime', 'vat_basis', 'identity_seq', 'identity_hash', 'delta'],
    orders.map(x => { const d = O(x); return [x.r.seq, x.r.ref, x.r.version, x.e.reason, x.e.trading_day, x.e.recorded_at, d.receipt_no, d.placed_at, d.collected_at, d.fiscal_state,
      d.source, d.order_type, d.till_id, d.van_id, d.event_id, d.currency, d.total_minor, d.food_minor, d.tax_minor, d.tax_inclusive, d.tip_minor, d.service_fee_minor,
      d.card_surcharge_minor, d.discount_code, d.discount_amt, d.vat_regime, d.vat_basis, x.e.identity?.seq, x.e.identity?.hash, x.e.delta] }))
  const lines: unknown[][] = []
  for (const x of orders) {
    const d = O(x)
    let n = 0
    for (const it of (Array.isArray(d.items) ? d.items : []) as Record<string, unknown>[]) lines.push([x.r.seq, x.r.ref, x.r.version, ++n, 'item', it.name, it.quantity, it.unit_price, it.vat_rate_milli, it.line_price_minor, it.line_total_excl_vat_minor])
    for (const dl of (Array.isArray(d.deals) ? d.deals : []) as Record<string, unknown>[]) {
      lines.push([x.r.seq, x.r.ref, x.r.version, ++n, 'deal', dl.name, dl.quantity ?? 1, dl.price, null, null, null])
      for (const p of (Array.isArray(dl.vat_parts) ? dl.vat_parts : []) as Record<string, unknown>[]) lines.push([x.r.seq, x.r.ref, x.r.version, n, 'deal_vat_part', dl.name, null, null, p.vat_rate_milli, p.line_price_minor, p.line_total_excl_vat_minor])
    }
  }
  files['order_lines.csv'] = csv(['seq', 'order_key', 'version', 'line_no', 'line_kind', 'name', 'quantity', 'unit_price', 'vat_rate_milli', 'line_price_minor', 'line_total_excl_vat_minor'], lines)
  files['order_vat.csv'] = csv(['seq', 'order_key', 'version', 'vat_rate_milli', 'food_minor', 'excl_vat_minor', 'vat_minor'],
    orders.flatMap(x => ((Array.isArray(O(x).vat_summary) ? O(x).vat_summary : []) as Record<string, unknown>[]).map(s => [x.r.seq, x.r.ref, x.r.version, s.vat_rate_milli, s.food_minor, s.excl_vat_minor, s.vat_minor])))
  files['order_versions.jsonl'] = jsonl(orders.map(x => ({ seq: x.r.seq, order_key: x.r.ref, version: x.r.version, reason: x.e.reason, trading_day: x.e.trading_day, recorded_at: x.e.recorded_at, identity: x.e.identity, delta: x.e.delta, data: x.e.data })))

  files['payments.csv'] = csv(['seq', 'payment_id', 'order_key', 'kind', 'channel', 'method', 'amount_minor', 'currency', 'state', 'created_at', 'livemode', 'external_ref', 'reverses_payment_id', 'reason', 'trading_day', 'recorded_at'],
    payments.map(x => { const d = O(x); return [x.r.seq, x.r.ref, d.order_key, d.kind, d.channel, d.method, d.amount_minor, d.currency, d.state, d.created_at, d.livemode, d.external_ref, d.reverses_payment_id, d.reason, x.e.trading_day, x.e.recorded_at] }))
  files['payments.jsonl'] = jsonl(payments.map(x => ({ seq: x.r.seq, payment_id: x.r.ref, version: x.r.version, reason: x.e.reason, trading_day: x.e.trading_day, recorded_at: x.e.recorded_at, data: x.e.data })))
  files['deletions.jsonl'] = jsonl(deletions.map(x => ({ seq: x.r.seq, kind: x.r.kind, ref: x.r.ref, reason: x.e.reason, trading_day: x.e.trading_day, recorded_at: x.e.recorded_at, data: x.e.data })))

  const closes = a.closes.filter(c => c.period_end >= a.from && c.period_end <= a.to).slice().sort((x, y) => x.period_end.localeCompare(y.period_end) || x.period_type.localeCompare(y.period_type))
  const T = (c: CloseRow) => ((c.totals as { totals?: Record<string, number> }).totals ?? {}) as Record<string, number>
  files['closes.csv'] = csv(['period_type', 'period_start', 'period_end', 'seq', 'hash', 'sales_incl_vat_minor', 'refunds_incl_vat_minor', 'net_excl_vat_minor', 'vat_minor',
    'gt_incl_minor', 'gt_excl_minor', 'gt_abs_minor', 'gt_period_minor', 'chain_head_seq', 'chain_head_hash', 'time_zone', 'currency', 'software_version', 'signing_at_commit', 'created_at'],
    closes.map(c => [c.period_type, c.period_start, c.period_end, c.seq, c.hash, T(c).salesMinor, T(c).refundsMinor, T(c).netMinor, T(c).vatMinor, c.gt_incl_minor, c.gt_excl_minor,
      c.gt_abs_minor, c.gt_period_minor, c.chain_head_seq, c.chain_head_hash, c.time_zone, c.currency, c.software_version, c.signing_at_commit, c.created_at]))
  files['closes.jsonl'] = jsonl(closes)
  const closeSeqs = new Set(closes.map(c => Number(c.seq)))
  files['close_signatures.csv'] = csv(['seq', 'key_id', 'signature', 'signed_at'], a.closeSignatures.filter(s => closeSeqs.has(Number(s.seq))).map(s => [s.seq, s.key_id, s.signature, s.signed_at]))
  const sigOf = new Map(a.archiveSignatures.map(s => [s.archive_id, s]))
  files['archives.csv'] = csv(['archive_id', 'reason', 'period_start', 'period_end', 'manifest_sha256', 'zip_sha256', 'seq', 'hash', 'chain_head_seq', 'chain_head_hash', 'software_version', 'created_at', 'key_id', 'signature'],
    a.archives.map(x => { const s = sigOf.get(x.id); return [x.id, x.reason, x.period_start, x.period_end, x.manifest_sha256, x.zip_sha256, x.seq, x.hash, x.chain_head_seq, x.chain_head_hash, x.software_version, x.created_at, s?.key_id, s?.signature] }))
  const orderKeys = new Set(orders.map(x => x.r.ref))
  files['device_fingerprints.csv'] = csv(['order_key', 'device_id', 'fingerprint', 'device_created_at', 'recorded_at'], a.devices.filter(d => orderKeys.has(d.order_key)).map(d => [d.order_key, d.device_id, d.fingerprint, d.device_created_at, d.recorded_at]))
  const seqs = new Set([...orders, ...payments, ...deletions].map(x => Number(x.r.seq)))
  files['entry_actors.csv'] = csv(['seq', 'role', 'action', 'recorded_at'], a.actors.filter(x => seqs.has(Number(x.seq))).map(x => [x.seq, x.role, x.action, x.recorded_at]))
  files['verify_events.jsonl'] = jsonl(verifies.map(x => ({ seq: x.r.seq, trading_day: x.e.trading_day, recorded_at: x.e.recorded_at, data: x.e.data })))
  files['public_key.txt'] = a.publicKey
    ? `algorithm: Ed25519\nkey_id: ${a.publicKey.keyId}\npublic_key_spki_der_base64: ${a.publicKey.key}\n`
    : 'algorithm: Ed25519\nkey_id: (none yet — this archive is unsigned)\n'

  // Q14: each day's chain head — the last entry recorded on each day of the period (truck time).
  const byDay = new Map<string, ChainRow>()
  for (const r of a.chain) { const d = localDate(r.created_at, a.timeZone); if (d >= a.from && d <= a.to) byDay.set(d, r) }
  const dayHeads = [...byDay.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([day, r]) => ({ day, seq: Number(r.seq), hash: r.hash }))

  const counts = { chain_entries: a.chain.length, order_versions: orders.length, orders: new Set(orders.map(x => x.r.ref)).size, payments: payments.length, deletions: deletions.length,
    closes: closes.length, earlier_archives: a.archives.length, verify_events: verifies.length, head_seq: head ? Number(head.seq) : 0 }
  files['README-FR.txt'] = readme('fr', a, counts, identity)
  files['README-EN.txt'] = readme('en', a, counts, identity)
  const names = Object.keys(files).sort()
  files['SHA256SUMS.txt'] = names.map(n => `${sha256Hex(files[n])}  ${n}`).join('\n') + '\n'
  return { files, counts, dayHeads, identity }
}

export interface BuiltArchive { files: Record<string, string>; manifest: Record<string, unknown>; manifestText: string; manifestSha256: string; counts: Record<string, number> }

/** 🔴 THE MANIFEST — every file with its sha256 and size, and what the archive covers. Its own sha256 is what is signed and chained. */
export function buildArchive(a: ArchiveInput): BuiltArchive {
  const { files, counts, dayHeads } = archiveFiles(a)
  const head = a.chain[a.chain.length - 1]
  const manifest = {
    format: ARCHIVE_FORMAT, format_version: ARCHIVE_FORMAT_VERSION,
    software: { name: a.software.name, version: a.software.version }, database_software_version: a.databaseSoftwareVersion,
    truck_id: a.truckId, reason: a.reason, period: { start: a.from, end: a.to }, accounting_year: a.accountingYear, time_zone: a.timeZone, currency: a.currency,
    generated_at: a.generatedAt,
    chain: { first_seq: a.chain.length ? Number(a.chain[0].seq) : 0, last_seq: head ? Number(head.seq) : 0, head_hash: head ? head.hash : '0'.repeat(64) },
    day_heads: dayHeads, counts,
    signing: a.publicKey ? { algorithm: 'Ed25519', key_id: a.publicKey.keyId, public_key_spki_der_base64: a.publicKey.key,
      signed_message: 'the 64-character lowercase hex sha256 of manifest.json, as UTF-8 bytes' } : null,
    files: Object.keys(files).sort().map(name => ({ name, sha256: sha256Hex(files[name]), bytes: Buffer.byteLength(files[name], 'utf8') })),
  }
  const manifestText = JSON.stringify(manifest, null, 2) + '\n'
  return { files, manifest, manifestText, manifestSha256: sha256Hex(manifestText), counts }
}

/** The ZIP. Same inputs → same bytes (every entry dated generatedAt). manifest.sig.json is added when there is a signature. */
export function zipArchive(b: BuiltArchive, generatedAt: string, signature: { keyId: string; signature: string } | null): Uint8Array {
  const entries: Record<string, Uint8Array> = {}
  for (const n of Object.keys(b.files).sort()) entries[n] = u8(b.files[n])
  entries['manifest.json'] = u8(b.manifestText)
  if (signature) entries['manifest.sig.json'] = u8(JSON.stringify({ algorithm: 'Ed25519', key_id: signature.keyId, manifest_sha256: b.manifestSha256, signature: signature.signature }, null, 2) + '\n')
  return zipSync(entries, { level: 6, mtime: new Date(generatedAt) })
}

// ── THE README, in French and English (§ 230: « une notice explicative en langue française doit être jointe ») ───────────────────────
const FILE_NOTES: Record<'fr' | 'en', Record<string, string>> = {
  fr: {
    'chain.jsonl': 'la chaîne complète des enregistrements scellés, de la séquence 1 à la tête couverte (toutes natures : commandes, paiements, suppressions, identité, événements, clôtures, archives) ; une ligne JSON par entrée, exactement les colonnes de till_chain',
    'orders.csv': 'chaque version scellée d’une commande dont la journée de vente est dans la période : numéro de justificatif, dates, état, caisse (till_id), montants, régime de TVA, entrée d’identité visée, et le delta plus / moins de la version',
    'order_lines.csv': 'les lignes de chaque version : libellé, quantité, prix unitaire, taux de TVA (millièmes de %), total TTC et total hors taxe de la ligne',
    'order_vat.csv': 'la TVA de chaque version, par taux : base TTC, hors taxe, TVA',
    'order_versions.jsonl': 'les mêmes versions, complètes, telles qu’elles ont été scellées',
    'payments.csv': 'chaque paiement scellé de la période : encaissements, remboursements et annulations (avec le paiement annulé), mode de règlement, montant',
    'payments.jsonl': 'les mêmes paiements, complets',
    'deletions.jsonl': 'les suppressions observées pendant la période',
    'closes.csv': 'les clôtures (jour, mois, année) de la période : totaux, grands totaux perpétuels (TTC, HT, absolu) et de l’exercice, tête de chaîne à la clôture',
    'closes.jsonl': 'les mêmes clôtures avec tous leurs chiffres (par taux, par mode de règlement, remboursements, enregistrements tardifs)',
    'close_signatures.csv': 'la signature Ed25519 de chaque clôture (sur son empreinte de chaîne)',
    'archives.csv': 'les archives précédentes de ce camion, leur empreinte de manifeste et leur signature',
    'device_fingerprints.csv': 'l’empreinte des appareils hors ligne pour les commandes de la période',
    'entry_actors.csv': 'le rôle (propriétaire, équipe, système…) derrière chaque correction',
    'verify_events.jsonl': 'le résultat de la vérification de la chaîne enregistré après chaque clôture',
    'public_key.txt': 'la clé publique de signature et son identifiant',
    'SHA256SUMS.txt': 'l’empreinte sha256 de chaque fichier (sha256sum -c SHA256SUMS.txt)',
    'README-FR.txt': 'cette notice', 'README-EN.txt': 'la même notice en anglais',
  },
  en: {
    'chain.jsonl': 'the whole chain of sealed records, from seq 1 to the head covered (every kind: orders, payments, deletions, identity, events, closes, archives); one JSON line per entry, exactly the till_chain columns',
    'orders.csv': 'every sealed version of an order whose trading day is in the period: receipt number, dates, state, till (till_id), amounts, VAT regime, the identity entry it names, and the version\'s plus / minus delta',
    'order_lines.csv': 'each version\'s lines: name, quantity, unit price, VAT rate (thousandths of a %), the line\'s total incl. VAT and excl. VAT',
    'order_vat.csv': 'each version\'s VAT per rate: incl.-VAT base, excl. VAT, VAT',
    'order_versions.jsonl': 'the same versions, complete, as they were sealed',
    'payments.csv': 'every sealed payment of the period: charges, refunds and reversals (with the payment reversed), method, amount',
    'payments.jsonl': 'the same payments, complete',
    'deletions.jsonl': 'the deletions observed in the period',
    'closes.csv': 'the period\'s closes (day, month, year): totals, the perpetual grand totals (incl. VAT, excl. VAT, absolute) and the accounting year\'s, the chain head at the close',
    'closes.jsonl': 'the same closes with all their figures (per rate, per method, refunds, late records)',
    'close_signatures.csv': 'each close\'s Ed25519 signature (over its chain hash)',
    'archives.csv': 'this truck\'s earlier archives, their manifest hash and signature',
    'device_fingerprints.csv': 'the offline devices\' fingerprints for the period\'s orders',
    'entry_actors.csv': 'the role (owner, staff, system…) behind each correction',
    'verify_events.jsonl': 'the chain verification result recorded after each close',
    'public_key.txt': 'the signing public key and its id',
    'SHA256SUMS.txt': 'every file\'s sha256 (sha256sum -c SHA256SUMS.txt)',
    'README-FR.txt': 'the same note in French', 'README-EN.txt': 'this note',
  },
}

function readme(lang: 'fr' | 'en', a: ArchiveInput, counts: Record<string, number>, identity: Record<string, unknown> | null): string {
  const v = (x: unknown) => (x === null || x === undefined || x === '' ? (lang === 'fr' ? '(non renseigné)' : '(not set)') : String(x))
  const id = identity ?? {}
  const names = [...Object.keys(FILE_NOTES[lang]), 'manifest.json', 'manifest.sig.json']
  const fileLines = names.map(n => `  ${n.padEnd(24)} ${n === 'manifest.json' ? (lang === 'fr' ? 'la liste de chaque fichier avec son empreinte sha256, la période, l’exercice, la version, la tête de chaîne de chaque jour' : 'every file with its sha256, the period, the accounting year, the version, each day\'s chain head')
    : n === 'manifest.sig.json' ? (lang === 'fr' ? '(si la clé est en place) la signature Ed25519 de l’empreinte sha256 de manifest.json' : '(when the key is set) the Ed25519 signature of manifest.json\'s sha256') : FILE_NOTES[lang][n]}`)
  if (lang === 'fr') return [
    'ARCHIVE FISCALE DE CAISSE — NOTICE EXPLICATIVE',
    '',
    `Logiciel : ${a.software.name}, version ${a.software.version} (racine de version majeure ${a.software.version.split('.')[0]})`,
    `Éditeur : HatchGrab Ltd`,
    `Camion (identifiant) : ${a.truckId}`,
    `Raison sociale : ${v(id.legal_name)} · SIREN / SIRET : ${v(id.registration_number)} · N° TVA : ${v(id.vat_number)} · Régime : ${v(id.vat_regime)}`,
    `Adresse : ${v(id.registered_address)}`,
    `Période : du ${a.from} au ${a.to} · Exercice : du ${a.accountingYear.start} au ${a.accountingYear.end} · Fuseau horaire : ${a.timeZone} · Devise : ${v(a.currency)}`,
    `Motif : ${a.reason === 'year' ? 'archive annuelle (après la clôture de l’exercice)' : a.reason === 'final' ? 'archive finale (avant la fermeture du compte)' : 'archive à la demande'}`,
    `Générée le : ${a.generatedAt} · Entrées de chaîne : ${counts.chain_entries} (tête ${counts.head_seq}) · Versions de commandes : ${counts.order_versions} · Paiements : ${counts.payments} · Clôtures : ${counts.closes}`,
    '',
    'FICHIERS (format ouvert : CSV en UTF-8 avec BOM, séparateur virgule, dates ISO 8601 ; JSON Lines). Montants dans la plus petite unité de la devise (centimes).',
    ...fileLines,
    '',
    'AUCUNE DONNÉE PERSONNELLE de client (nom, e-mail, téléphone, notes) n’est enregistrée dans ces fichiers. Seules les mentions légales de l’entreprise figurent dans les entrées « identité ».',
    '',
    'VÉRIFIER CETTE ARCHIVE (sans connexion, sans logiciel HatchGrab) :',
    '  1. Empreintes : sha256sum -c SHA256SUMS.txt — et chaque fichier listé dans manifest.json a cette empreinte sha256.',
    '  2. Signature : manifest.sig.json signe, avec la clé Ed25519 de public_key.txt, le texte de l’empreinte sha256 de manifest.json (64 caractères hexadécimaux minuscules, en UTF-8). La clé publique est aussi publiée par HatchGrab.',
    '  3. Chaîne : pour chaque ligne de chain.jsonl, payload_hash = sha256(payload) ; hash = sha256(prev_hash|seq|kind|ref|payload_hash) ; prev_hash = le hash de l’entrée précédente (64 zéros pour la première) ; seq se suit sans trou à partir de 1.',
    '  4. Clôtures : chaque clôture de closes.jsonl est l’entrée de chaîne de même seq et de même hash ; sa signature (close_signatures.csv) vérifie avec la clé publique ; sa tête de chaîne existe dans chain.jsonl.',
    '  5. Têtes de chaîne de chaque jour (manifest.json, day_heads) : chacune est l’entrée de chain.jsonl de même seq et de même hash.',
    '  L’outil scripts/till-verify.cjs --archive <fichier.zip> fait ces cinq contrôles (Node.js seul).',
    '',
    'CONSERVATION : à conserver au moins 10 ans. L’empreinte sha256 de manifest.json est elle-même enregistrée dans la chaîne (entrée de nature « archive »).',
    '',
  ].join('\r\n')
  return [
    'TILL ARCHIVE — EXPLANATORY NOTE',
    '',
    `Software: ${a.software.name}, version ${a.software.version} (major version root ${a.software.version.split('.')[0]})`,
    'Editor: HatchGrab Ltd',
    `Truck (id): ${a.truckId}`,
    `Legal name: ${v(id.legal_name)} · Registration (SIREN / SIRET): ${v(id.registration_number)} · VAT number: ${v(id.vat_number)} · Regime: ${v(id.vat_regime)}`,
    `Address: ${v(id.registered_address)}`,
    `Period: ${a.from} to ${a.to} · Accounting year: ${a.accountingYear.start} to ${a.accountingYear.end} · Time zone: ${a.timeZone} · Currency: ${v(a.currency)}`,
    `Reason: ${a.reason === 'year' ? 'yearly archive (after the accounting year\'s close)' : a.reason === 'final' ? 'final archive (before the account closes)' : 'archive on request'}`,
    `Generated: ${a.generatedAt} · Chain entries: ${counts.chain_entries} (head ${counts.head_seq}) · Order versions: ${counts.order_versions} · Payments: ${counts.payments} · Closes: ${counts.closes}`,
    '',
    'FILES (open formats: CSV in UTF-8 with a BOM, comma-separated, ISO 8601 dates; JSON Lines). Amounts in the currency\'s smallest unit (cents).',
    ...fileLines,
    '',
    'NO CUSTOMER PERSONAL DATA (name, email, phone, notes) is in these files. Only the business\'s legal details appear, in the "identity" entries.',
    '',
    'TO VERIFY THIS ARCHIVE (offline, without HatchGrab software):',
    '  1. Hashes: sha256sum -c SHA256SUMS.txt — and every file listed in manifest.json has that sha256.',
    '  2. Signature: manifest.sig.json signs, with the Ed25519 key in public_key.txt, the text of manifest.json\'s sha256 (64 lowercase hex characters, as UTF-8). HatchGrab also publishes the public key.',
    '  3. Chain: for each line of chain.jsonl, payload_hash = sha256(payload); hash = sha256(prev_hash|seq|kind|ref|payload_hash); prev_hash = the previous entry\'s hash (64 zeros for the first); seq runs from 1 with no gap.',
    '  4. Closes: each close in closes.jsonl is the chain entry with the same seq and hash; its signature (close_signatures.csv) verifies with the public key; its chain head exists in chain.jsonl.',
    '  5. Each day\'s chain head (manifest.json, day_heads): each is the entry of chain.jsonl with the same seq and hash.',
    '  scripts/till-verify.cjs --archive <file.zip> runs all five checks (Node.js only).',
    '',
    'KEEP IT for at least 10 years. manifest.json\'s sha256 is itself recorded in the chain (an entry of kind "archive").',
    '',
  ].join('\r\n')
}
