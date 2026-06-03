import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    // Get all active products with current stock and sales data from last 30 days
    const products = await query(`
      SELECT
        p.id, p.name, p.category, p.supplier, p.qty, p.base_unit,
        p.buy_price, p.ws_price, p.low_stock_threshold,
        p.ws_pack_qty, p.ws_pack_label,
        COALESCE(sales_30d.total_qty, 0) AS sold_30d,
        COALESCE(sales_30d.total_profit, 0) AS profit_30d,
        COALESCE(sales_30d.sale_days, 0) AS sale_days_30d,
        COALESCE(stockouts.out_count, 0) AS stockout_events
      FROM products p
      LEFT JOIN (
        SELECT si.product_id,
          SUM(si.qty) AS total_qty,
          SUM(si.profit) AS total_profit,
          COUNT(DISTINCT s.sale_date) AS sale_days
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.sale_date >= CURRENT_DATE - 30
          AND s.is_manual_debt = FALSE
          AND s.is_refund = FALSE
        GROUP BY si.product_id
      ) sales_30d ON sales_30d.product_id = p.id
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS out_count
        FROM stock_movements
        WHERE type = 'sale' AND created_at >= NOW() - INTERVAL '60 days'
        GROUP BY product_id
        HAVING MIN(qty) <= 0
      ) stockouts ON stockouts.product_id = p.id
      WHERE p.is_deleted = FALSE
      ORDER BY COALESCE(sales_30d.total_profit, 0) DESC
    `)

    // Build recommendations
    const recommendations = products
      .map((p: any) => {
        const qty = Number(p.qty)
        const sold30d = Number(p.sold_30d)
        const profit30d = Number(p.profit_30d)
        const threshold = Number(p.low_stock_threshold)
        const dailyRate = sold30d / 30
        const daysLeft = dailyRate > 0 ? Math.floor(qty / dailyRate) : (qty > 0 ? 999 : 0)
        const packQty = Number(p.ws_pack_qty) || 1

        // Determine urgency
        let urgency: 'critical' | 'high' | 'medium' | 'low' | 'none' = 'none'
        if (qty === 0 && sold30d > 0) urgency = 'critical'
        else if (daysLeft <= 3 && sold30d > 0) urgency = 'critical'
        else if (qty <= threshold && sold30d > 0) urgency = 'high'
        else if (daysLeft <= 7 && sold30d > 0) urgency = 'medium'
        else if (daysLeft <= 14 && sold30d > 0) urgency = 'low'

        if (urgency === 'none') return null

        // Recommend quantity: enough for ~14 days, rounded to nearest pack
        const targetDays = 14
        const unitsNeeded = Math.max(0, Math.ceil(dailyRate * targetDays) - qty)
        const packsToOrder = Math.max(1, Math.ceil(unitsNeeded / packQty))
        const orderQty = packsToOrder * packQty

        return {
          id: p.id,
          name: p.name,
          category: p.category,
          supplier: p.supplier,
          current_qty: qty,
          base_unit: p.base_unit,
          daily_rate: Math.round(dailyRate * 100) / 100,
          days_left: daysLeft,
          sold_30d: sold30d,
          profit_30d: Math.round(profit30d),
          stockout_events: Number(p.stockout_events),
          urgency,
          recommended_order_qty: orderQty,
          recommended_packs: packsToOrder,
          pack_label: p.ws_pack_label || 'pack',
          estimated_cost: Math.round(packsToOrder * Number(p.buy_price) * packQty),
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 }
        const ua = urgencyOrder[a.urgency as keyof typeof urgencyOrder]
        const ub = urgencyOrder[b.urgency as keyof typeof urgencyOrder]
        if (ua !== ub) return ua - ub
        return b.profit_30d - a.profit_30d
      })

    return NextResponse.json({ data: recommendations })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
