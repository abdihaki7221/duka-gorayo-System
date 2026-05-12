'use client'
import { useEffect, useState } from 'react'
import { fmt, fmtTime, today } from '@/lib/utils'
import { useAuth } from '@/components/AuthContext'

const PAY_BADGE: Record<string,string> = { cash:'badge-green', mpesa:'badge-blue', kcb:'badge-yellow', credit:'badge-red' }

function Row({ label, value, cls='' }: { label:string; value:string; cls?:string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border last:border-0">
      <span className="text-sub text-sm">{label}</span>
      <span className={`mono font-semibold ${cls}`}>{value}</span>
    </div>
  )
}

export default function DailyPage() {
  const { isSuperAdmin } = useAuth()
  const [date, setDate] = useState(today())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/reports/daily?date=${date}`)
      .then(r => r.json()).then(d => { setData(d.data); setLoading(false) })
  }, [date])

  if (loading) return <div className="empty-state animate-in">Loading report...</div>

  const s = data?.sales || {}
  const e = data?.expenses || {}
  const c = data?.cash || {}
  const todaySales: any[] = data?.today_sales || []

  return (
    <div className="animate-in">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Daily Summary</h1>
          <p className="page-sub">Financial overview for {new Date(date).toLocaleDateString('en-KE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center no-print">
          <input type="date" className="duka-input" style={{width:'auto'}} value={date} onChange={e => setDate(e.target.value)} />
          <button className="btn btn-outline btn-sm" onClick={() => setDate(today())}>Today</button>
          <button className="btn btn-outline" onClick={() => window.print()}>🖨️ Print</button>
        </div>
      </div>

      {/* KPIs */}
      <div className={`grid ${isSuperAdmin ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'} gap-4 mb-6`}>
        <div className="stat-card green">
          <div className="stat-label">Total Sales</div>
          <div className="stat-value">{Number(s.total_sales||0).toLocaleString('en-KE',{maximumFractionDigits:0})}</div>
          <div className="stat-sub">{s.tx_count||0} transactions</div>
        </div>
        {isSuperAdmin && <div className="stat-card yellow">
          <div className="stat-label">Gross Profit</div>
          <div className="stat-value">{Number(s.total_profit||0).toLocaleString('en-KE',{maximumFractionDigits:0})}</div>
        </div>}
        <div className="stat-card blue">
          <div className="stat-label">Safe Balance</div>
          <div className="stat-value">{Number(c.safe_balance||0).toLocaleString('en-KE',{maximumFractionDigits:0})}</div>
        </div>
        {isSuperAdmin && <div className="stat-card red">
          <div className="stat-label">Net Profit</div>
          <div className={`stat-value ${Number(data?.net_profit||0)>=0?'text-green':'text-red'}`}>
            {Number(data?.net_profit||0).toLocaleString('en-KE',{maximumFractionDigits:0})}</div>
        </div>}
        <div className="stat-card red">
          <div className="stat-label">Expenses</div>
          <div className="stat-value">{Number(e.total_expenses||0).toLocaleString('en-KE',{maximumFractionDigits:0})}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Payment breakdown */}
        <div className="duka-card">
          <div className="duka-card-title">💳 Payment Breakdown</div>
          <Row label="💵 Cash" value={fmt(s.cash_sales||0)} cls="text-green" />
          <Row label="📱 M-Pesa" value={fmt(s.mpesa_sales||0)} cls="text-blue" />
          <Row label="🏦 KCB" value={fmt(s.kcb_sales||0)} cls="text-yellow" />
          <Row label="📋 Credit" value={fmt(s.credit_sales||0)} cls="text-red" />
          <div className="pt-2 border-t border-border mt-1">
            <Row label="Total Sales" value={fmt(s.total_sales||0)} cls="text-white" />
          </div>
        </div>

        {/* Cash safe */}
        <div className="duka-card">
          <div className="duka-card-title">🔐 Cash Safe Position</div>
          <Row label="Opening Balance" value={fmt(c.opening_balance||0)} />
          <Row label="+ Cash Sales" value={fmt(c.cash_sales||0)} cls="text-green" />
          <Row label="+ Debt Cash" value={fmt(c.credit_cash_received||0)} cls="text-green" />
          <Row label="- Owner Withdrawals" value={fmt(c.owner_withdrawals||0)} cls="text-red" />
          <Row label="- Cash Expenses" value={fmt(c.cash_expenses||0)} cls="text-red" />
          <div className="pt-2 border-t border-border mt-1">
            <Row label="= Safe Balance" value={fmt(c.safe_balance||0)} cls={Number(c.safe_balance||0)>=0?'text-green':'text-red'} />
          </div>
        </div>

        {/* Expenses */}
        <div className="duka-card">
          <div className="duka-card-title">💸 Expenses</div>
          <Row label="📦 Stock" value={fmt(e.stock_expenses||0)} cls="text-red" />
          <Row label="🚛 Transport" value={fmt(e.transport_expenses||0)} cls="text-red" />
          <Row label="👤 Salaries" value={fmt(e.salary_expenses||0)} cls="text-red" />
          <Row label="📎 Other" value={fmt(e.other_expenses||0)} cls="text-red" />
          <div className="pt-2 border-t border-border mt-1">
            <Row label="Total" value={fmt(e.total_expenses||0)} cls="text-red" />
          </div>
        </div>

        {/* P&L - super admin only */}
        {isSuperAdmin && (
          <div className="duka-card">
            <div className="duka-card-title">📊 Profit & Loss</div>
            <Row label="Total Sales" value={fmt(s.total_sales||0)} />
            <Row label="Gross Profit" value={fmt(s.total_profit||0)} cls="text-green" />
            <Row label="Total Expenses" value={fmt(e.total_expenses||0)} cls="text-red" />
            <div className="pt-2 border-t border-border mt-1">
              <Row label="Net Profit/Loss" value={fmt(data?.net_profit||0)}
                cls={Number(data?.net_profit||0)>=0?'text-green':'text-red'} />
            </div>
          </div>
        )}
      </div>

      {/* Top products */}
      {data?.top_products?.length > 0 && (
        <div className="duka-card mb-4">
          <div className="duka-card-title">🏆 Top Products</div>
          <table className="duka-table">
            <thead><tr><th>Product</th><th>Qty</th><th>Revenue</th>{isSuperAdmin && <th>Profit</th>}</tr></thead>
            <tbody>
              {data.top_products.map((p:any,i:number) => (
                <tr key={i}>
                  <td className="text-white">{p.product_name}</td>
                  <td className="mono">{Number(p.qty_sold).toFixed(2)}</td>
                  <td className="mono text-green">{fmt(p.revenue)}</td>
                  {isSuperAdmin && <td className="mono text-yellow">{fmt(p.profit)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Transactions */}
      {todaySales.length > 0 && (
        <div className="duka-card mb-4">
          <div className="duka-card-title">📋 Transactions <span className="badge badge-green">{todaySales.length}</span></div>
          <div className="table-wrap">
            <table className="duka-table">
              <thead><tr>
                <th>Time</th><th>Receipt</th><th>Customer</th><th>Items</th>
                <th>Total</th>{isSuperAdmin && <th>Profit</th>}<th>Payment</th><th>Status</th>
              </tr></thead>
              <tbody>
                {todaySales.map((sale:any) => {
                  const payments: any[] = (sale.payments||[]).filter(Boolean)
                  return (
                    <tr key={sale.id}>
                      <td className="text-muted">{fmtTime(sale.created_at)}</td>
                      <td className="mono text-xs">{sale.receipt_no}</td>
                      <td>{sale.customer_name}</td>
                      <td className="text-xs text-muted">
                        {(sale.items||[]).filter(Boolean).map((it:any,i:number) => (
                          <div key={i}>{it.product_name}{it.denomination_label?` (${it.denomination_label})`:''} ×{Number(it.qty).toFixed(Number(it.qty)%1?2:0)}</div>
                        ))}
                      </td>
                      <td className="mono text-green font-semibold">{fmt(sale.total)}</td>
                      {isSuperAdmin && <td className="mono text-yellow">{fmt(sale.profit)}</td>}
                      <td>
                        {payments.map((p:any,i:number) => (
                          <div key={i} className="flex items-center gap-1">
                            <span className={`badge ${PAY_BADGE[p.method]||'badge-gray'} text-xs`}>{p.method.toUpperCase()}</span>
                            <span className="mono text-xs text-muted">{fmt(p.amount)}</span>
                          </div>
                        ))}
                      </td>
                      <td><span className={`badge ${sale.status==='paid'?'badge-green':'badge-red'}`}>{sale.status}</span></td>
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
          <div className="duka-card-title">📈 7-Day Trend</div>
          <table className="duka-table">
            <thead><tr><th>Date</th><th>Sales</th>{isSuperAdmin && <th>Profit</th>}<th>Bar</th></tr></thead>
            <tbody>
              {data.trend.map((t:any) => {
                const max = Math.max(...data.trend.map((x:any) => Number(x.sales)))
                const pct = max > 0 ? (Number(t.sales)/max)*100 : 0
                return (
                  <tr key={t.date}>
                    <td>{new Date(t.date).toLocaleDateString('en-KE',{weekday:'short',day:'2-digit',month:'short'})}</td>
                    <td className="mono text-green">{fmt(t.sales)}</td>
                    {isSuperAdmin && <td className="mono text-yellow">{fmt(t.profit)}</td>}
                    <td style={{width:200}}>
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
