// Deeper diagnosis - runs the EXACT queries the API endpoints use.
// node diagnose2.js

require('dotenv').config({ path: '.env.local' })
require('dotenv').config({ path: '.env' })
const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function tryQuery(label, sql, params = []) {
  try {
    const r = await pool.query(sql, params)
    console.log(`✅ ${label}: OK (${r.rows.length} rows)`)
    return true
  } catch (e) {
    console.log(`❌ ${label}: ${e.message}`)
    return false
  }
}

async function main() {
  console.log('\n--- Testing product_denominations joins ---')
  await tryQuery('denom columns', `SELECT id, product_id, label, fraction, sell_price FROM product_denominations LIMIT 1`)

  console.log('\n--- Products API full query variants ---')
  // Variant with search param
  await tryQuery('products with search filter', `
    SELECT p.*,
      COALESCE(json_agg(json_build_object('id',d.id,'label',d.label,'fraction',d.fraction,'sell_price',d.sell_price)
        ORDER BY d.fraction) FILTER (WHERE d.id IS NOT NULL), '[]') AS denominations
    FROM products p
    LEFT JOIN product_denominations d ON d.product_id = p.id
    WHERE p.is_deleted = FALSE AND (p.name ILIKE $1 OR p.category ILIKE $1)
    GROUP BY p.id ORDER BY p.name
  `, ['%%'])

  console.log('\n--- Monthly report full queries ---')
  const month = '2026-08'
  await tryQuery('sales summary', `
    SELECT COUNT(DISTINCT s.id) AS tx_count,
      COALESCE(SUM(s.total),0) AS total_sales,
      COALESCE(SUM(s.profit),0) AS total_profit,
      COALESCE(SUM(s.discount),0) AS total_discount
    FROM sales s WHERE TO_CHAR(s.sale_date,'YYYY-MM')=$1 AND s.is_manual_debt=FALSE
  `, [month])

  await tryQuery('payment breakdown', `
    SELECT
      COALESCE(SUM(CASE WHEN sp.method='cash' THEN sp.amount ELSE 0 END),0) AS cash_sales,
      COALESCE(SUM(CASE WHEN sp.method='mpesa' THEN sp.amount ELSE 0 END),0) AS mpesa_sales
    FROM sale_payments sp JOIN sales s ON s.id=sp.sale_id
    WHERE TO_CHAR(s.sale_date,'YYYY-MM')=$1 AND s.is_manual_debt=FALSE
  `, [month])

  await tryQuery('expenses summary', `
    SELECT
      COALESCE(SUM(amount),0) AS total_expenses,
      COALESCE(SUM(CASE WHEN category IN ('Stock Purchase','Stock Payment') THEN amount ELSE 0 END),0) AS stock_expenses
    FROM expenses WHERE TO_CHAR(expense_date,'YYYY-MM')=$1
  `, [month])

  await tryQuery('daily breakdown', `
    SELECT sale_date::text AS date, COALESCE(SUM(total),0) AS sales, COALESCE(SUM(profit),0) AS profit, COUNT(*) AS tx_count
    FROM sales WHERE TO_CHAR(sale_date,'YYYY-MM')=$1 AND is_manual_debt=FALSE
    GROUP BY sale_date ORDER BY sale_date
  `, [month])

  await tryQuery('top products', `
    SELECT si.product_name, SUM(si.qty) AS qty_sold, SUM(si.subtotal) AS revenue, SUM(si.profit) AS profit
    FROM sale_items si JOIN sales s ON s.id=si.sale_id
    WHERE TO_CHAR(s.sale_date,'YYYY-MM')=$1 AND s.is_manual_debt=FALSE
    GROUP BY si.product_name ORDER BY revenue DESC LIMIT 10
  `, [month])

  await tryQuery('owner withdrawals', `
    SELECT COALESCE(SUM(amount),0) AS total FROM cash_ledger
    WHERE type='owner_withdrawal' AND TO_CHAR(ledger_date,'YYYY-MM')=$1
  `, [month])

  await tryQuery('credit summary', `
    SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS total
    FROM sales WHERE status='pending'
  `)

  console.log('\n--- Check daily_cash (unexpected view/table) ---')
  await tryQuery('daily_cash object', `SELECT * FROM daily_cash LIMIT 1`)

  await pool.end()
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
