import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const rows = await query('SELECT * FROM suppliers ORDER BY name ASC')
    return NextResponse.json({ data: rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, phone, email } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Supplier name required' }, { status: 400 })
    const [row] = await query(
      'INSERT INTO suppliers (name, phone, email) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), phone?.trim() || null, email?.trim() || null]
    )
    return NextResponse.json({ data: row }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await query('DELETE FROM suppliers WHERE id = $1', [id])
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
