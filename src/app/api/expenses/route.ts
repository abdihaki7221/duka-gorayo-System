import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || ''
    const month = searchParams.get('month') || ''
    const rows = await query(`
      SELECT * FROM expenses
      WHERE category != 'Stock Purchase'
        AND ($1 = '' OR expense_date::text = $1)
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
    const { category, description, amount, expense_date, payment_method } = body
    if (!amount || !category) return NextResponse.json({ error: 'category and amount required' }, { status: 400 })
    const row = await queryOne(`
      INSERT INTO expenses (category, description, amount, expense_date, payment_method)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [category, description || '', Number(amount), expense_date || new Date().toISOString().split('T')[0], payment_method || 'cash'])
    return NextResponse.json({ data: row }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
