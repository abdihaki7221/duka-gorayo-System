'use client'
import { fmt, fmtDate, fmtTime } from '@/lib/utils'

export default function ReceiptModal({ sale, onClose }: { sale: any; onClose: () => void }) {
  const items: any[] = (sale.items || []).filter(Boolean)
  const payments: any[] = (sale.payments || []).filter(Boolean)
  const isSplit = payments.length > 1
  const discount = Number(sale.discount || 0)

  function print() {
    const html = document.getElementById('receipt-print-area')!.innerHTML
    const win = window.open('', '', 'width=420,height=700')!
    win.document.write(`<html><head><title>Receipt ${sale.receipt_no}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Courier New',monospace;font-size:13px;width:320px;margin:0 auto;padding:20px;color:#111}
        h2{text-align:center;font-size:18px;margin-bottom:2px;font-family:Georgia,serif}
        .sub{text-align:center;color:#555;font-size:11px;margin-bottom:10px}
        .row{display:flex;justify-content:space-between;margin-bottom:3px}
        .divider{border-top:1px dashed #999;margin:8px 0}
        .footer{text-align:center;color:#888;font-size:11px;margin-top:14px}
        .credit-warn{text-align:center;color:#c00;font-weight:bold;margin:8px 0}
      </style></head><body>${html}</body></html>`)
    win.document.close(); win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="modal-title" style={{ marginBottom: 0 }}>🧾 Receipt</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div id="receipt-print-area" style={{
          background:'#fff', color:'#111', borderRadius:8, padding:24,
          fontFamily:"'Courier New',monospace", fontSize:13, maxWidth:340, margin:'0 auto'
        }}>
          <h2 style={{textAlign:'center',margin:'0 0 2px',fontFamily:'Georgia,serif',fontSize:18}}>GORAYO WHOLESALERS</h2>
          <div style={{textAlign:'center',color:'#555',fontSize:11,marginBottom:4}}>Wholesale &amp; Retail</div>
          <div style={{textAlign:'center',color:'#333',fontSize:10,marginBottom:10}}>KCB Paybill: 522533 | Business No: 8062104</div>
          <div style={{borderTop:'1px dashed #999',margin:'8px 0'}}/>

          {[['Receipt #',sale.receipt_no],['Date',fmtDate(sale.sale_date||sale.created_at)],
            ['Time',fmtTime(sale.created_at)],['Customer',sale.customer_name]
          ].map(([k,v])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
              <span>{k}</span><span>{v}</span>
            </div>
          ))}
          <div style={{borderTop:'1px dashed #999',margin:'8px 0'}}/>

          {items.map((item:any,i:number)=>(
            <div key={i} style={{marginBottom:6}}>
              <div style={{display:'flex',justifyContent:'space-between',fontWeight:'bold'}}>
                <span>{item.product_name}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',color:'#555',fontSize:11,paddingLeft:8}}>
                <span>{item.denomination_label || item.sale_type} × {Number(item.qty).toFixed(Number(item.qty)%1?2:0)} @ {fmt(item.unit_price)}</span>
                <span>{fmt(item.subtotal)}</span>
              </div>
              {Number(item.discount||0) > 0 && (
                <div style={{fontSize:10,paddingLeft:8,color:'#c00'}}>Discount: -{fmt(item.discount)}</div>
              )}
            </div>
          ))}

          <div style={{borderTop:'1px dashed #999',margin:'8px 0'}}/>
          {discount > 0 && (
            <div style={{display:'flex',justifyContent:'space-between',color:'#c00',fontSize:12,marginBottom:4}}>
              <span>Discount</span><span>-KES {discount.toFixed(2)}</span>
            </div>
          )}
          <div style={{display:'flex',justifyContent:'space-between',fontWeight:'bold',fontSize:15,marginBottom:6}}>
            <span>TOTAL</span><span>KES {Number(sale.total).toFixed(2)}</span>
          </div>

          {isSplit ? (
            <>
              <div style={{fontSize:11,color:'#555',marginBottom:3}}>Split payment:</div>
              {payments.map((p:any,i:number)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:2}}>
                  <span>• {p.method.toUpperCase()}{p.reference?` (${p.reference})`:''}</span>
                  <span>KES {Number(p.amount).toFixed(2)}</span>
                </div>
              ))}
            </>
          ) : (
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
              <span>Payment</span>
              <span>{payments[0]?.method?.toUpperCase()}{payments[0]?.reference?` (${payments[0].reference})`:''}</span>
            </div>
          )}

          {sale.status==='pending' && (
            <div style={{textAlign:'center',color:'#c00',fontWeight:'bold',margin:'8px 0'}}>⚠️ CREDIT — BALANCE PENDING</div>
          )}

          <div style={{borderTop:'1px dashed #999',margin:'8px 0'}}/>
          <div style={{textAlign:'center',color:'#888',fontSize:11,marginTop:12}}>
            Thank you for shopping at Gorayo Wholesalers!<br/>Please come again 🙏
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button className="btn btn-outline" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={print}>🖨️ Print Receipt</button>
        </div>
      </div>
    </div>
  )
}
