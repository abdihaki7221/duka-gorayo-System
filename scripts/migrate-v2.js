// scripts/migrate-v2.js
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const SQL = `
-- 1. New columns on products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sell_mode      VARCHAR(20) NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS base_unit      VARCHAR(30) NOT NULL DEFAULT 'unit',
  ADD COLUMN IF NOT EXISTS base_qty       NUMERIC(10,4) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ws_pack_qty    NUMERIC(10,4) NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS ws_pack_label  VARCHAR(50)  NOT NULL DEFAULT 'dozen';

-- 2. Denominations table
CREATE TABLE IF NOT EXISTS product_denominations (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label       VARCHAR(50)   NOT NULL,
  fraction    NUMERIC(10,6) NOT NULL,
  sell_price  NUMERIC(12,2) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_denom_product ON product_denominations(product_id);

-- 3. Split payments table
CREATE TABLE IF NOT EXISTS sale_payments (
  id          SERIAL PRIMARY KEY,
  sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method      VARCHAR(20)   NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  reference   VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);

-- 4. Extra columns on sales
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS is_split_payment BOOLEAN NOT NULL DEFAULT FALSE;

-- 5. Extra columns on sale_items
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS denomination_id    INTEGER REFERENCES product_denominations(id),
  ADD COLUMN IF NOT EXISTS denomination_label VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fraction           NUMERIC(10,6) NOT NULL DEFAULT 1;

-- 6. Back-fill sale_payments from existing sales rows
INSERT INTO sale_payments (sale_id, method, amount, reference)
SELECT s.id, s.payment_method, s.total, s.payment_ref
FROM sales s
WHERE NOT EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id);
`

async function run() {
  const c = await pool.connect()
  try {
    console.log('🔄 Running migration v2...')
    await c.query(SQL)
    console.log('✅ Done! Tables: product_denominations, sale_payments')
    console.log('   Columns added: sell_mode, base_unit, ws_pack_qty, denomination support')
  } catch (e) {
    console.error('❌', e.message)
    process.exit(1)
  } finally {
    c.release()
    await pool.end()
  }
}
run()
