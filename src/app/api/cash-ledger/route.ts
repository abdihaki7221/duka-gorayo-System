import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

/**
 * Opening balance logic:
 * 
 * Today's opening = last known safe balance (the closing balance of the most
 * recent day before today). If shop was closed for 3 days, it carries forward.
 * 
 * To compute this without recursion:
 * 1. Find the most recent manual opening_balance entry before today (the "anchor")
 * 2. Sum all cash movements from that anchor date through yesterday
 * 3. opening = anchor_amount + all net movements since that anchor date
 * 
 * If no anchor exists, start from 0.
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || ''
    const month = searchParams.get('month') || ''

    const rows = await query(`
      SELECT * FROM cash_ledger
      WHERE ($1 = '' OR ledger_date::text = $1)
        AND ($2 = '' OR TO_CHAR(ledger_date, 'YYYY-MM') = $2)
      ORDER BY ledger_date DESC, created_at DESC
    `, [date, month])

    const today = date || new Date().toISOString().split('T')[0]

    // ===================================================================
    // STEP 1: Find the most recent manual opening_balance before today
    // This is the anchor point — a known starting balance
    // ===================================================================
    const anchor = await queryOne(`
      SELECT amount, ledger_date::text as anchor_date
      FROM cash_ledger
      WHERE type = 'opening_balance' AND ledger_date <= $1
      ORDER BY ledger_date DESC, created_at DESC
      LIMIT 1
    `, [today])

    const anchorAmount = anchor ? Number(anchor.amount) : 0
    const anchorDate = anchor ? anchor.anchor_date : '1970-01-01'

    // ===================================================================
    // STEP 2: Sum all cash movements AFTER the anchor date, up to yesterday
    // These are the net changes since the last known opening was set
    // ===================================================================

    // Cash sales after anchor, before today
    const [movCashSales] = await query(`
      SELECT COALESCE(SUM(sp.amount), 0) as total
      FROM sale_payments sp
      JOIN sales s ON s.id = sp.sale_id
      WHERE s.sale_date >= $1 AND s.sale_date < $2
        AND sp.method = 'cash' AND s.is_manual_debt = FALSE
    `, [anchorDate, today])

    // Credit cash payments after anchor, before today
    const [movCreditCash] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM credit_payments
      WHERE paid_date >= $1 AND paid_date < $2 AND method = 'cash'
    `, [anchorDate, today])

    // Ledger movements after anchor, before today (excluding opening_balance entries)
    const [movLedger] = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN type='owner_withdrawal' THEN amount ELSE 0 END), 0) as withdrawals,
        COALESCE(SUM(CASE WHEN type='cash_deposit' THEN amount ELSE 0 END), 0) as deposits,
        COALESCE(SUM(CASE WHEN type='cash_excess' THEN amount ELSE 0 END), 0) as cash_excess,
        COALESCE(SUM(CASE WHEN type='cash_less' THEN amount ELSE 0 END), 0) as cash_less
      FROM cash_ledger
      WHERE ledger_date >= $1 AND ledger_date < $2
        AND type != 'opening_balance'
    `, [anchorDate, today])

    // Expenses after anchor, before today
    const [movExpenses] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM expenses
      WHERE expense_date >= $1 AND expense_date < $2
        AND category != 'Stock Purchase'
    `, [anchorDate, today])

    // The safe balance as of end of yesterday = today's opening
    const prevSafe = anchorAmount
      + Number(movCashSales.total)
      + Number(movCreditCash.total)
      + Number(movLedger.deposits)
      + Number(movLedger.cash_excess)
      - Number(movLedger.withdrawals)
      - Number(movExpenses.total)
      - Number(movLedger.cash_less)

    // ===================================================================
    // STEP 3: Today's data (same day only)
    // ===================================================================

    // Check if there's a manual opening_balance override for TODAY specifically
    const [todayLedger] = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN type='opening_balance' THEN amount ELSE 0 END), 0) as opening,
        COALESCE(SUM(CASE WHEN type='cash_deposit' THEN amount ELSE 0 END), 0) as deposits,
        COALESCE(SUM(CASE WHEN type='cash_excess' THEN amount ELSE 0 END), 0) as cash_excess,
        COALESCE(SUM(CASE WHEN type='cash_less' THEN amount ELSE 0 END), 0) as cash_less
      FROM cash_ledger WHERE ledger_date = $1
    `, [today])

    // If admin manually set today's opening, use that; otherwise use computed prevSafe
    const hasManualOpening = Number(todayLedger.opening) > 0
    const openingBal = hasManualOpening ? Number(todayLedger.opening) : prevSafe

    // Cash from sales today
    const [cashSales] = await query(`
      SELECT COALESCE(SUM(sp.amount), 0) as total
      FROM sale_payments sp
      JOIN sales s ON s.id = sp.sale_id
      WHERE s.sale_date = $1 AND sp.method = 'cash' AND s.is_manual_debt = FALSE
    `, [today])

    // Cash from credit clearance today
    const [creditCash] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM credit_payments
      WHERE paid_date = $1 AND method = 'cash'
    `, [today])

    // Withdrawals today
    const [withdrawals] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM cash_ledger
      WHERE ledger_date = $1 AND type = 'owner_withdrawal'
    `, [today])

    // Today's expenses (non-stock)
    const [todayExp] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM expenses
      WHERE expense_date = $1 AND category != 'Stock Purchase'
    `, [today])

    // Safe balance = opening + today's cash in - today's cash out
    const safeBalance = openingBal
      + Number(cashSales.total)
      + Number(creditCash.total)
      + Number(todayLedger.deposits)
      + Number(todayLedger.cash_excess)
      - Number(withdrawals.total)
      - Number(todayExp.total)
      - Number(todayLedger.cash_less)

    return NextResponse.json({
      data: {
        entries: rows,
        summary: {
          date: today,
          prev_safe_balance: prevSafe,
          opening_balance: openingBal,
          cash_sales: Number(cashSales.total),
          credit_cash_received: Number(creditCash.total),
          deposits: Number(todayLedger.deposits),
          owner_withdrawals: Number(withdrawals.total),
          cash_expenses: Number(todayExp.total),
          cash_excess: Number(todayLedger.cash_excess),
          cash_less: Number(todayLedger.cash_less),
          safe_balance: safeBalance,
        }
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { type, amount, description, ledger_date } = await req.json()

    if (!type || !amount) {
      return NextResponse.json({ error: 'type and amount required' }, { status: 400 })
    }

    const row = await queryOne(`
      INSERT INTO cash_ledger (type, amount, description, ledger_date)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [type, Number(amount), description || '', ledger_date || new Date().toISOString().split('T')[0]])

    return NextResponse.json({ data: row }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
