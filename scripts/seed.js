// scripts/seed.js
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function seed() {
  const client = await pool.connect()
  try {
    console.log('🌱 Seeding database...')
    await client.query(`
      INSERT INTO products (name, category, supplier, qty, units_per_dozen, buy_price, ws_price, retail_price, low_stock_threshold)
      VALUES
        ('Unga Extra 2kg', 'Flour & Unga', 'Unga Group', 120, 12, 126.67, 1540, 135, 12),
        ('Sugar 2kg', 'Sugar & Salt', 'Mumias Sugar', 60, 12, 180, 2200, 195, 12),
        ('Cooking Oil 1L', 'Cooking Oil', 'Bidco', 48, 12, 280, 3400, 300, 12),
        ('Rice 2kg', 'Rice & Cereals', 'Supplier', 36, 6, 200, 1250, 215, 6),
        ('Salt 1kg', 'Sugar & Salt', 'Kensalt', 72, 12, 45, 560, 50, 12)
      ON CONFLICT DO NOTHING
    `)
    console.log('✅ Seed complete!')
  } catch (err) {
    console.error('❌ Seed failed:', err)
  } finally {
    client.release()
    await pool.end()
  }
}

seed()
