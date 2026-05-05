// lib/menu-loader.ts
// Fetches truck menu data from a published Google Sheet via public CSV export.
// Uses the same pattern as the existing useVillageData hook — no API key needed.
// The sheet must be published to web via File → Share → Publish to web.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MenuItem {
    name: string
    description: string
    price: number
    available: boolean
    category: string
    upsell_ids: string[]
  }
  
  export interface UpsellItem {
    id: string
    name: string
    price: number
    available: boolean
    upsell_for: string
  }
  
  export interface Bundle {
    name: string
    description: string
    original_price: number
    bundle_price: number
    available: boolean
  }
  
  export interface DiscountCode {
    code: string
    type: 'pct' | 'fixed'
    value: number
    active: boolean
  }
  
  export interface TruckMenu {
    items: MenuItem[]
    upsells: UpsellItem[]
    bundles: Bundle[]
    codes: DiscountCode[]
  }
  
  // ─── CSV parser ───────────────────────────────────────────────────────────────
  // Same robust parser used in the existing useVillageData hook
  
  function parseCSV(text: string): string[][] {
    const rows: string[][] = []
    let currentRow: string[] = []
    let currentCell = ''
    let inQuotes = false
  
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      const nextChar = text[i + 1]
  
      if (char === '"' && inQuotes && nextChar === '"') {
        currentCell += '"'
        i++
      } else if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentCell.trim())
        currentCell = ''
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') i++
        currentRow.push(currentCell.trim())
        rows.push(currentRow)
        currentRow = []
        currentCell = ''
      } else {
        currentCell += char
      }
    }
    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell.trim())
      rows.push(currentRow)
    }
    return rows.map(row => row.map(c => c.replace(/^"|"$/g, '').trim()))
  }
  
  // ─── Fetch a single tab as CSV ────────────────────────────────────────────────
  
  async function fetchTab(baseUrl: string, gid: string): Promise<string[][]> {
    const url = `${baseUrl}?gid=${gid}&single=true&output=csv&t=${Date.now()}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Failed to fetch tab gid=${gid}: ${res.status}`)
    const text = await res.text()
    return parseCSV(text)
  }
  
  // ─── Main menu loader ─────────────────────────────────────────────────────────
  
  export async function loadTruckMenu(sheetConfig: string): Promise<TruckMenu> {
    // sheetConfig stored in trucks.sheet_id is a JSON string with base URL and GIDs
    // e.g. {"base":"https://.../pub","menu":"0","upsells":"72463921","bundles":"336640050","codes":"1998360395"}
    // Falls back to treating the value as a plain base URL with default GIDs
  
    let baseUrl: string
    let menuGid = '0'
    let upsellGid = '1'
    let bundleGid = '2'
    let codesGid = '3'
  
    try {
      const config = JSON.parse(sheetConfig)
      baseUrl   = config.base
      menuGid   = config.menu    || '0'
      upsellGid = config.upsells || '1'
      bundleGid = config.bundles || '2'
      codesGid  = config.codes   || '3'
    } catch {
      // Plain URL fallback — use default GIDs
      baseUrl = sheetConfig
    }
  
    // Fetch all four tabs in parallel
    const [menuRows, upsellRows, bundleRows, codeRows] = await Promise.all([
      fetchTab(baseUrl, menuGid),
      fetchTab(baseUrl, upsellGid),
      fetchTab(baseUrl, bundleGid),
      fetchTab(baseUrl, codesGid),
    ])
  
    // ── Parse menu tab ──────────────────────────────────────────────────────────
    // Columns: name | description | price | available | category | upsell_ids
    const items: MenuItem[] = menuRows
      .slice(1)
      .filter(cols => cols[0])
      .map(cols => ({
        name:        cols[0] || '',
        description: cols[1] || '',
        price:       parseFloat(cols[2]) || 0,
        available:   (cols[3] || '').toUpperCase() === 'TRUE',
        category:    (cols[4] || '').toLowerCase(),
        upsell_ids:  cols[5] ? cols[5].split(',').map(s => s.trim()) : [],
      }))
      .filter(item => item.available && item.name && item.price > 0)
  
    // ── Parse upsells tab ───────────────────────────────────────────────────────
    // Columns: id | name | price | available | upsell_for
    const upsells: UpsellItem[] = upsellRows
      .slice(1)
      .filter(cols => cols[0])
      .map(cols => ({
        id:         cols[0] || '',
        name:       cols[1] || '',
        price:      parseFloat(cols[2]) || 0,
        available:  (cols[3] || '').toUpperCase() === 'TRUE',
        upsell_for: (cols[4] || '').toLowerCase(),
      }))
      .filter(u => u.available && u.name && u.price > 0)
  
    // ── Parse bundles tab ───────────────────────────────────────────────────────
    // Columns: name | description | original_price | bundle_price | available
    const bundles: Bundle[] = bundleRows
      .slice(1)
      .filter(cols => cols[0])
      .map(cols => ({
        name:           cols[0] || '',
        description:    cols[1] || '',
        original_price: parseFloat(cols[2]) || 0,
        bundle_price:   parseFloat(cols[3]) || 0,
        available:      (cols[4] || '').toUpperCase() === 'TRUE',
      }))
      .filter(b => b.available && b.name)
  
    // ── Parse codes tab ─────────────────────────────────────────────────────────
    // Columns: code | type | value | active
    const codes: DiscountCode[] = codeRows
      .slice(1)
      .filter(cols => cols[0])
      .map(cols => ({
        code:   (cols[0] || '').toUpperCase().trim(),
        type:   (cols[1] || 'fixed').toLowerCase() as 'pct' | 'fixed',
        value:  parseFloat(cols[2]) || 0,
        active: (cols[3] || '').toUpperCase() === 'TRUE',
      }))
      .filter(c => c.active && c.code && c.value > 0)
  
    return { items, upsells, bundles, codes }
  }
  
  // ─── Safe wrapper ─────────────────────────────────────────────────────────────
  // Use this in API routes — returns null on failure rather than throwing
  
  export async function loadTruckMenuSafe(sheetConfig: string): Promise<TruckMenu | null> {
    try {
      return await loadTruckMenu(sheetConfig)
    } catch (err) {
      console.error('Menu load failed:', sheetConfig, err)
      return null
    }
  }