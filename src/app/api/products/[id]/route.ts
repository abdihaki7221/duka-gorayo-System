import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const product = await queryOne(`
      SELECT p.*,
        (SELECT json_agg(d ORDER BY d.sort_order)
         FROM product_denominations d
         WHERE d.product_id = p.id AND d.is_active = TRUE
        ) AS denominations
      FROM products p WHERE p.id=$1
    `, [params.id])
    if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data: product })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const ex = await queryOne<any>('SELECT * FROM products WHERE id=$1', [params.id])
    if (!ex) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const newQty = Number(body.qty ?? ex.qty)
    const diff = newQty - Number(ex.qty)

    const wsPackQty = Number(body.ws_pack_qty ?? ex.ws_pack_qty)

    const product = await queryOne(`
      UPDATE products SET
        name=$1, category=$2, supplier=$3, qty=$4,
        buy_price=$5, ws_price=$6, retail_price=$7,
        low_stock_threshold=$8, sell_mode=$9, base_unit=$10,
        base_qty=$11, ws_pack_qty=$12, ws_pack_label=$13,
        units_per_dozen=$14, ws_buy_price=$15, updated_at=NOW()
      WHERE id=$16 RETURNING *
    `, [
      body.name ?? ex.name,
      body.category ?? ex.category,
      body.supplier ?? ex.supplier,
      newQty,
      Number(body.buy_price ?? ex.buy_price),
      Number(body.ws_price ?? ex.ws_price),
      Number(body.retail_price ?? ex.retail_price),
      Number(body.low_stock_threshold ?? ex.low_stock_threshold),
      body.sell_mode ?? ex.sell_mode,
      body.base_unit ?? ex.base_unit,
      Number(body.base_qty ?? ex.base_qty),
      wsPackQty,
      body.ws_pack_label ?? ex.ws_pack_label,
      Math.floor(wsPackQty),
      Number(body.ws_buy_price ?? ex.ws_buy_price ?? 0),
      params.id
    ])

    if (diff !== 0) {
      await query(
        `INSERT INTO stock_movements (product_id, type, qty, note) VALUES ($1,$2,$3,'Manual adjustment')`,
        [params.id, diff > 0 ? 'in' : 'adjustment', Math.abs(diff)]
      )
    }

    // Update denominations if provided — update in-place to preserve foreign keys from sale_items
    if (body.denominations !== undefined) {
      // Get existing denomination IDs for this product
      const existingDenoms = await query<any>(
        'SELECT id FROM product_denominations WHERE product_id=$1 ORDER BY sort_order',
        [params.id]
      )
      const existingIds = existingDenoms.map((d: any) => d.id)

      const incomingDenoms = (body.denominations || []).filter(
        (d: any) => d.label && d.fraction && d.sell_price
      )

      // Update or insert each incoming denomination
      const keptIds: number[] = []
      for (let i = 0; i < incomingDenoms.length; i++) {
        const d = incomingDenoms[i]
        if (d.id && existingIds.includes(d.id)) {
          // Update existing denomination in-place (preserves the ID for sale_items FK)
          await query(
            `UPDATE product_denominations SET label=$1, fraction=$2, sell_price=$3, sort_order=$4
             WHERE id=$5`,
            [d.label, Number(d.fraction), Number(d.sell_price), i, d.id]
          )
          keptIds.push(d.id)
        } else if (existingIds[i] && !keptIds.includes(existingIds[i])) {
          // Reuse an existing row by updating it (avoids FK violation)
          await query(
            `UPDATE product_denominations SET label=$1, fraction=$2, sell_price=$3, sort_order=$4
             WHERE id=$5`,
            [d.label, Number(d.fraction), Number(d.sell_price), i, existingIds[i]]
          )
          keptIds.push(existingIds[i])
        } else {
          // Insert brand new denomination
          const newD = await queryOne<any>(
            `INSERT INTO product_denominations (product_id, label, fraction, sell_price, sort_order)
             VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [params.id, d.label, Number(d.fraction), Number(d.sell_price), i]
          )
          if (newD) keptIds.push(newD.id)
        }
      }

      // Soft-delete denominations that were removed (deactivate instead of delete to preserve FK)
      const unusedIds = existingIds.filter((id: number) => !keptIds.includes(id))
      if (unusedIds.length > 0) {
        await query(
          `UPDATE product_denominations SET is_active=FALSE WHERE id = ANY($1::int[])`,
          [unusedIds]
        )
      }
    }

    // Fetch updated product with denominations
    const updated = await queryOne(`
      SELECT p.*,
        (SELECT json_agg(d ORDER BY d.sort_order)
         FROM product_denominations d
         WHERE d.product_id = p.id AND d.is_active = TRUE
        ) AS denominations
      FROM products p WHERE p.id=$1
    `, [params.id])

    return NextResponse.json({ data: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await query('UPDATE products SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1', [params.id])
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
