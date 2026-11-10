'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { fmt } from '@/lib/utils'
import { useAuth } from '@/components/AuthContext'
import { EXPIRY_PRESETS, expiryBadgeClass, expiryLevel, expiryText, fmtExpiry } from '@/lib/expiry'

interface Props {
  compact?: boolean      // dashboard mode: fewer rows + link to full report
  defaultDays?: number
}

function stockLabel(p: any) {
  const qty = Number(p.qty)
  const pack = Number(p.ws_pack_qty || 0)
  const base = `${qty % 1 ? qty.toFixed(1) : qty} ${p.base_unit}`
  if (p.sell_mode !== 'denominations' && pack > 1) {
    const packs = Math.floor(qty / pack)
    if (packs > 0) return `${base} (${packs} ${p.ws_pack_label || 'pack'}${packs > 1 ? 's' : ''})`
  }
  return base
}

export default function ExpiryAlerts({ compact = false, defaultDays = 30 }: Props) {
  const { isSuperAdmin } = useAuth()
  const [days, setDays] = useState(defaultDays)
  const [customDays, setCustomDays] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [includeExpired, setIncludeExpired] = useState(true)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    fetch(`/api/products/expiring?days=${days}&include_expired=${includeExpired ? 1 : 0}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d.data) })
      .catch(e => setError(e.message || 'Could not load expiry data'))
      .finally(() => setLoading(false))
  }, [days, includeExpired])

  useEffect(() => { load() }, [load])

  function applyCustom() {
    const n = parseInt(customDays, 10)
    if (!n || n < 1) return
    setIsCustom(true)
    setDays(Math.min(n, 3650))
  }

  const s = data?.summary || {}
  const products: any[] = data?.products || []
  const shown = compact ? products.slice(0, 8) : products
  const windowLabel = isCustom ? `next ${days} days` : (EXPIRY_PRESETS.find(p => p.days === days)?.label.toLowerCase() || `next ${days} days`)

  return (
    <div className="duka-card">
      <div className="duka-card-title">
        <span>⏳ Expiring Stock</span>
        {Number(s.expired_count) > 0 && <span className="badge badge-red">{s.expired_count} expired</span>}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4 no-print">
        {EXPIRY_PRESETS.map(p => (
          <button key={p.days}
            className={`btn btn-sm ${!isCustom && days === p.days ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => { setIsCustom(false); setDays(p.days) }}>
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1">
          <input type="number" min="1" max="3650" placeholder="Custom" className="duka-input"
            style={{ width: 90, padding: '6px 10px', fontSize: 12 }}
            value={customDays} onChange={e => setCustomDays(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyCustom() }} />
          <span className="text-xs text-muted">days</span>
          <button className={`btn btn-sm ${isCustom ? 'btn-primary' : 'btn-outline'}`} onClick={applyCustom} disabled={!customDays}>Apply</button>
        </div>
        <label className="flex items-center gap-2 text-xs text-sub ml-auto cursor-pointer">
          <input type="checkbox" checked={includeExpired} onChange={e => setIncludeExpired(e.target.checked)} />
          Include already expired
        </label>
      </div>

      {/* Summary */}
      <div className={`grid grid-cols-1 ${isSuperAdmin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3 mb-4`}>
        <div className="bg-surface2 rounded-lg p-3 border-l-4" style={{ borderColor: '#e96b6b' }}>
          <div className="text-xs text-muted uppercase tracking-wider">Already expired</div>
          <div className="mono text-xl font-bold text-red">{s.expired_count ?? '—'}</div>
          {isSuperAdmin && <div className="text-xs text-muted">Cost value {fmt(s.expired_value || 0)}</div>}
        </div>
        <div className="bg-surface2 rounded-lg p-3 border-l-4" style={{ borderColor: '#f5c842' }}>
          <div className="text-xs text-muted uppercase tracking-wider">Expiring {windowLabel}</div>
          <div className="mono text-xl font-bold text-yellow">{s.window_count ?? '—'}</div>
          <div className="text-xs text-muted">{s.week_count ?? 0} within 7 days</div>
        </div>
        {isSuperAdmin && (
          <div className="bg-surface2 rounded-lg p-3 border-l-4" style={{ borderColor: '#7eb8f7' }}>
            <div className="text-xs text-muted uppercase tracking-wider">Value at risk</div>
            <div className="mono text-xl font-bold text-blue">{fmt(Number(s.window_value || 0) + (includeExpired ? Number(s.expired_value || 0) : 0))}</div>
            <div className="text-xs text-muted">Cost of stock in this list</div>
          </div>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="empty-state py-6">Checking expiry dates...</div>
      ) : error ? (
        <div className="empty-state py-6 text-red">{error}</div>
      ) : products.length === 0 ? (
        <div className="empty-state py-6">
          ✅ Nothing {includeExpired ? 'expired or ' : ''}expiring in the {windowLabel}.
          {Number(s.no_expiry_count) > 0 && <div className="text-xs mt-1">{s.no_expiry_count} in-stock product(s) have no expiry date set.</div>}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="duka-table">
              <thead><tr>
                <th>Product</th><th>Category</th><th>In Stock</th><th>Expiry Date</th><th>Status</th>
                {isSuperAdmin && <th>Cost Value</th>}
              </tr></thead>
              <tbody>
                {shown.map(p => {
                  const lvl = expiryLevel(p.days_to_expiry)
                  return (
                    <tr key={p.id} style={lvl === 'expired' ? { background: 'rgba(233,107,107,0.06)' } : undefined}>
                      <td><div className="text-white font-medium">{p.name}</div>{p.supplier && <div className="text-xs text-muted">{p.supplier}</div>}</td>
                      <td className="text-sm">{p.category}</td>
                      <td className="mono text-sm">{stockLabel(p)}</td>
                      <td className="mono text-sm">{fmtExpiry(p.expiry_str)}</td>
                      <td><span className={`badge ${expiryBadgeClass(lvl)}`}>{expiryText(p.days_to_expiry)}</span></td>
                      {isSuperAdmin && <td className="mono text-sm">{fmt(p.stock_value)}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {compact && (
            <div className="flex justify-between items-center mt-3 text-xs">
              <span className="text-muted">{products.length > shown.length ? `Showing ${shown.length} of ${products.length}` : `${products.length} item(s)`}</span>
              <Link href="/reports/expiry" className="text-accent hover:underline">View full expiry report →</Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
