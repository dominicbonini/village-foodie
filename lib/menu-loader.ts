// lib/menu-loader.ts

export interface MenuItem {
  name: string
  description: string
  price: number
  available: boolean
  category: string
}

export interface UpsellRule {
  trigger_category: string
  suggest_category: string
  max_suggestions: number
}

export interface Bundle {
  name: string
  description: string
  original_price: number | null
  bundle_price: number
  available: boolean
  start_time: string | null
  end_time: string | null
  slot_1_category: string | null
  slot_2_category: string | null
  slot_3_category: string | null
  slot_4_category: string | null
  slot_5_category: string | null
  slot_6_category: string | null
}

export interface DiscountCode {
  code: string
  type: 'pct' | 'fixed'
  value: number
  active: boolean
}

export interface TruckMenu {
  items: MenuItem[]
  upsell_rules: UpsellRule[]
  bundles: Bundle[]
  codes: DiscountCode[]
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i], nextChar = text[i + 1]
    if (char === '"' && inQuotes && nextChar === '"') { currentCell += '"'; i++ }
    else if (char === '"') { inQuotes = !inQuotes }
    else if (char === ',' && !inQuotes) { currentRow.push(currentCell.trim()); currentCell = '' }
    else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++
      currentRow.push(currentCell.trim()); rows.push(currentRow); currentRow = []; currentCell = ''
    } else { currentCell += char }
  }
  if (currentCell || currentRow.length > 0) { currentRow.push(currentCell.trim()); rows.push(currentRow) }
  return rows.map(row => row.map(c => c.replace(/^"|"$/g, '').trim()))
}

async function fetchTab(baseUrl: string, gid: string): Promise<string[][]> {
  const res = await fetch(`${baseUrl}?gid=${gid}&single=true&output=csv&t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to fetch tab gid=${gid}: ${res.status}`)
  return parseCSV(await res.text())
}

export async function loadTruckMenu(sheetConfig: string): Promise<TruckMenu> {
  let baseUrl: string, menuGid = '0', upsellGid = '1', bundleGid = '2', codesGid = '3'
  try {
    const config = JSON.parse(sheetConfig)
    baseUrl = config.base; menuGid = config.menu || '0'; upsellGid = config.upsells || '1'
    bundleGid = config.bundles || '2'; codesGid = config.codes || '3'
  } catch { baseUrl = sheetConfig }

  const [menuRows, upsellRows, bundleRows, codeRows] = await Promise.all([
    fetchTab(baseUrl, menuGid), fetchTab(baseUrl, upsellGid),
    fetchTab(baseUrl, bundleGid), fetchTab(baseUrl, codesGid),
  ])

  // Columns: name | description | price | available | category
  const items: MenuItem[] = menuRows.slice(1).filter(c => c[0])
    .map(c => ({
      name: c[0], description: c[1] || '', price: parseFloat(c[2]) || 0,
      available: c[3].toUpperCase() === 'TRUE', category: (c[4] || '').toLowerCase().trim(),
    })).filter(i => i.available && i.name && i.price > 0)

  // Columns: trigger_category | suggest_category | max_suggestions
  const upsell_rules: UpsellRule[] = upsellRows.slice(1).filter(c => c[0] && c[1])
    .map(c => ({
      trigger_category: c[0].toLowerCase().trim(),
      suggest_category: c[1].toLowerCase().trim(),
      max_suggestions: parseInt(c[2]) || 2,
    }))

  // Columns: name|description|original_price|bundle_price|available|start_time|end_time|slot_1..slot_6
  const bundles: Bundle[] = bundleRows.slice(1).filter(c => c[0])
    .map(c => ({
      name: c[0], description: c[1] || '',
      original_price: c[2] && c[2].trim() ? parseFloat(c[2]) : null, bundle_price: parseFloat(c[3]) || 0,
      available: c[4].toUpperCase() === 'TRUE',
      start_time: c[5] ? c[5].trim() : null, end_time: c[6] ? c[6].trim() : null,
      slot_1_category: c[7] ? c[7].toLowerCase().trim() : null,
      slot_2_category: c[8] ? c[8].toLowerCase().trim() : null,
      slot_3_category: c[9] ? c[9].toLowerCase().trim() : null,
      slot_4_category: c[10] ? c[10].toLowerCase().trim() : null,
      slot_5_category: c[11] ? c[11].toLowerCase().trim() : null,
      slot_6_category: c[12] ? c[12].toLowerCase().trim() : null,
    })).filter(b => b.available && b.name)

  // Columns: code | type | value | active
  const codes: DiscountCode[] = codeRows.slice(1).filter(c => c[0])
    .map(c => ({
      code: c[0].toUpperCase().trim(), type: (c[1] || 'fixed').toLowerCase() as 'pct' | 'fixed',
      value: parseFloat(c[2]) || 0, active: c[3].toUpperCase() === 'TRUE',
    })).filter(c => c.active && c.code && c.value > 0)

  return { items, upsell_rules, bundles, codes }
}

export async function loadTruckMenuSafe(sheetConfig: string): Promise<TruckMenu | null> {
  try { return await loadTruckMenu(sheetConfig) }
  catch (err) { console.error('Menu load failed:', sheetConfig, err); return null }
}