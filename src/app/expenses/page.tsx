'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { fmt, fmtDate, today } from '@/lib/utils'

const CATEGORIES = ['Transport', 'Employee Salary', 'Utilities', 'Rent', 'Maintenance', 'Miscellaneous', 'Other']
const PAY_BADGE: Record<string,string> = { cash:'badge-green', mpesa:'badge-blue', kcb:'badge-yellow' }

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ category: 'Other', description: '', amount: '', expense_date: today(), payment_method: 'cash' })
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  function load() {
    setLoading(true)
    const p = new URLSearchParams()
    if (dateFilter) p.set('date', dateFilter)
    if (monthFilter) p.set('month', monthFilter)
    fetch(`/api/expenses?${p}`).then(r => r.json()).then(d => { setExpenses(d.data || []); setLoading(false) })
  }
  useEffect(() => { load() }, [dateFilter, monthFilter])

  async function save() {
    if (!form.amount || !form.category) return toast.error('Category and amount required')
    setSaving(true)
    try {
      const url = editId ? `/api/expenses/${editId}` : '/api/expenses'
      const method = editId ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(editId ? 'Updated!' : 'Expense recorded!')
      setShowForm(false); setEditId(null)
      setForm({ category: 'Other', description: '', amount: '', expense_date: today(), payment_method: 'cash' })
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function del(id: number) {
    if (!confirm('Delete this expense?')) return
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
    toast.success('Deleted'); load()
  }

  const total = expenses.reduce((a, e) => a + Number(e.amount), 0)
  const cashTotal = expenses.filter(e => (e.payment_method || 'cash') === 'cash').reduce((a, e) => a + Number(e.amount), 0)
  const mpesaTotal = expenses.filter(e => e.payment_method === 'mpesa').reduce((a, e) => a + Number(e.amount), 0)
  const kcbTotal = expenses.filter(e => e.payment_method === 'kcb').reduce((a, e) => a + Number(e.amount), 0)

  return (
    <div className="animate-in">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-sub">{expenses.length} records · Total: <strong className="text-red">{fmt(total)}</strong></p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditId(null); setForm({ category: 'Other', description: '', amount: '', expense_date: today(), payment_method: 'cash' }); setShowForm(true) }}>
          ➕ Add Expense
        </button>
      </div>

      {/* Payment method summary */}
      {expenses.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="duka-card flex items-center gap-3">
            <span className="text-xl">💵</span>
            <div><div className="text-xs text-muted uppercase">Cash Expenses</div><div className="mono text-red font-bold">{fmt(cashTotal)}</div></div>
          </div>
          <div className="duka-card flex items-center gap-3">
            <span className="text-xl">📱</span>
            <div><div className="text-xs text-muted uppercase">M-Pesa Expenses</div><div className="mono text-red font-bold">{fmt(mpesaTotal)}</div></div>
          </div>
          <div className="duka-card flex items-center gap-3">
            <span className="text-xl">🏦</span>
            <div><div className="text-xs text-muted uppercase">KCB Expenses</div><div className="mono text-red font-bold">{fmt(kcbTotal)}</div></div>
          </div>
        </div>
      )}

      <div className="duka-card mb-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 min-w-36"><label className="duka-label">Date</label>
          <input type="date" className="duka-input" value={dateFilter} onChange={e => { setDateFilter(e.target.value); setMonthFilter('') }} /></div>
        <div className="flex-1 min-w-36"><label className="duka-label">Month</label>
          <input type="month" className="duka-input" value={monthFilter} onChange={e => { setMonthFilter(e.target.value); setDateFilter('') }} /></div>
        <div className="flex items-end">
          <button className="btn btn-outline" onClick={() => { setDateFilter(''); setMonthFilter('') }}>Clear</button>
        </div>
      </div>

      <div className="duka-card">
        {loading ? <div className="empty-state">Loading...</div> : expenses.length === 0 ? <div className="empty-state">No expenses found</div> : (
          <div className="table-wrap">
            <table className="duka-table">
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Paid Via</th><th>Actions</th></tr></thead>
              <tbody>
                {expenses.map(e => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.expense_date)}</td>
                    <td><span className="badge badge-gray">{e.category}</span></td>
                    <td className="text-muted">{e.description || '—'}</td>
                    <td className="mono text-red font-semibold">{fmt(e.amount)}</td>
                    <td><span className={`badge ${PAY_BADGE[e.payment_method || 'cash'] || 'badge-gray'}`}>{(e.payment_method || 'cash').toUpperCase()}</span></td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-outline btn-sm" onClick={() => {
                          setEditId(e.id); setForm({ category: e.category, description: e.description || '', amount: String(e.amount), expense_date: e.expense_date.split('T')[0], payment_method: e.payment_method || 'cash' }); setShowForm(true)
                        }}>✏️</button>
                        <button className="btn btn-ghost btn-sm text-red" onClick={() => del(e.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h2 className="modal-title">{editId ? 'Edit' : 'New'} Expense</h2>
            <div className="space-y-4">
              <div><label className="duka-label">Category</label>
                <select className="duka-input duka-select" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select></div>
              <div><label className="duka-label">Description</label>
                <input className="duka-input" placeholder="What was this for?" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} /></div>
              <div><label className="duka-label">Amount (KES)</label>
                <input type="number" step="0.01" className="duka-input" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} /></div>
              <div><label className="duka-label">Payment Method</label>
                <select className="duka-input duka-select" value={form.payment_method} onChange={e => setForm(f => ({...f, payment_method: e.target.value}))}>
                  <option value="cash">💵 Cash</option>
                  <option value="mpesa">📱 M-Pesa</option>
                  <option value="kcb">🏦 KCB</option>
                </select></div>
              <div><label className="duka-label">Date</label>
                <input type="date" className="duka-input" value={form.expense_date} onChange={e => setForm(f => ({...f, expense_date: e.target.value}))} /></div>
              <div className="flex justify-end gap-3">
                <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '⏳...' : '💾 Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
