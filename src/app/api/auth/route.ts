import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { verifyPassword, generateToken } from '@/lib/auth'
import { getSession, setSession, deleteSession, getUserFromRequest } from '@/lib/sessions'

// Re-export for backward compat
// export { getUserFromRequest }

// POST /api/auth - Login
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const user = await queryOne<any>(
      'SELECT * FROM users WHERE email = $1 AND is_active = TRUE',
      [email.toLowerCase().trim()]
    )

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const valid = verifyPassword(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const token = generateToken()
    setSession(token, {
      userId: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
    })

    const response = NextResponse.json({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        token,
      }
    })

    response.cookies.set('duka_session', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    })

    return response
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET /api/auth - Check session
export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  return NextResponse.json({ data: user })
}

// DELETE /api/auth - Logout
export async function DELETE(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie') || ''
  const cookieMatch = cookieHeader.match(/duka_session=([^;]+)/)
  const token = cookieMatch ? cookieMatch[1] : ''
  deleteSession(token)
  const response = NextResponse.json({ success: true })
  response.cookies.delete('duka_session')
  return response
}
