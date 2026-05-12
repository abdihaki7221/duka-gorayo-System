import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { getUserFromRequest } from '@/lib/sessions'

// GET /api/users - list users (super_admin only)
export async function GET(req: NextRequest) {
  try {
    const session = getUserFromRequest(req)
    if (!session || session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    const users = await query(
      `SELECT id, email, name, role, is_active, created_at FROM users ORDER BY created_at DESC`
    )
    return NextResponse.json({ data: users })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/users - create user (super_admin only)
export async function POST(req: NextRequest) {
  try {
    const session = getUserFromRequest(req)
    if (!session || session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { email, name, password, role } = await req.json()
    if (!email || !name || !password) {
      return NextResponse.json({ error: 'email, name, password required' }, { status: 400 })
    }
    if (!['super_admin', 'staff'].includes(role || 'staff')) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const existing = await queryOne('SELECT id FROM users WHERE email=$1', [email.toLowerCase().trim()])
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const hash = hashPassword(password)
    const user = await queryOne(
      `INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, is_active, created_at`,
      [email.toLowerCase().trim(), name, hash, role || 'staff']
    )

    return NextResponse.json({ data: user }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/users - reset password
export async function PATCH(req: NextRequest) {
  try {
    const { user_id, new_password, email } = await req.json()

    if (!new_password || new_password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // Forgot password flow - reset by email (no auth needed)
    if (email && !user_id) {
      const user = await queryOne('SELECT id FROM users WHERE email=$1 AND is_active=TRUE', [email.toLowerCase().trim()])
      if (!user) {
        return NextResponse.json({ error: 'No active user found with that email' }, { status: 404 })
      }
      const hash = hashPassword(new_password)
      await query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, (user as any).id])
      return NextResponse.json({ success: true, message: 'Password reset successfully' })
    }

    // Admin resetting another user's password
    const session = getUserFromRequest(req)
    if (!session || session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const hash = hashPassword(new_password)
    await query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, user_id])
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PUT /api/users - toggle active/deactivate
export async function PUT(req: NextRequest) {
  try {
    const session = getUserFromRequest(req)
    if (!session || session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { user_id, is_active } = await req.json()
    const user = await queryOne(
      'UPDATE users SET is_active=$1, updated_at=NOW() WHERE id=$2 RETURNING id, email, name, role, is_active',
      [is_active, user_id]
    )
    return NextResponse.json({ data: user })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
