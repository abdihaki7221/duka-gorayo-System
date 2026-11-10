import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const { category, description, amount, expense_date, payment_method } = body
    const row = await queryOne(`
      UPDATE expenses SET category=$1, description=$2, amount=$3, expense_date=$4, payment_method=$5
      WHERE id=$6 RETURNING *
    `, [category, description, amount, expense_date, payment_method || 'cash', params.id])
    return NextResponse.json({ data: row })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await query('DELETE FROM expenses WHERE id=$1', [params.id])
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
