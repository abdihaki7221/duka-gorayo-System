// Exports your entire Duka Manager database to a single .sql file.
//
// USAGE (from your duka-manager / bashir-wholesalers project folder):
//   node export-sql.js
//
// It reads DATABASE_URL from .env.local or .env automatically.
// Output: duka_dump.sql  (schema + all data as INSERT statements)

require('dotenv').config({ path: '.env.local' })
require('dotenv').config({ path: '.env' })

const { Pool } = require('pg')
const fs = require('fs')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

// Order matters for foreign keys — parents before children
const TABLES = [
  'users',
  'products',
  'product_denominations',
  'categories',
  'suppliers',
  'customers',
  'sales',
  'sale_items',
  'sale_payments',
  'credit_payments',
  'expenses',
  'cash_ledger',
  'stock_movements',
]

function sqlValue(val) {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
  if (val instanceof Date) return `'${val.toISOString()}'`
  if (typeof val === 'object') {
    // JSON / JSONB columns
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`
  }
  // String — escape single quotes
  return `'${String(val).replace(/'/g, "''")}'`
}

async function getColumns(table) {
  const res = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = $1 ORDER BY ordinal_position
  `, [table])
  return res.rows.map(r => r.column_name)
}

async function tableExists(table) {
  const res = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = $1
    ) AS ok
  `, [table])
  return res.rows[0].ok
}

async function main() {
  console.log('\nConnecting to database...')
  try {
    await pool.query('SELECT 1')
    console.log('Connected!\n')
  } catch (e) {
    console.error('Connection failed:', e.message)
    process.exit(1)
  }

  let out = ''
  out += '-- Duka Manager database dump\n'
  out += `-- Generated: ${new Date().toISOString()}\n`
  out += '-- Data-only INSERT statements\n\n'
  out += 'BEGIN;\n\n'

  for (const table of TABLES) {
    if (!(await tableExists(table))) {
      console.log(`  skip  ${table} (does not exist)`)
      continue
    }

    const cols = await getColumns(table)
    const res = await pool.query(`SELECT * FROM ${table} ORDER BY 1`)

    if (res.rows.length === 0) {
      console.log(`  empty ${table}`)
      out += `-- ${table}: no rows\n\n`
      continue
    }

    out += `-- ${table} (${res.rows.length} rows)\n`
    const colList = cols.map(c => `"${c}"`).join(', ')

    for (const row of res.rows) {
      const vals = cols.map(c => sqlValue(row[c])).join(', ')
      out += `INSERT INTO ${table} (${colList}) VALUES (${vals});\n`
    }
    out += '\n'
    console.log(`  ok    ${table}: ${res.rows.length} rows`)
  }

  out += 'COMMIT;\n'

  fs.writeFileSync('duka_dump.sql', out)
  console.log(`\nDone! Saved to: duka_dump.sql`)
  console.log('Upload that file to Claude for your next task.\n')

  await pool.end()
}

main()
