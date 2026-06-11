// Run this from your duka-manager project folder:
//   node export-data.js
//
// Make sure your .env or .env.local has DATABASE_URL set,
// or pass it directly:
//   DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" node export-data.js

require('dotenv').config({ path: '.env.local' })
require('dotenv').config({ path: '.env' })

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const TABLES = [
  'sales',
  'sale_items',
  'sale_payments',
  'credit_payments',
  'products',
  'expenses',
  'cash_ledger',
  'stock_movements',
]

async function exportTable(table) {
  try {
    const res = await pool.query(`SELECT * FROM ${table} ORDER BY id`)
    if (res.rows.length === 0) {
      console.log(`  ⚪ ${table}: empty (skipped)`)
      return
    }

    const headers = Object.keys(res.rows[0])
    const csvLines = [headers.join(',')]

    for (const row of res.rows) {
      const values = headers.map(h => {
        let val = row[h]
        if (val === null || val === undefined) return ''
        if (val instanceof Date) return val.toISOString()
        val = String(val)
        // Escape CSV: wrap in quotes if contains comma, quote, or newline
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return '"' + val.replace(/"/g, '""') + '"'
        }
        return val
      })
      csvLines.push(values.join(','))
    }

    const outPath = path.join(__dirname, `${table}.csv`)
    fs.writeFileSync(outPath, csvLines.join('\n'))
    console.log(`  ✅ ${table}: ${res.rows.length} rows → ${table}.csv`)
  } catch (e) {
    console.log(`  ❌ ${table}: ${e.message}`)
  }
}

async function main() {
  console.log('\n🔄 Connecting to database...')
  console.log(`   URL: ${process.env.DATABASE_URL?.substring(0, 40)}...`)
  console.log('')

  try {
    await pool.query('SELECT 1')
    console.log('✅ Connected!\n')
  } catch (e) {
    console.error('❌ Connection failed:', e.message)
    process.exit(1)
  }

  console.log('📦 Exporting tables:\n')
  for (const table of TABLES) {
    await exportTable(table)
  }

  console.log('\n✅ Done! CSV files saved in current folder.')
  console.log('   Zip them and upload to Claude for analysis.\n')

  await pool.end()
}

main()
