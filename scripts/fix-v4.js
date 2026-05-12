// scripts/fix-v4.js — Run this to apply all v4 fixes to an existing database
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const connStr = process.env.DATABASE_URL
const pool = new Pool({
  connectionString: connStr,
  ssl: connStr && connStr.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
})

const SQL = `
-- Add is_deleted to products (soft delete)
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- Add refund columns to sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_refund BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS refund_of_sale_id INTEGER;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS refund_method VARCHAR(20);

-- Backfill: set is_deleted=FALSE for all existing products
UPDATE products SET is_deleted = FALSE WHERE is_deleted IS NULL;

-- Add is_manual_debt if missing
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_manual_debt BOOLEAN NOT NULL DEFAULT FALSE;

-- Add is_split_payment if missing  
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_split_payment BOOLEAN NOT NULL DEFAULT FALSE;

-- Payment method on expenses if missing
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'cash';

-- ws_buy_price on products if missing
ALTER TABLE products ADD COLUMN IF NOT EXISTS ws_buy_price NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Backfill ws_buy_price
UPDATE products SET ws_buy_price = buy_price * ws_pack_qty WHERE ws_buy_price = 0 AND ws_pack_qty > 0;
`

async function run() {
  const c = await pool.connect()
  try {
    console.log('Applying v4 fixes...')
    await c.query(SQL)
    
    // Count products that need is_deleted backfill
    const res = await c.query('SELECT COUNT(*) as total FROM products')
    console.log(`${res.rows[0].total} products have is_deleted set`)
    
    console.log('All v4 fixes applied successfully!')
    console.log('Columns added: products.is_deleted, sales.is_refund, sales.refund_of_sale_id, sales.refund_method')
  } catch (e) {
    console.error('Error:', e.message)
    process.exit(1)
  } finally {
    c.release()
    await pool.end()
  }
}
run()
