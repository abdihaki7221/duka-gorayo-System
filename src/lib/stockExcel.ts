// Excel bulk stock upload: template builder, parser and shared validation.
// Pure module — the ExcelJS instance is passed in so this file is safe to
// import from both client components and API routes.
import { autoCalcFraction } from './fraction'

export const MAX_BULK_ROWS = 500
const TEMPLATE_ROWS = 500 // rows pre-formatted with dropdowns in the template

export const BASE_UNITS = ['litre', 'kg', 'packet', 'unit'] as const
export const SELL_MODE_LABELS: Record<string, string> = {
  both: 'Both',
  denominations: 'Retail only',
  wholesale_units: 'Wholesale only',
}

export interface BulkDenom { label: string; fraction: number; sell_price: number }

export interface BulkProduct {
  row: number                 // Excel row number (for error messages)
  name: string
  category: string
  supplier: string
  base_unit: string
  sell_mode: string           // both | denominations | wholesale_units
  qty: number
  buy_price: number
  transport_cost: number
  ws_pack_qty: number
  ws_pack_label: string
  ws_buy_price: number
  ws_price: number
  low_stock_threshold: number
  expiry_date: string | null  // YYYY-MM-DD
  denominations: BulkDenom[]
}

export interface CheckedProduct extends BulkProduct {
  errors: string[]
  warnings: string[]
}

export interface ParseResult {
  products: CheckedProduct[]
  fileErrors: string[]   // problems not tied to one product row
}

// ---------------------------------------------------------------------------
// Column layout
// ---------------------------------------------------------------------------
const STOCK_COLUMNS = [
  { key: 'name', header: 'Product Name *', width: 28, note: 'Name shown in POS and reports. Must be unique — products already in the system are rejected.' },
  { key: 'category', header: 'Category *', width: 20, note: 'Pick from the list. A new name will be created as a category automatically.' },
  { key: 'supplier', header: 'Supplier', width: 20, note: 'Pick from the list or type a new supplier name (it will be added).' },
  { key: 'base_unit', header: 'Base Unit *', width: 12, note: 'litre, kg, packet or unit — the smallest unit you count stock in.' },
  { key: 'sell_mode', header: 'Sell Mode *', width: 15, note: 'Both = retail sizes + wholesale packs. Retail only = sizes only. Wholesale only = packs only.' },
  { key: 'qty', header: 'Quantity Received *', width: 14, note: 'Total base units received, e.g. 18 (litres) or 50 (kg). Not the number of packs.' },
  { key: 'buy_price', header: 'Buying Price per Base Unit (KES) *', width: 18, note: 'Cost of ONE base unit. Oil: 4600 ÷ 18 = 255.56 per litre.' },
  { key: 'transport_cost', header: 'Transport Cost Total (KES)', width: 14, note: 'Optional. Total transport for this delivery; it is spread across all units.' },
  { key: 'ws_pack_qty', header: 'WS Pack Size (base units per pack)', width: 16, note: 'Wholesale only/Both: how many base units make 1 pack, e.g. 20 for a 20L jerrycan, 12 for a bale of 12.' },
  { key: 'ws_pack_label', header: 'WS Pack Label', width: 18, note: 'Optional. Name of 1 pack, e.g. "20L jerry" or "bale". Defaults to the product name.' },
  { key: 'ws_buy_price', header: 'WS Buying Price per Pack (KES)', width: 16, note: 'Optional. What you pay for 1 pack. Leave blank to auto-calculate (buying price × pack size).' },
  { key: 'ws_price', header: 'WS Selling Price per Pack (KES)', width: 16, note: 'Wholesale only/Both: what you sell 1 pack for. Required for wholesale.' },
  { key: 'low_stock_threshold', header: 'Low Stock Alert (base units)', width: 14, note: 'Optional (default 5). You are alerted when stock drops below this.' },
  { key: 'expiry_date', header: 'Expiry Date (YYYY-MM-DD)', width: 16, note: 'Optional. Format YYYY-MM-DD, e.g. 2026-12-31. Leave blank for goods that do not expire.' },
] as const

