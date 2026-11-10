'use client'
import { useState } from 'react'
import { useAuth } from '@/components/AuthContext'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [newPass, setNewPass] = useState('')
  const [resetting, setResetting] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
      toast.success('Welcome back!')
    } catch (err: any) {
      toast.error(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!resetEmail || !newPass) return toast.error('Fill in all fields')
    if (newPass.length < 6) return toast.error('Password must be at least 6 characters')
    setResetting(true)
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, new_password: newPass })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Password reset successfully! You can now login.')
      setShowReset(false)
      setEmail(resetEmail)
      setResetEmail('')
      setNewPass('')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 mb-4">
            <span className="text-3xl">🏪</span>
          </div>
          <h1 className="font-serif text-3xl text-white">Gorayo Wholesalers</h1>
          <p className="text-muted text-sm mt-1">Wholesale & Retail Management System</p>
        </div>

        {!showReset ? (
          <form onSubmit={handleLogin} className="duka-card">
            <h2 className="text-lg font-semibold text-white mb-6">Sign In</h2>
            <div className="space-y-4">
              <div>
                <label className="duka-label">Email Address</label>
                <input type="email" className="duka-input" placeholder="admin@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="duka-label">Password</label>
                <input type="password" className="duka-input" placeholder="Enter password"
                  value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
                {loading ? '⏳ Signing in...' : '🔐 Sign In'}
              </button>
            </div>
            <div className="mt-4 text-center">
              <button type="button" className="text-accent text-sm hover:underline"
                onClick={() => setShowReset(true)}>
                Forgot Password?
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleReset} className="duka-card">
            <h2 className="text-lg font-semibold text-white mb-2">Reset Password</h2>
            <p className="text-muted text-sm mb-6">Enter your email and a new password to reset.</p>
            <div className="space-y-4">
              <div>
                <label className="duka-label">Email Address</label>
                <input type="email" className="duka-input" placeholder="your@email.com"
                  value={resetEmail} onChange={e => setResetEmail(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="duka-label">New Password</label>
                <input type="password" className="duka-input" placeholder="Min 6 characters"
                  value={newPass} onChange={e => setNewPass(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={resetting}>
                {resetting ? '⏳ Resetting...' : '🔄 Reset Password'}
              </button>
            </div>
            <div className="mt-4 text-center">
              <button type="button" className="text-accent text-sm hover:underline"
                onClick={() => setShowReset(false)}>
                ← Back to Login
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-muted text-xs mt-6">
          © {new Date().getFullYear()} Gorayo Wholesalers · Secure Business Management
        </p>
      </div>
    </div>
  )
}
