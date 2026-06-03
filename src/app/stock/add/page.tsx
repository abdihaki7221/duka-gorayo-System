'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuth } from '@/components/AuthContext'

const SELL_MODES = [
  { val: 'both', label: 'Both retail & wholesale' },
  { val: 'denominations', label: 'Retail by denomination only' },
  { val: 'wholesale_units', label: 'Wholesale only' },
]

interface Denom { label: string; fraction: string; sell_price: string }

const DENOM_TEMPLATES: Record<string, Denom[]> = {
  kg: [
    { label: '1/4 kg', fraction: '0.25', sell_price: '' },
    { label: '1/2 kg', fraction: '0.5', sell_price: '' },
    { label: '1 kg', fraction: '1', sell_price: '' },
    { label: '2 kg', fraction: '2', sell_price: '' },
  ],
  litre: [
    { label: '1/4 L', fraction: '0.25', sell_price: '' },
    { label: '1/2 L', fraction: '0.5', sell_price: '' },
    { label: '1 L', fraction: '1', sell_price: '' },
    { label: '2 L', fraction: '2', sell_price: '' },
    { label: '5 L', fraction: '5', sell_price: '' },
  ],
  packet: [{ label: '1 packet', fraction: '1', sell_price: '' }],
}

/**
 * Parse a denomination label and auto-calculate its fraction of 1 base unit.
 * Supports patterns like:
 *   "1/4 kg" → 0.25   (explicit fraction of base unit)
 *   "1 packet of 50 sweets" → 1/50 = 0.02  (1 item out of N total)
 *   "packet of 50" → 1/50 = 0.02
 *   "5 pieces from 100" → 5/100 = 0.05
 *   "250ml" → 0.25 (when base is litre)
 *   "500g" → 0.5 (when base is kg)
 */
function autoCalcFraction(label: string, baseUnit: string): string | null {
  const l = label.toLowerCase().trim()
  if (!l) return null

  // Pattern: "packet of N" or "1 packet of N" or "item of N" → 1/N
  const ofNPattern = l.match(/(?:(\d+)\s+)?(?:packet|piece|item|sweet|stick|sachet|tab|unit)s?\s+(?:of|from|out\s+of)\s+(\d+)/i)
  if (ofNPattern) {
    const num = Number(ofNPattern[1] || 1)
    const denom = Number(ofNPattern[2])
    if (denom > 0) return (num / denom).toFixed(6).replace(/\.?0+$/, '')
  }

  // Pattern: "N from M" or "N out of M" or "N/M"
  const fracPattern = l.match(/^(\d+(?:\.\d+)?)\s*[/÷]\s*(\d+(?:\.\d+)?)/)
  if (fracPattern) {
    const result = Number(fracPattern[1]) / Number(fracPattern[2])
    if (isFinite(result) && result > 0) return result.toFixed(6).replace(/\.?0+$/, '')
  }

  // Pattern: "N from M" or "N out of M"
  const fromPattern = l.match(/^(\d+(?:\.\d+)?)\s+(?:from|out\s+of)\s+(\d+(?:\.\d+)?)/)
  if (fromPattern) {
    const result = Number(fromPattern[1]) / Number(fromPattern[2])
    if (isFinite(result) && result > 0) return result.toFixed(6).replace(/\.?0+$/, '')
  }

  // Pattern: "250ml" when base unit is litre → 0.25
  if (baseUnit === 'litre') {
    const mlMatch = l.match(/^(\d+(?:\.\d+)?)\s*ml/)
    if (mlMatch) return (Number(mlMatch[1]) / 1000).toFixed(6).replace(/\.?0+$/, '')
    const lMatch = l.match(/^(\d+(?:\.\d+)?)\s*l(?:itre)?s?$/i)
    if (lMatch) return String(Number(lMatch[1]))
  }

  // Pattern: "250g" when base unit is kg → 0.25
  if (baseUnit === 'kg') {
    const gMatch = l.match(/^(\d+(?:\.\d+)?)\s*g(?:ram)?s?$/i)
    if (gMatch) return (Number(gMatch[1]) / 1000).toFixed(6).replace(/\.?0+$/, '')
    const kgMatch = l.match(/^(\d+(?:\.\d+)?)\s*kg/i)
    if (kgMatch) return String(Number(kgMatch[1]))
  }

  // Pattern: plain "1/4" at start
  const simpleFrac = l.match(/^(\d+)\s*\/\s*(\d+)/)
  if (simpleFrac) {
    const result = Number(simpleFrac[1]) / Number(simpleFrac[2])
    if (isFinite(result) && result > 0) return result.toFixed(6).replace(/\.?0+$/, '')
  }

  return null
}