const SIZE_COLUMNS = [
  { key: 'product', header: 'Product Name *', width: 28, note: 'Must match a Product Name on the Stock sheet exactly.' },
  { key: 'label', header: 'Size Label *', width: 18, note: 'e.g. 1/4 kg, 1/2 L, 500ml, 250g, packet of 50.' },
  { key: 'fraction', header: 'Fraction of 1 Base Unit', width: 16, note: 'Leave blank to auto-calculate from the label (1/4 kg → 0.25, 500ml → 0.5). Fill it only if the label is unusual.' },
  { key: 'sell_price', header: 'Selling Price (KES) *', width: 16, note: 'Retail price for this size.' },
] as const

// ---------------------------------------------------------------------------
// Template builder
// ---------------------------------------------------------------------------
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2535' } }
const REQUIRED_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8860B' } }

function styleHeader(ws: any, columns: readonly { header: string; note: string }[]) {
  const row = ws.getRow(1)
  row.height = 42
  columns.forEach((c, i) => {
    const cell = row.getCell(i + 1)
    cell.value = c.header
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = c.header.endsWith('*') ? REQUIRED_FILL : HEADER_FILL
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.note = c.note
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF000000' } } }
  })
}

export async function buildStockTemplate(
  ExcelJS: any,
  opts: { categories: string[]; suppliers: string[] }
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Gorayo Wholesalers'
  wb.created = new Date()

  const categories = opts.categories.length ? opts.categories : ['Other']
  const suppliers = opts.suppliers.length ? opts.suppliers : ['(type supplier name)']
  const last = TEMPLATE_ROWS + 1

  // --- Stock sheet ---------------------------------------------------------
  const stock = wb.addWorksheet('Stock', { views: [{ state: 'frozen', ySplit: 1 }] })
  stock.columns = STOCK_COLUMNS.map(c => ({ key: c.key, width: c.width }))
  styleHeader(stock, STOCK_COLUMNS)

  const col = (key: string) => STOCK_COLUMNS.findIndex(c => c.key === key) + 1
  const numVal = (min: number, msg: string) => ({
    type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [min],
    showErrorMessage: true, errorTitle: 'Number needed', error: msg,
  })

  for (let r = 2; r <= last; r++) {
    const row = stock.getRow(r)
    row.getCell(col('category')).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`Lists!$A$2:$A$${categories.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning', errorTitle: 'New category',
      error: 'This category is not in the list. It will be created when you upload.',
    }
    row.getCell(col('supplier')).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`Lists!$B$2:$B$${suppliers.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning', errorTitle: 'New supplier',
      error: 'This supplier is not in the list. It will be added when you upload.',
    }
    row.getCell(col('base_unit')).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"litre,kg,packet,unit"'],
      showErrorMessage: true, errorTitle: 'Base unit', error: 'Choose litre, kg, packet or unit.',
    }
    row.getCell(col('sell_mode')).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"Both,Retail only,Wholesale only"'],
      showErrorMessage: true, errorTitle: 'Sell mode', error: 'Choose Both, Retail only or Wholesale only.',
    }
    for (const k of ['qty', 'buy_price', 'transport_cost', 'ws_pack_qty', 'ws_buy_price', 'ws_price', 'low_stock_threshold']) {
      row.getCell(col(k)).dataValidation = numVal(0, 'Enter a number (no letters or "KES").')
      row.getCell(col(k)).numFmt = k === 'qty' || k === 'ws_pack_qty' || k === 'low_stock_threshold' ? '0.##' : '#,##0.00'
    }
    const exp = row.getCell(col('expiry_date'))
    exp.numFmt = 'yyyy-mm-dd'
    exp.dataValidation = {
      type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(Date.UTC(2000, 0, 1))],
      showErrorMessage: true, errorTitle: 'Expiry date', error: 'Enter a date like 2026-12-31.',
    }
  }

  // --- Retail Sizes sheet --------------------------------------------------
  const sizes = wb.addWorksheet('Retail Sizes', { views: [{ state: 'frozen', ySplit: 1 }] })
  sizes.columns = SIZE_COLUMNS.map(c => ({ key: c.key, width: c.width }))
  styleHeader(sizes, SIZE_COLUMNS)
  for (let r = 2; r <= TEMPLATE_ROWS * 3 + 1; r++) {
    const row = sizes.getRow(r)
    row.getCell(1).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`Stock!$A$2:$A$${last}`],
      showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Unknown product',
      error: 'This name is not on the Stock sheet. Sizes must match a product exactly.',
    }
    row.getCell(3).dataValidation = numVal(0, 'Enter a number like 0.25, or leave blank.')
    row.getCell(4).dataValidation = numVal(0, 'Enter a number (no letters or "KES").')
    row.getCell(4).numFmt = '#,##0.00'
  }

  // --- How to fill (instructions + examples) ------------------------------
  const how = wb.addWorksheet('How to fill')
  how.getColumn(1).width = 30
  for (let i = 2; i <= 14; i++) how.getColumn(i).width = 16
  const lines: [string, boolean?][] = [
    ['GORAYO WHOLESALERS — STOCK BULK UPLOAD', true],
    [''],
    ['1. Fill one row per product on the "Stock" sheet. Columns with * (gold headers) are required.'],
    ['2. Hover over any header to see what it means.'],
    ['3. For products sold in retail sizes (Sell Mode "Both" or "Retail only"), add their sizes on the "Retail Sizes" sheet — one row per size.'],
    ['4. Quantity and buying price are per BASE UNIT (per litre, per kg, per piece) — exactly like the single Add Stock form.'],
    ['5. Wholesale products ("Both" or "Wholesale only") need a Pack Size and a Selling Price per Pack.'],
    ['6. Expiry Date is optional. Use YYYY-MM-DD, e.g. 2026-12-31.'],
    ['7. Save the file and upload it on the Bulk Upload page. You will see a preview with any errors before anything is saved.'],
    ['8. Do not rename the sheets or the column headers.'],
    [''],
    ['EXAMPLE — Stock sheet', true],
  ]
  lines.forEach(([t, bold], i) => {
    const c = how.getCell(i + 1, 1)
    c.value = t
    c.font = { bold: !!bold, size: bold ? 13 : 11 }
  })
  let r = lines.length + 1
  STOCK_COLUMNS.forEach((c, i) => {
    const cell = how.getCell(r, i + 1)
    cell.value = c.header
    cell.font = { bold: true }
  })
  const examples = [
    ['Cooking Oil Fresh Fri', categories[0], suppliers[0], 'litre', 'Both', 40, 255.56, 400, 20, '20L jerry', 4600, 4850, 10, '2027-03-31'],
    ['Sugar Mumias', categories[0], suppliers[0], 'kg', 'Both', 100, 104, 0, 50, '50kg bag', 5200, 5500, 10, ''],
    ['Unga Jogoo 2kg', categories[0], suppliers[0], 'packet', 'Wholesale only', 120, 125, 0, 12, 'bale (12)', 1500, 1540, 24, '2026-12-15'],
  ]
  examples.forEach(ex => { r++; ex.forEach((v, i) => { how.getCell(r, i + 1).value = v }) })
  r += 2
  how.getCell(r, 1).value = 'EXAMPLE — Retail Sizes sheet'
  how.getCell(r, 1).font = { bold: true, size: 13 }
  r++
  SIZE_COLUMNS.forEach((c, i) => { const cell = how.getCell(r, i + 1); cell.value = c.header; cell.font = { bold: true } })
  const sizeEx = [
    ['Cooking Oil Fresh Fri', '1/4 L', '', 70],
    ['Cooking Oil Fresh Fri', '1/2 L', '', 135],
    ['Cooking Oil Fresh Fri', '1 L', '', 265],
    ['Sugar Mumias', '1/4 kg', '', 35],
    ['Sugar Mumias', '1/2 kg', '', 65],
    ['Sugar Mumias', '1 kg', '', 125],
  ]
  sizeEx.forEach(ex => { r++; ex.forEach((v, i) => { how.getCell(r, i + 1).value = v }) })
  r += 2
  how.getCell(r, 1).value = 'Unga Jogoo is "Wholesale only", so it needs no retail sizes.'
  how.getCell(r, 1).font = { italic: true }

  // --- Hidden lists (dropdown sources) ------------------------------------
  const lists = wb.addWorksheet('Lists')
  lists.getCell('A1').value = 'Categories'
  lists.getCell('B1').value = 'Suppliers'
  categories.forEach((c, i) => { lists.getCell(i + 2, 1).value = c })
  suppliers.forEach((s, i) => { lists.getCell(i + 2, 2).value = s })
  lists.state = 'hidden'

  wb.views = [{ activeTab: 0, firstSheet: 0 }]
  return wb.xlsx.writeBuffer()
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------
function cellRaw(cell: any): any {
  const v = cell?.value
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    if ('result' in v) return v.result ?? null           // formula
    if ('richText' in v) return (v.richText || []).map((t: any) => t.text).join('')
    if ('text' in v) return v.text                         // hyperlink
    if ('error' in v) return null
  }
  return v
}

