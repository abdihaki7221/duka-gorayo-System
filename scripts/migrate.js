// scripts/migrate.js
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const SQL = `
-- Products / Stock
CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  category    VARCHAR(100) NOT NULL DEFAULT 'Other',
  supplier    VARCHAR(200),
  qty         NUMERIC(10,2) NOT NULL DEFAULT 0,
  units_per_dozen INTEGER NOT NULL DEFAULT 12,
  buy_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  ws_price    NUMERIC(12,2) NOT NULL DEFAULT 0,  -- per dozen
  retail_price NUMERIC(12,2) NOT NULL DEFAULT 0, -- per unit
  low_stock_threshold INTEGER NOT NULL DEFAULT 12,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stock movements (deliveries, adjustments)
CREATE TABLE IF NOT EXISTS stock_movements (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL, -- 'in' | 'out' | 'adjustment'
  qty         NUMERIC(10,2) NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  phone       VARCHAR(30),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sales / Receipts
CREATE TABLE IF NOT EXISTS sales (
  id          SERIAL PRIMARY KEY,
  receipt_no  VARCHAR(30) NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  customer_name VARCHAR(200) NOT NULL DEFAULT 'Walk-in',
  payment_method VARCHAR(20) NOT NULL DEFAULT 'cash', -- cash|mpesa|kcb|credit
  payment_ref VARCHAR(100),
  subtotal    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  profit      NUMERIC(12,2) NOT NULL DEFAULT 0,
  status      VARCHAR(20) NOT NULL DEFAULT 'paid',    -- paid|pending
  sale_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sale line items
CREATE TABLE IF NOT EXISTS sale_items (
  id          SERIAL PRIMARY KEY,
  sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  product_name VARCHAR(200) NOT NULL,
  sale_type   VARCHAR(20) NOT NULL DEFAULT 'retail', -- retail|wholesale
  qty         NUMERIC(10,2) NOT NULL,
  unit_price  NUMERIC(12,2) NOT NULL,
  buy_price   NUMERIC(12,2) NOT NULL,
  subtotal    NUMERIC(12,2) NOT NULL,
  profit      NUMERIC(12,2) NOT NULL
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id          SERIAL PRIMARY KEY,
  category    VARCHAR(100) NOT NULL,
  description TEXT,
  amount      NUMERIC(12,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily cash ledger (optional manual entry for opening cash)
CREATE TABLE IF NOT EXISTS daily_cash (
  id            SERIAL PRIMARY KEY,
  cash_date     DATE NOT NULL UNIQUE,
  opening_cash  NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
`

async function migrate() {
  const client = await pool.connect()
  try {
    console.log('🔄 Running migrations...')
    await client.query(SQL)
    console.log('✅ Migrations complete!')
  } catch (err) {
    console.error('❌ Migration failed:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
