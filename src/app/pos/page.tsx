'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { fmt } from '@/lib/utils'
import { useAuth } from '@/components/AuthContext'
import ReceiptModal from '@/components/ReceiptModal'

interface CartItem {
  product_id: number; product_name: string; sale_type: string
  denomination_id: number | null; denomination_label: string | null
  fraction: number; qty: number; unit_price: number; buy_price: number
  subtotal: number; profit: number; base_unit: string; discount: number
}
interface PaymentRow { method: string; amount: string; reference: string }
const METHODS = ['cash', 'mpesa', 'kcb', 'credit']

export default function POSPage() {
  const { isSuperAdmin } = useAuth()
  const [products, setProducts] = useState<any[]>([])
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window !== 'undefined') {
      try { const saved = localStorage.getItem('duka_cart'); return saved ? JSON.parse(saved) : [] }
      catch { return [] }
    }
    return []
  })
  const [selProductId, setSelProductId] = useState('')
  const [selDenomId, setSelDenomId] = useState('')
  const [selSaleType, setSelSaleType] = useState<'retail_denom'|'wholesale'|'retail'>('retail_denom')
  const [qty, setQty] = useState(1)
  const [itemDiscount, setItemDiscount] = useState(0)
  const [saleDiscount, setSaleDiscount] = useState(() => {
    if (typeof window !== 'undefined') {
      try { return Number(localStorage.getItem('duka_sale_discount') || 0) } catch { return 0 }
    }
    return 0
  })
  const [payments, setPayments] = useState<PaymentRow[]>([{ method: 'cash', amount: '', reference: '' }])
  const [customerName, setCustomerName] = useState(() => {
    if (typeof window !== 'undefined') {
      try { return localStorage.getItem('duka_customer') || '' } catch { return '' }
    }
    return ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState<any>(null)
  const [search, setSearch] = useState('')

  // Persist cart to localStorage
  useEffect(() => {
    try { localStorage.setItem('duka_cart', JSON.stringify(cart)) } catch {}
  }, [cart])
  useEffect(() => {
    try { localStorage.setItem('duka_customer', customerName) } catch {}
  }, [customerName])
  useEffect(() => {
    try { localStorage.setItem('duka_sale_discount', String(saleDiscount)) } catch {}
  }, [saleDiscount])

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(d => setProducts(d.data || []))
  }, [])

  const selProduct = products.find(p => p.id === Number(selProductId))
  const denoms: any[] = selProduct?.denominations || []
  const selDenom = denoms.find((d: any) => d.id === Number(selDenomId))

  let previewPrice = 0
  if (selProduct) {
    if (selSaleType === 'retail_denom' && selDenom) previewPrice = Number(selDenom.sell_price)
    else if (selSaleType === 'wholesale') previewPrice = Number(selProduct.ws_price)
    else previewPrice = Number(selProduct.retail_price)
  }

  const buyPrice = selProduct ? Number(selProduct.buy_price) : 0
  const fraction = selDenom ? Number(selDenom.fraction) : selSaleType === 'wholesale' ? Number(selProduct?.ws_pack_qty || 1) : 1

  const cartGross = cart.reduce((a, c) => a + c.unit_price * c.qty, 0)
  const cartItemDiscounts = cart.reduce((a, c) => a + c.discount, 0)
  const cartTotal = cartGross - cartItemDiscounts - saleDiscount
  const cartProfit = cart.reduce((a, c) => a + c.profit, 0) - saleDiscount
  const payTotal = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0)
  const payRemaining = cartTotal - payTotal

  const filteredProducts = products.filter(p =>
    Number(p.qty) > 0 && (
      !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase())
    )
  )

  function addToCart() {
    if (!selProduct) return toast.error('Select a product')
    if (qty < 0.01) return toast.error('Invalid quantity')

    // Stock validation
    const availableStock = Number(selProduct.qty)
    let baseUnitsNeeded = 0
    if (selSaleType === 'wholesale') {
      baseUnitsNeeded = Number(selProduct.ws_pack_qty || 1) * qty
    } else if (selDenom) {
      baseUnitsNeeded = Number(selDenom.fraction) * qty
    } else {
      baseUnitsNeeded = qty
    }

    // Also account for items already in cart for the same product
    const alreadyInCart = cart
      .filter(c => c.product_id === selProduct.id)
      .reduce((a, c) => a + c.fraction * c.qty, 0)

    if (baseUnitsNeeded + alreadyInCart > availableStock + 0.001) {
      const remaining = Math.max(0, availableStock - alreadyInCart)
      if (remaining <= 0) {
        return toast.error(`⚠️ OUT OF STOCK: ${selProduct.name} has no remaining stock`)
      }
      if (selSaleType === 'wholesale') {
        const maxPacks = Math.floor(remaining / Number(selProduct.ws_pack_qty || 1))
        return toast.error(`⚠️ Insufficient stock for ${selProduct.name}. Only ${maxPacks} ${selProduct.ws_pack_label}(s) available (${remaining.toFixed(1)} ${selProduct.base_unit} remaining)`)
      }
      return toast.error(`⚠️ Insufficient stock for ${selProduct.name}. Only ${remaining.toFixed(1)} ${selProduct.base_unit} available`)
    }

    const disc = Number(itemDiscount || 0)
    const subtotal = (previewPrice * qty) - disc
    // For wholesale: use ws_buy_price directly (avoids floating point from buy_price * pack_qty)
    // For retail: use buy_price * fraction
    const cost = (selSaleType === 'wholesale' && !selDenom)
      ? (Number(selProduct.ws_buy_price) || (buyPrice * fraction)) * qty
      : buyPrice * fraction * qty
    const item: CartItem = {
      product_id: selProduct.id, product_name: selProduct.name, sale_type: selSaleType,
      denomination_id: selDenom ? selDenom.id : null,
      denomination_label: selDenom ? selDenom.label : selSaleType === 'wholesale' ? selProduct.ws_pack_label : null,
      fraction, qty, unit_price: previewPrice, buy_price: buyPrice,
      subtotal, profit: Math.round((subtotal - cost) * 100) / 100, base_unit: selProduct.base_unit, discount: disc,
    }
    setCart(prev => [...prev, item])
    setSelProductId(''); setSelDenomId(''); setQty(1); setItemDiscount(0); setSearch('')
  }

  function setPaymentField(idx: number, field: keyof PaymentRow, val: string) {
    setPayments(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p))
  }
  function addPaymentRow() {
    if (payments.length >= 3) return toast.error('Maximum 3 splits')
    setPayments(prev => [...prev, { method: 'cash', amount: '', reference: '' }])
  }
  function removePaymentRow(idx: number) { setPayments(prev => prev.filter((_, i) => i !== idx)) }
  function autoFillRemaining(idx: number) {
    const others = payments.reduce((a, p, i) => i !== idx ? a + (Number(p.amount)||0) : a, 0)
    setPaymentField(idx, 'amount', Math.max(0, cartTotal - others).toFixed(2))
  }

  async function completeSale() {
    if (!cart.length) return toast.error('Add items first')
    if (Math.abs(payTotal - cartTotal) > 0.5) return toast.error(`Payment doesn't match total`)
    setSubmitting(true)
    try {
      const res = await fetch('/api/sales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName || 'Walk-in',
          discount: saleDiscount,
          payments: payments.map(p => ({ method: p.method, amount: Number(p.amount), reference: p.reference || null })),
          items: cart.map(c => ({ product_id: c.product_id, sale_type: c.sale_type, denomination_id: c.denomination_id, qty: c.qty, discount: c.discount }))
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Sale completed!')
      setReceipt(data.data)
      setCart([]); setCustomerName(''); setSaleDiscount(0)
      setPayments([{ method: 'cash', amount: '', reference: '' }])
      // Clear persisted cart
      try { localStorage.removeItem('duka_cart'); localStorage.removeItem('duka_customer'); localStorage.removeItem('duka_sale_discount') } catch {}
      // Refresh products
      fetch('/api/products').then(r => r.json()).then(d => setProducts(d.data || []))
    } catch (e: any) { toast.error(e.message) }
    finally { setSubmitting(false) }
  }

  return (
    <div className="animate-in">
      <div className="mb-5">
        <h1 className="page-title">New Sale</h1>
        <p className="page-sub">Add items, apply discounts, split payment if needed</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 space-y-4">
          {/* Item selector */}
          <div className="duka-card">
            <div className="duka-card-title">Add Item</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="duka-label">Product</label>
                <input className="duka-input mb-2" placeholder="🔍 Search products..." value={search}
                  onChange={e => { setSearch(e.target.value); setSelProductId('') }} />
                <select className="duka-input duka-select" value={selProductId}
                  onChange={e => { setSelProductId(e.target.value); setSelDenomId(''); setSelSaleType('retail_denom'); setSearch('') }}>
                  <option value="">-- Select product --</option>
                  {filteredProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({Number(p.qty).toFixed(1)} {p.base_unit})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="duka-label">Sale Mode</label>
                <select className="duka-input duka-select mt-2" value={selSaleType}
                  onChange={e => { setSelSaleType(e.target.value as any); setSelDenomId('') }} disabled={!selProduct}>
                  {selProduct?.sell_mode !== 'wholesale_units' && (
                    <>{denoms.length > 0 ? <option value="retail_denom">Retail (denomination)</option> : <option value="retail">Retail (per unit)</option>}</>
                  )}
                  {selProduct?.sell_mode !== 'denominations' && (
                    <option value="wholesale">Wholesale ({selProduct?.ws_pack_label || 'pack'})</option>
                  )}
                </select>
              </div>
            </div>

            {selSaleType === 'retail_denom' && denoms.length > 0 && (
              <div className="mb-3">
                <label className="duka-label">Denomination</label>
                <div className="flex flex-wrap gap-2">
                  {denoms.map((d: any) => {
                    const cost = buyPrice * Number(d.fraction)
                    const dProfit = Number(d.sell_price) - cost
                    return (
                      <button key={d.id} onClick={() => setSelDenomId(String(d.id))}
                        className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                          selDenomId === String(d.id) ? 'border-accent bg-accent/10 text-accent' : 'border-border text-sub hover:border-accent/50'
                        }`}>
                        <div className="font-semibold">{d.label}</div>
                        <div className="text-xs text-muted">{fmt(d.sell_price)}</div>
                        {isSuperAdmin && <div className="text-xs text-green">+{fmt(dProfit)}</div>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {selSaleType === 'wholesale' && selProduct && (
              <div className="bg-surface2 rounded-lg p-3 mb-3 text-sm">
                <span className="text-sub">Wholesale: </span>
                <strong className="text-yellow">{fmt(selProduct.ws_price)} per {selProduct.ws_pack_label}</strong>
                <span className="text-muted ml-3">({selProduct.ws_pack_qty} {selProduct.base_unit}/pack)</span>
              </div>
            )}

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="duka-label">Quantity</label>
                <input type="number" min="0.01" step="0.01" className="duka-input" value={qty}
                  onChange={e => setQty(Number(e.target.value))} />
              </div>
              <div className="flex-1">
                <label className="duka-label">Item Discount (KES)</label>
                <input type="number" min="0" step="1" className="duka-input" value={itemDiscount}
                  onChange={e => setItemDiscount(Number(e.target.value))} placeholder="0" />
              </div>
              <div className="flex items-end">
                <button className="btn btn-success" onClick={addToCart}
                  disabled={!selProduct || (selSaleType === 'retail_denom' && !selDenom)}>
                  ➕ Add
                </button>
              </div>
            </div>
          </div>

          {/* Cart */}
          <div className="duka-card">
            <div className="duka-card-title">
              🛒 Cart ({cart.length})
              {cart.length > 0 && <button className="btn btn-ghost btn-sm text-red" onClick={() => { setCart([]); try { localStorage.removeItem('duka_cart') } catch {} }}>Clear All</button>}
            </div>
            {cart.length === 0 ? (
              <div className="empty-state">No items added</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="duka-table">
                    <thead>
                      <tr>
                        <th>Product</th><th>Size</th><th>Qty</th><th>Price</th>
                        {cart.some(c => c.discount > 0) && <th>Disc</th>}
                        <th>Subtotal</th>{isSuperAdmin && <th>Profit</th>}<th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item, i) => (
                        <tr key={i}>
                          <td className="text-white font-medium">{item.product_name}</td>
                          <td>{item.denomination_label ? <span className="badge badge-green">{item.denomination_label}</span> : <span className="badge badge-yellow">{item.sale_type}</span>}</td>
                          <td className="mono">{item.qty}</td>
                          <td className="mono">{fmt(item.unit_price)}</td>
                          {cart.some(c => c.discount > 0) && <td className="mono text-red">{item.discount > 0 ? `-${fmt(item.discount)}` : '—'}</td>}
                          <td className="mono text-accent font-semibold">{fmt(item.subtotal)}</td>
                          {isSuperAdmin && <td className="mono text-green">{fmt(item.profit)}</td>}
                          <td><button className="btn btn-ghost btn-sm text-red" onClick={() => setCart(c => c.filter((_,j)=>j!==i))}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-8 mt-4 pt-4 border-t border-border">
                  {isSuperAdmin && (
                    <div className="text-right">
                      <div className="text-muted text-xs uppercase tracking-wider">Est. Profit</div>
                      <div className="text-lg font-bold text-green mono">{fmt(cartProfit)}</div>
                    </div>
                  )}
                  <div className="text-right">
                    <div className="text-muted text-xs uppercase tracking-wider">Cart Total</div>
                    <div className="text-2xl font-bold text-accent mono">{fmt(cartTotal)}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* RIGHT: payment */}
        <div className="lg:col-span-2">
          <div className="duka-card sticky top-6">
            <div className="duka-card-title">💳 Payment</div>
            <div className="space-y-4">
              <div>
                <label className="duka-label">Customer Name</label>
                <input className="duka-input" placeholder="Walk-in customer"
                  value={customerName} onChange={e => setCustomerName(e.target.value)} />
              </div>

              {/* Sale-level discount */}
              <div>
                <label className="duka-label">🏷️ Overall Sale Discount (KES)</label>
                <input type="number" min="0" step="1" className="duka-input" value={saleDiscount || ''}
                  onChange={e => setSaleDiscount(Number(e.target.value) || 0)} placeholder="0" />
              </div>

              {/* Payments */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="duka-label mb-0">Payment{payments.length > 1 ? 's (Split)' : ''}</label>
                  {payments.length < 3 && <button className="btn btn-outline btn-sm" onClick={addPaymentRow}>+ Split</button>}
                </div>
                <div className="space-y-2">
                  {payments.map((p, idx) => (
                    <div key={idx} className="bg-surface2 rounded-lg p-3 space-y-2">
                      <div className="flex gap-2 items-center">
                        <select className="duka-input duka-select flex-1" value={p.method}
                          onChange={e => setPaymentField(idx, 'method', e.target.value)}>
                          {METHODS.map(m => (
                            <option key={m} value={m}>{m==='cash'?'💵 Cash':m==='mpesa'?'📱 M-Pesa':m==='kcb'?'🏦 KCB':'📋 Credit'}</option>
                          ))}
                        </select>
                        {payments.length > 1 && <button className="btn btn-ghost btn-sm text-red" onClick={() => removePaymentRow(idx)}>✕</button>}
                      </div>
                      <div className="flex gap-2">
                        <input type="number" step="0.01" placeholder="Amount" className="duka-input flex-1"
                          value={p.amount} onChange={e => setPaymentField(idx, 'amount', e.target.value)} />
                        <button className="btn btn-ghost btn-sm text-muted" onClick={() => autoFillRemaining(idx)}>Fill</button>
                      </div>
                      {(p.method === 'mpesa' || p.method === 'kcb') && (
                        <input className="duka-input" placeholder="Transaction reference" value={p.reference}
                          onChange={e => setPaymentField(idx, 'reference', e.target.value)} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-surface2 rounded-xl p-4 font-mono text-sm space-y-2">
                <div className="flex justify-between text-sub"><span>Gross Total</span><span>{fmt(cartGross)}</span></div>
                {(cartItemDiscounts + saleDiscount) > 0 && (
                  <div className="flex justify-between text-red"><span>Discounts</span><span>-{fmt(cartItemDiscounts + saleDiscount)}</span></div>
                )}
                <div className="flex justify-between text-sub font-bold"><span>Net Total</span><span>{fmt(cartTotal)}</span></div>
                <div className="flex justify-between text-sub"><span>Paid</span><span>{fmt(payTotal)}</span></div>
                <hr className="divider my-1" />
                <div className={`flex justify-between font-bold text-base ${payRemaining > 0.5 ? 'text-red' : payRemaining < -0.5 ? 'text-blue' : 'text-green'}`}>
                  <span>{payRemaining > 0.5 ? 'Remaining' : payRemaining < -0.5 ? 'Change' : '✓ Balanced'}</span>
                  <span>{fmt(Math.abs(payRemaining))}</span>
                </div>
                {isSuperAdmin && (
                  <div className="flex justify-between text-yellow font-semibold pt-1 border-t border-border">
                    <span>Est. Profit</span><span>{fmt(cartProfit)}</span>
                  </div>
                )}
              </div>

              <button className="btn btn-primary btn-full btn-lg" onClick={completeSale}
                disabled={submitting || cart.length === 0 || Math.abs(payRemaining) > 0.5}>
                {submitting ? '⏳ Processing...' : '✅ Complete Sale & Print Receipt'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {receipt && <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}