function str(v: any): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).replace(/\s+/g, ' ').trim()
}

/** Returns number, null for blank, or NaN for junk. */
function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  const s = String(v).replace(/kes|ksh|,|\s/gi, '')
  if (s === '') return null
  const n = Number(s)
  return isFinite(n) ? n : NaN
}

function ymd(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Parse Excel date cell / text into YYYY-MM-DD. Returns undefined if blank, null if invalid. */
export function parseExpiry(v: any): string | null | undefined {
  if (v === null || v === undefined || v === '') return undefined
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    return ymd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate())
  }
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null // Excel serial range ≈ 1954–2119
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
    return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
  }
  const s = String(v).trim()
  if (!s) return undefined
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)               // 2026-12-31
  if (m) return ymd(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)                 // 31/12/2026 (Kenyan day-first)
  if (m) return ymd(+m[3], +m[2], +m[1])
  const months: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
  m = s.match(/^(\d{1,2})[\s-]+([a-z]{3})[a-z]*[\s-,]+(\d{4})$/i)      // 31 Dec 2026
  if (m && months[m[2].toLowerCase()]) return ymd(+m[3], months[m[2].toLowerCase()], +m[1])
  return null
}

function normBaseUnit(v: string): string | null {
  const s = v.toLowerCase().replace(/[^a-z]/g, '')
  if (!s) return null
  if (['litre', 'litres', 'liter', 'liters', 'l', 'ltr', 'ltrs'].includes(s)) return 'litre'
  if (['kg', 'kgs', 'kilogram', 'kilograms', 'kilo', 'kilos'].includes(s)) return 'kg'
  if (['packet', 'packets', 'piece', 'pieces', 'pc', 'pcs', 'packetpiece'].includes(s)) return 'packet'
  if (['unit', 'units'].includes(s)) return 'unit'
  return null
}

