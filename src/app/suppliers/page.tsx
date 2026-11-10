'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  function load() {
    setLoading(true)
    fetch('/api/suppliers').then(r => r.json()).then(d => {
      setSuppliers(d.data || [])
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  async function add() {
    if (!form.name.trim()) return toast.error('Enter a supplier name')
    setSaving(true)
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Supplier "${form.name}" added!`)
      setForm({ name: '', phone: '', email: '' })
      setShowForm(false)
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function remove(sup: any) {
    if (!confirm(`Delete supplier "${sup.name}"?`)) return
    try {
      const res = await fetch('/api/suppliers', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sup.id })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Supplier deleted')
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  const filtered = suppliers.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.phone && s.phone.includes(search))
  )

  return (
    <div className="animate-in max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Suppliers</h1>
          <p className="page-sub">Manage your product suppliers</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>➕ Add Supplier</button>
      </div>

      {/* List */}
      <div className="duka-card">
        <div className="flex justify-between items-center mb-4">
          <div className="duka-card-title" style={{marginBottom:0}}>🏭 All Suppliers ({suppliers.length})</div>
          <input className="duka-input" style={{maxWidth:200}} placeholder="Search..." value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        {loading ? <div className="empty-state">Loading...</div> : filtered.length === 0 ? (
          <div className="empty-state">No suppliers found. Add your first supplier!</div>
        ) : (
          <div className="table-wrap">
            <table className="duka-table">
              <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td className="text-white font-medium">{s.name}</td>
                    <td className="text-muted">{s.phone || '—'}</td>
                    <td className="text-muted">{s.email || '—'}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm text-red" onClick={() => remove(s)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add form modal */}
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h2 className="modal-title">➕ Add Supplier</h2>
            <div className="space-y-4">
              <div>
                <label className="duka-label">Supplier Name *</label>
                <input className="duka-input" placeholder="e.g. Bidco, Pwani Oil" value={form.name}
                  onChange={e => setForm(f => ({...f, name: e.target.value}))} />
              </div>
              <div>
                <label className="duka-label">Phone</label>
                <input className="duka-input" placeholder="e.g. 0712345678" value={form.phone}
                  onChange={e => setForm(f => ({...f, phone: e.target.value}))} />
              </div>
              <div>
                <label className="duka-label">Email</label>
                <input className="duka-input" type="email" placeholder="e.g. sales@bidco.co.ke" value={form.email}
                  onChange={e => setForm(f => ({...f, email: e.target.value}))} />
              </div>
              <div className="flex justify-end gap-3">
                <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={add} disabled={saving}>
                  {saving ? '⏳...' : '💾 Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
