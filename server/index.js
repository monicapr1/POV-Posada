import express from "express";
import dotenv from "dotenv";
import pkg from "pg";
import cors from "cors";
import { nanoid } from "nanoid";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "../public")));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

const toCents = (val) => Math.round((parseFloat(val) || 0) * 100);

async function initDB() {
  const client = await pool.connect();
  try {
    console.log("🌱 Inicializando Sistema El Sembrador...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS registers (id TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE IF NOT EXISTS shifts (id TEXT PRIMARY KEY, register_id TEXT, status TEXT, opened_at TIMESTAMPTZ DEFAULT NOW(), closed_at TIMESTAMPTZ, opening_cash_cents INT, closing_cash_cents INT, notes TEXT);
      CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT, category TEXT, price_cents INT, sort_order INT);
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, register_id TEXT, shift_id TEXT, status TEXT, folio SERIAL, total_cents INT DEFAULT 0, cash_received_cents INT DEFAULT 0, change_cents INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS order_items (id SERIAL PRIMARY KEY, order_id TEXT, product_id TEXT, qty INT, unit_price_cents INT, line_total_cents INT);
    `);

    await client.query(`
      INSERT INTO registers (id, name) VALUES 
      ('CAJA-1', 'Caja Principal'), ('CAJA-2', 'Caja Tablet A'),
      ('CAJA-3', 'Caja Tablet B'), ('CAJA-4', 'Caja Celular')
      ON CONFLICT (id) DO NOTHING;
    `);

    // PRODUCTOS (Precios Actualizados 2025)
    const products = [
      ['tamal', 'Tamales', 'Comida', 2500, 1],
      ['corunda', 'Corundas', 'Comida', 1700, 2],
      ['torta', 'Tortas', 'Comida', 6000, 3],
      ['tacos_2', 'Tacos Suaves (2)', 'Comida', 3500, 4],
      ['tacos_3', 'Tacos Suaves (3)', 'Comida', 5000, 5],
      ['sincro_ch', 'Sincronizada Chica', 'Comida', 4500, 6],
      ['sincro_gd', 'Sincronizada Grande', 'Comida', 7500, 7],
      ['burrito', 'Burritos', 'Comida', 3000, 8],
      ['quesadilla', 'Quesadilla Sencilla', 'Comida', 2000, 9],
      ['quesa_guis', 'Quesadilla Guisado', 'Comida', 4000, 10],
      ['enchiladas', 'Enchiladas (Orden)', 'Comida', 4000, 11],
      ['tacos_dor', 'Tacos Dorados', 'Comida', 4000, 12],
      ['cecina_ch', 'Cecina Chica', 'Comida', 3300, 13],
      ['cecina_gd', 'Cecina Grande', 'Comida', 6000, 14],
      ['vaso_elote', 'Vaso de Elote', 'Antojitos', 4000, 20],
      ['dorilocos', 'Dorilocos', 'Antojitos', 6000, 21],
      ['churros', 'Churros Chicos', 'Antojitos', 2000, 22],
      ['churros_gd', 'Churros Grandes', 'Antojitos', 3000, 23],
      ['atole', 'Atole', 'Bebidas', 2000, 30],
      ['ponche', 'Ponche', 'Bebidas', 1800, 31],
      ['agua_nat', 'Agua Natural', 'Bebidas', 1000, 32],
      ['agua_jam', 'Agua Jamaica', 'Bebidas', 1200, 33],
      ['agua_hor', 'Agua Horchata', 'Bebidas', 1500, 34],
      ['cafe', 'Café', 'Bebidas', 2000, 35],
      ['postres', 'Postre', 'Postres', 5000, 40],
      ['pase', 'PASE EXTRA', 'Otros', 1500, 99]
    ];

    for (const p of products) {
      await client.query(`INSERT INTO products (id, name, category, price_cents, sort_order) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET category=EXCLUDED.category, price_cents=EXCLUDED.price_cents, name=EXCLUDED.name`, p);
    }

    const checkOrders = await client.query("SELECT COUNT(*) FROM orders");
    if(parseInt(checkOrders.rows[0].count) === 0) await seedDummyData(client);
    console.log("✅ DB Lista");
  } catch (e) { console.error(e); } finally { client.release(); }
}

async function seedDummyData(client) {
    // Generamos datos con timestamps recientes para que aparezcan en las gráficas
    const regId = 'CAJA-1';
    const shiftId = nanoid();
    await client.query("INSERT INTO shifts (id, register_id, status, opened_at, closed_at, opening_cash_cents) VALUES ($1, $2, 'CLOSED', NOW() - INTERVAL '5 HOURS', NOW(), 50000)", [shiftId, regId]);
    const items = ['tamal', 'atole', 'vaso_elote', 'pase'];
    for(let i=0; i<10; i++) {
        const oid = nanoid();
        const prodId = items[Math.floor(Math.random()*items.length)];
        const pRes = await client.query("SELECT price_cents FROM products WHERE id=$1", [prodId]);
        const price = pRes.rows[0].price_cents;
        await client.query("INSERT INTO orders (id, register_id, shift_id, status, total_cents, cash_received_cents, created_at) VALUES ($1, $2, $3, 'PAID', $4, $4, NOW() - INTERVAL '2 HOURS')", [oid, regId, shiftId, price]);
        await client.query(`INSERT INTO order_items (order_id, product_id, qty, unit_price_cents, line_total_cents) VALUES ('${oid}', '${prodId}', 1, ${price}, ${price})`);
    }
}

initDB();

// --- ENDPOINTS ---
app.get('/api/registers', async (req, res) => { const r = await pool.query('SELECT * FROM registers ORDER BY id'); res.json(r.rows); });
app.get('/api/products', async (req, res) => { const r = await pool.query('SELECT * FROM products ORDER BY sort_order'); res.json(r.rows); });
app.get('/api/shifts/current', async (req, res) => { const r = await pool.query("SELECT * FROM shifts WHERE register_id = $1 AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1", [req.query.register_id]); res.json(r.rows[0] || null); });
app.post('/api/shifts/open', async (req, res) => {
  const { register_id, opening_cash } = req.body;
  await pool.query("UPDATE shifts SET status='CLOSED', closed_at=NOW() WHERE register_id=$1 AND status='OPEN'", [register_id]);
  await pool.query("INSERT INTO shifts (id, register_id, status, opening_cash_cents) VALUES ($1, $2, 'OPEN', $3)", [nanoid(), register_id, toCents(opening_cash)]);
  res.json({ ok: true });
});
app.get('/api/shifts/:id/summary', async (req, res) => {
  const s = await pool.query("SELECT * FROM shifts WHERE id=$1", [req.params.id]);
  const p = await pool.query("SELECT COALESCE(SUM(cash_received_cents),0)::int as cash_received, COALESCE(SUM(change_cents),0)::int as change_sum FROM orders WHERE shift_id=$1 AND status='PAID'", [req.params.id]);
  res.json({ shift: s.rows[0], paid: p.rows[0] });
});
app.post('/api/shifts/:id/close', async (req, res) => { await pool.query("UPDATE shifts SET status='CLOSED', closed_at=NOW() WHERE id=$1", [req.params.id]); res.json({ ok: true }); });
app.post('/api/orders', async (req, res) => {
  const s = await pool.query("SELECT id FROM shifts WHERE register_id=$1 AND status='OPEN' LIMIT 1", [req.body.register_id]);
  if(s.rows.length===0) return res.status(400).json({ error: "Caja cerrada" });
  const o = await pool.query("INSERT INTO orders (id, register_id, shift_id, status) VALUES ($1, $2, $3, 'OPEN') RETURNING *", [nanoid(), req.body.register_id, s.rows[0].id]);
  res.json({ order: o.rows[0] });
});
app.put('/api/orders/:id/items', async (req, res) => {
  const client = await pool.connect();
  try { await client.query('BEGIN'); await client.query('DELETE FROM order_items WHERE order_id = $1', [req.params.id]);
    let t = 0;
    for (const i of req.body.items) {
      const p = await client.query('SELECT * FROM products WHERE id = $1', [i.product_id]);
      if(p.rows[0]) { const line = p.rows[0].price_cents * i.qty; t += line; await client.query("INSERT INTO order_items (order_id, product_id, qty, unit_price_cents, line_total_cents) VALUES ($1,$2,$3,$4,$5)", [req.params.id, p.rows[0].id, i.qty, p.rows[0].price_cents, line]); }
    }
    await client.query('UPDATE orders SET total_cents = $1 WHERE id = $2', [t, req.params.id]); await client.query('COMMIT'); res.json({ ok: true });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});
app.post('/api/orders/:id/pay', async (req, res) => {
  const client = await pool.connect();
  try { await client.query('BEGIN');
    const o = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    if(o.rows[0].status !== 'OPEN') throw new Error("Orden cerrada");
    const cash = toCents(req.body.cash_received); if(cash < o.rows[0].total_cents) throw new Error("Falta efectivo");
    await client.query("UPDATE orders SET status='PAID', cash_received_cents=$1, change_cents=$2, created_at=NOW() WHERE id=$3", [cash, cash - o.rows[0].total_cents, req.params.id]);
    await client.query('COMMIT'); res.json({ ok: true, change: cash - o.rows[0].total_cents });
  } catch (e) { await client.query('ROLLBACK'); res.status(400).json({ error: e.message }); } finally { client.release(); }
});
app.post('/api/orders/:id/cancel', async (req, res) => { await pool.query("UPDATE orders SET status='CANCELED' WHERE id=$1", [req.params.id]); res.json({ ok: true }); });
app.get('/api/orders/recent', async (req, res) => { const r = await pool.query("SELECT folio, total_cents, created_at FROM orders WHERE register_id=$1 AND status='PAID' ORDER BY created_at DESC LIMIT 3", [req.query.register_id]); res.json(r.rows); });

// --- ADMIN STATS MEJORADO ---
app.get('/api/admin/stats', async (req, res) => {
  try {
    const t = await pool.query("SELECT SUM(total_cents) as total FROM orders WHERE status='PAID'");
    const r = await pool.query(`SELECT r.id, r.name, s.status as shift_status, s.opened_at, s.opening_cash_cents, (SELECT COUNT(*) FROM orders WHERE shift_id = s.id AND status='PAID') as count_sales, (SELECT COALESCE(SUM(total_cents),0) FROM orders WHERE shift_id = s.id AND status='PAID') as total_sales FROM registers r LEFT JOIN shifts s ON r.id = s.register_id AND s.status = 'OPEN' ORDER BY r.id`);
    const p = await pool.query(`SELECT p.name, p.category, SUM(oi.qty) as total_qty, SUM(oi.line_total_cents) as total_revenue FROM order_items oi JOIN orders o ON oi.order_id = o.id JOIN products p ON oi.product_id = p.id WHERE o.status = 'PAID' GROUP BY p.name, p.category ORDER BY total_revenue DESC`);
    
    // AQUÍ EL CAMBIO DE ZONA HORARIA (CDMX)
    const h = await pool.query(`
      SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City') as hour_block, 
             SUM(total_cents) as total
      FROM orders 
      WHERE status='PAID' 
      GROUP BY hour_block 
      ORDER BY hour_block
    `);

    const c = await pool.query(`SELECT p.category, SUM(oi.line_total_cents) as total FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN orders o ON oi.order_id = o.id WHERE o.status = 'PAID' GROUP BY p.category`);
    res.json({ global_total: t.rows[0].total || 0, registers: r.rows, products_report: p.rows, sales_by_hour: h.rows, sales_by_cat: c.rows });
  } catch(e) { console.error(e); res.status(500).json({error: "Error admin"}); }
});
app.get('/api/admin/history', async (req, res) => {
  try { const r = await pool.query(`SELECT s.id, s.status, r.name as register_name, s.opened_at, s.closed_at, s.opening_cash_cents, (SELECT COALESCE(SUM(total_cents),0) FROM orders WHERE shift_id = s.id AND status='PAID') as sales_cents FROM shifts s JOIN registers r ON s.register_id = r.id ORDER BY s.opened_at DESC`); res.json(r.rows); } catch(e) { res.status(500).json({error: "Error"}); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 POS corriendo en ${PORT}`));