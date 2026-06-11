import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || ''
    const month = searchParams.get('month') || ''
    const rows = await query(`
      SELECT * FROM expenses
      WHERE ($1 = '' OR expense_date::text = $1)
        AND ($2 = '' OR TO_CHAR(expense_date, 'YYYY-MM') = $2)
      ORDER BY expense_date DESC, created_at DESC
    `, [date, month])
    return NextResponse.json({ data: rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      category, description, amount, expense_date, payment_method,
      payments, // array of {method, amount} for split payments
      stock_product_name, stock_quantity,
    } = body

    if (!amount || !category) return NextResponse.json({ error: 'category and amount required' }, { status: 400 })

    // For stock payments, require product details
    if (category === 'Stock Payment') {
      if (!stock_product_name?.trim()) return NextResponse.json({ error: 'Product name is required for stock payments' }, { status: 400 })
      if (!stock_quantity || Number(stock_quantity) <= 0) return NextResponse.json({ error: 'Quantity is required for stock payments' }, { status: 400 })
    }

    // Calculate cash_amount from split payments or single payment
    let cashAmount = 0
    let primaryMethod = payment_method || 'cash'
    let breakdown: any[] = []

    if (payments && Array.isArray(payments) && payments.length > 0) {
      // Split payment mode
      breakdown = payments.filter((p: any) => p.amount && Number(p.amount) > 0)
      cashAmount = breakdown
        .filter((p: any) => p.method === 'cash')
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0)
      // Primary method = the one with highest amount
      const sorted = [...breakdown].sort((a, b) => Number(b.amount) - Number(a.amount))
      primaryMethod = sorted[0]?.method || 'cash'
    } else {
      // Single payment
      cashAmount = primaryMethod === 'cash' ? Number(amount) : 0
      breakdown = [{ method: primaryMethod, amount: Number(amount) }]
    }

    const row = await queryOne(`
      INSERT INTO expenses (category, description, amount, expense_date, payment_method, cash_amount, payment_breakdown, stock_product_name, stock_quantity)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, [
      category,
      description || '',
      Number(amount),
      expense_date || new Date().toISOString().split('T')[0],
      primaryMethod,
      cashAmount,
      JSON.stringify(breakdown),
      stock_product_name?.trim() || null,
      stock_quantity ? Number(stock_quantity) : null,
    ])

    return NextResponse.json({ data: row }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
