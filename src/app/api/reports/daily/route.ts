import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

    const prev = new Date(date)
    prev.setDate(prev.getDate() - 1)
    const prevStr = prev.toISOString().split('T')[0]

    // Sales totals (exclude manual debts - they are pre-existing debts, not actual sales)
    const [salesSummary] = await query(`
      SELECT
        COUNT(DISTINCT s.id) AS tx_count,
        COALESCE(SUM(s.total), 0) AS total_sales,
        COALESCE(SUM(s.profit), 0) AS total_profit,
        COALESCE(SUM(s.discount), 0) AS total_discount,
        COALESCE(SUM(CASE WHEN s.status='pending' THEN s.total ELSE 0 END), 0) AS pending_amount
      FROM sales s WHERE s.sale_date = $1 AND s.is_manual_debt = FALSE
    `, [date])

    // Payment breakdown (exclude manual debts)
    const [payBreakdown] = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN sp.method='cash'   THEN sp.amount ELSE 0 END), 0) AS cash_sales,
        COALESCE(SUM(CASE WHEN sp.method='mpesa'  THEN sp.amount ELSE 0 END), 0) AS mpesa_sales,
        COALESCE(SUM(CASE WHEN sp.method='kcb'    THEN sp.amount ELSE 0 END), 0) AS kcb_sales,
        COALESCE(SUM(CASE WHEN sp.method='credit' THEN sp.amount ELSE 0 END), 0) AS credit_sales
      FROM sale_payments sp
      JOIN sales s ON s.id = sp.sale_id
      WHERE s.sale_date = $1 AND s.is_manual_debt = FALSE
    `, [date])

    // Expenses
    const [expenseSummary] = await query(`
      SELECT
        COALESCE(SUM(amount), 0) AS total_expenses,
        COALESCE(SUM(CASE WHEN category IN ('Stock Purchase','Stock Payment') THEN amount ELSE 0 END), 0) AS stock_expenses,
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

    // Opening balance: find last manual opening_balance anchor, then sum movements since
    const anchor = await queryOne(`
      SELECT amount, ledger_date::text as anchor_date
      FROM cash_ledger
      WHERE type = 'opening_balance' AND ledger_date <= $1
      ORDER BY ledger_date DESC, created_at DESC LIMIT 1
    `, [date])

    const anchorAmount = anchor ? Number(anchor.amount) : 0
    const anchorDate = anchor ? anchor.anchor_date : '1970-01-01'

    const [prevCashSales] = await query(`
      SELECT COALESCE(SUM(sp.amount), 0) AS total
      FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
      WHERE s.sale_date >= $1 AND s.sale_date < $2 AND sp.method = 'cash' AND s.is_manual_debt = FALSE
    `, [anchorDate, date])

    const [prevCreditCash] = await query(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM credit_payments WHERE paid_date >= $1 AND paid_date < $2 AND method = 'cash'
    `, [anchorDate, date])

    const [prevLedger] = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN type='owner_withdrawal' THEN amount ELSE 0 END), 0) AS withdrawals,
        COALESCE(SUM(CASE WHEN type='cash_deposit' THEN amount ELSE 0 END), 0) AS deposits,
        COALESCE(SUM(CASE WHEN type='cash_excess' THEN amount ELSE 0 END), 0) AS cash_excess,
        COALESCE(SUM(CASE WHEN type='cash_less' THEN amount ELSE 0 END), 0) AS cash_less,
        COALESCE(SUM(CASE WHEN type='cash_receipt' THEN amount ELSE 0 END), 0) AS cash_receipts
      FROM cash_ledger WHERE ledger_date >= $1 AND ledger_date < $2 AND type != 'opening_balance'
    `, [anchorDate, date])

    const [prevExpCash] = await query(`
      SELECT COALESCE(SUM(cash_amount), 0) AS total FROM expenses
      WHERE expense_date >= $1 AND expense_date < $2
    `, [anchorDate, date])

    const prevSafe = anchorAmount + Number(prevCashSales.total) +
      Number(prevCreditCash.total) + Number(prevLedger.deposits) +
      Number(prevLedger.cash_excess) + Number(prevLedger.cash_receipts) -
      Number(prevLedger.withdrawals) - Number(prevExpCash.total) -
      Number(prevLedger.cash_less)

    // Today's safe — matching cash-ledger module calculation exactly
    const openingBal = Number(cashLedger.opening_set) > 0 ? Number(cashLedger.opening_set) : Math.max(0, prevSafe)

    // Today's ledger: get all types including cash_receipt, cash_excess, cash_less
    const [todayLedgerFull] = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN type='cash_deposit' THEN amount ELSE 0 END), 0) AS deposits,
        COALESCE(SUM(CASE WHEN type='cash_excess' THEN amount ELSE 0 END), 0) AS cash_excess,
        COALESCE(SUM(CASE WHEN type='cash_less' THEN amount ELSE 0 END), 0) AS cash_less,
        COALESCE(SUM(CASE WHEN type='cash_receipt' THEN amount ELSE 0 END), 0) AS cash_receipts
      FROM cash_ledger WHERE ledger_date = $1
    `, [date])

    // Today's expenses — only cash portion affects the safe
    const [todayExpCash] = await query(`
      SELECT COALESCE(SUM(cash_amount), 0) AS total FROM expenses
      WHERE expense_date = $1
    `, [date])

    const safeBalance = openingBal + Number(payBreakdown.cash_sales) +
      Number(creditPayments.cash_received) +
      Number(todayLedgerFull.deposits) +
      Number(todayLedgerFull.cash_excess) +
      Number(todayLedgerFull.cash_receipts) -
      Number(cashLedger.owner_withdrawals) -
      Number(todayExpCash.total) -
      Number(todayLedgerFull.cash_less)

    // 7-day trend
    const trend = await query(`
      SELECT s.sale_date::text AS date,
        COALESCE(SUM(s.total), 0) AS sales,
        COALESCE(SUM(s.profit), 0) AS profit
      FROM sales s
      WHERE s.sale_date BETWEEN ($1::date - interval '6 days') AND $1::date
      GROUP BY s.sale_date ORDER BY s.sale_date
    `, [date])

    // Top products (exclude manual debts)
    const topProducts = await query(`
      SELECT si.product_name,
        SUM(si.qty) AS qty_sold,
        SUM(si.subtotal) AS revenue,
        SUM(si.profit) AS profit
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.sale_date = $1 AND s.is_manual_debt = FALSE
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
          deposits: Number(todayLedgerFull.deposits),
          cash_receipts: Number(todayLedgerFull.cash_receipts),
          owner_withdrawals: Number(cashLedger.owner_withdrawals),
          cash_expenses: Number(todayExpCash.total),
          cash_excess: Number(todayLedgerFull.cash_excess),
          cash_less: Number(todayLedgerFull.cash_less),
          safe_balance: safeBalance,
        },
        credit_payments_today: creditPayments,
        mpesa_total: Number(payBreakdown.mpesa_sales) + Number(creditPayments.mpesa_received),
        kcb_total: Number(payBreakdown.kcb_sales) + Number(creditPayments.kcb_received),
        // Net profit: gross profit minus operational expenses only (stock purchases are inventory, not expense)
        net_profit: Number(salesSummary.total_profit) - (Number(expenseSummary.total_expenses) - Number(expenseSummary.stock_expenses)),
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
