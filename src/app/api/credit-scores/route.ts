import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    // Get all customers who have ever had credit
    const customers = await query(`
      SELECT
        s.customer_name,
        COUNT(DISTINCT s.id) AS total_credit_sales,
        SUM(s.total) AS total_debt_amount,
        COUNT(DISTINCT CASE WHEN s.status = 'pending' THEN s.id END) AS pending_debts,
        COALESCE(SUM(CASE WHEN s.status = 'pending' THEN s.total ELSE 0 END), 0) AS pending_amount,
        COUNT(DISTINCT CASE WHEN s.status = 'paid' THEN s.id END) AS cleared_debts,
        MIN(s.sale_date) AS first_credit_date,
        MAX(s.sale_date) AS latest_credit_date
      FROM sales s
      WHERE (s.status = 'pending' OR
             (s.status = 'paid' AND EXISTS (
               SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id AND sp.method = 'credit'
             )) OR
             (s.status = 'paid' AND EXISTS (
               SELECT 1 FROM credit_payments cp WHERE cp.sale_id = s.id
             )))
      GROUP BY s.customer_name
      ORDER BY pending_amount DESC
    `)

    // Get credit payment history per customer
    const paymentHistory = await query(`
      SELECT
        s.customer_name,
        cp.amount,
        cp.method,
        cp.paid_date,
        s.sale_date AS debt_date,
        s.total AS debt_total,
        (cp.paid_date - s.sale_date) AS days_to_pay
      FROM credit_payments cp
      JOIN sales s ON s.id = cp.sale_id
      WHERE cp.method != 'adjustment'
      ORDER BY s.customer_name, cp.paid_date DESC
    `)

    // Get pending debt details (for age calculation)
    const pendingDebts = await query(`
      SELECT
        s.customer_name,
        s.id,
        s.total,
        s.sale_date,
        (CURRENT_DATE - s.sale_date) AS debt_age_days,
        COALESCE((SELECT SUM(cp.amount) FROM credit_payments cp WHERE cp.sale_id = s.id AND cp.method != 'adjustment'), 0) AS paid_so_far
      FROM sales s
      WHERE s.status = 'pending'
      ORDER BY s.customer_name, s.sale_date
    `)

    // Get shop's average daily cash sales for safe credit limit recommendation
    const [shopCashFlow] = await query(`
      SELECT
        COALESCE(AVG(daily_cash), 0) AS avg_daily_cash,
        COALESCE(SUM(daily_cash), 0) AS total_cash_30d
      FROM (
        SELECT s.sale_date, SUM(sp.amount) AS daily_cash
        FROM sale_payments sp
        JOIN sales s ON s.id = sp.sale_id
        WHERE sp.method = 'cash' AND s.sale_date >= CURRENT_DATE - 30 AND s.is_manual_debt = FALSE
        GROUP BY s.sale_date
      ) daily
    `)

    // Get total outstanding credit
    const [totalOutstanding] = await query(`
      SELECT COALESCE(SUM(s.total), 0) AS total
      FROM sales s WHERE s.status = 'pending'
    `)

    const avgDailyCash = Number(shopCashFlow?.avg_daily_cash || 0)
    const totalOutstandingAmt = Number(totalOutstanding?.total || 0)

    // Build payment index per customer
    const paymentsByCustomer: Record<string, any[]> = {}
    for (const p of paymentHistory) {
      if (!paymentsByCustomer[p.customer_name]) paymentsByCustomer[p.customer_name] = []
      paymentsByCustomer[p.customer_name].push(p)
    }

    const pendingByCustomer: Record<string, any[]> = {}
    for (const d of pendingDebts) {
      if (!pendingByCustomer[d.customer_name]) pendingByCustomer[d.customer_name] = []
      pendingByCustomer[d.customer_name].push(d)
    }

    // Score each customer
    const scored = customers.map((c: any) => {
      const payments = paymentsByCustomer[c.customer_name] || []
      const pending = pendingByCustomer[c.customer_name] || []
      const totalDebt = Number(c.total_debt_amount)
      const pendingAmt = Number(c.pending_amount)
      const clearedDebts = Number(c.cleared_debts)
      const totalCreditSales = Number(c.total_credit_sales)
      const pendingCount = Number(c.pending_debts)

      let score = 50 // Start neutral

      // --- Payment speed ---
      if (payments.length > 0) {
        const avgDaysToPay = payments.reduce((a: number, p: any) => a + Number(p.days_to_pay || 0), 0) / payments.length
        if (avgDaysToPay <= 3) score += 20
        else if (avgDaysToPay <= 7) score += 15
        else if (avgDaysToPay <= 14) score += 5
        else if (avgDaysToPay <= 30) score -= 5
        else score -= 15
      }

      // --- Clearance rate ---
      if (totalCreditSales > 0) {
        const clearanceRate = clearedDebts / totalCreditSales
        if (clearanceRate >= 0.9) score += 15
        else if (clearanceRate >= 0.7) score += 10
        else if (clearanceRate >= 0.5) score += 5
        else if (clearanceRate < 0.3) score -= 10
      }

      // --- Outstanding debt age ---
      const maxDebtAge = pending.reduce((max: number, d: any) => Math.max(max, Number(d.debt_age_days)), 0)
      if (maxDebtAge > 60) score -= 25
      else if (maxDebtAge > 30) score -= 15
      else if (maxDebtAge > 14) score -= 5

      // --- Payment consistency (multiple payments = good pattern) ---
      if (payments.length >= 5) score += 10
      else if (payments.length >= 3) score += 5

      // --- Never paid anything on current debts ---
      if (pendingCount > 0 && payments.length === 0) score -= 15

      // --- Payment amount ratio ---
      const totalPaid = payments.reduce((a: number, p: any) => a + Number(p.amount), 0)
      if (totalDebt > 0 && totalPaid > 0) {
        const payRatio = totalPaid / totalDebt
        if (payRatio >= 0.8) score += 10
        else if (payRatio >= 0.5) score += 5
      }

      // Clamp score 0-100
      score = Math.max(0, Math.min(100, score))

      // Determine risk level
      let risk: 'low' | 'medium' | 'high' | 'critical' = 'low'
      if (score >= 70) risk = 'low'
      else if (score >= 50) risk = 'medium'
      else if (score >= 30) risk = 'high'
      else risk = 'critical'

      // Recommendation
      let recommendation = ''
      let recommended_limit = 0
      const lastPayment = payments[0] || null

      if (risk === 'low') {
        recommendation = 'Reliable customer. Safe to extend credit.'
        recommended_limit = Math.min(avgDailyCash * 3, 10000)
      } else if (risk === 'medium') {
        recommendation = 'Moderate risk. Limit credit and monitor payments closely.'
        recommended_limit = Math.min(avgDailyCash * 1.5, 5000)
      } else if (risk === 'high') {
        recommendation = '⚠️ High risk. Reduce credit or require partial upfront payment.'
        recommended_limit = Math.min(avgDailyCash * 0.5, 2000)
      } else {
        recommendation = '🚫 Very high risk. Avoid extending credit. Require cash payment.'
        recommended_limit = 0
      }

      // Don't recommend more credit if they already owe a lot
      if (pendingAmt > recommended_limit) {
        recommended_limit = 0
        if (risk !== 'critical') {
          recommendation += ' Currently over recommended limit.'
        }
      } else {
        recommended_limit = Math.round(recommended_limit - pendingAmt)
      }

      return {
        customer_name: c.customer_name,
        score,
        risk,
        recommendation,
        recommended_limit: Math.max(0, recommended_limit),
        total_credit_sales: totalCreditSales,
        total_debt_amount: Math.round(totalDebt),
        cleared_debts: clearedDebts,
        pending_debts: pendingCount,
        pending_amount: Math.round(pendingAmt),
        total_paid: Math.round(totalPaid),
        last_payment_date: lastPayment?.paid_date || null,
        last_payment_amount: lastPayment ? Number(lastPayment.amount) : 0,
        oldest_debt_age_days: maxDebtAge,
        avg_days_to_pay: payments.length > 0
          ? Math.round(payments.reduce((a: number, p: any) => a + Number(p.days_to_pay || 0), 0) / payments.length)
          : null,
      }
    })

    return NextResponse.json({
      data: {
        customers: scored,
        shop_summary: {
          avg_daily_cash_sales: Math.round(avgDailyCash),
          total_outstanding_credit: Math.round(totalOutstandingAmt),
          credit_to_cash_ratio: avgDailyCash > 0 ? Math.round((totalOutstandingAmt / (avgDailyCash * 30)) * 100) : 0,
          safe_total_credit_limit: Math.round(avgDailyCash * 5),
        }
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
