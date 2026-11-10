import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { SQL_TODAY_NAIROBI } from '@/lib/expiry'

// GET /api/products/expiring?days=30[&include_expired=1][&summary=1]
//   days            — window in days from today (1–3650, default 30)
//   include_expired — also list goods already past expiry (default 1)
//   summary=1       — counts only (used by the top-bar alert bell)
// Only products that are still in stock (qty > 0) and not deleted are counted.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const daysRaw = parseInt(searchParams.get('days') || '30', 10)
    const days = Math.min(Math.max(isNaN(daysRaw) ? 30 : daysRaw, 1), 3650)
    const includeExpired = searchParams.get('include_expired') !== '0'

    const [counts] = await query(`
      SELECT
        COUNT(*) FILTER (WHERE expiry_date < ${SQL_TODAY_NAIROBI})::int                      AS expired_count,
        COUNT(*) FILTER (WHERE expiry_date >= ${SQL_TODAY_NAIROBI}
                           AND expiry_date <= ${SQL_TODAY_NAIROBI} + 7)::int                 AS week_count,
        COUNT(*) FILTER (WHERE expiry_date >= ${SQL_TODAY_NAIROBI}
                           AND expiry_date <= ${SQL_TODAY_NAIROBI} + $1::int)::int           AS window_count,
        COALESCE(SUM(buy_price * qty) FILTER (WHERE expiry_date < ${SQL_TODAY_NAIROBI}), 0)  AS expired_value,
        COALESCE(SUM(buy_price * qty) FILTER (WHERE expiry_date >= ${SQL_TODAY_NAIROBI}
                           AND expiry_date <= ${SQL_TODAY_NAIROBI} + $1::int), 0)            AS window_value,
        COUNT(*) FILTER (WHERE expiry_date IS NULL)::int                                     AS no_expiry_count
      FROM products
      WHERE is_deleted = FALSE AND qty > 0
    `, [days])

    if (searchParams.get('summary') === '1') {
      return NextResponse.json({ data: { days, ...counts } })
    }

    const rows = await query(`
      SELECT p.id, p.name, p.category, p.supplier, p.qty, p.base_unit,
             p.ws_pack_qty, p.ws_pack_label, p.sell_mode, p.buy_price,
             TO_CHAR(p.expiry_date, 'YYYY-MM-DD')  AS expiry_str,
             (p.expiry_date - ${SQL_TODAY_NAIROBI}) AS days_to_expiry,
             (p.buy_price * p.qty)                 AS stock_value
      FROM products p
      WHERE p.is_deleted = FALSE
        AND p.qty > 0
        AND p.expiry_date IS NOT NULL
        AND p.expiry_date <= ${SQL_TODAY_NAIROBI} + $1::int
        AND ($2::boolean OR p.expiry_date >= ${SQL_TODAY_NAIROBI})
      ORDER BY p.expiry_date ASC, p.name ASC
    `, [days, includeExpired])

    return NextResponse.json({ data: { days, summary: counts, products: rows } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
