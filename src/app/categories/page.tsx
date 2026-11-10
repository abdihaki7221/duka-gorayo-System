'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  function load() {
    setLoading(true)
    fetch('/api/categories').then(r => r.json()).then(d => {
      setCategories(d.data || [])
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  async function add() {
    if (!newName.trim()) return toast.error('Enter a category name')
    setSaving(true)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Category "${newName.trim()}" added!`)
      setNewName('')
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function remove(cat: any) {
    if (!confirm(`Delete category "${cat.name}"? Products in this category won't be affected.`)) return
    try {
      const res = await fetch('/api/categories', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cat.id })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Category deleted')
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  const filtered = categories.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="animate-in max-w-2xl">
      <div className="mb-6">
        <h1 className="page-title">Product Categories</h1>
        <p className="page-sub">Manage product categories used across the system</p>
      </div>

      {/* Add new */}
      <div className="duka-card mb-4">
        <div className="duka-card-title">➕ Add New Category</div>
        <div className="flex gap-3">
          <input className="duka-input flex-1" placeholder="e.g. Household Items, Cosmetics"
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()} />
          <button className="btn btn-primary" onClick={add} disabled={saving}>
            {saving ? '⏳...' : '💾 Add'}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="duka-card">
        <div className="flex justify-between items-center mb-4">
          <div className="duka-card-title" style={{marginBottom:0}}>📂 All Categories ({categories.length})</div>
          <input className="duka-input" style={{maxWidth:200}} placeholder="Search..." value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        {loading ? <div className="empty-state">Loading...</div> : filtered.length === 0 ? (
          <div className="empty-state">No categories found</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filtered.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-surface2 rounded-lg px-4 py-3">
                <span className="text-white font-medium">{c.name}</span>
                <button className="btn btn-ghost btn-sm text-red" onClick={() => remove(c)}>🗑️</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
