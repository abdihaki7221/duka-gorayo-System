'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@/components/AuthContext'
import { fmtDate } from '@/lib/utils'

export default function UsersPage() {
  const { isSuperAdmin } = useAuth()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'staff' })
  const [saving, setSaving] = useState(false)
  const [resetModal, setResetModal] = useState<any>(null)
  const [newPass, setNewPass] = useState('')

  function load() {
    setLoading(true)
    fetch('/api/users')
      .then(r => r.json())
      .then(d => { setUsers(d.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  if (!isSuperAdmin) return <div className="empty-state">🔒 Only super admins can manage users</div>

  async function createUser() {
    if (!form.email || !form.name || !form.password) return toast.error('Fill all fields')
    setSaving(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('User created!')
      setShowCreate(false); setForm({ email: '', name: '', password: '', role: 'staff' }); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function toggleActive(user: any) {
    const res = await fetch('/api/users', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, is_active: !user.is_active })
    })
    if (res.ok) { toast.success(user.is_active ? 'Deactivated' : 'Activated'); load() }
  }

  async function resetPassword() {
    if (!newPass || newPass.length < 6) return toast.error('Min 6 characters')
    const res = await fetch('/api/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: resetModal.id, new_password: newPass })
    })
    if (res.ok) { toast.success('Password reset!'); setResetModal(null); setNewPass('') }
    else toast.error('Failed')
  }

  return (
    <div className="animate-in">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div><h1 className="page-title">User Management</h1><p className="page-sub">{users.length} users</p></div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>➕ Add User</button>
      </div>

      <div className="duka-card">
        {loading ? <div className="empty-state">Loading...</div> : (
          <div className="table-wrap">
            <table className="duka-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td className="text-white font-medium">{u.name}</td>
                    <td className="mono text-sm">{u.email}</td>
                    <td><span className={`badge ${u.role==='super_admin'?'badge-yellow':'badge-blue'}`}>{u.role==='super_admin'?'⭐ Super Admin':'👤 Staff'}</span></td>
                    <td><span className={`badge ${u.is_active?'badge-green':'badge-red'}`}>{u.is_active?'Active':'Inactive'}</span></td>
                    <td className="text-muted text-sm">{fmtDate(u.created_at)}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-outline btn-sm" onClick={() => setResetModal(u)}>🔑 Reset</button>
                        <button className={`btn btn-sm ${u.is_active?'btn-ghost text-red':'btn-success'}`} onClick={() => toggleActive(u)}>
                          {u.is_active?'⛔':'✅'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h2 className="modal-title">Create New User</h2>
            <div className="space-y-4">
              <div><label className="duka-label">Full Name</label><input className="duka-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} /></div>
              <div><label className="duka-label">Email</label><input type="email" className="duka-input" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} /></div>
              <div><label className="duka-label">Password</label><input type="password" className="duka-input" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} /></div>
              <div><label className="duka-label">Role</label>
                <select className="duka-input duka-select" value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}>
                  <option value="staff">👤 Staff Admin</option>
                  <option value="super_admin">⭐ Super Admin</option>
                </select>
                <p className="text-xs text-muted mt-1">Staff cannot see profits or manage users</p>
              </div>
              <div className="flex justify-end gap-3">
                <button className="btn btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={createUser} disabled={saving}>{saving ? '⏳...' : '✅ Create'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {resetModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setResetModal(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2 className="modal-title">Reset Password</h2>
            <p className="text-muted text-sm mb-4">For <strong className="text-white">{resetModal.name}</strong></p>
            <div className="space-y-4">
              <div><label className="duka-label">New Password</label><input type="password" className="duka-input" value={newPass} onChange={e => setNewPass(e.target.value)} /></div>
              <div className="flex justify-end gap-3">
                <button className="btn btn-outline" onClick={() => setResetModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={resetPassword}>🔑 Reset</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
