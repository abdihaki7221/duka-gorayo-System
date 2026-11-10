'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { fmt, fmtDate, today } from '@/lib/utils'

const CATEGORIES = ['Employee Salary', 'Maintenance', 'Miscellaneous', 'Other', 'Rent', 'Stock Payment', 'Transport', 'Utilities']
const PAY_BADGE: Record<string,string> = { cash:'badge-green', mpesa:'badge-blue', kcb:'badge-yellow' }

interface PayRow { method: string; amount: string }

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    category: 'Other', description: '', amount: '', expense_date: today(),
    payment_method: 'cash', stock_product_name: '', stock_quantity: '',
  })
  const [payments, setPayments] = useState<PayRow[]>([{ method: 'cash', amount: '' }])
  const [isSplit, setIsSplit] = useState(false)
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

  function resetForm() {
    setForm({ category: 'Other', description: '', amount: '', expense_date: today(), payment_method: 'cash', stock_product_name: '', stock_quantity: '' })
    setPayments([{ method: 'cash', amount: '' }])
    setIsSplit(false)
    setEditId(null)
  }

  async function save() {
    if (!form.category) return toast.error('Category required')

    // Validate amounts
    if (isSplit) {
      const totalPay = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0)
      if (totalPay <= 0) return toast.error('Split payment amounts must total more than 0')
      // Auto-set the total from split payments
      form.amount = String(totalPay)
    } else {
      if (!form.amount || Number(form.amount) <= 0) return toast.error('Amount required')
    }

    if (form.category === 'Stock Payment') {
      if (!form.stock_product_name?.trim()) return toast.error('Product name is required for stock payments')
      if (!form.stock_quantity || Number(form.stock_quantity) <= 0) return toast.error('Quantity is required for stock payments')
    }

    setSaving(true)
    try {
      const url = editId ? `/api/expenses/${editId}` : '/api/expenses'
      const method = editId ? 'PUT' : 'POST'
      const body: any = { ...form, amount: Number(form.amount) }

      if (isSplit) {
        body.payments = payments.filter(p => Number(p.amount) > 0).map(p => ({ method: p.method, amount: Number(p.amount) }))
      }

      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(editId ? 'Updated!' : 'Expense recorded!')
      setShowForm(false); resetForm(); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function del(id: number) {
    if (!confirm('Delete this expense?')) return
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
    toast.success('Deleted'); load()
  }

  // Totals (exclude Stock Payment from operational total)
  const operationalExpenses = expenses.filter(e => e.category !== 'Stock Payment')
  const stockExpenses = expenses.filter(e => e.category === 'Stock Payment')
  const total = expenses.reduce((a, e) => a + Number(e.amount), 0)
  const operationalTotal = operationalExpenses.reduce((a, e) => a + Number(e.amount), 0)
  const stockTotal = stockExpenses.reduce((a, e) => a + Number(e.amount), 0)
  const cashTotal = expenses.reduce((a, e) => a + Number(e.cash_amount || 0), 0)

  const splitTotal = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0)

  return (
    <div className="animate-in">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-sub">{expenses.length} records · Total: <strong className="text-red">{fmt(total)}</strong></p>
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true) }}>
          ➕ Add Expense
        </button>
      </div>

      {/* Summary cards */}
      {expenses.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
          <div className="duka-card flex items-center gap-3">
            <span className="text-xl">📊</span>
            <div><div className="text-xs text-muted uppercase">Operational</div><div className="mono text-red font-bold">{fmt(operationalTotal)}</div></div>
          </div>
          <div className="duka-card flex items-center gap-3">
            <span className="text-xl">📦</span>
            <div><div className="text-xs text-muted uppercase">Stock Payments</div><div className="mono text-yellow font-bold">{fmt(stockTotal)}</div></div>
          </div>
          <div className="duka-card flex items-center gap-3">
            <span className="text-xl">💵</span>
            <div><div className="text-xs text-muted uppercase">Cash Used</div><div className="mono text-red font-bold">{fmt(cashTotal)}</div>
              <div className="text-xs text-muted">Deducted from safe</div></div>
          </div>
          <div className="duka-card flex items-center gap-3">
            <span className="text-xl">📋</span>
            <div><div className="text-xs text-muted uppercase">All Expenses</div><div className="mono text-red font-bold">{fmt(total)}</div></div>
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
                {expenses.map(e => {
                  const breakdown = (() => { try { return JSON.parse(e.payment_breakdown || '[]') } catch { return [] } })()
                  const isStockPay = e.category === 'Stock Payment'
                  return (
                    <tr key={e.id}>
                      <td>{fmtDate(e.expense_date)}</td>
                      <td><span className={`badge ${isStockPay ? 'badge-yellow' : 'badge-gray'}`}>{e.category}</span></td>
                      <td className="text-muted">
                        {e.description || '—'}
                        {isStockPay && e.stock_product_name && (
                          <div className="text-xs text-accent mt-0.5">📦 {e.stock_product_name} × {e.stock_quantity}</div>
                        )}
                      </td>
                      <td className="mono text-red font-semibold">{fmt(e.amount)}</td>
                      <td>
                        {breakdown.length > 1 ? (
                          <div className="space-y-0.5">
                            {breakdown.map((p: any, i: number) => (
                              <span key={i} className={`badge ${PAY_BADGE[p.method] || 'badge-gray'} text-xs mr-1`}>
                                {p.method?.toUpperCase()} {fmt(p.amount)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className={`badge ${PAY_BADGE[e.payment_method || 'cash'] || 'badge-gray'}`}>{(e.payment_method || 'cash').toUpperCase()}</span>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-ghost btn-sm text-red" onClick={() => del(e.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Expense Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 540 }}>
            <h2 className="modal-title">{editId ? 'Edit' : 'New'} Expense</h2>
            <div className="space-y-4">
              <div><label className="duka-label">Category *</label>
                <select className="duka-input duka-select" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              {/* Stock Payment specific fields */}
              {form.category === 'Stock Payment' && (
                <div className="bg-surface2 rounded-lg p-4 space-y-3">
                  <div className="text-xs text-muted uppercase font-semibold mb-1">📦 Stock Payment Details</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="duka-label">Product Name *</label>
                      <input className="duka-input" placeholder="e.g. Cooking Oil 20L" value={form.stock_product_name}
                        onChange={e => setForm(f => ({...f, stock_product_name: e.target.value}))} /></div>
                    <div><label className="duka-label">Quantity *</label>
                      <input type="number" step="1" min="1" className="duka-input" placeholder="e.g. 5" value={form.stock_quantity}
                        onChange={e => setForm(f => ({...f, stock_quantity: e.target.value}))} /></div>
                  </div>
                  <p className="text-muted text-xs">This records the payment only. Stock quantity is added separately via Add Stock.</p>
                </div>
              )}

              <div><label className="duka-label">Description</label>
                <input className="duka-input" placeholder="What was this for?" value={form.description}
                  onChange={e => setForm(f => ({...f, description: e.target.value}))} /></div>

              {/* Payment section */}
              <div className="flex items-center gap-3 mb-1">
                <label className="duka-label mb-0">Payment</label>
                <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                  <input type="checkbox" checked={isSplit} onChange={e => {
                    setIsSplit(e.target.checked)
                    if (e.target.checked) {
                      setPayments([{ method: 'cash', amount: '' }, { method: 'mpesa', amount: '' }])
                    } else {
                      setPayments([{ method: 'cash', amount: '' }])
                    }
                  }} />
                  Split payment
                </label>
              </div>

              {!isSplit ? (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="duka-label">Method</label>
                    <select className="duka-input duka-select" value={form.payment_method}
                      onChange={e => setForm(f => ({...f, payment_method: e.target.value}))}>
                      <option value="cash">💵 Cash</option>
                      <option value="mpesa">📱 M-Pesa</option>
                      <option value="kcb">🏦 KCB</option>
                    </select></div>
                  <div><label className="duka-label">Amount (KES) *</label>
                    <input type="number" step="0.01" className="duka-input" value={form.amount}
                      onChange={e => setForm(f => ({...f, amount: e.target.value}))} /></div>
                </div>
              ) : (
                <div className="bg-surface2 rounded-lg p-3 space-y-2">
                  {payments.map((p, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select className="duka-input duka-select flex-1" value={p.method}
                        onChange={e => setPayments(prev => prev.map((pp, j) => j === i ? {...pp, method: e.target.value} : pp))}>
                        <option value="cash">💵 Cash</option>
                        <option value="mpesa">📱 M-Pesa</option>
                        <option value="kcb">🏦 KCB</option>
                      </select>
                      <input type="number" step="0.01" placeholder="Amount" className="duka-input flex-1"
                        value={p.amount} onChange={e => setPayments(prev => prev.map((pp, j) => j === i ? {...pp, amount: e.target.value} : pp))} />
                      {payments.length > 1 && (
                        <button className="btn btn-ghost btn-sm text-red" onClick={() => setPayments(prev => prev.filter((_, j) => j !== i))}>✕</button>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between items-center">
                    <button className="btn btn-ghost btn-sm" onClick={() => setPayments(prev => [...prev, { method: 'cash', amount: '' }])}>+ Add method</button>
                    <span className="mono text-sm font-semibold text-accent">Total: {fmt(splitTotal)}</span>
                  </div>
                </div>
              )}

              <div><label className="duka-label">Date</label>
                <input type="date" className="duka-input" value={form.expense_date}
                  onChange={e => setForm(f => ({...f, expense_date: e.target.value}))} /></div>

              {form.category === 'Stock Payment' && (
                <div className="bg-surface2 rounded-lg p-3 text-xs text-muted">
                  💡 Stock payments are journaled for tracking. Cash amounts deduct from safe balance.
                  This does <strong>not</strong> affect your daily profit or add stock inventory.
                </div>
              )}

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
