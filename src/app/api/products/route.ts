import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const products = await query(`
      SELECT p.*,
        FLOOR(p.qty / NULLIF(p.ws_pack_qty, 0)) AS wholesale_packs,
        MOD(p.qty::numeric, NULLIF(p.ws_pack_qty, 0)::numeric) AS remaining_units,
        (
          SELECT json_agg(d ORDER BY d.sort_order)
          FROM product_denominations d
          WHERE d.product_id = p.id AND d.is_active = TRUE
        ) AS denominations
      FROM products p
      WHERE p.is_deleted = FALSE
        AND ($1 = '' OR p.name ILIKE '%'||$1||'%' OR p.category ILIKE '%'||$1||'%')
      ORDER BY p.category, p.name
    `, [search])
    return NextResponse.json({ data: products })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      name, category, supplier, qty, buy_price, transport_cost,
      ws_price, ws_buy_price, retail_price, low_stock_threshold,
      sell_mode, base_unit, base_qty, ws_pack_qty, ws_pack_label,
      denominations
    } = body

    if (!name || !qty || !buy_price)
      return NextResponse.json({ error: 'name, qty, buy_price required' }, { status: 400 })

    const n = Number(qty)
    const transport = Number(transport_cost || 0)
    const costPerUnit = Number(buy_price) + (n > 0 ? transport / n : 0)

    // ws_buy_price: the wholesale buying cost per pack
    // If not provided, calculate from costPerUnit * ws_pack_qty
    const wsBuyPrice = Number(ws_buy_price || 0) || (costPerUnit * Number(ws_pack_qty || 12))

    const product = await queryOne(`
      INSERT INTO products (
        name, category, supplier, qty, units_per_dozen,
        buy_price, ws_price, ws_buy_price, retail_price, low_stock_threshold,
        sell_mode, base_unit, base_qty, ws_pack_qty, ws_pack_label
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [
      name, category||'Other', supplier||'', n,
      Math.floor(Number(ws_pack_qty||12)), costPerUnit,
      Number(ws_price||0), wsBuyPrice, Number(retail_price||0),
      Number(low_stock_threshold||12),
      sell_mode||'both', base_unit||'unit',
      Number(base_qty||1), Number(ws_pack_qty||12),
      ws_pack_label||'pack'
    ])

    if (denominations?.length) {
      for (let i = 0; i < denominations.length; i++) {
        const d = denominations[i]
        await query(
          `INSERT INTO product_denominations (product_id, label, fraction, sell_price, sort_order)
           VALUES ($1,$2,$3,$4,$5)`,
          [product!.id, d.label, Number(d.fraction), Number(d.sell_price), i]
        )
      }
    }

    await query(
      `INSERT INTO stock_movements (product_id, type, qty, note) VALUES ($1,'in',$2,$3)`,
      [product!.id, n, `Initial stock from ${supplier||'supplier'}`]
    )

    return NextResponse.json({ data: product }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
