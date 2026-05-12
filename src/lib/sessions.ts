// Shared in-memory session store — single instance across all API routes
// For production, replace with Redis or JWT tokens

interface SessionData {
  userId: number
  role: string
  email: string
  name: string
}

declare global {
  var _dukaSessionStore: Map<string, SessionData> | undefined
}

// Reuse across hot-reloads in development
const sessions: Map<string, SessionData> = global._dukaSessionStore ?? new Map()
if (process.env.NODE_ENV !== 'production') global._dukaSessionStore = sessions

export function getSession(token: string): SessionData | null {
  return sessions.get(token) || null
}

export function setSession(token: string, data: SessionData) {
  sessions.set(token, data)
}

export function deleteSession(token: string) {
  sessions.delete(token)
}

export function getUserFromRequest(req: Request): SessionData | null {
  // Check cookie first
  const cookieHeader = req.headers.get('cookie') || ''
  const cookieMatch = cookieHeader.match(/duka_session=([^;]+)/)
  const cookieToken = cookieMatch ? cookieMatch[1] : ''

  // Then check header
  const headerToken = req.headers.get('x-session-token') || ''

  const token = cookieToken || headerToken
  if (!token) return null
  return getSession(token)
}
