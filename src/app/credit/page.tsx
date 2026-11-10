'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { fmt, fmtDate } from '@/lib/utils'
import ReceiptModal from '@/components/ReceiptModal'

interface PayRow { method: string; amount: string; reference: string }

export default function CreditPage() {
  const [credits, setCredits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [receipt, setReceipt] = useState<any>(null)
  const [payModal, setPayModal] = useState<any>(null)
  const [payments, setPayments] = useState<PayRow[]>([{ method: 'cash', amount: '', reference: '' }])
  const [payNote, setPayNote] = useState('')
  const [paying, setPaying] = useState(false)
  const [recentPayments, setRecentPayments] = useState<any[]>([])
  const [showAddDebt, setShowAddDebt] = useState(false)
  const [debtForm, setDebtForm] = useState({ customer_name: '', amount: '', note: '', debt_date: new Date().toISOString().split('T')[0] })
  const [addingDebt, setAddingDebt] = useState(false)
  const [editDebtModal, setEditDebtModal] = useState<any>(null)
  const [editDebtForm, setEditDebtForm] = useState({ new_amount: '', reason: '' })
  const [editingDebt, setEditingDebt] = useState(false)
  const [creditScores, setCreditScores] = useState<any>(null)
  const [scoresLoading, setScoresLoading] = useState(true)
  const [showScores, setShowScores] = useState(false)

  function load() {
    setLoading(true)
    // Fetch pending sales with paid-so-far amounts
    fetch('/api/sales?status=pending&limit=500')
      .then(r => r.json())
      .then(async d => {
        const sales = d.data || []
        // For each sale, get total credit payments already made
        const enriched = await Promise.all(sales.map(async (s: any) => {
          try {
            const cpRes = await fetch(`/api/credit-payments?date=&month=`)
            const cpData = await cpRes.json()
            const salePayments = (cpData.data || []).filter((cp: any) => cp.sale_id === s.id)
            const paidSoFar = salePayments.reduce((a: number, cp: any) => a + Number(cp.amount), 0)
            return { ...s, paid_so_far: paidSoFar, remaining: Number(s.total) - paidSoFar }
          } catch { return { ...s, paid_so_far: 0, remaining: Number(s.total) } }
        }))
        setCredits(enriched)
        setLoading(false)
      })
    fetch('/api/credit-payments').then(r => r.json()).then(d => setRecentPayments(d.data || []))
  }

  useEffect(() => {
    load()
    fetch('/api/credit-scores').then(r => r.json()).then(d => {
      setCreditScores(d.data || null)
      setScoresLoading(false)
    }).catch(() => setScoresLoading(false))
  }, [])

  function openPayModal(s: any) {
    setPayModal(s)
    const remaining = Number(s.remaining || s.total)
    setPayments([{ method: 'cash', amount: remaining.toFixed(2), reference: '' }])
    setPayNote('')
  }

  function setPayField(idx: number, field: keyof PayRow, val: string) {
    setPayments(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p))
  }

  async function handlePay() {
    const totalPaying = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0)
    if (totalPaying <= 0) return toast.error('Enter a valid amount')

    const remaining = Number(payModal.remaining || payModal.total)
    if (totalPaying > remaining + 0.5) return toast.error(`Cannot pay more than ${fmt(remaining)} remaining`)

    setPaying(true)
    try {
      const res = await fetch('/api/credit-payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_id: payModal.id,
          payments: payments.filter(p => Number(p.amount) > 0).map(p => ({
            method: p.method, amount: Number(p.amount), reference: p.reference || null
          })),
          note: payNote || null,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (data.data.fully_paid) {
        toast.success(`Debt fully cleared! ${fmt(data.data.paid_so_far)} paid.`)
      } else {
        toast.success(`Payment recorded. ${fmt(data.data.remaining)} still remaining.`)
      }
      setPayModal(null)
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setPaying(false) }
  }

  async function addManualDebt() {
    if (!debtForm.customer_name || !debtForm.amount) return toast.error('Customer name and amount required')
    setAddingDebt(true)
    try {
      const res = await fetch('/api/credit-payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'manual_debt', ...debtForm, amount: Number(debtForm.amount) })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Debt record added!')
      setShowAddDebt(false)
      setDebtForm({ customer_name: '', amount: '', note: '', debt_date: new Date().toISOString().split('T')[0] })
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setAddingDebt(false) }
  }

  const totalOwed = credits.reduce((a, s) => a + Number(s.remaining ?? s.total), 0)

  function openEditDebt(s: any) {
    setEditDebtModal(s)
    setEditDebtForm({ new_amount: String(Number(s.total)), reason: '' })
  }

  async function handleEditDebt() {
    if (!editDebtForm.new_amount || Number(editDebtForm.new_amount) <= 0) return toast.error('Enter a valid amount')
    if (!editDebtForm.reason.trim()) return toast.error('Reason for change is required')
    setEditingDebt(true)
    try {
      const res = await fetch('/api/credit-payments', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_id: editDebtModal.id,
          new_amount: Number(editDebtForm.new_amount),
          reason: editDebtForm.reason.trim(),
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Debt updated! ${fmt(data.data.old_amount)} → ${fmt(data.data.new_amount)}`)
      setEditDebtModal(null)
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setEditingDebt(false) }
  }

  const uniqueCustomers = Array.from(new Set(credits.map(s => s.customer_name)))

  return (
    <div className="animate-in">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Credit / Debtors</h1>
          <p className="page-sub">Manage outstanding customer debts</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddDebt(true)}>➕ Add Existing Debt</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="stat-card red">
          <div className="stat-label">Total Outstanding</div>
          <div className="stat-value">{Number(totalOwed).toLocaleString('en-KE', { maximumFractionDigits: 0 })}</div>
          <div className="stat-sub">KES owed</div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-label">Debtors</div>
          <div className="stat-value">{uniqueCustomers.length}</div>
          <div className="stat-sub">{credits.length} pending sales</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Recent Payments</div>
          <div className="stat-value">{recentPayments.length}</div>
          <div className="stat-sub">Credit clearances</div>
        </div>
      </div>

      {/* Fix 7: Credit Score Section */}
      <div className="duka-card mb-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="duka-card-title" style={{marginBottom:0}}>📊 Customer Credit Scores</div>
            <p className="text-muted text-xs mt-1">AI-powered risk assessment based on payment history</p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setShowScores(!showScores)}>
            {showScores ? '🔽 Hide' : '▶️ Show'} Scores
          </button>
        </div>

        {showScores && !scoresLoading && creditScores && (
          <div className="mt-4">
            {/* Shop Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-surface2 rounded-lg p-3 text-center">
                <div className="text-xs text-muted uppercase mb-1">Avg Daily Cash</div>
                <div className="mono text-green font-bold">{fmt(creditScores.shop_summary?.avg_daily_cash_sales || 0)}</div>
              </div>
              <div className="bg-surface2 rounded-lg p-3 text-center">
                <div className="text-xs text-muted uppercase mb-1">Total Outstanding</div>
                <div className="mono text-red font-bold">{fmt(creditScores.shop_summary?.total_outstanding_credit || 0)}</div>
              </div>
              <div className="bg-surface2 rounded-lg p-3 text-center">
                <div className="text-xs text-muted uppercase mb-1">Credit/Cash Ratio</div>
                <div className={`mono font-bold ${(creditScores.shop_summary?.credit_to_cash_ratio || 0) > 50 ? 'text-red' : 'text-green'}`}>
                  {creditScores.shop_summary?.credit_to_cash_ratio || 0}%
                </div>
              </div>
              <div className="bg-surface2 rounded-lg p-3 text-center">
                <div className="text-xs text-muted uppercase mb-1">Safe Credit Cap</div>
                <div className="mono text-accent font-bold">{fmt(creditScores.shop_summary?.safe_total_credit_limit || 0)}</div>
              </div>
            </div>

            {/* Customer scores table */}
            {creditScores.customers?.length > 0 && (
              <div className="table-wrap">
                <table className="duka-table">
                  <thead>
                    <tr>
                      <th>Customer</th><th>Score</th><th>Risk</th>
                      <th>Outstanding</th><th>Cleared</th><th>Avg Pay Days</th>
                      <th>Last Payment</th><th>Credit Limit</th><th>Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditScores.customers.map((c: any) => {
                      const riskBadge: Record<string, string> = {
                        low: 'badge-green', medium: 'badge-yellow', high: 'badge-red', critical: 'badge-red'
                      }
                      const riskIcon: Record<string, string> = {
                        low: '✅', medium: '⚠️', high: '🔴', critical: '🚫'
                      }
                      const scoreColor = c.score >= 70 ? 'text-green' : c.score >= 50 ? 'text-yellow' : 'text-red'
                      return (
                        <tr key={c.customer_name}>
                          <td className="text-white font-medium">{c.customer_name}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border-2"
                                style={{
                                  borderColor: c.score >= 70 ? '#3ecf8e' : c.score >= 50 ? '#f5c842' : '#ef4444',
                                  color: c.score >= 70 ? '#3ecf8e' : c.score >= 50 ? '#f5c842' : '#ef4444',
                                }}>
                                {c.score}
                              </div>
                            </div>
                          </td>
                          <td><span className={`badge ${riskBadge[c.risk]} text-xs`}>{riskIcon[c.risk]} {c.risk.toUpperCase()}</span></td>
                          <td className="mono text-red font-semibold">{fmt(c.pending_amount)}</td>
                          <td className="mono text-green">{c.cleared_debts}/{c.total_credit_sales}</td>
                          <td className="mono text-muted">{c.avg_days_to_pay !== null ? `${c.avg_days_to_pay}d` : '—'}</td>
                          <td className="text-muted text-xs">
                            {c.last_payment_date ? (
                              <>{new Date(c.last_payment_date).toLocaleDateString('en-KE', {day:'2-digit',month:'short'})}
                                <span className="mono text-green ml-1">{fmt(c.last_payment_amount)}</span>
                              </>
                            ) : 'Never'}
                          </td>
                          <td className={`mono font-bold ${c.recommended_limit > 0 ? 'text-accent' : 'text-red'}`}>
                            {c.recommended_limit > 0 ? fmt(c.recommended_limit) : 'KES 0'}
                          </td>
                          <td className="text-xs" style={{maxWidth:200}}>
                            <div className="text-muted">{c.recommendation}</div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {showScores && scoresLoading && <div className="empty-state py-4 mt-4">Loading credit scores...</div>}
      </div>

      {/* Outstanding debts */}
      <div className="duka-card mb-4">
        <div className="duka-card-title">📋 Outstanding Debts</div>
        {loading ? <div className="empty-state">Loading...</div> : credits.length === 0 ? (
          <div className="empty-state">🎉 No outstanding credit!</div>
        ) : (
          <div className="table-wrap">
            <table className="duka-table">
              <thead><tr>
                <th>Customer</th><th>Date</th><th>Receipt</th><th>Original</th><th>Paid</th><th>Balance</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {[...credits].sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || '')).map(s => {
                  const paidSoFar = Number(s.paid_so_far || 0)
                  const remaining = Number(s.remaining ?? s.total)
                  return (
                    <tr key={s.id}>
                      <td className="text-white font-medium">
                        {s.customer_name}
                        {s.is_manual_debt && <span className="badge badge-gray ml-2 text-xs">manual</span>}
                        {(() => {
                          const cs = creditScores?.customers?.find((c: any) => c.customer_name === s.customer_name)
                          if (!cs) return null
                          const badge = cs.risk === 'low' ? 'badge-green' : cs.risk === 'medium' ? 'badge-yellow' : 'badge-red'
                          return <span className={`badge ${badge} ml-1 text-xs`} title={`Credit Score: ${cs.score}/100`}>{cs.score}pts</span>
                        })()}
                      </td>
                      <td>{fmtDate(s.sale_date)}</td>
                      <td className="mono text-xs">{s.receipt_no}</td>
                      <td className="mono">{fmt(s.total)}</td>
                      <td className="mono text-green">{paidSoFar > 0 ? fmt(paidSoFar) : '—'}</td>
                      <td className="mono text-red font-bold text-base">{fmt(remaining)}</td>
                      <td>
                        <div className="flex gap-2 flex-wrap">
                          <button className="btn btn-success btn-sm" onClick={() => openPayModal(s)}>💳 Pay</button>
                          <button className="btn btn-outline btn-sm" onClick={() => openEditDebt(s)}>✏️ Edit</button>
                          {!s.is_manual_debt && <button className="btn btn-ghost btn-sm" onClick={() => setReceipt(s)}>🧾</button>}
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

      {/* Recent payments */}
      {recentPayments.length > 0 && (
        <div className="duka-card">
          <div className="duka-card-title">📒 Credit Payment Journal</div>
          <div className="table-wrap">
            <table className="duka-table">
              <thead><tr><th>Date</th><th>Customer</th><th>Receipt</th><th>Amount</th><th>Method</th><th>Note</th></tr></thead>
              <tbody>
                {recentPayments.slice(0, 30).map((cp: any) => (
                  <tr key={cp.id}>
                    <td>{fmtDate(cp.paid_date)}</td>
                    <td className="text-white">{cp.customer_name}</td>
                    <td className="mono text-xs">{cp.receipt_no}</td>
                    <td className="mono text-green font-semibold">{fmt(cp.amount)}</td>
                    <td><span className={`badge ${cp.method==='cash'?'badge-green':cp.method==='mpesa'?'badge-blue':'badge-yellow'}`}>{cp.method.toUpperCase()}</span></td>
                    <td className="text-muted text-xs">{cp.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment modal with split support */}
      {payModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setPayModal(null)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <h2 className="modal-title">Record Payment</h2>
            <div className="bg-surface2 rounded-lg p-4 mb-4">
              <div className="flex justify-between mb-1"><span className="text-muted text-sm">Customer</span><span className="text-white font-semibold">{payModal.customer_name}</span></div>
              <div className="flex justify-between mb-1"><span className="text-muted text-sm">Total Owed</span><span className="mono">{fmt(payModal.total)}</span></div>
              {Number(payModal.paid_so_far || 0) > 0 && <div className="flex justify-between mb-1"><span className="text-muted text-sm">Already Paid</span><span className="mono text-green">{fmt(payModal.paid_so_far)}</span></div>}
              <div className="flex justify-between font-bold"><span className="text-sm">Remaining Balance</span><span className="mono text-red">{fmt(payModal.remaining ?? payModal.total)}</span></div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="duka-label mb-0">Payment{payments.length > 1 ? 's (Split)' : ''}</label>
                  {payments.length < 3 && (
                    <button className="btn btn-outline btn-sm" onClick={() => setPayments(prev => [...prev, { method: 'cash', amount: '', reference: '' }])}>+ Split</button>
                  )}
                </div>
                <div className="space-y-2">
                  {payments.map((p, idx) => (
                    <div key={idx} className="bg-surface2 rounded-lg p-3 space-y-2">
                      <div className="flex gap-2 items-center">
                        <select className="duka-input duka-select flex-1" value={p.method} onChange={e => setPayField(idx, 'method', e.target.value)}>
                          <option value="cash">💵 Cash</option><option value="mpesa">📱 M-Pesa</option><option value="kcb">🏦 KCB</option>
                        </select>
                        {payments.length > 1 && <button className="btn btn-ghost btn-sm text-red" onClick={() => setPayments(prev => prev.filter((_, i) => i !== idx))}>✕</button>}
                      </div>
                      <input type="number" step="0.01" placeholder="Amount" className="duka-input" value={p.amount} onChange={e => setPayField(idx, 'amount', e.target.value)} />
                      {(p.method === 'mpesa' || p.method === 'kcb') && (
                        <input className="duka-input" placeholder="Reference" value={p.reference} onChange={e => setPayField(idx, 'reference', e.target.value)} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-surface2 rounded-lg p-3 font-mono text-sm">
                <div className="flex justify-between"><span>Paying now</span><span>{fmt(payments.reduce((a, p) => a + (Number(p.amount) || 0), 0))}</span></div>
                <div className="flex justify-between text-muted"><span>Will remain</span><span>{fmt(Math.max(0, Number(payModal.remaining ?? payModal.total) - payments.reduce((a, p) => a + (Number(p.amount) || 0), 0)))}</span></div>
              </div>
              <div><label className="duka-label">Note (optional)</label>
                <input className="duka-input" placeholder="e.g. Partial, rest next week" value={payNote} onChange={e => setPayNote(e.target.value)} /></div>
              <div className="flex justify-end gap-3">
                <button className="btn btn-outline" onClick={() => setPayModal(null)}>Cancel</button>
                <button className="btn btn-success" onClick={handlePay} disabled={paying}>{paying ? '⏳...' : '✅ Record Payment'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add manual debt modal */}
      {showAddDebt && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddDebt(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h2 className="modal-title">Add Existing Debt</h2>
            <p className="text-muted text-sm mb-4">Record a pre-existing debt that's not in the system yet.</p>
            <div className="space-y-4">
              <div><label className="duka-label">Customer Name *</label>
                <input className="duka-input" placeholder="e.g. Ahmed Ali" value={debtForm.customer_name} onChange={e => setDebtForm(f => ({...f, customer_name: e.target.value}))} /></div>
              <div><label className="duka-label">Amount Owed (KES) *</label>
                <input type="number" step="0.01" className="duka-input" value={debtForm.amount} onChange={e => setDebtForm(f => ({...f, amount: e.target.value}))} /></div>
              <div><label className="duka-label">Date of Debt</label>
                <input type="date" className="duka-input" value={debtForm.debt_date} onChange={e => setDebtForm(f => ({...f, debt_date: e.target.value}))} /></div>
              <div><label className="duka-label">Note</label>
                <input className="duka-input" placeholder="e.g. Goods taken on credit last month" value={debtForm.note} onChange={e => setDebtForm(f => ({...f, note: e.target.value}))} /></div>
              <div className="flex justify-end gap-3">
                <button className="btn btn-outline" onClick={() => setShowAddDebt(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={addManualDebt} disabled={addingDebt}>{addingDebt ? '⏳...' : '💾 Add Debt'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {receipt && <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />}

      {/* Edit Debt Amount Modal */}
      {editDebtModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditDebtModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h2 className="modal-title">✏️ Edit Debt Amount</h2>
            <div className="bg-surface2 rounded-lg p-4 mb-4">
              <div className="flex justify-between mb-1"><span className="text-muted text-sm">Customer</span><span className="text-white font-semibold">{editDebtModal.customer_name}</span></div>
              <div className="flex justify-between mb-1"><span className="text-muted text-sm">Current Amount</span><span className="mono text-red font-bold">{fmt(editDebtModal.total)}</span></div>
              {Number(editDebtModal.paid_so_far || 0) > 0 && <div className="flex justify-between"><span className="text-muted text-sm">Already Paid</span><span className="mono text-green">{fmt(editDebtModal.paid_so_far)}</span></div>}
            </div>
            <div className="space-y-4">
              <div>
                <label className="duka-label">New Debt Amount (KES) *</label>
                <input type="number" step="0.01" className="duka-input" value={editDebtForm.new_amount}
                  onChange={e => setEditDebtForm(f => ({...f, new_amount: e.target.value}))} />
              </div>
              <div>
                <label className="duka-label">Reason for Change *</label>
                <input className="duka-input" placeholder="e.g. Agreed on reduced amount, correction of wrong entry"
                  value={editDebtForm.reason} onChange={e => setEditDebtForm(f => ({...f, reason: e.target.value}))} />
              </div>
              <div className="flex justify-end gap-3">
                <button className="btn btn-outline" onClick={() => setEditDebtModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleEditDebt} disabled={editingDebt}>
                  {editingDebt ? '⏳...' : '💾 Update Amount'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
