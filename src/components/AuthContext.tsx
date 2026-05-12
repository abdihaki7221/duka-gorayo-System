'use client'
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

interface User {
  id: number
  email: string
  name: string
  role: 'super_admin' | 'staff'
  token?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  isSuperAdmin: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null, loading: true, login: async () => {}, logout: async () => {}, isSuperAdmin: false
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const checkSession = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('duka_token') : null
      const res = await fetch('/api/auth', {
        headers: token ? { 'x-session-token': token } : {}
      })
      if (res.ok) {
        const { data } = await res.json()
        setUser(data)
      } else {
        setUser(null)
        localStorage.removeItem('duka_token')
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { checkSession() }, [checkSession])

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    localStorage.setItem('duka_token', data.data.token)
    setUser(data.data)
  }

  const logout = async () => {
    const token = localStorage.getItem('duka_token')
    await fetch('/api/auth', {
      method: 'DELETE',
      headers: token ? { 'x-session-token': token } : {}
    })
    localStorage.removeItem('duka_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isSuperAdmin: user?.role === 'super_admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }
