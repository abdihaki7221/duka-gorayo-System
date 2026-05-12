'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { fmt } from '@/lib/utils'
import { useAuth } from '@/components/AuthContext'

function calcInventoryValue(p: any) {
  // Inventory value = cost of product × stock quantity
  return Number(p.buy_price || 0) * Number(p.qty || 0)
}

export default function StockPage() {
  const { isSuperAdmin } = useAuth()
  const [products, setProducts] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [editProduct, setEditProduct] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  function load(q = '') {
    setLoading(true)
    fetch(`/api/products?search=${q}`)
      .then(r => r.json()).then(d => { setProducts(d.data || []); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  async function saveEdit() {
    setSaving(true)
    try {
      const res = await fetch(`/api/products/${editProduct.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editProduct.name, category: editProduct.category, supplier: editProduct.supplier,
          qty: Number(editProduct.qty), buy_price: Number(editProduct.buy_price),
          ws_price: Number(editProduct.ws_price), ws_buy_price: Number(editProduct.ws_buy_price || 0),
          retail_price: Number(editProduct.retail_price),
          low_stock_threshold: Number(editProduct.low_stock_threshold),
          sell_mode: editProduct.sell_mode, base_unit: editProduct.base_unit,
          base_qty: Number(editProduct.base_qty || 1),
          ws_pack_qty: Number(editProduct.ws_pack_qty), ws_pack_label: editProduct.ws_pack_label,
          denominations: editProduct.denominations || [],
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Product updated!')
      setEditProduct(null); load(search)
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function del(id: number, name: string) {
    if (!confirm(`Delete "${name}"?`)) return
    await fetch(`/api/products/${id}`, { method: 'DELETE' })
    toast.success('Deleted'); load(search)
  }

  const totalValue = products.reduce((a, p) => a + calcInventoryValue(p), 0)
  const categories = Array.from(new Set(products.map(p => p.category)))

  return (
    <div className="animate-in">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Stock</h1>
          <p className="page-sub">{products.length} products
            {isSuperAdmin && <> · Inventory value: <strong className="text-accent">{fmt(totalValue)}</strong></>}
          </p>
        </div>
        <Link href="/stock/add" className="btn btn-primary">➕ Add Stock</Link>
      </div>

      <div className="duka-card mb-4">
        <input className="duka-input" placeholder="🔍 Search products..." value={search}
          onChange={e => { setSearch(e.target.value); load(e.target.value) }} />
      </div>

      {loading ? <div className="empty-state">Loading...</div> : products.length === 0 ? (
        <div className="empty-state">No products.<br /><Link href="/stock/add" className="btn btn-primary mt-4 inline-flex">➕ Add Product</Link></div>
      ) : (
        categories.map(cat => {
          const catProds = products.filter(p => p.category === cat)
          return (
            <div key={cat} className="duka-card mb-4">
              <div className="duka-card-title">{cat} <span className="badge badge-gray">{catProds.length}</span></div>
              <div className="table-wrap">
                <table className="duka-table">
                  <thead><tr>
                    <th>Product</th>{isSuperAdmin && <th>Cost/Unit</th>}<th>Stock</th>
                    {isSuperAdmin && <th>Stock Value</th>}
                    <th>WS Sell</th>{isSuperAdmin && <th>WS Buy</th>}<th>Status</th><th>Sizes</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {catProds.map(p => {
                      const isOut = Number(p.qty) === 0
                      const isLow = !isOut && Number(p.qty) < Number(p.low_stock_threshold)
                      const denoms: any[] = p.denominations || []
                      const isExp = expanded === p.id
                      const packs = Math.floor(Number(p.qty) / Number(p.ws_pack_qty || 1))
                      const remaining = Number(p.qty) - packs * Number(p.ws_pack_qty || 1)
                      const stockValue = Number(p.buy_price || 0) * Number(p.qty || 0)
                      return (
                        <tr key={p.id}>
                          <td><div className="text-white font-medium">{p.name}</div><div className="text-xs text-muted">{p.supplier}</div></td>
                          {isSuperAdmin && <td className="mono text-sm">{fmt(p.buy_price)}<span className="text-muted text-xs">/{p.base_unit}</span></td>}
                          <td className="mono">
                            <div>{Number(p.qty).toFixed(1)} {p.base_unit}</div>
                            {p.sell_mode !== 'denominations' && (
                              <div className="text-xs text-muted">{packs} {p.ws_pack_label}{remaining > 0 ? ` + ${remaining.toFixed(1)} ${p.base_unit}` : ''}</div>
                            )}
                          </td>
                          {isSuperAdmin && <td className="mono text-sm text-accent font-semibold">{fmt(stockValue)}</td>}
                          <td className="mono text-yellow text-sm">{p.sell_mode!=='denominations'?`${fmt(p.ws_price)}/${p.ws_pack_label}`:'—'}</td>
                          {isSuperAdmin && <td className="mono text-sm">{p.sell_mode!=='denominations'?fmt(p.ws_buy_price || 0):'—'}</td>}
                          <td><span className={`badge ${isOut?'badge-red':isLow?'badge-yellow':'badge-green'}`}>{isOut?'Out':isLow?'Low':'OK'}</span></td>
                          <td>
                            {denoms.length > 0 ? (
                              <button className="btn btn-ghost btn-sm text-blue" onClick={() => setExpanded(isExp?null:p.id)}>
                                {isExp?'▲':'▼'} {denoms.length}
                              </button>
                            ) : '—'}
                            {isExp && (
                              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setExpanded(null)}>
                                <div className="bg-surface border border-border rounded-xl p-6 max-w-2xl w-full" onClick={e => e.stopPropagation()}>
                                  <div className="flex justify-between mb-4">
                                    <h3 className="font-semibold text-white">{p.name} — Retail Sizes</h3>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(null)}>✕</button>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {denoms.map((d: any) => {
                                      const cost = Number(p.buy_price) * Number(d.fraction)
                                      const profit = Number(d.sell_price) - cost
                                      return (
                                        <div key={d.id} className="bg-surface2 rounded-lg p-4">
                                          <div className="text-white font-bold text-lg">{d.label}</div>
                                          <div className="text-xs text-muted mb-2">{d.fraction}× {p.base_unit}</div>
                                          <div className="text-accent mono font-bold">{fmt(d.sell_price)}</div>
                                          {isSuperAdmin && <>
                                            <div className="text-xs text-muted mt-1">Cost: <span className="text-red">{fmt(cost)}</span></div>
                                            <div className="text-xs mt-0.5">Profit: <span className={`font-bold ${profit>=0?'text-green':'text-red'}`}>{fmt(profit)}</span></div>
                                          </>}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="flex gap-2">
                              <button className="btn btn-outline btn-sm" onClick={() => setEditProduct({ ...p, denominations: [...(p.denominations||[])] })}>✏️</button>
                              <button className="btn btn-ghost btn-sm text-red" onClick={() => del(p.id, p.name)}>🗑️</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}

      {editProduct && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditProduct(null)}>
          <div className="modal" style={{ maxWidth: 640 }}>
            <h2 className="modal-title">Edit: {editProduct.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-2"><label className="duka-label">Product Name</label>
                <input className="duka-input" value={editProduct.name||''} onChange={e => setEditProduct({...editProduct, name:e.target.value})} /></div>
              <div><label className="duka-label">Category</label>
                <select className="duka-input duka-select" value={editProduct.category||'Other'} onChange={e => setEditProduct({...editProduct, category:e.target.value})}>
                  {['Flour & Unga','Sugar & Salt','Cooking Oil','Rice & Cereals','Beverages','Cleaning','Dairy & Eggs','Toiletries & Soap','Snacks & Biscuits','Tea & Coffee','Spices & Seasoning','Bread & Bakery','Canned Goods','Detergents & Cleaning','Baby Products','Stationery','Airtime & Scratch Cards','Charcoal & Fuel','Hardware & Tools','Animal Feed','Tobacco & Cigarettes','Other'].map(c => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div><label className="duka-label">Supplier</label>
                <input className="duka-input" value={editProduct.supplier||''} onChange={e => setEditProduct({...editProduct, supplier:e.target.value})} /></div>
              <div><label className="duka-label">Qty ({editProduct.base_unit}s)</label>
                <input type="number" className="duka-input" value={editProduct.qty||''} onChange={e => setEditProduct({...editProduct, qty:e.target.value})} /></div>
              <div><label className="duka-label">Buy Price / {editProduct.base_unit}</label>
                <input type="number" step="0.01" className="duka-input" value={editProduct.buy_price||''} onChange={e => setEditProduct({...editProduct, buy_price:e.target.value})} /></div>
              <div><label className="duka-label">WS Sell Price / pack</label>
                <input type="number" step="0.01" className="duka-input" value={editProduct.ws_price||''} onChange={e => setEditProduct({...editProduct, ws_price:e.target.value})} /></div>
              <div><label className="duka-label">WS Buying Price / pack</label>
                <input type="number" step="0.01" className="duka-input" value={editProduct.ws_buy_price||''} onChange={e => setEditProduct({...editProduct, ws_buy_price:e.target.value})} />
                <p className="text-xs text-muted mt-1">What you pay per wholesale pack</p></div>
              <div><label className="duka-label">WS Pack Qty</label>
                <input type="number" className="duka-input" value={editProduct.ws_pack_qty||''} onChange={e => setEditProduct({...editProduct, ws_pack_qty:e.target.value})} /></div>
              <div><label className="duka-label">WS Pack Label</label>
                <input className="duka-input" value={editProduct.ws_pack_label||''} onChange={e => setEditProduct({...editProduct, ws_pack_label:e.target.value})} /></div>
              <div><label className="duka-label">Low Stock Threshold</label>
                <input type="number" className="duka-input" value={editProduct.low_stock_threshold||''} onChange={e => setEditProduct({...editProduct, low_stock_threshold:e.target.value})} /></div>
            </div>

            {(editProduct.denominations||[]).length > 0 && (
              <div className="mt-5">
                <div className="flex justify-between items-center mb-2">
                  <div className="duka-label mb-0">Retail Denominations</div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditProduct({
                    ...editProduct, denominations: [...editProduct.denominations, { label:'', fraction:'', sell_price:'' }]
                  })}>+ Add</button>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted uppercase px-1"><div>Label</div><div>Fraction</div><div>Price</div><div></div></div>
                  {editProduct.denominations.map((d:any, i:number) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <input className="duka-input" value={d.label||''} onChange={e => { const nd=[...editProduct.denominations]; nd[i]={...nd[i],label:e.target.value}; setEditProduct({...editProduct,denominations:nd}) }} />
                      <input type="number" step="0.001" className="duka-input" value={d.fraction||''} onChange={e => { const nd=[...editProduct.denominations]; nd[i]={...nd[i],fraction:e.target.value}; setEditProduct({...editProduct,denominations:nd}) }} />
                      <input type="number" step="0.01" className="duka-input" value={d.sell_price||''} onChange={e => { const nd=[...editProduct.denominations]; nd[i]={...nd[i],sell_price:e.target.value}; setEditProduct({...editProduct,denominations:nd}) }} />
                      <button className="btn btn-ghost btn-sm text-red" onClick={() => { const nd=editProduct.denominations.filter((_:any,j:number)=>j!==i); setEditProduct({...editProduct,denominations:nd}) }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button className="btn btn-outline" onClick={() => setEditProduct(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? '⏳...' : '💾 Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