function normSellMode(v: string): string | null {
  const s = v.toLowerCase().replace(/[^a-z]/g, '')
  if (!s) return null
  if (['both', 'retailandwholesale', 'wholesaleandretail', 'bothretailwholesale'].includes(s)) return 'both'
  if (['retailonly', 'retail', 'denominations', 'retailbydenominationonly'].includes(s)) return 'denominations'
  if (['wholesaleonly', 'wholesale', 'wholesaleunits'].includes(s)) return 'wholesale_units'
  return null
}

function headerIndex(ws: any, columns: readonly { key: string; header: string }[]): Record<string, number> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
  const found: Record<string, number> = {}
  const hdr = ws.getRow(1)
  const cells: string[] = []
  for (let i = 1; i <= Math.max(hdr.cellCount, columns.length); i++) cells[i] = norm(str(cellRaw(hdr.getCell(i))))
  columns.forEach((c, i) => {
    const target = norm(c.header)
    const idx = cells.findIndex(h => h && h === target)
    found[c.key] = idx > 0 ? idx : i + 1 // fall back to template position
  })
  return found
}

// ---------------------------------------------------------------------------
// Validation (shared by browser preview and the API)
// ---------------------------------------------------------------------------
export function validateBulkProduct(
  p: BulkProduct,
  ctx: { existingNames: Set<string>; seenNames: Set<string>; todayYmd: string }
): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const key = (p.name || '').trim().toLowerCase()

  if (!key) errors.push('Product name is required')
  else if (ctx.existingNames.has(key)) errors.push('A product with this name already exists — edit it on the Stock page instead')
  else if (ctx.seenNames.has(key)) errors.push('This product name appears more than once in the file')

  if (!BASE_UNITS.includes(p.base_unit as any)) errors.push('Base Unit must be litre, kg, packet or unit')
  if (!['both', 'denominations', 'wholesale_units'].includes(p.sell_mode)) errors.push('Sell Mode must be Both, Retail only or Wholesale only')

  const bad = (n: any) => typeof n !== 'number' || isNaN(n)
  if (bad(p.qty) || p.qty <= 0) errors.push('Quantity Received must be a number greater than 0')
  if (bad(p.buy_price) || p.buy_price <= 0) errors.push('Buying Price per Base Unit must be a number greater than 0')
  if (bad(p.transport_cost) || p.transport_cost < 0) errors.push('Transport Cost must be 0 or more')
  if (bad(p.low_stock_threshold) || p.low_stock_threshold < 0) errors.push('Low Stock Alert must be 0 or more')

  const wantsWholesale = p.sell_mode === 'both' || p.sell_mode === 'wholesale_units'
  const wantsRetail = p.sell_mode === 'both' || p.sell_mode === 'denominations'

  if (wantsWholesale) {
    if (bad(p.ws_pack_qty) || p.ws_pack_qty < 1) errors.push('WS Pack Size is required for wholesale (1 or more)')
    if (bad(p.ws_price) || p.ws_price <= 0) errors.push('WS Selling Price per Pack is required for wholesale')
    if (bad(p.ws_buy_price) || p.ws_buy_price < 0) errors.push('WS Buying Price per Pack must be 0 or more')
    if (!errors.length) {
      const cost = p.ws_buy_price || (p.buy_price + (p.qty > 0 ? p.transport_cost / p.qty : 0)) * p.ws_pack_qty
      if (p.ws_price < cost) warnings.push(`Wholesale price (${p.ws_price}) is below pack cost (${cost.toFixed(2)}) — selling at a loss`)
    }
  }

  if (wantsRetail) {
    if (!p.denominations.length) errors.push('Retail sizes are required for "Both" / "Retail only" — add them on the Retail Sizes sheet')
    const costPerUnit = p.buy_price + (p.qty > 0 ? p.transport_cost / p.qty : 0)
    p.denominations.forEach(d => {
      if (!d.label) errors.push('A retail size has no label')
      if (bad(d.fraction) || d.fraction <= 0) errors.push(`Size "${d.label}": could not work out the fraction — fill the Fraction column`)
      if (bad(d.sell_price) || d.sell_price <= 0) errors.push(`Size "${d.label}": selling price must be greater than 0`)
      else if (!bad(d.fraction) && d.fraction > 0 && costPerUnit > 0 && d.sell_price < costPerUnit * d.fraction)
        warnings.push(`Size "${d.label}" sells below cost (${(costPerUnit * d.fraction).toFixed(2)})`)
    })
  } else if (p.denominations.length) {
    warnings.push('Retail sizes ignored — this product is "Wholesale only"')
  }

  if (p.expiry_date && p.expiry_date < ctx.todayYmd) warnings.push('Expiry date is already in the past')

  return { errors, warnings }
}

