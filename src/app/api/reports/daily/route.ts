import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

    const prev = new Date(date)
    prev.setDate(prev.getDate() - 1)
    const prevStr = prev.toISOString().split('T')[0]

    // Sales totals
    const [salesSummary] = await query(`
      SELECT
        COUNT(DISTINCT s.id) AS tx_count,
        COALESCE(SUM(s.total), 0) AS total_sales,
        COALESCE(SUM(s.profit), 0) AS total_profit,
        COALESCE(SUM(s.discount), 0) AS total_discount,
        COALESCE(SUM(CASE WHEN s.status='pending' THEN s.total ELSE 0 END), 0) AS pending_amount
      FROM sales s WHERE s.sale_date = $1
    `, [date])

    // Payment breakdown
    const [payBreakdown] = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN sp.method='cash'   THEN sp.amount ELSE 0 END), 0) AS cash_sales,
        COALESCE(SUM(CASE WHEN sp.method='mpesa'  THEN sp.amount ELSE 0 END), 0) AS mpesa_sales,
        COALESCE(SUM(CASE WHEN sp.method='kcb'    THEN sp.amount ELSE 0 END), 0) AS kcb_sales,
        COALESCE(SUM(CASE WHEN sp.method='credit' THEN sp.amount ELSE 0 END), 0) AS credit_sales
      FROM sale_payments sp
      JOIN sales s ON s.id = sp.sale_id
      WHERE s.sale_date = $1
    `, [date])

    // Expenses
    const [expenseSummary] = await query(`
      SELECT
        COALESCE(SUM(amount), 0) AS total_expenses,
        COALESCE(SUM(CASE WHEN category='Stock Purchase' THEN amount ELSE 0 END), 0) AS stock_expenses,
        COALESCE(SUM(CASE WHEN category='Transport' THEN amount ELSE 0 END), 0) AS transport_expenses,
        COALESCE(SUM(CASE WHEN category='Employee Salary' THEN amount ELSE 0 END), 0) AS salary_expenses,
        COALESCE(SUM(CASE WHEN category NOT IN ('Stock Purchase','Transport','Employee Salary') THEN amount ELSE 0 END), 0) AS other_expenses,
        COALESCE(SUM(CASE WHEN payment_method='cash' THEN amount ELSE 0 END), 0) AS cash_expenses,
        COALESCE(SUM(CASE WHEN payment_method='mpesa' THEN amount ELSE 0 END), 0) AS mpesa_expenses,
        COALESCE(SUM(CASE WHEN payment_method='kcb' THEN amount ELSE 0 END), 0) AS kcb_expenses
      FROM expenses WHERE expense_date = $1
    `, [date])

    // Cash ledger - owner withdrawals today
    const [cashLedger] = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN type='owner_withdrawal' THEN amount ELSE 0 END), 0) AS owner_withdrawals,
        COALESCE(SUM(CASE WHEN type='opening_balance' THEN amount ELSE 0 END), 0) AS opening_set,
        COALESCE(SUM(CASE WHEN type='cash_deposit' THEN amount ELSE 0 END), 0) AS deposits
      FROM cash_ledger WHERE ledger_date = $1
    `, [date])

    // Credit payments received today (debt clearance)
    const [creditPayments] = await query(`
      SELECT
        COALESCE(SUM(amount), 0) AS total,
        COALESCE(SUM(CASE WHEN method='cash' THEN amount ELSE 0 END), 0) AS cash_received,
        COALESCE(SUM(CASE WHEN method='mpesa' THEN amount ELSE 0 END), 0) AS mpesa_received,
        COALESCE(SUM(CASE WHEN method='kcb' THEN amount ELSE 0 END), 0) AS kcb_received
      FROM credit_payments WHERE paid_date = $1
    `, [date])

    // Previous day safe balance calculation
    const [prevCashSales] = await query(`
      SELECT COALESCE(SUM(sp.amount), 0) AS total
      FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
      WHERE s.sale_date = $1 AND sp.method = 'cash'
    `, [prevStr])

    const [prevCreditCash] = await query(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM credit_payments WHERE paid_date = $1 AND method = 'cash'
    `, [prevStr])

    const [prevLedger] = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN type='opening_balance' THEN amount ELSE 0 END), 0) AS opening,
        COALESCE(SUM(CASE WHEN type='owner_withdrawal' THEN amount ELSE 0 END), 0) AS withdrawals,
        COALESCE(SUM(CASE WHEN type='cash_deposit' THEN amount ELSE 0 END), 0) AS deposits
      FROM cash_ledger WHERE ledger_date = $1
    `, [prevStr])

    const [prevExpCash] = await query(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
      WHERE expense_date = $1 AND payment_method = 'cash'
    `, [prevStr])

    const prevSafe = Number(prevLedger.opening) + Number(prevCashSales.total) +
      Number(prevCreditCash.total) + Number(prevLedger.deposits) -
      Number(prevLedger.withdrawals) - Number(prevExpCash.total)

    // Today's safe
    const openingBal = Number(cashLedger.opening_set) > 0 ? Number(cashLedger.opening_set) : Math.max(0, prevSafe)
    const [todayExpCash] = await query(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
      WHERE expense_date = $1 AND payment_method = 'cash'
    `, [date])

    const safeBalance = openingBal + Number(payBreakdown.cash_sales) +
      Number(creditPayments.cash_received) + Number(cashLedger.deposits) -
      Number(cashLedger.owner_withdrawals) - Number(todayExpCash.total)

    // 7-day trend
    const trend = await query(`
      SELECT s.sale_date::text AS date,
        COALESCE(SUM(s.total), 0) AS sales,
        COALESCE(SUM(s.profit), 0) AS profit
      FROM sales s
      WHERE s.sale_date BETWEEN ($1::date - interval '6 days') AND $1::date
      GROUP BY s.sale_date ORDER BY s.sale_date
    `, [date])

    // Top products
    const topProducts = await query(`
      SELECT si.product_name,
        SUM(si.qty) AS qty_sold,
        SUM(si.subtotal) AS revenue,
        SUM(si.profit) AS profit
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.sale_date = $1
      GROUP BY si.product_name ORDER BY revenue DESC LIMIT 5
    `, [date])

    // Today's sales list
    const todaySales = await query(`
      SELECT s.*,
        json_agg(DISTINCT jsonb_build_object(
          'product_name', si.product_name, 'denomination_label', si.denomination_label,
          'sale_type', si.sale_type, 'qty', si.qty,
          'unit_price', si.unit_price, 'subtotal', si.subtotal, 'profit', si.profit,
          'discount', COALESCE(si.discount,0)
        )) FILTER (WHERE si.id IS NOT NULL) AS items,
        json_agg(DISTINCT jsonb_build_object(
          'method', sp.method, 'amount', sp.amount
        )) FILTER (WHERE sp.id IS NOT NULL) AS payments
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN sale_payments sp ON sp.sale_id = s.id
      WHERE s.sale_date = $1
      GROUP BY s.id ORDER BY s.created_at DESC
    `, [date])

    // Stock purchased today
    const stockPurchased = await query(`
      SELECT sm.*, p.name as product_name, p.base_unit
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      WHERE sm.type = 'in' AND sm.created_at::date = $1::date
      ORDER BY sm.created_at DESC
    `, [date])

    return NextResponse.json({
      data: {
        date,
        sales: { ...salesSummary, ...payBreakdown },
        expenses: expenseSummary,
        cash: {
          prev_safe_balance: prevSafe,
          opening_balance: openingBal,
          cash_sales: Number(payBreakdown.cash_sales),
          credit_cash_received: Number(creditPayments.cash_received),
          deposits: Number(cashLedger.deposits),
          owner_withdrawals: Number(cashLedger.owner_withdrawals),
          cash_expenses: Number(todayExpCash.total),
          safe_balance: safeBalance,
        },
        credit_payments_today: creditPayments,
        mpesa_total: Number(payBreakdown.mpesa_sales) + Number(creditPayments.mpesa_received),
        kcb_total: Number(payBreakdown.kcb_sales) + Number(creditPayments.kcb_received),
        net_profit: Number(salesSummary.total_profit) - Number(expenseSummary.total_expenses),
        trend,
        top_products: topProducts,
        today_sales: todaySales,
        stock_purchased: stockPurchased,
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
