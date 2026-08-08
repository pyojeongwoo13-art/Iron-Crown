import pg from "pg";
import type { Pool as PoolType } from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

let selectedPool: PoolType;
if (connectionString.startsWith("pg-mem://")) {
  const { newDb } = await import("pg-mem");
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memory.adapters.createPg();
  selectedPool = new adapter.Pool() as unknown as PoolType;
} else {
  selectedPool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 12,
    idleTimeoutMillis: 30_000,
  });
}

export const pool = selectedPool;

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username VARCHAR(20) UNIQUE NOT NULL,
      display_name VARCHAR(16) NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS saves (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      save_json JSONB NOT NULL,
      version INTEGER NOT NULL DEFAULT 2,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS reward_claims (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      monster_id VARCHAR(80) NOT NULL,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, monster_id)
    );
    CREATE INDEX IF NOT EXISTS saves_updated_at_idx ON saves(updated_at);
  `);
  try { await pool.query("ALTER TABLE users ADD COLUMN active_session_id TEXT"); }
  catch (error) { if ((error as { code?: string }).code !== "42701") throw error; }
}
