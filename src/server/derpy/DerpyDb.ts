// Derp Land's database: accounts, sessions, saved DerpyFront games (for
// stats and replays), Derpy Conquest results and saved campaigns, and store
// purchases, in the
// Postgres that DATABASE_URL points at
// (a free Neon database on the hosted site). Without DATABASE_URL the game
// still runs; accounts and the store just say they aren't set up.

import pg from "pg";
import { logger } from "../Logger";

const log = logger.child({ component: "DerpyDb" });

let pool: pg.Pool | null = null;
let ready: Promise<void> | null = null;

export function derpyDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

/**
 * The shared pool, created (and the schema migrated) on first use. Small on
 * purpose: the free database allows few connections, and the master and the
 * game worker each hold their own pool.
 */
export async function db(): Promise<pg.Pool> {
  if (!derpyDbConfigured()) throw new DerpyDbUnavailable();
  if (pool === null) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 30_000,
      // Neon suspends an idle database; waking it takes a few seconds.
      connectionTimeoutMillis: 15_000,
    });
    pool.on("error", (err) => log.warn(`idle client error: ${err.message}`));
  }
  ready ??= migrate(pool).catch((err) => {
    ready = null;
    throw err;
  });
  await ready;
  return pool;
}

export class DerpyDbUnavailable extends Error {
  constructor() {
    super("DATABASE_URL is not set");
  }
}

/** Runs `fn` in a transaction, rolling back if it throws. */
export async function inTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await (await db()).connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS derpy_accounts (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  coins INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS derpy_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  play_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS derpy_games (
  game_id TEXT PRIMARY KEY,
  map TEXT NOT NULL,
  mode TEXT NOT NULL,
  game_type TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_s INTEGER NOT NULL,
  winner TEXT,
  num_players INTEGER NOT NULL,
  awards JSONB NOT NULL DEFAULT '[]',
  record BYTEA NOT NULL
);

CREATE TABLE IF NOT EXISTS derpy_game_players (
  game_id TEXT NOT NULL REFERENCES derpy_games(game_id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  won BOOLEAN NOT NULL,
  peak_territory_pct REAL NOT NULL,
  gold_earned BIGINT NOT NULL,
  conquests INTEGER NOT NULL,
  ships INTEGER NOT NULL,
  betrayals INTEGER NOT NULL,
  nukes INTEGER NOT NULL,
  awards TEXT[] NOT NULL DEFAULT '{}',
  coins INTEGER NOT NULL,
  PRIMARY KEY (game_id, account_id)
);
CREATE INDEX IF NOT EXISTS derpy_game_players_account
  ON derpy_game_players (account_id);

CREATE TABLE IF NOT EXISTS derpy_owned (
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, item)
);

CREATE TABLE IF NOT EXISTS derpy_conquest_games (
  game_id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_s INTEGER NOT NULL,
  end_year INTEGER NOT NULL,
  final_year INTEGER NOT NULL,
  difficulty TEXT NOT NULL,
  num_players INTEGER NOT NULL,
  winner TEXT,
  summary JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS derpy_conquest_players (
  game_id TEXT NOT NULL REFERENCES derpy_conquest_games(game_id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  nation TEXT NOT NULL,
  won BOOLEAN NOT NULL,
  rank INTEGER NOT NULL,
  score INTEGER NOT NULL,
  provinces INTEGER NOT NULL,
  peak_provinces INTEGER NOT NULL,
  colonies INTEGER NOT NULL,
  battles_won INTEGER NOT NULL,
  conquests INTEGER NOT NULL,
  gold_earned BIGINT NOT NULL,
  coins INTEGER NOT NULL,
  PRIMARY KEY (game_id, account_id)
);
CREATE INDEX IF NOT EXISTS derpy_conquest_players_account
  ON derpy_conquest_players (account_id);

CREATE TABLE IF NOT EXISTS derpy_conquest_saves (
  game_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  year INTEGER NOT NULL,
  seats JSONB NOT NULL,
  accounts BIGINT[] NOT NULL DEFAULT '{}',
  state BYTEA NOT NULL,
  over BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS derpy_conquest_saves_accounts
  ON derpy_conquest_saves USING GIN (accounts);
-- The game state's version: saves from another version can't be loaded, so
-- they aren't offered. Saves from before this column existed were version 2.
ALTER TABLE derpy_conquest_saves
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 2;
`;

// The master and the game worker both migrate at startup; the lock keeps two
// CREATE TABLE IF NOT EXISTS from racing each other.
const MIGRATION_LOCK = 7_317_001;

async function migrate(p: pg.Pool): Promise<void> {
  const client = await p.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await client.query(SCHEMA);
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK])
      .catch(() => {});
    client.release();
  }
  log.info("Derp Land database ready");
}

/** For tests: drop the pool so the next db() call reconnects. */
export async function closeDerpyDb(): Promise<void> {
  const p = pool;
  pool = null;
  ready = null;
  await p?.end();
}
