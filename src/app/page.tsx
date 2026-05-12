'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { fmt, fmtTime, today } from '@/lib/utils'
import { useAuth } from '@/components/AuthContext'

const PAY_BADGE: Record<string, string> = {
  cash: 'badge-green', mpesa: 'badge-blue', kcb: 'badge-yellow', credit: 'badge-red'
}

export default function Dashboard() {
  const { isSuperAdmin } = useAuth()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState(today())

  const load = useCallback((d?: string) => {
    const dt = d || dateFilter
    fetch(`/api/reports/daily?date=${dt}`)
      .then(r => r.json())
      .then(d => { setData(d.data); setLoading(false) })
  }, [dateFilter])

  useEffect(() => {
    setLoading(true)
    load()
    const t = setInterval(() => load(), 30000)
    return () => clearInterval(t)
  }, [dateFilter, load])

  if (loading) return <div className="empty-state animate-in">Loading dashboard...</div>

  const s = data?.sales || {}
  const e = data?.expenses || {}
  const c = data?.cash || {}
  const todaySales: any[] = data?.today_sales || []

  return (
    <div className="animate-in">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">
            {new Date(dateFilter).toLocaleDateString('en-KE', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
            {dateFilter === today() && <span className="ml-3 text-xs text-muted">Auto-refreshes every 30s</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" className="duka-input" style={{width:'auto'}} value={dateFilter}
            onChange={e => setDateFilter(e.target.value)} />
          <button className="btn btn-outline btn-sm" onClick={() => { setDateFilter(today()); load(today()) }}>Today</button>
          <button className="btn btn-outline btn-sm" onClick={() => load()}>🔄</button>
          <Link href="/pos" className="btn btn-primary">➕ New Sale</Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className={`grid ${isSuperAdmin ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'} gap-4 mb-6`}>
        <div className="stat-card green">
          <div className="stat-label">Total Sales</div>
          <div className="stat-value">{Number(s.total_sales||0).toLocaleString('en-KE',{maximumFractionDigits:0})}</div>
          <div className="stat-sub">{s.tx_count||0} transactions</div>
        </div>
        {isSuperAdmin && (
          <div className="stat-card yellow">
            <div className="stat-label">Gross Profit</div>
            <div className="stat-value">{Number(s.total_profit||0).toLocaleString('en-KE',{maximumFractionDigits:0})}</div>
            <div className="stat-sub">From all sales</div>
          </div>
        )}
        <div className="stat-card blue">
          <div className="stat-label">Safe Balance</div>
          <div className="stat-value">{Number(c.safe_balance||0).toLocaleString('en-KE',{maximumFractionDigits:0})}</div>
          <div className="stat-sub">Cash in safe</div>
        </div>
        {isSuperAdmin && (
          <div className="stat-card red">
            <div className="stat-label">Net Profit</div>
            <div className={`stat-value ${Number(data?.net_profit||0)>=0?'text-green':'text-red'}`}>
              {Number(data?.net_profit||0).toLocaleString('en-KE',{maximumFractionDigits:0})}
            </div>
            <div className="stat-sub">After expenses</div>
          </div>
        )}
        <div className="stat-card green">
          <div className="stat-label">Owner Withdrawals</div>
          <div className="stat-value text-red">{Number(c.owner_withdrawals||0).toLocaleString('en-KE',{maximumFractionDigits:0})}</div>
          <div className="stat-sub">Given to owner today</div>
        </div>
      </div>

      {/* Payment channel summary row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="duka-card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-2xl">💵</div>
          <div>
            <div className="text-xs text-muted uppercase tracking-wider">Cash Today</div>
            <div className="mono text-xl font-bold text-green">{fmt(s.cash_sales||0)}</div>
          </div>
        </div>
        <div className="duka-card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-2xl">📱</div>
          <div>
            <div className="text-xs text-muted uppercase tracking-wider">M-Pesa Today</div>
            <div className="mono text-xl font-bold text-blue">{fmt(data?.mpesa_total || s.mpesa_sales || 0)}</div>
          </div>
        </div>
        <div className="duka-card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center text-2xl">🏦</div>
          <div>
            <div className="text-xs text-muted uppercase tracking-wider">KCB Today</div>
            <div className="mono text-xl font-bold text-yellow">{fmt(data?.kcb_total || s.kcb_sales || 0)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Payment breakdown */}
        <div className="duka-card">
          <div className="duka-card-title">💳 Sales Payment Breakdown</div>
          {[
            { label:'💵 Cash',   val: s.cash_sales||0,   cls:'text-green' },
            { label:'📱 M-Pesa', val: s.mpesa_sales||0,  cls:'text-blue'  },
            { label:'🏦 KCB',    val: s.kcb_sales||0,    cls:'text-yellow' },
            { label:'📋 Credit', val: s.credit_sales||0, cls:'text-red'   },
          ].map(r => (
            <div key={r.label} className="flex justify-between py-2 border-b border-border last:border-0">
              <span className="text-sub text-sm">{r.label}</span>
              <span className={`mono font-semibold ${r.cls}`}>{fmt(r.val)}</span>
            </div>
          ))}
          {Number(s.total_discount || 0) > 0 && (
            <div className="flex justify-between py-2 border-t border-border mt-1">
              <span className="text-sub text-sm">🏷️ Discounts Given</span>
              <span className="mono font-semibold text-red">{fmt(s.total_discount)}</span>
            </div>
          )}
        </div>

        {/* Top products */}
        <div className="duka-card">
          <div className="duka-card-title">🏆 Top Products</div>
          {data?.top_products?.length ? (
            <div className="space-y-2">
              {data.top_products.map((p: any, i: number) => (
                <div key={i} className="flex justify-between items-center py-1 border-b border-border last:border-0">
                  <div>
                    <div className="text-sm text-white">{p.product_name}</div>
                    {isSuperAdmin && <div className="text-xs text-muted">Profit: <span className="text-yellow">{fmt(p.profit)}</span></div>}
                  </div>
                  <span className="mono text-sm text-green">{fmt(p.revenue)}</span>
                </div>
              ))}
            </div>
          ) : <div className="empty-state py-6">No sales yet</div>}
        </div>

        {/* Cash safe summary */}
        <div className="duka-card">
          <div className="duka-card-title">🔐 Cash Safe</div>
          <div className="space-y-1">
            <div className="flex justify-between py-1.5"><span className="text-sub text-sm">Opening Balance</span><span className="mono text-sm">{fmt(c.opening_balance||0)}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-sub text-sm">+ Cash Sales</span><span className="mono text-sm text-green">{fmt(c.cash_sales||0)}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-sub text-sm">+ Debt Cash Received</span><span className="mono text-sm text-green">{fmt(c.credit_cash_received||0)}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-sub text-sm">- Owner Withdrawal</span><span className="mono text-sm text-red">{fmt(c.owner_withdrawals||0)}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-sub text-sm">- Cash Expenses</span><span className="mono text-sm text-red">{fmt(c.cash_expenses||0)}</span></div>
            <div className="flex justify-between pt-2 border-t border-border font-bold">
              <span className="text-sm">Safe Balance</span>
              <span className={`mono ${Number(c.safe_balance||0) >= 0 ? 'text-green' : 'text-red'}`}>{fmt(c.safe_balance||0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live sales feed */}
      {todaySales.length > 0 && (
        <div className="duka-card mb-4">
          <div className="duka-card-title">
            {dateFilter === today() ? '🔴 Live Sales Feed' : '📋 Sales'}
            <span className="badge badge-green text-xs">{todaySales.length} transactions</span>
          </div>
          <div className="table-wrap">
            <table className="duka-table">
              <thead>
                <tr>
                  <th>Time</th><th>Receipt</th><th>Customer</th><th>Items</th>
                  <th>Total</th>{isSuperAdmin && <th>Profit</th>}<th>Payment</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {todaySales.map((s: any) => {
                  const payments: any[] = s.payments || []
                  return (
                    <tr key={s.id}>
                      <td className="text-muted">{fmtTime(s.created_at)}</td>
                      <td className="mono text-white text-xs">{s.receipt_no}</td>
                      <td>{s.customer_name}</td>
                      <td className="text-muted text-xs">
                        {(s.items||[]).filter(Boolean).map((it: any, i: number) => (
                          <div key={i}>{it.product_name} {it.denomination_label ? `(${it.denomination_label})` : ''} ×{Number(it.qty).toFixed(it.qty%1?2:0)}</div>
                        ))}
                      </td>
                      <td className="mono text-green font-semibold">
                        {fmt(s.total)}
                        {Number(s.discount||0) > 0 && <div className="text-xs text-red">-{fmt(s.discount)} disc</div>}
                      </td>
                      {isSuperAdmin && <td className="mono text-yellow font-semibold">{fmt(s.profit)}</td>}
                      <td>
                        {payments.filter(Boolean).map((p: any, i: number) => (
                          <div key={i} className="flex items-center gap-1 mb-0.5">
                            <span className={`badge ${PAY_BADGE[p.method]||'badge-gray'} text-xs`}>{p.method.toUpperCase()}</span>
                            <span className="mono text-xs text-muted">{fmt(p.amount)}</span>
                          </div>
                        ))}
                      </td>
                      <td><span className={`badge ${s.status==='paid'?'badge-green':'badge-red'}`}>{s.status}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7-day trend */}
      {data?.trend?.length > 0 && (
        <div className="duka-card">
          <div className="duka-card-title">📈 7-Day Sales Trend</div>
          <table className="duka-table">
            <thead><tr><th>Date</th><th>Sales</th>{isSuperAdmin && <th>Profit</th>}<th>Bar</th></tr></thead>
            <tbody>
              {data.trend.map((t: any) => {
                const max = Math.max(...data.trend.map((x: any) => Number(x.sales)))
                const pct = max > 0 ? (Number(t.sales)/max)*100 : 0
                return (
                  <tr key={t.date}>
                    <td>{new Date(t.date).toLocaleDateString('en-KE',{weekday:'short',day:'2-digit',month:'short'})}</td>
                    <td className="mono text-green">{fmt(t.sales)}</td>
                    {isSuperAdmin && <td className="mono text-yellow">{fmt(t.profit)}</td>}
                    <td style={{width:180}}>
                      <div className="bg-surface2 rounded-full h-2 overflow-hidden">
                        <div className="bg-accent h-2 rounded-full" style={{width:`${pct}%`}}/>
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
  )
}
