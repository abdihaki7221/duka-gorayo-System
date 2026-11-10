// scripts/seed_v2.js
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function seed() {
  const client = await pool.connect()
  try {
    console.log('🌱 Seeding v2 data...')
    await client.query('BEGIN')

    // ── COOKING OIL (measured, 18L jerry) ──────────────────────
    const oil = await client.query(`
      INSERT INTO products (name, category, supplier, qty, units_per_dozen,
        buy_price, ws_price, retail_price, low_stock_threshold,
        sell_mode, base_unit, base_qty, ws_unit_label, ws_unit_qty)
      VALUES ('Cooking Oil', 'Cooking Oil', 'Bidco', 18, 1,
        255.56, 4600, 290, 18,
        'measured', 'litre', 18, '18L Jerry', 18)
      ON CONFLICT DO NOTHING RETURNING id
    `)
    if (oil.rows[0]) {
      const oilId = oil.rows[0].id
      await client.query(`
        INSERT INTO product_denominations (product_id, label, fraction, retail_price, is_default, sort_order)
        VALUES
          ($1, '1/4 Litre', 0.25,  72.50, false, 1),
          ($1, '1/2 Litre', 0.5,  145.00, false, 2),
          ($1, '1 Litre',   1.0,  290.00, true,  3),
          ($1, '5 Litres',  5.0, 1400.00, false, 4)
      `, [oilId])
      console.log('  ✅ Cooking Oil + denominations')
    }

    // ── SUGAR (measured, 50kg bag) ─────────────────────────────
    const sugar = await client.query(`
      INSERT INTO products (name, category, supplier, qty, units_per_dozen,
        buy_price, ws_price, retail_price, low_stock_threshold,
        sell_mode, base_unit, base_qty, ws_unit_label, ws_unit_qty)
      VALUES ('Sugar', 'Sugar & Salt', 'Mumias Sugar', 50, 1,
        118, 6000, 130, 50,
        'measured', 'kg', 50, '50kg Bag', 50)
      ON CONFLICT DO NOTHING RETURNING id
    `)
    if (sugar.rows[0]) {
      const sId = sugar.rows[0].id
      await client.query(`
        INSERT INTO product_denominations (product_id, label, fraction, retail_price, is_default, sort_order)
        VALUES
          ($1, '1/4 kg',  0.25,  35.00, false, 1),
          ($1, '1/2 kg',  0.5,   68.00, false, 2),
          ($1, '1 kg',    1.0,  130.00, true,  3),
          ($1, '2 kg',    2.0,  255.00, false, 4)
      `, [sId])
      console.log('  ✅ Sugar + denominations')
    }

    // ── BASMATI RICE (measured, 25kg bag) ──────────────────────
    const basmati = await client.query(`
      INSERT INTO products (name, category, supplier, qty, units_per_dozen,
        buy_price, ws_price, retail_price, low_stock_threshold,
        sell_mode, base_unit, base_qty, ws_unit_label, ws_unit_qty)
      VALUES ('Basmati Rice', 'Rice & Cereals', 'Supplier', 25, 1,
        210, 5250, 230, 25,
        'measured', 'kg', 25, '25kg Bag', 25)
      ON CONFLICT DO NOTHING RETURNING id
    `)
    if (basmati.rows[0]) {
      const rId = basmati.rows[0].id
      await client.query(`
        INSERT INTO product_denominations (product_id, label, fraction, retail_price, is_default, sort_order)
        VALUES
          ($1, '1/4 kg',  0.25,  60.00, false, 1),
          ($1, '1/2 kg',  0.5,  118.00, false, 2),
          ($1, '1 kg',    1.0,  230.00, true,  3)
      `, [rId])
      console.log('  ✅ Basmati Rice + denominations')
    }

    // ── BISHORI RICE ────────────────────────────────────────────
    const bishori = await client.query(`
      INSERT INTO products (name, category, supplier, qty, units_per_dozen,
        buy_price, ws_price, retail_price, low_stock_threshold,
        sell_mode, base_unit, base_qty, ws_unit_label, ws_unit_qty)
      VALUES ('Bishori Rice', 'Rice & Cereals', 'Supplier', 25, 1,
        185, 4625, 200, 25,
        'measured', 'kg', 25, '25kg Bag', 25)
      ON CONFLICT DO NOTHING RETURNING id
    `)
    if (bishori.rows[0]) {
      const rId = bishori.rows[0].id
      await client.query(`
        INSERT INTO product_denominations (product_id, label, fraction, retail_price, is_default, sort_order)
        VALUES
          ($1, '1/4 kg',  0.25,  53.00, false, 1),
          ($1, '1/2 kg',  0.5,  100.00, false, 2),
          ($1, '1 kg',    1.0,  200.00, true,  3)
      `, [rId])
      console.log('  ✅ Bishori Rice + denominations')
    }

    // ── HAMZA RICE ──────────────────────────────────────────────
    const hamza = await client.query(`
      INSERT INTO products (name, category, supplier, qty, units_per_dozen,
        buy_price, ws_price, retail_price, low_stock_threshold,
        sell_mode, base_unit, base_qty, ws_unit_label, ws_unit_qty)
      VALUES ('Hamza Rice', 'Rice & Cereals', 'Supplier', 25, 1,
        160, 4000, 175, 25,
        'measured', 'kg', 25, '25kg Bag', 25)
      ON CONFLICT DO NOTHING RETURNING id
    `)
    if (hamza.rows[0]) {
      const rId = hamza.rows[0].id
      await client.query(`
        INSERT INTO product_denominations (product_id, label, fraction, retail_price, is_default, sort_order)
        VALUES
          ($1, '1/4 kg',  0.25,  46.00, false, 1),
          ($1, '1/2 kg',  0.5,   88.00, false, 2),
          ($1, '1 kg',    1.0,  175.00, true,  3)
      `, [rId])
      console.log('  ✅ Hamza Rice + denominations')
    }

    // ── UNGA EXTRA (fixed, bale of 12) ─────────────────────────
    const unga = await client.query(`
      INSERT INTO products (name, category, supplier, qty, units_per_dozen,
        buy_price, ws_price, retail_price, low_stock_threshold,
        sell_mode, base_unit, base_qty, ws_unit_label, ws_unit_qty)
      VALUES ('Unga Extra 2kg', 'Flour & Unga', 'Unga Group', 120, 12,
        126.67, 1540, 135, 12,
        'fixed', 'unit', 1, 'Bale of 12', 12)
      ON CONFLICT DO NOTHING RETURNING id
    `)
    if (unga.rows[0]) {
      console.log('  ✅ Unga Extra (fixed)')
    }

    await client.query('COMMIT')
    console.log('✅ Seed v2 complete!')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('❌ Seed failed:', err.message)
  } finally {
    client.release()
    await pool.end()
  }
}

seed()
