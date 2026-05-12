// scripts/migrate-v3.js
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const crypto = require('crypto')
const connStr = process.env.DATABASE_URL
const pool = new Pool({
  connectionString: connStr,
  ssl: connStr && connStr.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
})

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

const SQL = `
-- =========================================
-- V1 BASE TABLES (idempotent)
-- =========================================
CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  category    VARCHAR(100) NOT NULL DEFAULT 'Other',
  supplier    VARCHAR(200),
  qty         NUMERIC(10,2) NOT NULL DEFAULT 0,
  units_per_dozen INTEGER NOT NULL DEFAULT 12,
  buy_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  ws_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  retail_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 12,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  qty         NUMERIC(10,2) NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  phone       VARCHAR(30),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  id          SERIAL PRIMARY KEY,
  receipt_no  VARCHAR(30) NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  customer_name VARCHAR(200) NOT NULL DEFAULT 'Walk-in',
  payment_method VARCHAR(20) NOT NULL DEFAULT 'cash',
  payment_ref VARCHAR(100),
  subtotal    NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  profit      NUMERIC(12,2) NOT NULL DEFAULT 0,
  status      VARCHAR(20) NOT NULL DEFAULT 'paid',
  sale_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by  INTEGER,
  is_manual_debt BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id          SERIAL PRIMARY KEY,
  sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  product_name VARCHAR(200) NOT NULL,
  sale_type   VARCHAR(20) NOT NULL DEFAULT 'retail',
  qty         NUMERIC(10,2) NOT NULL,
  unit_price  NUMERIC(12,2) NOT NULL,
  buy_price   NUMERIC(12,2) NOT NULL,
  subtotal    NUMERIC(12,2) NOT NULL,
  profit      NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id          SERIAL PRIMARY KEY,
  category    VARCHAR(100) NOT NULL,
  description TEXT,
  amount      NUMERIC(12,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_cash (
  id            SERIAL PRIMARY KEY,
  cash_date     DATE NOT NULL UNIQUE,
  opening_cash  NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);

-- =========================================
-- V2 ADDITIONS
-- =========================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS sell_mode VARCHAR(20) NOT NULL DEFAULT 'both';
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_unit VARCHAR(30) NOT NULL DEFAULT 'unit';
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_qty NUMERIC(10,4) NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ws_pack_qty NUMERIC(10,4) NOT NULL DEFAULT 12;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ws_pack_label VARCHAR(50) NOT NULL DEFAULT 'dozen';

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

CREATE TABLE IF NOT EXISTS sale_payments (
  id          SERIAL PRIMARY KEY,
  sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method      VARCHAR(20)   NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  reference   VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_split_payment BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS denomination_id INTEGER REFERENCES product_denominations(id);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS denomination_label VARCHAR(50);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS fraction NUMERIC(10,6) NOT NULL DEFAULT 1;

INSERT INTO sale_payments (sale_id, method, amount, reference)
SELECT s.id, s.payment_method, s.total, s.payment_ref
FROM sales s
WHERE NOT EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id);

-- =========================================
-- V3 NEW TABLES & COLUMNS
-- =========================================

CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  email       VARCHAR(200) NOT NULL UNIQUE,
  name        VARCHAR(200) NOT NULL,
  password_hash TEXT NOT NULL,
  role        VARCHAR(20) NOT NULL DEFAULT 'staff',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wholesale buying price (cost per wholesale pack for profit calculation)
ALTER TABLE products ADD COLUMN IF NOT EXISTS ws_buy_price NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Discount on sales and sale_items
ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_manual_debt BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Payment method on expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'cash';

-- Credit payment journal
CREATE TABLE IF NOT EXISTS credit_payments (
  id          SERIAL PRIMARY KEY,
  sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL,
  method      VARCHAR(20) NOT NULL,
  reference   VARCHAR(100),
  note        TEXT,
  paid_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_payments_sale ON credit_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_date ON credit_payments(paid_date);

-- Cash ledger
CREATE TABLE IF NOT EXISTS cash_ledger (
  id            SERIAL PRIMARY KEY,
  ledger_date   DATE NOT NULL,
  type          VARCHAR(30) NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  description   TEXT,
  created_by    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_date ON cash_ledger(ledger_date);

-- Back-fill ws_buy_price from buy_price * ws_pack_qty where not set
UPDATE products SET ws_buy_price = buy_price * ws_pack_qty WHERE ws_buy_price = 0 AND ws_pack_qty > 0;

-- V4 FIXES
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_refund BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS refund_of_sale_id INTEGER REFERENCES sales(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS refund_method VARCHAR(20);

`

async function run() {
  const c = await pool.connect()
  try {
    console.log('Running full migration (v1+v2+v3)...')
    await c.query(SQL)

    const existing = await c.query("SELECT id FROM users WHERE email='abdihakimomar2017@gmail.com'")
    if (existing.rows.length === 0) {
      const hash = hashPassword('Abdihaki7221-@')
      await c.query(
        `INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, 'super_admin')`,
        ['abdihakimomar2017@gmail.com', 'Abdihakim Omar', hash]
      )
      console.log('Super admin created: abdihakimomar2017@gmail.com')
    } else {
      console.log('Super admin already exists')
    }

    console.log('All migrations complete!')
  } catch (e) {
    console.error('Error:', e.message)
    process.exit(1)
  } finally {
    c.release()
    await pool.end()
  }
}
run()
