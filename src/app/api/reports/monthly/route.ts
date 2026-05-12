import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7)
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''

    // Use date range if provided, otherwise month
    const dateFilter = from && to
      ? `s.sale_date BETWEEN '${from}'::date AND '${to}'::date`
      : `TO_CHAR(s.sale_date,'YYYY-MM') = '${month}'`

    const expDateFilter = from && to
      ? `expense_date BETWEEN '${from}'::date AND '${to}'::date`
      : `TO_CHAR(expense_date,'YYYY-MM') = '${month}'`

    const creditDateFilter = from && to
      ? `paid_date BETWEEN '${from}'::date AND '${to}'::date`
      : `TO_CHAR(paid_date,'YYYY-MM') = '${month}'`

    const ledgerDateFilter = from && to
      ? `ledger_date BETWEEN '${from}'::date AND '${to}'::date`
      : `TO_CHAR(ledger_date,'YYYY-MM') = '${month}'`

    const [salesSummary] = await query(`
      SELECT COUNT(DISTINCT s.id) AS tx_count,
        COALESCE(SUM(s.total), 0) AS total_sales,
        COALESCE(SUM(s.profit), 0) AS total_profit,
        COALESCE(SUM(s.discount), 0) AS total_discount
      FROM sales s WHERE ${dateFilter}
    `)

    const [payBreakdown] = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN sp.method='cash' THEN sp.amount ELSE 0 END), 0) AS cash_sales,
        COALESCE(SUM(CASE WHEN sp.method='mpesa' THEN sp.amount ELSE 0 END), 0) AS mpesa_sales,
        COALESCE(SUM(CASE WHEN sp.method='kcb' THEN sp.amount ELSE 0 END), 0) AS kcb_sales,
        COALESCE(SUM(CASE WHEN sp.method='credit' THEN sp.amount ELSE 0 END), 0) AS credit_sales
      FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
      WHERE ${dateFilter}
    `)

    const [expenseSummary] = await query(`
      SELECT
        COALESCE(SUM(amount), 0) AS total_expenses,
        COALESCE(SUM(CASE WHEN category='Stock Purchase' THEN amount ELSE 0 END), 0) AS stock_expenses,
        COALESCE(SUM(CASE WHEN category='Transport' THEN amount ELSE 0 END), 0) AS transport_expenses,
        COALESCE(SUM(CASE WHEN category NOT IN ('Stock Purchase','Transport') THEN amount ELSE 0 END), 0) AS other_expenses
      FROM expenses WHERE ${expDateFilter}
    `)

    const dailyBreakdown = await query(`
      SELECT sale_date::text AS date,
        COALESCE(SUM(total), 0) AS sales,
        COALESCE(SUM(profit), 0) AS profit,
        COUNT(*) AS tx_count
      FROM sales WHERE ${dateFilter.replace(/^s\./, '')}
      GROUP BY sale_date ORDER BY sale_date
    `)

    const topProducts = await query(`
      SELECT si.product_name,
        SUM(si.qty) AS qty_sold,
        SUM(si.subtotal) AS revenue,
        SUM(si.profit) AS profit
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE ${dateFilter}
      GROUP BY si.product_name ORDER BY revenue DESC LIMIT 10
    `)

    // Credit summary
    const [creditSummary] = await query(`
      SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS amount
      FROM sales WHERE status='pending' AND ${dateFilter.replace(/^s\./, '')}
    `)

    // All outstanding credits (regardless of date)
    const allCredits = await query(`
      SELECT s.id, s.receipt_no, s.customer_name, s.total, s.sale_date,
        COALESCE((SELECT SUM(cp.amount) FROM credit_payments cp WHERE cp.sale_id = s.id), 0) as paid_amount
      FROM sales s WHERE s.status = 'pending'
      ORDER BY s.sale_date DESC
    `)

    // Credit payments received
    const [creditPaymentsSum] = await query(`
      SELECT COALESCE(SUM(amount), 0) AS total,
        COALESCE(SUM(CASE WHEN method='cash' THEN amount ELSE 0 END), 0) AS cash,
        COALESCE(SUM(CASE WHEN method='mpesa' THEN amount ELSE 0 END), 0) AS mpesa,
        COALESCE(SUM(CASE WHEN method='kcb' THEN amount ELSE 0 END), 0) AS kcb
      FROM credit_payments WHERE ${creditDateFilter}
    `)

    // Owner withdrawals
    const [ownerWithdrawals] = await query(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM cash_ledger WHERE type='owner_withdrawal' AND ${ledgerDateFilter}
    `)

    return NextResponse.json({
      data: {
        month,
        from, to,
        sales: { ...salesSummary, ...payBreakdown },
        expenses: expenseSummary,
        net_profit: Number(salesSummary.total_profit) - Number(expenseSummary.total_expenses),
        daily_breakdown: dailyBreakdown,
        top_products: topProducts,
        credit: creditSummary,
        all_credits: allCredits,
        credit_payments_received: creditPaymentsSum,
        owner_withdrawals: Number(ownerWithdrawals.total),
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