export default function AddStockPage() {
  const { isSuperAdmin } = useAuth()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', category: '', supplier: '',
    qty: '', base_unit: 'litre', base_qty: '1',
    buy_price: '', transport_cost: '0',
    ws_price: '', ws_buy_price: '', retail_price: '',
    ws_pack_qty: '20', ws_pack_label: '',
    low_stock_threshold: '5', sell_mode: 'both',
  })
  const [denoms, setDenoms] = useState<Denom[]>(DENOM_TEMPLATES['litre'])

  // DB-driven categories and suppliers (Fix 1, 2, 4)
  const [dbCategories, setDbCategories] = useState<any[]>([])
  const [dbSuppliers, setDbSuppliers] = useState<any[]>([])

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(d => {
      const cats = d.data || []
      setDbCategories(cats)
      if (cats.length > 0 && !form.category) set('category', cats[0].name)
    })
    fetch('/api/suppliers').then(r => r.json()).then(d => setDbSuppliers(d.data || []))
  }, [])

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function applyTemplate(unit: string) {
    const t = DENOM_TEMPLATES[unit] || []
    setDenoms(t.map(d => ({ ...d })))
    set('base_unit', unit)
  }

  function setDenom(i: number, k: keyof Denom, v: string) {
    setDenoms(prev => prev.map((d, j) => {
      if (j !== i) return d
      const updated = { ...d, [k]: v }
      // Fix 3: Auto-calculate fraction when label changes
      if (k === 'label') {
        const calc = autoCalcFraction(v, form.base_unit)
        if (calc) updated.fraction = calc
      }
      return updated
    }))
  }

  function autoFillDenomPrices() {
    const costPerUnit = Number(form.buy_price) + (Number(form.qty) > 0 ? Number(form.transport_cost || 0) / Number(form.qty) : 0)
    if (!costPerUnit) return toast.error('Enter buying price first')
    setDenoms(prev => prev.map(d => ({
      ...d, sell_price: (costPerUnit * Number(d.fraction) * 1.13).toFixed(2)
    })))
    toast.success('Prices filled with 13% margin')
  }

  const totalUnits = Number(form.qty) || 0
  const transport = Number(form.transport_cost) || 0
  const buyPerUnit = Number(form.buy_price) || 0
  const costPerUnit = buyPerUnit + (totalUnits > 0 ? transport / totalUnits : 0)
  const totalCost = buyPerUnit * totalUnits + transport
  const wsBuyPrice = Number(form.ws_buy_price) || (costPerUnit * Number(form.ws_pack_qty || 1))
  const wsProfit = Number(form.ws_price) - wsBuyPrice

  async function save() {
    if (!form.name) return toast.error('Product name required')
    if (!form.qty) return toast.error('Quantity required')
    if (!form.buy_price) return toast.error('Buying price required')

    const activeDenoms = denoms.filter(d => d.label && d.fraction && d.sell_price)
    if ((form.sell_mode === 'both' || form.sell_mode === 'denominations') && activeDenoms.length === 0)
      return toast.error('Add at least one denomination for retail')

    setSaving(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form, qty: Number(form.qty), buy_price: Number(form.buy_price),
          transport_cost: Number(form.transport_cost),
          ws_price: Number(form.ws_price) || 0,
          ws_buy_price: Number(form.ws_buy_price) || 0,
          retail_price: Number(form.retail_price) || 0,
          base_qty: Number(form.base_qty), ws_pack_qty: Number(form.ws_pack_qty),
          low_stock_threshold: Number(form.low_stock_threshold),
          denominations: activeDenoms.map(d => ({ label: d.label, fraction: Number(d.fraction), sell_price: Number(d.sell_price) }))
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Stock saved!')
      router.push('/stock')
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="animate-in max-w-3xl">
      <div className="mb-6">
        <h1 className="page-title">Add New Stock</h1>
        <p className="page-sub">Record a new product with pricing and denominations</p>
      </div>

      <div className="duka-card mb-4">
        <div className="duka-card-title">📦 Product Details</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="col-span-2"><label className="duka-label">Product Name *</label>
            <input className="duka-input" placeholder="e.g. Cooking Oil, Sugar" value={form.name} onChange={e => { set('name', e.target.value); set('ws_pack_label', e.target.value) }} />
            <p className="text-muted text-xs mt-1">The display name for this product in POS and reports</p>
          </div>
          {/* Fix 4: DB-driven category dropdown */}
          <div><label className="duka-label">Category</label>
            <select className="duka-input duka-select" value={form.category} onChange={e => set('category', e.target.value)}>
              <option value="">-- Select category --</option>
              {dbCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <p className="text-muted text-xs mt-1">Manage categories in <a href="/categories" className="text-accent underline">Categories page</a></p>
          </div>
          {/* Fix 4: DB-driven supplier dropdown */}
          <div><label className="duka-label">Supplier</label>
            <select className="duka-input duka-select" value={form.supplier} onChange={e => set('supplier', e.target.value)}>
              <option value="">-- Select supplier --</option>
              {dbSuppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            <p className="text-muted text-xs mt-1">Manage suppliers in <a href="/suppliers" className="text-accent underline">Suppliers page</a></p>
          </div>
          <div><label className="duka-label">Quantity Received *</label>
            <input type="number" step="1" min="1" className="duka-input" value={form.qty} onChange={e => set('qty', e.target.value)} />
            <p className="text-muted text-xs mt-1">Total base units received (e.g. 18 litres, 50 kg)</p>
          </div>
          <div><label className="duka-label">Base Unit</label>
            <select className="duka-input duka-select" value={form.base_unit} onChange={e => applyTemplate(e.target.value)}>
              <option value="litre">Litre</option><option value="kg">Kilogram</option>
              <option value="packet">Packet / Piece</option><option value="unit">Unit</option>
            </select>
            <p className="text-muted text-xs mt-1">The fundamental unit for measuring this product</p>
          </div>
          <div><label className="duka-label">Sell Mode</label>
            <select className="duka-input duka-select" value={form.sell_mode} onChange={e => set('sell_mode', e.target.value)}>
              {SELL_MODES.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
            <p className="text-muted text-xs mt-1">Choose how this product can be sold</p>
          </div>
        </div>
      </div>

      <div className="duka-card mb-4">
        <div className="duka-card-title">💰 Purchase Pricing</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="duka-label">Buying Price per {form.base_unit} (KES) *</label>
            <input type="number" step="0.01" className="duka-input" value={form.buy_price} onChange={e => set('buy_price', e.target.value)} />
            <p className="text-muted text-xs mt-1">Oil: 4600÷18=255.56 | Sugar: 5200÷50=104</p></div>
          <div><label className="duka-label">Transport Cost (total)</label>
            <input type="number" step="0.01" className="duka-input" value={form.transport_cost} onChange={e => set('transport_cost', e.target.value)} />
            <p className="text-muted text-xs mt-1">Total transport for this delivery, split across all units</p></div>
        </div>
        {costPerUnit > 0 && (
          <div className="bg-surface2 rounded-xl p-4 mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div><div className="text-muted text-xs uppercase mb-1">Cost / {form.base_unit}</div>
              <div className="mono font-semibold text-white">KES {costPerUnit.toFixed(4)}</div></div>
            <div><div className="text-muted text-xs uppercase mb-1">Total Stock Cost</div>
              <div className="mono font-semibold text-red">KES {totalCost.toFixed(2)}</div></div>
            <div><div className="text-muted text-xs uppercase mb-1">Total {form.base_unit}s</div>
              <div className="mono font-semibold text-white">{totalUnits}</div></div>
          </div>
        )}
      </div>

      {(form.sell_mode === 'both' || form.sell_mode === 'wholesale_units') && (
        <div className="duka-card mb-4">
          <div className="duka-card-title">📦 Wholesale Pricing</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="duka-label">WS Pack Size ({form.base_unit}s per pack)</label>
              <input type="number" step="1" min="1" className="duka-input" value={form.ws_pack_qty} onChange={e => set('ws_pack_qty', e.target.value)} />
              <p className="text-muted text-xs mt-1">How many {form.base_unit}s make 1 wholesale pack</p></div>
            <div><label className="duka-label">WS Pack Label</label>
              <input className="duka-input" placeholder="e.g. 20L jerry, bale (12)" value={form.ws_pack_label} onChange={e => set('ws_pack_label', e.target.value)} />
              <p className="text-muted text-xs mt-1">Name for 1 wholesale unit (auto-filled from product name)</p></div>
            <div><label className="duka-label">WS Buying Price per Pack (KES)</label>
              <input type="number" step="0.01" className="duka-input" placeholder={`Auto: ${wsBuyPrice.toFixed(2)}`}
                value={form.ws_buy_price} onChange={e => set('ws_buy_price', e.target.value)} />
              <p className="text-muted text-xs mt-1">What you pay for 1 wholesale pack (e.g. 1 bale = KES 1500)</p></div>
            <div><label className="duka-label">WS Selling Price per Pack (KES)</label>
              <input type="number" step="0.01" className="duka-input" placeholder="e.g. 1540"
                value={form.ws_price} onChange={e => set('ws_price', e.target.value)} />
              {isSuperAdmin && Number(form.ws_price) > 0 && (
                <p className={`text-xs mt-1 font-semibold ${wsProfit >= 0 ? 'text-green' : 'text-red'}`}>
                  Profit per pack: KES {wsProfit.toFixed(2)}
                </p>
              )}</div>
            <div><label className="duka-label">Low Stock Alert ({form.base_unit}s)</label>
              <input type="number" step="1" min="0" className="duka-input" value={form.low_stock_threshold} onChange={e => set('low_stock_threshold', e.target.value)} />
              <p className="text-muted text-xs mt-1">Alert when stock falls below this number</p></div>
          </div>
        </div>
      )}

      {(form.sell_mode === 'both' || form.sell_mode === 'denominations') && (
        <div className="duka-card mb-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="duka-card-title" style={{marginBottom:0}}>🏷️ Retail Denominations</div>
              <p className="text-muted text-xs mt-1">Set sizes and prices for retail sales</p>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-outline btn-sm" onClick={autoFillDenomPrices}>✨ Auto-fill</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setDenoms(prev => [...prev, { label:'', fraction:'', sell_price:'' }])}>+ Add</button>
            </div>
          </div>

          {/* Fix 3: Fraction calculation help */}
          <div className="bg-surface2 rounded-lg p-3 mb-4 text-xs text-muted space-y-1">
            <div className="text-white font-semibold text-sm mb-1">💡 Fraction Auto-Calculator</div>
            <p>Type a label and the fraction is <strong className="text-accent">auto-calculated</strong>. Examples:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
              <div>• <code className="text-accent">1/4 kg</code> → fraction: 0.25</div>
              <div>• <code className="text-accent">1/2 L</code> → fraction: 0.5</div>
              <div>• <code className="text-accent">packet of 50</code> → fraction: 0.02 (1÷50)</div>
              <div>• <code className="text-accent">250ml</code> → fraction: 0.25 (for litres)</div>
              <div>• <code className="text-accent">500g</code> → fraction: 0.5 (for kg)</div>
              <div>• <code className="text-accent">2 from 10</code> → fraction: 0.2 (2÷10)</div>
            </div>
            <p className="mt-1">The fraction represents how much of 1 <strong>{form.base_unit}</strong> this denomination uses. A packet of sweets with 50 pieces: each piece = 1/50 = 0.02 of the packet.</p>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted uppercase px-1 pb-1">
              <div>Label</div><div>Fraction of 1 {form.base_unit}</div><div>Sell Price (KES)</div><div>Profit</div>
            </div>
            {denoms.map((d, i) => {
              const profit = costPerUnit && d.fraction && d.sell_price
                ? (Number(d.sell_price) - costPerUnit * Number(d.fraction)).toFixed(2) : '—'
              return (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                  <input className="duka-input" placeholder="e.g. 1/4 L, packet of 50" value={d.label} onChange={e => setDenom(i, 'label', e.target.value)} />
                  <input type="number" step="0.0001" className="duka-input" placeholder="Auto-calculated" value={d.fraction} onChange={e => setDenom(i, 'fraction', e.target.value)} />
                  <input type="number" step="0.01" className="duka-input" placeholder="0.00" value={d.sell_price} onChange={e => setDenom(i, 'sell_price', e.target.value)} />
                  <div className="flex items-center gap-2">
                    {isSuperAdmin && <span className={`mono text-sm font-semibold ${Number(profit) > 0 ? 'text-green' : Number(profit) < 0 ? 'text-red' : 'text-muted'}`}>
                      {profit === '—' ? '—' : `KES ${profit}`}
                    </span>}
                    <button className="btn btn-ghost btn-sm text-red" onClick={() => setDenoms(prev => prev.filter((_,j) => j!==i))}>✕</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button className="btn btn-outline" onClick={() => router.push('/stock')}>Cancel</button>
        <button className="btn btn-primary btn-lg" onClick={save} disabled={saving}>
          {saving ? '⏳ Saving...' : '💾 Save Stock'}
        </button>
      </div>
    </div>
  )
}
