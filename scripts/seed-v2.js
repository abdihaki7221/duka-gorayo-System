// scripts/seed-v2.js
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function run() {
  const c = await pool.connect()
  try {
    console.log('🌱 Seeding v2 data...')

    // ── Cooking Oil (18L jerry @ 4600)
    // cost per litre = 4600/18 = 255.56
    const [oil] = (await c.query(`
      INSERT INTO products (name, category, supplier, qty, units_per_dozen,
        buy_price, ws_price, retail_price, low_stock_threshold,
        sell_mode, base_unit, base_qty, ws_pack_qty, ws_pack_label)
      VALUES ('Cooking Oil', 'Cooking Oil', 'Bidco', 36, 1,
        255.56, 4600, 290, 2,
        'both', 'litre', 1, 20, '20L jerry')
      ON CONFLICT DO NOTHING RETURNING id
    `)).rows
    if (oil) {
      await c.query(`
        INSERT INTO product_denominations (product_id, label, fraction, sell_price, sort_order)
        VALUES
          ($1, '1/4 L',  0.25, 72.50, 1),
          ($1, '1/2 L',  0.50, 145.00, 2),
          ($1, '1 L',    1.00, 290.00, 3),
          ($1, '2 L',    2.00, 580.00, 4),
          ($1, '5 L',    5.00, 1450.00, 5)
      `, [oil.id])
      console.log('  ✓ Cooking Oil + denominations')
    }

    // ── Sugar (50kg bag, buy price = 5200, cost/kg = 104)
    const [sugar] = (await c.query(`
      INSERT INTO products (name, category, supplier, qty, units_per_dozen,
        buy_price, ws_price, retail_price, low_stock_threshold,
        sell_mode, base_unit, base_qty, ws_pack_qty, ws_pack_label)
      VALUES ('Sugar', 'Sugar & Salt', 'Mumias Sugar', 100, 50,
        104, 5200, 115, 5,
        'both', 'kg', 1, 50, '50kg bag')
      ON CONFLICT DO NOTHING RETURNING id
    `)).rows
    if (sugar) {
      await c.query(`
        INSERT INTO product_denominations (product_id, label, fraction, sell_price, sort_order)
        VALUES
          ($1, '1/4 kg', 0.25, 30.00, 1),
          ($1, '1/2 kg', 0.50, 58.00, 2),
          ($1, '1 kg',   1.00, 115.00, 3),
          ($1, '2 kg',   2.00, 228.00, 4)
      `, [sugar.id])
      console.log('  ✓ Sugar + denominations')
    }

    // ── Basmati Rice (25kg @ 3500, cost/kg = 140)
    const [basmati] = (await c.query(`
      INSERT INTO products (name, category, supplier, qty, units_per_dozen,
        buy_price, ws_price, retail_price, low_stock_threshold,
        sell_mode, base_unit, base_qty, ws_pack_qty, ws_pack_label)
      VALUES ('Basmati Rice', 'Rice & Cereals', 'Supplier', 75, 25,
        140, 3500, 160, 5,
        'both', 'kg', 1, 25, '25kg bag')
      ON CONFLICT DO NOTHING RETURNING id
    `)).rows
    if (basmati) {
      await c.query(`
        INSERT INTO product_denominations (product_id, label, fraction, sell_price, sort_order)
        VALUES
          ($1, '1/4 kg', 0.25, 42.00, 1),
          ($1, '1/2 kg', 0.50, 82.00, 2),
          ($1, '1 kg',   1.00, 160.00, 3),
          ($1, '2 kg',   2.00, 318.00, 4)
      `, [basmati.id])
      console.log('  ✓ Basmati Rice + denominations')
    }

    // ── Bishori Rice (25kg @ 2800, cost/kg = 112)
    const [bishori] = (await c.query(`
      INSERT INTO products (name, category, supplier, qty, units_per_dozen,
        buy_price, ws_price, retail_price, low_stock_threshold,
        sell_mode, base_unit, base_qty, ws_pack_qty, ws_pack_label)
      VALUES ('Bishori Rice', 'Rice & Cereals', 'Supplier', 75, 25,
        112, 2800, 128, 5,
        'both', 'kg', 1, 25, '25kg bag')
      ON CONFLICT DO NOTHING RETURNING id
    `)).rows
    if (bishori) {
      await c.query(`
        INSERT INTO product_denominations (product_id, label, fraction, sell_price, sort_order)
        VALUES
          ($1, '1/4 kg', 0.25, 34.00, 1),
          ($1, '1/2 kg', 0.50, 66.00, 2),
          ($1, '1 kg',   1.00, 128.00, 3),
          ($1, '2 kg',   2.00, 254.00, 4)
      `, [bishori.id])
      console.log('  ✓ Bishori Rice + denominations')
    }

    // ── Hamza Rice (25kg @ 2400, cost/kg = 96)
    const [hamza] = (await c.query(`
      INSERT INTO products (name, category, supplier, qty, units_per_dozen,
        buy_price, ws_price, retail_price, low_stock_threshold,
        sell_mode, base_unit, base_qty, ws_pack_qty, ws_pack_label)
      VALUES ('Hamza Rice', 'Rice & Cereals', 'Supplier', 50, 25,
        96, 2400, 110, 5,
        'both', 'kg', 1, 25, '25kg bag')
      ON CONFLICT DO NOTHING RETURNING id
    `)).rows
    if (hamza) {
      await c.query(`
        INSERT INTO product_denominations (product_id, label, fraction, sell_price, sort_order)
        VALUES
          ($1, '1/4 kg', 0.25, 28.00, 1),
          ($1, '1/2 kg', 0.50, 54.00, 2),
          ($1, '1 kg',   1.00, 110.00, 3),
          ($1, '2 kg',   2.00, 218.00, 4)
      `, [hamza.id])
      console.log('  ✓ Hamza Rice + denominations')
    }

    // ── Unga Extra (bale of 12 @ 1520, cost/unit = 126.67)
    const [unga] = (await c.query(`
      INSERT INTO products (name, category, supplier, qty, units_per_dozen,
        buy_price, ws_price, retail_price, low_stock_threshold,
        sell_mode, base_unit, base_qty, ws_pack_qty, ws_pack_label)
      VALUES ('Unga Extra 2kg', 'Flour & Unga', 'Unga Group', 120, 12,
        126.67, 1540, 135, 12,
        'both', 'packet', 1, 12, 'bale (12)')
      ON CONFLICT DO NOTHING RETURNING id
    `)).rows
    if (unga) {
      await c.query(`
        INSERT INTO product_denominations (product_id, label, fraction, sell_price, sort_order)
        VALUES ($1, '1 packet', 1.0, 135.00, 1)
      `, [unga.id])
      console.log('  ✓ Unga Extra + denomination')
    }

    console.log('✅ Seed v2 complete!')
  } catch (e) {
    console.error('❌', e.message)
  } finally {
    c.release()
    await pool.end()
  }
}
run()
