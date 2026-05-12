'use client'
import { useEffect, useState } from 'react'
import { fmt, fmtDate } from '@/lib/utils'
import { useAuth } from '@/components/AuthContext'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{background:'#181c27',border:'1px solid #2a3047',borderRadius:8,padding:'10px 14px',fontSize:13}}>
      <p style={{color:'#e8eaf0',marginBottom:4}}>{label}</p>
      {payload.map((p:any) => (
        <p key={p.name} style={{color:p.color,margin:0}}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  )
}

type FilterMode = 'month' | 'week' | 'custom'

export default function MonthlyPage() {
  const { isSuperAdmin } = useAuth()
  const [filterMode, setFilterMode] = useState<FilterMode>('month')
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    let url = `/api/reports/monthly?month=${month}`
    if (filterMode === 'custom' && from && to) {
      url = `/api/reports/monthly?from=${from}&to=${to}`
    } else if (filterMode === 'week') {
      const now = new Date()
      const start = new Date(now)
      start.setDate(now.getDate() - now.getDay())
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      url = `/api/reports/monthly?from=${start.toISOString().split('T')[0]}&to=${end.toISOString().split('T')[0]}`
    }
    fetch(url).then(r => r.json()).then(d => { setData(d.data); setLoading(false) })
  }

  useEffect(() => { load() }, [month, filterMode, from, to])

  if (loading) return <div className="empty-state animate-in">Loading report...</div>

  const s = data?.sales || {}
  const e = data?.expenses || {}
  const credits: any[] = data?.all_credits || []
  const cp = data?.credit_payments_received || {}

  const chartData = (data?.daily_breakdown||[]).map((d:any) => ({
    date: new Date(d.date).toLocaleDateString('en-KE',{day:'2-digit',month:'short'}),
    Sales: Math.round(Number(d.sales)),
    ...(isSuperAdmin ? { Profit: Math.round(Number(d.profit)) } : {}),
  }))

  return (
    <div className="animate-in">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">
            {filterMode === 'month' ? 'Monthly' : filterMode === 'week' ? 'Weekly' : 'Custom'} Report
          </h1>
          <p className="page-sub">Full overview with filters and trends</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center no-print">
          <select className="duka-input duka-select" style={{width:'auto'}} value={filterMode}
            onChange={e => setFilterMode(e.target.value as FilterMode)}>
            <option value="month">Monthly</option>
            <option value="week">This Week</option>
            <option value="custom">Custom Range</option>
          </select>
          {filterMode === 'month' && (
            <input type="month" className="duka-input" style={{width:'auto'}} value={month} onChange={e => setMonth(e.target.value)} />
          )}
          {filterMode === 'custom' && (
            <>
              <input type="date" className="duka-input" style={{width:'auto'}} value={from} onChange={e => setFrom(e.target.value)} placeholder="From" />
              <input type="date" className="duka-input" style={{width:'auto'}} value={to} onChange={e => setTo(e.target.value)} placeholder="To" />
            </>
          )}
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
        {isSuperAdmin && <div className="stat-card blue">
          <div className="stat-label">Net Profit</div>
          <div className={`stat-value ${Number(data?.net_profit||0)>=0?'text-green':'text-red'}`}>
            {Number(data?.net_profit||0).toLocaleString('en-KE',{maximumFractionDigits:0})}</div>
        </div>}
        <div className="stat-card red">
          <div className="stat-label">Expenses</div>
          <div className="stat-value">{Number(e.total_expenses||0).toLocaleString('en-KE',{maximumFractionDigits:0})}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Owner Withdrawals</div>
          <div className="stat-value">{Number(data?.owner_withdrawals||0).toLocaleString('en-KE',{maximumFractionDigits:0})}</div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="duka-card mb-4">
          <div className="duka-card-title">📊 Daily Sales {isSuperAdmin ? '& Profit' : ''}</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{top:5,right:20,left:20,bottom:5}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3047" />
              <XAxis dataKey="date" tick={{fill:'#535c78',fontSize:11}} />
              <YAxis tick={{fill:'#535c78',fontSize:11}} tickFormatter={v=>(v/1000).toFixed(0)+'k'} />
              <Tooltip content={<CustomTooltip/>} />
              <Legend wrapperStyle={{color:'#8e96b0',fontSize:12}} />
              <Bar dataKey="Sales" fill="#3ecf8e" radius={[4,4,0,0]} />
              {isSuperAdmin && <Bar dataKey="Profit" fill="#f5c842" radius={[4,4,0,0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Payment breakdown */}
        <div className="duka-card">
          <div className="duka-card-title">💳 Payment Breakdown</div>
          {[
            { label:'💵 Cash',   val: s.cash_sales||0,   cls:'text-green' },
            { label:'📱 M-Pesa', val: s.mpesa_sales||0,  cls:'text-blue' },
            { label:'🏦 KCB',    val: s.kcb_sales||0,    cls:'text-yellow' },
            { label:'📋 Credit', val: s.credit_sales||0, cls:'text-red' },
          ].map(r => (
            <div key={r.label} className="flex justify-between py-2.5 border-b border-border last:border-0">
              <span className="text-sub text-sm">{r.label}</span>
              <span className={`mono font-semibold ${r.cls}`}>{fmt(r.val)}</span>
            </div>
          ))}
          {Number(s.total_discount||0) > 0 && (
            <div className="flex justify-between py-2.5 border-t border-border">
              <span className="text-sub text-sm">🏷️ Discounts Given</span>
              <span className="mono font-semibold text-red">{fmt(s.total_discount)}</span>
            </div>
          )}
        </div>

        {/* Top products */}
        <div className="duka-card">
          <div className="duka-card-title">🏆 Top Products</div>
          {data?.top_products?.length ? (
            <table className="duka-table">
              <thead><tr><th>Product</th><th>Qty</th><th>Revenue</th>{isSuperAdmin && <th>Profit</th>}</tr></thead>
              <tbody>
                {data.top_products.slice(0,8).map((p:any,i:number) => (
                  <tr key={i}>
                    <td className="text-white">{p.product_name}</td>
                    <td className="mono">{Number(p.qty_sold).toFixed(2)}</td>
                    <td className="mono text-green">{fmt(p.revenue)}</td>
                    {isSuperAdmin && <td className="mono text-yellow">{fmt(p.profit)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state">No sales</div>}
        </div>
      </div>

      {/* Credit report */}
      {credits.length > 0 && (
        <div className="duka-card mb-4">
          <div className="duka-card-title">📋 Outstanding Credit Balances <span className="badge badge-red">{credits.length}</span></div>
          <div className="table-wrap">
            <table className="duka-table">
              <thead><tr><th>Customer</th><th>Date</th><th>Receipt</th><th>Total Owed</th><th>Paid So Far</th><th>Balance</th></tr></thead>
              <tbody>
                {credits.map((c:any) => {
                  const balance = Number(c.total) - Number(c.paid_amount || 0)
                  return (
                    <tr key={c.id}>
                      <td className="text-white font-medium">{c.customer_name}</td>
                      <td>{fmtDate(c.sale_date)}</td>
                      <td className="mono text-xs">{c.receipt_no}</td>
                      <td className="mono">{fmt(c.total)}</td>
                      <td className="mono text-green">{fmt(c.paid_amount || 0)}</td>
                      <td className="mono text-red font-bold">{fmt(balance)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="flex justify-end pt-3 font-bold">
              <span className="text-sub mr-4">Total Outstanding:</span>
              <span className="mono text-red">{fmt(credits.reduce((a:number,c:any) => a + Number(c.total) - Number(c.paid_amount||0), 0))}</span>
            </div>
          </div>
        </div>
      )}

      {/* Credit payments received */}
      {Number(cp.total||0) > 0 && (
        <div className="duka-card mb-4">
          <div className="duka-card-title">💰 Credit Payments Received</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-surface2 rounded-lg p-4 text-center">
              <div className="text-xs text-muted uppercase mb-1">Cash</div>
              <div className="mono text-green font-bold">{fmt(cp.cash||0)}</div>
            </div>
            <div className="bg-surface2 rounded-lg p-4 text-center">
              <div className="text-xs text-muted uppercase mb-1">M-Pesa</div>
              <div className="mono text-blue font-bold">{fmt(cp.mpesa||0)}</div>
            </div>
            <div className="bg-surface2 rounded-lg p-4 text-center">
              <div className="text-xs text-muted uppercase mb-1">KCB</div>
              <div className="mono text-yellow font-bold">{fmt(cp.kcb||0)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Daily breakdown */}
      {data?.daily_breakdown?.length > 0 && (
        <div className="duka-card">
          <div className="duka-card-title">📋 Daily Breakdown</div>
          <table className="duka-table">
            <thead><tr><th>Date</th><th>Txns</th><th>Sales</th>{isSuperAdmin && <th>Profit</th>}</tr></thead>
            <tbody>
              {data.daily_breakdown.map((d:any) => (
                <tr key={d.date}>
                  <td>{fmtDate(d.date)}</td>
                  <td className="mono">{d.tx_count}</td>
                  <td className="mono text-green">{fmt(d.sales)}</td>
                  {isSuperAdmin && <td className="mono text-yellow">{fmt(d.profit)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
