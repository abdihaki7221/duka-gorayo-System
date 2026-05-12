import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

// Types: 'opening_balance', 'owner_withdrawal', 'cash_deposit', 'adjustment'

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

    // Also compute safe balance summary
    const today = date || new Date().toISOString().split('T')[0]

    // Cash from sales today
    const [cashSales] = await query(`
      SELECT COALESCE(SUM(sp.amount), 0) as total
      FROM sale_payments sp
      JOIN sales s ON s.id = sp.sale_id
      WHERE s.sale_date = $1 AND sp.method = 'cash'
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

    // Opening balance (manual override or carried forward)
    const [opening] = await query(`
      SELECT COALESCE(SUM(CASE WHEN type='opening_balance' THEN amount ELSE 0 END), 0) as opening,
             COALESCE(SUM(CASE WHEN type='cash_deposit' THEN amount ELSE 0 END), 0) as deposits,
             COALESCE(SUM(CASE WHEN type='cash_excess' THEN amount ELSE 0 END), 0) as cash_excess,
             COALESCE(SUM(CASE WHEN type='cash_less' THEN amount ELSE 0 END), 0) as cash_less
      FROM cash_ledger WHERE ledger_date = $1
    `, [today])

    // Yesterday's safe closing (calculate from yesterday)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yd = yesterday.toISOString().split('T')[0]

    const [ydCash] = await query(`
      SELECT COALESCE(SUM(sp.amount), 0) as total
      FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
      WHERE s.sale_date = $1 AND sp.method = 'cash'
    `, [yd])

    const [ydCreditCash] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM credit_payments WHERE paid_date = $1 AND method = 'cash'
    `, [yd])

    const [ydLedger] = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN type='opening_balance' THEN amount ELSE 0 END), 0) as opening,
        COALESCE(SUM(CASE WHEN type='owner_withdrawal' THEN amount ELSE 0 END), 0) as withdrawals,
        COALESCE(SUM(CASE WHEN type='cash_deposit' THEN amount ELSE 0 END), 0) as deposits
      FROM cash_ledger WHERE ledger_date = $1
    `, [yd])

    const ydExpenses = await query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM expenses 
      WHERE expense_date = $1 AND category != 'Stock Purchase'
    `, [yd])

    const prevSafe = Number(ydLedger.opening) + Number(ydCash.total) + Number(ydCreditCash.total)
      + Number(ydLedger.deposits) - Number(ydLedger.withdrawals) - Number(ydExpenses[0]?.total || 0)

    // Today's expenses (non-stock)
    const [todayExp] = await query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM expenses
      WHERE expense_date = $1 AND category != 'Stock Purchase'
    `, [today])

    const openingBal = Number(opening.opening) > 0 ? Number(opening.opening) : prevSafe
    const safeBalance = openingBal + Number(cashSales.total) + Number(creditCash.total)
      + Number(opening.deposits) + Number(opening.cash_excess) - Number(withdrawals.total) - Number(todayExp.total) - Number(opening.cash_less)

    return NextResponse.json({
      data: {
        entries: rows,
        summary: {
          date: today,
          prev_safe_balance: prevSafe,
          opening_balance: openingBal,
          cash_sales: Number(cashSales.total),
          credit_cash_received: Number(creditCash.total),
          deposits: Number(opening.deposits),
          owner_withdrawals: Number(withdrawals.total),
          cash_expenses: Number(todayExp.total),
          cash_excess: Number(opening.cash_excess),
          cash_less: Number(opening.cash_less),
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
