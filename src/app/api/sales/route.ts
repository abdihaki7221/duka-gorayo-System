import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { genReceiptNo } from '@/lib/utils'
import pool from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date    = searchParams.get('date')   || ''
    const from    = searchParams.get('from')   || ''
    const to      = searchParams.get('to')     || ''
    const status  = searchParams.get('status') || ''
    const search  = searchParams.get('search') || ''
    const limit   = parseInt(searchParams.get('limit')  || '200')
    const offset  = parseInt(searchParams.get('offset') || '0')

    const rows = await query(`
      SELECT s.*,
        json_agg(DISTINCT jsonb_build_object(
          'id', si.id, 'product_id', si.product_id,
          'product_name', si.product_name,
          'sale_type', si.sale_type, 'qty', si.qty,
          'unit_price', si.unit_price, 'subtotal', si.subtotal,
          'profit', si.profit, 'discount', COALESCE(si.discount,0),
          'denomination_label', si.denomination_label,
          'fraction', si.fraction
        )) FILTER (WHERE si.id IS NOT NULL) AS items,
        json_agg(DISTINCT jsonb_build_object(
          'method', sp.method, 'amount', sp.amount, 'reference', sp.reference
        )) FILTER (WHERE sp.id IS NOT NULL) AS payments
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN sale_payments sp ON sp.sale_id = s.id
      WHERE ($1 = '' OR s.sale_date::text = $1)
        AND ($2 = '' OR s.status = $2)
        AND ($3 = '' OR s.customer_name ILIKE '%'||$3||'%'
             OR s.receipt_no ILIKE '%'||$3||'%')
        AND ($4 = '' OR s.sale_date >= $4::date)
        AND ($5 = '' OR s.sale_date <= $5::date)
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT $6 OFFSET $7
    `, [date, status, search, from, to, limit, offset])

    return NextResponse.json({ data: rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect()
  try {
    const body = await req.json()
    const { customer_name, payments, items, discount: saleDiscount } = body

    if (!items?.length)
      return NextResponse.json({ error: 'No items' }, { status: 400 })
    if (!payments?.length)
      return NextResponse.json({ error: 'No payment provided' }, { status: 400 })
    if (payments.length > 3)
      return NextResponse.json({ error: 'Max 3 payment splits' }, { status: 400 })

    await client.query('BEGIN')

    let totalSubtotal = 0
    let totalProfit   = 0
    let totalItemDiscount = 0
    const enriched: any[] = []

    for (const item of items) {
      const pRes = await client.query(
        'SELECT * FROM products WHERE id=$1 FOR UPDATE', [item.product_id]
      )
      const product = pRes.rows[0]
      if (!product) throw new Error(`Product ${item.product_id} not found`)

      let unitPrice: number
      let denomLabel: string | null = null
      let fraction = 1
      let denomId: number | null = null

      if (item.denomination_id) {
        const dRes = await client.query(
          'SELECT * FROM product_denominations WHERE id=$1', [item.denomination_id]
        )
        const denom = dRes.rows[0]
        if (!denom) throw new Error(`Denomination not found`)
        unitPrice  = Number(denom.sell_price)
        denomLabel = denom.label
        fraction   = Number(denom.fraction)
        denomId    = denom.id
        const baseUnitsUsed = fraction * Number(item.qty)
        if (Number(product.qty) < baseUnitsUsed)
          throw new Error(`Insufficient stock for ${product.name}. Need ${baseUnitsUsed} ${product.base_unit}, have ${product.qty}`)
      } else if (item.sale_type === 'wholesale') {
        unitPrice = Number(product.ws_price)
        const baseUnitsUsed = Number(product.ws_pack_qty) * Number(item.qty)
        if (Number(product.qty) < baseUnitsUsed)
          throw new Error(`Insufficient stock for ${product.name}`)
        fraction = Number(product.ws_pack_qty)
        denomLabel = `${product.ws_pack_label}`
      } else {
        unitPrice = Number(product.retail_price)
        if (Number(product.qty) < Number(item.qty))
          throw new Error(`Insufficient stock for ${product.name}`)
      }

      const itemDiscount = Number(item.discount || 0)
      const grossSubtotal = unitPrice * Number(item.qty)
      const subtotal = grossSubtotal - itemDiscount

      // Profit calculation:
      // - Wholesale: use ws_buy_price (wholesale buying price per pack)
      // - Retail/denomination: use buy_price * fraction (cost per base unit * fraction)
      let costForThisItem: number
      if (item.sale_type === 'wholesale' && !item.denomination_id) {
        // Wholesale: profit = sell_price - ws_buy_price per pack
        const wsBuyCost = Number(product.ws_buy_price || 0) || (Number(product.buy_price) * Number(product.ws_pack_qty))
        costForThisItem = wsBuyCost * Number(item.qty)
      } else {
        // Retail: profit = sell_price - (buy_price_per_unit * fraction)
        costForThisItem = Number(product.buy_price) * fraction * Number(item.qty)
      }
      const profit = Math.round((subtotal - costForThisItem) * 100) / 100

      totalSubtotal += grossSubtotal
      totalProfit   += profit
      totalItemDiscount += itemDiscount

      enriched.push({
        product_id: product.id,
        product_name: product.name,
        sale_type: item.denomination_id ? 'retail_denom' : item.sale_type || 'retail',
        qty: item.qty,
        unit_price: unitPrice,
        buy_price: product.buy_price,
        subtotal, profit,
        discount: itemDiscount,
        denomination_id: denomId,
        denomination_label: denomLabel,
        fraction,
      })
    }

    const totalDiscount = Number(saleDiscount || 0) + totalItemDiscount
    const finalTotal = totalSubtotal - totalDiscount
    const finalProfit = totalProfit - Number(saleDiscount || 0)

    const payTotal = payments.reduce((a: number, p: any) => a + Number(p.amount), 0)
    if (Math.abs(payTotal - finalTotal) > 0.5)
      throw new Error(`Payment total (${payTotal.toFixed(2)}) must equal sale total (${finalTotal.toFixed(2)})`)

    const hasCredit = payments.some((p: any) => p.method === 'credit')
    const status = hasCredit ? 'pending' : 'paid'
    const primaryMethod = [...payments].sort((a: any, b: any) => b.amount - a.amount)[0].method
    const isSplit = payments.length > 1

    const receiptNo = genReceiptNo()
    const saleRes = await client.query(`
      INSERT INTO sales (
        receipt_no, customer_name, payment_method, subtotal, discount, total, profit,
        status, is_split_payment
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [receiptNo, customer_name||'Walk-in', primaryMethod,
        totalSubtotal, totalDiscount, finalTotal, finalProfit, status, isSplit])
    const sale = saleRes.rows[0]

    for (const p of payments) {
      await client.query(
        `INSERT INTO sale_payments (sale_id, method, amount, reference) VALUES ($1,$2,$3,$4)`,
        [sale.id, p.method, Number(p.amount), p.reference||null]
      )
    }

    for (const ei of enriched) {
      await client.query(`
        INSERT INTO sale_items (
          sale_id, product_id, product_name, sale_type, qty,
          unit_price, buy_price, subtotal, profit, discount,
          denomination_id, denomination_label, fraction
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `, [sale.id, ei.product_id, ei.product_name, ei.sale_type, ei.qty,
          ei.unit_price, ei.buy_price, ei.subtotal, ei.profit, ei.discount,
          ei.denomination_id, ei.denomination_label, ei.fraction])

      const baseDeduct = ei.fraction * Number(ei.qty)
      await client.query(
        'UPDATE products SET qty = qty - $1, updated_at=NOW() WHERE id=$2',
        [baseDeduct, ei.product_id]
      )
      await client.query(
        `INSERT INTO stock_movements (product_id, type, qty, note) VALUES ($1,'out',$2,$3)`,
        [ei.product_id, baseDeduct, `Sale ${receiptNo}`]
      )
    }

    await client.query('COMMIT')

    const fullSale = await queryOne(`
      SELECT s.*,
        json_agg(DISTINCT jsonb_build_object(
          'id', si.id, 'product_name', si.product_name, 'sale_type', si.sale_type,
          'qty', si.qty, 'unit_price', si.unit_price, 'subtotal', si.subtotal,
          'profit', si.profit, 'discount', COALESCE(si.discount,0),
          'denomination_label', si.denomination_label
        )) FILTER (WHERE si.id IS NOT NULL) AS items,
        json_agg(DISTINCT jsonb_build_object(
          'method', sp.method, 'amount', sp.amount, 'reference', sp.reference
        )) FILTER (WHERE sp.id IS NOT NULL) AS payments
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN sale_payments sp ON sp.sale_id = s.id
      WHERE s.id=$1 GROUP BY s.id
    `, [sale.id])

    return NextResponse.json({ data: fullSale }, { status: 201 })
  } catch (e: any) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: e.message }, { status: 500 })
  } finally {
    client.release()
  }
}
