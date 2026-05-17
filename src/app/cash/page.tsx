'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { fmt, today } from '@/lib/utils'
import { useAuth } from '@/components/AuthContext'

export default function CashPage() {
  const { isSuperAdmin } = useAuth()
  const [date, setDate] = useState(today())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ type: 'owner_withdrawal', amount: '', description: '' })
  const [saving, setSaving] = useState(false)

  // Counted cash section (replaces old excess/less quick adjustment)
  const [countedCash, setCountedCash] = useState('')
  const [countedNote, setCountedNote] = useState('')
  const [countedSaving, setCountedSaving] = useState(false)

  async function saveCountedCash() {
    if (!countedCash || Number(countedCash) < 0) return toast.error('Enter the counted cash amount')
    setCountedSaving(true)
    try {
      const safeBalance = Number(data?.summary?.safe_balance || 0)
      const counted = Number(countedCash)
      const difference = counted - safeBalance

      if (Math.abs(difference) < 0.5) {
        toast.success('Cash matches perfectly! No adjustment needed.')
        setCountedCash(''); setCountedNote('')
        setCountedSaving(false)
        return
      }

      const type = difference > 0 ? 'cash_excess' : 'cash_less'
      const amount = Math.abs(difference)
      const description = countedNote || (type === 'cash_excess'
        ? `Excess: counted ${fmt(counted)} vs system ${fmt(safeBalance)}`
        : `Shortage: counted ${fmt(counted)} vs system ${fmt(safeBalance)}`)

      const res = await fetch('/api/cash-ledger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, amount, description, ledger_date: date })
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)

      if (type === 'cash_excess') {
        toast.success(`Excess of ${fmt(amount)} recorded! Counted cash (${fmt(counted)}) becomes tomorrow's opening.`)
      } else {
        toast.success(`Shortage of ${fmt(amount)} recorded! Counted cash (${fmt(counted)}) becomes tomorrow's opening.`)
      }
      setCountedCash(''); setCountedNote('')
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setCountedSaving(false) }
  }

  function load() {
    setLoading(true)
    fetch(`/api/cash-ledger?date=${date}`)
      .then(r => r.json())
      .then(d => { setData(d.data); setLoading(false) })
  }

  useEffect(() => { load() }, [date])

  async function save() {
    if (!form.amount) return toast.error('Amount is required')
    setSaving(true)
    try {
      const res = await fetch('/api/cash-ledger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount), ledger_date: date })
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success('Entry recorded!')
      setShowForm(false); setForm({ type: 'owner_withdrawal', amount: '', description: '' })
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const s = data?.summary || {}
  const entries: any[] = data?.entries || []

  // Fix 7: Closing total cash = opening balance + cash sales (excluding credit sales)
  // The safe_balance from API already excludes credit sales since it only sums cash sale_payments
  const safeBalance = Number(s.safe_balance || 0)

  // Calculate what the counted cash difference would be for preview
  const countedNum = Number(countedCash) || 0
  const countedDiff = countedCash ? countedNum - safeBalance : 0

  return (
    <div className="animate-in">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Cash / Safe Management</h1>
          <p className="page-sub">Track cash in safe, owner withdrawals, and deposits</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" className="duka-input" style={{width:'auto'}} value={date}
            onChange={e => setDate(e.target.value)} />
          <button className="btn btn-outline btn-sm" onClick={() => setDate(today())}>Today</button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>➕ New Entry</button>
        </div>
      </div>

      {/* Safe Summary */}
      {!loading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="stat-card green">
              <div className="stat-label">System Safe Balance</div>
              <div className={`stat-value ${safeBalance >= 0 ? 'text-green' : 'text-red'}`}>
                {safeBalance.toLocaleString('en-KE',{maximumFractionDigits:0})}
              </div>
              <div className="stat-sub">Calculated end of day</div>
            </div>
            <div className="stat-card blue">
              <div className="stat-label">Opening Balance</div>
              <div className="stat-value">{Number(s.opening_balance||0).toLocaleString('en-KE',{maximumFractionDigits:0})}</div>
              <div className="stat-sub">Start of day</div>
            </div>
            <div className="stat-card yellow">
              <div className="stat-label">Cash In Today</div>
              <div className="stat-value">{Number((s.cash_sales||0)+(s.credit_cash_received||0)+(s.deposits||0)).toLocaleString('en-KE',{maximumFractionDigits:0})}</div>
              <div className="stat-sub">Cash sales + debt payments + deposits</div>
            </div>
            <div className="stat-card red">
              <div className="stat-label">Owner Withdrawals</div>
              <div className="stat-value">{Number(s.owner_withdrawals||0).toLocaleString('en-KE',{maximumFractionDigits:0})}</div>
              <div className="stat-sub">Given to owner</div>
            </div>
          </div>

          {/* Detailed breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="duka-card">
              <div className="duka-card-title">🔐 Safe Calculation</div>
              <p className="text-muted text-xs mb-2">System balance = Opening + Cash Sales + Debt Cash - Withdrawals - Cash Expenses (credit sales excluded)</p>
              <div className="space-y-1">
                {[
                  { label: 'Opening Balance', val: s.opening_balance, cls: '' },
                  { label: '+ Cash Sales (excl. credit)', val: s.cash_sales, cls: 'text-green' },
                  { label: '+ Debt Cash Received', val: s.credit_cash_received, cls: 'text-green' },
                  { label: '+ Deposits', val: s.deposits, cls: 'text-green' },
                  { label: '- Owner Withdrawals', val: s.owner_withdrawals, cls: 'text-red' },
                  { label: '- Cash Expenses', val: s.cash_expenses, cls: 'text-red' },
                  ...(Number(s.cash_excess || 0) > 0 ? [{ label: '+ Cash Excess (from count)', val: s.cash_excess, cls: 'text-green' }] : []),
                  ...(Number(s.cash_less || 0) > 0 ? [{ label: '- Cash Shortage (from count)', val: s.cash_less, cls: 'text-red' }] : []),
                ].map(r => (
                  <div key={r.label} className="flex justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sub text-sm">{r.label}</span>
                    <span className={`mono font-semibold ${r.cls}`}>{fmt(r.val || 0)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-3 font-bold text-base">
                  <span>System Safe Balance</span>
                  <span className={`mono ${safeBalance>=0?'text-green':'text-red'}`}>{fmt(safeBalance)}</span>
                </div>
              </div>
            </div>

            {/* Ledger entries */}
            <div className="duka-card">
              <div className="duka-card-title">📋 Ledger Entries</div>
              {entries.length === 0 ? (
                <div className="empty-state py-4">No entries for this date</div>
              ) : (
                <div className="space-y-2">
                  {entries.map((e: any) => (
                    <div key={e.id} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                      <div>
                        <div className="text-sm text-white capitalize">{e.type.replace(/_/g, ' ')}</div>
                        {e.description && <div className="text-xs text-muted">{e.description}</div>}
                      </div>
                      <span className={`mono font-semibold ${['owner_withdrawal','cash_less'].includes(e.type) ? 'text-red' : 'text-green'}`}>
                        {['owner_withdrawal','cash_less'].includes(e.type) ? '-' : '+'}{fmt(e.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Fix 5: Counted Cash section — admin types counted cash, system calculates excess/shortage */}
          <div className="duka-card mb-6">
            <div className="duka-card-title">💰 End of Day — Count Cash in Safe</div>
            <p className="text-muted text-xs mb-3">
              Count the actual cash in your safe/drawer and enter it below. The system will calculate if there is excess or shortage automatically. 
              The counted amount becomes the next day's opening balance.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex-1">
                <label className="duka-label">Counted Cash in Safe (KES)</label>
                <input type="number" step="0.01" min="0" className="duka-input" placeholder="Enter actual cash counted"
                  value={countedCash} onChange={e => setCountedCash(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="duka-label">Note (optional)</label>
                <input className="duka-input" placeholder="e.g. End of shift count" value={countedNote}
                  onChange={e => setCountedNote(e.target.value)} />
              </div>
              <div className="flex items-end">
                <button className="btn btn-primary whitespace-nowrap"
                  onClick={saveCountedCash} disabled={countedSaving}>
                  {countedSaving ? '⏳...' : '📝 Record Count'}
                </button>
              </div>
            </div>

            {/* Live preview of difference */}
            {countedCash && (
              <div className="bg-surface2 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sub text-sm">System Balance</span>
                  <span className="mono font-semibold">{fmt(safeBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sub text-sm">Counted Cash</span>
                  <span className="mono font-semibold">{fmt(countedNum)}</span>
                </div>
                <hr className="border-border" />
                <div className="flex justify-between font-bold">
                  <span className="text-sm">
                    {countedDiff > 0.5 ? '📈 Excess' : countedDiff < -0.5 ? '📉 Shortage' : '✅ Balanced'}
                  </span>
                  <span className={`mono ${countedDiff > 0.5 ? 'text-green' : countedDiff < -0.5 ? 'text-red' : 'text-green'}`}>
                    {countedDiff > 0.5 ? '+' : ''}{fmt(countedDiff)}
                  </span>
                </div>
                <p className="text-muted text-xs mt-1">
                  {fmt(countedNum)} will be recorded as the opening balance for the next day.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {loading && <div className="empty-state">Loading...</div>}

      {/* Fix 6: New entry modal — removed cash_excess and cash_less from dropdown */}
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h2 className="modal-title">New Cash Ledger Entry</h2>
            <div className="space-y-4">
              <div>
                <label className="duka-label">Type</label>
                <select className="duka-input duka-select" value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="adjustment">🔧 Adjustment</option>
                  <option value="cash_deposit">💰 Cash Deposit (add to safe)</option>
                  <option value="opening_balance">📂 Set Opening Balance</option>
                  <option value="owner_withdrawal">💼 Owner Withdrawal (give to owner)</option>
                </select>
              </div>
              <div>
                <label className="duka-label">Amount (KES)</label>
                <input type="number" step="0.01" className="duka-input" placeholder="0.00"
                  value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <label className="duka-label">Description / Note</label>
                <input className="duka-input" placeholder="e.g. Cash given to boss for bank deposit"
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-3">
                <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving ? '⏳ Saving...' : '💾 Record Entry'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