// ---------------------------------------------------------------------------
// Workbook parser (browser)
// ---------------------------------------------------------------------------
export async function parseStockWorkbook(
  ExcelJS: any,
  data: ArrayBuffer,
  opts: { existingNames: string[]; todayYmd: string }
): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook()
  const fileErrors: string[] = []
  try {
    await wb.xlsx.load(data)
  } catch {
    return { products: [], fileErrors: ['Could not read this file. Save it as an Excel workbook (.xlsx) and try again.'] }
  }

  const findSheet = (name: string) =>
    wb.worksheets.find((w: any) => w.name.trim().toLowerCase() === name.toLowerCase())
  const stock = findSheet('Stock')
  if (!stock) {
    return { products: [], fileErrors: ['No "Stock" sheet found. Download a fresh template and fill it in.'] }
  }
  const sizesWs = findSheet('Retail Sizes')

  const sc = headerIndex(stock, STOCK_COLUMNS)
  const raw: { row: number; get: (k: string) => any }[] = []
  stock.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
    if (rowNumber === 1) return
    const get = (k: string) => cellRaw(row.getCell(sc[k]))
    const keyCells = ['name', 'qty', 'buy_price', 'category', 'base_unit', 'sell_mode']
    if (keyCells.every(k => str(get(k)) === '')) return // skip blank / formatting-only rows
    raw.push({ row: rowNumber, get })
  })

  if (raw.length === 0) fileErrors.push('The Stock sheet has no products. Fill at least one row.')
  if (raw.length > MAX_BULK_ROWS) fileErrors.push(`Too many rows (${raw.length}). Upload at most ${MAX_BULK_ROWS} products at a time.`)

  // Retail sizes grouped by product name
  const sizesByName = new Map<string, { row: number; product: string; label: string; fraction: any; price: any }[]>()
  if (sizesWs) {
    const zc = headerIndex(sizesWs, SIZE_COLUMNS)
    sizesWs.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
      if (rowNumber === 1) return
      const product = str(cellRaw(row.getCell(zc.product)))
      const label = str(cellRaw(row.getCell(zc.label)))
      const fraction = cellRaw(row.getCell(zc.fraction))
      const price = cellRaw(row.getCell(zc.sell_price))
      if (!product && !label && str(price) === '') return
      if (!product) { fileErrors.push(`Retail Sizes row ${rowNumber}: product name is missing`); return }
      const k = product.toLowerCase()
      if (!sizesByName.has(k)) sizesByName.set(k, [])
      sizesByName.get(k)!.push({ row: rowNumber, product, label, fraction, price })
    })
  }

  const existingNames = new Set(opts.existingNames.map(n => n.trim().toLowerCase()))
  const seenNames = new Set<string>()
  const products: CheckedProduct[] = []

  for (const r of raw.slice(0, MAX_BULK_ROWS)) {
    const name = str(r.get('name'))
    const baseUnitRaw = str(r.get('base_unit'))
    const sellModeRaw = str(r.get('sell_mode'))
    const base_unit = normBaseUnit(baseUnitRaw) || baseUnitRaw.toLowerCase()
    const sell_mode = normSellMode(sellModeRaw) || sellModeRaw
    const preErrors: string[] = []

    const n = (k: string, fallback: number) => {
      const v = num(r.get(k))
      if (v === null) return fallback
      if (isNaN(v)) preErrors.push(`"${STOCK_COLUMNS.find(c => c.key === k)!.header.replace(' *', '')}" is not a number`)
      return v
    }

    const expRaw = r.get('expiry_date')
    const exp = parseExpiry(expRaw)
    if (exp === null) preErrors.push(`Expiry date "${str(expRaw)}" is not a valid date — use YYYY-MM-DD`)

    const denoms: BulkDenom[] = (sizesByName.get(name.toLowerCase()) || []).map(s => {
      const explicit = num(s.fraction)
      const fraction = explicit !== null && !isNaN(explicit) && explicit > 0
        ? explicit
        : Number(autoCalcFraction(s.label, base_unit) || NaN)
      const price = num(s.price)
      return { label: s.label, fraction, sell_price: price === null ? NaN : price }
    })
    if (name) sizesByName.delete(name.toLowerCase())

    const category = str(r.get('category'))
    const p: BulkProduct = {
      row: r.row,
      name,
      category: category || 'Other',
      supplier: str(r.get('supplier')),
      base_unit,
      sell_mode,
      qty: n('qty', NaN),
      buy_price: n('buy_price', NaN),
      transport_cost: n('transport_cost', 0),
      ws_pack_qty: n('ws_pack_qty', sell_mode === 'denominations' ? 1 : NaN),
      ws_pack_label: str(r.get('ws_pack_label')) || name,
      ws_buy_price: n('ws_buy_price', 0),
      ws_price: n('ws_price', sell_mode === 'denominations' ? 0 : NaN),
      low_stock_threshold: n('low_stock_threshold', 5),
      expiry_date: exp || null,
      denominations: denoms,
    }

    const { errors, warnings } = validateBulkProduct(p, { existingNames, seenNames, todayYmd: opts.todayYmd })
    if (!category) warnings.unshift('No category given — saved as "Other"')
    if (name) seenNames.add(name.toLowerCase())
    // Show the clearer "not a number" message instead of the generic range error
    products.push({ ...p, errors: Array.from(new Set([...preErrors, ...errors])), warnings })
  }

  // Sizes whose product name matched nothing on the Stock sheet
  sizesByName.forEach(list => {
    fileErrors.push(`Retail Sizes row${list.length > 1 ? 's' : ''} ${list.map(s => s.row).join(', ')}: product "${list[0].product}" is not on the Stock sheet`)
  })

  return { products, fileErrors }
}

export function nairobiTodayYmd(): string {
  // en-CA formats as YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' })
}
