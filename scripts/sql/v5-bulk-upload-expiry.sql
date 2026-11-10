-- =====================================================================
-- Gorayo Wholesalers — v5: Excel bulk stock upload + expiry tracking
-- Run once in Neon (SQL Editor). Safe to re-run: every statement is
-- idempotent and none of them deletes or changes existing data.
-- =====================================================================

-- 1. Expiry date per product (NULL = does not expire)
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- 2. Make sure the soft-delete column from v4 exists (expiry queries filter on it)
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE products SET is_deleted = FALSE WHERE is_deleted IS NULL;

-- 3. Fast lookups for "what is expiring in the next N days"
CREATE INDEX IF NOT EXISTS idx_products_expiry
  ON products (expiry_date)
  WHERE expiry_date IS NOT NULL AND is_deleted = FALSE;

-- 4. Categories / suppliers tables used by the bulk upload
--    (they already exist on your database; these lines only guard fresh installs)
CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(200) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS suppliers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  phone      VARCHAR(50),
  email      VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Verify (optional) — should return one row: expiry_date | date
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'products' AND column_name = 'expiry_date';
