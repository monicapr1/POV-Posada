import express from "express";
import pkg from "pg";
import dotenv from "dotenv";
import { nanoid } from "nanoid";

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // RDS
});

// health
app.get("/api/health", (_, res) => res.json({ ok: true }));

// test DB
app.get("/api/db-test", async (_, res) => {
  const r = await pool.query("SELECT NOW()");
  res.json({ db_time: r.rows[0] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("POS backend corriendo en", PORT));
