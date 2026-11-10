import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { cleanExpiryInput } from '@/lib/expiry'
import { BulkProduct, MAX_BULK_ROWS, nairobiTodayYmd, validateBulkProduct } from '@/lib/stockExcel'

// POST /api/products/bulk — import products parsed from the Excel template.
// The browser already validated the file, but everything is re-checked here.
// All rows are saved in ONE transaction: either every product is added or none.
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const incoming: any[] = Array.isArray(body?.products) ? body.products : []
  if (incoming.length === 0) return NextResponse.json({ error: 'No products to import' }, { status: 400 })
  if (incoming.length > MAX_BULK_ROWS)
    return NextResponse.json({ error: `At most ${MAX_BULK_ROWS} products per upload` }, { status: 400 })

  // Coerce to the expected shape (never trust the client's types)
  const toNum = (v: any, fallback = NaN) => (v === null || v === undefined || v === '' ? fallback : Number(v))
  const products: BulkProduct[] = incoming.map((p, i) => ({
    row: Number(p.row) || i + 2,
    name: String(p.name ?? '').trim().slice(0, 200),
    category: String(p.category ?? '').trim().slice(0, 200) || 'Other',
    supplier: String(p.supplier ?? '').trim().slice(0, 200),
    base_unit: String(p.base_unit ?? ''),
    sell_mode: String(p.sell_mode ?? ''),
    qty: toNum(p.qty),
    buy_price: toNum(p.buy_price),
    transport_cost: toNum(p.transport_cost, 0),
    ws_pack_qty: toNum(p.ws_pack_qty, p.sell_mode === 'denominations' ? 1 : NaN),
    ws_pack_label: String(p.ws_pack_label ?? '').trim().slice(0, 50),
    ws_buy_price: toNum(p.ws_buy_price, 0),
    ws_price: toNum(p.ws_price, p.sell_mode === 'denominations' ? 0 : NaN),
    low_stock_threshold: toNum(p.low_stock_threshold, 5),
    expiry_date: p.expiry_date ?? null,
    denominations: (Array.isArray(p.denominations) ? p.denominations : []).map((d: any) => ({
      label: String(d.label ?? '').trim().slice(0, 50),
      fraction: toNum(d.fraction),
      sell_price: toNum(d.sell_price),
    })),
  }))

  const client = await pool.connect()
  try {
    // ---- Validate everything before writing anything ----------------------
    const existing = await client.query('SELECT LOWER(TRIM(name)) AS n FROM products WHERE is_deleted = FALSE')
    const existingNames = new Set<string>(existing.rows.map((r: any) => r.n))
    const seenNames = new Set<string>()
    const todayYmd = nairobiTodayYmd()
    const rowErrors: { row: number; name: string; errors: string[] }[] = []

    for (const p of products) {
      const errors: string[] = []
      try { p.expiry_date = cleanExpiryInput(p.expiry_date) ?? null }
      catch (e: any) { errors.push(e.message) }
      errors.push(...validateBulkProduct(p, { existingNames, seenNames, todayYmd }).errors)
      if (p.name) seenNames.add(p.name.toLowerCase())
      if (errors.length) rowErrors.push({ row: p.row, name: p.name, errors })
    }
    if (rowErrors.length) {
      return NextResponse.json({ error: `${rowErrors.length} row(s) have errors — nothing was saved`, rowErrors }, { status: 422 })
    }

    // ---- Write ------------------------------------------------------------
    await client.query('BEGIN')

    // New categories (unique on name)
    const categories = Array.from(new Set(products.map(p => p.category)))
    for (const c of categories) {
      await client.query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [c])
    }
    // New suppliers (case-insensitive match; table has no unique constraint)
    const supRes = await client.query('SELECT LOWER(TRIM(name)) AS n FROM suppliers')
    const knownSuppliers = new Set<string>(supRes.rows.map((r: any) => r.n))
    for (const s of Array.from(new Set(products.map(p => p.supplier).filter(Boolean)))) {
      if (!knownSuppliers.has(s.toLowerCase())) {
        await client.query('INSERT INTO suppliers (name) VALUES ($1)', [s])
        knownSuppliers.add(s.toLowerCase())
      }
    }

    const created: { id: number; name: string }[] = []
    for (const p of products) {
      const wantsRetail = p.sell_mode === 'both' || p.sell_mode === 'denominations'
      // Same cost rules as the single Add Stock form / POST /api/products
      const costPerUnit = p.buy_price + (p.qty > 0 ? p.transport_cost / p.qty : 0)
      const packQty = p.ws_pack_qty || 1
      const wsBuyPrice = p.ws_buy_price || costPerUnit * packQty

      const ins = await client.query(`
        INSERT INTO products (
          name, category, supplier, qty, units_per_dozen,
          buy_price, ws_price, ws_buy_price, retail_price, low_stock_threshold,
          sell_mode, base_unit, base_qty, ws_pack_qty, ws_pack_label, expiry_date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING id, name
      `, [
        p.name, p.category, p.supplier, p.qty, Math.floor(packQty),
        costPerUnit, p.ws_price || 0, wsBuyPrice, 0, p.low_stock_threshold,
        p.sell_mode, p.base_unit, 1, packQty, p.ws_pack_label || p.name, p.expiry_date,
      ])
      const id = ins.rows[0].id

      if (wantsRetail) {
        for (let i = 0; i < p.denominations.length; i++) {
          const d = p.denominations[i]
          await client.query(
            `INSERT INTO product_denominations (product_id, label, fraction, sell_price, sort_order)
             VALUES ($1,$2,$3,$4,$5)`,
            [id, d.label, d.fraction, d.sell_price, i]
          )
        }
      }

      await client.query(
        `INSERT INTO stock_movements (product_id, type, qty, note) VALUES ($1,'in',$2,$3)`,
        [id, p.qty, `Bulk upload${p.supplier ? ` from ${p.supplier}` : ''}`]
      )
      created.push({ id, name: ins.rows[0].name })
    }

    await client.query('COMMIT')
    return NextResponse.json({ data: { inserted: created.length, products: created } }, { status: 201 })
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {})
    return NextResponse.json({ error: e.message }, { status: 500 })
  } finally {
    client.release()
  }
}
