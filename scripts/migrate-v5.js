// scripts/migrate-v5.js — Excel bulk stock upload + expiry tracking
// Usage: node scripts/migrate-v5.js   (reads DATABASE_URL from .env.local)
// Same statements as scripts/sql/v5-bulk-upload-expiry.sql — run either one.
require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const connStr = process.env.DATABASE_URL
const pool = new Pool({
  connectionString: connStr,
  ssl: connStr && connStr.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
})

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'sql', 'v5-bulk-upload-expiry.sql'), 'utf8')
  const c = await pool.connect()
  try {
    console.log('Applying v5 (bulk upload + expiry)...')
    await c.query(sql)
    const { rows } = await c.query(
      "SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_name='products' AND column_name='expiry_date'"
    )
    if (rows[0].n !== 1) throw new Error('expiry_date column was not created')
    console.log('Done. products.expiry_date is ready.')
  } catch (e) {
    console.error('Error:', e.message)
    process.exit(1)
  } finally {
    c.release()
    await pool.end()
  }
}
run()
