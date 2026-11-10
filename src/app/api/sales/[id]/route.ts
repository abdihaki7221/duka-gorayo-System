import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import pool from '@/lib/db'
import { genReceiptNo } from '@/lib/utils'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sale = await queryOne(`
      SELECT s.*,
        json_agg(DISTINCT jsonb_build_object(
          'id', si.id, 'product_id', si.product_id, 'product_name', si.product_name,
          'sale_type', si.sale_type, 'qty', si.qty, 'unit_price', si.unit_price,
          'subtotal', si.subtotal, 'profit', si.profit,
          'denomination_label', si.denomination_label, 'fraction', si.fraction
        )) FILTER (WHERE si.id IS NOT NULL) AS items,
        json_agg(DISTINCT jsonb_build_object(
          'method', sp.method, 'amount', sp.amount, 'reference', sp.reference
        )) FILTER (WHERE sp.id IS NOT NULL) AS payments
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN sale_payments sp ON sp.sale_id = s.id
      WHERE s.id=$1 GROUP BY s.id
    `, [params.id])
    if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data: sale })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const { status, payment_method, payment_ref } = body
    const sale = await queryOne(`
      UPDATE sales SET
        status = COALESCE($1, status),
        payment_method = COALESCE($2, payment_method),
        payment_ref = COALESCE($3, payment_ref)
      WHERE id=$4 RETURNING *
    `, [status, payment_method, payment_ref, params.id])

    if (status === 'paid') {
      await query(
        `UPDATE sale_payments SET method = COALESCE($1, method) WHERE sale_id=$2 AND method='credit'`,
        [payment_method || 'cash', params.id]
      )
    }
    return NextResponse.json({ data: sale })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/sales/[id] — process refund
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const client = await pool.connect()
  try {
    const { refund_method, refund_ref } = await req.json()
    if (!refund_method) return NextResponse.json({ error: 'refund_method required' }, { status: 400 })

    await client.query('BEGIN')

    // Get the original sale
    const orig = await client.query('SELECT * FROM sales WHERE id=$1 FOR UPDATE', [params.id])
    if (!orig.rows[0]) throw new Error('Sale not found')
    if (orig.rows[0].is_refund) throw new Error('Cannot refund a refund')

    // Check if already refunded
    const existingRefund = await client.query('SELECT id FROM sales WHERE refund_of_sale_id=$1', [params.id])
    if (existingRefund.rows.length > 0) throw new Error('This sale has already been refunded')

    const originalSale = orig.rows[0]

    // Get original items
    const origItems = await client.query('SELECT * FROM sale_items WHERE sale_id=$1', [params.id])

    // Create refund sale (negative amounts)
    const receiptNo = 'RFD-' + genReceiptNo().split('-').pop()
    const refundSale = await client.query(`
      INSERT INTO sales (
        receipt_no, customer_name, payment_method, subtotal, discount, total, profit,
        status, is_refund, refund_of_sale_id, refund_method, sale_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'refunded', TRUE, $8, $9, CURRENT_DATE)
      RETURNING *
    `, [
      receiptNo, originalSale.customer_name, refund_method,
      -Number(originalSale.subtotal), Number(originalSale.discount),
      -Number(originalSale.total), -Number(originalSale.profit),
      params.id, refund_method,
    ])

    // Insert refund payment
    await client.query(
      `INSERT INTO sale_payments (sale_id, method, amount, reference) VALUES ($1, $2, $3, $4)`,
      [refundSale.rows[0].id, refund_method, -Number(originalSale.total), refund_ref || null]
    )

    // Restore stock for each item
    for (const item of origItems.rows) {
      const baseDeduct = Number(item.fraction || 1) * Number(item.qty)
      await client.query(
        'UPDATE products SET qty = qty + $1, updated_at=NOW() WHERE id=$2',
        [baseDeduct, item.product_id]
      )
      await client.query(
        `INSERT INTO stock_movements (product_id, type, qty, note) VALUES ($1, 'in', $2, $3)`,
        [item.product_id, baseDeduct, `Refund from ${originalSale.receipt_no}`]
      )

      // Copy item as refund record
      await client.query(`
        INSERT INTO sale_items (sale_id, product_id, product_name, sale_type, qty, unit_price, buy_price, subtotal, profit, denomination_label, fraction)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [refundSale.rows[0].id, item.product_id, item.product_name, item.sale_type,
          item.qty, item.unit_price, item.buy_price, -Number(item.subtotal), -Number(item.profit),
          item.denomination_label, item.fraction])
    }

    // Mark original sale as refunded
    await client.query(
      `UPDATE sales SET status='refunded' WHERE id=$1`,
      [params.id]
    )

    await client.query('COMMIT')

    return NextResponse.json({
      data: { refund_sale: refundSale.rows[0], original_sale_id: params.id }
    }, { status: 201 })
  } catch (e: any) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: e.message }, { status: 500 })
  } finally {
    client.release()
  }
}
