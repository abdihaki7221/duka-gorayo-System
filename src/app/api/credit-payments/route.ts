import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import pool from '@/lib/db'
import { genReceiptNo } from '@/lib/utils'

// GET /api/credit-payments
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || ''
    const month = searchParams.get('month') || ''

    const rows = await query(`
      SELECT cp.*, s.receipt_no, s.customer_name, s.total as sale_total
      FROM credit_payments cp
      JOIN sales s ON s.id = cp.sale_id
      WHERE ($1 = '' OR cp.paid_date::text = $1)
        AND ($2 = '' OR TO_CHAR(cp.paid_date, 'YYYY-MM') = $2)
      ORDER BY cp.created_at DESC
    `, [date, month])

    return NextResponse.json({ data: rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/credit-payments
// Supports split: payments: [{method, amount, reference}] OR single: {sale_id, amount, method, reference}
export async function POST(req: NextRequest) {
  const client = await pool.connect()
  try {
    const body = await req.json()

    // Check if creating a manual debt
    if (body.type === 'manual_debt') {
      const { customer_name, amount, note, debt_date } = body
      if (!customer_name || !amount) {
        return NextResponse.json({ error: 'customer_name and amount required' }, { status: 400 })
      }

      await client.query('BEGIN')

      const receiptNo = genReceiptNo()
      const sale = await client.query(`
        INSERT INTO sales (
          receipt_no, customer_name, payment_method, subtotal, total, profit,
          status, is_split_payment, is_manual_debt, sale_date
        ) VALUES ($1, $2, 'credit', $3, $3, 0, 'pending', FALSE, TRUE, $4)
        RETURNING *
      `, [receiptNo, customer_name, Number(amount), debt_date || new Date().toISOString().split('T')[0]])

      await client.query(
        `INSERT INTO sale_payments (sale_id, method, amount) VALUES ($1, 'credit', $2)`,
        [sale.rows[0].id, Number(amount)]
      )

      await client.query('COMMIT')

      return NextResponse.json({
        data: { ...sale.rows[0], note: note || 'Pre-existing debt' }
      }, { status: 201 })
    }

    // Normal credit payment recording
    const { sale_id, payments: splitPayments, amount, method, reference, note } = body

    if (!sale_id) {
      return NextResponse.json({ error: 'sale_id required' }, { status: 400 })
    }

    // Normalize: accept either split payments array or single payment
    const paymentsList = splitPayments?.length
      ? splitPayments
      : [{ method: method || 'cash', amount: Number(amount || 0), reference: reference || null }]

    const totalPaying = paymentsList.reduce((a: number, p: any) => a + Number(p.amount || 0), 0)
    if (totalPaying <= 0) {
      return NextResponse.json({ error: 'Payment amount must be greater than 0' }, { status: 400 })
    }

    await client.query('BEGIN')

    const sale = await client.query('SELECT * FROM sales WHERE id=$1 FOR UPDATE', [sale_id])
    if (!sale.rows[0]) throw new Error('Sale not found')
    if (sale.rows[0].status === 'paid') throw new Error('Sale is already fully paid')

    // Record each payment entry
    for (const p of paymentsList) {
      if (Number(p.amount) > 0) {
        await client.query(
          `INSERT INTO credit_payments (sale_id, amount, method, reference, note, paid_date)
           VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)`,
          [sale_id, Number(p.amount), p.method, p.reference || null, note || null]
        )
      }
    }

    // Check total paid so far
    const totalPaidRes = await client.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM credit_payments WHERE sale_id=$1',
      [sale_id]
    )
    const creditAmount = Number(sale.rows[0].total)
    const paidSoFar = Number(totalPaidRes.rows[0].total)

    // If fully paid, update sale status
    if (paidSoFar >= creditAmount - 0.5) {
      // Determine primary payment method from all credit payments
      const methodRes = await client.query(
        `SELECT method, SUM(amount) as total FROM credit_payments WHERE sale_id=$1 GROUP BY method ORDER BY total DESC LIMIT 1`,
        [sale_id]
      )
      const primaryMethod = methodRes.rows[0]?.method || 'cash'

      await client.query(
        `UPDATE sales SET status='paid', payment_method=$1 WHERE id=$2`,
        [primaryMethod, sale_id]
      )
      await client.query(
        `UPDATE sale_payments SET method=$1 WHERE sale_id=$2 AND method='credit'`,
        [primaryMethod, sale_id]
      )
    }

    await client.query('COMMIT')

    return NextResponse.json({
      data: {
        sale_id,
        total_paying: totalPaying,
        fully_paid: paidSoFar >= creditAmount - 0.5,
        remaining: Math.max(0, creditAmount - paidSoFar),
        paid_so_far: paidSoFar,
      }
    }, { status: 201 })
  } catch (e: any) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: e.message }, { status: 500 })
  } finally {
    client.release()
  }
}
