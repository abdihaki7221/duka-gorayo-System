// scripts/migrate_v2.js
// Run: node scripts/migrate_v2.js
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const SQL = `
-- ─────────────────────────────────────────────
-- 1. PRODUCT DENOMINATIONS
--    Each product can have multiple sell sizes
--    e.g. Oil 1/4L, 1/2L, 1L, 5L
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_denominations (
  id            SERIAL PRIMARY KEY,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label         VARCHAR(50)  NOT NULL,   -- "1/4 kg", "1/2 L", "1 kg", "2 kg"
  fraction      NUMERIC(10,6) NOT NULL,  -- fraction of base unit: 0.25, 0.5, 1.0, 2.0
  retail_price  NUMERIC(12,2) NOT NULL,  -- selling price for this denomination
  is_default    BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────
-- 2. PRODUCT: add fields for denomination mode
-- ─────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sell_mode        VARCHAR(20) NOT NULL DEFAULT 'fixed',
  -- 'fixed'   = standard packaged goods (selling fixed pack sizes)
  -- 'measured' = weighed/measured by denomination (sugar, oil, rice)
  ADD COLUMN IF NOT EXISTS base_unit        VARCHAR(20) NOT NULL DEFAULT 'unit',
  -- 'unit', 'kg', 'litre'
  ADD COLUMN IF NOT EXISTS base_qty         NUMERIC(10,4) NOT NULL DEFAULT 1,
  -- total quantity in base units (e.g. 18 for 18-litre oil jerry)
  ADD COLUMN IF NOT EXISTS ws_unit_label    VARCHAR(50),
  -- label for wholesale unit e.g. "20L Jerry", "Bale of 12"
  ADD COLUMN IF NOT EXISTS ws_unit_qty      NUMERIC(10,4) NOT NULL DEFAULT 1;
  -- how many base units in one wholesale unit

-- ─────────────────────────────────────────────
-- 3. SPLIT PAYMENTS (up to 3 per sale)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sale_payments (
  id             SERIAL PRIMARY KEY,
  sale_id        INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method         VARCHAR(20) NOT NULL,  -- cash | mpesa | kcb | credit
  amount         NUMERIC(12,2) NOT NULL,
  reference      VARCHAR(100),
  sort_order     INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────
-- 4. SALE_ITEMS: add denomination support
-- ─────────────────────────────────────────────
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS denomination_id     INTEGER REFERENCES product_denominations(id),
  ADD COLUMN IF NOT EXISTS denomination_label  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fraction            NUMERIC(10,6) NOT NULL DEFAULT 1;
  -- actual base units consumed = qty * fraction

-- ─────────────────────────────────────────────
-- 5. SALES: remove single payment_method column
--    (keep for backward compat, new data uses sale_payments)
-- ─────────────────────────────────────────────
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS is_split_payment BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────
-- 6. INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_denominations_product ON product_denominations(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale    ON sale_payments(sale_id);

-- ─────────────────────────────────────────────
-- 7. MIGRATE existing sales into sale_payments
-- ─────────────────────────────────────────────
INSERT INTO sale_payments (sale_id, method, amount, reference, sort_order)
SELECT id, payment_method, total, payment_ref, 0
FROM sales
WHERE NOT is_split_payment
  AND id NOT IN (SELECT DISTINCT sale_id FROM sale_payments)
ON CONFLICT DO NOTHING;
`

async function migrate() {
  const client = await pool.connect()
  try {
    console.log('🔄 Running v2 migration...')
    await client.query(SQL)
    console.log('✅ Migration v2 complete!')
  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
